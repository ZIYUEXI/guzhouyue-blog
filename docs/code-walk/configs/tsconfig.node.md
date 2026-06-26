# tsconfig.node.json

> 源路径：`tsconfig.node.json`
> 总行数：约 12 行

专门给 `vite.config.ts` 这类 Node.js 环境下运行的 TypeScript 配置文件用的 typecheck 配置。

## 文件概览

`tsconfig.node.json` 是 `tsconfig.json` 的"项目引用"（project reference）补充。它解决一个具体问题：`vite.config.ts` 在 Node.js 进程里运行，依赖 Node 的全局 API（如 `process`、`__dirname`），而 `src/` 下的应用代码运行在浏览器，只依赖 DOM API。两套类型环境不同，强行放在一起 typecheck 会冲突。

TypeScript 的"composite project references"机制让 `tsconfig.json` 把 `vite.config.ts` 委托给 `tsconfig.node.json` 处理，主 typecheck 跑 `tsc -b` 时会自动包含这个子项目。

## 关键字段表

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `composite` | `true` | 标识这是被引用的复合项目，强制开启增量编译缓存 |
| `noEmit` | `true` | 不产出 JS（实际执行由 Vite 自己加载 `vite.config.ts`） |
| `skipLibCheck` | `true` | 跳过 `.d.ts` 内部检查加速 |
| `module` | `ESNext` | 输出 ES 模块语法 |
| `moduleResolution` | `Bundler` | 用打包工具的解析策略 |
| `allowSyntheticDefaultImports` | `true` | 允许 default import 风格（即便目标没有 default export） |
| `strict` | `true` | 严格模式，和主 tsconfig 保持一致 |
| `include` | `["vite.config.ts"]` | typecheck 范围只有这一个文件 |

## 和 tsconfig.json 的差异

| 维度 | `tsconfig.json` | `tsconfig.node.json` |
| --- | --- | --- |
| 运行环境 | 浏览器 | Node.js |
| `lib` | `DOM`, `DOM.Iterable`, `ES2022` | 无（默认 ES2022 + Node 全局类型） |
| `jsx` | `react-jsx` | 无 |
| `include` | `src`, `vite.config.ts` | 仅 `vite.config.ts` |
| `composite` | 无 | `true` |

主 tsconfig 已经把 `vite.config.ts` 列在 `include` 里，所以它会被两套配置都检查一次——这是项目当前的故意冗余（双保险）。如果未来想去掉冗余，可以把主 tsconfig 的 `include` 改成只有 `src`。

## composite 与 project references

`composite: true` 是 TypeScript 的"复合项目"标志，配合被其他 tsconfig 通过 `references` 字段引用。它强制要求：

- 必须设置 `files` 或 `include`（不能让 TS 自动推断）。
- 增量编译结果会被缓存（`.tsbuildinfo`）。
- 跑 `tsc -b` 时按依赖顺序构建。

项目目前没在主 `tsconfig.json` 里显式声明 `references`，但 Vite 工具链会自动用 `tsconfig.node.json` 给 Node 环境的配置文件做类型检查。

## 备注

- 这个文件改动频率非常低，通常只在引入新的 Node 端配置文件（例如 `vitest.config.ts`）时才需要把对应文件加进 `include`。
- 如果 `vite.config.ts` 用到 `process.env.SOMETHING`，要确保 `@types/node` 已安装，否则这里会报"Cannot find name 'process'"。项目通过 `@types/node` 间接安装（被 vite 依赖带入）。
