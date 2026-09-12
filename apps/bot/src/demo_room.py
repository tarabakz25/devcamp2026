"""Slack不要のデモ用チャットルーム。ステークホルダー指定とAI介入を扱う。"""
from __future__ import annotations

import re
import time

from pipeline import ROOMI_NAME, ROOMI_USER_ID, evaluate_thread, process_event
from store import (
    delete_stakeholder,
    load_stakeholder_catalog,
    upsert_stakeholder,
    upsert_stakeholder_profile,
    upsert_user,
)

DEMO_CHANNEL_ID = "demo"
DEMO_THREAD_TS = "live"
DEMO_THREAD_ID = f"{DEMO_CHANNEL_ID}-{DEMO_THREAD_TS}"
DEMO_CHANNEL_NAME = "03_rooms_discussion"
DEMO_TITLE = "朝食会場を決めよう"

PLAY_INTERVAL_SEC = 10
MAX_AI_REPLIES = 8

# デモ画面では架空名だけ出す。real_name は担当一覧用で DB には入れない。
SEED_STAKEHOLDERS = [
    {
        "user_id": "U-SASAKI",
        "user_name": "高橋さくら",
        "real_name": "佐々木美優",
        "role": "寮スタッフ",
        "interests": "学生は住んでいるキッチン（A棟2階やB棟）を使うべき。1階はスタッフの居住エリア",
        "avatar": "",
    },
    {
        "user_id": "U-OGASAHARA",
        "user_name": "伊藤あかり",
        "real_name": "小笠原愛",
        "role": "寮スタッフ",
        "interests": "学生の朝食会場はA棟2階。1階キッチンと家電はスタッフ専用",
        "avatar": "",
    },
    {
        "user_id": "U-SAKUMA",
        "user_name": "中村蓮",
        "real_name": "佐久間康輔",
        "role": "学生",
        "interests": "A棟1階を続けたい。朝の準備と片付けが一番楽",
        "avatar": "",
    },
    {
        "user_id": "U-OZAKI",
        "user_name": "林みお",
        "real_name": "尾崎仁瑚",
        "role": "学生",
        "interests": "両方の論点を整理して会場を決めたい。決めきれていない",
        "avatar": "",
    },
    {
        "user_id": "U-KUWAHARA",
        "user_name": "渡辺結衣",
        "real_name": "桑原菜穂",
        "role": "パートナー連携",
        "interests": "視察と朝の予定が先。議論の主題を取り違えない",
        "avatar": "",
    },
    {
        "user_id": "U-YAMAJI",
        "user_name": "加藤海斗",
        "real_name": "山地駿徹",
        "role": "モノラボ",
        "interests": "いきなり決めず、BASEで1日試して感想を集めたい",
        "avatar": "",
    },
    {
        "user_id": "U-SUGIURA",
        "user_name": "山本蒼",
        "real_name": "杉浦昊翼",
        "role": "学生",
        "interests": "B棟がいい。学生が住んでいる場所でやりたい",
        "avatar": "",
    },
    {
        "user_id": "U-MATSUI",
        "user_name": "小林陽菜",
        "real_name": "松井ひな子",
        "role": "学生",
        "interests": "実際に食べてる人数を見て判断したい。休みの朝は人が少ない",
        "avatar": "",
    },
    {
        "user_id": "U-MERRITT",
        "user_name": "森田カイ",
        "real_name": "メリットキア",
        "role": "学生",
        "interests": "決まりを全体に共有する。決まらなければ一旦現状維持",
        "avatar": "",
    },
    {
        "user_id": "U-KIZUKI",
        "user_name": "藤井湊",
        "real_name": "相木絆煌",
        "role": "学生",
        "interests": "学生は1階継続、スタッフは2階、という食い違いを言語化したい",
        "avatar": "",
    },
]

EBLOCK_STAKEHOLDERS = [
    {
        "user_id": "U-MIYANO",
        "user_name": "宮野しゅうた",
        "real_name": "宮野柊太",
        "role": "学生（BASE利用者）",
        "interests": "BASEの机付近に電源がなく困っている。e-block充電ドックかAC延長コードを常設してほしい",
        "avatar": "",
    },
    {
        "user_id": "U-KANO",
        "user_name": "叶としのぶ",
        "real_name": "叶俊信",
        "role": "学務スタッフ",
        "interests": "学務の所管ではない。論点を整理し、BASEのコンセントから机に届くAC延長コード手配で解決を図りたい",
        "avatar": "",
    },
    {
        "user_id": "U-KITAMURA",
        "user_name": "北村みき",
        "real_name": "北村美樹",
        "role": "寮スタッフ",
        "interests": "e-blockはパートナー連携チームが設置したもの。担当の河野さんに確認を繋ぐ",
        "avatar": "",
    },
    {
        "user_id": "U-KAWANO",
        "user_name": "河野めぐみ",
        "real_name": "河野愛美",
        "role": "パートナー連携（e-block管理者）",
        "interests": "パナソニック無償貸与のe-block本体を管理。充電ドックは余分がなくBASE常設不可。コード類はパートナー予算外なので寮チーム側で検討してほしい",
        "avatar": "",
    },
    {
        "user_id": "U-TANAKA",
        "user_name": "田中よしたか",
        "real_name": "田中義崇",
        "role": "パートナーディレクター",
        "interests": "全体の配置方針と予算承認。なぜ学校側が購入する必要があるのか、居室のコンセント利用状況も含め精査したい",
        "avatar": "",
    },
    {
        "user_id": "U-AIKI",
        "user_name": "藤井湊",
        "real_name": "相木絆煌",
        "role": "学生自治",
        "interests": "学生の作業環境の利便性を確保したい。利用ルールを明確にして解決したい",
        "avatar": "",
    },
]

HYGIENE_STAKEHOLDERS = [
    {
        "user_id": "U-NAKATANI",
        "user_name": "中渓いっしん",
        "real_name": "中渓一心",
        "role": "学生（寮生）",
        "interests": "ふきんの除菌方法。普通の洗剤洗いや放置による異臭・雑菌繁殖を防ぐため、ハイター/オキシクリーンのつけ置きルールを作りたい",
        "avatar": "",
    },
    {
        "user_id": "U-KIAH",
        "user_name": "森田カイ",
        "real_name": "メリットキア",
        "role": "学生（寮長・取りまとめ）",
        "interests": "朝食受け取りの月水金にふきん洗濯・漂白を行う運用を試したい。無理のないルーティン化を目指す",
        "avatar": "",
    },
    {
        "user_id": "U-TOYAMA",
        "user_name": "外山えれな",
        "real_name": "外山英玲那",
        "role": "学生（当番制提案）",
        "interests": "特定の人の負担にならないよう、パン当番や点呼の人員を調整して「ふきん当番」を正式に設置したい",
        "avatar": "",
    },
    {
        "user_id": "U-TAKEDA",
        "user_name": "武田りこ",
        "real_name": "武田璃香",
        "role": "学生（現状共有）",
        "interests": "漂白前後の汚れの落ち具合など現状を共有し、衛生状態の改善を促したい",
        "avatar": "",
    },
    {
        "user_id": "U-SASAKI",
        "user_name": "高橋さくら",
        "real_name": "佐々木美優",
        "role": "寮スタッフ",
        "interests": "キッチンの衛生環境の維持。備品（漂白剤・バケツ等）の手配可否や共用エリアの運用ルールを管理",
        "avatar": "",
    },
    {
        "user_id": "U-OGASAHARA",
        "user_name": "伊藤あかり",
        "real_name": "小笠原愛",
        "role": "寮スタッフ",
        "interests": "キッチン共用部の衛生と生活環境の質を保ちたい。運用責任と管理体制を明確にするべき",
        "avatar": "",
    },
]

LEGACY_SEED_NAMES = {
    "葵",
    "凛",
    "湊",
    "澪",
    "陽",
    "佐々木美優",
    "小笠原愛",
    "佐久間康輔",
    "尾崎仁瑚",
    "桑原菜穂",
    "山地駿徹",
    "杉浦昊翼",
    "松井ひな子",
    "メリットキア",
    "相木絆煌",
}

SCENARIO_BREAKFAST_MESSAGES = [
    (
        "U-SASAKI",
        "朝食会場についてご相談です。朝食の搬入場所がA棟1階キッチンである点については、事前に許可しているため認識しています。一方で、A棟1階キッチンはA棟1階スタッフの使用権限がある場所のため、朝食をとる場所については、A棟2階キッチンでの運用とすることは可能でしょうか？また、炊飯器などの電化製品についても、基本的にA棟1階の居住スタッフに使用権限があるため、炊飯器のうち何台かはスタッフ用として確保したいです。",
    ),
    (
        "U-OGASAHARA",
        "ユニットも居住者の使用エリアで、そこに割り当てられた家電は居住者専用です。なので学生の朝食会場は１階ではなく、２階などを使用してください。",
    ),
    (
        "U-OGASAHARA",
        "こちらお返事遅くなってすみません。朝食の搬入場所がA棟1階キッチンである点については、事前に許可しているため認識しています。一方で、現在、居住しているスタッフより、学生が使用することで、本来使用できるはずのスペースが使えない、家電が使えない場合がある、異臭が発生している、学生とエリアを分けてほしいという報告が上がってきています。A棟1階フロアはスタッフの居住エリアであり、スタッフも大切な仲間なので、生活の質を担保したいです。よって、学生の朝食場所は、A棟2階キッチンにしてください。",
    ),
    (
        "U-SAKUMA",
        "学生の朝の状態を共有させてください。6:30〜米を炊いています。調理器具はスタッフさんが使用できるように必ず1台空けてあります。またシンク、キッチン、布巾の洗濯は学生が行っておりヤマジン2号(ルンバ)が床の清掃を行なってます。私たちとしてはA棟1階の使用をした方が朝食の準備片付けが楽になりできればこれからも続けていきたいと考えています。使用を続けていく場合に私たちが提案できることは、スタッフさんが確実に使えるように炊飯器とIHコンロ、ケトルをこれからも開けておくことと、生ゴミの捨てる頻度を上げることです。",
    ),
    (
        "U-SASAKI",
        "自分達、学生たちが住んでいないユニットに集まって、朝食を食べなければいけない理由ってなんですか？A棟2階とか、B棟1階とか、学生の住んでいるキッチンを使用すればいいだけの話だと思います。それに伴って、朝食を届けてもらう冷蔵庫をB棟1階に移動する？とかそういう新たな意見が出てきて、寮チームとの相談が必要そうだったら、相談してくれたらいいのかなと思います。",
    ),
    (
        "U-OZAKI",
        "【朝食会場について】これまでの議論をこちらに移します。",
    ),
    (
        "U-KUWAHARA",
        "ご提案いただいたところ申し訳ないですが、私は7:00〜mtgがあり、9:30には視察に入るため明日不参加でお願いします",
    ),
    (
        "U-OZAKI",
        "朝食については学生の朝食についてです！！ややこしくてすいません",
    ),
    (
        "U-YAMAJI",
        "すみません！みおが言ってくれてるとおりで、舌足らずでした。7:00〜mtg大変ですね。お疲れ様です",
    ),
    (
        "U-KUWAHARA",
        "読み違えており失礼しました！ありがとうございます。早起きして大人しくmtgします",
    ),
    (
        "U-SUGIURA",
        "b棟にしよぉ〜",
    ),
    (
        "U-KIZUKI",
        "ディスカッションをまとめると、学生側は、A棟1階を朝食会場として今後も使いたいという意向。一方で、本来使える場所が使いづらい、という話も出ている。",
    ),
    (
        "U-YAMAJI",
        "学生の負担と居住スタッフの利便性を比較するため、1日だけBASEで朝食を食べる実験はどうでしょう。もしBASEで食べてみてくれた人がいたら感想聞いてみたいです",
    ),
    (
        "U-MATSUI",
        "今日午前休みであんまり食べてる人いなかったです。あしたも1限ないからあんまりいないかも。水曜日も休みだから木曜日が良いタイミングかもです",
    ),
    (
        "U-MERRITT",
        "今日決まったこと。朝食の場所は一旦そのまま。他忘れてることあったらスレッドで教えて！",
    ),
]

SCENARIO_EBLOCK_MESSAGES = [
    (
        "U-MIYANO",
        "Baseのe-block、充電器を置かないと誰も充電できないので文鎮になってます。(充電コードもなく、個人で使うとなると来てから充電する必要があります。) めっちゃもったいない＆いつも困ってるので、HOMEかOFFICEから1つ拝借できませんか？",
    ),
    (
        "U-KANO",
        "少なくとも学務の管轄ではないですね。パートナー連携チームでしょうか？",
    ),
    (
        "U-KITAMURA",
        "河野さんが設置してくれたこちらですね。今お休み中のため、週明け確認いただけるようメンションしておきます！ @河野愛美",
    ),
    (
        "U-MIYANO",
        "ありがとうございます！よろしくお願いします。",
    ),
    (
        "U-KAWANO",
        "お待たせしました。INのところにType-Cを挿したら個人でも充電できませんか？",
    ),
    (
        "U-KANO",
        "充電ドックがないと、使った後に私物のUSB Type-C充電器を使って充電する人がおらず、充電されていないものばかりになって文鎮化する、ということかと。",
    ),
    (
        "U-KAWANO",
        "であれば、e-blockに対して充電ドックはそもそも数が足りず、限られたドックをROOMSに置くのは難しいです。文鎮化してしまうくらいなら、OFFICEから必要なタイミングで持っていって返却する運用にしてはどうでしょうか？誰に相談すればいいのかな？",
    ),
    (
        "U-MIYANO",
        "本質的にはまともな給電口が机付近にないので困っています！利便性を担保するために充電ドックがほしいので、OFFICEから都度持っていく運用はあまり意味がないと思います。ドックが難しければ、延長ケーブル等余っているものをBASEに配置していただけたら助かります。",
    ),
    (
        "U-KAWANO",
        "パナソニックさんからの無償貸与でe-blockの管理を担当していますが、パートナー予算で延長コードまで手配するのは少し違う気がしています。コードやケーブルは寮チームや施設管理として手配いただくかご検討いただけますか？ @田中義崇",
    ),
    (
        "U-TANAKA",
        "ちょっと良く分からないのですが、ROOMS居室、BASE他共用施設ともコンセントは結構あると思いますが、なぜ学校が買わなければならないんでしたっけ？",
    ),
    (
        "U-KANO",
        "横から失礼します通訳です。「本質的にはBASEの机付近に電源がないのでPC利用で困っている」なので、ミニマムな解決策はBASEのコンセントから机付近に届くAC延長タップを用意することです。",
    ),
    (
        "U-KAWANO",
        "Baseに置いているe-block充電用には延長コードや充電ケーブルが必要です。ここは個人でやる想定でしたが、今回の宮野くんの提案は学校側でコード類を手配してほしいとのこと。手配はパートナーチーム所管ではないため、寮・学校側で検討してほしいという主旨です。",
    ),
]

SCENARIO_HYGIENE_MESSAGES = [
    (
        "U-NAKATANI",
        "【ふきんの除菌方法について】今の運用ではふきんは掃除の時に洗われていますが、数日放置されたり普通の洗剤で洗われたりして衛生面が気になります。夏で暑くなるこの時期に、漂白剤か熱湯消毒でバケツつけ置きにする運用を作りませんか？",
    ),
    (
        "U-KIAH",
        "漂白剤あるよ！どこに置くか決めて運用しよう。",
    ),
    (
        "U-NAKATANI",
        "B棟にはないっぽい。布巾用って書いてる洗剤は漂白剤じゃなかったので、共有の置き場や買い足しが必要かも。",
    ),
    (
        "U-TOYAMA",
        "今朝キッチンにあったふきんを一心が漂白剤につけて洗ってくれたのですが、それでも結構水が濁ってました。ちゃんと『ふきん当番』を作った方がいいと思います。朝ごはんのパン当番や点呼の人員を調整して、ふきん・掃除に回せませんか？",
    ),
    (
        "U-TAKEDA",
        "漂白前後のビフォーアフター写真です。やっぱり定期的に漂白しないと不衛生ですね。",
    ),
    (
        "U-KIAH",
        "毎週金曜日に朝食受け取りのついでに洗濯しようって話をしてました。朝食受け取りがある月水金にふきん洗濯と漂白をする運用はどうだろう？一旦これで試してみない？",
    ),
    (
        "U-TOYAMA",
        "担当の人が良ければ頻度的にも月水金で良さそう！早めに寮の当番として正式化したいけど、新しい当番の追加って次回の寮ミーティングまで待つ必要がありますか？",
    ),
    (
        "U-NAKATANI",
        "長くつけ置きできるオキシクリーンに変えたんだっけ？洗剤の管理場所と、当番が誰になるかを決めておきたいです。",
    ),
]

# 後方互換性用
SCENARIO_MESSAGES = SCENARIO_BREAKFAST_MESSAGES

SCENARIOS: dict[str, dict] = {
    "breakfast": {
        "id": "breakfast",
        "title": "朝食会場を決めよう",
        "description": "A棟1階キッチン vs A棟2階/B棟。生活環境と利用権限をめぐる議論",
        "channel_name": "03_rooms_discussion",
        "stakeholders": SEED_STAKEHOLDERS,
        "messages": SCENARIO_BREAKFAST_MESSAGES,
    },
    "eblock": {
        "id": "eblock",
        "title": "BASEのe-block充電ドック運用",
        "description": "BASEの充電環境とe-block文鎮化。充電ドックかAC延長コードか、管理所管・予算の議論",
        "channel_name": "03_rooms_discussion",
        "stakeholders": EBLOCK_STAKEHOLDERS,
        "messages": SCENARIO_EBLOCK_MESSAGES,
    },
    "hygiene": {
        "id": "hygiene",
        "title": "キッチンのふきん除菌・洗濯運用",
        "description": "放置されがちなキッチンのふきん除菌・衛生運用と当番制の合意形成",
        "channel_name": "03_rooms_discussion",
        "stakeholders": HYGIENE_STAKEHOLDERS,
        "messages": SCENARIO_HYGIENE_MESSAGES,
    },
}

_current_scenario_id = "breakfast"


def get_current_scenario_id() -> str:
    return _current_scenario_id


def get_scenario(scenario_id: str | None = None) -> dict:
    sid = scenario_id or _current_scenario_id
    return SCENARIOS.get(sid, SCENARIOS["breakfast"])


def get_current_messages() -> list[tuple[str, str]]:
    return get_scenario()["messages"]


def get_current_stakeholders() -> list[dict]:
    return get_scenario()["stakeholders"]

_playback: dict[str, object] = {
    "mode": "idle",
    "index": 0,
    "ai_count": 0,
    "last_user_id": "",
    "last_intervene": 0,
    "last_reason": "",
}


def _ensure_demo_rule(conn) -> None:
    row = conn.execute(
        "SELECT id, cooldown_sec FROM intervention_rules WHERE channel_id = ?",
        (DEMO_CHANNEL_ID,),
    ).fetchone()
    if row:
        if row["cooldown_sec"] != 0:
            conn.execute(
                "UPDATE intervention_rules SET cooldown_sec = 0 WHERE channel_id = ?",
                (DEMO_CHANNEL_ID,),
            )
            conn.commit()
        return
    conn.execute(
        "INSERT INTO intervention_rules "
        "(channel_id, min_confidence, min_impact, cooldown_sec, enabled) "
        "VALUES (?, 0.55, 0.5, 0, 1)",
        (DEMO_CHANNEL_ID,),
    )
    conn.commit()


def ensure_demo_room(conn, scenario_id: str | None = None) -> None:
    scenario = get_scenario(scenario_id or _current_scenario_id)
    ch_name = scenario.get("channel_name", DEMO_CHANNEL_NAME)
    conn.execute(
        "INSERT INTO channels (id, name) VALUES (?, ?) "
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name",
        (DEMO_CHANNEL_ID, ch_name),
    )
    conn.execute(
        "INSERT OR IGNORE INTO threads (id, channel_id) VALUES (?, ?)",
        (DEMO_THREAD_ID, DEMO_CHANNEL_ID),
    )
    upsert_user(conn, ROOMI_USER_ID, ROOMI_NAME, "AI")
    _ensure_demo_rule(conn)

    scenario_people = scenario["stakeholders"]

    count = conn.execute(
        "SELECT COUNT(*) AS c FROM stakeholders WHERE thread_id = ?",
        (DEMO_THREAD_ID,),
    ).fetchone()["c"]
    names = {
        r["user_name"]
        for r in conn.execute(
            "SELECT user_name FROM stakeholders WHERE thread_id = ?",
            (DEMO_THREAD_ID,),
        )
    }
    needs_seed = count == 0 or bool(names & LEGACY_SEED_NAMES)
    if needs_seed:
        conn.execute(
            "DELETE FROM stakeholders WHERE thread_id = ?", (DEMO_THREAD_ID,)
        )
        conn.execute(
            "DELETE FROM messages WHERE thread_id = ?", (DEMO_THREAD_ID,)
        )
        conn.execute(
            "DELETE FROM interventions WHERE thread_id = ?", (DEMO_THREAD_ID,)
        )
        for person in scenario_people:
            upsert_stakeholder(
                conn,
                DEMO_THREAD_ID,
                person["user_id"],
                person["user_name"],
                person["role"],
                person["interests"],
                person.get("avatar", ""),
            )

    # 事前構築: 導入時に組織全体のステークホルダーカタログを登録・ベクトル化 (RAG用)
    profile_count = conn.execute(
        "SELECT COUNT(*) AS c FROM stakeholder_profiles "
        "WHERE source = 'demo' AND channel_id = ?",
        (DEMO_CHANNEL_ID,),
    ).fetchone()["c"]
    if profile_count == 0 or needs_seed:
        from ai_core import DummyLLM
        llm = DummyLLM()
        conn.execute(
            "DELETE FROM stakeholder_profiles WHERE source = 'demo' AND channel_id = ?",
            (DEMO_CHANNEL_ID,),
        )
        for person in scenario_people:
            text = f"氏名: {person['user_name']} / 役割: {person['role']} / 担当・関心: {person['interests']}"
            emb = llm.embed(text) if hasattr(llm, "embed") else None
            upsert_stakeholder_profile(
                conn,
                person["user_id"],
                person["user_name"],
                person["role"],
                person["interests"],
                person.get("avatar", ""),
                embedding=emb,
                source="demo",
                channel_id=DEMO_CHANNEL_ID,
            )


def list_stakeholders(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT user_id, user_name, role, interests, avatar, message_count "
        "FROM stakeholders WHERE thread_id = ? ORDER BY id",
        (DEMO_THREAD_ID,),
    ).fetchall()
    counts = {
        r["user_id"]: r["n"]
        for r in conn.execute(
            "SELECT user_id, COUNT(*) AS n FROM messages "
            "WHERE thread_id = ? GROUP BY user_id",
            (DEMO_THREAD_ID,),
        )
    }
    out = []
    for row in rows:
        item = dict(row)
        item["messages"] = counts.get(item["user_id"], 0)
        out.append(item)
    return out


def list_messages(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT m.id, m.user_id, m.text, m.ts, m.is_mention, "
        "COALESCE(s.user_name, u.name, m.user_id) AS user_name, "
        "COALESCE(NULLIF(s.role, ''), u.role, '') AS role, "
        "COALESCE(s.avatar, '') AS avatar "
        "FROM messages m "
        "LEFT JOIN stakeholders s "
        "  ON s.thread_id = m.thread_id AND s.user_id = m.user_id "
        "LEFT JOIN users u ON u.id = m.user_id "
        "WHERE m.thread_id = ? "
        "ORDER BY CAST(m.ts AS REAL), m.ts",
        (DEMO_THREAD_ID,),
    ).fetchall()
    messages = []
    for row in rows:
        item = dict(row)
        item["is_bot"] = item["user_id"] == ROOMI_USER_ID
        if item["is_bot"]:
            item["user_name"] = ROOMI_NAME
            item["role"] = "AI"
        messages.append(item)
    return messages


def list_audit(conn, limit: int = 20) -> list[dict]:
    rows = conn.execute(
        "SELECT thread_id, reason, confidence, impact, action, created_at "
        "FROM interventions WHERE thread_id = ? ORDER BY id DESC LIMIT ?",
        (DEMO_THREAD_ID, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def playback_view(conn) -> dict:
    mode = str(_playback["mode"])
    index = int(_playback["index"])
    msgs = get_current_messages()
    next_speaker = None
    if mode == "script" and index < len(msgs):
        user_id = msgs[index][0]
        person = next((p for p in list_stakeholders(conn) if p["user_id"] == user_id), None)
        next_speaker = person["user_name"] if person else user_id
    elif mode == "ai":
        person = _next_ai_speaker(conn)
        next_speaker = person["user_name"] if person else None
    return {
        "mode": mode,
        "index": index,
        "total": len(msgs),
        "ai_count": int(_playback["ai_count"]),
        "interval_sec": PLAY_INTERVAL_SEC,
        "next_speaker": next_speaker,
        "intervene": int(_playback.get("last_intervene") or 0),
        "reason": str(_playback.get("last_reason") or ""),
    }


def room_state(conn, llm_name: str, scenario_id: str | None = None) -> dict:
    ensure_demo_room(conn, scenario_id)
    scenario = get_scenario(scenario_id)
    return {
        "channel": {"id": DEMO_CHANNEL_ID, "name": scenario.get("channel_name", DEMO_CHANNEL_NAME)},
        "thread_id": DEMO_THREAD_ID,
        "title": scenario.get("title", DEMO_TITLE),
        "description": scenario.get("description", ""),
        "current_scenario": scenario["id"],
        "scenarios": [
            {
                "id": s["id"],
                "title": s["title"],
                "description": s["description"],
            }
            for s in SCENARIOS.values()
        ],
        "llm": llm_name,
        "stakeholders": list_stakeholders(conn),
        "messages": list_messages(conn),
        "audit": list_audit(conn),
        "playback": playback_view(conn),
    }


def switch_scenario(conn, scenario_id: str, llm_name: str = "") -> dict:
    global _current_scenario_id
    if scenario_id not in SCENARIOS:
        raise ValueError(f"未知のシナリオ: {scenario_id}")
    _current_scenario_id = scenario_id
    reset_room(conn, keep_stakeholders=False)
    return room_state(conn, llm_name, scenario_id)


def _decorate_message(conn, message: dict | None) -> dict | None:
    if not message:
        return None
    names = {p["user_id"]: p for p in list_stakeholders(conn)}
    holder = names.get(message["user_id"], {})
    message["user_name"] = (
        ROOMI_NAME if message["user_id"] == ROOMI_USER_ID
        else holder.get("user_name") or message.get("user_name") or message["user_id"]
    )
    message["role"] = (
        "AI" if message["user_id"] == ROOMI_USER_ID
        else holder.get("role") or message.get("role") or ""
    )
    message["avatar"] = holder.get("avatar") or message.get("avatar") or ""
    message["is_bot"] = message["user_id"] == ROOMI_USER_ID
    return message


def _intervention_payload(result) -> dict:
    return {
        "should_act": result.should_act,
        "intervene": 1 if result.should_act else 0,
        "action": result.action,
        "reason": result.reason,
        "confidence": result.confidence,
        "impact": result.impact,
        "summary": result.summary,
        "text": result.bot_text,
    }


def post_user_message(
    conn,
    llm,
    user_id: str,
    text: str,
    *,
    persist_bot: bool = True,
    from_playback: bool = False,
) -> dict:
    ensure_demo_room(conn)
    text = (text or "").strip()
    if not text:
        raise ValueError("メッセージが空")
    if user_id == ROOMI_USER_ID:
        raise ValueError("Roomiとしては発言できない")

    holder = next(
        (p for p in list_stakeholders(conn) if p["user_id"] == user_id),
        None,
    )
    if holder:
        upsert_user(conn, user_id, holder["user_name"], holder["role"])

    payload = {
        "type": "app_mention" if "@roomi" in text.lower() else "message",
        "channel": DEMO_CHANNEL_ID,
        "user": user_id,
        "text": text,
        "ts": str(time.time()),
        "thread_ts": DEMO_THREAD_TS,
    }
    result = process_event(conn, llm, payload, persist_bot=persist_bot)
    _humanize_bot_reply(conn, result)
    _playback["last_user_id"] = user_id
    if not from_playback and str(_playback["mode"]) in {"script", "ai"}:
        _playback["mode"] = "stopped"
    scenario = get_scenario()
    ch_name = scenario.get("channel_name", DEMO_CHANNEL_NAME)
    title = scenario.get("title", DEMO_TITLE)
    return {
        "message": _decorate_message(conn, result.message),
        "bot_message": _decorate_message(conn, result.bot_message),
        "intervention": _intervention_payload(result),
        "channel": {"id": DEMO_CHANNEL_ID, "name": ch_name},
        "title": title,
        "thread_id": DEMO_THREAD_ID,
        "messages": list_messages(conn),
        "audit": list_audit(conn),
        "stakeholders": list_stakeholders(conn),
        "playback": playback_view(conn),
    }


def force_intervene(conn, llm) -> dict:
    ensure_demo_room(conn)
    result = evaluate_thread(
        conn, llm, DEMO_THREAD_ID, DEMO_CHANNEL_ID, force=True
    )
    _humanize_bot_reply(conn, result)
    scenario = get_scenario()
    ch_name = scenario.get("channel_name", DEMO_CHANNEL_NAME)
    title = scenario.get("title", DEMO_TITLE)
    return {
        "message": None,
        "bot_message": _decorate_message(conn, result.bot_message),
        "intervention": _intervention_payload(result),
        "channel": {"id": DEMO_CHANNEL_ID, "name": ch_name},
        "title": title,
        "thread_id": DEMO_THREAD_ID,
        "messages": list_messages(conn),
        "audit": list_audit(conn),
        "stakeholders": list_stakeholders(conn),
        "playback": playback_view(conn),
    }


def add_stakeholder(
    conn,
    name: str,
    role: str = "",
    interests: str = "",
    avatar: str = "",
) -> dict:
    ensure_demo_room(conn)
    name = (name or "").strip()
    if not name:
        raise ValueError("名前が空")
    user_id = _make_user_id(conn, name)
    upsert_stakeholder(
        conn, DEMO_THREAD_ID, user_id, name, role.strip(), interests.strip(), avatar
    )
    holder = next(
        p for p in list_stakeholders(conn) if p["user_id"] == user_id
    )
    return holder


def remove_stakeholder(conn, user_id: str) -> bool:
    ensure_demo_room(conn)
    if user_id == ROOMI_USER_ID:
        return False
    return delete_stakeholder(conn, DEMO_THREAD_ID, user_id)


def reset_room(conn, keep_stakeholders: bool = True) -> None:
    ensure_demo_room(conn)
    conn.execute("DELETE FROM messages WHERE thread_id = ?", (DEMO_THREAD_ID,))
    conn.execute(
        "DELETE FROM interventions WHERE thread_id = ?", (DEMO_THREAD_ID,)
    )
    conn.execute("DELETE FROM relations WHERE thread_id = ?", (DEMO_THREAD_ID,))
    if not keep_stakeholders:
        conn.execute(
            "DELETE FROM stakeholders WHERE thread_id = ?", (DEMO_THREAD_ID,)
        )
    conn.commit()
    _reset_playback()
    if not keep_stakeholders:
        ensure_demo_room(conn)


def load_scenario(conn, scenario_id: str | None = None) -> dict:
    if scenario_id and scenario_id in SCENARIOS:
        switch_scenario(conn, scenario_id)
    else:
        reset_room(conn, keep_stakeholders=True)
        ensure_demo_room(conn)
    msgs = get_current_messages()
    start = time.time() - 60 * len(msgs)
    from gateway import normalize_event
    from store import save_message

    for index, (user_id, text) in enumerate(msgs):
        payload = {
            "type": "message",
            "channel": DEMO_CHANNEL_ID,
            "user": user_id,
            "text": text,
            "ts": f"{start + index * 60:.3f}",
            "thread_ts": DEMO_THREAD_TS,
        }
        msg = normalize_event(payload)
        if msg:
            save_message(conn, msg)
    return {
        "messages": list_messages(conn),
        "stakeholders": list_stakeholders(conn),
        "audit": list_audit(conn),
    }


def _humanize_bot_reply(conn, result) -> None:
    if not result.bot_message or not result.bot_text:
        return
    mapping = {p["user_id"]: p["user_name"] for p in list_stakeholders(conn)}
    mapping[ROOMI_USER_ID] = ROOMI_NAME
    text = result.bot_text
    for user_id, name in mapping.items():
        text = text.replace(user_id, name)
    scenario = get_scenario()
    ch_name = scenario.get("channel_name", DEMO_CHANNEL_NAME)
    text = text.replace(DEMO_THREAD_ID, f"#{ch_name}")
    conn.execute(
        "UPDATE messages SET text = ? WHERE id = ?",
        (text, result.bot_message["id"]),
    )
    conn.commit()
    result.bot_text = text
    result.bot_message["text"] = text


def _reset_playback() -> None:
    _playback["mode"] = "idle"
    _playback["index"] = 0
    _playback["ai_count"] = 0
    _playback["last_user_id"] = ""
    _playback["last_intervene"] = 0
    _playback["last_reason"] = ""


def _history_text(conn) -> str:
    lines = []
    for message in list_messages(conn)[-12:]:
        lines.append(f"{message['user_name']}: {message['text']}")
    return "\n".join(lines)


def _latest_roomi_text(conn) -> str:
    for message in reversed(list_messages(conn)):
        if message["user_id"] == ROOMI_USER_ID:
            return message["text"]
    return ""


def _speaker_camp(person: dict) -> str:
    role = person.get("role") or ""
    if "スタッフ" in role:
        return "staff"
    return "field"


def _next_ai_speaker(conn) -> dict | None:
    people = [p for p in list_stakeholders(conn) if p["user_id"] != ROOMI_USER_ID]
    if not people:
        return None
    last_id = str(_playback.get("last_user_id") or "")
    last = next((p for p in people if p["user_id"] == last_id), None)
    others = [p for p in people if p["user_id"] != last_id]
    if not others:
        return people[0]
    if last:
        opposite = [
            p for p in others if _speaker_camp(p) != _speaker_camp(last)
        ]
        if opposite:
            return opposite[0]
    return others[0]


def start_playback(conn, llm, scenario_id: str | None = None) -> dict:
    if scenario_id and scenario_id in SCENARIOS:
        switch_scenario(conn, scenario_id)
    else:
        reset_room(conn, keep_stakeholders=False)
    _playback["mode"] = "script"
    _playback["index"] = 0
    _playback["ai_count"] = 0
    _playback["last_user_id"] = ""
    return play_tick(conn, llm)


def stop_playback(conn, llm_name: str) -> dict:
    if str(_playback["mode"]) in {"script", "ai"}:
        _playback["mode"] = "stopped"
    return room_state(conn, llm_name)


def play_tick(conn, llm) -> dict:
    ensure_demo_room(conn)
    mode = str(_playback["mode"])
    if mode == "script":
        return _tick_script(conn, llm)
    if mode == "ai":
        return _tick_ai(conn, llm)
    raise ValueError("再生中ではない")


def _tick_script(conn, llm) -> dict:
    index = int(_playback["index"])
    msgs = get_current_messages()
    if index >= len(msgs):
        _playback["mode"] = "done"
        raise ValueError("実例の発言はここまで")
    user_id, text = msgs[index]
    posted = post_user_message(
        conn, llm, user_id, text, persist_bot=True, from_playback=True
    )
    _playback["last_intervene"] = 1 if posted["intervention"]["should_act"] else 0
    _playback["last_reason"] = posted["intervention"]["reason"]
    _playback["index"] = index + 1
    if posted["bot_message"]:
        _playback["mode"] = "ai"
        _playback["ai_count"] = 0
    elif int(_playback["index"]) >= len(msgs):
        forced = force_intervene(conn, llm)
        if forced.get("bot_message"):
            _playback["mode"] = "ai"
            _playback["ai_count"] = 0
            posted["bot_message"] = forced["bot_message"]
            posted["intervention"] = forced["intervention"]
            posted["messages"] = forced["messages"]
            posted["audit"] = forced["audit"]
        else:
            _playback["mode"] = "done"
    posted["playback"] = playback_view(conn)
    return posted


def _tick_ai(conn, llm) -> dict:
    if int(_playback["ai_count"]) >= MAX_AI_REPLIES:
        _playback["mode"] = "done"
        raise ValueError("AIの続きはここまで。この先は手で話してね")
    person = _next_ai_speaker(conn)
    if not person:
        _playback["mode"] = "done"
        raise ValueError("関係者がいない")
    history = _history_text(conn)
    roomi_text = _latest_roomi_text(conn)
    text = llm.reply_as_stakeholder(
        person["user_name"],
        person.get("role") or "",
        person.get("interests") or "",
        history,
        roomi_text,
    )
    posted = post_user_message(
        conn,
        llm,
        person["user_id"],
        text,
        persist_bot=True,
        from_playback=True,
    )
    _playback["last_intervene"] = 1 if posted["intervention"]["should_act"] else 0
    _playback["last_reason"] = posted["intervention"]["reason"]
    _playback["ai_count"] = int(_playback["ai_count"]) + 1
    if int(_playback["ai_count"]) >= MAX_AI_REPLIES:
        _playback["mode"] = "done"
    posted["playback"] = playback_view(conn)
    return posted


def _make_user_id(conn, name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()
    if slug:
        base = f"U-{slug}"
    else:
        base = f"U-{int(time.time() * 1000) % 10_000_000}"
    candidate = base
    n = 2
    while conn.execute(
        "SELECT 1 FROM stakeholders WHERE thread_id = ? AND user_id = ?",
        (DEMO_THREAD_ID, candidate),
    ).fetchone():
        candidate = f"{base}-{n}"
        n += 1
    return candidate
