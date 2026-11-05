import { lazy, Suspense } from 'react';
import { isAdminPath } from './routing';
import { PublicApp } from './public/PublicApp';

// 管理台独立加载，公开首页不再下载编辑器和后台依赖。
const AdminApp = lazy(() => import('./AdminApp'));

export default function App() {
  return isAdminPath(window.location.pathname)
    ? <Suspense fallback={<p role="status">正在打开管理台…</p>}><AdminApp /></Suspense>
    : <PublicApp />;
}
