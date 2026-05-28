import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { getTodayAlmanac } from './almanac.js';
import { config } from './config.js';
import { db, nowIso } from './db.js';
import {
  createGalleryAlbum,
  createGalleryImage,
  createArticle,
  deleteGalleryAlbum,
  deleteGalleryImage,
  getArticleBySlug,
  getGalleryAlbum,
  getGalleryImage,
  getHomepage,
  getSitePayload,
  getSiteSettings,
  listArticles,
  listDeletedArticles,
  listFeaturedSeries,
  listGalleryAlbums,
  listNoteSections,
  parseDateLabel,
  resolveArticleId,
  resolveGalleryAlbumId,
  restoreArticle,
  slugify,
  systemGalleryAlbumId,
  updateArticle,
  updateGalleryAlbum,
  updateGalleryImage,
} from './content.js';

const sessions = new Map<string, number>();
const allowedGalleryMimeTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);
const maxGalleryImageBytes = 8 * 1024 * 1024;

export function buildApp() {
  const app = Fastify({ logger: true });

  app.addHook('onSend', async (_request, reply, payload) => {
    const contentType = reply.getHeader('content-type');
    if (typeof contentType === 'string' && contentType.startsWith('application/json') && !contentType.includes('charset')) {
      reply.header('content-type', 'application/json; charset=utf-8');
    }
    return payload;
  });

  app.register(cors, { origin: true, credentials: true });
  app.register(cookie);
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    if (body.trim() === '') {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(body));
    } catch (error) {
      done(error as Error);
    }
  });
  app.register(multipart, {
    limits: {
      fileSize: maxGalleryImageBytes,
      files: 1,
    },
  });

  app.get('/api/health', async () => ({ ok: true, timestamp: nowIso() }));
  app.get('/api/site', async () => getSitePayload(await readTodayAlmanac()));
  app.get('/api/almanac/today', async (request, reply) => {
    const almanac = await readTodayAlmanac();
    if (!almanac) {
      return reply.code(503).send({ error: 'Almanac unavailable' });
    }

    return almanac;
  });

  app.get('/api/articles', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return listArticles({
      page: Number(query.page ?? 1),
      pageSize: Number(query.pageSize ?? 10),
      category: query.category,
      tag: query.tag,
      q: query.q,
    });
  });

  app.get('/api/articles/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const article = getArticleBySlug(slug);
    if (!article) {
      return reply.code(404).send({ error: 'Article not found' });
    }

    const published = listArticles({ page: 1, pageSize: 1000 }).items;
    const index = published.findIndex((item) => item.slug === slug);
    const commentCount = (
      db
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM comments c
            JOIN articles a ON a.id = c.article_id
            WHERE a.slug = ? AND c.status = 'approved'
          `,
        )
        .get(slug) as { count: number }
    ).count;

    return {
      article,
      previousPost: index > 0 ? published[index - 1] : null,
      nextPost: index >= 0 && index < published.length - 1 ? published[index + 1] : null,
      commentCount,
    };
  });

  app.get('/api/uploads/gallery/:fileName', async (request, reply) => {
    const { fileName } = request.params as { fileName: string };
    const safeFileName = path.basename(fileName);
    if (safeFileName !== fileName || !/^[a-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i.test(safeFileName)) {
      return reply.code(400).send({ error: 'Invalid file name' });
    }

    const filePath = path.join(config.galleryUploadDir, safeFileName);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    reply.type(contentTypeForFileName(safeFileName));
    return fs.createReadStream(filePath);
  });

  app.get('/api/archive', async () => {
    const articles = listArticles({ page: 1, pageSize: 1000 }).items;
    const groups = new Map<string, typeof articles>();
    for (const article of articles) {
      const date = new Date(article.publishedAt ?? article.createdAt);
      const month = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
      groups.set(month, [...(groups.get(month) ?? []), article]);
    }
    return { months: Array.from(groups, ([month, entries]) => ({ month, entries })) };
  });

  app.get('/api/search', async (request) => {
    const query = request.query as { q?: string; page?: string; pageSize?: string };
    return listArticles({
      q: query.q ?? '',
      page: Number(query.page ?? 1),
      pageSize: Number(query.pageSize ?? 10),
    });
  });

  app.get('/api/articles/:slug/comments', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const article = getArticleBySlug(slug);
    if (!article) {
      return reply.code(404).send({ error: 'Article not found' });
    }

    const comments = db
      .prepare(
        `
          SELECT id, author_name AS authorName, content, status, created_at AS createdAt, updated_at AS updatedAt
          FROM comments
          WHERE article_id = ? AND status = 'approved'
          ORDER BY created_at ASC
        `,
      )
      .all(article.id);

    return { items: comments };
  });

  app.post('/api/articles/:slug/comments', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const article = getArticleBySlug(slug);
    if (!article) {
      return reply.code(404).send({ error: 'Article not found' });
    }

    const body = request.body as { authorName?: string; content?: string };
    const authorName = String(body.authorName ?? '').trim();
    const content = String(body.content ?? '').trim();
    if (authorName.length < 1 || authorName.length > 40 || content.length < 1 || content.length > 1000) {
      return reply.code(400).send({ error: 'Invalid comment payload' });
    }

    const now = nowIso();
    const ipHash = crypto.createHash('sha256').update(request.ip || '').digest('hex');
    const id = `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    db.prepare(
      `
        INSERT INTO comments (id, article_id, author_name, content, status, ip_hash, user_agent, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `,
    ).run(id, article.id, authorName, content, ipHash, request.headers['user-agent'] ?? '', now, now);

    return reply.code(201).send({ id, status: 'pending', message: '评论已提交，审核后展示。' });
  });

  app.post('/api/admin/login', async (request, reply) => {
    const body = request.body as { password?: string };
    if (body.password !== config.adminPassword) {
      return reply.code(401).send({ error: 'Invalid password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + config.sessionTtlMs);
    reply.setCookie(config.sessionCookieName, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    });
    return { ok: true };
  });

  app.post('/api/admin/logout', async (request, reply) => {
    const token = request.cookies[config.sessionCookieName];
    if (token) {
      sessions.delete(token);
    }
    reply.clearCookie(config.sessionCookieName, { path: '/' });
    return { ok: true };
  });

  app.get('/api/admin/me', { preHandler: requireAdmin }, async () => ({ authenticated: true }));

  app.get('/api/admin/content', { preHandler: requireAdmin }, async () => ({
    settings: getSiteSettings(),
    homepage: getHomepage(),
    noteSections: listNoteSections(),
    featuredSeries: listFeaturedSeries(),
    galleryAlbums: listGalleryAlbums({ includePrivate: true }).map((album) => getGalleryAlbum(album.id, true) ?? album),
    posts: listArticles({ page: 1, pageSize: 1000, includeDrafts: true }).items,
  }));

  app.get('/api/admin/gallery', { preHandler: requireAdmin }, async () => ({
    items: listGalleryAlbums({ includePrivate: true }).map((album) => getGalleryAlbum(album.id, true) ?? album),
  }));

  app.post('/api/admin/gallery/albums', { preHandler: requireAdmin }, async (request, reply) => {
    const album = createGalleryAlbum(request.body as Record<string, unknown>);
    return reply.code(201).send(album);
  });

  app.put('/api/admin/gallery/albums/:idOrSlug', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const album = updateGalleryAlbum(idOrSlug, request.body as Record<string, unknown>);
    return album ?? reply.code(404).send({ error: 'Gallery album not found' });
  });

  app.delete('/api/admin/gallery/albums/:idOrSlug', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const album = getGalleryAlbum(idOrSlug, true);
    if (!album) {
      return reply.code(404).send({ error: 'Gallery album not found' });
    }
    if (album.id === systemGalleryAlbumId) {
      return reply.code(400).send({ error: 'System gallery cannot be deleted' });
    }

    const deleted = deleteGalleryAlbum(idOrSlug);
    if (!deleted) {
      return reply.code(404).send({ error: 'Gallery album not found' });
    }

    try {
      await deleteGalleryFiles(album.images);
    } catch (error) {
      request.log.warn({ error }, 'Failed to delete one or more gallery files after deleting album');
    }

    return { ok: true };
  });

  app.post('/api/admin/gallery/albums/:idOrSlug/images', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const albumId = resolveGalleryAlbumId(idOrSlug);
    if (!albumId) {
      return reply.code(404).send({ error: 'Gallery album not found' });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'Image file is required' });
    }

    const extension = allowedGalleryMimeTypes.get(file.mimetype);
    if (!extension) {
      file.file.resume();
      return reply.code(400).send({ error: 'Unsupported image type' });
    }

    const fields = file.fields as Record<string, unknown>;
    const originalTitle = path.parse(file.filename || '').name;
    const fileName = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
    const filePath = path.join(config.galleryUploadDir, fileName);

    try {
      fs.mkdirSync(config.galleryUploadDir, { recursive: true });
      await pipeline(file.file, fs.createWriteStream(filePath));
    } catch {
      return reply.code(413).send({ error: 'Failed to save image file' });
    }

    const image = createGalleryImage(albumId, {
      title: readMultipartField(fields.title) || originalTitle || '未命名图片',
      description: readMultipartField(fields.description),
      capturedAt: readMultipartField(fields.capturedAt) || null,
      isPublic: readMultipartField(fields.isPublic) !== 'false',
      sortOrder: Number(readMultipartField(fields.sortOrder) || 0),
      imageUrl: `/api/uploads/gallery/${fileName}`,
      fileName,
      mimeType: file.mimetype,
      sizeBytes: fs.statSync(filePath).size,
    });

    return reply.code(201).send(image);
  });

  app.put('/api/admin/gallery/images/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const image = updateGalleryImage(id, request.body as Record<string, unknown>);
    return image ?? reply.code(404).send({ error: 'Gallery image not found' });
  });

  app.delete('/api/admin/gallery/images/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const image = getGalleryImage(id);
    if (!image) {
      return reply.code(404).send({ error: 'Gallery image not found' });
    }

    const deleted = deleteGalleryImage(id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Gallery image not found' });
    }

    try {
      await deleteGalleryFiles([image]);
    } catch (error) {
      request.log.warn({ error }, 'Failed to delete gallery file after deleting image');
    }

    return { ok: true };
  });

  app.put('/api/admin/settings', { preHandler: requireAdmin }, async (request) => {
    const body = request.body as { stylePreset?: string; colorScheme?: string; ownerName?: string; ownerAvatarUrl?: string };
    const now = nowIso();
    const ownerName = String(body.ownerName ?? '').trim().slice(0, 40) || '孤舟月';
    const ownerAvatarUrl = String(body.ownerAvatarUrl ?? '').trim().slice(0, 500);
    db.prepare(
      `
        INSERT INTO site_settings (id, style_preset, color_scheme, owner_name, owner_avatar_url, updated_at)
        VALUES ('site', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET style_preset = excluded.style_preset,
          color_scheme = excluded.color_scheme, owner_name = excluded.owner_name,
          owner_avatar_url = excluded.owner_avatar_url,
          updated_at = excluded.updated_at
      `,
    ).run(body.stylePreset ?? 'classic', body.colorScheme ?? 'light', ownerName, ownerAvatarUrl, now);
    return getSiteSettings();
  });

  app.put('/api/admin/homepage', { preHandler: requireAdmin }, async (request) => {
    const now = nowIso();
    db.prepare(
      `
        INSERT INTO homepage_copy (id, payload_json, updated_at)
        VALUES ('homepage', ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
      `,
    ).run(JSON.stringify(request.body ?? {}), now);
    return getHomepage();
  });

  app.post('/api/admin/articles', { preHandler: requireAdmin }, async (request, reply) => {
    const article = createArticle(request.body as Record<string, unknown>);
    return reply.code(201).send(article);
  });

  app.put('/api/admin/articles/:idOrSlug', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const article = updateArticle(idOrSlug, request.body as Record<string, unknown>);
    return article ?? reply.code(404).send({ error: 'Article not found' });
  });

  app.delete('/api/admin/articles/:idOrSlug', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const articleId = resolveArticleId(idOrSlug);
    if (!articleId) {
      return reply.code(404).send({ error: 'Article not found' });
    }

    const result = db.prepare('UPDATE articles SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
      nowIso(),
      nowIso(),
      articleId,
    );
    return result.changes ? { ok: true } : reply.code(404).send({ error: 'Article not found' });
  });

  app.get('/api/admin/trash/articles', { preHandler: requireAdmin }, async () => ({
    items: listDeletedArticles(),
  }));

  app.post('/api/admin/trash/articles/:idOrSlug/restore', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const article = restoreArticle(idOrSlug);
    return article ?? reply.code(404).send({ error: 'Article not found' });
  });

  app.post('/api/admin/articles/:idOrSlug/publish', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const article = updateArticle(idOrSlug, { status: 'published', publishedAt: nowIso() });
    return article ?? reply.code(404).send({ error: 'Article not found' });
  });

  app.post('/api/admin/articles/:idOrSlug/unpublish', { preHandler: requireAdmin }, async (request, reply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const article = updateArticle(idOrSlug, { status: 'draft' });
    return article ?? reply.code(404).send({ error: 'Article not found' });
  });

  app.put('/api/admin/note-sections', { preHandler: requireAdmin }, async (request) => {
    const sections = Array.isArray(request.body) ? request.body : (request.body as { items?: unknown[] })?.items ?? [];
    const now = nowIso();
    const save = db.transaction((items: Array<Record<string, unknown>>) => {
      const statement = db.prepare(
        `
          INSERT INTO note_sections (id, name, slug, description, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug,
            description = excluded.description, sort_order = excluded.sort_order, updated_at = excluded.updated_at
        `,
      );
      items.forEach((item, index) => {
        const name = String(item.name ?? item.category ?? '').trim();
        if (!name) {
          return;
        }
        statement.run(String(item.id ?? `section_${slugify(name)}`), name, slugify(String(item.slug ?? name)), String(item.description ?? ''), index, now, now);
      });
    });
    save(sections as Array<Record<string, unknown>>);
    return { items: listNoteSections() };
  });

  app.put('/api/admin/featured-series', { preHandler: requireAdmin }, async (request) => {
    const series = Array.isArray(request.body) ? request.body : (request.body as { items?: unknown[] })?.items ?? [];
    const now = nowIso();
    const save = db.transaction((items: Array<Record<string, unknown>>) => {
      db.prepare('DELETE FROM featured_series').run();
      const seriesStatement = db.prepare(
        'INSERT INTO featured_series (id, title, lead, body, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      const itemStatement = db.prepare(
        `
          INSERT INTO featured_series_items (series_id, article_id, sort_order)
          SELECT ?, id, ? FROM articles WHERE slug = ? AND deleted_at IS NULL
        `,
      );
      items.forEach((item, index) => {
        const id = String(item.id ?? `series_${index}`);
        seriesStatement.run(id, String(item.title ?? '未命名专题'), String(item.lead ?? ''), String(item.body ?? ''), index, now, now);
        const postSlugs = Array.isArray(item.postSlugs) ? item.postSlugs : [];
        postSlugs.forEach((slug, itemIndex) => itemStatement.run(id, itemIndex, String(slug)));
      });
    });
    save(series as Array<Record<string, unknown>>);
    return { items: listFeaturedSeries() };
  });

  app.get('/api/admin/comments', { preHandler: requireAdmin }, async (request) => {
    const query = request.query as { status?: string };
    const status = query.status ?? 'pending';
    const comments = db
      .prepare(
        `
          SELECT c.id, c.author_name AS authorName, c.content, c.status,
            c.created_at AS createdAt, c.updated_at AS updatedAt,
            a.slug AS articleSlug, a.title AS articleTitle
          FROM comments c
          JOIN articles a ON a.id = c.article_id
          WHERE c.status = ?
          ORDER BY c.created_at DESC
        `,
      )
      .all(status);
    return { items: comments };
  });

  app.put('/api/admin/comments/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string };
    if (!['pending', 'approved', 'rejected'].includes(body.status ?? '')) {
      return reply.code(400).send({ error: 'Invalid status' });
    }
    const result = db.prepare('UPDATE comments SET status = ?, updated_at = ? WHERE id = ?').run(body.status, nowIso(), id);
    return result.changes ? { ok: true } : reply.code(404).send({ error: 'Comment not found' });
  });

  app.get('/api/admin/drafts/:draftKey', { preHandler: requireAdmin }, async (request, reply) => {
    const { draftKey } = request.params as { draftKey: string };
    const row = db.prepare('SELECT payload_json AS payloadJson, saved_at AS savedAt FROM composer_drafts WHERE draft_key = ?').get(draftKey) as
      | { payloadJson: string; savedAt: string }
      | undefined;
    return row ? { draft: JSON.parse(row.payloadJson), savedAt: row.savedAt } : reply.code(404).send({ error: 'Draft not found' });
  });

  app.put('/api/admin/drafts/:draftKey', { preHandler: requireAdmin }, async (request) => {
    const { draftKey } = request.params as { draftKey: string };
    const body = request.body as { articleId?: string; publishedAt?: string };
    const payload = { ...body, publishedAt: body.publishedAt ? parseDateLabel(body.publishedAt) : body.publishedAt };
    const now = nowIso();
    db.prepare(
      `
        INSERT INTO composer_drafts (draft_key, article_id, payload_json, saved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(draft_key) DO UPDATE SET article_id = excluded.article_id,
          payload_json = excluded.payload_json, saved_at = excluded.saved_at
      `,
    ).run(draftKey, body.articleId ?? null, JSON.stringify(payload), now);
    return { draft: payload, savedAt: now };
  });

  app.delete('/api/admin/drafts/:draftKey', { preHandler: requireAdmin }, async (request) => {
    const { draftKey } = request.params as { draftKey: string };
    db.prepare('DELETE FROM composer_drafts WHERE draft_key = ?').run(draftKey);
    return { ok: true };
  });

  app.get('/rss.xml', async (_request, reply) => {
    reply.header('content-type', 'application/rss+xml; charset=utf-8');
    const site = getSitePayload();
    const articles = listArticles({ page: 1, pageSize: 100 }).items;
    const items = articles
      .map(
        (article) =>
          `<item><title><![CDATA[${article.title}]]></title><link>${config.siteUrl}/articles/${article.slug}</link><guid>${config.siteUrl}/articles/${article.slug}</guid><description><![CDATA[${article.excerpt}]]></description><pubDate>${new Date(article.publishedAt ?? article.createdAt).toUTCString()}</pubDate></item>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title><![CDATA[${site.homepage.siteName ?? '孤舟月'}]]></title><link>${config.siteUrl}</link><description><![CDATA[${site.homepage.siteTagline ?? ''}]]></description>${items}</channel></rss>`;
  });

  app.get('/sitemap.xml', async (_request, reply) => {
    reply.header('content-type', 'application/xml; charset=utf-8');
    const articles = listArticles({ page: 1, pageSize: 1000 }).items;
    const urls = [
      `<url><loc>${config.siteUrl}/</loc></url>`,
      ...articles.map((article) => `<url><loc>${config.siteUrl}/articles/${article.slug}</loc><lastmod>${article.updatedAt}</lastmod></url>`),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
  });

  app.get('/robots.txt', async (_request, reply) => {
    reply.header('content-type', 'text/plain; charset=utf-8');
    return `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`;
  });

  async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[config.sessionCookieName];
    const expiresAt = token ? sessions.get(token) : undefined;
    if (!token || !expiresAt || expiresAt < Date.now()) {
      if (token) {
        sessions.delete(token);
      }
      return reply.code(401).send({ error: 'Admin login required' });
    }
    sessions.set(token, Date.now() + config.sessionTtlMs);
  }

  async function readTodayAlmanac() {
    try {
      return await getTodayAlmanac();
    } catch (error) {
      app.log.warn({ error }, 'Failed to load cnlunar almanac');
      return null;
    }
  }

  function readMultipartField(field: unknown) {
    if (isMultipartField(field)) {
      return String(field.value ?? '').trim();
    }

    return '';
  }

  function isMultipartField(value: unknown): value is { value?: unknown } {
    return typeof value === 'object' && value !== null && 'value' in value;
  }

  function contentTypeForFileName(fileName: string) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') {
      return 'image/jpeg';
    }
    if (extension === '.png') {
      return 'image/png';
    }
    if (extension === '.webp') {
      return 'image/webp';
    }
    if (extension === '.gif') {
      return 'image/gif';
    }
    return 'application/octet-stream';
  }

  async function deleteGalleryFiles(images: Array<{ fileName?: string }>) {
    for (const image of images) {
      if (!image.fileName) {
        continue;
      }

      const safeFileName = path.basename(image.fileName);
      if (safeFileName !== image.fileName) {
        throw new Error('Unsafe gallery file name');
      }

      const filePath = path.join(config.galleryUploadDir, safeFileName);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    }
  }

  return app;
}
