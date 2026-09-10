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
