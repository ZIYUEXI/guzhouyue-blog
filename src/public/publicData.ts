import { fetchPublicArticles, normalizeApiPost, requestJson, type ApiSitePayload } from '../apiClient';
import type { Post } from '../posts';
import { isStaticPublic, readSnapshot, type PublicMedia } from '../lib/publicSnapshot';

export type PublicSite = ApiSitePayload & { media?: PublicMedia };

function normalizeItems(payload: unknown[] | { items: unknown[] }) {
  const items = Array.isArray(payload) ? payload : payload.items;
  return items.map(normalizeApiPost).filter((post): post is Post => post !== null);
}

export async function loadArticleIndex() {
  const items = isStaticPublic
    ? normalizeItems(await readSnapshot<{ items: unknown[] }>('index'))
    : normalizeItems(await fetchPublicArticles());
  // 摘要不伪造正文；只有打开详情时才获取完整内容。
  return items.map((post) => ({ ...post, body: [], bodyMarkdown: undefined }));
}

export async function loadArticle(slug: string) {
  const value = isStaticPublic
    ? await readSnapshot<unknown>('article', slug)
    : (await requestJson<{ article: unknown }>(`/api/articles/${encodeURIComponent(slug)}`)).article;
  const post = normalizeApiPost(value);
  if (!post) throw new Error('文章内容无效。');
  return post;
}

export async function loadSearchArticles() {
  return normalizeItems(isStaticPublic
    ? await readSnapshot<{ items: unknown[] }>('search')
    : await fetchPublicArticles());
}
