import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_core import (
    OpenAIProvider,
    build_context,
    compose_reply,
    decide,
    get_llm,
    judge_intervention,
    make_handoff,
)


class AlwaysInterveneLLM:
    def needs_intervention(self, _context_summary):
        return True, "今すぐ介入したい"


class CapturingOpenAIProvider(OpenAIProvider):
    def __init__(self):
        self.calls = []

    def _chat(self, system, user, **_kwargs):
        self.calls.append((system, user))
        return "前提を確認した。適用する決まりはどれ？"


class FakeRules:
    def __init__(self):
        self.saved: list[dict] = []
        self._last_ts = 0.0
        self.rule = {
            "min_confidence": 0.7, "min_impact": 0.7,
            "cooldown_sec": 600, "enabled": 1,
        }

    def get_rule(self, channel_id):
        return self.rule

    def last_intervention_ts(self, thread_id):
        return self._last_ts

    def save_intervention(self, thread_id, reason, confidence,
                          impact, action, created_at):
        self.saved.append({"thread_id": thread_id, "action": action})
        self._last_ts = float(created_at)


class TestCore(unittest.TestCase):
    def test_threshold_and_cooldown(self):
        llm = get_llm("dummy")
        msgs = [
            {"thread_id": "T", "channel_id": "C1", "user_id": "U1",
             "text": "どうする? なぜ? 誰? いつ? どう?", "is_mention": 1},
        ]
        ctx = build_context(msgs, "T", "C1")
        result = judge_intervention(ctx, llm)
        rules = FakeRules()
        d = decide(rules, "C1", "T", result, now=1000.0)
        self.assertTrue(d.should_act)
        from ai_core import record
        record(rules, "T", result, d.action)
        d2 = decide(rules, "C1", "T", result, now=1001.0)
        self.assertFalse(d2.should_act)  # クールダウン

    def test_below_threshold_stays_silent(self):
        llm = get_llm("dummy")
        msgs = [{"thread_id": "T", "channel_id": "C1", "user_id": "U1",
                 "text": "了解", "is_mention": 0}]
        ctx = build_context(msgs, "T", "C1")
        result = judge_intervention(ctx, llm)
        d = decide(FakeRules(), "C1", "T", result, now=1000.0)
        self.assertFalse(d.should_act)

    def test_dummy_binary_judge(self):
        llm = get_llm("dummy")
        yes, reason = llm.needs_intervention(
            "2階を使ってください。学生の朝は1階の方が楽で続けたい。"
        )
        self.assertTrue(yes)
        self.assertIn("食い違", reason)
        no, idle = llm.needs_intervention("了解です。搬入場所はA棟1階です。")
        self.assertFalse(no)
        self.assertIn("介入不要", idle)

    def test_waits_for_another_viewpoint_even_when_llm_says_intervene(self):
        people = [
            {"user_id": "U1", "name": "高橋", "role": "寮スタッフ"},
            {"user_id": "U2", "name": "伊藤", "role": "寮スタッフ"},
            {"user_id": "U3", "name": "中村", "role": "学生"},
        ]
        staff_only = build_context(
            [
                {"user_id": "U1", "text": "2階へ移すのはどうでしょう？", "is_mention": 0},
                {"user_id": "U2", "text": "1階はスタッフ専用です", "is_mention": 0},
            ],
            "T",
            "C1",
        )
        waiting = judge_intervention(staff_only, AlwaysInterveneLLM(), people)
        self.assertEqual(waiting.confidence, 0.0)
        self.assertIn("別の立場", waiting.reason)

        with_student = build_context(
            [
                *staff_only.messages,
                {"user_id": "U2", "text": "学生は2階を使ってください", "is_mention": 0},
                {"user_id": "U3", "text": "準備が楽なので1階を続けたい", "is_mention": 0},
            ],
            "T",
            "C1",
        )
        ready = judge_intervention(with_student, AlwaysInterveneLLM(), people)
        self.assertEqual(ready.confidence, 1.0)

    def test_two_opposing_messages_still_wait_for_more_context(self):
        people = [
            {"user_id": "U1", "name": "高橋", "role": "寮スタッフ"},
            {"user_id": "U2", "name": "中村", "role": "学生"},
        ]
        context = build_context(
            [
                {"user_id": "U1", "text": "学生は2階を使ってください", "is_mention": 0},
                {"user_id": "U2", "text": "準備が楽なので1階を続けたい", "is_mention": 0},
            ],
            "T",
            "C1",
        )
        result = judge_intervention(context, AlwaysInterveneLLM(), people)
        self.assertEqual(result.confidence, 0.0)

        ready_context = build_context(
            [
                *context.messages,
                {"user_id": "U1", "text": "1階はスタッフ居住エリアです", "is_mention": 0},
                {"user_id": "U2", "text": "学生側の準備負担があります", "is_mention": 0},
            ],
            "T",
            "C1",
        )
        ready = judge_intervention(ready_context, AlwaysInterveneLLM(), people)
        self.assertEqual(ready.confidence, 1.0)

    def test_three_people_from_the_same_side_are_not_enough(self):
        people = [
            {"user_id": f"U{index}", "name": f"スタッフ{index}", "role": "寮スタッフ"}
            for index in range(1, 4)
        ]
        context = build_context(
            [
                {"user_id": "U1", "text": "2階を使う案です", "is_mention": 0},
                {"user_id": "U2", "text": "1階は居住エリアです", "is_mention": 0},
                {"user_id": "U3", "text": "同じ案でお願いします", "is_mention": 0},
            ],
            "T",
            "C1",
        )
        result = judge_intervention(context, AlwaysInterveneLLM(), people)
        self.assertEqual(result.confidence, 0.0)

    def test_two_different_roles_with_the_same_question_still_wait(self):
        people = [
            {"user_id": "U1", "name": "高橋", "role": "寮スタッフ"},
            {"user_id": "U2", "name": "中村", "role": "学生"},
        ]
        context = build_context(
            [
                {"user_id": "U1", "text": "2階案はどうですか？", "is_mention": 0},
                {"user_id": "U2", "text": "いつ決めますか？", "is_mention": 0},
            ],
            "T",
            "C1",
        )
        result = judge_intervention(context, AlwaysInterveneLLM(), people)
        self.assertEqual(result.confidence, 0.0)

    def test_negated_resistance_does_not_create_a_two_message_conflict(self):
        people = [
            {"user_id": "U1", "name": "高橋", "role": "寮スタッフ"},
            {"user_id": "U2", "name": "伊藤", "role": "寮スタッフ"},
        ]
        context = build_context(
            [
                {"user_id": "U1", "text": "学生は2階を使ってください", "is_mention": 0},
                {
                    "user_id": "U2",
                    "text": "1階を続けたいわけではないし、2階案に反対ではないです",
                    "is_mention": 0,
                },
            ],
            "T",
            "C1",
        )
        result = judge_intervention(context, AlwaysInterveneLLM(), people)
        self.assertEqual(result.confidence, 0.0)

    def test_only_latest_mention_bypasses_readiness(self):
        old_mention = build_context(
            [
                {"user_id": "U1", "text": "@Roomi 整理して", "is_mention": 1},
                {"user_id": "U1", "text": "続きです", "is_mention": 0},
            ],
            "T",
            "C1",
        )
        result = judge_intervention(old_mention, AlwaysInterveneLLM())
        self.assertEqual(result.confidence, 0.0)

    def test_compose_reply_mentions_people(self):
        llm = get_llm("dummy")
        msgs = [
            {"user_id": "U-SASAKI", "text": "1階は居住エリアなので2階にしてください", "is_mention": 0},
            {"user_id": "U-SAKUMA", "text": "朝食の準備は1階の方が楽で続けたい", "is_mention": 0},
        ]
        ctx = build_context(msgs, "T", "C1")
        text = compose_reply(
            ctx,
            llm,
            [
                {"user_id": "U-SASAKI", "name": "高橋さくら", "role": "寮スタッフ", "interests": "居住"},
                {"user_id": "U-SAKUMA", "name": "中村蓮", "role": "学生", "interests": "1階"},
            ],
            "方針が食い違っている",
        )
        self.assertIn("@高橋さくら", text)
        self.assertIn("ルール", text)
        self.assertEqual(text.count("？"), 1)
        self.assertNotIn("途中参加", text)

    def test_dummy_reply_does_not_turn_negated_or_registered_data_into_fact(self):
        llm = get_llm("dummy")
        text = llm.reply_as_roomi(
            "高橋 (寮スタッフ, U1): 朝食の搬入は許可されていない。1階はスタッフ専用ではない。",
            [{
                "user_id": "U1",
                "name": "高橋",
                "role": "寮スタッフ",
                "interests": "A棟1階への搬入は許可済み。1階はスタッフ専用",
            }],
        )
        self.assertNotIn("許可済み", text)
        self.assertNotIn("居住スタッフ用", text)
        self.assertIn("誰がどのルール", text)

    def test_dummy_reply_does_not_invent_a_delivery_gap_for_other_breakfast_topics(self):
        llm = get_llm("dummy")
        text = llm.reply_as_roomi(
            "中村 (学生, U2): 朝食会場をB棟に変えたいです。",
            [{"user_id": "U2", "name": "中村", "role": "学生", "interests": "B棟"}],
        )
        self.assertNotIn("搬入", text)
        self.assertIn("誰がどのルール", text)

    def test_dummy_reply_does_not_repeat_known_rule_and_owner_questions(self):
        llm = get_llm("dummy")
        text = llm.reply_as_roomi(
            "高橋 (責任者, U1): 適用規則は規約第10条で、最終判断者は私です。",
            [{"user_id": "U1", "name": "高橋", "role": "責任者", "interests": "運用"}],
        )
        self.assertNotIn("誰がどのルール", text)
        self.assertNotIn("最終判断者は誰", text)
        self.assertIn("条件や懸念", text)

    def test_dummy_reply_keeps_negated_or_ambiguous_rule_and_owner_as_unknown(self):
        llm = get_llm("dummy")
        for history in (
            "適用規則は規約第10条ではない。最終判断者はまだ決まっていない。",
            "適用規則は規約第10条か第11条。決裁者は田中ではない。",
            "適用規則は規約第10条で検討中です。最終判断者は田中ですという案です。",
            "適用規則は規約第10条で仮置きです。決裁者は田中ですとの提案です。",
            "候補として適用規則は規約第10条です。候補として最終判断者は高橋です。",
        ):
            with self.subTest(history=history):
                text = llm.reply_as_roomi(
                    history,
                    [{"user_id": "U1", "name": "高橋", "role": "責任者", "interests": "運用"}],
                )
                self.assertIn("誰がどのルール", text)

    def test_dummy_reply_keeps_conflicting_rule_and_owner_claims_open(self):
        llm = get_llm("dummy")
        text = llm.reply_as_roomi(
            "高橋: 適用規則は規約第10条です。最終判断者は高橋です。\n"
            "伊藤: 適用規則は規約第11条です。最終判断者は伊藤です。",
            [
                {"user_id": "U1", "name": "高橋", "role": "責任者", "interests": "運用"},
                {"user_id": "U2", "name": "伊藤", "role": "責任者", "interests": "運用"},
            ],
        )
        self.assertNotIn("条件や懸念", text)
        self.assertIn("誰がどのルール", text)

    def test_dummy_reply_resolves_self_declared_owner_per_speaker(self):
        llm = get_llm("dummy")
        text = llm.reply_as_roomi(
            "高橋 (責任者, U1): 適用規則は規約第10条です。最終判断者は私です。\n"
            "伊藤 (責任者, U2): 適用規則は規約第10条です。最終判断者は私です。",
            [
                {"user_id": "U1", "name": "高橋", "role": "責任者", "interests": "運用"},
                {"user_id": "U2", "name": "伊藤", "role": "責任者", "interests": "運用"},
            ],
        )
        self.assertNotIn("条件や懸念", text)
        self.assertIn("最終判断者は誰", text)

    def test_dummy_reply_asks_again_when_permission_scope_claims_conflict(self):
        llm = get_llm("dummy")
        text = llm.reply_as_roomi(
            "高橋 (寮スタッフ, U1): A棟1階への朝食の搬入許可は食事利用まで含む。\n"
            "伊藤 (寮スタッフ, U2): A棟1階への朝食の搬入許可は食事利用まで含みません。",
            [
                {"user_id": "U1", "name": "高橋", "role": "寮スタッフ", "interests": "居住"},
                {"user_id": "U2", "name": "伊藤", "role": "寮スタッフ", "interests": "居住"},
            ],
        )
        self.assertIn("この搬入許可は", text)

    def test_dummy_reply_moves_past_an_answered_permission_scope(self):
        llm = get_llm("dummy")
        text = llm.reply_as_roomi(
            "高橋 (寮スタッフ, U1): 朝食の搬入許可は食事利用まで含む。",
            [{"user_id": "U1", "name": "高橋", "role": "寮スタッフ", "interests": "居住"}],
        )
        self.assertNotIn("この搬入許可は", text)
        self.assertIn("誰がどのルール", text)

    def test_openai_reply_prompt_prioritizes_missing_prerequisites(self):
        llm = CapturingOpenAIProvider()
        llm.reply_as_roomi(
            "高橋 (寮スタッフ, U1): 1階はスタッフの居住エリアです",
            [{"user_id": "U1", "name": "高橋", "role": "寮スタッフ", "interests": "1階の利用権限"}],
            "方針が食い違っている",
        )
        system, user = llm.calls[0]
        self.assertIn("合意を聞く前", system)
        self.assertIn("適用する決まり", system)
        self.assertIn("書かれていない事実・決まり・許可を作らない", system)
        self.assertIn("確認済みの事実とは断定しない", system)
        self.assertIn("同じ質問を繰り返さない", system)
        self.assertIn("現在の合意や確定事実ではない", user)
        self.assertIn("現在の発言ログ", user)

    def test_dummy_stakeholder_reply(self):
        llm = get_llm("dummy")
        text = llm.reply_as_stakeholder(
            "高橋さくら", "寮スタッフ", "居住エリア", "A棟1階で揉めてる", "場所を分けよう"
        )
        self.assertIn("高橋さくら", text)
        self.assertIn("分け", text)

    def test_handoff(self):
        msgs = [{"user_id": "U1", "text": "決めよう?", "is_mention": 0}]
        ctx = build_context(msgs, "T2", "C1")
        self.assertIn("途中参加", make_handoff(ctx, "要約"))

    def test_resolve_llm_name_and_aliases(self):
        import os
        from ai_core import resolve_llm_name

        old_provider = os.environ.get("LLM_PROVIDER")
        old_key = os.environ.get("XAI_API_KEY")
        try:
            os.environ.pop("LLM_PROVIDER", None)
            os.environ.pop("XAI_API_KEY", None)
            self.assertEqual(resolve_llm_name(), "dummy")
            os.environ["LLM_PROVIDER"] = "openai-compatible"
            self.assertEqual(resolve_llm_name(), "openai-compatible")
            llm = get_llm("dummy")
            self.assertEqual(llm.summarize("a\nb"), "要約: a / b")
        finally:
            if old_provider is None:
                os.environ.pop("LLM_PROVIDER", None)
            else:
                os.environ["LLM_PROVIDER"] = old_provider
            if old_key is None:
                os.environ.pop("XAI_API_KEY", None)
            else:
                os.environ["XAI_API_KEY"] = old_key


if __name__ == "__main__":
    unittest.main()
