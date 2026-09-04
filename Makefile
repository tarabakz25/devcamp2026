VENV := .venv/bin/python
AI_CORE_PATH := apps/ai-core

.PHONY: bot web web-install ai-core demo test

# Slack Bot起動 (Socket Mode。要 .env)
bot:
	$(VENV) apps/bot/src/slack_app.py

# Web Control Center起動 (要 npm install)
web:
	npm --prefix apps/web run dev

web-install:
	npm --prefix apps/web install

# ai-core単体デモ (Slack不要)
ai-core:
	PYTHONPATH=$(AI_CORE_PATH) $(VENV) -m ai_core

# BotのE2Eデモ (dry-run)
demo:
	$(VENV) apps/bot/src/main.py --dry-run --demo

# 稼働Workspaceから履歴取得→ステークホルダー抽出 (要 .env)
stakeholders:
ifndef CHANNEL
	$(error CHANNELを指定してね: make stakeholders CHANNEL=C123...)
endif
	$(VENV) apps/bot/src/backfill.py --channel $(CHANNEL) --limit $(or $(LIMIT),100)

# 全テスト
test:
	$(VENV) -m unittest discover -s apps/ai-core/tests
	$(VENV) -m unittest discover -s apps/bot/tests
