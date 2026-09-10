// LLM: dummy (rule-based, ported from ai_core/llm.py DummyLLM)
// + OpenAI-compatible chat (xAI/OpenAI) via fetch. No Node APIs.
export type ChatFn = (system: string, user: string) => Promise<string>;

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

export function resolveLlmName(env: Record<string, string | undefined>): string {
  const name = (env.LLM_PROVIDER || "").trim();
  if (name) return name;
  if (env.XAI_API_KEY) return "xai";
  return "dummy";
}

async function chatCompletions(
  env: Record<string, string | undefined>,
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
  });
  if (!r.ok) throw new Error(`llm http ${r.status}`);
  const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || "";
}

/** Judge via remote LLM when configured, else dummy. Never throws. */
export async function judge(
  env: Record<string, string | undefined>,
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
  env: Record<string, string | undefined>,
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
