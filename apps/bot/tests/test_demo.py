import sys
import tempfile
import unittest
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent.parent / "src"
AI_CORE = Path(__file__).resolve().parent.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from ai_core import get_llm
from dashboard import build_fastapi_app
from demo_room import (
    DEMO_THREAD_ID,
    MAX_AI_REPLIES,
    SCENARIO_MESSAGES,
    SEED_STAKEHOLDERS,
    _reset_playback,
    add_stakeholder,
    force_intervene,
    load_scenario,
    play_tick,
    post_user_message,
    remove_stakeholder,
    reset_room,
    room_state,
    start_playback,
    stop_playback,
)
from store import connect, upsert_stakeholder


class TestDemoRoom(unittest.TestCase):
    def setUp(self):
        _reset_playback()
        self.conn = connect()
        self.llm = get_llm("dummy")

    def test_seed_stakeholders_and_post_triggers_ai(self):
        state = room_state(self.conn, "dummy")
        names = {p["user_name"] for p in state["stakeholders"]}
        real_names = {p["real_name"] for p in SEED_STAKEHOLDERS}
        self.assertGreaterEqual(len(state["stakeholders"]), 5)
        self.assertIn("高橋さくら", names)
        self.assertTrue(real_names.isdisjoint(names))
        self.assertEqual(state["messages"], [])

        first = post_user_message(
            self.conn, self.llm, "U-SASAKI", "仕様どうする?"
        )
        self.assertEqual(first["message"]["user_name"], "高橋さくら")
        self.assertTrue(first["intervention"]["should_act"])
        self.assertIsNotNone(first["bot_message"])
        self.assertTrue(first["bot_message"]["is_bot"])
        self.assertNotIn("途中参加", first["bot_message"]["text"])
        self.assertIn("@", first["bot_message"]["text"])

        second = post_user_message(
            self.conn, self.llm, "U-OZAKI", "なぜ止まってるんだっけ?"
        )
        self.assertFalse(second["intervention"]["should_act"])
        self.assertIsNone(second["bot_message"])

    def test_mention_roomi_and_force_intervene(self):
        post_user_message(self.conn, self.llm, "U-SASAKI", "仕様どうする?")
        reset_room(self.conn, keep_stakeholders=True)
        mentioned = post_user_message(
            self.conn, self.llm, "U-SASAKI", "@Roomi 過去の議論をまとめて"
        )
        self.assertTrue(mentioned["message"]["is_mention"])

        load_scenario(self.conn)
        forced = force_intervene(self.conn, self.llm)
        self.assertTrue(forced["intervention"]["should_act"])
        self.assertIsNotNone(forced["bot_message"])
        self.assertGreaterEqual(len(forced["messages"]), 15)

    def test_reseeds_legacy_real_names(self):
        room_state(self.conn, "dummy")
        upsert_stakeholder(
            self.conn, DEMO_THREAD_ID, "U-SASAKI", "佐々木美優", "寮スタッフ", "", ""
        )
        state = room_state(self.conn, "dummy")
        names = {p["user_name"] for p in state["stakeholders"]}
        self.assertIn("高橋さくら", names)
        self.assertNotIn("佐々木美優", names)

    def test_scenario_hides_real_names(self):
        real_names = {p["real_name"] for p in SEED_STAKEHOLDERS}
        script = "\n".join(text for _, text in SCENARIO_MESSAGES)
        for name in real_names:
            self.assertNotIn(name, script)
        self.assertNotIn("にこ", script)

    def test_add_and_remove_stakeholder(self):
        room_state(self.conn, "dummy")
        person = add_stakeholder(
            self.conn, "太郎", "エンジニア", "実装", ""
        )
        self.assertEqual(person["user_name"], "太郎")
        self.assertTrue(person["user_id"].startswith("U-"))
        self.assertTrue(remove_stakeholder(self.conn, person["user_id"]))
        ids = {p["user_id"] for p in room_state(self.conn, "dummy")["stakeholders"]}
        self.assertNotIn(person["user_id"], ids)
        self.assertFalse(remove_stakeholder(self.conn, "U-ROOMI"))

    def test_reset_clears_messages_keeps_people(self):
        load_scenario(self.conn)
        reset_room(self.conn, keep_stakeholders=True)
        state = room_state(self.conn, "dummy")
        self.assertEqual(state["messages"], [])
        self.assertGreaterEqual(len(state["stakeholders"]), 5)
        self.assertEqual(state["thread_id"], DEMO_THREAD_ID)

    def test_playback_switches_to_ai_after_roomi(self):
        started = start_playback(self.conn, self.llm)
        self.assertEqual(started["playback"]["mode"], "script")
        self.assertEqual(started["messages"][0]["user_name"], "高橋さくら")
        self.assertIsNone(started["bot_message"])

        latest = started
        for _ in range(20):
            if latest["playback"]["mode"] != "script":
                break
            latest = play_tick(self.conn, self.llm)
        self.assertEqual(latest["playback"]["mode"], "ai")
        self.assertEqual(latest["playback"].get("intervene"), 1)
        self.assertIsNotNone(latest["bot_message"])
        self.assertTrue(latest["bot_message"]["is_bot"])

        ai_turn = play_tick(self.conn, self.llm)
        self.assertEqual(ai_turn["playback"]["mode"], "ai")
        self.assertFalse(ai_turn["message"]["is_bot"])
        self.assertIn("立場", ai_turn["message"]["text"])
        stopped = stop_playback(self.conn, "dummy")
        self.assertEqual(stopped["playback"]["mode"], "stopped")
        self.assertLessEqual(ai_turn["playback"]["ai_count"], MAX_AI_REPLIES)


class TestDemoAPI(unittest.TestCase):
    def setUp(self):
        _reset_playback()
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        app = build_fastapi_app(
            self.tmp.name, llm=get_llm("dummy"), llm_name="dummy"
        )
        if app is None:
            self.skipTest("fastapi が入っていない")
        from fastapi.testclient import TestClient

        self.client = TestClient(app)

    def test_get_post_and_custom_stakeholder(self):
        seeded = self.client.get("/api/demo")
        self.assertEqual(seeded.status_code, 200)
        body = seeded.json()
        self.assertEqual(body["llm"], "dummy")
        self.assertGreaterEqual(len(body["stakeholders"]), 5)

        posted = self.client.post(
            "/api/demo/messages",
            json={"user_id": "U-SASAKI", "text": "決済フローどうする?"},
        )
        self.assertEqual(posted.status_code, 200)
        data = posted.json()
        self.assertTrue(data["intervention"]["should_act"])
        self.assertTrue(data["bot_message"]["is_bot"])

        created = self.client.post(
            "/api/demo/stakeholders",
            json={"name": "咲", "role": "QA", "interests": "品質"},
        )
        self.assertEqual(created.status_code, 200)
        user_id = created.json()["user_id"]
        deleted = self.client.delete(f"/api/demo/stakeholders/{user_id}")
        self.assertEqual(deleted.status_code, 200)

        empty = self.client.post("/api/demo/messages", json={"user_id": "U-SASAKI", "text": "   "})
        self.assertEqual(empty.status_code, 400)

        started = self.client.post("/api/demo/play/start")
        self.assertEqual(started.status_code, 200)
        play = started.json()
        self.assertEqual(play["playback"]["mode"], "script")
        self.assertGreaterEqual(len(play["messages"]), 1)
        self.assertEqual(play["messages"][0]["user_name"], "高橋さくら")


if __name__ == "__main__":
    unittest.main()
