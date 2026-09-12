#!/usr/bin/env python3
"""Restart and supervise the local Roomi Dashboard API and Web dev servers."""

from __future__ import annotations

import fcntl
import hashlib
import os
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = ROOT / "apps" / "web"
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"
STOP_TIMEOUT_SEC = 5.0
START_TIMEOUT_SEC = 15.0
LOCK_ID = hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
LOCK_PATH = Path(tempfile.gettempdir()) / f"roomi-reload-{LOCK_ID}.lock"


@dataclass(frozen=True)
class Listener:
    port: int
    pid: int
    cwd: Path
    command: str


def run_text(args: list[str]) -> str:
    result = subprocess.run(
        args,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return result.stdout.strip()


def listening_pids(port: int) -> list[int]:
    output = run_text(["lsof", "-nP", f"-tiTCP:{port}", "-sTCP:LISTEN"])
    return sorted({int(line) for line in output.splitlines() if line.isdigit()})


def process_exists(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def process_cwd(pid: int) -> Path | None:
    output = run_text(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"])
    for line in output.splitlines():
        if line.startswith("n"):
            return Path(line[1:]).resolve()
    return None


def process_command(pid: int) -> str:
    return run_text(["ps", "-p", str(pid), "-o", "command="])


def inspect_listener(port: int, pid: int) -> Listener | None:
    if not process_exists(pid):
        return None
    cwd = process_cwd(pid)
    command = process_command(pid)
    if cwd is None or not command:
        raise RuntimeError(f":{port} のPID {pid}を安全に確認できなかった")
    return Listener(port=port, pid=pid, cwd=cwd, command=command)


def is_owned(listener: Listener) -> bool:
    if listener.port == 3000:
        args = shlex.split(listener.command)
        return listener.cwd == WEB_ROOT and bool(args) and args[0] == "next-server"
    if listener.port == 8000:
        args = shlex.split(listener.command)
        if len(args) < 2 or listener.cwd != ROOT:
            return False
        python = (listener.cwd / args[0]).resolve()
        entrypoint = (listener.cwd / args[1]).resolve()
        return python == VENV_PYTHON.resolve() and entrypoint == (ROOT / "apps/bot/src/dash_server.py")
    return False


def current_dev_listeners() -> list[Listener]:
    listeners: list[Listener] = []
    for port in (3000, 8000):
        for pid in listening_pids(port):
            listener = inspect_listener(port, pid)
            if listener is not None:
                listeners.append(listener)
    return listeners


def stop_existing_dev() -> None:
    listeners = current_dev_listeners()
    foreign = [listener for listener in listeners if not is_owned(listener)]
    if foreign:
        details = ", ".join(
            f":{item.port} PID={item.pid} cwd={item.cwd} command={item.command!r}"
            for item in foreign
        )
        raise RuntimeError(f"Roomi以外のプロセスは停止しない: {details}")

    if not listeners:
        print("既存のRoomi devサーバーは起動していない")
        return

    for listener in listeners:
        print(f"停止中 :{listener.port} PID={listener.pid}")
        try:
            os.kill(listener.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    deadline = time.monotonic() + STOP_TIMEOUT_SEC
    while time.monotonic() < deadline:
        if not any(listening_pids(port) for port in (3000, 8000)):
            return
        time.sleep(0.1)
    remaining = {port: listening_pids(port) for port in (3000, 8000)}
    raise RuntimeError(f"devサーバーが{STOP_TIMEOUT_SEC:.0f}秒以内に停止しなかった: {remaining}")


@contextmanager
def startup_lock() -> Iterator[int | None]:
    with LOCK_PATH.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        lock.seek(0)
        previous_text = lock.read().strip()
        previous_pid = int(previous_text) if previous_text.isdigit() else None
        lock.seek(0)
        lock.truncate()
        lock.write(f"{os.getpid()}\n")
        lock.flush()
        try:
            yield previous_pid
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def is_reload_supervisor(pid: int) -> bool:
    cwd = process_cwd(pid)
    args = shlex.split(process_command(pid))
    if cwd != ROOT or len(args) < 2:
        return False
    python = (cwd / args[0]).resolve()
    entrypoint = (cwd / args[1]).resolve()
    return python == VENV_PYTHON.resolve() and entrypoint == Path(__file__).resolve()


def stop_previous_supervisor(pid: int | None) -> None:
    if pid is None or pid == os.getpid() or not process_exists(pid):
        return
    if not is_reload_supervisor(pid):
        print(f"以前のreload PID記録は別プロセスなので無視する: {pid}")
        return
    print(f"以前のtask reloadを停止中 PID={pid}")
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + STOP_TIMEOUT_SEC
    while process_exists(pid) and time.monotonic() < deadline:
        time.sleep(0.1)


def process_group_exists(group_id: int) -> bool:
    try:
        os.killpg(group_id, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def stop_children(children: list[subprocess.Popen[bytes]]) -> None:
    group_ids = [child.pid for child in children]
    for group_id in group_ids:
        try:
            os.killpg(group_id, signal.SIGTERM)
        except ProcessLookupError:
            pass

    deadline = time.monotonic() + STOP_TIMEOUT_SEC
    for child in children:
        child.poll()
    alive_groups = [group_id for group_id in group_ids if process_group_exists(group_id)]
    while alive_groups and time.monotonic() < deadline:
        for child in children:
            child.poll()
        alive_groups = [group_id for group_id in alive_groups if process_group_exists(group_id)]
        if alive_groups:
            time.sleep(0.1)

    for group_id in alive_groups:
        try:
            os.killpg(group_id, signal.SIGKILL)
        except ProcessLookupError:
            pass
    for child in children:
        try:
            child.wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass


def url_ready(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def wait_until_ready(children: list[subprocess.Popen[bytes]]) -> None:
    deadline = time.monotonic() + START_TIMEOUT_SEC
    while time.monotonic() < deadline:
        exited = [(child.pid, child.poll()) for child in children if child.poll() is not None]
        if exited:
            raise RuntimeError(f"devサーバーが起動前に終了した: {exited}")
        listeners = current_dev_listeners()
        foreign = [listener for listener in listeners if not is_owned(listener)]
        if foreign:
            raise RuntimeError(f"起動中に想定外のlistenerを検出した: {foreign}")
        ports_ready = {listener.port for listener in listeners} == {3000, 8000}
        if (
            ports_ready
            and url_ready("http://127.0.0.1:8000/health")
            and url_ready("http://127.0.0.1:3000/api/demo")
        ):
            return
        time.sleep(0.1)
    raise RuntimeError(f"devサーバーが{START_TIMEOUT_SEC:.0f}秒以内に起動しなかった")


def supervise() -> int:
    children: list[subprocess.Popen[bytes]] = []
    stopping = False

    def request_stop(_signum: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, request_stop)

    try:
        with startup_lock() as previous_pid:
            stop_previous_supervisor(previous_pid)
            stop_existing_dev()
            dashboard_env = os.environ.copy()
            dashboard_env["DASH_PORT"] = "8000"
            print("起動中 Dashboard API http://localhost:8000")
            children.append(
                subprocess.Popen(
                    [str(VENV_PYTHON), "apps/bot/src/dash_server.py"],
                    cwd=ROOT,
                    env=dashboard_env,
                    start_new_session=True,
                )
            )
            print("起動中 Web           http://localhost:3000")
            children.append(
                subprocess.Popen(
                    ["npm", "--prefix", "apps/web", "run", "dev", "--", "-p", "3000"],
                    cwd=ROOT,
                    start_new_session=True,
                )
            )
            wait_until_ready(children)
            print("Roomi dev ready: http://localhost:3000/demo")

        while not stopping:
            for child in children:
                return_code = child.poll()
                if return_code is not None:
                    print(
                        f"devサーバーが予期せず終了した: PID={child.pid} code={return_code}",
                        file=sys.stderr,
                    )
                    return return_code if return_code != 0 else 1
            time.sleep(0.2)
        return 0
    finally:
        stop_children(children)


def main() -> int:
    if not VENV_PYTHON.is_file():
        print(f"Python仮想環境が見つからない: {VENV_PYTHON}", file=sys.stderr)
        return 1
    try:
        return supervise()
    except (OSError, RuntimeError) as error:
        print(f"reload失敗: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
