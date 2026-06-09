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
  csrfCookieName?: string;
  sessionTtlMs?: number;
  siteUrl?: string;
  corsOrigins?: string[];
  cookieSecure?: boolean;
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
const defaultAdminPassword = 'guzhouyue-admin';
const adminPassword = process.env.ADMIN_PASSWORD ?? fileConfig.adminPassword ?? defaultAdminPassword;
const nodeEnv = process.env.NODE_ENV ?? 'development';
const siteUrl = process.env.SITE_URL ?? fileConfig.siteUrl ?? `http://127.0.0.1:${port}`;
const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS, fileConfig.corsOrigins, siteUrl);

if (nodeEnv === 'production' && adminPassword === defaultAdminPassword) {
  throw new Error('ADMIN_PASSWORD must be changed before starting the server in production.');
}

export const config = {
  host: process.env.SERVER_HOST ?? fileConfig.host ?? '127.0.0.1',
  port,
  databasePath: process.env.DATABASE_PATH ?? fileConfig.databasePath ?? path.join(serverDir, 'data', 'blog.sqlite'),
  galleryUploadDir: process.env.GALLERY_UPLOAD_DIR ?? path.join(serverDir, 'uploads', 'gallery'),
  adminPassword,
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? fileConfig.sessionCookieName ?? 'guzhouyue_admin',
  csrfCookieName: process.env.CSRF_COOKIE_NAME ?? fileConfig.csrfCookieName ?? 'guzhouyue_csrf',
  sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? fileConfig.sessionTtlMs ?? 1000 * 60 * 60 * 8),
  siteUrl,
  corsOrigins,
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, fileConfig.cookieSecure ?? siteUrl.startsWith('https://')),
  pythonCommand: expandEnvironmentVariables(pythonCommand).trim(),
  almanacTimeoutMs: Number(process.env.ALMANAC_TIMEOUT_MS ?? fileConfig.almanacTimeoutMs ?? 3000),
  configPath,
};

function expandEnvironmentVariables(value: string) {
  return value.replace(/%([^%]+)%/g, (match, name: string) => process.env[name] ?? match);
}

function parseCorsOrigins(envValue: string | undefined, fileValue: string[] | undefined, fallbackSiteUrl: string) {
  const values = envValue
    ? envValue.split(',').map((origin) => origin.trim()).filter(Boolean)
    : Array.isArray(fileValue)
      ? fileValue.filter((origin) => typeof origin === 'string' && origin.trim()).map((origin) => origin.trim())
      : [];
  const localDevOrigins =
    nodeEnv === 'production'
      ? []
      : Array.from({ length: 10 }, (_, index) => 5173 + index).flatMap((devPort) => [
          `http://127.0.0.1:${devPort}`,
          `http://localhost:${devPort}`,
        ]);

  return Array.from(new Set([fallbackSiteUrl, ...localDevOrigins, ...values]));
}

function parseBoolean(envValue: string | undefined, fallback: boolean) {
  if (envValue === undefined) {
    return fallback;
  }

  return envValue === 'true' || envValue === '1';
}
