"use client";

import * as d3 from "d3";
import { useEffect, useId, useRef, useState } from "react";

export type CommunicationNode = {
  id: string;
  name?: string;
  role?: string;
  interests?: string;
  messages: number;
  avatar?: string;
  kind?: "person" | "agent";
};

export type RelationshipStatus =
  | "discussion"
  | "review"
  | "resolved"
  | "blocked"
  | "intervention";

export const RELATIONSHIP_STATUS_META: Record<
  RelationshipStatus,
  { label: string; color: string }
> = {
  discussion: { label: "議論中", color: "#8f9aff" },
  review: { label: "確認中", color: "#f3b65f" },
  resolved: { label: "合意済み", color: "#6ed8c3" },
  blocked: { label: "保留", color: "#ff8f7a" },
  intervention: { label: "AI介入", color: "#7b88ff" },
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
  kind: "topic" | "person" | "agent";
  messages: number;
  role?: string;
  interests?: string;
  avatar?: string;
};

type SimulationNode = d3.SimulationNodeDatum &
  CommunicationNode & {
    kind: "topic" | "person" | "agent";
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

type PopupInfo = {
  item: SimulationNode;
  x: number;
  y: number;
  arrowTop: number;
  placement: "right" | "left";
};

const GRID_SIZE = 24;
const TOPIC_NODE_ID = "__roomi_topic__";

type LayoutBounds = {
  width: number;
  height: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  span: number;
  boxW: number;
  boxH: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function layoutBounds(width: number, height: number): LayoutBounds {
  const compact = width < 860;
  const x0 = compact ? 24 : 308;
  const y0 = compact ? 300 : 96;
  const x1 = Math.max(x0 + 200, width - (compact ? 24 : 56));
  const y1 = Math.max(y0 + 200, height - (compact ? 156 : 80));
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  return {
    width,
    height,
    x0,
    y0,
    x1,
    y1,
    cx: x0 + boxW / 2,
    cy: y0 + boxH * 0.56,
    span: Math.min(boxW, boxH),
    boxW,
    boxH,
  };
}

export const TOPIC_ICON_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="32" fill="#5b6cff"/><path d="M22 18v28m20-28v28M15 27h34M15 37h34" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/></svg>`
)}`;

export function getFallbackAvatarSvg(name: string, seed: string): string {
  const colors = [
    ["#ff7b72", "#d23f31"],
    ["#79b8ff", "#2188ff"],
    ["#7ee787", "#2ea44f"],
    ["#d2a8ff", "#8a63d2"],
    ["#ffa657", "#db6d28"],
    ["#56d4dd", "#1b7c83"],
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorPair = colors[Math.abs(hash) % colors.length];
  const initial = (name || seed).trim().charAt(0).toUpperCase() || "U";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g_${seed.replace(/[^a-zA-Z0-9]/g, "_")}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${colorPair[0]}"/><stop offset="100%" stop-color="${colorPair[1]}"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g_${seed.replace(/[^a-zA-Z0-9]/g, "_")})"/><text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="28" font-weight="700">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ROOMI_AVATAR = "/roomi-logo.svg";

function isAgentNode(node: { id: string; kind?: string; role?: string }) {
  return node.kind === "agent" || node.id === "U-ROOMI";
}

function nodeAvatar(node: { kind?: string; id: string; avatar?: string; label?: string; name?: string }) {
  if (node.kind === "topic") return TOPIC_ICON_SVG;
  if (isAgentNode(node)) return node.avatar || ROOMI_AVATAR;
  return node.avatar || getFallbackAvatarSvg(node.label || node.name || node.id, node.id);
}

export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[^\s@]+)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("@") ? (
          <span key={index} className="roomi-mention">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

function nodeRadius(node: SimulationNode) {
  if (node.kind === "topic") return 36;
  if (node.kind === "agent") return 32;
  return Math.max(26, Math.min(34, 22 + Math.sqrt(node.messages) * 3));
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
  activePersonId,
}: {
  threadId: string;
  topicLabel: string;
  data: CommunicationGraphData;
  onSelectionChange?: (selection: GraphSelection) => void;
  activePersonId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodeSelectionRef = useRef<d3.Selection<
    SVGGElement,
    SimulationNode,
    SVGGElement,
    unknown
  > | null>(null);
  const markerPrefix = useId().replaceAll(":", "");

  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const read = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((prev) =>
        Math.abs(prev.width - width) < 12 && Math.abs(prev.height - height) < 12
          ? prev
          : { width, height }
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function changeZoom(scale: number) {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.scaleBy, scale);
  }

  function resetZoom() {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(zoomRef.current.transform, d3.zoomIdentity);
  }

  // 外部からのactivePersonId指定でポップアップを表示
  useEffect(() => {
    if (!activePersonId || !nodeSelectionRef.current || !containerRef.current) return;
    const matchedNode = nodeSelectionRef.current
      .filter((d) => d.id === activePersonId)
      .node();
    if (matchedNode) {
      matchedNode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }, [activePersonId]);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0 || size.width < 40) {
      return;
    }

    const bounds = layoutBounds(size.width, size.height);
    const topicNode: SimulationNode = {
      id: TOPIC_NODE_ID,
      name: topicLabel,
      label: topicLabel,
      messages: data.nodes.reduce((total, node) => total + node.messages, 0),
      kind: "topic",
      x: bounds.cx,
      y: bounds.cy,
      fx: bounds.cx,
      fy: bounds.cy,
    };
    const people: SimulationNode[] = data.nodes.map((node) => ({
      ...node,
      label: node.name || node.id,
      kind: isAgentNode(node) ? "agent" : "person",
    }));
    const { boxW, boxH } = bounds;
    people.forEach((person, index) => {
      if (person.kind === "agent") {
        person.x = bounds.cx - boxW * 0.2;
        person.y = bounds.cy - boxH * 0.06;
        return;
      }
      const others = people.filter((item) => item.kind !== "agent");
      const slot = others.indexOf(person);
      const angle = (slot / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
      person.x = bounds.cx + Math.cos(angle) * (boxW * 0.34);
      person.y = bounds.cy + Math.sin(angle) * (boxH * 0.3);
    });
    const nodes = [topicNode, ...people];
    const topicLinks: SimulationLink[] = people
      .filter((node) => node.kind !== "agent")
      .map((node) => ({
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

    const svgElement = svgRef.current;
    const graphStage = svgElement.closest<HTMLElement>(".roomi-graph-stage");
    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");

    // 矢印マーカー定義
    const markerData = Object.entries(RELATIONSHIP_STATUS_META) as [
      RelationshipStatus,
      { label: string; color: string },
    ][];
    const markers = defs
      .selectAll("marker")
      .data(markerData)
      .join("marker")
      .attr("id", ([status]) => `${markerPrefix}-roomi-arrow-${status}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .attr("orient", "auto")
      .attr("markerUnits", "userSpaceOnUse");
    markers
      .append("path")
      .attr("d", "M0,-5L10,0L0,5Z")
      .attr("fill", ([, meta]) => meta.color);

    // 各ノードの円形クリッピングパス
    defs
      .selectAll("clipPath.node-clip")
      .data(nodes)
      .join("clipPath")
      .attr("class", "node-clip")
      .attr("id", (d) => `${markerPrefix}-clip-${d.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
      .append("circle")
      .attr("r", (d) => nodeRadius(d));

    const viewport = svg.append("g").attr("class", "topic-graph-viewport");

    // 背景クリックでポップアップを閉じる
    svg.on("click", (event) => {
      if (event.target === svgElement || event.target.tagName === "svg") {
        setPopup(null);
      }
    });

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
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr(
        "aria-label",
        (item) =>
          `${item.kind === "topic" ? "トピック" : item.kind === "agent" ? "エージェント" : "参加者"} ${item.label}、${item.messages}件`
      )
      .on("click", (event: MouseEvent, item: SimulationNode) => {
        event.stopPropagation();
        selectNode(item, event.currentTarget as SVGGElement);
      })
      .on("keydown", (event: KeyboardEvent, item: SimulationNode) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectNode(item, event.currentTarget as SVGGElement);
        }
      });

    nodeSelectionRef.current = node;

    function selectNode(item: SimulationNode, element?: SVGGElement | null) {
      node.classed("selected", (candidate) => candidate.id === item.id);

      if (element && containerRef.current) {
        const nodeRect = element.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const popupWidth = 300;
        const iconRightX = nodeRect.right - containerRect.left;
        const iconCenterY = nodeRect.top + nodeRect.height / 2 - containerRect.top;

        let popupX = iconRightX + 16;
        let placement: "right" | "left" = "right";

        // 画面右端からはみ出る場合は左側に反転
        if (popupX + popupWidth > containerRect.width - 20) {
          popupX = nodeRect.left - containerRect.left - popupWidth - 16;
          placement = "left";
        }

        // アイコン中心と矢印が揃う理想のトップ位置
        const idealY = iconCenterY - 32;
        const clampedY = Math.max(
          16,
          Math.min(containerRect.height - 300, idealY)
        );

        // 矢印のY座標（ポップアップ内相対位置）
        const arrowTop = Math.max(16, Math.min(260, iconCenterY - clampedY));

        setPopup({
          item,
          x: popupX,
          y: clampedY,
          arrowTop,
          placement,
        });
      }

      onSelectionChange?.({
        id: item.id,
        label: item.label,
        kind: item.kind,
        messages: item.messages,
        role: item.role,
        interests: item.interests,
        avatar: item.avatar,
      });
    }

    // ノードの背景円
    node
      .append("circle")
      .attr("r", nodeRadius)
      .attr("class", (item) => `topic-graph-circle ${item.kind}`);

    // ノードのアバター画像（番号ではなくログインアイコン）
    node
      .append("image")
      .attr("class", "topic-graph-avatar")
      .attr(
        "clip-path",
        (d) => `url(#${markerPrefix}-clip-${d.id.replace(/[^a-zA-Z0-9_-]/g, "_")})`
      )
      .attr("x", (d) => -nodeRadius(d))
      .attr("y", (d) => -nodeRadius(d))
      .attr("width", (d) => nodeRadius(d) * 2)
      .attr("height", (d) => nodeRadius(d) * 2)
      .attr("preserveAspectRatio", "xMidYMid slice")
      .attr("href", (d) => nodeAvatar(d));

    // ユーザー名 / トピック名ラベル
    node
      .append("text")
      .attr("class", "topic-graph-label")
      .attr("text-anchor", "middle")
      .attr("dy", (item) => nodeRadius(item) + 18)
      .text((item) =>
        item.label.length > 14 ? `${item.label.slice(0, 13)}…` : item.label
      );

    const topicDist = clamp(boxH * 0.32, 170, 320);
    const convoDist = clamp(bounds.span * 0.34, 160, 340);
    const charge = -clamp(bounds.span * 2.8, 1000, 2300);
    const collidePad = clamp(bounds.span * 0.1, 58, 96);

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, SimulationLink>(links)
          .id((item) => item.id)
          .distance((edge) => (edge.kind === "topic" ? topicDist : convoDist))
          .strength((edge) => (edge.kind === "topic" ? 0.16 : 0.22))
      )
      .force("charge", d3.forceManyBody().strength(charge).distanceMin(56))
      .force("x", d3.forceX(bounds.cx).strength(0.02))
      .force("y", d3.forceY(bounds.cy).strength(0.02))
      .force(
        "collision",
        d3
          .forceCollide<SimulationNode>()
          .radius((item) =>
            nodeRadius(item) + collidePad + (item.kind === "agent" ? 28 : 0)
          )
          .strength(0.9)
          .iterations(3)
      )
      .velocityDecay(0.28);

    const renderTick = () => {
      const displayPosition = (item: SimulationNode) => {
        const radius = nodeRadius(item);
        return {
          x: clamp(item.x ?? bounds.cx, bounds.x0 + radius, bounds.x1 - radius),
          y: clamp(
            item.y ?? bounds.cy,
            bounds.y0 + radius,
            bounds.y1 - radius - 18
          ),
        };
      };
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
        const targetPadding =
          nodeRadius(target) + (edge.kind === "conversation" ? 12 : 4);
        const labelProgress = 0.38 + (edge.labelIndex % 3) * 0.12;
        const labelOffset =
          (edge.labelIndex % 2 === 0 ? 1 : -1) *
          (20 + Math.floor(edge.labelIndex / 2) * 6);
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
      const renderedScale =
        Math.min(svgRect.width / bounds.width, svgRect.height / bounds.height) ||
        1;
      const svgOriginX =
        svgRect.left -
        stageRect.left -
        graphStage.clientLeft +
        (svgRect.width - bounds.width * renderedScale) / 2;
      const svgOriginY =
        svgRect.top -
        stageRect.top -
        graphStage.clientTop +
        (svgRect.height - bounds.height * renderedScale) / 2;
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
      .scaleExtent([0.5, 3.0])
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
  }, [data, onSelectionChange, topicLabel, size.width, size.height]);

  if (data.nodes.length === 0) {
    return (
      <div className="topic-graph-empty">
        このトピックには、まだグラフ化できる発言がないよ。
      </div>
    );
  }

  return (
    <div className="topic-graph-canvas" ref={containerRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${threadId}のコミュニケーショングラフ`}
        aria-describedby={`${markerPrefix}-relationships`}
      />

      {/* ノードクリック時の右側ポップアップ */}
      {popup && (
        <div
          className={`roomi-node-popup ${popup.placement}`}
          style={{
            left: `${popup.x}px`,
            top: `${popup.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="roomi-popup-arrow"
            style={{ top: `${popup.arrowTop}px` }}
          />
          <button
            className="roomi-popup-close"
            type="button"
            onClick={() => setPopup(null)}
            aria-label="閉じる"
          >
            ✕
          </button>

          <div className="roomi-popup-header">
            <div className="roomi-popup-avatar-wrap">
              <img
                className="roomi-popup-avatar"
                src={nodeAvatar(popup.item)}
                alt={popup.item.label}
              />
            </div>
            <div className="roomi-popup-title-info">
              <span className="roomi-popup-kicker">
                {popup.item.kind === "topic"
                  ? "トピック"
                  : popup.item.kind === "agent"
                    ? "エージェント"
                    : "参加者"}
              </span>
              <h4 className="roomi-popup-name">{popup.item.label}</h4>
              {popup.item.role && (
                <span className="roomi-popup-role-pill">{popup.item.role}</span>
              )}
            </div>
          </div>

          <div className="roomi-popup-body">
            <div className="roomi-popup-stat-row">
              <span className="roomi-popup-meta-label">発言数</span>
              <span className="roomi-popup-meta-value">
                <strong>{popup.item.messages}</strong> 件
              </span>
            </div>

            {popup.item.interests && (
              <div className="roomi-popup-detail-row">
                <span className="roomi-popup-meta-label">担当 / 関心事</span>
                <p className="roomi-popup-text">{popup.item.interests}</p>
              </div>
            )}

            {popup.item.kind !== "topic" && (
              <div className="roomi-popup-detail-row">
                <span className="roomi-popup-meta-label">つながり</span>
                <div className="roomi-popup-tags">
                  {data.edges
                    .filter(
                      (e) =>
                        e.source === popup.item.id || e.target === popup.item.id
                    )
                    .map((e, idx) => {
                      const otherId =
                        e.source === popup.item.id ? e.target : e.source;
                      const otherNode = data.nodes.find((n) => n.id === otherId);
                      const status = normalizeRelationshipStatus(e.status);
                      return (
                        <span key={idx} className="roomi-popup-relation-tag">
                          <i
                            className="status-indicator"
                            style={{
                              backgroundColor:
                                RELATIONSHIP_STATUS_META[status].color,
                            }}
                          />
                          {otherNode?.name || otherId} ({e.label})
                        </span>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
        ノードをクリックで詳細 ・ ドラッグで移動 ・ スクロールで拡大縮小
      </div>

      <ul id={`${markerPrefix}-relationships`} className="roomi-visually-hidden">
        {data.edges.map((edge, index) => {
          const source = data.nodes.find((node) => node.id === edge.source);
          const target = data.nodes.find((node) => node.id === edge.target);
          const normalizedStatus = normalizeRelationshipStatus(edge.status);
          const status = RELATIONSHIP_STATUS_META[normalizedStatus].label;
          const connector =
            edge.directed ?? Boolean(edge.status) ? "から" : "と";
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
