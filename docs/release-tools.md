# Release Tools

本项目提供两个发布工具：

```bash
npm run publish:static
npm run package:tencent
```

## 1. 发布公开静态站

```bash
npm run publish:static
```

这个命令会执行：

1. `npm run export:public`
2. 使用 Cloudflare Pages 静态模式构建前端
3. 克隆 `https://github.com/ZIYUEXI/guzhouyue-blog-deploy.git`
4. 清空 deploy 仓库当前内容
5. 写入 `dist/` 构建产物和 `functions/`
6. 提交并推送到 deploy 仓库

默认环境变量：

```text
DEPLOY_REPO=https://github.com/ZIYUEXI/guzhouyue-blog-deploy.git
DEPLOY_BRANCH=main
VITE_ADMIN_ORIGIN=https://admin.ziyuexi.top
```

可选环境变量：

```text
DEPLOY_COMMIT_MESSAGE=Update public snapshot
```

测试但不推送：

```bash
node scripts/publish-static-deploy.mjs --dry-run
```

Cloudflare Pages 的项目应该绑定 `ZIYUEXI/guzhouyue-blog-deploy`，构建输出目录使用仓库根目录或 Cloudflare 自动识别的静态产物。该仓库包含已经构建好的静态文件，不需要再运行 Vite 构建。

## 2. 打包腾讯云完整功能包

```bash
npm run package:tencent
```

这个命令会生成：

```text
output/guzhouyue-blog-tencent-YYYYMMDD-HHMMSS.zip
```

包内包含：

- `dist/`：完整后台部署用前端构建产物
- `server_py/`：FastAPI 后端源码
- `server/requirements.txt`
- `server/config.example.json`
- `server/scripts/`
- `public/`
- `functions/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `README.md`
- `LICENSE`
- `DEPLOY-TENCENT.md`

包内不会包含：

- `server/config.json`
- `server/data/*.sqlite`
- `server/uploads/*`
- `.env`
- `node_modules/`
- Python 虚拟环境
- Python 缓存

如果需要指定包名：

```bash
set PACKAGE_NAME=guzhouyue-blog-tencent-release
npm run package:tencent
```

## 推荐工作流

写博客、审核评论、发布星图：

```text
https://admin.ziyuexi.top/admin
```

公开发布：

```bash
npm run publish:static
```

准备腾讯云服务器完整部署包：

```bash
npm run package:tencent
```
