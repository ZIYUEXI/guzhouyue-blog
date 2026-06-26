# seed_test_articles.py

> 源路径：`server_py/seed_test_articles.py`
> 总行数：约 221 行

为兼容/烟雾测试种入一组覆盖各种渲染边界（Markdown、代码块、公式、长文、长标题等）的测试文章和栏目。

## 文件概览

`seed_test_articles.py` 不是给生产数据库用的——它是 `compat_test.py` 的前置数据源，由 `package.json` 的 `seed:test-articles` 脚本（`python -m server_py.seed_test_articles`）触发，也被 `compat_test.py` 在临时数据库里直接 import 调用。

它解决的问题是：端到端测试需要"已知答案的文章"——既能验证渲染（公式、代码块、表格），又能验证搜索（每篇文章嵌入唯一 `SearchNeedleXxx` 关键词），还能验证首页主推卡片的标题排版（短/中/长/无空格）。这些文章用普通 `seed.py` 不合适，因为它们只是测试夹具。

## 测试栏目

```python
CATEGORY_DESCRIPTIONS = {
    "功能测试": "验证前台与渲染",
    "技术笔记": "记录前端、后端、工程化与系统设计实践。",
    "人间札记": "放置日常观察、写作片段和生活记录。",
    "读书摘录": "整理阅读笔记、摘录与二次思考。",
    "山水游踪": "记录旅行、城市漫游与自然观察。",
}
```

五个栏目覆盖了真实站点会用到的所有内容方向。注意"功能测试"的 `sort_order` 是 900（高于 `seed.py` 默认栏目的 100），让它排在列表最后，不会污染真实栏目顺序：

```python
INSERT INTO note_sections (...) VALUES (?, ?, ?, ?, 900 if category == "功能测试" else 100, ?, ?)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, ...
```

这里和 `seed.py` 不同：用 `ON CONFLICT DO UPDATE` 而不是 `DO NOTHING`，因为测试需要每次运行都刷新成最新数据，保证测试可重复。

## 测试文章矩阵

`TEST_ARTICLES` 列出了 13 篇文章，每篇对应一类验证目标：

| slug | 覆盖点 |
| --- | --- |
| `test-markdown-kitchen-sink` | 标题、列表、任务列表、引用、表格、行内代码；含 `SearchNeedleAlpha` |
| `test-code-blocks-and-highlight` | TS/CSS/Shell/JSON 代码块；含 `SearchNeedleCode` |
| `test-math-formulas` | 行内 + 块级公式（KaTeX）；含 `SearchNeedleMath` |
| `test-long-article-pagination-reading` | 14 段长文 + 两条已审核评论；含 `SearchNeedleLong` |
| `test-image-and-media` | 站内图片 + alt 文本；含 `SearchNeedleImage` |
| `test-title-tags-search-edge-cases` | 长/混合标签/英文数字；含 `SearchNeedleEdge` |
| `test-category-filter-reading-notes` | 分类筛选（读书摘录）；含 `SearchNeedleCategory` |
| `test-draft-like-but-published` | 公开接口只展示已发布文章；含 `SearchNeedlePublished` |
| `test-featured-short-title` | 首页主推短标题排版 |
| `test-featured-medium-title` | 首页主推中等标题 |
| `test-featured-long-chinese-title` | 超长中文标题 |
| `test-featured-long-english-title` | 超长英文标题 |
| `test-featured-unbroken-title` | 无空格长串标题 |

每篇文章都嵌入一个唯一的 `SearchNeedleXxx` 关键词，让 `compat_test.py` 的 `/api/search?q=SearchNeedleAlpha` 之类断言可以精确命中。这是测试文章最重要的设计约定——新增文章时不要复用别人的 needle。

## 同步评论

```python
conn.execute("DELETE FROM comments WHERE article_id = ? AND id LIKE ?", (article_id, "comment_test_%"))
for index, comment in enumerate(article.get("comments", []), start=1):
    ...
    INSERT INTO comments (id, article_id, author_name, content, status, ip_hash, user_agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'approved', '', 'seed-test-articles', ?, ?)
```

部分文章带 `comments` 数组（kitchen-sink 和长文）。每次重 seed 都会先按 `id LIKE 'comment_test_%'` 删掉旧测试评论，再插新的，保证状态稳定。这些评论 `status='approved'`、`user_agent='seed-test-articles'`，方便在数据库里识别为测试数据。

## 文章 UPSERT

```python
INSERT INTO articles (...) VALUES (...)
ON CONFLICT(slug) DO UPDATE SET title = excluded.title, ..., deleted_at = NULL
```

文章以 `slug` 为唯一键 upsert，每次运行都把字段刷新成测试夹具的最新版。`deleted_at = NULL` 是个细节：如果上一轮测试把文章删进了回收站，重新 seed 时会把它"恢复"成正常状态，避免下次测试因为残留软删除标记失败。

## 备注

- 测试文章的 `publishedAt` 全部固定在 `2026.05.19` - `2026.05.21` 之间，方便用 `--date=today` 之外的固定日期断言。
- 这组文章**不应该**进入生产数据库。生产部署脚本不要执行 `seed:test-articles`。
- 如果新增了 `SearchNeedleXxx` 关键词，记得在 `compat_test.py` 的 `client.get("/api/search?q=...")` 断言里同步引用。
