import { getSession } from "@/lib/auth-server";
import {
  controlCenterConfigured,
  controlCenterThreadAllowed,
  controlCenterUserAllowed,
} from "@/lib/control-center-access";

const DASH = process.env.WORKER_URL ?? process.env.DASHBOARD_URL ?? "http://localhost:8000";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function value(source: UnknownRecord, camel: string, snake: string) {
  return source[camel] ?? source[snake];
}

function stringValue(input: unknown, fallback = "") {
  return typeof input === "string" ? input : fallback;
}

function nullableString(input: unknown) {
  return typeof input === "string" && input.length > 0 ? input : null;
}

function numberValue(input: unknown, fallback = 0) {
  return typeof input === "number" && Number.isFinite(input) ? input : fallback;
}

function booleanValue(input: unknown, fallback = false) {
  return typeof input === "boolean" ? input : fallback;
}

function normalizeParticipant(input: unknown) {
  const participant = record(input);
  const evidence = value(participant, "evidenceMessageIds", "evidence_message_ids");
  const role = stringValue(participant.role);
  const required = participant.required;

  return {
    userId: stringValue(value(participant, "userId", "user_id")),
    userName: stringValue(value(participant, "userName", "user_name")),
    role,
    required: typeof required === "boolean" ? required : role === "owner" || role === "required",
    stance: stringValue(participant.stance, "unconfirmed"),
    condition: nullableString(
      participant.condition ?? value(participant, "conditionText", "condition_text"),
    ),
    conditionResolution: nullableString(
      value(participant, "conditionResolution", "condition_resolution"),
    ),
    confidence: numberValue(participant.confidence),
    evidenceMessageIds: Array.isArray(evidence)
      ? evidence.filter((item): item is string => typeof item === "string")
      : [],
    contactedAt: nullableString(value(participant, "contactedAt", "contacted_at")),
  };
}

function normalizeGap(input: unknown) {
  const gap = record(input);
  return {
    type: stringValue(gap.type ?? gap.kind, "unknown"),
    userId: nullableString(
      value(gap, "userId", "user_id") ??
        value(gap, "participantUserId", "participant_user_id"),
    ),
    question: stringValue(gap.question ?? gap.description),
    priority: stringValue(gap.priority, "medium"),
    blocking: booleanValue(gap.blocking, true),
    confidence: numberValue(gap.confidence),
  };
}

function normalizeAction(input: unknown) {
  const action = record(input);
  return {
    id: stringValue(action.id),
    route: stringValue(
      action.route ?? value(action, "deliveryMode", "delivery_mode"),
      "thread",
    ),
    targetUserId: nullableString(
      value(action, "targetUserId", "target_user_id") ??
        value(action, "participantUserId", "participant_user_id"),
    ),
    question: stringValue(action.question),
    reason: stringValue(action.reason),
    status: stringValue(action.status, "pending"),
    requiresApproval: booleanValue(value(action, "requiresApproval", "requires_approval")),
    confidence: numberValue(action.confidence),
  };
}

function normalizeDecision(input: unknown) {
  const decision = record(input);
  const participants = decision.participants;
  const gaps = decision.gaps;
  const actions = decision.actions;

  return {
    id: stringValue(decision.id),
    threadId: stringValue(value(decision, "threadId", "thread_id")),
    question: stringValue(
      decision.question ?? value(decision, "decisionText", "decision_text"),
    ),
    proposal: nullableString(decision.proposal),
    version: numberValue(
      decision.version ?? value(decision, "proposalVersion", "proposal_version"),
      1,
    ),
    decisionMethod: stringValue(
      value(decision, "decisionMethod", "decision_method") ?? decision.method,
    ),
    ownerUserId: nullableString(value(decision, "ownerUserId", "owner_user_id")),
    deadline: nullableString(decision.deadline),
    status: stringValue(decision.status, "open"),
    confidence: numberValue(decision.confidence),
    participants: Array.isArray(participants) ? participants.map(normalizeParticipant) : [],
    gaps: Array.isArray(gaps) ? gaps.map(normalizeGap) : [],
    actions: Array.isArray(actions) ? actions.map(normalizeAction) : [],
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return Response.json({ decisions: [] }, { status: 401 });
  if (!controlCenterConfigured()) return Response.json({ decisions: [] }, { status: 503 });
  if (!controlCenterUserAllowed(session.user.email) || !controlCenterThreadAllowed(params.id)) {
    return Response.json({ decisions: [] }, { status: 403 });
  }

  try {
    const threadId = encodeURIComponent(params.id);
    const response = await fetch(`${DASH}/api/threads/${threadId}/agreements`, {
      cache: "no-store",
      headers: process.env.AGREEMENT_API_TOKEN
        ? { authorization: `Bearer ${process.env.AGREEMENT_API_TOKEN}` }
        : undefined,
    });

    if (!response.ok) {
      return Response.json({ decisions: [] }, { status: 502 });
    }

    const payload = record(await response.json());
    const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
    return Response.json({ decisions: decisions.map(normalizeDecision) });
  } catch {
    return Response.json({ decisions: [] }, { status: 502 });
  }
}
