import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = process.env.SERVER_CONFIG_PATH ?? path.join(serverDir, 'config.json');

type ServerFileConfig = {
  host?: string;
  port?: number;
  databasePath?: string;
  adminPassword?: string;
  sessionCookieName?: string;
  sessionTtlMs?: number;
  siteUrl?: string;
  pythonCommand?: string;
  almanacTimeoutMs?: number;
};

function readFileConfig(): ServerFileConfig {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as ServerFileConfig;
  } catch (error) {
    throw new Error(`Failed to read server config file at ${configPath}: ${(error as Error).message}`);
  }
}

const fileConfig = readFileConfig();
const port = Number(process.env.SERVER_PORT ?? fileConfig.port ?? 4174);
const pythonCommand = process.env.PYTHON_COMMAND ?? fileConfig.pythonCommand ?? 'python';

export const config = {
  host: process.env.SERVER_HOST ?? fileConfig.host ?? '127.0.0.1',
  port,
  databasePath: process.env.DATABASE_PATH ?? fileConfig.databasePath ?? path.join(serverDir, 'data', 'blog.sqlite'),
  galleryUploadDir: process.env.GALLERY_UPLOAD_DIR ?? path.join(serverDir, 'uploads', 'gallery'),
  adminPassword: process.env.ADMIN_PASSWORD ?? fileConfig.adminPassword ?? 'guzhouyue-admin',
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? fileConfig.sessionCookieName ?? 'guzhouyue_admin',
  sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? fileConfig.sessionTtlMs ?? 1000 * 60 * 60 * 8),
  siteUrl: process.env.SITE_URL ?? fileConfig.siteUrl ?? `http://127.0.0.1:${port}`,
  pythonCommand: expandEnvironmentVariables(pythonCommand).trim(),
  almanacTimeoutMs: Number(process.env.ALMANAC_TIMEOUT_MS ?? fileConfig.almanacTimeoutMs ?? 3000),
  configPath,
};

function expandEnvironmentVariables(value: string) {
  return value.replace(/%([^%]+)%/g, (match, name: string) => process.env[name] ?? match);
}
