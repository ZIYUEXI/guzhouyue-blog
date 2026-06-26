# tsconfig.json

> 源路径：`tsconfig.json`
> 总行数：约 20 行

前端应用代码的 TypeScript 编译配置，被 `tsc --noEmit`（typecheck）和 Vite/IDE 共享。

## 文件概览

`tsconfig.json` 是 `src/` 目录下所有 `.ts`/`.tsx` 文件的类型检查规则来源。它配合 `package.json` 的 `build` 脚本（`tsc --noEmit && vite build`）做"构建前 typecheck"，让类型错误在打包之前就失败。

项目使用 React 19 + Vite 8，所以选择的是"现代 ES 模块 + Bundler 解析 + 严格模式"组合，没有引入路径别名（`paths`）、装饰器、`emitDeclarationOnly` 等高级特性，保持配置最小。

## 关键字段表

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `target` | `ES2022` | 编译目标 ES2022（支持 top-level await、class fields 等） |
| `useDefineForClassFields` | `true` | class 字段使用 ES 标准 `[[Define]]` 语义（而不是 TypeScript 历史的 `[[Set]]`） |
| `lib` | `["DOM", "DOM.Iterable", "ES2022"]` | 类型环境包含 DOM API 和 ES2022 标准库 |
| `allowJs` | `false` | 不允许 `.js` 文件参与编译，强制全 TypeScript |
| `skipLibCheck` | `true` | 跳过 `.d.ts` 内部检查，加速 typecheck |
| `esModuleInterop` | `true` | 允许 default import CommonJS 模块 |
| `allowSyntheticDefaultImports` | `true` | 配合 esModuleInterop，让 default import 类型成立 |
| `strict` | `true` | 全套严格模式（noImplicitAny、strictNullChecks 等） |
| `forceConsistentCasingInFileNames` | `true` | 大小写敏感的文件名（避免 macOS/Windows 差异导致 Linux 构建失败） |
| `module` | `ESNext` | 输出 ES 模块（Vite 接管打包） |
| `moduleResolution` | `Bundler` | 用 Vite/打包工具的解析策略（支持 `package.json` 的 `exports` 字段） |
| `resolveJsonModule` | `true` | 允许 `import xxx from './foo.json'` |
| `isolatedModules` | `true` | 每个文件独立编译（Vite/esbuild 要求），禁止跨文件 const enum |
| `noEmit` | `true` | 不产出 JS，只做类型检查（实际打包由 Vite 负责） |
| `jsx` | `react-jsx` | 用 React 17+ 的 automatic runtime，不需要 `import React` |
| `include` | `["src", "vite.config.ts"]` | typecheck 范围：应用代码 + Vite 配置 |

## 几个值得强调的字段

### `module: "ESNext"` + `moduleResolution: "Bundler"`

这是 Vite 项目推荐的组合。`Bundler` 解析策略让 TypeScript 理解 `package.json` 的 `exports` 字段，从而正确解析像 `react-markdown`、`rehype-highlight` 这类纯 ESM 包的入口。

### `jsx: "react-jsx"`

React 17+ 引入的自动 JSX runtime。代码里写 `<Foo />` 不再需要文件顶部 `import React from 'react'`，由编译器自动注入 `import { jsx as _jsx } from 'react/jsx-runtime'`。

### `strict: true`

启用了 `strictNullChecks`、`noImplicitAny`、`strictFunctionTypes` 等全套严格检查。这是项目里大量 `string | undefined`、`Record<string, unknown>` 类型注解能真正发挥作用的前提。

### `resolveJsonModule: true`

允许 `import pkg from '../package.json'`。项目里部分配置或版本读取会用到这个能力。

### `include: ["src", "vite.config.ts"]`

把 `vite.config.ts` 也纳入主 tsconfig 的 typecheck 范围（除了被 `tsconfig.node.json` 单独覆盖）。这样开发者在 VSCode 里编辑 Vite 配置时也能享受类型提示。

## 备注

- 这个 tsconfig **不**做实际编译产出（`noEmit: true`），所有 `.js` 文件由 Vite/esbuild 在打包时生成。
- 想加路径别名（例如 `@/components`），需要在这里加 `baseUrl` + `paths`，并在 Vite 配置里同步 `resolve.alias`。项目目前没用别名。
- `vite.config.ts` 同时被 `tsconfig.json` 和 `tsconfig.node.json` 引用，所以它需要满足两边的类型约束。
