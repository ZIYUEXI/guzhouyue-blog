from __future__ import annotations

import json

from .content import parse_date_label, slugify
from .db import get_db, now_iso


DEFAULT_HOMEPAGE = {
    "siteName": "孤舟月",
    "siteTagline": "在技术、文字和日常之间靠岸。",
    "heroTitle": "孤舟月",
    "heroSubtitle": "记录代码、知识与生活的个人博客。",
    "primaryCta": "阅读文章",
    "secondaryCta": "查看归档",
}

DEFAULT_SECTIONS = [
    {"category": "人间札记", "description": "日常、观察与长短句。"},
    {"category": "技术手记", "description": "工程实践、系统设计与工具使用。"},
]

DEFAULT_POST = {
    "slug": "python-backend-takes-over",
    "title": "Python 后端接管记录",
    "excerpt": "FastAPI 已开始接管博客后端，后续知识图谱、检索与 Agent 能力会在 Python 生态内继续扩展。",
    "category": "技术手记",
    "date": "2026.06.15 09:00",
    "tone": "ink",
    "tags": ["Python", "FastAPI", "知识图谱"],
    "bodyMarkdown": "# Python 后端接管记录\n\n后端服务开始由 Python 接管，保持现有 API 契约不变，优先保障前端和管理台继续可用。\n\n下一步会继续迁移 seed、测试和知识图谱相关能力。",
}


def seed() -> None:
    now = now_iso()
    with get_db() as conn:
        existing_sections = conn.execute("SELECT COUNT(*) AS count FROM note_sections").fetchone()["count"]
        if existing_sections == 0:
            for index, section in enumerate(DEFAULT_SECTIONS):
                conn.execute(
                    """
                    INSERT INTO note_sections (id, name, slug, description, sort_order, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"section_{slugify(section['category'])}",
                        section["category"],
                        slugify(section["category"]),
                        section["description"],
                        index,
                        now,
                        now,
                    ),
                )

        section_rows = conn.execute("SELECT id, name FROM note_sections").fetchall()
        category_ids = {row["name"]: row["id"] for row in section_rows}

        existing_articles = conn.execute("SELECT COUNT(*) AS count FROM articles").fetchone()["count"]
        if existing_articles == 0:
            published_at = parse_date_label(DEFAULT_POST["date"])
            conn.execute(
                """
                INSERT INTO articles (
                  id, slug, title, excerpt, category_id, author_name, status, published_at, created_at, updated_at,
                  tone, tags_json, body_markdown, seo_title, seo_description, cover_image
                )
                VALUES (?, ?, ?, ?, ?, '孤舟月', 'published', ?, ?, ?, ?, ?, ?, ?, ?, '')
                """,
                (
                    f"article_{DEFAULT_POST['slug']}",
                    DEFAULT_POST["slug"],
                    DEFAULT_POST["title"],
                    DEFAULT_POST["excerpt"],
                    category_ids.get(DEFAULT_POST["category"]),
                    published_at,
                    published_at,
                    now,
                    DEFAULT_POST["tone"],
                    json.dumps(DEFAULT_POST["tags"], ensure_ascii=False),
                    DEFAULT_POST["bodyMarkdown"],
                    DEFAULT_POST["title"],
                    DEFAULT_POST["excerpt"],
                ),
            )

        conn.execute(
            """
            INSERT INTO site_settings (id, style_preset, color_scheme, owner_name, owner_avatar_url, updated_at)
            VALUES ('site', 'classic', 'light', '孤舟月', '/images/guzhouyue-avatar.png', ?)
            ON CONFLICT(id) DO NOTHING
            """,
            (now,),
        )

        conn.execute(
            """
            INSERT INTO homepage_copy (id, payload_json, updated_at)
            VALUES ('homepage', ?, ?)
            ON CONFLICT(id) DO NOTHING
            """,
            (json.dumps(DEFAULT_HOMEPAGE, ensure_ascii=False), now),
        )

        conn.execute(
            """
            INSERT INTO gallery_albums (id, slug, title, description, cover_image_id, is_public, sort_order, created_at, updated_at)
            VALUES ('album-moonlight', 'moonlight', '月下图存', '维护博客各页面使用的公共图片，不包含文章正文图片。', 'image-guzhouyue-hero', 1, 0, ?, ?)
            ON CONFLICT(id) DO NOTHING
            """,
            (now, now),
        )

        gallery_exists = conn.execute("SELECT id FROM gallery_albums WHERE id = 'album-moonlight'").fetchone()
        if gallery_exists:
            for image_id, title, description, image_url, captured_at, sort_order in [
                ("image-guzhouyue-avatar", "作者头像", "全站作者信息和文章署名使用的头像。", "/images/guzhouyue-avatar.png", "2026.05.21", 0),
                ("image-guzhouyue-hero", "孤舟月首屏", "古风月色下的孤舟视觉。", "/images/guzhouyue-hero.png", "2026.05.21", 1),
                ("image-guzhouyue-cyber", "赛博月色", "另一种更冷亮的站点视觉。", "/images/guzhouyue-hero-cyber.png", "2026.05.21", 2),
            ]:
                conn.execute(
                    """
                    INSERT INTO gallery_images (
                      id, album_id, title, description, image_url, file_name, mime_type, size_bytes,
                      captured_at, is_public, sort_order, created_at, updated_at
                    )
                    VALUES (?, 'album-moonlight', ?, ?, ?, '', '', 0, ?, 1, ?, ?, ?)
                    ON CONFLICT(id) DO NOTHING
                    """,
                    (image_id, title, description, image_url, captured_at, sort_order, now, now),
                )

        article_count = conn.execute("SELECT COUNT(*) AS count FROM articles").fetchone()["count"]
        section_count = conn.execute("SELECT COUNT(*) AS count FROM note_sections").fetchone()["count"]
    print(f"Seed complete: {article_count} articles, {section_count} note sections.")


if __name__ == "__main__":
    seed()
