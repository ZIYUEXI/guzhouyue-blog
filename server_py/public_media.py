"""生成公开站展示尺寸，原始上传文件继续用于后台与文章下载。"""
from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from PIL import Image, ImageOps


def optimize_public_media(root: Path, site: dict[str, Any], system_album: dict[str, Any] | None = None) -> dict[str, Any]:
    public = root / "public"
    output = public / "media"
    output.mkdir(parents=True, exist_ok=True)

    def source_file(url: str) -> Path | None:
        parsed = urlsplit(url)
        if parsed.netloc or parsed.scheme:
            return None
        path = unquote(parsed.path).replace("/api/uploads/gallery/", "/uploads/gallery/")
        candidate = (public / path.lstrip("/")).resolve()
        if public.resolve() not in candidate.parents or not candidate.is_file():
            return None
        return candidate

    def webp(url: str, width: int, square: bool = False) -> dict[str, Any] | None:
        source = source_file(url)
        if not source:
            return None
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
            if square:
                image = ImageOps.fit(image, (width, width), method=Image.Resampling.LANCZOS)
            else:
                image.thumbnail((width, width * 4), Image.Resampling.LANCZOS)
            buffer = BytesIO()
            image.save(buffer, format="WEBP", quality=85, method=6)
            data = buffer.getvalue()
            digest = hashlib.sha256(data).hexdigest()[:20]
            target = output / f"{digest}-{image.width}.webp"
            if not target.exists():
                target.write_bytes(data)
            return {"src": f"/media/{target.name}", "width": image.width, "height": image.height}

    settings = site.get("settings") or {}
    images = {item["id"]: item["imageUrl"] for item in (system_album or {}).get("images", [])}
    avatar_url = settings.get("ownerAvatarUrl") or "/images/guzhouyue-avatar.png"
    if avatar_url == "/images/guzhouyue-avatar.png":
        avatar_url = images.get("image-guzhouyue-avatar", avatar_url)
    style = settings.get("stylePreset", "classic")
    hero_url = images.get("image-guzhouyue-cyber" if style == "cyber" else "image-guzhouyue-hero")
    hero_url = hero_url or f"/images/guzhouyue-hero{'-cyber' if style == 'cyber' else ''}.png"
    hero = webp(hero_url, 1920)
    mobile = webp(hero_url, 768)
    avatar = webp(avatar_url, 160, True)
    media: dict[str, Any] = {}
    if hero and mobile:
        media["hero"] = {**hero, "srcSet": f"{mobile['src']} {mobile['width']}w, {hero['src']} {hero['width']}w"}
    if avatar:
        media["avatar"] = avatar["src"]
    return media
