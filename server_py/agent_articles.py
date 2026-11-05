"""面向外部工具的草稿契约；支持作者署名，发布仍需后台审核。"""
from __future__ import annotations

import json
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .content import (
    create_article, find_category_id, get_article_by_slug, get_site_settings,
    normalize_article_tags, resolve_article_id, to_article,
)
from .db import get_db, now_iso


class ArticleFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=300)
    authorName: str | None = Field(default=None, max_length=40)
    excerpt: str | None = Field(default=None, max_length=5000)
    bodyMarkdown: str | None = Field(default=None, max_length=1000000)
    category: str | None = Field(default=None, max_length=100)
    categoryId: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = Field(default=None, max_length=100)
    coverImage: str | None = Field(default=None, max_length=2000)
    seoTitle: str | None = Field(default=None, max_length=300)
    seoDescription: str | None = Field(default=None, max_length=5000)
    status: Literal["draft"] = "draft"


class NewArticle(ArticleFields):
    title: str = Field(min_length=1, max_length=300)
    slug: str | None = Field(default=None, max_length=300)


class EditArticle(ArticleFields):
    # 模型必须先读最新版本，避免把人工在后台的修改覆盖掉。
    expectedUpdatedAt: str = Field(min_length=1)


def read_article(identifier: str) -> dict:
    article_id = resolve_article_id(identifier)
    with get_db() as conn:
        row = conn.execute("SELECT slug FROM articles WHERE id = ? AND deleted_at IS NULL", (article_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Article not found")
    return get_article_by_slug(row["slug"], True)


def resolve_author_name(value: str | None) -> str:
    # 空署名使用当前站长名称，自定义署名沿用文章作者的 40 字限制。
    return (value or "").strip() or get_site_settings()["ownerName"]


def new_article(payload: NewArticle) -> dict:
    data = payload.model_dump(exclude_none=True)
    if not data["title"].strip():
        raise HTTPException(422, "Title must not be blank")
    data.update(status="draft", publishedAt=None, authorName=resolve_author_name(payload.authorName))
    return create_article(data)


def edit_article(identifier: str, payload: EditArticle) -> dict:
    existing = read_article(identifier)
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    data.pop("expectedUpdatedAt", None)
    data.pop("status", None)
    if "title" in data and not data["title"].strip():
        raise HTTPException(422, "Title must not be blank")
    columns = {
        "title": "title", "excerpt": "excerpt", "bodyMarkdown": "body_markdown",
        "coverImage": "cover_image", "seoTitle": "seo_title", "seoDescription": "seo_description",
    }
    values = {columns[key]: value for key, value in data.items() if key in columns}
    if "tags" in data:
        values["tags_json"] = json.dumps(normalize_article_tags(data["tags"]), ensure_ascii=False)
    if "category" in data or "categoryId" in data:
        values["category_id"] = find_category_id(data)
    # 未提交作者时保留原署名；显式传空字符串或 null 才恢复站长署名。
    if "authorName" in payload.model_fields_set:
        values["author_name"] = resolve_author_name(payload.authorName)
    values["updated_at"] = now_iso()
    # 状态与版本在同一条 SQL 中校验，人工发布后外部工具不能再覆盖文章。
    with get_db() as conn:
        result = conn.execute(
            f"UPDATE articles SET {', '.join(column + ' = ?' for column in values)} "
            "WHERE id = ? AND status = 'draft' AND deleted_at IS NULL AND updated_at = ?",
            [*values.values(), existing["id"], payload.expectedUpdatedAt],
        )
        if result.rowcount != 1:
            raise HTTPException(409, "Only current drafts can be edited; read the article again or copy it to a new draft")
    return read_article(existing["id"])


def article_page(page: int, page_size: int, query: str, status: str | None) -> dict:
    where = "a.deleted_at IS NULL"
    params: list = []
    if status:
        where += " AND a.status = ?"
        params.append(status)
    if query:
        where += " AND (a.title LIKE ? OR a.body_markdown LIKE ?)"
        params.extend([f"%{query}%", f"%{query}%"])
    with get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM articles a WHERE {where}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT a.*, ns.name AS category_name, ns.slug AS category_slug FROM articles a "
            f"LEFT JOIN note_sections ns ON ns.id = a.category_id WHERE {where} "
            "ORDER BY a.updated_at DESC LIMIT ? OFFSET ?", [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    return {"items": [to_article(row) for row in rows], "total": total, "page": page, "pageSize": page_size}
