"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import CommunicationTopicGraph, {
  RELATIONSHIP_STATUS_META,
} from "../components/CommunicationTopicGraph";
import type {
  GraphSelection,
} from "../components/CommunicationTopicGraph";
import MaterialIcon from "../components/MaterialIcon";
import { DISCUSSIONS, getDiscussion } from "../mocks/discussions";

export default function Page() {
  return (
    <Suspense fallback={<section className="roomi-graph-stage" aria-label="コミュニケーショングラフ" />}>
      <GraphHome />
    </Suspense>
  );
}

function GraphHome() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedTopicId, setSelectedTopicId] = useState<string>(DISCUSSIONS[0]?.id || "breakfast");
  const [, setSelection] = useState<GraphSelection | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  useEffect(() => {
    const topicParam = searchParams.get("topic");
    const personParam = searchParams.get("person");

    if (personParam) {
      setSelectedPersonId(personParam);
      if (!topicParam) {
        const matchingDiscussion = DISCUSSIONS.find((d) => d.participantIds.includes(personParam));
        if (matchingDiscussion) {
          setSelectedTopicId(matchingDiscussion.id);
          return;
        }
      }
    } else {
      setSelectedPersonId(null);
    }

    if (topicParam && DISCUSSIONS.some((d) => d.id === topicParam)) {
      setSelectedTopicId(topicParam);
    }
  }, [searchParams]);

  const currentDiscussion = getDiscussion(selectedTopicId) || DISCUSSIONS[0];

  const handleSelectTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("topic", topicId);

    const targetTopic = getDiscussion(topicId);
    if (
      selectedPersonId &&
      targetTopic &&
      !targetTopic.participantIds.includes(selectedPersonId)
    ) {
      setSelectedPersonId(null);
      params.delete("person");
    }

    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  };

  const memberCount = currentDiscussion.graph.nodes.filter((node) => node.kind !== "agent").length;
  const hasAgent = currentDiscussion.graph.nodes.some((node) => node.kind === "agent");
  const edgeCount = currentDiscussion.graph.edges.length;
  const statusMeta = RELATIONSHIP_STATUS_META[currentDiscussion.status];
  const loadedThreadId = currentDiscussion.backendThreadId || currentDiscussion.id;

  return (
    <section className="roomi-graph-stage" aria-label="コミュニケーショングラフ">
      <div className="roomi-floating-header">
        <div className="floating-topic-bar">
          <span className="floating-kicker">トピック</span>
          <div className="floating-topic-pills" role="tablist" aria-label="トピック選択">
            {DISCUSSIONS.map((item) => {
              const isActive = item.id === currentDiscussion.id;
              const pillMeta = RELATIONSHIP_STATUS_META[item.status];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`topic-pill${isActive ? " active" : ""}`}
                  onClick={() => handleSelectTopic(item.id)}
                >
                  <span className={`topic-pill-dot ${item.status}`} aria-hidden="true" />
                  <span className="topic-pill-title">{item.title}</span>
                  {isActive && pillMeta && (
                    <span className={`topic-pill-badge ${item.status}`}>{pillMeta.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="floating-header-info">
          <div className="floating-title-box">
            <h2 className="floating-title">{currentDiscussion.title}</h2>
            <p className="floating-desc">{currentDiscussion.summary}</p>
          </div>
          <div className="floating-badges">
            <span className={`discussion-status ${currentDiscussion.status}`}>
              {statusMeta?.label || currentDiscussion.status}
            </span>
            <span className="floating-stats">
              {memberCount} 人のメンバー
              {" · "}
              {hasAgent ? "Roomi 介入中" : "介入待機中"}
              {" · "}
              {edgeCount} の関係性
            </span>
            <Link
              href={`/discussions/${currentDiscussion.id}`}
              className="floating-detail-link"
              title="ディスカッション詳細とタイムラインを見る"
            >
              <MaterialIcon name="open_in_new" />
              <span>詳細</span>
            </Link>
          </div>
        </div>
      </div>

      <CommunicationTopicGraph
        key={currentDiscussion.id}
        threadId={loadedThreadId}
        topicLabel={currentDiscussion.title}
        data={currentDiscussion.graph}
        onSelectionChange={setSelection}
        activePersonId={selectedPersonId}
      />

      <div className="roomi-legend" aria-label="グラフの凡例">
        <span>
          <i className="topic" aria-hidden="true" />
          トピック
        </span>
        <span>
          <i className="person" aria-hidden="true" />
          メンバー
        </span>
        <span>
          <i className="agent" aria-hidden="true" />
          Roomi
        </span>
        {Object.entries(RELATIONSHIP_STATUS_META).map(([status, meta]) => (
          <span key={status}>
            <i className={`relation ${status}`} aria-hidden="true" />
            {meta.label}
          </span>
        ))}
      </div>
    </section>
  );
}
