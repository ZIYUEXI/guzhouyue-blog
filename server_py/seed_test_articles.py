from __future__ import annotations

import json

from .content import parse_date_label, slugify
from .db import get_db, now_iso


CATEGORY_DESCRIPTIONS = {
    "功能测试": "验证前台与渲染",
    "技术笔记": "记录前端、后端、工程化与系统设计实践。",
    "人间札记": "放置日常观察、写作片段和生活记录。",
    "读书摘录": "整理阅读笔记、摘录与二次思考。",
    "山水游踪": "记录旅行、城市漫游与自然观察。",
}

TEST_ARTICLES = [
    {
        "slug": "test-markdown-kitchen-sink",
        "title": "测试文章：Markdown 全元素排版",
        "excerpt": "覆盖标题、列表、任务列表、引用、表格、链接、行内代码与分隔段落。",
        "category": "功能测试",
        "publishedAt": "2026.05.21 09:10",
        "tone": "ink",
        "tags": ["测试", "Markdown", "排版", "SearchNeedleAlpha"],
        "bodyMarkdown": "# 一级标题测试\n\n这篇文章用于检查正文排版。这里包含一个唯一搜索词：SearchNeedleAlpha。\n\n## 列表与任务\n\n- 普通无序列表第一项\n- 普通无序列表第二项，包含 `inline code`\n\n> 这是一段引用。\n\n| 功能 | 期望结果 |\n| --- | --- |\n| 表格 | 可以横向滚动 |",
        "comments": [{"authorName": "测试读者", "content": "这条已审核评论用于验证评论列表可以直接展示。", "createdAt": "2026.05.21 09:30"}],
    },
    {
        "slug": "test-code-blocks-and-highlight",
        "title": "测试文章：代码块与高亮",
        "excerpt": "覆盖 TypeScript、CSS、Shell、JSON 等常见代码块，验证高亮与横向滚动。",
        "category": "技术笔记",
        "publishedAt": "2026.05.21 09:20",
        "tone": "pine",
        "tags": ["测试", "代码高亮", "前端", "SearchNeedleCode"],
        "bodyMarkdown": "这篇文章用于检查代码块渲染，唯一搜索词：SearchNeedleCode。\n\n```ts\nfunction applyTheme(theme: string) {\n  document.documentElement.dataset.colorScheme = theme;\n}\n```",
    },
    {
        "slug": "test-math-formulas",
        "title": "测试文章：数学公式渲染",
        "excerpt": "覆盖行内公式与块级公式，验证 KaTeX、段落间距和暗色模式下的可读性。",
        "category": "技术笔记",
        "publishedAt": "2026.05.21 09:30",
        "tone": "water",
        "tags": ["测试", "数学公式", "KaTeX", "SearchNeedleMath"],
        "bodyMarkdown": "这篇文章用于检查公式渲染，唯一搜索词：SearchNeedleMath。\n\n行内公式 $E = mc^2$。\n\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$",
    },
    {
        "slug": "test-long-article-pagination-reading",
        "title": "测试文章：长文阅读与滚动体验",
        "excerpt": "用较长正文测试详情页阅读节奏、滚动、上一篇下一篇和评论区域位置。",
        "category": "人间札记",
        "publishedAt": "2026.05.21 09:40",
        "tone": "cinnabar",
        "tags": ["测试", "长文", "阅读体验", "SearchNeedleLong"],
        "bodyMarkdown": "\n\n".join([f"第 {index + 1} 段：这是一段用于测试长文阅读体验的正文。唯一搜索词 SearchNeedleLong。" for index in range(14)]),
        "comments": [
            {"authorName": "长文测试员", "content": "滚动到这里时，评论区域应该仍然清晰可见。", "createdAt": "2026.05.21 10:00"},
            {"authorName": "另一位读者", "content": "第二条评论用于测试多评论排序。", "createdAt": "2026.05.21 10:05"},
        ],
    },
    {
        "slug": "test-image-and-media",
        "title": "测试文章：图片与媒体排版",
        "excerpt": "使用站内图片验证正文图片、替代文本、宽度约束和暗色背景衔接。",
        "category": "山水游踪",
        "publishedAt": "2026.05.21 09:50",
        "tone": "water",
        "tags": ["测试", "图片", "媒体", "SearchNeedleImage"],
        "bodyMarkdown": "这篇文章用于检查图片展示，唯一搜索词：SearchNeedleImage。\n\n![孤舟月首屏图](/images/guzhouyue-hero.png)",
    },
    {
        "slug": "test-title-tags-search-edge-cases",
        "title": "测试文章：很长标题 English 123 与特殊标签混排，用于检查卡片换行和搜索结果展示",
        "excerpt": "覆盖很长标题、混合标签、英文数字、搜索命中和列表卡片高度。",
        "category": "功能测试",
        "publishedAt": "2026.05.21 10:00",
        "tone": "ink",
        "tags": ["测试", "LongTitle", "中文English123", "SearchNeedleEdge"],
        "bodyMarkdown": "这篇文章用于测试边界文本，唯一搜索词：SearchNeedleEdge。",
    },
    {
        "slug": "test-category-filter-reading-notes",
        "title": "测试文章：分类筛选与读书摘录",
        "excerpt": "放在读书摘录分类中，用于验证分类筛选、札记页和归档页的一致性。",
        "category": "读书摘录",
        "publishedAt": "2026.05.20 22:15",
        "tone": "cinnabar",
        "tags": ["测试", "分类筛选", "读书", "SearchNeedleCategory"],
        "bodyMarkdown": "这篇文章用于检查分类筛选，唯一搜索词：SearchNeedleCategory。",
    },
    {
        "slug": "test-draft-like-but-published",
        "title": "测试文章：发布状态与公开接口",
        "excerpt": "这篇文章是发布状态，应该能出现在公开列表、搜索、归档和详情页中。",
        "category": "功能测试",
        "publishedAt": "2026.05.19 08:45",
        "tone": "pine",
        "tags": ["测试", "公开接口", "发布状态", "SearchNeedlePublished"],
        "bodyMarkdown": "这篇文章用于确认公开接口只展示已发布文章，唯一搜索词：SearchNeedlePublished。",
    },
    {
        "slug": "test-featured-short-title",
        "title": "短标题测试",
        "excerpt": "用于确认首页主推卡在短标题下仍保持原本的视觉气质。",
        "category": "功能测试",
        "publishedAt": "2026.05.21 10:10",
        "tone": "ink",
        "tags": ["测试", "首页主推", "短标题", "FeaturedLayoutShort"],
        "bodyMarkdown": "这篇文章用于测试首页主推卡短标题状态。",
    },
    {
        "slug": "test-featured-medium-title",
        "title": "中等长度标题用于检查首页主推卡的正常换行",
        "excerpt": "用于确认常见长度标题在首页主推卡里自然换行。",
        "category": "功能测试",
        "publishedAt": "2026.05.21 10:20",
        "tone": "pine",
        "tags": ["测试", "首页主推", "中标题", "FeaturedLayoutMedium"],
        "bodyMarkdown": "这篇文章用于测试首页主推卡中等长度标题。",
    },
    {
        "slug": "test-featured-long-chinese-title",
        "title": "这是一篇专门用于压测首页主推文章卡片标题自动缩放能力的超长中文标题",
        "excerpt": "用于确认长中文标题不会把卡片撑出巨大空白，也不会挤压摘要和日期。",
        "category": "功能测试",
        "publishedAt": "2026.05.21 10:30",
        "tone": "cinnabar",
        "tags": ["测试", "首页主推", "长中文标题", "FeaturedLayoutChinese"],
        "bodyMarkdown": "这篇文章用于测试首页主推卡超长中文标题。",
    },
    {
        "slug": "test-featured-long-english-title",
        "title": "Featured Card Layout Stress Test With A Very Long English Title For Responsive Typography",
        "excerpt": "用于确认带空格的英文长标题可以正常换行，不会造成主推卡高度异常。",
        "category": "功能测试",
        "publishedAt": "2026.05.21 10:40",
        "tone": "water",
        "tags": ["测试", "首页主推", "英文标题", "FeaturedLayoutEnglish"],
        "bodyMarkdown": "This article checks a long English title in the featured card.",
    },
    {
        "slug": "test-featured-unbroken-title",
        "title": "SupercalifragilisticexpialidociousSupercalifragilisticexpialidocious超长无空格标题压力测试",
        "excerpt": "用于确认连续英文和中文混合的无空格长串也不会撑破首页主推卡。",
        "category": "功能测试",
        "publishedAt": "2026.05.21 10:50",
        "tone": "ink",
        "tags": ["测试", "首页主推", "无空格长串", "FeaturedLayoutUnbroken"],
        "bodyMarkdown": "这篇文章用于测试最容易撑破布局的无空格长串标题。",
    },
]


def seed_test_articles() -> None:
    now = now_iso()
    with get_db() as conn:
        for category, description in CATEGORY_DESCRIPTIONS.items():
            conn.execute(
                """
                INSERT INTO note_sections (id, name, slug, description, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug,
                  description = excluded.description, sort_order = excluded.sort_order, updated_at = excluded.updated_at
                """,
                (f"section_{slugify(category)}", category, slugify(category), description, 900 if category == "功能测试" else 100, now, now),
            )

        section_rows = conn.execute("SELECT id, name FROM note_sections").fetchall()
        category_ids = {row["name"]: row["id"] for row in section_rows}

        for article in TEST_ARTICLES:
            published_at = parse_date_label(article["publishedAt"])
            article_id = f"article_{article['slug']}"
            conn.execute(
                """
                INSERT INTO articles (
                  id, slug, title, excerpt, category_id, author_name, status, published_at, created_at, updated_at,
                  tone, tags_json, body_markdown, seo_title, seo_description, cover_image
                )
                VALUES (?, ?, ?, ?, ?, '孤舟月', 'published', ?, ?, ?, ?, ?, ?, ?, ?, '')
                ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt,
                  category_id = excluded.category_id, author_name = excluded.author_name,
                  status = excluded.status, published_at = excluded.published_at,
                  updated_at = excluded.updated_at, tone = excluded.tone, tags_json = excluded.tags_json,
                  body_markdown = excluded.body_markdown, seo_title = excluded.seo_title,
                  seo_description = excluded.seo_description, cover_image = excluded.cover_image,
                  deleted_at = NULL
                """,
                (
                    article_id,
                    article["slug"],
                    article["title"],
                    article["excerpt"],
                    category_ids.get(article["category"]),
                    published_at,
                    published_at,
                    now,
                    article["tone"],
                    json.dumps(article["tags"], ensure_ascii=False),
                    article["bodyMarkdown"],
                    article["title"],
                    article["excerpt"],
                ),
            )
            conn.execute("DELETE FROM comments WHERE article_id = ? AND id LIKE ?", (article_id, "comment_test_%"))
            for index, comment in enumerate(article.get("comments", []), start=1):
                created_at = parse_date_label(comment["createdAt"])
                conn.execute(
                    """
                    INSERT INTO comments (id, article_id, author_name, content, status, ip_hash, user_agent, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'approved', '', 'seed-test-articles', ?, ?)
                    """,
                    (f"comment_test_{article['slug']}_{index}", article_id, comment["authorName"], comment["content"], created_at, created_at),
                )
    print(f"Seeded {len(TEST_ARTICLES)} test articles into Python backend database.")


if __name__ == "__main__":
    seed_test_articles()
