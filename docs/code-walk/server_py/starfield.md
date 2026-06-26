# starfield.py

> 源路径：`server_py/starfield.py`
> 总行数：约 2120 行

Starfield 知识图谱生成与管理的全部业务逻辑：版本（含增量父子版本）、任务队列（passage/relationship/deep-relationship 三阶段）、Passage 生成与审核、Canonical Keyword 合并、Relationship 生成与 diff、Deep Path 多 Agent 挖掘。

## 文件概览

`starfield.py` 是后端最大、最复杂的模块。它实现的是"星图"功能——把博客文章拆成 Passage（知识文段），用 LLM 提取关键词、归并成 Canonical Keyword，再生成 Passage 之间的关系（包括浅层 concrete 关系和深层 deep path），最终形成一个可发布给读者浏览的 3D 知识图谱。

整个流程被组织成**版本化的多阶段任务**：

1. 管理员创建一个 `draft` 版本。
2. 选择文章，触发 **Passage 生成**：每篇文章被 LLM 拆成 3-12 个文段。
3. 审核接受部分 Passage。
4. 触发 **Relationship 生成**：归并关键词 → 候选边 → LLM 判断关系类型 → 写库。
5. 触发 **Deep Relationship 生成**：四个 LLM Agent 协作挖出"A → 中介 → B"的深层路径。
6. 审核接受部分关系/路径。
7. 发布版本（`is_active=1`），对读者公开。

增量版本（`change_mode='incremental'`）继承父版本的 accepted 数据，让"小修改"不用从头跑全流程。

文件分七大块：常量与版本管理、任务队列、Passage 生成、Relationship 生成（含 diff）、Deep Path 生成、审核更新、公开读取与 row 转换。

## 常量与关系类型

```python
CONCRETE_RELATIONSHIP_TYPES = {"same_topic", "prerequisite", "further_reading", "problem_solution", "comparison"}
ABSTRACT_RELATIONSHIP_TYPES = {
    "shared_principle", "same_problem_shape", "method_transfer",
    "tradeoff_parallel", "case_generalization", "implementation_echo",
}
RELATIONSHIP_TYPES = CONCRETE_RELATIONSHIP_TYPES | ABSTRACT_RELATIONSHIP_TYPES
RELATIONSHIP_LABELS = {
    "same_topic": "同一主题",
    "prerequisite": "前置知识",
    ...
}
STALE_JOB_SECONDS = 30 * 60
DEEP_PATH_SOURCE_BATCH_SIZE = 6
DEEP_PATH_CORPUS_LIMIT = 260
DEEP_PATH_MAX_PATHS_PER_BATCH = 24
DEEP_PATH_MAX_TOTAL_PATHS = 500
```

关系类型分两层：

- **CONCRETE**（具体关系）：same_topic、prerequisite、further_reading、problem_solution、comparison。由 Relationship 生成阶段产出，基于关键词共享和文段语义。
- **ABSTRACT**（抽象关系）：shared_principle、method_transfer 等。由 Deep Path 阶段产出，基于多 Agent 协作挖掘的"共同原则/方法迁移"等深层结构。

`RELATIONSHIP_LABELS` 是英文 type → 中文标签的映射，给前端展示用。

Deep Path 阶段有几个关键的批处理常量：每批最多 6 个源 Passage、corpus 上限 260、每批最多 24 条路径、单版本总路径上限 500。这些是 prompt 长度和生成质量的平衡点。

## 版本管理

```python
def create_version(input_data: dict[str, Any]) -> dict[str, Any]:
    ...
    conn.execute("INSERT INTO starfield_versions (...) VALUES (?, ?, 'draft', 0, '', 'full', '[]', ?, ?, ?, ?)", (...))

def create_incremental_version(input_data: dict[str, Any]) -> dict[str, Any]:
    ...
    parent = conn.execute("SELECT * FROM starfield_versions WHERE id = ?", (parent_version_id,)).fetchone()
    if not parent:
        raise ValueError("Parent Starfield version not found")
    ...
```

`create_version` 创建一个全量 draft 版本（`change_mode='full'`、`parent_version_id=''`）。

`create_incremental_version` 是增量版本的核心：

```python
parent_passages = conn.execute("SELECT * FROM starfield_passages WHERE version_id = ? AND status = 'accepted'", ...).fetchall()
passage_id_map: dict[str, str] = {}
for row in parent_passages:
    passage_id = make_id("passage")
    passage_id_map[row["id"]] = passage_id
    conn.execute("INSERT INTO starfield_passages (...) VALUES (...)", (..., 'accepted', ..., row["id"], ...))
```

它把父版本所有 accepted 的 Passage、Relationship、Canonical Keyword、Deep Path **完整复制**到子版本，每条记录都带上 `origin_passage_id` / `origin_relationship_id` 指向父版本原记录，方便后续 diff。

Passage 复制用 `status='accepted'`、Relationship 复制用 `change_state='inherited'`，这是增量版本"继承"语义的体现。

```python
def _ensure_generation_version_is_draft(version: Any) -> None:
    if bool(version["is_active"]) and version["status"] == "published":
        raise ValueError("Create an Incremental Starfield Version before generating on the active Published Starfield")
```

防止在已发布版本上直接生成——必须先创建增量版本，避免破坏线上数据。

```python
def publish_version(version_id: str) -> dict[str, Any]:
    ...
    accepted_count = conn.execute("SELECT COUNT(*) AS count FROM starfield_passages WHERE version_id = ? AND status = 'accepted'", ...).fetchone()["count"]
    if accepted_count < 1:
        raise ValueError("No accepted passages to publish")
    conn.execute("UPDATE starfield_versions SET is_active = 0 WHERE is_active = 1")
    conn.execute("UPDATE starfield_versions SET status = 'published', is_active = 1, published_at = ?, updated_at = ? WHERE id = ?", (...))
```

发布时先把当前 active 版本设为非 active（一次只允许一个 active），再把目标版本设为 published + active。要求至少有一个 accepted Passage，避免发布空版本。

## 任务队列：enqueue + BackgroundTasks

```python
def enqueue_passage_generation(version_id: str, article_ids: list[str]) -> dict[str, Any]:
    ...
    conn.execute("INSERT INTO starfield_generation_jobs (...) VALUES (?, ?, 'passages', 'pending', ?, 0, ?, '任务已创建...', ?, ?)", (...))
    return {"ok": True, "created": 0, "jobId": job_id, **payload}

async def run_passage_generation_job(job_id: str) -> None:
    try:
        ...
        conn.execute("UPDATE starfield_generation_jobs SET status = 'running', ...", (...))
        await _execute_passage_generation(version_id, job_id, rows, safe_article_ids)
    except Exception as error_value:
        ...
        conn.execute("UPDATE starfield_generation_jobs SET status = 'failed', error_message = ?, ...", (...))
```

`enqueue_*` 同步建任务行（status=pending），立即返回 jobId；`app.py` 的 `BackgroundTasks.add_task` 在响应发出后异步调用 `run_*_job`。

每个 `run_*_job` 用 `try/except` 包裹整个执行，失败时把 status 设为 `failed` 并写 errorMessage。**任何异常都不会逃逸**到 BackgroundTasks 框架（否则任务会无声消失）。

### 任务过期清理

```python
def _expire_stale_jobs(conn: Any, version_id: str) -> None:
    ...
    expired_ids = [row["id"] for row in rows if _seconds_since(row["updated_at"], now) > STALE_JOB_SECONDS]
    ...
    for job_id in expired_ids:
        conn.execute("UPDATE ... SET status = 'failed', current_step = '任务长时间没有更新...', ...", (...))
```

进程重启会把所有 running 任务卡住。`_expire_stale_jobs` 在每次 `get_admin_version` 时被调用，把超过 30 分钟没更新的 pending/running 任务标 failed，让前端能感知到失败并重试。

## Passage 生成

```python
async def _execute_passage_generation(version_id, job_id, rows, safe_article_ids) -> None:
    generated_by_article: dict[str, list[dict[str, Any]]] = {}
    fallback_errors: list[str] = []
    for index, row in enumerate(rows, start=1):
        _update_job_progress(job_id, index - 1, len(rows), f"AI-agent 正在拆分《{row['title']}》的 Passage。")
        try:
            generated_by_article[row["id"]] = await _generate_ai_passages_for_article(row)
        except AiAgentError as error_value:
            fallback_errors.append(f"{row['title']}: {error_value}")
            generated_by_article[row["id"]] = _extract_passages(row)
        except Exception as error_value:
            fallback_errors.append(f"{row['title']}: {error_value}")
            generated_by_article[row["id"]] = _extract_passages(row)
        _update_job_progress(job_id, index, len(rows), ...)
```

逐文章调 LLM 拆 Passage。**关键容错**：LLM 失败时（`AiAgentError` 或任何异常）走本地兜底 `_extract_passages`——按 Markdown 标题/段落切分，让流程不依赖 LLM 也能产出可审核的 Passage。失败信息被收集到 `fallback_errors`，最终写到 job 的 errorMessage。

```python
def _extract_passages(article: Any) -> list[dict[str, Any]]:
    sections = _split_markdown_sections(article["body_markdown"]) or _split_plain_passages(article["body_markdown"])
    ...
```

本地兜底策略：

- 先按 Markdown 标题（`#`、`##`）切分。
- 没标题就按段落切。
- 每个 section 提取 title、text、excerpt（前 180 字）、keywords（基于词频）。
- anchor 用标题 slugify 后去重。

这保证即使没配 LLM，整个星图流程也能跑通（`compat_test.py` 的"本地规则兜底"断言就验证这一点）。

## Relationship 生成

```python
async def _execute_relationship_generation(version_id, job_id, passages) -> None:
    _update_job_progress(job_id, 1, 5, ...)
    try:
        canonical_keyword_groups = await _generate_ai_canonical_keyword_groups(rows)
    except (AiAgentError, Exception) as error_value:
        fallback_errors.append(str(error_value))
        canonical_keyword_groups = _canonical_keyword_groups(rows)
    ...
    candidates = _keyword_bridge_relationships(rows, canonical_keyword_groups)
    ...
    try:
        scored = await _generate_ai_relationships(rows, candidates)
    except (AiAgentError, Exception) as error_value:
        fallback_errors.append(str(error_value))
        scored = candidates
```

三阶段流水线：

1. **Canonical Keyword 归并**：调 LLM 把高度相似的关键词合并（比如"React"、"ReactJS"、"React.js" → canonical label "React"）。失败时走本地 `_canonical_keyword_groups`（基于关键词归一化 + Jaccard 相似度）。
2. **候选边生成**：纯本地算法 `_keyword_bridge_relationships`——共享 canonical keyword 的两个 Passage 形成一条候选边，关系类型默认 `same_topic`，strength 基于共享关键词数量。
3. **关系升级**：调 LLM 在候选边中升级 `relationshipType`（比如从 same_topic 升级为 prerequisite）。失败时直接用候选边的默认 type。

```python
def _keyword_bridge_relationships(rows, canonical_keyword_groups) -> list[dict[str, Any]]:
    ...
    for group in canonical_keyword_groups:
        ...
        passage_ids = [passage_id for passage_id in group.get("passage_ids", []) if passage_id in by_id]
        if not label or len(passage_ids) < 2:
            continue
        for index, source_id in enumerate(passage_ids):
            for target_id in passage_ids[index + 1:]:
                pair = tuple(sorted([source_id, target_id]))
                pair_keywords.setdefault(pair, []).append(label)
```

每个 canonical keyword 关联的所有 Passage 两两组合形成候选边。`strength` 公式：

```python
strength = min(1, 0.36 + shared_count * 0.16 + (0.12 if not same_article else 0))
```

跨文章关系有 +0.12 加成，鼓励跨文章的连接。

## Relationship Diff（增量版本的核心）

```python
def _relationship_diff_context(conn, version_id, rows) -> dict[str, Any]:
    ...
    parent_rows = conn.execute("SELECT * FROM starfield_relationships WHERE version_id = ? AND status = 'accepted' AND relationship_type IN (...)", ...).fetchall()
    by_typed_key: dict[tuple[tuple[str, str], str], Any] = {}
    by_pair_key: dict[tuple[str, str], list[Any]] = {}
    for row in parent_rows:
        pair_key = _relationship_pair_key_from_ids(row["source_passage_id"], row["target_passage_id"])
        by_typed_key[(pair_key, row["relationship_type"])] = row
        by_pair_key.setdefault(pair_key, []).append(row)
```

在增量版本里重新生成 relationship 时，需要把新生成的结果和父版本做 diff，决定每条记录的 `change_state`：

- **reconfirmed**：父版本有相同的 (pair, type)，自动保持 accepted。
- **changed**：父版本有相同的 pair 但 type 不同，标 changed 让管理员注意。
- **new**：父版本没有，新关系。
- **inherited**：增量版本创建时从父版本继承的（在 `create_incremental_version` 时设置）。
- **removed**：父版本有但本轮没生成，标 removed 并把 status 设为 hidden。

```python
parent_same_type = diff_context["byTypedKey"].get(typed_key)
parent_same_pair = diff_context["byPairKey"].get(relationship_pair_key)
status = "suggested" if is_cross_article else "hidden"
change_state = "new"
...
if parent_same_type:
    status = "accepted"
    change_state = "reconfirmed"
    origin_relationship_id = parent_same_type["id"]
    rationale = parent_same_type["rationale"]  # 保留父版本的 rationale
    ...
elif parent_same_pair:
    change_state = "changed"
```

`reconfirmed` 时**保留父版本的 rationale**——这是 `compat_test.py` 的"增量版本重建关系保留父版本 rationale"断言验证的关键。否则 LLM 重新生成时可能给出不同的措辞，让"确认"变成实际改写。

末尾还处理"removed"：

```python
if incremental_parent_id:
    for (parent_pair_key, relationship_type), parent_relationship in diff_context["byTypedKey"].items():
        if (parent_pair_key, relationship_type) in generated_typed_keys:
            continue
        ...
        conn.execute("INSERT INTO starfield_relationships (...) VALUES (...)", (..., 'hidden', ..., 'removed', ..., "关系重建后不再生成..."))
```

父版本有但本轮 LLM 没生成的关系，被显式标记成 `removed` + `hidden`，让前端能展示"这些关系在新版本里被移除了"。

## Deep Path 生成（最复杂的部分）

```python
async def _execute_deep_relationship_generation(version_id, job_id, passages) -> None:
    rows = [_passage_like(row) for row in passages]
    source_batches = _chunk_list(rows, DEEP_PATH_SOURCE_BATCH_SIZE)
    progress_total = max(3, len(source_batches) + 3)
    ...
    for index, source_rows in enumerate(source_batches):
        ...
        try:
            batch_paths = await _generate_ai_deep_paths(rows, source_rows, existing_relationships)
            paths.extend(batch_paths)
        except Exception as error_value:
            batch_errors.append(f"第 {batch_number} 批：{str(error_value)[:180]}")
            continue

    if not paths:
        # 全部批次失败 → 标记任务 failed
        ...
        return

    ...
    valid_paths = _filter_deep_paths(paths, rows)
    ...
```

Deep Path 阶段**没有本地兜底**——`_generate_ai_deep_paths` 是唯一入口，失败就标 job failed（错误信息包含 "LLM" 关键字，让 `compat_test.py` 能识别）。这是项目设计上的取舍：Deep Path 的价值在于 LLM 才能挖出的"非显然关系"，本地规则无法替代。

### 分批策略

```python
DEEP_PATH_SOURCE_BATCH_SIZE = 6
DEEP_PATH_CORPUS_LIMIT = 260
```

每批最多 6 个 source Passage，但 corpus 是全部 260 个 Passage。这意味着 LLM 在每批里看到的是"6 个源 × 260 个候选"的搜索空间。`progress_total = batches + 3`（3 步固定开销：准备、收敛、写入），这就是 `compat_test.py` 里 `expected_deep_progress_total = ((accepted_deep_source_count + 5) // 6) + 3` 的来源。

### 物化相邻关系

```python
for item in valid_paths:
    ...
    conn.execute("INSERT INTO starfield_deep_paths (...) VALUES (...)", (...))
    for index in range(len(passage_ids) - 1):
        source_id = passage_ids[index]
        target_id = passage_ids[index + 1]
        pair = tuple(sorted([source_id, target_id]))
        if pair in materialized_pairs:
            continue
        materialized_pairs.add(pair)
        ...
        conn.execute("INSERT INTO starfield_relationships (...) VALUES (...)", (..., 'suggested', 1, ...))
```

Deep Path（如 A → B → C）会被"物化"成相邻关系（A-B、B-C），用 `ABSTRACT_RELATIONSHIP_TYPES` 之一作为 type。这让星图渲染时既能看到完整路径，也能看到节点间的抽象连接。

`materialized_pairs` 去重避免同一条 pair 被多条路径重复物化。

### Deep Path 的四个 Agent 角色

实际的 prompt 在 `ai_agent.py` 的 `_normalize_starfield_deep_path_request` 里，定义了四个协作角色：

- **Inquirer Agent**：从 source Passage 生成求知者会问的问题。
- **Retriever Agent**：把每个问题转成多个搜索视角，从 corpus 选 Passage。
- **Path Builder Agent**：组织有方向的路径（允许 A → B → C）。
- **Critic Agent**：质疑路径是否牵强，不通过的丢弃。

`starfield.py` 只负责调度（分批、收集结果、去重、写库），具体 prompt 工程在 `ai_agent.py`。

## 审核更新

```python
def update_passage(passage_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    ...
    status = input_data.get("status", existing["status"])
    if status not in PASSAGE_STATUS:
        raise ValueError("Invalid passage status")
    title = str(input_data.get("title", existing["title"])).strip()[:120] or existing["title"]
    keywords = input_data.get("keywords")
    if not isinstance(keywords, list):
        keywords = json_parse(existing["keywords_json"], [])
    ...
    if status == "accepted":
        reviewed_at = now_iso()
    elif status == "hidden":
        reviewed_at = now_iso()
    else:
        reviewed_at = existing["reviewed_at"]
```

管理员更新单个 Passage 的状态/标题/关键词/审核备注。`accepted` 和 `hidden` 都会写 `reviewed_at`，`suggested`（重置回草稿）保留原审核时间。

`update_passages_bulk` / `update_relationships_bulk` / `update_deep_paths_bulk` 是批量版本——管理员可以一次性接受所有 suggested Passage，或批量接受所有跨文章关系（`crossArticleOnly` 参数）。

## 公开读取（reader-friendly schema）

```python
def get_public_starfield() -> dict[str, Any]:
    ...
    version = conn.execute("SELECT * FROM starfield_versions WHERE is_active = 1 AND status = 'published' ORDER BY published_at DESC LIMIT 1").fetchone()
    if not version:
        return {"version": None, "passages": [], "relationships": [], "deepPaths": []}
    ...
    public_passages = [_public_passage_row(row, relationships) for row in passages]
```

公开 `/api/starfield` 只返回当前 active published 版本，且：

- 只暴露 accepted Passage、accepted Relationship、accepted Deep Path。
- Passage 还要求**关联的文章**是 published 且没被软删除（否则 Passage 也会被过滤掉）。
- Relationship 要求两端 Passage 都被 accepted。
- Deep Path 要求路径上所有 Passage 都被 accepted。

```python
def _public_relationship_row(row: Any) -> dict[str, Any]:
    relationship_type = row["relationship_type"]
    return {
        "id": row["id"],
        "sourcePassageId": row["source_passage_id"],
        "targetPassageId": row["target_passage_id"],
        "relationshipType": relationship_type,
        "relationshipLabel": RELATIONSHIP_LABELS.get(relationship_type, relationship_type),
        "rationale": row["rationale"],
        "strength": row["strength"],
        "isCrossArticle": bool(row["is_cross_article"]),
        # 注意：没有 status / reviewNote / evidenceKeywords
    }
```

公开 schema **故意剥离**所有审核字段（status/reviewNote/evidenceKeywords/changeState 等），只暴露对读者友好的字段。`relationshipLabel` 把英文 type 翻译成中文标签。这是 `compat_test.py` 里"public starfield exposes reader relationship shape only"断言的核心契约。

```python
def _public_passage_row(row: Any, relationships: list[dict[str, Any]]) -> dict[str, Any]:
    connected = [item for item in relationships if item["sourcePassageId"] == row["id"] or item["targetPassageId"] == row["id"]]
    cross_count = sum(1 for item in connected if item["isCrossArticle"])
    return {
        ...
        "starSize": round(1 + min(1.4, math.log(1 + len(connected) + cross_count) / 2), 2),
        "starColorKey": row["article_category"] or "未分类",
    }
```

公开 Passage 还计算 `starSize`（基于连接数的对数缩放）和 `starColorKey`（基于文章分类），给前端 3D 星图渲染用——连接多的节点更大、不同分类用不同颜色。

## row 转换器（admin schema）

`_version_row` / `_passage_row` / `_relationship_row` / `_canonical_keyword_row` / `_deep_path_row` / `_job_row` 是给管理员视图的完整 schema，**保留所有字段**（包括 status/reviewNote/origin*/change_state 等）。这些是 `/api/admin/starfield/versions/{id}` 的响应格式。

`_admin_task_row` 把 job 行转换成"通用任务"格式，给 `/api/admin/tasks` 用——这是为什么 `compat_test.py` 能验证 `sourceType='starfield'`、`sourceName=版本名`。

## 辅助函数

文件末尾大量 `_xxx` 私有函数承担具体的数据规整：

- `_extract_passages` / `_split_markdown_sections` / `_split_plain_passages`：本地 Passage 兜底切分。
- `_canonical_keyword_groups` / `_canonicalize_keyword` / `_is_generic_keyword`：本地关键词归并（LLM 兜底）。
- `_keyword_bridge_relationships`：候选边生成。
- `_filter_deep_paths`：Deep Path 去重和合法性过滤（要求所有 passage_id 都在 corpus 里）。
- `_chunk_list`：把列表切成固定大小的批。
- `_clean_keywords` / `_keywords_from_text` / `_excerpt`：文本处理。
- `_safe_int` / `_safe_float`：数值规整。

## 备注

- 这是项目里**最复杂**的模块，改动需要同时考虑：版本继承、diff 语义、LLM 兜底、任务进度、公开 schema 剥离。建议改动前先看 `compat_test.py` 里相关的 30+ 条断言，它们是行为契约的精确描述。
- LLM 兜底是关键设计——除了 Deep Path 阶段，其他阶段都有本地规则兜底，让没配 LLM 的开发环境也能跑通流程。
- 增量版本 + diff 语义是为了支持"小步迭代"——管理员发布一个版本后，可以基于它创建增量版本、调整少量 Passage/关系、再发布，不用每次都从头跑全流程。详见 `docs/adr/0005-incremental-starfield-versioning.md`。
- `make_id` 在这里是局部定义（不和 `content.py` 共享），因为 starfield 的 ID 需要 `secrets.token_hex(4)` 的加密随机性（避免可预测）。
