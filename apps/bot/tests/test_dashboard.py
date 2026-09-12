import sys
import unittest
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(BOT_SRC))

from dashboard import stakeholder_graph
from gateway import normalize_event
from mentions import mentioned_user_ids, to_slack_text
from store import connect, save_message


class TestMentions(unittest.TestCase):
    def test_extracts_names_and_slackifies(self):
        people = [
            {"user_id": "U-SASAKI", "name": "高橋さくら"},
            {"user_id": "U-SAKUMA", "name": "中村蓮"},
        ]
        text = "@高橋さくら と @中村蓮、いま一点だけ"
        self.assertEqual(
            mentioned_user_ids(text, people),
            ["U-SASAKI", "U-SAKUMA"],
        )
        self.assertEqual(
            to_slack_text(text, people),
            "<@U-SASAKI> と <@U-SAKUMA>、いま一点だけ",
        )


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

    def test_roomi_mention_becomes_intervention_edge(self):
        conn = connect()
        for event in [
            {"type": "message", "channel": "C1", "user": "U1",
             "text": "1階でやりたい", "ts": "1"},
            {"type": "message", "channel": "C1", "user": "U2",
             "text": "2階にしてください", "ts": "2", "thread_ts": "1"},
            {"type": "message", "channel": "C1", "user": "U-ROOMI",
             "text": "@葵 いま一点だけ確認させて", "ts": "3", "thread_ts": "1"},
        ]:
            message = normalize_event(event)
            assert message is not None
            save_message(conn, message)

        conn.execute(
            "INSERT INTO stakeholders "
            "(thread_id, user_id, user_name, role, interests, message_count) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("C1-1", "U1", "葵", "学生", "1階", 1),
        )
        conn.commit()

        graph = stakeholder_graph(conn, "C1-1")
        roomi = next(node for node in graph["nodes"] if node["id"] == "U-ROOMI")
        self.assertEqual(roomi["kind"], "agent")
        self.assertEqual(roomi["name"], "Roomi")
        mention = next(
            edge for edge in graph["edges"] if edge.get("status") == "intervention"
        )
        self.assertEqual(mention["source"], "U-ROOMI")
        self.assertEqual(mention["target"], "U1")
        self.assertEqual(mention["label"], "呼びかけ")

    def test_stakeholder_graph_is_empty_for_unknown_thread(self):
        self.assertEqual(
            stakeholder_graph(connect(), "unknown"),
            {"nodes": [], "edges": []},
        )

    def test_thread_agreements_mock_and_endpoint(self):
        from starlette.testclient import TestClient
        from dashboard import build_fastapi_app, thread_agreements

        conn = connect()
        res = thread_agreements(conn, "trash")
        self.assertIn("decisions", res)
        self.assertEqual(len(res["decisions"]), 1)
        self.assertEqual(res["decisions"][0]["id"], "dec-trash-1")
        self.assertEqual(res["decisions"][0]["status"], "decided")

        app = build_fastapi_app()
        if app is not None:
            client = TestClient(app)
            response = client.get("/api/threads/trash/agreements")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["decisions"]), 1)
            self.assertEqual(data["decisions"][0]["id"], "dec-trash-1")
            self.assertEqual(data["decisions"][0]["status"], "decided")


if __name__ == "__main__":
    unittest.main()
