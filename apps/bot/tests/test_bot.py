import sys
import unittest
from pathlib import Path

BOT_SRC = Path(__file__).resolve().parent.parent / "src"
AI_CORE = Path(__file__).resolve().parent.parent.parent / "ai-core"
sys.path.insert(0, str(BOT_SRC))
sys.path.insert(0, str(AI_CORE))

from ai_core import build_context, decide, get_llm, judge_intervention
from gateway import EventQueue, normalize_event
from store import SqliteRules, connect, save_message, thread_messages


class TestGateway(unittest.TestCase):
    def test_normalize_message(self):
        m = normalize_event(
            {"type": "message", "channel": "C1", "user": "U1",
             "text": "hello", "ts": "10"}
        )
        assert m is not None
        self.assertEqual(m.thread_id, "C1-10")
        self.assertFalse(m.is_mention)

    def test_ignore_bot(self):
        self.assertIsNone(
            normalize_event({"type": "message", "subtype": "bot_message"})
        )

    def test_mention(self):
        m = normalize_event(
            {"type": "app_mention", "channel": "C1", "user": "U1",
             "text": "hi", "ts": "11"}
        )
        assert m is not None
        self.assertTrue(m.is_mention)


class TestBotStore(unittest.TestCase):
    def test_save_and_thread_to_decision(self):
        conn = connect()
        rules = SqliteRules(conn)
        llm = get_llm("dummy")
        q = EventQueue()
        for ev in [
            {"type": "message", "channel": "C1", "user": "U1",
             "text": "仕様どうする?", "ts": "1"},
            {"type": "message", "channel": "C1", "user": "U2",
             "text": "なぜ止まってるんだっけ?", "ts": "2", "thread_ts": "1"},
        ]:
            m = normalize_event(ev)
            assert m is not None
            q.put(m)
            save_message(conn, m)
        self.assertEqual(len(q), 2)
        rows = thread_messages(conn, "C1-1")
        self.assertEqual(len(rows), 2)
        ctx = build_context([dict(r) for r in rows], "C1-1", "C1")
        self.assertEqual(ctx.questions_open, 2)
        result = judge_intervention(ctx, llm)
        d = decide(rules, "C1", "C1-1", result, now=1000.0)
        # dummy LLM: q=2なので conf=0.7, impact=0.7 -> しきい値以上で介入
        self.assertTrue(d.should_act)
        self.assertEqual(d.action, "reply")


if __name__ == "__main__":
    unittest.main()
