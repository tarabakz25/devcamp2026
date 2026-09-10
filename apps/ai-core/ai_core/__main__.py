"""ai-core単体デモ: PYTHONPATH=apps/ai-core python -m ai_core"""
from . import (
    build_context,
    compose_reply,
    decide,
    get_llm,
    judge_intervention,
    observe,
    record,
)


class MemoryRules:
    def __init__(self):
        self.saved = []
        self._last_ts = 0.0

    def get_rule(self, channel_id):
        return {"min_confidence": 0.7, "min_impact": 0.7,
                "cooldown_sec": 600, "enabled": 1}

    def last_intervention_ts(self, thread_id):
        return self._last_ts

    def save_intervention(self, thread_id, reason, confidence,
                          impact, action, created_at):
        self.saved.append((thread_id, action))
        self._last_ts = float(created_at)


def main() -> None:
    llm = get_llm("dummy")
    msgs = [
        {"user_id": "U1", "text": "新機能の仕様どうする?", "is_mention": 0},
        {"user_id": "U2", "text": "決済フローが未確定で止まってる", "is_mention": 0},
        {"user_id": "U3", "text": "なぜ止まってるんだっけ?", "is_mention": 0},
    ]
    ctx = build_context(msgs, "DEMO-1", "C1")
    summary = observe(ctx, llm)
    result = judge_intervention(ctx, llm)
    rules = MemoryRules()
    decision = decide(rules, "C1", "DEMO-1", result, now=1000.0)
    print(f"summary={summary}")
    print(f"decide act={decision.action} reason={decision.reason}")
    if decision.should_act:
        record(rules, "DEMO-1", result, decision.action)
        people = [
            {"user_id": uid, "name": uid, "role": "", "interests": ""}
            for uid in ctx.participants
        ]
        print(compose_reply(ctx, llm, people, result.reason))
    else:
        print("silent: 介入なし")


if __name__ == "__main__":
    main()
