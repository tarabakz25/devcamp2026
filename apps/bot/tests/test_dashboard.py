import sys
import unittest
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(BOT_SRC))

from dashboard import stakeholder_graph
from gateway import normalize_event
from store import connect, save_message


class TestDashboard(unittest.TestCase):
    def test_stakeholder_graph_contains_profile_and_conversation_links(self):
        conn = connect()
        for event in [
            {"type": "message", "channel": "C1", "user": "U1",
             "text": "仕様を決めよう", "ts": "1"},
            {"type": "message", "channel": "C1", "user": "U2",
             "text": "案を確認する", "ts": "2", "thread_ts": "1"},
            {"type": "message", "channel": "C1", "user": "U1",
             "text": "進めよう", "ts": "3", "thread_ts": "1"},
        ]:
            message = normalize_event(event)
            assert message is not None
            save_message(conn, message)

        conn.execute(
            "INSERT INTO stakeholders "
            "(thread_id, user_id, user_name, role, interests, message_count) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("C1-1", "U1", "葵", "PM", "仕様", 2),
        )
        conn.commit()

        graph = stakeholder_graph(conn, "C1-1")

        self.assertEqual(len(graph["nodes"]), 2)
        u1 = next(node for node in graph["nodes"] if node["id"] == "U1")
        self.assertEqual(u1["name"], "葵")
        self.assertEqual(u1["role"], "PM")
        self.assertEqual(u1["messages"], 2)
        self.assertEqual(
            graph["edges"],
            [{
                "source": "U1",
                "target": "U2",
                "from_user": "U1",
                "to_user": "U2",
                "label": "会話",
                "weight": 2,
                "directed": False,
            }],
        )

    def test_stakeholder_graph_is_empty_for_unknown_thread(self):
        self.assertEqual(
            stakeholder_graph(connect(), "unknown"),
            {"nodes": [], "edges": []},
        )


if __name__ == "__main__":
    unittest.main()
