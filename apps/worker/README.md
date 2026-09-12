# roomi-worker (Hono + D1)

Python Dashboard (`apps/bot/src/dash_server.py`) の Cloudflare 版。
Next.js (`apps/web`) は `WORKER_URL` があればこっちを叩く。

## API

- `GET /health`
- `GET /api/demo` / `POST /api/demo/messages|stakeholders|intervene|scenario|play/start|play/tick|play/stop|reset`
- `DELETE /api/demo/stakeholders/:userId`
- `GET /api/threads/:id/timeline|graph|agreements`, `GET /api/audit`
- `POST /api/slack/events` (Slack Events API用。Socket Modeの代わり)
- `POST /api/slack/interactivity` / `POST /api/slack/actions` (合意ボタン・送信承認)

`GET /api/threads/:id/timeline|graph|agreements` は `AGREEMENT_API_TOKEN` が設定されている場合、
`Authorization: Bearer <token>` が必要。未設定時はdemo threadだけ取得できる。
全thread横断の`GET /api/audit`は常にtokenが必要。

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
npx wrangler secret put AGREEMENT_API_TOKEN
```

Agreement Loopは会話から決定項目、提案version、決め方、関係者ごとの
`agreed / conditional / objected / unknown / not_applicable` を保存する。
無回答は`unknown`のまま扱い、提案変更時は旧versionのstanceを引き継がない。
`no_objection`は異議受付期限を過ぎるまで成立せず、5分ごとのCronで期限到達を確認する。
決定通知は`announce_decision` actionとしてoutboxへ保存する。通常の確認、承認依頼、決定通知の
一時的なSlack送信失敗は、現在の提案versionに属するactionだけをCronで再試行する。

Slackへの自動送信は初期状態では無効。明示的に有効化する場合だけ、Worker変数へ次を設定する。

```text
AGREEMENT_AUTO_ACTIONS=true
AGREEMENT_AUTO_ACTION_MIN_CONFIDENCE=0.8
AGREEMENT_APPROVER_USER_IDS=U0123ABC,U0456DEF
```

対象者・決め方・質問の確信度が閾値以上で、非センシティブな確認だけを自動送信する。
スレッド参加者にはメンション、不在者にはDMを使う。低確信またはセンシティブな候補は
元スレッドで送信承認を求める。承認できるのは意思決定ownerか、
`AGREEMENT_APPROVER_USER_IDS`で明示した運営メンバーだけ。DMの原文は公開スレッドへ転載しない。

Web側は `WORKER_URL=https://roomi-worker.<account>.workers.dev` を設定。
未設定なら従来どおり `DASHBOARD_URL` (Python) に落ちる。

## Slack側の設定

Socket Modeをやめ、Slack Appの Event Subscriptions を
`https://<worker>/api/slack/events` に向ける。
Interactivityは `https://<worker>/api/slack/interactivity` に向ける。
`app_mention`、`message.channels`、`message.groups`、`message.im`を購読し、
`users:read`、各会話種別のhistory/read、`im:write`、`chat:write`を許可する。

Events/Interactivityはどちらも署名を検証してすぐ応答し、履歴・プロフィール同期、
合意分析、D1保存、Slack送信はバックグラウンドで処理する。Slack API失敗は
actionを`failed`として記録し、イベント受付自体は失敗させない。
