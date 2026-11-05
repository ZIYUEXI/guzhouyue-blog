"""隔离验证外部工具的真实 HTTP 契约，不接触本地或生产博客数据库。"""
from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="guzhouyue-agent-") as directory:
        root = Path(directory)
        os.environ.update(DATABASE_PATH=str(root / "blog.sqlite"), GALLERY_UPLOAD_DIR=str(root / "images"),
                          ADMIN_PASSWORD="isolated-agent-test", SITE_URL="http://testserver")
        from fastapi.testclient import TestClient
        from . import app as app_module
        app = app_module.app
        from .content import create_gallery_album, create_gallery_image, get_site_settings
        from .db import get_db
        from . import export_public_snapshot as exporter

        client = TestClient(app)
        with get_db() as conn:
            conn.execute("INSERT INTO site_settings (id, owner_name, updated_at) VALUES ('site', '测试站长', '2026-11-02T00:00:00Z')")
        base = "/api/agent/v1"
        assert client.get(base + "/articles").status_code == 401
        assert client.post("/api/admin/agent-keys", json={"name": "unauthorized"}).status_code == 401
        assert client.post("/api/admin/login", json={"password": "isolated-agent-test"}).status_code == 200
        assert client.post("/api/admin/agent-keys", json={"name": "missing csrf"}).status_code == 403
        csrf = {"X-CSRF-Token": client.cookies.get("guzhouyue_csrf")}
        empty_album = create_gallery_album({"title": "空相册回归", "isPublic": False})
        assert client.delete("/api/admin/gallery/albums/" + empty_album["id"], headers=csrf).status_code == 200
        key = client.post("/api/admin/agent-keys", json={"name": "test"}, headers=csrf).json()
        key2 = client.post("/api/admin/agent-keys", json={"name": "other"}, headers=csrf).json()
        # 外部工具只携带 Bearer；即使无后台 Cookie 也能操作草稿。
        agent = TestClient(app, headers={"Authorization": "Bearer " + key["token"]})
        other = TestClient(app, headers={"Authorization": "Bearer " + key2["token"]})
        capabilities = agent.get(base + "/capabilities").json()
        assert capabilities["draftOnly"] is True and "authorName" in capabilities["editableFields"]
        assert agent.get("/api/admin/content").status_code == 401
        assert agent.post("/api/admin/public-deploy").status_code == 401
        assert agent.post(base + "/articles", json={"title": "bad", "status": "published"}).status_code == 422
        assert agent.post(base + "/articles", json={"title": "bad", "authorName": "作" * 41}).status_code == 422
        assert agent.post(base + "/articles", json={"title": "bad", "publishedAt": "2026-11-03"}).status_code == 422
        assert agent.post(base + "/articles", json={"title": "   "}).status_code == 422
        response = agent.post(base + "/articles", json={"title": "测试草稿", "bodyMarkdown": "原文"})
        assert response.status_code == 201, response.text
        article = response.json()
        assert article["status"] == "draft" and article["publishedAt"] is None
        assert article["authorName"] == get_site_settings()["ownerName"]
        assert article["authorName"] == "测试站长"
        # 新建允许 AI / 协作署名，空值统一回退当前站长。
        for supplied, expected in [("  Codex / 孤舟月  ", "Codex / 孤舟月"), ("", "测试站长"), ("  ", "测试站长"), (None, "测试站长")]:
            created = agent.post(base + "/articles", json={"title": "署名测试", "authorName": supplied})
            assert created.status_code == 201 and created.json()["authorName"] == expected
        path = base + "/articles/" + article["id"]
        assert agent.get(path).json()["bodyMarkdown"] == "原文"
        assert client.get("/api/articles/" + article["slug"]).status_code == 404
        assert agent.patch(path, json={"bodyMarkdown": "缺版本"}).status_code == 422
        assert agent.patch(path, json={"expectedUpdatedAt": "outdated", "bodyMarkdown": "错"}).status_code == 409
        response = agent.patch(path, json={"expectedUpdatedAt": article["updatedAt"], "bodyMarkdown": "", "title": "已修正"})
        assert response.status_code == 200, response.text
        article = response.json()
        assert article["bodyMarkdown"] == "" and article["title"] == "已修正"
        # PATCH 省略署名须保留原值；明确留空（含 null）才重置为站长。
        for supplied in ["Codex", "", "Codex", "  ", "Codex", None, "Codex / 孤舟月"]:
            response = agent.patch(path, json={"expectedUpdatedAt": article["updatedAt"], "authorName": supplied})
            assert response.status_code == 200, response.text
            article = response.json()
            assert article["authorName"] == (supplied.strip() if supplied and supplied.strip() else "测试站长")
        response = agent.patch(path, json={"expectedUpdatedAt": article["updatedAt"], "excerpt": "仅改摘要"})
        article = response.json()
        assert article["authorName"] == "Codex / 孤舟月"
        stale = agent.patch(path, json={"expectedUpdatedAt": "outdated", "authorName": "不应覆盖"})
        assert stale.status_code == 409 and agent.get(path).json()["authorName"] == "Codex / 孤舟月"
        # 后台自动保存草稿的数据也要完整保留署名，供编辑器恢复。
        saved = client.put("/api/admin/drafts/author-test", headers=csrf, json={"bodyMarkdown": "草稿", "authorName": "Codex"})
        assert saved.status_code == 200
        assert client.get("/api/admin/drafts/author-test").json()["draft"]["authorName"] == "Codex"

        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=")
        original_limit = app_module.max_gallery_image_bytes
        try:
            app_module.max_gallery_image_bytes = 16
            assert agent.post(base + "/images", files={"image": ("large.png", png, "image/png")}).status_code == 413
        finally:
            app_module.max_gallery_image_bytes = original_limit
        assert agent.post(base + "/images", files={"image": ("bad.png", b"not an image", "image/png")}).status_code == 400
        response = agent.post(base + "/images", files={"image": ("test.png", png, "image/png")}, data={"title": "配图"})
        assert response.status_code == 201, response.text
        image = response.json()
        assert agent.get(image["previewPath"]).content == png
        assert other.get(image["previewPath"]).status_code == 404
        assert agent.patch(base + "/images/" + image["id"], json={"title": "更正图注"}).status_code == 200
        assert agent.patch(base + "/images/" + image["id"], json={"title": "bad", "isPublic": True}).status_code == 422
        assert image["id"] in [item["id"] for item in agent.get(base + "/gallery").json()["uploads"]]
        assert other.get(base + "/gallery").json()["uploads"] == []
        public_album = create_gallery_album({"title": "公开图库", "isPublic": True})
        public_image = create_gallery_image(public_album["id"], {"title": "可复用图片", "imageUrl": "/api/uploads/gallery/existing.png", "isPublic": True})
        gallery = agent.get(base + "/gallery").json()
        assert any(public_image["id"] == item["id"] for album in gallery["albums"] for item in album["images"])
        article = agent.patch(path, json={"expectedUpdatedAt": article["updatedAt"], "bodyMarkdown": image["markdown"]}).json()
        exporter.PUBLIC_GALLERY_DIR = root / "public-images"
        exporter.copy_gallery_uploads()
        assert not (exporter.PUBLIC_GALLERY_DIR / image["fileName"]).exists()

        # 人工发布后不能经草稿接口修改；修订必须另建一份草稿。
        result = client.post("/api/admin/articles/" + article["id"] + "/publish", headers=csrf)
        assert result.status_code == 200, result.text
        assert result.json()["authorName"] == "Codex / 孤舟月"
        assert agent.patch(path, json={"expectedUpdatedAt": article["updatedAt"], "title": "越权"}).status_code == 409
        assert agent.post(path + "/publish").status_code in {404, 405}
        copied = agent.post(path + "/copy")
        assert copied.status_code == 201 and copied.json()["status"] == "draft"
        assert copied.json()["id"] != article["id"]
        assert copied.json()["authorName"] == "Codex / 孤舟月"
        exporter.copy_gallery_uploads()
        assert (exporter.PUBLIC_GALLERY_DIR / image["fileName"]).read_bytes() == png
        assert "/uploads/gallery/" in exporter.rewrite_public_urls(result.json())["bodyMarkdown"]
        # 旧图片保持不变；修图上传新文件后只改草稿中的引用。
        second = agent.post(base + "/images", files={"image": ("new.png", png, "image/png")}).json()
        assert second["fileName"] != image["fileName"]
        assert agent.get(image["previewPath"]).content == png
        audit = client.get("/api/admin/agent-keys/audit").json()["items"]
        assert any(item["status"] == 409 for item in audit)
        listed = client.get("/api/admin/agent-keys").json()
        assert key["token"] not in str(listed) and "token_hash" not in str(listed)
        with get_db() as conn:
            assert conn.execute("SELECT token_hash FROM agent_keys WHERE id = ?", (key["id"],)).fetchone()[0] != key["token"]
        assert client.post("/api/admin/agent-keys/" + key["id"] + "/revoke", headers=csrf).status_code == 200
        assert agent.get(path).status_code == 401
        print("Agent API: authentication, CSRF, draft CRUD, custom/default/preserved author, conflicts, image upload/edit/isolation, export gating, admin publication, revision copy and revocation passed.")


if __name__ == "__main__":
    main()
