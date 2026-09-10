"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import CommunicationTopicGraph, {
  MentionText,
  RELATIONSHIP_STATUS_META,
  getFallbackAvatarSvg,
} from "../../../components/CommunicationTopicGraph";
import type { GraphSelection } from "../../../components/CommunicationTopicGraph";
import MaterialIcon from "../../../components/MaterialIcon";
import { getDiscussion } from "../../../mocks/discussions";
import { getMember } from "../../../mocks/members";

export default function DiscussionDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const discussion = getDiscussion(typeof id === "string" ? id : "");
  const [, setSelection] = useState<GraphSelection | null>(null);

  if (!discussion) {
    return (
      <section className="roomi-page-stage" aria-label="ディスカッション">
        <div className="roomi-page-head">
          <Link href="/discussions" className="roomi-back-link">
            <MaterialIcon name="arrow_back" />
            一覧へ
          </Link>
          <h1>見つからない</h1>
          <p>このディスカッションはもうないか、IDが違う。</p>
        </div>
      </section>
    );
  }

  const status = RELATIONSHIP_STATUS_META[discussion.status];
  const people = discussion.participantIds
    .map((id) => getMember(id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member));

  return (
    <section className="roomi-page-stage discussion-detail" aria-label={discussion.title}>
      <header className="discussion-detail-head">
        <Link href="/discussions" className="roomi-back-link">
          <MaterialIcon name="arrow_back" />
          一覧へ
        </Link>
        <div className="discussion-detail-title">
          <div>
            <span className="roomi-page-kicker">#{discussion.channel}</span>
            <h1>{discussion.title}</h1>
            <p>{discussion.summary}</p>
          </div>
          <div className="discussion-detail-actions">
            <span className={`discussion-status ${discussion.status}`}>{status.label}</span>
            {discussion.liveDemo && (
              <Link href="/demo" className="discussion-live-link">
                ライブチャット
              </Link>
            )}
          </div>
        </div>
        <div className="discussion-detail-stats">
          <span>{people.length} 人</span>
          <span>{discussion.messageCount} 件</span>
          <span>最終 {discussion.lastActivity}</span>
          {discussion.aiInterventions > 0 && <span>AI介入 {discussion.aiInterventions}</span>}
        </div>
        <div className="discussion-people">
          {people.map((person) => (
            <Link key={person.id} href="/members" className="discussion-person-chip">
              <img
                src={
                  person.kind === "agent"
                    ? person.avatar || "/roomi-logo.svg"
                    : getFallbackAvatarSvg(person.name, person.id)
                }
                alt=""
              />
              <span>{person.name}</span>
            </Link>
          ))}
        </div>
      </header>

      <div className="discussion-detail-body">
        <div className="discussion-graph-embed">
          <CommunicationTopicGraph
            threadId={discussion.id}
            topicLabel={discussion.title}
            data={discussion.graph}
            onSelectionChange={setSelection}
          />
        </div>

        <div className="discussion-thread">
          <span className="roomi-page-kicker">タイムライン</span>
          <ol>
            {discussion.timeline.map((item, index) => {
              const isAgent = item.user_id === "U-ROOMI";
              return (
                <li key={`${item.ts}-${index}`} className={isAgent ? "agent" : undefined}>
                  <img
                    src={
                      isAgent
                        ? "/roomi-logo.svg"
                        : getFallbackAvatarSvg(item.user_name, item.user_id)
                    }
                    alt=""
                  />
                  <div>
                    <div className="discussion-thread-meta">
                      <strong>{item.user_name}</strong>
                      {isAgent && <em>AI</em>}
                      <time>{item.ts}</time>
                    </div>
                    <p>
                      <MentionText text={item.text} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
