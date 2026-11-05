export type PublicMedia = {
  hero?: { src: string; srcSet: string; width: number; height: number };
  avatar?: string;
};

export type SnapshotManifest = {
  version: number;
  revision: string;
  resources: Record<string, string>;
  articles: Record<string, string>;
};

type Bootstrap = { manifest: SnapshotManifest; site: Record<string, unknown> & { media?: PublicMedia } };

// 同一页面会话固定使用同一份发布清单，正文与搜索不会混用不同发布版本。
const bootstrapElement = typeof document === 'undefined' ? null : document.getElementById('public-bootstrap');
export const publicBootstrap: Bootstrap | null = bootstrapElement?.textContent
  ? JSON.parse(bootstrapElement.textContent) as Bootstrap : null;
let manifestPromise: Promise<SnapshotManifest> | undefined;
const resourceCache = new Map<string, Promise<unknown>>();

export class SnapshotNotFoundError extends Error {}

export async function snapshotManifest() {
  if (publicBootstrap) return publicBootstrap.manifest;
  manifestPromise ??= fetch('/data/manifest.json', { cache: 'no-cache' }).then(async (response) => {
    if (!response.ok) throw new Error('公开内容版本读取失败，请重试。');
    return response.json() as Promise<SnapshotManifest>;
  }).catch((error) => { manifestPromise = undefined; throw error; });
  return manifestPromise;
}

export async function readSnapshot<T>(key: string, articleSlug?: string): Promise<T> {
  if (key === 'site' && publicBootstrap) return publicBootstrap.site as T;
  const manifest = await snapshotManifest();
  const path = articleSlug ? manifest.articles[articleSlug] : manifest.resources[key];
  if (!path) throw new SnapshotNotFoundError(articleSlug ? '文章不存在或尚未发布。' : '公开内容文件不存在。');
  let pending = resourceCache.get(path);
  if (!pending) {
    pending = fetch(path).then(async (response) => {
      if (!response.ok) throw new Error('内容加载失败，请重试。');
      return response.json();
    }).catch((error) => { resourceCache.delete(path); throw error; });
    resourceCache.set(path, pending);
  }
  return pending as Promise<T>;
}

export const isStaticPublic = import.meta.env.VITE_PUBLIC_DATA_SOURCE === 'static';
