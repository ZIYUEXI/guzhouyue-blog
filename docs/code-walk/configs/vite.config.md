# vite.config.ts

> 源路径：`vite.config.ts`
> 总行数：约 25 行

Vite 构建配置：注册 React 插件、把编辑器拆成独立 chunk、把 `/api` 等后端路由反向代理到本地 FastAPI。

## 文件概览

`vite.config.ts` 是前端构建的总入口。它做的事很少，但每件都关键：

1. **`react()` 插件**：让 Vite 能编译 JSX/TSX，并启用 Fast Refresh。
2. **`manualChunks`**：把 `@mdxeditor`、`lexical`、`codemirror` 这些富文本编辑器相关依赖拆成单独的 `editor` chunk，避免编辑器代码污染文章详情页的主 bundle。
3. **`server.proxy`**：开发态把 `/api`、`/robots.txt`、`/rss.xml`、`/sitemap.xml` 反向代理到 `http://127.0.0.1:4174`（FastAPI 默认端口），让前端开发时不需要处理 CORS。

配置很克制——没有引入路径别名、SSR、PWA、压缩插件等，因为项目就是简单的 SPA + 后端 API。

## 关键字段表

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `plugins` | `[react()]` | 启用 React Fast Refresh + JSX 转译 |
| `build.rollupOptions.output.manualChunks` | 见下 | 把编辑器依赖拆成独立 chunk |
| `server.proxy['/api']` | `http://127.0.0.1:4174` | 开发态 API 反向代理 |
| `server.proxy['/robots.txt']` | `http://127.0.0.1:4174` | robots.txt 由后端生成 |
| `server.proxy['/rss.xml']` | `http://127.0.0.1:4174` | RSS 由后端生成 |
| `server.proxy['/sitemap.xml']` | `http://127.0.0.1:4174` | sitemap 由后端生成 |

## manualChunks 拆分逻辑

```typescript
manualChunks(id) {
  if (id.includes('@mdxeditor') || id.includes('lexical') || id.includes('codemirror')) {
    return 'editor';
  }
},
```

只要某个模块的路径包含 `@mdxeditor`、`lexical`（MDX 编辑器底层）、`codemirror`（代码块编辑底层），就归入名为 `editor` 的 chunk。`RichMarkdownEditor.tsx` 是项目里唯一重度使用这些依赖的组件，且只在管理台才加载，所以拆出来后：

- 普通读者访问文章页时**不会**下载编辑器代码（节省数百 KB）。
- 管理员进入编辑器时按需加载 `editor` chunk。

## 开发态代理

```typescript
server: {
  proxy: {
    '/api': 'http://127.0.0.1:4174',
    '/robots.txt': 'http://127.0.0.1:4174',
    '/rss.xml': 'http://127.0.0.1:4174',
    '/sitemap.xml': 'http://127.0.0.1:4174',
  },
},
```

Vite dev server 默认监听 5173，FastAPI 默认监听 4174。前端代码里所有请求都用相对路径（如 `/api/articles`），由 Vite 把这些路径转发到后端，避免跨域。`robots.txt`/`rss.xml`/`sitemap.xml` 也由后端动态生成，所以同样需要代理。

注意：上传的图片走 `/api/uploads/gallery/...`，因为前缀也是 `/api`，自动被同一条规则代理。

## 端口约定

- Vite dev：`5173`（`package.json` 的 `dev` 脚本指定 `--port 5173 --strictPort`）。
- Vite preview：`4173`（`preview` 脚本指定）。
- FastAPI：`4174`（`config.py` 默认）。

`config.py` 的 CORS 允许列表会自动加上 5173-5182 这十个本地端口，所以即便 Vite 端口被占用自动 +1，也能正常跨域（虽然 dev 代理已经避免了真正跨域）。

## 备注

- `vite.config.ts` 本身被 `tsconfig.node.json` 单独 typecheck（见 `configs/tsconfig.node.md`），和 `src/` 下的应用代码隔离。
- 想新增后端路由前缀（例如 `/feed.xml`），在 `server.proxy` 里加一条即可。
- 没有配置 `build.outDir`、`base` 等，意味着产物默认在 `dist/`，部署在根路径下。如果要部署到子路径，需要补 `base`。
