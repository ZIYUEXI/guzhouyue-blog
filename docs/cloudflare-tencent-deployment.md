# Cloudflare Pages + Tencent Cloud Deployment

本文档描述当前博客的混合部署方式：

- Cloudflare Pages 托管公开前端和公开静态快照，域名是 `https://ziyuexi.top`。
- Cloudflare Tunnel 暴露腾讯云后台入口，域名是 `https://admin.ziyuexi.top`。
- 腾讯云服务器继续运行 FastAPI 后端、SQLite、后台管理、评论提交、图库上传和星图生成。
- GitHub 作为 Cloudflare Pages 的发布源。

## 架构

```text
读者浏览器
  -> https://ziyuexi.top/
  -> Cloudflare Pages 静态前端
  -> /data/*.json 读取公开快照

读者提交评论
  -> https://ziyuexi.top/api/...
  -> Cloudflare Pages Function
  -> https://admin.ziyuexi.top/api/...
  -> 腾讯云 FastAPI 后端
  -> SQLite

管理员写博客 / 做星图
  -> https://admin.ziyuexi.top/admin
  -> Cloudflare Tunnel
  -> 腾讯云 FastAPI 后端
  -> SQLite / 上传目录

管理员发布公开内容
  -> 腾讯云后端数据库
  -> python -m server_py.export_public_snapshot
  -> public/data/*.json + public/uploads/gallery/*
  -> git push
  -> Cloudflare Pages 自动重新部署
```

## Cloudflare Pages 设置

项目已经在 Cloudflare Pages 上创建后，设置以下环境变量。

### 前端构建变量

```text
VITE_PUBLIC_DATA_SOURCE=static
VITE_ADMIN_ORIGIN=https://admin.ziyuexi.top
```

含义：

- `static`：公开读者页直接读取 `/data/*.json`，适合 Cloudflare Pages 正式站。
- `hybrid`：先请求 `/api`，失败后读取 `/data`，适合迁移期。
- `api`：只请求 `/api`，适合本地完整后端开发。

`VITE_ADMIN_ORIGIN` 用于把公开站上的 `/admin` 路径和“后台”入口跳转到独立管理域名。Cloudflare Pages 正式站应设置为 `https://admin.ziyuexi.top`。

### Pages Function 变量

```text
TENCENT_BACKEND_ORIGIN=https://admin.ziyuexi.top
CF_ACCESS_CLIENT_ID=Cloudflare Access service token client id
CF_ACCESS_CLIENT_SECRET=Cloudflare Access service token client secret
```

如果不通过 Tunnel，也可以临时指向腾讯云后端地址：

```text
TENCENT_BACKEND_ORIGIN=http://腾讯云服务器IP:4174
```

不要在前端代码里写腾讯云 IP。读者提交评论时只访问 `https://ziyuexi.top/api/...`，由 Pages Function 代理到 `admin.ziyuexi.top` 的后端接口。

如果 `admin.ziyuexi.top` 启用了 Cloudflare Access 登录墙，需要给 Pages Function 配 Cloudflare Access Service Token：

1. 在 Cloudflare Zero Trust 里创建 Service Token。
2. 在 `admin.ziyuexi.top` 对应 Access Application 的策略里允许这个 Service Token。
3. 把 token 的 `Client ID` 和 `Client Secret` 分别填到 Pages 环境变量 `CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`。

当前 Pages Function 只公开转发：

```text
GET  /api/health
POST /api/articles/{slug}/comments
```

其他 `/api` 路径会返回 404，避免公开站绕过 Access 暴露后台接口。

## 腾讯云后端设置

腾讯云服务器继续运行：

```bash
NODE_ENV=production python -m server_py.app
```

推荐环境变量：

```bash
NODE_ENV=production
SERVER_HOST=0.0.0.0
SERVER_PORT=4174
SITE_URL=https://admin.ziyuexi.top
CORS_ORIGINS=https://ziyuexi.top,https://admin.ziyuexi.top
COOKIE_SECURE=true
ADMIN_PASSWORD=替换成强密码
```

说明：

- `SERVER_HOST=0.0.0.0` 让 Cloudflare Tunnel 或 Pages Function 能访问后端。
- `SITE_URL=https://admin.ziyuexi.top` 表示后端自己的公开入口。
- `CORS_ORIGINS=https://ziyuexi.top,https://admin.ziyuexi.top` 同时允许公开站评论提交和后台域名访问。
- `COOKIE_SECURE=true` 让后台登录 cookie 只在 HTTPS 入口下发送。

如果腾讯云安全组或系统防火墙限制访问，需要放行后端端口，例如 `4174`。

## 评论流程

评论提交不是写 GitHub，也不是写 Cloudflare 静态文件。

正式流程：

```text
读者提交评论
  -> POST /api/articles/{slug}/comments
  -> Cloudflare Pages Function
  -> admin.ziyuexi.top
  -> 腾讯云 FastAPI
  -> SQLite comments 表，状态为 pending
```

管理员在后台审核后，评论状态变为 `approved`。然后运行公开快照导出：

```bash
npm run export:public
```

导出的 `public/data/comments.json` 只包含已审核评论。推送 GitHub 后，Cloudflare Pages 重新部署，评论才会公开显示。

这个设计避免把 GitHub Token 或数据库写权限暴露给浏览器。

## 公开快照导出

在腾讯云服务器项目目录运行：

```bash
npm run export:public
```

它会生成：

```text
public/data/site.json
public/data/articles.json
public/data/gallery.json
public/data/starfield.json
public/data/comments.json
public/data/snapshot-meta.json
public/uploads/gallery/*
```

导出脚本会把后端图库地址：

```text
/api/uploads/gallery/xxx.jpg
```

改写为 Cloudflare 静态地址：

```text
/uploads/gallery/xxx.jpg
```

## 发布步骤

手动发布：

```bash
npm run export:public
git status
git add public/data public/uploads/gallery
git commit -m "Update public snapshot"
git push
```

Cloudflare Pages 检测 GitHub 更新后会自动构建并部署。

## 本地开发

本地完整开发可以继续使用后端代理：

```bash
npm run dev:server
npm run dev
```

本地不设置 `VITE_PUBLIC_DATA_SOURCE` 时默认使用 `api` 模式。

如果想本地模拟 Cloudflare 静态读模式：

```bash
npm run export:public
$env:VITE_PUBLIC_DATA_SOURCE="static"
npm run dev
```

## 故障检查

1. 公开页面没内容：
   - 检查 `public/data/*.json` 是否已提交到 GitHub。
   - 检查 Cloudflare Pages 环境变量 `VITE_PUBLIC_DATA_SOURCE=static`。

2. 评论提交失败：
   - 检查 Cloudflare Pages 环境变量 `TENCENT_BACKEND_ORIGIN`。
   - 检查 `https://admin.ziyuexi.top/api/health` 是否可访问。
   - 如果 `admin.ziyuexi.top` 显示 Cloudflare Access 登录页，检查 Pages 里的 `CF_ACCESS_CLIENT_ID` 和 `CF_ACCESS_CLIENT_SECRET`。
   - 检查 Cloudflare Access Application 是否允许该 Service Token。
   - 检查腾讯云后端是否正在运行。
   - 访问 `https://ziyuexi.top/api/health` 看是否返回 `ok`。

3. 后台登录失败：
   - 检查后台入口是否使用 `https://admin.ziyuexi.top/admin`。
   - 检查 `SITE_URL=https://admin.ziyuexi.top`。
   - 检查 `COOKIE_SECURE=true`。
   - 检查浏览器是否能访问 `https://admin.ziyuexi.top/api/admin/me`。

4. 新评论审核后没有出现：
   - 确认评论状态是 `approved`。
   - 重新运行 `npm run export:public`。
   - 提交并推送 `public/data/comments.json`。
   - 等 Cloudflare Pages 部署完成。
