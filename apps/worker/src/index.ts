// Roomi Worker: Hono + D1. Replaces apps/bot/src/dash_server.py for Cloudflare.
// Slack Socket Mode (long-lived WS) can't run on Workers; /api/slack/events
// accepts Slack Events API (HTTP) instead.
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  auditAll,
  AgreementSnapshotConflictError,
  appendAgreementEvent,
  demoIds,
  ensureRoom,
  Env,
  getCurrentScenarioId,
  getDecision,
  getDecisionView,
  getThreadAgreementView,
  graph,
  listAudit,
  listDecisionParticipants,
  listKnownStakeholders,
  listMessages,
  listStakeholders,
  listThreadDecisions,
  playbackView,
  ROOMI_NAME,
  ROOMI_USER_ID,
  roomState,
  Row,
  saveAgentAction,
  saveAgreementSnapshot,
  switchDemoScenario,
  timeline,
  updateAgentActionStatus,
  upsertDecision,
  upsertDecisionParticipant,
} from "./db";
import {
  AgentAction,
  DecisionItem,
  detectDecisionChange,
  isDecisionSatisfied,
  selectNextAgreementAction,
  Stance,
} from "./agreement";
import {
  analyzeAgreement,
  AgreementAnalysis,
  AgreementCandidate,
  AgreementMessage,
  needsIntervention,
  resolveLlmName,
  roomiLine,
  stakeholderLine,
} from "./llm";
import { decideScoreIntervention, TopicKind } from "./communication-score";
import { getScenario, SCENARIOS } from "./seed";
import {
  escapeSlackText,
  getConversationMembers,
  getConversationReplies,
  getSlackUser,
  openSlackDm,
  postSlackMessage,
  SlackMessage,
} from "./slack";

const app = new Hono<{ Bindings: Env }>();
app.use("/*", cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"], allowMethods: ["*"], allowHeaders: ["*"] }));

function llmName(env: Env): string {
  return resolveLlmName(env);
}

function scenarioFromRequest(value: unknown, fallback: string): string | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !SCENARIOS[value]) return null;
  return value;
}

type RoomIds = ReturnType<typeof demoIds>;

function normalizedTopic(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function topicBigrams(value: string): Set<string> {
  const chars = Array.from(normalizedTopic(value));
  const grams = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.add(chars.slice(index, index + 2).join(""));
  }
  return grams;
}

function sameDecisionTopic(left: string, right: string): boolean {
  const a = normalizedTopic(left);
  const b = normalizedTopic(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const leftGrams = topicBigrams(a);
  const rightGrams = topicBigrams(b);
  const common = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  return common / Math.max(1, Math.min(leftGrams.size, rightGrams.size)) >= 0.34;
}

function sameDecisionAnalysis(decision: DecisionItem, analysis: AgreementAnalysis): boolean {
  return sameDecisionTopic(decision.decisionText, analysis.decision.title) ||
    Boolean(decision.proposal && analysis.decision.proposal && sameDecisionTopic(decision.proposal, analysis.decision.proposal));
}

function stableTopicId(value: string): string {
  let hash = 2166136261;
  for (const character of normalizedTopic(value)) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

async function canReadThread(env: Env, authorization: string, threadId: string): Promise<boolean> {
  if (env.AGREEMENT_API_TOKEN) {
    return constantTimeEqual(authorization, `Bearer ${env.AGREEMENT_API_TOKEN}`);
  }
  return threadId === demoIds(env).threadId;
}

async function claimSlackReceipt(
  db: D1Database,
  id: string,
  kind: "event" | "interaction",
): Promise<boolean> {
  const inserted = await db.prepare(
    "INSERT OR IGNORE INTO slack_receipts (id, kind, status, created_at, updated_at) " +
      "VALUES (?, ?, 'processing', datetime('now'), datetime('now'))",
  ).bind(id, kind).run();
  if (Number(inserted.meta.changes || 0) === 1) return true;
  const reclaimed = await db.prepare(
    "UPDATE slack_receipts SET status='processing', error=NULL, updated_at=datetime('now') " +
      "WHERE id=? AND kind=? AND (status='failed' OR " +
      "(status='processing' AND updated_at <= datetime('now', '-45 seconds')))",
  ).bind(id, kind).run();
  return Number(reclaimed.meta.changes || 0) === 1;
}

async function finishSlackReceipt(
  db: D1Database,
  id: string,
  status: "processed" | "failed",
  error?: unknown,
): Promise<void> {
  await db.prepare(
    "UPDATE slack_receipts SET status=?, error=?, updated_at=datetime('now') WHERE id=? AND status='processing'",
  ).bind(status, error == null ? null : String(error).slice(0, 1000), id).run();
}

function interactionReceiptId(payload: Parameters<typeof processAgreementInteraction>[1]): string {
  const action = payload.actions?.[0];
  const timestamp = payload.action_ts || payload.container?.message_ts || payload.message?.ts || "unknown";
  return `interaction:${payload.user?.id || "unknown"}:${timestamp}:${action?.action_id || "unknown"}:${stableTopicId(action?.value || "")}`;
}

async function saveMessage(
  db: D1Database,
  ids: RoomIds,
  userId: string,
  text: string,
  source: { id?: string; ts?: string; isMention?: boolean } = {},
): Promise<Row> {
  const ts = source.ts || String(Date.now() / 1000);
  const id = source.id || crypto.randomUUID();
  const holder = await db
    .prepare("SELECT user_name, role FROM stakeholders WHERE thread_id = ? AND user_id = ?")
    .bind(ids.threadId, userId)
    .first<{ user_name: string; role: string }>();
  const mention = source.isMention || /@roomi/i.test(text) ? 1 : 0;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO channels (id, name) VALUES (?, ?)").bind(ids.channel, ids.name),
    db.prepare("INSERT OR IGNORE INTO threads (id, channel_id) VALUES (?, ?)").bind(ids.threadId, ids.channel),
    db.prepare("INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)").bind(userId, holder?.user_name || userId),
    ...(userId === ROOMI_USER_ID
      ? []
      : [
          db
            .prepare(
              "INSERT OR IGNORE INTO stakeholders " +
                "(thread_id, user_id, user_name, role, interests, avatar, message_count) VALUES (?, ?, ?, ?, '', '', 0)",
            )
            .bind(ids.threadId, userId, holder?.user_name || userId, holder?.role || ""),
        ]),
    db.prepare(
      "INSERT OR IGNORE INTO messages (id, thread_id, channel_id, user_id, text, ts, is_mention) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, ids.threadId, ids.channel, userId, text, ts, mention),
  ]);
  return {
    id,
    user_id: userId,
    user_name: userId === ROOMI_USER_ID ? ROOMI_NAME : holder?.user_name || userId,
    role: userId === ROOMI_USER_ID ? "AI" : holder?.role || "",
    avatar: "",
    text,
    ts,
    is_bot: userId === ROOMI_USER_ID ? 1 : 0,
  };
}

async function maybeIntervene(
  db: D1Database,
  env: Env,
  ids: RoomIds,
  provider: string,
  force = false,
  source: "demo" | "slack" = "demo",
  retry = 0,
): Promise<{ intervention: Row; bot_message: Row | null; agreement: Awaited<ReturnType<typeof getThreadAgreementView>>; action: AgentAction | null }> {
  const msgs = await listMessages(db, ids.threadId);
  const humanMessages: AgreementMessage[] = msgs
    .filter((message) => String(message["user_id"]) !== ROOMI_USER_ID)
    .slice(-80)
    .map((message) => ({
      id: String(message["id"]),
      ts: String(message["ts"] || ""),
      user_id: String(message["user_id"]),
      user_name: String(message["user_name"] || message["user_id"]),
      text: String(message["text"] || ""),
    }));
  const history = humanMessages.map((message) => `${message.user_name || message.user_id}: ${message.text}`).join("\n");
  const explicitMention = /@roomi/i.test(humanMessages.at(-1)?.text || "");
  const legacyDecision = needsIntervention(history.slice(-5000));
  const latestIntervention = await db.prepare(
    "SELECT created_at FROM interventions WHERE thread_id = ? AND action = 'agreement' ORDER BY id DESC LIMIT 1",
  ).bind(ids.threadId).first<{ created_at: string }>();
  const lastInterventionAtSec = latestIntervention?.created_at
    ? Date.parse(`${latestIntervention.created_at.replace(" ", "T")}Z`) / 1000
    : null;
  const topicKind: TopicKind = /障害|不具合|事故|復旧/.test(history)
    ? "incident"
    : /決め|未定|案|提案|合意|承認|朝食|会場|使って|続けたい/.test(history)
      ? "decision"
      : "discussion";
  const ruleRow = await db.prepare(
    "SELECT cooldown_sec FROM intervention_rules WHERE channel_id IN ('*', ?) ORDER BY CASE channel_id WHEN '*' THEN 1 ELSE 0 END LIMIT 1",
  ).bind(ids.channel).first<{ cooldown_sec: number }>();
  const cooldownSec = ruleRow?.cooldown_sec ?? 0;
  const scoreDecision = decideScoreIntervention({
    topicKind,
    messages: humanMessages.map((message) => ({ userId: message.user_id, text: message.text })),
    nowSec: Date.now() / 1000,
    lastInterventionAtSec,
    cooldownSec,
  });
  const shouldSpeak = force || explicitMention || scoreDecision.respond;
  const currentPeople: AgreementCandidate[] = (await listStakeholders(db, ids.threadId)).map((p) => ({
    name: String(p["user_name"] || ""),
    user_id: String(p["user_id"] || ""),
    role: String(p["role"] || ""),
    interests: String(p["interests"] || ""),
  }));
  const knownPeople = await listKnownStakeholders(db, ids.threadId, source === "slack");
  let channelMembers = new Set(currentPeople.map((person) => person.user_id));
  if (source === "slack" && env.SLACK_BOT_TOKEN) {
    try {
      channelMembers = new Set(await getConversationMembers(env.SLACK_BOT_TOKEN, ids.channel));
    } catch (error) {
      console.warn(JSON.stringify({
        event: "slack_member_sync_failed",
        threadId: ids.threadId,
        error: String(error),
      }));
    }
  }
  const candidates = new Map(currentPeople.map((person) => [person.user_id, person]));
  for (const person of knownPeople.slice(0, 50)) {
    if (source === "slack" && !/^[UW][A-Z0-9]+$/.test(person.userId)) continue;
    if (source === "slack" && !channelMembers.has(person.userId)) continue;
    if (!candidates.has(person.userId)) {
      candidates.set(person.userId, { user_id: person.userId, name: person.userName, role: person.roles.join(" / ") });
    }
  }
  const existingDecisions = await listThreadDecisions(db, ids.threadId);
  const recentDecision = existingDecisions[0] || null;
  let analysis = await analyzeAgreement(
    env,
    provider,
    humanMessages,
    [...candidates.values()],
    recentDecision?.proposal || "",
  );
  let previous = existingDecisions.find((decision) =>
    sameDecisionAnalysis(decision, analysis),
  ) || null;
  if (previous && recentDecision && previous.id !== recentDecision.id) {
    analysis = await analyzeAgreement(
      env,
      provider,
      humanMessages,
      [...candidates.values()],
      previous.proposal,
    );
    previous = existingDecisions.find((decision) =>
      sameDecisionAnalysis(decision, analysis),
    ) || null;
  }
  if (!analysis.is_decision && !shouldSpeak) {
    return {
      intervention: {
        should_act: false,
        intervene: 0,
        action: "silent",
        reason: "意思決定を要する会話ではない",
        confidence: analysis.confidence,
        impact: 0,
        summary: "",
        text: "",
      },
      bot_message: null,
      agreement: await getThreadAgreementView(db, ids.threadId),
      action: null,
    };
  }
  if (!analysis.is_decision) {
    const reason = scoreDecision.respond ? scoreDecision.reason : legacyDecision.reason;
    const people = [...candidates.values()];
    const text = await roomiLine(env, provider, history.slice(-5000), people, reason);
    const bot = source === "demo" ? await saveMessage(db, ids, ROOMI_USER_ID, text) : null;
    await db
      .prepare(
        "INSERT INTO interventions (thread_id, reason, confidence, impact, action, created_at) " +
          "VALUES (?, ?, ?, 1, 'reply', datetime('now'))",
      )
      .bind(ids.threadId, reason, Math.max(scoreDecision.score.confidence, explicitMention ? 0.99 : 0))
      .run();
    return {
      intervention: {
        should_act: true,
        intervene: 1,
        action: "reply",
        reason,
        confidence: Math.max(scoreDecision.score.confidence, explicitMention ? 0.99 : 0),
        impact: 1,
        summary: "",
        text,
      },
      bot_message: bot,
      agreement: await getThreadAgreementView(db, ids.threadId),
      action: null,
    };
  }
  const changed = previous
    ? analysis.proposal_changed &&
      analysis.proposal_change_evidence_message_ids.includes(humanMessages.at(-1)?.id || "") &&
      detectDecisionChange(previous.proposal, analysis.decision.proposal)
    : false;
  const effectiveProposal = previous && !changed ? previous.proposal : analysis.decision.proposal;
  const proposalVersion = previous ? previous.proposalVersion + (changed ? 1 : 0) : 1;
  const threshold = Number.isFinite(Number(env.AGREEMENT_AUTO_ACTION_MIN_CONFIDENCE))
    ? Math.max(0, Math.min(1, Number(env.AGREEMENT_AUTO_ACTION_MIN_CONFIDENCE)))
    : 0.8;
  const acceptedOwner = analysis.decision.owner_confidence >= threshold ? analysis.decision.owner_user_id : null;
  const effectiveMethod = previous && !changed ? previous.method : analysis.decision.method;
  const effectiveOwner = previous && !changed ? previous.ownerUserId || acceptedOwner : acceptedOwner;
  const analyzedConfidence = Math.min(
    analysis.confidence,
    analysis.decision.confidence,
    analysis.decision.method_confidence,
  );
  const effectiveConfidence = previous && !changed
    ? Math.min(previous.confidence, analyzedConfidence)
    : analyzedConfidence;
  const effectiveDeadline = previous && !changed
    ? previous.deadline || analysis.decision.deadline
    : analysis.decision.deadline;
  const previousParticipants = previous ? await listDecisionParticipants(db, previous.id) : [];
  const previousByUser = new Map(previousParticipants.map((participant) => [participant.userId, participant]));
  const threadUserIds = new Set(humanMessages.map((message) => message.user_id));
  let versionStartMessageId: string | null = null;
  if (changed) {
    versionStartMessageId = [...analysis.proposal_change_evidence_message_ids].reverse().find((id) =>
      humanMessages.some((message) => message.id === id),
    ) || null;
  } else if (previous && previous.proposalVersion > 1) {
    const versionStart = await db.prepare(
      "SELECT message_id FROM agreement_events WHERE decision_id=? AND proposal_version=? " +
        "AND event_type='proposal_changed' ORDER BY created_at DESC LIMIT 1",
    ).bind(previous.id, previous.proposalVersion).first<{ message_id: string | null }>();
    versionStartMessageId = versionStart?.message_id || null;
  }
  const versionStartIndex = versionStartMessageId
    ? Math.max(0, humanMessages.findIndex((message) => message.id === versionStartMessageId))
    : 0;
  const messageById = new Map(humanMessages.map((message, index) => [message.id, { message, index }]));
  const participantInputs = analysis.participants.map((participant) => {
    const old = previousByUser.get(participant.user_id);
    const groundedEvidenceIds = participant.evidence_message_ids.filter((id) => {
      const evidence = messageById.get(id);
      return evidence != null && evidence.index >= versionStartIndex;
    });
    const oldUpdatedAtMs = old ? Date.parse(old.updatedAt) : Number.POSITIVE_INFINITY;
    const hasNewDirectStance = Boolean(
      old &&
      participant.stance !== "unknown" &&
      groundedEvidenceIds.some((id) => {
        const messageTs = Number(messageById.get(id)?.message.ts || 0) * 1000;
        return Number.isFinite(messageTs) && messageTs > oldUpdatedAtMs;
      }),
    );
    const preserveExplicitResponse = !changed && old?.contactState === "responded" && !hasNewDirectStance;
    const analyzedStance = participant.stance === "unknown" || groundedEvidenceIds.length === 0
      ? "unknown" as const
      : participant.stance;
    const agreementRole = effectiveOwner === participant.user_id
      ? "owner" as const
      : old && !changed
        ? old.role
        : participant.agreement_role === "owner"
        ? participant.required ? "required" as const : "consulted" as const
        : participant.agreement_role;
    return {
      userId: participant.user_id,
      userName: participant.user_name,
      role: agreementRole,
      stance: preserveExplicitResponse ? old.stance : analyzedStance,
      stanceSource: preserveExplicitResponse ? old.stanceSource : "analysis" as const,
      condition: preserveExplicitResponse ? old.condition : analyzedStance === "conditional" ? participant.condition || null : null,
      conditionResolution: preserveExplicitResponse ? old.conditionResolution : null,
      evidenceMessageIds: preserveExplicitResponse ? old.evidenceMessageIds : groundedEvidenceIds,
      confidence: participant.confidence,
      contactState: changed ? "not_contacted" as const : old?.contactState || "not_contacted" as const,
      contactMode: threadUserIds.has(participant.user_id) ? "thread" as const : "dm" as const,
    };
  });
  const decisionId = previous?.id || `decision:${ids.threadId}:${stableTopicId(analysis.decision.title)}`;
  let snapshot: Awaited<ReturnType<typeof saveAgreementSnapshot>>;
  try {
    snapshot = await saveAgreementSnapshot(
      db,
      {
      id: decisionId,
      threadId: ids.threadId,
      decisionText: analysis.decision.title,
      proposal: effectiveProposal,
      proposalVersion,
      method: effectiveMethod,
      status: changed
        ? "reopened"
        : previous?.status === "decided" || previous?.status === "ready"
          ? previous.status
          : "gathering",
      ownerUserId: effectiveOwner,
      deadline: effectiveDeadline,
      evidenceMessageIds: analysis.decision.evidence_message_ids,
      confidence: effectiveConfidence,
      expectedSnapshotToken: previous?.snapshotToken ?? null,
      createdAt: previous?.createdAt,
      },
      participantInputs,
      !previous || changed ? {
      id: `agreement:${decisionId}:v${proposalVersion}:${changed ? "proposal_changed" : "decision_created"}`,
      type: changed ? "proposal_changed" : "decision_created",
      actorUserId: null,
      participantUserId: null,
      messageId: humanMessages.at(-1)?.id || null,
      payload: {
        sensitive: analysis.sensitive,
        methodReason: analysis.decision.method_reason,
        ownerCandidateRole: analysis.decision.owner_role,
        ownerCandidateUserId: analysis.decision.owner_user_id,
        ownerConfidence: analysis.decision.owner_confidence,
      },
      } : undefined,
    );
  } catch (error) {
    if (error instanceof AgreementSnapshotConflictError && retry < 1) {
      return maybeIntervene(db, env, ids, provider, force, source, retry + 1);
    }
    throw error;
  }
  if (analysis.sensitive) {
    await appendAgreementEvent(db, {
      id: `agreement:${decisionId}:v${proposalVersion}:sensitive:${humanMessages.at(-1)?.id || "analysis"}`,
      decisionId,
      proposalVersion,
      type: "manual_correction",
      actorUserId: null,
      participantUserId: null,
      messageId: humanMessages.at(-1)?.id || null,
      payload: { sensitive: true, source: "agreement_analysis" },
    });
  }
  const persistedSensitive = analysis.sensitive || Boolean(await db.prepare(
    "SELECT 1 AS sensitive FROM agreement_events WHERE decision_id=? AND proposal_version=? " +
      "AND json_extract(payload_json, '$.sensitive')=1 LIMIT 1",
  ).bind(decisionId, proposalVersion).first<{ sensitive: number }>());
  const safeToFinalize = !persistedSensitive && snapshot.confidence >= threshold;
  const stateSatisfied = isDecisionSatisfied(snapshot, snapshot.participants, new Date());
  const hasTrustedBlockingGap = snapshot.gaps.some((gap) => {
    if (!gap.blocking) return false;
    const participant = snapshot.participants.find((candidate) => candidate.userId === gap.participantUserId);
    if (!participant) return snapshot.confidence >= threshold;
    return participant.stanceSource === "explicit" || participant.confidence >= threshold;
  });
  if (snapshot.status === "ready" && !stateSatisfied) {
    snapshot = { ...snapshot, ...(await upsertDecision(db, { ...snapshot, status: "gathering" })) };
    await db.prepare(
      "UPDATE agent_actions SET status='cancelled', updated_at=datetime('now') " +
        "WHERE decision_id=? AND proposal_version=? AND action_type='approve_decision' AND status='queued'",
    ).bind(decisionId, proposalVersion).run();
  } else if (previous?.status === "decided" && !changed && !stateSatisfied && hasTrustedBlockingGap) {
    snapshot = { ...snapshot, ...(await upsertDecision(db, { ...snapshot, status: "reopened" })) };
    await appendAgreementEvent(db, {
      id: `agreement:${decisionId}:v${proposalVersion}:reopened:${humanMessages.at(-1)?.id || "state"}`,
      decisionId,
      proposalVersion,
      type: "decision_reopened",
      actorUserId: null,
      participantUserId: null,
      messageId: humanMessages.at(-1)?.id || null,
      payload: { reason: "新しい条件または懸念が検出された" },
    });
  } else if (safeToFinalize && stateSatisfied && snapshot.status !== "decided") {
    snapshot = {
      ...snapshot,
      ...(await upsertDecision(db, { ...snapshot, status: "decided" })),
    };
    await appendAgreementEvent(db, {
      id: `agreement:${decisionId}:v${proposalVersion}:decided`,
      decisionId,
      proposalVersion,
      type: "decision_decided",
      actorUserId: null,
      participantUserId: null,
      messageId: humanMessages.at(-1)?.id || null,
      payload: { proposal: snapshot.proposal },
    });
  } else if (!safeToFinalize && stateSatisfied && snapshot.status !== "ready" && snapshot.status !== "decided") {
    snapshot = { ...snapshot, ...(await upsertDecision(db, { ...snapshot, status: "ready" })) };
  }
  const candidateAction = snapshot.status === "decided"
    ? null
    : selectNextAgreementAction(snapshot, snapshot.participants, snapshot.gaps);
  const hasOutstandingAction = candidateAction && snapshot.actions.some((existing) =>
    (existing.status === "sent" || (existing.status === "queued" && Boolean(existing.externalMessageId))) &&
    existing.proposalVersion === candidateAction.proposalVersion &&
    existing.participantUserId === candidateAction.participantUserId &&
    existing.kind === candidateAction.kind,
  );
  const nextAction = hasOutstandingAction ? null : candidateAction;
  const decisionJustClosed = snapshot.status === "decided" && previous?.status !== "decided";
  let action: AgentAction | null = null;
  let savedAction: AgentAction | null = null;
  let bot: Row | null = null;
  let reason = snapshot.status === "decided" ? "必要な合意がそろった" : "不足している合意はない";
  let text = snapshot.status === "decided" ? `決定: ${snapshot.proposal}` : "";
  if (nextAction) {
    const target = snapshot.participants.find((participant) => participant.userId === nextAction.participantUserId);
    const actionConfidence = Math.min(nextAction.confidence, analysis.decision.method_confidence, target?.confidence ?? 0);
    const sensitive = persistedSensitive || analysis.decision.sensitive || Boolean(analysis.participants.find((p) => p.user_id === target?.userId)?.sensitive);
    const requiresApproval = sensitive || actionConfidence < threshold || !target;
    const deliveryMode = requiresApproval ? "thread" : target.contactMode;
    const saved = await saveAgentAction(db, {
      ...nextAction,
      deliveryMode,
      confidence: actionConfidence,
      requiresApproval,
      reason: sensitive ? `[sensitive] ${nextAction.reason}` : nextAction.reason,
    });
    savedAction = saved.action;
    action = shouldSpeak ? saved.action : null;
    reason = force || explicitMention
      ? "Roomiへのメンションで合意形成を整理"
      : legacyDecision.yes
        ? legacyDecision.reason
        : scoreDecision.reason;
    const targetLabel = target ? (source === "slack" ? `<@${target.userId}>` : `@${target.userName}`) : "みんな";
    text = requiresApproval
      ? `Roomiの確認候補: 「${snapshot.decisionText}」について、${saved.action.question}\n送信前に担当者の確認が必要だよ。`
      : `${targetLabel} 「${snapshot.decisionText}」について、${saved.action.question}`;
    if (source === "demo" && shouldSpeak) {
      bot = await saveMessage(db, ids, ROOMI_USER_ID, text);
      // The demo has no Slack dispatcher, so mark the rendered message as sent
      // here. Keeping it queued makes the next human message cancel it during
      // snapshot refresh and creates the same confirmation again.
      if (savedAction) {
        const botMessageId = String(bot.id);
        const deliveredAction = await updateAgentActionStatus(db, savedAction.id, "sent", botMessageId);
        savedAction = deliveredAction || { ...savedAction, status: "sent", externalMessageId: botMessageId };
        action = savedAction;
      }
    }
  } else if (snapshot.status === "ready" && stateSatisfied && !safeToFinalize) {
    const approvalAlreadyQueued = snapshot.actions.some(
      (existing) => existing.kind === "approve_decision" && existing.status === "queued",
    );
    action = await queueDecisionApproval(db, snapshot);
    savedAction = action;
    reason = action.reason;
    text = `Roomiの最終確認候補: ${action.question}`;
    if (source === "demo" && !approvalAlreadyQueued) bot = await saveMessage(db, ids, ROOMI_USER_ID, text);
  } else if (decisionJustClosed) {
    if (source === "demo") {
      bot = await saveMessage(db, ids, ROOMI_USER_ID, text);
    } else {
      action = await queueDecisionSummary(db, snapshot);
      savedAction = action;
    }
  }
  const agreement = await getThreadAgreementView(db, ids.threadId);
  const shouldAct = Boolean(action) || decisionJustClosed;
  if (shouldAct) {
    await db
      .prepare("INSERT INTO interventions (thread_id, reason, confidence, impact, action, created_at) VALUES (?, ?, ?, ?, 'agreement', datetime('now'))")
      .bind(ids.threadId, reason, nextAction?.confidence || snapshot.confidence, 1)
      .run();
  }
  return {
    intervention: {
      should_act: shouldAct,
      intervene: shouldAct ? 1 : 0,
      action: shouldAct ? "reply" : "silent",
      reason,
      confidence: nextAction?.confidence || snapshot.confidence,
      impact: shouldAct ? 1 : 0,
      summary: analysis.decision.title,
      text: shouldAct ? text : "",
      decision_id: decisionId,
      proposal_version: proposalVersion,
      requires_approval: savedAction?.requiresApproval || false,
    },
    bot_message: bot,
    agreement,
    action,
  };
}

app.get("/health", (c) => c.json({ ok: true, llm: llmName(c.env) }));

app.get("/api/threads/:id/timeline", async (c) => {
  const threadId = c.req.param("id");
  if (!(await canReadThread(c.env, c.req.header("authorization") || "", threadId))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const rows = await timeline(c.env.DB, threadId);
  return c.json(rows);
});

app.get("/api/threads/:id/graph", async (c) => {
  const threadId = c.req.param("id");
  if (!(await canReadThread(c.env, c.req.header("authorization") || "", threadId))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const data = await graph(c.env.DB, threadId);
  return c.json(data);
});

app.get("/api/threads/:id/agreements", async (c) => {
  const threadId = c.req.param("id");
  if (!(await canReadThread(c.env, c.req.header("authorization") || "", threadId))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return c.json(await getThreadAgreementView(c.env.DB, threadId));
});

app.get("/api/audit", async (c) => {
  if (!c.env.AGREEMENT_API_TOKEN || !(await constantTimeEqual(
    c.req.header("authorization") || "",
    `Bearer ${c.env.AGREEMENT_API_TOKEN}`,
  ))) return c.json({ error: "unauthorized" }, 401);
  return c.json(await auditAll(c.env.DB));
});

app.get("/api/demo", async (c) => {
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const ids = demoIds(c.env, sid);
  return c.json(await roomState(c.env.DB, ids, llmName(c.env), sid));
});

app.post("/api/demo/messages", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { user_id?: string; text?: string };
  const userId = String(body.user_id || "");
  const text = String(body.text || "").trim();
  if (!text) return c.json({ detail: "メッセージが空" }, 400);
  if (userId === ROOMI_USER_ID) return c.json({ detail: "Roomiとしては発言できない" }, 400);
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const scenario = getScenario(sid);
  const ids = demoIds(c.env, sid);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids, sid);
  const message = await saveMessage(c.env.DB, ids, userId, text);
  const { intervention, bot_message } = await maybeIntervene(c.env.DB, c.env, ids, provider);
  return c.json({
    message,
    bot_message,
    intervention,
    channel: { id: ids.channel, name: scenario.channel_name || ids.name },
    title: scenario.title || ids.title,
    description: scenario.description || "",
    current_scenario: scenario.id,
    thread_id: ids.threadId,
    messages: await listMessages(c.env.DB, ids.threadId),
    audit: await listAudit(c.env.DB, ids.threadId),
    stakeholders: await listStakeholders(c.env.DB, ids.threadId),
    playback: await playbackView(c.env.DB, ids.threadId, sid),
    agreements: await getThreadAgreementView(c.env.DB, ids.threadId),
  });
});

app.post("/api/demo/stakeholders", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string; role?: string; interests?: string; avatar?: string };
  const name = String(body.name || "").trim();
  if (!name) return c.json({ detail: "名前が必要" }, 400);
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const ids = demoIds(c.env, sid);
  await ensureRoom(c.env.DB, ids, sid);
  const userId = `U-${Date.now().toString(36).toUpperCase()}`;
  await c.env.DB.prepare(
    "INSERT INTO stakeholders (thread_id, user_id, user_name, role, interests, avatar, message_count) VALUES (?, ?, ?, ?, ?, ?, 0)",
  )
    .bind(ids.threadId, userId, name, String(body.role || ""), String(body.interests || ""), String(body.avatar || ""))
    .run();
  return c.json({ user_id: userId, user_name: name });
});

app.delete("/api/demo/stakeholders/:userId", async (c) => {
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const ids = demoIds(c.env, sid);
  const r = await c.env.DB.prepare("DELETE FROM stakeholders WHERE thread_id = ? AND user_id = ?")
    .bind(ids.threadId, c.req.param("userId"))
    .run();
  if (!r.meta.changes) return c.json({ detail: "関係者が見つからない" }, 404);
  return c.json({ ok: true, user_id: c.req.param("userId") });
});

app.post("/api/demo/intervene", async (c) => {
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const scenario = getScenario(sid);
  const ids = demoIds(c.env, sid);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids, sid);
  const { intervention, bot_message } = await maybeIntervene(c.env.DB, c.env, ids, provider, true);
  return c.json({
    message: null,
    bot_message,
    intervention,
    channel: { id: ids.channel, name: scenario.channel_name || ids.name },
    title: scenario.title || ids.title,
    description: scenario.description || "",
    current_scenario: scenario.id,
    thread_id: ids.threadId,
    messages: await listMessages(c.env.DB, ids.threadId),
    audit: await listAudit(c.env.DB, ids.threadId),
    stakeholders: await listStakeholders(c.env.DB, ids.threadId),
    playback: await playbackView(c.env.DB, ids.threadId, sid),
    agreements: await getThreadAgreementView(c.env.DB, ids.threadId),
  });
});

app.post("/api/demo/scenario", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { scenario_id?: string };
  const scenarioId = scenarioFromRequest(body.scenario_id, "breakfast");
  if (!scenarioId) return c.json({ detail: "未知のシナリオ" }, 400);
  const scenario = SCENARIOS[scenarioId];
  const ids = demoIds(c.env, scenario.id);
  await switchDemoScenario(c.env.DB, ids, scenario.id);
  return c.json(await roomState(c.env.DB, ids, llmName(c.env), scenario.id));
});

app.post("/api/demo/play/start", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { scenario_id?: string };
  const current = await getCurrentScenarioId(c.env.DB, "demo-live");
  const sid = scenarioFromRequest(body.scenario_id, current);
  if (!sid) return c.json({ detail: "未知のシナリオ" }, 400);
  const scenario = SCENARIOS[sid];
  const ids = demoIds(c.env, scenario.id);
  await switchDemoScenario(c.env.DB, ids, scenario.id);
  await c.env.DB.prepare(
    "INSERT INTO demo_playback (thread_id, mode, idx, ai_count, updated_at) VALUES (?, 'script', 0, 0, datetime('now')) " +
      "ON CONFLICT(thread_id) DO UPDATE SET mode='script', idx=0, updated_at=datetime('now')",
  )
    .bind(ids.threadId)
    .run();
  return c.json(await roomState(c.env.DB, ids, llmName(c.env), scenario.id));
});

app.post("/api/demo/play/tick", async (c) => {
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const scenario = getScenario(sid);
  const ids = demoIds(c.env, scenario.id);
  const provider = llmName(c.env);
  await ensureRoom(c.env.DB, ids, scenario.id);
  const cur = await c.env.DB.prepare("SELECT mode, idx, ai_count FROM demo_playback WHERE thread_id = ?")
    .bind(ids.threadId)
    .first<{ mode: string; idx: number; ai_count: number }>();
  if (!cur) return c.json({ detail: "再生中じゃない" }, 400);
  if (cur.mode === "ai") {
    const people = (await listStakeholders(c.env.DB, ids.threadId))
      .filter((person) => String(person["user_id"]) !== ROOMI_USER_ID);
    const person = people[cur.ai_count];
    if (!person) {
      await c.env.DB.prepare("UPDATE demo_playback SET mode='script', ai_count=0, updated_at=datetime('now') WHERE thread_id = ?")
        .bind(ids.threadId)
        .run();
      return c.json(await roomState(c.env.DB, ids, provider, scenario.id));
    }
    const history = (await listMessages(c.env.DB, ids.threadId))
      .slice(-40)
      .map((message) => `${String(message["user_name"] || message["user_id"])}: ${String(message["text"] || "")}`)
      .join("\n");
    const text = await stakeholderLine(c.env, provider, history, {
      name: String(person["user_name"] || person["user_id"]),
      role: String(person["role"] || ""),
      interests: String(person["interests"] || ""),
    });
    const message = await saveMessage(c.env.DB, ids, String(person["user_id"]), text);
    const nextAiCount = cur.ai_count + 1;
    const nextMode = nextAiCount < people.length ? "ai" : "script";
    await c.env.DB.prepare(
      "UPDATE demo_playback SET mode=?, ai_count=?, updated_at=datetime('now') WHERE thread_id = ?",
    )
      .bind(nextMode, nextAiCount, ids.threadId)
      .run();
    return c.json({
      message,
      bot_message: null,
      intervention: {
        should_act: false,
        intervene: 0,
        action: "silent",
        reason: "ステークホルダーAIの返信",
        confidence: 1,
        impact: 0,
        summary: "",
        text: "",
      },
      channel: { id: ids.channel, name: scenario.channel_name || ids.name },
      title: scenario.title || ids.title,
      description: scenario.description || "",
      current_scenario: scenario.id,
      thread_id: ids.threadId,
      messages: await listMessages(c.env.DB, ids.threadId),
      audit: await listAudit(c.env.DB, ids.threadId),
      stakeholders: await listStakeholders(c.env.DB, ids.threadId),
      playback: await playbackView(c.env.DB, ids.threadId, scenario.id),
      agreements: await getThreadAgreementView(c.env.DB, ids.threadId),
    });
  }
  if (cur.mode !== "script") return c.json({ detail: "再生中じゃない" }, 400);
  const msgs = scenario.messages;
  if (cur.idx >= msgs.length) {
    await c.env.DB.prepare("UPDATE demo_playback SET mode='done', updated_at=datetime('now') WHERE thread_id = ?")
      .bind(ids.threadId)
      .run();
    return c.json(await roomState(c.env.DB, ids, provider, scenario.id));
  }
  const next = msgs[cur.idx];
  const message = await saveMessage(c.env.DB, ids, next.user_id, next.text);
  const { intervention, bot_message } = await maybeIntervene(c.env.DB, c.env, ids, provider);
  await c.env.DB.prepare(
    "UPDATE demo_playback SET mode=?, idx=idx+1, ai_count=?, last_intervene=?, last_reason=?, updated_at=datetime('now') WHERE thread_id = ?",
  )
    .bind(bot_message ? "ai" : "script", bot_message ? 0 : 0, intervention["intervene"] ? 1 : 0, String(intervention["reason"] || ""), ids.threadId)
    .run();
  return c.json({
    message,
    bot_message,
    intervention,
    channel: { id: ids.channel, name: scenario.channel_name || ids.name },
    title: scenario.title || ids.title,
    description: scenario.description || "",
    current_scenario: scenario.id,
    thread_id: ids.threadId,
    messages: await listMessages(c.env.DB, ids.threadId),
    audit: await listAudit(c.env.DB, ids.threadId),
    stakeholders: await listStakeholders(c.env.DB, ids.threadId),
    playback: await playbackView(c.env.DB, ids.threadId, scenario.id),
    agreements: await getThreadAgreementView(c.env.DB, ids.threadId),
  });
});

app.post("/api/demo/play/stop", async (c) => {
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const ids = demoIds(c.env, sid);
  await c.env.DB.prepare(
    "INSERT INTO demo_playback (thread_id, mode, updated_at) VALUES (?, 'stopped', datetime('now')) " +
      "ON CONFLICT(thread_id) DO UPDATE SET mode='stopped', updated_at=datetime('now')",
  )
    .bind(ids.threadId)
    .run();
  return c.json(await roomState(c.env.DB, ids, llmName(c.env), sid));
});

app.post("/api/demo/reset", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { keep_stakeholders?: boolean };
  const keep = body.keep_stakeholders ?? true;
  const sid = await getCurrentScenarioId(c.env.DB, "demo-live");
  const scenario = getScenario(sid);
  const ids = demoIds(c.env, sid);
  await ensureRoom(c.env.DB, ids, sid);
  await c.env.DB.prepare("DELETE FROM messages WHERE thread_id = ?").bind(ids.threadId).run();
  await c.env.DB.prepare("DELETE FROM interventions WHERE thread_id = ?").bind(ids.threadId).run();
  await c.env.DB.prepare("DELETE FROM decision_items WHERE thread_id = ?").bind(ids.threadId).run();
  if (!keep) {
    await c.env.DB.prepare("DELETE FROM stakeholders WHERE thread_id = ?").bind(ids.threadId).run();
    const insertStmts = scenario.stakeholders.map((p) =>
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO stakeholders (thread_id, user_id, user_name, role, interests, avatar, message_count) VALUES (?, ?, ?, ?, ?, ?, 0)",
      ).bind(ids.threadId, p.user_id, p.user_name, p.role, p.interests, p.avatar || "")
    );
    if (insertStmts.length > 0) {
      await c.env.DB.batch(insertStmts);
    }
  }
  await c.env.DB.prepare("DELETE FROM demo_playback WHERE thread_id = ?").bind(ids.threadId).run();
  return c.json(await roomState(c.env.DB, ids, llmName(c.env), sid));
});

function slackRoomIds(channel: string, rootTs: string): RoomIds {
  return {
    channel,
    ts: rootTs,
    threadId: `${channel}-${rootTs}`,
    name: channel,
    title: "Slack上の意思決定",
    description: "",
    scenarioId: "slack",
  };
}

async function ensureSlackRoom(db: D1Database, ids: RoomIds): Promise<void> {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO channels (id, name) VALUES (?, ?)").bind(ids.channel, ids.name),
    db.prepare("INSERT OR IGNORE INTO threads (id, channel_id) VALUES (?, ?)").bind(ids.threadId, ids.channel),
    db.prepare("INSERT INTO users (id, name, role) VALUES (?, ?, 'AI') ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role")
      .bind(ROOMI_USER_ID, ROOMI_NAME),
  ]);
}

function validHumanSlackMessage(message: SlackMessage): message is SlackMessage & { ts: string; user: string; text: string } {
  return Boolean(message.ts && message.user && message.text?.trim() && !message.subtype && !message.bot_id);
}

async function saveSlackProfile(db: D1Database, ids: RoomIds, profile: Awaited<ReturnType<typeof getSlackUser>>): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO users (id, name, role) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=CASE WHEN excluded.role <> '' THEN excluded.role ELSE users.role END")
      .bind(profile.id, profile.name, profile.title),
    db.prepare(
      "INSERT INTO stakeholders (thread_id, user_id, user_name, role, interests, avatar, message_count) VALUES (?, ?, ?, ?, '', ?, 0) " +
        "ON CONFLICT(thread_id, user_id) DO UPDATE SET user_name=excluded.user_name, avatar=excluded.avatar, " +
        "role=CASE WHEN stakeholders.role = '' THEN excluded.role ELSE stakeholders.role END",
    ).bind(ids.threadId, profile.id, profile.name, profile.title, profile.avatar),
  ]);
}

async function syncSlackThread(db: D1Database, token: string, ids: RoomIds, fallback: SlackMessage): Promise<void> {
  let history: SlackMessage[] = [fallback];
  try {
    const replies = await getConversationReplies(token, ids.channel, ids.ts);
    if (replies.length) history = replies;
  } catch (error) {
    console.warn(JSON.stringify({ event: "slack_history_sync_failed", threadId: ids.threadId, error: String(error) }));
  }
  const messages = history.filter(validHumanSlackMessage);
  const userIds = [...new Set(messages.map((message) => message.user))];
  const profiles = await Promise.allSettled(userIds.map((userId) => getSlackUser(token, userId)));
  for (const result of profiles) {
    if (result.status === "fulfilled") await saveSlackProfile(db, ids, result.value);
    else console.warn(JSON.stringify({ event: "slack_profile_sync_failed", threadId: ids.threadId, error: String(result.reason) }));
  }
  for (const message of messages) {
    await saveMessage(db, ids, message.user, message.text, {
      id: `slack:${ids.channel}:${message.ts}`,
      ts: message.ts,
    });
  }
}

async function captureBlockingComment(
  db: D1Database,
  decisionId: string,
  proposalVersion: number,
  userId: string,
  text: string,
  messageId: string,
): Promise<boolean> {
  const participant = (await listDecisionParticipants(db, decisionId, proposalVersion))
    .find((candidate) => candidate.userId === userId);
  if (!participant || (participant.stance !== "conditional" && participant.stance !== "objected")) return false;
  if (participant.condition && participant.conditionResolution) return false;
  const detail = text.trim().slice(0, 1000);
  const recordsResolution = Boolean(participant.condition);
  await upsertDecisionParticipant(db, {
    ...participant,
    condition: participant.condition || detail,
    conditionResolution: recordsResolution ? detail : null,
    stanceSource: "explicit",
    evidenceMessageIds: [...new Set([...participant.evidenceMessageIds, messageId])],
    contactState: "responded",
  });
  await appendAgreementEvent(db, {
    id: `agreement:${decisionId}:v${proposalVersion}:condition:${messageId}`,
    decisionId,
    proposalVersion,
    type: "condition_recorded",
    actorUserId: userId,
    participantUserId: userId,
    messageId,
    payload: {
      condition: participant.condition || detail,
      resolution: recordsResolution ? detail : null,
      phase: recordsResolution ? "resolution" : "requirement",
      source: "slack_comment",
    },
  });
  return true;
}

function stanceBlocks(action: AgentAction): unknown[] {
  const button = (label: string, stanceValue: Stance, style?: "primary" | "danger") => ({
    type: "button",
    text: { type: "plain_text", text: label, emoji: true },
    action_id: "roomi_agreement_stance",
    value: JSON.stringify({
      actionId: action.id,
      decisionId: action.decisionId,
      proposalVersion: action.proposalVersion,
      participantUserId: action.participantUserId,
      stance: stanceValue,
    }),
    ...(style ? { style } : {}),
  });
  return [{
    type: "actions",
    block_id: `roomi_agreement_${action.decisionId.slice(-80)}_${action.proposalVersion}`,
    elements: [
      button("合意", "agreed", "primary"),
      button("条件あり", "conditional"),
      button("懸念あり", "objected", "danger"),
      button("判断対象外", "not_applicable"),
    ],
  }];
}

function approvalBlocks(action: AgentAction): unknown[] {
  const value = JSON.stringify({ actionId: action.id, decisionId: action.decisionId, proposalVersion: action.proposalVersion });
  return [{
    type: "actions",
    block_id: `roomi_approval_${action.id.slice(-100)}`,
    elements: [
      { type: "button", text: { type: "plain_text", text: "確認を送る", emoji: true }, style: "primary", action_id: "roomi_agreement_action_approve", value },
      { type: "button", text: { type: "plain_text", text: "見送る", emoji: true }, action_id: "roomi_agreement_action_skip", value },
    ],
  }];
}

async function claimQueuedAction(db: D1Database, actionId: string): Promise<boolean> {
  const result = await db.prepare(
    "UPDATE agent_actions SET status = 'sent', updated_at = datetime('now') WHERE id = ? AND status = 'queued' " +
      "AND EXISTS (SELECT 1 FROM decision_items WHERE id = agent_actions.decision_id " +
      "AND proposal_version = agent_actions.proposal_version " +
      "AND snapshot_token = agent_actions.snapshot_token " +
      "AND (status <> 'decided' OR agent_actions.action_type = 'announce_decision'))",
  )
    .bind(actionId)
    .run();
  return Number(result.meta.changes || 0) === 1;
}

async function dispatchAgreementAction(db: D1Database, env: Env, ids: RoomIds, action: AgentAction): Promise<void> {
  if (env.AGREEMENT_AUTO_ACTIONS !== "true" || !env.SLACK_BOT_TOKEN) return;
  if (action.requiresApproval) {
    const reserved = await db.prepare(
      "UPDATE agent_actions SET external_message_id = 'approval-pending', updated_at = datetime('now') WHERE id = ? AND status = 'queued' " +
        "AND external_message_id IS NULL AND EXISTS (SELECT 1 FROM decision_items " +
        "WHERE id = agent_actions.decision_id AND proposal_version = agent_actions.proposal_version " +
        "AND snapshot_token = agent_actions.snapshot_token AND status <> 'decided')",
    ).bind(action.id).run();
    if (Number(reserved.meta.changes || 0) !== 1) return;
    let approvalPosted = false;
    try {
      const sensitive = action.reason.startsWith("[sensitive]");
      const target = action.participantUserId ? `<@${action.participantUserId}>` : "宛先未確定";
      const text = sensitive
        ? "Roomiがセンシティブな合意確認候補を作ったよ。内容の公開前に人の承認が必要。"
        : `Roomiの確認候補（要承認）\n宛先: ${target}\n質問: ${escapeSlackText(action.question)}`;
      const posted = await postSlackMessage(env.SLACK_BOT_TOKEN, ids.channel, text, { threadTs: ids.ts, blocks: approvalBlocks(action) });
      approvalPosted = true;
      await db.prepare("UPDATE agent_actions SET external_message_id = ?, updated_at = datetime('now') WHERE id = ? AND status = 'queued'")
        .bind(posted.ts, action.id).run();
    } catch (error) {
      if (!approvalPosted) {
        await db.prepare("UPDATE agent_actions SET external_message_id = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'queued'")
          .bind(action.id).run();
      }
      console.error(JSON.stringify({
        event: approvalPosted ? "agreement_approval_prompt_sent_unrecorded" : "agreement_approval_prompt_failed",
        actionId: action.id,
        error: String(error),
      }));
    }
    return;
  }
  if (!(await claimQueuedAction(db, action.id))) return;
  if (action.kind === "announce_decision") {
    let delivered = false;
    try {
      const text = escapeSlackText(action.question);
      const posted = await postSlackMessage(env.SLACK_BOT_TOKEN, ids.channel, text, { threadTs: ids.ts });
      delivered = true;
      await updateAgentActionStatus(db, action.id, "sent", posted.ts);
      await saveMessage(db, ids, ROOMI_USER_ID, text, {
        id: `slack:${ids.channel}:${posted.ts}`,
        ts: posted.ts,
      });
      await appendAgreementEvent(db, {
        id: `${action.id}:sent`,
        decisionId: action.decisionId,
        proposalVersion: action.proposalVersion,
        type: "action_sent",
        actorUserId: ROOMI_USER_ID,
        participantUserId: null,
        messageId: posted.ts,
        payload: { deliveryMode: "thread", action: "announce_decision" },
      });
    } catch (error) {
      if (!delivered) await updateAgentActionStatus(db, action.id, "failed");
      console.error(JSON.stringify({
        event: delivered ? "decision_summary_sent_unrecorded" : "decision_summary_failed",
        actionId: action.id,
        error: String(error),
      }));
    }
    return;
  }
  const participants = await listDecisionParticipants(db, action.decisionId);
  const participant = participants.find((candidate) => candidate.userId === action.participantUserId);
  if (!participant) {
    await updateAgentActionStatus(db, action.id, "failed");
    return;
  }
  let delivered = false;
  try {
    const channel = action.deliveryMode === "dm" ? await openSlackDm(env.SLACK_BOT_TOKEN, participant.userId) : ids.channel;
    const mention = action.deliveryMode === "thread" ? `<@${participant.userId}> ` : "";
    const safeQuestion = escapeSlackText(action.question);
    const posted = await postSlackMessage(env.SLACK_BOT_TOKEN, channel, `${mention}${safeQuestion}`, {
      threadTs: action.deliveryMode === "thread" ? ids.ts : undefined,
      blocks: action.kind === "request_stance" ? stanceBlocks(action) : undefined,
    });
    delivered = true;
    await updateAgentActionStatus(db, action.id, "sent", posted.ts);
    await upsertDecisionParticipant(db, {
      ...participant,
      contactState: "contacted",
      contactMode: action.deliveryMode,
      preserveAgreementState: true,
    });
    await appendAgreementEvent(db, {
      id: `${action.id}:sent`,
      decisionId: action.decisionId,
      proposalVersion: action.proposalVersion,
      type: "action_sent",
      actorUserId: ROOMI_USER_ID,
      participantUserId: participant.userId,
      messageId: posted.ts,
      payload: { deliveryMode: action.deliveryMode },
    });
    if (action.deliveryMode === "thread") {
      await saveMessage(db, ids, ROOMI_USER_ID, `${mention}${safeQuestion}`, { id: `slack:${ids.channel}:${posted.ts}`, ts: posted.ts });
    }
  } catch (error) {
    if (!delivered) {
      await updateAgentActionStatus(db, action.id, "failed");
      await db.prepare(
        "UPDATE decision_participants SET contact_state='failed', contact_mode=?, updated_at=datetime('now') " +
          "WHERE decision_id=? AND proposal_version=? AND user_id=?",
      ).bind(action.deliveryMode, action.decisionId, action.proposalVersion, participant.userId).run();
    }
    console.error(JSON.stringify({
      event: delivered ? "agreement_action_sent_unrecorded" : "agreement_action_failed",
      actionId: action.id,
      error: String(error),
    }));
  }
}

// Slack Events API (HTTP). Socket Mode is not available on Workers.
async function verifySlack(req: Request, secret: string): Promise<{ ok: boolean; body: string }> {
  const ts = req.headers.get("x-slack-request-timestamp") || "";
  const sig = req.headers.get("x-slack-signature") || "";
  if (!ts || !sig || !secret) return { ok: false, body: "" };
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { ok: false, body: "" };
  const body = await req.text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { ok: await constantTimeEqual(`v0=${hex}`, sig), body };
}

function isStance(value: unknown): value is Exclude<Stance, "unknown"> {
  return value === "agreed" || value === "conditional" || value === "objected" || value === "not_applicable";
}

function slackThreadCoordinates(threadId: string): { channel: string; rootTs: string } | null {
  const split = threadId.indexOf("-");
  if (split <= 0) return null;
  const channel = threadId.slice(0, split);
  const rootTs = threadId.slice(split + 1);
  return /^[CGD][A-Z0-9]+$/.test(channel) && rootTs ? { channel, rootTs } : null;
}

async function processAgreementActionApproval(
  env: Env,
  actorUserId: string,
  actionId: string,
  decisionId: string,
  proposalVersion: number,
  approved: boolean,
): Promise<void> {
  const view = await getDecisionView(env.DB, decisionId);
  if (!view) return;
  let action: AgentAction | undefined = view.actions.find((candidate) => candidate.id === actionId);
  if (
    !action ||
    action.proposalVersion !== proposalVersion ||
    action.snapshotToken !== view.snapshotToken ||
    (action.status !== "queued" && !(action.kind === "approve_decision" && action.status === "failed"))
  ) return;
  if (action.kind === "approve_decision" && action.status === "failed") {
    action = (await saveAgentAction(env.DB, { ...action, status: "queued" })).action;
    if (action.status !== "queued") return;
  }
  const configuredApprovers = new Set(
    (env.AGREEMENT_APPROVER_USER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean),
  );
  const actorIsOwner = view.ownerUserId === actorUserId && view.participants.some(
    (participant) => participant.userId === actorUserId && participant.role === "owner",
  );
  if (!actorIsOwner && !configuredApprovers.has(actorUserId)) {
    console.warn(JSON.stringify({
      event: "agreement_action_approval_denied",
      decisionId,
      actionId,
      actorUserId,
    }));
    return;
  }
  if (!approved) {
    const cancelled = await env.DB.prepare(
      "UPDATE agent_actions SET status='cancelled', updated_at=datetime('now') " +
        "WHERE id=? AND status='queued' AND EXISTS (SELECT 1 FROM decision_items " +
        "WHERE id=agent_actions.decision_id AND snapshot_token=agent_actions.snapshot_token " +
        "AND proposal_version=agent_actions.proposal_version AND status<>'decided')",
    ).bind(action.id).run();
    if (Number(cancelled.meta.changes || 0) !== 1) return;
    await appendAgreementEvent(env.DB, {
      id: `${action.id}:cancelled`,
      decisionId,
      proposalVersion,
      type: "action_completed",
      actorUserId,
      participantUserId: action.participantUserId,
      messageId: action.externalMessageId,
      payload: { outcome: "cancelled" },
    });
    return;
  }
  if (action.kind === "approve_decision") {
    if (!(await claimQueuedAction(env.DB, action.id))) return;
    try {
      const latest = await getDecision(env.DB, decisionId);
      if (!latest || latest.proposalVersion !== proposalVersion || latest.status !== "ready") {
        await updateAgentActionStatus(env.DB, action.id, "cancelled");
        return;
      }
      const decided = await upsertDecision(env.DB, { ...latest, status: "decided" });
      await appendAgreementEvent(env.DB, {
        id: `agreement:${decisionId}:v${proposalVersion}:decided`,
        decisionId,
        proposalVersion,
        type: "decision_decided",
        actorUserId,
        participantUserId: null,
        messageId: action.externalMessageId,
        payload: { proposal: decided.proposal, approvedBy: actorUserId },
      });
      const summaryAction = await queueDecisionSummary(env.DB, decided);
      const coordinates = slackThreadCoordinates(decided.threadId);
      if (coordinates) {
        await dispatchAgreementAction(
          env.DB,
          env,
          slackRoomIds(coordinates.channel, coordinates.rootTs),
          summaryAction,
        );
      }
    } catch (error) {
      await updateAgentActionStatus(env.DB, action.id, "failed");
      throw error;
    }
    return;
  }
  const approvalPromptMessageId = action.externalMessageId;
  const approvedForDelivery = await env.DB.prepare(
    "UPDATE agent_actions SET requires_approval=0, external_message_id=NULL, updated_at=datetime('now') " +
      "WHERE id=? AND status='queued' AND requires_approval=1 AND EXISTS " +
      "(SELECT 1 FROM decision_items WHERE id=agent_actions.decision_id " +
      "AND proposal_version=agent_actions.proposal_version " +
      "AND snapshot_token=agent_actions.snapshot_token AND status<>'decided')",
  ).bind(action.id).run();
  if (Number(approvedForDelivery.meta.changes || 0) !== 1) return;
  await appendAgreementEvent(env.DB, {
    id: `${action.id}:approved`,
    decisionId,
    proposalVersion,
    type: "action_completed",
    actorUserId,
    participantUserId: action.participantUserId,
    messageId: approvalPromptMessageId,
    payload: { outcome: "approved_for_delivery" },
  });
  action = { ...action, requiresApproval: false, externalMessageId: null };
  const coordinates = slackThreadCoordinates(view.threadId);
  if (!coordinates || !env.SLACK_BOT_TOKEN) return;
  const participant = view.participants.find((candidate) => candidate.userId === action.participantUserId);
  if (participant) {
    await dispatchAgreementAction(env.DB, env, slackRoomIds(coordinates.channel, coordinates.rootTs), {
      ...action,
      deliveryMode: participant.contactMode,
      requiresApproval: false,
    });
    return;
  }
  if (!(await claimQueuedAction(env.DB, action.id))) return;
  let delivered = false;
  try {
    const posted = await postSlackMessage(
      env.SLACK_BOT_TOKEN,
      coordinates.channel,
      escapeSlackText(action.question),
      { threadTs: coordinates.rootTs },
    );
    delivered = true;
    await updateAgentActionStatus(env.DB, action.id, "sent", posted.ts);
    await appendAgreementEvent(env.DB, {
      id: `${action.id}:sent`,
      decisionId,
      proposalVersion,
      type: "action_sent",
      actorUserId,
      participantUserId: null,
      messageId: posted.ts,
      payload: { deliveryMode: "thread", approvedBy: actorUserId },
    });
  } catch (error) {
    if (!delivered) await updateAgentActionStatus(env.DB, action.id, "failed");
    console.error(JSON.stringify({
      event: delivered ? "approved_agreement_action_sent_unrecorded" : "approved_agreement_action_failed",
      actionId: action.id,
      error: String(error),
    }));
  }
}

async function queueDecisionSummary(
  db: D1Database,
  decision: DecisionItem,
): Promise<AgentAction> {
  const now = new Date().toISOString();
  const saved = await saveAgentAction(db, {
    id: `decision-summary:${decision.id}:v${decision.proposalVersion}`,
    decisionId: decision.id,
    proposalVersion: decision.proposalVersion,
    snapshotToken: decision.snapshotToken,
    participantUserId: null,
    kind: "announce_decision",
    deliveryMode: "thread",
    question: `決定: ${decision.proposal}`,
    reason: "必要な合意がそろった",
    confidence: decision.confidence,
    requiresApproval: false,
    status: "queued",
    externalMessageId: null,
    createdAt: now,
    updatedAt: now,
  });
  return saved.action;
}

async function queueDecisionApproval(
  db: D1Database,
  decision: DecisionItem,
): Promise<AgentAction> {
  const now = new Date().toISOString();
  const saved = await saveAgentAction(db, {
    id: `decision-approval:${decision.id}:v${decision.proposalVersion}`,
    decisionId: decision.id,
    proposalVersion: decision.proposalVersion,
    snapshotToken: decision.snapshotToken,
    participantUserId: null,
    kind: "approve_decision",
    deliveryMode: "thread",
    question: `「${decision.proposal}」を現在の合意状況で決定として確定する？`,
    reason: "決め方または影響の確信度が低いため、人の最終確認が必要",
    confidence: decision.confidence,
    requiresApproval: true,
    status: "queued",
    externalMessageId: null,
    createdAt: now,
    updatedAt: now,
  });
  return saved.action;
}

async function advanceAgreementAfterResponse(
  env: Env,
  decisionId: string,
  actorUserId: string,
  messageId: string | null,
): Promise<void> {
  let currentView = await getDecisionView(env.DB, decisionId);
  if (!currentView) return;
  let currentDecision = currentView.status === "reopened"
    ? await upsertDecision(env.DB, { ...currentView, status: "gathering" })
    : currentView;
  currentView = await getDecisionView(env.DB, decisionId);
  if (!currentView) return;

  let satisfied = isDecisionSatisfied(currentDecision, currentView.participants, new Date());
  const sensitiveRow = await env.DB.prepare(
    "SELECT 1 AS sensitive FROM agreement_events WHERE decision_id = ? AND proposal_version = ? " +
      "AND json_extract(payload_json, '$.sensitive') = 1 LIMIT 1",
  ).bind(decisionId, currentDecision.proposalVersion).first<{ sensitive: number }>();
  const sensitive = Boolean(sensitiveRow?.sensitive);
  const threshold = Number.isFinite(Number(env.AGREEMENT_AUTO_ACTION_MIN_CONFIDENCE))
    ? Math.max(0, Math.min(1, Number(env.AGREEMENT_AUTO_ACTION_MIN_CONFIDENCE)))
    : 0.8;

  if (currentDecision.status === "decided" && !satisfied) {
    currentDecision = await upsertDecision(env.DB, { ...currentDecision, status: "reopened" });
    await appendAgreementEvent(env.DB, {
      id: `agreement:${decisionId}:v${currentDecision.proposalVersion}:reopened:${messageId || crypto.randomUUID()}`,
      decisionId,
      proposalVersion: currentDecision.proposalVersion,
      type: "decision_reopened",
      actorUserId,
      participantUserId: actorUserId,
      messageId,
      payload: { reason: "明示回答が変更された" },
    });
    currentView = await getDecisionView(env.DB, decisionId);
    if (!currentView) return;
    satisfied = false;
  }

  const coordinates = slackThreadCoordinates(currentDecision.threadId);
  if (!satisfied) {
    const next = selectNextAgreementAction(currentDecision, currentView.participants, currentView.gaps);
    if (!next) return;
    const saved = await saveAgentAction(env.DB, {
      ...next,
      requiresApproval: sensitive || next.confidence < threshold,
      reason: sensitive ? `[sensitive] ${next.reason}` : next.reason,
    });
    if (coordinates) {
      await dispatchAgreementAction(
        env.DB,
        env,
        slackRoomIds(coordinates.channel, coordinates.rootTs),
        saved.action,
      );
    }
    return;
  }

  const ownerExplicitlyApproved = Boolean(
    currentDecision.ownerUserId && currentView.participants.some(
      (candidate) =>
        candidate.userId === currentDecision.ownerUserId &&
        candidate.stance === "agreed" &&
        candidate.stanceSource === "explicit",
    ),
  );
  const explicitUnanimousApproval = currentDecision.method === "unanimous" &&
    currentView.participants.filter((participant) => participant.role !== "informed").length > 0 &&
    currentView.participants
      .filter((participant) => participant.role !== "informed")
      .every((participant) => participant.stance === "agreed" && participant.stanceSource === "explicit");
  const safeToFinalize =
    (!sensitive && currentDecision.confidence >= threshold) ||
    ownerExplicitlyApproved ||
    explicitUnanimousApproval;
  if (currentDecision.status === "decided") {
    const summaryAction = await queueDecisionSummary(env.DB, currentDecision);
    if (coordinates) {
      await dispatchAgreementAction(
        env.DB,
        env,
        slackRoomIds(coordinates.channel, coordinates.rootTs),
        summaryAction,
      );
    }
    return;
  }
  if (!safeToFinalize) {
    if (currentDecision.status !== "ready") {
      currentDecision = await upsertDecision(env.DB, { ...currentDecision, status: "ready" });
    }
    const approvalAction = await queueDecisionApproval(env.DB, currentDecision);
    if (coordinates) {
      await dispatchAgreementAction(
        env.DB,
        env,
        slackRoomIds(coordinates.channel, coordinates.rootTs),
        approvalAction,
      );
    }
    return;
  }
  currentDecision = await upsertDecision(env.DB, { ...currentDecision, status: "decided" });
  await appendAgreementEvent(env.DB, {
    id: `agreement:${decisionId}:v${currentDecision.proposalVersion}:decided`,
    decisionId,
    proposalVersion: currentDecision.proposalVersion,
    type: "decision_decided",
    actorUserId,
    participantUserId: actorUserId,
    messageId,
    payload: { proposal: currentDecision.proposal, approvedByOwner: ownerExplicitlyApproved },
  });
  const summaryAction = await queueDecisionSummary(env.DB, currentDecision);
  if (coordinates) {
    await dispatchAgreementAction(
      env.DB,
      env,
      slackRoomIds(coordinates.channel, coordinates.rootTs),
      summaryAction,
    );
  }
}

async function processAgreementInteraction(env: Env, payload: {
  user?: { id?: string };
  channel?: { id?: string };
  container?: { thread_ts?: string; message_ts?: string };
  message?: { ts?: string; thread_ts?: string };
  action_ts?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const userId = payload.user?.id;
  const approval = payload.actions?.find((action) => action.action_id === "roomi_agreement_action_approve" || action.action_id === "roomi_agreement_action_skip");
  if (userId && approval?.value) {
    try {
      const value = JSON.parse(approval.value) as { actionId?: string; decisionId?: string; proposalVersion?: number };
      if (value.actionId && value.decisionId && Number.isFinite(Number(value.proposalVersion))) {
        await processAgreementActionApproval(
          env,
          userId,
          value.actionId,
          value.decisionId,
          Number(value.proposalVersion),
          approval.action_id === "roomi_agreement_action_approve",
        );
      }
    } catch {
      // Invalid button values are ignored after the Slack signature has passed.
    }
    return;
  }
  const clicked = payload.actions?.find((action) => action.action_id === "roomi_agreement_stance");
  if (!userId || !clicked?.value) return;
  let value: {
    actionId?: string;
    decisionId?: string;
    proposalVersion?: number;
    participantUserId?: string | null;
    stance?: unknown;
  };
  try {
    value = JSON.parse(clicked.value) as typeof value;
  } catch {
    return;
  }
  if (!value.actionId || !value.decisionId || value.participantUserId !== userId || !isStance(value.stance)) return;
  const decision = await getDecision(env.DB, value.decisionId);
  if (!decision || decision.proposalVersion !== Number(value.proposalVersion)) return;
  const sourceAction = await env.DB.prepare(
    "SELECT participant_user_id, proposal_version, status FROM agent_actions WHERE id = ? AND decision_id = ?",
  ).bind(value.actionId, value.decisionId).first<{
    participant_user_id: string | null;
    proposal_version: number;
    status: string;
  }>();
  if (
    !sourceAction ||
    sourceAction.participant_user_id !== userId ||
    Number(sourceAction.proposal_version) !== decision.proposalVersion ||
    (sourceAction.status !== "sent" && sourceAction.status !== "completed")
  ) return;
  const participants = await listDecisionParticipants(env.DB, decision.id);
  const participant = participants.find((candidate) => candidate.userId === userId);
  if (!participant) return;
  const interactionId = `slack-action:${payload.action_ts || payload.container?.message_ts || payload.message?.ts || crypto.randomUUID()}:${userId}`;
  if (
    participant.stanceSource === "explicit" &&
    participant.stance === value.stance &&
    value.stance !== "conditional" &&
    value.stance !== "objected"
  ) {
    await advanceAgreementAfterResponse(
      env,
      decision.id,
      userId,
      payload.container?.message_ts || payload.message?.ts || null,
    );
    return;
  }
  await upsertDecisionParticipant(env.DB, {
    ...participant,
    stance: value.stance,
    stanceSource: "explicit",
    condition: value.stance === "conditional" || value.stance === "objected" ? null : participant.condition,
    conditionResolution:
      value.stance === "conditional" || value.stance === "objected"
        ? null
        : participant.conditionResolution,
    evidenceMessageIds: [...new Set([...participant.evidenceMessageIds, interactionId])],
    confidence: 1,
    contactState: "responded",
  });
  await appendAgreementEvent(env.DB, {
    id: `${interactionId}:${decision.id}:v${decision.proposalVersion}:${value.stance}`,
    decisionId: decision.id,
    proposalVersion: decision.proposalVersion,
    type: "stance_recorded",
    actorUserId: userId,
    participantUserId: userId,
    messageId: payload.container?.message_ts || payload.message?.ts || null,
    payload: { stance: value.stance, source: "slack_block_action" },
  });
  const actionRow = await env.DB.prepare(
    "SELECT id FROM agent_actions WHERE decision_id = ? AND proposal_version = ? AND participant_user_id = ? AND status = 'sent' ORDER BY created_at DESC LIMIT 1",
  ).bind(decision.id, decision.proposalVersion, userId).first<{ id: string }>();
  if (actionRow?.id) await updateAgentActionStatus(env.DB, actionRow.id, "completed");
  await advanceAgreementAfterResponse(
    env,
    decision.id,
    userId,
    payload.container?.message_ts || payload.message?.ts || null,
  );
}

app.post("/api/slack/interactivity", async (c) => {
  const { ok, body } = await verifySlack(c.req.raw.clone(), c.env.SLACK_SIGNING_SECRET || "");
  if (!ok) return c.json({ error: "bad signature" }, 401);
  const form = new URLSearchParams(body);
  let payload: Parameters<typeof processAgreementInteraction>[1];
  try {
    payload = JSON.parse(form.get("payload") || "{}") as typeof payload;
  } catch {
    return c.json({ error: "invalid payload" }, 400);
  }
  const receiptId = interactionReceiptId(payload);
  c.executionCtx.waitUntil((async () => {
    if (!(await claimSlackReceipt(c.env.DB, receiptId, "interaction"))) return;
    try {
      await processAgreementInteraction(c.env, payload);
      await finishSlackReceipt(c.env.DB, receiptId, "processed");
    } catch (error) {
      await finishSlackReceipt(c.env.DB, receiptId, "failed", error);
      console.error(JSON.stringify({ event: "slack_interaction_failed", receiptId, error: String(error) }));
    }
  })());
  return c.json({ ok: true });
});

app.post("/api/slack/actions", async (c) => {
  const { ok, body } = await verifySlack(c.req.raw.clone(), c.env.SLACK_SIGNING_SECRET || "");
  if (!ok) return c.json({ error: "bad signature" }, 401);
  const form = new URLSearchParams(body);
  let payload: Parameters<typeof processAgreementInteraction>[1];
  try {
    payload = JSON.parse(form.get("payload") || "{}") as typeof payload;
  } catch {
    return c.json({ error: "invalid payload" }, 400);
  }
  const receiptId = interactionReceiptId(payload);
  c.executionCtx.waitUntil((async () => {
    if (!(await claimSlackReceipt(c.env.DB, receiptId, "interaction"))) return;
    try {
      await processAgreementInteraction(c.env, payload);
      await finishSlackReceipt(c.env.DB, receiptId, "processed");
    } catch (error) {
      await finishSlackReceipt(c.env.DB, receiptId, "failed", error);
      console.error(JSON.stringify({ event: "slack_interaction_failed", receiptId, error: String(error) }));
    }
  })());
  return c.json({ ok: true });
});

app.post("/api/slack/events", async (c) => {
  const secret = c.env.SLACK_SIGNING_SECRET || "";
  const { ok, body } = await verifySlack(c.req.raw.clone(), secret);
  if (!ok) return c.json({ error: "bad signature" }, 401);
  const payload = JSON.parse(body || "{}") as {
    type?: string;
    challenge?: string;
    event_id?: string;
    authorizations?: Array<{ user_id?: string }>;
    event?: SlackMessage & { type?: string; channel?: string; bot_profile?: unknown };
  };
  if (payload.type === "url_verification") return c.json({ challenge: payload.challenge });
  const ev = payload.event;
  const ownBotUser = payload.authorizations?.some((authorization) => authorization.user_id === ev?.user);
  if (
    payload.type !== "event_callback" ||
    !ev ||
    (ev.type !== "app_mention" && ev.type !== "message") ||
    ev.subtype ||
    ev.bot_id ||
    ev.bot_profile ||
    ownBotUser ||
    !ev.channel ||
    !ev.ts ||
    !ev.user ||
    !ev.text?.trim()
  ) return c.json({ ok: true, ignored: true });
  const eventChannel = ev.channel;
  const eventTs = ev.ts;
  const eventUser = ev.user;
  const eventText = ev.text;
  const rootTs = ev.thread_ts || eventTs;
  const ids = slackRoomIds(eventChannel, rootTs);
  const receiptId = `event:${payload.event_id || `${eventChannel}:${eventTs}`}`;
  c.executionCtx.waitUntil((async () => {
    if (!(await claimSlackReceipt(c.env.DB, receiptId, "event"))) return;
    let failure: unknown = null;
    try {
      if (eventChannel.startsWith("D") && ev.thread_ts) {
        const linked = await c.env.DB.prepare(
          "SELECT a.id AS action_id, a.decision_id, a.proposal_version, d.thread_id FROM agent_actions a " +
            "JOIN decision_items d ON d.id = a.decision_id WHERE a.external_message_id = ? " +
            "AND a.participant_user_id = ? AND a.delivery_mode = 'dm' AND a.status='sent' " +
            "AND a.proposal_version=d.proposal_version " +
            "AND a.action_type IN ('resolve_condition','address_objection') " +
            "ORDER BY a.updated_at DESC LIMIT 1",
        ).bind(ev.thread_ts, eventUser).first<{
          action_id: string;
          decision_id: string;
          proposal_version: number;
          thread_id: string;
        }>();
        if (linked) {
          const captured = await captureBlockingComment(
            c.env.DB,
            linked.decision_id,
            Number(linked.proposal_version),
            eventUser,
            eventText,
            `slack:${eventChannel}:${eventTs}`,
          );
          if (captured) {
            await updateAgentActionStatus(c.env.DB, linked.action_id, "completed");
            await advanceAgreementAfterResponse(c.env, linked.decision_id, eventUser, `slack:${eventChannel}:${eventTs}`);
          }
          return;
        }
      }
      await ensureSlackRoom(c.env.DB, ids);
      const slackMessageId = `slack:${eventChannel}:${eventTs}`;
      if (c.env.SLACK_BOT_TOKEN) await syncSlackThread(c.env.DB, c.env.SLACK_BOT_TOKEN, ids, ev);
      else await saveMessage(c.env.DB, ids, eventUser, eventText, { id: slackMessageId, ts: eventTs, isMention: ev.type === "app_mention" });
      const linkedAction = await c.env.DB.prepare(
        "SELECT a.id AS action_id, a.decision_id, a.proposal_version FROM agent_actions a " +
          "JOIN decision_items d ON d.id=a.decision_id WHERE d.thread_id=? AND a.participant_user_id=? " +
          "AND a.delivery_mode='thread' AND a.status='sent' " +
          "AND a.proposal_version=d.proposal_version " +
          "AND a.action_type IN ('resolve_condition','address_objection') " +
          "ORDER BY a.updated_at DESC LIMIT 1",
      ).bind(ids.threadId, eventUser).first<{
        action_id: string;
        decision_id: string;
        proposal_version: number;
      }>();
      if (linkedAction) {
        const captured = await captureBlockingComment(
          c.env.DB,
          linkedAction.decision_id,
          Number(linkedAction.proposal_version),
          eventUser,
          eventText,
          slackMessageId,
        );
        if (captured) {
          await updateAgentActionStatus(c.env.DB, linkedAction.action_id, "completed");
          await advanceAgreementAfterResponse(c.env, linkedAction.decision_id, eventUser, slackMessageId);
          return;
        }
      }
      const result = await maybeIntervene(c.env.DB, c.env, ids, llmName(c.env), ev.type === "app_mention", "slack");
      if (result.action) {
        await dispatchAgreementAction(c.env.DB, c.env, ids, result.action);
      } else if (
        c.env.AGREEMENT_AUTO_ACTIONS === "true" &&
        c.env.SLACK_BOT_TOKEN &&
        result.intervention["should_act"] &&
        result.intervention["text"]
      ) {
        const safeText = escapeSlackText(String(result.intervention["text"]));
        const posted = await postSlackMessage(c.env.SLACK_BOT_TOKEN, ids.channel, safeText, { threadTs: ids.ts });
        await saveMessage(c.env.DB, ids, ROOMI_USER_ID, safeText, {
          id: `slack:${ids.channel}:${posted.ts}`,
          ts: posted.ts,
        });
      }
    } catch (error) {
      failure = error;
      console.error(JSON.stringify({ event: "slack_event_processing_failed", eventId: payload.event_id, threadId: ids.threadId, error: String(error) }));
    } finally {
      await finishSlackReceipt(c.env.DB, receiptId, failure ? "failed" : "processed", failure);
    }
  })());
  return c.json({ ok: true, accepted: payload.event_id || `${eventChannel}:${eventTs}` });
});

async function reconcileAgreementDeadlines(env: Env): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT d.id FROM decision_items d WHERE " +
      "(d.method='no_objection' AND d.status IN ('gathering','ready') AND d.deadline IS NOT NULL AND " +
      "CASE WHEN length(d.deadline)=10 THEN datetime(d.deadline, '+1 day', '-9 hours') <= datetime('now') " +
      "ELSE datetime(d.deadline) <= datetime('now') END) OR " +
      "(d.status='decided' AND (" +
      "NOT EXISTS (SELECT 1 FROM agent_actions a WHERE a.decision_id=d.id " +
      "AND a.proposal_version=d.proposal_version AND a.action_type='announce_decision') OR " +
      "EXISTS (SELECT 1 FROM agent_actions a WHERE a.decision_id=d.id " +
      "AND a.proposal_version=d.proposal_version " +
      "AND a.action_type='announce_decision' AND a.status IN ('queued','failed','cancelled')))) " +
      "ORDER BY CASE WHEN d.status='decided' THEN 1 ELSE 0 END, d.updated_at LIMIT 100",
  ).all<{ id: string }>();
  for (const row of rows.results || []) {
    try {
      await advanceAgreementAfterResponse(env, row.id, ROOMI_USER_ID, null);
    } catch (error) {
      console.error(JSON.stringify({
        event: "agreement_deadline_reconcile_failed",
        decisionId: row.id,
        error: String(error),
      }));
    }
  }
  if (env.AGREEMENT_AUTO_ACTIONS !== "true" || !env.SLACK_BOT_TOKEN) return;
  const retryable = await env.DB.prepare(
    "SELECT a.id, a.decision_id FROM agent_actions a JOIN decision_items d ON d.id=a.decision_id " +
      "WHERE a.proposal_version=d.proposal_version AND a.snapshot_token=d.snapshot_token AND " +
      "((a.status='queued' AND a.external_message_id IS NULL " +
      "AND a.updated_at <= datetime('now','-1 minute')) OR " +
      "(a.status='failed' AND a.updated_at <= datetime('now','-5 minutes'))) AND " +
      "((d.status<>'decided' AND a.action_type<>'announce_decision') OR " +
      "(d.status='decided' AND a.action_type='announce_decision')) " +
      "ORDER BY a.updated_at LIMIT 100",
  ).all<{ id: string; decision_id: string }>();
  for (const row of retryable.results || []) {
    try {
      const view = await getDecisionView(env.DB, row.decision_id);
      let action: AgentAction | undefined = view?.actions.find((candidate) => candidate.id === row.id);
      if (!view || !action) continue;
      if (action.status === "failed") {
        action = (await saveAgentAction(env.DB, { ...action, status: "queued" })).action;
      }
      if (!action) continue;
      const coordinates = slackThreadCoordinates(view.threadId);
      if (!coordinates) continue;
      await dispatchAgreementAction(
        env.DB,
        env,
        slackRoomIds(coordinates.channel, coordinates.rootTs),
        action,
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: "agreement_action_retry_failed",
        actionId: row.id,
        error: String(error),
      }));
    }
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(reconcileAgreementDeadlines(env));
  },
} satisfies ExportedHandler<Env>;
