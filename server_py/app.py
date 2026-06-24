from __future__ import annotations

import hashlib
import json
import mimetypes
import secrets
import time
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote
from xml.sax.saxutils import escape

import uvicorn
from fastapi import BackgroundTasks, Body, Cookie, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from . import admin_commands
from .ai_agent import AiAgentError, generate_article_metadata, plan_admin_commands, test_llm_connection
from .almanac import get_today_almanac
from .config import config
from .content import (
    SYSTEM_GALLERY_ALBUM_ID,
    SYSTEM_GALLERY_ALBUM_SLUG,
    create_article,
    create_gallery_album,
    create_gallery_image,
    delete_gallery_album,
    delete_gallery_image,
    get_article_by_slug,
    get_gallery_album,
    get_gallery_image,
    get_homepage,
    get_llm_settings,
    get_llm_token_usage_payload,
    get_llm_token_usage_summary,
    get_site_payload,
    get_site_settings,
    list_articles,
    list_deleted_articles,
    list_featured_series,
    list_gallery_albums,
    list_gallery_images_page,
    list_note_sections,
    list_tags,
    delete_tag,
    merge_tags,
    parse_date_label,
    resolve_article_id,
    resolve_gallery_album_id,
    restore_article,
    save_llm_settings,
    slugify,
    update_article,
    update_gallery_album,
    update_gallery_image,
    update_gallery_image_file,
)
from .db import get_db, now_iso
from .starfield import (
    archive_version,
    create_version as create_starfield_version,
    delete_version as delete_starfield_version,
    enqueue_deep_relationship_generation as enqueue_starfield_deep_relationship_generation,
    generate_relationships as generate_starfield_relationships,
    get_admin_version as get_admin_starfield_version,
    get_public_starfield,
    list_admin_tasks,
    enqueue_passage_generation as enqueue_starfield_passage_generation,
    enqueue_relationship_generation as enqueue_starfield_relationship_generation,
    list_versions as list_starfield_versions,
    publish_version as publish_starfield_version,
    run_deep_relationship_generation_job as run_starfield_deep_relationship_generation_job,
    run_passage_generation_job as run_starfield_passage_generation_job,
    run_relationship_generation_job as run_starfield_relationship_generation_job,
    update_deep_path as update_starfield_deep_path,
    update_deep_paths_bulk as update_starfield_deep_paths_bulk,
    update_passage as update_starfield_passage,
    update_passages_bulk as update_starfield_passages_bulk,
    update_relationship as update_starfield_relationship,
    update_relationships_bulk as update_starfield_relationships_bulk,
)


sessions: dict[str, float] = {}
csrf_tokens: dict[str, str] = {}
rate_limits: dict[str, dict[str, float]] = {}
allowed_gallery_mime_types = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
max_gallery_image_bytes = 8 * 1024 * 1024

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["x-frame-options"] = "DENY"
    response.headers["referrer-policy"] = "strict-origin-when-cross-origin"
    response.headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["cross-origin-opener-policy"] = "same-origin"
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("application/json") and "charset" not in content_type.lower():
        response.headers["content-type"] = "application/json; charset=utf-8"
    return response


@app.middleware("http")
async def admin_audit(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/admin") and request.method != "GET" and response.status_code < 400 and request.url.path != "/api/admin/login":
        try:
            with get_db() as conn:
                conn.execute(
                    """
                    INSERT INTO admin_audit_log (id, action, target, ip_hash, user_agent, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"audit_{base36(int(time.time() * 1000))}_{secrets.token_hex(6)}",
                        request.method,
                        request.url.path[:240],
                        hashlib.sha256((request.client.host if request.client else "").encode("utf-8")).hexdigest(),
                        request.headers.get("user-agent", "")[:240],
                        now_iso(),
                    ),
                )
        except Exception:
            pass
    return response


def base36(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    result = ""
    while value:
        value, remainder = divmod(value, 36)
        result = alphabet[remainder] + result
    return result


def check_rate_limit(key: str, max_count: int, window_ms: int) -> bool:
    now = time.time() * 1000
    existing = rate_limits.get(key)
    if not existing or existing["resetAt"] <= now:
        rate_limits[key] = {"count": 1, "resetAt": now + window_ms}
        return True
    if existing["count"] >= max_count:
        return False
    existing["count"] += 1
    return True


def is_read_only(request: Request) -> bool:
    return request.method in {"GET", "HEAD", "OPTIONS"}


async def require_admin(
    request: Request,
    response: Response,
    guzhouyue_admin: str | None = Cookie(default=None),
):
    token = request.cookies.get(config.session_cookie_name) or guzhouyue_admin
    expires_at = sessions.get(token or "")
    if not token or not expires_at or expires_at < time.time() * 1000:
        if token:
            sessions.pop(token, None)
            csrf_tokens.pop(token, None)
            response.delete_cookie(config.session_cookie_name, path="/")
            response.delete_cookie(config.csrf_cookie_name, path="/")
        raise HTTPException(status_code=401, detail={"error": "Admin login required"})
    if not is_read_only(request):
        csrf_token = csrf_tokens.get(token)
        submitted_token = request.headers.get("x-csrf-token")
        if not csrf_token or submitted_token != csrf_token:
            raise HTTPException(status_code=403, detail={"error": "Invalid CSRF token"})
    sessions[token] = time.time() * 1000 + config.session_ttl_ms
    return token


def error(status_code: int, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": message})


def parse_int_form(value: Any, field_name: str, fallback: int = 0) -> int:
    if value in {None, ""}:
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        raise error(400, f"Invalid {field_name}") from None


def read_today_almanac() -> dict[str, Any] | None:
    try:
        return get_today_almanac()
    except Exception:
        return None


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    from fastapi.responses import JSONResponse

    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.get("/api/health")
async def health():
    return {"ok": True, "timestamp": now_iso()}


@app.get("/api/site")
async def public_site():
    return get_site_payload(read_today_almanac())


@app.get("/api/almanac/today")
async def today_almanac():
    almanac = read_today_almanac()
    if not almanac:
        raise error(503, "Almanac unavailable")
    return almanac


@app.get("/api/articles")
async def articles(page: int = 1, pageSize: int = 10, category: str | None = None, tag: str | None = None, q: str | None = None):
    return list_articles({"page": page, "pageSize": pageSize, "category": category, "tag": tag, "q": q})


@app.get("/api/gallery")
async def gallery():
    items = [
        {**album, "images": []}
        for album in list_gallery_albums()
        if album["id"] != SYSTEM_GALLERY_ALBUM_ID and album["slug"] != SYSTEM_GALLERY_ALBUM_SLUG
    ]
    return {"items": items}


@app.get("/api/starfield")
async def public_starfield():
    return get_public_starfield()


@app.get("/api/gallery/albums/{id_or_slug}/images")
async def gallery_album_images(id_or_slug: str, page: int = 1, pageSize: int = 24):
    album = get_gallery_album(id_or_slug, False)
    if not album or album["id"] == SYSTEM_GALLERY_ALBUM_ID or album["slug"] == SYSTEM_GALLERY_ALBUM_SLUG:
        raise error(404, "Gallery album not found")
    return list_gallery_images_page(album["id"], page, pageSize)


@app.get("/api/uploads/gallery/{file_name}")
async def uploaded_gallery_file(file_name: str):
    safe_file_name = Path(file_name).name
    if safe_file_name != file_name or not safe_file_name.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        raise error(400, "Invalid file name")
    file_path = config.gallery_upload_dir / safe_file_name
    if not file_path.exists():
        raise error(404, "File not found")
    return FileResponse(file_path, media_type=mimetypes.guess_type(safe_file_name)[0] or "application/octet-stream")


@app.get("/api/articles/{slug}")
async def article_detail(slug: str):
    article = get_article_by_slug(slug)
    if not article:
        raise error(404, "Article not found")
    published = list_articles({"page": 1, "pageSize": 1000})["items"]
    index = next((i for i, item in enumerate(published) if item["slug"] == slug), -1)
    with get_db() as conn:
        comment_count = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM comments c
            JOIN articles a ON a.id = c.article_id
            WHERE a.slug = ? AND c.status = 'approved'
            """,
            (slug,),
        ).fetchone()["count"]
    return {
        "article": article,
        "previousPost": published[index - 1] if index > 0 else None,
        "nextPost": published[index + 1] if index >= 0 and index < len(published) - 1 else None,
        "commentCount": comment_count,
    }


@app.get("/api/archive")
async def archive():
    groups: dict[str, list[dict[str, Any]]] = {}
    for article in list_articles({"page": 1, "pageSize": 1000})["items"]:
        try:
            date = time.strptime((article["publishedAt"] or article["createdAt"])[:10], "%Y-%m-%d")
            month = f"{date.tm_year} 年 {date.tm_mon} 月"
        except Exception:
            month = "未知月份"
        groups.setdefault(month, []).append(article)
    return {"months": [{"month": month, "entries": entries} for month, entries in groups.items()]}


@app.get("/api/search")
async def search(q: str = "", page: int = 1, pageSize: int = 10):
    return list_articles({"q": q, "page": page, "pageSize": pageSize})


@app.get("/api/articles/{slug}/comments")
async def article_comments(slug: str):
    article = get_article_by_slug(slug)
    if not article:
        raise error(404, "Article not found")
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, author_name AS authorName, content, status, created_at AS createdAt, updated_at AS updatedAt
            FROM comments
            WHERE article_id = ? AND status = 'approved'
            ORDER BY created_at ASC
            """,
            (article["id"],),
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


@app.post("/api/articles/{slug}/comments", status_code=201)
async def submit_comment(slug: str, payload: dict[str, Any], request: Request):
    client_ip = request.client.host if request.client else ""
    if not check_rate_limit(f"comment:{client_ip}", 5, 60 * 1000):
        raise error(429, "Too many comments, please try again later")
    article = get_article_by_slug(slug)
    if not article:
        raise error(404, "Article not found")
    author_name = str(payload.get("authorName") or "").strip()
    content = str(payload.get("content") or "").strip()
    if len(author_name) < 1 or len(author_name) > 40 or len(content) < 1 or len(content) > 1000:
        raise error(400, "Invalid comment payload")
    now = now_iso()
    comment_id = f"comment_{base36(int(time.time() * 1000))}_{secrets.token_hex(4)}"
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO comments (id, article_id, author_name, content, status, ip_hash, user_agent, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
            """,
            (
                comment_id,
                article["id"],
                author_name,
                content,
                hashlib.sha256(client_ip.encode("utf-8")).hexdigest(),
                request.headers.get("user-agent", ""),
                now,
                now,
            ),
        )
    return {"id": comment_id, "status": "pending", "message": "评论已提交，审核后展示。"}


@app.post("/api/admin/login")
async def admin_login(payload: dict[str, Any], request: Request, response: Response):
    client_ip = request.client.host if request.client else ""
    if not check_rate_limit(f"login:{client_ip}", 8, 5 * 60 * 1000):
        raise error(429, "Too many login attempts, please try again later")
    if payload.get("password") != config.admin_password:
        raise error(401, "Invalid password")
    token = secrets.token_hex(32)
    csrf_token = secrets.token_hex(32)
    sessions[token] = time.time() * 1000 + config.session_ttl_ms
    csrf_tokens[token] = csrf_token
    max_age = int(config.session_ttl_ms / 1000)
    response.set_cookie(config.session_cookie_name, token, path="/", httponly=True, samesite="lax", secure=config.cookie_secure, max_age=max_age)
    response.set_cookie(config.csrf_cookie_name, csrf_token, path="/", httponly=False, samesite="lax", secure=config.cookie_secure, max_age=max_age)
    return {"ok": True}


@app.post("/api/admin/logout")
async def admin_logout(request: Request, response: Response):
    token = request.cookies.get(config.session_cookie_name)
    if token:
        sessions.pop(token, None)
        csrf_tokens.pop(token, None)
    response.delete_cookie(config.session_cookie_name, path="/")
    response.delete_cookie(config.csrf_cookie_name, path="/")
    return {"ok": True}


@app.get("/api/admin/me")
async def admin_me(_token: str = Depends(require_admin)):
    return {"authenticated": True}


@app.get("/api/admin/content")
async def admin_content(_token: str = Depends(require_admin)):
    return {
        "settings": get_site_settings(),
        "homepage": get_homepage(),
        "noteSections": list_note_sections(),
        "featuredSeries": list_featured_series(),
        "galleryAlbums": [get_gallery_album(album["id"], True) or album for album in list_gallery_albums(True)],
        "posts": list_articles({"page": 1, "pageSize": 1000, "includeDrafts": True})["items"],
    }


@app.get("/api/admin/ops")
async def admin_ops(_token: str = Depends(require_admin)):
    with get_db() as conn:
        quick_check = conn.execute("PRAGMA quick_check").fetchone()[0]
        pending_comments = conn.execute("SELECT COUNT(*) AS count FROM comments WHERE status = 'pending'").fetchone()["count"]
    size_bytes = config.database_path.stat().st_size if config.database_path.exists() else 0
    return {
        "api": {"ok": True, "timestamp": now_iso()},
        "database": {"ok": quick_check == "ok", "quickCheck": quick_check, "path": str(config.database_path), "sizeBytes": size_bytes},
        "pendingComments": pending_comments,
        "latestPublished": list_articles({"page": 1, "pageSize": 5})["items"],
        "recentAudit": read_audit_log(8),
        "llmTokenUsage": get_llm_token_usage_summary(),
    }


@app.get("/api/admin/audit")
async def admin_audit_log(_token: str = Depends(require_admin)):
    return {"items": read_audit_log(50)}


@app.get("/api/admin/tasks")
async def admin_tasks(limit: int = 80, _token: str = Depends(require_admin)):
    return {"items": list_admin_tasks(limit)}


def starfield_error(error_value: ValueError) -> HTTPException:
    message = str(error_value) or "Starfield request failed"
    if "not found" in message.lower():
        return error(404, message)
    return error(400, message)


@app.get("/api/admin/starfield/versions")
async def admin_starfield_versions(_token: str = Depends(require_admin)):
    return {"items": list_starfield_versions()}


@app.post("/api/admin/starfield/versions", status_code=201)
async def admin_create_starfield_version(payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return create_starfield_version(payload)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.get("/api/admin/starfield/versions/{version_id}")
async def admin_starfield_version(version_id: str, _token: str = Depends(require_admin)):
    try:
        return get_admin_starfield_version(version_id)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/generate-passages")
async def admin_generate_starfield_passages(version_id: str, payload: dict[str, Any], background_tasks: BackgroundTasks, _token: str = Depends(require_admin)):
    try:
        article_ids = payload.get("articleIds")
        if not isinstance(article_ids, list):
            raise ValueError("articleIds must be a list")
        result = enqueue_starfield_passage_generation(version_id, [str(article_id) for article_id in article_ids])
        background_tasks.add_task(run_starfield_passage_generation_job, result["jobId"])
        return result
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/generate-relationships")
async def admin_generate_starfield_relationships(version_id: str, background_tasks: BackgroundTasks, _token: str = Depends(require_admin)):
    try:
        result = enqueue_starfield_relationship_generation(version_id)
        background_tasks.add_task(run_starfield_relationship_generation_job, result["jobId"])
        return result
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/generate-deep-relationships")
async def admin_generate_starfield_deep_relationships(version_id: str, background_tasks: BackgroundTasks, _token: str = Depends(require_admin)):
    try:
        result = enqueue_starfield_deep_relationship_generation(version_id)
        background_tasks.add_task(run_starfield_deep_relationship_generation_job, result["jobId"])
        return result
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.put("/api/admin/starfield/passages/{passage_id}")
async def admin_update_starfield_passage(passage_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return update_starfield_passage(passage_id, payload)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/passages/bulk")
async def admin_bulk_update_starfield_passages(version_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return update_starfield_passages_bulk(version_id, payload)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.put("/api/admin/starfield/relationships/{relationship_id}")
async def admin_update_starfield_relationship(relationship_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return update_starfield_relationship(relationship_id, payload)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/relationships/bulk")
async def admin_bulk_update_starfield_relationships(version_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return update_starfield_relationships_bulk(version_id, payload)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.put("/api/admin/starfield/deep-paths/{path_id}")
async def admin_update_starfield_deep_path(path_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return update_starfield_deep_path(path_id, payload)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/deep-paths/bulk")
async def admin_bulk_update_starfield_deep_paths(version_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return update_starfield_deep_paths_bulk(version_id, payload)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/publish")
async def admin_publish_starfield_version(version_id: str, _token: str = Depends(require_admin)):
    try:
        return publish_starfield_version(version_id)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.post("/api/admin/starfield/versions/{version_id}/archive")
async def admin_archive_starfield_version(version_id: str, _token: str = Depends(require_admin)):
    try:
        return archive_version(version_id)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


@app.delete("/api/admin/starfield/versions/{version_id}")
async def admin_delete_starfield_version(version_id: str, _token: str = Depends(require_admin)):
    try:
        return delete_starfield_version(version_id)
    except ValueError as error_value:
        raise starfield_error(error_value) from error_value


def read_audit_log(limit: int) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, action, target, user_agent AS userAgent, created_at AS createdAt
            FROM admin_audit_log
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/admin/commands")
async def admin_command_guide(_token: str = Depends(require_admin)):
    return admin_commands.get_guide()


@app.post("/api/admin/commands/parse")
async def admin_command_parse(payload: dict[str, Any], _token: str = Depends(require_admin)):
    return {**admin_commands.parse_admin_command(payload.get("input")), "guide": admin_commands.get_guide()}


@app.post("/api/admin/commands/run")
async def admin_command_run(payload: dict[str, Any], request: Request, _token: str = Depends(require_admin)):
    return admin_commands.run_admin_command(payload, {"requestedAt": now_iso(), "requestId": getattr(request.state, "request_id", "")})


@app.post("/api/admin/commands/ai")
async def admin_command_ai(payload: dict[str, Any], request: Request, _token: str = Depends(require_admin)):
    requested_at = now_iso()
    context = {"requestedAt": requested_at, "requestId": getattr(request.state, "request_id", "")}
    try:
        plan = await plan_admin_commands({**payload, "guide": admin_commands.get_guide(), "requestedAt": requested_at})
    except AiAgentError as error_value:
        raise error(error_value.status_code, str(error_value)) from error_value
    results = []
    for command in plan["commands"]:
        result = admin_commands.run_admin_command(
            {
                "input": command["input"],
                "dryRun": command.get("dryRun") is True,
                "confirm": command.get("confirm") is True,
            },
            context,
        )
        results.append({"input": command["input"], "purpose": command.get("purpose", ""), **result})
        if result.get("status") in {"invalid", "unknown_command", "failed", "confirmation_required"}:
            break
    return {"reply": plan["reply"], "commands": plan["commands"], "results": results}


@app.get("/api/admin/gallery")
async def admin_gallery(_token: str = Depends(require_admin)):
    return {"items": [get_gallery_album(album["id"], True) or album for album in list_gallery_albums(True)]}


@app.post("/api/admin/gallery/albums", status_code=201)
async def admin_create_gallery_album(payload: dict[str, Any], _token: str = Depends(require_admin)):
    return create_gallery_album(payload)


@app.put("/api/admin/gallery/albums/{id_or_slug}")
async def admin_update_gallery_album(id_or_slug: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    album = update_gallery_album(id_or_slug, payload)
    if not album:
        raise error(404, "Gallery album not found")
    return album


@app.delete("/api/admin/gallery/albums/{id_or_slug}")
async def admin_delete_gallery_album(id_or_slug: str, _token: str = Depends(require_admin)):
    album = get_gallery_album(id_or_slug, True)
    if not album:
        raise error(404, "Gallery album not found")
    if album["id"] == SYSTEM_GALLERY_ALBUM_ID:
        raise error(400, "System gallery cannot be deleted")
    deleted = delete_gallery_album(id_or_slug)
    if not deleted:
        raise error(404, "Gallery album not found")
    delete_gallery_files(deleted)
    return {"ok": True}


@app.post("/api/admin/gallery/albums/{id_or_slug}/images", status_code=201)
async def admin_upload_gallery_image(
    id_or_slug: str,
    image: UploadFile = File(...),
    title: str = Form(""),
    description: str = Form(""),
    capturedAt: str = Form(""),
    isPublic: str = Form("true"),
    sortOrder: str = Form("0"),
    _token: str = Depends(require_admin),
):
    album_id = resolve_gallery_album_id(id_or_slug)
    if not album_id:
        raise error(404, "Gallery album not found")
    if album_id == SYSTEM_GALLERY_ALBUM_ID:
        raise error(400, "System gallery images must be replaced instead of added")
    extension = allowed_gallery_mime_types.get(image.content_type or "")
    if not extension:
        raise error(400, "Unsupported image type")
    buffer = await read_validated_gallery_image(image, extension)
    file_name = f"{base36(int(time.time() * 1000))}-{secrets.token_hex(8)}.{extension}"
    config.gallery_upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = config.gallery_upload_dir / file_name
    file_path.write_bytes(buffer)
    original_title = Path(image.filename or "").stem
    created = create_gallery_image(
        album_id,
        {
            "title": title.strip() or original_title or "未命名图片",
            "description": description.strip(),
            "capturedAt": capturedAt.strip() or None,
            "isPublic": isPublic != "false",
            "sortOrder": parse_int_form(sortOrder, "sortOrder"),
            "imageUrl": f"/api/uploads/gallery/{file_name}",
            "fileName": file_name,
            "mimeType": image.content_type,
            "sizeBytes": file_path.stat().st_size,
        },
    )
    return created


@app.post("/api/admin/gallery/images/{image_id}/file")
async def admin_replace_gallery_image_file(image_id: str, image: UploadFile = File(...), _token: str = Depends(require_admin)):
    existing = get_gallery_image(image_id)
    if not existing:
        raise error(404, "Gallery image not found")
    if existing["albumId"] != SYSTEM_GALLERY_ALBUM_ID:
        raise error(400, "Only system gallery images can be replaced")
    extension = allowed_gallery_mime_types.get(image.content_type or "")
    if not extension:
        raise error(400, "Unsupported image type")
    buffer = await read_validated_gallery_image(image, extension)
    file_name = f"system-{image_id}-{base36(int(time.time() * 1000))}-{secrets.token_hex(8)}.{extension}"
    config.gallery_upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = config.gallery_upload_dir / file_name
    file_path.write_bytes(buffer)
    updated = update_gallery_image_file(image_id, {"imageUrl": f"/api/uploads/gallery/{file_name}", "fileName": file_name, "mimeType": image.content_type, "sizeBytes": file_path.stat().st_size})
    if not updated:
        raise error(404, "Gallery image not found")
    delete_gallery_files([existing])
    return updated


@app.put("/api/admin/gallery/images/{image_id}")
async def admin_update_gallery_image(image_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    image = update_gallery_image(image_id, payload)
    if not image:
        raise error(404, "Gallery image not found")
    return image


@app.delete("/api/admin/gallery/images/{image_id}")
async def admin_delete_gallery_image(image_id: str, _token: str = Depends(require_admin)):
    image = get_gallery_image(image_id)
    if not image:
        raise error(404, "Gallery image not found")
    if image["albumId"] == SYSTEM_GALLERY_ALBUM_ID:
        raise error(400, "System gallery images cannot be deleted")
    deleted = delete_gallery_image(image_id)
    if not deleted:
        raise error(404, "Gallery image not found")
    delete_gallery_files([image])
    return {"ok": True}


async def read_validated_gallery_image(file: UploadFile, extension: str) -> bytes:
    buffer = await file.read(max_gallery_image_bytes + 1)
    if len(buffer) > max_gallery_image_bytes:
        raise error(413, "Image file is too large")
    if not has_expected_image_signature(buffer, extension):
        raise error(400, "Invalid image file")
    return buffer


def has_expected_image_signature(buffer: bytes, extension: str) -> bool:
    if extension == "jpg":
        return len(buffer) >= 3 and buffer[0:3] in {b"\xff\xd8\xff"}
    if extension == "png":
        return len(buffer) >= 8 and buffer[:8] == b"\x89PNG\r\n\x1a\n"
    if extension == "webp":
        return len(buffer) >= 12 and buffer[:4] == b"RIFF" and buffer[8:12] == b"WEBP"
    if extension == "gif":
        return buffer[:6] in {b"GIF87a", b"GIF89a"}
    return False


def delete_gallery_files(images: list[dict[str, Any]]) -> None:
    for image in images:
        file_name = image.get("fileName")
        if not file_name:
            continue
        safe_file_name = Path(file_name).name
        if safe_file_name != file_name:
            raise ValueError("Unsafe gallery file name")
        file_path = config.gallery_upload_dir / safe_file_name
        if file_path.exists():
            file_path.unlink()


def list_payload_items(payload: Any, field_name: str) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        items = payload.get("items", [])
        return items if isinstance(items, list) else []
    raise error(400, f"Invalid {field_name} payload")
    return []


@app.put("/api/admin/settings")
async def admin_save_settings(payload: dict[str, Any], _token: str = Depends(require_admin)):
    style_preset = payload.get("stylePreset") if payload.get("stylePreset") in {"classic", "cyber"} else "classic"
    owner_name = str(payload.get("ownerName") or "孤舟月").strip()[:40] or "孤舟月"
    owner_avatar_url = str(payload.get("ownerAvatarUrl") or "").strip()[:500]
    now = now_iso()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO site_settings (id, style_preset, color_scheme, owner_name, owner_avatar_url, updated_at)
            VALUES ('site', ?, 'light', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET style_preset = excluded.style_preset,
              owner_name = excluded.owner_name, owner_avatar_url = excluded.owner_avatar_url, updated_at = excluded.updated_at
            """,
            (style_preset, owner_name, owner_avatar_url, now),
        )
    return get_site_settings()


@app.get("/api/admin/llm-config")
async def admin_llm_config(_token: str = Depends(require_admin)):
    return get_llm_settings()


@app.get("/api/admin/llm-token-usage")
async def admin_llm_token_usage(_token: str = Depends(require_admin)):
    return get_llm_token_usage_payload(50)


@app.put("/api/admin/llm-config")
async def admin_save_llm_config(payload: dict[str, Any], _token: str = Depends(require_admin)):
    return save_llm_settings(payload)


@app.post("/api/admin/llm-config/test")
async def admin_test_llm_config(_token: str = Depends(require_admin)):
    settings = get_llm_settings()
    try:
        result = await test_llm_connection()
        return {
            "ok": True,
            "message": result["message"],
            "provider": settings["provider"],
            "model": settings["model"],
        }
    except AiAgentError as error_value:
        raise error(error_value.status_code, str(error_value)) from error_value


@app.post("/api/admin/ai-agent/article-metadata")
async def admin_article_metadata(payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return await generate_article_metadata(payload)
    except AiAgentError as error_value:
        raise error(error_value.status_code, str(error_value)) from error_value


@app.put("/api/admin/homepage")
async def admin_save_homepage(payload: dict[str, Any], _token: str = Depends(require_admin)):
    now = now_iso()
    body = {**payload, "updatedAt": now}
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO homepage_copy (id, payload_json, updated_at)
            VALUES ('homepage', ?, ?)
            ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
            """,
            (json.dumps(body, ensure_ascii=False), now),
        )
    return get_homepage()


@app.post("/api/admin/articles", status_code=201)
async def admin_create_article(payload: dict[str, Any], _token: str = Depends(require_admin)):
    return create_article(payload)


@app.put("/api/admin/articles/{id_or_slug}")
async def admin_update_article(id_or_slug: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    article = update_article(id_or_slug, payload)
    if not article:
        raise error(404, "Article not found")
    return article


@app.delete("/api/admin/articles/{id_or_slug}")
async def admin_delete_article(id_or_slug: str, _token: str = Depends(require_admin)):
    article_id = resolve_article_id(id_or_slug)
    if not article_id:
        raise error(404, "Article not found")
    with get_db() as conn:
        conn.execute("UPDATE articles SET deleted_at = ?, updated_at = ? WHERE id = ?", (now_iso(), now_iso(), article_id))
    return {"ok": True}


@app.get("/api/admin/tags")
async def admin_tags(_token: str = Depends(require_admin)):
    return {"items": list_tags()}


@app.delete("/api/admin/tags/{tag_name}")
async def admin_delete_tag(tag_name: str, _token: str = Depends(require_admin)):
    try:
        return delete_tag(tag_name)
    except ValueError as error_value:
        raise error(400, str(error_value)) from error_value


@app.post("/api/admin/tags/merge")
async def admin_merge_tags(payload: dict[str, Any], _token: str = Depends(require_admin)):
    try:
        return merge_tags(payload.get("sourceTag"), payload.get("targetTag"))
    except ValueError as error_value:
        raise error(400, str(error_value)) from error_value


@app.get("/api/admin/trash/articles")
async def admin_deleted_articles(_token: str = Depends(require_admin)):
    return {"items": list_deleted_articles()}


@app.post("/api/admin/trash/articles/{id_or_slug}/restore")
async def admin_restore_article(id_or_slug: str, _token: str = Depends(require_admin)):
    article = restore_article(id_or_slug)
    if not article:
        raise error(404, "Article not found")
    return article


@app.post("/api/admin/articles/{id_or_slug}/publish")
async def admin_publish_article(id_or_slug: str, _token: str = Depends(require_admin)):
    article = update_article(id_or_slug, {"status": "published", "publishedAt": now_iso()})
    if not article:
        raise error(404, "Article not found")
    return article


@app.post("/api/admin/articles/{id_or_slug}/unpublish")
async def admin_unpublish_article(id_or_slug: str, _token: str = Depends(require_admin)):
    article = update_article(id_or_slug, {"status": "draft"})
    if not article:
        raise error(404, "Article not found")
    return article


@app.put("/api/admin/note-sections")
async def admin_save_note_sections(payload: Any = Body(...), _token: str = Depends(require_admin)):
    sections = list_payload_items(payload, "note sections")
    normalized = []
    for index, item in enumerate(sections):
        if not isinstance(item, dict):
            continue
        name = str(item.get("category") or item.get("name") or "未命名分类").strip()
        section_id = str(item.get("id") or f"section_{slugify(name)}")
        normalized.append({"id": section_id, "name": name, "slugBase": slugify(item.get("slug") or name), "description": str(item.get("description") or ""), "sortOrder": index})
    now = now_iso()
    with get_db() as conn:
        kept_ids = [item["id"] for item in normalized]
        if normalized:
            placeholders = ",".join("?" for _ in normalized)
            conn.execute(f"UPDATE articles SET category_id = NULL, updated_at = ? WHERE category_id NOT IN ({placeholders})", [now, *kept_ids])
            conn.execute(f"DELETE FROM note_sections WHERE id NOT IN ({placeholders})", kept_ids)
        else:
            conn.execute("UPDATE articles SET category_id = NULL, updated_at = ? WHERE category_id IS NOT NULL", (now,))
            conn.execute("DELETE FROM note_sections")
        used_slugs: set[str] = set()
        for item in normalized:
            slug = item["slugBase"]
            suffix = 2
            while slug in used_slugs or conn.execute("SELECT id FROM note_sections WHERE slug = ? AND id <> ?", (slug, item["id"])).fetchone():
                slug = f"{item['slugBase']}-{suffix}"
                suffix += 1
            used_slugs.add(slug)
            conn.execute(
                """
                INSERT INTO note_sections (id, name, slug, description, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug,
                  description = excluded.description, sort_order = excluded.sort_order, updated_at = excluded.updated_at
                """,
                (item["id"], item["name"], slug, item["description"], item["sortOrder"], now, now),
            )
    return {"items": list_note_sections()}


@app.put("/api/admin/featured-series")
async def admin_save_featured_series(payload: Any = Body(...), _token: str = Depends(require_admin)):
    series = list_payload_items(payload, "featured series")
    now = now_iso()
    with get_db() as conn:
        conn.execute("DELETE FROM featured_series")
        for index, item in enumerate(series):
            if not isinstance(item, dict):
                continue
            series_id = str(item.get("id") or f"series_{index}")
            conn.execute(
                "INSERT INTO featured_series (id, title, lead, body, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (series_id, str(item.get("title") or "未命名专题"), str(item.get("lead") or ""), str(item.get("body") or ""), index, now, now),
            )
            for item_index, slug in enumerate(item.get("postSlugs") or []):
                conn.execute(
                    """
                    INSERT INTO featured_series_items (series_id, article_id, sort_order)
                    SELECT ?, id, ? FROM articles WHERE slug = ? AND deleted_at IS NULL
                    """,
                    (series_id, item_index, str(slug)),
                )
    return {"items": list_featured_series()}


@app.get("/api/admin/comments")
async def admin_comments(status: str = "pending", _token: str = Depends(require_admin)):
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.author_name AS authorName, c.content, c.status,
              c.created_at AS createdAt, c.updated_at AS updatedAt,
              a.slug AS articleSlug, a.title AS articleTitle
            FROM comments c
            JOIN articles a ON a.id = c.article_id
            WHERE c.status = ?
            ORDER BY c.created_at DESC
            """,
            (status,),
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


@app.put("/api/admin/comments/{comment_id}")
async def admin_update_comment(comment_id: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    if payload.get("status") not in {"pending", "approved", "rejected"}:
        raise error(400, "Invalid status")
    with get_db() as conn:
        result = conn.execute("UPDATE comments SET status = ?, updated_at = ? WHERE id = ?", (payload.get("status"), now_iso(), comment_id))
    if not result.rowcount:
        raise error(404, "Comment not found")
    return {"ok": True}


@app.get("/api/admin/drafts/{draft_key}")
async def admin_get_draft(draft_key: str, _token: str = Depends(require_admin)):
    with get_db() as conn:
        row = conn.execute("SELECT payload_json AS payloadJson, saved_at AS savedAt FROM composer_drafts WHERE draft_key = ?", (draft_key,)).fetchone()
    if not row:
        raise error(404, "Draft not found")
    return {"draft": json.loads(row["payloadJson"]), "savedAt": row["savedAt"]}


@app.put("/api/admin/drafts/{draft_key}")
async def admin_save_draft(draft_key: str, payload: dict[str, Any], _token: str = Depends(require_admin)):
    body = dict(payload)
    if body.get("publishedAt"):
        body["publishedAt"] = parse_date_label(body["publishedAt"])
    now = now_iso()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO composer_drafts (draft_key, article_id, payload_json, saved_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(draft_key) DO UPDATE SET article_id = excluded.article_id,
              payload_json = excluded.payload_json, saved_at = excluded.saved_at
            """,
            (draft_key, body.get("articleId"), json.dumps(body, ensure_ascii=False), now),
        )
    return {"draft": body, "savedAt": now}


@app.delete("/api/admin/drafts/{draft_key}")
async def admin_delete_draft(draft_key: str, _token: str = Depends(require_admin)):
    with get_db() as conn:
        conn.execute("DELETE FROM composer_drafts WHERE draft_key = ?", (draft_key,))
    return {"ok": True}


@app.get("/rss.xml")
async def rss():
    site = get_site_payload()
    articles = list_articles({"page": 1, "pageSize": 100})["items"]
    items = "".join(
        f"<item><title><![CDATA[{safe_cdata(article['title'])}]]></title>"
        f"<link>{escape(config.site_url + '/posts/' + quote(article['slug']))}</link>"
        f"<guid isPermaLink=\"true\">{escape(config.site_url + '/posts/' + quote(article['slug']))}</guid>"
        f"<description><![CDATA[{safe_cdata(article['excerpt'])}]]></description>"
        f"<pubDate>{escape(rss_pub_date(article['publishedAt'] or article['createdAt']))}</pubDate></item>"
        for article in articles
    )
    body = f"<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title><![CDATA[{safe_cdata(site['homepage'].get('siteName') or '孤舟月')}]]></title><link>{escape(config.site_url)}</link><description><![CDATA[{safe_cdata(site['homepage'].get('siteTagline') or '')}]]></description>{items}</channel></rss>"
    return Response(content=body, media_type="application/rss+xml; charset=utf-8")


@app.get("/sitemap.xml")
async def sitemap():
    articles = list_articles({"page": 1, "pageSize": 1000})["items"]
    urls = [
        f"<url><loc>{escape(config.site_url + '/')}</loc></url>",
        f"<url><loc>{escape(config.site_url + '/posts/page/1')}</loc></url>",
        f"<url><loc>{escape(config.site_url + '/notes/page/1')}</loc></url>",
        f"<url><loc>{escape(config.site_url + '/gallery')}</loc></url>",
        f"<url><loc>{escape(config.site_url + '/archive/page/1')}</loc></url>",
        *[
            f"<url><loc>{escape(config.site_url + '/posts/' + quote(article['slug']))}</loc><lastmod>{escape(article['updatedAt'])}</lastmod></url>"
            for article in articles
        ],
    ]
    body = f"<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">{''.join(urls)}</urlset>"
    return Response(content=body, media_type="application/xml; charset=utf-8")


@app.get("/robots.txt")
async def robots():
    return PlainTextResponse(f"User-agent: *\nAllow: /\nSitemap: {config.site_url}/sitemap.xml\n", media_type="text/plain; charset=utf-8")


def safe_cdata(value: Any) -> str:
    return str(value or "").replace("]]>", "]]]]><![CDATA[>")


def rss_pub_date(value: Any) -> str:
    text = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        parsed = datetime.now(timezone.utc)
    return format_datetime(parsed.astimezone(timezone.utc), usegmt=True)


def main() -> None:
    uvicorn.run("server_py.app:app", host=config.host, port=config.port, reload=False)


if __name__ == "__main__":
    main()
