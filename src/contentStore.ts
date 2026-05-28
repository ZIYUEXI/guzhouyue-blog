import { posts as defaultPosts, type Post } from './posts';

export type NoteSection = {
  category: string;
  description: string;
};

export type FeaturedSeries = {
  id: string;
  title: string;
  lead: string;
  body: string;
  postSlugs: string[];
};

export type GalleryImage = {
  id: string;
  albumId?: string;
  title: string;
  description: string;
  imageUrl: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  capturedAt?: string | null;
  isPublic: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type GalleryAlbum = {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImageId?: string | null;
  coverImageUrl: string;
  isPublic: boolean;
  sortOrder: number;
  imageCount: number;
  createdAt?: string;
  updatedAt?: string;
  images: GalleryImage[];
};

export type HomepageCopy = {
  siteName: string;
  siteTagline: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCta: string;
  secondaryCta: string;
  seasonAuto: boolean;
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

export type AlmanacInfo = {
  date: string;
  weekDay: string;
  lunarYear: string;
  lunarMonth: string;
  lunarDay: string;
  zodiac: string;
  solarTerm: string;
  nextSolarTerm: string;
  nextSolarTermDate: string;
  dayGanzhi: string;
  monthGanzhi: string;
  yearGanzhi: string;
  zodiacClash: string;
  levelName: string;
  goodThings: string[];
  badThings: string[];
  source: string;
};

export type SiteContent = {
  posts: Post[];
  noteSections: NoteSection[];
  featuredSeries: FeaturedSeries[];
  galleryAlbums: GalleryAlbum[];
  homepage: HomepageCopy;
  almanac?: AlmanacInfo | null;
};

export const systemGalleryAlbumId = 'album-moonlight';
export const systemGalleryAlbumSlug = 'system';

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
  seasonAuto: true,
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

export const defaultFeaturedSeries: FeaturedSeries[] = [
  {
    id: 'long-night-volume',
    title: defaultHomepageCopy.seriesTitle,
    lead: defaultHomepageCopy.seriesLead,
    body: defaultHomepageCopy.seriesBody,
    postSlugs: defaultPosts.slice(0, 3).map((post) => post.slug),
  },
];

export const defaultGalleryAlbums: GalleryAlbum[] = [
  {
    id: systemGalleryAlbumId,
    slug: systemGalleryAlbumSlug,
    title: '系统图库',
    description: '维护博客各页面使用的公共图片，不包含文章正文图片。',
    coverImageId: 'image-guzhouyue-hero',
    coverImageUrl: '/images/guzhouyue-hero.png',
    isPublic: true,
    sortOrder: 0,
    imageCount: 3,
    images: [
      {
        id: 'image-guzhouyue-avatar',
        albumId: systemGalleryAlbumId,
        title: '作者头像',
        description: '全站作者信息和文章署名使用的头像。',
        imageUrl: '/images/guzhouyue-avatar.png',
        isPublic: true,
        sortOrder: 0,
        capturedAt: '2026.05.21',
      },
      {
        id: 'image-guzhouyue-hero',
        albumId: systemGalleryAlbumId,
        title: '孤舟月首屏',
        description: '古风月色下的孤舟视觉。',
        imageUrl: '/images/guzhouyue-hero.png',
        isPublic: true,
        sortOrder: 1,
        capturedAt: '2026.05.21',
      },
      {
        id: 'image-guzhouyue-cyber',
        albumId: systemGalleryAlbumId,
        title: '赛博月色',
        description: '另一种更冷亮的站点视觉。',
        imageUrl: '/images/guzhouyue-hero-cyber.png',
        isPublic: true,
        sortOrder: 2,
        capturedAt: '2026.05.21',
      },
    ],
  },
];

export const defaultSiteContent: SiteContent = {
  posts: defaultPosts,
  noteSections: defaultNoteSections,
  featuredSeries: defaultFeaturedSeries,
  galleryAlbums: defaultGalleryAlbums,
  homepage: defaultHomepageCopy,
  almanac: null,
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
  const posts = Array.isArray(content.posts) ? content.posts.map(normalizePost).filter(isPost) : defaultPosts;
  const noteSections = Array.isArray(content.noteSections)
    ? content.noteSections.map(normalizeNoteSection).filter(isNoteSection)
    : defaultNoteSections;
  const homepage = {
    ...defaultHomepageCopy,
    ...(isRecord(content.homepage) ? content.homepage : {}),
    seasonAuto: isRecord(content.homepage) ? asBoolean(content.homepage.seasonAuto, defaultHomepageCopy.seasonAuto) : defaultHomepageCopy.seasonAuto,
  };
  const knownPostSlugs = new Set(posts.map((post) => post.slug));
  const featuredSeries = Array.isArray(content.featuredSeries)
    ? content.featuredSeries.map(normalizeFeaturedSeries).filter(isFeaturedSeries)
    : createDefaultFeaturedSeries(homepage, posts);
  const galleryAlbums = ensureSystemGalleryAlbums(
    Array.isArray(content.galleryAlbums)
      ? content.galleryAlbums.map(normalizeGalleryAlbum).filter(isGalleryAlbum)
      : defaultGalleryAlbums,
  );

  return {
    posts,
    noteSections,
    featuredSeries: featuredSeries.map((series) => ({
      ...series,
      postSlugs: series.postSlugs.filter((slug) => knownPostSlugs.has(slug)),
    })),
    galleryAlbums,
    homepage,
    almanac: normalizeAlmanac(content.almanac),
  };
}

function normalizeAlmanac(value: unknown): AlmanacInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    date: asText(value.date),
    weekDay: asText(value.weekDay),
    lunarYear: asText(value.lunarYear),
    lunarMonth: asText(value.lunarMonth),
    lunarDay: asText(value.lunarDay),
    zodiac: asText(value.zodiac),
    solarTerm: asText(value.solarTerm),
    nextSolarTerm: asText(value.nextSolarTerm),
    nextSolarTermDate: asText(value.nextSolarTermDate),
    dayGanzhi: asText(value.dayGanzhi),
    monthGanzhi: asText(value.monthGanzhi),
    yearGanzhi: asText(value.yearGanzhi),
    zodiacClash: asText(value.zodiacClash),
    levelName: asText(value.levelName),
    goodThings: Array.isArray(value.goodThings) ? value.goodThings.map(asText).filter(Boolean) : [],
    badThings: Array.isArray(value.badThings) ? value.badThings.map(asText).filter(Boolean) : [],
    source: asText(value.source),
  };
}

function normalizePost(post: unknown): Post | null {
  if (!isRecord(post)) {
    return null;
  }

  const title = asText(post.title);
  const fallbackSlug = slugify(title || 'untitled');
  const bodyText = Array.isArray(post.body) ? post.body.map(asText).filter(Boolean) : [];
  const bodyMarkdown = asText(post.bodyMarkdown) || bodyText.join('\n\n') || '这里还没有正文。';
  const tags = Array.isArray(post.tags) ? post.tags.map(asText).filter(Boolean) : [];

  return {
    slug: slugify(asText(post.slug) || fallbackSlug),
    title: title || '未命名文章',
    excerpt: asText(post.excerpt),
    category: asText(post.category) || '人间札记',
    authorName: asText(post.authorName) || asText(post.author),
    date: asText(post.date) || '2026.05.18 00:00',
    tone: asText(post.tone) || 'ink',
    tags,
    body: bodyText.length > 0 ? bodyText : [bodyMarkdown],
    bodyMarkdown,
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

function createDefaultFeaturedSeries(homepage: HomepageCopy, posts: Post[]): FeaturedSeries[] {
  return [
    {
      id: 'homepage-series',
      title: homepage.seriesTitle || defaultHomepageCopy.seriesTitle,
      lead: homepage.seriesLead || defaultHomepageCopy.seriesLead,
      body: homepage.seriesBody || defaultHomepageCopy.seriesBody,
      postSlugs: posts.slice(0, 3).map((post) => post.slug),
    },
  ];
}

function normalizeFeaturedSeries(series: unknown): FeaturedSeries | null {
  if (!isRecord(series)) {
    return null;
  }

  const title = asText(series.title);
  const postSlugs = Array.isArray(series.postSlugs) ? series.postSlugs.map(asText).filter(Boolean) : [];

  if (!title && postSlugs.length === 0) {
    return null;
  }

  return {
    id: slugify(asText(series.id) || title || `series-${Date.now()}`),
    title: title || '未命名专题',
    lead: asText(series.lead),
    body: asText(series.body),
    postSlugs,
  };
}

function isFeaturedSeries(series: FeaturedSeries | null): series is FeaturedSeries {
  return series !== null;
}

function normalizeGalleryAlbum(album: unknown): GalleryAlbum | null {
  if (!isRecord(album)) {
    return null;
  }

  const title = asText(album.title);
  const slug = slugify(asText(album.slug) || title);
  if (!title && !slug) {
    return null;
  }

  const images = Array.isArray(album.images)
    ? album.images.map(normalizeGalleryImage).filter(isGalleryImage)
    : [];

  return {
    id: asText(album.id) || `album-${slug}`,
    slug,
    title: title || '未命名相册',
    description: asText(album.description),
    coverImageId: asText(album.coverImageId) || null,
    coverImageUrl: asText(album.coverImageUrl) || images[0]?.imageUrl || '',
    isPublic: asBoolean(album.isPublic, true),
    sortOrder: asNumber(album.sortOrder, 0),
    imageCount: asNumber(album.imageCount, images.length),
    createdAt: asText(album.createdAt),
    updatedAt: asText(album.updatedAt),
    images,
  };
}

export function ensureSystemGalleryAlbums(albums: GalleryAlbum[]) {
  const systemDefault = defaultGalleryAlbums[0];
  const existingIndex = albums.findIndex((album) => album.id === systemGalleryAlbumId || album.slug === systemGalleryAlbumSlug);

  if (existingIndex < 0) {
    return [systemDefault, ...albums.map((album) => ({ ...album, sortOrder: album.sortOrder + 1 }))];
  }

  return albums.map((album, index) =>
    index === existingIndex
      ? {
          ...album,
          id: systemGalleryAlbumId,
          slug: systemGalleryAlbumSlug,
          title: '系统图库',
          description: album.description || systemDefault.description,
          isPublic: true,
          sortOrder: 0,
          imageCount: ensureSystemGalleryImages(album.images).length,
          images: ensureSystemGalleryImages(album.images),
        }
      : {
          ...album,
          sortOrder: album.sortOrder <= 0 ? album.sortOrder + 1 : album.sortOrder,
        },
  );
}

function ensureSystemGalleryImages(images: GalleryImage[]) {
  const normalizedImages = images.map((image) => ({ ...image, albumId: systemGalleryAlbumId }));
  const existingImageKeys = new Set(
    normalizedImages.flatMap((image) => [image.id, image.imageUrl].filter(Boolean)),
  );
  const missingDefaultImages = defaultGalleryAlbums[0].images.filter(
    (image) => !existingImageKeys.has(image.id) && !existingImageKeys.has(image.imageUrl),
  );

  return [
    ...normalizedImages,
    ...missingDefaultImages.map((image) => ({ ...image, albumId: systemGalleryAlbumId })),
  ];
}

function normalizeGalleryImage(image: unknown): GalleryImage | null {
  if (!isRecord(image)) {
    return null;
  }

  const imageUrl = asText(image.imageUrl);
  if (!imageUrl) {
    return null;
  }

  return {
    id: asText(image.id) || `image-${Date.now()}`,
    albumId: asText(image.albumId),
    title: asText(image.title) || '未命名图片',
    description: asText(image.description),
    imageUrl,
    fileName: asText(image.fileName),
    mimeType: asText(image.mimeType),
    sizeBytes: asNumber(image.sizeBytes, 0),
    capturedAt: asText(image.capturedAt) || null,
    isPublic: asBoolean(image.isPublic, true),
    sortOrder: asNumber(image.sortOrder, 0),
    createdAt: asText(image.createdAt),
    updatedAt: asText(image.updatedAt),
  };
}

function isGalleryAlbum(album: GalleryAlbum | null): album is GalleryAlbum {
  return album !== null;
}

function isGalleryImage(image: GalleryImage | null): image is GalleryImage {
  return image !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function slugify(value: string) {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-');

  return normalizedValue || `post-${Date.now()}`;
}
