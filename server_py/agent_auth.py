"""外部写作工具的独立密钥与调用记录，不授予后台会话权限。"""
from __future__ import annotations

import hashlib
import secrets

from fastapi import HTTPException, Request

from .db import get_db, now_iso


def ensure_agent_schema() -> None:
    # 幂等建表沿用权威 SQLite，不保存可还原的明文密钥。
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS agent_keys (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
            prefix TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT,
            last_used_at TEXT
        );
        CREATE TABLE IF NOT EXISTS agent_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT, key_id TEXT NOT NULL,
            method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_images (
            image_id TEXT PRIMARY KEY, key_id TEXT NOT NULL, created_at TEXT NOT NULL
        );
        """)


def create_key(name: str) -> dict:
    token = "gzy_" + secrets.token_urlsafe(32)
    key_id = secrets.token_hex(16)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO agent_keys (id, name, token_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)",
            (key_id, name, hashlib.sha256(token.encode()).hexdigest(), token[:12], now_iso()),
        )
    return {"id": key_id, "token": token, "name": name}


async def require_agent(request: Request) -> str:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Bearer API key required")
    digest = hashlib.sha256(token.encode()).hexdigest()
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM agent_keys WHERE token_hash = ? AND revoked_at IS NULL", (digest,),
        ).fetchone()
        if not row:
            raise HTTPException(401, "Invalid or revoked API key")
        conn.execute("UPDATE agent_keys SET last_used_at = ? WHERE id = ?", (now_iso(), row["id"]))
    request.state.agent_key_id = row["id"]
    return row["id"]


async def agent_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/agent/"):
        response.headers["cache-control"] = "no-store"
        # 不记录正文、请求头及查询串，避免日志包含密钥和未发布内容。
        key_id = getattr(request.state, "agent_key_id", None)
        if key_id:
            with get_db() as conn:
                conn.execute(
                    "INSERT INTO agent_audit (key_id, method, path, status, created_at) VALUES (?, ?, ?, ?, ?)",
                    (key_id, request.method, request.url.path[:240], response.status_code, now_iso()),
                )
    return response
