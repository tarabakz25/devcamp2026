# Roomi

Slackを主戦場、WebをControl Centerにする「意思決定に足りない合意を集めるAI」。

## 構成

- `apps/ai-core/` Python: LLM抽象化・4エージェント・Context Builder・Policy Engine（Slack非依存の中核）
- `apps/bot/` Python: Slack取込・保存・投稿・Dashboard API（ai-coreを利用）
- `apps/web/` Next.js: Stakeholder Map / タイムライン / 介入履歴 / Memory Viewer / ルール設定
- `apps/worker/` TypeScript: Slack Events API・合意分析・D1永続化・自律確認
- `docker-compose.yml`: 本番用 Postgres + pgvector（ローカルMVPはSQLiteで動く）

## ローカル起動（rootから）

実行には[Go Task](https://taskfile.dev/)が必要。

```bash
task test     # 全テスト (ai-core + bot)
task ai-core  # ai-core単体デモ (Slack不要)
task demo     # BotのE2Eデモ (dry-run)
task bot      # Slack Bot起動 (要 .env)
task dash     # デモチャット用 Dashboard API
task web      # Web起動 (初回は task web-install)
task reload   # 起動中のDashboard APIとWebを止め、最新コードでまとめて再起動
```

実Slackを使わずにデモする場合は、`task reload` でDashboard APIとWebをまとめて起動できる。停止は `Ctrl+C`。

```bash
task reload
```

ブラウザで [http://localhost:3000/demo](http://localhost:3000/demo) を開く。関係者を指定して発言すると、同じAIパイプラインが合意不足を分析する。「実例を再生」で朝食会場スレを流し、決めること、必要関係者、各人の立場、Roomiの次の確認を生成する。チャット上の名前は架空名で、担当の対応は [http://localhost:3000/demo/cast](http://localhost:3000/demo/cast) で確認できる。`XAI_API_KEY` があればGrokが分析し、未設定なら決定的なdummy分析で動く。

## 合意形成ループ

Worker版Roomiはスレッドから、決めること、現在案、決め方、責任者、必要関係者、各人の立場と根拠を抽出する。立場は `合意 / 条件付き / 懸念あり / 未確認 / 判断対象外` として提案versionごとに保存し、無回答を合意や反対に変換しない。

不足があると、Roomiは次に確認すべき相手と質問を1件選ぶ。スレッド参加者にはメンション、不在者にはDMを使い、Slackボタンで回答を回収する。低確信またはセンシティブな確認は、人が送信を承認するまで実行しない。

外部Slackへの自動送信は既定で無効。Workerへ `AGREEMENT_AUTO_ACTIONS=true` を設定した場合だけ有効になる。異議なし方式は5分ごとのCronで期限到達を確認し、決定通知は再送可能なoutboxとして保存する。

Control Centerから実スレッドを読む場合は、WorkerとWebへ同じ `AGREEMENT_API_TOKEN` を設定し、Web側の `ROOMI_ALLOWED_USER_EMAILS` と `ROOMI_ALLOWED_THREAD_IDS` に閲覧を許可する対象を明示する。本番でこれらや `BETTER_AUTH_SECRET` が未設定なら、実スレッドのデータは返さない。

## チャット応答の評価ケース

`apps/worker/evals/chat-cases.ts` には、情報共有、意見対立、明示メンション、合意と再開、健全な意思決定、未回答質問、挨拶の誤検知、否定された完了、完了確認質問を検証するケースがある。各発言の直後にRoomiが返すか、返答の長さ・文数・必要語・禁止語、ケース開始からの経過時間、API応答時間を確認する。`waitBeforeSec` がある発言は指定秒数待ってから送るため、クールダウン後の挙動も分けて見られる。

同じ発言列に、従来のWorker判定と `apps/worker/src/communication-score.ts` のトピック別ヒューリスティック判定を並走させる。スコア方式は人間の発言だけを使い、総合健全度、前進度、応答性、明確性、摩擦、参加バランス、判定信頼度を出す。両方式の介入タイミングを同じ基準で比較し、従来方式の返信文品質は別に集計する。既定の終了判定は従来方式で、採用候補としてスコア方式を判定するときは `--primary score` を指定する。

各ケースの `topicKind` は既知のトピック種別を手動指定しており、トピック分類器自体の精度はこの比較に含めない。

通常の `baseline` とは別に、現状点でスコア方式が通過しないことを期待する `known-gap` スイートを置いている。婉曲な対立、引用内メンション、質問と回答の関連性、否定のスコープ、条件付き完了、疑問符のない依頼を扱う。赤いまま既知課題として残し、ルール改善時の回帰テストに使う。

ケースは期待する製品挙動を表す。Python DashboardとWorkerで判定実装に差がある場合も、同じケースを通して差分をFAILとして確認できる。現状のWorkerは明示メンションの優先とクールダウンを介入判定に使っていないため、対応するケースはFAILになって実装差が表れる想定。

既定ではケース一覧を表示するだけで、HTTP送信やデータ変更はしない。
評価器はWorkerと同じTypeScript構成にあり、Node.js 22.18以降で追加パッケージなしに動く。

```bash
task eval-chat
```

WebとDashboard APIを起動した後、実際に評価するときは明示的に `--execute` を付ける。実行時はケースごとにデモスレッドのメッセージと介入履歴をリセットする。

```bash
task eval-chat -- --execute
task eval-chat -- --execute --case direct_roomi_mention
task eval-chat -- --execute --output /tmp/roomi-chat-eval.json
task eval-chat -- --execute --primary score --output /tmp/roomi-chat-score-comparison.json
task eval-chat -- --execute --primary score --suite known-gap --output /tmp/roomi-chat-known-gaps.json
```

Workerへ直接つなぐ場合は `BASE_URL` を指定する。localhost以外では、デモデータのリセットを許可する `--allow-remote` も必要。

```bash
task eval-chat BASE_URL=https://example.workers.dev/api/demo -- --execute --allow-remote
```

Slack履歴からステークホルダーを抽出する場合:

```bash
task stakeholders CHANNEL=C123... LIMIT=100
```

カタログは取得元チャンネル単位で保存・検索する。旧形式で取得元が空のプロフィールは
別チャンネルへ自動流用しないため、利用するチャンネルごとに上のbackfillを再実行する。

## 本番パス（Dockerあり）

```bash
docker compose up -d db
pip install -r apps/bot/requirements.txt
python3 apps/bot/src/main.py
```

## 環境変数

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...  # Socket Mode用
DATABASE_URL=postgresql://ai:ai@localhost:5432/aibot  # 未設定ならSQLite
LLM_PROVIDER=dummy  # dummy | xai | openai | openai-compatible
DRY_RUN=true
```
