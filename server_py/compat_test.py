from __future__ import annotations

import json
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="guzhouyue-compat-") as temp_dir:
        temp_path = Path(temp_dir)
        os.environ["DATABASE_PATH"] = str(temp_path / "blog.sqlite")
        os.environ["GALLERY_UPLOAD_DIR"] = str(temp_path / "gallery")
        os.environ["SITE_URL"] = "http://127.0.0.1:4174"
        os.environ["ADMIN_PASSWORD"] = "compat-admin"

        from fastapi.testclient import TestClient

        from .app import app
        from .config import config
        from .seed import seed
        from .seed_test_articles import seed_test_articles

        seed()
        seed_test_articles()

        client = TestClient(app)
        checks: list[tuple[str, bool, Any]] = []

        def check(name: str, passed: bool, detail: Any = None) -> None:
            checks.append((name, passed, detail))

        health = client.get("/api/health")
        site = client.get("/api/site")
        articles = client.get("/api/articles?page=1&pageSize=5")
        article_items = articles.json().get("items", [])
        first_slug = article_items[0]["slug"]
        detail = client.get(f"/api/articles/{first_slug}")
        archive = client.get("/api/archive")
        search = client.get("/api/search?q=SearchNeedleAlpha&page=1&pageSize=10")
        category = client.get("/api/articles?category=功能测试&page=1&pageSize=20")
        tag = client.get("/api/articles?tag=SearchNeedleAlpha&page=1&pageSize=20")
        missing_article = client.get("/api/articles/not-found-slug")
        comments = client.get("/api/articles/test-markdown-kitchen-sink/comments")
        invalid_comment = client.post("/api/articles/test-markdown-kitchen-sink/comments", json={"authorName": "", "content": ""})
        pending_comment = client.post("/api/articles/test-markdown-kitchen-sink/comments", json={"authorName": "新读者", "content": "新评论"}, headers={})
        gallery = client.get("/api/gallery")
        gallery_items = gallery.json().get("items", [])
        gallery_images = client.get(f"/api/gallery/albums/{gallery_items[0]['slug']}/images?page=1&pageSize=2") if gallery_items else None
        system_gallery_images = client.get("/api/gallery/albums/system/images")
        bad_upload_name = client.get("/api/uploads/gallery/../bad.png")
        rss = client.get("/rss.xml")
        sitemap = client.get("/sitemap.xml")
        robots = client.get("/robots.txt")

        check("health endpoint returns ok", health.status_code == 200 and health.json().get("ok") is True, health.text)
        check("site payload has old public keys", site.status_code == 200 and all(key in site.json() for key in ["settings", "homepage", "noteSections", "featuredSeries", "almanac"]), site.text)
        check("articles payload paginates like old backend", articles.status_code == 200 and all(key in articles.json() for key in ["items", "page", "pageSize", "pageCount", "total"]) and len(article_items) <= 5, articles.text)
        check("article detail has neighbors and commentCount", detail.status_code == 200 and all(key in detail.json() for key in ["article", "previousPost", "nextPost", "commentCount"]), detail.text)
        check("archive groups by month", archive.status_code == 200 and isinstance(archive.json().get("months"), list), archive.text)
        check("search matches body/tag content", search.status_code == 200 and search.json().get("total", 0) >= 1, search.text)
        check("category filter returns matching category", category.status_code == 200 and all(item.get("category") == "功能测试" for item in category.json().get("items", [])), category.text)
        check("tag filter returns matching tag", tag.status_code == 200 and tag.json().get("total", 0) >= 1, tag.text)
        check("missing article is 404 JSON error", missing_article.status_code == 404 and "error" in missing_article.json(), missing_article.text)
        check("comments only returns approved comments", comments.status_code == 200 and len(comments.json().get("items", [])) >= 1, comments.text)
        check("invalid public comment is rejected", invalid_comment.status_code == 400, invalid_comment.text)
        check("valid public comment is pending", pending_comment.status_code == 201 and pending_comment.json().get("status") == "pending", pending_comment.text)
        check("public gallery hides system album", gallery.status_code == 200 and all(item.get("id") != "album-moonlight" and item.get("slug") != "system" for item in gallery_items), gallery.text)
        check("public gallery images paginates", gallery_images is None or (gallery_images.status_code == 200 and gallery_images.json().get("pageSize") == 2), gallery_images.text if gallery_images else "")
        check("system gallery is not public", system_gallery_images.status_code == 404, system_gallery_images.text)
        check("unsafe upload path is rejected or not found", bad_upload_name.status_code in {400, 404}, bad_upload_name.text)
        check("rss uses posts route and RFC822 dates", rss.status_code == 200 and "/posts/" in rss.text and "/articles/" not in rss.text and bool(re.search(r"<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT</pubDate>", rss.text)), rss.text[:300])
        check("sitemap uses posts route", sitemap.status_code == 200 and "/posts/" in sitemap.text and "/articles/" not in sitemap.text, sitemap.text[:300])
        check("robots points to sitemap", robots.status_code == 200 and "Sitemap: http://127.0.0.1:4174/sitemap.xml" in robots.text, robots.text)

        with TestClient(app) as anonymous_client:
            admin_anonymous = anonymous_client.get("/api/admin/content")
            csrf_missing = anonymous_client.put("/api/admin/settings", json={"stylePreset": "cyber"})

        login = client.post("/api/admin/login", json={"password": config.admin_password})
        csrf_token = client.cookies.get(config.csrf_cookie_name, "")
        write_headers = {"x-csrf-token": csrf_token}
        admin_me = client.get("/api/admin/me")
        admin_content = client.get("/api/admin/content")
        admin_ops = client.get("/api/admin/ops")
        admin_audit = client.get("/api/admin/audit")
        admin_commands = client.get("/api/admin/commands")
        public_starfield_empty = client.get("/api/starfield")

        check("admin content requires login before login", admin_anonymous.status_code == 401, admin_anonymous.text)
        check("admin login succeeds", login.status_code == 200 and bool(csrf_token), login.text)
        check("admin me succeeds with cookie", admin_me.status_code == 200 and admin_me.json().get("authenticated") is True, admin_me.text)
        check("admin content has old admin keys", admin_content.status_code == 200 and all(key in admin_content.json() for key in ["settings", "homepage", "noteSections", "featuredSeries", "galleryAlbums", "posts"]), admin_content.text)
        check("admin ops has database quick_check", admin_ops.status_code == 200 and admin_ops.json().get("database", {}).get("ok") is True, admin_ops.text)
        check("admin audit returns list", admin_audit.status_code == 200 and isinstance(admin_audit.json().get("items"), list), admin_audit.text)
        check("admin commands registry is available", admin_commands.status_code == 200 and len(admin_commands.json().get("commands", [])) >= 4, admin_commands.text)
        check("public starfield has stable empty payload", public_starfield_empty.status_code == 200 and all(key in public_starfield_empty.json() for key in ["version", "passages", "relationships", "deepPaths"]), public_starfield_empty.text)
        check("admin write without csrf is rejected", csrf_missing.status_code in {401, 403}, csrf_missing.text)

        settings = client.put("/api/admin/settings", json={"stylePreset": "cyber", "ownerName": "测试站长", "ownerAvatarUrl": "/avatar.png"}, headers=write_headers)
        homepage = client.put("/api/admin/homepage", json={"siteName": "兼容测试站", "siteTagline": "旧契约"}, headers=write_headers)
        note_sections_payload = admin_content.json().get("noteSections", [])
        note_sections_before = len(note_sections_payload)
        note_sections = client.put("/api/admin/note-sections", json=note_sections_payload, headers=write_headers)
        note_section_with_article = next(
            (
                section
                for section in note_sections_payload
                if any(post.get("categoryId") == section.get("id") for post in admin_content.json().get("posts", []))
            ),
            None,
        )
        note_sections_after_delete = None
        if note_section_with_article and len(note_sections_payload) > 1:
            kept_note_sections = [section for section in note_sections_payload if section.get("id") != note_section_with_article.get("id")]
            note_sections_after_delete = client.put("/api/admin/note-sections", json=kept_note_sections, headers=write_headers)
            client.put("/api/admin/note-sections", json=note_sections_payload, headers=write_headers)
        featured_series = client.put("/api/admin/featured-series", json=admin_content.json().get("featuredSeries", []), headers=write_headers)
        starfield_source_slugs = {"python-backend-takes-over", "test-long-article-pagination-reading"}
        starfield_article_ids = [
            item.get("id", "")
            for item in admin_content.json().get("posts", [])
            if item.get("slug") in starfield_source_slugs and item.get("id")
        ]
        if len(starfield_article_ids) < 2:
            starfield_article_ids = [
                item.get("id", "")
                for item in admin_content.json().get("posts", [])
                if item.get("id")
            ][:2]
        first_article_id = starfield_article_ids[0] if starfield_article_ids else ""
        starfield_version = client.post("/api/admin/starfield/versions", json={"name": "兼容星图"}, headers=write_headers)
        starfield_version_id = starfield_version.json().get("version", {}).get("id", "")
        starfield_passages = client.post(
            f"/api/admin/starfield/versions/{starfield_version_id}/generate-passages",
            json={"articleIds": starfield_article_ids or [first_article_id]},
            headers=write_headers,
        )
        starfield_passage_job_id = starfield_passages.json().get("jobId", "")
        starfield_passage_jobs = starfield_passages.json().get("jobs", [])
        starfield_passage_initial_job = next((job for job in starfield_passage_jobs if job.get("id") == starfield_passage_job_id), None)
        starfield_passage_task_created = (
            starfield_passages.status_code == 200
            and bool(starfield_passage_job_id)
            and starfield_passage_initial_job is not None
            and starfield_passage_initial_job.get("status") in {"pending", "running", "succeeded"}
            and starfield_passage_initial_job.get("progressTotal", 0) >= 1
            and bool(starfield_passage_initial_job.get("currentStep"))
        )
        starfield_passage_final_job = starfield_passage_initial_job
        for _ in range(30):
            starfield_passages = client.get(f"/api/admin/starfield/versions/{starfield_version_id}", headers=write_headers)
            starfield_passage_jobs = starfield_passages.json().get("jobs", [])
            starfield_passage_final_job = next((job for job in starfield_passage_jobs if job.get("id") == starfield_passage_job_id), None)
            if starfield_passage_final_job and starfield_passage_final_job.get("status") in {"succeeded", "failed"}:
                break
            time.sleep(0.05)
        starfield_passage_progress_recorded = (
            starfield_passage_final_job is not None
            and starfield_passage_final_job.get("status") == "succeeded"
            and starfield_passage_final_job.get("progressCurrent") == starfield_passage_final_job.get("progressTotal")
            and bool(starfield_passage_final_job.get("currentStep"))
        )
        starfield_passage_fallback_recorded = any("本地规则兜底" in str(job.get("errorMessage") or "") for job in starfield_passage_jobs)
        starfield_generated_passages = starfield_passages.json().get("passages") or []
        accepted_starfield_passages = []
        starfield_accept_passage = None
        accepted_article_ids: set[str] = set()
        for passage in starfield_generated_passages:
            article_id = passage.get("articleId", "")
            if article_id in accepted_article_ids and len(accepted_article_ids) < 2:
                continue
            starfield_accept_passage = client.put(
                f"/api/admin/starfield/passages/{passage.get('id', '')}",
                json={
                    "status": "accepted",
                    "title": passage.get("title", ""),
                    "keywords": ["CompatSharedStarfieldKeyword", *passage.get("keywords", [])],
                },
                headers=write_headers,
            )
            if starfield_accept_passage.status_code == 200:
                accepted_article_ids.add(article_id)
                accepted_starfield_passages.append(passage)
            if len(accepted_article_ids) >= 2:
                break
        starfield_bulk_accept_passages = client.post(
            f"/api/admin/starfield/versions/{starfield_version_id}/passages/bulk",
            json={"status": "accepted", "sourceStatus": "suggested"},
            headers=write_headers,
        )
        starfield_relationships = client.post(
            f"/api/admin/starfield/versions/{starfield_version_id}/generate-relationships",
            headers=write_headers,
        )
        starfield_relationship_job_id = starfield_relationships.json().get("jobId", "")
        starfield_relationship_jobs = starfield_relationships.json().get("jobs", [])
        starfield_relationship_initial_job = next((job for job in starfield_relationship_jobs if job.get("id") == starfield_relationship_job_id), None)
        starfield_relationship_task_created = (
            starfield_relationships.status_code == 200
            and bool(starfield_relationship_job_id)
            and starfield_relationship_initial_job is not None
            and starfield_relationship_initial_job.get("status") in {"pending", "running", "succeeded"}
            and starfield_relationship_initial_job.get("progressTotal", 0) >= 1
            and bool(starfield_relationship_initial_job.get("currentStep"))
        )
        starfield_relationship_final_job = starfield_relationship_initial_job
        for _ in range(30):
            starfield_relationships = client.get(f"/api/admin/starfield/versions/{starfield_version_id}", headers=write_headers)
            starfield_relationship_jobs = starfield_relationships.json().get("jobs", [])
            starfield_relationship_final_job = next((job for job in starfield_relationship_jobs if job.get("id") == starfield_relationship_job_id), None)
            if starfield_relationship_final_job and starfield_relationship_final_job.get("status") in {"succeeded", "failed"}:
                break
            time.sleep(0.05)
        starfield_relationship_progress_recorded = (
            starfield_relationship_final_job is not None
            and starfield_relationship_final_job.get("status") == "succeeded"
            and starfield_relationship_final_job.get("progressCurrent") == starfield_relationship_final_job.get("progressTotal")
            and bool(starfield_relationship_final_job.get("currentStep"))
        )
        starfield_version_with_keywords = starfield_relationships
        starfield_relationship_fallback_recorded = any("本地规则兜底" in str(job.get("errorMessage") or "") for job in starfield_relationship_jobs)
        first_relationship = (starfield_relationships.json().get("relationships") or [{}])[0]
        starfield_relationship_items = starfield_relationships.json().get("relationships", [])
        starfield_canonical_keyword_items = starfield_version_with_keywords.json().get("canonicalKeywords", [])
        starfield_relationship_evidence_recorded = any(item.get("evidenceKeywords") for item in starfield_relationship_items)
        starfield_relationship_cross_article_recorded = any(item.get("isCrossArticle") for item in starfield_relationship_items)
        starfield_same_article_relationships_hidden = all(
            item.get("status") == "hidden"
            for item in starfield_relationship_items
            if not item.get("isCrossArticle")
        )
        starfield_canonical_keywords_recorded = any(
            item.get("label") == "CompatSharedStarfieldKeyword" and len(item.get("passageIds", [])) >= 2
            for item in starfield_canonical_keyword_items
        )
        starfield_deep_relationships = client.post(
            f"/api/admin/starfield/versions/{starfield_version_id}/generate-deep-relationships",
            headers=write_headers,
        )
        starfield_deep_relationship_job_id = starfield_deep_relationships.json().get("jobId", "")
        starfield_deep_relationship_jobs = starfield_deep_relationships.json().get("jobs", [])
        starfield_deep_relationship_initial_job = next((job for job in starfield_deep_relationship_jobs if job.get("id") == starfield_deep_relationship_job_id), None)
        starfield_deep_relationship_task_created = (
            starfield_deep_relationships.status_code == 200
            and bool(starfield_deep_relationship_job_id)
            and starfield_deep_relationship_initial_job is not None
            and starfield_deep_relationship_initial_job.get("phase") == "deep-relationships"
            and starfield_deep_relationship_initial_job.get("status") in {"pending", "running", "succeeded", "failed"}
        )
        starfield_deep_relationship_final_job = starfield_deep_relationship_initial_job
        for _ in range(30):
            starfield_deep_relationships = client.get(f"/api/admin/starfield/versions/{starfield_version_id}", headers=write_headers)
            starfield_deep_relationship_jobs = starfield_deep_relationships.json().get("jobs", [])
            starfield_deep_relationship_final_job = next((job for job in starfield_deep_relationship_jobs if job.get("id") == starfield_deep_relationship_job_id), None)
            if starfield_deep_relationship_final_job and starfield_deep_relationship_final_job.get("status") in {"succeeded", "failed"}:
                break
            time.sleep(0.05)
        starfield_deep_relationship_requires_llm = (
            starfield_deep_relationship_final_job is not None
            and starfield_deep_relationship_final_job.get("status") == "failed"
            and "LLM" in str(starfield_deep_relationship_final_job.get("errorMessage") or "")
        )
        accepted_deep_source_count = len([item for item in starfield_bulk_accept_passages.json().get("passages", []) if item.get("status") == "accepted"])
        expected_deep_progress_total = ((accepted_deep_source_count + 5) // 6) + 3
        starfield_deep_relationship_uses_batches = (
            starfield_deep_relationship_final_job is not None
            and int(starfield_deep_relationship_final_job.get("progressTotal") or 0) == expected_deep_progress_total
        )
        starfield_deep_paths_shape_ok = isinstance(starfield_deep_relationships.json().get("deepPaths"), list)
        admin_tasks = client.get("/api/admin/tasks", headers=write_headers)
        admin_task_items = admin_tasks.json().get("items", [])
        admin_tasks_expose_general_source = any(
            item.get("id") == starfield_deep_relationship_job_id
            and item.get("phase") == "deep-relationships"
            and item.get("sourceType") == "starfield"
            and item.get("sourceName")
            for item in admin_task_items
        )
        starfield_bulk_accept_relationships = client.post(
            f"/api/admin/starfield/versions/{starfield_version_id}/relationships/bulk",
            json={"status": "accepted", "sourceStatus": "suggested", "crossArticleOnly": True},
            headers=write_headers,
        )
        starfield_accept_relationship = (
            client.put(
                f"/api/admin/starfield/relationships/{first_relationship.get('id', '')}",
                json={
                    "status": "accepted",
                    "relationshipType": first_relationship.get("relationshipType", "same_topic"),
                    "rationale": first_relationship.get("rationale", "兼容关系"),
                    "strength": first_relationship.get("strength", 1),
                },
                headers=write_headers,
            )
            if first_relationship.get("id")
            else None
        )
        starfield_publish = client.post(f"/api/admin/starfield/versions/{starfield_version_id}/publish", headers=write_headers)
        public_starfield_after_publish = client.get("/api/starfield")
        public_starfield_relationships = public_starfield_after_publish.json().get("relationships", [])
        public_starfield_deep_paths = public_starfield_after_publish.json().get("deepPaths", [])
        public_starfield_relationship_shape_ok = all(
            "status" not in item
            and "reviewNote" not in item
            and "evidenceKeywords" not in item
            and all(key in item for key in ["id", "sourcePassageId", "targetPassageId", "relationshipType", "relationshipLabel", "rationale", "strength", "isCrossArticle"])
            for item in public_starfield_relationships
        )
        public_starfield_deep_paths_shape_ok = isinstance(public_starfield_deep_paths, list) and all(
            "status" not in item
            and "reviewNote" not in item
            and all(key in item for key in ["id", "sourcePassageId", "passageIds", "inquiry", "pathType", "title", "rationale", "retrievalNotes", "critique", "strength"])
            for item in public_starfield_deep_paths
        )
        draft_payload = {
            "title": "草稿兼容测试",
            "slug": "compat-draft",
            "category": "功能测试",
            "date": "2026.06.15 12:00",
            "status": "draft",
            "publishedAt": "2026.06.15 12:00",
            "tone": "ink",
            "excerpt": "草稿",
            "tags": ["compat"],
            "bodyMarkdown": "草稿内容",
            "seoTitle": "",
            "seoDescription": "",
            "coverImage": "",
            "composerMode": "markdown",
        }
        draft_save = client.put("/api/admin/drafts/compat", json=draft_payload, headers=write_headers)
        draft_get = client.get("/api/admin/drafts/compat")
        draft_delete = client.delete("/api/admin/drafts/compat", headers=write_headers)
        draft_missing = client.get("/api/admin/drafts/compat")

        check("settings save preserves response shape", settings.status_code == 200 and settings.json().get("stylePreset") == "cyber", settings.text)
        check("homepage save returns homepage", homepage.status_code == 200 and homepage.json().get("siteName") == "兼容测试站", homepage.text)
        check("note sections roundtrip", note_sections.status_code == 200 and len(note_sections.json().get("items", [])) == note_sections_before, note_sections.text)
        check(
            "note section delete persists even when articles referenced it",
            note_sections_after_delete is None
            or (
                note_sections_after_delete.status_code == 200
                and all(section.get("id") != note_section_with_article.get("id") for section in note_sections_after_delete.json().get("items", []))
            ),
            note_sections_after_delete.text if note_sections_after_delete else "",
        )
        check("featured series roundtrip", featured_series.status_code == 200 and "items" in featured_series.json(), featured_series.text)
        check("admin starfield version can be created", starfield_version.status_code == 201 and bool(starfield_version_id), starfield_version.text)
        check("admin starfield passage generation creates progress task", starfield_passage_task_created, starfield_passages.text)
        check("admin starfield passage generation task completes", starfield_passage_progress_recorded, starfield_passages.text)
        check("admin starfield passages can be generated", starfield_passages.status_code == 200 and len(starfield_passages.json().get("passages", [])) >= 2, starfield_passages.text)
        check("admin starfield passage generation records local fallback when LLM is unconfigured", starfield_passages.status_code == 200 and starfield_passage_fallback_recorded, starfield_passages.text)
        check(
            "admin starfield passages can be accepted across articles",
            starfield_accept_passage is not None and starfield_accept_passage.status_code == 200 and len(accepted_article_ids) >= 2,
            starfield_accept_passage.text if starfield_accept_passage else starfield_passages.text,
        )
        check("admin starfield passages can be bulk accepted", starfield_bulk_accept_passages.status_code == 200 and all(item.get("status") != "suggested" for item in starfield_bulk_accept_passages.json().get("passages", [])), starfield_bulk_accept_passages.text)
        check("admin starfield relationships request succeeds", starfield_relationships.status_code == 200, starfield_relationships.text)
        check("admin starfield relationship generation creates progress task", starfield_relationship_task_created, starfield_relationships.text)
        check("admin starfield relationship generation task completes", starfield_relationship_progress_recorded, starfield_relationships.text)
        check("admin starfield relationship generation records local fallback when LLM is unconfigured", starfield_relationships.status_code == 200 and starfield_relationship_fallback_recorded, starfield_relationships.text)
        check("admin starfield relationships expose keyword evidence", starfield_relationships.status_code == 200 and starfield_relationship_evidence_recorded, starfield_relationships.text)
        check("admin starfield creates cross-article keyword-derived relationship", starfield_relationships.status_code == 200 and starfield_relationship_cross_article_recorded, starfield_relationships.text)
        check("admin starfield same-article relationships default hidden", starfield_relationships.status_code == 200 and starfield_same_article_relationships_hidden, starfield_relationships.text)
        check("admin starfield relationships can be bulk accepted", starfield_bulk_accept_relationships.status_code == 200 and any(item.get("status") == "accepted" and item.get("isCrossArticle") for item in starfield_bulk_accept_relationships.json().get("relationships", [])), starfield_bulk_accept_relationships.text)
        check("admin starfield exposes canonical keywords", starfield_version_with_keywords.status_code == 200 and starfield_canonical_keywords_recorded, starfield_version_with_keywords.text)
        check("admin starfield deep relationship generation creates progress task", starfield_deep_relationship_task_created, starfield_deep_relationships.text)
        check("admin starfield deep relationship generation requires LLM agent", starfield_deep_relationship_requires_llm, starfield_deep_relationships.text)
        check("admin starfield deep relationship generation uses passage batches", starfield_deep_relationship_uses_batches, starfield_deep_relationships.text)
        check("admin starfield exposes deep path payload shape", starfield_deep_relationships.status_code == 200 and starfield_deep_paths_shape_ok, starfield_deep_relationships.text)
        check("admin tasks expose generic task sources", admin_tasks.status_code == 200 and admin_tasks_expose_general_source, admin_tasks.text)
        check("admin starfield relationship acceptance is optional and safe", starfield_accept_relationship is None or starfield_accept_relationship.status_code == 200, starfield_accept_relationship.text if starfield_accept_relationship else "")
        check("admin starfield version can be published", starfield_publish.status_code == 200 and starfield_publish.json().get("version", {}).get("isActive") is True, starfield_publish.text)
        check("public starfield exposes accepted passages only", public_starfield_after_publish.status_code == 200 and len(public_starfield_after_publish.json().get("passages", [])) >= 1, public_starfield_after_publish.text)
        check("public starfield exposes reader relationship shape only", public_starfield_after_publish.status_code == 200 and len(public_starfield_relationships) >= 1 and public_starfield_relationship_shape_ok, public_starfield_after_publish.text)
        check("public starfield exposes reader deep path shape only", public_starfield_after_publish.status_code == 200 and public_starfield_deep_paths_shape_ok, public_starfield_after_publish.text)
        check("draft save/get/delete roundtrip", draft_save.status_code == 200 and draft_get.status_code == 200 and draft_delete.status_code == 200 and draft_missing.status_code == 404, {"save": draft_save.text, "get": draft_get.text, "delete": draft_delete.text, "missing": draft_missing.text})

        create_article_payload = {
            "slug": "compat-created-article",
            "title": "兼容创建文章",
            "excerpt": "创建文章摘要",
            "category": "功能测试",
            "status": "draft",
            "tone": "ink",
            "tags": ["compat"],
            "bodyMarkdown": "创建文章正文 SearchNeedleCompatCreate",
            "seoTitle": "SEO",
            "seoDescription": "SEO desc",
            "coverImage": "",
        }
        created = client.post("/api/admin/articles", json=create_article_payload, headers=write_headers)
        updated = client.put("/api/admin/articles/compat-created-article", json={**create_article_payload, "title": "兼容更新文章"}, headers=write_headers)
        published = client.post("/api/admin/articles/compat-created-article/publish", headers=write_headers)
        public_created = client.get("/api/articles/compat-created-article")
        unpublished = client.post("/api/admin/articles/compat-created-article/unpublish", headers=write_headers)
        public_unpublished = client.get("/api/articles/compat-created-article")
        deleted = client.delete("/api/admin/articles/compat-created-article", headers=write_headers)
        trash = client.get("/api/admin/trash/articles")
        restored = client.post("/api/admin/trash/articles/compat-created-article/restore", headers=write_headers)

        check("article create/update/publish is compatible", created.status_code == 201 and updated.status_code == 200 and published.status_code == 200 and public_created.status_code == 200, {"created": created.text, "updated": updated.text, "published": published.text, "public": public_created.text})
        check("unpublish hides public article", unpublished.status_code == 200 and public_unpublished.status_code == 404, public_unpublished.text)
        check("delete/trash/restore roundtrip", deleted.status_code == 200 and trash.status_code == 200 and any(item.get("slug") == "compat-created-article" for item in trash.json().get("items", [])) and restored.status_code == 200, {"trash": trash.text, "restored": restored.text})

        command_parse = client.post("/api/admin/commands/parse", json={"input": 'article:set-title article_test-markdown-kitchen-sink --title="兼容标题"'}, headers=write_headers)
        command_dry = client.post("/api/admin/commands/run", json={"input": "article:list-ids", "dryRun": True}, headers=write_headers)
        command_unknown = client.post("/api/admin/commands/run", json={"input": "content:missing"}, headers=write_headers)
        command_get = client.post("/api/admin/commands/run", json={"input": "article:get-content article_test-markdown-kitchen-sink"}, headers=write_headers)
        command_date = client.post("/api/admin/commands/run", json={"input": "article:set-date test-markdown-kitchen-sink --date=\"2026.06.09 18:30\""}, headers=write_headers)
        command_today = client.post("/api/admin/commands/run", json={"input": "article:list --date=today"}, headers=write_headers)
        command_bulk_month = client.post("/api/admin/commands/run", json={"input": "article:set-date-bulk article_test-markdown-kitchen-sink --month=\"2026-04\""}, headers=write_headers)

        check("admin command parse works", command_parse.status_code == 200 and command_parse.json().get("ok") is True, command_parse.text)
        check("admin command dry run works", command_dry.status_code == 200 and command_dry.json().get("status") == "dry_run", command_dry.text)
        check("admin command unknown works", command_unknown.status_code == 200 and command_unknown.json().get("status") == "unknown_command", command_unknown.text)
        check("admin command get content works", command_get.status_code == 200 and command_get.json().get("status") == "executed", command_get.text)
        check("admin command date keeps old Beijing parsing", command_date.status_code == 200 and command_date.json().get("result", {}).get("article", {}).get("publishedAt") == "2026-06-09T10:30:00Z", command_date.text)
        check("admin command can list today's articles", command_today.status_code == 200 and command_today.json().get("status") == "executed" and isinstance(command_today.json().get("result", {}).get("items"), list), command_today.text)
        check("admin command can bulk move articles to month", command_bulk_month.status_code == 200 and command_bulk_month.json().get("result", {}).get("items", [{}])[0].get("publishedAt", "").startswith("2026-04"), command_bulk_month.text)

        admin_comments = client.get("/api/admin/comments?status=pending")
        pending_id = pending_comment.json().get("id")
        approve = client.put(f"/api/admin/comments/{pending_id}", json={"status": "approved"}, headers=write_headers)
        public_after_approve = client.get("/api/articles/test-markdown-kitchen-sink/comments")
        invalid_comment_status = client.put(f"/api/admin/comments/{pending_id}", json={"status": "bad"}, headers=write_headers)
        missing_comment_status = client.put("/api/admin/comments/not-found", json={"status": "approved"}, headers=write_headers)

        check("admin pending comments lists submitted comment", admin_comments.status_code == 200 and any(item.get("id") == pending_id for item in admin_comments.json().get("items", [])), admin_comments.text)
        check("admin comment approval makes comment public", approve.status_code == 200 and any(item.get("id") == pending_id for item in public_after_approve.json().get("items", [])), public_after_approve.text)
        check("admin invalid comment status is rejected", invalid_comment_status.status_code == 400, invalid_comment_status.text)
        check("admin missing comment is 404", missing_comment_status.status_code == 404, missing_comment_status.text)

        private_album = client.post("/api/admin/gallery/albums", json={"slug": "compat-private", "title": "私有相册", "description": "兼容", "isPublic": False}, headers=write_headers)
        admin_gallery_after_create = client.get("/api/admin/gallery")
        public_gallery_after_create = client.get("/api/gallery")
        album_update = client.put("/api/admin/gallery/albums/compat-private", json={"slug": "compat-public", "title": "公开相册", "description": "兼容更新", "isPublic": True}, headers=write_headers)
        png_bytes = b"\x89PNG\r\n\x1a\n" + (b"\x00" * 32)
        image_upload = client.post(
            "/api/admin/gallery/albums/compat-public/images",
            data={"title": "兼容图片", "description": "图片", "capturedAt": "2026.06.15", "isPublic": "true", "sortOrder": "3"},
            files={"image": ("compat.png", png_bytes, "image/png")},
            headers=write_headers,
        )
        image_id = image_upload.json().get("id") if image_upload.status_code == 201 else ""
        image_file = client.get(image_upload.json().get("imageUrl", "/api/uploads/gallery/not-found.png")) if image_upload.status_code == 201 else None
        image_update = client.put(f"/api/admin/gallery/images/{image_id}", json={"title": "兼容图片更新", "description": "更新", "isPublic": True, "sortOrder": 4}, headers=write_headers) if image_id else None
        album_delete = client.delete("/api/admin/gallery/albums/compat-public", headers=write_headers)
        image_delete = client.delete(f"/api/admin/gallery/images/{image_id}", headers=write_headers) if image_id else None

        check("admin gallery private album visible only to admin", private_album.status_code == 201 and any(item.get("slug") == "compat-private" for item in admin_gallery_after_create.json().get("items", [])) and not any(item.get("slug") == "compat-private" for item in public_gallery_after_create.json().get("items", [])), {"admin": admin_gallery_after_create.text, "public": public_gallery_after_create.text})
        check("gallery album update works", album_update.status_code == 200 and album_update.json().get("slug") == "compat-public", album_update.text)
        check("gallery image upload/serve/update works", image_upload.status_code == 201 and image_file is not None and image_file.status_code == 200 and image_update is not None and image_update.status_code == 200, {"upload": image_upload.text, "file": image_file.status_code if image_file else None, "update": image_update.text if image_update else None})
        check("gallery album delete works", album_delete.status_code == 200, album_delete.text)
        check("deleted album cascades image delete", image_delete is not None and image_delete.status_code == 404, image_delete.text if image_delete else None)

        failures = [{"name": name, "detail": detail} for name, passed, detail in checks if not passed]
        summary = {"checks": len(checks), "failures": failures}
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if failures:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
