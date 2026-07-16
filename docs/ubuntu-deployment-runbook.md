# 孤舟月博客 Ubuntu 部署复盘与运维手册

本文记录本项目从本地打包、上传 Ubuntu、部署上线，到上线过程中遇到的问题与解决办法。所有文件读取、输出和配置都应使用 UTF-8 编码。

## 1. 项目部署结构

本项目由两部分组成：

- 前端：Vite + React，构建产物在 `dist/`。
- 后端：Python FastAPI，入口为 `python -m server_py.app`。

生产环境建议目录：

```text
/opt/guzhouyue-blog
```

关键数据目录：

```text
/opt/guzhouyue-blog/server/data/blog.sqlite
/opt/guzhouyue-blog/server/uploads/gallery
```

注意：以后更新代码时不要覆盖 `server/data` 和 `server/uploads`，否则会丢失线上文章、配置、评论、图库等数据。

## 2. 本地打包

在 Windows 本地项目目录执行：

```powershell
cd D:\project15\guzhouyue-blog
```

建议打包时排除本地依赖、构建产物和本地配置：

```powershell
robocopy . D:\deploy\guzhouyue-blog /E /XD node_modules .git dist .playwright-cli output .idea /XF server\config.json
Compress-Archive -Path D:\deploy\guzhouyue-blog -DestinationPath D:\deploy\guzhouyue-blog.zip -Force
```

上传到服务器：

```bash
scp guzhouyue-blog.zip ubuntu@服务器IP:/home/ubuntu/myblog/
```

本次实际上传路径：

```text
/home/ubuntu/myblog/guzhouyue-blog.zip
```

## 3. Ubuntu 初始化

安装基础依赖：

```bash
sudo apt update
sudo apt install -y unzip nginx python3 python3-venv python3-pip curl
```

安装 Node.js：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

检查版本：

```bash
node -v
npm -v
```

## 4. 解压并复制到正式目录

解压：

```bash
mkdir -p /home/ubuntu/myblog/deploy
unzip -o /home/ubuntu/myblog/guzhouyue-blog.zip -d /home/ubuntu/myblog/deploy
```

本次解压后的项目路径为：

```text
/home/ubuntu/myblog/deploy/guzhouyue-blog
```

复制到正式目录：

```bash
sudo mkdir -p /opt/guzhouyue-blog
sudo cp -a /home/ubuntu/myblog/deploy/guzhouyue-blog/. /opt/guzhouyue-blog/
sudo chown -R ubuntu:ubuntu /opt/guzhouyue-blog
cd /opt/guzhouyue-blog
```

## 5. 安装 Python 和 Node 依赖

创建 Python 虚拟环境：

```bash
cd /opt/guzhouyue-blog
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
```

安装 Node 依赖：

```bash
npm install
```

原计划使用 `npm ci`，但本次部署中 `package.json` 与 `package-lock.json` 不同步，`npm ci` 报错：

```text
npm ci can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
Missing: @emnapi/core@1.11.1 from lock file
Missing: @emnapi/runtime@1.11.1 from lock file
```

解决方式：

```bash
npm install
```

如果仍失败，可重建依赖锁：

```bash
rm -rf node_modules package-lock.json
npm install
```

## 6. 构建前端

构建：

```bash
npm run build
```

本次曾遇到构建权限错误：

```text
Error: EACCES: permission denied, stat '/opt/guzhouyue-blog/public/upload/markdown-notes'
```

原因：目录权限不完整，Vite 构建时无法读取 `public/upload/markdown-notes`。

解决：

```bash
sudo chown -R ubuntu:ubuntu /opt/guzhouyue-blog
sudo find /opt/guzhouyue-blog/public -type d -exec chmod 755 {} \;
sudo find /opt/guzhouyue-blog/public -type f -exec chmod 644 {} \;
npm run build
```

构建成功后会生成：

```text
/opt/guzhouyue-blog/dist
```

## 7. 后端测试

项目脚本中使用的是 `python`：

```bash
npm run test:server
```

Ubuntu 上可能只有 `python3`，本次遇到：

```text
sh: 1: python: not found
```

可直接用虚拟环境 Python 跑测试：

```bash
.venv/bin/python -m server_py.smoke_test
.venv/bin/python -m server_py.compat_test
```

也可补一个虚拟环境内的 `python` 链接：

```bash
ln -sf python3 .venv/bin/python
```

## 8. 生产环境配置

创建环境变量文件：

```bash
sudo vim /etc/guzhouyue-blog.env
```

如果先用服务器 IP 测试：

```ini
NODE_ENV=production
SERVER_HOST=127.0.0.1
SERVER_PORT=4174
SITE_URL=http://服务器IP
CORS_ORIGINS=http://服务器IP
COOKIE_SECURE=false
DATABASE_PATH=/opt/guzhouyue-blog/server/data/blog.sqlite
GALLERY_UPLOAD_DIR=/opt/guzhouyue-blog/server/uploads/gallery
ADMIN_PASSWORD=自己设置的后台密码
PYTHON_COMMAND=/opt/guzhouyue-blog/.venv/bin/python
```

如果使用 HTTPS 域名：

```ini
NODE_ENV=production
SERVER_HOST=127.0.0.1
SERVER_PORT=4174
SITE_URL=https://你的域名
CORS_ORIGINS=https://你的域名
COOKIE_SECURE=true
DATABASE_PATH=/opt/guzhouyue-blog/server/data/blog.sqlite
GALLERY_UPLOAD_DIR=/opt/guzhouyue-blog/server/uploads/gallery
ADMIN_PASSWORD=自己设置的后台密码
PYTHON_COMMAND=/opt/guzhouyue-blog/.venv/bin/python
```

限制权限：

```bash
sudo chmod 600 /etc/guzhouyue-blog.env
```

注意：生产环境 `NODE_ENV=production` 时，后端不允许使用默认后台密码，必须设置 `ADMIN_PASSWORD`。

## 9. 创建 systemd 后端服务

创建服务文件：

```bash
sudo vim /etc/systemd/system/guzhouyue-blog.service
```

内容：

```ini
[Unit]
Description=Guzhouyue Blog API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/guzhouyue-blog
EnvironmentFile=/etc/guzhouyue-blog.env
ExecStart=/opt/guzhouyue-blog/.venv/bin/python -m server_py.app
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now guzhouyue-blog
```

检查：

```bash
sudo systemctl status guzhouyue-blog --no-pager -l
curl http://127.0.0.1:4174/api/health
```

正常返回：

```json
{"ok":true,"timestamp":"..."}
```

本次第一次 `curl` 失败：

```text
curl: (7) Failed to connect to 127.0.0.1 port 4174
```

随后通过 `systemctl status` 确认服务已启动：

```text
Uvicorn running on http://127.0.0.1:4174
```

再次 `curl` 后正常。判断是服务刚启动时尚未完全就绪。

## 10. Nginx 配置

创建站点配置：

```bash
sudo vim /etc/nginx/sites-available/guzhouyue-blog
```

内容：

```nginx
server {
    listen 80;
    server_name 服务器IP或域名;

    root /opt/guzhouyue-blog/dist;
    index index.html;

    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://127.0.0.1:4174;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /rss.xml {
        proxy_pass http://127.0.0.1:4174/rss.xml;
    }

    location = /sitemap.xml {
        proxy_pass http://127.0.0.1:4174/sitemap.xml;
    }

    location = /robots.txt {
        proxy_pass http://127.0.0.1:4174/robots.txt;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用：

```bash
sudo ln -sf /etc/nginx/sites-available/guzhouyue-blog /etc/nginx/sites-enabled/guzhouyue-blog
sudo nginx -t
sudo systemctl reload nginx
```

检查：

```bash
curl http://127.0.0.1/api/health
curl -I http://127.0.0.1
```

如果服务器本机正常但外网打不开，需要检查云服务器安全组是否放行 TCP 80 端口。

## 11. HTTPS 配置

有域名且 DNS 已解析到服务器后：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

然后修改：

```bash
sudo vim /etc/guzhouyue-blog.env
```

确保：

```ini
SITE_URL=https://你的域名
CORS_ORIGINS=https://你的域名
COOKIE_SECURE=true
```

重启后端：

```bash
sudo systemctl restart guzhouyue-blog
```

## 12. 运行权限规则

构建阶段，项目建议归 `ubuntu`：

```bash
sudo chown -R ubuntu:ubuntu /opt/guzhouyue-blog
```

运行阶段，只把需要后端写入或 Nginx 读取的目录给 `www-data`：

```bash
sudo chown -R www-data:www-data /opt/guzhouyue-blog/server/data
sudo chown -R www-data:www-data /opt/guzhouyue-blog/server/uploads
sudo chown -R www-data:www-data /opt/guzhouyue-blog/dist
```

不要把整个 `/opt/guzhouyue-blog` 长期改成 `www-data`，否则以后构建、更新和排查会很容易遇到权限问题。

## 13. 图库 500 问题

上线后图库图片无法显示，浏览器报：

```text
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

涉及图片：

```text
mqrx94j6-a38c61001ab94fc2.png
agent-flight-sim-01-0f569c939d.jpg
system-image-guzhouyue-avatar-mq3ir2qs-56b28a6f9fa0b785.png
```

检查图库目录：

```bash
ls -la /opt/guzhouyue-blog/server/uploads/gallery | head
```

本次报错：

```text
ls: cannot access '/opt/guzhouyue-blog/server/uploads/gallery': Permission denied
```

原因：`server/uploads/gallery` 或上级目录权限不完整，后端无法读取图库文件，因此 `/api/uploads/gallery/...` 返回 500。

解决：

```bash
sudo chmod 755 /opt/guzhouyue-blog/server
sudo chown -R www-data:www-data /opt/guzhouyue-blog/server/uploads
sudo find /opt/guzhouyue-blog/server/uploads -type d -exec chmod 755 {} \;
sudo find /opt/guzhouyue-blog/server/uploads -type f -exec chmod 644 {} \;
```

如果仍然权限异常，再修上级目录：

```bash
sudo chmod 755 /opt
sudo chmod 755 /opt/guzhouyue-blog
sudo chmod 755 /opt/guzhouyue-blog/server
sudo systemctl restart guzhouyue-blog
```

验证：

```bash
ls -la /opt/guzhouyue-blog/server/uploads/gallery | head
sudo -u www-data test -r /opt/guzhouyue-blog/server/uploads/gallery/mqrx94j6-a38c61001ab94fc2.png && echo readable || echo not-readable
curl -I http://127.0.0.1:4174/api/uploads/gallery/mqrx94j6-a38c61001ab94fc2.png
```

正常应返回：

```text
HTTP/1.1 200 OK
```

## 14. 日常检查命令

后端状态：

```bash
sudo systemctl status guzhouyue-blog --no-pager -l
```

后端日志：

```bash
sudo journalctl -u guzhouyue-blog -f
```

健康检查：

```bash
curl http://127.0.0.1:4174/api/health
```

Nginx 状态：

```bash
sudo systemctl status nginx --no-pager -l
```

Nginx 配置检查：

```bash
sudo nginx -t
```

## 15. 数据备份

上线后建议立即备份：

```bash
sudo tar -czf /home/ubuntu/myblog/guzhouyue-backup-$(date +%F-%H%M).tar.gz \
  /opt/guzhouyue-blog/server/data \
  /opt/guzhouyue-blog/server/uploads
```

恢复时先停服务：

```bash
sudo systemctl stop guzhouyue-blog
```

再恢复备份中的 `server/data` 和 `server/uploads`，最后：

```bash
sudo chown -R www-data:www-data /opt/guzhouyue-blog/server/data
sudo chown -R www-data:www-data /opt/guzhouyue-blog/server/uploads
sudo systemctl start guzhouyue-blog
```

## 16. 后续更新代码的简化脚本

以后可以只上传新包，然后运行脚本。

服务器上创建：

```bash
vim /home/ubuntu/myblog/update-blog.sh
```

内容：

```bash
#!/usr/bin/env bash
set -e

ZIP="/home/ubuntu/myblog/guzhouyue-blog-new.zip"
TMP="/home/ubuntu/myblog/new-deploy"
APP="/opt/guzhouyue-blog"
BACKUP="/home/ubuntu/myblog/guzhouyue-backup-$(date +%F-%H%M).tar.gz"

echo "backup data..."
sudo tar -czf "$BACKUP" "$APP/server/data" "$APP/server/uploads"

echo "unzip new package..."
rm -rf "$TMP"
mkdir -p "$TMP"
unzip -o "$ZIP" -d "$TMP"

echo "sync code, keep data..."
sudo rsync -a --delete \
  --exclude 'server/data/' \
  --exclude 'server/uploads/' \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  "$TMP/guzhouyue-blog/" \
  "$APP/"

echo "build..."
sudo chown -R ubuntu:ubuntu "$APP"
cd "$APP"
sudo find "$APP/public" -type d -exec chmod 755 {} \;
sudo find "$APP/public" -type f -exec chmod 644 {} \;
.venv/bin/pip install -r server/requirements.txt
npm install
npm run build

echo "fix runtime permissions..."
sudo chown -R www-data:www-data "$APP/server/data" "$APP/server/uploads" "$APP/dist"
sudo find "$APP/server/uploads" -type d -exec chmod 755 {} \;
sudo find "$APP/server/uploads" -type f -exec chmod 644 {} \;

echo "restart..."
sudo systemctl restart guzhouyue-blog
sudo systemctl reload nginx

echo "check..."
curl http://127.0.0.1:4174/api/health
echo
echo "done. backup: $BACKUP"
```

授权：

```bash
chmod +x /home/ubuntu/myblog/update-blog.sh
```

以后更新：

```bash
bash /home/ubuntu/myblog/update-blog.sh
```

新压缩包应放在：

```text
/home/ubuntu/myblog/guzhouyue-blog-new.zip
```

并且解压后保持：

```text
guzhouyue-blog/package.json
guzhouyue-blog/server_py
guzhouyue-blog/src
```

## 17. 本次问题清单

本次部署中实际遇到的问题和处理方式：

| 问题 | 表现 | 原因 | 解决 |
| --- | --- | --- | --- |
| `npm ci` 失败 | lock file 不同步 | `package.json` 与 `package-lock.json` 不一致 | 改用 `npm install` |
| 构建读取 public 失败 | `EACCES: permission denied, stat public/upload/markdown-notes` | 目录权限不完整 | `chown ubuntu` 并修复 `public` 权限 |
| 后端测试找不到 Python | `sh: 1: python: not found` | Ubuntu 默认没有 `python` 命令 | 用 `.venv/bin/python` 直接运行测试 |
| 初次健康检查失败 | `curl: Failed to connect to 127.0.0.1:4174` | 服务刚启动尚未就绪或需查日志 | 用 `systemctl status` 确认，稍后重试 |
| 图库图片 500 | 图片资源返回 500 | `server/uploads/gallery` 权限不完整 | 修复 `server/uploads` 和上级目录权限 |

## 18. 最终上线验证

最终应验证这些地址：

```text
http://服务器IP/
http://服务器IP/api/health
http://服务器IP/rss.xml
http://服务器IP/sitemap.xml
http://服务器IP/robots.txt
```

图库验证：

```bash
curl -I http://127.0.0.1:4174/api/uploads/gallery/mqrx94j6-a38c61001ab94fc2.png
```

后台验证：

- 使用 `/etc/guzhouyue-blog.env` 中的 `ADMIN_PASSWORD` 登录后台。
- 检查文章、图库、评论、RSS、sitemap 是否正常。
