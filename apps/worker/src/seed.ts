export interface ScenarioStakeholder {
  user_id: string;
  user_name: string;
  role: string;
  interests: string;
  avatar: string;
}

export interface ScenarioMessage {
  user_id: string;
  text: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  channel_name: string;
  stakeholders: ScenarioStakeholder[];
  messages: ScenarioMessage[];
}

export const SEED_STAKEHOLDERS: ScenarioStakeholder[] = [
  {
    user_id: "U-SASAKI",
    user_name: "高橋さくら",
    role: "寮スタッフ",
    interests: "学生は住んでいるキッチン（A棟2階やB棟）を使うべき。1階はスタッフの居住エリア",
    avatar: "",
  },
  {
    user_id: "U-OGASAHARA",
    user_name: "伊藤あかり",
    role: "寮スタッフ",
    interests: "学生の朝食会場はA棟2階。1階キッチンと家電はスタッフ専用",
    avatar: "",
  },
  {
    user_id: "U-SAKUMA",
    user_name: "中村蓮",
    role: "寮運営学生",
    interests: "A棟1階を続けたい。朝の準備と片付けが一番楽",
    avatar: "",
  },
  {
    user_id: "U-OZAKI",
    user_name: "林みお",
    role: "寮運営学生",
    interests: "両方の論点を整理して会場を決めたい。決めきれていない",
    avatar: "",
  },
  {
    user_id: "U-KUWAHARA",
    user_name: "渡辺結衣",
    role: "パートナー連携",
    interests: "視察と朝の予定が先。議論の主題を取り違えない",
    avatar: "",
  },
  {
    user_id: "U-YAMAJI",
    user_name: "加藤海斗",
    role: "モノラボ",
    interests: "いきなり決めず、BASEで1日試して感想を集めたい",
    avatar: "",
  },
  {
    user_id: "U-SUGIURA",
    user_name: "山本蒼",
    role: "学生",
    interests: "B棟がいい。学生が住んでいる場所でやりたい",
    avatar: "",
  },
  {
    user_id: "U-MATSUI",
    user_name: "小林陽菜",
    role: "学生",
    interests: "実際に食べてる人数を見て判断したい。休みの朝は人が少ない",
    avatar: "",
  },
  {
    user_id: "U-MERRITT",
    user_name: "森田カイ",
    role: "寮運営学生",
    interests: "決まりを全体に共有する。決まらなければ一旦現状維持",
    avatar: "",
  },
  {
    user_id: "U-KIZUKI",
    user_name: "藤井湊",
    role: "寮運営学生",
    interests: "学生は1階継続、スタッフは2階、という食い違いを言語化したい",
    avatar: "",
  },
];

export const EBLOCK_STAKEHOLDERS: ScenarioStakeholder[] = [
  {
    user_id: "U-MIYANO",
    user_name: "宮野しゅうた",
    role: "学生（BASE利用者）",
    interests: "BASEの机付近に電源がなく困っている。e-block充電ドックかAC延長コードを常設してほしい",
    avatar: "",
  },
  {
    user_id: "U-KANO",
    user_name: "叶としのぶ",
    role: "学務スタッフ",
    interests: "学務の所管ではない。論点を整理し、BASEのコンセントから机に届くAC延長コード手配で解決を図りたい",
    avatar: "",
  },
  {
    user_id: "U-KITAMURA",
    user_name: "北村みき",
    role: "寮スタッフ",
    interests: "e-blockはパートナー連携チームが設置したもの。担当の河野さんに確認を繋ぐ",
    avatar: "",
  },
  {
    user_id: "U-KAWANO",
    user_name: "河野めぐみ",
    role: "パートナー連携（e-block管理者）",
    interests: "パナソニック無償貸与のe-block本体を管理。充電ドックは余分がなくBASE常設不可。コード類はパートナー予算外なので寮チーム側で検討してほしい",
    avatar: "",
  },
  {
    user_id: "U-TANAKA",
    user_name: "田中よしたか",
    role: "パートナーディレクター",
    interests: "全体の配置方針と予算承認。なぜ学校側が購入する必要があるのか、居室のコンセント利用状況も含め精査したい",
    avatar: "",
  },
  {
    user_id: "U-AIKI",
    user_name: "藤井湊",
    role: "学生自治",
    interests: "学生の作業環境の利便性を確保したい。利用ルールを明確にして解決したい",
    avatar: "",
  },
];

export const HYGIENE_STAKEHOLDERS: ScenarioStakeholder[] = [
  {
    user_id: "U-NAKATANI",
    user_name: "中渓いっしん",
    role: "学生（寮生）",
    interests: "ふきんの除菌方法。普通の洗剤洗いや放置による異臭・雑菌繁殖を防ぐため、ハイター/オキシクリーンのつけ置きルールを作りたい",
    avatar: "",
  },
  {
    user_id: "U-KIAH",
    user_name: "森田カイ",
    role: "学生（寮長・取りまとめ）",
    interests: "朝食受け取りの月水金にふきん洗濯・漂白を行う運用を試したい。無理のないルーティン化を目指す",
    avatar: "",
  },
  {
    user_id: "U-TOYAMA",
    user_name: "外山えれな",
    role: "学生（当番制提案）",
    interests: "特定の人の負担にならないよう、パン当番や点呼の人員を調整して「ふきん当番」を正式に設置したい",
    avatar: "",
  },
  {
    user_id: "U-TAKEDA",
    user_name: "武田りこ",
    role: "学生（現状共有）",
    interests: "漂白前後の汚れの落ち具合など現状を共有し、衛生状態の改善を促したい",
    avatar: "",
  },
  {
    user_id: "U-SASAKI",
    user_name: "高橋さくら",
    role: "寮スタッフ",
    interests: "キッチンの衛生環境の維持。備品（漂白剤・バケツ等）の手配可否や共用エリアの運用ルールを管理",
    avatar: "",
  },
  {
    user_id: "U-OGASAHARA",
    user_name: "伊藤あかり",
    role: "寮スタッフ",
    interests: "キッチン共用部の衛生と生活環境の質を保ちたい。運用責任と管理体制を明確にするべき",
    avatar: "",
  },
];

export const SCENARIO_BREAKFAST_MESSAGES: ScenarioMessage[] = [
  {
    user_id: "U-SASAKI",
    text: "朝食会場についてご相談です。朝食の搬入場所がA棟1階キッチンである点については、事前に許可しているため認識しています。一方で、A棟1階キッチンはA棟1階スタッフの使用権限がある場所のため、朝食をとる場所については、A棟2階キッチンでの運用とすることは可能でしょうか？また、炊飯器などの電化製品についても、基本的にA棟1階の居住スタッフに使用権限があるため、炊飯器のうち何台かはスタッフ用として確保したいです。",
  },
  {
    user_id: "U-OGASAHARA",
    text: "ユニットも居住者の使用エリアで、そこに割り当てられた家電は居住者専用です。なので学生の朝食会場は１階ではなく、２階などを使用してください。",
  },
  {
    user_id: "U-OGASAHARA",
    text: "こちらお返事遅くなってすみません。朝食の搬入場所がA棟1階キッチンである点については、事前に許可しているため認識しています。一方で、現在、居住しているスタッフより、学生が使用することで、本来使用できるはずのスペースが使えない、家電が使えない場合がある、異臭が発生している、学生とエリアを分けてほしいという報告が上がってきています。A棟1階フロアはスタッフの居住エリアであり、スタッフも大切な仲間なので、生活の質を担保したいです。よって、学生の朝食場所は、A棟2階キッチンにしてください。",
  },
  {
    user_id: "U-SAKUMA",
    text: "学生の朝の状態を共有させてください。6:30〜米を炊いています。調理器具はスタッフさんが使用できるように必ず1台空けてあります。またシンク、キッチン、布巾の洗濯は学生が行っておりヤマジン2号(ルンバ)が床の清掃を行なってます。私たちとしてはA棟1階の使用をした方が朝食の準備片付けが楽になりできればこれからも続けていきたいと考えています。使用を続けていく場合に私たちが提案できることは、スタッフさんが確実に使えるように炊飯器とIHコンロ、ケトルをこれからも開けておくことと、生ゴミの捨てる頻度を上げることです。",
  },
  {
    user_id: "U-SASAKI",
    text: "自分達、学生たちが住んでいないユニットに集まって、朝食を食べなければいけない理由ってなんですか？A棟2階とか、B棟1階とか、学生の住んでいるキッチンを使用すればいいだけの話だと思います。それに伴って、朝食を届けてもらう冷蔵庫をB棟1階に移動する？とかそういう新たな意見が出てきて、寮チームとの相談が必要そうだったら、相談してくれたらいいのかなと思います。",
  },
  {
    user_id: "U-OZAKI",
    text: "【朝食会場について】これまでの議論をこちらに移します。",
  },
  {
    user_id: "U-KUWAHARA",
    text: "ご提案いただいたところ申し訳ないですが、私は7:00〜mtgがあり、9:30には視察に入るため明日不参加でお願いします",
  },
  {
    user_id: "U-OZAKI",
    text: "朝食については学生の朝食についてです！！ややこしくてすいません",
  },
  {
    user_id: "U-YAMAJI",
    text: "すみません！みおが言ってくれてるとおりで、舌足らずでした。7:00〜mtg大変ですね。お疲れ様です",
  },
  {
    user_id: "U-KUWAHARA",
    text: "読み違えており失礼しました！ありがとうございます。早起きして大人しくmtgします",
  },
  {
    user_id: "U-SUGIURA",
    text: "b棟にしよぉ〜",
  },
  {
    user_id: "U-KIZUKI",
    text: "ディスカッションをまとめると、学生側は、A棟1階を朝食会場として今後も使いたいという意向。一方で、本来使える場所が使いづらい、という話も出ている。",
  },
  {
    user_id: "U-YAMAJI",
    text: "学生の負担と居住スタッフの利便性を比較するため、1日だけBASEで朝食を食べる実験はどうでしょう。もしBASEで食べてみてくれた人がいたら感想聞いてみたいです",
  },
  {
    user_id: "U-MATSUI",
    text: "今日午前休みであんまり食べてる人いなかったです。あしたも1限ないからあんまりいないかも。水曜日も休みだから木曜日が良いタイミングかもです",
  },
  {
    user_id: "U-MERRITT",
    text: "今日決まったこと。朝食の場所は一旦そのまま。他忘れてることあったらスレッドで教えて！",
  },
];

export const SCENARIO_EBLOCK_MESSAGES: ScenarioMessage[] = [
  {
    user_id: "U-MIYANO",
    text: "Baseのe-block、充電器を置かないと誰も充電できないので文鎮になってます。(充電コードもなく、個人で使うとなると来てから充電する必要があります。) めっちゃもったいない＆いつも困ってるので、HOMEかOFFICEから1つ拝借できませんか？",
  },
  {
    user_id: "U-KANO",
    text: "少なくとも学務の管轄ではないですね。パートナー連携チームでしょうか？",
  },
  {
    user_id: "U-KITAMURA",
    text: "河野さんが設置してくれたこちらですね。今お休み中のため、週明け確認いただけるようメンションしておきます！ @河野愛美",
  },
  {
    user_id: "U-MIYANO",
    text: "ありがとうございます！よろしくお願いします。",
  },
  {
    user_id: "U-KAWANO",
    text: "お待たせしました。INのところにType-Cを挿したら個人でも充電できませんか？",
  },
  {
    user_id: "U-KANO",
    text: "充電ドックがないと、使った後に私物のUSB Type-C充電器を使って充電する人がおらず、充電されていないものばかりになって文鎮化する、ということかと。",
  },
  {
    user_id: "U-KAWANO",
    text: "であれば、e-blockに対して充電ドックはそもそも数が足りず、限られたドックをROOMSに置くのは難しいです。文鎮化してしまうくらいなら、OFFICEから必要なタイミングで持っていって返却する運用にしてはどうでしょうか？誰に相談すればいいのかな？",
  },
  {
    user_id: "U-MIYANO",
    text: "本質的にはまともな給電口が机付近にないので困っています！利便性を担保するために充電ドックがほしいので、OFFICEから都度持っていく運用はあまり意味がないと思います。ドックが難しければ、延長ケーブル等余っているものをBASEに配置していただけたら助かります。",
  },
  {
    user_id: "U-KAWANO",
    text: "パナソニックさんからの無償貸与でe-blockの管理を担当していますが、パートナー予算で延長コードまで手配するのは少し違う気がしています。コードやケーブルは寮チームや施設管理として手配いただくかご検討いただけますか？ @田中義崇",
  },
  {
    user_id: "U-TANAKA",
    text: "ちょっと良く分からないのですが、ROOMS居室、BASE他共用施設ともコンセントは結構あると思いますが、なぜ学校が買わなければならないんでしたっけ？",
  },
  {
    user_id: "U-KANO",
    text: "横から失礼します通訳です。「本質的にはBASEの机付近に電源がないのでPC利用で困っている」なので、ミニマムな解決策はBASEのコンセントから机付近に届くAC延長タップを用意することです。",
  },
  {
    user_id: "U-KAWANO",
    text: "Baseに置いているe-block充電用には延長コードや充電ケーブルが必要です。ここは個人でやる想定でしたが、今回の宮野くんの提案は学校側でコード類を手配してほしいとのこと。手配はパートナーチーム所管ではないため、寮・学校側で検討してほしいという主旨です。",
  },
];

export const SCENARIO_HYGIENE_MESSAGES: ScenarioMessage[] = [
  {
    user_id: "U-NAKATANI",
    text: "【ふきんの除菌方法について】今の運用ではふきんは掃除の時に洗われていますが、数日放置されたり普通の洗剤で洗われたりして衛生面が気になります。夏で暑くなるこの時期に、漂白剤か熱湯消毒でバケツつけ置きにする運用を作りませんか？",
  },
  {
    user_id: "U-KIAH",
    text: "漂白剤あるよ！どこに置くか決めて運用しよう。",
  },
  {
    user_id: "U-NAKATANI",
    text: "B棟にはないっぽい。布巾用って書いてる洗剤は漂白剤じゃなかったので、共有の置き場や買い足しが必要かも。",
  },
  {
    user_id: "U-TOYAMA",
    text: "今朝キッチンにあったふきんを一心が漂白剤につけて洗ってくれたのですが、それでも結構水が濁ってました。ちゃんと『ふきん当番』を作った方がいいと思います。朝ごはんのパン当番や点呼の人員を調整して、ふきん・掃除に回せませんか？",
  },
  {
    user_id: "U-TAKEDA",
    text: "漂白前後のビフォーアフター写真です。やっぱり定期的に漂白しないと不衛生ですね。",
  },
  {
    user_id: "U-KIAH",
    text: "毎週金曜日に朝食受け取りのついでに洗濯しようって話をしてました。朝食受け取りがある月水金にふきん洗濯と漂白をする運用はどうだろう？一旦これで試してみない？",
  },
  {
    user_id: "U-TOYAMA",
    text: "担当の人が良ければ頻度的にも月水金で良さそう！早めに寮の当番として正式化したいけど、新しい当番の追加って次回の寮ミーティングまで待つ必要がありますか？",
  },
  {
    user_id: "U-NAKATANI",
    text: "長くつけ置きできるオキシクリーンに変えたんだっけ？洗剤の管理場所と、当番が誰になるかを決めておきたいです。",
  },
];

export const SCENARIOS: Record<string, Scenario> = {
  breakfast: {
    id: "breakfast",
    title: "朝食会場を決めよう",
    description: "A棟1階キッチン vs A棟2階/B棟。生活環境と利用権限をめぐる議論",
    channel_name: "03_rooms_discussion",
    stakeholders: SEED_STAKEHOLDERS,
    messages: SCENARIO_BREAKFAST_MESSAGES,
  },
  eblock: {
    id: "eblock",
    title: "BASEのe-block充電運用",
    description: "BASEの充電環境とe-block文鎮化。充電ドックかAC延長コードか、管理所管・予算の議論",
    channel_name: "03_rooms_discussion",
    stakeholders: EBLOCK_STAKEHOLDERS,
    messages: SCENARIO_EBLOCK_MESSAGES,
  },
  hygiene: {
    id: "hygiene",
    title: "キッチンのふきん除菌・洗濯運用",
    description: "放置されがちなキッチンのふきん除菌・衛生運用と当番制の合意形成",
    channel_name: "03_rooms_discussion",
    stakeholders: HYGIENE_STAKEHOLDERS,
    messages: SCENARIO_HYGIENE_MESSAGES,
  },
};

// 後方互換用
export const SCENARIO_MESSAGES = SCENARIO_BREAKFAST_MESSAGES;

export function getScenario(scenarioId?: string | null): Scenario {
  const sid = scenarioId || "breakfast";
  return SCENARIOS[sid] || SCENARIOS["breakfast"];
}
