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

export type ApiStarfieldVersion = {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  isActive: boolean;
  sourceArticleIds: string[];
  generationModel: string;
  generationPromptVersion: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  passageCount?: number | null;
  acceptedPassageCount?: number | null;
  relationshipCount?: number | null;
  acceptedRelationshipCount?: number | null;
};

export type ApiStarfieldPassage = {
  id: string;
  versionId: string;
  articleId: string;
  article: {
    id: string;
    slug: string;
    title: string;
    category: string;
  };
  title: string;
  text: string;
  excerpt: string;
  anchor: string;
  keywords: string[];
  status: 'suggested' | 'accepted' | 'hidden';
  sortOrder: number;
  reviewNote: string;
  embeddingRef: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
  starSize?: number;
  starColorKey?: string;
};

export type ApiStarfieldRelationship = {
  id: string;
  versionId: string;
  sourcePassageId: string;
  targetPassageId: string;
  relationshipType: 'same_topic' | 'prerequisite' | 'further_reading' | 'problem_solution' | 'comparison';
  relationshipLabel: string;
  rationale: string;
  evidenceKeywords: string[];
  strength: number;
  status: 'suggested' | 'accepted' | 'hidden';
  isCrossArticle: boolean;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
};

export type ApiStarfieldCanonicalKeyword = {
  id: string;
  versionId: string;
  label: string;
  aliases: string[];
  passageIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ApiStarfieldPayload = {
  version?: {
    id: string;
    name: string;
    publishedAt?: string | null;
  } | null;
  passages?: unknown[];
  relationships?: unknown[];
};

export type ApiAdminStarfieldVersionPayload = {
  version: ApiStarfieldVersion;
  passages: ApiStarfieldPassage[];
  relationships: ApiStarfieldRelationship[];
  canonicalKeywords: ApiStarfieldCanonicalKeyword[];
  jobs: Array<{
    id: string;
    versionId: string;
    phase: 'passages' | 'relationships';
    status: 'pending' | 'running' | 'succeeded' | 'failed';
    selectedArticleIds: string[];
    progressCurrent: number;
    progressTotal: number;
    currentStep: string;
    errorMessage: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string | null;
  }>;
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
  llmTokenUsage?: ApiLlmTokenUsageSummary;
};

export type LlmProvider = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'moonshot' | 'qwen' | 'zhipu' | 'custom';

export type ApiLlmConfig = {
  provider: LlmProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  enabled: boolean;
  updatedAt?: string;
};

export type ApiLlmTokenUsageSummary = {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  unknownTokenRecords: number;
};

export type ApiLlmTokenUsageItem = {
  id: string;
  feature: string;
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  status: 'success' | 'failed';
  errorMessage: string;
  createdAt: string;
};

export type ApiLlmTokenUsagePayload = {
  summary: ApiLlmTokenUsageSummary;
  items: ApiLlmTokenUsageItem[];
};

export type ApiLlmConnectionTestResult = {
  ok: boolean;
  message: string;
  provider: string;
  model: string;
};

export type ApiArticleMetadataSuggestion = {
  title: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
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

export async function fetchPublicStarfield() {
  const payload = await requestJson<ApiStarfieldPayload>('/api/starfield');
  return {
    version: payload.version ?? null,
    passages: (payload.passages ?? []).map(normalizeStarfieldPassage).filter((passage): passage is ApiStarfieldPassage => passage !== null),
    relationships: (payload.relationships ?? []).map(normalizeStarfieldRelationship).filter((relationship): relationship is ApiStarfieldRelationship => relationship !== null),
  };
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
  const payload = await requestJson<unknown[] | { items?: unknown[] }>('/api/admin/note-sections', {
    method: 'PUT',
    body: JSON.stringify(noteSections),
  });
  return Array.isArray(payload) ? payload : payload.items ?? [];
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

export async function fetchAdminLlmConfig() {
  return requestJson<ApiLlmConfig>('/api/admin/llm-config');
}

export async function fetchAdminLlmTokenUsage() {
  return requestJson<ApiLlmTokenUsagePayload>('/api/admin/llm-token-usage');
}

export async function saveAdminLlmConfig(config: ApiLlmConfig) {
  return requestJson<ApiLlmConfig>('/api/admin/llm-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function testAdminLlmConnection() {
  return requestJson<ApiLlmConnectionTestResult>('/api/admin/llm-config/test', {
    method: 'POST',
  });
}

export async function generateAdminArticleMetadata(payload: {
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  bodyMarkdown: string;
}) {
  return requestJson<ApiArticleMetadataSuggestion>('/api/admin/ai-agent/article-metadata', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminStarfieldVersions() {
  const payload = await requestJson<{ items?: unknown[] }>('/api/admin/starfield/versions');
  return (payload.items ?? []).map(normalizeStarfieldVersion).filter((version): version is ApiStarfieldVersion => version !== null);
}

export async function createAdminStarfieldVersion(name: string) {
  const payload = await requestJson<unknown>('/api/admin/starfield/versions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return normalizeAdminStarfieldVersionPayload(payload);
}

export async function fetchAdminStarfieldVersion(id: string) {
  const payload = await requestJson<unknown>(`/api/admin/starfield/versions/${encodeURIComponent(id)}`);
  return normalizeAdminStarfieldVersionPayload(payload);
}

export async function generateAdminStarfieldPassages(versionId: string, articleIds: string[]) {
  const payload = await requestJson<unknown>(`/api/admin/starfield/versions/${encodeURIComponent(versionId)}/generate-passages`, {
    method: 'POST',
    body: JSON.stringify({ articleIds }),
  });
  return normalizeAdminStarfieldVersionPayload(payload);
}

export async function generateAdminStarfieldRelationships(versionId: string) {
  const payload = await requestJson<unknown>(`/api/admin/starfield/versions/${encodeURIComponent(versionId)}/generate-relationships`, {
    method: 'POST',
  });
  return normalizeAdminStarfieldVersionPayload(payload);
}

export async function updateAdminStarfieldPassage(id: string, payload: Partial<ApiStarfieldPassage>) {
  const response = await requestJson<unknown>(`/api/admin/starfield/passages/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeAdminStarfieldVersionPayload(response);
}

export async function bulkUpdateAdminStarfieldPassages(
  versionId: string,
  payload: { status: ApiStarfieldPassage['status']; passageIds?: string[]; sourceStatus?: ApiStarfieldPassage['status'] },
) {
  const response = await requestJson<unknown>(`/api/admin/starfield/versions/${encodeURIComponent(versionId)}/passages/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeAdminStarfieldVersionPayload(response);
}

export async function updateAdminStarfieldRelationship(id: string, payload: Partial<ApiStarfieldRelationship>) {
  const response = await requestJson<unknown>(`/api/admin/starfield/relationships/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return normalizeAdminStarfieldVersionPayload(response);
}

export async function bulkUpdateAdminStarfieldRelationships(
  versionId: string,
  payload: {
    status: ApiStarfieldRelationship['status'];
    relationshipIds?: string[];
    sourceStatus?: ApiStarfieldRelationship['status'];
    crossArticleOnly?: boolean;
  },
) {
  const response = await requestJson<unknown>(`/api/admin/starfield/versions/${encodeURIComponent(versionId)}/relationships/bulk`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return normalizeAdminStarfieldVersionPayload(response);
}

export async function publishAdminStarfieldVersion(id: string) {
  const payload = await requestJson<unknown>(`/api/admin/starfield/versions/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
  });
  return normalizeAdminStarfieldVersionPayload(payload);
}

export async function archiveAdminStarfieldVersion(id: string) {
  const payload = await requestJson<unknown>(`/api/admin/starfield/versions/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
  });
  return normalizeAdminStarfieldVersionPayload(payload);
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
    id: asText(value.id),
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

function normalizeStarfieldVersion(value: unknown): ApiStarfieldVersion | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asText(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    name: asText(value.name) || '星空版本',
    status: value.status === 'published' || value.status === 'archived' ? value.status : 'draft',
    isActive: asBoolean(value.isActive, false),
    sourceArticleIds: Array.isArray(value.sourceArticleIds) ? value.sourceArticleIds.map(asText).filter(Boolean) : [],
    generationModel: asText(value.generationModel),
    generationPromptVersion: asText(value.generationPromptVersion),
    createdAt: asText(value.createdAt),
    updatedAt: asText(value.updatedAt),
    publishedAt: asText(value.publishedAt) || null,
    passageCount: typeof value.passageCount === 'number' ? value.passageCount : null,
    acceptedPassageCount: typeof value.acceptedPassageCount === 'number' ? value.acceptedPassageCount : null,
    relationshipCount: typeof value.relationshipCount === 'number' ? value.relationshipCount : null,
    acceptedRelationshipCount: typeof value.acceptedRelationshipCount === 'number' ? value.acceptedRelationshipCount : null,
  };
}

function normalizeStarfieldPassage(value: unknown): ApiStarfieldPassage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asText(value.id);
  const article = isRecord(value.article) ? value.article : {};
  if (!id) {
    return null;
  }

  return {
    id,
    versionId: asText(value.versionId),
    articleId: asText(value.articleId) || asText(article.id),
    article: {
      id: asText(article.id) || asText(value.articleId),
      slug: asText(article.slug),
      title: asText(article.title) || '未知文章',
      category: asText(article.category) || '未分类',
    },
    title: asText(value.title) || '未命名星点',
    text: asText(value.text),
    excerpt: asText(value.excerpt),
    anchor: asText(value.anchor),
    keywords: Array.isArray(value.keywords) ? value.keywords.map(asText).filter(Boolean) : [],
    status: value.status === 'accepted' || value.status === 'hidden' ? value.status : 'suggested',
    sortOrder: asNumber(value.sortOrder, 0),
    reviewNote: asText(value.reviewNote),
    embeddingRef: asText(value.embeddingRef),
    createdAt: asText(value.createdAt),
    updatedAt: asText(value.updatedAt),
    reviewedAt: asText(value.reviewedAt) || null,
    starSize: asNumber(value.starSize, 1),
    starColorKey: asText(value.starColorKey),
  };
}

function normalizeStarfieldRelationship(value: unknown): ApiStarfieldRelationship | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asText(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    versionId: asText(value.versionId),
    sourcePassageId: asText(value.sourcePassageId),
    targetPassageId: asText(value.targetPassageId),
    relationshipType: normalizeRelationshipType(asText(value.relationshipType)),
    relationshipLabel: asText(value.relationshipLabel),
    rationale: asText(value.rationale),
    evidenceKeywords: Array.isArray(value.evidenceKeywords) ? value.evidenceKeywords.map(asText).filter(Boolean) : [],
    strength: asNumber(value.strength, 1),
    status: value.status === 'accepted' || value.status === 'hidden' ? value.status : 'suggested',
    isCrossArticle: asBoolean(value.isCrossArticle, true),
    reviewNote: asText(value.reviewNote),
    createdAt: asText(value.createdAt),
    updatedAt: asText(value.updatedAt),
    reviewedAt: asText(value.reviewedAt) || null,
  };
}

function normalizeStarfieldCanonicalKeyword(value: unknown): ApiStarfieldCanonicalKeyword | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asText(value.id);
  if (!id) {
    return null;
  }

  return {
    id,
    versionId: asText(value.versionId),
    label: asText(value.label),
    aliases: Array.isArray(value.aliases) ? value.aliases.map(asText).filter(Boolean) : [],
    passageIds: Array.isArray(value.passageIds) ? value.passageIds.map(asText).filter(Boolean) : [],
    createdAt: asText(value.createdAt),
    updatedAt: asText(value.updatedAt),
  };
}

function normalizeAdminStarfieldVersionPayload(value: unknown): ApiAdminStarfieldVersionPayload {
  const payload = isRecord(value) ? value : {};
  return {
    version: normalizeStarfieldVersion(payload.version) ?? {
      id: '',
      name: '',
      status: 'draft',
      isActive: false,
      sourceArticleIds: [],
      generationModel: '',
      generationPromptVersion: '',
      createdAt: '',
      updatedAt: '',
      publishedAt: null,
      passageCount: null,
      acceptedPassageCount: null,
      relationshipCount: null,
      acceptedRelationshipCount: null,
    },
    passages: Array.isArray(payload.passages) ? payload.passages.map(normalizeStarfieldPassage).filter((item): item is ApiStarfieldPassage => item !== null) : [],
    relationships: Array.isArray(payload.relationships) ? payload.relationships.map(normalizeStarfieldRelationship).filter((item): item is ApiStarfieldRelationship => item !== null) : [],
    canonicalKeywords: Array.isArray(payload.canonicalKeywords) ? payload.canonicalKeywords.map(normalizeStarfieldCanonicalKeyword).filter((item): item is ApiStarfieldCanonicalKeyword => item !== null) : [],
    jobs: Array.isArray(payload.jobs)
      ? payload.jobs.map((job) => normalizeStarfieldJob(job))
      : [],
  };
}

function normalizeStarfieldJob(job: unknown): ApiAdminStarfieldVersionPayload['jobs'][number] {
  const record = isRecord(job) ? job : {};
  return {
    id: asText(record.id),
    versionId: asText(record.versionId),
    phase: record.phase === 'passages' || record.phase === 'relationships' ? record.phase : 'passages',
    status: record.status === 'pending' || record.status === 'running' || record.status === 'succeeded' || record.status === 'failed' ? record.status : 'pending',
    selectedArticleIds: Array.isArray(record.selectedArticleIds) ? record.selectedArticleIds.map(asText).filter(Boolean) : [],
    progressCurrent: asNumber(record.progressCurrent, 0),
    progressTotal: asNumber(record.progressTotal, 0),
    currentStep: asText(record.currentStep),
    errorMessage: asText(record.errorMessage),
    createdAt: asText(record.createdAt),
    updatedAt: asText(record.updatedAt),
    completedAt: asText(record.completedAt) || null,
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

function normalizeRelationshipType(value: string): ApiStarfieldRelationship['relationshipType'] {
  return value === 'prerequisite' ||
    value === 'further_reading' ||
    value === 'problem_solution' ||
    value === 'comparison' ||
    value === 'same_topic'
    ? value
    : 'same_topic';
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
