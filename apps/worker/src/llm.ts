// LLM: dummy (rule-based, ported from ai_core/llm.py DummyLLM)
// + OpenAI-compatible chat (xAI/OpenAI) via fetch. No Node APIs.
import type { DecisionMethod, StakeholderRole, Stance } from "./agreement";

export type ChatFn = (system: string, user: string) => Promise<string>;

export type LlmEnv = {
  LLM_PROVIDER?: string;
  XAI_API_KEY?: string;
  XAI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

export type AgreementCandidate = {
  user_id: string;
  name?: string;
  role?: string;
  interests?: string;
};

export type AgreementMessage = {
  id: string;
  ts?: string;
  user_id: string;
  user_name?: string;
  text: string;
};

export type AgreementAnalysis = {
  is_decision: boolean;
  proposal_changed: boolean;
  proposal_change_evidence_message_ids: string[];
  decision: {
    title: string;
    proposal: string;
    method: DecisionMethod;
    method_reason: string;
    method_confidence: number;
    owner_user_id: string | null;
    owner_role: string;
    owner_confidence: number;
    deadline: string | null;
    evidence: string;
    evidence_message_ids: string[];
    confidence: number;
    sensitive: boolean;
  };
  participants: Array<{
    user_id: string;
    user_name: string;
    role: string;
    agreement_role: StakeholderRole;
    required: boolean;
    stance: Stance;
    condition: string;
    evidence: string;
    evidence_message_ids: string[];
    confidence: number;
    sensitive: boolean;
  }>;
  confidence: number;
  sensitive: boolean;
};

export function needsIntervention(summary: string): { yes: boolean; reason: string } {
  const text = summary || "";
  const student = ["続けたい", "学生の朝", "準備片付け", "楽に"].some((t) => text.includes(t));
  const staff = ["してください", "使ってください", "居住", "専用", "エリアを分け"].some((t) =>
    text.includes(t),
  );
  if (student && staff) return { yes: true, reason: "方針が食い違っている" };
  const q = (text.match(/[?？]/g) || []).length;
  if (q >= 1 && ["どうする", "なぜ", "誰", "いつ"].some((t) => text.includes(t)))
    return { yes: true, reason: `未解決っぽい発言が${q}件あるため` };
  return { yes: false, reason: "まだ介入不要" };
}

export function roomiReply(history: string, people: Array<{ name?: string; role?: string }>, reason = ""): string {
  const named = people.filter((p) => p.name);
  const staff = named.filter((p) => (p.role || "").includes("スタッフ"));
  const others = named.filter((p) => !staff.includes(p));
  const picks: typeof named = [];
  for (const g of [staff, others]) if (g.length && picks.length < 2) picks.push(g[0]);
  if (!picks.length) picks.push(...named.slice(0, 2));
  const mentions = picks.map((p) => `@${p.name}`).join(" ");
  if (["朝食", "1階", "2階", "居住"].some((t) => history.includes(t))) {
    const who = mentions || "みんな";
    return (
      `ちょっと整理させて。今は場所の話と、生活を守る話が同じ土俵でぶつかってる。\n` +
      `${who} の言い分はどれも朝の事情だと思う。` +
      `先に『誰の朝を守るか』を一つにしないと、会場だけ決めてもまた戻るよ。`
    );
  }
  if (mentions)
    return `${mentions} いま少し噛み合ってない気がする。先に何を決めるかを一つにしないと、このままだと平行線のままだよ。`;
  return "いま少し噛み合ってない気がする。先に何を決めるかを一つにしないと、このままだと平行線のままだよ。";
}

export function stakeholderReply(name: string, role: string, interests: string): string {
  const focus = (interests || role || "今の論点").split("・")[0];
  if (role.includes("スタッフ"))
    return `${name}です。${focus}の立場だと、居住スペースと朝食会場は分けた方がいいと思います。`;
  if (role.includes("学生") || role.includes("モノラボ"))
    return `${focus}の現場からすると、先に場所を一つに決めたいです。Roomiの整理を踏まえても、自分の立場は変わりません。`;
  return `${name}としては、${focus}を優先して決めたいです。`;
}

export async function stakeholderLine(
  env: LlmEnv,
  provider: string,
  history: string,
  person: { name: string; role: string; interests: string },
): Promise<string> {
  const fallback = stakeholderReply(person.name, person.role, person.interests);
  if (provider !== "xai" && provider !== "openai" && provider !== "openai-compatible") return fallback;
  try {
    const out = await chatCompletions(
      env,
      provider,
      `あなたはSlack上の関係者「${person.name}」として返信する。` +
        `役割は「${person.role || "関係者"}」、関心は「${person.interests || "現在の論点"}」。` +
        "会話履歴を踏まえ、自分の立場から具体的に1〜3文の自然な日本語で返す。" +
        "Roomiの口調を真似せず、自己紹介や定型のまとめを繰り返さない。JSON・箇条書き・見出しは禁止。",
      `最近の会話履歴:\n${history.slice(-7000)}\n\n${person.name}としての返信:`,
    );
    return out.trim().slice(0, 800) || fallback;
  } catch {
    return fallback;
  }
}

export function resolveLlmName(env: LlmEnv): string {
  const name = (env.LLM_PROVIDER || "").trim();
  if (name) return name;
  if (env.XAI_API_KEY) return "xai";
  return "dummy";
}

async function chatCompletions(
  env: LlmEnv,
  provider: string,
  system: string,
  user: string,
): Promise<string> {
  const base =
    provider === "xai" ? "https://api.x.ai/v1" : env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const key = provider === "xai" ? env.XAI_API_KEY : env.OPENAI_API_KEY;
  const model =
    provider === "xai"
      ? env.XAI_MODEL || "grok-4.6"
      : env.OPENAI_MODEL || "gpt-4o-mini";
  if (!key) throw new Error("missing api key");
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`llm http ${r.status}`);
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || "";
}

/** Judge via remote LLM when configured, else dummy. Never throws. */
export async function judge(
  env: LlmEnv,
  provider: string,
  summary: string,
): Promise<{ yes: boolean; reason: string }> {
  if (provider !== "xai" && provider !== "openai" && provider !== "openai-compatible")
    return needsIntervention(summary);
  try {
    const out = await chatCompletions(
      env,
      provider,
      "Slack議論への介入判定器。今すぐAIが割り込むべきなら1、まだ様子見なら0。" +
        '必ず {"intervene": 0, "reason": "短い日本語"} だけ返す。',
      `発言ログ:\n${(summary || "").slice(0, 4000)}`,
    );
    const data = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as {
      intervene?: number | boolean | string;
      reason?: string;
    };
    const raw = data.intervene;
    const yes = raw === 1 || raw === true || String(raw).trim() === "1";
    return { yes, reason: String(data.reason || (yes ? "介入する" : "まだ介入不要")) };
  } catch {
    return needsIntervention(summary);
  }
}

/** Roomi one-liner via remote LLM when configured, else dummy. Never throws. */
export async function roomiLine(
  env: LlmEnv,
  provider: string,
  history: string,
  people: Array<{ name?: string; user_id?: string; role?: string; interests?: string }>,
  reason: string,
): Promise<string> {
  if (provider !== "xai" && provider !== "openai" && provider !== "openai-compatible")
    return roomiReply(history, people, reason);
  try {
    const roster =
      people
        .slice(0, 20)
        .map((p) => `- @${p.name || p.user_id} (${p.user_id}) ${p.role || "関係者"}: ${p.interests || ""}`)
        .join("\n") || "- 名前なし";
    const out = await chatCompletions(
      env,
      provider,
      "あなたはSlackにいる「Roomi」。短く、やさしく、はっきり話す。まとめ・箇条書き・JSON禁止。" +
        "いま止まっている一点だけを問う。使える名前はリストだけ。1〜4文の日本語だけ返す。\n" + roster,
      `介入理由: ${reason || "議論が噛み合っていない"}\n\n発言ログ:\n${history.slice(0, 5000)}\n\nRoomiとして次の一言:`,
    );
    return out.trim() || roomiReply(history, people, reason);
  } catch {
    return roomiReply(history, people, reason);
  }
}

function cleanText(value: unknown, fallback = "", max = 500): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function confidence(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function method(value: unknown): DecisionMethod {
  const key = String(value || "").toLowerCase();
  if (["owner_decides", "owner", "責任者判断"].includes(key)) return "owner_decides";
  if (["consent", "no_objection", "異議なし方式"].includes(key)) return "no_objection";
  if (["unanimous", "all", "全員合意"].includes(key)) return "unanimous";
  return "required_approvals";
}

function stance(value: unknown): Stance {
  const key = String(value || "").toLowerCase();
  if (["agree", "agreed", "approved", "合意", "賛成"].includes(key)) return "agreed";
  if (["conditional", "condition", "条件付き合意", "条件あり"].includes(key)) return "conditional";
  if (["concern", "objected", "oppose", "反対", "懸念あり"].includes(key)) return "objected";
  if (["not_applicable", "out_of_scope", "対象外", "判断対象外"].includes(key)) return "not_applicable";
  return "unknown";
}

function extractJsonObject(output: string): unknown {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("agreement analysis did not contain JSON");
  return JSON.parse(output.slice(start, end + 1));
}

function agreementRole(value: unknown, required: boolean): StakeholderRole {
  const key = String(value || "").toLowerCase();
  if (key === "owner" || key === "責任者") return "owner";
  if (key === "required" || key === "必須") return "required";
  if (key === "informed" || key === "共有先") return "informed";
  return required ? "required" : "consulted";
}

function directEvidence(messages: AgreementMessage[], userId: string): AgreementMessage[] {
  return messages.filter((message) => {
    if (message.user_id !== userId) return false;
    const text = message.text.trim();
    if (!text || /^>/.test(text)) return false;
    return !/(?:代理|引用|とのこと|と言って(?:いた|る)|と聞いて(?:いる|います))/u.test(text);
  });
}

function fallbackAgreement(messages: AgreementMessage[], candidates: AgreementCandidate[], previousProposal = ""): AgreementAnalysis {
  const history = messages.map((message) => `${message.user_name || message.user_id}: ${message.text}`).join("\n");
  const latestText = messages.at(-1)?.text || "";
  const explicitOtherTopic = /清掃|掃除|ゴミ|騒音|消灯|予約|障害|不具合|担当者|当番/.test(latestText);
  const breakfast = /朝食|キッチン|炊飯器|A棟|B棟|BASE/i.test(latestText) ||
    (!explicitOtherTopic && /朝食|キッチン|炊飯器|A棟|B棟|BASE/i.test(history));
  const decisionSignal = /決め|どうする|案|提案|賛成|反対|合意|承認|ください|使うべき|続けたい|専用|未定|相談|移す|試す|実験|運用|会場|やっぱり|考えませんか/.test(history);
  const resolvedOnly = /対応完了|解決済み|決まりました|決定しました/.test(latestText) && !/[?？]|提案|変更/.test(latestText);
  const changeEvidence = previousProposal
    ? messages.filter((message) => /変更|代わりに|ではなく|やめ|別案|新たな案|に移す|やっぱり|もう一度|1日.{0,16}(?:試|実験)|(?:試|実験).{0,16}(?:どう|提案)/.test(message.text))
    : [];
  const pilot = /1日|一日|試|実験/.test(history);
  const thursday = /木曜/.test(history);
  const fallbackTitle = /清掃|掃除/.test(latestText)
    ? "清掃の運用"
    : /ゴミ/.test(latestText)
      ? "ゴミ出しの運用"
      : /騒音|消灯/.test(latestText)
        ? "共用部の騒音ルール"
        : /予約/.test(latestText)
          ? "共用設備の予約ルール"
          : /障害|不具合/.test(latestText)
            ? "障害対応"
            : /担当者|当番/.test(latestText)
              ? "担当者の決定"
              : cleanText(latestText, "次の方針", 80);
  const latestProposal = /(?:A棟)?1階.{0,30}(?:続けたい|使いたい)/.test(latestText)
    ? "学生の朝食会場をA棟1階で継続する"
    : /(?:A棟)?2階.{0,30}(?:試す|にする|使う)/.test(latestText)
      ? "学生の朝食会場をA棟2階で試す"
      : /B棟.{0,30}(?:変更|移す|にする|使う)/i.test(latestText)
        ? "学生の朝食会場をB棟へ移す"
        : /BASE.{0,30}(?:試す|実験|運用)/i.test(latestText)
          ? `${/木曜/.test(latestText) ? "木曜日に" : ""}BASEで1日朝食運用を試し、影響と負担を確認する`
      : "";
  const proposal = breakfast
    ? latestProposal || (pilot
      ? `${thursday ? "木曜日に" : ""}BASEで1日朝食運用を試し、影響と負担を確認する`
      : /A棟2階|２階/.test(history)
        ? "学生の朝食会場をA棟2階へ移す"
        : /B棟|ｂ棟|b棟/i.test(history)
          ? "学生の朝食会場をB棟へ移す"
          : "学生の朝食会場と利用条件を決める")
    : cleanText(history.split("\n").at(-1)?.replace(/^[^:：]+[:：]\s*/, ""), "この議論の次の方針を決める", 240);
  const ownerMessage = [...messages].reverse().find((message) => /責任者|決裁者|最終判断者/.test(message.text));
  const ownerFromConversation = ownerMessage
    ? candidates.find((person) =>
      (/私が.{0,12}(?:責任者|決裁|最終判断)/.test(ownerMessage.text) && person.user_id === ownerMessage.user_id) ||
      ownerMessage.text.includes(`<@${person.user_id}>`) ||
      Boolean(person.name && ownerMessage.text.includes(person.name)))
    : null;
  const explicitOwners = candidates.filter((person) => /責任者|決裁|最終判断/.test(person.role || ""));
  const owner = ownerFromConversation || explicitOwners[0] || null;
  const staffRepresentative = candidates.find((person) => /スタッフ/.test(person.role || "") && !/学生/.test(person.role || "")) ||
    candidates.find((person) => /寮|運営|スタッフ/.test(person.role || ""));
  const studentRepresentative = candidates.find((person) => /寮運営|学生自治/.test(person.role || "")) ||
    candidates.find((person) => /学生/.test(person.role || "") && /代表|整理|調整/.test(person.interests || "")) ||
    candidates.find((person) => /学生/.test(person.role || ""));
  const requiredIds = new Set([staffRepresentative?.user_id, studentRepresentative?.user_id].filter((id): id is string => Boolean(id)));
  const participants = candidates.slice(0, 30).map((person) => {
    const ownMessages = directEvidence(messages, person.user_id);
    let inferredStance: Stance = "unknown";
    let condition = "";
    let evidenceMessages: AgreementMessage[] = [];
    const required = requiredIds.has(person.user_id);
    let personConfidence = required ? 0.84 : ownMessages.length ? 0.7 : 0.6;
    const latestStanceMessage = [...ownMessages].reverse().find((message) =>
      /反対|懸念|納得できない|難しい|現状維持|続けたい|条件|であれば|なら|ただし|賛成|合意|問題ない|この案で|進めよう|進めたい|提案|試したい/.test(message.text),
    );
    const stanceText = latestStanceMessage?.text || "";
    if (/反対|懸念|納得できない|難しい|現状維持|続けたい/.test(stanceText)) {
      inferredStance = "objected";
      condition = stanceText;
      evidenceMessages = latestStanceMessage ? [latestStanceMessage] : [];
      personConfidence = 0.9;
    } else if (/条件|であれば|なら|ただし/.test(stanceText) ||
      (pilot && thursday && /木曜.{0,20}(?:良い|いい|タイミング)|(?:良い|いい).{0,20}木曜/.test(stanceText))) {
      inferredStance = "conditional";
      condition = stanceText;
      evidenceMessages = latestStanceMessage ? [latestStanceMessage] : [];
      personConfidence = 0.88;
    } else if (/(?:賛成|合意|問題ない|この案で(?:いい|良い)|進め(?:よう|たい))/.test(stanceText) ||
      (pilot && /(?:提案|試したい|試そう)/.test(stanceText))) {
      inferredStance = "agreed";
      evidenceMessages = latestStanceMessage ? [latestStanceMessage] : [];
      personConfidence = 0.9;
    }
    const participantRole: StakeholderRole = owner?.user_id === person.user_id ? "owner" : required ? "required" : "consulted";
    return {
      user_id: person.user_id,
      user_name: cleanText(person.name, person.user_id, 120),
      role: cleanText(person.role, "関係者", 120),
      agreement_role: participantRole,
      required,
      stance: inferredStance,
      condition,
      evidence: cleanText(evidenceMessages.at(-1)?.text, "会話中に本人の明示的な立場がない", 300),
      evidence_message_ids: evidenceMessages.map((message) => message.id),
      confidence: personConfidence,
      sensitive: false,
    };
  });
  return {
    is_decision: decisionSignal && !resolvedOnly,
    proposal_changed: changeEvidence.length > 0,
    proposal_change_evidence_message_ids: changeEvidence.map((message) => message.id),
    decision: {
      title: breakfast ? (pilot ? "朝食会場の試行運用" : "朝食会場と利用条件") : fallbackTitle,
      proposal,
      method: breakfast ? "required_approvals" : "owner_decides",
      method_reason: breakfast
        ? "居住環境と学生運用の両方へ影響するため、影響を受ける代表者の確認が必要"
        : "最終責任者を確認して判断を進める",
      method_confidence: breakfast ? 0.88 : 0.62,
      owner_user_id: owner?.user_id || null,
      owner_role: owner?.role || (breakfast ? "寮運営責任者" : "最終判断者"),
      owner_confidence: ownerFromConversation ? 0.92 : owner ? 0.86 : 0.35,
      deadline: thursday ? "木曜日の試行前" : null,
      evidence: cleanText(history, "会話ログなし", 500),
      evidence_message_ids: messages.slice(-5).map((message) => message.id),
      confidence: breakfast ? 0.9 : 0.58,
      sensitive: false,
    },
    participants,
    confidence: breakfast ? 0.88 : 0.58,
    sensitive: false,
  };
}

function normalizeAgreement(raw: unknown, messages: AgreementMessage[], candidates: AgreementCandidate[], previousProposal = ""): AgreementAnalysis {
  const fallback = fallbackAgreement(messages, candidates, previousProposal);
  if (!raw || typeof raw !== "object") return fallback;
  const source = raw as Record<string, unknown>;
  const decisionSource = source.decision && typeof source.decision === "object"
    ? source.decision as Record<string, unknown>
    : {};
  const byId = new Map(candidates.filter((person) => person.user_id).map((person) => [person.user_id, person]));
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const seen = new Set<string>();
  const participants = (Array.isArray(source.participants) ? source.participants : [])
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const participant = item as Record<string, unknown>;
      const userId = cleanText(participant.user_id, "", 120);
      const candidate = byId.get(userId);
      if (!candidate || seen.has(userId)) return [];
      seen.add(userId);
      const evidenceMessageIds = (Array.isArray(participant.evidence_message_ids) ? participant.evidence_message_ids : [])
        .filter((id): id is string => typeof id === "string")
        .filter((id) => directEvidence(messages, userId).some((message) => message.id === id));
      const inferredStance = stance(participant.stance);
      const groundedStance = inferredStance === "unknown" || evidenceMessageIds.length > 0 ? inferredStance : "unknown";
      const required = bool(participant.required);
      return [{
        user_id: userId,
        user_name: cleanText(candidate.name, userId, 120),
        role: cleanText(candidate.role, "関係者", 120),
        agreement_role: agreementRole(participant.role, required),
        required,
        stance: groundedStance,
        condition: groundedStance === "conditional" ? cleanText(participant.condition, "", 300) : "",
        evidence: evidenceMessageIds.map((id) => messageById.get(id)?.text || "").filter(Boolean).join("\n").slice(0, 500) || "会話中に本人の明示的な根拠がない",
        evidence_message_ids: evidenceMessageIds,
        confidence: confidence(participant.confidence, 0.5),
        sensitive: bool(participant.sensitive),
      }];
    });
  const ownerUserId = cleanText(decisionSource.owner_user_id, "", 120);
  const decisionEvidenceIds = (Array.isArray(decisionSource.evidence_message_ids) ? decisionSource.evidence_message_ids : [])
    .filter((id): id is string => typeof id === "string" && messageById.has(id));
  const sensitive = bool(source.sensitive) || bool(decisionSource.sensitive) || participants.some((p) => p.sensitive);
  return {
    is_decision: bool(source.is_decision, fallback.is_decision),
    proposal_changed: bool(source.proposal_changed, fallback.proposal_changed) && (Array.isArray(source.proposal_change_evidence_message_ids)
      ? source.proposal_change_evidence_message_ids.some((id) => typeof id === "string" && messageById.has(id))
      : fallback.proposal_change_evidence_message_ids.length > 0),
    proposal_change_evidence_message_ids: (Array.isArray(source.proposal_change_evidence_message_ids)
      ? source.proposal_change_evidence_message_ids.filter((id): id is string => typeof id === "string" && messageById.has(id))
      : fallback.proposal_change_evidence_message_ids),
    decision: {
      title: cleanText(decisionSource.title, fallback.decision.title, 160),
      proposal: cleanText(decisionSource.proposal, fallback.decision.proposal, 500),
      method: method(decisionSource.method),
      method_reason: cleanText(decisionSource.method_reason, fallback.decision.method_reason, 300),
      method_confidence: confidence(decisionSource.method_confidence, 0.5),
      owner_user_id: byId.has(ownerUserId) ? ownerUserId : null,
      owner_role: cleanText(decisionSource.owner_role, fallback.decision.owner_role, 120),
      owner_confidence: byId.has(ownerUserId) ? confidence(decisionSource.owner_confidence, 0.5) : 0,
      deadline: cleanText(decisionSource.deadline, "", 120) || null,
      evidence: cleanText(decisionSource.evidence, fallback.decision.evidence, 500),
      evidence_message_ids: decisionEvidenceIds.length ? decisionEvidenceIds : fallback.decision.evidence_message_ids,
      confidence: confidence(decisionSource.confidence, 0.5),
      sensitive,
    },
    participants: participants.length ? participants : fallback.participants,
    confidence: confidence(source.confidence, 0.5),
    sensitive,
  };
}

/** Extract the decision, agreement rule and each known person's stance. Never throws. */
export async function analyzeAgreement(
  env: LlmEnv,
  provider: string,
  messages: AgreementMessage[],
  candidates: AgreementCandidate[],
  previousProposal = "",
): Promise<AgreementAnalysis> {
  const fallback = fallbackAgreement(messages, candidates, previousProposal);
  if (provider !== "xai" && provider !== "openai" && provider !== "openai-compatible") return fallback;
  try {
    const roster = candidates
      .slice(0, 30)
      .map((person) => `- ${person.user_id} | ${person.name || "名前不明"} | ${person.role || "役割不明"} | ${person.interests || ""}`)
      .join("\n");
    const history = messages
      .slice(-80)
      .map((message) => `${message.id} | ${message.user_id} | ${message.user_name || message.user_id}: ${message.text}`)
      .join("\n");
    const output = await chatCompletions(
      env,
      provider,
      "Slack上の意思決定を合意形成の観点で分析する。名簿にないuser_idを作らない。無回答はunknownで、反対や合意にしない。" +
        "情報共有、挨拶、完了報告だけで決める対象がなければis_decision=false。提案・選択・承認・異議の収集が必要ならtrue。" +
        "本人の明示発言だけをstanceの根拠にし、引用や代理発言を本人の合意と扱わない。" +
        "名簿のrole/interestsは関係者候補の特定だけに使い、現在案へのstanceには使わない。stanceの根拠は現在スレッドの本人発言だけ。" +
        "participantのconfidenceは、その人をそのagreement roleに置く確信度を表す。" +
        "以前の案から実質変更があり、現在スレッドに明示的な変更発言がある場合だけproposal_changed=trueにし、そのmessage idを返す。単なる言い換えはfalse。" +
        "methodはowner_decides|required_approvals|no_objection|unanimous、stanceはagreed|conditional|objected|unknown|not_applicableのみ。" +
        "センシティブな個人事情・人事・健康・対立ならsensitive=true。JSONオブジェクト以外は返さない。",
      `以前の案: ${previousProposal || "なし"}\n\n名簿:\n${roster || "- なし"}\n\n現在スレッドの会話:\n${history.slice(-12000)}\n\n` +
        `返却形式:{"is_decision":true,"proposal_changed":false,"proposal_change_evidence_message_ids":[],"decision":{"title":"","proposal":"","method":"required_approvals","method_reason":"","method_confidence":0,"owner_user_id":null,"owner_role":"","owner_confidence":0,"deadline":null,"evidence":"","evidence_message_ids":[""],"confidence":0,"sensitive":false},` +
        `"participants":[{"user_id":"","role":"required","required":true,"stance":"unknown","condition":"","evidence":"","evidence_message_ids":[""],"confidence":0,"sensitive":false}],"confidence":0,"sensitive":false}`,
    );
    return normalizeAgreement(extractJsonObject(output), messages, candidates, previousProposal);
  } catch {
    return fallback;
  }
}
