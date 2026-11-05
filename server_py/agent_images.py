"""外部工具上传的配图放入私有相册，返回可直接写入正文的地址。"""
from __future__ import annotations

import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import config
from .content import create_gallery_album, create_gallery_image, get_gallery_album, get_gallery_image
from .db import get_db, now_iso


MIME_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


def owned_image(image_id: str, key_id: str) -> dict:
    with get_db() as conn:
        owned = conn.execute("SELECT image_id FROM agent_images WHERE image_id = ? AND key_id = ?", (image_id, key_id)).fetchone()
    image = get_gallery_image(image_id) if owned else None
    if not image:
        raise HTTPException(404, "Uploaded image not found for this key")
    return image


def image_result(image: dict) -> dict:
    alt = image["title"].replace("[", "").replace("]", "").replace("\n", " ").replace("\r", " ")
    return {**image, "markdown": f"![{alt}]({image['imageUrl']})",
            "previewPath": f"/api/agent/v1/images/{image['id']}/file"}


async def upload_image(image: UploadFile, title: str, description: str, key_id: str, validate) -> dict:
    extension = MIME_EXTENSIONS.get(image.content_type or "")
    if not extension:
        raise HTTPException(400, "Unsupported image type; use JPEG, PNG, WebP or GIF")
    buffer = await validate(image, extension)
    # 每把密钥一个私有相册，避免尚未审核的图片进入公开图库。
    slug = f"agent-{key_id}"
    album = get_gallery_album(slug, True)
    if not album:
        album = create_gallery_album({"title": "工具配图 " + key_id[:8], "slug": slug, "isPublic": False})
    file_name = f"agent-{secrets.token_hex(20)}.{extension}"
    config.gallery_upload_dir.mkdir(parents=True, exist_ok=True)
    target = config.gallery_upload_dir / file_name
    target.write_bytes(buffer)
    try:
        created = create_gallery_image(album["id"], {
            "title": title.strip() or Path(image.filename or "图片").stem[:300],
            "description": description, "isPublic": False, "imageUrl": f"/api/uploads/gallery/{file_name}",
            "fileName": file_name, "mimeType": image.content_type, "sizeBytes": len(buffer),
        })
        with get_db() as conn:
            conn.execute("INSERT INTO agent_images VALUES (?, ?, ?)", (created["id"], key_id, now_iso()))
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return image_result(created)


def published_agent_files() -> set[str]:
    # 只有审核发布的正文、封面、站点配置或公开图库引用的工具图片才随快照导出。
    with get_db() as conn:
        articles = conn.execute(
            "SELECT body_markdown, cover_image FROM articles WHERE status = 'published' AND deleted_at IS NULL",
        ).fetchall()
        settings = conn.execute("SELECT owner_avatar_url FROM site_settings").fetchall()
        homepage = conn.execute("SELECT payload_json FROM homepage_copy").fetchall()
        files = conn.execute("SELECT file_name FROM gallery_images WHERE file_name LIKE 'agent-%'").fetchall()
        public_images = conn.execute(
            "SELECT i.file_name FROM gallery_images i JOIN gallery_albums a ON a.id = i.album_id "
            "WHERE i.is_public = 1 AND a.is_public = 1",
        ).fetchall()
    text = "\n".join(str(value or "") for row in [*articles, *settings, *homepage] for value in row)
    return {row["file_name"] for row in files if row["file_name"] in text} | {row["file_name"] for row in public_images}
