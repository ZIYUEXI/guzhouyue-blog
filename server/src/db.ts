import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

const siteSettingsColumns = db.prepare('PRAGMA table_info(site_settings)').all() as Array<{ name: string }>;
if (!siteSettingsColumns.some((column) => column.name === 'owner_name')) {
  db.prepare("ALTER TABLE site_settings ADD COLUMN owner_name TEXT NOT NULL DEFAULT '孤舟月'").run();
}
if (!siteSettingsColumns.some((column) => column.name === 'owner_avatar_url')) {
  db.prepare("ALTER TABLE site_settings ADD COLUMN owner_avatar_url TEXT NOT NULL DEFAULT ''").run();
}

const articleColumns = db.prepare('PRAGMA table_info(articles)').all() as Array<{ name: string }>;
if (!articleColumns.some((column) => column.name === 'author_name')) {
  db.prepare("ALTER TABLE articles ADD COLUMN author_name TEXT NOT NULL DEFAULT '孤舟月'").run();
}

export function nowIso() {
  return new Date().toISOString();
}

export function jsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
