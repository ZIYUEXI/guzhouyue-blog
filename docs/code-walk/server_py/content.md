# content.py

> 源路径：`server_py/content.py`
> 总行数：约 965 行

后端业务逻辑核心：文章查询/变更、栏目/专题/首页、相册/图片、评论、标签、回收站、LLM 配置与 token usage 等所有"非星图"业务的数据访问层。

## 文件概览

`content.py` 是后端最大的"业务数据访问"模块。`app.py` 里几乎所有非星图端点都委托给它。它的角色是：

- **行 → dict 转换**：把 SQLite Row 转成前端期望的 camelCase JSON（`to_article`、`_to_gallery_image` 等）。
- **业务规则**：slug 唯一性、软删除、tag 归一化、日期解析、栏目整体替换等。
- **SQL 集中地**：项目没有 ORM，所有手写 SQL 集中在这里，`app.py` 只调函数。

文件按业务域分块：工具函数、文章查询、标签、栏目/专题/首页、相册、图片、文章变更、回收站、LLM 配置、LLM token usage。

## 工具函数：slugify / make_id / parse_date_label

```python
def slugify(value: Any) -> str:
    normalized = re.sub(r"\s+", "-", str(value or "").strip().lower())
    normalized = re.sub(r"[^a-z0-9一-龥-]", "", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized or f"item-{int(time.time() * 1000)}"

def make_id(prefix: str) -> str:
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))
    return f"{prefix}_{base36(int(time.time() * 1000))}_{suffix}"

def parse_date_label(value: Any) -> str:
    ...
    match = re.match(r"^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?", text)
    if match:
        ...
        return datetime(int(year), int(month), int(day), int(hour or 0), int(minute or 0)).astimezone().isoformat()
```

三个被广泛使用的辅助函数：

- `slugify`：把任意字符串转成 URL 友好的 slug。保留小写 ASCII、数字、连字符、**中文**（`一-龥`），其他全去掉。无法生成 slug 时用时间戳兜底。
- `make_id`：生成 `{prefix}_{base36时间戳}_{8位随机}` 格式的 ID。同时被 `app.py` 和 `starfield.py` 引用。
- `parse_date_label`：把"2026.06.15 09:00"这种管理台输入格式转成 ISO。**注意**：这里用 `.astimezone()`（不带 tz 参数），意思是"按服务器本地时区解析"——这和 `admin_commands.py` 里"强制北京时间"不同，是历史遗留；`app.py` 的草稿保存走 `parse_date_label`，而指令系统走 `_parse_strict_command_date`。

`date_label` 是反向：把 ISO 转回 `YYYY.MM.DD` 的展示格式。

## 文章查询

```python
def to_article(row: Any) -> dict[str, Any]:
    body_markdown = row["body_markdown"] or ""
    return {
        "id": row["id"],
        "slug": row["slug"],
        ...
        "tags": json_parse(row["tags_json"], []),
        "body": re.split(r"\n{2,}", body_markdown) if body_markdown else [],
        "bodyMarkdown": body_markdown,
        ...
    }
```

`to_article` 是所有文章响应的统一转换器：

- 同时暴露 `body`（按空行切段落的数组，给前端 markdown 渲染器用）和 `bodyMarkdown`（原始字符串，给编辑器用）。
- `tags` 是 JSON 反序列化后的字符串数组。
- `date`/`dateLabel` 是格式化后的展示日期；`publishedAt` 是 ISO 原始值。

```python
def list_articles(options: dict[str, Any] | None = None) -> dict[str, Any]:
    ...
    clauses = ["a.deleted_at IS NULL"]
    if options.get("includeDrafts"):
        ...
    else:
        clauses.append("a.status = 'published'")
    if options.get("category"):
        clauses.append("(ns.slug = ? OR ns.name = ?)")
        ...
    if options.get("tag"):
        clauses.append("a.tags_json LIKE ?")
        params.append(f'%"{options["tag"]}"%')
    if options.get("q"):
        like = f'%{str(options["q"]).strip()}%'
        clauses.append("(a.title LIKE ? OR a.excerpt LIKE ? OR a.body_markdown LIKE ? OR ns.name LIKE ? OR a.tags_json LIKE ?)")
        ...
```

`list_articles` 是文章查询的统一入口，支持：

- **分页**：`page`/`pageSize`，pageSize 上限 1000。
- **过滤**：`category`（按 slug 或 name 匹配）、`tag`（JSON LIKE 匹配）、`q`（在标题/摘要/正文/分类/标签五个字段做 LIKE 搜索）。
- **草稿**：默认只返回 published，`includeDrafts=True` 时返回所有状态。

`tag` 用 `tags_json LIKE '%"tagname"%'` 而不是 JSON 函数——SQLite 的 JSON1 扩展不是默认开启的，LIKE 是最兼容的方案。

返回结构固定为 `{items, page, pageSize, pageCount, total}`，前端按这套契约做分页 UI。

## 标签

```python
def list_tags() -> list[dict[str, Any]]:
    ...
    tag_stats: dict[str, dict[str, Any]] = {}
    for row in rows:
        seen_in_article: set[str] = set()
        for tag in normalize_article_tags(json_parse(row["tags_json"], [])):
            stats = tag_stats.setdefault(tag, {...})
            stats["occurrenceCount"] += 1
            if tag not in seen_in_article:
                stats["articleCount"] += 1
                seen_in_article.add(tag)
```

标签不是独立表，而是从所有文章的 `tags_json` 字段聚合出来的。`list_tags` 区分 `articleCount`（有多少篇文章用了这个标签）和 `occurrenceCount`（标签在一篇文章里出现几次也计数，虽然 `normalize_article_tags` 已经去重过同一篇文章内的标签）。

```python
def delete_tag(tag_name: Any) -> dict[str, Any]:
    return rewrite_article_tags(lambda tags: [item for item in tags if item != tag])

def merge_tags(source_tag_name: Any, target_tag_name: Any) -> dict[str, Any]:
    return rewrite_article_tags(
        lambda tags: normalize_article_tags(target_tag if item == source_tag else item for item in tags)
    )
```

`delete_tag` / `merge_tags` 都走 `rewrite_article_tags`——一个高阶函数，传入"旧标签列表 → 新标签列表"的转换函数，遍历所有文章应用转换，并返回被改动的文章列表。这种设计让两个操作共享同一份事务逻辑。

## 栏目、专题、首页、站点设置

```python
def list_note_sections() -> list[dict[str, Any]]:
    ...

def get_site_settings() -> dict[str, Any]:
    ...
    return {
        "stylePreset": normalize_site_style_preset(row["style_preset"] if row else None),
        "ownerName": row["owner_name"] if row else "孤舟月",
        "ownerAvatarUrl": row["owner_avatar_url"] if row and "owner_avatar_url" in row.keys() else "",
        ...
    }

def get_homepage() -> dict[str, Any]:
    ...
    payload = json_parse(row["payload_json"] if row else "{}", {})
    payload["updatedAt"] = row["updated_at"] if row else now_iso()
    return payload

def list_featured_series() -> list[dict[str, Any]]:
    ...
```

- `list_note_sections`：所有栏目（人间札记/技术手记等），按 sort_order 排序。
- `get_site_settings`：单行站点设置。注意 `"owner_avatar_url" in row.keys()` 的防御性写法——这个列是后加的（通过 `_ensure_column` 迁移），老库可能没有这一列。
- `get_homepage`：首页文案以 JSON 存在 `payload_json` 里，直接整体读出来。
- `list_featured_series`：专题 + 每个专题的文章列表（通过 `featured_series_items` 关联表 JOIN）。

`get_site_payload` 把以上四个 + almanac 聚合成 `/api/site` 的响应。

## 相册

```python
SYSTEM_GALLERY_ALBUM_ID = "album-moonlight"
SYSTEM_GALLERY_ALBUM_SLUG = "system"

def _to_gallery_album(row: Any, images=None) -> dict[str, Any]:
    is_system = row["id"] == SYSTEM_GALLERY_ALBUM_ID or row["slug"] == SYSTEM_GALLERY_ALBUM_SLUG
    return {
        "id": SYSTEM_GALLERY_ALBUM_ID if is_system else row["id"],
        "slug": SYSTEM_GALLERY_ALBUM_SLUG if is_system else row["slug"],
        "title": "系统图库" if is_system else row["title"],
        ...
    }
```

系统图库是项目里的特殊概念：`album-moonlight` 是 seed 时种入的"系统图库"，存作者头像、首屏图等公共资产。`_to_gallery_album` 检测到这个 id/slug 时强制把 title 显示成"系统图库"、slug 显示成 `system`——这样无论数据库里实际叫什么，对外契约稳定。

```python
def list_gallery_albums(include_private: bool = False) -> list[dict[str, Any]]:
    public_sql = "" if include_private else "WHERE a.is_public = 1"
    ...
```

`include_private` 控制是否返回私有相册：公开端点（`/api/gallery`）不传，管理端点（`/api/admin/gallery`）传 True。

```python
def ensure_unique_gallery_slug(base_slug: str, current_album_id=None) -> str:
    next_slug = base_slug
    suffix = 2
    with get_db() as conn:
        while True:
            row = conn.execute("SELECT id FROM gallery_albums WHERE slug = ?", (next_slug,)).fetchone()
            if not row or row["id"] == current_album_id:
                return next_slug
            next_slug = f"{base_slug}-{suffix}"
            suffix += 1
```

slug 冲突时自动加 `-2`/`-3` 后缀。`ensure_unique_slug`（文章用）逻辑相同。

## 图片

```python
def create_gallery_image(album_id: str, input_data) -> dict[str, Any] | None:
    ...
    conn.execute("INSERT INTO gallery_images (...) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (...))
    return get_gallery_image(image_id)

def update_gallery_image_file(image_id: str, input_data) -> dict[str, Any] | None:
    ...
    conn.execute("UPDATE gallery_images SET image_url = ?, file_name = ?, mime_type = ?, size_bytes = ?, updated_at = ? WHERE id = ?", (...))
```

`create_gallery_image` 由 `app.py` 的上传端点调用，传入已经写好文件的 `imageUrl`/`fileName`/`mimeType`/`sizeBytes`。

`update_gallery_image_file` 是系统图库图片"替换文件"专用——只改文件相关字段，保留 title/description 等元信息。

`delete_gallery_image` 阻止删除系统图库的图片（`existing["albumId"] == SYSTEM_GALLERY_ALBUM_ID` 时返回 None）。

## 文章变更（create / update）

```python
def create_article(input_data: dict[str, Any]) -> dict[str, Any] | None:
    now = now_iso()
    title = str(input_data.get("title") or "未命名文章").strip()
    article_id = make_id("article")
    slug = ensure_unique_slug(slugify(input_data.get("slug") or title))
    status = input_data.get("status") or "draft"
    published_at = input_data.get("publishedAt") or (now if status == "published" else None)
    body_markdown = input_data.get("bodyMarkdown") or "\n\n".join(input_data.get("body") or []) or ""
    ...
```

`create_article` 处理几种输入灵活性：

- 缺 title 时用"未命名文章"。
- slug 缺失时从 title 生成，并保证唯一。
- publishedAt 缺失但 status=published 时用当前时间。
- body 可以是 `bodyMarkdown`（字符串）或 `body`（段落数组），后者用 `\n\n` 拼接。

`update_article` 类似，但只更新 input_data 里**实际出现**的字段（用 `input_data.get("key", existing["key"])` 模式）。`publishedAt` 在状态切到 published 且原本没有时自动补上。

## 回收站

```python
def list_deleted_articles() -> list[dict[str, Any]]:
    ...
    WHERE a.deleted_at IS NOT NULL
    ORDER BY a.deleted_at DESC, a.updated_at DESC
    """

def restore_article(identifier: str) -> dict[str, Any] | None:
    ...
    conn.execute("UPDATE articles SET status = CASE WHEN status = 'archived' THEN 'draft' ELSE status END, deleted_at = NULL, updated_at = ? WHERE id = ?", (...))
```

文章删除是软删除（`deleted_at` 字段）。`list_deleted_articles` 返回所有软删除的文章，`restore_article` 把 `deleted_at` 清空，并把 `archived` 状态恢复成 `draft`（不让恢复后的文章自动出现在公开列表）。

`app.py` 的 `DELETE /api/admin/articles/{id}` 端点直接执行 `UPDATE articles SET deleted_at = ?`，不调用 content.py——这是少数直接在 app.py 写 SQL 的地方。

## LLM 配置

```python
LLM_PROVIDER_DEFAULTS = {
    "deepseek": {"label": "DeepSeek", "model": "deepseek-v4-pro", "baseUrl": "https://api.deepseek.com"},
    "openai": {"label": "OpenAI", "model": "gpt-4.1", "baseUrl": "https://api.openai.com/v1"},
    "anthropic": {...},
    ...
    "custom": {"label": "自定义", "model": "deepseek-v4-pro", "baseUrl": ""},
}

def get_llm_settings(redact_api_key: bool = False) -> dict[str, Any]:
    ...
    return {
        "provider": provider,
        "model": row["model"] or defaults["model"],
        "baseUrl": row["base_url"] or defaults["baseUrl"],
        "apiKey": "" if redact_api_key else row["api_key"],
        "apiKeyConfigured": bool(row["api_key"]),
        "temperature": max(0, min(2, float(row["temperature"] or 0.7))),
        "enabled": bool(row["enabled"]),
        ...
    }
```

`LLM_PROVIDER_DEFAULTS` 是支持的 LLM 提供商及其默认配置。切换 provider 时如果用户没显式改 model/baseUrl，会回落到该 provider 的默认值。

`redact_api_key=True` 时返回的 `apiKey` 是空字符串，但 `apiKeyConfigured` 暴露"是否已配置"，让前端知道是否需要让用户重新输入。

`save_llm_settings` 处理"apiKey 为空时保留原值"——让用户改其他字段（如 temperature）时不用每次都重输 API key。

## LLM token usage

```python
def record_llm_token_usage(input_data: dict[str, Any]) -> None:
    ...
    conn.execute("INSERT INTO llm_token_usage (...) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (...))

def get_llm_token_usage_summary() -> dict[str, Any]:
    ...
    row = conn.execute("""
        SELECT
          COUNT(*) AS totalCalls,
          COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS successCalls,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failedCalls,
          COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
          ...
        FROM llm_token_usage
    """).fetchone()
```

- `record_llm_token_usage`：被 `ai_agent.py` 的 `_record_llm_usage` 调用，每次 LLM 调用（成功或失败）都记一条。
- `get_llm_token_usage_summary`：聚合统计（总调用数、成功/失败数、prompt/completion/total token 总和），给 `/api/admin/ops` 用。
- `list_llm_token_usage_page`：分页列表，给 `/api/admin/llm-token-usage` 用。
- `get_llm_token_usage_payload`：summary + 分页列表合并返回。

`_optional_token_count` 把任意值转成 `int | None`——SQLite 的 `SUM` 会忽略 NULL，但记一条无 usage 的记录时（比如 HTTP 错误前没拿到 usage），存 NULL 比 0 更准确。

## 备注

- 项目刻意没引入 ORM，所有 SQL 都是手写——好处是 SQL 完全可控、性能可预测；代价是 schema 改动需要同时改 SQL 和 `_ensure_column`。
- `to_article` / `_to_gallery_image` 这些转换器是行 → dict 的唯一入口，所有响应都过它们，确保字段命名（snake_case → camelCase）一致。
- `parse_date_label` 用了 `astimezone()` 不带 tz，依赖服务器本地时区——这是个历史决定；新代码（`admin_commands.py`）显式用 `BEIJING_TZ`。如果服务器时区不是 Asia/Shanghai，两条路径会产生不同的 ISO 时间。
