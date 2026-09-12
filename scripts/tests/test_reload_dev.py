from __future__ import annotations

import signal
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


SCRIPT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_ROOT))

import reload_dev


class ReloadDevTest(unittest.TestCase):
    def test_accepts_only_the_expected_next_listener(self) -> None:
        roomi = reload_dev.Listener(
            port=3000,
            pid=1,
            cwd=reload_dev.WEB_ROOT,
            command="next-server (v14.2.35)",
        )
        lookalike = reload_dev.Listener(
            port=3000,
            pid=2,
            cwd=reload_dev.ROOT,
            command="python -m http.server 3000 --directory apps/web",
        )

        self.assertTrue(reload_dev.is_owned(roomi))
        self.assertFalse(reload_dev.is_owned(lookalike))

    @patch.object(reload_dev.os, "kill")
    @patch.object(reload_dev, "current_dev_listeners")
    def test_rejects_foreign_listener_before_stopping_anything(
        self,
        current_dev_listeners: Mock,
        kill: Mock,
    ) -> None:
        current_dev_listeners.return_value = [
            reload_dev.Listener(
                port=8000,
                pid=3,
                cwd=Path("/private/tmp"),
                command="python -m http.server 8000",
            )
        ]

        with self.assertRaisesRegex(RuntimeError, "Roomi以外"):
            reload_dev.stop_existing_dev()

        kill.assert_not_called()

    @patch.object(reload_dev, "process_group_exists", return_value=False)
    @patch.object(reload_dev.os, "killpg")
    def test_stops_group_even_if_its_leader_already_exited(
        self,
        killpg: Mock,
        _process_group_exists: Mock,
    ) -> None:
        child = Mock()
        child.pid = 4
        child.poll.return_value = 0

        reload_dev.stop_children([child])

        killpg.assert_called_once_with(4, signal.SIGTERM)
        child.poll.assert_called()

    @patch.object(reload_dev, "process_exists", return_value=True)
    @patch.object(reload_dev, "is_reload_supervisor", return_value=False)
    @patch.object(reload_dev.os, "kill")
    @patch("builtins.print")
    def test_does_not_signal_a_reused_supervisor_pid(
        self,
        _print: Mock,
        kill: Mock,
        _is_reload_supervisor: Mock,
        _process_exists: Mock,
    ) -> None:
        reload_dev.stop_previous_supervisor(5)

        kill.assert_not_called()


if __name__ == "__main__":
    unittest.main()
