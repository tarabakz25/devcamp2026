export type SlackMessage = {
  ts?: string;
  thread_ts?: string;
  user?: string;
  text?: string;
  subtype?: string;
  bot_id?: string;
};

export type SlackUserProfile = {
  id: string;
  name: string;
  title: string;
  avatar: string;
};

type SlackEnvelope = { ok?: boolean; error?: string; response_metadata?: { next_cursor?: string } };

export function escapeSlackText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function slackApi<T extends SlackEnvelope>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Slack ${method} HTTP ${response.status}`);
  const payload = await response.json<T>();
  if (!payload.ok) throw new Error(`Slack ${method}: ${payload.error || "unknown_error"}`);
  return payload;
}

export async function getConversationReplies(token: string, channel: string, rootTs: string): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  const startedAt = Date.now();
  let cursor = "";
  do {
    const page = await slackApi<SlackEnvelope & { messages?: SlackMessage[] }>(token, "conversations.replies", {
      channel,
      ts: rootTs,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    messages.push(...(page.messages || []));
    cursor = page.response_metadata?.next_cursor || "";
  } while (cursor && messages.length < 500 && Date.now() - startedAt < 6_000);
  return messages;
}

export async function getConversationMembers(token: string, channel: string): Promise<string[]> {
  const members: string[] = [];
  let cursor = "";
  do {
    const page = await slackApi<SlackEnvelope & { members?: string[] }>(token, "conversations.members", {
      channel,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    members.push(...(page.members || []).filter((member) => typeof member === "string"));
    cursor = page.response_metadata?.next_cursor || "";
  } while (cursor && members.length < 1_000);
  return [...new Set(members)];
}

export async function getSlackUser(token: string, userId: string): Promise<SlackUserProfile> {
  const payload = await slackApi<SlackEnvelope & {
    user?: { id?: string; name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string; title?: string; image_72?: string } };
  }>(token, "users.info", { user: userId });
  if (!payload.user?.id) throw new Error("Slack users.info returned no user");
  const profile = payload.user.profile;
  return {
    id: payload.user.id,
    name: profile?.display_name || profile?.real_name || payload.user.real_name || payload.user.name || payload.user.id,
    title: profile?.title || "",
    avatar: profile?.image_72 || "",
  };
}

export async function postSlackMessage(
  token: string,
  channel: string,
  text: string,
  options: { threadTs?: string; blocks?: unknown[] } = {},
): Promise<{ channel: string; ts: string }> {
  const payload = await slackApi<SlackEnvelope & { channel?: string; ts?: string }>(token, "chat.postMessage", {
    channel,
    text,
    ...(options.threadTs ? { thread_ts: options.threadTs } : {}),
    ...(options.blocks ? { blocks: options.blocks } : {}),
  });
  if (!payload.channel || !payload.ts) throw new Error("Slack chat.postMessage returned no message id");
  return { channel: payload.channel, ts: payload.ts };
}

export async function openSlackDm(token: string, userId: string): Promise<string> {
  const payload = await slackApi<SlackEnvelope & { channel?: { id?: string } }>(token, "conversations.open", { users: userId });
  if (!payload.channel?.id) throw new Error("Slack conversations.open returned no channel");
  return payload.channel.id;
}
