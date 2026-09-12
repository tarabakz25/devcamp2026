import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_core import (
    DummyLLM,
    StakeholderProfile,
    build_context,
    cosine_similarity,
    detect_missing_stakeholders,
    format_stakeholder_context,
    get_llm,
    judge_intervention,
    search_stakeholders,
)


class TestStakeholderCatalog(unittest.TestCase):
    def setUp(self):
        self.llm = DummyLLM()
        self.catalog = [
            StakeholderProfile(
                user_id="U-STAFF",
                name="高橋さくら",
                role="寮スタッフ",
                interests="居住エリア保護、スタッフ専用キッチンの確保、ルール遵守",
            ),
            StakeholderProfile(
                user_id="U-STUDENT",
                name="中村蓮",
                role="学生",
                interests="朝食準備の手間削減、A棟1階の継続利用、清掃運用",
            ),
            StakeholderProfile(
                user_id="U-FACILITY",
                name="鈴木施設長",
                role="施設管理責任者",
                interests="建物設備管理、防火防災、電気機器利用規程、修繕管理",
            ),
            StakeholderProfile(
                user_id="U-ACCOUNT",
                name="佐藤経理",
                role="経理担当",
                interests="予算管理、調達コスト、請求書処理",
            ),
        ]

    def test_embedding_and_cosine_similarity(self):
        v1 = self.llm.embed("朝食会場とキッチンの運用について")
        v2 = self.llm.embed("朝食のキッチン利用と学生の準備")
        v3 = self.llm.embed("経理処理と請求書の支払い期日")

        sim_related = cosine_similarity(v1, v2)
        sim_unrelated = cosine_similarity(v1, v3)

        self.assertGreater(sim_related, 0.0)
        self.assertGreater(sim_related, sim_unrelated)

    def test_search_stakeholders_rag(self):
        query = "A棟1階キッチンの設備利用と防火ルールについて施設管理に相談したい"
        ranked = search_stakeholders(
            query=query,
            catalog=self.catalog,
            llm=self.llm,
            participants=["U-STUDENT"],
            top_k=3,
        )

        self.assertTrue(len(ranked) > 0)
        # 設備・施設管理に関するクエリなので U-FACILITY が上位に入る
        top_user_ids = [r.profile.user_id for r in ranked]
        self.assertIn("U-FACILITY", top_user_ids)

        # 参加状況フラグ
        student_ranked = next(r for r in ranked if r.profile.user_id == "U-STUDENT")
        self.assertTrue(student_ranked.is_participant)

        facility_ranked = next(r for r in ranked if r.profile.user_id == "U-FACILITY")
        self.assertFalse(facility_ranked.is_participant)

    def test_detect_missing_stakeholders(self):
        query = "建物設備の利用規程と安全管理について"
        ranked = search_stakeholders(
            query=query,
            catalog=self.catalog,
            llm=self.llm,
            participants=["U-STUDENT"],
            top_k=5,
        )
        missing = detect_missing_stakeholders(ranked, min_score=0.1)
        # U-STUDENT はスレッドに参加しているので missing には含まれない
        missing_ids = [m.profile.user_id for m in missing]
        self.assertNotIn("U-STUDENT", missing_ids)
        self.assertIn("U-FACILITY", missing_ids)

    def test_format_stakeholder_context(self):
        query = "朝食会場とキッチン"
        ranked = search_stakeholders(
            query=query,
            catalog=self.catalog,
            llm=self.llm,
            participants=["U-STAFF"],
            top_k=4,
        )
        text = format_stakeholder_context(ranked)
        self.assertIn("RAG", text)
        self.assertIn("高橋さくら", text)

    def test_judge_intervention_with_catalog_and_missing_stakeholder(self):
        # スレッドには学生(U-STUDENT)とスタッフ(U-STAFF)だけが参加している
        msgs = [
            {"user_id": "U-STAFF", "text": "2階を使ってください。1階はスタッフ専用です。", "is_mention": 0},
            {"user_id": "U-STUDENT", "text": "朝食の準備が大変なので1階を続けたいです。", "is_mention": 0},
            {"user_id": "U-STAFF", "text": "電気機器や炊飯器の設備管理ルールはどうしますか？", "is_mention": 0},
            {"user_id": "U-STUDENT", "text": "安全条件が分かれば判断できます。", "is_mention": 0},
        ]
        ctx = build_context(msgs, "T-TEST", "C-TEST")

        people = [
            {"user_id": "U-STAFF", "name": "高橋さくら", "role": "寮スタッフ"},
            {"user_id": "U-STUDENT", "name": "中村蓮", "role": "学生"},
        ]

        result = judge_intervention(
            ctx, self.llm, people=people, catalog=self.catalog
        )

        self.assertIsNotNone(result.relevant_stakeholders)
        self.assertTrue(len(result.relevant_stakeholders) > 0)
        # 介入理由に不在のキーパーソン（または方針の食い違い）が反映されている
        self.assertTrue(result.confidence >= 0.7)


if __name__ == "__main__":
    unittest.main()
