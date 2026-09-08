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
task web      # Web起動 (初回は task web-install)
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
LLM_PROVIDER=dummy  # dummy | openai-compatible
DRY_RUN=true
```
