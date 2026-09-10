# roomi-worker (Hono + D1)

Python Dashboard (`apps/bot/src/dash_server.py`) の Cloudflare 版。
Next.js (`apps/web`) は `WORKER_URL` があればこっちを叩く。

## API

- `GET /health`
- `GET /api/demo` / `POST /api/demo/messages|stakeholders|intervene|scenario|play/start|play/tick|play/stop|reset`
- `DELETE /api/demo/stakeholders/:userId`
- `GET /api/threads/:id/timeline|graph`, `GET /api/audit`
- `POST /api/slack/events` (Slack Events API用。Socket Modeの代わり)

## LLM

`LLM_PROVIDER=dummy` (既定) ならルールベースで動く。
`xai` / `openai` / `openai-compatible` なら対応APIをfetchする。
失敗時は dummy にフォールバックする。キーは `wrangler secret` で登録。

## デプロイ

```bash
cd apps/worker
npm install
npx wrangler d1 create roomi
# 出た database_id を wrangler.jsonc に記入
npx wrangler d1 migrations apply roomi --remote
npx wrangler deploy --dry-run
npx wrangler deploy
npx wrangler secret put XAI_API_KEY        # 使うときだけ
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SLACK_BOT_TOKEN
```

Web側は `WORKER_URL=https://roomi-worker.<account>.workers.dev` を設定。
未設定なら従来どおり `DASHBOARD_URL` (Python) に落ちる。

## Slack側の設定

Socket Modeをやめ、Slack Appの Event Subscriptions を
`https://<worker>/api/slack/events` に向ける。
`app_mention` と `message.channels` を購読する。
