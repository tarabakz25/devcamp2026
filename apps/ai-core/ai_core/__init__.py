"""ai-core: LLM抽象化・4エージェント・文脈構築・介入判定の中核パッケージ。"""
from .agents import (
    AgentResult,
    Stakeholder,
    compose_reply,
    extract_stakeholders,
    judge_intervention,
    make_handoff,
    observe,
)
from .context_builder import ThreadContext, build_context
from .llm import DummyLLM, OpenAIProvider, cosine_similarity, get_llm, resolve_llm_name
from .policy import Decision, decide, record
from .stakeholder_catalog import (
    RankedStakeholder,
    StakeholderProfile,
    detect_missing_stakeholders,
    format_stakeholder_context,
    search_stakeholders,
)

__all__ = [
    "AgentResult", "Decision", "DummyLLM", "OpenAIProvider",
    "RankedStakeholder", "Stakeholder", "StakeholderProfile", "ThreadContext",
    "build_context", "compose_reply", "cosine_similarity", "decide",
    "detect_missing_stakeholders", "extract_stakeholders",
    "format_stakeholder_context", "get_llm", "judge_intervention",
    "make_handoff", "observe", "record", "resolve_llm_name",
    "search_stakeholders",
]
