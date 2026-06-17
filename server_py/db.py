from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .config import config


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS note_sections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  category_id TEXT,
  author_name TEXT NOT NULL DEFAULT '孤舟月',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'ink',
  tags_json TEXT NOT NULL DEFAULT '[]',
  body_markdown TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL DEFAULT '',
  deleted_at TEXT,
  FOREIGN KEY (category_id) REFERENCES note_sections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS featured_series (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  lead TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS featured_series_items (
  series_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series_id, article_id),
  FOREIGN KEY (series_id) REFERENCES featured_series(id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY,
  style_preset TEXT NOT NULL DEFAULT 'classic',
  color_scheme TEXT NOT NULL DEFAULT 'light',
  owner_name TEXT NOT NULL DEFAULT '孤舟月',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS homepage_copy (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS composer_drafts (
  draft_key TEXT PRIMARY KEY,
  article_id TEXT,
  payload_json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS seed_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gallery_albums (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_image_id TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (album_id) REFERENCES gallery_albums(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'deepseek',
  model TEXT NOT NULL DEFAULT 'deepseek-v4-pro',
  base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
  api_key TEXT NOT NULL DEFAULT '',
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 128000,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_token_usage (
  id TEXT PRIMARY KEY,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  status TEXT NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS starfield_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_active INTEGER NOT NULL DEFAULT 0,
  source_article_ids_json TEXT NOT NULL DEFAULT '[]',
  generation_model TEXT NOT NULL DEFAULT '',
  generation_prompt_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS starfield_passages (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  anchor TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'suggested',
  sort_order INTEGER NOT NULL DEFAULT 0,
  review_note TEXT NOT NULL DEFAULT '',
  embedding_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (version_id) REFERENCES starfield_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS starfield_relationships (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  source_passage_id TEXT NOT NULL,
  target_passage_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  strength REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'suggested',
  is_cross_article INTEGER NOT NULL DEFAULT 1,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (version_id) REFERENCES starfield_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (source_passage_id) REFERENCES starfield_passages(id) ON DELETE CASCADE,
  FOREIGN KEY (target_passage_id) REFERENCES starfield_passages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS starfield_generation_jobs (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  selected_article_ids_json TEXT NOT NULL DEFAULT '[]',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (version_id) REFERENCES starfield_versions(id) ON DELETE CASCADE
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def json_parse(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def connect() -> sqlite3.Connection:
    Path(config.database_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.database_path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_schema() -> None:
    with get_db() as conn:
        conn.executescript(SCHEMA_SQL)
        _ensure_column(conn, "site_settings", "owner_name", "TEXT NOT NULL DEFAULT '孤舟月'")
        _ensure_column(conn, "site_settings", "owner_avatar_url", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "articles", "author_name", "TEXT NOT NULL DEFAULT '孤舟月'")


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    if not any(row["name"] == column for row in rows):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


ensure_schema()
