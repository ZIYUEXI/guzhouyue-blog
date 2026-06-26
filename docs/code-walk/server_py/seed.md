# seed.py

> 源路径：`server_py/seed.py`
> 总行数：约 140 行

首次启动时种入"最小可运行"的默认数据：两个栏目、一篇示例文章、站点设置、首页文案、一个公共图库。

## 文件概览

`seed.py` 由 `package.json` 的 `seed:server` 脚本（`python -m server_py.seed`）调用，也可以在 `compat_test.py` 这类端到端测试里被显式调用。它的目标是**让一个全新的数据库立刻能跑起来**：起前端、登录管理台、看到首页和示例文章都不应该需要先手动填数据。

种子数据是幂等的：所有插入都先 `SELECT COUNT(*)` 或 `ON CONFLICT DO NOTHING`，重复执行只会保留最早一次的数据，不会重复堆叠。这是为了支持开发时反复 `reset`。

## 默认数据

```python
DEFAULT_HOMEPAGE = {"siteName": "孤舟月", "siteTagline": "在技术、文字和日常之间靠岸.", ...}
DEFAULT_SECTIONS = [
    {"category": "人间札记", "description": "日常、观察与长短句。"},
    {"category": "技术手记", "description": "工程实践、系统设计与工具使用。"},
]
DEFAULT_POST = {"slug": "python-backend-takes-over", "title": "Python 后端接管记录", ...}
```

三组默认值各自覆盖一个最小集合：

- **`DEFAULT_SECTIONS`**：两个最常用栏目，覆盖人文和技术两大方向。
- **`DEFAULT_POST`**：一篇宣布"Python 后端接管"的示例文章，状态 `published`，让公开页非空。
- **`DEFAULT_HOMEPAGE`**：首页文案（站点名、Hero 标题、CTA 按钮文案）。

`DEFAULT_POST` 是项目演化历史的化石——它就是当年后端从 TypeScript 迁到 Python 时发布的"通告文章"。

## 写入栏目与文章（仅当空表）

```python
existing_sections = conn.execute("SELECT COUNT(*) AS count FROM note_sections").fetchone()["count"]
if existing_sections == 0:
    for index, section in enumerate(DEFAULT_SECTIONS):
        conn.execute("INSERT INTO note_sections ... VALUES (?, ?, ?, ?, ?, ?, ?)", (...))
```

`note_sections` 表空时才插入默认栏目。一旦表里有任何数据（哪怕是用户手动加的），就不再触碰。文章同理：

```python
existing_articles = conn.execute("SELECT COUNT(*) AS count FROM articles").fetchone()["count"]
if existing_articles == 0:
    ...
```

这保证了"重新 seed 不会覆盖用户已经创建的内容"，是 seed 与 migration 之间的关键区别。

`DEFAULT_POST` 写入时会调用 `parse_date_label(DEFAULT_POST["date"])` 把 `"2026.06.15 09:00"` 转换成 UTC ISO 时间戳，复用 `content.py` 的统一日期解析逻辑（见 `server_py/content.md`）。

## 站点设置、首页文案、图库（幂等 UPSERT）

```python
conn.execute(
    """
    INSERT INTO site_settings (id, style_preset, color_scheme, owner_name, owner_avatar_url, updated_at)
    VALUES ('site', 'classic', 'light', '孤舟月', '/images/guzhouyue-avatar.png', ?)
    ON CONFLICT(id) DO NOTHING
    """,
    (now,),
)
```

站点设置、首页文案、`album-moonlight` 图库和三张系统图片（作者头像、首屏图、赛博月色）都用 `ON CONFLICT(id) DO NOTHING`：第一次写入后，再次运行 seed 不会覆盖用户改过的设置。

`album-moonlight` 是被 `app.py` / `smoke_test.py` 特殊保护的"系统图库"，不能删除、不能重命名，所以必须 seed 进去：

```python
INSERT INTO gallery_albums (..., id, slug, title, ...) VALUES ('album-moonlight', 'moonlight', '月下图存', ...)
```

`gallery_images` 子查询同样用 `gallery_exists` 检查，避免图库被删后 seed 又把图片加回来。

## 总结输出

```python
print(f"Seed complete: {article_count} articles, {section_count} note sections.")
```

最后打印当前数量，方便开发态快速核对结果。注意它统计的是**当前**库里的总数，而不是本次插入的数量，所以即使 seed 跳过了所有插入，输出也会反映库的最终状态。

## 备注

- 这里的 `slug`、`id` 都用 `f"section_{slugify(...)}"`、`f"article_{DEFAULT_POST['slug']}"` 模板，和 `content.py` 里的 `make_id()` 生成规则保持一致。如果改了 `slugify` 规则，需要重新评估是否会影响已有库里的 seed 记录。
- `seed.py` 不写 `comments`、`featured_series`、`llm_settings`、`starfield_*` 这些表：评论需要管理员审核流程，专题和星图由管理台创建，LLM 配置由管理台填写。
