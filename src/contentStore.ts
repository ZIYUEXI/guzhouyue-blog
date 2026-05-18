import { posts as defaultPosts, type Post } from './posts';

export type NoteSection = {
  category: string;
  description: string;
};

export type HomepageCopy = {
  siteName: string;
  siteTagline: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCta: string;
  secondaryCta: string;
  seasonTitle: string;
  seasonText: string;
  latestEyebrow: string;
  latestTitle: string;
  topicsEyebrow: string;
  topicsTitle: string;
  seriesEyebrow: string;
  seriesTitle: string;
  seriesLead: string;
  seriesBody: string;
  archiveEyebrow: string;
  archiveTitle: string;
  aboutEyebrow: string;
  aboutTitle: string;
  aboutBody: string;
  footerSlogan: string;
};

export type SiteContent = {
  posts: Post[];
  noteSections: NoteSection[];
  homepage: HomepageCopy;
};

export const defaultNoteSections: NoteSection[] = [
  { category: '人间札记', description: '生活里照见的月色' },
  { category: '技术笔记', description: '把复杂事写清楚' },
  { category: '读书摘录', description: '纸页里的回声' },
  { category: '山水游踪', description: '路过风、桥与旧城' },
  { category: '旧文归档', description: '那些仍会发光的日子' },
];

export const defaultHomepageCopy: HomepageCopy = {
  siteName: '孤舟月',
  siteTagline: '一叶孤舟，照见人间月色',
  heroTitle: '孤舟月',
  heroSubtitle: '写给长夜、山河与代码的私人札记。',
  primaryCta: '读最新文章',
  secondaryCta: '查看归档',
  seasonTitle: '今日 · 小满前',
  seasonText: '宜：读书、夜行、写字',
  latestEyebrow: 'Latest',
  latestTitle: '近来所写',
  topicsEyebrow: 'Topics',
  topicsTitle: '沿水而行',
  seriesEyebrow: 'Series',
  seriesTitle: '长夜一卷',
  seriesLead: '从一篇文章开始，慢慢读完整个月亮。',
  seriesBody: '这里会收束长文、系列和持续更新的专题，把散落的札记整理成可以一路读下去的路径。',
  archiveEyebrow: 'Archive',
  archiveTitle: '旧日可寻',
  aboutEyebrow: 'About',
  aboutTitle: '关于孤舟月',
  aboutBody:
    '这里先是一处前端完整的静态博客入口，后续可以接入文章 API、Markdown 渲染、RSS、归档检索和后台编辑。现在的重点，是让站点先拥有清晰的气质、结构和交互。',
  footerSlogan: '孤舟泊处，月色自来。',
};

export const defaultSiteContent: SiteContent = {
  posts: defaultPosts,
  noteSections: defaultNoteSections,
  homepage: defaultHomepageCopy,
};

const siteContentStorageKey = 'guzhouyue.siteContent';

export function readSiteContent(): SiteContent {
  if (typeof window === 'undefined') {
    return defaultSiteContent;
  }

  const storedContent = window.localStorage.getItem(siteContentStorageKey);
  if (!storedContent) {
    return defaultSiteContent;
  }

  try {
    const parsedContent = JSON.parse(storedContent) as Partial<SiteContent>;
    return normalizeSiteContent(parsedContent);
  } catch {
    return defaultSiteContent;
  }
}

export function saveSiteContent(content: SiteContent) {
  window.localStorage.setItem(siteContentStorageKey, JSON.stringify(content));
}

export function resetSiteContent() {
  window.localStorage.removeItem(siteContentStorageKey);
  return defaultSiteContent;
}

function normalizeSiteContent(content: Partial<SiteContent>): SiteContent {
  return {
    posts: Array.isArray(content.posts) ? content.posts.map(normalizePost).filter(isPost) : defaultPosts,
    noteSections: Array.isArray(content.noteSections)
      ? content.noteSections.map(normalizeNoteSection).filter(isNoteSection)
      : defaultNoteSections,
    homepage: {
      ...defaultHomepageCopy,
      ...(isRecord(content.homepage) ? content.homepage : {}),
    },
  };
}

function normalizePost(post: unknown): Post | null {
  if (!isRecord(post)) {
    return null;
  }

  const title = asText(post.title);
  const fallbackSlug = slugify(title || 'untitled');
  const bodyText = Array.isArray(post.body) ? post.body.map(asText).filter(Boolean) : [];
  const tags = Array.isArray(post.tags) ? post.tags.map(asText).filter(Boolean) : [];

  return {
    slug: slugify(asText(post.slug) || fallbackSlug),
    title: title || '未命名文章',
    excerpt: asText(post.excerpt),
    category: asText(post.category) || '人间札记',
    date: asText(post.date) || '2026.05.18',
    readingTime: asText(post.readingTime) || '3 分钟读完',
    tone: asText(post.tone) || 'ink',
    tags,
    body: bodyText.length > 0 ? bodyText : ['这里还没有正文。'],
  };
}

function isPost(post: Post | null): post is Post {
  return post !== null;
}

function normalizeNoteSection(section: unknown): NoteSection | null {
  if (!isRecord(section)) {
    return null;
  }

  const category = asText(section.category);
  if (!category) {
    return null;
  }

  return {
    category,
    description: asText(section.description),
  };
}

function isNoteSection(section: NoteSection | null): section is NoteSection {
  return section !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : '';
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
