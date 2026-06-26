# app.py

> 源路径：`server_py/app.py`
> 总行数：约 1156 行

FastAPI 应用入口：装配中间件、暴露公开端点（site/articles/gallery/starfield/rss 等）、实现管理员认证、聚合所有管理端点（文章/栏目/专题/首页/图库/评论/标签/回收站/星图/指令/LLM/AI/草稿/运维）。

## 文件概览

`app.py` 是整个后端的"门面"——所有 HTTP 路由声明都在这里，但**业务逻辑几乎都不在这里**。它的角色是：

- **路由 + 参数校验 + 鉴权**：决定谁能访问、入参怎么解析、出参格式。
- **委托给业务模块**：所有数据库读写、AI 调用、指令解析、文件上传都委托给 `content.py` / `starfield.py` / `ai_agent.py` / `admin_commands.py`。
- **横切关注点**：CORS、安全头、CSRF、审计日志、限流、HTTPException 包装。

文件分七层：导入与全局状态、中间件、辅助函数、公开端点、管理员认证、管理端点（按业务域分组）、RSS/sitemap/robots。`main()` 在最末尾启动 uvicorn。

## 导入与全局状态

```python
sessions: dict[str, float] = {}
csrf_tokens: dict[str, str] = {}
rate_limits: dict[str, dict[str, float]] = {}
allowed_gallery_mime_types = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
max_gallery_image_bytes = 8 * 1024 * 1024

app = FastAPI()
```

三个进程内字典：

- `sessions`：token → 过期时间戳（毫秒）。简单的内存会话存储，重启即失效。
- `csrf_tokens`：token → CSRF token。写操作必须带匹配的 `x-csrf-token` 头。
- `rate_limits`：限流键 → `{count, resetAt}`。用于登录和评论。

`allowed_gallery_mime_types` 是上传白名单：只接受 jpg/png/webp/gif 四种图片格式。`max_gallery_image_bytes = 8MB` 是单图大小上限。

## 中间件：CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`cors_origins` 来自 `config.py`，开发态自动加上本地端口，生产由 `CORS_ORIGINS` 环境变量控制。`allow_credentials=True` 是为了让浏览器跨域请求带上 session cookie。

## 中间件：安全头

```python
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["x-frame-options"] = "DENY"
    response.headers["content-security-policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        ...
    )
    response.headers["referrer-policy"] = "strict-origin-when-cross-origin"
    response.headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["cross-origin-opener-policy"] = "same-origin"
    ...
```

每个响应都强制加一组安全头：

- `x-content-type-options: nosniff`：阻止 MIME 嗅探。
- `x-frame-options: DENY`：禁止被 iframe 嵌套（防点击劫持）。
- **CSP**：极严格策略——只允许同源 script/style，禁止外部资源、inline script、`object-src`、`frame-ancestors`。`style-src 'unsafe-inline'` 是 React 内联样式所必需的妥协。
- `permissions-policy`：禁用摄像头、麦克风、定位。
- `referrer-policy`：跨域只泄露 origin。
- `coep: same-origin`：跨源 opener 隔离。

JSON 响应还会被强制加上 `charset=utf-8`，避免某些客户端默认按 ASCII 解析中文。

## 中间件：审计日志

```python
@app.middleware("http")
async def admin_audit(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/admin") and request.method != "GET" and response.status_code < 400 and request.url.path != "/api/admin/login":
        try:
            with get_db() as conn:
                conn.execute("INSERT INTO admin_audit_log ...")
```

所有 `/api/admin/*` 非登录的写操作（status < 400，即成功）都会写一条审计日志到 `admin_audit_log` 表，记录：method、path、IP hash（SHA-256 哈希，不存原始 IP）、user-agent、时间。

故意排除 `/api/admin/login`（避免登录失败也被记录造成噪音）和失败的请求（错误已经会被 HTTPException 抛出，审计意义不大）。

## 辅助函数

```python
def base36(value: int) -> str: ...
def check_rate_limit(key: str, max_count: int, window_ms: int) -> bool: ...
def is_read_only(request: Request) -> bool: ...
def error(status_code: int, message: str) -> HTTPException: ...
def parse_int_form(value, field_name, fallback=0) -> int: ...
def read_today_almanac() -> dict[str, Any] | None: ...
```

- `base36`：把毫秒时间戳转成短字符串，用于生成 ID（避免长 UUID）。
- `check_rate_limit`：滑动窗口限流，返回 True 表示允许、False 表示超额。`rate_limits` 字典按 key（如 `comment:<ip>` / `login:<ip>`）记录窗口和计数。
- `error`：所有 `HTTPException` 创建走它，确保 detail 都是 `{"error": message}` 格式。

## 管理员认证（依赖注入）

```python
async def require_admin(
    request: Request,
    response: Response,
    guzhouyue_admin: str | None = Cookie(default=None),
):
    token = request.cookies.get(config.session_cookie_name) or guzhouyue_admin
    expires_at = sessions.get(token or "")
    if not token or not expires_at or expires_at < time.time() * 1000:
        ...
        raise HTTPException(status_code=401, detail={"error": "Admin login required"})
    if not is_read_only(request):
        csrf_token = csrf_tokens.get(token)
        submitted_token = request.headers.get("x-csrf-token")
        if not csrf_token or submitted_token != csrf_token:
            raise HTTPException(status_code=403, detail={"error": "Invalid CSRF token"})
    sessions[token] = time.time() * 1000 + config.session_ttl_ms
    return token
```

`require_admin` 是所有 `/api/admin/*` 端点的 FastAPI 依赖：

1. 从 cookie 读 token，未登录 → 401。
2. token 过期或不存在 → 401，同时清 cookie。
3. 写操作（非 GET/HEAD/OPTIONS）必须带匹配的 `x-csrf-token` 头，否则 403。
4. 每次访问都刷新 session 过期时间（滑动会话）。

这种"依赖注入"风格让所有管理端点只需要 `_token: str = Depends(require_admin)` 就自动获得认证 + CSRF 保护。

## 公开端点

公开端点不需要认证，任何人都能访问。

### health / site / almanac

```python
@app.get("/api/health")
async def health():
    return {"ok": True, "timestamp": now_iso()}

@app.get("/api/site")
async def public_site():
    return get_site_payload(read_today_almanac())

@app.get("/api/almanac/today")
async def today_almanac():
    almanac = read_today_almanac()
    if not almanac:
        raise error(503, "Almanac unavailable")
    return almanac
```

- `/api/health`：健康检查。
- `/api/site`：站点首屏所有静态配置（设置/首页/栏目/专题/黄历）。
- `/api/almanac/today`：单独的黄历接口，失败返回 503（不影响 `/api/site` 的其他字段）。

### 文章列表与详情

```python
@app.get("/api/articles")
async def articles(page=1, pageSize=10, category=None, tag=None, q=None):
    return list_articles({"page": page, "pageSize": pageSize, "category": category, "tag": tag, "q": q})

@app.get("/api/articles/{slug}")
async def article_detail(slug: str):
    article = get_article_by_slug(slug)
    if not article:
        raise error(404, "Article not found")
    ...
    return {"article": article, "previousPost": ..., "nextPost": ..., "commentCount": comment_count}
```

详情页除了文章本身，还查上一篇/下一篇和已审核评论数，让前端不需要发 4 个请求。

### 归档与搜索

```python
@app.get("/api/archive")
async def archive():
    groups: dict[str, list[dict[str, Any]]] = {}
    for article in list_articles({"page": 1, "pageSize": 1000})["items"]:
        ...
        month = f"{date.tm_year} 年 {date.tm_mon} 月"
        groups.setdefault(month, []).append(article)
    return {"months": [{"month": month, "entries": entries} for month, entries in groups.items()]}

@app.get("/api/search")
async def search(q="", page=1, pageSize=10):
    return list_articles({"q": q, "page": page, "pageSize": pageSize})
```

归档按"年-月"分组；搜索复用 `list_articles` 的 `q` 参数（在 `content.py` 里实现 LIKE 搜索）。

### 评论（公开 + 提交）

```python
@app.get("/api/articles/{slug}/comments")
async def article_comments(slug: str):
    ...
    rows = conn.execute("SELECT ... FROM comments WHERE article_id = ? AND status = 'approved' ORDER BY created_at ASC", ...)
    return {"items": [dict(row) for row in rows]}

@app.post("/api/articles/{slug}/comments", status_code=201)
async def submit_comment(slug: str, payload, request: Request):
    client_ip = request.client.host if request.client else ""
    if not check_rate_limit(f"comment:{client_ip}", 5, 60 * 1000):
        raise error(429, "Too many comments, please try again later")
    ...
```

公开评论列表只返回 `approved` 状态的评论；提交评论走限流（每 IP 每分钟最多 5 条）、字段长度校验、入库为 `pending` 状态等待审核。`ip_hash` 存 SHA-256 哈希，便于反垃圾统计但不留原始 IP。

### 图库与上传文件

```python
@app.get("/api/gallery")
async def gallery():
    items = [... for album in list_gallery_albums() if album["id"] != SYSTEM_GALLERY_ALBUM_ID and album["slug"] != SYSTEM_GALLERY_ALBUM_SLUG]
    return {"items": items}

@app.get("/api/uploads/gallery/{file_name}")
async def uploaded_gallery_file(file_name: str):
    safe_file_name = Path(file_name).name
    if safe_file_name != file_name or not safe_file_name.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        raise error(400, "Invalid file name")
    ...
```

公开图库**隐藏系统图库**（`album-moonlight` / `system`）。`/api/uploads/gallery/{file_name}` 用 `Path(file_name).name` 防路径穿越（如 `../foo.png` 会被拒绝）。

### 星图公开接口

```python
@app.get("/api/starfield")
async def public_starfield():
    return get_public_starfield()
```

只返回当前已发布版本的 accepted passages/relationships/deepPaths，且字段集合是"读者友好"版本（不带 status/reviewNote 等内部字段）。

## 管理员认证端点

```python
@app.post("/api/admin/login")
async def admin_login(payload, request, response):
    ...
    if payload.get("password") != config.admin_password:
        raise error(401, "Invalid password")
    token = secrets.token_hex(32)
    csrf_token = secrets.token_hex(32)
    sessions[token] = time.time() * 1000 + config.session_ttl_ms
    csrf_tokens[token] = csrf_token
    response.set_cookie(config.session_cookie_name, token, path="/", httponly=True, samesite="lax", secure=config.cookie_secure, max_age=max_age)
    response.set_cookie(config.csrf_cookie_name, csrf_token, path="/", httponly=False, samesite="lax", secure=config.cookie_secure, max_age=max_age)
    return {"ok": True}
```

登录有限流（每 IP 5 分钟最多 8 次）。成功后生成两个 32 字节随机 token：session token（httpOnly，前端 JS 读不到）+ CSRF token（前端可读，用于写操作时回传到 `x-csrf-token` 头）。

`logout` 清两个字典 + 删两个 cookie；`/api/admin/me` 仅用于"我是否还登录着"的探针。

## 管理端点：内容总览与运维

```python
@app.get("/api/admin/content")
async def admin_content(_token: str = Depends(require_admin)):
    return {
        "settings": get_site_settings(),
        "homepage": get_homepage(),
        "noteSections": list_note_sections(),
        "featuredSeries": list_featured_series(),
        "galleryAlbums": [...],
        "posts": list_articles({"page": 1, "pageSize": 1000, "includeDrafts": True})["items"],
    }

@app.get("/api/admin/ops")
async def admin_ops(_token: str = Depends(require_admin)):
    ...
    return {
        "api": {"ok": True, "timestamp": now_iso()},
        "database": {"ok": quick_check == "ok", "quickCheck": quick_check, "path": ..., "sizeBytes": size_bytes},
        "pendingComments": pending_comments,
        "latestPublished": ...,
        "recentAudit": read_audit_log(8),
        "llmTokenUsage": get_llm_token_usage_summary(),
    }
```

`/api/admin/content` 是管理台首屏一次性拉全所有可编辑数据。`/api/admin/ops` 是运维总览：数据库健康（`PRAGMA quick_check`）、文件大小、待审评论、最近发布、最近审计、LLM 用量汇总。

`/api/admin/audit`、`/api/admin/tasks` 分别返回审计日志和星图任务流水。

## 管理端点：星图（最大一组）

```python
@app.get("/api/admin/starfield/versions")
@app.post("/api/admin/starfield/versions")
@app.post("/api/admin/starfield/versions/incremental")
@app.get("/api/admin/starfield/versions/{version_id}")
@app.post("/api/admin/starfield/versions/{version_id}/generate-passages")
@app.post("/api/admin/starfield/versions/{version_id}/generate-relationships")
@app.post("/api/admin/starfield/versions/{version_id}/generate-deep-relationships")
@app.put("/api/admin/starfield/passages/{passage_id}")
@app.post("/api/admin/starfield/versions/{version_id}/passages/bulk")
@app.put("/api/admin/starfield/relationships/{relationship_id}")
@app.post("/api/admin/starfield/versions/{version_id}/relationships/bulk")
@app.put("/api/admin/starfield/deep-paths/{path_id}")
@app.post("/api/admin/starfield/versions/{version_id}/deep-paths/bulk")
@app.post("/api/admin/starfield/versions/{version_id}/publish")
@app.post("/api/admin/starfield/versions/{version_id}/archive")
@app.delete("/api/admin/starfield/versions/{version_id}")
```

所有星图端点都委托给 `starfield.py`。关键设计是**异步任务模式**：

```python
result = enqueue_starfield_passage_generation(version_id, [...])
background_tasks.add_task(run_starfield_passage_generation_job, result["jobId"])
return result
```

`enqueue_*` 同步建任务行并立即返回 jobId；`BackgroundTasks` 在响应发出后异步跑实际生成逻辑（调 LLM、写库）。前端用 jobId 轮询 `/api/admin/starfield/versions/{id}` 上的 jobs 数组拿进度。

`starfield_error()` 把 `ValueError` 转成 404（"not found"）或 400（其他），让前端拿到合理的 HTTP 状态码。

## 管理端点：管理员指令通道

```python
@app.get("/api/admin/commands")
@app.post("/api/admin/commands/parse")
@app.post("/api/admin/commands/run")
@app.post("/api/admin/commands/ai")
```

四个端点对应：

- `GET /commands`：返回指令手册（所有已注册指令）。
- `POST /commands/parse`：仅解析，不执行。
- `POST /commands/run`：解析 + 执行（带 dry-run/confirm 参数）。
- `POST /commands/ai`：自然语言 → AI 规划指令 → 逐条执行（`plan_admin_commands` 调 `ai_agent.py`，再循环 `run_admin_command`）。

`/commands/ai` 在循环里**遇到失败就 break**——避免一条规划错的指令把后续都执行了。

## 管理端点：图库（含上传）

```python
@app.get("/api/admin/gallery")
@app.post("/api/admin/gallery/albums")
@app.put("/api/admin/gallery/albums/{id_or_slug}")
@app.delete("/api/admin/gallery/albums/{id_or_slug}")
@app.post("/api/admin/gallery/albums/{id_or_slug}/images")
@app.post("/api/admin/gallery/images/{image_id}/file")
@app.put("/api/admin/gallery/images/{image_id}")
@app.delete("/api/admin/gallery/images/{image_id}")
```

图库端点的复杂点在于**系统图库保护**：`album-moonlight` 不能被改名、删除、新增图片；其图片只能被"替换文件"（`/file` 端点）。这避免了用户误删站点头像和首屏图导致整站视觉崩溃。

上传逻辑关键代码：

```python
extension = allowed_gallery_mime_types.get(image.content_type or "")
if not extension:
    raise error(400, "Unsupported image type")
buffer = await read_validated_gallery_image(image, extension)
```

`read_validated_gallery_image` 在 `max_gallery_image_bytes + 1` 上限读取（避免超大文件内存爆炸），并通过 `has_expected_image_signature` **校验文件头**——防止伪装 MIME 类型上传可执行文件：

```python
def has_expected_image_signature(buffer: bytes, extension: str) -> bool:
    if extension == "jpg":
        return len(buffer) >= 3 and buffer[0:3] in {b"\xff\xd8\xff"}
    if extension == "png":
        return len(buffer) >= 8 and buffer[:8] == b"\x89PNG\r\n\x1a\n"
    ...
```

这是 `smoke_test.py` 里"伪装 MIME 上传必须被拒绝"断言的执行点。

## 管理端点：文章 CRUD / 栏目 / 专题 / 评论 / 标签 / 回收站 / 草稿

| 端点前缀 | 作用 |
| --- | --- |
| `/api/admin/articles` | 文章 CRUD + 发布/取消发布 |
| `/api/admin/settings` | 站点设置（stylePreset/ownerName 等） |
| `/api/admin/homepage` | 首页文案 |
| `/api/admin/note-sections` | 栏目列表（整体替换） |
| `/api/admin/featured-series` | 专题列表（整体替换） |
| `/api/admin/comments` | 评论列表 + 状态审核 |
| `/api/admin/tags` | 标签列表 + 删除 + 合并 |
| `/api/admin/trash/articles` | 回收站 + 恢复 |
| `/api/admin/drafts/{draft_key}` | 编辑器自动保存草稿 |

`note-sections` 和 `featured-series` 用"整体替换"语义——前端发完整列表，后端 `DELETE FROM ... ` 再重新插入。这简化了"排序/重命名/删除合并成一个操作"的前端逻辑。`note-sections` 还会处理 slug 冲突（自动加 `-2`/`-3` 后缀）。

## 管理端点：LLM 配置与 AI Agent

```python
@app.get("/api/admin/llm-config")
@app.get("/api/admin/llm-token-usage")
@app.put("/api/admin/llm-config")
@app.post("/api/admin/llm-config/test")
@app.post("/api/admin/ai-agent/article-metadata")
```

`GET /llm-config` 默认 `redact_api_key=True`——返回时把 api_key 清空，只暴露 `apiKeyConfigured: bool` 标识"是否已配置"。`PUT` 时如果 `apiKey` 字段为空字符串，**保留原 key 不变**（让用户改其他字段时不用每次重输 key）。

`/llm-config/test` 调 `test_llm_connection()` 发一次最小 JSON 对话验证连通性。`/ai-agent/article-metadata` 调 `generate_article_metadata()` 给编辑器"自动生成标题/摘要"用。

`AiAgentError` 在所有这些端点都被捕获并转成对应 HTTP 状态码。

## RSS / sitemap / robots

```python
@app.get("/rss.xml")
async def rss():
    ...
    items = "".join(
        f"<item><title><![CDATA[{safe_cdata(article['title'])}]]></title>"
        f"<link>{escape(config.site_url + '/posts/' + quote(article['slug']))}</link>"
        ...
        for article in articles
    )
    ...

@app.get("/sitemap.xml")
@app.get("/robots.txt")
```

关键点：

- 所有链接用 `/posts/<slug>` 公开路由（不是 `/articles/`），这是和旧 TS 后端的契约。
- `<pubDate>` 用 RFC 822 格式（`Mon, 15 Jun 2026 09:00:00 GMT`），由 `rss_pub_date()` 用 `email.utils.format_datetime(usegmt=True)` 生成。
- `safe_cdata()` 防止 CDATA 注入——把 `]]>` 替换成 `]]]]><![CDATA[>`，让用户输入的标题/摘要里就算有 `]]>` 也不会破坏 RSS XML 结构。
- `robots.txt` 简单写"允许全部 + 指向 sitemap"。

## main 与启动

```python
def main() -> None:
    uvicorn.run("server_py.app:app", host=config.host, port=config.port, reload=False)

if __name__ == "__main__":
    main()
```

`python -m server_py.app` 会触发 `main()`，用 uvicorn 启动。`reload=False`——开发态需要热重载时直接用 `uvicorn server_py.app:app --reload`，避免脚本里硬编码 reload 行为。

## 备注

- `app.py` 故意保持"瘦"——所有业务逻辑都在 `content.py`/`starfield.py`/`ai_agent.py`/`admin_commands.py`，本文件只负责 HTTP 适配。
- `BackgroundTasks` 是 FastAPI 的内置机制，比 Celery 简单但**进程重启会丢失正在跑的任务**——所以 `starfield.py` 有 `_expire_stale_jobs` 把超时（30 分钟）的 pending/running 任务标记 failed，避免永远卡住。
- 想新增端点：选好业务模块（content/starfield/ai_agent），在 `app.py` 加路由 + Depends(require_admin) + 委托调用，遵循已有模式。
