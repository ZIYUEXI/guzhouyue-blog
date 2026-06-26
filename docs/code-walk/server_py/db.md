# db.py

> 源路径：`server_py/db.py`
> 总行数：约 334 行

定义 SQLite 数据库的全部表结构、连接管理、时间/JSON 辅助函数，以及历史列的渐进式迁移。

## 文件概览

`db.py` 是整个后端唯一与 SQLite 直接对话的模块。`content.py`、`admin_commands.py`、`starfield.py`、`seed*.py`、`app.py` 里所有数据库读写都通过这里导出的 `get_db()` 上下文管理器拿到连接，因此连接参数、`PRAGMA`、事务边界、表 schema 的真理都集中在这一个文件。

文件本体分四块：

1. `SCHEMA_SQL`：所有表的 `CREATE TABLE IF NOT EXISTS` 定义。
2. `now_iso()` / `json_parse()`：被广泛使用的格式化辅助函数。
3. `connect()` / `get_db()`：连接工厂和事务上下文。
4. `ensure_schema()` / `_ensure_column()`：建表 + 给旧库补列的兼容迁移。

文件末尾直接执行 `ensure_schema()`，因此**导入这个模块即建表**，调用方（`app.py` 启动）只需要 `from .db import get_db` 即可保证库结构就绪。

## 时间与 JSON 辅助

```python
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def json_parse(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback
```

- `now_iso()`：UTC、毫秒精度、`Z` 结尾。这是全后端统一的"创建时间"格式，前端和管理端读到的 `createdAt`/`updatedAt` 都来自这里。
- `json_parse()`：所有 `*_json` 字段（如 `tags_json`、`keywords_json`）的反序列化都走它，遇到空值或损坏 JSON 时返回 fallback（通常是空列表/空字典），避免脏数据炸服务。

## 连接管理与 WAL

```python
def connect() -> sqlite3.Connection:
    Path(config.database_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.database_path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

关键点：

- **自动建目录**：数据库文件所在目录可能不存在（全新部署），`mkdir(parents=True, exist_ok=True)` 直接补上。
- **WAL 模式**：让 SQLite 支持"读写并发"，避免一个写操作阻塞整个站点。
- **外键开启**：`PRAGMA foreign_keys = ON` 是 SQLite 默认关闭的，必须显式开，否则 `ON DELETE CASCADE`、`ON DELETE SET NULL` 都不生效。
- **`row_factory = sqlite3.Row`**：让查询结果像字典一样按列名取值，业务代码大量依赖 `row["id"]`。
- **事务边界**：`get_db()` 是个上下文管理器，正常退出 commit，异常 rollback，最后一定 close，避免连接泄露。

调用方式几乎是固定的：

```python
with get_db() as conn:
    conn.execute("INSERT INTO articles ...", (...))
```

## SCHEMA_SQL：核心业务表

`SCHEMA_SQL` 字符串里写了所有 `CREATE TABLE IF NOT EXISTS`，下面按业务域归类。

### 内容核心

- **`note_sections`**：栏目（人间札记、技术手记等）。`slug` 唯一，被文章作为 `category_id` 外键引用。
- **`articles`**：文章。主存储 `body_markdown`、`excerpt`、`tone`（视觉风格）、`tags_json`（标签以 JSON 数组形式存在一列里）、`status`（`draft`/`published`/`archived`）、`published_at`、`deleted_at`（软删除标记）。
- **`featured_series` / `featured_series_items`**：专题（首页主推的"系列文章"）。`series_items` 是 (series, article, sort_order) 三元组，外键级联删除。

### 站点设置与首页

- **`site_settings`**：站点全局设置（风格预设、配色、站长名）。单行结构，主键固定为 `'site'`。
- **`homepage_copy`**：首页文案（`siteName`、`heroTitle` 等）。`payload_json` 存整段 JSON。

### 评论与草稿

- **`comments`**：访客评论。`status` 默认 `pending`，需要管理员审核才能进公开列表。`ip_hash`/`user_agent` 用于反垃圾审计。
- **`composer_drafts`**：编辑器自动保存的草稿快照，主键 `draft_key`，可选关联 `article_id`。

### 相册

- **`gallery_albums`**：相册。`is_public` 决定是否出现在公开图库；`slug` 唯一。
- **`gallery_images`**：图片。`image_url` 指向 `/api/uploads/gallery/...` 静态服务，`mime_type`/`size_bytes`/`captured_at` 保留元信息。删除相册会级联删除图片。

### 审计与 LLM

- **`admin_audit_log`**：管理员写操作审计（action、target、ip_hash、user_agent、时间）。
- **`llm_settings`**：LLM 配置（provider、model、base_url、api_key、temperature、max_tokens、enabled）。单行结构。
- **`llm_token_usage`**：每次 LLM 调用的 token 用量流水，`feature` 区分（article_metadata、starfield_passages 等），`status` 区分成功/失败。

### Starfield 知识图谱

这是 `db.py` 里最庞大的一组表，服务于 `starfield.py` 生成的知识图谱。

- **`starfield_versions`**：版本。每张知识图都是"一个版本"，`is_active` 标识当前对读者发布的版本；`parent_version_id` + `change_mode = 'incremental'` 支持增量父子版本（详见 `docs/adr/0005-incremental-starfield-versioning.md`）。
- **`starfield_passages`**：从文章里摘出的"知识文段"。`anchor` 是定位锚点，`keywords_json` 是该文段的关键词。`status` 支持 `suggested`/`accepted`/`hidden`；`origin_passage_id` 用于增量版本里指向父版本被继承的文段。
- **`starfield_relationships`**：两个 Passage 之间的关系。`is_cross_article` 区分跨文章 vs 同文章关系；`change_state` 在增量版本里标识 `new`/`inherited`/`reconfirmed`。
- **`starfield_canonical_keywords`**：把多个相似关键词归并成 canonical 关键词，仅作为关系生成的证据，不是节点。
- **`starfield_deep_paths`**：Deep Path（深度路径），把多个 Passage 串成"A → 中介 → B"的认知探索路径。`inquiry_json` 描述求知动机，`evidence_json` 收集证据。
- **`starfield_generation_jobs`**：生成任务队列。`phase` 区分 passages/relationships/deep-relationships 三阶段；`progress_current`/`progress_total`/`current_step` 提供前端进度展示。

## 渐进式列迁移

```python
def ensure_schema() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA_SQL)
        _ensure_column(conn, "site_settings", "owner_name", "TEXT NOT NULL DEFAULT '孤舟月'")
        _ensure_column(conn, "starfield_versions", "parent_version_id", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "starfield_versions", "change_mode", "TEXT NOT NULL DEFAULT 'full'")
        ...

def _ensure_column(conn, table, column, definition) -> None:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    if not any(row["name"] == column for row in rows):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
```

`SCHEMA_SQL` 只能建表，对**已经存在的表添加新列**无能为力。所以每当代码新增了一列，就要在 `ensure_schema()` 里追加一条 `_ensure_column(...)`，用 `PRAGMA table_info` 判断列是否存在，缺了就 `ALTER TABLE ADD COLUMN`。

这就是项目"无 migration 框架"的迁移方式：把列追加到 `ensure_schema()` 末尾，导入模块时自动补列。优点是简单稳定，缺点是 `_ensure_column` 列表会越长越长，**删除其中任何一条都意味着旧库永远不会再被修复**，所以只能追加不能删。

## 模块加载时自动建表

```python
ensure_schema()
```

文件最后一行直接调用 `ensure_schema()`。这意味着只要任何模块 `from .db import ...`，库结构就会被同步。`app.py` 启动时第一波导入就会触发，开发态无需手动跑 migration。

## 备注

- 所有 schema 改动都要兼顾"新建库走 `SCHEMA_SQL`"和"老库走 `_ensure_column`"两条路径。
- `connect()` 的 `timeout=15` 是 SQLite 写锁等待时间，业务量大时可能需要调高，但博客场景足够。
- 没有 ORM：所有 SQL 都是手写，SQL 语句集中在 `content.py`/`starfield.py`/`admin_commands.py` 里，不在 `db.py` 内。
