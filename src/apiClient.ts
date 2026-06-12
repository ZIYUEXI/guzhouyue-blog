import type { SiteContent, HomepageCopy, NoteSection, FeaturedSeries, AlmanacInfo, GalleryAlbum, GalleryImage } from './contentStore';
import type { Post, PostStatus } from './posts';
import type { SiteSettings } from './siteSettings';

type JsonRecord = Record<string, unknown>;

export class ApiError extends Error {
  status: number;
  path: string;

  constructor(status: number, path: string) {
    super(`API ${status}: ${path}`);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

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

export type ApiGalleryImagesPayload = {
  items?: unknown[];
  page?: number;
  pageSize?: number;
  pageCount?: number;
  total?: number;
};

export type ApiComment = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

export type AdminCommentStatus = 'pending' | 'approved' | 'rejected';

export type ApiAdminComment = {
  id: string;
  author: string;
  content: string;
  status: AdminCommentStatus;
  createdAt: string;
  updatedAt: string;
  articleSlug: string;
  articleTitle: string;
};

export type ApiAdminOps = {
  api?: {
    ok?: boolean;
    timestamp?: string;
  };
  database?: {
    ok?: boolean;
    quickCheck?: string;
    path?: string;
    sizeBytes?: number;
  };
  pendingComments?: number;
  latestPublished?: unknown[];
  recentAudit?: Array<{
    id?: string;
    action?: string;
    target?: string;
    userAgent?: string;
    createdAt?: string;
  }>;
};

export type ApiAdminCommandOptionValue = string | boolean | string[];

export type ApiAdminCommandInvocation = {
  raw: string;
  name: string;
  positional: string[];
  options: Record<string, ApiAdminCommandOptionValue>;
};

export type ApiAdminCommandDescriptor = {
  name: string;
  summary: string;
  scope: string;
  risk: 'low' | 'medium' | 'high';
  arguments: Array<{
    name: string;
    description: string;
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'json';
  }>;
  confirmationRequired: boolean;
};

export type ApiAdminCommandGuide = {
  pattern: string;
  rules: string[];
  placeholderExamples: string[];
  commands: ApiAdminCommandDescriptor[];
};

export type ApiAdminCommandParseResult =
  | {
      ok: true;
      invocation: ApiAdminCommandInvocation;
      tokens: string[];
      guide: ApiAdminCommandGuide;
    }
  | {
      ok: false;
      errors: string[];
      tokens: string[];
      guide: ApiAdminCommandGuide;
    };

export type ApiAdminCommandRunResult =
  | {
      status: 'invalid';
      errors: string[];
      guide: ApiAdminCommandGuide;
    }
  | {
      status: 'unknown_command';
      invocation: ApiAdminCommandInvocation;
      guide: ApiAdminCommandGuide;
    }
  | {
      status: 'failed';
      invocation: ApiAdminCommandInvocation;
      command: ApiAdminCommandDescriptor;
      errors: string[];
    }
  | {
      status: 'confirmation_required' | 'dry_run' | 'executed';
      invocation: ApiAdminCommandInvocation;
      command: ApiAdminCommandDescriptor;
      result?: unknown;
    };

export type ApiComposerDraft = {
  title: string;
  slug: string;
  category: string;
  date: string;
  status: PostStatus;
  publishedAt: string | null;
  tone: string;
  excerpt: string;
  tags: string[];
  bodyMarkdown: string;
  seoTitle: string;
  seoDescription: string;
  coverImage: string;
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
  const headers = new Headers(isFormData ? { Accept: 'application/json' } : jsonHeaders);
  const csrfHeader = csrfHeaderForRequest(init.method);
  if (csrfHeader) {
    headers.set('X-CSRF-Token', csrfHeader);
  }
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, path);
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

export async function fetchPublicGallery() {
  const payload = await requestJson<unknown[] | { items?: unknown[] }>('/api/gallery');
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

export async function fetchPublicGalleryAlbumImages(albumIdOrSlug: string, options: { page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 24),
  });
  const payload = await requestJson<ApiGalleryImagesPayload>(
    `/api/gallery/albums/${encodeURIComponent(albumIdOrSlug)}/images?${params.toString()}`,
  );
  const images = Array.isArray(payload.items) ? payload.items : [];

  return {
    items: images,
    page: asNumber(payload.page, options.page ?? 1),
    pageSize: asNumber(payload.pageSize, options.pageSize ?? 24),
    pageCount: asNumber(payload.pageCount, 1),
    total: asNumber(payload.total, images.length),
  };
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

export async function logoutAdmin() {
  return requestJson<{ ok?: boolean }>('/api/admin/logout', {
    method: 'POST',
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

export async function publishAdminArticle(slug: string) {
  return requestJson<Post>(`/api/admin/articles/${encodeURIComponent(slug)}/publish`, {
    method: 'POST',
  });
}

export async function unpublishAdminArticle(slug: string) {
  return requestJson<Post>(`/api/admin/articles/${encodeURIComponent(slug)}/unpublish`, {
    method: 'POST',
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

export async function replaceAdminGalleryImageFile(id: string, file: File) {
  const formData = new FormData();
  formData.append('image', file);

  return requestJson<GalleryImage>(`/api/admin/gallery/images/${encodeURIComponent(id)}/file`, {
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

export async function fetchAdminComments(status: AdminCommentStatus) {
  const payload = await requestJson<unknown[] | { items?: unknown[] }>(`/api/admin/comments?status=${encodeURIComponent(status)}`);
  const comments = Array.isArray(payload) ? payload : payload.items ?? [];
  return comments.map(normalizeAdminComment).filter((comment): comment is ApiAdminComment => comment !== null);
}

export async function fetchAdminOps() {
  return requestJson<ApiAdminOps>('/api/admin/ops');
}

export async function fetchAdminCommandGuide() {
  return requestJson<ApiAdminCommandGuide>('/api/admin/commands');
}

export async function parseAdminCommand(input: string) {
  return requestJson<ApiAdminCommandParseResult>('/api/admin/commands/parse', {
    method: 'POST',
    body: JSON.stringify({ input }),
  });
}

export async function runAdminCommand(input: string, options: { confirm?: boolean; dryRun?: boolean } = {}) {
  return requestJson<ApiAdminCommandRunResult>('/api/admin/commands/run', {
    method: 'POST',
    body: JSON.stringify({ input, ...options }),
  });
}

export async function updateAdminCommentStatus(id: string, status: AdminCommentStatus) {
  return requestJson<{ ok?: boolean }>(`/api/admin/comments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminDraft(draftKey: string) {
  return normalizeComposerDraftResponse(await requestJson<unknown>(`/api/admin/drafts/${encodeURIComponent(draftKey)}`));
}

export async function saveAdminDraft(draftKey: string, draft: ApiComposerDraft) {
  return normalizeComposerDraftResponse(await requestJson<unknown>(`/api/admin/drafts/${encodeURIComponent(draftKey)}`, {
    method: 'PUT',
    body: JSON.stringify(draft),
  }));
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
    status: normalizePostStatus(asText(value.status)),
    publishedAt: asText(value.publishedAt) || null,
    tone: asText(value.tone) || 'ink',
    tags,
    body: [bodyMarkdown],
    bodyMarkdown,
    seoTitle: asText(value.seoTitle),
    seoDescription: asText(value.seoDescription),
    coverImage: asText(value.coverImage),
    deletedAt: asText(value.deletedAt),
  };
}

export function normalizeApiNoteSections(value: unknown[] | undefined): NoteSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<NoteSection[]>((sections, section) => {
    if (!isRecord(section)) {
      return sections;
    }

    const category = asText(section.category) || asText(section.name);
    if (!category) {
      return sections;
    }

    sections.push({
      id: asText(section.id),
      category,
      slug: asText(section.slug),
      description: asText(section.description),
    });
    return sections;
  }, []);
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
    status: post.status ?? 'published',
    publishedAt: post.publishedAt ?? null,
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    coverImage: post.coverImage ?? '',
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

function normalizeAdminComment(value: unknown): ApiAdminComment | null {
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
    status: normalizeCommentStatus(asText(value.status)),
    createdAt: asText(value.createdAt) || new Date().toISOString(),
    updatedAt: asText(value.updatedAt) || asText(value.createdAt) || new Date().toISOString(),
    articleSlug: asText(value.articleSlug),
    articleTitle: asText(value.articleTitle) || '未知文章',
  };
}

function normalizeComposerDraftResponse(value: unknown): ApiComposerDraft {
  const record = isRecord(value) ? value : {};
  const draft = isRecord(record.draft) ? record.draft : record;
  const savedAt = asText(record.savedAt) || asText(draft.savedAt) || new Date().toISOString();

  return {
    title: asText(draft.title),
    slug: asText(draft.slug),
    category: asText(draft.category),
    date: asText(draft.date),
    status: normalizePostStatus(asText(draft.status)),
    publishedAt: asText(draft.publishedAt) || null,
    tone: asText(draft.tone) || 'ink',
    excerpt: asText(draft.excerpt),
    tags: Array.isArray(draft.tags) ? draft.tags.map(asText).filter(Boolean) : [],
    bodyMarkdown: asText(draft.bodyMarkdown),
    seoTitle: asText(draft.seoTitle),
    seoDescription: asText(draft.seoDescription),
    coverImage: asText(draft.coverImage),
    composerMode:
      draft.composerMode === 'markdown' || draft.composerMode === 'split' || draft.composerMode === 'wysiwyg'
        ? draft.composerMode
        : 'wysiwyg',
    savedAt,
  };
}

function normalizePostStatus(value: string): PostStatus {
  return value === 'draft' || value === 'archived' || value === 'published' ? value : 'published';
}

function normalizeCommentStatus(value: string): AdminCommentStatus {
  return value === 'approved' || value === 'rejected' || value === 'pending' ? value : 'pending';
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

function csrfHeaderForRequest(method = 'GET') {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
    return '';
  }

  const token = readCookie('guzhouyue_csrf');
  return token;
}

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return '';
  }

  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? '';
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
