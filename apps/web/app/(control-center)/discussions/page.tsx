"use client";

import Link from "next/link";
import { RELATIONSHIP_STATUS_META } from "../../components/CommunicationTopicGraph";
import { getFallbackAvatarSvg } from "../../components/CommunicationTopicGraph";
import { DISCUSSIONS } from "../../mocks/discussions";
import { getMember } from "../../mocks/members";

export default function DiscussionsPage() {
  return (
    <section className="roomi-page-stage discussion-index" aria-label="ディスカッション">
      <header className="roomi-page-head">
        <span className="roomi-page-kicker">Discussions</span>
        <h1>ディスカッション</h1>
        <p>いま動いている話と、止まった話。クリックすると詳細が開く。</p>
      </header>

      <div className="discussion-list">
        {DISCUSSIONS.map((item) => {
          const people = item.participantIds
            .map((id) => getMember(id))
            .filter((member): member is NonNullable<typeof member> => Boolean(member));
          const status = RELATIONSHIP_STATUS_META[item.status];

          return (
            <Link key={item.id} href={`/discussions/${item.id}`} className="discussion-row">
              <div className="discussion-row-main">
                <div className="discussion-row-title">
                  <h2>{item.title}</h2>
                  <span className={`discussion-status ${item.status}`}>{status.label}</span>
                </div>
                <p>{item.summary}</p>
                <p className="discussion-row-preview">{item.lastPreview}</p>
              </div>
              <div className="discussion-row-meta">
                <div className="discussion-avatars" aria-hidden="true">
                  {people.slice(0, 5).map((person) => (
                    <img
                      key={person.id}
                      src={
                        person.kind === "agent"
                          ? person.avatar || "/roomi-logo.svg"
                          : getFallbackAvatarSvg(person.name, person.id)
                      }
                      alt=""
                    />
                  ))}
                </div>
                <span>
                  {item.participantIds.length} 人 · {item.messageCount} 件
                  {item.aiInterventions > 0 ? ` · AI ${item.aiInterventions}` : ""}
                </span>
                <time>{item.lastActivity}</time>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
