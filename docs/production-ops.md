# 生产部署与运维说明

## 环境变量

- `NODE_ENV=production`：生产环境必须设置。服务端会拒绝使用默认管理密码启动。
- `ADMIN_PASSWORD`：后台登录密码，生产环境必须覆盖默认值。
- `SITE_URL`：公开站点根地址，用于服务端动态 RSS、sitemap 和 canonical。
- `CORS_ORIGINS`：允许携带凭据访问 API 的前端来源，多个来源用英文逗号分隔。
- `COOKIE_SECURE=true`：HTTPS 部署时启用安全 Cookie。
- `DATABASE_PATH`：SQLite 数据库路径。
- `GALLERY_UPLOAD_DIR`：图库上传目录。
- `SERVER_HOST`、`SERVER_PORT`：后端监听地址和端口。
- `PYTHON_COMMAND`、`ALMANAC_TIMEOUT_MS`：黄历脚本运行配置。

## 内容来源策略

生产公开站点以 SQLite API 为单一事实来源。静态 `src/posts.ts` 只用于 seed 和迁移输入，不作为公开运行时渲染来源。公开页面不会用 localStorage 或静态文章常量兜底；如果 API 不可用，会显示数据库内容接口不可用提示。

## 数据库迁移

当前项目使用启动时幂等建表和补列。新增表或列时应遵循：

1. 在 `server/src/db.ts` 中添加 `CREATE TABLE IF NOT EXISTS`。
2. 对已有表新增列时，用 `PRAGMA table_info` 检查后再 `ALTER TABLE`。
3. 修改后运行 `npm run test:server` 验证旧库可启动。

## 备份恢复

SQLite 使用 WAL 模式。备份时应同时保存数据库文件及其 `-wal`、`-shm` 文件，或在停服窗口复制数据库。恢复时先停服，再替换数据库文件，最后启动服务并检查 `/api/admin/ops` 中的 `quick_check`。

## RSS 与 Sitemap

RSS、sitemap 和 robots 由服务端按数据库中已发布文章动态输出：

- `/robots.txt`
- `/sitemap.xml`
- `/rss.xml`

生产部署前运行 `npm run build` 做 TypeScript 检查和 Vite 构建，运行 `npm run test:server` 验证动态 RSS/sitemap、数据库和核心 API。
