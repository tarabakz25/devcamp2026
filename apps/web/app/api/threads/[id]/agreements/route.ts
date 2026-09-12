import { getSession } from "@/lib/auth-server";
import {
  controlCenterConfigured,
  controlCenterThreadAllowed,
  controlCenterUserAllowed,
} from "@/lib/control-center-access";

import { fetchBackend } from "@/lib/backend";

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

const DEV_FALLBACK_DECISIONS: Record<string, unknown[]> = {
  trash: [
    {
      id: "dec-trash-1",
      threadId: "trash",
      question: "ゴミ出し当番のローテーション順序と休日の運用ルール",
      proposal: "週次ローテーションでA棟→B棟の順序で交代。祝日・連休中のゴミ出しは翌朝に繰り越し対応とする。",
      version: 1,
      decisionMethod: "consensus",
      ownerUserId: "U-SAKUMA",
      deadline: "2026-09-15",
      status: "decided",
      confidence: 0.95,
      participants: [
        {
          userId: "U-SAKUMA",
          userName: "佐久間大樹",
          role: "owner",
          required: true,
          stance: "agreed",
          condition: null,
          conditionResolution: null,
          confidence: 0.95,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-SUGIURA",
          userName: "杉浦航",
          role: "participant",
          required: true,
          stance: "agreed",
          condition: null,
          conditionResolution: null,
          confidence: 0.9,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-MATSUI",
          userName: "松井凛",
          role: "participant",
          required: true,
          stance: "agreed",
          condition: null,
          conditionResolution: null,
          confidence: 0.9,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-OZAKI",
          userName: "尾崎律",
          role: "participant",
          required: false,
          stance: "agreed",
          condition: null,
          conditionResolution: null,
          confidence: 0.9,
          evidenceMessageIds: [],
          contactedAt: null,
        },
      ],
      gaps: [],
      actions: [
        {
          id: "act-trash-1",
          route: "thread",
          targetUserId: null,
          question: "確定ルールを共用部掲示板およびSlackピン留めに反映",
          reason: "全棟メンバーへの周知徹底",
          status: "sent",
          requiresApproval: false,
          confidence: 0.95,
        },
      ],
    },
  ],
  "kitchen-booking": [
    {
      id: "dec-kitchen-1",
      threadId: "kitchen-booking",
      question: "週末の共用キッチン予約ルール（先着制 vs 棟別枠制）",
      proposal: "土曜午前は棟ごとの優先枠（隔週交代）、午後は全棟共有の先着予約制とする。",
      version: 2,
      decisionMethod: "owner_decides",
      ownerUserId: "U-SUGIURA",
      deadline: "2026-09-18",
      status: "review",
      confidence: 0.78,
      participants: [
        {
          userId: "U-SUGIURA",
          userName: "杉浦航",
          role: "owner",
          required: true,
          stance: "conditional",
          condition: "午前中の棟別枠を確保できること",
          conditionResolution: "隔週で優先順位を入れ替える運用案を提示中",
          confidence: 0.85,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-MATSUI",
          userName: "松井凛",
          role: "participant",
          required: true,
          stance: "conditional",
          condition: "直前のキャンセル枠を誰でも使えるようにすること",
          conditionResolution: null,
          confidence: 0.8,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-OZAKI",
          userName: "尾崎律",
          role: "participant",
          required: false,
          stance: "unconfirmed",
          condition: null,
          conditionResolution: null,
          confidence: 0.7,
          evidenceMessageIds: [],
          contactedAt: null,
        },
      ],
      gaps: [
        {
          type: "divergent_policy",
          userId: null,
          question: "杉浦と松井の間で先着制 vs 棟枠制の意見相違が残っている",
          priority: "high",
          blocking: true,
          confidence: 0.82,
        },
      ],
      actions: [
        {
          id: "act-kitchen-1",
          route: "thread",
          targetUserId: null,
          question: "土曜午前の棟枠制と午後フリー枠の折衷案に対する各棟代表の合意確認",
          reason: "利用公平性の確保",
          status: "pending",
          requiresApproval: true,
          confidence: 0.8,
        },
      ],
    },
  ],
  noise: [
    {
      id: "dec-noise-1",
      threadId: "noise",
      question: "22時以降の共用部の消音ルールと運用主体の決定",
      proposal: "22時消灯・会話トーン制限。注意喚起を行う運用責任者を週番で設置する。",
      version: 1,
      decisionMethod: "owner_decides",
      ownerUserId: "U-SASAKI",
      deadline: "2026-09-20",
      status: "blocked",
      confidence: 0.65,
      participants: [
        {
          userId: "U-SASAKI",
          userName: "高橋さくら",
          role: "owner",
          required: true,
          stance: "agreed",
          condition: null,
          conditionResolution: null,
          confidence: 0.9,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-MERRITT",
          userName: "森田カイ",
          role: "participant",
          required: true,
          stance: "opposed",
          condition: "ルール過多による共用部の居心地低下を懸念",
          conditionResolution: null,
          confidence: 0.85,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-KIZUKI",
          userName: "藤井湊",
          role: "participant",
          required: true,
          stance: "conditional",
          condition: "注意役の負担が特定の人に偏らない仕組みが必要",
          conditionResolution: null,
          confidence: 0.8,
          evidenceMessageIds: [],
          contactedAt: null,
        },
        {
          userId: "U-YAMAJI",
          userName: "加藤海斗",
          role: "participant",
          required: false,
          stance: "conditional",
          condition: "まずは1週間の試験運用で様子を見たい",
          conditionResolution: null,
          confidence: 0.75,
          evidenceMessageIds: [],
          contactedAt: null,
        },
      ],
      gaps: [
        {
          type: "unassigned_owner",
          userId: null,
          question: "ルール制定後の運用責任者・注意役が未定",
          priority: "high",
          blocking: true,
          confidence: 0.88,
        },
      ],
      actions: [
        {
          id: "act-noise-1",
          route: "thread",
          targetUserId: "U-SASAKI",
          question: "22時以降の運用責任者（当番制または管理人）の選定",
          reason: "実効性のある運用体制の確立",
          status: "pending",
          requiresApproval: true,
          confidence: 0.85,
        },
      ],
    },
  ],
};

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const isDev = process.env.NODE_ENV !== "production";
  const session = await getSession();
  if (!session && !isDev) return Response.json({ decisions: [] }, { status: 401 });
  if (!controlCenterConfigured()) return Response.json({ decisions: [] }, { status: 503 });
  const userEmail = session?.user?.email ?? (isDev ? "dev@example.com" : null);
  if (!controlCenterUserAllowed(userEmail) || !controlCenterThreadAllowed(params.id)) {
    return Response.json({ decisions: [] }, { status: 403 });
  }

  try {
    const threadId = encodeURIComponent(params.id);
    const response = await fetchBackend(`/api/threads/${threadId}/agreements`, {
      cache: "no-store",
      headers: process.env.AGREEMENT_API_TOKEN
        ? { authorization: `Bearer ${process.env.AGREEMENT_API_TOKEN}` }
        : undefined,
    });

    if (response.ok) {
      const payload = record(await response.json());
      const decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
      return Response.json({ decisions: decisions.map(normalizeDecision) });
    }

    // In non-production, fallback to mock decisions if available
    if (process.env.NODE_ENV !== "production" && DEV_FALLBACK_DECISIONS[params.id]) {
      return Response.json({
        decisions: DEV_FALLBACK_DECISIONS[params.id].map(normalizeDecision),
      });
    }

    return Response.json({ decisions: [] }, { status: 502 });
  } catch {
    if (process.env.NODE_ENV !== "production" && DEV_FALLBACK_DECISIONS[params.id]) {
      return Response.json({
        decisions: DEV_FALLBACK_DECISIONS[params.id].map(normalizeDecision),
      });
    }
    return Response.json({ decisions: [] }, { status: 502 });
  }
}
