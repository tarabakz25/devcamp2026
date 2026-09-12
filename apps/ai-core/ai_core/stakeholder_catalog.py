"""Stakeholder Catalog & RAG: 事前に構築された組織メンバー情報から議論の関連者をベクトル検索する。"""
from __future__ import annotations

from dataclasses import dataclass, field

from .llm import LLMProvider, cosine_similarity


@dataclass
class StakeholderProfile:
    user_id: str
    name: str
    role: str = ""
    interests: str = ""
    avatar: str = ""
    embedding: list[float] | None = None

    @property
    def profile_text(self) -> str:
        """ベクトル化およびプロンプト用の表現。"""
        parts = [f"氏名: {self.name}"]
        if self.role:
            parts.append(f"役割: {self.role}")
        if self.interests:
            parts.append(f"担当・関心: {self.interests}")
        return " / ".join(parts)


@dataclass
class RankedStakeholder:
    profile: StakeholderProfile
    score: float
    is_participant: bool = False


def search_stakeholders(
    query: str,
    catalog: list[StakeholderProfile],
    llm: LLMProvider,
    participants: list[str] | None = None,
    top_k: int = 5,
    threshold: float = 0.0,
) -> list[RankedStakeholder]:
    """議論トピック (query) に基づき、事前カタログから関連ステークホルダーを類似度検索 (RAG) する。"""
    if not catalog or not query.strip():
        return []

    participants_set = set(participants or [])
    query_vec = llm.embed(query)

    ranked: list[RankedStakeholder] = []
    for profile in catalog:
        vec = profile.embedding
        if vec is None:
            vec = llm.embed(profile.profile_text)
            profile.embedding = vec

        sim = cosine_similarity(query_vec, vec)
        if sim >= threshold:
            ranked.append(
                RankedStakeholder(
                    profile=profile,
                    score=sim,
                    is_participant=profile.user_id in participants_set,
                )
            )

    ranked.sort(key=lambda r: r.score, reverse=True)
    return ranked[:top_k]


def detect_missing_stakeholders(
    ranked: list[RankedStakeholder],
    min_score: float = 0.2,
) -> list[RankedStakeholder]:
    """関連度が高いが、まだスレッドに参加していない関係者を抽出する。"""
    return [
        r for r in ranked
        if not r.is_participant and r.score >= min_score
    ]


def format_stakeholder_context(ranked: list[RankedStakeholder]) -> str:
    """LLMプロンプト向けのステークホルダー情報テキストを生成する。"""
    if not ranked:
        return ""
    lines = ["【事前登録ステークホルダーとの照合 (RAG)】"]
    for r in ranked:
        status = "参加中" if r.is_participant else "★未参加"
        lines.append(
            f"- @{r.profile.name} ({r.profile.user_id}) [{status}] "
            f"役割: {r.profile.role or '未設定'} / "
            f"担当・関心: {r.profile.interests or '未設定'} (関連度: {r.score:.2f})"
        )
    return "\n".join(lines)
