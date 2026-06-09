import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.env.TEMP || process.env.TMP || rootDir, 'guzhouyue-blog-backup');
const postsFile = path.join(rootDir, 'src', 'posts.ts');
const contentStoreFile = path.join(rootDir, 'src', 'contentStore.ts');
const databasePath = process.env.DATABASE_PATH || path.join(rootDir, 'server', 'data', 'blog.sqlite');

if (!fs.existsSync(backupDir)) {
  throw new Error(`Backup directory does not exist: ${backupDir}`);
}

const sourceFiles = fs
  .readdirSync(backupDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(md|html)$/i.test(entry.name))
  .map((entry) => path.join(backupDir, entry.name))
  .sort((left, right) => Buffer.from(path.basename(left), 'utf8').compare(Buffer.from(path.basename(right), 'utf8')));

if (sourceFiles.length === 0) {
  throw new Error(`No .md or .html blog files found in ${backupDir}`);
}

const usedSlugs = new Map();
const posts = sourceFiles.map(readBackupPost).sort((left, right) => parseDateMs(right.date) - parseDateMs(left.date));
const categories = Array.from(new Set(posts.map((post) => post.category))).map((category, index) => ({
  category,
  description: describeCategory(category),
  sortOrder: index,
}));

fs.writeFileSync(postsFile, renderPostsFile(posts), 'utf8');
fs.writeFileSync(contentStoreFile, renderContentStore(fs.readFileSync(contentStoreFile, 'utf8'), categories), 'utf8');

syncDatabase(posts, categories);

console.log(`Imported ${posts.length} posts from ${backupDir}`);

function readBackupPost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const extension = path.extname(filePath).toLowerCase();
  const baseTitle = path.basename(filePath, extension);
  const fileStat = fs.statSync(filePath);
  const frontmatter = extension === '.md' ? parseFrontmatter(raw) : { data: {}, body: raw };
  const title = cleanTitle(String(frontmatter.data.title || baseTitle));
  const date = formatDate(frontmatter.data.date || fileStat.mtime);
  const bodyMarkdown = normalizeMarkdown(
    extension === '.html' ? htmlToMarkdown(frontmatter.body) : stripLeadingTitle(frontmatter.body, title),
  );
  const category = inferCategory(title, frontmatter.data.categories, frontmatter.data.tags);
  const tags = normalizeTags(frontmatter.data.tags, title, category);
  const excerpt = summarize(frontmatter.data.excerpt || bodyMarkdown);
  const slug = uniqueSlug(slugify(frontmatter.data.permalink || title));
  const publishedAt = toIsoDate(date);

  return {
    slug,
    title,
    excerpt,
    category,
    authorName: normalizeAuthor(frontmatter.data.author || frontmatter.data.auther),
    date,
    status: 'published',
    publishedAt,
    tone: toneForCategory(category),
    tags,
    body: splitBody(bodyMarkdown),
    bodyMarkdown,
    seoTitle: title,
    seoDescription: excerpt,
    coverImage: normalizeCover(frontmatter.data.cover),
  };
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) {
    return { data: {}, body: raw };
  }

  const endIndex = raw.indexOf('\n---', 3);
  if (endIndex < 0) {
    return { data: {}, body: raw };
  }

  const header = raw.slice(3, endIndex).replace(/\r\n/g, '\n');
  const body = raw.slice(endIndex).replace(/^\n---\r?\n?/, '');
  const data = {};
  const lines = header.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, value] = match;
    if (value.trim()) {
      data[key] = unquoteYaml(value.trim());
      continue;
    }

    const values = [];
    while (index + 1 < lines.length && /^\s*-\s+/.test(lines[index + 1])) {
      index += 1;
      values.push(unquoteYaml(lines[index].replace(/^\s*-\s+/, '').trim()));
    }
    data[key] = values;
  }

  return { data, body };
}

function unquoteYaml(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function htmlToMarkdown(html) {
  let text = html
    .replace(/\r\n/g, '\n')
    .replace(/<pre[^>]*>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_match, codeAttrs, code) => {
      const language = codeAttrs.match(/language-([A-Za-z0-9_-]+)/)?.[1] || '';
      return `\n\n\`\`\`${language}\n${decodeHtml(stripTags(code)).trimEnd()}\n\`\`\`\n\n`;
    })
    .replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
      const src = getHtmlAttr(attrs, 'src');
      const alt = getHtmlAttr(attrs, 'alt') || '图片';
      return src ? `\n\n![${escapeMarkdownAlt(alt)}](${src})\n\n` : '';
    })
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level, content) => `\n\n${'#'.repeat(Number(level))} ${decodeHtml(stripTags(content)).trim()}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content) => `\n- ${decodeHtml(stripTags(content)).trim()}\n`)
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, content) => `\`${decodeHtml(stripTags(content)).trim()}\``)
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs, content) => {
      const href = getHtmlAttr(attrs, 'href');
      const label = decodeHtml(stripTags(content)).trim();
      return href && label ? `[${label}](${href})` : label;
    })
    .replace(/<\/div>/gi, '\n\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');

  return decodeHtml(text);
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, '');
}

function getHtmlAttr(attrs, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i');
  return attrs.match(pattern)?.[1] || '';
}

function decodeHtml(value) {
  const namedEntities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return String(value)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => namedEntities[name] || match);
}

function normalizeMarkdown(markdown) {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripLeadingTitle(markdown, title) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return markdown.replace(new RegExp(`^\\s*#\\s+${escapedTitle}\\s*\\n+`, 'i'), '');
}

function inferCategory(title, categoriesValue, tagsValue) {
  const source = `${title} ${asArray(categoriesValue).join(' ')} ${asArray(tagsValue).join(' ')}`.toLowerCase();

  if (/csrf|shodan|ip|网络|web|安全/.test(source)) return '网络安全';
  if (/unity|ue5|pygame|gym|stable baselines|小球|战斗|游戏|角色/.test(source)) return '游戏开发';
  if (/大语言|扩散|模型|随机森林|xgboost|tabnet|dify|智能体|机器学习|ai/.test(source)) return '人工智能';
  if (/pandas|数据清洗|结构化数据|dataframe|opencv/.test(source)) return '数据分析';
  if (/nexusdb|数据库/.test(source)) return '数据库';
  if (/科目一|错题|扣分/.test(source)) return '生活备考';

  return '技术笔记';
}

function normalizeTags(tagsValue, title, category) {
  const tags = asArray(tagsValue)
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map(mapTag);
  const titleTags = [];

  if (/python|pandas|pygame|opencv/i.test(title)) titleTags.push('Python');
  if (/docker/i.test(title)) titleTags.push('Docker');
  if (/unity/i.test(title)) titleTags.push('Unity');
  if (/ue5/i.test(title)) titleTags.push('UE5');
  if (/csrf/i.test(title)) titleTags.push('CSRF');

  return Array.from(new Set([category, ...tags, ...titleTags])).slice(0, 6);
}

function mapTag(tag) {
  const mappings = {
    'wang-luo': '网络',
    'wang-luo-an-quan': '网络安全',
    docker: 'Docker',
  };

  return mappings[tag] || tag;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function cleanTitle(value) {
  return value.replace(/\u200b/g, '').trim() || '未命名文章';
}

function slugify(value) {
  const source = String(value).split('/').filter(Boolean).pop() || value;
  const slug = source
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || `post-${Date.now()}`;
}

function uniqueSlug(baseSlug) {
  const count = usedSlugs.get(baseSlug) || 0;
  usedSlugs.set(baseSlug, count + 1);
  return count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  const resolved = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (number) => String(number).padStart(2, '0');
  return `${resolved.getFullYear()}.${pad(resolved.getMonth() + 1)}.${pad(resolved.getDate())} ${pad(resolved.getHours())}:${pad(resolved.getMinutes())}`;
}

function toIsoDate(dateLabel) {
  const match = dateLabel.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (!match) return new Date().toISOString();
  const [, year, month, day, hour = '0', minute = '0'] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0).toISOString();
}

function parseDateMs(dateLabel) {
  return new Date(toIsoDate(dateLabel)).getTime();
}

function normalizeAuthor(value) {
  const author = String(value || '').trim();
  return author || '孤舟月';
}

function normalizeCover(value) {
  const cover = String(value || '').trim();
  return cover;
}

function summarize(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/[#>*_`~\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function splitBody(markdown) {
  return markdown.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

function toneForCategory(category) {
  const tones = {
    技术笔记: 'pine',
    网络安全: 'cinnabar',
    游戏开发: 'water',
    人工智能: 'ink',
    数据分析: 'pine',
    数据库: 'water',
    生活备考: 'cinnabar',
  };

  return tones[category] || 'ink';
}

function describeCategory(category) {
  const descriptions = {
    技术笔记: '开发环境、语言基础与工程实践',
    网络安全: 'Web 安全、网络协议与攻防记录',
    游戏开发: 'Unity、UE、Pygame 与玩法系统笔记',
    人工智能: '模型、智能体和数据建模学习',
    数据分析: '数据清洗、Pandas 与结构化处理',
    数据库: '数据库系统与项目文档',
    生活备考: '考试错题和日常整理',
  };

  return descriptions[category] || '归档整理后的旧文';
}

function renderPostsFile(items) {
  return `export type PostStatus = 'draft' | 'published' | 'archived';

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  authorName?: string;
  date: string;
  status?: PostStatus;
  publishedAt?: string | null;
  tone: string;
  tags: string[];
  body: string[];
  bodyMarkdown?: string;
  seoTitle?: string;
  seoDescription?: string;
  coverImage?: string;
  deletedAt?: string;
  syncStatus?: 'synced' | 'local-only';
};

export const posts: Post[] = ${JSON.stringify(items, null, 2)};

export const postsPerPage = 2;

export const archive = posts.reduce<Array<{ month: string; entries: Post[] }>>((months, post) => {
  const [year, month] = post.date.split('.');
  const monthLabel = \`${'${year}'} 年 ${'${Number(month)}'} 月\`;
  const existingMonth = months.find((item) => item.month === monthLabel);

  if (existingMonth) {
    existingMonth.entries.push(post);
  } else {
    months.push({ month: monthLabel, entries: [post] });
  }

  return months;
}, []);

export function getPostBySlug(slug: string) {
  return posts.find((post) => post.slug === slug);
}

export function getAdjacentPosts(slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);

  return {
    previousPost: index > 0 ? posts[index - 1] : undefined,
    nextPost: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}
`;
}

function renderContentStore(source, noteSections) {
  const replacement = `export const defaultNoteSections: NoteSection[] = ${JSON.stringify(
    noteSections.map(({ category, description }) => ({ category, description })),
    null,
    2,
  )};`;

  return source.replace(/export const defaultNoteSections: NoteSection\[] = \[[\s\S]*?\];/, replacement);
}

function syncDatabase(items, noteSections) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM composer_drafts').run();
    db.prepare('DELETE FROM comments').run();
    db.prepare('DELETE FROM featured_series_items').run();
    db.prepare('DELETE FROM featured_series').run();
    db.prepare('DELETE FROM articles').run();
    db.prepare('DELETE FROM note_sections').run();

    const insertSection = db.prepare(`
      INSERT INTO note_sections (id, name, slug, description, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const sectionIds = new Map();
    noteSections.forEach((section) => {
      const id = `section_${slugify(section.category)}`;
      sectionIds.set(section.category, id);
      insertSection.run(id, section.category, slugify(section.category), section.description, section.sortOrder, now, now);
    });

    const insertArticle = db.prepare(`
      INSERT INTO articles (
        id, slug, title, excerpt, category_id, author_name, status, published_at, created_at, updated_at,
        tone, tags_json, body_markdown, seo_title, seo_description, cover_image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    items.forEach((post) => {
      insertArticle.run(
        `article_${post.slug}`,
        post.slug,
        post.title,
        post.excerpt,
        sectionIds.get(post.category) || null,
        post.authorName || '孤舟月',
        post.status || 'published',
        post.publishedAt || toIsoDate(post.date),
        post.publishedAt || now,
        now,
        post.tone,
        JSON.stringify(post.tags),
        post.bodyMarkdown || post.body.join('\n\n'),
        post.seoTitle || post.title,
        post.seoDescription || post.excerpt,
        post.coverImage || '',
      );
    });

    db.prepare(`
      INSERT INTO featured_series (id, title, lead, body, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run('backup-imported-posts', '备份文章精选', '从原博客备份迁移而来的文章。', '按主题整理技术、网络安全、游戏开发和 AI 学习记录。', now, now);

    const insertSeriesItem = db.prepare(`
      INSERT INTO featured_series_items (series_id, article_id, sort_order)
      SELECT 'backup-imported-posts', id, ? FROM articles WHERE slug = ?
    `);
    items.slice(0, 3).forEach((post, index) => insertSeriesItem.run(index, post.slug));
  });

  tx();
  db.close();
}

function escapeMarkdownAlt(value) {
  return String(value).replace(/[\r\n[\]]/g, ' ').trim() || '图片';
}
