import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function publicBootstrapPlugin() {
  return {
    name: 'public-bootstrap',
    transformIndexHtml() {
      if (process.env.VITE_PUBLIC_DATA_SOURCE !== 'static') return [];
      const root = resolve('public');
      const manifestPath = resolve(root, 'data/manifest.json');
      if (!existsSync(manifestPath)) throw new Error('请先导出公开快照，再构建静态前端。');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const site = JSON.parse(readFileSync(resolve(root, '.' + manifest.resources.site), 'utf8'));
      // HTML 内嵌小型配置与版本清单，省去首屏两个串行往返；正文和索引保持独立。
      const tags = [{ tag: 'script', attrs: { id: 'public-bootstrap', type: 'application/json' }, children: JSON.stringify({ manifest, site }).replace(/</g, '\\u003c'), injectTo: 'head' }];
      if (site.media?.hero) {
        const hero = site.media.hero;
        tags.push({ tag: 'link', attrs: { rel: 'preload', as: 'image', href: hero.src, imagesrcset: hero.srcSet, imagesizes: '100vw', fetchpriority: 'high' }, injectTo: 'head' });
      }
      return tags;
    },
  };
}
