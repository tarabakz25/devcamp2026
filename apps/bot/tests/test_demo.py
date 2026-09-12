import sys
import tempfile
import unittest
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent.parent / "src"
AI_CORE = Path(__file__).resolve().parent.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from ai_core import DummyLLM, get_llm
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


class EmbedSpyLLM(DummyLLM):
    def __init__(self):
        self.embed_calls = 0

    def embed(self, text, dim=256):
        self.embed_calls += 1
        return super().embed(text, dim)


class TestDemoRoom(unittest.TestCase):
    def setUp(self):
        _reset_playback()
        self.conn = connect()
        self.llm = get_llm("dummy")
        from demo_room import switch_scenario
        switch_scenario(self.conn, "breakfast", "dummy")

    def test_seed_stakeholders_waits_for_context_before_ai(self):
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
        self.assertFalse(first["intervention"]["should_act"])
        self.assertIsNone(first["bot_message"])

        second = post_user_message(
            self.conn, self.llm, "U-OGASAHARA", "なぜ止まってるんだっけ?"
        )
        self.assertFalse(second["intervention"]["should_act"])
        self.assertIsNone(second["bot_message"])

        third = post_user_message(
            self.conn,
            self.llm,
            "U-SAKUMA",
            "決め方が分からないままだと学生側は困るので、1階を続けたいです。",
        )
        self.assertFalse(third["intervention"]["should_act"])
        self.assertIsNone(third["bot_message"])

        fourth = post_user_message(
            self.conn,
            self.llm,
            "U-SASAKI",
            "スタッフ側の利用条件も決める必要があります。",
        )
        self.assertTrue(fourth["intervention"]["should_act"])
        self.assertIsNotNone(fourth["bot_message"])
        self.assertIn("ルール", fourth["bot_message"]["text"])

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
        for expected_index in (2, 3):
            latest = play_tick(self.conn, self.llm)
            self.assertEqual(latest["playback"]["mode"], "script")
            self.assertEqual(latest["playback"]["index"], expected_index)
            self.assertIsNone(latest["bot_message"])

        latest = play_tick(self.conn, self.llm)
        self.assertEqual(latest["playback"]["mode"], "ai")
        self.assertEqual(latest["playback"]["index"], 4)
        self.assertEqual(latest["playback"].get("intervene"), 1)
        self.assertIsNotNone(latest["bot_message"])
        self.assertTrue(latest["bot_message"]["is_bot"])
        self.assertIn("前提候補", latest["bot_message"]["text"])
        self.assertIn("含む決まり", latest["bot_message"]["text"])
        self.assertEqual(latest["bot_message"]["text"].count("？"), 1)

        ai_turn = play_tick(self.conn, self.llm)
        self.assertEqual(ai_turn["playback"]["mode"], "ai")
        self.assertFalse(ai_turn["message"]["is_bot"])
        self.assertIn("立場", ai_turn["message"]["text"])
        stopped = stop_playback(self.conn, "dummy")
        self.assertEqual(stopped["playback"]["mode"], "stopped")
        self.assertLessEqual(ai_turn["playback"]["ai_count"], MAX_AI_REPLIES)

    def test_demo_rag_does_not_use_the_configured_external_embedding_path(self):
        llm = EmbedSpyLLM()
        start_playback(self.conn, llm)
        for _ in range(3):
            play_tick(self.conn, llm)
        self.assertEqual(llm.embed_calls, 0)


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
        self.assertFalse(data["intervention"]["should_act"])
        self.assertIsNone(data["bot_message"])

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

    def test_switch_scenario_and_playback(self):
        # 1. シナリオ一覧取得
        scenarios_res = self.client.get("/api/demo/scenarios")
        self.assertEqual(scenarios_res.status_code, 200)
        scenarios_data = scenarios_res.json()
        ids = [s["id"] for s in scenarios_data["scenarios"]]
        self.assertIn("breakfast", ids)
        self.assertIn("eblock", ids)
        self.assertIn("hygiene", ids)

        # 2. eblock シナリオに切り替え
        switch_res = self.client.post("/api/demo/scenario", json={"scenario_id": "eblock"})
        self.assertEqual(switch_res.status_code, 200)
        eblock_room = switch_res.json()
        self.assertEqual(eblock_room["current_scenario"], "eblock")
        self.assertEqual(eblock_room["title"], "BASEのe-block充電ドック運用")
        eblock_names = {s["user_name"] for s in eblock_room["stakeholders"]}
        self.assertIn("宮野しゅうた", eblock_names)
        self.assertIn("河野めぐみ", eblock_names)

        # 3. eblock で再生開始
        play_res = self.client.post("/api/demo/play/start")
        self.assertEqual(play_res.status_code, 200)
        play_data = play_res.json()
        self.assertEqual(play_data["playback"]["mode"], "script")
        self.assertEqual(play_data["messages"][0]["user_name"], "宮野しゅうた")
        self.assertIn("e-block", play_data["messages"][0]["text"])

        # 4. hygiene シナリオに直接再生開始
        hygiene_play = self.client.post("/api/demo/play/start", json={"scenario_id": "hygiene"})
        self.assertEqual(hygiene_play.status_code, 200)
        hygiene_data = hygiene_play.json()
        self.assertEqual(hygiene_data["title"], "キッチンのふきん除菌・洗濯運用")
        self.assertEqual(hygiene_data["messages"][0]["user_name"], "中渓いっしん")
        self.assertIn("ふきん", hygiene_data["messages"][0]["text"])


if __name__ == "__main__":
    unittest.main()

