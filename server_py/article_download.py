from __future__ import annotations

import re
import tempfile
import zipfile
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .config import ROOT_DIR, config


MARKDOWN_IMAGE_RE = re.compile(
    r"(?P<prefix>!\[[^\]]*\]\()(?P<target><[^>]+>|[^\s)]+)(?P<suffix>[^)]*\))",
)
HTML_IMAGE_RE = re.compile(
    r"(?P<prefix><img\b[^>]*?\bsrc=[\"'])(?P<target>[^\"']+)(?P<suffix>[\"'])",
    flags=re.IGNORECASE,
)
IMAGE_SUFFIXES = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}


def create_article_archive(article: dict[str, object]) -> tuple[Path, int]:
    markdown = str(article.get("bodyMarkdown") or "")
    rewritten_markdown, assets = _rewrite_image_references(markdown)
    metadata = _article_markdown_header(article)
    archive_fd, archive_name = tempfile.mkstemp(prefix="guzhouyue-article-", suffix=".zip")
    os.close(archive_fd)
    Path(archive_name).unlink(missing_ok=True)
    archive_path = Path(archive_name)

    try:
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("article.md", f"{metadata}\n{rewritten_markdown.strip()}\n".encode("utf-8"))
            for archive_name_in_zip, source_path in assets.values():
                archive.write(source_path, archive_name_in_zip)
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise
    return archive_path, len(assets)


def _article_markdown_header(article: dict[str, object]) -> str:
    title = _header_value(article.get("title")) or "未命名文章"
    lines = [f"# {title}", ""]
    for label, key in (("分类", "category"), ("日期", "date"), ("作者", "authorName")):
        value = _header_value(article.get(key))
        if value:
            lines.append(f"> {label}：{value}")
    tags = article.get("tags")
    if isinstance(tags, list):
        tag_values = [str(tag).strip() for tag in tags if str(tag).strip()]
        if tag_values:
            lines.append(f"> 标签：{'、'.join(tag_values)}")
    return "\n".join(lines)


def _header_value(value: object) -> str:
    return str(value or "").strip().replace("\n", " ")


def _rewrite_image_references(markdown: str) -> tuple[str, dict[str, tuple[str, Path]]]:
    assets: dict[str, tuple[str, Path]] = {}

    def replace(match: re.Match[str]) -> str:
        target = match.group("target")
        raw_target = target[1:-1] if target.startswith("<") and target.endswith(">") else target
        source_path = _resolve_local_image(raw_target)
        if source_path is None:
            return match.group(0)
        archive_name = assets.get(raw_target, ("", source_path))[0] or _archive_name_for(source_path, assets)
        assets.setdefault(raw_target, (archive_name, source_path))
        replacement = f"images/{Path(archive_name).name}"
        return f"{match.group('prefix')}{replacement}{match.group('suffix')}"

    rewritten = MARKDOWN_IMAGE_RE.sub(replace, markdown)

    def replace_html(match: re.Match[str]) -> str:
        target = match.group("target")
        source_path = _resolve_local_image(target)
        if source_path is None:
            return match.group(0)
        archive_name = assets.get(target, ("", source_path))[0] or _archive_name_for(source_path, assets)
        assets.setdefault(target, (archive_name, source_path))
        return f"{match.group('prefix')}images/{Path(archive_name).name}{match.group('suffix')}"

    return HTML_IMAGE_RE.sub(replace_html, rewritten), assets


def _resolve_local_image(image_url: str) -> Path | None:
    parsed = urlsplit(image_url)
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path)
    if not path or Path(path).suffix.lower() not in IMAGE_SUFFIXES:
        return None

    normalized = path.lstrip("/")
    if normalized.startswith("api/uploads/gallery/") or normalized.startswith("uploads/gallery/"):
        relative_name = normalized.removeprefix("api/uploads/gallery/").removeprefix("uploads/gallery/")
        if Path(relative_name).name != relative_name:
            return None
        runtime_upload = _existing_path(config.gallery_upload_dir / relative_name, config.gallery_upload_dir)
        if runtime_upload is not None:
            return runtime_upload
        static_gallery_dir = ROOT_DIR / "public" / "uploads" / "gallery"
        return _existing_path(static_gallery_dir / relative_name, static_gallery_dir)
    if normalized.startswith("upload/") or normalized.startswith("images/"):
        return _existing_path(ROOT_DIR / "public" / normalized, ROOT_DIR / "public")
    return None


def _existing_path(candidate: Path, root: Path) -> Path | None:
    try:
        resolved_candidate = candidate.resolve()
        resolved_root = root.resolve()
        if resolved_candidate != resolved_root and resolved_root not in resolved_candidate.parents:
            return None
    except OSError:
        return None
    return resolved_candidate if resolved_candidate.is_file() else None


def _archive_name_for(source_path: Path, assets: dict[str, tuple[str, Path]]) -> str:
    used_names = {archive_name for archive_name, _ in assets.values()}
    base_name = source_path.name
    candidate = base_name
    index = 2
    while f"images/{candidate}" in used_names:
        candidate = f"{source_path.stem}-{index}{source_path.suffix}"
        index += 1
    return f"images/{candidate}"
