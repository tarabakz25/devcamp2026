// D1 data layer. Mirrors apps/bot/src/{store,dashboard,demo_room}.py queries.
import { SCENARIO_MESSAGES, SEED_STAKEHOLDERS } from "./seed";
import {
  AgentAction,
  AgentActionStatus,
  AgreementEvent,
  AgreementGap,
  computeAgreementGaps,
  ContactMode,
  ContactState,
  DecisionItem,
  DecisionMethod,
  DecisionParticipant,
  DecisionStatus,
  StakeholderRole,
  Stance,
  StanceSource,
} from "./agreement";

export const ROOMI_USER_ID = "U-ROOMI";
export const ROOMI_NAME = "Roomi";

export type Row = Record<string, string | number | boolean | null | undefined>;

export type Env = {
  DB: D1Database;
  LLM_PROVIDER?: string;
  XAI_API_KEY?: string;
  XAI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
  DEMO_CHANNEL_ID?: string;
  DEMO_THREAD_TS?: string;
  DEMO_CHANNEL_NAME?: string;
  DEMO_TITLE?: string;
  AGREEMENT_AUTO_ACTIONS?: string;
  AGREEMENT_AUTO_ACTION_MIN_CONFIDENCE?: string;
  AGREEMENT_API_TOKEN?: string;
  AGREEMENT_APPROVER_USER_IDS?: string;
};

export interface DecisionItemInput {
  id?: string;
  threadId: string;
  decisionText: string;
  proposal?: string;
  proposalVersion?: number;
  method: DecisionMethod;
  status?: DecisionStatus;
  ownerUserId?: string | null;
  deadline?: string | null;
  evidenceMessageIds?: string[];
  confidence?: number;
  snapshotToken?: string;
  expectedSnapshotToken?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DecisionParticipantInput {
  decisionId: string;
  proposalVersion?: number;
  userId: string;
  userName?: string;
  role: StakeholderRole;
  stance?: Stance;
  stanceSource?: StanceSource;
  condition?: string | null;
  conditionResolution?: string | null;
  evidenceMessageIds?: string[];
  confidence?: number;
  contactState?: ContactState;
  contactMode?: ContactMode;
  revision?: number;
  preserveAgreementState?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AgreementEventInput = Omit<AgreementEvent, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export type AgentActionInput = Omit<AgentAction, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

export interface ThreadDecisionView extends DecisionItem {
  question: string;
  version: number;
  decisionMethod: DecisionMethod;
  participants: Array<DecisionParticipant & { required: boolean }>;
  gaps: Array<AgreementGap & { type: AgreementGap["kind"]; userId: string | null; question: string }>;
  actions: Array<AgentAction & { route: ContactMode; targetUserId: string | null }>;
}

export interface ThreadAgreementView {
  decisions: ThreadDecisionView[];
}

export interface KnownStakeholder {
  userId: string;
  userName: string;
  roles: string[];
  threadIds: string[];
  decisionCount: number;
  lastSeenAt: string;
}

export function demoIds(env: Env) {
  const channel = env.DEMO_CHANNEL_ID || "demo";
  const ts = env.DEMO_THREAD_TS || "live";
  return {
    channel,
    ts,
    threadId: `${channel}-${ts}`,
    name: env.DEMO_CHANNEL_NAME || "03_rooms_discussion",
    title: env.DEMO_TITLE || "朝食会場を決めよう",
  };
}

export async function ensureRoom(db: D1Database, ids: ReturnType<typeof demoIds>) {
  await db
    .batch([
      db.prepare("INSERT INTO channels (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(ids.channel, ids.name),
      db.prepare("INSERT OR IGNORE INTO threads (id, channel_id) VALUES (?, ?)").bind(ids.threadId, ids.channel),
      db.prepare("INSERT INTO users (id, name, role) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name").bind(ROOMI_USER_ID, ROOMI_NAME, "AI"),
      db.prepare(
        "INSERT INTO intervention_rules (channel_id, min_confidence, min_impact, cooldown_sec, enabled) " +
          "SELECT ?, 0.7, 0.7, 600, 1 WHERE NOT EXISTS (SELECT 1 FROM intervention_rules)",
      ).bind("*"),
      db.prepare(
        "INSERT INTO intervention_rules (channel_id, min_confidence, min_impact, cooldown_sec, enabled) " +
          "SELECT ?, 0.55, 0.5, 20, 1 WHERE NOT EXISTS (SELECT 1 FROM intervention_rules WHERE channel_id = ?)",
      ).bind(ids.channel, ids.channel),
    ])
    .then((r) => r);
  const count = await db
    .prepare("SELECT COUNT(*) AS c FROM stakeholders WHERE thread_id = ?")
    .bind(ids.threadId)
    .first<{ c: number }>();
  if (!count || count.c === 0) {
    const stmts = SEED_STAKEHOLDERS.map((p) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO stakeholders (thread_id, user_id, user_name, role, interests, avatar, message_count) VALUES (?, ?, ?, ?, ?, ?, 0)",
        )
        .bind(ids.threadId, p.user_id, p.user_name, p.role, p.interests, p.avatar || ""),
    );
    await db.batch(stmts);
  }
}

export async function listStakeholders(db: D1Database, threadId: string): Promise<Row[]> {
  const rows = await db
    .prepare("SELECT user_id, user_name, role, interests, avatar FROM stakeholders WHERE thread_id = ? ORDER BY id")
    .bind(threadId)
    .all<Row>();
  const counts = await db
    .prepare("SELECT user_id, COUNT(*) AS n FROM messages WHERE thread_id = ? GROUP BY user_id")
    .bind(threadId)
    .all<{ user_id: string; n: number }>();
  const byId = new Map((counts.results || []).map((r) => [String(r.user_id), Number(r.n)]));
  return (rows.results || []).map((r) => ({ ...r, messages: byId.get(String(r["user_id"])) || 0 }));
}

export async function listMessages(db: D1Database, threadId: string): Promise<Row[]> {
  const rows = await db
    .prepare(
      "SELECT m.id, m.user_id, m.text, m.ts, m.is_mention, " +
        "COALESCE(s.user_name, u.name, m.user_id) AS user_name, " +
        "COALESCE(NULLIF(s.role, ''), u.role, '') AS role, " +
        "COALESCE(s.avatar, '') AS avatar " +
        "FROM messages m LEFT JOIN stakeholders s ON s.thread_id = m.thread_id AND s.user_id = m.user_id " +
        "LEFT JOIN users u ON u.id = m.user_id WHERE m.thread_id = ? " +
        "ORDER BY CAST(m.ts AS REAL), m.ts",
    )
    .bind(threadId)
    .all<Row>();
  return (rows.results || []).map((r) => ({
    ...r,
    is_bot: r["user_id"] === ROOMI_USER_ID ? 1 : 0,
    user_name: r["user_id"] === ROOMI_USER_ID ? ROOMI_NAME : r["user_name"],
    role: r["user_id"] === ROOMI_USER_ID ? "AI" : r["role"],
  }));
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampConfidence(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Number(value)));
}

function normalizeDeadline(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!Number.isFinite(Date.parse(trimmed))) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : new Date(trimmed).toISOString();
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function decisionFromRow(row: Row): DecisionItem {
  return {
    id: String(row["id"]),
    threadId: String(row["thread_id"]),
    decisionText: String(row["decision_text"]),
    proposal: String(row["proposal"] || ""),
    proposalVersion: Number(row["proposal_version"] || 1),
    method: String(row["method"]) as DecisionMethod,
    status: String(row["status"]) as DecisionStatus,
    ownerUserId: row["owner_user_id"] == null ? null : String(row["owner_user_id"]),
    deadline: row["deadline"] == null ? null : String(row["deadline"]),
    evidenceMessageIds: parseStringArray(row["evidence_message_ids"]),
    confidence: Number(row["confidence"] || 0),
    snapshotToken: String(row["snapshot_token"] || ""),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

function participantFromRow(row: Row): DecisionParticipant {
  return {
    decisionId: String(row["decision_id"]),
    proposalVersion: Number(row["proposal_version"] || 1),
    userId: String(row["user_id"]),
    userName: String(row["user_name"] || ""),
    role: String(row["role"]) as StakeholderRole,
    stance: String(row["stance"]) as Stance,
    stanceSource: String(row["stance_source"] || "analysis") as StanceSource,
    condition: row["condition_text"] == null ? null : String(row["condition_text"]),
    conditionResolution: row["condition_resolution"] == null ? null : String(row["condition_resolution"]),
    evidenceMessageIds: parseStringArray(row["evidence_message_ids"]),
    confidence: Number(row["confidence"] || 0),
    contactState: String(row["contact_state"]) as ContactState,
    contactMode: String(row["contact_mode"]) as ContactMode,
    revision: Number(row["revision"] || 1),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

function actionFromRow(row: Row): AgentAction {
  return {
    id: String(row["id"]),
    decisionId: String(row["decision_id"]),
    proposalVersion: Number(row["proposal_version"] || 1),
    snapshotToken: String(row["snapshot_token"] || ""),
    participantUserId: row["participant_user_id"] == null ? null : String(row["participant_user_id"]),
    kind: String(row["action_type"]) as AgentAction["kind"],
    deliveryMode: String(row["delivery_mode"]) as ContactMode,
    question: String(row["question"]),
    reason: String(row["reason"] || ""),
    confidence: Number(row["confidence"] || 0),
    requiresApproval: Boolean(row["requires_approval"]),
    status: String(row["status"]) as AgentActionStatus,
    externalMessageId: row["external_message_id"] == null ? null : String(row["external_message_id"]),
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
  };
}

function eventFromRow(row: Row): AgreementEvent {
  return {
    id: String(row["id"]),
    decisionId: String(row["decision_id"]),
    proposalVersion: Number(row["proposal_version"] || 1),
    type: String(row["event_type"]) as AgreementEvent["type"],
    actorUserId: row["actor_user_id"] == null ? null : String(row["actor_user_id"]),
    participantUserId: row["participant_user_id"] == null ? null : String(row["participant_user_id"]),
    messageId: row["message_id"] == null ? null : String(row["message_id"]),
    payload: parseObject(row["payload_json"]),
    createdAt: String(row["created_at"]),
  };
}

function materializeDecision(input: DecisionItemInput): DecisionItem {
  const updatedAt = input.updatedAt || nowIso();
  return {
    id: input.id || crypto.randomUUID(),
    threadId: input.threadId,
    decisionText: input.decisionText.trim(),
    proposal: (input.proposal || "").trim(),
    proposalVersion: Math.max(1, Math.trunc(input.proposalVersion || 1)),
    method: input.method,
    status: input.status || "discovering",
    ownerUserId: input.ownerUserId || null,
    deadline: normalizeDeadline(input.deadline),
    evidenceMessageIds: input.evidenceMessageIds || [],
    confidence: clampConfidence(input.confidence),
    snapshotToken: input.snapshotToken || crypto.randomUUID(),
    createdAt: input.createdAt || updatedAt,
    updatedAt,
  };
}

function materializeParticipant(input: DecisionParticipantInput): DecisionParticipant {
  const updatedAt = input.updatedAt || nowIso();
  return {
    decisionId: input.decisionId,
    proposalVersion: Math.max(1, Math.trunc(input.proposalVersion || 1)),
    userId: input.userId,
    userName: input.userName || input.userId,
    role: input.role,
    stance: input.stance || "unknown",
    stanceSource: input.stanceSource || "analysis",
    condition: input.condition || null,
    conditionResolution: input.conditionResolution || null,
    evidenceMessageIds: input.evidenceMessageIds || [],
    confidence: clampConfidence(input.confidence),
    contactState: input.contactState || "not_contacted",
    contactMode: input.contactMode || "thread",
    revision: Math.max(1, Math.trunc(input.revision || 1)),
    createdAt: input.createdAt || updatedAt,
    updatedAt,
  };
}

function decisionUpsertStatement(
  db: D1Database,
  decision: DecisionItem,
  expectedSnapshotToken?: string | null,
): D1PreparedStatement {
  const casEnabled = expectedSnapshotToken !== undefined ? 1 : 0;
  return db
    .prepare(
      "INSERT INTO decision_items " +
        "(id, thread_id, decision_text, proposal, proposal_version, method, status, owner_user_id, deadline, evidence_message_ids, confidence, snapshot_token, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET thread_id=excluded.thread_id, decision_text=excluded.decision_text, proposal=excluded.proposal, " +
        "proposal_version=excluded.proposal_version, method=excluded.method, status=excluded.status, owner_user_id=excluded.owner_user_id, " +
        "deadline=excluded.deadline, evidence_message_ids=excluded.evidence_message_ids, confidence=excluded.confidence, " +
        "snapshot_token=excluded.snapshot_token, updated_at=excluded.updated_at " +
        "WHERE ? = 0 OR decision_items.snapshot_token = ?",
    )
    .bind(
      decision.id,
      decision.threadId,
      decision.decisionText,
      decision.proposal,
      decision.proposalVersion,
      decision.method,
      decision.status,
      decision.ownerUserId,
      decision.deadline,
      JSON.stringify(decision.evidenceMessageIds),
      decision.confidence,
      decision.snapshotToken,
      decision.createdAt,
      decision.updatedAt,
      casEnabled,
      expectedSnapshotToken || "",
    );
}

function participantUpsertStatement(
  db: D1Database,
  participant: DecisionParticipant,
  requiredSnapshotToken?: string,
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO decision_participants " +
        "(decision_id, proposal_version, user_id, user_name, role, stance, stance_source, condition_text, condition_resolution, evidence_message_ids, confidence, contact_state, contact_mode, revision, created_at, updated_at) " +
        "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? " +
        "WHERE ? = '' OR EXISTS (SELECT 1 FROM decision_items WHERE id = ? AND snapshot_token = ?) " +
        "ON CONFLICT(decision_id, proposal_version, user_id) DO UPDATE SET user_name=excluded.user_name, " +
        "role=CASE WHEN decision_participants.stance_source='explicit' AND excluded.stance_source='analysis' " +
        "AND decision_participants.role IN ('owner','required') AND excluded.role IN ('consulted','informed') " +
        "THEN decision_participants.role ELSE excluded.role END, " +
        "stance=CASE WHEN decision_participants.stance_source='explicit' AND excluded.stance_source='analysis' THEN decision_participants.stance ELSE excluded.stance END, " +
        "stance_source=CASE WHEN decision_participants.stance_source='explicit' AND excluded.stance_source='analysis' THEN decision_participants.stance_source ELSE excluded.stance_source END, " +
        "condition_text=CASE WHEN decision_participants.stance_source='explicit' AND excluded.stance_source='analysis' THEN decision_participants.condition_text ELSE excluded.condition_text END, " +
        "condition_resolution=CASE WHEN decision_participants.stance_source='explicit' AND excluded.stance_source='analysis' THEN decision_participants.condition_resolution ELSE excluded.condition_resolution END, " +
        "evidence_message_ids=CASE WHEN decision_participants.stance_source='explicit' AND excluded.stance_source='analysis' THEN decision_participants.evidence_message_ids ELSE excluded.evidence_message_ids END, " +
        "confidence=CASE WHEN decision_participants.stance_source='explicit' AND excluded.stance_source='analysis' THEN decision_participants.confidence ELSE excluded.confidence END, " +
        "contact_state=CASE WHEN decision_participants.contact_state='responded' AND excluded.stance_source='analysis' THEN decision_participants.contact_state ELSE excluded.contact_state END, " +
        "contact_mode=excluded.contact_mode, revision=decision_participants.revision+1, updated_at=excluded.updated_at",
    )
    .bind(
      participant.decisionId,
      participant.proposalVersion,
      participant.userId,
      participant.userName,
      participant.role,
      participant.stance,
      participant.stanceSource,
      participant.condition,
      participant.conditionResolution,
      JSON.stringify(participant.evidenceMessageIds),
      participant.confidence,
      participant.contactState,
      participant.contactMode,
      participant.revision,
      participant.createdAt,
      participant.updatedAt,
      requiredSnapshotToken || "",
      participant.decisionId,
      requiredSnapshotToken || "",
    );
}

function eventInsertStatement(
  db: D1Database,
  event: AgreementEvent,
  requiredSnapshotToken?: string,
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT OR IGNORE INTO agreement_events " +
        "(id, decision_id, proposal_version, event_type, actor_user_id, participant_user_id, message_id, payload_json, created_at) " +
        "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? " +
        "WHERE ? = '' OR EXISTS (SELECT 1 FROM decision_items WHERE id = ? AND snapshot_token = ?)",
    )
    .bind(
      event.id,
      event.decisionId,
      event.proposalVersion,
      event.type,
      event.actorUserId,
      event.participantUserId,
      event.messageId,
      JSON.stringify(event.payload),
      event.createdAt,
      requiredSnapshotToken || "",
      event.decisionId,
      requiredSnapshotToken || "",
    );
}

export async function upsertDecision(db: D1Database, input: DecisionItemInput): Promise<DecisionItem> {
  const expectedSnapshotToken = input.snapshotToken;
  const decision = materializeDecision({
    ...input,
    snapshotToken: expectedSnapshotToken ? crypto.randomUUID() : undefined,
  });
  await decisionUpsertStatement(db, decision, expectedSnapshotToken).run();
  const saved = await getDecision(db, decision.id);
  if (expectedSnapshotToken && saved?.snapshotToken !== decision.snapshotToken) {
    throw new AgreementSnapshotConflictError(decision.id);
  }
  return saved || decision;
}

export async function getDecision(db: D1Database, decisionId: string): Promise<DecisionItem | null> {
  const row = await db.prepare("SELECT * FROM decision_items WHERE id = ?").bind(decisionId).first<Row>();
  return row ? decisionFromRow(row) : null;
}

export async function listThreadDecisions(db: D1Database, threadId: string): Promise<DecisionItem[]> {
  const rows = await db
    .prepare("SELECT * FROM decision_items WHERE thread_id = ? ORDER BY updated_at DESC, id")
    .bind(threadId)
    .all<Row>();
  return (rows.results || []).map(decisionFromRow);
}

export async function upsertDecisionParticipant(
  db: D1Database,
  input: DecisionParticipantInput,
): Promise<DecisionParticipant> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const decision = await getDecision(db, input.decisionId);
    const proposalVersion = input.proposalVersion || decision?.proposalVersion;
    if (!decision || !proposalVersion || proposalVersion !== decision.proposalVersion) {
      throw new AgreementSnapshotConflictError(input.decisionId);
    }
    const nextSnapshotToken = crypto.randomUUID();
    const updatedAt = nowIso();
    const latestParticipant = await getDecisionParticipant(
      db,
      input.decisionId,
      input.userId,
      proposalVersion,
    );
    const effectiveInput = input.preserveAgreementState && latestParticipant
      ? {
          ...input,
          role: latestParticipant.role,
          stance: latestParticipant.stance,
          stanceSource: latestParticipant.stanceSource,
          condition: latestParticipant.condition,
          conditionResolution: latestParticipant.conditionResolution,
          evidenceMessageIds: latestParticipant.evidenceMessageIds,
          confidence: latestParticipant.confidence,
          revision: latestParticipant.revision,
        }
      : input;
    const participant = materializeParticipant({ ...effectiveInput, proposalVersion, updatedAt });
    await db.batch([
      decisionUpsertStatement(
        db,
        { ...decision, snapshotToken: nextSnapshotToken, updatedAt },
        decision.snapshotToken,
      ),
      participantUpsertStatement(db, participant, nextSnapshotToken),
      db
        .prepare(
          "UPDATE agent_actions SET status='cancelled', updated_at=? WHERE decision_id=? " +
            "AND proposal_version=? AND snapshot_token<>? AND status='queued' " +
            "AND EXISTS (SELECT 1 FROM decision_items WHERE id=? AND snapshot_token=?)",
        )
        .bind(
          updatedAt,
          decision.id,
          decision.proposalVersion,
          nextSnapshotToken,
          decision.id,
          nextSnapshotToken,
        ),
    ]);
    const savedDecision = await getDecision(db, decision.id);
    if (savedDecision?.snapshotToken !== nextSnapshotToken) continue;
    const saved = await db
      .prepare("SELECT * FROM decision_participants WHERE decision_id = ? AND proposal_version = ? AND user_id = ?")
      .bind(participant.decisionId, participant.proposalVersion, participant.userId)
      .first<Row>();
    return saved ? participantFromRow(saved) : participant;
  }
  throw new AgreementSnapshotConflictError(input.decisionId);
}

export async function getDecisionParticipant(
  db: D1Database,
  decisionId: string,
  userId: string,
  proposalVersion?: number,
): Promise<DecisionParticipant | null> {
  const row = await db
    .prepare(
      "SELECT * FROM decision_participants WHERE decision_id = ? AND proposal_version = " +
        "COALESCE(?, (SELECT proposal_version FROM decision_items WHERE id = ?)) AND user_id = ?",
    )
    .bind(decisionId, proposalVersion ?? null, decisionId, userId)
    .first<Row>();
  return row ? participantFromRow(row) : null;
}

export async function listDecisionParticipants(
  db: D1Database,
  decisionId: string,
  proposalVersion?: number,
): Promise<DecisionParticipant[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM decision_participants WHERE decision_id = ? AND proposal_version = " +
        "COALESCE(?, (SELECT proposal_version FROM decision_items WHERE id = ?)) " +
        "ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'required' THEN 1 WHEN 'consulted' THEN 2 ELSE 3 END, user_id",
    )
    .bind(decisionId, proposalVersion ?? null, decisionId)
    .all<Row>();
  return (rows.results || []).map(participantFromRow);
}

export async function appendAgreementEvent(db: D1Database, input: AgreementEventInput): Promise<AgreementEvent> {
  const event: AgreementEvent = {
    ...input,
    id: input.id || crypto.randomUUID(),
    createdAt: input.createdAt || nowIso(),
  };
  await eventInsertStatement(db, event).run();
  const saved = await db.prepare("SELECT * FROM agreement_events WHERE id = ?").bind(event.id).first<Row>();
  return saved ? eventFromRow(saved) : event;
}

export async function listAgreementEvents(db: D1Database, decisionId: string): Promise<AgreementEvent[]> {
  const rows = await db
    .prepare("SELECT * FROM agreement_events WHERE decision_id = ? ORDER BY created_at, id")
    .bind(decisionId)
    .all<Row>();
  return (rows.results || []).map(eventFromRow);
}

export async function saveAgreementSnapshot(
  db: D1Database,
  decisionInput: DecisionItemInput,
  participantInputs: Omit<DecisionParticipantInput, "decisionId">[],
  eventInput?: Omit<AgreementEventInput, "decisionId" | "proposalVersion">,
): Promise<ThreadDecisionView> {
  const decision = materializeDecision(decisionInput);
  const participants = participantInputs.map((input) =>
    materializeParticipant({ ...input, decisionId: decision.id, proposalVersion: decision.proposalVersion }),
  );
  const statements = [
    decisionUpsertStatement(db, decision, decisionInput.expectedSnapshotToken),
    db
      .prepare(
        "UPDATE agent_actions SET status='cancelled', updated_at=? " +
          "WHERE decision_id=? AND (proposal_version<>? OR snapshot_token<>?) AND status='queued' " +
          "AND action_type NOT IN ('announce_decision','approve_decision') " +
          "AND EXISTS (SELECT 1 FROM decision_items WHERE id=? AND snapshot_token=?)",
      )
      .bind(
        decision.updatedAt,
        decision.id,
        decision.proposalVersion,
        decision.snapshotToken,
        decision.id,
        decision.snapshotToken,
      ),
    ...participants.map((participant) => participantUpsertStatement(db, participant, decision.snapshotToken)),
  ];
  if (eventInput) {
    const event: AgreementEvent = {
      ...eventInput,
      id: eventInput.id || crypto.randomUUID(),
      decisionId: decision.id,
      proposalVersion: decision.proposalVersion,
      createdAt: eventInput.createdAt || decision.updatedAt,
    };
    statements.push(eventInsertStatement(db, event, decision.snapshotToken));
  }
  await db.batch(statements);
  const savedDecision = await getDecision(db, decision.id);
  if (savedDecision?.snapshotToken !== decision.snapshotToken) {
    throw new AgreementSnapshotConflictError(decision.id);
  }
  const view = await getDecisionView(db, decision.id);
  if (!view) throw new Error(`Decision was not saved: ${decision.id}`);
  return view;
}

export class AgreementSnapshotConflictError extends Error {
  constructor(decisionId: string) {
    super(`Agreement snapshot changed concurrently: ${decisionId}`);
    this.name = "AgreementSnapshotConflictError";
  }
}

export async function saveAgentAction(
  db: D1Database,
  input: AgentActionInput | AgentAction,
): Promise<{ action: AgentAction; existing: boolean }> {
  const now = input.updatedAt || nowIso();
  const action: AgentAction = {
    ...input,
    id: input.id || crypto.randomUUID(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  const result = await db
    .prepare(
      "INSERT OR IGNORE INTO agent_actions " +
        "(id, decision_id, proposal_version, snapshot_token, participant_user_id, action_type, delivery_mode, question, reason, confidence, requires_approval, status, external_message_id, created_at, updated_at) " +
        "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? " +
        "WHERE EXISTS (SELECT 1 FROM decision_items WHERE id = ? AND proposal_version = ? " +
        "AND snapshot_token = ? AND (status <> 'decided' OR ? = 'announce_decision'))",
    )
    .bind(
      action.id,
      action.decisionId,
      action.proposalVersion,
      action.snapshotToken,
      action.participantUserId,
      action.kind,
      action.deliveryMode,
      action.question,
      action.reason,
      clampConfidence(action.confidence),
      action.requiresApproval ? 1 : 0,
      action.status,
      action.externalMessageId,
      action.createdAt,
      action.updatedAt,
      action.decisionId,
      action.proposalVersion,
      action.snapshotToken,
      action.kind,
    )
    .run();
  let row = await db.prepare("SELECT * FROM agent_actions WHERE id = ?").bind(action.id).first<Row>();
  let existing = Number(result.meta.changes || 0) === 0;
  if (
    row &&
    action.kind === "approve_decision" &&
    row["status"] !== "sent" &&
    row["status"] !== "completed" &&
    row["snapshot_token"] !== action.snapshotToken
  ) {
    const refreshed = await db.prepare(
      "UPDATE agent_actions SET snapshot_token=?, question=?, reason=?, confidence=?, " +
        "requires_approval=1, status='queued', updated_at=? WHERE id=? AND action_type='approve_decision' " +
        "AND EXISTS (SELECT 1 FROM decision_items WHERE id=agent_actions.decision_id " +
        "AND proposal_version=agent_actions.proposal_version AND snapshot_token=? AND status='ready')",
    ).bind(
      action.snapshotToken,
      action.question,
      action.reason,
      clampConfidence(action.confidence),
      now,
      action.id,
      action.snapshotToken,
    ).run();
    if (Number(refreshed.meta.changes || 0) === 1) {
      row = await db.prepare("SELECT * FROM agent_actions WHERE id = ?").bind(action.id).first<Row>();
      existing = true;
    }
  }
  if (
    row &&
    action.kind === "announce_decision" &&
    row["status"] !== "sent" &&
    row["status"] !== "completed" &&
    row["snapshot_token"] !== action.snapshotToken
  ) {
    const refreshed = await db.prepare(
      "UPDATE agent_actions SET snapshot_token=?, question=?, reason=?, confidence=?, status='queued', " +
        "external_message_id=NULL, updated_at=? WHERE id=? AND action_type='announce_decision' " +
        "AND EXISTS (SELECT 1 FROM decision_items WHERE id=agent_actions.decision_id " +
        "AND proposal_version=agent_actions.proposal_version AND snapshot_token=? AND status='decided')",
    ).bind(
      action.snapshotToken,
      action.question,
      action.reason,
      clampConfidence(action.confidence),
      now,
      action.id,
      action.snapshotToken,
    ).run();
    if (Number(refreshed.meta.changes || 0) === 1) {
      row = await db.prepare("SELECT * FROM agent_actions WHERE id = ?").bind(action.id).first<Row>();
      existing = false;
    }
  }
  if (row && row["status"] === "failed") {
    const retry = await db
      .prepare(
        "UPDATE agent_actions SET status='queued', updated_at=? WHERE id=? AND status='failed' " +
          "AND EXISTS (SELECT 1 FROM decision_items WHERE id=agent_actions.decision_id " +
          "AND snapshot_token=agent_actions.snapshot_token " +
          "AND (status<>'decided' OR agent_actions.action_type='announce_decision'))",
      )
      .bind(now, action.id)
      .run();
    row = await db.prepare("SELECT * FROM agent_actions WHERE id = ?").bind(action.id).first<Row>();
    existing = Number(retry.meta.changes || 0) === 0;
  }
  return {
    action: row ? actionFromRow(row) : { ...action, status: "cancelled" },
    existing,
  };
}

export async function updateAgentActionStatus(
  db: D1Database,
  actionId: string,
  status: AgentActionStatus,
  externalMessageId?: string | null,
): Promise<AgentAction | null> {
  const updatedAt = nowIso();
  await db
    .prepare(
      "UPDATE agent_actions SET status = ?, external_message_id = COALESCE(?, external_message_id), updated_at = ? WHERE id = ?",
    )
    .bind(status, externalMessageId ?? null, updatedAt, actionId)
    .run();
  const row = await db.prepare("SELECT * FROM agent_actions WHERE id = ?").bind(actionId).first<Row>();
  return row ? actionFromRow(row) : null;
}

export async function listDecisionActions(
  db: D1Database,
  decisionId: string,
  proposalVersion?: number,
): Promise<AgentAction[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM agent_actions WHERE decision_id = ? AND proposal_version = " +
        "COALESCE(?, (SELECT proposal_version FROM decision_items WHERE id = ?)) ORDER BY created_at DESC, id",
    )
    .bind(decisionId, proposalVersion ?? null, decisionId)
    .all<Row>();
  return (rows.results || []).map(actionFromRow);
}

export async function getDecisionView(db: D1Database, decisionId: string): Promise<ThreadDecisionView | null> {
  const decision = await getDecision(db, decisionId);
  if (!decision) return null;
  const [participants, actions] = await Promise.all([
    listDecisionParticipants(db, decisionId),
    listDecisionActions(db, decisionId),
  ]);
  return publicDecisionView(decision, participants, actions);
}

function participantIsRequired(decision: DecisionItem, participant: DecisionParticipant): boolean {
  if (participant.role === "informed") return false;
  switch (decision.method) {
    case "owner_decides":
      return participant.role === "owner";
    case "required_approvals":
      return participant.role === "owner" || participant.role === "required";
    case "no_objection":
    case "unanimous":
      return true;
  }
}

function gapQuestion(decision: DecisionItem, participant: DecisionParticipant | undefined, gap: AgreementGap): string {
  switch (gap.kind) {
    case "missing_owner":
      return "この件の最終判断者は誰？";
    case "missing_required_participant":
      return "この判断に必ず確認が必要なのは誰？";
    case "missing_deadline":
      return "異議を受け付ける期限はいつにする？";
    case "awaiting_response":
      return `「${decision.proposal}」について、合意・条件付き合意・懸念あり・判断対象外のどれに近い？`;
    case "unresolved_condition":
      return participant?.condition
        ? `「${participant.condition}」を満たすために、誰が何をいつまでに対応する？`
        : "合意できる条件を具体的に教えて。";
    case "objection":
      return "この案を進めるために解消が必要な懸念は何？";
    case "role_mismatch":
      return "この判断への関与が必要か、役割を確認してもいい？";
  }
}

function publicDecisionView(
  decision: DecisionItem,
  participants: DecisionParticipant[],
  actions: AgentAction[],
): ThreadDecisionView {
  const publicParticipants = participants.map((participant) => ({
    ...participant,
    required: participantIsRequired(decision, participant),
  }));
  const publicGaps = computeAgreementGaps(decision, participants, new Date()).map((gap) => ({
    ...gap,
    type: gap.kind,
    userId: gap.participantUserId,
    question: gapQuestion(
      decision,
      participants.find((participant) => participant.userId === gap.participantUserId),
      gap,
    ),
  }));
  const publicActions = actions.map((action) => ({
    ...action,
    route: action.deliveryMode,
    targetUserId: action.participantUserId,
  }));
  return {
    ...decision,
    question: decision.decisionText,
    version: decision.proposalVersion,
    decisionMethod: decision.method,
    participants: publicParticipants,
    gaps: publicGaps,
    actions: publicActions,
  };
}

export async function getThreadAgreementView(db: D1Database, threadId: string): Promise<ThreadAgreementView> {
  const decisions = await listThreadDecisions(db, threadId);
  const views = await Promise.all(
    decisions.map(async (decision): Promise<ThreadDecisionView> => {
      const [participants, actions] = await Promise.all([
        listDecisionParticipants(db, decision.id),
        listDecisionActions(db, decision.id),
      ]);
      return publicDecisionView(decision, participants, actions);
    }),
  );
  return { decisions: views };
}

export async function listKnownStakeholders(
  db: D1Database,
  excludeThreadId?: string,
  slackOnly = false,
): Promise<KnownStakeholder[]> {
  const excluded = excludeThreadId || "";
  const legacySlackFilter = slackOnly
    ? " AND EXISTS (SELECT 1 FROM messages m WHERE m.thread_id=s.thread_id AND m.user_id=s.user_id AND m.id LIKE 'slack:%')"
    : "";
  const agreementSlackFilter = slackOnly
    ? " AND EXISTS (SELECT 1 FROM messages m WHERE m.thread_id=d.thread_id AND m.user_id=p.user_id AND m.id LIKE 'slack:%')"
    : "";
  const [legacy, agreement] = await Promise.all([
    db
      .prepare(
        "SELECT s.user_id, s.user_name, s.role, s.thread_id, '' AS decision_id, '' AS updated_at " +
          "FROM stakeholders s WHERE s.thread_id <> ?" + legacySlackFilter + " ORDER BY s.id DESC LIMIT 200",
      )
      .bind(excluded)
      .all<Row>(),
    db
      .prepare(
        "SELECT p.user_id, p.user_name, p.role, d.thread_id, p.decision_id, p.updated_at " +
          "FROM decision_participants p JOIN decision_items d ON d.id = p.decision_id " +
          "WHERE d.thread_id <> ?" + agreementSlackFilter + " ORDER BY p.updated_at DESC LIMIT 200",
      )
      .bind(excluded)
      .all<Row>(),
  ]);
  const known = new Map<string, KnownStakeholder>();
  for (const row of [...(legacy.results || []), ...(agreement.results || [])]) {
    const userId = String(row["user_id"]);
    const current = known.get(userId) || {
      userId,
      userName: String(row["user_name"] || userId),
      roles: [],
      threadIds: [],
      decisionCount: 0,
      lastSeenAt: "",
    };
    const role = String(row["role"] || "");
    const threadId = String(row["thread_id"] || "");
    if (role && !current.roles.includes(role)) current.roles.push(role);
    if (threadId && !current.threadIds.includes(threadId)) current.threadIds.push(threadId);
    if (row["decision_id"]) current.decisionCount += 1;
    if (String(row["updated_at"] || "") > current.lastSeenAt) current.lastSeenAt = String(row["updated_at"]);
    if (row["user_name"]) current.userName = String(row["user_name"]);
    known.set(userId, current);
  }
  return [...known.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.userName.localeCompare(b.userName));
}

export async function listAudit(db: D1Database, threadId: string, limit = 20) {
  const rows = await db
    .prepare("SELECT thread_id, reason, confidence, impact, action, created_at FROM interventions WHERE thread_id = ? ORDER BY id DESC LIMIT ?")
    .bind(threadId, limit)
    .all();
  return rows.results || [];
}

export async function playbackView(db: D1Database, threadId: string) {
  const row = await db
    .prepare("SELECT mode, idx, ai_count, last_intervene, last_reason FROM demo_playback WHERE thread_id = ?")
    .bind(threadId)
    .first<{ mode: string; idx: number; ai_count: number; last_intervene: number; last_reason: string }>();
  const mode = row?.mode || "idle";
  const idx = row?.idx || 0;
  let nextSpeaker: string | null = null;
  if (mode === "script" && idx < SCENARIO_MESSAGES.length) {
    const s = await db
      .prepare("SELECT user_name FROM stakeholders WHERE thread_id = ? AND user_id = ?")
      .bind(threadId, SCENARIO_MESSAGES[idx].user_id)
      .first<{ user_name: string }>();
    nextSpeaker = s?.user_name || SCENARIO_MESSAGES[idx].user_id;
  }
  return {
    mode,
    index: idx,
    total: SCENARIO_MESSAGES.length,
    ai_count: row?.ai_count || 0,
    interval_sec: 10,
    next_speaker: nextSpeaker,
    intervene: row?.last_intervene || 0,
    reason: row?.last_reason || "",
  };
}

export async function roomState(db: D1Database, ids: ReturnType<typeof demoIds>, llm: string) {
  await ensureRoom(db, ids);
  const agreements = await getThreadAgreementView(db, ids.threadId);
  return {
    channel: { id: ids.channel, name: ids.name },
    thread_id: ids.threadId,
    title: ids.title,
    llm,
    stakeholders: await listStakeholders(db, ids.threadId),
    messages: await listMessages(db, ids.threadId),
    audit: await listAudit(db, ids.threadId),
    playback: await playbackView(db, ids.threadId),
    agreements,
  };
}

export async function timeline(db: D1Database, threadId: string) {
  const rows = await db
    .prepare("SELECT ts, user_id, text FROM messages WHERE thread_id = ? ORDER BY ts")
    .bind(threadId)
    .all();
  return rows.results || [];
}

export async function graph(db: D1Database, threadId: string) {
  const counts = await db
    .prepare("SELECT user_id, COUNT(*) AS n FROM messages WHERE thread_id = ? GROUP BY user_id")
    .bind(threadId)
    .all<{ user_id: string; n: number }>();
  const holders = await db
    .prepare("SELECT user_id, user_name, role, interests, avatar FROM stakeholders WHERE thread_id = ?")
    .bind(threadId)
    .all<Record<string, string>>();
  const holderById = new Map((holders.results || []).map((r) => [r.user_id, r]));
  const nodes = (counts.results || []).map((c) => {
    const h = holderById.get(c.user_id) || {};
    const agent = c.user_id === ROOMI_USER_ID;
    return {
      id: c.user_id,
      name: agent ? ROOMI_NAME : h.user_name || c.user_id,
      role: agent ? "AI" : h.role || "",
      interests: agent ? "議論に入って、止まっている一点を問う" : h.interests || "",
      avatar: agent ? "/roomi-logo.svg" : h.avatar || "",
      messages: c.n,
      kind: agent ? "agent" : "person",
    };
  });
  const msgs = await db
    .prepare("SELECT user_id FROM messages WHERE thread_id = ? ORDER BY CAST(ts AS REAL), ts")
    .bind(threadId)
    .all<{ user_id: string }>();
  const edges = new Map<string, Record<string, string | number | boolean>>();
  const seq = msgs.results || [];
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1].user_id;
    const b = seq[i].user_id;
    if (a === b) continue;
    const key = [a, b].sort().join("~");
    const prev = edges.get(key);
    if (prev) prev.weight = (prev.weight as number) + 1;
    else edges.set(key, { source: a, target: b, from_user: a, to_user: b, label: "会話", weight: 1, directed: false });
  }
  return { nodes, edges: [...edges.values()] };
}

export async function auditAll(db: D1Database, limit = 50) {
  const rows = await db
    .prepare("SELECT thread_id, reason, confidence, impact, action, created_at FROM interventions ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all();
  return rows.results || [];
}
