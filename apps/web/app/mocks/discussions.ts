import type { CommunicationGraphData } from "../components/CommunicationTopicGraph";
import { COMMUNICATION_DEMO } from "./communicationDemo";
import { DEMO_CAST } from "./demoCast";

export type DiscussionStatus = "discussion" | "review" | "resolved" | "blocked";

export type DiscussionMessage = {
  ts: string;
  user_id: string;
  user_name: string;
  text: string;
};

export type Discussion = {
  id: string;
  backendThreadId?: string;
  title: string;
  channel: string;
  status: DiscussionStatus;
  summary: string;
  lastActivity: string;
  lastPreview: string;
  messageCount: number;
  participantIds: string[];
  aiInterventions: number;
  liveDemo?: boolean;
  graph: CommunicationGraphData;
  timeline: DiscussionMessage[];
};

const castById = Object.fromEntries(DEMO_CAST.map((person) => [person.user_id, person]));

function personNode(
  id: string,
  messages: number,
  extra?: Partial<CommunicationGraphData["nodes"][number]>,
) {
  const person = castById[id];
  return {
    id,
    name: person?.demo_name || id,
    role: person?.role || "",
    interests: person?.stance || "",
    messages,
    avatar: "",
    kind: "person" as const,
    ...extra,
  };
}

const ROOMI_NODE = {
  id: "U-ROOMI",
  name: "Roomi",
  role: "AI",
  interests: "議論に入って、止まっている一点を問う",
  messages: 1,
  avatar: "/roomi-logo.svg",
  kind: "agent" as const,
};

export const DISCUSSIONS: Discussion[] = [
  {
    id: "breakfast",
    backendThreadId: process.env.NEXT_PUBLIC_DEMO_THREAD_ID || COMMUNICATION_DEMO.threadId,
    title: COMMUNICATION_DEMO.title,
    channel: "03_rooms_discussion",
    status: "discussion",
    summary: "学生は朝の動線、スタッフは居住エリア。同じ土俵で場所の話がぶつかっている。",
    lastActivity: "08:38",
    lastPreview: "どっちも正しさの勝負じゃなくて、誰の朝を先に守るかの話だと思う。",
    messageCount: COMMUNICATION_DEMO.timeline.length,
    participantIds: COMMUNICATION_DEMO.graph.nodes.map((node) => node.id),
    aiInterventions: COMMUNICATION_DEMO.audit.length,
    liveDemo: true,
    graph: COMMUNICATION_DEMO.graph,
    timeline: COMMUNICATION_DEMO.timeline.map((item) => ({
      ...item,
      user_name: item.user_name || item.user_id,
    })),
  },
  {
    id: "kitchen-booking",
    title: "週末の共用キッチン予約",
    channel: "03_rooms_discussion",
    status: "review",
    summary: "土曜午前の予約が重なる。先着か、棟ごとの枠か、まだ確認が残っている。",
    lastActivity: "昨日 21:14",
    lastPreview: "先着だとA棟が埋まる。棟ごとの枠にした方が公平だと思う。",
    messageCount: 6,
    participantIds: ["U-SUGIURA", "U-MATSUI", "U-OZAKI", "U-ROOMI"],
    aiInterventions: 1,
    graph: {
      nodes: [
        personNode("U-SUGIURA", 2),
        personNode("U-MATSUI", 2),
        personNode("U-OZAKI", 1),
        { ...ROOMI_NODE, messages: 1 },
      ],
      edges: [
        {
          source: "U-SUGIURA",
          target: "U-MATSUI",
          label: "予約ルール",
          weight: 2,
          status: "review",
          directed: true,
        },
        {
          source: "U-OZAKI",
          target: "U-SUGIURA",
          label: "公平性",
          weight: 1,
          status: "discussion",
          directed: true,
        },
        {
          source: "U-ROOMI",
          target: "U-MATSUI",
          label: "確認",
          weight: 1,
          status: "intervention",
          directed: true,
        },
      ],
    },
    timeline: [
      {
        ts: "20:41",
        user_id: "U-SUGIURA",
        user_name: "山本蒼",
        text: "土曜のキッチン、先着だと毎回A棟が埋まる。B棟枠ほしい。",
      },
      {
        ts: "20:48",
        user_id: "U-MATSUI",
        user_name: "小林陽菜",
        text: "実人数見ないと枠の配分が決められない。休みの朝は人が少ない。",
      },
      {
        ts: "21:02",
        user_id: "U-OZAKI",
        user_name: "林みお",
        text: "先着と棟枠、どっちで運用するかだけ先に決めたい。",
      },
      {
        ts: "21:14",
        user_id: "U-ROOMI",
        user_name: "Roomi",
        text: "争点は予約の取り方。先着か棟枠か、土曜午前の1枠だけ切り出して決めない？",
      },
    ],
  },
  {
    id: "noise",
    title: "夜の共用部の音",
    channel: "03_rooms_discussion",
    status: "blocked",
    summary: "22時以降の会話と洗い物の音。ルール案はあるが、運用の主体が決まっていない。",
    lastActivity: "月曜 19:06",
    lastPreview: "注意する人がいないと、ルールだけ置いても戻る。",
    messageCount: 5,
    participantIds: ["U-SASAKI", "U-MERRITT", "U-KIZUKI", "U-YAMAJI"],
    aiInterventions: 0,
    graph: {
      nodes: [
        personNode("U-SASAKI", 2),
        personNode("U-MERRITT", 1),
        personNode("U-KIZUKI", 1),
        personNode("U-YAMAJI", 1),
      ],
      edges: [
        {
          source: "U-SASAKI",
          target: "U-MERRITT",
          label: "消灯後",
          weight: 2,
          status: "blocked",
          directed: true,
        },
        {
          source: "U-KIZUKI",
          target: "U-SASAKI",
          label: "運用主体",
          weight: 1,
          status: "discussion",
          directed: true,
        },
        {
          source: "U-YAMAJI",
          target: "U-KIZUKI",
          label: "試し運用",
          weight: 1,
          status: "review",
          directed: true,
        },
      ],
    },
    timeline: [
      {
        ts: "18:40",
        user_id: "U-SASAKI",
        user_name: "高橋さくら",
        text: "22時以降の共用部、会話と洗い物の音がスタッフ棟まで届いています。",
      },
      {
        ts: "18:51",
        user_id: "U-MERRITT",
        user_name: "森田カイ",
        text: "決まりを全体に共有する。決まらなければ一旦現状維持。",
      },
      {
        ts: "19:00",
        user_id: "U-KIZUKI",
        user_name: "藤井湊",
        text: "注意する人がいないと、ルールだけ置いても戻る。誰が運用するかが先。",
      },
      {
        ts: "19:06",
        user_id: "U-YAMAJI",
        user_name: "加藤海斗",
        text: "1週間だけ試して、感想を集めてからでいいと思う。",
      },
    ],
  },
  {
    id: "trash",
    title: "ゴミ出し当番のローテ",
    channel: "03_rooms_discussion",
    status: "resolved",
    summary: "週次ローテでA棟→B棟。休みの朝は翌日回しで合意した。",
    lastActivity: "金曜 16:22",
    lastPreview: "休みの朝は翌日回し。これで回す。",
    messageCount: 4,
    participantIds: ["U-SAKUMA", "U-SUGIURA", "U-MATSUI", "U-OZAKI"],
    aiInterventions: 0,
    graph: {
      nodes: [
        personNode("U-SAKUMA", 1),
        personNode("U-SUGIURA", 1),
        personNode("U-MATSUI", 1),
        personNode("U-OZAKI", 1),
      ],
      edges: [
        {
          source: "U-SAKUMA",
          target: "U-SUGIURA",
          label: "当番順",
          weight: 2,
          status: "resolved",
          directed: true,
        },
        {
          source: "U-MATSUI",
          target: "U-SAKUMA",
          label: "休みの朝",
          weight: 1,
          status: "resolved",
          directed: true,
        },
      ],
    },
    timeline: [
      {
        ts: "15:50",
        user_id: "U-SAKUMA",
        user_name: "中村蓮",
        text: "ゴミ出し、週次でA棟→B棟にしたい。朝の動線に乗せられる。",
      },
      {
        ts: "16:04",
        user_id: "U-MATSUI",
        user_name: "小林陽菜",
        text: "休みの朝は人が少ないから、その日は翌日回しで。",
      },
      {
        ts: "16:18",
        user_id: "U-SUGIURA",
        user_name: "山本蒼",
        text: "B棟もそれでいい。",
      },
      {
        ts: "16:22",
        user_id: "U-OZAKI",
        user_name: "林みお",
        text: "休みの朝は翌日回し。これで回す。",
      },
    ],
  },
];

export function getDiscussion(id: string) {
  return DISCUSSIONS.find((item) => item.id === id) || null;
}

export function discussionsForMember(memberId: string) {
  return DISCUSSIONS.filter((item) => item.participantIds.includes(memberId));
}
