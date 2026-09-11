import {
  CHAT_CASES,
  KNOWN_GAP_CASES,
  type ChatCase,
  type TurnExpectation,
} from "./chat-cases.ts";
import {
  decideScoreIntervention,
  type CommunicationMessage,
  type ScoreInterventionDecision,
} from "../src/communication-score.ts";

type JsonObject = Record<string, unknown>;

type CliArgs = {
  baseUrl: string;
  caseIds: string[];
  timeoutSec: number;
  output?: string;
  execute: boolean;
  allowRemote: boolean;
  primary: "legacy" | "score";
  suite: "baseline" | "known-gap" | "all";
  help: boolean;
};

type ActualTurn = {
  respond: boolean;
  action: string;
  reason: string;
  reply: string;
};

type TurnResult = {
  turn: number;
  userId: string;
  text: string;
  expected: TurnExpectation;
  actual: ActualTurn;
  elapsedSinceCaseStartMs: number;
  responseTimeMs: number;
  passed: boolean;
  failures: string[];
  legacyDecisionPassed: boolean;
  legacyDecisionFailures: string[];
  scoreDecision: ScoreInterventionDecision;
  scorePassed: boolean;
  scoreFailures: string[];
};

type CaseResult = {
  id: string;
  title: string;
  llm: string;
  passed: boolean;
  legacyDecisionPassed: boolean;
  scorePassed: boolean;
  resetTimeMs: number;
  turns: TurnResult[];
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

class EvaluationError extends Error {}

function usage(): string {
  return [
    "Roomiの応答タイミングと返答内容を複数ケースで検証する",
    "",
    "既定はpreviewのみ。HTTP送信とdemoデータresetには --execute が必要。",
    "",
    "Options:",
    "  --base-url <url>   demo API URL",
    "  --case <id>        実行するcase。複数指定可",
    "  --timeout <sec>    1リクエストのtimeout秒数（既定: 60）",
    "  --output <path>    JSON結果の出力先",
    "  --execute          HTTP送信とdemoデータresetを許可",
    "  --allow-remote     localhost以外への実行を許可",
    "  --primary <name>   終了判定に使う方式: legacy | score（既定: legacy）",
    "  --suite <name>     baseline | known-gap | all（既定: baseline）",
    "  --help             この説明を表示",
  ].join("\n");
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new EvaluationError(`${option} の値が必要`);
  }
  return value;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    baseUrl: process.env.ROOMI_EVAL_BASE_URL || "http://localhost:3000/api/demo",
    caseIds: [],
    timeoutSec: 60,
    execute: false,
    allowRemote: false,
    primary: "legacy",
    suite: "baseline",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--base-url") {
      args.baseUrl = requireValue(argv, index, option);
      index += 1;
    } else if (option === "--case") {
      args.caseIds.push(requireValue(argv, index, option));
      index += 1;
    } else if (option === "--timeout") {
      args.timeoutSec = Number(requireValue(argv, index, option));
      index += 1;
    } else if (option === "--output") {
      args.output = requireValue(argv, index, option);
      index += 1;
    } else if (option === "--execute") {
      args.execute = true;
    } else if (option === "--allow-remote") {
      args.allowRemote = true;
    } else if (option === "--primary") {
      const value = requireValue(argv, index, option);
      if (value !== "legacy" && value !== "score") {
        throw new EvaluationError("--primary は legacy または score が必要");
      }
      args.primary = value;
      index += 1;
    } else if (option === "--suite") {
      const value = requireValue(argv, index, option);
      if (value !== "baseline" && value !== "known-gap" && value !== "all") {
        throw new EvaluationError("--suite は baseline、known-gap、all のいずれかが必要");
      }
      args.suite = value;
      index += 1;
    } else if (option === "--help" || option === "-h") {
      args.help = true;
    } else {
      throw new EvaluationError(`未対応のoption: ${option}`);
    }
  }
  return args;
}

function validateArgs(args: CliArgs): URL {
  let target: URL;
  try {
    target = new URL(args.baseUrl);
  } catch {
    throw new EvaluationError(`base URLが不正: ${args.baseUrl}`);
  }
  if (!new Set(["http:", "https:"]).has(target.protocol)) {
    throw new EvaluationError(`base URLが不正: ${args.baseUrl}`);
  }
  if (!Number.isFinite(args.timeoutSec) || args.timeoutSec <= 0) {
    throw new EvaluationError("timeout は0より大きい秒数が必要");
  }
  return target;
}

function selectCases(caseIds: string[], suite: CliArgs["suite"]): ChatCase[] {
  const available = suite === "baseline"
    ? CHAT_CASES
    : suite === "known-gap"
      ? KNOWN_GAP_CASES
      : [...CHAT_CASES, ...KNOWN_GAP_CASES];
  if (caseIds.length === 0) return available;
  const byId = new Map(available.map((chatCase) => [chatCase.id, chatCase]));
  const missing = caseIds.filter((caseId) => !byId.has(caseId));
  if (missing.length > 0) {
    throw new EvaluationError(`存在しないcase: ${missing.join(", ")}`);
  }
  return caseIds.map((caseId) => byId.get(caseId)!);
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

async function apiJson(
  baseUrl: string,
  path: string,
  payload: JsonObject,
  timeoutSec: number,
): Promise<{ data: JsonObject; elapsedMs: number }> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: "error",
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new EvaluationError(`HTTP ${response.status} ${url}: ${raw.slice(0, 300)}`);
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new EvaluationError(`JSON以外の応答: ${url}: ${raw.slice(0, 300)}`);
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new EvaluationError(`JSONオブジェクト以外の応答: ${url}`);
    }
    return { data: data as JsonObject, elapsedMs: performance.now() - started };
  } catch (error) {
    if (error instanceof EvaluationError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new EvaluationError(`timeout: ${url} (${timeoutSec}s)`);
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new EvaluationError(`接続できない: ${url}: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

function sentenceCount(text: string): number {
  return text.split(/[。！？!?\n]+/).filter((part) => part.trim()).length;
}

function checkTurn(
  expected: TurnExpectation,
  data: JsonObject,
): { failures: string[]; actual: ActualTurn } {
  const failures: string[] = [];
  const intervention = asObject(data.intervention);
  const botMessage = asObject(data.bot_message);
  const actual: ActualTurn = {
    respond: intervention.should_act === true || intervention.should_act === 1,
    action: String(intervention.action || ""),
    reason: String(intervention.reason || ""),
    reply: String(botMessage.text || "").trim(),
  };

  failures.push(...checkLegacyDecision(expected, actual));
  if (
    expected.reasonContainsAny?.length &&
    !expected.reasonContainsAny.some((token) => actual.reason.includes(token))
  ) {
    failures.push(`reasonにいずれかが必要: ${expected.reasonContainsAny.join(", ")}`);
  }
  if (actual.respond && !actual.reply) failures.push("介入したのにbot_message.textが空");
  if (!actual.respond && actual.reply) failures.push("介入なしなのにbot_message.textが存在する");

  const rule = expected.reply;
  if (actual.reply && rule) {
    const replyLength = Array.from(actual.reply).length;
    if (replyLength < (rule.minChars ?? 0)) {
      failures.push(`replyが短すぎる: ${replyLength}文字`);
    }
    if (replyLength > (rule.maxChars ?? Number.MAX_SAFE_INTEGER)) {
      failures.push(`replyが長すぎる: ${replyLength}文字`);
    }
    if (rule.maxSentences !== undefined && sentenceCount(actual.reply) > rule.maxSentences) {
      failures.push(`replyの文数超過: ${sentenceCount(actual.reply)} > ${rule.maxSentences}`);
    }
    if (rule.containsAny?.length && !rule.containsAny.some((token) => actual.reply.includes(token))) {
      failures.push(`replyにいずれかが必要: ${rule.containsAny.join(", ")}`);
    }
    const forbidden = rule.forbidden?.filter((token) => actual.reply.includes(token)) || [];
    if (forbidden.length > 0) failures.push(`replyに禁止語がある: ${forbidden.join(", ")}`);
  }
  return { failures, actual };
}

function checkScoreDecision(
  expected: TurnExpectation,
  decision: ScoreInterventionDecision,
): string[] {
  const failures: string[] = [];
  if (decision.respond !== expected.respond) {
    failures.push(`respond: expected=${expected.respond} actual=${decision.respond}`);
  }
  if (decision.action !== expected.action) {
    failures.push(`action: expected=${expected.action} actual=${decision.action}`);
  }
  return failures;
}

function checkLegacyDecision(expected: TurnExpectation, actual: ActualTurn): string[] {
  const failures: string[] = [];
  if (actual.respond !== expected.respond) {
    failures.push(`respond: expected=${expected.respond} actual=${actual.respond}`);
  }
  if (actual.action !== expected.action) {
    failures.push(`action: expected=${expected.action} actual=${actual.action || "(empty)"}`);
  }
  return failures;
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function preview(cases: ChatCase[], baseUrl: string, suite: CliArgs["suite"]): void {
  console.log("PREVIEW: HTTP送信・DBリセット・LLM呼び出しはしていない");
  console.log(`target: ${baseUrl}`);
  console.log(`suite: ${suite}`);
  for (const chatCase of cases) {
    const replyTurns = chatCase.turns
      .map((turn, index) => (turn.expect.respond ? String(index + 1) : null))
      .filter((turn): turn is string => turn !== null);
    const scheduledWait = chatCase.turns.reduce(
      (sum, turn) => sum + (turn.waitBeforeSec || 0),
      0,
    );
    console.log(
      `- ${chatCase.id}: ${chatCase.title} / expected reply turn: ${replyTurns.join(", ") || "なし"}` +
        ` / scheduled wait: ${scheduledWait}s`,
    );
  }
  console.log("実行するときだけ --execute を付けてね。リモートURLには --allow-remote も必要。");
}

async function runCase(chatCase: ChatCase, args: CliArgs): Promise<CaseResult> {
  const reset = await apiJson(
    args.baseUrl,
    "reset",
    { keep_stakeholders: true },
    args.timeoutSec,
  );
  const turns: TurnResult[] = [];
  const scoreMessages: CommunicationMessage[] = [];
  let lastScoreInterventionAtSec: number | null = null;
  const caseStarted = performance.now();

  for (const [index, turn] of chatCase.turns.entries()) {
    const waitBeforeSec = turn.waitBeforeSec || 0;
    if (waitBeforeSec) await sleep(waitBeforeSec);
    const eventAtSec = (performance.now() - caseStarted) / 1000;
    scoreMessages.push({ userId: turn.userId, text: turn.text });
    const scoreDecision = decideScoreIntervention({
      topicKind: chatCase.topicKind,
      messages: scoreMessages,
      nowSec: eventAtSec,
      lastInterventionAtSec: lastScoreInterventionAtSec,
      cooldownSec: 20,
    });
    if (scoreDecision.respond) lastScoreInterventionAtSec = eventAtSec;
    const response = await apiJson(
      args.baseUrl,
      "messages",
      { user_id: turn.userId, text: turn.text },
      args.timeoutSec,
    );
    const checked = checkTurn(turn.expect, response.data);
    const legacyDecisionFailures = checkLegacyDecision(turn.expect, checked.actual);
    const scoreFailures = checkScoreDecision(turn.expect, scoreDecision);
    turns.push({
      turn: index + 1,
      userId: turn.userId,
      text: turn.text,
      expected: turn.expect,
      actual: checked.actual,
      elapsedSinceCaseStartMs: Math.round((performance.now() - caseStarted) * 10) / 10,
      responseTimeMs: Math.round(response.elapsedMs * 10) / 10,
      passed: checked.failures.length === 0,
      failures: checked.failures,
      legacyDecisionPassed: legacyDecisionFailures.length === 0,
      legacyDecisionFailures,
      scoreDecision,
      scorePassed: scoreFailures.length === 0,
      scoreFailures,
    });
  }

  return {
    id: chatCase.id,
    title: chatCase.title,
    llm: String(reset.data.llm || "unknown"),
    passed: turns.every((turn) => turn.passed),
    legacyDecisionPassed: turns.every((turn) => turn.legacyDecisionPassed),
    scorePassed: turns.every((turn) => turn.scorePassed),
    resetTimeMs: Math.round(reset.elapsedMs * 10) / 10,
    turns,
  };
}

function printResults(results: CaseResult[]): void {
  for (const result of results) {
    console.log(
      `[legacy timing ${result.legacyDecisionPassed ? "PASS" : "FAIL"} | ` +
        `score timing ${result.scorePassed ? "PASS" : "FAIL"} | ` +
        `legacy full ${result.passed ? "PASS" : "FAIL"}] ` +
        `${result.id} - ${result.title} (llm=${result.llm})`,
    );
    for (const turn of result.turns) {
      const expected = turn.expected.action;
      const legacy = turn.actual.action || (turn.actual.respond ? "reply" : "silent");
      const score = turn.scoreDecision;
      console.log(
        `  turn ${turn.turn} (t+${(turn.elapsedSinceCaseStartMs / 1000).toFixed(1)}s): ` +
          `expected=${expected} / legacy=${legacy} / score=${score.action} ` +
          `(health=${score.score.overall}, progress=${score.score.dimensions.progress}, ` +
          `confidence=${Math.round(score.score.confidence * 100)}%, trigger=${score.trigger}, ` +
          `api=${turn.responseTimeMs.toFixed(1)}ms)`,
      );
      if (turn.actual.reply) console.log(`    Roomi: ${turn.actual.reply.replaceAll("\n", " / ")}`);
      for (const failure of turn.legacyDecisionFailures) console.log(`    - legacy timing: ${failure}`);
      for (const failure of turn.failures.filter((item) => !turn.legacyDecisionFailures.includes(item))) {
        console.log(`    - legacy reply: ${failure}`);
      }
      for (const failure of turn.scoreFailures) console.log(`    - score: ${failure}`);
    }
  }
  const legacyPassed = results.filter((result) => result.passed).length;
  const legacyDecisionPassed = results.filter((result) => result.legacyDecisionPassed).length;
  const scorePassed = results.filter((result) => result.scorePassed).length;
  console.log(`legacy decision timing: ${legacyDecisionPassed}/${results.length} cases passed`);
  console.log(`legacy full contract: ${legacyPassed}/${results.length} cases passed`);
  console.log(`score decision timing: ${scorePassed}/${results.length} cases passed`);
}

async function writeReport(
  output: string,
  baseUrl: string,
  primary: CliArgs["primary"],
  suite: CliArgs["suite"],
  results: CaseResult[],
): Promise<void> {
  const path = process.getBuiltinModule("node:path") as {
    dirname(value: string): string;
  };
  const fs = process.getBuiltinModule("node:fs") as {
    mkdirSync(value: string, options: { recursive: boolean }): void;
    writeFileSync(value: string, data: string, encoding: "utf8"): void;
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const report = {
    target: baseUrl,
    generatedAt: new Date().toISOString(),
    primary,
    suite,
    passed: results.every((result) => primary === "legacy" ? result.passed : result.scorePassed),
    comparison: {
      legacyCasesPassed: results.filter((result) => result.passed).length,
      legacyDecisionCasesPassed: results.filter((result) => result.legacyDecisionPassed).length,
      scoreDecisionCasesPassed: results.filter((result) => result.scorePassed).length,
      totalCases: results.length,
    },
    results,
  };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main(): Promise<number> {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return 0;
    }
    const target = validateArgs(args);
    const cases = selectCases(args.caseIds, args.suite);
    if (!args.execute) {
      preview(cases, args.baseUrl, args.suite);
      return 0;
    }
    if (!LOCAL_HOSTS.has(target.hostname) && !args.allowRemote) {
      throw new EvaluationError("リモートのdemoデータをresetするため --allow-remote が必要");
    }

    const results: CaseResult[] = [];
    for (const chatCase of cases) results.push(await runCase(chatCase, args));
    printResults(results);
    if (args.output) await writeReport(args.output, args.baseUrl, args.primary, args.suite, results);
    const passed = results.every((result) => args.primary === "legacy" ? result.passed : result.scorePassed);
    console.log(`primary result (${args.primary}): ${passed ? "PASS" : "FAIL"}`);
    return passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    return 2;
  }
}

process.exitCode = await main();
