from __future__ import annotations

import secrets
import time
from datetime import datetime, timezone
from typing import Any

from .db import get_db, now_iso


MEMO_STATUSES = {"open", "done"}
MAX_MEMO_TEXT_LENGTH = 2000
MAX_MEMO_NODE_TEXT_LENGTH = 2000


def base36(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    result = ""
    while value:
        value, remainder = divmod(value, 36)
        result = alphabet[remainder] + result
    return result


def list_private_memo_items(status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    safe_limit = max(1, min(500, int(limit or 200)))
    status_filter = str(status or "").strip()
    where = ""
    params: list[Any] = []
    if status_filter and status_filter != "all":
        if status_filter not in MEMO_STATUSES:
            raise ValueError("Invalid private memo status")
        where = "WHERE status = ?"
        params.append(status_filter)

    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT *
            FROM private_memo_items
            {where}
            ORDER BY
              CASE status WHEN 'open' THEN 0 ELSE 1 END,
              pinned DESC,
              COALESCE(reminder_at, '9999-12-31T23:59:59Z') ASC,
              updated_at DESC
            LIMIT ?
            """,
            (*params, safe_limit),
        ).fetchall()
    return [_memo_row(row) for row in rows]


def create_private_memo_item(input_data: dict[str, Any]) -> dict[str, Any]:
    text = _normalize_text(input_data.get("text"))
    if not text:
        raise ValueError("Private memo text is required")
    now = now_iso()
    memo_id = f"memo_{base36(int(time.time() * 1000))}_{secrets.token_hex(4)}"
    reminder_at = _normalize_reminder_at(input_data.get("reminderAt"))
    started_at = _normalize_reminder_at(input_data.get("startedAt"))
    ended_at = _normalize_reminder_at(input_data.get("endedAt"))
    pinned = 1 if bool(input_data.get("pinned")) else 0
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO private_memo_items (id, text, status, reminder_at, started_at, ended_at, pinned, created_at, updated_at)
            VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?)
            """,
            (memo_id, text, reminder_at, started_at, ended_at, pinned, now, now),
        )
        conn.execute(
            """
            INSERT INTO private_memo_nodes (id, memo_id, text, status, created_at)
            VALUES (?, ?, ?, 'open', ?)
            """,
            (_make_node_id(), memo_id, text, now),
        )
        row = conn.execute("SELECT * FROM private_memo_items WHERE id = ?", (memo_id,)).fetchone()
        nodes = _memo_nodes(conn, memo_id)
    return _memo_row(row, nodes)


def update_private_memo_item(memo_id: str, input_data: dict[str, Any]) -> dict[str, Any] | None:
    existing = _get_memo_row(memo_id)
    if not existing:
        return None

    next_text = _normalize_text(input_data.get("text")) if "text" in input_data else existing["text"]
    if not next_text:
        raise ValueError("Private memo text is required")
    next_status = str(input_data.get("status") if "status" in input_data else existing["status"]).strip()
    if next_status == "archived":
        next_status = "done"
    if next_status not in MEMO_STATUSES:
        raise ValueError("Invalid private memo status")
    next_reminder_at = _normalize_reminder_at(input_data.get("reminderAt")) if "reminderAt" in input_data else existing["reminder_at"]
    next_started_at = _normalize_reminder_at(input_data.get("startedAt")) if "startedAt" in input_data else existing["started_at"]
    next_ended_at = _normalize_reminder_at(input_data.get("endedAt")) if "endedAt" in input_data else existing["ended_at"]
    next_pinned = 1 if bool(input_data.get("pinned")) else 0 if "pinned" in input_data else int(existing["pinned"])
    now = now_iso()
    completed_at = existing["completed_at"]
    if next_status == "done" and existing["status"] != "done":
        completed_at = now
    elif next_status != "done":
        completed_at = None
    node_text = _normalize_node_text(input_data.get("nodeText"))
    should_add_node = bool(node_text) or next_status != existing["status"]

    with get_db() as conn:
        conn.execute(
            """
            UPDATE private_memo_items
            SET text = ?, status = ?, reminder_at = ?, started_at = ?, ended_at = ?, pinned = ?, updated_at = ?, completed_at = ?
            WHERE id = ?
            """,
            (next_text, next_status, next_reminder_at, next_started_at, next_ended_at, next_pinned, now, completed_at, memo_id),
        )
        if should_add_node:
            conn.execute(
                """
                INSERT INTO private_memo_nodes (id, memo_id, text, status, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (_make_node_id(), memo_id, node_text or _status_node_text(next_status), next_status, now),
            )
        row = conn.execute("SELECT * FROM private_memo_items WHERE id = ?", (memo_id,)).fetchone()
        nodes = _memo_nodes(conn, memo_id)
    return _memo_row(row, nodes)


def delete_private_memo_item(memo_id: str) -> bool:
    with get_db() as conn:
        result = conn.execute("DELETE FROM private_memo_items WHERE id = ?", (memo_id,))
    return result.rowcount > 0


def _get_memo_row(memo_id: str) -> Any | None:
    with get_db() as conn:
        return conn.execute("SELECT * FROM private_memo_items WHERE id = ?", (memo_id,)).fetchone()


def _normalize_text(value: Any) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:MAX_MEMO_TEXT_LENGTH]


def _normalize_node_text(value: Any) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:MAX_MEMO_NODE_TEXT_LENGTH]


def _normalize_reminder_at(value: Any) -> str | None:
    raw_value = str(value or "").strip()
    if not raw_value:
        return None
    normalized = raw_value[:-1] + "+00:00" if raw_value.endswith("Z") else raw_value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        raise ValueError("Invalid reminder time") from None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _make_node_id() -> str:
    return f"memo_node_{base36(int(time.time() * 1000))}_{secrets.token_hex(4)}"


def _status_node_text(status: str) -> str:
    return "已完成" if status == "done" else "重新打开"


def _memo_nodes(conn: Any, memo_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT *
        FROM private_memo_nodes
        WHERE memo_id = ?
        ORDER BY created_at ASC
        """,
        (memo_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "memoId": row["memo_id"],
            "text": row["text"],
            "status": row["status"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def _memo_row(row: Any, nodes: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    memo_nodes = nodes
    if memo_nodes is None:
        with get_db() as conn:
            memo_nodes = _memo_nodes(conn, row["id"])
    return {
        "id": row["id"],
        "text": row["text"],
        "status": row["status"],
        "reminderAt": row["reminder_at"],
        "startedAt": row["started_at"],
        "endedAt": row["ended_at"],
        "pinned": bool(row["pinned"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "completedAt": row["completed_at"],
        "archivedAt": row["archived_at"],
        "nodes": memo_nodes,
    }
