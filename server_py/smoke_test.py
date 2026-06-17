from __future__ import annotations

import json
import re
import sys

from fastapi.testclient import TestClient

from .app import app
from .config import config


def main() -> None:
    client = TestClient(app)

    health = client.get("/api/health")
    site = client.get("/api/site")
    articles = client.get("/api/articles")
    first_article_slug = (articles.json().get("items") or [{}])[0].get("slug", "")
    detail = client.get(f"/api/articles/{first_article_slug}")
    first_article = detail.json().get("article") or {}
    first_article_published_at = first_article.get("publishedAt") or "2026-06-15T00:00:00.000Z"
    public_gallery = client.get("/api/gallery")
    first_public_gallery_album = (public_gallery.json().get("items") or [{}])[0]
    public_gallery_images = (
        client.get(f"/api/gallery/albums/{first_public_gallery_album.get('slug') or first_public_gallery_album.get('id')}/images?page=1&pageSize=12")
        if first_public_gallery_album
        else None
    )
    admin_gallery_anonymous = client.get("/api/admin/gallery")
    admin_commands_anonymous = client.get("/api/admin/commands")
    admin_token_usage_anonymous = client.get("/api/admin/llm-token-usage")

    login = client.post("/api/admin/login", json={"password": config.admin_password})
    csrf_token = client.cookies.get(config.csrf_cookie_name, "")
    write_headers = {"x-csrf-token": csrf_token}

    admin = client.get("/api/admin/content")
    first_admin_article = (admin.json().get("posts") or [{}])[0]
    first_admin_article_id = first_admin_article.get("id", "")
    first_admin_article_title = first_admin_article.get("title", "")
    admin_gallery = client.get("/api/admin/gallery")
    admin_ops = client.get("/api/admin/ops")
    admin_command_guide = client.get("/api/admin/commands")
    admin_command_parse = client.post(
        "/api/admin/commands/parse",
        json={"input": f"article:set-date {first_article_slug} --date={first_article_published_at}"},
        headers=write_headers,
    )
    admin_command_run = client.post(
        "/api/admin/commands/run",
        json={"input": f"article:set-date {first_article_slug} --date={first_article_published_at}"},
        headers=write_headers,
    )
    admin_command_list_ids = client.post("/api/admin/commands/run", json={"input": "article:list-ids"}, headers=write_headers)
    admin_command_get_content = client.post("/api/admin/commands/run", json={"input": f"article:get-content {first_admin_article_id}"}, headers=write_headers)
    admin_command_set_title = client.post(
        "/api/admin/commands/run",
        json={"input": f'article:set-title {first_admin_article_id} --title="{first_admin_article_title}"'},
        headers=write_headers,
    )

    existing_llm_config = client.get("/api/admin/llm-config")
    existing_llm_config_payload = existing_llm_config.json()
    admin_token_usage_before = client.get("/api/admin/llm-token-usage")
    client.put("/api/admin/llm-config", json={**existing_llm_config_payload, "enabled": False}, headers=write_headers)
    ai_agent_disabled = client.post(
        "/api/admin/ai-agent/article-metadata",
        json={
            "title": first_admin_article_title,
            "excerpt": first_admin_article.get("excerpt", ""),
            "category": first_admin_article.get("category", ""),
            "tags": first_admin_article.get("tags", []),
            "bodyMarkdown": first_admin_article.get("bodyMarkdown", "这是一段用于触发 AI 元数据生成的文章正文内容，需要足够长。"),
        },
        headers=write_headers,
    )
    client.put("/api/admin/llm-config", json=existing_llm_config_payload, headers=write_headers)
    admin_token_usage = client.get("/api/admin/llm-token-usage")

    hidden_album = client.post(
        "/api/admin/gallery/albums",
        json={"slug": "hidden-smoke-gallery", "title": "隐藏测试相册", "description": "只会出现在管理员图库。", "isPublic": False},
        headers=write_headers,
    )
    malformed_note_sections = client.put("/api/admin/note-sections", json="bad payload", headers=write_headers)
    malformed_featured_series = client.put("/api/admin/featured-series", json="bad payload", headers=write_headers)
    invalid_upload = client.post(
        "/api/admin/gallery/albums/moonlight/images",
        files={"image": ("note.txt", b"not an image", "text/plain")},
        headers=write_headers,
    )
    malformed_sort_order_upload = client.post(
        "/api/admin/gallery/albums/moonlight/images",
        data={"sortOrder": "not-a-number"},
        files={"image": ("note.png", b"not an image", "image/png")},
        headers=write_headers,
    )
    spoofed_image_upload = client.post(
        "/api/admin/gallery/albums/moonlight/images",
        files={"image": ("note.png", b"not an image", "image/png")},
        headers=write_headers,
    )
    system_album_delete = client.delete("/api/admin/gallery/albums/album-moonlight", headers=write_headers)
    system_image_delete = client.delete("/api/admin/gallery/images/image-guzhouyue-avatar", headers=write_headers)
    if hidden_album.status_code == 201:
        client.delete("/api/admin/gallery/albums/hidden-smoke-gallery", headers=write_headers)
    admin_audit = client.get("/api/admin/audit")
    rss = client.get("/rss.xml")
    sitemap = client.get("/sitemap.xml")

    result = {
        "health": health.status_code,
        "site": site.status_code,
        "articles": articles.status_code,
        "detail": detail.status_code,
        "publicGallery": public_gallery.status_code,
        "publicGalleryImages": public_gallery_images.status_code if public_gallery_images else 200,
        "publicGalleryImagePageSize": (public_gallery_images.json().get("pageSize") if public_gallery_images else 0),
        "adminGalleryAnonymous": admin_gallery_anonymous.status_code,
        "login": login.status_code,
        "admin": admin.status_code,
        "adminGallery": admin_gallery.status_code,
        "adminOps": admin_ops.status_code,
        "adminCommandsAnonymous": admin_commands_anonymous.status_code,
        "adminCommandGuide": admin_command_guide.status_code,
        "adminCommandRegistryCount": len(admin_command_guide.json().get("commands", [])),
        "adminCommandParseOk": admin_command_parse.json().get("ok"),
        "adminCommandRunStatus": admin_command_run.json().get("status"),
        "adminCommandListIdsStatus": admin_command_list_ids.json().get("status"),
        "adminCommandListIdsCount": (admin_command_list_ids.json().get("result") or {}).get("count"),
        "adminCommandGetContentStatus": admin_command_get_content.json().get("status"),
        "adminCommandSetTitleStatus": admin_command_set_title.json().get("status"),
        "aiAgentDisabled": ai_agent_disabled.status_code,
        "adminTokenUsageAnonymous": admin_token_usage_anonymous.status_code,
        "adminTokenUsageBefore": admin_token_usage_before.status_code,
        "adminTokenUsage": admin_token_usage.status_code,
        "tokenUsageCallsBefore": (admin_token_usage_before.json().get("summary") or {}).get("totalCalls", 0),
        "tokenUsageCallsAfter": (admin_token_usage.json().get("summary") or {}).get("totalCalls", 0),
        "opsTokenUsageTotal": (admin_ops.json().get("llmTokenUsage") or {}).get("totalTokens"),
        "hiddenAlbum": hidden_album.status_code,
        "malformedNoteSections": malformed_note_sections.status_code,
        "malformedFeaturedSeries": malformed_featured_series.status_code,
        "invalidUpload": invalid_upload.status_code,
        "malformedSortOrderUpload": malformed_sort_order_upload.status_code,
        "spoofedImageUpload": spoofed_image_upload.status_code,
        "systemAlbumDelete": system_album_delete.status_code,
        "systemImageDelete": system_image_delete.status_code,
        "securityHeaders": {
            "xContentTypeOptions": health.headers.get("x-content-type-options"),
            "xFrameOptions": health.headers.get("x-frame-options"),
        },
        "rssUsesPostsRoute": "/posts/" in rss.text and "/articles/" not in rss.text,
        "rssHasRfc822PubDate": bool(re.search(r"<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT</pubDate>", rss.text)),
        "sitemapUsesPostsRoute": "/posts/" in sitemap.text and "/articles/" not in sitemap.text,
        "auditEntries": len(admin_audit.json().get("items", [])),
        "databaseOk": (admin_ops.json().get("database") or {}).get("ok"),
        "articleTotal": articles.json().get("total"),
        "detailSlug": first_article_slug,
        "adminPosts": len(admin.json().get("posts", [])),
        "adminGalleryTotal": len(admin_gallery.json().get("items", [])),
    }

    expectations = [
        ("health endpoint is available", result["health"] == 200),
        ("anonymous admin gallery is rejected", result["adminGalleryAnonymous"] == 401),
        ("anonymous admin commands are rejected", result["adminCommandsAnonymous"] == 401),
        ("login succeeds with configured password", result["login"] == 200),
        ("admin content is available after login", result["admin"] == 200),
        ("CSRF-protected admin command executes with token", result["adminCommandRunStatus"] == "executed"),
        ("AI agent rejects disabled config without external request", result["aiAgentDisabled"] == 503),
        ("anonymous token usage is rejected", result["adminTokenUsageAnonymous"] == 401),
        ("admin token usage is available after login", result["adminTokenUsage"] == 200),
        ("admin ops includes token usage summary", isinstance(result["opsTokenUsageTotal"], int)),
        ("malformed note sections payload does not crash", result["malformedNoteSections"] < 500),
        ("malformed featured series payload does not crash", result["malformedFeaturedSeries"] < 500),
        ("plain text upload is rejected", result["invalidUpload"] == 400),
        ("malformed gallery sortOrder is rejected", result["malformedSortOrderUpload"] == 400),
        ("spoofed image MIME upload is rejected", result["spoofedImageUpload"] == 400),
        ("system gallery album cannot be deleted", result["systemAlbumDelete"] == 400),
        ("system gallery image cannot be deleted", result["systemImageDelete"] == 400),
        ("RSS uses public posts route", result["rssUsesPostsRoute"]),
        ("RSS pubDate uses RFC 822 date format", result["rssHasRfc822PubDate"]),
        ("sitemap uses public posts route", result["sitemapUsesPostsRoute"]),
        ("database quick check passes", result["databaseOk"] is True),
        ("security header x-content-type-options is set", result["securityHeaders"]["xContentTypeOptions"] == "nosniff"),
        ("security header x-frame-options is set", result["securityHeaders"]["xFrameOptions"] == "DENY"),
    ]
    failures = [name for name, passed in expectations if not passed]
    if failures:
        print("Smoke test failed:\n- " + "\n- ".join(failures), file=sys.stderr)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
