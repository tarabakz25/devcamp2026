export type TopicKind = "announcement" | "decision" | "incident" | "discussion";

export type CommunicationMessage = {
  userId: string;
  text: string;
};

export type CommunicationDimensions = {
  progress: number;
  responsiveness: number | null;
  clarity: number;
  frictionFree: number;
  participation: number | null;
};

export type CommunicationSignals = {
  resolution: boolean;
  assignment: boolean;
  deadline: boolean;
  actionProposal: boolean;
  conflict: boolean;
  repetition: number;
  unansweredQuestions: number;
};

export type ScoreEvidence = {
  signal: keyof CommunicationSignals;
  messageIndexes: number[];
};

export type CommunicationScore = {
  version: "heuristic-v1";
  topicKind: TopicKind;
  overall: number;
  confidence: number;
  dimensions: CommunicationDimensions;
  signals: CommunicationSignals;
  evidence: ScoreEvidence[];
};

export type ScoreDecisionTrigger =
  | "mention"
  | "cooldown"
  | "resolved"
  | "insufficient_data"
  | "low_score"
  | "healthy";

export type ScoreInterventionDecision = {
  respond: boolean;
  action: "silent" | "reply";
  trigger: ScoreDecisionTrigger;
  reason: string;
  threshold: number;
  cooldownRemainingSec: number;
  score: CommunicationScore;
};

export type ScoreDecisionInput = {
  topicKind: TopicKind;
  messages: CommunicationMessage[];
  nowSec: number;
  lastInterventionAtSec: number | null;
  cooldownSec?: number;
};

const RESOLUTION_TOKENS = ["決まり", "合意", "確定", "対応済み", "完了", "解決"];
const RESOLUTION_NEGATIONS = [
  "決まらない",
  "決まっていない",
  "合意できない",
  "合意していない",
  "未確定",
  "未対応",
  "未完了",
  "未解決",
  "完了していない",
  "完了できていない",
  "完了できていません",
  "解決できていない",
  "解決できていません",
];
const REOPEN_TOKENS = ["でも", "しかし", "反対", "未解決", "決まっていない", "合意できない", "納得できない"];
const ASSIGNMENT_TOKENS = ["私が", "担当", "対応します", "共有します", "進めます"];
const ASSIGNMENT_NEGATIONS = ["担当未定", "担当も未定", "担当が未定", "担当は未定", "担当が決まっていない"];
const DEADLINE_PATTERNS = [/今日中/, /明日/, /今週/, /来週/, /午前/, /午後/, /\d{1,2}:\d{2}/, /\d{1,2}時まで/];
const ACTION_PROPOSAL_TOKENS = ["提案", "試す", "比較", "確認して", "決め方", "進めたい", "進めます"];
const DIRECTIVE_TOKENS = ["してください", "てください", "必要", "専用", "べき", "分けて", "禁止"];
const RESISTANCE_TOKENS = ["続けたい", "変えたくない", "難しい", "できない", "反対", "納得できない"];
const UNRESOLVED_TOKENS = ["未定", "未解決", "決まっていない", "分からない", "まだ"];
const ANSWER_TOKENS = ["決まり", "確定", "担当します", "対応します", "共有します", "確認しました", "回答", "了解"];
const ACKNOWLEDGEMENT_TOKENS = ["了解", "賛成", "その進め方", "問題ありません", "お願いします"];

const WEIGHTS: Record<TopicKind, Partial<Record<keyof CommunicationDimensions, number>>> = {
  announcement: { progress: 0.45, clarity: 0.35, frictionFree: 0.2 },
  decision: {
    progress: 0.35,
    responsiveness: 0.2,
    clarity: 0.2,
    frictionFree: 0.2,
    participation: 0.05,
  },
  incident: {
    progress: 0.3,
    responsiveness: 0.3,
    clarity: 0.25,
    frictionFree: 0.1,
    participation: 0.05,
  },
  discussion: {
    progress: 0.3,
    responsiveness: 0.25,
    clarity: 0.15,
    frictionFree: 0.2,
    participation: 0.1,
  },
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function includesAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}

function isQuestion(text: string): boolean {
  if (/[?？]/.test(text)) return true;
  return /どう(?:する|します|決め|すれば|なって)|なぜ(?:です|なの|か)|いつ(?:決め|まで|です|に|から|か)|誰(?:が|に|です|か)|どこ(?:で|に|へ|です|か)|どちら(?:に|を|が|です|か)/.test(text);
}

function isResolved(text: string): boolean {
  return includesAny(text, RESOLUTION_TOKENS) &&
    !includesAny(text, RESOLUTION_NEGATIONS) &&
    !isQuestion(text);
}

function activeResolution(messages: CommunicationMessage[]): { active: boolean; index: number | null } {
  let resolutionIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (isResolved(messages[index].text)) resolutionIndex = index;
  }
  for (let index = 0; index < messages.length - 1; index += 1) {
    const proposal = messages[index];
    const actionable = hasAssignment(proposal.text) &&
      (hasDeadline(proposal.text) || includesAny(proposal.text, ACTION_PROPOSAL_TOKENS));
    if (!actionable) continue;
    const acknowledgementIndex = messages.slice(index + 1).findIndex((message) =>
      message.userId !== proposal.userId &&
      includesAny(message.text, ACKNOWLEDGEMENT_TOKENS) &&
      !isQuestion(message.text) &&
      !includesAny(message.text, REOPEN_TOKENS),
    );
    if (acknowledgementIndex >= 0) resolutionIndex = index + acknowledgementIndex + 1;
  }
  if (resolutionIndex < 0) return { active: false, index: null };
  const reopened = messages.slice(resolutionIndex + 1).some((message) =>
    isQuestion(message.text) ||
      includesAny(message.text, REOPEN_TOKENS) ||
      includesAny(message.text, RESISTANCE_TOKENS),
  );
  return { active: !reopened, index: resolutionIndex + 1 };
}

function hasDeadline(text: string): boolean {
  return DEADLINE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasAssignment(text: string): boolean {
  return includesAny(text, ASSIGNMENT_TOKENS) && !includesAny(text, ASSIGNMENT_NEGATIONS);
}

function messageIndexes(messages: CommunicationMessage[], predicate: (text: string) => boolean): number[] {
  return messages.flatMap((message, index) => (predicate(message.text) ? [index + 1] : []));
}

function normalizeForSimilarity(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function ngrams(text: string, size = 3): Set<string> {
  const normalized = Array.from(normalizeForSimilarity(text));
  const values = new Set<string>();
  for (let index = 0; index <= normalized.length - size; index += 1) {
    values.add(normalized.slice(index, index + size).join(""));
  }
  return values;
}

function similarity(left: string, right: string): number {
  const a = ngrams(left);
  const b = ngrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function repeatedMessageIndexes(messages: CommunicationMessage[]): number[] {
  const repeated = new Set<number>();
  for (let current = 1; current < messages.length; current += 1) {
    for (let previous = 0; previous < current; previous += 1) {
      if (
        normalizeForSimilarity(messages[current].text).length >= 12 &&
        similarity(messages[current].text, messages[previous].text) >= 0.45
      ) {
        repeated.add(previous + 1);
        repeated.add(current + 1);
        break;
      }
    }
  }
  return [...repeated];
}

function analyzeQuestions(messages: CommunicationMessage[]): {
  answered: number;
  pending: number;
  stalledIndexes: number[];
} {
  let answered = 0;
  let pending = 0;
  const stalledIndexes: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const question = messages[index];
    if (!isQuestion(question.text)) continue;
    const following = messages.slice(index + 1, index + 4);
    if (following.length === 0) {
      pending += 1;
      continue;
    }
    const hasAnswer = following.some((candidate) => {
      if (candidate.userId === question.userId || isQuestion(candidate.text)) return false;
      if (includesAny(candidate.text, UNRESOLVED_TOKENS)) return false;
      return includesAny(candidate.text, ANSWER_TOKENS) || isResolved(candidate.text);
    });
    if (hasAnswer) answered += 1;
    else stalledIndexes.push(index + 1);
  }
  return { answered, pending, stalledIndexes };
}

function hasCrossUserConflict(messages: CommunicationMessage[]): boolean {
  const directiveUsers = new Set(
    messages.filter((message) => includesAny(message.text, DIRECTIVE_TOKENS)).map((message) => message.userId),
  );
  const resistanceUsers = new Set(
    messages.filter((message) => includesAny(message.text, RESISTANCE_TOKENS)).map((message) => message.userId),
  );
  return [...directiveUsers].some((left) => [...resistanceUsers].some((right) => left !== right));
}

function participationScore(messages: CommunicationMessage[]): number | null {
  const counts = new Map<string, number>();
  for (const message of messages) counts.set(message.userId, (counts.get(message.userId) || 0) + 1);
  if (counts.size < 2) return null;
  const total = messages.length;
  const entropy = [...counts.values()].reduce((sum, count) => {
    const ratio = count / total;
    return sum - ratio * Math.log(ratio);
  }, 0);
  return Math.round((entropy / Math.log(counts.size)) * 100);
}

function weightedScore(topicKind: TopicKind, dimensions: CommunicationDimensions): number {
  const weights = WEIGHTS[topicKind];
  let sum = 0;
  let weightSum = 0;
  for (const key of Object.keys(weights) as Array<keyof CommunicationDimensions>) {
    const value = dimensions[key];
    const weight = weights[key] || 0;
    if (value === null || weight === 0) continue;
    sum += value * weight;
    weightSum += weight;
  }
  return Math.round(sum / weightSum);
}

export function scoreCommunication(
  messages: CommunicationMessage[],
  topicKind: TopicKind,
): CommunicationScore {
  const window = messages.slice(-10);
  const windowOffset = messages.length - window.length;
  const latest = window.at(-1)?.text || "";
  const resolutionState = activeResolution(window);
  const resolution = resolutionState.active;
  const assignment = hasAssignment(latest);
  const deadline = hasDeadline(latest);
  const actionProposal = includesAny(latest, ACTION_PROPOSAL_TOKENS);
  const conflict = hasCrossUserConflict(window);
  const repeatedIndexes = repeatedMessageIndexes(window);
  const questions = analyzeQuestions(window);
  const unansweredIndexes = questions.stalledIndexes;
  const evaluatedQuestionCount = questions.answered + questions.stalledIndexes.length;
  const signals: CommunicationSignals = {
    resolution,
    assignment,
    deadline,
    actionProposal,
    conflict,
    repetition: Math.floor(repeatedIndexes.length / 2),
    unansweredQuestions: unansweredIndexes.length,
  };
  const dimensions: CommunicationDimensions = {
    progress: Math.round(
      clamp(
        60 +
          (resolution ? 25 : 0) +
          (assignment ? 15 : 0) +
          (deadline ? 10 : 0) -
          (conflict ? 25 : 0) -
          unansweredIndexes.length * 25 -
          signals.repetition * 10,
      ),
    ),
    responsiveness: evaluatedQuestionCount === 0
      ? null
      : Math.round((questions.answered / evaluatedQuestionCount) * 100),
    clarity: Math.round(
      clamp(
        40 +
          (resolution ? 25 : 0) +
          (assignment ? 20 : 0) +
          (deadline ? 15 : 0) +
          (actionProposal ? 10 : 0),
      ),
    ),
    frictionFree: Math.round(clamp(100 - (conflict ? 45 : 0) - signals.repetition * 20)),
    participation: participationScore(window),
  };
  const participants = new Set(window.map((message) => message.userId)).size;
  const confidence = Math.round(
    Math.min(1, window.length / 4) * Math.min(1, participants / 2) * 100,
  ) / 100;
  const evidence: ScoreEvidence[] = [];
  const addEvidence = (signal: keyof CommunicationSignals, indexes: number[]) => {
    if (indexes.length > 0) {
      evidence.push({
        signal,
        messageIndexes: indexes.map((index) => index + windowOffset),
      });
    }
  };
  addEvidence("resolution", resolutionState.index === null ? [] : [resolutionState.index]);
  addEvidence("assignment", messageIndexes(window, hasAssignment));
  addEvidence("deadline", messageIndexes(window, hasDeadline));
  addEvidence("actionProposal", messageIndexes(window, (text) => includesAny(text, ACTION_PROPOSAL_TOKENS)));
  if (conflict) addEvidence("conflict", messageIndexes(window, (text) => includesAny(text, [...DIRECTIVE_TOKENS, ...RESISTANCE_TOKENS])));
  addEvidence("repetition", repeatedIndexes);
  addEvidence("unansweredQuestions", unansweredIndexes);

  return {
    version: "heuristic-v1",
    topicKind,
    overall: weightedScore(topicKind, dimensions),
    confidence,
    dimensions,
    signals,
    evidence,
  };
}

export function decideScoreIntervention(input: ScoreDecisionInput): ScoreInterventionDecision {
  const cooldownSec = input.cooldownSec ?? 20;
  const score = scoreCommunication(input.messages, input.topicKind);
  const latest = input.messages.at(-1)?.text || "";
  const threshold = 60;
  const sinceLast = input.lastInterventionAtSec === null
    ? Number.POSITIVE_INFINITY
    : input.nowSec - input.lastInterventionAtSec;
  const cooldownRemainingSec = cooldownSec > 0 && Number.isFinite(sinceLast)
    ? Math.max(0, cooldownSec - sinceLast)
    : 0;

  if (/@roomi/i.test(latest)) {
    return { respond: true, action: "reply", trigger: "mention", reason: "Roomiへの直接メンション", threshold, cooldownRemainingSec: 0, score };
  }
  if (cooldownRemainingSec > 0) {
    return { respond: false, action: "silent", trigger: "cooldown", reason: `クールダウン残り${cooldownRemainingSec}秒`, threshold, cooldownRemainingSec, score };
  }
  if (score.signals.resolution) {
    return { respond: false, action: "silent", trigger: "resolved", reason: "最新発言で合意・解決を確認", threshold, cooldownRemainingSec: 0, score };
  }
  if (input.messages.length < 2 || score.confidence < 0.5) {
    return { respond: false, action: "silent", trigger: "insufficient_data", reason: "判定に必要な発言が不足", threshold, cooldownRemainingSec: 0, score };
  }
  const stalled =
    score.overall <= threshold &&
    score.dimensions.progress <= 50 &&
    (score.dimensions.frictionFree <= 60 ||
      score.signals.unansweredQuestions >= 1 ||
      score.signals.repetition >= 1);
  if (stalled) {
    return { respond: true, action: "reply", trigger: "low_score", reason: `健全度${score.overall}・前進度${score.dimensions.progress}`, threshold, cooldownRemainingSec: 0, score };
  }
  return { respond: false, action: "silent", trigger: "healthy", reason: `健全度${score.overall}で介入条件外`, threshold, cooldownRemainingSec: 0, score };
}
