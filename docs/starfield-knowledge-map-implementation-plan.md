# 星空知识地图实现方案

## 1. 目标

星空知识地图是面向读者的探索入口。它把已发布文章中的关键文段作为星点，把审核通过的文段关系作为星线，让读者从全局星空进入某个文段，再沿跨文章关系发现其他文段和文章。

第一版不向读者开放模型问答。数据结构需要为未来 GraphRAG 预留，但当前产品重点是可视化探索、后台生成、人工审核和稳定跳转。

## 2. 非目标

- 不替代文章列表、分类、归档和搜索。
- 不把整篇文章作为星点。
- 第一版不做概念星点；概念只作为 Passage Keyword。
- 不在读者访问时实时调用模型。
- 不把未审核的 Passage Suggestion 或关系候选展示给读者。
- 不在第一版开放 Reader GraphRAG 问答。

## 3. 领域边界

核心对象：

- Passage：文章中有意义的原文片段，属于唯一一篇 Source Article。
- Passage Text：从原文摘取，不改写，不复制整篇文章。
- Passage Anchor：跳回文章正文对应位置的稳定锚点。
- Passage Relationship：两个 Passage 之间的读者可见关系。
- Cross-Article Relationship：不同文章 Passage 之间的关系，是星空主要发现价值。
- Relationship Type：受控关系类型。
- Relationship Rationale：解释为什么这条关系对读者有用。
- Published Starfield：读者实际看到的预生成星图版本。
- Starfield Version：管理员决定哪一版 Published Starfield 对读者可见。

关系类型第一版固定为：

- `same_topic`：同一主题
- `prerequisite`：前置知识
- `further_reading`：延伸阅读
- `problem_solution`：问题与解法
- `comparison`：对比关系

## 4. 产品流程

### 4.1 后台生成

管理员进入 Starfield Management，选择一组已发布文章，手动触发生成。

生成分两步：

1. Passage-First Generation：先为选中文章生成 Passage Suggestion。
2. 关系生成：管理员审核 Passage 后，再基于已接受的 Passage 生成 Passage Relationship Suggestion。

约束：

- 每篇文章生成 3-12 个 Passage。
- 每个 Passage 最多保留 9 条跨文章关系。
- Same-Article Relationship 可以保存，但前台推荐低优先级。
- 重生成必须生成新版本或候选批次，不能破坏上一版可用星图。

### 4.2 后台审核

Passage 审核：

- 支持单个审核，也支持批量操作。
- 每个 Passage 仍保留独立审核结果。
- Passage Text 不允许改写。
- Passage Title 可以采用 Markdown 标题，缺失时由 agent 生成短标题。
- 管理员可接受、隐藏、调整标题、调整关键词。

关系审核：

- 显示起点 Passage、终点 Passage、来源文章。
- 显示 Relationship Type。
- 显示 Relationship Rationale。
- 管理员可接受、隐藏、改关系类型、改关系说明。

发布：

- 管理员从 Starfield Version 中选择当前公开版本。
- 读者不能切换历史版本。
- 星空前台不显示未审核候选数。

### 4.3 读者探索

公共导航增加 Starfield Navigation Entry。

读者打开星图时进入 Global Starfield View：

- 默认不聚焦任何星点。
- 先展示全局星空。
- 点击星点后快速拉近视角，形成 Focused Star。

聚焦星点后：

- 显示 Passage Title、Passage Text 摘要、Source Article、Passage Keywords。
- 显示最多 5-9 个 Related Star。
- Related Star 优先 Cross-Article Relationship。
- 每条星线显示 Relationship Type 和 Relationship Rationale。
- 提供跳转到 Source Article 的 Passage Anchor。

视觉语义：

- Star Size 表示连接强度或关系丰富度，不表示文章重要性。
- Star Color 表示 Source Article 的分类。
- 关系线标签表达 Relationship Type。

## 5. 数据模型

当前项目使用 SQLite 和启动时幂等建表，新增表应继续放在 `server_py/db.py` 的 schema 初始化中。

建议新增表：

### 5.1 starfield_versions

```sql
CREATE TABLE IF NOT EXISTS starfield_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_active INTEGER NOT NULL DEFAULT 0,
  source_article_ids_json TEXT NOT NULL DEFAULT '[]',
  generation_model TEXT NOT NULL DEFAULT '',
  generation_prompt_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
```

说明：

- `status`: `draft | published | archived`
- `is_active`: 当前读者可见版本只能有一个。
- `source_article_ids_json`: 本次选择生成的文章集合。

### 5.2 starfield_passages

```sql
CREATE TABLE IF NOT EXISTS starfield_passages (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  anchor TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'suggested',
  sort_order INTEGER NOT NULL DEFAULT 0,
  review_note TEXT NOT NULL DEFAULT '',
  embedding_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (version_id) REFERENCES starfield_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);
```

说明：

- `status`: `suggested | accepted | hidden`
- `text` 保存原文片段，不保存整篇文章。
- `anchor` 用于 `/posts/:slug#anchor`。
- `embedding_ref` 为未来 GraphRAG 或向量库预留，可以第一版为空。

### 5.3 starfield_relationships

```sql
CREATE TABLE IF NOT EXISTS starfield_relationships (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  source_passage_id TEXT NOT NULL,
  target_passage_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  strength REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'suggested',
  is_cross_article INTEGER NOT NULL DEFAULT 1,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (version_id) REFERENCES starfield_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_passage_id) REFERENCES starfield_passages(id) ON DELETE CASCADE,
  FOREIGN KEY (target_passage_id) REFERENCES starfield_passages(id) ON DELETE CASCADE
);
```

说明：

- `status`: `suggested | accepted | hidden`
- `strength` 用于 Star Size 和 Related Star 排序。
- `is_cross_article` 用于前台优先显示跨文章关系。

### 5.4 starfield_generation_jobs

```sql
CREATE TABLE IF NOT EXISTS starfield_generation_jobs (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  selected_article_ids_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (version_id) REFERENCES starfield_versions(id) ON DELETE CASCADE
);
```

说明：

- `phase`: `passages | relationships`
- `status`: `pending | running | succeeded | failed`
- 第一版可以同步执行，但仍记录 job，方便后台展示和后续异步化。

## 6. 服务端模块

建议新增 `server_py/starfield.py`，集中处理：

- 创建 Starfield Version。
- 选择文章生成 Passage Suggestion。
- 基于 accepted Passage 生成 Relationship Suggestion。
- 审核 Passage。
- 审核 Relationship。
- 发布 Starfield Version。
- 查询当前 Published Starfield。

建议扩展 `server_py/ai_agent.py`：

- 保留现有 `generate_article_metadata`。
- 新增 `generate_passage_suggestions`。
- 新增 `generate_relationship_suggestions`。
- 复用 `llm_settings`、`record_llm_token_usage` 和现有 OpenAI-compatible chat completions 调用方式。

模型输出必须使用严格 JSON。服务端必须校验：

- Passage 数量在 3-12。
- Passage Text 必须能在原文中定位或由服务端保留可验证的 anchor 来源。
- Relationship Type 必须在受控枚举内。
- Relationship 不能指向不存在或未接受的 Passage。
- 每个 Passage 的跨文章 accepted/suggested 关系最多保留 9 条。

## 7. API 设计

### 7.1 公开 API

`GET /api/starfield`

返回当前 active Published Starfield。

响应建议：

```json
{
  "version": {
    "id": "starfield_version_x",
    "name": "默认星图",
    "publishedAt": "2026-06-16T00:00:00.000Z"
  },
  "passages": [
    {
      "id": "passage_x",
      "title": "Docker 安装流程",
      "excerpt": "安装 Docker 前需要更新系统并配置依赖。",
      "text": "原文片段",
      "anchor": "passage-docker-install",
      "keywords": ["Docker", "Ubuntu", "部署"],
      "article": {
        "id": "article_x",
        "slug": "ubuntu2404ban-ben-an-zhuang-docker",
        "title": "Ubuntu24.04版本安装docker",
        "category": "技术笔记"
      },
      "starSize": 1.4,
      "starColorKey": "技术笔记"
    }
  ],
  "relationships": [
    {
      "id": "relationship_x",
      "sourcePassageId": "passage_a",
      "targetPassageId": "passage_b",
      "relationshipType": "prerequisite",
      "relationshipLabel": "前置知识",
      "rationale": "先理解 Docker 安装，再看部署流程。",
      "strength": 0.82,
      "isCrossArticle": true
    }
  ]
}
```

### 7.2 管理 API

`GET /api/admin/starfield/versions`

列出版本。

`POST /api/admin/starfield/versions`

创建版本。

`POST /api/admin/starfield/versions/:id/generate-passages`

管理员选择文章后生成 Passage Suggestion。

请求：

```json
{
  "articleIds": ["article_a", "article_b"]
}
```

`POST /api/admin/starfield/versions/:id/generate-relationships`

基于 accepted Passage 生成关系候选。

`GET /api/admin/starfield/versions/:id`

读取版本详情，包括 suggested/accepted/hidden 数据。

`PUT /api/admin/starfield/passages/:id`

审核或调整 Passage。

允许字段：

- `status`
- `title`
- `keywords`
- `sortOrder`
- `reviewNote`

不允许改写 `text`。

`PUT /api/admin/starfield/relationships/:id`

审核或调整关系。

允许字段：

- `status`
- `relationshipType`
- `rationale`
- `strength`
- `reviewNote`

`POST /api/admin/starfield/versions/:id/publish`

发布当前版本并设为 active。

`POST /api/admin/starfield/versions/:id/archive`

归档版本。

## 8. 前端改造

### 8.1 API Client

在 `src/apiClient.ts` 增加：

- `fetchStarfield()`
- `fetchAdminStarfieldVersions()`
- `createAdminStarfieldVersion()`
- `generateAdminStarfieldPassages()`
- `generateAdminStarfieldRelationships()`
- `fetchAdminStarfieldVersion()`
- `updateAdminStarfieldPassage()`
- `updateAdminStarfieldRelationship()`
- `publishAdminStarfieldVersion()`

类型建议：

- `ApiStarfieldPayload`
- `ApiStarfieldPassage`
- `ApiStarfieldRelationship`
- `ApiAdminStarfieldVersion`

### 8.2 公共导航

在公共导航增加“星图”入口，路由建议：

- `/starfield`

当前项目是 SPA，路由解析需要在 `src/App.tsx` 增加对应分支。

### 8.3 星空页面

新增组件建议：

```text
src/
  StarfieldPage.tsx
  StarfieldCanvas.tsx
  StarfieldFocusPanel.tsx
```

第一版可以用 Canvas 2D 实现，避免引入 3D 依赖；如果追求更强星空质感，可后续切 Three.js。

页面行为：

- 初始为 Global Starfield View。
- 画布动态布局所有 accepted Passage。
- 点击星点后放大并聚焦。
- FocusPanel 显示 Passage 详情、Source Article、Related Star 列表、关系说明。
- Related Star 优先跨文章，最多显示 5-9 个。
- 跳文章链接使用 `/posts/:slug#anchor`。

性能建议：

- 即使不硬限制总星点数量，也要做视口裁剪、缩放层级、标签延迟显示。
- 默认只显示星点和重点星线，聚焦后显示相关星线标签。
- 文本标签不要全量常驻，避免拥挤。

### 8.4 文章锚点

`MarkdownBody` 或文章详情页需要支持 Passage Anchor：

- 渲染正文时为匹配 Passage 的标题或块添加 `id`。
- 从星图跳转时滚动到对应位置。
- 进入文章后短暂高亮目标 Passage。

锚点生成应稳定：

- 优先由后台生成并存储 `anchor`。
- 前端只消费 anchor，不临时猜测。

### 8.5 后台 Starfield Management

新增后台 panel：

- 在 `AdminDashboardPanel` 快捷入口增加“星图管理”。
- `AdminPanelId` 增加 `starfield`。
- `src/App.tsx` 后台路由/面板增加分支。

组件建议：

```text
src/
  AdminStarfieldPanel.tsx
```

后台页面结构：

- 版本列表：草稿、已发布、归档、当前公开。
- 新建版本：名称、选择文章。
- 生成 Passage：显示 job 状态和候选。
- Passage 审核：支持批量接受/隐藏。
- 生成关系：只基于 accepted Passage。
- 关系审核：显示起点、终点、关系类型、理由。
- 发布版本：设为当前 active。

## 9. Agent Prompt 边界

### 9.1 Passage 生成输入

输入：

- Article id、slug、title、category、tags。
- bodyMarkdown。
- 目标 Passage 数：3-12。

输出 JSON：

```json
{
  "passages": [
    {
      "title": "短标题",
      "text": "必须来自原文的片段",
      "excerpt": "面向读者的简短摘要",
      "keywords": ["关键词"],
      "anchorHint": "可选标题或定位提示",
      "sortOrder": 0
    }
  ]
}
```

服务端校验：

- `text` 不得为空。
- `text` 应能在正文中找到；找不到则候选标记为失败或需要人工处理。
- `keywords` 去重并限制长度。

### 9.2 关系生成输入

输入：

- accepted Passage 列表。
- Source Article 信息。
- 已有关系。
- 每个 Passage 最多 9 条跨文章关系。

输出 JSON：

```json
{
  "relationships": [
    {
      "sourcePassageId": "passage_a",
      "targetPassageId": "passage_b",
      "relationshipType": "prerequisite",
      "rationale": "为什么这条关系对读者有用",
      "strength": 0.82
    }
  ]
}
```

服务端校验：

- 两端 Passage 必须存在。
- 关系类型必须合法。
- 不允许自连接。
- 优先保留 Cross-Article Relationship。
- 同一 pair 去重。

## 10. GraphRAG 预留

第一版不做问答，但数据需要支持未来 Reader GraphRAG：

- Passage Text 是可引用 grounding 单元。
- Passage Anchor 支持引用回源。
- Relationship Type 和 Rationale 支持图扩展解释。
- `embedding_ref` 支持未来向量索引。
- `generation_model` 和 `generation_prompt_version` 支持追踪生成来源。
- Starfield Version 支持在图谱质量不好时回滚。

未来 GraphRAG 查询路径可以是：

1. 向量检索召回相关 Visible Passage。
2. 沿 accepted Passage Relationship 扩展邻居 Passage。
3. 按 Relationship Type 和 strength 排序。
4. 大模型只基于召回 Passage 生成 Grounded Answer。
5. 回答引用 Source Article 和 Passage Anchor。

## 11. 实施阶段

### 阶段一：数据与公开只读星图

1. 新增 starfield 表。
2. 新增 `server_py/starfield.py`。
3. 实现 `GET /api/starfield`。
4. 手工 seed 一小批 accepted Passage 和 Relationship。
5. 新增 `/starfield` 页面和导航入口。
6. 实现 Global Starfield View、点击聚焦、跳转文章锚点。

验收：

- 导航可进入星图。
- 星点来自 Passage。
- 点击星点能聚焦并看到跨文章关系说明。
- 点击“阅读全文”能跳到文章对应 anchor。

### 阶段二：后台 Starfield Management

1. 新增后台星图管理面板。
2. 版本列表、新建版本、选择文章。
3. Passage 审核列表。
4. Relationship 审核列表。
5. 发布 active 版本。

验收：

- 管理员可决定哪一版星图公开。
- 未审核内容不进入公开 API。
- 重生成不破坏上一版 active 星图。

### 阶段三：Agent 生成

1. 扩展 `ai_agent.py`，新增 Passage 生成。
2. 新增 Relationship 生成。
3. 记录 token usage。
4. 加入服务端 JSON 校验。
5. 生成失败时保留错误状态。

验收：

- 管理员选择文章后可生成 Passage Suggestion。
- 审核 Passage 后可生成 Relationship Suggestion。
- 关系包含类型和理由。
- LLM 未配置时返回清晰错误，不影响已发布星图。

### 阶段四：体验与性能

1. 增加星图缩放、平移、视口裁剪。
2. 优化标签显示策略。
3. 增加分类颜色图例。
4. 增加 Related Star 排序和跨文章优先。
5. 增加文章页目标 Passage 高亮。

验收：

- 星点数量变多时仍可流畅探索。
- 聚焦视图不被同文章关系淹没。
- 读者能理解每条主要星线的关系理由。

## 12. 测试建议

后端：

- active version 只有一个。
- public API 只返回 accepted Passage 和 accepted Relationship。
- hidden/suggested 不公开。
- relationship type 枚举校验。
- passage text 不允许通过审核 API 改写。
- publish 新版本后旧版本仍保留。

前端：

- `/starfield` 路由可访问。
- 无 active starfield 时显示空状态。
- 点击星点显示 Focused Star。
- Related Star 优先跨文章。
- 阅读全文链接包含 anchor。

集成：

- `npm run build`
- `npm run test:server`

## 13. 需要 ADR 的决策

建议补一条 ADR：`docs/adr/0002-starfield-passage-graph.md`。

原因：

- 这是难以轻易反转的内容发现模型。
- 未来维护者会问为什么星点是 Passage 而不是 Article 或 Concept。
- 这里存在真实取舍：探索效果、审核成本、GraphRAG 预留、读者可信度。

ADR 应记录：

- 采用文段级星点。
- 第一版不做概念节点。
- 后台预生成和审核后公开。
- 星图当前只做探索，GraphRAG 问答后置。
