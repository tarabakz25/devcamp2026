"""4エージェント: Observer -> Mapper -> Intervention -> Handoff."""
from __future__ import annotations

from dataclasses import dataclass

from .context_builder import ThreadContext


@dataclass
class AgentResult:
    confidence: float
    impact: float
    reason: str
    handoff_text: str = ""
    stakeholders: list[str] = None  # type: ignore[assignment]


@dataclass
class Stakeholder:
    user_id: str
    role: str = ""
    interests: str = ""
    messages: int = 0


def observe(ctx: ThreadContext, llm) -> str:
    return llm.summarize(ctx.summary)


def map_stakeholders(ctx: ThreadContext) -> list[str]:
    # MVP: 発言者をそのまま関係者として返す。利害推定は次フェーズ
    return list(ctx.participants)


def judge_intervention(ctx: ThreadContext, llm) -> AgentResult:
    if hasattr(llm, "needs_intervention"):
        yes, reason = llm.needs_intervention(ctx.summary)
        conf, impact = (1.0, 1.0) if yes else (0.0, 0.0)
    else:
        conf, impact, reason = llm.score_intervention(ctx.summary)
    # メンションされたら必ず応答寄り
    if ctx.mentions_bot:
        conf = 0.99
        impact = max(impact, 0.99)
        if not reason or reason == "まだ介入不要":
            reason = "メンションされた"
    stakeholders = map_stakeholders(ctx)
    return AgentResult(
        confidence=conf, impact=impact, reason=reason,
        stakeholders=stakeholders,
    )


def extract_stakeholders(messages: list[dict], llm) -> list[Stakeholder]:
    """発言から関係者を抽出。LLMが役割・関心を推定する。"""
    counts: dict[str, int] = {}
    for m in messages:
        u = m.get("user_id") or m.get("user", "UNKNOWN")
        counts[u] = counts.get(u, 0) + 1
    out: list[Stakeholder] = []
    for item in llm.extract_stakeholders(messages):
        uid = str(item.get("user_id", ""))
        out.append(Stakeholder(
            user_id=uid,
            role=str(item.get("role", "")),
            interests=str(item.get("interests", "")),
            messages=counts.get(uid, int(item.get("messages", 0) or 0)),
        ))
    return out


def compose_reply(
    ctx: ThreadContext,
    llm,
    people: list[dict] | None = None,
    reason: str = "",
) -> str:
    """Roomi本人として返す。テンプレの途中参加まとめは使わない。"""
    people = people or []
    if hasattr(llm, "reply_as_roomi"):
        text = (llm.reply_as_roomi(ctx.summary, people, reason) or "").strip()
        if text:
            return text
    return make_handoff(ctx, ctx.summary)


def make_handoff(ctx: ThreadContext, summary: str) -> str:
    lines = [
        f"スレッド {ctx.thread_id} の途中参加向けまとめ",
        f"参加者: {', '.join(ctx.participants)}",
        f"要約: {summary}",
    ]
    if ctx.unresolved:
        lines.append("未解決:")
        lines.extend(f"- {u}" for u in ctx.unresolved)
    return "\n".join(lines)
