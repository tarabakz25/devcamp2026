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
from .llm import DummyLLM, OpenAIProvider, get_llm, resolve_llm_name
from .policy import Decision, decide, record

__all__ = [
    "AgentResult", "Decision", "DummyLLM", "OpenAIProvider",
    "Stakeholder", "ThreadContext",
    "build_context", "compose_reply", "decide", "extract_stakeholders", "get_llm",
    "judge_intervention", "make_handoff", "observe", "record",
    "resolve_llm_name",
]
