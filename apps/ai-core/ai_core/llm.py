"""LLM抽象化: dummy + OpenAI。"""
from __future__ import annotations

import json
import os
from typing import Protocol


class LLMProvider(Protocol):
    def summarize(self, text: str) -> str: ...
    def score_intervention(self, context_summary: str) -> tuple[float, float, str]: ...
    def extract_stakeholders(self, messages: list[dict]) -> list[dict]: ...


class DummyLLM:
    """LLMなしでE2Eを回すための実装。"""

    def summarize(self, text: str) -> str:
        lines = [line for line in text.splitlines() if line.strip()]
        return "要約: " + " / ".join(lines[-3:])

    def score_intervention(
        self, context_summary: str
    ) -> tuple[float, float, str]:
        # 未解決が多ければ confidence/impact を上げる単純ヒューリスティック
        q = context_summary.count("?") + context_summary.count("？")
        conf = min(0.95, 0.4 + 0.15 * q)
        impact = min(0.95, 0.5 + 0.1 * q)
        reason = f"未解決っぽい発言が{q}件あるため"
        return conf, impact, reason

    def extract_stakeholders(self, messages: list[dict]) -> list[dict]:
        # LLMなしでは発言者一覧だけ返す
        seen: dict[str, int] = {}
        for m in messages:
            u = m.get("user_id") or m.get("user", "UNKNOWN")
            seen[u] = seen.get(u, 0) + 1
        return [
            {"user_id": u, "role": "", "interests": "", "messages": n}
            for u, n in seen.items()
        ]


class OpenAIProvider:
    """OpenAI Responses/Chat Completionsで動く実装。"""

    def __init__(self, model: str = "gpt-4o-mini") -> None:
        from openai import OpenAI

        kwargs: dict = {}
        base_url = os.environ.get("OPENAI_BASE_URL", "")
        if base_url:
            kwargs["base_url"] = base_url
        self._client = OpenAI(**kwargs)  # OPENAI_API_KEYを読む
        self._model = os.environ.get("OPENAI_MODEL", model)

    def _chat(self, system: str, user: str) -> str:
        kwargs: dict = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        effort = os.environ.get("OPENAI_REASONING_EFFORT", "")
        if effort:
            kwargs["reasoning_effort"] = effort
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    def summarize(self, text: str) -> str:
        return self._chat(
            "Slackの議論を3行以内で日本語要約するアシスタント。",
            text[:6000],
        )

    def score_intervention(self, context_summary: str) -> tuple[float, float, str]:
        out = self._chat(
            "Slack議論へのAI介入の必要性を判定する。必ず"
            '{"confidence": 0.0-1.0, "impact": 0.0-1.0, "reason": "日本語理由"}'
            "のJSONだけ返す。",
            context_summary[:4000],
        )
        try:
            data = json.loads(out[out.index("{"):out.rindex("}") + 1])
            return (float(data["confidence"]),
                    float(data["impact"]), str(data["reason"]))
        except (ValueError, KeyError):
            return 0.5, 0.5, out[:200]

    def extract_stakeholders(self, messages: list[dict]) -> list[dict]:
        lines = [
            f"{m.get('user_id', '?')}: {m.get('text', '')}"
            for m in messages[:100]
        ]
        out = self._chat(
            "Slack発言から関係者を抽出する。発言内容から役割・関心を推定し、必ず"
            '[{"user_id": "ID", "role": "役割", "interests": "関心事"}]'
            "のJSON配列だけ返す。user_idは入力のIDをそのまま使う。",
            "\n".join(lines)[:8000],
        )
        try:
            data = json.loads(out[out.index("["):out.rindex("]") + 1])
            return [dict(d) for d in data if isinstance(d, dict)]
        except ValueError:
            return DummyLLM().extract_stakeholders(messages)


def get_llm(name: str = "dummy") -> LLMProvider:
    if name == "dummy":
        return DummyLLM()
    if name == "openai":
        return OpenAIProvider()
    raise ValueError(f"unknown LLM provider: {name}")
