import type { CommunicationGraphData } from "../components/CommunicationTopicGraph";
import { DEMO_CAST } from "./demoCast";

export type TimelineItem = {
  ts: string;
  user_id: string;
  user_name?: string;
  text: string;
};

export type AuditItem = {
  thread_id: string;
  action: string;
  confidence: number;
  impact: number;
  reason: string;
};

type CommunicationDemo = {
  threadId: string;
  title: string;
  graph: CommunicationGraphData;
  timeline: TimelineItem[];
  audit: AuditItem[];
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

const ROOMI_REPLY =
  "ちょっと割り込ませて。いま場所の話と、生活を守る話が同じ土俵でぶつかってる。\n" +
  "@高橋さくら @伊藤あかり は「学生が住んでない1階はスタッフの朝を圧迫してる」で、" +
  "@中村蓮 は「準備と片付けは1階が一番楽で、家電も空けてる」。\n" +
  "どっちも正しさの勝負じゃなくて、誰の朝を先に守るかの話だと思う。" +
  "@藤井湊 が言ってくれた食い違いを、この一点に落とさないと、B棟も2階もまた戻るよ。";

export const COMMUNICATION_DEMO: CommunicationDemo = {
  threadId: "demo-live",
  title: "朝食会場を決めよう",
  graph: {
    nodes: [
      personNode("U-SASAKI", 2),
      personNode("U-OGASAHARA", 2),
      personNode("U-SAKUMA", 1),
      personNode("U-OZAKI", 2),
      personNode("U-KUWAHARA", 2),
      personNode("U-YAMAJI", 1),
      personNode("U-SUGIURA", 1),
      personNode("U-KIZUKI", 1),
      {
        id: "U-ROOMI",
        name: "Roomi",
        role: "AI",
        interests: "議論に入って、止まっている一点を問う",
        messages: 1,
        avatar: "/roomi-logo.svg",
        kind: "agent",
      },
    ],
    edges: [
      {
        source: "U-SASAKI",
        target: "U-OGASAHARA",
        label: "居住エリア",
        weight: 3,
        status: "discussion",
        directed: true,
      },
      {
        source: "U-OGASAHARA",
        target: "U-SAKUMA",
        label: "会場の場所",
        weight: 2,
        status: "blocked",
        directed: true,
      },
      {
        source: "U-SASAKI",
        target: "U-SAKUMA",
        label: "住んでないユニット",
        weight: 2,
        status: "blocked",
        directed: true,
      },
      {
        source: "U-OZAKI",
        target: "U-SASAKI",
        label: "議論の場",
        weight: 1,
        status: "discussion",
        directed: true,
      },
      {
        source: "U-KUWAHARA",
        target: "U-OZAKI",
        label: "主題の取り違え",
        weight: 2,
        status: "resolved",
        directed: true,
      },
      {
        source: "U-YAMAJI",
        target: "U-KUWAHARA",
        label: "読み違え",
        weight: 1,
        status: "resolved",
        directed: true,
      },
      {
        source: "U-SUGIURA",
        target: "U-SAKUMA",
        label: "B棟案",
        weight: 1,
        status: "discussion",
        directed: true,
      },
      {
        source: "U-KIZUKI",
        target: "U-SASAKI",
        label: "食い違いの整理",
        weight: 1,
        status: "review",
        directed: true,
      },
      {
        source: "U-KIZUKI",
        target: "U-SAKUMA",
        label: "食い違いの整理",
        weight: 1,
        status: "review",
        directed: true,
      },
      {
        source: "U-ROOMI",
        target: "U-SASAKI",
        label: "呼びかけ",
        weight: 2,
        status: "intervention",
        directed: true,
      },
      {
        source: "U-ROOMI",
        target: "U-OGASAHARA",
        label: "呼びかけ",
        weight: 2,
        status: "intervention",
        directed: true,
      },
      {
        source: "U-ROOMI",
        target: "U-SAKUMA",
        label: "呼びかけ",
        weight: 2,
        status: "intervention",
        directed: true,
      },
      {
        source: "U-ROOMI",
        target: "U-KIZUKI",
        label: "整理を受けて",
        weight: 1,
        status: "intervention",
        directed: true,
      },
    ],
  },
  timeline: [
    {
      ts: "07:12",
      user_id: "U-SASAKI",
      user_name: "高橋さくら",
      text: "朝食の搬入はA棟1階で認識しています。ただ1階はスタッフの使用権限がある場所なので、朝食をとる場所はA棟2階での運用は可能でしょうか。炊飯器も、何台かはスタッフ用として確保したいです。",
    },
    {
      ts: "07:18",
      user_id: "U-OGASAHARA",
      user_name: "伊藤あかり",
      text: "ユニットも居住者の使用エリアで、そこに割り当てられた家電は居住者専用です。学生の朝食会場は1階ではなく、2階などを使用してください。",
    },
    {
      ts: "07:41",
      user_id: "U-OGASAHARA",
      user_name: "伊藤あかり",
      text: "居住スタッフから、本来使えるスペースや家電が使えない、異臭がある、エリアを分けてほしいという報告が上がっています。A棟1階はスタッフの居住エリアなので、学生の朝食場所はA棟2階キッチンにしてください。",
    },
    {
      ts: "08:05",
      user_id: "U-SAKUMA",
      user_name: "中村蓮",
      text: "6:30から米を炊いていて、調理器具はスタッフさんが使えるように1台空けています。シンクも床も学生側で回しています。A棟1階の方が準備片付けが楽なので続けたいです。炊飯器とIH、ケトルは空けたまま、生ゴミの頻度も上げられます。",
    },
    {
      ts: "08:12",
      user_id: "U-SASAKI",
      user_name: "高橋さくら",
      text: "学生たちが住んでいないユニットに集まって朝食を食べなければいけない理由ってなんですか。A棟2階やB棟1階など、学生の住んでいるキッチンを使えばいいだけの話だと思います。",
    },
    {
      ts: "08:20",
      user_id: "U-OZAKI",
      user_name: "林みお",
      text: "【朝食会場について】これまでの議論をこちらに移します。",
    },
    {
      ts: "08:22",
      user_id: "U-KUWAHARA",
      user_name: "渡辺結衣",
      text: "ご提案いただいたところ申し訳ないですが、私は7:00からmtgがあり、9:30には視察に入るため明日不参加でお願いします。",
    },
    {
      ts: "08:24",
      user_id: "U-OZAKI",
      user_name: "林みお",
      text: "朝食については学生の朝食についてです！！ややこしくてすいません。",
    },
    {
      ts: "08:26",
      user_id: "U-YAMAJI",
      user_name: "加藤海斗",
      text: "すみません！みおが言ってくれてるとおりで、舌足らずでした。7:00のmtg大変ですね。",
    },
    {
      ts: "08:28",
      user_id: "U-KUWAHARA",
      user_name: "渡辺結衣",
      text: "読み違えており失礼しました！ありがとうございます。",
    },
    {
      ts: "08:31",
      user_id: "U-SUGIURA",
      user_name: "山本蒼",
      text: "b棟にしよぉ〜",
    },
    {
      ts: "08:36",
      user_id: "U-KIZUKI",
      user_name: "藤井湊",
      text: "まとめると、学生側はA棟1階を今後も使いたい。一方で、本来使える場所が使いづらい、という話も出ている。",
    },
    {
      ts: "08:38",
      user_id: "U-ROOMI",
      user_name: "Roomi",
      text: ROOMI_REPLY,
    },
  ],
  audit: [
    {
      thread_id: "demo-live",
      action: "reply",
      confidence: 1,
      impact: 1,
      reason: "方針が食い違っている。スタッフは居住エリア、学生は朝の動線を守ろうとしている。",
    },
  ],
};
