# styles.css

> 源路径：`src/styles.css`
> 总行数：约 9110 行

整个项目的视觉基石：用一份 CSS 文件承载古典（classic）与赛博（cyber）两套主题、明暗两种配色、公开站点和后台写作台的全部样式。

## 文件概览

`styles.css` 不是普通的样式表，而是项目的"设计令牌中心 + 视觉语法手册"。它定义了约 30 个 CSS 自定义属性（`--ink`、`--paper`、`--qing`、`--cinnabar`、`--moon` 等）作为整套色彩语言，再用 `[data-style-preset]` 和 `[data-color-scheme]` 两个根属性切换出四种组合（古典明/暗、赛博明/暗）。所有组件样式都通过引用这些变量来获得主题感知能力。

文件大致按"变量 → 重置 → 公开站点 → 文章渲染 → 后台 → 写作台 → 关键帧动画 → 响应式"的顺序展开。本文档按视觉区域分块讲解，不逐行展开 CSS 声明。

## CSS 变量与主题切换

在 `:root` 上集中声明变量，并用属性选择器为四种组合分别覆盖。关键变量包括：墨色 `--ink`、纸色 `--paper`、纸深 `--paper-deep`、青 `--qing`、朱 `--cinnabar`、月白 `--moon`、行线 `--line`、表面 `--surface` / `--surface-strong`、圆角 `--radius` / `--radius-small`、阴影 `--shadow`。

```css
:root {
  --ink: #2d251b;
  --paper: #f7f0df;
  --paper-deep: #ede0c4;
  --qing: #4f8a90;
  --cinnabar: #b34a3c;
  --moon: #c3b59c;
  --line: rgba(45, 37, 27, 0.12);
  --radius: 12px;
}
:root[data-color-scheme="dark"] { --ink: #f5ead8; --paper: #1c1a17; /* ... */ }
:root[data-style-preset="cyber"] { --qing: #45d0ff; --cinnabar: #ff5f7a; /* ... */ }
```

变量被 `applySiteSettings`（见 `src/siteSettings.ts`）动态写入 `document.documentElement`，因此切换主题/明暗不需要重新加载页面。

## 字体与排版基础

声明全局字体栈：标题与正文使用宋体族 `"Noto Serif SC", "Songti SC", SimSun, serif`，UI 文字使用 `"Inter", "PingFang SC", -apple-system, ... sans-serif`，代码使用 `"SFMono-Regular", Consolas, ... monospace`。统一 `box-sizing: border-box`、`body` 背景使用 `var(--paper)`、链接继承颜色、`button` 重置为透明背景。`focus-visible` 给出青色描边以保证可访问性。

## 布局与容器

`.site-shell` 是顶层 Grid 容器（min-height 100vh，单列）。`.site-header` 是 sticky 顶栏，内部用 flex 排列 `.brand`（站名 + 标语）、`.desktop-nav`、`.header-actions`。`.author-avatar` 是圆形头像（`aspect-ratio: 1` + `object-fit: cover`）。`.icon-button` 是 44×44 的方形图标按钮（移动端最小点击区）。`.mobile-drawer` 是窄屏抽屉式导航。

## 首页 Hero 与背景

`.hero` 使用 `position: relative` + `min-height: 80vh`，内含 `.hero-art img`（应用 `filter: saturate/contrast` 营造水墨感）、`.moon-orbit`（CSS 动画的月轨）、`.water-shimmer`（水面反光的 mask 渐变动画）、`.seal`（竖排印章文字 `writing-mode: vertical-rl`）、`.season-card`（节气信息卡）。`.home-content-background` 在 Hero 下方用两层径向渐变 + `homeBackgroundDrift` 关键帧做出缓慢呼吸的背景。

```css
.moon-orbit { animation: moonDrift 18s ease-in-out infinite; }
@keyframes moonDrift {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(-20px, -12px, 0); }
}
```

## 首页内容区与卡片

`.home-content` 包含 `.section-heading`（眉题 + 标题 + 描边装饰）、`.featured-card`（特色文章大卡）、`.post-grid`（普通文章网格）。`.post-card` 与 `.list-post` 是两种列表项样式：卡片版有阴影和悬浮上浮，列表版是横线分隔的紧凑行。`.featured-title-compact` / `dense` / `ultra` 是为不同标题长度准备的字号阶梯。

## 文章列表与筛选

`.listing-page` 通用容器，`.filter-bar` 是横向标签栏（`.filter-tab` 用 `aria-pressed` 切换激活态，激活时背景翻转为 `--ink`、文字翻转为 `--paper`）。`.archive-page` 使用 `.timeline`（左侧竖线 + 每条目一个圆点）+ `.archive-summary`。

## 文章详情与正文

`.article-page` 包裹整篇详情。`.article-hero` 渲染封面 + 标题 + 元信息。`.article-toc` 是粘性目录（`position: sticky; top`）。`.article-body` 是最重要的样式块：它给 Markdown 渲染出的 `h1`-`h4`、`blockquote`、`p`、`ul/ol`、`table`、`a`、`code`、`pre` 提供主题感知的排版规则。代码块走深色主题（`--paper-deep` 背景 + 浅色文字），并配合 `highlight.js` 的 token 颜色。

```css
.article-body pre {
  background: color-mix(in srgb, var(--paper-deep) 90%, #000);
  border-radius: var(--radius);
  overflow-x: auto;
  padding: 16px;
}
.article-body pre code { background: transparent; color: inherit; }
```

KaTeX 数学公式用 `.katex-display` 居中并允许横向滚动。

## 管理面板

`.admin-shell` 使用动画背景（`adminBackgroundDrift` 关键帧的两层渐变），区别于公开站点。`.admin-login-main` / `.admin-login-panel` 是登录卡片。`.admin-hero` 是后台欢迎区，`.admin-workspace` 是主区域 Grid（左 sticky `.admin-sidebar` + 右 `.admin-panel`）。`.admin-panel-header` 提供标题与操作按钮槽位。

### 仪表盘与命令面板

`.admin-dashboard` 用 Grid 排列 `.stat-card`（数字 + 标签）。`.admin-command` 是类终端的命令行面板，包含 `.admin-command-console`（输出区）、`.admin-command-ai`（AI 助手）、`.admin-command-catalog`（命令目录）、`.admin-command-registry`（注册表）、`.admin-command-guide`（指南）、`.admin-command-args`（参数区）、`.admin-command-risk-pills`（风险标签）。`.llm-config-form` 配合 `.provider-grid` 和 `.token-usage` 完成 LLM 配置与用量展示。

### 文章列表与筛选工具栏

`.admin-posts-overview` 是总容器。`.admin-toolbar` 是一行式搜索 + 标签筛选。`.admin-post-filter-toolbar` 是更复杂的三列 Grid：搜索面板 + 标签分组 + 状态分组，每列用 `border-left` 分隔。`.admin-filter-tabs button[aria-pressed="true"]` 翻转为墨底白字。`.admin-post-row` 是文章行（左选框 / 中标题元信息 / 右操作按钮），`.admin-pagination` 是底部分页。`.admin-trash-notice`（朱色提示）和 `.admin-batch-notice`（青色提示）用于批量操作反馈。

```css
.admin-post-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
}
.admin-post-row:hover { border-color: color-mix(in srgb, var(--qing) 30%, var(--line)); }
```

### 标签管理

`.admin-tags-overview` 容器。`.admin-tag-tools` 是左右双列：左 `.admin-tag-merge-box`（合并标签，三个 select + 按钮）+ 右 `.admin-tag-grid`（自适应卡片网格）。`.admin-tag-card` 用 `[aria-current="true"]` 高亮当前选中，右侧显示文章计数和删除按钮。

### 评论审核

`.comments-moderation` 容器，`.comments-status-tabs` 顶部状态切换（待审/通过/拒绝）。`.comment-moderation-card` 每条评论一张卡：头部作者 + 文章链接 + 时间，正文 `white-space: pre-wrap` 保留换行，底部 `.comment-moderation-actions` 提供通过/拒绝按钮。状态药丸 `.status-published`（青）、`.status-draft`（月）、`.status-archived`（朱）与文章状态共享一套语义。

## 写作台（Typora）

这是文件中最复杂的视觉区，约 1500 行。`.admin-composer` 是外层，`.typora-shell` 是真正的写作台容器，定义了一系列局部变量（如 `--typora-paper`、`--typora-ink`）方便模式切换。

### 顶栏与模式切换

`.typora-topbar` 是顶部工具栏，包含 `.typora-mode-tabs`（所见即所得 / Markdown / 分屏三模式，用 `aria-pressed` 切换）和 `.top-actions`（保存 / 发布 / 退出）。`.writing-metrics` 显示字数统计。`.focus-mode` 类会隐藏除当前段落外的所有内容。

### 布局：左大纲 + 中纸 + 右详情

`.typora-layout` 是三列 Grid：`.writer-outline`（`position: sticky` 固定左侧目录，`.outline-item` 表示各级标题）+ `.typora-paper`（居中写作区，`max-width` 限制阅读宽度）+ `.typora-details`（`position: sticky` 固定右侧元信息面板，`.details-closed` 时 `visibility: hidden`）。

```css
.typora-paper {
  max-width: 760px;
  margin: 0 auto;
  background: var(--typora-paper);
  border-radius: var(--radius);
  padding: clamp(28px, 5vw, 56px);
}
```

### 标题输入与工具栏

`.typora-title-input` 是无边框大标题输入框（`font-size: clamp(1.8rem, 4vw, 2.6rem)`，placeholder 在明暗模式下分别取色）。`.typora-subline` 用分隔点（`·`）串联分类、日期、阅读时长。`.typora-toolbar` 提供富文本操作（粗体、斜体、标题、引用、代码、列表、表格、公式、图片等），在 markdown 模式下会隐藏部分按钮。`.typora-icon-action` 是方形图标按钮。

### 编辑器主体

`.typora-editor` 是纯 Markdown 模式的 `<textarea>`（等宽字体、`line-height: 1.8`、自动 resize）。`.typora-rich-editor` 是所见即所得模式，深度覆盖 mdxeditor 的内部类（`.cm-editor`、`.cm-gutters`、`.cm-activeLine`、`.cm-cursor`、`.cm-selectionBackground`、`.cm-matchingBracket`），并在 `[data-color-scheme="dark"]` 下切换为深色 CodeMirror 主题。`.typora-rich-content` 控制富文本内的段落和代码块样式。`.wysiwyg-formula-node` 是公式占位节点（行内/块级两种），`.wysiwyg-formula-editor` 是其编辑弹层。

```css
:root[data-color-scheme="dark"] .typora-rich-editor .cm-gutters {
  background: var(--paper-deep);
  border-right: 1px solid var(--line);
}
:root[data-color-scheme="dark"] .typora-rich-editor .cm-activeLine { background: rgba(255,255,255,0.04); }
```

### 分屏与预览

`.typora-split` 是分屏模式容器（左右等分）。`.typora-preview` 是右侧预览，复用 `.article-body` 的渲染样式但缩小字号。

### 详情面板与元信息

`.typora-details-head` 是详情面板头部。`.composer-meta-fields` 包含 `.composer-cover-field`（封面预览 + 操作按钮组 `.composer-cover-actions`）。`.tag-editor` 是标签芯片输入：`.tag-chip-input` 是带边框的容器，内部 `.tag-chip-input button` 是已选标签芯片（青色背景 + 圆角），`.tag-suggestions` 是推荐标签。`.meta-pair` 是两列字段网格。

## 写作台弹层

四种弹层共用一套视觉（玻璃质感卡片 + 阴影）：

- `.shortcut-layer` / `.shortcut-panel`：快捷键速查表，`.shortcut-grid` 是两列网格，每格 `<kbd>` 键位 + 说明。
- `.draft-restore-layer` / `.draft-restore-panel`：草稿恢复提示，`.draft-restore-copy dl` 用 Grid 网格展示标题/时间/字数等字段。
- `.formula-panel`：公式编辑器，`.formula-mode-tabs` 切换行内/块级，`.formula-preview` 实时预览渲染结果。
- `.find-replace-panel`：查找替换浮窗，`position: fixed; top: 150px; right: 18px`，常驻写作过程。
- `.gallery-picker-panel` / `.gallery-picker-grid`：图库选择网格（4:3 缩略图）。
- `.cover-picker-panel`：大型封面选择器，`.cover-picker-layout` 是三列 Grid（`.cover-picker-sidebar` 相册侧栏 + `.cover-picker-content` 主区 + `.cover-picker-preview` 预览），预览框 `.cover-picker-preview-frame` 用棋盘格背景显示透明 PNG。

```css
.cover-picker-layout {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr) minmax(260px, 340px);
}
```

## 后台内容编辑面板

### 笔记与系列

`.note-listing-grid` 是首页札记的网格，`.note-section-card` 是每段札记卡。后台 `.note-editor-list` + `.note-editor-row` 提供编辑界面。

`.series-editor-list` 容器，`.series-editor-card` 是每个系列卡（含 `.series-editor-fields` 两列字段 + `.series-post-picker` 文章选择器 + `.series-selected-posts` 已选列表 + `.series-editor-footer` 底部操作）。

### 图库管理

`.gallery-manager` 是左右双列 Grid（`.gallery-album-list` 相册侧栏 + `.gallery-board` 主区）。`.gallery-album-list button[aria-pressed="true"]` 高亮当前相册，`.gallery-album-thumb` 是 1:1 缩略图。`.gallery-board-toolbar` 是主区顶栏（相册名 + 操作），下方是图片网格。

### 归档与首页编辑

`.admin-archive-list` + `.admin-archive-entry` + `.archive-filter-controls`（含 `input[type="month"]`）提供按月归档筛选。`.homepage-form` + `.season-settings` 编辑首页文案与节气。

### 设置与外观

`.setting-group` / `.danger-setting-group`（朱色边框警示）是设置分组。`.segmented-control` 是分段开关。`.admin-preview` + `.preview-visual` 提供实时预览。

## 星图页面

`.starfield-page` 是固定深色全屏容器（`position: fixed; inset: 0`），与公开站点的纸色背景完全脱离。内部包含：

- `.starfield-hero`：标题区。
- `.starfield-workspace`：主工作区 Grid。
- `.starfield-canvas`：3D 画布容器。
- `.starfield-overlay`：叠加层（玻璃质感 `backdrop-filter: blur`）。
- `.starfield-legend` / `.starfield-hint`：图例与提示。
- `.starfield-inspector`：节点详情面板。
- `.starfield-network-panel` / `.starfield-focus-panel`：网络视图与聚焦视图。

```css
.starfield-page {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, #0c1220, #05080d);
  color: #effcff;
}
.starfield-overlay { backdrop-filter: blur(18px); background: rgba(12, 18, 32, 0.55); }
```

## 图库与灯箱

`.gallery-page` 公开图库页。`.album-panel` 是相册卡（封面 + 标题 + 计数）。`.gallery-tile` 是图片瓦片（`aspect-ratio` 锁定 + 悬浮上浮）。`.gallery-lightbox` 是全屏灯箱（`position: fixed; inset: 0` + 深色半透明背景 + 居中大图 + 左右切换按钮）。

`.topic-river` 是首页"主题河"组件：横向滚动的系列卡片轨道，配合 `requestAnimationFrame` 自动慢速滚动 + 鼠标拖拽暂停。

## 评论与页脚

`.article-comments` 是文章底部评论区，`.comment-card` 是单条评论（作者 + 时间 + 正文）。`.article-neighbors` 是上/下一篇导航（两列 Grid）。`.site-footer` 是全站页脚（`--paper-deep` 背景 + 多列链接 + 头像与署名）。

## 搜索面板

`.search-layer` 是全屏遮罩，`.search-panel` 是居中搜索卡（玻璃质感）。内部 `.search-input` + `.search-results` + `.search-quick-links`，使用 focus trap（`inset 0` + `overflow: auto`）。

## 关键帧动画

集中定义在文件末尾，供各组件引用：

- `moonDrift`：月轨漂移。
- `shimmer`：水面反光。
- `homeBackgroundDrift` / `homeWaterDrift`：首页背景呼吸。
- `typoraWaterDrift`：写作台背景水墨流动。
- `adminBackgroundDrift`：后台背景流动。
- `topicRiverDrift`：主题河横向滚动。

所有动画都遵守 `prefers-reduced-motion` 媒体查询（运动敏感用户禁用动画）。

## 响应式断点

三个主要断点：

- `@media (max-width: 920px)`：双列布局坍缩为单列（`.admin-workspace` 的 sticky 侧栏改为横向滚动条，`.typora-layout` 隐藏右侧详情面板，`.series-editor-fields` 改单列）。
- `@media (max-width: 680px)`：移动端紧凑（缩小字号、`.post-grid` 改单列、`.gallery-picker-grid` 改两列、隐藏部分顶栏按钮）。
- `@media (prefers-reduced-motion: reduce)`：禁用所有 `animation` 和 `transition`。

## 暗色模式覆盖

除 `:root` 变量切换外，部分组件有专门的 `[data-color-scheme="dark"]` 覆盖：代码块、CodeMirror 编辑器、`select option`（不同 preset 下选中态颜色不同）、过滤工具栏背景。这些覆盖保证深色模式下对比度仍达标。

## 风险点与维护提示

- 文件超大（9110 行），新增样式时务必先搜索现有 className，避免重复定义。
- 颜色一律走 `var(--xxx)` 或 `color-mix(in srgb, var(--xxx) ...%)`，禁止硬编码十六进制，否则主题切换会失效。
- 写作台相关的 `.typora-*` 类与 mdxeditor 内部 DOM 深度耦合，升级 mdxeditor 时需回归测试。
- 星图页面是独立深色视觉，不要复用公开站点的纸色变量。
