import fs from 'node:fs/promises';
import path from 'node:path';

const publicDir = path.join(process.cwd(), 'public');
const requiredFiles = ['robots.txt', 'sitemap.xml', 'rss.xml'];

const files = Object.fromEntries(
  await Promise.all(
    requiredFiles.map(async (fileName) => {
      const filePath = path.join(publicDir, fileName);
      const buffer = await fs.readFile(filePath);
      const text = buffer.toString('utf8');

      if (text.includes('\uFFFD')) {
        throw new Error(`${fileName} contains invalid UTF-8 replacement characters.`);
      }

      return [fileName, text];
    }),
  ),
);

assert(files['robots.txt'].includes('User-agent: *'), 'robots.txt must declare a wildcard user agent.');
assert(files['robots.txt'].includes('Sitemap:'), 'robots.txt must point to sitemap.xml.');
assert(!files['robots.txt'].includes('Disallow: /posts'), 'robots.txt must not block public posts.');

assert(
  files['sitemap.xml'].startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
  'sitemap.xml must declare UTF-8 XML encoding.',
);
assert(files['sitemap.xml'].includes('<urlset'), 'sitemap.xml must contain a urlset.');
assert(countMatches(files['sitemap.xml'], '<loc>') > 0, 'sitemap.xml must contain at least one loc entry.');

assert(
  files['rss.xml'].startsWith('<?xml version="1.0" encoding="UTF-8"?>'),
  'rss.xml must declare UTF-8 XML encoding.',
);
assert(files['rss.xml'].includes('<rss version="2.0"'), 'rss.xml must be an RSS 2.0 document.');
assert(countMatches(files['rss.xml'], '<item>') > 0, 'rss.xml must contain at least one item.');

console.log('SEO files validated.');

function countMatches(value, pattern) {
  return value.split(pattern).length - 1;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
