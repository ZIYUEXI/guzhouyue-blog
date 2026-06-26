# main

> 源路径：`src/main.tsx`
> 总行数：约 11 行

整个前端应用的入口：把根组件挂到 DOM 上、加载全局样式、开启严格模式。

## 文件概览

`main.tsx` 是 Vite 启动时直接打到的文件（HTML 模板里通过模块脚本引用）。它做且只做三件事：导入 `styles.css`（让全局样式和组件代码一起打包），从 `index.html` 中的 `#root` 节点创建 React 渲染容器，再用 `<React.StrictMode>` 包裹 `<App />` 渲染进去。开发态下 `StrictMode` 会双重渲染、对副作用做额外检查，帮助尽早发现提交问题；生产构建会自动剥掉这一层开销。

## 挂载与渲染

挂载逻辑只有几行：`createRoot(document.getElementById('root')!)` 中的 `!` 断言说明我们假定 `index.html` 一定带有 `<div id="root">`。如果未来要适配 SSR 或多挂载点，需要从这里入手。

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`<App />`（见 `src/App.md`）是真正的页面分发器，`main.tsx` 不再承担任何业务职责。
