# AdminStarfieldPanel.tsx

> 源路径：`src/AdminStarfieldPanel.tsx`
> 总行数：约 1206 行

星图（Starfield Knowledge Map）管理面板，按 `mode` prop 切换三种工作模式：`generation`（生成 Passage）、`review`（审核 Passage / 关系 / 深层路径并发布）、`tasks`（查看后台 AI-agent 任务）。

## 文件概览

星图是本项目的特色功能：把文章拆成「Passage」（知识星点），再用 AI 算出 Passage 之间的关系（同主题、前置知识、对比等）和「深层路径」（多 Passage 串联的探索路径）。这个面板是作者控制整条生成—审核—发布流水线的地方。

组件通过 `apiClient` 调用大量星图相关接口（版本管理、Passage 生成与编辑、关系生成、深层路径、批量审核、发布、任务查询）。除了主组件，文件还包含 `StarfieldMetrics` / `JobList` / `PassageEditor` / `RelationshipEditor` / `DeepPathDetail` 等子组件，以及一组过滤辅助函数。

关键依赖：`apiClient` 中所有 `ApiStarfield*` / `ApiAdminStarfield*` / `ApiAdminTask` 类型与十几个星图接口函数；`posts.Post`。

## 核心数据结构与术语

- **Version**（`ApiStarfieldVersion`）：一轮星图生成的快照，有 `draft / published / archived` 三态，`isActive` 标记当前公开展示的版本。支持「增量版本」（`changeMode: 'incremental'`，`parentVersionId` 指向父版本），可以从已发布版本派生而非从零开始。
- **Passage**（`ApiStarfieldPassage`）：文章切片，带 `title` / `text` / `keywords` / `status`（`suggested` 候选 / `accepted` 已接受 / `hidden` 已隐藏）。
- **Relationship**（`ApiStarfieldRelationship`）：两个 Passage 之间的关系，`relationshipType` 是 11 种语义类型之一（同主题、前置知识、对比、共同原则、方法迁移等），`isCrossArticle` 区分跨文章关系和同文章关系，`changeState` 标记增量版本里的变更状态（继承、重确认、新增、变更、移除）。
- **CanonicalKeyword**（`ApiStarfieldCanonicalKeyword`）：合并后的标准标签，把多个同义关键词归并，带 `aliases` 和 `passageIds`。
- **DeepPath**（`ApiStarfieldDeepPath`）：多 Passage 串联的探索路径，由 `Inquirer / Path-Builder / Retriever / Critic` 四个 AI-agent 协作产出。

## 顶层状态与派生数据

组件维护的状态可分为四组：

- **版本与选中**：`versions` 列表、`activePayload`（当前版本的完整数据：passages + relationships + canonicalKeywords + deepPaths + jobs）、`newVersionName`。
- **审核筛选**：`reviewTab`（passages/relationships/deepPaths）、`reviewFilter`（all/suggested/accepted/hidden）、`relationshipChangeFilter`（关系特有的变更状态筛选）、`selectedCanonicalKeywordId`（按合并标签过滤）。
- **编辑草稿**：`passageDrafts` / `relationshipDrafts` 是 `Record<id, 草稿>` 缓存编辑中的字段，避免每次按键都触发后端保存。
- **任务模式**：`taskItems` / `taskSourceFilter`。

派生数据用 `useMemo` 计算：`filteredPassages` / `filteredRelationships` / `filteredDeepPaths` 是「状态筛选 + 关键词筛选 + 变更状态筛选」三重过滤的组合结果；`passageById` 是 id 到 passage 的查找表，给关系视图反查 source/target 标题用。

```ts
const filteredRelationships = useMemo(
  () => filterRelationshipsByChangeState(
    filterRelationshipsByCanonicalKeyword(filterByStatus(crossArticleRelationships, reviewFilter), selectedCanonicalKeyword),
    relationshipChangeFilter,
  ),
  [crossArticleRelationships, reviewFilter, selectedCanonicalKeyword, relationshipChangeFilter],
);
```

## 三个 useEffect：初始化、任务轮询、运行中任务轮询

- **初始化**：挂载时拉 `fetchAdminStarfieldVersions()`，选 `isActive` 的版本或第一个，再 `fetchAdminStarfieldVersion(id)` 拉完整 payload。
- **任务模式轮询**（仅 `mode === 'tasks'`）：每 1.6 秒 `fetchAdminTasks()` 刷新任务列表，让作者实时看到 AI-agent 进度。
- **运行中任务轮询**：当当前版本有 `pending/running` 任务时，每 1.6 秒 `refreshVersion(activeVersion.id)` 刷新版本数据，让 Passage/关系生成完成后立即出现在审核界面。

所有轮询都用 `let cancelled = false` + cleanup 做卸载保护。

## mode === 'generation'：版本与 Passage 生成

生成模式分三块卡片：

1. **版本卡片**：输入框 + 「新建」（`createAdminStarfieldVersion`）+ 「派生增量」（`createIncrementalAdminStarfieldVersion`，从 `activePublishedVersion` 派生）。下方版本列表每行显示名称、状态、`changeMode`、`acceptedPassageCount` / `acceptedRelationshipCount` 统计，点击切换当前版本，右侧「删除」按钮调 `deleteAdminStarfieldVersion` 并在删除后自动选中下一个版本。
2. **Passage 切割卡片**：左侧勾选已发布文章（`publishedPosts`，从 `posts` 过滤 status 为 published 的），右侧「生成 Passage」按钮调 `generateAdminStarfieldPassages(versionId, articleIds)` 创建后台任务。当版本已发布（`activeVersionIsPublished`）时禁用生成并提示先派生增量版本——这是为了保护已公开的星图不被原地改写。
3. **状态卡片**（仅在 `activePayload` 存在时）：`StarfieldMetrics` 显示六项统计；`JobList` 显示最近 6 个任务及其进度条。

```ts
async function generatePassages() {
  if (!activeVersion || selectedArticleIds.length === 0) {
    setNotice('请先选择星图版本和文章。'); return;
  }
  await runAction(() => generateAdminStarfieldPassages(activeVersion.id, selectedArticleIds),
    'Passage 生成任务已创建，AI-agent 正在后台拆分文段。');
  setReviewTab('passages'); setReviewFilter('suggested');
}
```

## mode === 'review'：三栏审核工作区

审核模式是面板的核心，采用「工具栏 + 左列表 + 右详情」的经典三栏布局。

### 工具栏：版本选择、Tab、筛选、批量动作

顶部一长条工具栏：版本下拉、三个 Tab（Passage / 关系 / 深层路径，每个 Tab 显示 `候选/总数`）、状态筛选按钮组、关系专用的变更状态筛选、批量动作按钮组。批量动作根据 Tab 不同而切换：

- Passage Tab：「一键接受全部 suggested」（`bulkUpdateAdminStarfieldPassages` 带 `sourceStatus: 'suggested'`）、「接受当前筛选」、「隐藏候选」。
- 关系 Tab：同上，但只针对跨文章关系（`crossArticleOnly: true`）。
- 深层路径 Tab：同上，并提示「相邻星线可在关系中审核」。

工具栏右侧三个生成动作：「生成关系」（`generateAdminStarfieldRelationships`，要求 `acceptedPassages.length >= 2`）、「深度关系挖掘」（`generateAdminStarfieldDeepRelationships`）、「发布」（`publishAdminStarfieldVersion`，要求至少 1 个 accepted Passage，且当前版本未发布）。增量版本的关系按钮文案是「重建关系」。

### 左列表：filteredPassages / filteredRelationships / filteredDeepPaths

按当前 Tab 渲染对应的过滤后列表，每项是一个按钮，点击切换 `selectedPassageId` / `selectedRelationshipId` / `selectedDeepPathId`。每项左侧是 `StatusPill`（候选/已接受/已隐藏的颜色徽章），中间是标题和摘要，关系项额外显示 `source → target` 和关系类型标签。

### 右详情：PassageEditor / RelationshipEditor / DeepPathDetail

详情面板根据 Tab 和当前选中项渲染不同的编辑器，所有编辑器都用本地草稿状态（`passageDrafts[id]` / `relationshipDrafts[id]`）暂存编辑中的字段，点「保存」时才调后端。

- **PassageEditor**：编辑标题和关键词（逗号分隔），下方只读显示原文 `passage.text`，三个动作按钮（保存 / 接受 / 隐藏）。接受后会自动跳到下一个 Passage（`getNextItemId`），加快连续审核。
- **RelationshipEditor**：关系类型下拉（11 种）、强度数字框（0-1，步长 0.05）、关系说明 textarea、证据关键词展示。三个动作按钮同上。
- **DeepPathDetail**：只读展示四个 AI-agent 的产出——Inquirer 的问题、Path-Builder 的 Passage 序列、Retriever 的检索笔记列表、Critic 的质疑说明，以及强度数值。只提供「接受 / 隐藏」两个动作。

```ts
async function savePassage(passage, status = passage.status) {
  const draft = passageDrafts[passage.id] ?? { title: passage.title, keywords: passage.keywords.join('，') };
  const shouldAdvance = status !== passage.status;
  const nextPassageId = shouldAdvance ? getNextItemId(filteredPassages, passage.id) : passage.id;
  await runAction(() => updateAdminStarfieldPassage(passage.id, {
    status, title: draft.title, keywords: splitKeywords(draft.keywords),
  } as Partial<ApiStarfieldPassage>), /* ... */, (payload) => {
    // 保存后选中下一个 Passage
    if (!shouldAdvance) return;
    const nextPassages = filterByCanonicalKeyword(filterByStatus(payload.passages, reviewFilter), nextKeyword);
    const nextSelection = nextPassages.find((p) => p.id === nextPassageId) ?? nextPassages[0];
    setSelectedPassageId(nextSelection?.id ?? '');
  });
}
```

### CanonicalKeyword 联动筛选

工具栏底部在选中合并标签时显示「标签筛选」条，展示标签名、覆盖的 Passage 数和关系数。`filterByCanonicalKeyword` 对 Passage 直接按 `passageIds` 过滤；对关系则用 `relationshipMatchesCanonicalKeyword`——只要关系的某个 evidence keyword 命中标签（或其别名），或者 source/target 都属于该标签的 Passage 集合，就算匹配。这套联动让作者能围绕一个概念集中审核相关 Passage 和关系。

## mode === 'tasks'：后台任务总览

任务模式不绑定具体版本，按来源（`sourceType`）筛选。左侧列出所有来源（`taskSourceOptions` 由 `taskItems` 动态去重得到），右侧用大尺寸 `JobList` 显示任务，每个任务带阶段（Passage 生成 / 关系生成 / 深度关系挖掘）、状态、当前步骤、来源名称和进度条。

## runAction：统一的写操作包装

所有写操作都走 `runAction(action, message, onPayload?)`：设忙锁 → 调 `action()` → 如果返回 payload 就更新 `activePayload` 和 `versions` 列表 → 显示成功/失败提示 → 解锁。这个包装保证了「每次写操作后 UI 都能立刻反映最新的后端状态」。

```ts
async function runAction(action, message, onPayload?) {
  setBusy(true); setNotice('');
  try {
    const payload = await action();
    if (payload) {
      setActivePayload(payload);
      setVersions(await fetchAdminStarfieldVersions());
      onPayload?.(payload);
    }
    setNotice(message);
  } catch { setNotice('操作失败，请确认登录状态和后台服务。'); }
  finally { setBusy(false); }
}
```

## 草稿同步与选中修正

一个 effect 监听 `passages` / `relationships` / `deepPaths` 变化，把每个项目的当前字段同步进 `passageDrafts` / `relationshipDrafts`，并修正 `selectedPassageId` 等选中状态——如果当前选中的 id 不在新数据里，就回退到第一个。这保证了后端推送新数据（轮询或写操作返回）后，编辑器不会显示已失效的内容。

## 子组件

- `StarfieldMetrics`：六格统计条（Passage 总数、待审星点、关系总数、待审关系、深层路径、合并标签）。
- `JobList`：任务列表，每条带 `<progress>` 进度条，`large` / `showSource` 控制紧凑度。
- `StatusPill`：候选（黄）/ 已接受（绿）/ 已隐藏（灰）的小徽章。
- `CanonicalKeywordSummary`：当前选中合并标签的详情卡片（标签名、覆盖数、别名列表）。
- `EmptyDetail`：未选中任何项时的占位。

## 过滤辅助函数

`filterByStatus` / `filterByCanonicalKeyword` / `filterRelationshipsByCanonicalKeyword` / `filterRelationshipsByChangeState` 是四个纯函数，按字段链路过滤任意带 `status` / `id` 的列表。`relationshipMatchesCanonicalKeyword` 实现关系的复合匹配（evidence keyword 或 passage 覆盖）。`getNextItemId` 在保存并接受后返回下一个待审 Passage 的 id，实现连续审核的快捷流。`splitKeywords` 把中文逗号或英文逗号分隔的字符串切成数组。

## 调用的 apiClient 函数

按业务域分组：

- **版本**：`fetchAdminStarfieldVersions`、`fetchAdminStarfieldVersion`、`createAdminStarfieldVersion`、`createIncrementalAdminStarfieldVersion`、`deleteAdminStarfieldVersion`、`publishAdminStarfieldVersion`。
- **Passage**：`generateAdminStarfieldPassages`、`updateAdminStarfieldPassage`、`bulkUpdateAdminStarfieldPassages`。
- **关系**：`generateAdminStarfieldRelationships`、`generateAdminStarfieldDeepRelationships`、`updateAdminStarfieldRelationship`、`bulkUpdateAdminStarfieldRelationships`。
- **深层路径**：`updateAdminStarfieldDeepPath`、`bulkUpdateAdminStarfieldDeepPaths`。
- **任务**：`fetchAdminTasks`。

后端实现见 `server_py/starfield.py`。
