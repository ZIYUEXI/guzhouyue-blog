# config.py

> 源路径：`server_py/config.py`
> 总行数：约 112 行

统一加载服务端运行配置：把"环境变量 + `server/config.json` 文件 + 默认值"合并成一个不可变的 `Config` 单例，供全后端引用。

## 文件概览

`config.py` 是后端启动时第一个被引用的配置入口。它解决三类问题：

1. **配置优先级**：环境变量 > `server/config.json` > 默认值。这样本地可以用 `.env`-风格的环境变量覆盖文件，CI/生产可以靠环境变量直接注入。
2. **路径解析**：数据库路径、上传目录允许配置成相对路径，需要相对仓库根 `ROOT_DIR` 解析成绝对路径，避免因为 cwd 不同而找不到文件。
3. **生产安全闸**：`production` 环境下若仍在使用默认管理员密码就抛错，避免上线后被人用默认口令登录。

文件末尾直接 `config = load_config()`，所有其他模块通过 `from .config import config` 拿到单例。

## 配置文件位置与 ROOT_DIR

```python
ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT_DIR / "server"
```

- `ROOT_DIR`：仓库根目录（`server_py/config.py` 的上两层）。
- `SERVER_DIR`：默认指向 `<ROOT_DIR>/server`，用于存配置文件、数据库、上传目录；和 `server_py/` 平级，便于把代码和静态数据分开。

`SERVER_CONFIG_PATH` 环境变量可以指向自定义 `config.json`；未设置时回落到 `server/config.json`。

## 环境变量与文件字段映射

```python
return Config(
    host=os.environ.get("SERVER_HOST", file_config.get("host", "127.0.0.1")),
    port=port,
    database_path=database_path,
    gallery_upload_dir=gallery_upload_dir,
    admin_password=str(admin_password),
    ...
)
```

每个字段都遵循"env → file → default"的优先级。关键字段包括：

| 字段 | env 变量 | 文件字段 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `host` | `SERVER_HOST` | `host` | `127.0.0.1` | FastAPI 监听地址 |
| `port` | `SERVER_PORT` | `port` | `4174` | 服务端口 |
| `database_path` | `DATABASE_PATH` | `databasePath` | `server/data/blog.sqlite` | SQLite 文件路径 |
| `gallery_upload_dir` | `GALLERY_UPLOAD_DIR` | `galleryUploadDir` | `server/uploads/gallery` | 图库上传目录 |
| `admin_password` | `ADMIN_PASSWORD` | `adminPassword` | `guzhouyue-admin` | 管理员登录口令 |
| `session_ttl_ms` | `SESSION_TTL_MS` | `sessionTtlMs` | 8 小时 | 会话有效期（毫秒） |
| `site_url` | `SITE_URL` | `siteUrl` | `http://127.0.0.1:{port}` | 公开站点 URL |
| `cors_origins` | `CORS_ORIGINS` | `corsOrigins` | 见下 | 允许跨域来源 |
| `cookie_secure` | `COOKIE_SECURE` | `cookieSecure` | 跟随 `site_url` 是否 https | Cookie `Secure` 标记 |
| `python_command` | `PYTHON_COMMAND` | `pythonCommand` | `python` | 调用 cnlunar 子进程的命令 |
| `almanac_timeout_ms` | `ALMANAC_TIMEOUT_MS` | `almanacTimeoutMs` | 3000 | 调用节气服务超时 |

## 生产环境安全闸

```python
node_env = os.environ.get("NODE_ENV", "development")
...
if node_env == "production" and admin_password == default_admin_password:
    raise RuntimeError("ADMIN_PASSWORD must be changed before starting the server in production.")
```

如果 `NODE_ENV=production` 但仍然使用默认密码 `guzhouyue-admin`，`load_config()` 会直接抛 `RuntimeError`，整个后端拒绝启动。这把"忘记改口令"这个最常见的安全事故挡在了启动阶段。

## CORS 来源拼接

```python
def _parse_cors_origins(env_value, file_value, fallback_site_url, node_env) -> list[str]:
    ...
    local_dev_origins: list[str] = []
    if node_env != "production":
        for port in range(5173, 5183):
            local_dev_origins.extend([f"http://127.0.0.1:{port}", f"http://localhost:{port}"])
```

非生产环境下，会自动把 `5173`-`5182` 这十个本地开发端口（Vite 默认 `5173`，留出几个备选）加进允许列表，方便前端在不同端口调试。最终结果是 `site_url`、本地 dev 端口、显式 env/file 配置三者的去重并集。

## Windows 环境变量展开

```python
def _expand_env(value: str) -> str:
    return re.sub(r"%([^%]+)%", lambda match: os.environ.get(match.group(1), match.group(0)), value)
```

`PYTHON_COMMAND` 支持 `%VIRTUAL_ENV%\Scripts\python.exe` 这种 Windows 风格的占位符，方便在虚拟环境里启动服务时直接复用环境变量，而不需要写死绝对路径。

## 单例导出

```python
config = load_config()
```

文件末尾立即执行一次 `load_config()` 并把结果挂在模块级别 `config` 上。其他模块只需要 `from .config import config` 就能拿到统一的只读配置；`Config` 用 `@dataclass(frozen=True)` 标注，运行期无法被改写，避免误改影响其他模块。

## 备注

- `Config.config_path` 字段保留配置文件路径本身，方便 `app.py` 在 `/api/admin/ops` 这类端点里报告"当前使用了哪个 config.json"。
- 这里**没有**做 `.env` 文件解析：项目假设由启动脚本（`start-dev.bat`、容器环境等）直接注入环境变量。
