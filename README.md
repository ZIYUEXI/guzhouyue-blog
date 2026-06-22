# Guzhouyue Blog

Guzhouyue Blog 是一个个人博客与内容管理项目。前端使用 React、TypeScript、Vite 构建，后端使用 FastAPI 和 SQLite 提供文章、相册、评论、RSS、sitemap、后台管理和 Starfield Knowledge Map 等接口。

项目适合部署为“静态前端 + Python API 服务”的形态：前端构建后由静态站点服务或 Nginx 托管，`/api`、`/rss.xml`、`/sitemap.xml`、`/robots.txt` 等动态入口转发到后端服务。

## 功能概览

- 公开博客首页、文章列表、文章详情、归档、搜索和相册。
- 后台管理文章、栏目、首页文案、评论、相册和站点设置。
- Markdown / 富文本编辑器，支持代码高亮、GFM、数学公式等内容格式。
- SQLite 数据持久化，启动时自动执行幂等建表和补列。
- RSS、sitemap、robots 由后端按已发布内容动态生成。
- Starfield Knowledge Map：把已发布文章中的片段和关联关系呈现为星空式知识地图。

## 技术栈

前端：

- React 19
- TypeScript
- Vite
- Three.js
- MDXEditor
- react-markdown、remark-gfm、remark-math、rehype-katex、rehype-highlight
- KaTeX、highlight.js
- lucide-react

后端：

- Python 3.11+，当前本地脚本按 Python 3.13 环境使用
- FastAPI
- Starlette
- Uvicorn
- SQLite
- httpx
- python-multipart
- cnlunar

## 环境要求

- Node.js 20+ 建议
- npm
- Python 3.11+
- Windows 可直接使用 `start-dev.bat`；其他系统按下面的手动命令启动

## 本地开发

安装前端依赖：

```bash
npm install
```

安装后端依赖：

```bash
python -m pip install -r server/requirements.txt
```

创建本地后端配置：

```bash
copy server\config.example.json server\config.json
```

如果不是 Windows，请用等价命令复制：

```bash
cp server/config.example.json server/config.json
```

初始化示例数据：

```bash
npm run seed:server
```

分别启动后端和前端：

```bash
npm run dev:server
npm run dev
```

默认地址：

- 前端开发服务：`http://127.0.0.1:5173`
- 后端 API：`http://127.0.0.1:4174`

Windows 下也可以直接运行：

```bat
start-dev.bat
```

## 常用脚本

```bash
npm run dev
npm run dev:server
npm run seed:server
npm run seed:test-articles
npm run test:server
npm run test:theme
npm run build
npm run preview
```

说明：

- `npm run dev`：启动 Vite 前端开发服务。
- `npm run dev:server`：启动 FastAPI 后端服务。
- `npm run seed:server`：初始化数据库内容。
- `npm run test:server`：运行后端 smoke test 和兼容性测试。
- `npm run build`：检查主题变量、执行 TypeScript 检查并构建前端。
- `npm run preview`：预览前端构建产物。

## 配置

本地配置文件为 `server/config.json`，不要提交到仓库。提交仓库的模板是 `server/config.example.json`。

主要配置项：

- `host`、`port`：后端监听地址和端口。
- `databasePath`：SQLite 数据库路径。
- `adminPassword`：后台管理密码。
- `siteUrl`：公开站点根地址，用于 RSS、sitemap 和 canonical。
- `corsOrigins`：允许携带凭据访问 API 的前端来源。
- `cookieSecure`：HTTPS 部署时建议设为 `true`。
- `pythonCommand`：后端调用辅助 Python 脚本时使用的命令。

生产环境也可以通过环境变量覆盖配置：

```bash
NODE_ENV=production
ADMIN_PASSWORD=change-to-a-strong-password
SITE_URL=https://example.com
CORS_ORIGINS=https://example.com
COOKIE_SECURE=true
DATABASE_PATH=/var/lib/guzhouyue-blog/blog.sqlite
GALLERY_UPLOAD_DIR=/var/lib/guzhouyue-blog/uploads/gallery
SERVER_HOST=127.0.0.1
SERVER_PORT=4174
```

生产环境必须修改默认管理密码。后端在 `NODE_ENV=production` 且仍使用默认密码时会拒绝启动。

## 生产部署

构建前端：

```bash
npm run build
```

启动后端：

```bash
NODE_ENV=production python -m server_py.app
```

推荐部署方式：

1. 将 `dist/` 作为静态站点目录交给 Nginx、Caddy、Apache 或对象存储/CDN。
2. 后端以常驻进程运行 `python -m server_py.app`。
3. 反向代理以下路径到后端：
   - `/api/`
   - `/api/uploads/gallery/`
   - `/rss.xml`
   - `/sitemap.xml`
   - `/robots.txt`
4. 其他路径回退到前端 `dist/index.html`，用于支持前端路由。

Nginx 示例：

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/guzhouyue-blog/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4174;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /rss.xml {
        proxy_pass http://127.0.0.1:4174;
    }

    location = /sitemap.xml {
        proxy_pass http://127.0.0.1:4174;
    }

    location = /robots.txt {
        proxy_pass http://127.0.0.1:4174;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 数据与备份

默认数据库位于 `server/data/blog.sqlite`，上传图片位于 `server/uploads/`。这些属于运行时数据，不应提交到 Git。

SQLite 使用 WAL 模式时，备份需要同时考虑主数据库文件以及 `-wal`、`-shm` 文件。更稳妥的方式是在停服窗口复制数据库，或使用 SQLite 官方备份方式。

## 开源前注意事项

- 不要提交 `server/config.json`、`.env`、数据库文件、上传文件、日志、IDE 配置、Python 缓存和构建产物。
- 首次公开前检查 `server/data/`、`server/uploads/`、`.codex-*.log`、`.idea/`、`.playwright-cli/`、`server_py/__pycache__/` 是否已从 Git 跟踪中移除。
- 如果仓库历史里曾提交过真实密码、API Key、数据库或隐私内容，应先轮换密钥，并按需清理 Git 历史。
- `public/upload/markdown-notes/` 当前属于公开静态素材目录，只有确认这些图片可以公开时才保留。
- 后台管理密码、站点域名、CORS 来源和 Cookie Secure 设置必须按部署环境修改。
- 本项目所有源码和文档请保持 UTF-8 编码。

## Git 忽略策略

当前 `.gitignore` 已覆盖：

- `node_modules/`、`dist/` 等依赖和构建产物。
- `server/data/`、`server/uploads/`、`server/config.json` 等运行时数据和本地配置。
- `.env*`、数据库文件、备份目录、日志文件。
- Python `__pycache__/`、`*.pyc`、虚拟环境和测试缓存。
- `.idea/`、`.vscode/`、`.playwright-cli/` 等本地工具目录。
- 根目录调试截图 `output-starfield*.png` 和 `reference-shiyun.png`。

注意：如果某些文件已经被 Git 跟踪，新增 `.gitignore` 不会自动把它们移出仓库，需要执行：

```bash
git rm -r --cached .idea server_py/__pycache__
```

执行后再用下面命令确认没有不该提交的文件：

```bash
git status --short
git ls-files | rg "(^|/)(node_modules|dist|\\.idea|\\.playwright-cli|__pycache__|server/data|server/uploads|server/config\\.json|.*\\.log$|.*\\.sqlite|.*\\.db|.*\\.pyc$)"
```

## 许可证

开源前请补充许可证文件，例如 `MIT`、`Apache-2.0` 或其他符合项目预期的协议。
