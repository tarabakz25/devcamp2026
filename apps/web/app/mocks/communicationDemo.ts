import type { CommunicationGraphData } from "../components/CommunicationTopicGraph";

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

export const COMMUNICATION_DEMO: CommunicationDemo = {
  threadId: "DEMO-ONBOARDING-01",
  title: "新メンバーのオンボーディング改善を決めよう",
  graph: {
    nodes: [
      {
        id: "U-AOI",
        name: "葵",
        role: "プロダクトマネージャー",
        interests: "課題整理・意思決定",
        messages: 4,
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      },
      {
        id: "U-RIN",
        name: "凛",
        role: "プロダクトデザイナー",
        interests: "初回体験・ガイド設計",
        messages: 3,
        avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
      },
      {
        id: "U-MINATO",
        name: "湊",
        role: "エンジニア",
        interests: "実装範囲・計測",
        messages: 3,
        avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80",
      },
      {
        id: "U-MIO",
        name: "澪",
        role: "カスタマーサクセス",
        interests: "利用定着・問い合わせ",
        messages: 2,
        avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&auto=format&fit=crop&q=80",
      },
      {
        id: "U-HARU",
        name: "陽",
        role: "セールス",
        interests: "顧客期待・導入支援",
        messages: 2,
        avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      },
    ],
    edges: [
      {
        source: "U-AOI",
        target: "U-RIN",
        label: "体験設計",
        weight: 4,
        status: "discussion",
        directed: true,
      },
      {
        source: "U-AOI",
        target: "U-MINATO",
        label: "仕様と実装",
        weight: 5,
        status: "review",
        directed: true,
      },
      {
        source: "U-RIN",
        target: "U-MINATO",
        label: "UI実装",
        weight: 3,
        status: "review",
        directed: true,
      },
      {
        source: "U-AOI",
        target: "U-MIO",
        label: "利用課題",
        weight: 2,
        status: "discussion",
        directed: true,
      },
      {
        source: "U-MIO",
        target: "U-HARU",
        label: "顧客フィードバック",
        weight: 3,
        status: "resolved",
        directed: true,
      },
      {
        source: "U-HARU",
        target: "U-MINATO",
        label: "導入要件",
        weight: 1,
        status: "blocked",
        directed: true,
      },
    ],
  },
  timeline: [
    { ts: "09:10", user_id: "U-AOI", user_name: "葵", text: "新メンバーが最初の1週間で迷うポイントを減らしたい。" },
    { ts: "09:14", user_id: "U-MIO", user_name: "澪", text: "問い合わせでは、最初に何をすればいいか分からない声が多いよ。" },
    { ts: "09:18", user_id: "U-RIN", user_name: "凛", text: "初回ログイン後に3ステップのガイドを出す案はどう？" },
    { ts: "09:22", user_id: "U-MINATO", user_name: "湊", text: "既存画面のままなら、今週中に計測込みで試作できそう。" },
    { ts: "09:27", user_id: "U-HARU", user_name: "陽", text: "導入担当者向けの共有リンクも一緒に欲しい。" },
    { ts: "09:31", user_id: "U-AOI", user_name: "葵", text: "目的を初回タスク完了率の改善に絞ろう。" },
    { ts: "09:35", user_id: "U-RIN", user_name: "凛", text: "ガイドはスキップ可能にして、後から再表示できるようにする。" },
    { ts: "09:39", user_id: "U-MINATO", user_name: "湊", text: "完了・スキップ・再表示の3イベントを取るね。" },
    { ts: "09:43", user_id: "U-MIO", user_name: "澪", text: "公開後は問い合わせ件数の変化も見たい。" },
    { ts: "09:47", user_id: "U-HARU", user_name: "陽", text: "来週の新規導入2社に先行で案内できるよ。" },
    { ts: "09:51", user_id: "U-AOI", user_name: "葵", text: "対象は新規アカウントだけで問題ない？" },
    { ts: "09:54", user_id: "U-RIN", user_name: "凛", text: "既存ユーザーには設定画面から任意で試せる形がよさそう。" },
    { ts: "09:58", user_id: "U-MINATO", user_name: "湊", text: "フラグを分ければ両方対応できる。" },
    { ts: "10:02", user_id: "U-AOI", user_name: "葵", text: "新規向けを必須、既存向けを任意として試作を進めよう。" },
  ],
  audit: [
    {
      thread_id: "DEMO-ONBOARDING-01",
      action: "論点整理",
      confidence: 0.86,
      impact: 0.74,
      reason: "目的と解決案が混在していたため、成功指標と対象ユーザーを分けて整理した。",
    },
    {
      thread_id: "DEMO-ONBOARDING-01",
      action: "意思決定を促す",
      confidence: 0.92,
      impact: 0.88,
      reason: "対象範囲の確認が未解決だったため、新規必須・既存任意の選択肢を提示した。",
    },
  ],
};
