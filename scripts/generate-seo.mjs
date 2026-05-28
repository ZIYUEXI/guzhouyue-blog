import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const siteUrl = normalizeSiteUrl(process.env.SITE_URL || 'https://guzhouyue.example.com');
const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');
const postsFile = path.join(rootDir, 'src', 'posts.ts');
const contentStoreFile = path.join(rootDir, 'src', 'contentStore.ts');

const postsSource = await fs.readFile(postsFile, 'utf8');
const contentStoreSource = await fs.readFile(contentStoreFile, 'utf8');
const posts = readExportedLiteral(postsSource, postsFile, 'posts');
const homepage = readExportedLiteral(contentStoreSource, contentStoreFile, 'defaultHomepageCopy');

const now = new Date().toISOString();
const publishedPosts = posts
  .filter((post) => post && typeof post.slug === 'string' && typeof post.title === 'string')
  .map((post) => ({
    ...post,
    url: `${siteUrl}/posts/${encodeURIComponent(post.slug)}`,
    isoDate: parsePostDate(post.date),
    bodyText: Array.isArray(post.body) ? post.body.join('\n\n') : post.bodyMarkdown || '',
  }))
  .sort((left, right) => right.isoDate.localeCompare(left.isoDate));

await fs.mkdir(publicDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(publicDir, 'robots.txt'), renderRobots(siteUrl), 'utf8'),
  fs.writeFile(path.join(publicDir, 'sitemap.xml'), renderSitemap(siteUrl, publishedPosts, now), 'utf8'),
  fs.writeFile(path.join(publicDir, 'rss.xml'), renderRss(siteUrl, homepage, publishedPosts), 'utf8'),
]);

console.log(`Generated robots.txt, sitemap.xml and rss.xml for ${publishedPosts.length} posts.`);

function readExportedLiteral(sourceText, fileName, exportName) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && declaration.initializer) {
        return evaluateLiteral(declaration.initializer);
      }
    }
  }

  throw new Error(`Could not find exported literal "${exportName}" in ${fileName}.`);
}

function evaluateLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(evaluateLiteral);
  }

  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) {
          throw new Error('Only simple object literal properties are supported in SEO source data.');
        }

        return [getPropertyName(property.name), evaluateLiteral(property.initializer)];
      }),
    );
  }

  throw new Error(`Unsupported literal in SEO source data: ${ts.SyntaxKind[node.kind]}`);
}

function getPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  throw new Error('Only simple property names are supported in SEO source data.');
}

function normalizeSiteUrl(value) {
  const parsedUrl = new URL(value);
  return parsedUrl.toString().replace(/\/$/, '');
}

function parsePostDate(value) {
  const text = String(value || '').trim();
  const matchedDate = text.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);

  if (!matchedDate) {
    return new Date().toISOString();
  }

  const [, year, month, day, hour = '0', minute = '0'] = matchedDate;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))).toISOString();
}

function renderRobots(baseUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

function renderSitemap(baseUrl, items, fallbackDate) {
  const staticRoutes = [
    { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${baseUrl}/posts/page/1`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${baseUrl}/notes/page/1`, priority: '0.7', changefreq: 'weekly' },
    { loc: `${baseUrl}/gallery`, priority: '0.7', changefreq: 'weekly' },
    { loc: `${baseUrl}/archive/page/1`, priority: '0.6', changefreq: 'monthly' },
  ];
  const urls = [
    ...staticRoutes.map((route) => ({ ...route, lastmod: fallbackDate })),
    ...items.map((post) => ({
      loc: post.url,
      lastmod: post.isoDate,
      changefreq: 'monthly',
      priority: '0.7',
    })),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) => [
        '  <url>',
        `    <loc>${escapeXml(url.loc)}</loc>`,
        `    <lastmod>${escapeXml(url.lastmod)}</lastmod>`,
        `    <changefreq>${url.changefreq}</changefreq>`,
        `    <priority>${url.priority}</priority>`,
        '  </url>',
      ].join('\n'),
    ),
    '</urlset>',
    '',
  ].join('\n');
}

function renderRss(baseUrl, copy, items) {
  const title = copy.siteName || '孤舟月';
  const description = copy.heroSubtitle || copy.siteTagline || '孤舟月博客';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(baseUrl)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    '    <language>zh-CN</language>',
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${baseUrl}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    ...items.map(
      (post) => [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(post.url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(post.url)}</guid>`,
        `      <pubDate>${new Date(post.isoDate).toUTCString()}</pubDate>`,
        `      <category>${escapeXml(post.category || '')}</category>`,
        `      <description><![CDATA[${cdataSafe(post.excerpt || summarize(post.bodyText))}]]></description>`,
        '    </item>',
      ].join('\n'),
    ),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

function summarize(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 180);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdataSafe(value) {
  return String(value).replaceAll(']]>', ']]]]><![CDATA[>');
}
