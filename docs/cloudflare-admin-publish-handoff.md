# Cloudflare Pages + Tencent Admin Publish Handoff

更新时间：2026-07-01

## 当前架构

公网博客：

- 域名：`https://ziyuexi.top`
- 托管：Cloudflare Pages
- 数据来源：静态快照 `/data/*.json`
- 部署仓库：`ZIYUEXI/guzhouyue-blog-deploy`

后台和完整后端：

- 域名：`https://admin.ziyuexi.top`
- 入口：Cloudflare Tunnel + Cloudflare Access
- 服务器：腾讯云 `ubuntu@82.156.111.54`
- 应用目录：`/opt/guzhouyue-blog`
- systemd 服务：`guzhouyue-blog.service`
- 后端端口：`127.0.0.1:4174`
- 内部 nginx：`127.0.0.1:8080 -> 127.0.0.1:4174`

评论链路：

- 公开站评论提交到 `https://ziyuexi.top/api/articles/{slug}/comments`
- Cloudflare Pages Function 转发到 `https://admin.ziyuexi.top`
- Pages Function 使用 Cloudflare Access Service Token 通过 Access
- 后端写入腾讯云 SQLite，评论默认进入待审核

## Cloudflare Pages 环境变量

Pages 项目：`guzhouyue-blog-deploy`

需要配置：

```env
VITE_PUBLIC_DATA_SOURCE=static
VITE_ADMIN_ORIGIN=https://admin.ziyuexi.top
TENCENT_BACKEND_ORIGIN=https://admin.ziyuexi.top
CF_ACCESS_CLIENT_ID=<Cloudflare Access Service Token Client ID>
CF_ACCESS_CLIENT_SECRET=<Cloudflare Access Service Token Client Secret>
```

注意：

- `CF_ACCESS_CLIENT_ID` 和 `CF_ACCESS_CLIENT_SECRET` 必须是 Secret。
- 变量名必须使用下划线，不能写成 `CF-Access-Client-Secret`。
- 改完变量后必须重新部署 Pages 才生效。

## Cloudflare Access 配置

Access 应用：`Guzhouyue Admin`

现有策略：

- `Only Me`：网页登录后台用。
- `Allow Pages Function`：Service Auth，允许 Pages Function 用 service token 访问后台。

Service credentials：

- 名称建议：`ziyuexi-pages-comments`
- 需要加入 `Guzhouyue Admin` 应用的 `Service Auth` policy。

## 部署仓库说明

仓库：`https://github.com/ZIYUEXI/guzhouyue-blog-deploy`

这个仓库是 Cloudflare Pages 的发布仓库，不是源码仓库。它保存构建后的静态文件和 Pages Function。

根目录包含：

- `index.html`
- `assets/`
- `data/`
- `uploads/gallery/`
- `functions/api/[[path]].ts`
- `package.json`
- `scripts/cloudflare-pages-build.mjs`

Cloudflare Pages 当前会执行：

```bash
npm run build
```

因此发布仓库里必须保留这个轻量 `package.json` 和 `scripts/cloudflare-pages-build.mjs`。这个 build 脚本只是把预构建静态文件整理到 `dist/`，不是重新编译源码。

## 本地发布工具

本地源码仓库：`D:\project15\guzhouyue-blog`

常用命令：

```bash
npm run publish:static
```

作用：

1. `npm run export:public`
2. 静态模式构建前端
3. 克隆 `ZIYUEXI/guzhouyue-blog-deploy`
4. 替换部署仓库内容
5. 提交并推送到 GitHub

注意：

- 本地命令读取本机 SQLite，不读取腾讯云数据库。
- 适合发布前端代码变化。
- 后台写文章、审核评论、发布星图后，应优先用后台按钮同步。

## 腾讯云后台按钮同步

后台入口：

```text
https://admin.ziyuexi.top/admin
```

总览页右侧有：

```text
发布到 Cloudflare
发布静态站
```

按钮行为：

1. 创建后台发布任务，立即返回任务号。
2. 后端后台执行导出、Git commit、Git push。
3. 前端每 2 秒轮询任务状态。
4. 页面展示完整 Git 日志。

已修复的问题：

- 旧实现同步等待整个 git 流程，容易被 Cloudflare 504。
- 新实现是后台任务，不再让浏览器请求长时间挂起。
- 日志实时保存到任务对象里，页面能看到完整上传过程。

后台任务日志会显示：

```text
开始导出公开快照。
公开快照导出完成。
使用长期部署工作区：/var/lib/guzhouyue-blog-deploy-worktree
$ git config user.name Guzhouyue Admin
$ git config user.email admin@ziyuexi.top
$ git fetch --progress origin main
$ git reset --hard origin/main
复制 data/ 快照。
复制 uploads/gallery/ 上传图片。
$ git add --all data uploads/gallery
$ git status --short -- data uploads/gallery
$ git commit -m Publish public snapshot from admin
$ git push --progress origin main
$ git rev-parse --short HEAD
```

一次成功测试提交：

```text
836ce71 Publish public snapshot from admin
```

对应公开站快照：

```json
{
  "generatedAt": "2026-07-01T07:12:14.499Z"
}
```

## 腾讯云 Git 权限

不要用 GitHub 账号密码。服务器使用 GitHub Deploy Key。

服务器公钥：

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP3YcpK2afcW8ybQJ2NgpXv3PRIaWLfeVJfTG56EUeQY guzhouyue-blog-deploy@tencent
```

GitHub 仓库配置位置：

```text
ZIYUEXI/guzhouyue-blog-deploy -> Settings -> Deploy keys
```

必须勾选：

```text
Allow write access
```

服务器 SSH 配置：

```text
/var/www/.ssh/guzhouyue_deploy_ed25519
/var/www/.ssh/config
```

服务器环境变量文件：

```text
/etc/guzhouyue-blog.env
```

关键变量：

```env
PUBLIC_DEPLOY_REPO=git@github.com:ZIYUEXI/guzhouyue-blog-deploy.git
PUBLIC_DEPLOY_BRANCH=main
PUBLIC_DEPLOY_SSH_CONFIG=/var/www/.ssh/config
PUBLIC_DEPLOY_WORKTREE=/var/lib/guzhouyue-blog-deploy-worktree
PUBLIC_DEPLOY_GIT_NAME=Guzhouyue Admin
PUBLIC_DEPLOY_GIT_EMAIL=admin@ziyuexi.top
PUBLIC_DEPLOY_COMMIT_MESSAGE=Publish public snapshot from admin
PUBLIC_DEPLOY_GIT_TIMEOUT_SECONDS=240
```

长期工作区：

```text
/var/lib/guzhouyue-blog-deploy-worktree
```

原因：

- 每次临时 clone 部署仓库容易慢或卡住。
- 服务器现在保留长期工作区，只做 `fetch/reset/commit/push`。
- 后台按钮同步速度更稳定，并且能展示完整日志。

## 腾讯云部署完整包

本地生成腾讯云包：

```bash
npm run package:tencent
```

上传：

```bash
scp output/guzhouyue-blog-tencent-<timestamp>.zip ubuntu@82.156.111.54:/home/ubuntu/
```

服务器部署原则：

- 替换 `/opt/guzhouyue-blog` 代码。
- 保留并恢复：
  - `/opt/guzhouyue-blog/server/data`
  - `/opt/guzhouyue-blog/server/uploads`
  - `/opt/guzhouyue-blog/server/config.json`
- 重建 `.venv`。
- 重启 `guzhouyue-blog.service`。

服务检查：

```bash
systemctl status guzhouyue-blog.service --no-pager -l
curl http://127.0.0.1:4174/api/health
curl -H 'Host: admin.ziyuexi.top' http://127.0.0.1:8080/api/health
```

## 已踩过的坑

### Pages 环境变量名写错

错误：

```env
CF-Access-Client-Secret
```

正确：

```env
CF_ACCESS_CLIENT_SECRET
```

### Cloudflare Pages 执行 npm run build 失败

失败原因：

```text
Could not read package.json
```

原因：

- 部署仓库是预构建静态成品，但 Cloudflare Pages 项目仍配置了 `npm run build`。

解决：

- 在部署仓库里保留轻量 `package.json`。
- `npm run build` 只执行 `scripts/cloudflare-pages-build.mjs`。

### 后台同步 504

原因：

- 浏览器请求同步等待 git 全流程，Cloudflare 超时。

解决：

- 改成后台任务。
- `POST /api/admin/public-deploy` 创建任务。
- `GET /api/admin/public-deploy/{task_id}` 查询状态和日志。

### 临时 clone 慢或卡住

原因：

- 腾讯云到 GitHub 网络慢。
- 每次临时 clone 部署仓库会拉大量对象。
- `sparse-checkout` 仍可能触发按需拉 blob。

解决：

- 使用长期工作区 `/var/lib/guzhouyue-blog-deploy-worktree`。
- 后台按钮只做 `fetch/reset/commit/push`。

### 本机 Python 测试后台接口 401

原因：

- 后台 Cookie 是 Secure。
- Python 标准库不会在 `http://127.0.0.1` 自动回传 Secure Cookie。

浏览器访问 `https://admin.ziyuexi.top` 不受影响。

## 日常发布流程

写文章：

1. 打开 `https://admin.ziyuexi.top/admin`
2. 写文章并发布
3. 回到总览
4. 点 `发布静态站`
5. 查看日志框，确认 `git push` 成功
6. 等 Cloudflare Pages 自动部署
7. 检查 `https://ziyuexi.top/data/snapshot-meta.json`

审核评论：

1. 后台进入评论审核
2. 审核通过或拒绝
3. 回到总览
4. 点 `发布静态站`
5. 公开站静态评论快照更新

发布星图：

1. 后台生成/审核星图
2. 发布星图版本
3. 回到总览
4. 点 `发布静态站`
5. 公开站 `/data/starfield.json` 更新

前端代码变更：

1. 本地修改源码
2. 本地验证：

```bash
npm run build
```

3. 发布 Cloudflare 静态站：

```bash
npm run publish:static
```

4. 如后台代码也变了，生成腾讯云包并部署：

```bash
npm run package:tencent
```

## 快速排错

检查部署仓库当前提交：

```bash
git ls-remote https://github.com/ZIYUEXI/guzhouyue-blog-deploy.git refs/heads/main
```

检查公开站快照：

```bash
curl https://ziyuexi.top/data/snapshot-meta.json
```

检查 Pages Function 到腾讯云后台：

```bash
curl https://ziyuexi.top/api/health
```

检查腾讯云后端：

```bash
ssh ubuntu@82.156.111.54
systemctl status guzhouyue-blog.service --no-pager -l
curl http://127.0.0.1:4174/api/health
```

检查服务器 Git 权限：

```bash
sudo -u www-data GIT_SSH_COMMAND='ssh -F /var/www/.ssh/config' \
  git -C /var/lib/guzhouyue-blog-deploy-worktree ls-remote origin refs/heads/main
```

检查后台发布工作区：

```bash
sudo -u www-data git -C /var/lib/guzhouyue-blog-deploy-worktree status --short
sudo -u www-data git -C /var/lib/guzhouyue-blog-deploy-worktree log -1 --oneline
```
