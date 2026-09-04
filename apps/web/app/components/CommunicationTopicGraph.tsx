"use client";

import * as d3 from "d3";
import { useEffect, useId, useRef } from "react";

export type CommunicationNode = {
  id: string;
  name?: string;
  role?: string;
  interests?: string;
  messages: number;
};

export type RelationshipStatus =
  | "discussion"
  | "review"
  | "resolved"
  | "blocked";

export const RELATIONSHIP_STATUS_META: Record<
  RelationshipStatus,
  { label: string; color: string }
> = {
  discussion: { label: "議論中", color: "#8f9aff" },
  review: { label: "確認中", color: "#f3b65f" },
  resolved: { label: "合意済み", color: "#6ed8c3" },
  blocked: { label: "保留", color: "#ff8f7a" },
};

export type CommunicationEdge = {
  source: string;
  target: string;
  label: string;
  weight?: number;
  status?: RelationshipStatus;
  directed?: boolean;
};

export type CommunicationGraphData = {
  nodes: CommunicationNode[];
  edges: CommunicationEdge[];
};

export type GraphSelection = {
  id: string;
  label: string;
  kind: "topic" | "person";
  messages: number;
  role?: string;
  interests?: string;
};

type SimulationNode = d3.SimulationNodeDatum & CommunicationNode & {
  kind: "topic" | "person";
  label: string;
};

type SimulationLink = d3.SimulationLinkDatum<SimulationNode> & {
  label: string;
  weight: number;
  kind: "topic" | "conversation";
  status?: RelationshipStatus;
  directed: boolean;
  labelIndex: number;
};

const WIDTH = 840;
const HEIGHT = 480;
const GRID_SIZE = 24;
const TOPIC_NODE_ID = "__roomi_topic__";

function nodeRadius(node: SimulationNode) {
  if (node.kind === "topic") return 34;
  return Math.min(27, 14 + Math.sqrt(node.messages) * 3);
}

function normalizeRelationshipStatus(status?: string): RelationshipStatus {
  return status && Object.hasOwn(RELATIONSHIP_STATUS_META, status)
    ? (status as RelationshipStatus)
    : "discussion";
}

export default function CommunicationTopicGraph({
  threadId,
  topicLabel,
  data,
  onSelectionChange,
}: {
  threadId: string;
  topicLabel: string;
  data: CommunicationGraphData;
  onSelectionChange?: (selection: GraphSelection) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const markerPrefix = useId().replaceAll(":", "");

  function changeZoom(scale: number) {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.scaleBy, scale);
  }

  function resetZoom() {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity);
  }

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) {
      return;
    }

    const topicNode: SimulationNode = {
      id: TOPIC_NODE_ID,
      name: topicLabel,
      label: topicLabel,
      messages: data.nodes.reduce((total, node) => total + node.messages, 0),
      kind: "topic",
      x: WIDTH / 2,
      y: HEIGHT / 2,
    };
    const people: SimulationNode[] = data.nodes.map((node) => ({
      ...node,
      label: node.name || node.id,
      kind: "person",
    }));
    const nodes = [topicNode, ...people];
    const topicLinks: SimulationLink[] = people.map((node) => ({
      source: TOPIC_NODE_ID,
      target: node.id,
      label: `${node.messages}件の発言`,
      weight: Math.max(1, node.messages),
      kind: "topic",
      directed: false,
      labelIndex: -1,
    }));
    const conversationLinks: SimulationLink[] = data.edges.map((edge, index) => {
      const status = normalizeRelationshipStatus(edge.status);
      return {
        source: edge.source,
        target: edge.target,
        label: edge.label,
        weight: Math.max(1, edge.weight ?? 1),
        kind: "conversation",
        status,
        directed: edge.directed ?? Boolean(edge.status),
        labelIndex: index,
      };
    });
    const links = [...topicLinks, ...conversationLinks];
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    onSelectionChange?.({
      id: topicNode.id,
      label: topicNode.label,
      kind: topicNode.kind,
      messages: topicNode.messages,
    });

    const svgElement = svgRef.current;
    const graphStage = svgElement.closest<HTMLElement>(".roomi-graph-stage");
    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();
    const markerData = Object.entries(RELATIONSHIP_STATUS_META) as [
      RelationshipStatus,
      { label: string; color: string },
    ][];
    const markers = svg
      .append("defs")
      .selectAll("marker")
      .data(markerData)
      .join("marker")
      .attr("id", ([status]) => `${markerPrefix}-roomi-arrow-${status}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 9)
      .attr("refY", 0)
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("orient", "auto")
      .attr("markerUnits", "userSpaceOnUse");
    markers
      .append("path")
      .attr("d", "M0,-5L10,0L0,5Z")
      .attr("fill", ([, meta]) => meta.color);
    const viewport = svg.append("g");

    const link = viewport
      .append("g")
      .attr("class", "topic-graph-links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr(
        "class",
        (edge) =>
          `topic-graph-link ${edge.kind}${edge.status ? ` status-${edge.status}` : ""}`
      )
      .attr("marker-end", (edge) =>
        edge.kind === "conversation" && edge.directed
          ? `url(#${markerPrefix}-roomi-arrow-${edge.status})`
          : null
      )
      .attr("aria-hidden", (edge) => (edge.kind === "topic" ? "true" : null))
      .attr("role", (edge) => (edge.kind === "conversation" ? "img" : null))
      .attr("aria-label", (edge) =>
        edge.status
          ? `${edge.label}、${RELATIONSHIP_STATUS_META[edge.status].label}${
              edge.directed ? "、矢印方向あり" : ""
            }`
          : null
      )
      .attr("stroke-width", (edge) => Math.min(5, 1 + Math.sqrt(edge.weight)));

    link
      .append("title")
      .text((edge) => {
        const status = edge.status
          ? ` ・ ${RELATIONSHIP_STATUS_META[edge.status].label}`
          : "";
        return `${edge.label}${status} ・ 強さ ${edge.weight}`;
      });

    const relationshipLabel = viewport
      .append("g")
      .attr("class", "topic-graph-link-labels")
      .selectAll("text")
      .data(conversationLinks)
      .join("text")
      .attr(
        "class",
        (edge) => `topic-graph-link-label status-${edge.status ?? "discussion"}`
      )
      .attr("text-anchor", "middle")
      .text(
        (edge) => RELATIONSHIP_STATUS_META[edge.status ?? "discussion"].label
      );

    const node = viewport
      .append("g")
      .attr("class", "topic-graph-nodes")
      .selectAll<SVGGElement, SimulationNode>("g")
      .data(nodes)
      .join("g")
      .attr("class", (item) => `topic-graph-node ${item.kind}`)
      .classed("selected", (item) => item.id === TOPIC_NODE_ID)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr(
        "aria-label",
        (item) =>
          `${item.kind === "topic" ? "トピック" : "参加者"} ${item.label}、${item.messages}件`
      )
      .on("click", (_event, item) => selectNode(item))
      .on("keydown", (event, item) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectNode(item);
        }
      });

    function selectNode(item: SimulationNode) {
      node.classed("selected", (candidate) => candidate.id === item.id);
      onSelectionChange?.({
        id: item.id,
        label: item.label,
        kind: item.kind,
        messages: item.messages,
        role: item.role,
        interests: item.interests,
      });
    }

    node
      .append("circle")
      .attr("r", nodeRadius)
      .attr("class", (item) => `topic-graph-circle ${item.kind}`);

    node
      .append("text")
      .attr("class", "topic-graph-label")
      .attr("text-anchor", "middle")
      .attr("dy", (item) => nodeRadius(item) + 18)
      .text((item) =>
        item.label.length > 14 ? `${item.label.slice(0, 13)}…` : item.label
      );

    node
      .append("text")
      .attr("class", "topic-graph-count")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .text((item) => item.messages);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, SimulationLink>(links)
          .id((item) => item.id)
          .distance((edge) => (edge.kind === "topic" ? 180 : 140))
          .strength((edge) => (edge.kind === "topic" ? 0.35 : 0.55))
      )
      .force("charge", d3.forceManyBody().strength(-650))
      .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
      .force(
        "collision",
        d3.forceCollide<SimulationNode>().radius((item) => nodeRadius(item) + 42)
      );

    const renderTick = () => {
      const displayPosition = (item: SimulationNode) => ({
        x: Math.max(48, Math.min(WIDTH - 48, item.x ?? 0)),
        y: Math.max(48, Math.min(HEIGHT - 48, item.y ?? 0)),
      });
      const coordinates = (edge: SimulationLink) => {
        const source = edge.source as SimulationNode;
        const target = edge.target as SimulationNode;
        const sourcePosition = displayPosition(source);
        const targetPosition = displayPosition(target);
        const sourceX = sourcePosition.x;
        const sourceY = sourcePosition.y;
        const targetX = targetPosition.x;
        const targetY = targetPosition.y;
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const distance = Math.hypot(dx, dy) || 1;
        const sourcePadding = nodeRadius(source) + 4;
        const targetPadding = nodeRadius(target) + (edge.kind === "conversation" ? 11 : 4);
        const labelProgress = 0.38 + (edge.labelIndex % 3) * 0.12;
        const labelOffset =
          (edge.labelIndex % 2 === 0 ? 1 : -1) *
          (14 + Math.floor(edge.labelIndex / 2) * 3);
        return {
          x1: sourceX + (dx / distance) * sourcePadding,
          y1: sourceY + (dy / distance) * sourcePadding,
          x2: targetX - (dx / distance) * targetPadding,
          y2: targetY - (dy / distance) * targetPadding,
          labelX:
            sourceX + dx * labelProgress - (dy / distance) * labelOffset,
          labelY:
            sourceY + dy * labelProgress + (dx / distance) * labelOffset,
        };
      };

      link.each(function positionLink(edge) {
        const point = coordinates(edge);
        d3.select(this)
          .attr("x1", point.x1)
          .attr("y1", point.y1)
          .attr("x2", point.x2)
          .attr("y2", point.y2);
      });
      relationshipLabel
        .attr("x", (edge) => coordinates(edge).labelX)
        .attr("y", (edge) => coordinates(edge).labelY);
      node.attr(
        "transform",
        (item) => {
          const point = displayPosition(item);
          return `translate(${point.x},${point.y})`;
        }
      );
    };

    simulation.on("tick", renderTick);

    const drag = d3
      .drag<SVGGElement, SimulationNode>()
      .on("start", (event, item) => {
        if (!event.active && !reducedMotion) simulation.alphaTarget(0.25).restart();
        item.fx = item.x;
        item.fy = item.y;
      })
      .on("drag", (event, item) => {
        item.fx = event.x;
        item.fy = event.y;
        if (reducedMotion) {
          item.x = event.x;
          item.y = event.y;
          renderTick();
        }
      })
      .on("end", (event, item) => {
        if (!event.active && !reducedMotion) simulation.alphaTarget(0);
        item.fx = null;
        item.fy = null;
      });
    node.call(drag);

    function syncGrid(transform: d3.ZoomTransform) {
      if (!graphStage) return;
      const svgRect = svgElement.getBoundingClientRect();
      const stageRect = graphStage.getBoundingClientRect();
      const renderedScale = Math.min(svgRect.width / WIDTH, svgRect.height / HEIGHT) || 1;
      const svgOriginX =
        svgRect.left -
        stageRect.left -
        graphStage.clientLeft +
        (svgRect.width - WIDTH * renderedScale) / 2;
      const svgOriginY =
        svgRect.top -
        stageRect.top -
        graphStage.clientTop +
        (svgRect.height - HEIGHT * renderedScale) / 2;
      graphStage.style.setProperty(
        "--graph-grid-x",
        `${svgOriginX + transform.x * renderedScale + transform.k * (1 - svgOriginX)}px`
      );
      graphStage.style.setProperty(
        "--graph-grid-y",
        `${svgOriginY + transform.y * renderedScale + transform.k * (1 - svgOriginY)}px`
      );
      graphStage.style.setProperty(
        "--graph-grid-size",
        `${GRID_SIZE * transform.k}px`
      );
    }

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 2.5])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform);
        syncGrid(event.transform);
      });
    zoomRef.current = zoom;
    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity);

    const resizeObserver = new ResizeObserver(() => {
      syncGrid(d3.zoomTransform(svgElement));
    });
    resizeObserver.observe(svgElement);
    resizeObserver.observe(graphStage ?? svgElement);

    if (reducedMotion) {
      simulation.stop();
      for (let index = 0; index < 160; index += 1) simulation.tick();
      renderTick();
    }

    return () => {
      simulation.stop();
      resizeObserver.disconnect();
      svg.on(".zoom", null);
      graphStage?.style.removeProperty("--graph-grid-x");
      graphStage?.style.removeProperty("--graph-grid-y");
      graphStage?.style.removeProperty("--graph-grid-size");
      zoomRef.current = null;
    };
  }, [data, onSelectionChange, topicLabel]);

  if (data.nodes.length === 0) {
    return (
      <div className="topic-graph-empty">
        このトピックには、まだグラフ化できる発言がないよ。
      </div>
    );
  }

  return (
    <div className="topic-graph-canvas">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${threadId}のコミュニケーショングラフ`}
        aria-describedby={`${markerPrefix}-relationships`}
      />
      <div
        className="topic-graph-controls"
        role="group"
        aria-label="グラフの拡大縮小"
      >
        <button type="button" onClick={() => changeZoom(1.25)} aria-label="拡大">
          ＋
        </button>
        <button type="button" onClick={() => changeZoom(0.8)} aria-label="縮小">
          −
        </button>
        <button type="button" onClick={resetZoom} aria-label="表示をリセット">
          ↺
        </button>
      </div>
      <div className="topic-graph-help">
        ノードをドラッグ ・ スクロールで拡大縮小
      </div>
      <ul id={`${markerPrefix}-relationships`} className="roomi-visually-hidden">
        {data.edges.map((edge, index) => {
          const source = data.nodes.find((node) => node.id === edge.source);
          const target = data.nodes.find((node) => node.id === edge.target);
          const normalizedStatus = normalizeRelationshipStatus(edge.status);
          const status = RELATIONSHIP_STATUS_META[normalizedStatus].label;
          const connector = edge.directed ?? Boolean(edge.status) ? "から" : "と";
          return (
            <li key={`${edge.source}-${edge.target}-${index}`}>
              {source?.name || edge.source}
              {connector}
              {target?.name || edge.target}
              {connector === "から" ? "へ" : "の関係"}：
              {edge.label}、{status}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
