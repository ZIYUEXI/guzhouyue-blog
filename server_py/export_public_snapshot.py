from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .almanac import get_today_almanac
from .config import ROOT_DIR, config
from .content import (
    SYSTEM_GALLERY_ALBUM_ID,
    SYSTEM_GALLERY_ALBUM_SLUG,
    get_gallery_album,
    get_site_payload,
    list_articles,
    list_gallery_albums,
)
from .db import get_db, now_iso
from .starfield import get_public_starfield


DATA_DIR = ROOT_DIR / "public" / "data"
PUBLIC_GALLERY_DIR = ROOT_DIR / "public" / "uploads" / "gallery"
API_GALLERY_PREFIX = "/api/uploads/gallery/"
STATIC_GALLERY_PREFIX = "/uploads/gallery/"


def rewrite_public_urls(value: Any) -> Any:
    if isinstance(value, str):
        return value.replace(API_GALLERY_PREFIX, STATIC_GALLERY_PREFIX)
    if isinstance(value, list):
        return [rewrite_public_urls(item) for item in value]
    if isinstance(value, dict):
        return {key: rewrite_public_urls(item) for key, item in value.items()}
    return value


def write_json(file_name: str, payload: Any) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = DATA_DIR / file_name
    target.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return target


def read_almanac() -> dict[str, Any] | None:
    try:
        return get_today_almanac()
    except Exception:
        return None


def export_gallery() -> dict[str, Any]:
    albums: list[dict[str, Any]] = []
    for summary in list_gallery_albums():
        if summary["id"] == SYSTEM_GALLERY_ALBUM_ID or summary["slug"] == SYSTEM_GALLERY_ALBUM_SLUG:
            continue
        album = get_gallery_album(summary["id"], False)
        if album:
            albums.append(album)
    return {"items": albums}


def export_comments() -> dict[str, Any]:
    result: dict[str, list[dict[str, Any]]] = {}
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
              a.slug AS article_slug,
              c.id,
              c.author_name AS authorName,
              c.content,
              c.created_at AS createdAt,
              c.updated_at AS updatedAt
            FROM comments c
            JOIN articles a ON a.id = c.article_id
            WHERE c.status = 'approved'
              AND a.status = 'published'
              AND a.deleted_at IS NULL
            ORDER BY c.created_at ASC
            """
        ).fetchall()

    for row in rows:
        slug = row["article_slug"]
        result.setdefault(slug, []).append(
            {
                "id": row["id"],
                "authorName": row["authorName"],
                "content": row["content"],
                "createdAt": row["createdAt"],
                "updatedAt": row["updatedAt"],
            }
        )
    return {"articles": result}


def copy_gallery_uploads() -> int:
    if PUBLIC_GALLERY_DIR.exists():
        shutil.rmtree(PUBLIC_GALLERY_DIR)
    PUBLIC_GALLERY_DIR.mkdir(parents=True, exist_ok=True)

    if not config.gallery_upload_dir.exists():
        return 0

    copied = 0
    for source in config.gallery_upload_dir.iterdir():
        if not source.is_file():
            continue
        shutil.copy2(source, PUBLIC_GALLERY_DIR / source.name)
        copied += 1
    return copied


def main() -> None:
    if not config.database_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {config.database_path}")

    generated_at = now_iso()
    site = get_site_payload(read_almanac())
    articles = list_articles({"page": 1, "pageSize": 1000})
    gallery = export_gallery()
    starfield = get_public_starfield()
    comments = export_comments()

    outputs = [
        write_json("site.json", rewrite_public_urls(site)),
        write_json("articles.json", rewrite_public_urls(articles)),
        write_json("gallery.json", rewrite_public_urls(gallery)),
        write_json("starfield.json", rewrite_public_urls(starfield)),
        write_json("comments.json", rewrite_public_urls(comments)),
        write_json("snapshot-meta.json", {"generatedAt": generated_at}),
    ]
    copied = copy_gallery_uploads()

    print(f"Database: {config.database_path}")
    for output in outputs:
        print(f"Wrote: {output.relative_to(ROOT_DIR)}")
    print(f"Copied gallery files: {copied}")
    print("Public snapshot export complete.")


if __name__ == "__main__":
    main()
