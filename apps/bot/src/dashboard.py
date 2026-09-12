"""Dashboard API: Graph / Timeline / Audit を返す薄い層。"""
from __future__ import annotations

import sqlite3
from typing import Any

from mentions import ROOMI_NAME, ROOMI_USER_ID, mentioned_user_ids


def timeline(conn: sqlite3.Connection, thread_id: str) -> list[dict]:
    cur = conn.execute(
        "SELECT ts, user_id, text FROM messages WHERE thread_id = ? ORDER BY ts",
        (thread_id,),
    )
    return [dict(r) for r in cur.fetchall()]


def stakeholder_graph(conn: sqlite3.Connection, thread_id: str) -> dict:
    cur = conn.execute(
        "SELECT user_id, COUNT(*) AS n FROM messages WHERE thread_id = ? GROUP BY user_id",
        (thread_id,),
    )
    counts = {r["user_id"]: r["n"] for r in cur.fetchall()}
    stakeholder_rows = conn.execute(
        "SELECT user_id, user_name, role, interests, avatar FROM stakeholders "
        "WHERE thread_id = ?",
        (thread_id,),
    )
    stakeholders = {r["user_id"]: dict(r) for r in stakeholder_rows.fetchall()}
    user_rows = conn.execute(
        "SELECT id, name, role FROM users WHERE id IN "
        "(SELECT user_id FROM messages WHERE thread_id = ?)",
        (thread_id,),
    )
    users = {r["id"]: dict(r) for r in user_rows.fetchall()}

    participant_map = {}
    try:
        agreements = thread_agreements(conn, thread_id)
        for dec in agreements.get("decisions", []):
            for part in dec.get("participants", []):
                uid = part.get("userId")
                if uid and uid not in participant_map:
                    participant_map[uid] = part
    except Exception:
        pass

    nodes = []
    for user_id, message_count in counts.items():
        holder = stakeholders.get(user_id, {})
        user = users.get(user_id, {})
        is_agent = user_id == ROOMI_USER_ID
        part_info = participant_map.get(user_id, {})
        nodes.append({
            "id": user_id,
            "name": (
                ROOMI_NAME if is_agent
                else holder.get("user_name") or user.get("name") or user_id
            ),
            "role": "AI" if is_agent else holder.get("role") or user.get("role") or "",
            "interests": (
                "議論に入って、止まっている一点を問う"
                if is_agent else holder.get("interests") or ""
            ),
            "avatar": (
                "/roomi-logo.svg" if is_agent
                else holder.get("avatar") or ""
            ),
            "messages": message_count,
            "kind": "agent" if is_agent else "person",
            "required": bool(part_info.get("required", False)) if not is_agent else False,
            "stance": part_info.get("stance") if not is_agent and part_info.get("stance") else None,
        })

    # 明示的な関係に加えて、連続する発言者を会話リンクとして集計する。
    # backfill直後でrelationsが空でもforce-linkを成立させられる。
    edges: dict[tuple[str, str], dict] = {}
    rel = conn.execute(
        "SELECT from_user, to_user, label FROM relations WHERE thread_id = ?",
        (thread_id,),
    )
    node_ids = set(counts)
    for row in rel.fetchall():
        source, target = row["from_user"], row["to_user"]
        if source not in node_ids or target not in node_ids or source == target:
            continue
        key = tuple(sorted((source, target)))
        edges[key] = {
            "source": source,
            "target": target,
            "from_user": source,
            "to_user": target,
            "label": row["label"],
            "weight": 1,
            "directed": True,
        }

    message_rows = conn.execute(
        "SELECT user_id, text FROM messages WHERE thread_id = ? "
        "ORDER BY CAST(ts AS REAL), ts",
        (thread_id,),
    ).fetchall()
    for previous, current in zip(message_rows, message_rows[1:]):
        source, target = previous["user_id"], current["user_id"]
        if source == target:
            continue
        key = tuple(sorted((source, target)))
        if key in edges:
            edges[key]["weight"] += 1
            continue
        edges[key] = {
            "source": key[0],
            "target": key[1],
            "from_user": key[0],
            "to_user": key[1],
            "label": "会話",
            "weight": 1,
            "directed": False,
        }

    people = [{"user_id": node["id"], "name": node["name"]} for node in nodes]
    for row in message_rows:
        if row["user_id"] != ROOMI_USER_ID:
            continue
        for uid in mentioned_user_ids(row["text"] or "", people):
            if uid not in node_ids or uid == ROOMI_USER_ID:
                continue
            key = tuple(sorted((ROOMI_USER_ID, uid)))
            previous_edge = edges.get(key)
            edges[key] = {
                "source": ROOMI_USER_ID,
                "target": uid,
                "from_user": ROOMI_USER_ID,
                "to_user": uid,
                "label": "呼びかけ",
                "weight": (previous_edge["weight"] + 1) if previous_edge else 1,
                "directed": True,
                "status": "intervention",
            }

    return {"nodes": nodes, "edges": list(edges.values())}


MOCK_THREAD_AGREEMENTS = {
    "trash": {
        "decisions": [
            {
                "id": "dec-trash-1",
                "threadId": "trash",
                "question": "ゴミ出し当番のローテーション順序と休日の運用ルール",
                "proposal": "週次ローテでA棟→B棟。休みの朝は翌日回しで合意した。",
                "version": 1,
                "decisionMethod": "unanimous",
                "ownerUserId": "U-SAKUMA",
                "deadline": None,
                "status": "decided",
                "confidence": 0.95,
                "participants": [
                    {
                        "userId": "U-SAKUMA",
                        "userName": "中村蓮",
                        "role": "学生",
                        "required": True,
                        "stance": "agreed",
                        "condition": None,
                        "conditionResolution": None,
                        "confidence": 1.0,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                    {
                        "userId": "U-SUGIURA",
                        "userName": "山本蒼",
                        "role": "学生",
                        "required": True,
                        "stance": "agreed",
                        "condition": None,
                        "conditionResolution": None,
                        "confidence": 1.0,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                    {
                        "userId": "U-MATSUI",
                        "userName": "小林陽菜",
                        "role": "学生",
                        "required": True,
                        "stance": "agreed",
                        "condition": None,
                        "conditionResolution": None,
                        "confidence": 1.0,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                    {
                        "userId": "U-OZAKI",
                        "userName": "林みお",
                        "role": "学生",
                        "required": True,
                        "stance": "agreed",
                        "condition": None,
                        "conditionResolution": None,
                        "confidence": 1.0,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                ],
                "gaps": [],
                "actions": [],
            }
        ]
    },
    "kitchen-booking": {
        "decisions": [
            {
                "id": "dec-kitchen-1",
                "threadId": "kitchen-booking",
                "question": "週末の共用キッチン予約ルール",
                "proposal": "土曜午前は各棟に優先枠を設け、水曜以降に空き枠を開放する",
                "version": 1,
                "decisionMethod": "required_approvals",
                "ownerUserId": "U-SUGIURA",
                "deadline": None,
                "status": "gathering",
                "confidence": 0.78,
                "participants": [
                    {
                        "userId": "U-SUGIURA",
                        "userName": "山本蒼",
                        "role": "学生",
                        "required": True,
                        "stance": "agreed",
                        "condition": None,
                        "conditionResolution": None,
                        "confidence": 1.0,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                    {
                        "userId": "U-MATSUI",
                        "userName": "小林陽菜",
                        "role": "学生",
                        "required": True,
                        "stance": "conditional",
                        "condition": "B棟の枠も最低2枠は確保してほしい",
                        "conditionResolution": "空き枠開放前にB棟用固定枠を設ける案を提示中",
                        "confidence": 0.85,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                    {
                        "userId": "U-OZAKI",
                        "userName": "林みお",
                        "role": "学生",
                        "required": True,
                        "stance": "unconfirmed",
                        "condition": None,
                        "conditionResolution": None,
                        "confidence": 0.5,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                ],
                "gaps": [
                    {
                        "type": "unconfirmed",
                        "userId": "U-OZAKI",
                        "question": "林みおさんのスタンスが未確認",
                        "priority": "high",
                        "blocking": True,
                        "confidence": 0.8,
                    }
                ],
                "actions": [
                    {
                        "id": "act-kb-1",
                        "route": "thread",
                        "targetUserId": "U-OZAKI",
                        "question": "優先枠の案で問題ないか確認する",
                        "reason": "必須関係者の承認が必要",
                        "status": "pending",
                        "requiresApproval": False,
                        "confidence": 0.9,
                    }
                ],
            }
        ]
    },
    "noise": {
        "decisions": [
            {
                "id": "dec-noise-1",
                "threadId": "noise",
                "question": "22時以降の共用部利用ルールと見回り・注意の運用主体",
                "proposal": "22時以降は会話と洗い物を控えめにする。1週間試行運用する",
                "version": 1,
                "decisionMethod": "owner_decides",
                "ownerUserId": None,
                "deadline": None,
                "status": "blocked",
                "confidence": 0.65,
                "participants": [
                    {
                        "userId": "U-SASAKI",
                        "userName": "高橋さくら",
                        "role": "寮スタッフ",
                        "required": True,
                        "stance": "agreed",
                        "condition": None,
                        "conditionResolution": None,
                        "confidence": 0.9,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                    {
                        "userId": "U-KIZUKI",
                        "userName": "藤井湊",
                        "role": "学生",
                        "required": True,
                        "stance": "conditional",
                        "condition": "注意する運用主体が決まらないとルールが形骸化する",
                        "conditionResolution": None,
                        "confidence": 0.8,
                        "evidenceMessageIds": [],
                        "contactedAt": None,
                    },
                ],
                "gaps": [
                    {
                        "type": "missing_owner",
                        "userId": None,
                        "question": "見回りと注意の運用主体（責任者）が未決定",
                        "priority": "high",
                        "blocking": True,
                        "confidence": 0.9,
                    }
                ],
                "actions": [
                    {
                        "id": "act-noise-1",
                        "route": "thread",
                        "targetUserId": "U-SASAKI",
                        "question": "見回りの担当または管理責任者を誰にするか確認する",
                        "reason": "責任者が決まらないと運用開始できない",
                        "status": "pending",
                        "requiresApproval": True,
                        "confidence": 0.85,
                    }
                ],
            }
        ]
    },
}


def thread_agreements(conn: sqlite3.Connection, thread_id: str) -> dict:
    if thread_id in MOCK_THREAD_AGREEMENTS:
        return MOCK_THREAD_AGREEMENTS[thread_id]

    from demo_room import DEMO_THREAD_ID, get_scenario, list_audit, list_stakeholders
    if thread_id in (DEMO_THREAD_ID, "demo", "demo-live", "breakfast"):
        scenario = get_scenario()
        people = list_stakeholders(conn)
        audit = list_audit(conn, limit=1)
        has_intervention = len(audit) > 0
        latest_audit = audit[0] if has_intervention else {}

        status = "gathering" if has_intervention else "discovering"
        gaps = []
        actions = []
        if has_intervention:
            gaps.append({
                "type": "divergent_policy",
                "userId": None,
                "question": latest_audit.get("reason", "方針の食い違い"),
                "priority": "high",
                "blocking": True,
                "confidence": float(latest_audit.get("confidence", 0.9)),
            })
            actions.append({
                "id": "act-demo-1",
                "route": "thread",
                "targetUserId": None,
                "question": "朝食場所と家電の継続利用を最終決定する権限者の確認",
                "reason": latest_audit.get("reason", ""),
                "status": "sent",
                "requiresApproval": False,
                "confidence": float(latest_audit.get("confidence", 0.9)),
            })

        participants = []
        for p in people[:6]:
            role = p.get("role", "")
            stance = "conditional" if "学生" in role else ("opposed" if "スタッフ" in role else "unconfirmed")
            participants.append({
                "userId": p["user_id"],
                "userName": p["user_name"],
                "role": role,
                "required": "スタッフ" in role or "学生" in role,
                "stance": stance,
                "condition": "清掃と生ゴミ対策を徹底する" if "学生" in role else None,
                "conditionResolution": None,
                "confidence": 0.8,
                "evidenceMessageIds": [],
                "contactedAt": None,
            })

        return {
            "decisions": [
                {
                    "id": f"dec-{thread_id}-1",
                    "threadId": thread_id,
                    "question": scenario.get("title", "朝食会場を決めよう"),
                    "proposal": scenario.get("description", "A棟1階キッチン vs A棟2階/B棟"),
                    "version": 1,
                    "decisionMethod": "owner_decides",
                    "ownerUserId": "U-SASAKI",
                    "deadline": None,
                    "status": status,
                    "confidence": 0.85,
                    "participants": participants,
                    "gaps": gaps,
                    "actions": actions,
                }
            ]
        }

    return {"decisions": []}


def audit_log(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    cur = conn.execute(
        "SELECT thread_id, reason, confidence, impact, action, created_at "
        "FROM interventions ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [dict(r) for r in cur.fetchall()]


def build_fastapi_app(
    db_path: str = ":memory:", llm=None, llm_name: str | None = None
):
    """FastAPIがあればWeb用APIサーバを組み立てる。なければNone。"""
    try:
        from fastapi import FastAPI, HTTPException
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError:
        return None

    from contextlib import contextmanager

    from ai_core import get_llm, resolve_llm_name
    from demo_room import (
        SCENARIOS,
        add_stakeholder,
        force_intervene,
        get_current_scenario_id,
        load_scenario,
        play_tick,
        post_user_message,
        remove_stakeholder,
        reset_room,
        room_state,
        start_playback,
        stop_playback,
        switch_scenario,
    )
    from store import connect

    llm_name = llm_name or resolve_llm_name()
    llm = llm or get_llm(llm_name)
    app = FastAPI(title="Roomi Dashboard API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @contextmanager
    def db():
        conn = connect(db_path)
        try:
            yield conn
        finally:
            conn.close()

    @app.get("/health")
    def health():
        return {"ok": True, "llm": llm_name}

    @app.get("/api/threads/{thread_id}/timeline")
    def get_timeline(thread_id: str):
        with db() as conn:
            return timeline(conn, thread_id)

    @app.get("/api/threads/{thread_id}/graph")
    def get_graph(thread_id: str):
        with db() as conn:
            return stakeholder_graph(conn, thread_id)

    @app.get("/api/threads/{thread_id}/agreements")
    def get_agreements(thread_id: str):
        with db() as conn:
            return thread_agreements(conn, thread_id)

    @app.get("/api/audit")
    def get_audit():
        with db() as conn:
            return audit_log(conn)

    @app.get("/api/demo")
    def get_demo():
        with db() as conn:
            return room_state(conn, llm_name)

    @app.get("/api/demo/scenarios")
    def get_scenarios():
        return {
            "current": get_current_scenario_id(),
            "scenarios": [
                {"id": s["id"], "title": s["title"], "description": s["description"]}
                for s in SCENARIOS.values()
            ],
        }

    @app.post("/api/demo/messages")
    def post_demo_message(payload: dict[str, Any]):
        try:
            with db() as conn:
                return post_user_message(
                    conn, llm, str(payload.get("user_id", "")), str(payload.get("text", ""))
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/demo/stakeholders")
    def post_demo_stakeholder(payload: dict[str, Any]):
        try:
            with db() as conn:
                return add_stakeholder(
                    conn,
                    str(payload.get("name", "")),
                    str(payload.get("role", "")),
                    str(payload.get("interests", "")),
                    str(payload.get("avatar", "")),
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.delete("/api/demo/stakeholders/{user_id}")
    def delete_demo_stakeholder(user_id: str):
        with db() as conn:
            ok = remove_stakeholder(conn, user_id)
        if not ok:
            raise HTTPException(status_code=404, detail="関係者が見つからない")
        return {"ok": True, "user_id": user_id}

    @app.post("/api/demo/intervene")
    def post_demo_intervene():
        with db() as conn:
            return force_intervene(conn, llm)

    @app.post("/api/demo/scenario")
    def post_demo_scenario(payload: dict[str, Any] | None = None):
        scenario_id = (payload or {}).get("scenario_id")
        try:
            with db() as conn:
                if scenario_id:
                    return switch_scenario(conn, str(scenario_id), llm_name)
                return load_scenario(conn)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/demo/play/start")
    def post_demo_play_start(payload: dict[str, Any] | None = None):
        scenario_id = (payload or {}).get("scenario_id")
        with db() as conn:
            return start_playback(conn, llm, str(scenario_id) if scenario_id else None)

    @app.post("/api/demo/play/tick")
    def post_demo_play_tick():
        try:
            with db() as conn:
                return play_tick(conn, llm)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/demo/play/stop")
    def post_demo_play_stop():
        with db() as conn:
            return stop_playback(conn, llm_name)

    @app.post("/api/demo/reset")
    def post_demo_reset(payload: dict[str, Any] | None = None):
        keep = True if not payload else bool(payload.get("keep_stakeholders", True))
        with db() as conn:
            reset_room(conn, keep_stakeholders=keep)
            return room_state(conn, llm_name)

    return app
