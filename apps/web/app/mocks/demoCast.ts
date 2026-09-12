export type DemoCastMember = {
  user_id: string;
  demo_name: string;
  real_name: string;
  role: string;
  stance: string;
};

export const DEMO_CAST: DemoCastMember[] = [
  {
    user_id: "U-SASAKI",
    demo_name: "高橋さくら",
    real_name: "佐々木美優",
    role: "寮スタッフ",
    stance: "学生は住んでいるキッチンを使うべき。1階はスタッフの居住エリア",
  },
  {
    user_id: "U-OGASAHARA",
    demo_name: "伊藤あかり",
    real_name: "小笠原愛",
    role: "寮スタッフ",
    stance: "学生の朝食会場はA棟2階。1階キッチンと家電はスタッフ専用",
  },
  {
    user_id: "U-SAKUMA",
    demo_name: "中村蓮",
    real_name: "佐久間康輔",
    role: "寮運営学生",
    stance: "A棟1階を続けたい。朝の準備と片付けが一番楽",
  },
  {
    user_id: "U-OZAKI",
    demo_name: "林みお",
    real_name: "尾崎仁瑚",
    role: "寮運営学生",
    stance: "両方の論点を整理して会場を決めたい",
  },
  {
    user_id: "U-KUWAHARA",
    demo_name: "渡辺結衣",
    real_name: "桑原菜穂",
    role: "パートナー連携",
    stance: "視察と朝の予定が先。議論の主題を取り違えない",
  },
  {
    user_id: "U-YAMAJI",
    demo_name: "加藤海斗",
    real_name: "山地駿徹",
    role: "モノラボ",
    stance: "いきなり決めず、BASEで1日試して感想を集めたい",
  },
  {
    user_id: "U-SUGIURA",
    demo_name: "山本蒼",
    real_name: "杉浦昊翼",
    role: "学生",
    stance: "B棟がいい。学生が住んでいる場所でやりたい",
  },
  {
    user_id: "U-MATSUI",
    demo_name: "小林陽菜",
    real_name: "松井ひな子",
    role: "学生",
    stance: "実際に食べてる人数を見て判断したい。休みの朝は人が少ない",
  },
  {
    user_id: "U-MERRITT",
    demo_name: "森田カイ",
    real_name: "メリットキア",
    role: "寮運営学生",
    stance: "決まりを全体に共有する。決まらなければ一旦現状維持",
  },
  {
    user_id: "U-KIZUKI",
    demo_name: "藤井湊",
    real_name: "相木絆煌",
    role: "寮運営学生",
    stance: "学生は1階継続、スタッフは2階、という食い違いを言語化したい",
  },
];

export const DEMO_CAST_ROLE_ORDER = ["寮スタッフ", "寮運営学生", "学生", "パートナー連携", "モノラボ"];
