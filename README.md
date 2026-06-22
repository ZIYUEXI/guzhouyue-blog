# Guzhouyue Blog

一个用 React + FastAPI 构建的个人博客与内容管理系统。

Guzhouyue Blog 不只是静态文章列表，还包含后台管理、Markdown / 富文本编辑、相册、评论审核、RSS、sitemap，以及一个把文章片段和知识关系可视化的 Starfield Knowledge Map。

## 特性

- 公开博客：首页、文章列表、文章详情、归档、搜索、相册。
- 后台管理：文章、栏目、首页文案、评论、相册、站点设置。
- 内容编辑：支持 Markdown、富文本、代码高亮、GFM、数学公式。
- 数据存储：后端使用 SQLite，启动时自动执行幂等建表和补列。
- SEO 输出：后端动态生成 RSS、sitemap 和 robots.txt。
- Starfield Knowledge Map：把已发布文章中的片段和关联关系呈现为星空式知识地图。
- 简单部署：前端静态构建，后端作为 Python API 服务运行。

## 技术栈

前端：

- React 19
- TypeScript
- Vite
- Three.js
- MDXEditor
- react-markdown / remark-gfm / remark-math
- rehype-katex / rehype-highlight
- KaTeX / highlight.js
- lucide-react

后端：

- Python 3.11+
- FastAPI
- Starlette
- Uvicorn
- SQLite
- httpx
- python-multipart
- cnlunar

## 快速开始

环境要求：

- Node.js 20+
- npm
- Python 3.11+

安装依赖：

```bash
npm install
python -m pip install -r server/requirements.txt
```

创建本地配置：

```bash
cp server/config.example.json server/config.json
```

Windows PowerShell / CMD 可使用：

```bat
copy server\config.example.json server\config.json
```

初始化数据库内容：

```bash
npm run seed:server
```

启动后端：

```bash
npm run dev:server
```

启动前端：

```bash
npm run dev
```

默认访问地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:4174`

Windows 用户也可以直接运行：

```bat
start-dev.bat
```

## 常用命令

```bash
npm run dev                # 启动前端开发服务
npm run dev:server         # 启动后端 API 服务
npm run seed:server        # 初始化后端数据
npm run seed:test-articles # 生成测试文章数据
npm run test:server        # 后端 smoke test 和兼容性测试
npm run test:theme         # 主题变量检查
npm run build              # 前端生产构建
npm run preview            # 预览前端构建产物
```

## 项目结构

```text
.
├── src/                 # React 前端源码
├── server_py/           # FastAPI 后端源码
├── server/
│   ├── config.example.json
│   ├── requirements.txt
│   ├── data/            # 本地 SQLite 数据，不提交
│   └── uploads/         # 本地上传文件，不提交
├── public/              # 静态资源
├── docs/                # 设计、运维和 ADR 文档
├── scripts/             # 项目脚本
└── vite.config.ts
```

## 配置

本地配置文件是 `server/config.json`。这个文件可能包含后台密码和本地路径，不应提交到仓库。仓库中只保留 `server/config.example.json` 作为模板。

常用配置项：

- `host` / `port`：后端监听地址和端口。
- `databasePath`：SQLite 数据库路径。
- `galleryUploadDir`：相册上传目录。
- `adminPassword`：后台管理密码。
- `siteUrl`：公开站点根地址，用于 RSS、sitemap 和 canonical。
- `corsOrigins`：允许访问 API 的前端来源。
- `cookieSecure`：HTTPS 部署时建议设为 `true`。
- `pythonCommand`：后端调用辅助 Python 脚本时使用的命令。

也可以用环境变量覆盖配置：

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

生产环境必须修改默认后台密码。`NODE_ENV=production` 时，如果仍使用默认密码，后端会拒绝启动。

## 部署

推荐部署方式是“静态前端 + Python API 服务”：

1. 构建前端：

```bash
npm run build
```

2. 运行后端：

```bash
NODE_ENV=production python -m server_py.app
```

3. 用 Nginx、Caddy、Apache 或其他网关托管 `dist/`，并把动态路径转发到后端。

需要转发到后端的路径：

- `/api/`
- `/api/uploads/gallery/`
- `/rss.xml`
- `/sitemap.xml`
- `/robots.txt`

其他前端路由应回退到 `dist/index.html`。

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

## 数据备份

默认数据库路径是 `server/data/blog.sqlite`，上传图片路径是 `server/uploads/`。这些都是运行时数据，不应提交到 Git。

SQLite 使用 WAL 模式时，备份需要同时处理主数据库文件以及 `-wal`、`-shm` 文件。更稳妥的方式是在停服窗口复制数据库，或使用 SQLite 官方备份方式。

## 开源前检查

`.gitignore` 已覆盖依赖、构建产物、本地配置、数据库、上传文件、日志、IDE 配置、Python 缓存和本地调试截图。

如果这些文件已经被 Git 跟踪，新增 `.gitignore` 不会自动移除它们。可以执行：

```bash
git rm -r --cached .idea server_py/__pycache__
```

然后检查是否还有不该提交的文件：

```bash
git status --short
git ls-files | rg "(^|/)(node_modules|dist|\\.idea|\\.playwright-cli|__pycache__|server/data|server/uploads|server/config\\.json|.*\\.log$|.*\\.sqlite|.*\\.db|.*\\.pyc$)"
```

公开仓库前还应确认：

- `server/config.json`、`.env`、数据库、上传文件和日志没有被提交。
- 仓库历史里没有真实密码、API Key、数据库或隐私内容。
- `public/upload/markdown-notes/` 中的图片可以公开分发。
- 生产环境已设置强后台密码、正确的 `SITE_URL`、`CORS_ORIGINS` 和 HTTPS Cookie 配置。
- 所有源码和文档保持 UTF-8 编码。

## License

MIT License. 你可以自由使用、修改、分发和商业化使用本项目，详见 [LICENSE](LICENSE)。
