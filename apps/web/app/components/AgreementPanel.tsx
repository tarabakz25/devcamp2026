"use client";

import { useEffect, useState } from "react";
import { getFallbackAvatarSvg } from "./CommunicationTopicGraph";
import MaterialIcon from "./MaterialIcon";
import { getMember } from "../mocks/members";

type AgreementParticipant = {
  userId: string;
  userName: string;
  role: string;
  required: boolean;
  stance: string;
  condition: string | null;
  conditionResolution: string | null;
  confidence: number;
  evidenceMessageIds: string[];
  contactedAt: string | null;
};

type AgreementGap = {
  type: string;
  userId: string | null;
  question: string;
  priority: string;
  blocking: boolean;
  confidence: number;
};

type AgreementAction = {
  id: string;
  route: string;
  targetUserId: string | null;
  question: string;
  reason: string;
  status: string;
  requiresApproval: boolean;
  confidence: number;
};

type DecisionItem = {
  id: string;
  threadId: string;
  question: string;
  proposal: string | null;
  version: number;
  decisionMethod: string;
  ownerUserId: string | null;
  deadline: string | null;
  status: string;
  confidence: number;
  participants: AgreementParticipant[];
  gaps: AgreementGap[];
  actions: AgreementAction[];
};

type AgreementResponse = { decisions: DecisionItem[] };
type LoadState = "loading" | "ready" | "stale" | "unavailable";

const METHOD_LABELS: Record<string, string> = {
  owner: "責任者判断",
  owner_decides: "責任者判断",
  responsible_person: "責任者判断",
  required_approval: "必須関係者の承認",
  required_approvals: "必須関係者の承認",
  required_participants: "必須関係者の承認",
  consent: "異議なし方式",
  no_objection: "異議なし方式",
  consensus: "全員合意",
  unanimous: "全員合意",
};

const STANCE_META: Record<string, { label: string; tone: string }> = {
  agreed: { label: "合意", tone: "agreed" },
  agree: { label: "合意", tone: "agreed" },
  approved: { label: "合意", tone: "agreed" },
  conditional: { label: "条件付き", tone: "conditional" },
  conditional_agreement: { label: "条件付き", tone: "conditional" },
  opposed: { label: "懸念あり", tone: "opposed" },
  objected: { label: "懸念あり", tone: "opposed" },
  oppose: { label: "懸念あり", tone: "opposed" },
  rejected: { label: "反対", tone: "opposed" },
  unconfirmed: { label: "未確認", tone: "unconfirmed" },
  pending: { label: "未確認", tone: "unconfirmed" },
  unknown: { label: "未確認", tone: "unconfirmed" },
  not_applicable: { label: "対象外", tone: "neutral" },
};

const STATUS_LABELS: Record<string, string> = {
  open: "合意形成中",
  discovering: "関係者を特定中",
  gathering: "合意を確認中",
  ready: "決定可能",
  collecting: "確認中",
  pending: "確認中",
  decided: "決定済み",
  resolved: "決定済み",
  reopened: "再確認中",
  blocked: "保留",
};

const ACTION_STATUS_LABELS: Record<string, string> = {
  proposed: "提案中",
  queued: "実行待ち",
  pending: "実行待ち",
  approved: "承認済み",
  sent: "送信済み",
  completed: "完了",
  failed: "送信失敗",
  cancelled: "取消",
};

function normalizedKey(value: string) {
  return value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function methodLabel(method: string) {
  if (!method) return "決め方を確認中";
  return METHOD_LABELS[normalizedKey(method)] ?? method;
}

function displayPerson(userId: string | null, userName?: string) {
  if (!userId) return null;
  const member = getMember(userId);
  return {
    id: userId,
    name: member?.name || userName || userId,
    avatar: member?.avatar || getFallbackAvatarSvg(member?.name || userName || userId, userId),
  };
}

function formatDeadline(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) return value;
    return `${month}/${day}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: date.getHours() || date.getMinutes() ? "2-digit" : undefined,
    minute: date.getHours() || date.getMinutes() ? "2-digit" : undefined,
  }).format(date);
}

function Confidence({ value }: { value: number }) {
  if (!(value > 0)) return null;
  const percent = Math.round(Math.min(value <= 1 ? value * 100 : value, 100));
  return <span className="agreement-confidence">確信度 {percent}%</span>;
}

function PersonLabel({ userId, userName }: { userId: string | null; userName?: string }) {
  const person = displayPerson(userId, userName);
  if (!person) return <span className="agreement-person-name">宛先を確認中</span>;
  return (
    <span className="agreement-person">
      <img src={person.avatar} alt="" />
      <span>{person.name}</span>
    </span>
  );
}

function DecisionCard({ decision }: { decision: DecisionItem }) {
  const participantById = new Map(
    decision.participants.map((participant) => [participant.userId, participant]),
  );
  const ownerParticipant = decision.ownerUserId
    ? participantById.get(decision.ownerUserId)
    : undefined;
  const owner = displayPerson(decision.ownerUserId, ownerParticipant?.userName);
  const deadline = formatDeadline(decision.deadline);
  const blockingGaps = decision.gaps.filter((gap) => gap.blocking);
  const informationalGaps = decision.gaps.length - blockingGaps.length;

  return (
    <article className="agreement-decision">
      <header className="agreement-decision-head">
        <div>
          <span className="agreement-eyebrow">決めること</span>
          <h3>{decision.question || "決定事項を整理中"}</h3>
          {decision.proposal && <p className="agreement-proposal">現在案：{decision.proposal}</p>}
        </div>
        <div className="agreement-decision-state">
          <span className={`agreement-status ${normalizedKey(decision.status)}`}>
            {STATUS_LABELS[normalizedKey(decision.status)] ?? decision.status}
          </span>
          {decision.version > 0 && <span>v{decision.version}</span>}
        </div>
      </header>

      <dl className="agreement-method">
        <div>
          <dt>決め方</dt>
          <dd>{methodLabel(decision.decisionMethod)}</dd>
        </div>
        <div>
          <dt>最終判断</dt>
          <dd>{owner?.name || "確認中"}</dd>
        </div>
        {deadline && (
          <div>
            <dt>期限</dt>
            <dd>{deadline}</dd>
          </div>
        )}
        <div>
          <dt>分析</dt>
          <dd><Confidence value={decision.confidence} /></dd>
        </div>
      </dl>

      <div className="agreement-columns">
        <section className="agreement-section" aria-labelledby={`gaps-${decision.id}`}>
          <div className="agreement-section-title">
            <MaterialIcon name="rule" />
            <h4 id={`gaps-${decision.id}`}>足りない合意</h4>
            <span>{blockingGaps.length}</span>
          </div>
          {blockingGaps.length > 0 ? (
            <ul className="agreement-gap-list">
              {blockingGaps.map((gap, index) => (
                <li key={`${gap.type}-${gap.userId || "unknown"}-${index}`}>
                  <div className="agreement-gap-meta">
                    <PersonLabel
                      userId={gap.userId}
                      userName={gap.userId ? participantById.get(gap.userId)?.userName : undefined}
                    />
                    <span className={`agreement-priority ${normalizedKey(gap.priority)}`}>
                      {gap.priority === "high" ? "優先" : gap.priority === "low" ? "低" : "通常"}
                    </span>
                  </div>
                  <p>{gap.question || "確認する内容を整理中"}</p>
                  <Confidence value={gap.confidence} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="agreement-inline-empty">未解決の合意ギャップはない。</p>
          )}
          {informationalGaps > 0 && (
            <p className="agreement-inline-empty">
              異議受付期限後の未回答 {informationalGaps} 件は、合意を止めない参考情報として保持中。
            </p>
          )}
        </section>

        <section className="agreement-section" aria-labelledby={`people-${decision.id}`}>
          <div className="agreement-section-title">
            <MaterialIcon name="groups" />
            <h4 id={`people-${decision.id}`}>各人の状態</h4>
            <span>{decision.participants.length}</span>
          </div>
          {decision.participants.length > 0 ? (
            <ul className="agreement-participant-list">
              {decision.participants.map((participant) => {
                const stance = STANCE_META[normalizedKey(participant.stance)] ?? {
                  label: participant.stance || "未確認",
                  tone: "neutral",
                };
                return (
                  <li key={participant.userId}>
                    <div className="agreement-participant-row">
                      <PersonLabel userId={participant.userId} userName={participant.userName} />
                      <span className={`agreement-stance ${stance.tone}`}>{stance.label}</span>
                    </div>
                    <div className="agreement-participant-detail">
                      {participant.role && <span>{participant.role}</span>}
                      {participant.required && <span>必須</span>}
                      <Confidence value={participant.confidence} />
                    </div>
                    {participant.condition && <p>条件：{participant.condition}</p>}
                    {participant.conditionResolution && <p>対応案：{participant.conditionResolution}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="agreement-inline-empty">関係者を特定中。</p>
          )}
        </section>
      </div>

      <section className="agreement-section agreement-actions" aria-labelledby={`actions-${decision.id}`}>
        <div className="agreement-section-title">
          <MaterialIcon name="smart_toy" />
          <h4 id={`actions-${decision.id}`}>Roomiの次の行動</h4>
          <span>{decision.actions.length}</span>
        </div>
        {decision.actions.length > 0 ? (
          <ol>
            {decision.actions.map((action, index) => (
              <li key={action.id || `${action.route}-${index}`}>
                <span className="agreement-action-order">{index + 1}</span>
                <div className="agreement-action-copy">
                  <div>
                    <span className="agreement-route">
                      {normalizedKey(action.route) === "dm" ? "DM" : "スレッド"}
                    </span>
                    <PersonLabel
                      userId={action.targetUserId}
                      userName={
                        action.targetUserId
                          ? participantById.get(action.targetUserId)?.userName
                          : undefined
                      }
                    />
                    <span className="agreement-action-status">
                      {ACTION_STATUS_LABELS[normalizedKey(action.status)] ?? action.status}
                    </span>
                    {action.requiresApproval && <span className="agreement-approval">承認が必要</span>}
                  </div>
                  <p>{action.question || "確認内容を準備中"}</p>
                  {action.reason && <small>{action.reason}</small>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="agreement-inline-empty">予定されている確認はない。</p>
        )}
      </section>
    </article>
  );
}

export default function AgreementPanel({ threadId }: { threadId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let hasLoaded = false;
    let refreshTimer: number | undefined;
    setState("loading");

    async function load() {
      try {
        const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/agreements`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("agreement api unavailable");
        const payload = (await response.json()) as AgreementResponse;
        if (controller.signal.aborted) return;
        setDecisions(Array.isArray(payload.decisions) ? payload.decisions : []);
        setState("ready");
        hasLoaded = true;
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!hasLoaded) setDecisions([]);
        setState(hasLoaded ? "stale" : "unavailable");
      } finally {
        if (!stopped) refreshTimer = window.setTimeout(() => void load(), 15_000);
      }
    }

    void load();

    return () => {
      stopped = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      controller.abort();
    };
  }, [threadId]);

  return (
    <section className="agreement-panel" aria-labelledby="agreement-panel-title" aria-busy={state === "loading"}>
      <header className="agreement-panel-head">
        <div>
          <span className="roomi-page-kicker">Agreement Loop</span>
          <h2 id="agreement-panel-title">合意形成</h2>
          <p>誰の、何の合意が足りないかを整理して、決定まで進める。</p>
        </div>
        <span className="agreement-panel-count">
          {state === "ready" || state === "stale" ? `${decisions.length} 件の意思決定` : "分析状況"}
        </span>
      </header>

      {state === "loading" && (
        <div className="agreement-empty" role="status">
          <MaterialIcon name="progress_activity" />
          <div>
            <strong>合意状況を読み込んでる</strong>
            <p>意思決定と関係者を確認中。</p>
          </div>
        </div>
      )}

      {state === "unavailable" && (
        <div className="agreement-empty unavailable" role="status">
          <MaterialIcon name="cloud_off" />
          <div>
            <strong>合意情報を取得できない</strong>
            <p>会話の固定データを合意済みとは扱わず、接続が戻るまで状態を保留する。</p>
          </div>
        </div>
      )}

      {state === "stale" && (
        <div className="agreement-refresh-warning" role="status">
          接続を再試行中。最後に取得できた合意状況を表示してる。
        </div>
      )}

      {(state === "ready" || state === "stale") && decisions.length === 0 && (
        <div className="agreement-empty" role="status">
          <MaterialIcon name="pending_actions" />
          <div>
            <strong>意思決定はまだ抽出されてない</strong>
            <p>決めることが見つかると、必要な関係者と足りない合意がここに出る。</p>
          </div>
        </div>
      )}

      {(state === "ready" || state === "stale") && decisions.length > 0 && (
        <div className="agreement-decision-list">
          {decisions.map((decision, index) => (
            <DecisionCard key={decision.id || `${decision.threadId}-${index}`} decision={decision} />
          ))}
        </div>
      )}
    </section>
  );
}
