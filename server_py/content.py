from __future__ import annotations

import json
import math
import random
import re
import string
import time
from datetime import datetime
from typing import Any

from .db import get_db, json_parse, now_iso


SYSTEM_GALLERY_ALBUM_ID = "album-moonlight"
SYSTEM_GALLERY_ALBUM_SLUG = "system"

LLM_PROVIDER_DEFAULTS = {
    "deepseek": {"label": "DeepSeek", "model": "deepseek-v4-pro", "baseUrl": "https://api.deepseek.com"},
    "openai": {"label": "OpenAI", "model": "gpt-4.1", "baseUrl": "https://api.openai.com/v1"},
    "anthropic": {"label": "Anthropic", "model": "claude-3-5-sonnet-latest", "baseUrl": "https://api.anthropic.com"},
    "google": {"label": "Google Gemini", "model": "gemini-1.5-pro", "baseUrl": "https://generativelanguage.googleapis.com/v1beta"},
    "moonshot": {"label": "Moonshot", "model": "moonshot-v1-128k", "baseUrl": "https://api.moonshot.cn/v1"},
    "qwen": {"label": "通义千问", "model": "qwen-max", "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    "zhipu": {"label": "智谱 GLM", "model": "glm-4-plus", "baseUrl": "https://open.bigmodel.cn/api/paas/v4"},
    "custom": {"label": "自定义", "model": "deepseek-v4-pro", "baseUrl": ""},
}


def slugify(value: Any) -> str:
    normalized = re.sub(r"\s+", "-", str(value or "").strip().lower())
    normalized = re.sub(r"[^a-z0-9\u4e00-\u9fa5-]", "", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized or f"item-{int(time.time() * 1000)}"


def make_id(prefix: str) -> str:
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    return f"{prefix}_{base36(int(time.time() * 1000))}_{suffix}"


def base36(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    result = ""
    while value:
        value, remainder = divmod(value, 36)
        result = alphabet[remainder] + result
    return result


def parse_date_label(value: Any) -> str:
    if not value:
        return now_iso()
    text = str(value).strip()
    match = re.match(r"^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?", text)
    if match:
        year, month, day, hour, minute = match.groups()
        return datetime(int(year), int(month), int(day), int(hour or 0), int(minute or 0)).astimezone().isoformat()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.isoformat().replace("+00:00", "Z")
    except ValueError:
        return now_iso()


def date_label(iso_date: str | None) -> str:
    if not iso_date:
        return ""
    try:
        date = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
    except ValueError:
        return iso_date
    return f"{date.year}.{date.month:02d}.{date.day:02d}"


def to_article(row: Any) -> dict[str, Any]:
    body_markdown = row["body_markdown"] or ""
    return {
        "id": row["id"],
        "slug": row["slug"],
        "title": row["title"],
        "excerpt": row["excerpt"],
        "categoryId": row["category_id"],
        "category": row["category_name"] or "",
        "categorySlug": row["category_slug"] or "",
        "authorName": row["author_name"],
        "status": row["status"],
        "publishedAt": row["published_at"],
        "date": date_label(row["published_at"]),
        "dateLabel": date_label(row["published_at"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "tone": row["tone"],
        "tags": json_parse(row["tags_json"], []),
        "body": re.split(r"\n{2,}", body_markdown) if body_markdown else [],
        "bodyMarkdown": body_markdown,
        "seoTitle": row["seo_title"] or row["title"],
        "seoDescription": row["seo_description"] or row["excerpt"],
        "coverImage": row["cover_image"],
        "deletedAt": row["deleted_at"],
    }


def get_article_by_slug(slug: str, include_drafts: bool = False) -> dict[str, Any] | None:
    status_sql = "" if include_drafts else "AND a.status = 'published'"
    with get_db() as conn:
        row = conn.execute(
            f"""
            SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
            FROM articles a
            LEFT JOIN note_sections ns ON ns.id = a.category_id
            WHERE a.slug = ? AND a.deleted_at IS NULL {status_sql}
            """,
            (slug,),
        ).fetchone()
    return to_article(row) if row else None


def resolve_article_id(identifier: str, include_deleted: bool = False) -> str | None:
    deleted_sql = "" if include_deleted else "AND deleted_at IS NULL"
    with get_db() as conn:
        row = conn.execute(
            f"SELECT id FROM articles WHERE (id = ? OR slug = ?) {deleted_sql}",
            (identifier, identifier),
        ).fetchone()
    return row["id"] if row else None


def list_articles(options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    page = max(1, int(options.get("page") or 1))
    page_size = min(1000, max(1, int(options.get("pageSize") or 10)))
    clauses = ["a.deleted_at IS NULL"]
    params: list[Any] = []
    if options.get("includeDrafts"):
        if options.get("status"):
            clauses.append("a.status = ?")
            params.append(options["status"])
    else:
        clauses.append("a.status = 'published'")
    if options.get("category"):
        clauses.append("(ns.slug = ? OR ns.name = ?)")
        params.extend([options["category"], options["category"]])
    if options.get("tag"):
        clauses.append("a.tags_json LIKE ?")
        params.append(f'%"{options["tag"]}"%')
    if options.get("q"):
        like = f'%{str(options["q"]).strip()}%'
        clauses.append("(a.title LIKE ? OR a.excerpt LIKE ? OR a.body_markdown LIKE ? OR ns.name LIKE ? OR a.tags_json LIKE ?)")
        params.extend([like, like, like, like, like])
    where_sql = "WHERE " + " AND ".join(clauses)
    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS count FROM articles a LEFT JOIN note_sections ns ON ns.id = a.category_id {where_sql}",
            params,
        ).fetchone()["count"]
        rows = conn.execute(
            f"""
            SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
            FROM articles a
            LEFT JOIN note_sections ns ON ns.id = a.category_id
            {where_sql}
            ORDER BY COALESCE(a.published_at, a.updated_at) DESC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    return {
        "items": [to_article(row) for row in rows],
        "page": page,
        "pageSize": page_size,
        "pageCount": max(1, math.ceil(total / page_size)),
        "total": total,
    }


def list_tags() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.tags_json
            FROM articles a
            WHERE a.deleted_at IS NULL
            """
        ).fetchall()

    tag_stats: dict[str, dict[str, Any]] = {}
    for row in rows:
        seen_in_article: set[str] = set()
        for tag in normalize_article_tags(json_parse(row["tags_json"], [])):
            stats = tag_stats.setdefault(
                tag,
                {
                    "name": tag,
                    "articleCount": 0,
                    "occurrenceCount": 0,
                },
            )
            stats["occurrenceCount"] += 1
            if tag not in seen_in_article:
                stats["articleCount"] += 1
                seen_in_article.add(tag)

    return sorted(tag_stats.values(), key=lambda item: (-item["articleCount"], item["name"].lower()))


def delete_tag(tag_name: Any) -> dict[str, Any]:
    tag = normalize_tag_value(tag_name)
    if not tag:
        raise ValueError("Tag is required")

    return rewrite_article_tags(lambda tags: [item for item in tags if item != tag])


def merge_tags(source_tag_name: Any, target_tag_name: Any) -> dict[str, Any]:
    source_tag = normalize_tag_value(source_tag_name)
    target_tag = normalize_tag_value(target_tag_name)
    if not source_tag or not target_tag:
        raise ValueError("Source and target tags are required")
    if source_tag == target_tag:
        raise ValueError("Source and target tags must be different")

    return rewrite_article_tags(
        lambda tags: normalize_article_tags(target_tag if item == source_tag else item for item in tags)
    )


def rewrite_article_tags(create_next_tags: Any) -> dict[str, Any]:
    now = now_iso()
    updated_ids: list[str] = []
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT a.*
            FROM articles a
            WHERE a.deleted_at IS NULL
            """
        ).fetchall()
        for row in rows:
            current_tags = normalize_article_tags(json_parse(row["tags_json"], []))
            next_tags = normalize_article_tags(create_next_tags(current_tags))
            if current_tags == next_tags:
                continue
            conn.execute(
                "UPDATE articles SET tags_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(next_tags, ensure_ascii=False), now, row["id"]),
            )
            updated_ids.append(row["id"])

        if not updated_ids:
            return {"updatedCount": 0, "articles": []}

        placeholders = ",".join("?" for _ in updated_ids)
        updated_rows = conn.execute(
            f"""
            SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
            FROM articles a
            LEFT JOIN note_sections ns ON ns.id = a.category_id
            WHERE a.id IN ({placeholders})
            ORDER BY COALESCE(a.published_at, a.updated_at) DESC
            """,
            updated_ids,
        ).fetchall()

    return {"updatedCount": len(updated_ids), "articles": [to_article(row) for row in updated_rows]}


def list_deleted_articles() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
            FROM articles a
            LEFT JOIN note_sections ns ON ns.id = a.category_id
            WHERE a.deleted_at IS NOT NULL
            ORDER BY a.deleted_at DESC, a.updated_at DESC
            """
        ).fetchall()
    return [to_article(row) for row in rows]


def list_note_sections() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM note_sections ORDER BY sort_order ASC, created_at ASC").fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "category": row["name"],
            "slug": row["slug"],
            "description": row["description"],
            "sortOrder": row["sort_order"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def normalize_site_style_preset(value: Any) -> str:
    return value if value in {"classic", "cyber"} else "classic"


def get_site_settings() -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM site_settings WHERE id = ?", ("site",)).fetchone()
    return {
        "stylePreset": normalize_site_style_preset(row["style_preset"] if row else None),
        "ownerName": row["owner_name"] if row else "孤舟月",
        "ownerAvatarUrl": row["owner_avatar_url"] if row and "owner_avatar_url" in row.keys() else "",
        "updatedAt": row["updated_at"] if row else now_iso(),
    }


def get_homepage() -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT payload_json, updated_at FROM homepage_copy WHERE id = ?", ("homepage",)).fetchone()
    payload = json_parse(row["payload_json"] if row else "{}", {})
    payload["updatedAt"] = row["updated_at"] if row else now_iso()
    return payload


def list_featured_series() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM featured_series ORDER BY sort_order ASC, created_at ASC").fetchall()
        result = []
        for row in rows:
            article_rows = conn.execute(
                """
                SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
                FROM featured_series_items item
                JOIN articles a ON a.id = item.article_id
                LEFT JOIN note_sections ns ON ns.id = a.category_id
                WHERE item.series_id = ? AND a.deleted_at IS NULL
                ORDER BY item.sort_order ASC
                """,
                (row["id"],),
            ).fetchall()
            articles = [to_article(article) for article in article_rows]
            result.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "lead": row["lead"],
                    "body": row["body"],
                    "sortOrder": row["sort_order"],
                    "postSlugs": [article["slug"] for article in articles],
                    "articles": articles,
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                }
            )
    return result


def get_site_payload(almanac: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "settings": get_site_settings(),
        "homepage": get_homepage(),
        "noteSections": list_note_sections(),
        "featuredSeries": list_featured_series(),
        "almanac": almanac,
    }


def _to_gallery_image(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "albumId": row["album_id"],
        "title": row["title"],
        "description": row["description"],
        "imageUrl": row["image_url"],
        "fileName": row["file_name"],
        "mimeType": row["mime_type"],
        "sizeBytes": row["size_bytes"],
        "capturedAt": row["captured_at"],
        "isPublic": bool(row["is_public"]),
        "sortOrder": row["sort_order"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _to_gallery_album(row: Any, images: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    images = images or []
    is_system = row["id"] == SYSTEM_GALLERY_ALBUM_ID or row["slug"] == SYSTEM_GALLERY_ALBUM_SLUG
    return {
        "id": SYSTEM_GALLERY_ALBUM_ID if is_system else row["id"],
        "slug": SYSTEM_GALLERY_ALBUM_SLUG if is_system else row["slug"],
        "title": "系统图库" if is_system else row["title"],
        "description": (row["description"] or "维护博客各页面使用的公共图片，不包含文章正文图片。") if is_system else row["description"],
        "coverImageId": row["cover_image_id"],
        "coverImageUrl": row["cover_image_url"] or (images[0]["imageUrl"] if images else ""),
        "isPublic": True if is_system else bool(row["is_public"]),
        "sortOrder": 0 if is_system else row["sort_order"],
        "imageCount": row["image_count"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "images": images,
    }


def list_gallery_albums(include_private: bool = False) -> list[dict[str, Any]]:
    public_sql = "" if include_private else "WHERE a.is_public = 1"
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT a.*,
              COALESCE(cover.image_url, first_image.image_url) AS cover_image_url,
              COUNT(CASE WHEN img.is_public = 1 THEN 1 END) AS image_count
            FROM gallery_albums a
            LEFT JOIN gallery_images cover ON cover.id = a.cover_image_id
            LEFT JOIN gallery_images first_image ON first_image.id = (
              SELECT first_public_image.id
              FROM gallery_images first_public_image
              WHERE first_public_image.album_id = a.id AND first_public_image.is_public = 1
              ORDER BY first_public_image.sort_order ASC, first_public_image.created_at ASC
              LIMIT 1
            )
            LEFT JOIN gallery_images img ON img.album_id = a.id
            {public_sql}
            GROUP BY a.id
            ORDER BY a.sort_order ASC, a.created_at DESC
            """
        ).fetchall()
    return [_to_gallery_album(row) for row in rows]


def get_gallery_album(identifier: str, include_private: bool = False) -> dict[str, Any] | None:
    public_sql = "" if include_private else "AND a.is_public = 1"
    image_public_sql = "" if include_private else "AND is_public = 1"
    with get_db() as conn:
        row = conn.execute(
            f"""
            SELECT a.*, cover.image_url AS cover_image_url,
              COUNT(CASE WHEN img.is_public = 1 THEN 1 END) AS image_count
            FROM gallery_albums a
            LEFT JOIN gallery_images cover ON cover.id = a.cover_image_id
            LEFT JOIN gallery_images img ON img.album_id = a.id
            WHERE (a.id = ? OR a.slug = ?) {public_sql}
            GROUP BY a.id
            """,
            (identifier, identifier),
        ).fetchone()
        if not row:
            return None
        images = conn.execute(
            f"""
            SELECT * FROM gallery_images
            WHERE album_id = ? {image_public_sql}
            ORDER BY sort_order ASC, created_at ASC
            """,
            (row["id"],),
        ).fetchall()
    return _to_gallery_album(row, [_to_gallery_image(image) for image in images])


def resolve_gallery_album_id(identifier: str) -> str | None:
    with get_db() as conn:
        row = conn.execute("SELECT id FROM gallery_albums WHERE id = ? OR slug = ?", (identifier, identifier)).fetchone()
    return row["id"] if row else None


def list_gallery_images_page(album_id: str, page: int = 1, page_size: int = 24, include_private: bool = False) -> dict[str, Any]:
    page = max(1, int(page))
    page_size = min(60, max(1, int(page_size)))
    public_sql = "" if include_private else "AND is_public = 1"
    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS count FROM gallery_images WHERE album_id = ? {public_sql}",
            (album_id,),
        ).fetchone()["count"]
        rows = conn.execute(
            f"""
            SELECT * FROM gallery_images
            WHERE album_id = ? {public_sql}
            ORDER BY sort_order ASC, created_at ASC
            LIMIT ? OFFSET ?
            """,
            (album_id, page_size, (page - 1) * page_size),
        ).fetchall()
    return {"items": [_to_gallery_image(row) for row in rows], "page": page, "pageSize": page_size, "pageCount": max(1, math.ceil(total / page_size)), "total": total}


def get_gallery_image(image_id: str) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM gallery_images WHERE id = ?", (image_id,)).fetchone()
    return _to_gallery_image(row) if row else None


def ensure_unique_gallery_slug(base_slug: str, current_album_id: str | None = None) -> str:
    next_slug = base_slug
    suffix = 2
    with get_db() as conn:
        while True:
            row = conn.execute("SELECT id FROM gallery_albums WHERE slug = ?", (next_slug,)).fetchone()
            if not row or row["id"] == current_album_id:
                return next_slug
            next_slug = f"{base_slug}-{suffix}"
            suffix += 1


def create_gallery_album(input_data: dict[str, Any]) -> dict[str, Any] | None:
    now = now_iso()
    title = str(input_data.get("title") or "未命名相册").strip()
    album_id = make_id("album")
    slug = ensure_unique_gallery_slug(slugify(input_data.get("slug") or title))
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO gallery_albums (id, slug, title, description, cover_image_id, is_public, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (album_id, slug, title, str(input_data.get("description") or ""), input_data.get("coverImageId"), 1 if input_data.get("isPublic", True) else 0, int(input_data.get("sortOrder") or 0), now, now),
        )
    return get_gallery_album(album_id, True)


def update_gallery_album(identifier: str, input_data: dict[str, Any]) -> dict[str, Any] | None:
    album_id = resolve_gallery_album_id(identifier)
    if not album_id:
        return None
    now = now_iso()
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM gallery_albums WHERE id = ?", (album_id,)).fetchone()
        if not existing:
            return None
        is_system = existing["id"] == SYSTEM_GALLERY_ALBUM_ID or existing["slug"] == SYSTEM_GALLERY_ALBUM_SLUG
        title = str(input_data.get("title", existing["title"])).strip() or existing["title"]
        slug = existing["slug"]
        if is_system:
            slug = SYSTEM_GALLERY_ALBUM_SLUG
            title = "系统图库"
        elif "slug" in input_data and input_data.get("slug") != existing["slug"]:
            slug = ensure_unique_gallery_slug(slugify(input_data.get("slug") or title), album_id)
        conn.execute(
            """
            UPDATE gallery_albums
            SET slug = ?, title = ?, description = ?, cover_image_id = ?, is_public = ?, sort_order = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                slug,
                title,
                input_data.get("description", existing["description"]),
                input_data.get("coverImageId", existing["cover_image_id"]),
                1 if is_system or input_data.get("isPublic", bool(existing["is_public"])) else 0,
                0 if is_system else int(input_data.get("sortOrder", existing["sort_order"])),
                now,
                album_id,
            ),
        )
    return get_gallery_album(album_id, True)


def delete_gallery_album(identifier: str) -> list[dict[str, Any]] | None:
    album_id = resolve_gallery_album_id(identifier)
    if not album_id or album_id == SYSTEM_GALLERY_ALBUM_ID:
        return None
    album = get_gallery_album(album_id, True)
    with get_db() as conn:
        result = conn.execute("DELETE FROM gallery_albums WHERE id = ?", (album_id,))
    return album["images"] if result.rowcount else None


def create_gallery_image(album_id: str, input_data: dict[str, Any]) -> dict[str, Any] | None:
    now = now_iso()
    image_id = make_id("image")
    title = str(input_data.get("title") or "未命名图片").strip()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO gallery_images (
              id, album_id, title, description, image_url, file_name, mime_type, size_bytes,
              captured_at, is_public, sort_order, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                image_id,
                album_id,
                title,
                str(input_data.get("description") or ""),
                str(input_data.get("imageUrl") or ""),
                str(input_data.get("fileName") or ""),
                str(input_data.get("mimeType") or ""),
                int(input_data.get("sizeBytes") or 0),
                input_data.get("capturedAt"),
                1 if input_data.get("isPublic", True) else 0,
                int(input_data.get("sortOrder") or 0),
                now,
                now,
            ),
        )
    return get_gallery_image(image_id)


def update_gallery_image(image_id: str, input_data: dict[str, Any]) -> dict[str, Any] | None:
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM gallery_images WHERE id = ?", (image_id,)).fetchone()
        if not existing:
            return None
        is_system = existing["album_id"] == SYSTEM_GALLERY_ALBUM_ID
        conn.execute(
            """
            UPDATE gallery_images
            SET title = ?, description = ?, captured_at = ?, is_public = ?, sort_order = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                str(input_data.get("title", existing["title"])).strip() or existing["title"],
                input_data.get("description", existing["description"]),
                input_data.get("capturedAt", existing["captured_at"]),
                1 if is_system or input_data.get("isPublic", bool(existing["is_public"])) else 0,
                int(input_data.get("sortOrder", existing["sort_order"])),
                now_iso(),
                image_id,
            ),
        )
    return get_gallery_image(image_id)


def update_gallery_image_file(image_id: str, input_data: dict[str, Any]) -> dict[str, Any] | None:
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM gallery_images WHERE id = ?", (image_id,)).fetchone()
        if not existing:
            return None
        conn.execute(
            """
            UPDATE gallery_images
            SET image_url = ?, file_name = ?, mime_type = ?, size_bytes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                str(input_data.get("imageUrl", existing["image_url"])),
                str(input_data.get("fileName", existing["file_name"])),
                str(input_data.get("mimeType", existing["mime_type"])),
                int(input_data.get("sizeBytes", existing["size_bytes"])),
                now_iso(),
                image_id,
            ),
        )
    return get_gallery_image(image_id)


def delete_gallery_image(image_id: str) -> dict[str, Any] | None:
    existing = get_gallery_image(image_id)
    if not existing or existing["albumId"] == SYSTEM_GALLERY_ALBUM_ID:
        return None
    with get_db() as conn:
        result = conn.execute("DELETE FROM gallery_images WHERE id = ?", (image_id,))
    return existing if result.rowcount else None


def find_category_id(input_data: dict[str, Any]) -> str | None:
    category_id = input_data.get("categoryId")
    with get_db() as conn:
        if category_id:
            row = conn.execute("SELECT id FROM note_sections WHERE id = ?", (category_id,)).fetchone()
            if row:
                return row["id"]
        category = input_data.get("category")
        if not category:
            return None
        row = conn.execute("SELECT id FROM note_sections WHERE name = ? OR slug = ?", (category, category)).fetchone()
        return row["id"] if row else None


def ensure_unique_slug(base_slug: str, current_article_id: str | None = None) -> str:
    next_slug = base_slug
    suffix = 2
    with get_db() as conn:
        while True:
            row = conn.execute("SELECT id FROM articles WHERE slug = ? AND deleted_at IS NULL", (next_slug,)).fetchone()
            if not row or row["id"] == current_article_id:
                return next_slug
            next_slug = f"{base_slug}-{suffix}"
            suffix += 1


def normalize_author_name(value: Any) -> str:
    return (str(value or "").strip()[:40]) or "孤舟月"


def normalize_tag_value(value: Any) -> str:
    return str(value or "").strip().removeprefix("#").strip()


def normalize_article_tags(values: Any) -> list[str]:
    if isinstance(values, (str, bytes)):
        return []
    try:
        iterator = iter(values)
    except TypeError:
        return []
    tags: list[str] = []
    for value in iterator:
        tag = normalize_tag_value(value)
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def bool_from_input(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off"}:
            return False
    return fallback


def create_article(input_data: dict[str, Any]) -> dict[str, Any] | None:
    now = now_iso()
    title = str(input_data.get("title") or "未命名文章").strip()
    article_id = make_id("article")
    slug = ensure_unique_slug(slugify(input_data.get("slug") or title))
    status = input_data.get("status") or "draft"
    published_at = input_data.get("publishedAt") or (now if status == "published" else None)
    body_markdown = input_data.get("bodyMarkdown") or "\n\n".join(input_data.get("body") or []) or ""
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO articles (
              id, slug, title, excerpt, category_id, author_name, status, published_at, created_at, updated_at,
              tone, tags_json, body_markdown, seo_title, seo_description, cover_image
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                article_id,
                slug,
                title,
                input_data.get("excerpt") or "",
                find_category_id(input_data),
                normalize_author_name(input_data.get("authorName") or input_data.get("author")),
                status,
                published_at,
                now,
                now,
                input_data.get("tone") or "ink",
                json.dumps(normalize_article_tags(input_data.get("tags") or []), ensure_ascii=False),
                body_markdown,
                input_data.get("seoTitle") or "",
                input_data.get("seoDescription") or "",
                input_data.get("coverImage") or "",
            ),
        )
    return get_article_by_slug(slug, True)


def update_article(identifier: str, input_data: dict[str, Any]) -> dict[str, Any] | None:
    article_id = resolve_article_id(identifier)
    if not article_id:
        return None
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL", (article_id,)).fetchone()
        if not existing:
            return None
        title = str(input_data.get("title", existing["title"])).strip() or existing["title"]
        slug = existing["slug"]
        if "slug" in input_data and input_data.get("slug") != existing["slug"]:
            slug = ensure_unique_slug(slugify(input_data.get("slug") or title), article_id)
        status = input_data.get("status", existing["status"])
        body_markdown = input_data.get("bodyMarkdown") or ("\n\n".join(input_data.get("body")) if isinstance(input_data.get("body"), list) else existing["body_markdown"])
        published_at = input_data.get("publishedAt") if "publishedAt" in input_data else (now_iso() if status == "published" and not existing["published_at"] else existing["published_at"])
        category_id = find_category_id(input_data) or existing["category_id"]
        conn.execute(
            """
            UPDATE articles
            SET slug = ?, title = ?, excerpt = ?, category_id = ?, author_name = ?, status = ?, published_at = ?,
                updated_at = ?, tone = ?, tags_json = ?, body_markdown = ?, seo_title = ?,
                seo_description = ?, cover_image = ?
            WHERE id = ?
            """,
            (
                slug,
                title,
                input_data.get("excerpt", existing["excerpt"]),
                category_id,
                normalize_author_name(input_data.get("authorName", input_data.get("author", existing["author_name"]))),
                status,
                published_at,
                now_iso(),
                input_data.get("tone", existing["tone"]),
                json.dumps(normalize_article_tags(input_data.get("tags", json_parse(existing["tags_json"], []))), ensure_ascii=False),
                body_markdown,
                input_data.get("seoTitle", existing["seo_title"]),
                input_data.get("seoDescription", existing["seo_description"]),
                input_data.get("coverImage", existing["cover_image"]),
                article_id,
            ),
        )
    return get_article_by_slug(slug, True)


def restore_article(identifier: str) -> dict[str, Any] | None:
    article_id = resolve_article_id(identifier, include_deleted=True)
    if not article_id:
        return None
    with get_db() as conn:
        row = conn.execute("SELECT id FROM articles WHERE (id = ? OR slug = ?) AND deleted_at IS NOT NULL", (identifier, identifier)).fetchone()
        if not row:
            return None
        conn.execute("UPDATE articles SET status = CASE WHEN status = 'archived' THEN 'draft' ELSE status END, deleted_at = NULL, updated_at = ? WHERE id = ?", (now_iso(), row["id"]))
        article = conn.execute(
            """
            SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
            FROM articles a
            LEFT JOIN note_sections ns ON ns.id = a.category_id
            WHERE a.id = ? AND a.deleted_at IS NULL
            """,
            (row["id"],),
        ).fetchone()
    return to_article(article) if article else None


def get_llm_settings(redact_api_key: bool = False) -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM llm_settings WHERE id = ?", ("default",)).fetchone()
    if not row:
        defaults = LLM_PROVIDER_DEFAULTS["deepseek"]
        return {"provider": "deepseek", "model": defaults["model"], "baseUrl": defaults["baseUrl"], "apiKey": "", "apiKeyConfigured": False, "temperature": 0.7, "enabled": True, "updatedAt": now_iso()}
    provider = row["provider"] if row["provider"] in LLM_PROVIDER_DEFAULTS else "deepseek"
    defaults = LLM_PROVIDER_DEFAULTS[provider]
    return {
        "provider": provider,
        "model": row["model"] or defaults["model"],
        "baseUrl": row["base_url"] or defaults["baseUrl"],
        "apiKey": "" if redact_api_key else row["api_key"],
        "apiKeyConfigured": bool(row["api_key"]),
        "temperature": max(0, min(2, float(row["temperature"] or 0.7))),
        "enabled": bool(row["enabled"]),
        "updatedAt": row["updated_at"],
    }


def save_llm_settings(input_data: dict[str, Any]) -> dict[str, Any]:
    existing = get_llm_settings()
    provider = input_data.get("provider", existing["provider"])
    if provider not in LLM_PROVIDER_DEFAULTS:
        provider = "deepseek"
    defaults = LLM_PROVIDER_DEFAULTS[provider]
    model = str(input_data.get("model") or (existing["model"] if existing["provider"] == provider else defaults["model"]))[:120]
    base_url = str(input_data.get("baseUrl") or (existing["baseUrl"] if existing["provider"] == provider else defaults["baseUrl"]))[:500]
    submitted_api_key = str(input_data.get("apiKey") or "").strip()
    api_key = submitted_api_key[:1000] if submitted_api_key else existing["apiKey"]
    temperature = max(0, min(2, float(input_data.get("temperature", existing["temperature"]))))
    enabled = bool_from_input(input_data.get("enabled"), bool(existing["enabled"]))
    now = now_iso()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO llm_settings (id, provider, model, base_url, api_key, temperature, max_tokens, enabled, updated_at)
            VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET provider = excluded.provider,
              model = excluded.model, base_url = excluded.base_url, api_key = excluded.api_key,
              temperature = excluded.temperature, max_tokens = excluded.max_tokens,
              enabled = excluded.enabled, updated_at = excluded.updated_at
            """,
            (provider, model, base_url, api_key, temperature, 128000, 1 if enabled else 0, now),
        )
    return get_llm_settings(redact_api_key=True)


def record_llm_token_usage(input_data: dict[str, Any]) -> None:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO llm_token_usage (
              id, feature, provider, model, prompt_tokens, completion_tokens,
              total_tokens, status, error_message, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                make_id("llm_usage"),
                str(input_data.get("feature") or "unknown")[:80],
                str(input_data.get("provider") or "custom")[:40],
                str(input_data.get("model") or "unknown")[:120],
                _optional_token_count(input_data.get("promptTokens")),
                _optional_token_count(input_data.get("completionTokens")),
                _optional_token_count(input_data.get("totalTokens")),
                "success" if input_data.get("status") == "success" else "failed",
                str(input_data.get("errorMessage") or "")[:500],
                now_iso(),
            ),
        )


def _optional_token_count(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def get_llm_token_usage_summary() -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT
              COUNT(*) AS totalCalls,
              COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS successCalls,
              COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failedCalls,
              COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
              COALESCE(SUM(completion_tokens), 0) AS completionTokens,
              COALESCE(SUM(total_tokens), 0) AS totalTokens,
              COALESCE(SUM(CASE WHEN status = 'success' AND total_tokens IS NULL THEN 1 ELSE 0 END), 0) AS unknownTokenRecords
            FROM llm_token_usage
            """
        ).fetchone()
    return {key: int(row[key] or 0) for key in ["totalCalls", "successCalls", "failedCalls", "promptTokens", "completionTokens", "totalTokens", "unknownTokenRecords"]}


def list_llm_token_usage_page(page: int = 1, page_size: int = 10) -> dict[str, Any]:
    safe_page_size = min(max(int(page_size), 1), 100)
    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) AS count FROM llm_token_usage").fetchone()["count"]
        page_count = max(1, math.ceil(total / safe_page_size))
        safe_page = min(max(1, int(page)), page_count)
        rows = conn.execute(
            """
            SELECT id, feature, provider, model, prompt_tokens, completion_tokens,
              total_tokens, status, error_message, created_at
            FROM llm_token_usage
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (safe_page_size, (safe_page - 1) * safe_page_size),
        ).fetchall()
    return {
        "items": [
        {
            "id": row["id"],
            "feature": row["feature"],
            "provider": row["provider"],
            "model": row["model"],
            "promptTokens": row["prompt_tokens"],
            "completionTokens": row["completion_tokens"],
            "totalTokens": row["total_tokens"],
            "status": "success" if row["status"] == "success" else "failed",
            "errorMessage": row["error_message"],
            "createdAt": row["created_at"],
        }
        for row in rows
        ],
        "page": safe_page,
        "pageSize": safe_page_size,
        "pageCount": page_count,
        "total": total,
    }


def get_llm_token_usage_payload(page: int = 1, page_size: int = 10) -> dict[str, Any]:
    page_payload = list_llm_token_usage_page(page, page_size)
    return {"summary": get_llm_token_usage_summary(), **page_payload}
