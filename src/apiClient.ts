import type { SiteContent, HomepageCopy, NoteSection, FeaturedSeries, AlmanacInfo, GalleryAlbum, GalleryImage } from './contentStore';
import type { Post } from './posts';
import type { SiteSettings } from './siteSettings';

type JsonRecord = Record<string, unknown>;

export type ApiSitePayload = {
  settings?: Partial<SiteSettings>;
  homepage?: Partial<HomepageCopy>;
  noteSections?: unknown[];
  featuredSeries?: unknown[];
  galleryAlbums?: unknown[];
  almanac?: AlmanacInfo | null;
};

export type ApiArticlesPayload = {
  items?: unknown[];
};

export type ApiComment = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

export type ApiComposerDraft = {
  title: string;
  slug: string;
  category: string;
  date: string;
  tone: string;
  excerpt: string;
  tags: string[];
  bodyMarkdown: string;
  composerMode: 'wysiwyg' | 'markdown' | 'split';
  savedAt: string;
};

export type ApiContentPayload = SiteContent & {
  settings?: Partial<SiteSettings>;
};

const jsonHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json; charset=utf-8',
};

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(isFormData ? { Accept: 'application/json' } : jsonHeaders),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchPublicSite() {
  return requestJson<ApiSitePayload>('/api/site');
}

export async function fetchPublicArticles() {
  const payload = await requestJson<ApiArticlesPayload | unknown[]>('/api/articles?pageSize=1000');
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

export async function fetchAdminContent(): Promise<ApiContentPayload> {
  const payload = await requestJson<ApiContentPayload | { content?: ApiContentPayload }>('/api/admin/content');
  if (isRecord(payload)) {
    const record = payload as JsonRecord;
    const content = record.content;
    if (isRecord(content)) {
      return content as ApiContentPayload;
    }
  }

  return payload as ApiContentPayload;
}

export async function fetchAdminMe() {
  return requestJson<{ authenticated: boolean }>('/api/admin/me');
}

export async function loginAdmin(password: string) {
  return requestJson<{ ok?: boolean }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function saveAdminSettings(settings: SiteSettings) {
  return requestJson<SiteSettings>('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function saveAdminHomepage(homepage: HomepageCopy) {
  return requestJson<HomepageCopy>('/api/admin/homepage', {
    method: 'PUT',
    body: JSON.stringify(homepage),
  });
}

export async function createAdminArticle(post: Post) {
  return requestJson<Post>('/api/admin/articles', {
    method: 'POST',
    body: JSON.stringify(postToApiArticle(post)),
  });
}

export async function updateAdminArticle(originalSlug: string, post: Post) {
  return requestJson<Post>(`/api/admin/articles/${encodeURIComponent(originalSlug)}`, {
    method: 'PUT',
    body: JSON.stringify(postToApiArticle(post)),
  });
}

export async function deleteAdminArticle(slug: string) {
  await requestJson<void>(`/api/admin/articles/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}

export async function fetchAdminDeletedArticles() {
  const payload = await requestJson<unknown[] | { items?: unknown[] }>('/api/admin/trash/articles');
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

export async function restoreAdminArticle(slug: string) {
  return requestJson<Post>(`/api/admin/trash/articles/${encodeURIComponent(slug)}/restore`, {
    method: 'POST',
  });
}

export async function saveAdminNoteSections(noteSections: NoteSection[]) {
  return requestJson<NoteSection[]>('/api/admin/note-sections', {
    method: 'PUT',
    body: JSON.stringify(noteSections),
  });
}

export async function saveAdminFeaturedSeries(featuredSeries: FeaturedSeries[]) {
  return requestJson<FeaturedSeries[]>('/api/admin/featured-series', {
    method: 'PUT',
    body: JSON.stringify(featuredSeries),
  });
}

export async function fetchAdminGallery() {
  const payload = await requestJson<unknown[] | { items?: unknown[] }>('/api/admin/gallery');
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

export async function createAdminGalleryAlbum(album: GalleryAlbum) {
  return requestJson<GalleryAlbum>('/api/admin/gallery/albums', {
    method: 'POST',
    body: JSON.stringify(albumToApi(album)),
  });
}

export async function updateAdminGalleryAlbum(idOrSlug: string, album: GalleryAlbum) {
  return requestJson<GalleryAlbum>(`/api/admin/gallery/albums/${encodeURIComponent(idOrSlug)}`, {
    method: 'PUT',
    body: JSON.stringify(albumToApi(album)),
  });
}

export async function deleteAdminGalleryAlbum(idOrSlug: string) {
  await requestJson<void>(`/api/admin/gallery/albums/${encodeURIComponent(idOrSlug)}`, {
    method: 'DELETE',
  });
}

export async function uploadAdminGalleryImage(albumIdOrSlug: string, file: File, payload: Partial<GalleryImage>) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('title', payload.title ?? '');
  formData.append('description', payload.description ?? '');
  formData.append('capturedAt', payload.capturedAt ?? '');
  formData.append('isPublic', String(payload.isPublic ?? true));
  formData.append('sortOrder', String(payload.sortOrder ?? 0));

  return requestJson<GalleryImage>(`/api/admin/gallery/albums/${encodeURIComponent(albumIdOrSlug)}/images`, {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
    },
  });
}

export async function updateAdminGalleryImage(id: string, image: GalleryImage) {
  return requestJson<GalleryImage>(`/api/admin/gallery/images/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(imageToApi(image)),
  });
}

export async function deleteAdminGalleryImage(id: string) {
  await requestJson<void>(`/api/admin/gallery/images/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchArticleComments(slug: string) {
  const payload = await requestJson<unknown[] | { items?: unknown[] }>(`/api/articles/${encodeURIComponent(slug)}/comments`);
  const comments = Array.isArray(payload) ? payload : payload.items ?? [];
  return comments.map(normalizeComment).filter((comment): comment is ApiComment => comment !== null);
}

export async function submitArticleComment(slug: string, payload: { authorName: string; content: string }) {
  return normalizeComment(
    await requestJson<unknown>(`/api/articles/${encodeURIComponent(slug)}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
}

export async function fetchAdminDraft(draftKey: string) {
  return requestJson<ApiComposerDraft>(`/api/admin/drafts/${encodeURIComponent(draftKey)}`);
}

export async function saveAdminDraft(draftKey: string, draft: ApiComposerDraft) {
  return requestJson<ApiComposerDraft>(`/api/admin/drafts/${encodeURIComponent(draftKey)}`, {
    method: 'PUT',
    body: JSON.stringify(draft),
  });
}

export async function clearAdminDraft(draftKey: string) {
  await requestJson<void>(`/api/admin/drafts/${encodeURIComponent(draftKey)}`, {
    method: 'DELETE',
  });
}

export function normalizeApiPost(value: unknown): Post | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = asText(value.title);
  const bodyMarkdown = asText(value.bodyMarkdown) || asText(value.body) || '这里还没有正文。';
  const tags = Array.isArray(value.tags) ? value.tags.map(asText).filter(Boolean) : [];

  if (!title && !asText(value.slug)) {
    return null;
  }

  return {
    slug: asText(value.slug) || slugify(title || 'untitled'),
    title: title || '未命名文章',
    excerpt: asText(value.excerpt),
    category: asText(value.category) || asText(value.categoryName) || '人间札记',
    authorName: asText(value.authorName) || asText(value.author),
    date: asText(value.date) || asText(value.dateLabel) || formatApiDate(asText(value.publishedAt)) || '2026.05.18 00:00',
    tone: asText(value.tone) || 'ink',
    tags,
    body: [bodyMarkdown],
    bodyMarkdown,
    deletedAt: asText(value.deletedAt),
  };
}

export function normalizeApiNoteSections(value: unknown[] | undefined): NoteSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((section) => {
      if (!isRecord(section)) {
        return null;
      }

      const category = asText(section.category) || asText(section.name);
      if (!category) {
        return null;
      }

      return {
        category,
        description: asText(section.description),
      };
    })
    .filter((section): section is NoteSection => section !== null);
}

export function normalizeApiFeaturedSeries(value: unknown[] | undefined): FeaturedSeries[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((series) => {
      if (!isRecord(series)) {
        return null;
      }

      const items = Array.isArray(series.items) ? series.items : [];
      const postSlugs = Array.isArray(series.postSlugs)
        ? series.postSlugs.map(asText).filter(Boolean)
        : items.map((item) => (isRecord(item) ? asText(item.slug) : '')).filter(Boolean);

      return {
        id: asText(series.id) || slugify(asText(series.title) || `series-${Date.now()}`),
        title: asText(series.title) || '未命名专题',
        lead: asText(series.lead),
        body: asText(series.body),
        postSlugs,
      };
    })
    .filter((series): series is FeaturedSeries => series !== null);
}

export function normalizeApiGalleryAlbums(value: unknown[] | undefined): GalleryAlbum[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeApiGalleryAlbum).filter((album): album is GalleryAlbum => album !== null);
}

export function normalizeApiGalleryAlbum(value: unknown): GalleryAlbum | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = asText(value.title);
  const slug = asText(value.slug) || slugify(title || 'gallery');
  const images = Array.isArray(value.images)
    ? value.images.map(normalizeApiGalleryImage).filter((image): image is GalleryImage => image !== null)
    : [];

  if (!title && !slug) {
    return null;
  }

  return {
    id: asText(value.id) || `album-${slug}`,
    slug,
    title: title || '未命名相册',
    description: asText(value.description),
    coverImageId: asText(value.coverImageId) || null,
    coverImageUrl: asText(value.coverImageUrl) || images[0]?.imageUrl || '',
    isPublic: asBoolean(value.isPublic, true),
    sortOrder: asNumber(value.sortOrder, 0),
    imageCount: asNumber(value.imageCount, images.length),
    createdAt: asText(value.createdAt),
    updatedAt: asText(value.updatedAt),
    images,
  };
}

export function normalizeApiGalleryImage(value: unknown): GalleryImage | null {
  if (!isRecord(value)) {
    return null;
  }

  const imageUrl = asText(value.imageUrl);
  if (!imageUrl) {
    return null;
  }

  return {
    id: asText(value.id) || `image-${Date.now()}`,
    albumId: asText(value.albumId),
    title: asText(value.title) || '未命名图片',
    description: asText(value.description),
    imageUrl,
    fileName: asText(value.fileName),
    mimeType: asText(value.mimeType),
    sizeBytes: asNumber(value.sizeBytes, 0),
    capturedAt: asText(value.capturedAt) || null,
    isPublic: asBoolean(value.isPublic, true),
    sortOrder: asNumber(value.sortOrder, 0),
    createdAt: asText(value.createdAt),
    updatedAt: asText(value.updatedAt),
  };
}

function postToApiArticle(post: Post) {
  return {
    ...post,
    bodyMarkdown: post.bodyMarkdown || post.body.join('\n\n'),
  };
}

function albumToApi(album: GalleryAlbum) {
  return {
    slug: album.slug,
    title: album.title,
    description: album.description,
    coverImageId: album.coverImageId || null,
    isPublic: album.isPublic,
    sortOrder: album.sortOrder,
  };
}

function imageToApi(image: GalleryImage) {
  return {
    title: image.title,
    description: image.description,
    capturedAt: image.capturedAt || null,
    isPublic: image.isPublic,
    sortOrder: image.sortOrder,
  };
}

function normalizeComment(value: unknown): ApiComment | null {
  if (!isRecord(value)) {
    return null;
  }

  const content = asText(value.content);
  if (!content) {
    return null;
  }

  return {
    id: asText(value.id) || `${Date.now()}`,
    author: asText(value.author) || asText(value.authorName) || '过路读者',
    content,
    createdAt: asText(value.createdAt) || new Date().toISOString(),
  };
}

function formatApiDate(value: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function slugify(value: string) {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-');

  return normalizedValue || `post-${Date.now()}`;
}
