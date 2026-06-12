import type { AlmanacPayload } from './almanac.js';
import { db, jsonParse, nowIso } from './db.js';

export type ArticleStatus = 'draft' | 'published' | 'archived';

export type ArticleInput = {
  slug?: string;
  title?: string;
  excerpt?: string;
  categoryId?: string | null;
  category?: string;
  authorName?: string;
  author?: string;
  status?: ArticleStatus;
  publishedAt?: string | null;
  tone?: string;
  tags?: string[];
  bodyMarkdown?: string;
  body?: string[];
  seoTitle?: string;
  seoDescription?: string;
  coverImage?: string;
};

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category_id: string | null;
  author_name: string;
  status: ArticleStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  tone: string;
  tags_json: string;
  body_markdown: string;
  seo_title: string;
  seo_description: string;
  cover_image: string;
  deleted_at: string | null;
  category_name: string | null;
  category_slug: string | null;
};

type SectionRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SeriesRow = {
  id: string;
  title: string;
  lead: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type GalleryAlbumInput = {
  slug?: string;
  title?: string;
  description?: string;
  isPublic?: boolean;
  sortOrder?: number;
  coverImageId?: string | null;
};

export type GalleryImageInput = {
  title?: string;
  description?: string;
  imageUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  capturedAt?: string | null;
  isPublic?: boolean;
  sortOrder?: number;
};

export const systemGalleryAlbumId = 'album-moonlight';
export const systemGalleryAlbumSlug = 'system';

type GalleryAlbumRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_image_id: string | null;
  is_public: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  cover_image_url: string | null;
  image_count: number;
};

type GalleryImageRow = {
  id: string;
  album_id: string;
  title: string;
  description: string;
  image_url: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  captured_at: string | null;
  is_public: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function slugify(value: string) {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-');

  return normalizedValue || `item-${Date.now()}`;
}

export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function asPublicFlag(value: boolean | undefined, fallback: number) {
  return value === undefined ? fallback : value ? 1 : 0;
}

function normalizeSortOrder(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function parseDateLabel(value: string | null | undefined) {
  if (!value) {
    return nowIso();
  }

  const match = value.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!match) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
  }

  const [, year, month, day, hour = '0', minute = '0'] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  ).toISOString();
}

export function dateLabel(isoDate: string | null) {
  if (!isoDate) {
    return '';
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function toArticle(row: ArticleRow) {
  const tags = jsonParse<string[]>(row.tags_json, []);
  const bodyMarkdown = row.body_markdown;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    categoryId: row.category_id,
    category: row.category_name ?? '',
    categorySlug: row.category_slug ?? '',
    authorName: row.author_name,
    status: row.status,
    publishedAt: row.published_at,
    date: dateLabel(row.published_at),
    dateLabel: dateLabel(row.published_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tone: row.tone,
    tags,
    body: bodyMarkdown ? bodyMarkdown.split(/\n{2,}/) : [],
    bodyMarkdown,
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.excerpt,
    coverImage: row.cover_image,
    deletedAt: row.deleted_at,
  };
}

export function getArticleBySlug(slug: string, includeDrafts = false) {
  const statusSql = includeDrafts ? '' : "AND a.status = 'published'";
  const row = db
    .prepare(
      `
        SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
        FROM articles a
        LEFT JOIN note_sections ns ON ns.id = a.category_id
        WHERE a.slug = ? AND a.deleted_at IS NULL ${statusSql}
      `,
    )
    .get(slug) as ArticleRow | undefined;

  return row ? toArticle(row) : null;
}

export function resolveArticleId(identifier: string) {
  const row = db
    .prepare('SELECT id FROM articles WHERE (id = ? OR slug = ?) AND deleted_at IS NULL')
    .get(identifier, identifier) as { id: string } | undefined;

  return row?.id ?? null;
}

export function listArticles(options: {
  page?: number;
  pageSize?: number;
  category?: string;
  tag?: string;
  q?: string;
  status?: ArticleStatus;
  includeDrafts?: boolean;
}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(1000, Math.max(1, Number(options.pageSize || 10)));
  const clauses = ['a.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (options.includeDrafts) {
    if (options.status) {
      clauses.push('a.status = ?');
      params.push(options.status);
    }
  } else {
    clauses.push("a.status = 'published'");
  }

  if (options.category) {
    clauses.push('(ns.slug = ? OR ns.name = ?)');
    params.push(options.category, options.category);
  }

  if (options.tag) {
    clauses.push('a.tags_json LIKE ?');
    params.push(`%"${options.tag}"%`);
  }

  if (options.q) {
    const like = `%${options.q.trim()}%`;
    clauses.push('(a.title LIKE ? OR a.excerpt LIKE ? OR a.body_markdown LIKE ? OR ns.name LIKE ? OR a.tags_json LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM articles a LEFT JOIN note_sections ns ON ns.id = a.category_id ${whereSql}`)
      .get(...params) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `
        SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
        FROM articles a
        LEFT JOIN note_sections ns ON ns.id = a.category_id
        ${whereSql}
        ORDER BY COALESCE(a.published_at, a.updated_at) DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as ArticleRow[];

  return {
    items: rows.map(toArticle),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

export function listDeletedArticles() {
  const rows = db
    .prepare(
      `
        SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
        FROM articles a
        LEFT JOIN note_sections ns ON ns.id = a.category_id
        WHERE a.deleted_at IS NOT NULL
        ORDER BY a.deleted_at DESC, a.updated_at DESC
      `,
    )
    .all() as ArticleRow[];

  return rows.map(toArticle);
}

export function restoreArticle(idOrSlug: string) {
  const row = db
    .prepare('SELECT id FROM articles WHERE (id = ? OR slug = ?) AND deleted_at IS NOT NULL')
    .get(idOrSlug, idOrSlug) as { id: string } | undefined;

  if (!row) {
    return null;
  }

  db.prepare("UPDATE articles SET status = CASE WHEN status = 'archived' THEN 'draft' ELSE status END, deleted_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), row.id);

  const restored = db
    .prepare(
      `
        SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
        FROM articles a
        LEFT JOIN note_sections ns ON ns.id = a.category_id
        WHERE a.id = ? AND a.deleted_at IS NULL
      `,
    )
    .get(row.id) as ArticleRow | undefined;

  return restored ? toArticle(restored) : null;
}

export function listNoteSections() {
  const rows = db.prepare('SELECT * FROM note_sections ORDER BY sort_order ASC, created_at ASC').all() as SectionRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function normalizeSiteStylePreset(value: unknown) {
  return value === 'classic' || value === 'cyber' ? value : 'classic';
}

export function getSiteSettings() {
  const row = db.prepare('SELECT * FROM site_settings WHERE id = ?').get('site') as
    | { style_preset: string; color_scheme: string; owner_name: string; owner_avatar_url?: string; updated_at: string }
    | undefined;

  return {
    stylePreset: normalizeSiteStylePreset(row?.style_preset),
    ownerName: row?.owner_name ?? '孤舟月',
    ownerAvatarUrl: row?.owner_avatar_url ?? '',
    updatedAt: row?.updated_at ?? nowIso(),
  };
}

export function getHomepage() {
  const row = db.prepare('SELECT payload_json, updated_at FROM homepage_copy WHERE id = ?').get('homepage') as
    | { payload_json: string; updated_at: string }
    | undefined;

  return {
    ...jsonParse<Record<string, string>>(row?.payload_json ?? '{}', {}),
    updatedAt: row?.updated_at ?? nowIso(),
  } as Record<string, string>;
}

export function listFeaturedSeries() {
  const rows = db.prepare('SELECT * FROM featured_series ORDER BY sort_order ASC, created_at ASC').all() as SeriesRow[];

  return rows.map((row) => {
    const articles = db
      .prepare(
        `
          SELECT a.*, ns.name AS category_name, ns.slug AS category_slug
          FROM featured_series_items item
          JOIN articles a ON a.id = item.article_id
          LEFT JOIN note_sections ns ON ns.id = a.category_id
          WHERE item.series_id = ? AND a.deleted_at IS NULL
          ORDER BY item.sort_order ASC
        `,
      )
      .all(row.id) as ArticleRow[];

    return {
      id: row.id,
      title: row.title,
      lead: row.lead,
      body: row.body,
      sortOrder: row.sort_order,
      postSlugs: articles.map((article) => article.slug),
      articles: articles.map(toArticle),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function getSitePayload(almanac?: AlmanacPayload | null) {
  return {
    settings: getSiteSettings(),
    homepage: getHomepage(),
    noteSections: listNoteSections(),
    featuredSeries: listFeaturedSeries(),
    almanac: almanac ?? null,
  };
}

export function toGalleryImage(row: GalleryImageRow) {
  return {
    id: row.id,
    albumId: row.album_id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    capturedAt: row.captured_at,
    isPublic: Boolean(row.is_public),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toGalleryAlbum(row: GalleryAlbumRow, images: ReturnType<typeof toGalleryImage>[] = []) {
  const isSystemGallery = row.id === systemGalleryAlbumId || row.slug === systemGalleryAlbumSlug;

  return {
    id: isSystemGallery ? systemGalleryAlbumId : row.id,
    slug: isSystemGallery ? systemGalleryAlbumSlug : row.slug,
    title: isSystemGallery ? '系统图库' : row.title,
    description: isSystemGallery ? row.description || '维护博客各页面使用的公共图片，不包含文章正文图片。' : row.description,
    coverImageId: row.cover_image_id,
    coverImageUrl: row.cover_image_url ?? images[0]?.imageUrl ?? '',
    isPublic: isSystemGallery ? true : Boolean(row.is_public),
    sortOrder: isSystemGallery ? 0 : row.sort_order,
    imageCount: row.image_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images,
  };
}

export function listGalleryAlbums(options: { includePrivate?: boolean } = {}) {
  const publicSql = options.includePrivate ? '' : 'WHERE a.is_public = 1';
  const rows = db
    .prepare(
      `
        SELECT a.*,
          COALESCE(cover.image_url, first_image.image_url) AS cover_image_url,
          COUNT(CASE WHEN img.is_public = 1 THEN 1 END) AS image_count
        FROM gallery_albums a
        LEFT JOIN gallery_images cover ON cover.id = a.cover_image_id
        LEFT JOIN gallery_images first_image ON first_image.id = (
          SELECT first_public_image.id
          FROM gallery_images first_public_image
          WHERE first_public_image.album_id = a.id AND first_public_image.is_public = 1
          ORDER BY first_public_image.sort_order ASC, first_public_image.created_at ASC
          LIMIT 1
        )
        LEFT JOIN gallery_images img ON img.album_id = a.id
        ${publicSql}
        GROUP BY a.id
        ORDER BY a.sort_order ASC, a.created_at DESC
      `,
    )
    .all() as GalleryAlbumRow[];

  return rows.map((row) => toGalleryAlbum(row));
}

export function getGalleryAlbum(identifier: string, includePrivate = false) {
  const publicSql = includePrivate ? '' : 'AND a.is_public = 1';
  const row = db
    .prepare(
      `
        SELECT a.*,
          cover.image_url AS cover_image_url,
          COUNT(CASE WHEN img.is_public = 1 THEN 1 END) AS image_count
        FROM gallery_albums a
        LEFT JOIN gallery_images cover ON cover.id = a.cover_image_id
        LEFT JOIN gallery_images img ON img.album_id = a.id
        WHERE (a.id = ? OR a.slug = ?) ${publicSql}
        GROUP BY a.id
      `,
    )
    .get(identifier, identifier) as GalleryAlbumRow | undefined;

  if (!row) {
    return null;
  }

  const imagePublicSql = includePrivate ? '' : 'AND is_public = 1';
  const imageRows = db
    .prepare(
      `
        SELECT *
        FROM gallery_images
        WHERE album_id = ? ${imagePublicSql}
        ORDER BY sort_order ASC, created_at ASC
      `,
    )
    .all(row.id) as GalleryImageRow[];

  return toGalleryAlbum(row, imageRows.map(toGalleryImage));
}

export function resolveGalleryAlbumId(identifier: string) {
  const row = db
    .prepare('SELECT id FROM gallery_albums WHERE id = ? OR slug = ?')
    .get(identifier, identifier) as { id: string } | undefined;

  return row?.id ?? null;
}

export function ensureUniqueGallerySlug(baseSlug: string, currentAlbumId?: string) {
  let nextSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const row = db.prepare('SELECT id FROM gallery_albums WHERE slug = ?').get(nextSlug) as { id: string } | undefined;
    if (!row || row.id === currentAlbumId) {
      return nextSlug;
    }
    nextSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export function createGalleryAlbum(input: GalleryAlbumInput) {
  const now = nowIso();
  const title = String(input.title || '未命名相册').trim();
  const id = makeId('album');
  const slug = ensureUniqueGallerySlug(slugify(input.slug || title));

  db.prepare(
    `
      INSERT INTO gallery_albums (id, slug, title, description, cover_image_id, is_public, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    slug,
    title,
    String(input.description ?? ''),
    input.coverImageId ?? null,
    asPublicFlag(input.isPublic, 1),
    normalizeSortOrder(input.sortOrder, 0),
    now,
    now,
  );

  return getGalleryAlbum(id, true);
}

export function updateGalleryAlbum(idOrSlug: string, input: GalleryAlbumInput) {
  const albumId = resolveGalleryAlbumId(idOrSlug);
  if (!albumId) {
    return null;
  }

  const existing = db.prepare('SELECT * FROM gallery_albums WHERE id = ?').get(albumId) as GalleryAlbumRow | undefined;
  if (!existing) {
    return null;
  }

  const isSystemGallery = existing.id === systemGalleryAlbumId || existing.slug === systemGalleryAlbumSlug;
  const title = input.title !== undefined ? String(input.title).trim() || existing.title : existing.title;
  const slug =
    !isSystemGallery && input.slug !== undefined && input.slug !== existing.slug
      ? ensureUniqueGallerySlug(slugify(input.slug || title), albumId)
      : isSystemGallery
        ? systemGalleryAlbumSlug
        : existing.slug;

  db.prepare(
    `
      UPDATE gallery_albums
      SET slug = ?, title = ?, description = ?, cover_image_id = ?, is_public = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(
    slug,
    isSystemGallery ? '系统图库' : title,
    input.description ?? existing.description,
    input.coverImageId !== undefined ? input.coverImageId : existing.cover_image_id,
    isSystemGallery ? 1 : asPublicFlag(input.isPublic, existing.is_public),
    isSystemGallery ? 0 : normalizeSortOrder(input.sortOrder, existing.sort_order),
    nowIso(),
    albumId,
  );

  return getGalleryAlbum(albumId, true);
}

export function deleteGalleryAlbum(idOrSlug: string) {
  const albumId = resolveGalleryAlbumId(idOrSlug);
  if (!albumId) {
    return null;
  }

  const images = listGalleryImages(albumId, true);
  if (albumId === systemGalleryAlbumId) {
    return null;
  }
  const result = db.prepare('DELETE FROM gallery_albums WHERE id = ?').run(albumId);
  return result.changes ? images : null;
}

export function listGalleryImages(albumId: string, includePrivate = false) {
  const publicSql = includePrivate ? '' : 'AND is_public = 1';
  const rows = db
    .prepare(
      `
        SELECT *
        FROM gallery_images
        WHERE album_id = ? ${publicSql}
        ORDER BY sort_order ASC, created_at ASC
      `,
    )
    .all(albumId) as GalleryImageRow[];

  return rows.map(toGalleryImage);
}

export function listGalleryImagesPage(albumId: string, options: { page?: number; pageSize?: number; includePrivate?: boolean } = {}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(60, Math.max(1, Number(options.pageSize || 24)));
  const publicSql = options.includePrivate ? '' : 'AND is_public = 1';
  const total = (
    db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM gallery_images
          WHERE album_id = ? ${publicSql}
        `,
      )
      .get(albumId) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `
        SELECT *
        FROM gallery_images
        WHERE album_id = ? ${publicSql}
        ORDER BY sort_order ASC, created_at ASC
        LIMIT ? OFFSET ?
      `,
    )
    .all(albumId, pageSize, (page - 1) * pageSize) as GalleryImageRow[];

  return {
    items: rows.map(toGalleryImage),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

export function createGalleryImage(albumId: string, input: GalleryImageInput) {
  const now = nowIso();
  const id = makeId('image');
  const title = String(input.title || '未命名图片').trim();

  db.prepare(
    `
      INSERT INTO gallery_images (
        id, album_id, title, description, image_url, file_name, mime_type, size_bytes,
        captured_at, is_public, sort_order, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    albumId,
    title,
    String(input.description ?? ''),
    String(input.imageUrl ?? ''),
    String(input.fileName ?? ''),
    String(input.mimeType ?? ''),
    Number(input.sizeBytes ?? 0),
    input.capturedAt ?? null,
    asPublicFlag(input.isPublic, 1),
    normalizeSortOrder(input.sortOrder, 0),
    now,
    now,
  );

  return getGalleryImage(id);
}

export function getGalleryImage(id: string) {
  const row = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id) as GalleryImageRow | undefined;
  return row ? toGalleryImage(row) : null;
}

export function updateGalleryImage(id: string, input: GalleryImageInput) {
  const existing = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id) as GalleryImageRow | undefined;
  if (!existing) {
    return null;
  }
  const isSystemGalleryImage = existing.album_id === systemGalleryAlbumId;

  db.prepare(
    `
      UPDATE gallery_images
      SET title = ?, description = ?, captured_at = ?, is_public = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(
    input.title !== undefined ? String(input.title).trim() || existing.title : existing.title,
    input.description ?? existing.description,
    input.capturedAt !== undefined ? input.capturedAt : existing.captured_at,
    isSystemGalleryImage ? 1 : asPublicFlag(input.isPublic, existing.is_public),
    normalizeSortOrder(input.sortOrder, existing.sort_order),
    nowIso(),
    id,
  );

  return getGalleryImage(id);
}

export function updateGalleryImageFile(id: string, input: Pick<GalleryImageInput, 'imageUrl' | 'fileName' | 'mimeType' | 'sizeBytes'>) {
  const existing = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id) as GalleryImageRow | undefined;
  if (!existing) {
    return null;
  }

  db.prepare(
    `
      UPDATE gallery_images
      SET image_url = ?, file_name = ?, mime_type = ?, size_bytes = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(
    String(input.imageUrl ?? existing.image_url),
    String(input.fileName ?? existing.file_name),
    String(input.mimeType ?? existing.mime_type),
    Number(input.sizeBytes ?? existing.size_bytes),
    nowIso(),
    id,
  );

  return getGalleryImage(id);
}

export function deleteGalleryImage(id: string) {
  const existing = getGalleryImage(id);
  if (!existing) {
    return null;
  }
  if (existing.albumId === systemGalleryAlbumId) {
    return null;
  }

  const result = db.prepare('DELETE FROM gallery_images WHERE id = ?').run(id);
  return result.changes ? existing : null;
}

export function findCategoryId(input: Pick<ArticleInput, 'categoryId' | 'category'>) {
  if (input.categoryId) {
    const existing = db.prepare('SELECT id FROM note_sections WHERE id = ?').get(input.categoryId) as { id: string } | undefined;
    if (existing) {
      return existing.id;
    }
  }

  if (!input.category) {
    return null;
  }

  const existing = db.prepare('SELECT id FROM note_sections WHERE name = ? OR slug = ?').get(input.category, input.category) as
    | { id: string }
    | undefined;

  return existing?.id ?? null;
}

export function ensureUniqueSlug(baseSlug: string, currentArticleId?: string) {
  let nextSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const row = db.prepare('SELECT id FROM articles WHERE slug = ? AND deleted_at IS NULL').get(nextSlug) as { id: string } | undefined;
    if (!row || row.id === currentArticleId) {
      return nextSlug;
    }
    nextSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function normalizeAuthorName(value: unknown) {
  const authorName = typeof value === 'string' ? value.trim() : '';
  return authorName.slice(0, 40) || '孤舟月';
}

export function createArticle(input: ArticleInput) {
  const now = nowIso();
  const title = String(input.title || '未命名文章').trim();
  const id = makeId('article');
  const slug = ensureUniqueSlug(slugify(input.slug || title));
  const status = input.status ?? 'draft';
  const publishedAt = status === 'published' ? input.publishedAt ?? now : input.publishedAt ?? null;
  const bodyMarkdown = input.bodyMarkdown ?? input.body?.join('\n\n') ?? '';
  const authorName = normalizeAuthorName(input.authorName ?? input.author);

  db.prepare(
    `
      INSERT INTO articles (
        id, slug, title, excerpt, category_id, author_name, status, published_at, created_at, updated_at,
        tone, tags_json, body_markdown, seo_title, seo_description, cover_image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    slug,
    title,
    input.excerpt ?? '',
    findCategoryId(input),
    authorName,
    status,
    publishedAt,
    now,
    now,
    input.tone ?? 'ink',
    JSON.stringify(input.tags ?? []),
    bodyMarkdown,
    input.seoTitle ?? '',
    input.seoDescription ?? '',
    input.coverImage ?? '',
  );

  return getArticleBySlug(slug, true);
}

export function updateArticle(idOrSlug: string, input: ArticleInput) {
  const articleId = resolveArticleId(idOrSlug);
  if (!articleId) {
    return null;
  }

  const existing = db.prepare('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL').get(articleId) as ArticleRow | undefined;
  if (!existing) {
    return null;
  }

  const title = input.title !== undefined ? String(input.title).trim() || existing.title : existing.title;
  const slug = input.slug !== undefined && input.slug !== existing.slug ? ensureUniqueSlug(slugify(input.slug || title), articleId) : existing.slug;
  const status = input.status ?? existing.status;
  const bodyMarkdown = input.bodyMarkdown ?? input.body?.join('\n\n') ?? existing.body_markdown;
  const authorName =
    input.authorName !== undefined || input.author !== undefined
      ? normalizeAuthorName(input.authorName ?? input.author)
      : existing.author_name;
  const publishedAt =
    input.publishedAt !== undefined ? input.publishedAt : status === 'published' && !existing.published_at ? nowIso() : existing.published_at;

  db.prepare(
    `
      UPDATE articles
      SET slug = ?, title = ?, excerpt = ?, category_id = ?, author_name = ?, status = ?, published_at = ?,
          updated_at = ?, tone = ?, tags_json = ?, body_markdown = ?, seo_title = ?,
          seo_description = ?, cover_image = ?
      WHERE id = ?
    `,
  ).run(
    slug,
    title,
    input.excerpt ?? existing.excerpt,
    findCategoryId(input) ?? existing.category_id,
    authorName,
    status,
    publishedAt,
    nowIso(),
    input.tone ?? existing.tone,
    JSON.stringify(input.tags ?? jsonParse(existing.tags_json, [])),
    bodyMarkdown,
    input.seoTitle ?? existing.seo_title,
    input.seoDescription ?? existing.seo_description,
    input.coverImage ?? existing.cover_image,
    articleId,
  );

  return getArticleBySlug(slug, true);
}
