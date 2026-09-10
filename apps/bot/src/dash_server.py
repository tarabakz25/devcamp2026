"""Dashboard API サーバ: グラフ/タイムライン/デモチャット用。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent
ROOT = BOT_SRC.parents[2]
AI_CORE = BOT_SRC.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from dashboard import build_fastapi_app  # noqa: E402


def load_dotenv(path: str = ".env") -> None:
    p = Path(path)
    if not p.exists():
        p = ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def main() -> None:
    load_dotenv()
    os.environ.setdefault("SQLITE_PATH", str(ROOT / "data" / "local.db"))
    db_path = os.environ.get("SQLITE_PATH", str(ROOT / "data" / "local.db"))
    app = build_fastapi_app(db_path)
    if app is None:
        raise SystemExit("fastapi が入っていない。pip install fastapi uvicorn")
    import uvicorn

    host = os.environ.get("DASH_HOST", "127.0.0.1")
    port = int(os.environ.get("DASH_PORT", "8000"))
    print(f"Roomi Dashboard API  http://{host}:{port}  db={db_path}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
