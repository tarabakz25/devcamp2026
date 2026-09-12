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
    relevant_stakeholders: list[dict] = None  # type: ignore[assignment]
    missing_stakeholders: list[dict] = None  # type: ignore[assignment]


def _human_messages(ctx: ThreadContext, people: list[dict]) -> list[dict]:
    known_people = {str(person.get("user_id") or "") for person in people}
    if not known_people:
        return list(ctx.messages)
    return [
        message for message in ctx.messages
        if str(message.get("user_id") or message.get("user") or "") in known_people
    ]


def conversation_ready(ctx: ThreadContext, people: list[dict] | None = None) -> bool:
    """Wait for four human turns before making an unsolicited intervention."""
    if ctx.mentions_bot:
        return True
    people = people or []
    messages = _human_messages(ctx, people)
    return len(messages) >= 4


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


def judge_intervention(
    ctx: ThreadContext,
    llm,
    people: list[dict] | None = None,
    *,
    catalog: list | None = None,
    catalog_llm=None,
    bypass_readiness: bool = False,
) -> AgentResult:
    from .stakeholder_catalog import detect_missing_stakeholders, search_stakeholders

    # RAG: 事前カタログからトピックに関連するステークホルダーを検索
    relevant_list: list[dict] = []
    missing_list: list[dict] = []
    retrieval_llm = catalog_llm or llm
    if catalog and hasattr(retrieval_llm, "embed"):
        ranked = search_stakeholders(
            ctx.summary, catalog, retrieval_llm,
            participants=ctx.participants, top_k=5,
        )
        for r in ranked:
            item = {
                "user_id": r.profile.user_id,
                "name": r.profile.name,
                "role": r.profile.role,
                "interests": r.profile.interests,
                "score": r.score,
                "is_participant": r.is_participant,
            }
            relevant_list.append(item)
            if not r.is_participant and r.score >= 0.25:
                missing_list.append(item)

    if not bypass_readiness and not conversation_ready(ctx, people):
        return AgentResult(
            confidence=0.0,
            impact=0.0,
            reason="判断材料がまだ片側に偏っているため、別の立場の発言を待つ",
            stakeholders=map_stakeholders(ctx),
            relevant_stakeholders=relevant_list,
            missing_stakeholders=missing_list,
        )
    if hasattr(llm, "needs_intervention"):
        yes, reason = llm.needs_intervention(ctx.summary)
        conf, impact = (1.0, 1.0) if yes else (0.0, 0.0)
    else:
        conf, impact, reason = llm.score_intervention(ctx.summary)

    # 不在のキーパーソンが検出され、スレッドで議論が進行中の場合は介入動機を強化
    if missing_list and conf >= 0.5:
        top_missing = missing_list[0]
        missing_role = f" ({top_missing['role']})" if top_missing.get("role") else ""
        missing_note = f"関連する{top_missing['name']}{missing_role}がまだ未参加"
        if not reason or reason == "介入する":
            reason = missing_note
        elif missing_note not in reason:
            reason = f"{reason} / {missing_note}"
        conf = max(conf, 0.85)
        impact = max(impact, 0.85)

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
        relevant_stakeholders=relevant_list,
        missing_stakeholders=missing_list,
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
        names = {
            str(person.get("user_id") or ""): person
            for person in people
        }
        history_lines: list[str] = []
        for message in ctx.messages:
            user_id = str(message.get("user_id") or message.get("user") or "")
            person = names.get(user_id, {})
            label = str(person.get("name") or user_id or "発言者")
            role = str(person.get("role") or "役割不明")
            history_lines.append(f"{label} ({role}, {user_id}): {message.get('text', '')}")
        history = "\n".join(history_lines) or ctx.summary
        text = (llm.reply_as_roomi(history, people, reason) or "").strip()
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
