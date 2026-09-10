"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CommunicationTopicGraph, {
  RELATIONSHIP_STATUS_META,
} from "../components/CommunicationTopicGraph";
import type {
  CommunicationGraphData,
  GraphSelection,
} from "../components/CommunicationTopicGraph";
import { COMMUNICATION_DEMO } from "../mocks/communicationDemo";

export default function Page() {
  return (
    <Suspense fallback={<section className="roomi-graph-stage" aria-label="コミュニケーショングラフ" />}>
      <GraphHome />
    </Suspense>
  );
}

function GraphHome() {
  const searchParams = useSearchParams();
  const [graph] = useState<CommunicationGraphData>(COMMUNICATION_DEMO.graph);
  const [, setSelection] = useState<GraphSelection | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  useEffect(() => {
    const person = searchParams.get("person");
    if (person) setSelectedPersonId(person);
  }, [searchParams]);

  const topicLabel = COMMUNICATION_DEMO.title;
  const loadedThreadId = COMMUNICATION_DEMO.threadId;

  return (
    <section className="roomi-graph-stage" aria-label="コミュニケーショングラフ">
      <div className="roomi-floating-header">
        <div className="floating-title-box">
          <span className="floating-kicker">トピック</span>
          <h2 className="floating-title">{topicLabel}</h2>
        </div>
        <div className="floating-badges">
          <span className="mock-badge">デモ</span>
          <span className="floating-stats">
            {graph.nodes.filter((node) => node.kind !== "agent").length} 人のメンバー
            {" · "}
            Roomi 介入中
            {" · "}
            {graph.edges.length} の関係性
          </span>
        </div>
      </div>

      <CommunicationTopicGraph
        threadId={loadedThreadId}
        topicLabel={topicLabel}
        data={graph}
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
