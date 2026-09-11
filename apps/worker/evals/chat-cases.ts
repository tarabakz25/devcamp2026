import type { TopicKind } from "../src/communication-score.ts";

export type ReplyExpectation = {
  minChars?: number;
  maxChars?: number;
  maxSentences?: number;
  containsAny?: string[];
  forbidden?: string[];
};

export type TurnExpectation = {
  respond: boolean;
  action: "silent" | "reply" | "mention" | "handoff";
  reasonContainsAny?: string[];
  reply?: ReplyExpectation;
};

export type ChatTurn = {
  userId: string;
  text: string;
  waitBeforeSec?: number;
  expect: TurnExpectation;
};

export type ChatCase = {
  id: string;
  title: string;
  description: string;
  topicKind: TopicKind;
  turns: ChatTurn[];
};

export const CHAT_CASES = [
  {
    id: "status_updates_stay_silent",
    title: "情報共有と対応完了には割り込まない",
    description: "質問や対立がない短い連絡では、Roomiが最後まで発言しないことを確認する。",
    topicKind: "announcement",
    turns: [
      {
        userId: "U-SASAKI",
        text: "明日の朝食は7時からA棟2階で用意します。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-OZAKI",
        text: "確認しました。参加する学生にも共有しておきます。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "全員への共有まで完了しました。対応済みです。",
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "conflict_then_cooldown",
    title: "対立が成立した時点で返し、直後は再介入しない",
    description: "片側の説明では待ち、反対意見が出た2発言目で返し、同じ議論への連続介入を抑える。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-SASAKI",
        text: "A棟1階は居住スタッフ専用です。学生は2階を使ってください。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SAKUMA",
        text: "学生の朝は1階の方が準備片付けが楽なので、これからも続けたいです。",
        expect: {
          respond: true,
          action: "reply",
          reasonContainsAny: ["食い違", "対立", "噛み合", "方針"],
          reply: {
            minChars: 20,
            maxChars: 280,
            maxSentences: 4,
            containsAny: ["場所", "朝", "居住", "決め"],
            forbidden: ["AIとして", "JSON", "```"],
          },
        },
      },
      {
        userId: "U-OZAKI",
        text: "では、結局どちらの場所にするかどう決めますか？",
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "direct_roomi_mention",
    title: "Roomiへの明示メンションにはその場で返す",
    description: "通常の情報共有に見える文でも、Roomiが直接呼ばれた発言では即応答する。",
    topicKind: "discussion",
    turns: [
      {
        userId: "U-OZAKI",
        text: "@Roomi ここまでの話を整理して",
        expect: {
          respond: true,
          action: "reply",
          reasonContainsAny: ["メンション", "呼", "整理", "介入"],
          reply: {
            minChars: 10,
            maxChars: 280,
            maxSentences: 4,
            forbidden: ["AIとして", "JSON", "```"],
          },
        },
      },
    ],
  },
  {
    id: "resolved_after_conflict",
    title: "合意後は追加で割り込まない",
    description: "対立への介入後、人が結論と担当を決めたらRoomiは黙る。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-SASAKI",
        text: "居住エリアなので学生は2階を使ってください。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SAKUMA",
        text: "学生の朝は1階の方が準備片付けが楽なので続けたいです。",
        expect: {
          respond: true,
          action: "reply",
          reply: {
            minChars: 20,
            maxChars: 280,
            maxSentences: 4,
            forbidden: ["AIとして", "JSON", "```"],
          },
        },
      },
      {
        userId: "U-MERRITT",
        text: "今回は2階で試すことに決まりました。案内は私が今日中に共有します。",
        waitBeforeSec: 21,
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-OZAKI",
        text: "了解しました。案内を確認します。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SAKUMA",
        text: "やっぱり1階を続けたいです。もう一度考えませんか？",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
  {
    id: "healthy_decision_process",
    title: "意見差があっても担当と期限があれば待つ",
    description: "立場の違いだけで割り込まず、人が決め方を用意できている状態を健全と判定する。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-SASAKI",
        text: "居住エリアなので、学生は2階を使ってください。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SAKUMA",
        text: "1階を続けたいですが、私が明日までに両方を比較して決め方を提案します。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SASAKI",
        text: "了解しました。その進め方でお願いします。",
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "unanswered_question_stalls",
    title: "未回答質問が残ったら介入する",
    description: "最初の質問では待ち、別の話題へ流れて未回答のままになった時点で介入する。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-OZAKI",
        text: "公開日をいつ決めますか？",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "先にデザインの確認を進めます。公開日はまだ未定です。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
  {
    id: "courtesy_is_not_question",
    title: "日常的な挨拶を未回答質問にしない",
    description: "『いつも』『どうぞ』の部分一致だけで質問や停滞と誤判定しない。",
    topicKind: "announcement",
    turns: [
      {
        userId: "U-OZAKI",
        text: "いつもありがとうございます。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "どうぞよろしくお願いします。",
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "negated_resolution_stalls",
    title: "未完了を解決済みにしない",
    description: "完了や担当という語があっても否定されていれば、停滞として介入する。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-OZAKI",
        text: "対応は完了できていません。次をどうするか相談したいです。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "担当も未定で、まだ決まっていません。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
  {
    id: "resolution_question_is_open",
    title: "完了確認の質問を解決済みにしない",
    description: "『完了しましたか』は完了報告ではなく未回答質問として扱う。",
    topicKind: "incident",
    turns: [
      {
        userId: "U-SASAKI",
        text: "障害対応をお願いします。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-OZAKI",
        text: "対応は完了しましたか？",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "先にデザイン確認を進めます。障害対応の状況はまだ不明です。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
] satisfies ChatCase[];

export const KNOWN_GAP_CASES = [
  {
    id: "gap_paraphrased_resolution",
    title: "解決表現の言い換えを認識する",
    description: "決定・合意という語がなくても、進行方法、担当、期限がそろえば解決状態として扱う。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-SASAKI",
        text: "学生は2階を使ってください。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SAKUMA",
        text: "朝は1階を続けたいです。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
      {
        userId: "U-MERRITT",
        text: "では今回は2階で進行します。佐々木さんが案内を出して、金曜までに終わらせます。",
        waitBeforeSec: 21,
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "gap_paraphrased_conflict",
    title: "婉曲な対立を検知する",
    description: "直接的な制約語や反対語を使わない意見対立を検知する。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-SASAKI",
        text: "スタッフの生活区画なので、朝食は上の階へ移してもらえると助かります。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SAKUMA",
        text: "今いる場所のままが助かります。移動は現実的ではありません。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
  {
    id: "gap_quoted_conflict",
    title: "議事録内の対立を現在の対立にしない",
    description: "引用・共有された過去発言を投稿者自身の主張として数えない。",
    topicKind: "announcement",
    turns: [
      {
        userId: "U-OZAKI",
        text: "議事録から共有します。佐々木さんは『学生は2階を使ってください』と発言しました。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "続きです。佐久間さんの『1階を続けたい』という発言も記録しました。対応依頼ではありません。",
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "gap_quoted_roomi_mention",
    title: "引用内のRoomi表記には反応しない",
    description: "資料やREADME内の文字列として書かれた@Roomiを直接メンションと誤認しない。",
    topicKind: "announcement",
    turns: [
      {
        userId: "U-OZAKI",
        text: "READMEの例には『@Roomi ここまで整理して』と記載されています。",
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "gap_unrelated_answer",
    title: "無関係な回答で質問を閉じない",
    description: "別件への担当表明があっても、元の公開日質問は未回答として維持する。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-OZAKI",
        text: "公開日をいつ決めますか？",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "別件の問い合わせ対応は私が担当します。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
  {
    id: "gap_negated_disagreement",
    title: "否定された反対語を対立扱いしない",
    description: "『反対ではない』を反対意見として数えず、合意した進行を邪魔しない。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-SASAKI",
        text: "安全上、この手順で進めてください。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-SAKUMA",
        text: "反対ではありません。そのまま進めましょう。",
        expect: { respond: false, action: "silent" },
      },
    ],
  },
  {
    id: "gap_conditional_completion",
    title: "条件付き完了を解決済みにしない",
    description: "完了予定の前提が崩れた場合、完了という語だけで解決状態を維持しない。",
    topicKind: "incident",
    turns: [
      {
        userId: "U-SASAKI",
        text: "障害対応をお願いします。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-OZAKI",
        text: "テストが通れば対応完了です。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "テストはまだ失敗しています。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
  {
    id: "gap_negation_scope",
    title: "広い否定表現を未解決として扱う",
    description: "『完了したとは言えない』を完了報告として扱わない。",
    topicKind: "incident",
    turns: [
      {
        userId: "U-OZAKI",
        text: "障害対応はいつ完了しますか？",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "現時点では、障害対応が完了したとは言えません。復旧時刻も示せません。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
  {
    id: "gap_indirect_question",
    title: "疑問符のない依頼質問を検知する",
    description: "婉曲な質問が別話題へ流れた場合も、未回答として検知する。",
    topicKind: "decision",
    turns: [
      {
        userId: "U-OZAKI",
        text: "公開日の目安を教えてもらえると助かります。",
        expect: { respond: false, action: "silent" },
      },
      {
        userId: "U-MERRITT",
        text: "先にロゴの色を確認しておきます。",
        expect: {
          respond: true,
          action: "reply",
          reply: { minChars: 10, maxChars: 280, maxSentences: 4, forbidden: ["AIとして", "JSON", "```"] },
        },
      },
    ],
  },
] satisfies ChatCase[];
