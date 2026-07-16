# Cloudflare 静态发布问题复盘

更新时间：2026-07-01

## 背景

这次调整的核心目标是把公开博客从“完整后端站点”拆成两部分：

- 公开博客 `https://ziyuexi.top`：放到 Cloudflare Pages，作为静态站点访问。
- 后台和完整后端 `https://admin.ziyuexi.top`：继续部署在腾讯云，通过 Cloudflare Tunnel 和 Cloudflare Access 访问。

这样做的原因是服务器在大陆，公网域名和后端访问受限制，不适合继续把公开博客和后台完整绑在同一个传统后端架构里。新的方案让公开内容走静态托管，后台写作、评论审核、星图发布仍然保留在腾讯云。

## 出问题的主要现象

### 1. Cloudflare Pages 构建失败

Cloudflare Pages 拉取 `ZIYUEXI/guzhouyue-blog-deploy` 后执行：

```bash
npm run build
```

但部署仓库里最初没有 `package.json`，所以失败：

```text
npm error enoent Could not read package.json
```

### 2. 评论无法直接打到后台

公开站部署在 Cloudflare Pages，后台在 `admin.ziyuexi.top`，而后台受 Cloudflare Access 保护。

普通用户在公开站提交评论时，不能直接绕过 Access 访问腾讯云后端，否则要么被 Access 拦截，要么暴露后台接口。

### 3. 后台点击同步后等待太久，最后出现 504

原来的同步方式是浏览器发起请求，然后后端在这个请求里完成：

1. 导出公开快照
2. 准备部署仓库
3. Git 提交
4. Git 推送

这个流程可能耗时较长，尤其腾讯云访问 GitHub 时不稳定。Cloudflare 等待太久后会返回 504，导致前端看起来像发布失败。

### 4. 用户看不到完整 Git 上传日志

出现 504 后，浏览器请求已经断掉，Git 到底执行到哪一步不清楚。用户只能看到“发布中”等待很久，无法判断是导出慢、clone 慢、commit 失败，还是 push 卡住。

## 根本原因

### 1. 部署仓库定位没有完全统一

`guzhouyue-blog-deploy` 本质上是“构建后的静态发布仓库”，不是源码仓库。

但 Cloudflare Pages 仍然配置了构建命令 `npm run build`。这导致 Pages 期待仓库像源码项目一样有 `package.json`，而实际仓库一开始只有静态文件。

### 2. 后端受 Access 保护后，公开站需要一个可信转发层

后台不能直接公开，否则后台管理接口和数据库写接口会暴露。

评论提交又必须能从公开站进入后端，所以中间必须有一个只允许特定公开接口通过的转发层。

最终选择 Cloudflare Pages Function：

- 公开站提交评论到 `/api/articles/{slug}/comments`
- Pages Function 加上 Cloudflare Access Service Token
- 请求转发到 `https://admin.ziyuexi.top`
- 腾讯云后端收到后写入 SQLite

### 3. Git 发布任务不适合同步阻塞在一个 HTTP 请求里

导出、提交、推送这些操作不是一个短请求：

- GitHub 网络可能慢。
- 第一次 clone 或 fetch 可能卡住。
- push 过程需要完整日志。
- Cloudflare 对长时间 HTTP 请求有超时限制。

所以后台按钮不能用“一个请求等到所有事情做完”的模式。

### 4. 临时 clone 部署仓库成本太高

每次点击发布都临时 clone GitHub 仓库，会受腾讯云到 GitHub 网络影响。即使用 sparse checkout，也可能触发额外对象下载。

更稳的方式是服务器保留一个长期工作区，只在每次发布时执行：

```bash
git fetch
git reset --hard origin/main
git add
git commit
git push
```

## 最终解决方案

### 1. 公开站改为静态快照读取

公开站不再依赖后端接口读取文章列表、站点配置、评论列表，而是读取：

```text
/data/articles.json
/data/comments.json
/data/site.json
/data/starfield.json
/data/snapshot-meta.json
```

快照由腾讯云后台或本地工具导出。

### 2. 部署仓库保留 Cloudflare Pages 构建壳

在 `ZIYUEXI/guzhouyue-blog-deploy` 里保留轻量文件：

```text
package.json
scripts/cloudflare-pages-build.mjs
```

Cloudflare Pages 继续执行：

```bash
npm run build
```

但这个 build 不是重新编译源码，只是把已经构建好的静态文件整理到 `dist/`，满足 Cloudflare Pages 的构建流程。

### 3. 评论通过 Pages Function 转发

Cloudflare Pages Function 只放行很少的公开接口：

```text
GET  /api/health
POST /api/articles/{slug}/comments
```

它会给请求加上：

```text
CF-Access-Client-Id
CF-Access-Client-Secret
```

这样评论可以进入腾讯云后端，但后台其他接口不会对公网直接开放。

### 4. 后台发布改为异步任务

后台新增任务接口：

```text
POST /api/admin/public-deploy
GET  /api/admin/public-deploy/{task_id}
```

按钮点击后：

1. 立即创建发布任务。
2. 浏览器不再等待 Git 全流程完成。
3. 后端后台执行导出、提交、推送。
4. 前端每 2 秒查询任务状态。
5. 页面显示完整 Git 日志。

这样避免 Cloudflare 504，也让用户能看到每一步发生了什么。

### 5. 腾讯云保留长期 Git 工作区

服务器使用：

```text
/var/lib/guzhouyue-blog-deploy-worktree
```

每次发布不再临时 clone，而是在这个工作区里更新、覆盖快照、提交并推送。

这明显减少了 GitHub 网络波动带来的失败概率。

## 中间踩过的坑

### 坑 1：Cloudflare Pages 构建命令和部署仓库不匹配

部署仓库是静态成品仓库，但 Pages 仍执行 `npm run build`。

解决方式不是把完整源码塞进部署仓库，而是给部署仓库加一个轻量 build 壳，保持仓库仍然是静态发布仓库。

### 坑 2：Cloudflare Access Service Token 变量名写错

Cloudflare Pages 环境变量必须用代码里读取的名字：

```env
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
```

不能写成：

```env
CF-Access-Client-Secret
```

环境变量名写错后，Pages Function 无法拿到 token，转发后台会失败。

### 坑 3：Access 里只有 Only Me 不够

`Only Me` 只能让本人网页登录后台。

Pages Function 不是“本人浏览器”，它需要单独的 Service Auth 策略。

所以 Access 应用里必须同时有：

- `Only Me`
- `Allow Pages Function`

其中 `Allow Pages Function` 使用 Service credentials。

### 坑 4：后台同步不能直接等 Git 结束

Git 操作放在一个浏览器请求里会造成 504。即使后端最后成功推送，前端也可能已经断开，用户不知道结果。

解决方式是任务化：

- 创建任务立即返回。
- 后台继续执行。
- 前端轮询状态和日志。

### 坑 5：临时 clone 在腾讯云上不稳定

腾讯云到 GitHub 的网络可能慢。每次临时 clone 容易卡住，看起来像后台坏了。

解决方式是长期工作区：

```text
/var/lib/guzhouyue-blog-deploy-worktree
```

以后只做增量 fetch 和 push。

### 坑 6：GitHub 不能用账号密码部署

服务器推送部署仓库应该用 Deploy Key，不要用 GitHub 账号密码。

Deploy Key 必须在 GitHub 仓库里勾选：

```text
Allow write access
```

否则服务器只能读仓库，不能 push。

### 坑 7：本地测试后台 Cookie 容易误判 401

后台 Cookie 设置了 Secure。浏览器访问 `https://admin.ziyuexi.top` 是正常的，但本地脚本用 `http://127.0.0.1` 测试时，可能不会自动带 Secure Cookie。

所以本地脚本返回 401 不一定代表线上后台登录有问题。

## 当前稳定发布流程

### 写文章

1. 打开 `https://admin.ziyuexi.top/admin`
2. 写文章并发布
3. 回到后台总览
4. 点击 `发布静态站`
5. 查看日志，确认 `git push` 成功
6. 等 Cloudflare Pages 自动部署
7. 检查 `https://ziyuexi.top/data/snapshot-meta.json`

### 审核评论

1. 后台审核评论
2. 点击 `发布静态站`
3. 公开站评论快照更新

### 发布星图

1. 后台生成或发布星图
2. 点击 `发布静态站`
3. 公开站 `/data/starfield.json` 更新

### 改前端代码

本地源码修改后执行：

```bash
npm run build
npm run publish:static
```

如果后台代码也变了，再生成腾讯云完整包并部署：

```bash
npm run package:tencent
```

## 这次复盘结论

这次问题不是单点错误，而是架构切换时几个边界没有完全收口：

- 静态部署仓库和源码仓库的边界。
- Cloudflare Pages 和腾讯云后台的接口边界。
- Access 用户登录和机器访问的权限边界。
- 短 HTTP 请求和长 Git 发布任务的执行边界。

现在的方案把这些边界拆清楚了：

- 公开访问走 Cloudflare Pages 静态文件。
- 管理能力留在腾讯云后台。
- 评论通过受控 Pages Function 转发。
- 内容同步通过后台异步任务推送 GitHub。
- Cloudflare Pages 只负责从部署仓库自动更新公开站。

后续如果再出问题，优先看后台发布日志和 Cloudflare Pages 部署日志，基本可以判断问题卡在“导出、Git 推送、Pages 构建、公开站缓存”哪一层。
