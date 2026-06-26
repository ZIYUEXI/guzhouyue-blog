# AdminCommandPanel.tsx

> 源路径：`src/AdminCommandPanel.tsx`
> 总行数：约 605 行

管理后台「快速指令」面板：提供两条并行的指令通道——结构化指令控制台（解析、预演、执行）和 AI 自然语言助手（LLM 把口语翻译成结构化指令后再执行）。

## 文件概览

这个面板把后台所有写操作统一抽象成「指令」（command），格式形如 `<domain>:<action> [target] [--key=value]`。它通过 `apiClient` 调用四个端点：`fetchAdminCommandGuide`（拉取已注册指令目录与解析规则）、`parseAdminCommand`（只解析不执行）、`runAdminCommand`（执行，支持 dry-run）、`runAdminCommandAi`（LLM 通道）。除了主组件，文件里还有 `CommandCard` / `CommandFeedback` / `CommandInvocationView` / `CommandResultView` / `CommandAiResultView` 等子组件用于渲染指令目录和执行结果。

关键依赖：`apiClient` 中所有 `ApiAdminCommand*` 类型与四个指令函数。

## 状态与状态机

组件维护两套独立状态：

- **结构化通道**：`input`（指令文本框）、`parseResult`（解析结果）、`runResult`（执行结果）、`status`（loading/ready/error）、`busy`。
- **AI 通道**：`naturalInput`（自然语言输入框）、`naturalHistory`（对话历史 `ApiAdminCommandAiMessage[]`）、`naturalResult`（LLM 返回）、`recentAiResults`（最近一次执行结果，作为下一次调用的上下文）、`aiBusy`。

`guide` 是从后端拉取的 `ApiAdminCommandGuide`，包含 `pattern`（指令范式说明）、`rules`（解析规则）、`placeholderExamples`（示例）、`commands`（已注册指令列表 `ApiAdminCommandDescriptor[]`）。挂载时拉一次，后续解析/执行返回里也会带最新的 `guide` 同步刷新。

## 指令目录与搜索

`commands = guide?.commands ?? []` 是全部已注册指令；`filteredCommands` 按 `commandQuery` 在指令名、说明、作用域、参数描述里做大小写不敏感搜索；`groupedCommands = groupCommandsByScope(...)` 按 `scope` 字段分组并按中文 locale 排序。每个指令是一张 `CommandCard`，显示名称、风险等级（`risk: low/medium/high`，对应不同图标和颜色）、说明、参数列表（前 4 个），并提供「填入」按钮把 `createCommandExample(command)` 生成的示例塞进 `input`。

```ts
function createCommandExample(command) {
  const required = command.arguments
    .filter((a) => a.required)
    .map((a) => a.type === 'boolean' ? `--${a.name}` : `<${a.name}>`);
  return [command.name, ...required].join(' ');
}
```

## 结构化通道：解析、预演、执行

三个动作对应三个 handler：

- **解析**（`handleParse`）：调 `parseAdminCommand(input)`，只做语法校验，把 `ok: true/false` 的结果展示给作者，**不写库**。失败时显示 `errors`。
- **预演**（`handleRun(true)`）：调 `runAdminCommand(input, { dryRun: true })`，后端会校验业务规则（如「这个 slug 存不存在」）但不真正写。
- **执行**（`handleRun(false)`）：调 `runAdminCommand(input, { dryRun: false })`，真正写入。

`visibleInvocation` 优先取执行结果里的 invocation，否则取解析结果，让作者始终能看到当前指令被解析成了什么 `name + positional + options`。`CommandFeedback` 根据 `parseResult.ok` / `runResult.status`（`invalid / unknown_command / dry_run / confirmation_required / failed / executed`）显示对应的中文反馈，是整个面板的「状态解释器」。

```ts
if (runResult?.status === 'confirmation_required') {
  return <p className="admin-command-notice is-error">该指令需要二次确认后才能执行。</p>;
}
```

## AI 自然语言通道

`handleNaturalRun` 是 LLM 通道入口：把当前输入和历史拼成 `nextHistory`，调 `runAdminCommandAi({ message, history, recentResults })`。后端会用 LLM 把自然语言翻译成若干条结构化指令并依次执行，返回 `ApiAdminCommandAiResult`（包含 `reply` 文本、`commands` 计划、`results` 每条指令的执行结果）。

组件做了三件事：

1. 把 LLM 回复追加到 `naturalHistory` 作为 `assistant` 消息，并在后面附上每条指令的 `input => status` 摘要；
2. 用 `setRecentAiResults(result.results)` 保存最近结果，作为下一次调用的 `recentResults` 上下文（让 LLM 能引用「刚才那些文章」）；
3. 找到最后一条 `status === 'executed'` 的结果，把它塞进结构化通道的 `runResult`，这样下方的 `CommandResultView` 会展示 LLM 实际执行的指令产出。

```ts
const lastExecuted = [...result.results].reverse().find((item) => item.status === 'executed');
if (lastExecuted) setRunResult(lastExecuted);
```

失败时往历史里塞一条「自然语言指令暂时不可用，请确认 LLM 配置」的 assistant 消息，引导作者去 LLM 面板。对话历史只展示最近 6 条（`slice(-6)`）。

## 结果视图：CommandResultView 与 CommandAiResultView

`CommandResultView` 智能渲染 `unknown` 类型的执行结果：

- 如果结果是 `{ items: [...] }` 且每项有 `id`，渲染成表格（ID、标题、Slug、状态）；
- 如果是单篇 `{ article: {...} }`，渲染成卡片（ID/Slug/Status/Updated + `bodyMarkdown` 正文 pre）；
- 否则 fallback 到 `<pre>JSON.stringify</pre>`。

`CommandAiResultView` 类似但更紧凑，展示 LLM 的 `reply`、`commands` 计划、每条指令的执行状态。这两个视图共用 `isRecord` / `asResultText` 助手把 `unknown` 安全转成可显示文本。

## 指令范式侧栏

右侧 `admin-command-guide` 显示 `guide.pattern`（如 `<domain>:<action> [target] [--key=value]`）、`placeholderExamples`（点击直接填入 input）、`rules`（折叠的解析规则列表）。这一栏既是文档又是快捷输入面板，帮作者在不查文档的前提下拼出合法指令。

## 调用的 apiClient 函数

- `fetchAdminCommandGuide` → `GET /api/admin/commands`
- `parseAdminCommand` → `POST /api/admin/commands/parse`
- `runAdminCommand` → `POST /api/admin/commands/run`（带 `dryRun` / `confirm` 选项）
- `runAdminCommandAi` → `POST /api/admin/commands/ai`（带 `message` / `history` / `recentResults`）

后端实现见 `server_py/app.py` 与 `server_py` 下的指令框架模块。
