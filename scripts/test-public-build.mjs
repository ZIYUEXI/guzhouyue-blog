import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

// 验收实际构建产物的启动依赖与网络预算，避免源码 lazy 被分包规则重新拉回首页。
const root = resolve(process.argv[2] || 'dist');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const visited = new Set();
let totalGzip = 0;
function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const data = readFileSync(file);
  const source = data.toString('utf8');
  totalGzip += gzipSync(data).length;
  assert.ok(!source.includes('WebGLRenderer'), '首页不应包含 Three.js');
  assert.ok(!source.includes('LexicalComposer'), '首页不应包含编辑器实现');
  for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.\/[^"']+\.js)["']/g)) {
    visit(resolve(dirname(file), match[1]));
  }
}
for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) visit(resolve(root, '.' + match[1]));
assert.ok(totalGzip <= 250000, `首页 JS 超出 250 KB 预算：${totalGzip}`);
const bootstrap = JSON.parse(html.match(/<script[^>]+id="public-bootstrap"[^>]*>([\s\S]*?)<\/script>/)[1]);
const object = (url) => readFileSync(resolve(root, '.' + url));
const index = object(bootstrap.manifest.resources.index);
assert.ok(gzipSync(index).length <= 35000, '文章摘要索引超出 35 KB gzip 预算');
for (const item of JSON.parse(index).items) {
  assert.ok(!('body' in item) && !('bodyMarkdown' in item), '首页索引不应包含正文');
  assert.ok(bootstrap.manifest.articles[item.slug], '每篇摘要都应有可读取的正文');
}
assert.ok(object(bootstrap.site.media.hero.src).length <= 150000, '桌面背景超出 150 KB 预算');
assert.ok(object(bootstrap.site.media.avatar).length <= 10000, '头像超出 10 KB 预算');
assert.ok(readFileSync(resolve(root, '_headers'), 'utf8').includes('immutable'));
console.log(JSON.stringify({ startupModules: visited.size, startupGzipBytes: totalGzip, indexGzipBytes: gzipSync(index).length, articles: JSON.parse(index).items.length }));
