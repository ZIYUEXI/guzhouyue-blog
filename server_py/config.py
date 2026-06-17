from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_DIR = ROOT_DIR / "server"


def _expand_env(value: str) -> str:
    return re.sub(r"%([^%]+)%", lambda match: os.environ.get(match.group(1), match.group(0)), value)


def _read_file_config() -> dict[str, Any]:
    config_path = Path(os.environ.get("SERVER_CONFIG_PATH", SERVER_DIR / "config.json"))
    if not config_path.exists():
        return {}
    with config_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _parse_bool(value: str | None, fallback: bool) -> bool:
    if value is None:
        return fallback
    return value.lower() in {"1", "true", "yes", "on"}


def _parse_cors_origins(env_value: str | None, file_value: Any, fallback_site_url: str, node_env: str) -> list[str]:
    if env_value:
        values = [origin.strip() for origin in env_value.split(",") if origin.strip()]
    elif isinstance(file_value, list):
        values = [str(origin).strip() for origin in file_value if str(origin).strip()]
    else:
        values = []

    local_dev_origins: list[str] = []
    if node_env != "production":
        for port in range(5173, 5183):
            local_dev_origins.extend([f"http://127.0.0.1:{port}", f"http://localhost:{port}"])

    seen: set[str] = set()
    origins: list[str] = []
    for origin in [fallback_site_url, *local_dev_origins, *values]:
        if origin not in seen:
            seen.add(origin)
            origins.append(origin)
    return origins


@dataclass(frozen=True)
class Config:
    host: str
    port: int
    database_path: Path
    gallery_upload_dir: Path
    admin_password: str
    session_cookie_name: str
    csrf_cookie_name: str
    session_ttl_ms: int
    site_url: str
    cors_origins: list[str]
    cookie_secure: bool
    python_command: str
    almanac_timeout_ms: int
    config_path: Path


def load_config() -> Config:
    file_config = _read_file_config()
    config_path = Path(os.environ.get("SERVER_CONFIG_PATH", SERVER_DIR / "config.json"))
    port = int(os.environ.get("SERVER_PORT", file_config.get("port", 4174)))
    default_admin_password = "guzhouyue-admin"
    admin_password = os.environ.get("ADMIN_PASSWORD", file_config.get("adminPassword", default_admin_password))
    node_env = os.environ.get("NODE_ENV", "development")
    site_url = os.environ.get("SITE_URL", file_config.get("siteUrl", f"http://127.0.0.1:{port}"))
    if node_env == "production" and admin_password == default_admin_password:
        raise RuntimeError("ADMIN_PASSWORD must be changed before starting the server in production.")

    database_path = Path(os.environ.get("DATABASE_PATH", file_config.get("databasePath", SERVER_DIR / "data" / "blog.sqlite")))
    if not database_path.is_absolute():
        database_path = ROOT_DIR / database_path
    gallery_upload_dir = Path(os.environ.get("GALLERY_UPLOAD_DIR", file_config.get("galleryUploadDir", SERVER_DIR / "uploads" / "gallery")))
    if not gallery_upload_dir.is_absolute():
        gallery_upload_dir = ROOT_DIR / gallery_upload_dir

    python_command = _expand_env(str(os.environ.get("PYTHON_COMMAND", file_config.get("pythonCommand", "python")))).strip()
    cookie_secure_default = bool(site_url.startswith("https://"))

    return Config(
        host=os.environ.get("SERVER_HOST", file_config.get("host", "127.0.0.1")),
        port=port,
        database_path=database_path,
        gallery_upload_dir=gallery_upload_dir,
        admin_password=str(admin_password),
        session_cookie_name=str(os.environ.get("SESSION_COOKIE_NAME", file_config.get("sessionCookieName", "guzhouyue_admin"))),
        csrf_cookie_name=str(os.environ.get("CSRF_COOKIE_NAME", file_config.get("csrfCookieName", "guzhouyue_csrf"))),
        session_ttl_ms=int(os.environ.get("SESSION_TTL_MS", file_config.get("sessionTtlMs", 1000 * 60 * 60 * 8))),
        site_url=str(site_url),
        cors_origins=_parse_cors_origins(os.environ.get("CORS_ORIGINS"), file_config.get("corsOrigins"), str(site_url), node_env),
        cookie_secure=_parse_bool(os.environ.get("COOKIE_SECURE"), bool(file_config.get("cookieSecure", cookie_secure_default))),
        python_command=python_command,
        almanac_timeout_ms=int(os.environ.get("ALMANAC_TIMEOUT_MS", file_config.get("almanacTimeoutMs", 3000))),
        config_path=config_path,
    )


config = load_config()
