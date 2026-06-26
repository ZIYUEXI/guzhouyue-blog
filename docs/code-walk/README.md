# 代码说明库 (Code Walkthrough)

本目录是 Guzhouyue Blog 项目所有源代码文件的分块讲解。每个源码文件对应一个 md，按功能切块讲解代码意图。

## 目录结构

目录结构镜像源码路径：

| 源文件 | 对应文档 |
| --- | --- |
| `src/App.tsx` | `src/App.md` |
| `src/main.tsx` | `src/main.md` |
| `server_py/app.py` | `server_py/app.md` |
| `scripts/audit-theme-vars.mjs` | `scripts/audit-theme-vars.md` |
| `vite.config.ts` | `configs/vite.config.md` |
| `tsconfig.json` | `configs/tsconfig.md` |
| `package.json` | `configs/package.md` |

## 格式约定

每个 md 文件统一遵循以下结构：

```markdown
# <文件名>

> 源路径：`<相对路径>`
> 总行数：<约 N 行>

<一句话整体职责>

## 文件概览

<1-2 段散文：这个文件在项目中扮演什么角色、和谁交互、关键依赖>

## <功能块 1 标题>

<一段散文：这段代码做什么、为什么这样写、关键变量/函数/类型>

\`\`\`tsx|ts|py|css|json
<5-15 行关键代码片段，可裁剪>
\`\`\`

## <功能块 2 标题>

...
```

## 写作要求

- **中文**撰写，目的是让后来的人（或三个月后的你）快速看懂这个文件。
- **按功能分块**，不严格逐行翻译。每块应有标题和散文讲解，必要时附少量代码。
- **讲解意图**：不要只复述 `const x = 1`，而要说明为什么需要 `x`、谁会用它、边界条件。
- **突出关键**：核心类型、对外 API、副作用、风险点要写清楚。
- **跨文件引用**：当某段代码和别的文件协同时，指明对方文件名（如"实际数据库操作见 `server_py/content.py`"）。

## 特殊处理

- **`styles.css`**：按视觉区域分块（基础变量、字体、布局、首页、文章页、列表卡片、管理面板、星图、响应式等）。每块说明视觉目的和关键变量，**不展开每一行 CSS 声明**。
- **`posts.ts`**：只讲解 `Post`/`PostStatus` 类型、`postsPerPage`、`archive`、`getPostBySlug`、`getAdjacentPosts` 等逻辑部分；**跳过嵌入的中文文章正文数据**。
- **超大文件**（`App.tsx`、`starfield.py`、`styles.css` 等）：按功能区域分块，每块标题清晰，便于跳读。
- **数据/配置文件**（`tsconfig.json`、`package.json`）：可以更紧凑，整体一段说明 + 关键字段表。

## 索引

完整的源文件 → 文档映射见上级目录的 [`../code-files.md`](../code-files.md)。
