# Roomi 30秒プロダクトローンチ動画

`apps/web` のロゴ、フォント、デザイントークン、既存UIスクリーンショットを利用したRemotionプロジェクト。

## 仕様

- 1920 × 1080
- 60fps
- 30秒（1,800フレーム）
- H.264 / yuv420p
- spring主体の控えめなモーション

## 構成

- 0–3秒: ロゴ + 「必要な瞬間に、不足を埋めるAI。」
- 3–10秒: 意見・質問・議論停滞という課題
- 10–14秒: 必要な瞬間だけSlackへ介入
- 14–18秒: 関係と詰まりをグラフで可視化
- 18–22秒: 議論の流れをタイムラインで追跡
- 22–27秒: Control Center全体の高速モンタージュ
- 27–30秒: ロゴ + CTA

## コマンド

```bash
npm install
npm run typecheck
npm run studio
npm run render
```

出力先: `out/roomi-launch.mp4`
