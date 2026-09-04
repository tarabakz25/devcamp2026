import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_core import (
    build_context,
    decide,
    get_llm,
    judge_intervention,
    make_handoff,
)


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

    def test_handoff(self):
        msgs = [{"user_id": "U1", "text": "決めよう?", "is_mention": 0}]
        ctx = build_context(msgs, "T2", "C1")
        self.assertIn("途中参加", make_handoff(ctx, "要約"))


if __name__ == "__main__":
    unittest.main()
