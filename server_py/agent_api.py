"""注册独立的草稿 API 和仅站长可访问的密钥管理入口。"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from .agent_articles import EditArticle, NewArticle, article_page, edit_article, new_article, read_article
from .agent_auth import agent_middleware, create_key, ensure_agent_schema, require_agent
from .agent_images import image_result, owned_image, upload_image
from .config import config
from .content import get_gallery_album, list_gallery_albums, list_note_sections, update_gallery_image
from .db import get_db, now_iso


class KeyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)


class ImageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=5000)


def register_agent_api(app, require_admin, validate_image) -> None:
    ensure_agent_schema()
    app.middleware("http")(agent_middleware)
    admin = APIRouter(prefix="/api/admin/agent-keys", dependencies=[Depends(require_admin)])
    agent = APIRouter(prefix="/api/agent/v1", dependencies=[Depends(require_agent)])

    @admin.get("")
    async def keys():
        with get_db() as conn:
            items = conn.execute("SELECT id, name, prefix, created_at, revoked_at, last_used_at FROM agent_keys ORDER BY created_at DESC").fetchall()
        return {"items": [dict(row) for row in items]}

    @admin.post("", status_code=201)
    async def issue_key(payload: KeyInput):
        if not payload.name.strip():
            raise HTTPException(422, "Key name must not be blank")
        return create_key(payload.name.strip())

    @admin.post("/{key_id}/revoke")
    async def revoke_key(key_id: str):
        with get_db() as conn:
            result = conn.execute("UPDATE agent_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?", (now_iso(), key_id))
            if not result.rowcount:
                raise HTTPException(404, "Key not found")
        return {"ok": True}

    @admin.get("/audit")
    async def audit():
        with get_db() as conn:
            rows = conn.execute(
                "SELECT a.*, k.name FROM agent_audit a LEFT JOIN agent_keys k ON k.id = a.key_id ORDER BY a.id DESC LIMIT 100",
            ).fetchall()
        return {"items": [dict(row) for row in rows]}

    @agent.get("/capabilities")
    async def capabilities():
        return {"version": 1, "draftOnly": True, "author": "optional authorName; blank defaults to site owner; omitted on edit preserves author",
                "editableFields": list(EditArticle.model_fields), "maxImageBytes": config.max_gallery_image_bytes,
                "categories": list_note_sections(),
                "instructions": "Read before editing; send expectedUpdatedAt. Published articles must be copied to a draft. Upload a new image and update draft Markdown to correct a picture. Publishing is only available in the admin UI."}

    @agent.get("/articles")
    async def articles(page: int = Query(1, ge=1), pageSize: int = Query(20, ge=1, le=100),
                       q: str = Query("", max_length=300), status: Literal["draft", "published", "archived"] | None = None):
        return article_page(page, pageSize, q, status)

    @agent.post("/articles", status_code=201)
    async def create(payload: NewArticle):
        return new_article(payload)

    @agent.get("/articles/{identifier}")
    async def read(identifier: str):
        return read_article(identifier)

    @agent.patch("/articles/{identifier}")
    async def edit(identifier: str, payload: EditArticle):
        return edit_article(identifier, payload)

    @agent.post("/articles/{identifier}/copy", status_code=201)
    async def copy(identifier: str):
        source = read_article(identifier)
        fields = {key: source[key] for key in NewArticle.model_fields if key in source and key not in {"status", "slug"}}
        fields["title"] = source["title"] + "（修订草稿）"
        return new_article(NewArticle(**fields))

    @agent.get("/gallery")
    async def gallery(key_id: str = Depends(require_agent)):
        # 公开图库可复用，同时提供当前密钥上传的私有配图。
        albums = [get_gallery_album(album["id"], False) for album in list_gallery_albums()
                  if album["slug"] != "system"]
        with get_db() as conn:
            own = conn.execute("SELECT image_id FROM agent_images WHERE key_id = ?", (key_id,)).fetchall()
        return {"albums": albums, "uploads": [image_result(owned_image(row["image_id"], key_id)) for row in own
                                               if _image_exists(row["image_id"])]}

    @agent.post("/images", status_code=201)
    async def upload(image: UploadFile = File(...), title: str = Form("", max_length=300),
                     description: str = Form("", max_length=5000), key_id: str = Depends(require_agent)):
        return await upload_image(image, title, description, key_id, validate_image)

    @agent.patch("/images/{image_id}")
    async def edit_image(image_id: str, payload: ImageInput, key_id: str = Depends(require_agent)):
        owned_image(image_id, key_id)
        return image_result(update_gallery_image(image_id, payload.model_dump()))

    @agent.get("/images/{image_id}/file")
    async def image_file(image_id: str, key_id: str = Depends(require_agent)):
        image = owned_image(image_id, key_id)
        path = config.gallery_upload_dir / image["fileName"]
        if not path.is_file():
            raise HTTPException(404, "Image file not found")
        return FileResponse(path, media_type=image["mimeType"])

    app.include_router(admin)
    app.include_router(agent)


def _image_exists(image_id: str) -> bool:
    with get_db() as conn:
        return conn.execute("SELECT 1 FROM gallery_images WHERE id = ?", (image_id,)).fetchone() is not None
