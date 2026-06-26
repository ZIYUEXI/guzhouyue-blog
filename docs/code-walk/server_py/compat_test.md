# compat_test.py

> 源路径：`server_py/compat_test.py`
> 总行数：约 537 行

最完整的端到端契约测试：在临时数据库里 seed 默认 + 测试数据，覆盖公开 API、管理台 CRUD、星图三阶段、增量版本、指令系统、图库上传、评论审核等全部业务流。

## 文件概览

`compat_test.py` 是 `package.json` 的 `test:server` 脚本的第二阶段。它和 `smoke_test.py` 的关键区别在于：

1. **完全隔离的临时数据库**：用 `tempfile.TemporaryDirectory` 创建临时目录，把 `DATABASE_PATH`/`GALLERY_UPLOAD_DIR` 重定向过去，跑完自动清理。
2. **显式 seed**：调用 `seed()` + `seed_test_articles()`，确保测试夹具完整可控。
3. **断言数量大**：60+ 条 `check(...)` 覆盖几乎所有 API 契约，包括星图三阶段全流程和增量父子版本。

`compat_test.py` 是"改动后端后跑一遍最稳的回归"——它捕获的是"和上一版本契约不一致"的回归。

## 临时数据库隔离

```python
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
```

注意几个关键点：

- `os.environ` 设置在 `from .app import app` **之前**——`config.py` 在 import 时已经 `load_config()` 完成读取，所以必须先把环境变量改掉，再 import app，否则 `config.database_path` 仍然指向真实库。
- `seed()` 和 `seed_test_articles()` 在临时库里种入默认栏目、首页文案、测试文章。
- `TemporaryDirectory` 的 `with` 退出时整个目录会被删除，无论测试成功还是抛异常。

## check 模式

```python
checks: list[tuple[str, bool, Any]] = []

def check(name: str, passed: bool, detail: Any = None) -> None:
    checks.append((name, passed, detail))
```

每条断言记录 (名字, 是否通过, 详情)。所有 HTTP 调用完成后统一汇总失败项并抛错：

```python
failures = [{"name": name, "detail": detail} for name, passed, detail in checks if not passed]
summary = {"checks": len(checks), "failures": failures}
print(json.dumps(summary, ensure_ascii=False, indent=2))
if failures:
    raise SystemExit(1)
```

这种"全部跑完再判断"模式让一次测试能看到所有失败，而不是被第一个 raise 中断。

## 公开 API 契约（前半段）

前 18 条 check 验证公开 API：

- `/api/health` 返回 `{ok: true}`。
- `/api/site` 包含旧契约字段（`settings`/`homepage`/`noteSections`/`featuredSeries`/`almanac`）。
- `/api/articles` 分页结构（`items`/`page`/`pageSize`/`pageCount`/`total`）。
- 详情页有 `previousPost`/`nextPost`/`commentCount`。
- `/api/archive` 按月归档。
- `/api/search` 命中 `SearchNeedleAlpha`。
- 分类/标签筛选、404 JSON 错误、评论只返回 approved、公开图库不显示系统相册、RSS/sitemap/robots 路由契约。

这些是"和上一代 TS 后端公开 API 完全一致"的契约。

## 管理员认证与 CSRF

```python
with TestClient(app) as anonymous_client:
    admin_anonymous = anonymous_client.get("/api/admin/content")
    csrf_missing = anonymous_client.put("/api/admin/settings", json={"stylePreset": "cyber"})

login = client.post("/api/admin/login", json={"password": config.admin_password})
csrf_token = client.cookies.get(config.csrf_cookie_name, "")
write_headers = {"x-csrf-token": csrf_token}
```

`with TestClient(app)` 启动一个新的独立 client（独立的 cookie jar），用它来验证"匿名访问 `/api/admin/content` 必须返回 401"和"没有 CSRF token 的写操作必须返回 401/403"。然后主 client 登录拿到 CSRF token，后续所有写操作都挂 `x-csrf-token` 头。

## 星图三阶段 + 增量版本（最复杂的部分）

整个 `compat_test.py` 约一半篇幅在测星图：

```python
starfield_version = client.post("/api/admin/starfield/versions", json={"name": "兼容星图"}, ...)
starfield_passages = client.post(f".../generate-passages", json={"articleIds": starfield_article_ids}, ...)
```

之后用轮询循环等任务完成：

```python
for _ in range(30):
    starfield_passages = client.get(f".../versions/{version_id}", ...)
    ...
    if final_job.get("status") in {"succeeded", "failed"}:
        break
    time.sleep(0.05)
```

每 50ms 轮询一次任务状态，最多 30 次。然后断言：

- 任务最终 `succeeded`，`progressCurrent == progressTotal`。
- LLM 未配置时记录 `本地规则兜底` 的 errorMessage。
- 生成的 passages 数量 ≥ 2。
- 接受 passage 后能跨文章共享 keyword（`CompatSharedStarfieldKeyword`）。
- Canonical keywords 把这个共享 keyword 合并成至少 2 个 passage。
- Relationships 有 evidence keywords、有跨文章关系、同文章关系默认 hidden。
- Deep paths 任务在没有 LLM 时报"LLM"错误。
- Deep paths 任务的 `progressTotal` 等于"按 6 个 passage 一批 + 3 步固定开销"的预期值。
- `/api/admin/tasks` 暴露通用任务源（`sourceType=starfield`、`sourceName=...`）。

然后测增量版本：

```python
incremental_starfield = client.post("/api/admin/starfield/versions/incremental", json={"name": "兼容增量星图", "parentVersionId": starfield_version_id}, ...)
```

断言增量版本继承父版本的 accepted passages（`originPassageId`）、accepted relationships（`changeState=inherited`），重新生成 relationships 后父版本被 reconfirmed（`changeState=reconfirmed` 且 rationale 保持一致）。

发布版本后测公开 `/api/starfield`：

```python
public_starfield_relationship_shape_ok = all(
    "status" not in item and "reviewNote" not in item and "evidenceKeywords" not in item
    and all(key in item for key in ["id", "sourcePassageId", "targetPassageId", "relationshipType", "relationshipLabel", "rationale", "strength", "isCrossArticle"])
    for item in public_starfield_relationships
)
```

公开形态必须**剥离**所有审核字段（`status`/`reviewNote`/`evidenceKeywords`），只暴露对读者友好的字段（包括把 `relationshipType` 翻译成 `relationshipLabel`）。这是契约的核心——读者不应该看到任何"草稿/审核"痕迹。

## 文章 CRUD / 草稿 / 回收站

```python
created = client.post("/api/admin/articles", json=create_article_payload, ...)
updated = client.put("/api/admin/articles/compat-created-article", ...)
published = client.post("/api/admin/articles/compat-created-article/publish", ...)
public_created = client.get("/api/articles/compat-created-article")
unpublished = client.post("/api/admin/articles/compat-created-article/unpublish", ...)
public_unpublished = client.get("/api/articles/compat-created-article")
deleted = client.delete("/api/admin/articles/compat-created-article", ...)
trash = client.get("/api/admin/trash/articles")
restored = client.post("/api/admin/trash/articles/compat-created-article/restore", ...)
```

完整覆盖：创建 → 更新 → 发布 → 公开能见 → 取消发布 → 公开 404 → 软删除 → 进回收站 → 恢复。同时验证草稿的 save/get/delete/missing 周期。

## 管理员指令解析与执行

```python
command_parse = client.post("/api/admin/commands/parse", json={"input": 'article:set-title article_test-markdown-kitchen-sink --title="兼容标题"'}, ...)
command_dry = client.post("/api/admin/commands/run", json={"input": "article:list-ids", "dryRun": True}, ...)
command_unknown = client.post("/api/admin/commands/run", json={"input": "content:missing"}, ...)
command_get = client.post("/api/admin/commands/run", json={"input": "article:get-content article_test-markdown-kitchen-sink"}, ...)
command_date = client.post("/api/admin/commands/run", json={"input": "article:set-date test-markdown-kitchen-sink --date=\"2026.06.09 18:30\""}, ...)
command_today = client.post("/api/admin/commands/run", json={"input": "article:list --date=today"}, ...)
command_bulk_month = client.post("/api/admin/commands/run", json={"input": "article:set-date-bulk article_test-markdown-kitchen-sink --month=\"2026-04\""}, ...)
```

七条核心断言验证指令系统的所有状态：`parse` 成功、`dryRun` 返回 `dry_run` 状态、未知指令返回 `unknown_command`、`article:get-content` 能拿到正文、`article:set-date` 把北京时间解析成 UTC（`2026-06-09T10:30:00Z`）、`--date=today` 能列出今天的文章、`--month=2026-04` 批量移动保留原日时。

## 评论审核与图库上传

```python
admin_comments = client.get("/api/admin/comments?status=pending")
approve = client.put(f"/api/admin/comments/{pending_id}", json={"status": "approved"}, ...)
public_after_approve = client.get("/api/articles/test-markdown-kitchen-sink/comments")
invalid_comment_status = client.put(f"/api/admin/comments/{pending_id}", json={"status": "bad"}, ...)
missing_comment_status = client.put("/api/admin/comments/not-found", json={"status": "approved"}, ...)
```

待审评论进 `/api/admin/comments`，批准后能被公开 `/api/articles/.../comments` 看到，非法状态值返回 400，不存在的评论 ID 返回 404。

图库部分覆盖：创建私有相册只对管理员可见、系统相册不能改名、相册更新、PNG 上传 + 静态服务 + 元信息更新、删除相册级联删除图片。

## 备注

- `compat_test.py` 比较慢（包含 ~6 个星图任务的轮询等待），但仍是秒级，因为 `time.sleep(0.05)` 只在轮询间隙触发。
- 任何对 API 响应 schema 的改动都需要同步更新这里的 check，否则会被卡住。
- 测试用 `ADMIN_PASSWORD=compat-admin`，所以即便生产管理员密码被泄漏也不影响测试运行。
