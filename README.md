# Roomi

Slackを主戦場、WebをControl Centerにする「必要な瞬間に不足を埋めるAI」。

## 構成

- `apps/ai-core/` Python: LLM抽象化・4エージェント・Context Builder・Policy Engine（Slack非依存の中核）
- `apps/bot/` Python: Slack取込・保存・投稿・Dashboard API（ai-coreを利用）
- `apps/web/` Next.js: Stakeholder Map / タイムライン / 介入履歴 / Memory Viewer / ルール設定
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
```

実Slackを使わずにデモする場合:

```bash
task dash
task web
```

ブラウザで [http://localhost:3000/demo](http://localhost:3000/demo) を開く。関係者を指定して発言すると、同じAIパイプラインが介入する。「実例を再生」で朝食会場スレを流し、毎発言を 0/1 で介入判定する。1 なら Roomi が入り、そのあと関係者AIが返す。チャット上の名前は架空名で、担当の対応は [http://localhost:3000/demo/cast](http://localhost:3000/demo/cast) で確認できる。`XAI_API_KEY` があれば Grok が要約・判定し、未設定なら dummy LLM で動く。

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
