export type DecisionMethod = "owner_decides" | "required_approvals" | "no_objection" | "unanimous";

export type DecisionStatus = "discovering" | "gathering" | "ready" | "decided" | "reopened";

export type StakeholderRole = "owner" | "required" | "consulted" | "informed";

export type Stance = "agreed" | "conditional" | "objected" | "unknown" | "not_applicable";

export type StanceSource = "analysis" | "explicit";

export type ContactState = "not_contacted" | "queued" | "contacted" | "responded" | "failed";

export type ContactMode = "thread" | "dm";

export type AgreementGapKind =
  | "missing_owner"
  | "missing_required_participant"
  | "missing_deadline"
  | "awaiting_response"
  | "unresolved_condition"
  | "objection"
  | "role_mismatch";

export type AgreementActionKind =
  | "announce_decision"
  | "approve_decision"
  | "identify_owner"
  | "identify_required_participant"
  | "identify_deadline"
  | "request_stance"
  | "resolve_condition"
  | "address_objection"
  | "clarify_role";

export type AgentActionStatus = "queued" | "sent" | "completed" | "failed" | "cancelled";

export type AgreementEventType =
  | "decision_created"
  | "proposal_changed"
  | "participant_added"
  | "stance_recorded"
  | "condition_recorded"
  | "action_sent"
  | "action_completed"
  | "decision_decided"
  | "decision_reopened"
  | "manual_correction";

export interface DecisionItem {
  id: string;
  threadId: string;
  decisionText: string;
  proposal: string;
  proposalVersion: number;
  method: DecisionMethod;
  status: DecisionStatus;
  ownerUserId: string | null;
  deadline: string | null;
  evidenceMessageIds: string[];
  confidence: number;
  snapshotToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionParticipant {
  decisionId: string;
  proposalVersion: number;
  userId: string;
  userName: string;
  role: StakeholderRole;
  stance: Stance;
  stanceSource: StanceSource;
  condition: string | null;
  conditionResolution: string | null;
  evidenceMessageIds: string[];
  confidence: number;
  contactState: ContactState;
  contactMode: ContactMode;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementGap {
  decisionId: string;
  proposalVersion: number;
  kind: AgreementGapKind;
  participantUserId: string | null;
  description: string;
  priority: "high" | "medium" | "low";
  blocking: boolean;
  confidence: number;
}

export interface AgentAction {
  id: string;
  decisionId: string;
  proposalVersion: number;
  snapshotToken: string;
  participantUserId: string | null;
  kind: AgreementActionKind;
  deliveryMode: ContactMode;
  question: string;
  reason: string;
  confidence: number;
  requiresApproval: boolean;
  status: AgentActionStatus;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgreementEvent {
  id: string;
  decisionId: string;
  proposalVersion: number;
  type: AgreementEventType;
  actorUserId: string | null;
  participantUserId: string | null;
  messageId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DecisionChange {
  changed: boolean;
  previousProposal: string;
  nextProposal: string;
  previousVersion: number;
  nextVersion: number;
}

function relevantParticipants(decision: DecisionItem, participants: DecisionParticipant[]): DecisionParticipant[] {
  const owner = participants.filter(
    (participant) => participant.role === "owner" && participant.userId === decision.ownerUserId,
  );
  switch (decision.method) {
    case "owner_decides":
      return owner;
    case "required_approvals":
      return [
        ...owner,
        ...participants.filter(
          (participant) => participant.role === "required" && participant.userId !== decision.ownerUserId,
        ),
      ];
    case "no_objection":
    case "unanimous":
      return participants.filter((participant) => participant.role !== "informed");
  }
}

function participantLabel(participant: DecisionParticipant): string {
  return participant.userName || participant.userId;
}

/**
 * Derives the missing agreement work from current state. It deliberately keeps
 * `unknown` separate from both agreement and objection.
 */
function deadlineReached(deadline: string | null, now?: string | Date): boolean {
  if (!deadline || now == null) return false;
  const deadlineMs = /^\d{4}-\d{2}-\d{2}$/.test(deadline)
    ? Date.parse(`${deadline}T23:59:59.999+09:00`)
    : Date.parse(deadline);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(deadlineMs) && Number.isFinite(nowMs) && nowMs >= deadlineMs;
}

function validDeadline(deadline: string | null): boolean {
  return Boolean(deadline && Number.isFinite(Date.parse(deadline)));
}

export function computeAgreementGaps(
  decision: DecisionItem,
  participants: DecisionParticipant[],
  now?: string | Date,
): AgreementGap[] {
  const gaps: AgreementGap[] = [];
  const relevant = relevantParticipants(decision, participants);

  const requiresOwner = decision.method === "owner_decides" || decision.method === "required_approvals";
  const hasOwner = Boolean(
    decision.ownerUserId &&
      participants.some(
        (participant) => participant.userId === decision.ownerUserId && participant.role === "owner",
      ),
  );
  if (requiresOwner && !hasOwner) {
    gaps.push({
      decisionId: decision.id,
      proposalVersion: decision.proposalVersion,
      kind: "missing_owner",
      participantUserId: null,
      description: "最終判断者が特定されていない",
      priority: "high",
      blocking: true,
      confidence: decision.confidence,
    });
  }

  if (
    decision.method === "required_approvals" &&
    !participants.some((participant) => participant.role === "required")
  ) {
    gaps.push({
      decisionId: decision.id,
      proposalVersion: decision.proposalVersion,
      kind: "missing_required_participant",
      participantUserId: null,
      description: "承認が必要な関係者が特定されていない",
      priority: "high",
      blocking: true,
      confidence: decision.confidence,
    });
  }

  if (
    (decision.method === "unanimous" || decision.method === "no_objection") &&
    relevant.length === 0
  ) {
    gaps.push({
      decisionId: decision.id,
      proposalVersion: decision.proposalVersion,
      kind: "missing_required_participant",
      participantUserId: null,
      description: "合意対象の関係者が特定されていない",
      priority: "high",
      blocking: true,
      confidence: decision.confidence,
    });
  }

  if (
    decision.method === "no_objection" &&
    relevant.length > 0 &&
    relevant.every((participant) => participant.stance === "not_applicable")
  ) {
    gaps.push({
      decisionId: decision.id,
      proposalVersion: decision.proposalVersion,
      kind: "missing_required_participant",
      participantUserId: null,
      description: "異議確認の対象者が特定されていない",
      priority: "high",
      blocking: true,
      confidence: decision.confidence,
    });
  }

  if (decision.method === "no_objection" && !validDeadline(decision.deadline)) {
    gaps.push({
      decisionId: decision.id,
      proposalVersion: decision.proposalVersion,
      kind: "missing_deadline",
      participantUserId: null,
      description: "異議を受け付ける期限が決まっていない",
      priority: "high",
      blocking: true,
      confidence: decision.confidence,
    });
  }

  for (const participant of relevant) {
    const label = participantLabel(participant);
    if (participant.stance === "conditional") {
      gaps.push({
        decisionId: decision.id,
        proposalVersion: decision.proposalVersion,
        kind: "unresolved_condition",
        participantUserId: participant.userId,
        description: participant.condition
          ? `${label}の合意条件が未達: ${participant.condition}`
          : `${label}の合意条件が特定されていない`,
        priority: "high",
        blocking: true,
        confidence: participant.confidence,
      });
      continue;
    }

    if (participant.stance === "objected") {
      gaps.push({
        decisionId: decision.id,
        proposalVersion: decision.proposalVersion,
        kind: "objection",
        participantUserId: participant.userId,
        description: `${label}の懸念が未解決`,
        priority: "high",
        blocking: true,
        confidence: participant.confidence,
      });
      continue;
    }

    if (participant.stance === "not_applicable") {
      const mustParticipate =
        participant.role === "owner" ||
        decision.method === "unanimous" ||
        (participant.role === "required" && decision.method === "required_approvals");
      if (mustParticipate) {
        gaps.push({
          decisionId: decision.id,
          proposalVersion: decision.proposalVersion,
          kind: "role_mismatch",
          participantUserId: participant.userId,
          description: `${label}の必須性と「判断対象外」の回答が一致していない`,
          priority: "high",
          blocking: true,
          confidence: participant.confidence,
        });
      }
      continue;
    }

    if (participant.stance === "unknown") {
      // Silence remains unknown. Under a no-objection rule it only stops
      // blocking after the person was contacted and the objection window ended.
      const contacted = participant.contactState === "contacted" || participant.contactState === "responded";
      const objectionWindowEnded = deadlineReached(decision.deadline, now);
      gaps.push({
        decisionId: decision.id,
        proposalVersion: decision.proposalVersion,
        kind: "awaiting_response",
        participantUserId: participant.userId,
        description: `${label}の立場が未確認`,
        priority: contacted && objectionWindowEnded ? "low" : "medium",
        blocking: decision.method !== "no_objection" || !contacted || !objectionWindowEnded,
        confidence: participant.confidence,
      });
    }
  }

  return gaps;
}

export function isDecisionSatisfied(
  decision: DecisionItem,
  participants: DecisionParticipant[],
  now?: string | Date,
): boolean {
  if (decision.status === "discovering" || decision.status === "reopened") return false;
  const relevant = relevantParticipants(decision, participants);
  if (relevant.length === 0) return false;
  return !computeAgreementGaps(decision, participants, now).some((gap) => gap.blocking);
}

function actionForGap(decision: DecisionItem, participant: DecisionParticipant | undefined, gap: AgreementGap): AgentAction {
  let kind: AgreementActionKind;
  let question: string;
  switch (gap.kind) {
    case "missing_owner":
      kind = "identify_owner";
      question = "この件の最終判断者は誰？";
      break;
    case "missing_required_participant":
      kind = "identify_required_participant";
      question = "この判断に必ず確認が必要なのは誰？";
      break;
    case "missing_deadline":
      kind = "identify_deadline";
      question = "異議を受け付ける期限はいつにする？";
      break;
    case "unresolved_condition":
      if (participant?.conditionResolution) {
        kind = "request_stance";
        question = `条件への対応案「${participant.conditionResolution}」で合意できる？`;
      } else {
        kind = "resolve_condition";
        question = participant?.condition
          ? `「${participant.condition}」を満たすために、誰が何をいつまでに対応する？`
          : "合意できる条件を具体的に教えて。";
      }
      break;
    case "objection":
      if (participant?.conditionResolution) {
        kind = "request_stance";
        question = `懸念への対応案「${participant.conditionResolution}」で合意できる？`;
      } else {
        kind = "address_objection";
        question = participant?.condition
          ? `懸念「${participant.condition}」を解消するために、誰が何をいつまでに対応する？`
          : "この案を進めるために解消が必要な懸念は何？";
      }
      break;
    case "role_mismatch":
      kind = "clarify_role";
      question = "この判断への関与が必要か、役割を確認してもいい？";
      break;
    case "awaiting_response":
      kind = "request_stance";
      question = `「${decision.proposal}」について、合意・条件付き合意・懸念あり・判断対象外のどれに近い？`;
      break;
  }
  const target = participant?.userId ?? "thread";
  const questionKey = stableHash(`${gap.kind}:${question}`);
  return {
    id: `agreement:${decision.id}:v${decision.proposalVersion}:${decision.snapshotToken}:${gap.kind}:${target}:${questionKey}`,
    decisionId: decision.id,
    proposalVersion: decision.proposalVersion,
    snapshotToken: decision.snapshotToken,
    participantUserId: participant?.userId ?? null,
    kind,
    deliveryMode: participant?.contactMode ?? "thread",
    question,
    reason: gap.description,
    confidence: Math.min(decision.confidence, gap.confidence),
    requiresApproval: Math.min(decision.confidence, gap.confidence) < 0.8,
    status: "queued",
    externalMessageId: null,
    createdAt: decision.updatedAt,
    updatedAt: decision.updatedAt,
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** Chooses one deterministic, idempotency-keyed action for the highest priority gap. */
export function selectNextAgreementAction(
  decision: DecisionItem,
  participants: DecisionParticipant[],
  gaps: AgreementGap[] = computeAgreementGaps(decision, participants),
): AgentAction | null {
  if (decision.status === "decided") return null;
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const gap = gaps.filter((candidate) => candidate.blocking).sort((a, b) => rank[a.priority] - rank[b.priority])[0];
  if (!gap) return null;
  const participant = participants.find((candidate) => candidate.userId === gap.participantUserId);
  return actionForGap(decision, participant, gap);
}

function normalizedProposal(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function detectDecisionChange(previousProposal: string, nextProposal: string): boolean;
export function detectDecisionChange(
  previousDecision: Pick<DecisionItem, "proposal" | "proposalVersion">,
  nextProposal: string,
): DecisionChange;
export function detectDecisionChange(
  previous: string | Pick<DecisionItem, "proposal" | "proposalVersion">,
  nextProposal: string,
): boolean | DecisionChange {
  const previousProposal = typeof previous === "string" ? previous : previous.proposal;
  const changed = normalizedProposal(previousProposal) !== normalizedProposal(nextProposal);
  if (typeof previous === "string") return changed;
  return {
    changed,
    previousProposal,
    nextProposal,
    previousVersion: previous.proposalVersion,
    nextVersion: changed ? previous.proposalVersion + 1 : previous.proposalVersion,
  };
}
