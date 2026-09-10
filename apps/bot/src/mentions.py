"""Roomi返答の @メンション抽出。"""
from __future__ import annotations

ROOMI_USER_ID = "U-ROOMI"
ROOMI_NAME = "Roomi"


def mentioned_user_ids(text: str, people: list[dict]) -> list[str]:
    """本文から @名前 / @user_id / <@id> で呼ばれた人を返す。"""
    if not text or not people:
        return []

    found: list[str] = []
    remaining = text

    for person in people:
        uid = str(person.get("user_id") or "")
        if not uid or uid == ROOMI_USER_ID:
            continue
        token = f"<@{uid}>"
        if token in remaining:
            found.append(uid)
            remaining = remaining.replace(token, " ")

    named = sorted(
        people,
        key=lambda person: len(str(person.get("name") or "")),
        reverse=True,
    )
    for person in named:
        uid = str(person.get("user_id") or "")
        name = str(person.get("name") or "")
        if not uid or uid == ROOMI_USER_ID:
            continue
        for needle in (f"@{name}" if name else "", f"@{uid}"):
            if needle and needle in remaining:
                found.append(uid)
                remaining = remaining.replace(needle, " ")
                break

    return list(dict.fromkeys(found))


def to_slack_text(text: str, people: list[dict]) -> str:
    """表示用の @名前 を Slack の <@id> に置換する。"""
    out = text or ""
    named = sorted(
        people,
        key=lambda person: len(str(person.get("name") or "")),
        reverse=True,
    )
    slots: list[str] = []
    for person in named:
        uid = str(person.get("user_id") or "")
        name = str(person.get("name") or "")
        if not uid or uid == ROOMI_USER_ID:
            continue
        token = f"\x00{len(slots)}\x00"
        if name:
            out = out.replace(f"@{name}", token)
        out = out.replace(f"@{uid}", token)
        slots.append(uid)
    for index, uid in enumerate(slots):
        out = out.replace(f"\x00{index}\x00", f"<@{uid}>")
    return out
