"""Agent Policy Engine: 介入する? 黙る? 誰を呼ぶ?"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol


@dataclass
class Decision:
    should_act: bool
    action: str  # reply | mention | handoff | silent
    reason: str


class RuleStore(Protocol):
    def get_rule(self, channel_id: str) -> dict: ...
    def last_intervention_ts(self, thread_id: str) -> float: ...
    def save_intervention(
        self, thread_id: str, reason: str,
        confidence: float, impact: float, action: str, created_at: str,
    ) -> None: ...


def decide(
    rules: RuleStore,
    channel_id: str,
    thread_id: str,
    result,
    now: float | None = None,
) -> Decision:
    rule = rules.get_rule(channel_id)
    if not rule["enabled"]:
        return Decision(False, "silent", "ルールで無効化されている")

    now = now if now is not None else time.time()
    cooldown = rule.get("cooldown_sec", 0)
    if cooldown > 0 and now - rules.last_intervention_ts(thread_id) < cooldown:
        return Decision(False, "silent", "クールダウン中")

    if result.confidence < rule["min_confidence"] or result.impact < rule["min_impact"]:
        return Decision(
            False, "silent",
            f"しきい値未満 (conf={result.confidence:.2f}, impact={result.impact:.2f})",
        )

    # 0/1判定では通常 reply。参加者が多い議論は途中参加向け handoff。
    action = "handoff" if len(result.stakeholders or []) >= 4 else "reply"
    return Decision(True, action, result.reason)


def record(rules: RuleStore, thread_id: str, result, action: str) -> None:
    rules.save_intervention(
        thread_id, result.reason, result.confidence,
        result.impact, action, str(time.time()),
    )
