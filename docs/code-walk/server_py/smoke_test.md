# smoke_test.py

> 源路径：`server_py/smoke_test.py`
> 总行数：约 198 行

跑一遍关键 API 端点 + 安全/CSRF/RSS/审计契约的快速烟雾测试，任何一条断言失败就退出非零。

## 文件概览

`smoke_test.py` 是 `package.json` 的 `test:server` 脚本（`python -m server_py.smoke_test && python -m server_py.compat_test`）的第一阶段。它用 `fastapi.testclient.TestClient` 在进程内启动整个 `app`，跑一系列"端到端"的 HTTP 调用，验证：

1. 公开页面 API（`/api/health`、`/api/site`、`/api/articles`、`/api/articles/{slug}`、`/api/gallery`）能正常返回。
2. 管理员认证流程（登录、CSRF、写操作）能跑通。
3. 安全契约（匿名拒绝、CSRF、文件上传校验、系统图库保护、安全响应头）成立。
4. RSS / sitemap 路由规范符合公开 URL 形态（`/posts/...`）。

它**不**重置数据库——`smoke_test.py` 直接对当前库跑断言，所以适合"开发完一波改动后回归"用。要完整契约测试应跑 `compat_test.py`（会在临时数据库里重新 seed）。

## 流程概览

```python
client = TestClient(app)
health = client.get("/api/health")
site = client.get("/api/site")
articles = client.get("/api/articles")
first_article_slug = (articles.json().get("items") or [{}])[0].get("slug", "")
detail = client.get(f"/api/articles/{first_article_slug}")
...
```

测试用"从 `/api/articles` 拿到的第一篇文章 slug"作为后续 `detail` / 指令 / 文章元数据生成的输入，避免硬编码 slug。这是 smoke test 的核心策略——**用现有库的真实数据验证 API**，而不是重建已知夹具。

## 匿名 vs 已登录的双轮调用

```python
admin_gallery_anonymous = client.get("/api/admin/gallery")
admin_commands_anonymous = client.get("/api/admin/commands")
admin_token_usage_anonymous = client.get("/api/admin/llm-token-usage")

login = client.post("/api/admin/login", json={"password": config.admin_password})
csrf_token = client.cookies.get(config.csrf_cookie_name, "")
write_headers = {"x-csrf-token": csrf_token}
```

测试刻意先用匿名身份请求一遍管理员端点（应被拒绝），再登录、从 cookie 里拿 CSRF token，挂到 `x-csrf-token` 请求头上做写操作。这模拟了真实浏览器流程，把"401 拒绝"和"CSRF 通过"两条路径都覆盖到。

## 管理员指令的 dry-run + 真实执行

```python
admin_command_parse = client.post("/api/admin/commands/parse", json={"input": f"article:set-date {first_article_slug} --date={first_article_published_at}"}, headers=write_headers)
admin_command_run = client.post("/api/admin/commands/run", json={"input": f"article:set-date {first_article_slug} --date={first_article_published_at}"}, headers=write_headers)
admin_command_list_ids = client.post("/api/admin/commands/run", json={"input": "article:list-ids"}, headers=write_headers)
admin_command_get_content = client.post("/api/admin/commands/run", json={"input": f"article:get-content {first_admin_article_id}"}, headers=write_headers)
admin_command_set_title = client.post("/api/admin/commands/run", json={"input": f'article:set-title {first_admin_article_id} --title="{first_admin_article_title}"'}, headers=write_headers)
```

注意这些指令的输入值都来自真实数据：`first_article_slug`、`first_admin_article_id`、`first_admin_article_title` 都是从前面 API 响应里挖出来的，所以测试本身和库的具体内容无关。把日期设回原文档原始值，等价于"幂等修改"，不会破坏数据。

## LLM 降级路径

```python
client.put("/api/admin/llm-config", json={**existing_llm_config_payload, "enabled": False}, headers=write_headers)
ai_agent_disabled = client.post("/api/admin/ai-agent/article-metadata", json={...}, headers=write_headers)
client.put("/api/admin/llm-config", json=existing_llm_config_payload, headers=write_headers)
```

故意把 LLM 配置临时关掉，再请求一次 AI 元数据生成，验证服务在 LLM 不可用时会返回 `503`，**且不会发起外部网络请求**。然后把配置还原。这条断言确保了"LLM 未配置/被禁用时不会泄漏 API key、不会发外部请求"的安全契约。

## 上传安全与系统图库保护

```python
invalid_upload = client.post("/api/admin/gallery/albums/moonlight/images", files={"image": ("note.txt", b"not an image", "text/plain")}, headers=write_headers)
malformed_sort_order_upload = client.post("...", data={"sortOrder": "not-a-number"}, files={"image": ("note.png", b"not an image", "image/png")}, headers=write_headers)
spoofed_image_upload = client.post("...", files={"image": ("note.png", b"not an image", "image/png")}, headers=write_headers)
system_album_delete = client.delete("/api/admin/gallery/albums/album-moonlight", headers=write_headers)
system_image_delete = client.delete("/api/admin/gallery/images/image-guzhouyue-avatar", headers=write_headers)
```

四类上传攻击：纯文本、错误的 sortOrder、把扩展名伪装成 png 但内容不是 PNG、试图删系统图库和系统头像。全部期望被 400 拒绝。这部分对应 `app.py` 上传路由里的 MIME 校验、sortOrder 数字解析、`is_protected_system_album()` 检查。

## RSS / sitemap / robots 路由契约

```python
"rssUsesPostsRoute": "/posts/" in rss.text and "/articles/" not in rss.text,
"rssHasRfc822PubDate": bool(re.search(r"<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT</pubDate>", rss.text)),
"sitemapUsesPostsRoute": "/posts/" in sitemap.text and "/articles/" not in sitemap.text,
```

RSS 和 sitemap 必须使用对读者公开的 `/posts/<slug>` 路由（不是 `/articles/<slug>`），并且 `<pubDate>` 必须是 RFC 822 格式（`Mon, 15 Jun 2026 09:00:00 GMT`）。这是和历史 TS 后端保持兼容的公开 URL 契约，前端 SEO、订阅器、搜索引擎都依赖它。

## 期望与失败输出

```python
expectations = [
    ("health endpoint is available", result["health"] == 200),
    ("anonymous admin gallery is rejected", result["adminGalleryAnonymous"] == 401),
    ...
]
failures = [name for name, passed in expectations if not passed]
if failures:
    print("Smoke test failed:\n- " + "\n- ".join(failures), file=sys.stderr)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(1)
```

所有断言统一通过 `expectations` 列表组织，失败时打印失败的名称列表 + 完整 result JSON 供排查，并以非零退出码退出。这种"先收集所有结果再统一判断"的模式比一发现失败就 raise 更友好——能一次看到所有问题。

## 备注

- `smoke_test.py` 不重置数据库，所以本地跑前最好 `seed:server` + `seed:test-articles` 一次，确保有数据可测。
- 它和 `compat_test.py` 互补：smoke 测"快速契约"，compat 测"完整业务流（包括星图三阶段、增量版本、文章 CRUD 全周期）"。
- 想新增一条契约，往 `result` 字典里加字段 + 在 `expectations` 列表里加一条断言即可。
