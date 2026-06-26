# package.json

> 源路径：`package.json`
> 总行数：约 38 行

前端工程的元信息清单：定义 npm 脚本、生产依赖、开发依赖，以及 ESM 模块标识。

## 文件概览

`package.json` 是前端工程的根元信息文件。它定义了：

1. **`scripts`**：开发、构建、测试、seed 等所有命令入口（这是开发者最常用的字段）。
2. **`dependencies`**：运行时依赖（React、Markdown 渲染栈、3D 星图）。
3. **`devDependencies`**：构建期依赖（Vite、TypeScript、类型定义）。
4. **`"type": "module"`**：声明项目所有 `.js` 文件按 ESM 解析。

`name`/`version`/`private` 字段保持最小：项目是私有部署的个人博客，不发布到 npm，所以 `private: true` 阻止误推。

## 关键字段表

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `name` | `guzhouyue-blog` | 包名 |
| `version` | `0.1.0` | 版本号（私有项目，未严格遵循 semver） |
| `private` | `true` | 阻止 `npm publish` |
| `type` | `module` | `.js`/`.mjs` 默认按 ESM 解析 |
| `scripts` | 见下 | npm 脚本入口 |
| `dependencies` | 见下 | 生产环境依赖 |
| `devDependencies` | 见下 | 构建/类型检查依赖 |

## npm 脚本

| 脚本 | 命令 | 作用 |
| --- | --- | --- |
| `dev` | `vite --host 0.0.0.0 --port 5173 --strictPort` | 启动 Vite dev server，监听 5173（`strictPort` 失败即退出，不自动 +1） |
| `dev:server` | `python -m server_py.app` | 启动 FastAPI 后端（生产/开发都用 uvicorn 直接跑） |
| `seed:server` | `python -m server_py.seed` | 跑默认 seed（栏目/示例文章/系统图库） |
| `seed:test-articles` | `python -m server_py.seed_test_articles` | 跑测试夹具文章（仅本地/CI 用） |
| `test:server` | `python -m server_py.smoke_test && python -m server_py.compat_test` | 跑两阶段后端测试 |
| `test:theme` | `node scripts/audit-theme-vars.mjs` | 单独跑主题审计 |
| `build` | `node scripts/audit-theme-vars.mjs && tsc --noEmit && vite build` | 完整构建：主题审计 → typecheck → 打包 |
| `preview` | `vite preview --host 0.0.0.0 --port 4173 --strictPort` | 预览构建产物 |

`build` 是项目最重要的脚本——三步串联确保任何一步失败都会阻止发布：

1. **主题审计**：所有风格预设 × 配色都有完整 CSS 变量。
2. **typecheck**：所有 TypeScript 文件类型正确。
3. **vite build**：实际打包到 `dist/`。

## 生产依赖

| 包 | 用途 |
| --- | --- |
| `react`, `react-dom` | React 19 核心 |
| `react-markdown` | 把 Markdown 渲染成 React 节点 |
| `remark-gfm` | 支持 GitHub Flavored Markdown（表格、任务列表） |
| `remark-math`, `rehype-katex` | 数学公式（KaTeX） |
| `rehype-highlight`, `highlight.js` | 代码块语法高亮 |
| `@mdxeditor/editor` | 富文本/Markdown 编辑器（管理台用） |
| `lucide-react` | 图标库 |
| `three` | Starfield 3D 渲染（公开星图页面） |

依赖组合反映项目的两大重点：

- **渲染栈**：react-markdown + 一系列 remark/rehype 插件，把 Markdown 转成富文本 HTML，支持表格、公式、代码高亮。
- **可视化**：`three` 用于 Starfield 的 3D 知识图谱可视化。

## 开发依赖

| 包 | 用途 |
| --- | --- |
| `typescript` | 类型检查 |
| `vite` | 构建 + dev server |
| `@vitejs/plugin-react` | React Fast Refresh + JSX 转译 |
| `@types/react`, `@types/react-dom`, `@types/three` | 类型定义 |

devDependencies 刻意保持精简——没有引入 ESLint、Prettier、测试框架（Jest/Vitest）。后端测试用 Python 自己的 `fastapi.testclient`，前端目前没有单元测试，依赖 typecheck + 主题审计 + 后端契约测试作为质量门。

## 备注

- `python -m server_py.xxx` 脚本依赖仓库根目录作为 cwd，所以所有 `npm run xxx` 都要在仓库根目录执行。
- 后端 Python 依赖不在 `package.json` 里管理（没有 `requirements.txt` 引用），实际安装见 `server_py/` 下相关说明或 CI 脚本。
- 想加 ESLint/Prettier/Vitest，需要在这里加 devDependencies 并补 `lint`/`format`/`test` 脚本；目前项目刻意没引入，避免工具链膨胀。
