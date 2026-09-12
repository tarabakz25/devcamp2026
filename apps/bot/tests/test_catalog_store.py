import sys
import unittest
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent.parent / "src"
AI_CORE = Path(__file__).resolve().parent.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from ai_core import DummyLLM
from gateway import normalize_event
from pipeline import evaluate_thread
from store import (
    connect,
    get_embedding,
    load_stakeholder_catalog,
    save_embedding,
    save_message,
    upsert_stakeholder_profile,
)


class TestCatalogStore(unittest.TestCase):
    def setUp(self):
        self.conn = connect()
        self.llm = DummyLLM()

    def test_upsert_profile_and_embedding(self):
        emb = self.llm.embed("施設管理責任者 建物設備と防災")
        upsert_stakeholder_profile(
            self.conn,
            user_id="U-TEST-1",
            name="田中施設長",
            role="施設管理",
            interests="防災、共用部利用ルール",
            embedding=emb,
        )

        saved_emb = get_embedding(self.conn, "stakeholder", "U-TEST-1")
        self.assertIsNotNone(saved_emb)
        self.assertEqual(len(saved_emb), len(emb))

        catalog = load_stakeholder_catalog(self.conn, self.llm)
        self.assertEqual(len(catalog), 1)
        self.assertEqual(catalog[0].name, "田中施設長")
        self.assertEqual(catalog[0].role, "施設管理")
        self.assertIsNotNone(catalog[0].embedding)

    def test_evaluate_thread_with_rag_missing_stakeholder(self):
        # 1. 導入時: あらかじめステークホルダーカタログを登録
        # 施設管理の田中さんを登録（スレッドには参加しない不在のキーパーソン）
        emb_facility = self.llm.embed("氏名: 田中施設長 / 役割: 施設管理 / 担当・関心: 厨房機器、共用部設備、電気容量")
        upsert_stakeholder_profile(
            self.conn,
            user_id="U-FACILITY",
            name="田中施設長",
            role="施設管理",
            interests="厨房機器、共用部設備、電気容量",
            embedding=emb_facility,
        )

        # 寮スタッフと学生を登録
        emb_staff = self.llm.embed("氏名: 佐藤スタッフ / 役割: 寮スタッフ / 担当・関心: 居住エリア管理")
        upsert_stakeholder_profile(
            self.conn,
            user_id="U-STAFF",
            name="佐藤スタッフ",
            role="寮スタッフ",
            interests="居住エリア管理",
            embedding=emb_staff,
        )
        emb_student = self.llm.embed("氏名: 鈴木学生 / 役割: 学生 / 担当・関心: 朝食準備")
        upsert_stakeholder_profile(
            self.conn,
            user_id="U-STUDENT",
            name="鈴木学生",
            role="学生",
            interests="朝食準備",
            embedding=emb_student,
        )

        # 2. スレッドで議論が発生（厨房機器・共用部設備について）
        # スレッドには U-STAFF と U-STUDENT だけが発言
        channel_id = "C-TEST"
        thread_id = "C-TEST-100"
        msgs = [
            {"type": "message", "channel": channel_id, "user": "U-STAFF",
             "text": "1階の厨房機器や電気容量について問題が出ています。使わないでください。", "ts": "100"},
            {"type": "message", "channel": channel_id, "user": "U-STUDENT",
             "text": "朝食の準備を続けたいです。共用部設備の利用ルールはどうしますか？", "ts": "101", "thread_ts": "100"},
            {"type": "message", "channel": channel_id, "user": "U-STAFF",
             "text": "2階を使ってください。専用です。", "ts": "102", "thread_ts": "100"},
        ]
        for ev in msgs:
            m = normalize_event(ev)
            save_message(self.conn, m)

        # 3. スレッド評価を実行
        res = evaluate_thread(
            self.conn, self.llm, thread_id, channel_id, force=True
        )

        self.assertTrue(res.accepted)
        self.assertTrue(res.should_act)
        # RAGによって関連ステークホルダーが引かれていること
        self.assertTrue(len(res.relevant_stakeholders) > 0)
        # スレッドに参加していない田中施設長が missing_stakeholders に含まれること
        missing_ids = [m["user_id"] for m in res.missing_stakeholders]
        self.assertIn("U-FACILITY", missing_ids)


if __name__ == "__main__":
    unittest.main()
