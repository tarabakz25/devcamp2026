"""LLM抽象化: dummy + OpenAI。"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from typing import Protocol


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    """2つのベクトルのコサイン類似度を計算する (-1.0〜1.0)。"""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return dot / (norm1 * norm2)


class LLMProvider(Protocol):
    def summarize(self, text: str) -> str: ...
    def score_intervention(self, context_summary: str) -> tuple[float, float, str]: ...
    def needs_intervention(self, context_summary: str) -> tuple[bool, str]: ...
    def extract_stakeholders(self, messages: list[dict]) -> list[dict]: ...
    def reply_as_roomi(
        self,
        history: str,
        people: list[dict],
        reason: str = "",
    ) -> str: ...
    def reply_as_stakeholder(
        self,
        speaker_name: str,
        role: str,
        interests: str,
        history: str,
        roomi_text: str = "",
    ) -> str: ...
    def embed(self, text: str) -> list[float]: ...
    def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


class DummyLLM:
    """LLMなしでE2Eを回すための実装。"""

    def embed(self, text: str, dim: int = 256) -> list[float]:
        """決定論的な文字バイグラム/単語BoWベクトルを返す (L2正規化済み)。"""
        import re
        vec = [0.0] * dim
        cleaned = text.lower().strip()
        if not cleaned:
            return vec
        tokens = [cleaned[i : i + 2] for i in range(len(cleaned) - 1)]
        words = [w for w in re.split(r"[\s、。・/,\-_:：()（）]+", cleaned) if len(w) >= 2]
        tokens.extend(words)
        for token in tokens:
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % dim
            weight = 2.0 if len(token) >= 3 else 1.0
            vec[h] += weight
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0.0:
            vec = [x / norm for x in vec]
        return vec

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(t) for t in texts]

    def summarize(self, text: str) -> str:
        lines = [line for line in text.splitlines() if line.strip()]
        return "要約: " + " / ".join(lines[-3:])

    def score_intervention(
        self, context_summary: str
    ) -> tuple[float, float, str]:
        yes, reason = self.needs_intervention(context_summary)
        if yes:
            return 1.0, 1.0, reason
        return 0.0, 0.0, reason

    def needs_intervention(self, context_summary: str) -> tuple[bool, str]:
        text = context_summary or ""
        student_side = any(
            token in text for token in ("続けたい", "学生の朝", "準備片付け", "楽に")
        )
        staff_side = any(
            token in text
            for token in ("してください", "使ってください", "居住", "専用", "エリアを分け")
        )
        if student_side and staff_side:
            return True, "方針が食い違っている"
        q = text.count("?") + text.count("？")
        if q >= 1 and any(
            token in text for token in ("どうする", "なぜ", "誰", "いつ")
        ):
            return True, f"未解決っぽい発言が{q}件あるため"
        return False, "まだ介入不要"

    def reply_as_roomi(
        self,
        history: str,
        people: list[dict],
        reason: str = "",
    ) -> str:
        named = [p for p in people if p.get("name")]
        staff = [p for p in named if "スタッフ" in str(p.get("role") or "")]
        others = [p for p in named if p not in staff]
        picks: list[dict] = []
        for group in (staff, others):
            if group and len(picks) < 2:
                picks.append(group[0])
        if not picks:
            picks = named[:2]
        mentions = " ".join(f"@{p['name']}" for p in picks)
        text = history or ""
        clauses = [clause.strip() for clause in re.split(r"[。\n、]", text)]
        provisional_markers = ("候補", "仮", "暫定", "検討", "調整中", "提案", "案", "予定")

        rule_claims: set[str] = set()
        for clause in clauses:
            if any(marker in clause for marker in provisional_markers):
                continue
            statement = re.search(
                r"(?:適用規則|適用ルール)は規約第\d+条(?:で|です)?$"
                r"|規約第\d+条を適用します$",
                clause,
            )
            if statement:
                article = re.search(r"規約第(\d+)条", statement.group(0))
                if article:
                    rule_claims.add(article.group(1))
        rule_known = len(rule_claims) == 1

        owner_phrases: dict[str, str] = {}
        for person in named:
            name = str(person.get("name") or "").strip()
            if name:
                owner_phrases.update({
                    f"最終判断者は{name}です": name,
                    f"決裁者は{name}です": name,
                })
        owner_claims: set[str] = set()
        for line in text.splitlines():
            speaker, separator, statement = line.partition(":")
            if not separator:
                speaker, separator, statement = line.partition("：")
            if not separator:
                speaker, statement = "発言者不明", line
            for clause in re.split(r"[。、]", statement):
                clause = clause.strip()
                if any(marker in clause for marker in provisional_markers):
                    continue
                if clause.endswith(("最終判断者は私です", "決裁者は私です", "私が最終判断します")):
                    owner_claims.add(f"speaker:{speaker.strip()}")
                for phrase, owner in owner_phrases.items():
                    if clause.endswith(phrase):
                        owner_claims.add(f"person:{owner}")
        owner_known = len(owner_claims) == 1

        def next_prerequisite_question(topic: str) -> str:
            if not rule_known and not owner_known:
                return f"{topic}は、誰がどのルールで決める？"
            if not rule_known:
                return f"{topic}に適用する決まりはどれ？"
            if not owner_known:
                return f"{topic}の最終判断者は誰？"
            return "この案に、まだ未確認の条件や懸念はある？"

        breakfast_topic = "朝食" in text and any(
            token in text for token in ("1階", "2階", "キッチン", "会場", "B棟")
        )
        if breakfast_topic:
            target = f"@{staff[0]['name']} " if staff else ""
            permission_claimed = any(
                phrase in text
                for phrase in (
                    "搬入場所がA棟1階キッチンである点については、事前に許可しているため認識しています",
                )
            )
            staff_area_claimed = any(
                phrase in text
                for phrase in (
                    "A棟1階フロアはスタッフの居住エリアであり",
                    "A棟1階キッチンはA棟1階スタッフの使用権限がある場所のため",
                )
            )
            permission_scope_claims: set[str] = set()
            for clause in clauses:
                if re.search(
                    r"許可は(?:朝食を食べる)?食事?利用まで"
                    r"(?:含む|含みます|含む許可です|含む決まりです)$",
                    clause,
                ):
                    permission_scope_claims.add("included")
                if re.search(
                    r"許可は(?:朝食を食べる)?食事?利用まで"
                    r"(?:含まない|含みません|対象外です)$",
                    clause,
                ):
                    permission_scope_claims.add("excluded")
            permission_scope_known = len(permission_scope_claims) == 1
            permission_claimed = permission_claimed or bool(permission_scope_claims)
            claims = []
            if permission_claimed:
                claims.append("A棟1階への搬入は事前に許可した")
            if staff_area_claimed:
                claims.append("A棟1階はスタッフの居住エリア")
            known = "、".join(claims) or "朝食会場について複数の立場がある"
            question = (
                "この搬入許可は、朝食を食べる利用まで含む決まり？"
                if permission_claimed and not permission_scope_known
                else next_prerequisite_question("朝食会場の変更")
            )
            return (
                f"現在の会話には、{known}という前提候補の説明がある。"
                f"一方で、判断に使う情報がまだ足りない。{target}{question}"
            )
        if mentions:
            return (
                "登録データと会話を照合した。"
                f"{mentions} {next_prerequisite_question('この案')}"
            )
        return (
            "いま少し噛み合ってない気がする。"
            "先に何を決めるかを一つにしないと、このままだと平行線のままだよ。"
        )

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

    def reply_as_stakeholder(
        self,
        speaker_name: str,
        role: str,
        interests: str,
        history: str,
        roomi_text: str = "",
    ) -> str:
        focus = (interests or role or "今の論点").split("・")[0]
        if "スタッフ" in role:
            return (
                f"{speaker_name}です。{focus}の立場だと、"
                "居住スペースと朝食会場は分けた方がいいと思います。"
            )
        if "学生" in role or "モノラボ" in role:
            return (
                f"{focus}の現場からすると、先に場所を一つに決めたいです。"
                "Roomiの整理を踏まえても、自分の立場は変わりません。"
            )
        return f"{speaker_name}としては、{focus}を優先して決めたいです。"


class OpenAIProvider:
    """OpenAI互換 Chat Completionsで動く実装（OpenAI / xAI）。"""

    def __init__(
        self,
        model: str = "gpt-4o-mini",
        *,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> None:
        from openai import OpenAI

        kwargs: dict = {}
        if api_key:
            kwargs["api_key"] = api_key
        env_base = os.environ.get("OPENAI_BASE_URL", "")
        url = base_url if base_url is not None else env_base
        if url:
            kwargs["base_url"] = url
        self._client = OpenAI(**kwargs)
        self._model = model

    def _chat(
        self,
        system: str,
        user: str,
        *,
        model: str | None = None,
        effort: str | None = None,
    ) -> str:
        kwargs: dict = {
            "model": model or self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        use_effort = (
            effort
            if effort is not None
            else os.environ.get("OPENAI_REASONING_EFFORT", "")
        )
        if use_effort:
            kwargs["reasoning_effort"] = use_effort
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    def summarize(self, text: str) -> str:
        return self._chat(
            "あなたは会議の書記だ。入力は発言ログである。3行以内で日本語要約し、要約本文だけ返す。",
            f"発言ログ:\n{text[:6000]}",
        )

    def score_intervention(self, context_summary: str) -> tuple[float, float, str]:
        yes, reason = self.needs_intervention(context_summary)
        if yes:
            return 1.0, 1.0, reason
        return 0.0, 0.0, reason

    def needs_intervention(self, context_summary: str) -> tuple[bool, str]:
        model = os.environ.get("JUDGE_MODEL", "").strip() or self._model
        effort = os.environ.get("JUDGE_REASONING_EFFORT", "none").strip() or "none"
        out = self._chat(
            "Slack議論への介入判定器。今すぐAIが割り込むべきなら1、まだ様子見なら0。"
            "1: 方針が食い違っている、関係者がすれ違っている、論点が散らかっている、決めきれない。"
            "0: 情報共有だけ、片側の説明、謝罪や補足、まだ反論がない。"
            '必ず {"intervene": 0, "reason": "短い日本語"} だけ返す。',
            f"発言ログ:\n{(context_summary or '')[:4000]}",
            model=model,
            effort=effort,
        )
        try:
            data = json.loads(out[out.index("{"):out.rindex("}") + 1])
            raw = data.get("intervene", 0)
            yes = int(raw) == 1 or raw is True or str(raw).strip() == "1"
            reason = str(data.get("reason") or ("介入する" if yes else "まだ介入不要"))
            return yes, reason
        except (ValueError, KeyError, TypeError):
            stripped = (out or "").strip()
            if stripped.startswith("1"):
                return True, stripped[:120]
            if stripped.startswith("0"):
                return False, stripped[:120]
            return False, stripped[:120] or "判定不能"

    def reply_as_roomi(
        self,
        history: str,
        people: list[dict],
        reason: str = "",
    ) -> str:
        roster = "\n".join(
            f"- @{p.get('name') or p.get('user_id')} ({p.get('user_id')}) "
            f"{p.get('role') or '関係者'}: {p.get('interests') or ''}"
            for p in people[:20]
        ) or "- 名前なし"
        out = self._chat(
            (
                "あなたはSlackにいる「Roomi」。議論に入る一人の仲間で、書記でも司会でもない。"
                "短く、やさしく、はっきり話す。見出し・箇条書き・JSONは禁止。"
                "登録済みの役割・関心と現在の発言を照合し、現在の発言にある主張、"
                "登録データとの一致、不一致、未確認を区別する。"
                "登録データの関心は過去の参考情報であり、本人の現在の合意や確定事実として扱わない。"
                "この入力には正式な規則や許可の出典がないため、会話や登録データの内容には"
                "『会話では』『登録データでは』と出所を付け、確認済みの事実とは断定しない。"
                "発言ログと登録データに書かれていない事実・決まり・許可を作らない。"
                "合意を聞く前に、判断を左右する不足を探す。優先順は、適用する決まり、決定権者、"
                "許可の範囲、実行可能性、影響を受ける人、期限・評価基準。"
                "不足があれば、会話や登録データにある前提候補を短く示してから、最重要の不明点を一つだけ問う。"
                "発言ログに回答がすでにある項目は不足扱いせず、同じ質問を繰り返さない。"
                "不足がない場合だけ、具体的な案への合意・条件・懸念を聞く。"
                "特定の人に確認や呼びかけをするときだけ @名前 を使う。全員には付けない。"
                "使える名前は登録済み参照データのリストだけ。リストにない名前は出さない。\n"
                "1〜4文の日本語だけ返す。AIだと言わない。絵文字は多くて1つ。"
            ),
            (
                f"介入理由: {reason or '議論が噛み合っていない'}\n\n"
                f"登録済み参照データ（現在の合意や確定事実ではない）:\n{roster}\n\n"
                f"現在の発言ログ:\n{(history or '')[:5000]}\n\n"
                "Roomiとして次の一言:"
            ),
        )
        return (out or "").strip() or DummyLLM().reply_as_roomi(
            history, people, reason
        )

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

    def embed(self, text: str) -> list[float]:
        model = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        try:
            resp = self._client.embeddings.create(input=text, model=model)
            return resp.data[0].embedding
        except Exception:
            return DummyLLM().embed(text)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        try:
            resp = self._client.embeddings.create(input=texts, model=model)
            return [item.embedding for item in resp.data]
        except Exception:
            return DummyLLM().embed_batch(texts)

    def reply_as_stakeholder(
        self,
        speaker_name: str,
        role: str,
        interests: str,
        history: str,
        roomi_text: str = "",
    ) -> str:
        roomi_block = f"\nRoomiの直前の発言:\n{roomi_text[:1500]}" if roomi_text else ""
        out = self._chat(
            (
                f"あなたは神山まるごと高専のSlackにいる「{speaker_name}」"
                f"（役割: {role or '関係者'}）だ。"
                f"あなたの立場: {interests or '議論の整理'}。"
                "朝食会場の場所について話している。"
                "本人の立場は崩さない。Roomiに合わせすぎない。"
                "寮スタッフなら居住エリア分離、学生なら現場の準備しやすさや"
                "今の場所の継続を優先する。"
                "1〜3文の短い日本語だけ返す。AIだと言わない。"
                "絵文字は使っても1つまで。Slackの返信として自然に。"
            ),
            f"これまでの発言:\n{history[:5000]}{roomi_block}\n\n{speaker_name}として次の一言:",
        )
        return (out or "").strip() or DummyLLM().reply_as_stakeholder(
            speaker_name, role, interests, history, roomi_text
        )


def resolve_llm_name() -> str:
    """LLM_PROVIDER があればそれを使う。未設定なら XAI_API_KEY の有無で決める。"""
    name = os.environ.get("LLM_PROVIDER", "").strip()
    if name:
        return name
    if os.environ.get("XAI_API_KEY"):
        return "xai"
    return "dummy"


def get_llm(name: str = "dummy") -> LLMProvider:
    if name == "dummy":
        return DummyLLM()
    if name in ("openai", "openai-compatible"):
        return OpenAIProvider(model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))
    if name == "xai":
        return OpenAIProvider(
            model=os.environ.get("XAI_MODEL", "grok-4.6"),
            api_key=os.environ.get("XAI_API_KEY"),
            base_url="https://api.x.ai/v1",
        )
    raise ValueError(f"unknown LLM provider: {name}")
