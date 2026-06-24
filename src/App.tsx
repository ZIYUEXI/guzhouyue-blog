import {
  Bot,
  CalendarDays,
  ChevronRight,
  Code2,
  Columns2,
  Eye,
  FileText,
  Feather,
  Focus,
  GitBranch,
  Heading2,
  Keyboard,
  List,
  ListOrdered,
  Menu,
  MessageCircle,
  Moon,
  Pencil,
  Plus,
  Quote,
  Search,
  Settings,
  Sigma,
  Send,
  Save,
  Image as ImageIcon,
  Orbit,
  SquareTerminal,
  Sun,
  Table2,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react';
import { ArticleComments } from './ArticleComments';
import { AdminCommandPanel } from './AdminCommandPanel';
import { AdminDashboardPanel } from './AdminDashboardPanel';
import { AdminPostsPanel } from './AdminPostsPanel';
import { AdminStarfieldPanel } from './AdminStarfieldPanel';
import { AdminTagsPanel } from './AdminTagsPanel';
import { useArticleHead } from './articleSeo';
import { MarkdownBody } from './MarkdownBody';
import { PublicGalleryPage } from './PublicGalleryPage';
import { StarfieldPage } from './StarfieldPage';
import type { RichMarkdownEditorHandle } from './RichMarkdownEditor';
import {
  defaultSiteContent,
  emptySiteContent,
  ensureSystemGalleryAlbums,
  readSiteContent,
  resetSiteContent,
  saveSiteContent,
  type HomepageCopy,
  type FeaturedSeries,
  type GalleryAlbum,
  type GalleryImage,
  type NoteSection,
  type SiteContent,
  type AlmanacInfo,
  systemGalleryAlbumId,
  systemGalleryAlbumSlug,
} from './contentStore';
import { createSeasonNote } from './seasonNote';
import { getRoute, isAdminPath } from './routing';
import {
  clearAdminDraft,
  createAdminArticle,
  deleteAdminArticle,
  deleteAdminTag,
  fetchAdminContent,
  fetchAdminComments,
  fetchAdminDraft,
  fetchAdminTags,
  fetchAdminLlmConfig,
  fetchAdminLlmTokenUsage,
  fetchAdminMe,
  createAdminGalleryAlbum,
  deleteAdminGalleryAlbum,
  deleteAdminGalleryImage,
  fetchPublicArticles,
  fetchPublicGallery,
  fetchPublicSite,
  generateAdminArticleMetadata,
  fetchAdminDeletedArticles,
  fetchPublicStarfield,
  loginAdmin,
  logoutAdmin,
  mergeAdminTags,
  normalizeApiFeaturedSeries,
  normalizeApiGalleryAlbum,
  normalizeApiGalleryAlbums,
  normalizeApiNoteSections,
  normalizeApiPost,
  publishAdminArticle,
  replaceAdminGalleryImageFile,
  restoreAdminArticle,
  saveAdminDraft,
  saveAdminFeaturedSeries,
  saveAdminHomepage,
  saveAdminLlmConfig,
  saveAdminNoteSections,
  saveAdminSettings,
  testAdminLlmConnection,
  unpublishAdminArticle,
  updateAdminArticle,
  updateAdminCommentStatus,
  updateAdminGalleryAlbum,
  updateAdminGalleryImage,
  uploadAdminGalleryImage,
  ApiError,
  type AdminCommentStatus,
  type ApiArticleMetadataSuggestion,
  type ApiAdminComment,
  type ApiLlmConnectionTestResult,
  type ApiLlmConfig,
  type ApiLlmTokenUsagePayload,
  type LlmProvider,
} from './apiClient';
import {
  applySiteSettings,
  colorSchemes,
  readSiteSettings,
  readUserColorScheme,
  saveSiteSettings,
  saveUserColorScheme,
  stylePresetAssets,
  stylePresets,
  systemGalleryAssetUrls,
  type ColorScheme,
  type SiteSettings,
  type StylePreset,
  normalizeOwnerName,
  normalizeOwnerAvatarUrl,
} from './siteSettings';
import { postsPerPage, type Post, type PostStatus } from './posts';
import 'katex/dist/katex.min.css';

const RichMarkdownEditor = lazy(() =>
  import('./RichMarkdownEditor').then((module) => ({ default: module.RichMarkdownEditor })),
);

const navItems = [
  { label: '首页', href: '/#首页' },
  { label: '文章', href: '/posts/page/1' },
  { label: '札记', href: '/notes/page/1' },
  { label: '归档', href: '/archive/page/1' },
  { label: '图库', href: '/gallery' },
  { label: '星图', href: '/starfield' },
  { label: '关于', href: '/#关于' },
];

const homepageArchivePreviewLimit = 4;
const homepageArchiveEntriesPerMonthLimit = 6;
const adminPostsPerPage = 8;
const adminSeriesPerPage = 1;
const composerImageAlbumSlug = 'article-images';
const composerImageAlbumTitle = '文章配图';
const supportedComposerImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function makeClientId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isProductionPublicRuntime() {
  const viteEnv = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env;
  if (!viteEnv?.PROD || typeof window === 'undefined') {
    return false;
  }

  return !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function readInitialSiteContent() {
  return emptySiteContent;
}

function App() {
  const [, setLocationVersion] = useState(0);
  const [settings, setSettings] = useState<SiteSettings>(() => readSiteSettings());
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => readUserColorScheme());
  const [content, setContent] = useState<SiteContent>(() => readInitialSiteContent());
  const [adminAuthStatus, setAdminAuthStatus] = useState<'checking' | 'authenticated' | 'anonymous'>('checking');
  const [adminContentStatus, setAdminContentStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(false);
  const [dataSourceNotice, setDataSourceNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const category = searchParams.get('category');
  const tag = searchParams.get('tag');
  const isAdminRoute = isAdminPath(pathname);

  useEffect(() => {
    function handleLocationChange() {
      setLocationVersion((version) => version + 1);
    }

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  useEffect(() => {
    applySiteSettings(settings, colorScheme);
  }, [settings, colorScheme]);

  useEffect(() => {
    let cancelled = false;

    if (isAdminRoute) {
      setOwnerAuthenticated(false);
      return () => {
        cancelled = true;
      };
    }

    async function checkOwnerSession() {
      try {
        await fetchAdminMe();
        if (!cancelled) {
          setOwnerAuthenticated(true);
        }
      } catch {
        if (!cancelled) {
          setOwnerAuthenticated(false);
        }
      }
    }

    checkOwnerSession();
    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  useEffect(() => {
    let cancelled = false;

    async function loadSiteData() {
      try {
        if (isAdminRoute) {
          setAdminContentStatus('loading');
          await fetchAdminMe();
          if (cancelled) {
            return;
          }
          setAdminAuthStatus('authenticated');

          const adminContent = await fetchAdminContent();
          if (cancelled) {
            return;
          }

          const nextContent = normalizeLoadedContent(adminContent, content);
          setContent(nextContent);
          saveSiteContent(nextContent);
          setDataSourceNotice('');

          const nextSettings = normalizeLoadedSettings(adminContent.settings, settings);
          setSettings(nextSettings);
          saveSiteSettings(nextSettings);
          setAdminContentStatus('ready');
          return;
        }

        setAdminAuthStatus('anonymous');

        const [sitePayload, articleItems, galleryItems] = await Promise.all([
          fetchPublicSite(),
          fetchPublicArticles(),
          fetchPublicGallery(),
        ]);
        if (cancelled) {
          return;
        }

        const posts = articleItems.map(normalizeApiPost).filter((post): post is Post => post !== null);
        const noteSections = normalizeApiNoteSections(sitePayload.noteSections);
        const featuredSeries = normalizeApiFeaturedSeries(sitePayload.featuredSeries);
        const galleryAlbums = normalizeApiGalleryAlbums(galleryItems);
        const nextContent: SiteContent = {
          posts,
          noteSections,
          featuredSeries,
          galleryAlbums,
          almanac: sitePayload.almanac ?? null,
          homepage: {
            ...defaultSiteContent.homepage,
            ...(sitePayload.homepage ?? {}),
          },
        };
        const nextSettings = normalizeLoadedSettings(sitePayload.settings, settings);

        setContent(nextContent);
        setSettings(nextSettings);
        setDataSourceNotice('');
        saveSiteSettings(nextSettings);
      } catch {
        if (isAdminRoute && !cancelled) {
          setAdminAuthStatus('anonymous');
          setAdminContentStatus('error');
        }
        if (!cancelled && !isAdminRoute) {
          setDataSourceNotice('暂时无法连接数据库内容接口，文章、分类和标签未加载。');
        }
      }
    }

    loadSiteData();
    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  function updateSettings(nextSettings: SiteSettings) {
    setSettings(nextSettings);
    saveSiteSettings(nextSettings);
    if (isAdminRoute) {
      void saveAdminSettings(nextSettings).catch(() => {
        saveSiteSettings(nextSettings);
      });
    }
  }

  function updateColorScheme(nextColorScheme: ColorScheme) {
    setColorScheme(nextColorScheme);
    saveUserColorScheme(nextColorScheme);
  }

  function updateContent(nextContent: SiteContent) {
    setContent(nextContent);
    saveSiteContent(nextContent);
  }

  const publicPosts = useMemo(() => getPublishedPosts(content.posts), [content.posts]);
  const filteredPosts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return publicPosts;
    }

    return publicPosts.filter((post) => {
      const searchableText = `${post.title}${post.excerpt}${post.category}${post.tags.join('')}${getPostMarkdown(post)}`;
      return searchableText.toLowerCase().includes(keyword);
    });
  }, [publicPosts, query]);
  const activeSystemGalleryImages = useMemo(() => getSystemGalleryImageUrls(content.galleryAlbums), [content.galleryAlbums]);
  const heroImage = activeSystemGalleryImages[settings.stylePreset] ?? stylePresetAssets[settings.stylePreset].heroImage;
  const ownerAvatarUrl = getActiveOwnerAvatarUrl(settings.ownerAvatarUrl, activeSystemGalleryImages);

  if (isAdminRoute) {
    if (adminAuthStatus !== 'authenticated') {
      return (
        <AdminLoginPage
          homepage={content.homepage}
        settings={settings}
        colorScheme={colorScheme}
        status={adminAuthStatus}
          onLoginSuccess={() => {
            setAdminAuthStatus('authenticated');
            window.location.reload();
          }}
        onThemeToggle={() => updateColorScheme(colorScheme === 'light' ? 'dark' : 'light')}
        />
      );
    }

    return (
      <AdminPage
        content={content}
        colorScheme={colorScheme}
        settings={settings}
        onContentChange={updateContent}
        onLogout={() => setAdminAuthStatus('anonymous')}
        onSettingsChange={updateSettings}
        onColorSchemeChange={updateColorScheme}
        contentStatus={adminContentStatus}
      />
    );
  }

  const route = getRoute(pathname);

  return (
    <div className="site-shell">
      <SiteHeader
        homepage={content.homepage}
        colorScheme={colorScheme}
        ownerAuthenticated={ownerAuthenticated}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((value) => !value)}
        onColorSchemeToggle={() => updateColorScheme(colorScheme === 'light' ? 'dark' : 'light')}
        onSearchOpen={() => setSearchOpen(true)}
      />
      {menuOpen && (
        <nav className="mobile-drawer" id="mobile-navigation" aria-label="移动端导航">
          {navItems.map((item) => (
            <a href={item.href} key={item.label} onClick={() => setMenuOpen(false)}>
              {item.label}
            </a>
          ))}
          {ownerAuthenticated && (
            <a href="/admin" onClick={() => setMenuOpen(false)}>
              后台
            </a>
          )}
        </nav>
      )}

      {dataSourceNotice && <p className="data-source-notice" role="status">{dataSourceNotice}</p>}

      <main>
        {route.name === 'home' && (
          <>
            <HomePage content={content} heroImage={heroImage} />
            <div className="home-content-background">
              <HomeContent content={content} ownerAvatarUrl={ownerAvatarUrl} ownerName={settings.ownerName} />
              <SiteFooter homepage={content.homepage} ownerAvatarUrl={ownerAvatarUrl} ownerName={settings.ownerName} />
            </div>
          </>
        )}
        {route.name === 'posts' && (
          <AllPostsPage category={category} currentPage={route.page} posts={publicPosts} tag={tag} />
        )}
        {route.name === 'notes' && (
          <AllNotesPage currentPage={route.page} noteSections={content.noteSections} posts={publicPosts} />
        )}
        {route.name === 'archive' && <AllArchivePage currentPage={route.page} posts={publicPosts} />}
        {route.name === 'gallery' && <PublicGalleryPage albums={content.galleryAlbums} />}
        {route.name === 'starfield' && <StarfieldPage />}
        {route.name === 'post' && <PostDetailPage ownerAvatarUrl={ownerAvatarUrl} posts={publicPosts} slug={route.slug} />}
        {route.name === 'not-found' && <NotFoundPage />}
      </main>

      {route.name !== 'home' && (
        <SiteFooter homepage={content.homepage} ownerAvatarUrl={ownerAvatarUrl} ownerName={settings.ownerName} />
      )}

      {searchOpen && (
        <SearchCommand
          quickLinks={buildSearchQuickLinks(publicPosts)}
          query={query}
          results={filteredPosts}
          onQueryChange={setQuery}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </div>
  );
}

function AdminLoginPage({
  homepage,
  colorScheme,
  onLoginSuccess,
  onThemeToggle,
  settings,
  status,
}: {
  homepage: HomepageCopy;
  colorScheme: ColorScheme;
  onLoginSuccess: () => void;
  onThemeToggle: () => void;
  settings: SiteSettings;
  status: 'checking' | 'authenticated' | 'anonymous';
}) {
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<'idle' | 'submitting' | 'invalid-password' | 'service-error'>('idle');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPassword = password.trim();
    if (!nextPassword || loginStatus === 'submitting') {
      return;
    }

    setLoginStatus('submitting');
    try {
      await loginAdmin(nextPassword);
      onLoginSuccess();
    } catch (error) {
      setLoginStatus(error instanceof ApiError && error.status === 401 ? 'invalid-password' : 'service-error');
    }
  }

  return (
    <div className="site-shell admin-shell">
      <header className="site-header admin-header">
        <a className="brand" href="/" aria-label={`返回${homepage.siteName}首页`}>
          <span>{homepage.siteName}</span>
          <small>{homepage.siteTagline}</small>
        </a>
        <nav className="desktop-nav" aria-label="登录导航">
          <a href="/">返回首页</a>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={onThemeToggle}
            aria-label="切换明暗模式"
          >
            {colorScheme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
          </button>
        </div>
      </header>

      <main className="admin-login-main">
        <section className="admin-login-panel" aria-label="管理登录">
          <SectionHeading eyebrow="Login" title="登录管理台" />
          <form className="admin-login-form" onSubmit={handleSubmit}>
            <label>
              管理密码
              <input
                autoComplete="current-password"
                autoFocus
                disabled={status === 'checking'}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (loginStatus === 'invalid-password' || loginStatus === 'service-error') {
                    setLoginStatus('idle');
                  }
                }}
                placeholder={status === 'checking' ? '正在检查登录状态' : '输入管理密码'}
                type="password"
                value={password}
              />
            </label>
            {loginStatus === 'invalid-password' && <p role="alert">密码不正确，请重新输入。</p>}
            {loginStatus === 'service-error' && <p role="alert">后台服务暂时无法完成登录，请确认后端已启动后再试。</p>}
            <button disabled={status === 'checking' || loginStatus === 'submitting'} type="submit">
              {loginStatus === 'submitting' ? '登录中' : '登录'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

type ArchiveGroup = {
  month: string;
  entries: Post[];
};

function buildArchive(posts: Post[]): ArchiveGroup[] {
  return sortPosts(posts).reduce<ArchiveGroup[]>((months, post) => {
    const [year, month] = post.date.split('.');
    const monthLabel = `${year} 年 ${Number(month)} 月`;
    const existingMonth = months.find((item) => item.month === monthLabel);

    if (existingMonth) {
      existingMonth.entries.push(post);
    } else {
      months.push({ month: monthLabel, entries: [post] });
    }

    return months;
  }, []);
}

function sortPosts(posts: Post[]) {
  return [...posts].sort((firstPost, secondPost) => parsePostDate(secondPost.date) - parsePostDate(firstPost.date));
}

function parsePostDate(date: string) {
  const [datePart = '', timePart = '00:00'] = date.trim().split(/\s+/);
  const [year = '0', month = '1', day = '1'] = datePart.split('.');
  const [hour = '0', minute = '0'] = timePart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

function getPostBySlug(posts: Post[], slug: string) {
  return posts.find((post) => post.slug === slug);
}

function getAdjacentPosts(posts: Post[], slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);

  return {
    previousPost: index > 0 ? posts[index - 1] : undefined,
    nextPost: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

function getAdminEditPostSlug(pathname: string) {
  const editMatch = pathname.match(/^\/admin\/posts\/([^/]+)\/edit$/);
  return editMatch ? decodeURIComponent(editMatch[1]) : undefined;
}

function formatToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day} ${hour}:${minute}`;
}

function formatDeletedAt(value?: string) {
  if (!value) {
    return '删除时间未知';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '删除时间未知';
  }

  return `删除于 ${new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
}

const postStatusLabels: Record<PostStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

const commentStatusLabels: Record<AdminCommentStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

function getPostStatus(post: Post): PostStatus {
  return post.status ?? 'published';
}

function getPostStatusLabel(post: Post) {
  return postStatusLabels[getPostStatus(post)];
}

function getPublishedPosts(posts: Post[]) {
  return posts.filter((post) => getPostStatus(post) === 'published');
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getPostArchiveMonthValue(post: Post) {
  const [year = '', month = ''] = post.date.split(/[.\s]/);
  if (!year || !month) {
    return '';
  }

  return `${year}-${month.padStart(2, '0')}`;
}

function getArchiveMonthLabel(monthValue: string) {
  const [year = '', month = ''] = monthValue.split('-');
  if (!year || !month) {
    return '未选择月份';
  }

  return `${year} 年 ${Number(month)} 月`;
}

function movePostToArchiveMonth(post: Post, monthValue: string): Post {
  const [targetYearText, targetMonthText] = monthValue.split('-');
  const targetYear = Number(targetYearText);
  const targetMonth = Number(targetMonthText);
  if (!targetYear || !targetMonth) {
    return post;
  }

  const [datePart = '', timePart = ''] = post.date.trim().split(/\s+/);
  const [, , dayText = '1'] = datePart.split('.');
  const targetDay = Math.min(Math.max(Number(dayText) || 1, 1), new Date(targetYear, targetMonth, 0).getDate());
  const [hourText = '0', minuteText = '0'] = timePart.split(':');
  const hour = Number(hourText) || 0;
  const minute = Number(minuteText) || 0;
  const pad = (value: number) => String(value).padStart(2, '0');
  const nextDate = `${targetYear}.${pad(targetMonth)}.${pad(targetDay)}${timePart ? ` ${pad(hour)}:${pad(minute)}` : ''}`;
  const nextPublishedAt = new Date(targetYear, targetMonth - 1, targetDay, hour, minute).toISOString();

  return {
    ...post,
    date: nextDate,
    publishedAt: nextPublishedAt,
  };
}

function slugifyPostTitle(value: string) {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalizedValue || `post-${Date.now()}`;
}

function createUniqueSlug(posts: Post[], slug: string, currentSlug?: string) {
  const baseSlug = slugifyPostTitle(slug);
  const existingSlugs = new Set(posts.filter((post) => post.slug !== currentSlug).map((post) => post.slug));

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let index = 2;
  let nextSlug = `${baseSlug}-${index}`;

  while (existingSlugs.has(nextSlug)) {
    index += 1;
    nextSlug = `${baseSlug}-${index}`;
  }

  return nextSlug;
}

function normalizeTag(value: string) {
  return value.trim().replace(/^#/, '');
}

function normalizeTags(values: string[]) {
  return values.reduce<string[]>((tags, value) => {
    const tag = normalizeTag(value);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }

    return tags;
  }, []);
}

function splitTagInput(value: string) {
  return normalizeTags(value.split(/[，,\n]/));
}

function collectExistingTags(posts: Post[]) {
  return normalizeTags(posts.flatMap((post) => post.tags));
}

function buildLocalAdminTags(posts: Post[]) {
  const stats = new Map<string, { name: string; articleCount: number; occurrenceCount: number }>();
  posts.forEach((post) => {
    const seenTags = new Set<string>();
    post.tags.forEach((tagName) => {
      const tag = normalizeTag(tagName);
      if (!tag) {
        return;
      }

      const tagStats = stats.get(tag) ?? { name: tag, articleCount: 0, occurrenceCount: 0 };
      tagStats.occurrenceCount += 1;
      if (!seenTags.has(tag)) {
        tagStats.articleCount += 1;
        seenTags.add(tag);
      }
      stats.set(tag, tagStats);
    });
  });

  return Array.from(stats.values()).sort((firstTag, secondTag) =>
    secondTag.articleCount - firstTag.articleCount || firstTag.name.localeCompare(secondTag.name),
  );
}

function getPostMarkdown(post: Post) {
  return post.bodyMarkdown?.trim() || post.body.join('\n\n') || '这里还没有正文。';
}

function normalizeMarkdown(value: string) {
  return value.trim() || '这里还没有正文。';
}

function normalizeLooseCodeFences(markdown: string) {
  const lines = markdown.split('\n');
  const normalizedLines: string[] = [];
  let index = 0;

  const fencePattern = /^((?:\\`|`){3})\s*([\w-]+)?\s*$/;
  const unescapeFence = (value: string) => value.replace(/\\`/g, '`');

  while (index < lines.length) {
    const openingMatch = lines[index].match(fencePattern);
    const openingLanguage = openingMatch?.[2];

    if (!openingMatch || !openingLanguage) {
      normalizedLines.push(lines[index]);
      index += 1;
      continue;
    }

    const closingIndex = lines.findIndex((line, lineIndex) => {
      if (lineIndex <= index) {
        return false;
      }

      const closingMatch = line.match(fencePattern);
      return Boolean(closingMatch && !closingMatch[2]);
    });

    if (closingIndex < 0) {
      normalizedLines.push(lines[index]);
      index += 1;
      continue;
    }

    normalizedLines.push(`\`\`\`${openingLanguage}`);
    normalizedLines.push(...lines.slice(index + 1, closingIndex).map(unescapeFence));
    normalizedLines.push('```');
    index = closingIndex + 1;

    let lookaheadIndex = index;
    while (lines[lookaheadIndex] === '') {
      lookaheadIndex += 1;
    }

    const nextOpening = lines[lookaheadIndex]?.match(fencePattern);
    if (nextOpening?.[2]) {
      let nextClosingIndex = lookaheadIndex + 1;
      while (lines[nextClosingIndex] === '') {
        nextClosingIndex += 1;
      }

      const nextClosing = lines[nextClosingIndex]?.match(fencePattern);
      if (nextClosing && !nextClosing[2]) {
        index = nextClosingIndex + 1;
      }
    }
  }

  return normalizedLines.join('\n');
}

type ComposerMode = 'wysiwyg' | 'markdown' | 'split';
type FormulaMode = 'block' | 'inline';
type DraftStatus = 'clean' | 'dirty' | 'saving' | 'draft-saved' | 'local-draft-saved' | 'published';

type ComposerDraft = {
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
  composerMode: ComposerMode;
  savedAt: string;
};

type ComposerDraftData = Omit<ComposerDraft, 'savedAt'>;

type OutlineItem = {
  id: string;
  lineIndex: number;
  level: number;
  title: string;
  warning?: string;
};

function getComposerDraftKey(slug?: string) {
  return `guzhouyue.composerDraft:${slug || 'new'}`;
}

function readComposerDraft(key: string): ComposerDraft | null {
  try {
    const rawDraft = window.localStorage.getItem(key);
    if (!rawDraft) {
      return null;
    }

    const parsedDraft = JSON.parse(rawDraft) as Partial<ComposerDraft>;
    if (typeof parsedDraft.bodyMarkdown !== 'string') {
      return null;
    }

    return {
      title: parsedDraft.title || '',
      slug: parsedDraft.slug || '',
      category: parsedDraft.category || '',
      date: parsedDraft.date || '',
      status:
        parsedDraft.status === 'draft' || parsedDraft.status === 'archived' || parsedDraft.status === 'published'
          ? parsedDraft.status
          : 'published',
      publishedAt: typeof parsedDraft.publishedAt === 'string' ? parsedDraft.publishedAt : null,
      tone: parsedDraft.tone || 'ink',
      excerpt: parsedDraft.excerpt || '',
      tags: Array.isArray(parsedDraft.tags) ? normalizeTags(parsedDraft.tags) : splitTagInput(String(parsedDraft.tags || '')),
      bodyMarkdown: parsedDraft.bodyMarkdown,
      seoTitle: parsedDraft.seoTitle || '',
      seoDescription: parsedDraft.seoDescription || '',
      coverImage: parsedDraft.coverImage || '',
      composerMode:
        parsedDraft.composerMode === 'markdown' || parsedDraft.composerMode === 'split'
          ? parsedDraft.composerMode
          : 'wysiwyg',
      savedAt: parsedDraft.savedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeComposerDraft(key: string, draft: ComposerDraft) {
  window.localStorage.setItem(key, JSON.stringify(draft));
}

function clearComposerDraft(key: string) {
  window.localStorage.removeItem(key);
}

function createComposerSnapshot(data: ComposerDraftData) {
  return JSON.stringify({
    bodyMarkdown: data.bodyMarkdown,
    category: data.category,
    composerMode: data.composerMode,
    date: data.date,
    excerpt: data.excerpt,
    coverImage: data.coverImage,
    publishedAt: data.publishedAt,
    seoDescription: data.seoDescription,
    seoTitle: data.seoTitle,
    slug: data.slug,
    status: data.status,
    tags: data.tags,
    title: data.title,
    tone: data.tone,
  });
}

function getMarkdownOutline(markdown: string): OutlineItem[] {
  let previousLevel = 1;

  return markdown.split('\n').reduce<OutlineItem[]>((items, line, lineIndex) => {
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (!headingMatch) {
      return items;
    }

    const level = headingMatch[1].length;
    const title = headingMatch[2].replace(/[#\s]+$/g, '').trim() || '未命名标题';
    const warning = level > previousLevel + 1 ? `标题层级从 H${previousLevel} 跳到 H${level}` : undefined;
    previousLevel = level;

    items.push({
      id: `heading-${lineIndex}`,
      lineIndex,
      level,
      title,
      warning,
    });

    return items;
  }, []);
}

function getHeadingBlockRange(lines: string[], headingLineIndex: number) {
  const headingMatch = lines[headingLineIndex]?.match(/^(#{2,6})\s+/);
  if (!headingMatch) {
    return null;
  }

  const level = headingMatch[1].length;
  let endIndex = lines.length;

  for (let index = headingLineIndex + 1; index < lines.length; index += 1) {
    const nextHeadingMatch = lines[index].match(/^(#{2,6})\s+/);
    if (nextHeadingMatch && nextHeadingMatch[1].length <= level) {
      endIndex = index;
      break;
    }
  }

  return { endIndex, level, startIndex: headingLineIndex };
}

function moveMarkdownHeadingBlock(markdown: string, sourceLineIndex: number, targetLineIndex: number) {
  if (sourceLineIndex === targetLineIndex) {
    return markdown;
  }

  const lines = markdown.split('\n');
  const sourceRange = getHeadingBlockRange(lines, sourceLineIndex);
  const targetRange = getHeadingBlockRange(lines, targetLineIndex);
  if (!sourceRange || !targetRange) {
    return markdown;
  }

  const block = lines.slice(sourceRange.startIndex, sourceRange.endIndex);
  const withoutBlock = [
    ...lines.slice(0, sourceRange.startIndex),
    ...lines.slice(sourceRange.endIndex),
  ];
  const adjustedTargetIndex =
    targetRange.startIndex > sourceRange.startIndex
      ? Math.max(targetRange.startIndex - block.length, 0)
      : targetRange.startIndex;

  return [
    ...withoutBlock.slice(0, adjustedTargetIndex),
    ...block,
    ...withoutBlock.slice(adjustedTargetIndex),
  ].join('\n');
}

function getLineStartOffset(markdown: string, lineIndex: number) {
  if (lineIndex <= 0) {
    return 0;
  }

  return markdown
    .split('\n')
    .slice(0, lineIndex)
    .reduce((offset, line) => offset + line.length + 1, 0);
}

function draftStatusLabel(status: DraftStatus) {
  const labels: Record<DraftStatus, string> = {
    clean: '已同步',
    dirty: '有未保存改动',
    saving: '正在保存',
    'draft-saved': '已保存草稿',
    'local-draft-saved': '已临时保存到本机',
    published: '已发布',
  };

  return labels[status];
}

function normalizeLoadedContent(content: Partial<SiteContent>, fallback: SiteContent): SiteContent {
  const posts = Array.isArray(content.posts)
    ? content.posts.map(normalizeApiPost).filter((post): post is Post => post !== null)
    : fallback.posts;
  const noteSections = normalizeApiNoteSections(content.noteSections);
  const featuredSeries = normalizeApiFeaturedSeries(content.featuredSeries);
  const galleryAlbums = ensureSystemGalleryAlbums(normalizeApiGalleryAlbums(content.galleryAlbums));

  return {
    posts,
    noteSections: noteSections.length > 0 ? noteSections : fallback.noteSections,
    featuredSeries: featuredSeries.length > 0 ? featuredSeries : fallback.featuredSeries,
    galleryAlbums: galleryAlbums.length > 0 ? galleryAlbums : ensureSystemGalleryAlbums(fallback.galleryAlbums),
    almanac: content.almanac ?? fallback.almanac ?? null,
    homepage: {
      ...fallback.homepage,
      ...(content.homepage ?? {}),
    },
  };
}

function normalizeLoadedSettings(settings: Partial<SiteSettings> | undefined, fallback: SiteSettings): SiteSettings {
  return {
    stylePreset: stylePresets.includes(settings?.stylePreset as StylePreset) ? settings!.stylePreset! : fallback.stylePreset,
    ownerName: settings?.ownerName !== undefined ? normalizeOwnerName(settings.ownerName) : fallback.ownerName,
    ownerAvatarUrl: settings?.ownerAvatarUrl !== undefined ? normalizeOwnerAvatarUrl(settings.ownerAvatarUrl) : fallback.ownerAvatarUrl,
  };
}

function formatDraftSavedAt(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}


function HomePage({ content, heroImage }: { content: SiteContent; heroImage: string }) {
  return <HeroMoonScene almanac={content.almanac} heroImage={heroImage} homepage={content.homepage} />;
}

function HomeContent({ content, ownerAvatarUrl, ownerName }: { content: SiteContent; ownerAvatarUrl: string; ownerName: string }) {
  return (
    <>
      <LatestPosts homepage={content.homepage} posts={content.posts} />
      <TopicRiver homepage={content.homepage} noteSections={content.noteSections} />
      <FeaturedEssay homepage={content.homepage} posts={content.posts} seriesList={content.featuredSeries} />
      <ArchivePreview homepage={content.homepage} posts={content.posts} />
      <AboutBlock homepage={content.homepage} noteSections={content.noteSections} ownerAvatarUrl={ownerAvatarUrl} ownerName={ownerName} posts={content.posts} />
    </>
  );
}

type AdminPanelId =
  | 'overview'
  | 'posts'
  | 'trash'
  | 'tags'
  | 'comments'
  | 'notes'
  | 'series'
  | 'gallery'
  | 'starfield'
  | 'starfield-generate'
  | 'starfield-review'
  | 'tasks'
  | 'archive'
  | 'commands'
  | 'llm'
  | 'homepage'
  | 'appearance';

type BatchResult = {
  success: number;
  failed: number;
};

const adminPanelIds = new Set<AdminPanelId>([
  'overview',
  'posts',
  'trash',
  'tags',
  'comments',
  'notes',
  'series',
  'gallery',
  'starfield',
  'starfield-generate',
  'starfield-review',
  'tasks',
  'archive',
  'commands',
  'llm',
  'homepage',
  'appearance',
]);

function formatBatchResult(action: string, result: BatchResult) {
  return `${action}完成：成功 ${result.success} 项，失败 ${result.failed} 项。`;
}

function navigateAdmin(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function getAdminPanelFromUrl(): AdminPanelId {
  if (window.location.pathname === '/admin/posts') {
    const panel = window.location.search ? new URLSearchParams(window.location.search).get('panel') : null;
    if (panel === 'starfield') {
      return 'starfield-generate';
    }
    return panel && adminPanelIds.has(panel as AdminPanelId) ? (panel as AdminPanelId) : 'posts';
  }

  return 'overview';
}

function getAdminPostsPageFromUrl() {
  const page = Number(new URLSearchParams(window.location.search).get('page') ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getSafeAdminReturnPath(search: string) {
  const returnTo = new URLSearchParams(search).get('returnTo');
  if (!returnTo) {
    return '/admin/posts?panel=posts';
  }

  try {
    const parsed = new URL(returnTo, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname !== '/admin/posts') {
      return '/admin/posts?panel=posts';
    }

    const params = new URLSearchParams(parsed.search);
    params.set('panel', 'posts');
    const page = Number(params.get('page') ?? '1');
    if (!Number.isInteger(page) || page <= 1) {
      params.delete('page');
    }
    const scroll = Number(params.get('scroll') ?? '0');
    if (!Number.isInteger(scroll) || scroll < 0) {
      params.delete('scroll');
    } else if (scroll === 0) {
      params.delete('scroll');
    } else {
      params.set('scroll', String(scroll));
    }

    return `/admin/posts?${params.toString()}`;
  } catch {
    return '/admin/posts?panel=posts';
  }
}

function AdminPage({
  content,
  contentStatus,
  colorScheme,
  onLogout,
  settings,
  onContentChange,
  onColorSchemeChange,
  onSettingsChange,
}: {
  content: SiteContent;
  contentStatus: 'idle' | 'loading' | 'ready' | 'error';
  colorScheme: ColorScheme;
  onLogout: () => void;
  settings: SiteSettings;
  onContentChange: (content: SiteContent) => void;
  onColorSchemeChange: (colorScheme: ColorScheme) => void;
  onSettingsChange: (settings: SiteSettings) => void;
}) {
  const [activePanel, setActivePanel] = useState<AdminPanelId>(() => getAdminPanelFromUrl());
  const [deletedPosts, setDeletedPosts] = useState<Post[]>([]);
  const [adminTags, setAdminTags] = useState(() => buildLocalAdminTags(content.posts));
  const [trashNotice, setTrashNotice] = useState('');
  const archiveGroups = buildArchive(content.posts);
  const editPostSlug = getAdminEditPostSlug(window.location.pathname);
  const editingPost = editPostSlug ? getPostBySlug(content.posts, editPostSlug) : undefined;
  const isPostComposerRoute = window.location.pathname === '/admin/posts/new' || Boolean(editPostSlug);
  const isEditingPostLoading = Boolean(editPostSlug && !editingPost && contentStatus !== 'ready');
  const isEditingPostMissing = Boolean(editPostSlug && !editingPost && contentStatus === 'ready');
  const adminPostsPage = getAdminPostsPageFromUrl();
  const composerReturnPath = getSafeAdminReturnPath(window.location.search);
  const noteSectionsSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPostComposerRoute) {
      setActivePanel(getAdminPanelFromUrl());
    }
  }, [isPostComposerRoute]);

  useEffect(() => {
    if (isPostComposerRoute) {
      return;
    }

    let cancelled = false;

    async function loadDeletedPosts() {
      try {
        const deletedItems = await fetchAdminDeletedArticles();
        if (cancelled) {
          return;
        }

        setDeletedPosts(deletedItems.map(normalizeApiPost).filter((post): post is Post => post !== null));
        setTrashNotice('');
      } catch {
        if (!cancelled) {
          setTrashNotice('回收站暂时无法连接后台。');
        }
      }
    }

    void loadDeletedPosts();
    return () => {
      cancelled = true;
    };
  }, [isPostComposerRoute]);

  useEffect(() => {
    if (isPostComposerRoute) {
      return;
    }

    let cancelled = false;

    async function loadTags() {
      try {
        const tags = await fetchAdminTags();
        if (!cancelled) {
          setAdminTags(tags);
        }
      } catch {
        if (!cancelled) {
          setAdminTags(buildLocalAdminTags(content.posts));
        }
      }
    }

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [content.posts, isPostComposerRoute]);

  useEffect(() => {
    return () => {
      if (noteSectionsSaveTimerRef.current !== null) {
        window.clearTimeout(noteSectionsSaveTimerRef.current);
      }
    };
  }, []);

  function clearPendingNoteSectionsSave() {
    if (noteSectionsSaveTimerRef.current !== null) {
      window.clearTimeout(noteSectionsSaveTimerRef.current);
      noteSectionsSaveTimerRef.current = null;
    }
  }

  function saveNoteSectionsSoon(nextSections: NoteSection[]) {
    clearPendingNoteSectionsSave();
    noteSectionsSaveTimerRef.current = window.setTimeout(() => {
      noteSectionsSaveTimerRef.current = null;
      void saveAdminNoteSections(nextSections).catch(() => undefined);
    }, 450);
  }

  function saveNoteSectionsNow(nextSections: NoteSection[]) {
    clearPendingNoteSectionsSave();
    return saveAdminNoteSections(nextSections);
  }

  function applyUpdatedPosts(updatedPosts: Post[]) {
    if (updatedPosts.length === 0) {
      return;
    }

    const updatedBySlug = new Map(updatedPosts.map((post) => [post.slug, post]));
    const nextPosts = sortPosts(content.posts.map((post) => updatedBySlug.get(post.slug) ?? post));
    onContentChange({ ...content, posts: nextPosts });
    setAdminTags(buildLocalAdminTags(nextPosts));
  }

  function updateStylePreset(stylePreset: StylePreset) {
    onSettingsChange({ ...settings, stylePreset });
  }

  function updateOwnerName(ownerName: string) {
    onSettingsChange({ ...settings, ownerName });
  }

  function updateOwnerAvatarUrl(ownerAvatarUrl: string) {
    onSettingsChange({ ...settings, ownerAvatarUrl: normalizeOwnerAvatarUrl(ownerAvatarUrl) });
  }

  async function handleLogout() {
    try {
      await logoutAdmin();
      onLogout();
      window.history.pushState({}, '', '/admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      window.alert('退出登录失败，请稍后重试。');
    }
  }

  async function deletePost(slug: string) {
    await deletePosts([slug]);
  }

  async function deletePosts(slugs: string[]): Promise<BatchResult> {
    const deletingSlugs = new Set(slugs);
    if (deletingSlugs.size === 0) {
      return { success: 0, failed: 0 };
    }

    const results = await Promise.allSettled([...deletingSlugs].map((slug) => deleteAdminArticle(slug)));
    const successfulSlugs = [...deletingSlugs].filter((_, index) => results[index]?.status === 'fulfilled');
    const successfulSlugSet = new Set(successfulSlugs);
    const deletedAt = new Date().toISOString();
    const deletedPostsSnapshot = content.posts
      .filter((post) => successfulSlugSet.has(post.slug))
      .map((post) => ({ ...post, deletedAt }));
    const nextPosts = content.posts.filter((post) => !successfulSlugSet.has(post.slug));
    const nextFeaturedSeries = content.featuredSeries.map((series) => ({
      ...series,
      postSlugs: series.postSlugs.filter((postSlug) => !successfulSlugSet.has(postSlug)),
    }));

    if (successfulSlugs.length > 0) {
      onContentChange({ ...content, posts: nextPosts, featuredSeries: nextFeaturedSeries });
      setDeletedPosts((posts) => [
        ...deletedPostsSnapshot,
        ...posts.filter((post) => !successfulSlugSet.has(post.slug)),
      ]);
    }

    return { success: successfulSlugs.length, failed: deletingSlugs.size - successfulSlugs.length };
  }

  async function restorePost(slug: string) {
    const result = await restorePosts([slug]);
    if (result.failed > 0) {
      setTrashNotice('恢复失败，请确认后台服务正在运行并且登录没有过期。');
    }
  }

  async function restorePosts(slugs: string[]): Promise<BatchResult> {
    const restoringSlugs = new Set(slugs);
    if (restoringSlugs.size === 0) {
      return { success: 0, failed: 0 };
    }

    setTrashNotice('');
    const results = await Promise.allSettled([...restoringSlugs].map((slug) => restoreAdminArticle(slug)));
    const restoredPosts = results
      .map((result, index) => {
        if (result.status !== 'fulfilled') {
          return null;
        }
        const fallbackPost = deletedPosts.find((post) => post.slug === [...restoringSlugs][index]);
        return normalizeApiPost(result.value) ?? fallbackPost ?? null;
      })
      .filter((post): post is Post => post !== null);
    const restoredSlugs = new Set(restoredPosts.map((post) => post.slug));

    if (restoredPosts.length > 0) {
      const nextPosts = [
        ...restoredPosts,
        ...content.posts.filter((post) => !restoredSlugs.has(post.slug)),
      ];
      onContentChange({ ...content, posts: sortPosts(nextPosts) });
      setDeletedPosts((posts) => posts.filter((post) => !restoringSlugs.has(post.slug) && !restoredSlugs.has(post.slug)));
    }

    return { success: restoredPosts.length, failed: restoringSlugs.size - restoredPosts.length };
  }

  async function createPost(post: Post) {
    let savedPost: Post = { ...post, syncStatus: 'synced' };
    try {
      savedPost = { ...(normalizeApiPost(await createAdminArticle(post)) ?? post), syncStatus: 'synced' };
    } catch {
      const localPost: Post = { ...post, syncStatus: 'local-only' };
      onContentChange({ ...content, posts: [localPost, ...content.posts] });
      return false;
    }

    onContentChange({ ...content, posts: [savedPost, ...content.posts] });
    navigateAdmin(composerReturnPath);
    return true;
  }

  async function updatePost(originalSlug: string, post: Post) {
    let savedPost: Post = { ...post, syncStatus: 'synced' };
    try {
      savedPost = { ...(normalizeApiPost(await updateAdminArticle(originalSlug, post)) ?? post), syncStatus: 'synced' };
    } catch {
      const localPost: Post = { ...post, syncStatus: 'local-only' };
      const nextLocalPosts = content.posts.map((currentPost) => (currentPost.slug === originalSlug ? localPost : currentPost));
      onContentChange({ ...content, posts: nextLocalPosts });
      return false;
    }

    const nextPosts = content.posts.map((currentPost) => (currentPost.slug === originalSlug ? savedPost : currentPost));
    const nextFeaturedSeries = content.featuredSeries.map((series) => ({
      ...series,
      postSlugs: series.postSlugs.map((postSlug) => (postSlug === originalSlug ? savedPost.slug : postSlug)),
    }));
    onContentChange({ ...content, posts: nextPosts, featuredSeries: nextFeaturedSeries });
    navigateAdmin(composerReturnPath);
    return true;
  }

  async function syncPost(slug: string): Promise<BatchResult> {
    const post = content.posts.find((post) => post.slug === slug);
    if (!post) {
      return { success: 0, failed: 1 };
    }

    try {
      let savedPost = normalizeApiPost(await updateAdminArticle(slug, post));
      if (!savedPost) {
        throw new Error('Invalid article response');
      }
      savedPost = { ...savedPost, syncStatus: 'synced' };
      onContentChange({
        ...content,
        posts: content.posts.map((currentPost) => (currentPost.slug === slug ? savedPost : currentPost)),
      });
      return { success: 1, failed: 0 };
    } catch {
      try {
        const createdPost = normalizeApiPost(await createAdminArticle(post));
        if (!createdPost) {
          throw new Error('Invalid article response');
        }
        onContentChange({
          ...content,
          posts: content.posts.map((currentPost) => (
            currentPost.slug === slug ? { ...createdPost, syncStatus: 'synced' } : currentPost
          )),
        });
        return { success: 1, failed: 0 };
      } catch {
        return { success: 0, failed: 1 };
      }
    }
  }

  async function publishPosts(slugs: string[]): Promise<BatchResult> {
    return updatePostStatuses(slugs, publishAdminArticle);
  }

  async function unpublishPosts(slugs: string[]): Promise<BatchResult> {
    return updatePostStatuses(slugs, unpublishAdminArticle);
  }

  async function archivePosts(slugs: string[]): Promise<BatchResult> {
    return updatePosts(slugs, (post) => ({ ...post, status: 'archived' }));
  }

  async function updatePostStatuses(
    slugs: string[],
    updateStatus: (slug: string) => Promise<Post>,
  ): Promise<BatchResult> {
    const targetSlugs = Array.from(new Set(slugs));
    if (targetSlugs.length === 0) {
      return { success: 0, failed: 0 };
    }

    const results = await Promise.allSettled(targetSlugs.map((slug) => updateStatus(slug)));
    const updatedPosts = results
      .map((result) => (result.status === 'fulfilled' ? normalizeApiPost(result.value) : null))
      .filter((post): post is Post => post !== null);
    const updatedBySlug = new Map(updatedPosts.map((post) => [post.slug, post]));

    if (updatedPosts.length > 0) {
      onContentChange({
        ...content,
        posts: content.posts.map((post) => updatedBySlug.get(post.slug) ?? post),
      });
    }

    return { success: updatedPosts.length, failed: targetSlugs.length - updatedPosts.length };
  }

  async function updatePosts(slugs: string[], createNextPost: (post: Post) => Post): Promise<BatchResult> {
    const targetSlugs = Array.from(new Set(slugs));
    if (targetSlugs.length === 0) {
      return { success: 0, failed: 0 };
    }

    const postsBySlug = new Map(content.posts.map((post) => [post.slug, post]));
    const results = await Promise.allSettled(
      targetSlugs.map((slug) => {
        const post = postsBySlug.get(slug);
        return post ? updateAdminArticle(slug, createNextPost(post)) : Promise.reject(new Error('Post not found'));
      }),
    );
    const updatedPosts = results
      .map((result) => (result.status === 'fulfilled' ? normalizeApiPost(result.value) : null))
      .filter((post): post is Post => post !== null);
    const updatedBySlug = new Map(updatedPosts.map((post) => [post.slug, post]));

    if (updatedPosts.length > 0) {
      onContentChange({
        ...content,
        posts: sortPosts(content.posts.map((post) => updatedBySlug.get(post.slug) ?? post)),
      });
    }

    return { success: updatedPosts.length, failed: targetSlugs.length - updatedPosts.length };
  }

  async function movePostsToArchiveMonth(slugs: string[], monthValue: string): Promise<BatchResult> {
    if (!monthValue) {
      return { success: 0, failed: Array.from(new Set(slugs)).length };
    }

    return updatePosts(slugs, (post) => movePostToArchiveMonth(post, monthValue));
  }

  async function movePostsToCategory(slugs: string[], category: string): Promise<BatchResult> {
    const targetSlugs = Array.from(new Set(slugs));
    if (targetSlugs.length === 0 || !category) {
      return { success: 0, failed: targetSlugs.length };
    }

    const postsBySlug = new Map(content.posts.map((post) => [post.slug, post]));
    const results = await Promise.allSettled(
      targetSlugs.map((slug) => {
        const post = postsBySlug.get(slug);
        return post ? updateAdminArticle(slug, { ...post, category }) : Promise.reject(new Error('Post not found'));
      }),
    );
    const updatedPosts = results
      .map((result) => (result.status === 'fulfilled' ? normalizeApiPost(result.value) : null))
      .filter((post): post is Post => post !== null);
    const updatedBySlug = new Map(updatedPosts.map((post) => [post.slug, post]));

    if (updatedPosts.length > 0) {
      onContentChange({
        ...content,
        posts: content.posts.map((post) => updatedBySlug.get(post.slug) ?? post),
      });
    }

    return { success: updatedPosts.length, failed: targetSlugs.length - updatedPosts.length };
  }

  async function removeTagFromPosts(tag: string): Promise<BatchResult> {
    try {
      const payload = await deleteAdminTag(tag);
      const updatedPosts = payload.articles.map(normalizeApiPost).filter((post): post is Post => post !== null);
      applyUpdatedPosts(updatedPosts);
      return { success: payload.updatedCount, failed: 0 };
    } catch {
      return { success: 0, failed: 1 };
    }
  }

  async function mergePostTags(sourceTag: string, targetTag: string): Promise<BatchResult> {
    try {
      const payload = await mergeAdminTags(sourceTag, targetTag);
      const updatedPosts = payload.articles.map(normalizeApiPost).filter((post): post is Post => post !== null);
      applyUpdatedPosts(updatedPosts);
      return { success: payload.updatedCount, failed: 0 };
    } catch {
      return { success: 0, failed: 1 };
    }
  }

  function updateNoteSection(index: number, nextSection: NoteSection) {
    const nextSections = content.noteSections.map((section, sectionIndex) =>
      sectionIndex === index ? nextSection : section,
    );
    onContentChange({ ...content, noteSections: nextSections });
    saveNoteSectionsSoon(nextSections);
  }

  function addNoteSection() {
    const nextSections = [
      ...content.noteSections,
      { id: makeClientId('section'), category: '新札记', description: '给这个札记分类写一句说明' },
    ];
    onContentChange({ ...content, noteSections: nextSections });
    void saveNoteSectionsNow(nextSections).catch(() => undefined);
  }

  function deleteNoteSection(index: number) {
    const nextSections = content.noteSections.filter((_, sectionIndex) => sectionIndex !== index);
    onContentChange({ ...content, noteSections: nextSections });
    void saveNoteSectionsNow(nextSections)
      .then((savedSections) => {
        onContentChange({ ...content, noteSections: normalizeApiNoteSections(savedSections) });
      })
      .catch(() => {
        onContentChange(content);
        window.alert('删除札记失败，请确认后台服务正在运行并且登录没有过期。');
      });
  }

  function updateSeries(index: number, nextSeries: FeaturedSeries) {
    const nextSeriesList = content.featuredSeries.map((series, seriesIndex) =>
      seriesIndex === index ? nextSeries : series,
    );
    onContentChange({ ...content, featuredSeries: nextSeriesList });
    void saveAdminFeaturedSeries(nextSeriesList).catch(() => undefined);
  }

  function addSeries() {
    const nextSeriesList = [
      ...content.featuredSeries,
      {
        id: `series-${Date.now()}`,
        title: '新专题',
        lead: '给这个专题写一句引导语',
        body: '说明这个专题会收录什么内容。',
        postSlugs: [],
      },
    ];
    onContentChange({ ...content, featuredSeries: nextSeriesList });
    void saveAdminFeaturedSeries(nextSeriesList).catch(() => undefined);
  }

  function deleteSeries(index: number) {
    const nextSeriesList = content.featuredSeries.filter((_, seriesIndex) => seriesIndex !== index);
    onContentChange({ ...content, featuredSeries: nextSeriesList });
    void saveAdminFeaturedSeries(nextSeriesList).catch(() => undefined);
  }

  async function addGalleryAlbum() {
    const draftAlbum: GalleryAlbum = {
      id: `album-${Date.now()}`,
      slug: `gallery-${Date.now()}`,
      title: '新相册',
      description: '给这个相册写一句说明',
      coverImageId: null,
      coverImageUrl: '',
      isPublic: false,
      sortOrder: content.galleryAlbums.length,
      imageCount: 0,
      images: [],
    };

    let savedAlbum = draftAlbum;
    try {
      savedAlbum = normalizeApiGalleryAlbum(await createAdminGalleryAlbum(draftAlbum)) ?? draftAlbum;
    } catch {
      // API 不可用时先保留本地相册草稿。
    }

    onContentChange({ ...content, galleryAlbums: [...content.galleryAlbums, savedAlbum] });
  }

  async function updateGalleryAlbum(index: number, nextAlbum: GalleryAlbum) {
    const currentAlbum = content.galleryAlbums[index];
    const nextAlbums = content.galleryAlbums.map((album, albumIndex) => (albumIndex === index ? nextAlbum : album));
    onContentChange({ ...content, galleryAlbums: nextAlbums });

    try {
      const savedAlbum = normalizeApiGalleryAlbum(await updateAdminGalleryAlbum(currentAlbum.id || currentAlbum.slug, nextAlbum));
      if (savedAlbum) {
        onContentChange({
          ...content,
          galleryAlbums: nextAlbums.map((album, albumIndex) => (albumIndex === index ? { ...savedAlbum, images: nextAlbum.images } : album)),
        });
      }
    } catch {
      // 保留本地编辑，等待后端恢复。
    }
  }

  async function deleteGalleryAlbumAt(index: number) {
    const album = content.galleryAlbums[index];
    if (!album) {
      return;
    }
    if (isSystemGalleryAlbum(album)) {
      window.alert('系统图库用于维护博客页面图片，不能删除。');
      return;
    }

    const confirmed = window.confirm(`确定删除相册「${album.title}」吗？相册内图片也会一起删除。`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteAdminGalleryAlbum(album.id || album.slug);
      const nextAlbums = content.galleryAlbums.filter((_, albumIndex) => albumIndex !== index);
      onContentChange({ ...content, galleryAlbums: nextAlbums });
    } catch {
      window.alert('删除相册失败，请确认后台服务正在运行并且登录没有过期。');
    }
  }

  async function uploadGalleryImages(albumIndex: number, files: File[]) {
    const album = content.galleryAlbums[albumIndex];
    if (!album || isSystemGalleryAlbum(album)) {
      return;
    }

    const uploadedImages: GalleryImage[] = [];

    for (const file of files) {
      try {
        const savedImage = await uploadAdminGalleryImage(album.id || album.slug, file, {
          title: file.name.replace(/\.[^.]+$/, ''),
          sortOrder: album.images.length + uploadedImages.length,
          isPublic: true,
        });
        uploadedImages.push(savedImage);
      } catch {
        // 单张上传失败时跳过，已成功的图片继续保留。
      }
    }

    if (uploadedImages.length === 0) {
      return;
    }

    const nextImages = normalizeGalleryImageOrder([...album.images, ...uploadedImages]);
    const nextAlbums = content.galleryAlbums.map((currentAlbum, index) =>
      index === albumIndex ? withGalleryAlbumImages(currentAlbum, nextImages) : currentAlbum,
    );
    onContentChange({ ...content, galleryAlbums: nextAlbums });
  }

  async function uploadComposerImages(files: File[]) {
    const imageFiles = files.filter(isSupportedComposerImageFile);
    if (imageFiles.length === 0) {
      return [];
    }

    let targetAlbum =
      content.galleryAlbums.find((album) => !isSystemGalleryAlbum(album) && album.slug === composerImageAlbumSlug) ??
      content.galleryAlbums.find((album) => !isSystemGalleryAlbum(album));
    let nextAlbums = content.galleryAlbums;

    if (!targetAlbum) {
      const draftAlbum: GalleryAlbum = {
        id: `album-${Date.now()}`,
        slug: composerImageAlbumSlug,
        title: composerImageAlbumTitle,
        description: '写博客时粘贴或拖入的正文图片。',
        coverImageId: null,
        coverImageUrl: '',
        isPublic: true,
        sortOrder: content.galleryAlbums.length,
        imageCount: 0,
        images: [],
      };
      targetAlbum = normalizeApiGalleryAlbum(await createAdminGalleryAlbum(draftAlbum)) ?? draftAlbum;
      nextAlbums = [...nextAlbums, targetAlbum];
    }

    const uploadedImages: GalleryImage[] = [];

    for (const file of imageFiles) {
      const savedImage = await uploadAdminGalleryImage(targetAlbum.id || targetAlbum.slug, file, {
        title: createComposerImageTitle(file, uploadedImages.length),
        sortOrder: targetAlbum.images.length + uploadedImages.length,
        isPublic: true,
      });
      uploadedImages.push(savedImage);
    }

    const nextImages = normalizeGalleryImageOrder([...targetAlbum.images, ...uploadedImages]);
    const nextAlbum = withGalleryAlbumImages(targetAlbum, nextImages);
    const updatedAlbums = nextAlbums.map((album) => (album.id === targetAlbum.id ? nextAlbum : album));
    onContentChange({ ...content, galleryAlbums: updatedAlbums });

    return uploadedImages;
  }

  async function replaceGalleryImageFile(albumIndex: number, imageIndex: number, file: File) {
    const album = content.galleryAlbums[albumIndex];
    const image = album?.images[imageIndex];
    if (!album || !image || !isSystemGalleryAlbum(album)) {
      return;
    }

    try {
      const savedImage = await replaceAdminGalleryImageFile(image.id, file);
      const nextAlbums = content.galleryAlbums.map((currentAlbum, currentAlbumIndex) =>
        currentAlbumIndex === albumIndex
          ? withGalleryAlbumImages(currentAlbum, currentAlbum.images.map((currentImage) => (
              currentImage.id === savedImage.id ? savedImage : currentImage
            )))
          : currentAlbum,
      );
      onContentChange({ ...content, galleryAlbums: nextAlbums });
      if (image.id === 'image-guzhouyue-avatar' && settings.ownerAvatarUrl === image.imageUrl) {
        onSettingsChange({ ...settings, ownerAvatarUrl: savedImage.imageUrl });
      }
    } catch {
      window.alert('替换图片失败，请确认后台服务正在运行并且登录没有过期。');
    }
  }

  async function updateGalleryImage(albumIndex: number, imageIndex: number, nextImage: GalleryImage) {
    if (imageIndex < 0) {
      return;
    }

    const nextAlbums = content.galleryAlbums.map((album, currentAlbumIndex) =>
      currentAlbumIndex === albumIndex
        ? {
            ...album,
            images: album.images.map((image, currentImageIndex) => (currentImageIndex === imageIndex ? nextImage : image)),
          }
        : album,
    );
    onContentChange({ ...content, galleryAlbums: nextAlbums });
    try {
      await updateAdminGalleryImage(nextImage.id, nextImage);
    } catch {
      // 保留本地编辑。
    }
  }

  async function deleteGalleryImageAt(albumIndex: number, imageIndex: number) {
    const album = content.galleryAlbums[albumIndex];
    const image = album.images[imageIndex];
    if (!image) {
      return;
    }

    await deleteGalleryImagesAt(albumIndex, [image.id]);
  }

  async function deleteGalleryImagesAt(albumIndex: number, imageIds: string[]) {
    const album = content.galleryAlbums[albumIndex];
    const deletingIds = new Set(imageIds);
    if (!album || deletingIds.size === 0) {
      return;
    }

    const imagesToDelete = album.images.filter((image) => deletingIds.has(image.id));
    if (isSystemGalleryAlbum(album)) {
      window.alert('系统图库里的图片不能删除，只能上传新图片覆盖。');
      return;
    }

    const nextImages = normalizeGalleryImageOrder(album.images.filter((image) => !deletingIds.has(image.id)));
    const nextAlbum = withGalleryAlbumImages(album, nextImages);
    const nextAlbums = content.galleryAlbums.map((currentAlbum, currentAlbumIndex) =>
      currentAlbumIndex === albumIndex ? nextAlbum : currentAlbum,
    );
    onContentChange({ ...content, galleryAlbums: nextAlbums });

    await Promise.allSettled(imagesToDelete.map((image) => deleteAdminGalleryImage(image.id)));
    await Promise.allSettled(nextImages.map((image) => updateAdminGalleryImage(image.id, image)));

    if (nextAlbum.coverImageId !== album.coverImageId) {
      try {
        await updateAdminGalleryAlbum(album.id || album.slug, nextAlbum);
      } catch {
        // 本地封面已回退，后端恢复后可重新同步。
      }
    }
  }

  async function moveGalleryImage(albumIndex: number, imageId: string, direction: -1 | 1) {
    const album = content.galleryAlbums[albumIndex];
    if (!album) {
      return;
    }

    const sortedImages = sortGalleryImages(album.images);
    const sourceIndex = sortedImages.findIndex((image) => image.id === imageId);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= sortedImages.length) {
      return;
    }

    const reorderedImages = [...sortedImages];
    [reorderedImages[sourceIndex], reorderedImages[targetIndex]] = [reorderedImages[targetIndex], reorderedImages[sourceIndex]];
    const nextImages = normalizeGalleryImageOrder(reorderedImages);
    const nextAlbums = content.galleryAlbums.map((currentAlbum, currentAlbumIndex) =>
      currentAlbumIndex === albumIndex ? withGalleryAlbumImages(currentAlbum, nextImages) : currentAlbum,
    );
    onContentChange({ ...content, galleryAlbums: nextAlbums });

    await Promise.allSettled(nextImages.map((image) => updateAdminGalleryImage(image.id, image)));
  }

  function updateHomepage(homepage: HomepageCopy) {
    onContentChange({ ...content, homepage });
    void saveAdminHomepage(homepage).catch(() => undefined);
  }

  function restoreDefaults() {
    const nextContent = resetSiteContent();
    onContentChange(nextContent);
  }

  function selectAdminPanel(panel: AdminPanelId) {
    setActivePanel(panel);
    navigateAdmin(panel === 'overview' ? '/admin' : `/admin/posts?panel=${panel}`);
  }

  function updateAdminPostsPage(page: number) {
    const targetPage = Math.max(1, page);
    const params = new URLSearchParams(window.location.search);
    params.set('panel', 'posts');
    if (targetPage > 1) {
      params.set('page', String(targetPage));
    } else {
      params.delete('page');
    }
    params.delete('scroll');
    navigateAdmin(`/admin/posts?${params.toString()}`);
  }

  return (
    <div className="site-shell admin-shell">
      {!isPostComposerRoute && (
        <header className="site-header admin-header">
          <a className="brand" href="/" aria-label={`返回${content.homepage.siteName}首页`}>
            <span>{content.homepage.siteName}</span>
            <small>内容管理</small>
          </a>
          <nav className="desktop-nav" aria-label="管理导航">
            <a href="/">返回首页</a>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => onColorSchemeChange(colorScheme === 'light' ? 'dark' : 'light')}
              aria-label="切换明暗模式"
            >
              {colorScheme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button className="secondary-action admin-logout-action" type="button" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </header>
      )}

      <main className={isPostComposerRoute ? 'admin-main admin-main-composer' : 'admin-main'}>
        {isEditingPostLoading ? (
          <AdminComposerStatus
            returnPath={composerReturnPath}
            siteName={content.homepage.siteName}
            status="loading"
            title="正在加载文章..."
          />
        ) : isEditingPostMissing ? (
          <AdminComposerStatus
            returnPath={composerReturnPath}
            siteName={content.homepage.siteName}
            status="missing"
            title="没有找到这篇文章"
          />
        ) : isPostComposerRoute ? (
          <AdminPostComposer
            key={editingPost?.slug ?? 'new'}
            editingPost={editingPost}
            galleryAlbums={content.galleryAlbums}
            noteSections={content.noteSections}
            onCreatePost={createPost}
            onUpdatePost={updatePost}
            onUploadImages={uploadComposerImages}
            returnPath={composerReturnPath}
            onThemeToggle={() => onColorSchemeChange(colorScheme === 'light' ? 'dark' : 'light')}
            colorScheme={colorScheme}
            posts={content.posts}
            settings={settings}
            siteName={content.homepage.siteName}
          />
        ) : (
          <>
            <section className="admin-hero">
              <div>
                <SectionHeading eyebrow="Admin" title="站点管理台" />
                <p>集中管理文章、专题、图库、首页文案和外观。常用入口与内容状态放在总览里，减少来回切换。</p>
              </div>
              <div className="admin-hero-actions">
                <a className="primary-action" href="/admin/posts/new">
                  <Plus size={17} />
                  写新文章
                </a>
                <a className="secondary-action" href="/">
                  <Eye size={17} />
                  查看首页
                </a>
              </div>
            </section>

            <section className="admin-workspace">
              <aside className="admin-sidebar" aria-label="管理菜单">
                {[
                  { panel: 'overview', label: '总览', Icon: Columns2, meta: `${content.posts.length} 篇内容` },
                  { panel: 'posts', label: '文章管理', Icon: FileText, meta: `${content.posts.length} 篇` },
                  { panel: 'tags', label: '标签管理', Icon: Tags, meta: `${adminTags.length} 个` },
                  { panel: 'trash', label: '回收站', Icon: Trash2, meta: `${deletedPosts.length} 篇` },
                  { panel: 'comments', label: '评论审核', Icon: MessageCircle, meta: '待处理' },
                  { panel: 'notes', label: '札记分类', Icon: Feather, meta: `${content.noteSections.length} 类` },
                  { panel: 'series', label: '专题管理', Icon: ListOrdered, meta: `${content.featuredSeries.length} 个` },
                  { panel: 'gallery', label: '图库管理', Icon: ImageIcon, meta: `${content.galleryAlbums.length} 个相册` },
                  { panel: 'starfield-generate', label: '星图生成', Icon: Orbit, meta: 'Passage' },
                  { panel: 'starfield-review', label: '星图审批', Icon: GitBranch, meta: '文段关系' },
                  { panel: 'tasks', label: '任务管理', Icon: List, meta: '后台任务' },
                  { panel: 'archive', label: '归档管理', Icon: CalendarDays, meta: `${archiveGroups.length} 个月` },
                  { panel: 'commands', label: '快速指令', Icon: SquareTerminal, meta: '指令通道' },
                  { panel: 'llm', label: 'LLM 配置', Icon: Bot, meta: 'deepseek-v4-pro' },
                  { panel: 'homepage', label: '主页词汇', Icon: Settings, meta: '首页内容' },
                  { panel: 'appearance', label: '外观设置', Icon: Sun, meta: colorScheme === 'light' ? '亮色' : '暗色' },
                ].map(({ panel, label, Icon, meta }) => (
                  <button
                    aria-pressed={activePanel === panel}
                    key={panel}
                    onClick={() => selectAdminPanel(panel as AdminPanelId)}
                    type="button"
                  >
                    <Icon size={18} />
                    <span>
                      <strong>{label}</strong>
                      <small>{meta}</small>
                    </span>
                  </button>
                ))}
              </aside>

              <div className="admin-content">
                {activePanel === 'overview' && (
                  <AdminDashboardPanel
                    archiveGroups={archiveGroups}
                    colorScheme={colorScheme}
                    content={content}
                    deletedPosts={deletedPosts}
                    onSelectPanel={selectAdminPanel}
                  />
                )}

                {activePanel === 'posts' && (
                  <AdminPostsPanel
                    currentPage={adminPostsPage}
                    noteSections={content.noteSections}
                    onDeletePosts={deletePosts}
                    onArchivePosts={archivePosts}
                    onPageChange={updateAdminPostsPage}
                    onMovePostsToCategory={movePostsToCategory}
                    onPublishPosts={publishPosts}
                    onSyncPost={syncPost}
                    onUnpublishPosts={unpublishPosts}
                    posts={content.posts}
                  />
                )}

                {activePanel === 'tags' && (
                  <AdminTagsPanel
                    onDeleteTag={removeTagFromPosts}
                    onMergeTags={mergePostTags}
                    posts={content.posts}
                    tags={adminTags}
                  />
                )}

                {activePanel === 'trash' && (
                  <AdminTrashPanel
                    notice={trashNotice}
                    onRestorePosts={restorePosts}
                    posts={deletedPosts}
                  />
                )}

                {activePanel === 'comments' && <AdminCommentsPanel />}

                {activePanel === 'notes' && (
                  <AdminNotesPanel
                    noteSections={content.noteSections}
                    onAddSection={addNoteSection}
                    onDeleteSection={deleteNoteSection}
                    onSectionChange={updateNoteSection}
                    posts={content.posts}
                  />
                )}

                {activePanel === 'series' && (
                  <AdminSeriesPanel
                    onAddSeries={addSeries}
                    onDeleteSeries={deleteSeries}
                    onSeriesChange={updateSeries}
                    posts={content.posts}
                    seriesList={content.featuredSeries}
                  />
                )}

                {activePanel === 'gallery' && (
                  <AdminGalleryPanel
                    albums={content.galleryAlbums}
                    onAddAlbum={addGalleryAlbum}
                    onAlbumChange={updateGalleryAlbum}
                    onDeleteAlbum={deleteGalleryAlbumAt}
                    onDeleteImage={deleteGalleryImageAt}
                    onDeleteImages={deleteGalleryImagesAt}
                    onImageChange={updateGalleryImage}
                    onMoveImage={moveGalleryImage}
                    onReplaceImageFile={replaceGalleryImageFile}
                    onUploadImages={uploadGalleryImages}
                  />
                )}

                {activePanel === 'starfield-generate' && <AdminStarfieldPanel mode="generation" posts={content.posts} />}

                {activePanel === 'starfield-review' && <AdminStarfieldPanel mode="review" posts={content.posts} />}

                {activePanel === 'tasks' && <AdminStarfieldPanel mode="tasks" posts={content.posts} />}

                {activePanel === 'archive' && (
                  <AdminArchivePanel
                    archiveGroups={archiveGroups}
                    onArchivePosts={archivePosts}
                    onMovePostsToArchiveMonth={movePostsToArchiveMonth}
                    onPublishPosts={publishPosts}
                    onUnpublishPosts={unpublishPosts}
                    posts={content.posts}
                  />
                )}

                {activePanel === 'commands' && <AdminCommandPanel />}

                {activePanel === 'llm' && <AdminLlmConfigPanel />}

                {activePanel === 'homepage' && (
                  <AdminHomepagePanel homepage={content.homepage} onHomepageChange={updateHomepage} />
                )}

                {activePanel === 'appearance' && (
                  <AdminAppearancePanel
                    albums={content.galleryAlbums}
                    colorScheme={colorScheme}
                    homepage={content.homepage}
                    onColorSchemeChange={onColorSchemeChange}
                    onOwnerAvatarUrlChange={updateOwnerAvatarUrl}
                    onOwnerNameChange={updateOwnerName}
                    onResetContent={restoreDefaults}
                    onStylePresetChange={updateStylePreset}
                    ownerAvatarUrl={settings.ownerAvatarUrl}
                    ownerName={settings.ownerName}
                    stylePreset={settings.stylePreset}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function AdminTrashPanel({
  notice,
  onRestorePosts,
  posts,
}: {
  notice: string;
  onRestorePosts: (slugs: string[]) => Promise<BatchResult>;
  posts: Post[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [batchNotice, setBatchNotice] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const totalPages = Math.max(1, Math.ceil(posts.length / adminPostsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedPosts = posts.slice((safeCurrentPage - 1) * adminPostsPerPage, safeCurrentPage * adminPostsPerPage);
  const firstItemIndex = posts.length === 0 ? 0 : (safeCurrentPage - 1) * adminPostsPerPage + 1;
  const lastItemIndex = Math.min(posts.length, safeCurrentPage * adminPostsPerPage);
  const visibleSlugs = pagedPosts.map((post) => post.slug);
  const allVisibleSelected = visibleSlugs.length > 0 && visibleSlugs.every((slug) => selectedSlugs.includes(slug));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setSelectedSlugs((slugs) => slugs.filter((slug) => posts.some((post) => post.slug === slug)));
  }, [posts]);

  function togglePost(slug: string) {
    setSelectedSlugs((slugs) => (slugs.includes(slug) ? slugs.filter((item) => item !== slug) : [...slugs, slug]));
  }

  function toggleVisiblePosts() {
    setSelectedSlugs((slugs) => {
      if (allVisibleSelected) {
        return slugs.filter((slug) => !visibleSlugs.includes(slug));
      }

      return Array.from(new Set([...slugs, ...visibleSlugs]));
    });
  }

  async function runRestore(slugs: string[]) {
    if (slugs.length === 0 || batchBusy) {
      return;
    }

    setBatchBusy(true);
    setBatchNotice('');
    try {
      const result = await onRestorePosts(slugs);
      setBatchNotice(formatBatchResult('恢复', result));
      if (result.success > 0) {
        setSelectedSlugs((currentSlugs) => currentSlugs.filter((slug) => !slugs.includes(slug)));
      }
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="回收站">
      <PanelHeader title="回收站" />
      <div className="admin-posts-overview">
        <div className="archive-summary">
          <strong>{posts.length}</strong>
          <span>篇已删除文章</span>
        </div>
        {notice && <p className="admin-trash-notice">{notice}</p>}
        {posts.length > 0 && (
          <div className="admin-bulk-toolbar" aria-label="回收站批量操作">
            <label className="admin-select-all">
              <input checked={allVisibleSelected} type="checkbox" onChange={toggleVisiblePosts} />
              选中本页
            </label>
            <span>{selectedSlugs.length} 篇已选</span>
            <button
              className="secondary-action"
              disabled={selectedSlugs.length === 0 || batchBusy}
              type="button"
              onClick={() => void runRestore(selectedSlugs)}
            >
              批量恢复
            </button>
          </div>
        )}
        {batchNotice && <p className="admin-batch-notice">{batchNotice}</p>}

        {posts.length > 0 ? (
          <>
            <div className="admin-post-list" aria-label="已删除文章列表">
              {pagedPosts.map((post) => (
                <article className="admin-post-row" key={post.slug}>
                  <label className="admin-row-select" aria-label={`选择${post.title}`}>
                    <input
                      checked={selectedSlugs.includes(post.slug)}
                      type="checkbox"
                      onChange={() => togglePost(post.slug)}
                    />
                  </label>
                  <div className="admin-post-main">
                    <div className="admin-post-titleline">
                      <h3>{post.title}</h3>
                      <span>{formatDeletedAt(post.deletedAt)}</span>
                    </div>
                    <p>{post.excerpt}</p>
                    <div className="admin-post-meta">
                      <span>{post.category}</span>
                      <span>{post.tags.join('，')}</span>
                    </div>
                  </div>
                  <div className="admin-post-actions">
                    <button
                      className="secondary-action"
                      disabled={batchBusy}
                      type="button"
                      onClick={() => void runRestore([post.slug])}
                    >
                      恢复文章
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <nav className="admin-pagination" aria-label="回收站分页">
              <span>
                第 {firstItemIndex}-{lastItemIndex} 篇，共 {posts.length} 篇
              </span>
              <div>
                <button
                  className="secondary-action"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  上一页
                </button>
                <strong>
                  {safeCurrentPage} / {totalPages}
                </strong>
                <button
                  className="secondary-action"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  type="button"
                >
                  下一页
                </button>
              </div>
            </nav>
          </>
        ) : (
          <div className="empty-state">
            <p>回收站里暂无文章。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminCommentsPanel() {
  const commentStatuses: AdminCommentStatus[] = ['pending', 'approved', 'rejected'];
  const [activeStatus, setActiveStatus] = useState<AdminCommentStatus>('pending');
  const [comments, setComments] = useState<ApiAdminComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [busyCommentId, setBusyCommentId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      setLoading(true);
      setNotice('');
      try {
        const items = await fetchAdminComments(activeStatus);
        if (!cancelled) {
          setComments(items);
        }
      } catch {
        if (!cancelled) {
          setComments([]);
          setNotice('评论接口暂时不可用，请确认后台服务和登录状态。');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadComments();
    return () => {
      cancelled = true;
    };
  }, [activeStatus]);

  async function changeCommentStatus(comment: ApiAdminComment, nextStatus: AdminCommentStatus) {
    if (busyCommentId) {
      return;
    }

    setBusyCommentId(comment.id);
    setNotice('');
    try {
      await updateAdminCommentStatus(comment.id, nextStatus);
      setComments((items) => items.filter((item) => item.id !== comment.id));
      setNotice(`已将「${comment.articleTitle}」下的评论标记为${commentStatusLabels[nextStatus]}。`);
    } catch {
      setNotice('评论状态更新失败，请稍后重试。');
    } finally {
      setBusyCommentId('');
    }
  }

  return (
    <section className="admin-panel" aria-label="评论审核">
      <PanelHeader title="评论审核" />
      <div className="comments-moderation">
        <div className="archive-summary">
          <strong>{comments.length}</strong>
          <span>{commentStatusLabels[activeStatus]}评论</span>
        </div>

        <div className="admin-filter-tabs admin-status-tabs comments-status-tabs" role="group" aria-label="按评论状态筛选">
          {commentStatuses.map((status) => (
            <button
              aria-pressed={activeStatus === status}
              key={status}
              onClick={() => setActiveStatus(status)}
              type="button"
            >
              {commentStatusLabels[status]}
            </button>
          ))}
        </div>
        {notice && <p className="admin-batch-notice">{notice}</p>}

        {loading ? (
          <div className="empty-state">
            <p>正在加载评论。</p>
          </div>
        ) : comments.length > 0 ? (
          <div className="comments-moderation-list">
            {comments.map((comment) => (
              <article className="comment-moderation-card" key={comment.id}>
                <header>
                  <div>
                    <span className={`admin-status-pill status-comment-${comment.status}`}>{commentStatusLabels[comment.status]}</span>
                    <a href={`/posts/${comment.articleSlug}`}>{comment.articleTitle}</a>
                  </div>
                  <time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>
                </header>
                <div className="comment-moderation-body">
                  <strong>{comment.author}</strong>
                  <p>{comment.content}</p>
                </div>
                <div className="comment-moderation-actions">
                  {activeStatus !== 'approved' && (
                    <button
                      className="secondary-action"
                      disabled={busyCommentId === comment.id}
                      type="button"
                      onClick={() => void changeCommentStatus(comment, 'approved')}
                    >
                      通过
                    </button>
                  )}
                  {activeStatus !== 'rejected' && (
                    <button
                      className="danger-action"
                      disabled={busyCommentId === comment.id}
                      type="button"
                      onClick={() => void changeCommentStatus(comment, 'rejected')}
                    >
                      拒绝
                    </button>
                  )}
                  {activeStatus !== 'pending' && (
                    <button
                      className="secondary-action"
                      disabled={busyCommentId === comment.id}
                      type="button"
                      onClick={() => void changeCommentStatus(comment, 'pending')}
                    >
                      退回待审
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>当前没有{commentStatusLabels[activeStatus]}评论。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminComposerStatus({
  returnPath,
  siteName,
  status,
  title,
}: {
  returnPath: string;
  siteName: string;
  status: 'loading' | 'missing';
  title: string;
}) {
  return (
    <section className="admin-composer typora-shell composer-status-shell" aria-label="文章编辑状态">
      <header className="typora-topbar">
        <div className="typora-brand-group">
          <a className="brand typora-brand" href="/" aria-label={`返回${siteName}首页`}>
            <span>{siteName}</span>
            <small>内容管理</small>
          </a>
          <a className="typora-return-link" href="/">
            返回首页
          </a>
          <div className="typora-doc-state">
            <span>{status === 'loading' ? '加载中' : '不可编辑'}</span>
            <strong>{title}</strong>
          </div>
        </div>
        <div className="typora-top-actions">
          <a className="secondary-action" href={returnPath}>
            返回列表
          </a>
        </div>
      </header>
      <main className="composer-status-panel">
        <strong>{title}</strong>
        <p>{status === 'loading' ? '正在从后台读取文章内容。' : '这篇文章可能已被删除或尚未同步到后台。'}</p>
      </main>
    </section>
  );
}

function AdminPostComposer({
  colorScheme,
  editingPost,
  galleryAlbums,
  noteSections,
  onCreatePost,
  onThemeToggle,
  onUpdatePost,
  onUploadImages,
  posts,
  returnPath,
  settings,
  siteName,
}: {
  colorScheme: ColorScheme;
  editingPost?: Post;
  galleryAlbums: GalleryAlbum[];
  noteSections: NoteSection[];
  onCreatePost: (post: Post) => Promise<boolean>;
  onThemeToggle: () => void;
  onUpdatePost: (originalSlug: string, post: Post) => Promise<boolean>;
  onUploadImages: (files: File[]) => Promise<GalleryImage[]>;
  posts: Post[];
  returnPath: string;
  settings: SiteSettings;
  siteName: string;
}) {
  const defaultCategory = noteSections[0]?.category ?? '人间札记';
  const draftKey = getComposerDraftKey(editingPost?.slug);
  const [title, setTitle] = useState(editingPost?.title ?? '');
  const [slug, setSlug] = useState(editingPost?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(editingPost));
  const [category, setCategory] = useState(editingPost?.category ?? defaultCategory);
  const [date, setDate] = useState(editingPost?.date ?? formatToday());
  const [postStatus, setPostStatus] = useState<PostStatus>(editingPost ? getPostStatus(editingPost) : 'published');
  const [publishedAt, setPublishedAt] = useState<string | null>(editingPost?.publishedAt ?? null);
  const [tone, setTone] = useState(editingPost?.tone ?? 'ink');
  const [excerpt, setExcerpt] = useState(editingPost?.excerpt ?? '');
  const [tags, setTags] = useState<string[]>(editingPost?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState(editingPost ? getPostMarkdown(editingPost) : '');
  const [seoTitle, setSeoTitle] = useState(editingPost?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(editingPost?.seoDescription ?? '');
  const [coverImage, setCoverImage] = useState(editingPost?.coverImage ?? '');
  const authorName = normalizeOwnerName(settings.ownerName);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('wysiwyg');
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('clean');
  const [publishNotice, setPublishNotice] = useState('');
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState('');
  const [pendingDraft, setPendingDraft] = useState<ComposerDraft | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [showFormulaDialog, setShowFormulaDialog] = useState(false);
  const [formulaValue, setFormulaValue] = useState('E = mc^2');
  const [formulaMode, setFormulaMode] = useState<FormulaMode>('block');
  const [focusMode, setFocusMode] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState('');
  const [draggingHeadingId, setDraggingHeadingId] = useState('');
  const [isComposerImageDragging, setIsComposerImageDragging] = useState(false);
  const [composerImageUploadCount, setComposerImageUploadCount] = useState(0);
  const [composerImageNotice, setComposerImageNotice] = useState('');
  const [aiAgentStatus, setAiAgentStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [aiAgentNotice, setAiAgentNotice] = useState('');
  const [aiAgentSuggestion, setAiAgentSuggestion] = useState<ApiArticleMetadataSuggestion | null>(null);
  const markdownInputRef = useRef<HTMLTextAreaElement>(null);
  const mdxEditorRef = useRef<RichMarkdownEditorHandle>(null);
  const skipNextWysiwygSyncRef = useRef(false);
  const paperRef = useRef<HTMLElement>(null);
  const savedSnapshotRef = useRef('');
  const hydratedPostSnapshotRef = useRef('');
  const latestDraftRef = useRef<ComposerDraftData>({
    bodyMarkdown,
    category,
    composerMode,
    coverImage,
    date,
    excerpt,
    publishedAt,
    seoDescription,
    seoTitle,
    slug,
    status: postStatus,
    tags,
    title,
    tone,
  });
  const isEditing = Boolean(editingPost);
  const bodyCharacterCount = bodyMarkdown.replace(/\s/g, '').length;
  const paragraphCount = bodyMarkdown.trim() ? bodyMarkdown.trim().split(/\n{2,}/).length : 0;
  const headingCount = (bodyMarkdown.match(/^#{1,6}\s+/gm) ?? []).length;
  const titleStatus = title.trim() || '未命名文章';
  const outlineItems = useMemo(() => getMarkdownOutline(bodyMarkdown), [bodyMarkdown]);
  const existingTags = useMemo(() => collectExistingTags(posts), [posts]);
  const suggestedTags = existingTags.filter((tag) => !tags.includes(tag));
  const galleryImages = useMemo(
    () =>
      sortGalleryAlbums(galleryAlbums).flatMap((album) =>
        isSystemGalleryAlbum(album) ? [] : sortGalleryImages(album.images).map((image) => ({
          ...image,
          albumTitle: album.title,
        })),
      ),
    [galleryAlbums],
  );
  const coverImageOptions = useMemo(
    () =>
      sortGalleryAlbums(galleryAlbums).flatMap((album) =>
        sortGalleryImages(album.images).map((image) => ({
          ...image,
          albumTitle: album.title,
        })),
      ),
    [galleryAlbums],
  );
  function openFormulaDialog(nextMode: FormulaMode = 'block') {
    setFormulaMode(nextMode);
    setShowFormulaDialog(true);
  }

  const currentDraftData = useMemo<ComposerDraftData>(
    () => ({
      bodyMarkdown,
      category,
      composerMode,
      coverImage,
      date,
      excerpt,
      publishedAt,
      seoDescription,
      seoTitle,
      slug,
      status: postStatus,
      tags,
      title,
      tone,
    }),
    [bodyMarkdown, category, composerMode, coverImage, date, excerpt, postStatus, publishedAt, seoDescription, seoTitle, slug, tags, title, tone],
  );
  const currentSnapshot = useMemo(() => createComposerSnapshot(currentDraftData), [currentDraftData]);

  async function saveDraftSnapshot(data = latestDraftRef.current, savedAt = new Date().toISOString()) {
    if (draftStatus === 'published') {
      return;
    }

    const nextDraft: ComposerDraft = {
      bodyMarkdown: data.bodyMarkdown,
      category: data.category,
      composerMode: data.composerMode,
      coverImage: data.coverImage,
      date: data.date,
      excerpt: data.excerpt,
      publishedAt: data.publishedAt,
      savedAt,
      seoDescription: data.seoDescription,
      seoTitle: data.seoTitle,
      slug: data.slug,
      status: data.status,
      tags: data.tags,
      title: data.title,
      tone: data.tone,
    };

    try {
      const savedDraft = await saveAdminDraft(draftKey, nextDraft);
      window.localStorage.removeItem(draftKey);
      setLastDraftSavedAt(savedDraft?.savedAt || savedAt);
      setDraftStatus('draft-saved');
    } catch {
      writeComposerDraft(draftKey, nextDraft);
      setLastDraftSavedAt(savedAt);
      setDraftStatus('local-draft-saved');
    }

    savedSnapshotRef.current = createComposerSnapshot(data);
  }

  function updateDraftField(nextData: Partial<ComposerDraftData>, options: { persistImmediately?: boolean } = {}) {
    latestDraftRef.current = {
      ...latestDraftRef.current,
      ...nextData,
    };
    setDraftStatus('dirty');

    if (options.persistImmediately) {
      void saveDraftSnapshot(latestDraftRef.current);
    }
  }

  function updateTitle(nextTitle: string) {
    const nextSlug = slugTouched ? slug : nextTitle.trim() ? slugifyPostTitle(nextTitle) : '';

    setTitle(nextTitle);
    if (!slugTouched) {
      setSlug(nextSlug);
    }
    updateDraftField({ slug: nextSlug, title: nextTitle }, { persistImmediately: true });
  }

  function updateBodyMarkdown(nextMarkdown: string) {
    setBodyMarkdown(nextMarkdown);
    updateDraftField({ bodyMarkdown: nextMarkdown }, { persistImmediately: true });
  }

  function updateBodyMarkdownFromWysiwyg(nextMarkdown: string) {
    skipNextWysiwygSyncRef.current = true;
    updateBodyMarkdown(nextMarkdown);
  }

  function updateComposerMode(nextMode: SetStateAction<ComposerMode>) {
    setComposerMode((currentMode) => {
      const resolvedMode = typeof nextMode === 'function' ? nextMode(currentMode) : nextMode;
      updateDraftField({ composerMode: resolvedMode });
      return resolvedMode;
    });
  }

  function updateMetaField<K extends keyof ComposerDraftData>(
    key: K,
    value: ComposerDraftData[K],
    setter: Dispatch<SetStateAction<ComposerDraftData[K]>>,
  ) {
    setter(value);
    updateDraftField({ [key]: value } as Pick<ComposerDraftData, K>, { persistImmediately: true });
  }

  async function savePost() {
    const trimmedTitle = title.trim();
    const normalizedBodyMarkdown = normalizeMarkdown(bodyMarkdown);

    if (!trimmedTitle) {
      return false;
    }

    const nextPost: Post = {
      slug: createUniqueSlug(posts, slug || trimmedTitle, editingPost?.slug),
      title: trimmedTitle,
      excerpt: excerpt.trim(),
      category: category || defaultCategory,
      authorName,
      date: date.trim() || formatToday(),
      status: postStatus,
      publishedAt: postStatus === 'published' ? publishedAt || new Date().toISOString() : publishedAt || null,
      tone,
      tags: normalizeTags(tags),
      body: [normalizedBodyMarkdown],
      bodyMarkdown: normalizedBodyMarkdown,
      seoTitle: seoTitle.trim(),
      seoDescription: seoDescription.trim(),
      coverImage: coverImage.trim(),
    };

    if (editingPost) {
      const saved = await onUpdatePost(editingPost.slug, nextPost);
      if (!saved) {
        setPublishNotice('服务器保存失败。内容已保留为本地未同步草稿，尚未同步到服务器或公开发布。请确认后台服务后重试保存。');
        setDraftStatus('local-draft-saved');
        await saveDraftSnapshot(currentDraftData);
        return false;
      }
    } else {
      const saved = await onCreatePost(nextPost);
      if (!saved) {
        setPublishNotice('服务器保存失败。内容已保留为本地未同步草稿，尚未同步到服务器或公开发布。请确认后台服务后重试保存。');
        setDraftStatus('local-draft-saved');
        await saveDraftSnapshot(currentDraftData);
        return false;
      }
    }

    setPublishNotice('');
    clearComposerDraft(draftKey);
    void clearAdminDraft(draftKey).catch(() => undefined);
    savedSnapshotRef.current = currentSnapshot;
    setDraftStatus('published');
    return true;
  }

  async function generateArticleMetadataSuggestion() {
    if (aiAgentStatus === 'generating') {
      return;
    }

    const normalizedBodyMarkdown = normalizeMarkdown(bodyMarkdown);
    if (normalizedBodyMarkdown.replace(/\s/g, '').length < 20) {
      setAiAgentStatus('error');
      setAiAgentNotice('正文内容太少，请先补充正文后再生成。');
      setAiAgentSuggestion(null);
      setDetailsOpen(true);
      return;
    }

    setAiAgentStatus('generating');
    setAiAgentNotice('');
    setAiAgentSuggestion(null);
    setDetailsOpen(true);
    try {
      const suggestion = await generateAdminArticleMetadata({
        title,
        excerpt,
        category,
        tags,
        bodyMarkdown: normalizedBodyMarkdown,
      });
      setAiAgentSuggestion(suggestion);
      setAiAgentStatus('ready');
    } catch (error) {
      setAiAgentStatus('error');
      setAiAgentNotice(
        error instanceof ApiError
          ? 'AI-AGENT 暂时无法生成，请检查 LLM 配置、API Key 或服务商支持情况。'
          : 'AI-AGENT 暂时无法生成，请稍后重试。',
      );
    }
  }

  function applyArticleMetadataSuggestion() {
    if (!aiAgentSuggestion) {
      return;
    }

    updateTitle(aiAgentSuggestion.title);
    updateMetaField('excerpt', aiAgentSuggestion.excerpt, setExcerpt);
    updateMetaField('seoTitle', aiAgentSuggestion.seoTitle, setSeoTitle);
    updateMetaField('seoDescription', aiAgentSuggestion.seoDescription, setSeoDescription);
    setAiAgentStatus('idle');
    setAiAgentSuggestion(null);
    setAiAgentNotice('AI-AGENT 结果已应用到发布信息。');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void savePost();
  }

  function insertMarkdown(snippet: string, selectionOffset = 0) {
    const textarea = markdownInputRef.current;
    const selectionStart = textarea?.selectionStart ?? bodyMarkdown.length;
    const selectionEnd = textarea?.selectionEnd ?? bodyMarkdown.length;
    const selectedText = bodyMarkdown.slice(selectionStart, selectionEnd);
    const nextSnippet = snippet.includes('{{selection}}')
      ? snippet.replace('{{selection}}', selectedText || '内容')
      : snippet;
    const nextBody = `${bodyMarkdown.slice(0, selectionStart)}${nextSnippet}${bodyMarkdown.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + nextSnippet.length + selectionOffset;

    updateBodyMarkdown(nextBody);
    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    }, 0);
  }

  function createFormulaMarkdown(value: string, mode: FormulaMode) {
    const formula = value.trim();
    if (mode === 'inline') {
      return `$${formula.replace(/\s*\n+\s*/g, ' ')}$`;
    }

    return `\n$$\n${formula}\n$$\n`;
  }

  function insertFormulaMarkdown() {
    const formula = formulaValue.trim();
    if (!formula) {
      return;
    }

    const snippet = createFormulaMarkdown(formula, formulaMode);
    const textarea = markdownInputRef.current;
    const selectionStart = textarea?.selectionStart ?? bodyMarkdown.length;
    const selectionEnd = textarea?.selectionEnd ?? bodyMarkdown.length;
    const needsLeadingBreak =
      formulaMode === 'block' && selectionStart > 0 && !bodyMarkdown.slice(0, selectionStart).endsWith('\n');
    const nextSnippet = `${needsLeadingBreak ? '\n' : ''}${snippet}`;
    const nextMarkdown = `${bodyMarkdown.slice(0, selectionStart)}${nextSnippet}${bodyMarkdown.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + nextSnippet.length;

    if (composerMode === 'wysiwyg') {
      mdxEditorRef.current?.insertMarkdown(nextSnippet);
      setDraftStatus('dirty');
    } else {
      updateBodyMarkdown(nextMarkdown);
    }
    setShowFormulaDialog(false);

    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    }, 0);
  }

  function createImageMarkdown(image: GalleryImage) {
    return `![${escapeMarkdownAltText(image.title || '图片')}](${image.imageUrl})`;
  }

  function insertImageMarkdownBlock(snippet: string, options: { closeGalleryPicker?: boolean } = {}) {
    const normalizedSnippet = snippet.trim();
    if (!normalizedSnippet) {
      return;
    }

    const textarea = markdownInputRef.current;
    const selectionStart = textarea?.selectionStart ?? bodyMarkdown.length;
    const selectionEnd = textarea?.selectionEnd ?? bodyMarkdown.length;
    const needsLeadingBreak = selectionStart > 0 && !bodyMarkdown.slice(0, selectionStart).endsWith('\n');
    const nextSnippet = `${needsLeadingBreak ? '\n' : ''}\n${normalizedSnippet}\n`;
    const nextMarkdown = `${bodyMarkdown.slice(0, selectionStart)}${nextSnippet}${bodyMarkdown.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + nextSnippet.length;

    if (composerMode === 'wysiwyg') {
      mdxEditorRef.current?.insertMarkdown(nextSnippet);
      setDraftStatus('dirty');
    } else {
      updateBodyMarkdown(nextMarkdown);
    }
    if (options.closeGalleryPicker ?? true) {
      setShowGalleryPicker(false);
    }

    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    }, 0);
  }

  function insertGalleryImageMarkdown(image: GalleryImage) {
    insertImageMarkdownBlock(createImageMarkdown(image));
  }

  async function uploadAndInsertComposerImages(files: File[], source: 'paste' | 'drop') {
    const imageFiles = files.filter(isSupportedComposerImageFile);
    if (imageFiles.length === 0) {
      const hasUnsupportedImage = files.some((file) => file.type.startsWith('image/'));
      if (hasUnsupportedImage) {
        setComposerImageNotice('仅支持 JPG、PNG、WebP 和 GIF 图片。');
      }
      return;
    }

    setIsComposerImageDragging(false);
    setComposerImageUploadCount(imageFiles.length);
    setComposerImageNotice(`正在上传 ${imageFiles.length} 张图片...`);

    try {
      const uploadedImages = await onUploadImages(imageFiles);
      if (uploadedImages.length === 0) {
        setComposerImageNotice('图片上传失败，请确认后台服务和登录状态。');
        return;
      }

      insertImageMarkdownBlock(uploadedImages.map(createImageMarkdown).join('\n\n'), { closeGalleryPicker: false });
      setComposerImageNotice(`${source === 'paste' ? '已粘贴' : '已拖入'} ${uploadedImages.length} 张图片。`);
    } catch {
      setComposerImageNotice('图片上传失败，请确认后台服务和登录状态。');
    } finally {
      setComposerImageUploadCount(0);
    }
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLElement>) {
    const imageFiles = getImageFilesFromTransfer(event.clipboardData);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void uploadAndInsertComposerImages(imageFiles, 'paste');
  }

  function handleComposerDragEnter(event: ReactDragEvent<HTMLElement>) {
    if (!hasImageFileInTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setIsComposerImageDragging(true);
  }

  function handleComposerDragOver(event: ReactDragEvent<HTMLElement>) {
    if (!hasImageFileInTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsComposerImageDragging(true);
  }

  function handleComposerDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsComposerImageDragging(false);
  }

  function handleComposerDrop(event: ReactDragEvent<HTMLElement>) {
    const imageFiles = getImageFilesFromTransfer(event.dataTransfer);
    if (imageFiles.length === 0) {
      setIsComposerImageDragging(false);
      return;
    }

    event.preventDefault();
    void uploadAndInsertComposerImages(imageFiles, 'drop');
  }

  function wrapSelection(before: string, after = before, fallback = '内容') {
    const textarea = markdownInputRef.current;
    const selectionStart = textarea?.selectionStart ?? bodyMarkdown.length;
    const selectionEnd = textarea?.selectionEnd ?? bodyMarkdown.length;
    const selectedText = bodyMarkdown.slice(selectionStart, selectionEnd) || fallback;
    const nextSnippet = `${before}${selectedText}${after}`;
    const nextBody = `${bodyMarkdown.slice(0, selectionStart)}${nextSnippet}${bodyMarkdown.slice(selectionEnd)}`;
    const cursorStart = selectionStart + before.length;
    const cursorEnd = cursorStart + selectedText.length;

    updateBodyMarkdown(nextBody);
    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(cursorStart, cursorEnd);
    }, 0);
  }

  function insertLink() {
    wrapSelection('[', '](https://)', '链接文字');
  }

  function addTags(nextValues: string[]) {
    const nextTags = normalizeTags([...tags, ...nextValues]);
    if (nextTags.length === tags.length) {
      return;
    }

    setTags(nextTags);
    updateDraftField({ tags: nextTags }, { persistImmediately: true });
  }

  function removeTag(tagToRemove: string) {
    const nextTags = tags.filter((tag) => tag !== tagToRemove);

    setTags(nextTags);
    updateDraftField({ tags: nextTags }, { persistImmediately: true });
  }

  function commitTagInput() {
    const nextTags = splitTagInput(tagInput);
    if (nextTags.length === 0) {
      return;
    }

    addTags(nextTags);
    setTagInput('');
  }

  function handleTagInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault();
      commitTagInput();
    }

    if (event.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      event.preventDefault();
      removeTag(tags[tags.length - 1]);
    }
  }

  function restoreDraft(draft: ComposerDraft) {
    const restoredData: ComposerDraftData = {
      bodyMarkdown: draft.bodyMarkdown,
      category: draft.category || defaultCategory,
      composerMode: draft.composerMode,
      coverImage: draft.coverImage || '',
      date: draft.date || formatToday(),
      excerpt: draft.excerpt,
      publishedAt: draft.publishedAt ?? null,
      seoDescription: draft.seoDescription || '',
      seoTitle: draft.seoTitle || '',
      slug: draft.slug,
      status: draft.status || 'published',
      tags: draft.tags,
      title: draft.title,
      tone: draft.tone || 'ink',
    };

    latestDraftRef.current = restoredData;
    savedSnapshotRef.current = createComposerSnapshot(restoredData);
    setTitle(draft.title);
    setSlug(draft.slug);
    setCategory(draft.category || defaultCategory);
    setDate(draft.date || formatToday());
    setPostStatus(draft.status || 'published');
    setPublishedAt(draft.publishedAt ?? null);
    setTone(draft.tone || 'ink');
    setExcerpt(draft.excerpt);
    setTags(draft.tags);
    setBodyMarkdown(draft.bodyMarkdown);
    setSeoTitle(draft.seoTitle || '');
    setSeoDescription(draft.seoDescription || '');
    setCoverImage(draft.coverImage || '');
    setComposerMode(draft.composerMode);
    setLastDraftSavedAt(draft.savedAt);
    setDraftStatus('draft-saved');
    setPendingDraft(null);
    mdxEditorRef.current?.setMarkdown(draft.bodyMarkdown);
  }

  function discardDraft() {
    clearComposerDraft(draftKey);
    void clearAdminDraft(draftKey).catch(() => undefined);
    setPendingDraft(null);
  }

  function closeDraftPrompt() {
    setPendingDraft(null);
  }

  function applyShortcut(event: KeyboardEvent | React.KeyboardEvent) {
    if (event.key === 'Escape' && showFormulaDialog) {
      event.preventDefault();
      setShowFormulaDialog(false);
      return true;
    }

    if (event.key === 'Escape' && pendingDraft) {
      event.preventDefault();
      closeDraftPrompt();
      return true;
    }

    if (event.key === 'Escape' && focusMode) {
      event.preventDefault();
      setFocusMode(false);
      return true;
    }

    const modifierPressed = event.metaKey || event.ctrlKey;
    if (!modifierPressed) {
      return false;
    }

    const key = event.key.toLowerCase();
    if (key === 's') {
      event.preventDefault();
      savePost();
      return true;
    }

    if (key === '/') {
      event.preventDefault();
      setShowShortcutHelp((visible) => !visible);
      return true;
    }

    if (key === 'p') {
      event.preventDefault();
      updateComposerMode((mode) => (mode === 'split' ? 'wysiwyg' : 'split'));
      return true;
    }

    if (key === 'f') {
      event.preventDefault();
      setShowFindReplace(true);
      return true;
    }

    if (key === 'h') {
      event.preventDefault();
      setShowFindReplace(true);
      return true;
    }

    if (composerMode === 'wysiwyg') {
      return false;
    }

    if (key === 'b') {
      event.preventDefault();
      wrapSelection('**');
      return true;
    }

    if (key === 'i') {
      event.preventDefault();
      wrapSelection('*');
      return true;
    }

    if (key === 'e') {
      event.preventDefault();
      wrapSelection('`');
      return true;
    }

    if (key === 'k') {
      event.preventDefault();
      insertLink();
      return true;
    }

    return false;
  }

  function handleMarkdownKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (applyShortcut(event)) {
      return;
    }

    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectedText = bodyMarkdown.slice(selectionStart, selectionEnd);
    const autoPairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '`': '`',
    };

    if (event.key === '*' && bodyMarkdown.slice(selectionStart - 1, selectionStart) === '*') {
      event.preventDefault();
      const nextBody = `${bodyMarkdown.slice(0, selectionStart - 1)}**${selectedText}**${bodyMarkdown.slice(selectionEnd)}`;
      updateBodyMarkdown(nextBody);
      window.setTimeout(() => textarea.setSelectionRange(selectionStart + 1, selectionStart + 1 + selectedText.length), 0);
      return;
    }

    if (event.key === '`' && bodyMarkdown.slice(selectionStart - 2, selectionStart) === '``') {
      event.preventDefault();
      const nextSnippet = '```\n\n```';
      const nextBody = `${bodyMarkdown.slice(0, selectionStart - 2)}${nextSnippet}${bodyMarkdown.slice(selectionEnd)}`;
      updateBodyMarkdown(nextBody);
      window.setTimeout(() => textarea.setSelectionRange(selectionStart + 2, selectionStart + 2), 0);
      return;
    }

    if (autoPairs[event.key]) {
      event.preventDefault();
      const closing = autoPairs[event.key];
      const nextBody = `${bodyMarkdown.slice(0, selectionStart)}${event.key}${selectedText}${closing}${bodyMarkdown.slice(selectionEnd)}`;
      updateBodyMarkdown(nextBody);
      window.setTimeout(() => textarea.setSelectionRange(selectionStart + 1, selectionStart + 1 + selectedText.length), 0);
    }
  }

  function jumpToHeading(item: OutlineItem) {
    setActiveHeadingId(item.id);

    if (composerMode === 'wysiwyg') {
      updateComposerMode('markdown');
      window.setTimeout(() => jumpToHeading(item), 0);
      return;
    }

    const textarea = markdownInputRef.current;
    if (!textarea) {
      return;
    }

    const offset = getLineStartOffset(bodyMarkdown, item.lineIndex);
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = Math.max(0, (item.lineIndex - 4) * 30);
  }

  function handleOutlineDrop(targetItem: OutlineItem) {
    const sourceItem = outlineItems.find((item) => item.id === draggingHeadingId);
    setDraggingHeadingId('');
    if (!sourceItem || sourceItem.id === targetItem.id) {
      return;
    }

    const nextMarkdown = moveMarkdownHeadingBlock(bodyMarkdown, sourceItem.lineIndex, targetItem.lineIndex);
    updateBodyMarkdown(nextMarkdown);
    mdxEditorRef.current?.setMarkdown(nextMarkdown);
  }

  function findNextMatch() {
    if (!findQuery) {
      return;
    }

    const textarea = markdownInputRef.current;
    const fromIndex = textarea ? textarea.selectionEnd : 0;
    const nextIndex = bodyMarkdown.indexOf(findQuery, fromIndex);
    const matchIndex = nextIndex >= 0 ? nextIndex : bodyMarkdown.indexOf(findQuery);
    if (matchIndex < 0) {
      return;
    }

    updateComposerMode('markdown');
    window.setTimeout(() => {
      markdownInputRef.current?.focus();
      markdownInputRef.current?.setSelectionRange(matchIndex, matchIndex + findQuery.length);
    }, 0);
  }

  function replaceCurrentMatch() {
    const textarea = markdownInputRef.current;
    if (!findQuery || !textarea) {
      findNextMatch();
      return;
    }

    const selectedText = bodyMarkdown.slice(textarea.selectionStart, textarea.selectionEnd);
    if (selectedText !== findQuery) {
      findNextMatch();
      return;
    }

    const nextMarkdown = `${bodyMarkdown.slice(0, textarea.selectionStart)}${replaceValue}${bodyMarkdown.slice(textarea.selectionEnd)}`;
    updateBodyMarkdown(nextMarkdown);
    window.setTimeout(() => {
      const nextOffset = textarea.selectionStart + replaceValue.length;
      markdownInputRef.current?.focus();
      markdownInputRef.current?.setSelectionRange(nextOffset, nextOffset);
    }, 0);
  }

  function replaceAllMatches() {
    if (!findQuery) {
      return;
    }

    updateBodyMarkdown(bodyMarkdown.split(findQuery).join(replaceValue));
  }

  useEffect(() => {
    latestDraftRef.current = currentDraftData;
  }, [currentDraftData]);

  useEffect(() => {
    savedSnapshotRef.current = currentSnapshot;
  }, []);

  useEffect(() => {
    if (!editingPost) {
      return;
    }

    const nextBodyMarkdown = getPostMarkdown(editingPost);
    const nextData: ComposerDraftData = {
      bodyMarkdown: nextBodyMarkdown,
      category: editingPost.category || defaultCategory,
      composerMode,
      coverImage: editingPost.coverImage || '',
      date: editingPost.date || formatToday(),
      excerpt: editingPost.excerpt || '',
      publishedAt: editingPost.publishedAt ?? null,
      seoDescription: editingPost.seoDescription || '',
      seoTitle: editingPost.seoTitle || '',
      slug: editingPost.slug,
      status: getPostStatus(editingPost),
      tags: editingPost.tags,
      title: editingPost.title,
      tone: editingPost.tone || 'ink',
    };
    const nextPostSnapshot = createComposerSnapshot(nextData);
    const shouldHydrate =
      !hydratedPostSnapshotRef.current || currentSnapshot === hydratedPostSnapshotRef.current;

    if (!shouldHydrate || hydratedPostSnapshotRef.current === nextPostSnapshot) {
      return;
    }

    hydratedPostSnapshotRef.current = nextPostSnapshot;
    latestDraftRef.current = nextData;
    savedSnapshotRef.current = nextPostSnapshot;
    setTitle(nextData.title);
    setSlug(nextData.slug);
    setSlugTouched(true);
    setCategory(nextData.category);
    setDate(nextData.date);
    setPostStatus(nextData.status);
    setPublishedAt(nextData.publishedAt);
    setTone(nextData.tone);
    setExcerpt(nextData.excerpt);
    setTags(nextData.tags);
    setBodyMarkdown(nextBodyMarkdown);
    setSeoTitle(nextData.seoTitle);
    setSeoDescription(nextData.seoDescription);
    setCoverImage(nextData.coverImage);
    setDraftStatus('clean');
    mdxEditorRef.current?.setMarkdown(nextBodyMarkdown);
  }, [composerMode, currentSnapshot, defaultCategory, editingPost]);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const serverDraft = await fetchAdminDraft(draftKey);
        if (!cancelled && serverDraft?.bodyMarkdown) {
          setPendingDraft(serverDraft);
          return;
        }
      } catch {
        // 服务端草稿不可用时继续尝试本地 fallback。
      }

      const draft = readComposerDraft(draftKey);
      if (!cancelled && draft) {
        setPendingDraft(draft);
      }
    }

    loadDraft();
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  useEffect(() => {
    if (currentSnapshot !== savedSnapshotRef.current && draftStatus === 'clean') {
      setDraftStatus('dirty');
    }
  }, [currentSnapshot, draftStatus]);

  useEffect(() => {
    if (currentSnapshot === savedSnapshotRef.current || draftStatus === 'published') {
      return undefined;
    }

    setDraftStatus('saving');
    const timeoutId = window.setTimeout(() => {
      void saveDraftSnapshot();
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [
    bodyMarkdown,
    category,
    composerMode,
    coverImage,
    currentSnapshot,
    date,
    draftKey,
    draftStatus,
    excerpt,
    postStatus,
    publishedAt,
    seoDescription,
    seoTitle,
    slug,
    tags,
    title,
    tone,
  ]);

  useEffect(() => {
    function warnBeforeLeave(event: BeforeUnloadEvent) {
      if (currentSnapshot === savedSnapshotRef.current || draftStatus === 'published') {
        return;
      }

      void saveDraftSnapshot();
      event.preventDefault();
      event.returnValue = '';
    }

    function saveBeforePageHide() {
      if (currentSnapshot !== savedSnapshotRef.current && draftStatus !== 'published') {
        void saveDraftSnapshot();
      }
    }

    function saveWhenHidden() {
      if (document.visibilityState === 'hidden') {
        saveBeforePageHide();
      }
    }

    window.addEventListener('beforeunload', warnBeforeLeave);
    window.addEventListener('pagehide', saveBeforePageHide);
    document.addEventListener('visibilitychange', saveWhenHidden);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeave);
      window.removeEventListener('pagehide', saveBeforePageHide);
      document.removeEventListener('visibilitychange', saveWhenHidden);
    };
  }, [
    bodyMarkdown,
    category,
    composerMode,
    coverImage,
    currentSnapshot,
    date,
    draftKey,
    draftStatus,
    excerpt,
    postStatus,
    publishedAt,
    seoDescription,
    seoTitle,
    slug,
    tags,
    title,
    tone,
  ]);

  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      applyShortcut(event);
    }

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [applyShortcut]);

  useEffect(() => {
    if (composerMode !== 'wysiwyg') {
      return;
    }

    if (skipNextWysiwygSyncRef.current) {
      skipNextWysiwygSyncRef.current = false;
      return;
    }

    mdxEditorRef.current?.setMarkdown(bodyMarkdown);
  }, [bodyMarkdown, composerMode]);

  useEffect(() => {
    document.body.classList.toggle('composer-focus-active', focusMode);
    return () => document.body.classList.remove('composer-focus-active');
  }, [focusMode]);

  useEffect(() => {
    function handleScroll() {
      if (outlineItems.length === 0) {
        return;
      }

      const approximateLine = Math.floor(window.scrollY / 30);
      const activeItem =
        [...outlineItems].reverse().find((item) => item.lineIndex <= approximateLine) || outlineItems[0];
      setActiveHeadingId(activeItem.id);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [outlineItems]);

  return (
    <section
      className={`admin-composer typora-shell ${detailsOpen ? 'details-open' : 'details-closed'} ${
        outlineOpen ? 'outline-open' : 'outline-closed'
      } ${
        focusMode ? 'focus-mode' : ''
      }`}
      aria-label={isEditing ? '编辑文章' : '创建文章'}
    >
      <form className={`composer-form typora-composer ${composerMode}-mode`} onSubmit={handleSubmit}>
        <header className="typora-topbar">
          <div className="typora-brand-group">
            <a className="brand typora-brand" href="/" aria-label={`返回${siteName}首页`}>
              <span>{siteName}</span>
              <small>内容管理</small>
            </a>
            <a className="typora-return-link" href="/">
              返回首页
            </a>
            <div className="typora-doc-state">
              <span>{draftStatusLabel(draftStatus)}</span>
              <strong>{titleStatus}</strong>
              {lastDraftSavedAt && <small>{formatDraftSavedAt(lastDraftSavedAt)}</small>}
            </div>
          </div>

          <div className="typora-mode-tabs" aria-label="编辑模式">
            {[
              ['wysiwyg', '所见即所得', Pencil],
              ['markdown', '纯编辑', Code2],
              ['split', '左右分屏', Columns2],
            ].map(([mode, label, Icon]) => (
              <button
                aria-pressed={composerMode === mode}
                key={mode as string}
                    onClick={() => updateComposerMode(mode as ComposerMode)}
                type="button"
              >
                <Icon size={16} />
                {label as string}
              </button>
            ))}
          </div>

          <div className="typora-top-actions">
            <div className="writing-metrics" aria-label="写作统计">
              <span>{bodyCharacterCount} 字</span>
              <span>{paragraphCount} 段</span>
              <span>{headingCount} 标题</span>
            </div>
            <button
              className="typora-icon-action"
              type="button"
              onClick={() => void generateArticleMetadataSuggestion()}
              disabled={aiAgentStatus === 'generating'}
              title="AI 生成标题/摘要"
              aria-label="AI 生成标题和摘要"
            >
              <Bot size={17} />
            </button>
            <button
              className="typora-icon-action"
              type="button"
              onClick={onThemeToggle}
              title="切换明暗模式"
              aria-label="切换明暗模式"
            >
              {colorScheme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button
              className="typora-icon-action"
              type="button"
              onClick={() => setOutlineOpen((open) => !open)}
              aria-pressed={outlineOpen}
              title={outlineOpen ? '收起大纲' : '打开大纲'}
            >
              <List size={17} />
            </button>
            <button
              className="typora-icon-action"
              type="button"
              onClick={() => setFocusMode((enabled) => !enabled)}
              aria-pressed={focusMode}
              title="专注模式"
            >
              <Focus size={17} />
            </button>
            <button
              className="typora-icon-action"
              type="button"
              onClick={() => setShowShortcutHelp(true)}
              title="快捷键"
            >
              <Keyboard size={17} />
            </button>
            <button
              className="typora-icon-action"
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-pressed={detailsOpen}
              title={detailsOpen ? '收起发布设置' : '打开发布设置'}
            >
              <FileText size={17} />
            </button>
            <a className="secondary-action" href={returnPath}>
              取消
            </a>
            <button className="primary-action" type="submit">
              <Save size={17} />
              {isEditing ? '保存修改' : '保存文章'}
            </button>
          </div>
        </header>

        {focusMode && (
          <div className="focus-floating-status" aria-label="专注模式状态">
            <div>
              <span>{draftStatusLabel(draftStatus)}</span>
              {lastDraftSavedAt && <small>{formatDraftSavedAt(lastDraftSavedAt)}</small>}
            </div>
            <button
              className="focus-exit-action"
              type="button"
              onClick={() => setFocusMode(false)}
              title="退出专注模式"
            >
              <X size={16} />
              退出专注
            </button>
          </div>
        )}

        {publishNotice && <p className="composer-sync-warning" role="alert">{publishNotice}</p>}

        <div className="typora-layout">
          {outlineOpen && (
            <aside className="writer-outline" aria-label="文章大纲">
              <div className="writer-outline-head">
                <strong>大纲</strong>
                <span>{outlineItems.length} 节</span>
              </div>
              {outlineItems.length > 0 ? (
                <div className="outline-list">
                  {outlineItems.map((item) => (
                    <button
                      aria-current={activeHeadingId === item.id ? 'true' : undefined}
                      className={`outline-item level-${item.level}${item.warning ? ' has-warning' : ''}`}
                      draggable
                      key={item.id}
                      onClick={() => jumpToHeading(item)}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => setDraggingHeadingId(item.id)}
                      onDrop={() => handleOutlineDrop(item)}
                      title={item.warning || item.title}
                      type="button"
                    >
                      <span>H{item.level}</span>
                      <strong>{item.title}</strong>
                    </button>
                  ))}
                </div>
              ) : (
                <p>用 ## 和 ### 写出骨架。</p>
              )}
            </aside>
          )}

          <main
            className={`typora-paper ${isComposerImageDragging ? 'is-image-dragging' : ''}`}
            aria-label="正文写作区"
            onDragEnter={handleComposerDragEnter}
            onDragLeave={handleComposerDragLeave}
            onDragOver={handleComposerDragOver}
            onDrop={handleComposerDrop}
            onPaste={handleComposerPaste}
            ref={paperRef}
          >
            <input
              className="typora-title-input"
              value={title}
              onChange={(event) => updateTitle(event.target.value)}
              placeholder="未命名文章"
              aria-label="文章标题"
              autoFocus
            />

            <div className="typora-subline">
              <span>{category || defaultCategory}</span>
              <span>{authorName}</span>
              <span>{date || formatToday()}</span>
            </div>

            {(isComposerImageDragging || composerImageUploadCount > 0) && (
              <div className="composer-drop-layer" aria-live="polite">
                <ImageIcon size={28} />
                <strong>{composerImageUploadCount > 0 ? '正在上传图片' : '松开上传图片'}</strong>
                {composerImageUploadCount > 0 && <span>{composerImageUploadCount} 张</span>}
              </div>
            )}

            {composerImageNotice && (
              <div className="composer-image-notice" role="status">
                {composerImageNotice}
              </div>
            )}

            <div className="typora-toolbar" aria-label="Markdown 工具栏">
              <button
                type="button"
                onClick={() => void generateArticleMetadataSuggestion()}
                disabled={aiAgentStatus === 'generating'}
                title="AI 生成标题/摘要"
              >
                <Bot size={17} />
              </button>
              <button type="button" onClick={() => insertMarkdown('## {{selection}}', -2)} title="二级标题">
                <Heading2 size={17} />
              </button>
              <button type="button" onClick={() => insertMarkdown('> {{selection}}', -2)} title="引用">
                <Quote size={17} />
              </button>
              <button type="button" onClick={() => insertMarkdown('\n- {{selection}}\n', -1)} title="无序列表">
                <List size={17} />
              </button>
              <button type="button" onClick={() => insertMarkdown('\n1. {{selection}}\n', -1)} title="有序列表">
                <ListOrdered size={17} />
              </button>
              <button type="button" onClick={() => wrapSelection('**')} title="加粗">
                B
              </button>
              <button type="button" onClick={() => wrapSelection('*')} title="斜体">
                I
              </button>
              <button type="button" onClick={() => wrapSelection('`')} title="行内代码">
                <Code2 size={17} />
              </button>
              <button type="button" onClick={insertLink} title="插入链接">
                <Send size={17} />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('\n```ts\nconsole.log(\"Hello, Guzhouyue\");\n```\n')}
                title="代码块"
              >
                <Code2 size={17} />
              </button>
              <button type="button" onClick={() => openFormulaDialog('block')} title="数学公式">
                <Sigma size={17} />
              </button>
              <button type="button" onClick={() => setShowGalleryPicker(true)} title="插入图库图片">
                <ImageIcon size={17} />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('\n| 名称 | 说明 |\n| --- | --- |\n| Markdown | 支持表格 |\n')}
                title="表格"
              >
                <Table2 size={17} />
              </button>
            </div>

            {composerMode === 'wysiwyg' && (
              <Suspense fallback={<div className="typora-editor-loading">正在加载富文本编辑器...</div>}>
                <RichMarkdownEditor
                  markdown={bodyMarkdown}
                  onChange={(nextMarkdown, initialNormalize) => {
                    if (!initialNormalize) {
                      const normalizedMarkdown = normalizeLooseCodeFences(nextMarkdown);
                      if (normalizedMarkdown !== nextMarkdown) {
                        mdxEditorRef.current?.setMarkdown(normalizedMarkdown);
                      }
                      updateBodyMarkdownFromWysiwyg(normalizedMarkdown);
                    }
                  }}
                  onInsertFormula={() => openFormulaDialog('block')}
                  onInsertGalleryImage={() => setShowGalleryPicker(true)}
                  ref={mdxEditorRef}
                />
              </Suspense>
            )}

            {composerMode === 'markdown' && (
              <textarea
                className="typora-editor"
                ref={markdownInputRef}
                value={bodyMarkdown}
                onChange={(event) => updateBodyMarkdown(event.target.value)}
                onKeyDown={handleMarkdownKeyDown}
                placeholder={'从这里开始写。\n\n## 小标题\n\n支持 **加粗**、列表、表格、公式：$a^2 + b^2 = c^2$。\n\n```tsx\nfunction Example() {\n  return <code>代码展示</code>;\n}\n```'}
                spellCheck={false}
              />
            )}

            {composerMode === 'split' && (
              <div className="typora-split">
                <textarea
                  className="typora-editor"
                  ref={markdownInputRef}
                  value={bodyMarkdown}
                  onChange={(event) => updateBodyMarkdown(event.target.value)}
                  onKeyDown={handleMarkdownKeyDown}
                  spellCheck={false}
                />
                <article className="typora-preview" aria-label="文章阅读预览">
                  <MarkdownBody markdown={normalizeMarkdown(bodyMarkdown)} />
                </article>
              </div>
            )}
          </main>

          <aside className="composer-meta typora-details" aria-label="文章发布信息" aria-hidden={!detailsOpen}>
            <div className="typora-details-head">
              <div>
                <span>发布信息</span>
                <strong>{titleStatus}</strong>
              </div>
              <button
                className="typora-icon-action"
                type="button"
                onClick={() => setDetailsOpen(false)}
                title="收起发布设置"
              >
                <X size={17} />
              </button>
            </div>

            <div className="composer-meta-fields">
              <section className="ai-agent-panel" aria-label="AI-AGENT 标题摘要生成">
                <header>
                  <div>
                    <span>AI-AGENT</span>
                    <strong>标题、摘要与 SEO</strong>
                  </div>
                  <button
                    className="secondary-action"
                    disabled={aiAgentStatus === 'generating'}
                    type="button"
                    onClick={() => void generateArticleMetadataSuggestion()}
                  >
                    <Bot size={16} />
                    {aiAgentStatus === 'generating' ? '生成中' : '生成'}
                  </button>
                </header>
                {aiAgentNotice && (
                  <p className={`ai-agent-notice ${aiAgentStatus === 'error' ? 'is-error' : ''}`} role={aiAgentStatus === 'error' ? 'alert' : 'status'}>
                    {aiAgentNotice}
                  </p>
                )}
                {aiAgentSuggestion && (
                  <div className="ai-agent-preview">
                    <dl>
                      <div>
                        <dt>标题</dt>
                        <dd>{aiAgentSuggestion.title}</dd>
                      </div>
                      <div>
                        <dt>摘要</dt>
                        <dd>{aiAgentSuggestion.excerpt}</dd>
                      </div>
                      <div>
                        <dt>SEO 标题</dt>
                        <dd>{aiAgentSuggestion.seoTitle}</dd>
                      </div>
                      <div>
                        <dt>SEO 描述</dt>
                        <dd>{aiAgentSuggestion.seoDescription}</dd>
                      </div>
                    </dl>
                    <div className="ai-agent-actions">
                      <button className="primary-action" type="button" onClick={applyArticleMetadataSuggestion}>
                        应用全部
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => {
                          setAiAgentSuggestion(null);
                          setAiAgentStatus('idle');
                          setAiAgentNotice('');
                        }}
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                )}
              </section>
              <label>
                链接标识
                <input
                  value={slug}
                  onChange={(event) => {
                    const nextSlug = slugifyPostTitle(event.target.value);

                    setSlugTouched(true);
                    updateMetaField('slug', nextSlug, setSlug);
                  }}
                  placeholder="post-slug"
                />
              </label>
              <label>
                分类
                <select value={category} onChange={(event) => updateMetaField('category', event.target.value, setCategory)}>
                  {noteSections.length > 0 ? (
                    noteSections.map((section) => (
                      <option key={section.category} value={section.category}>
                        {section.category}
                      </option>
                    ))
                  ) : (
                    <option value="人间札记">人间札记</option>
                  )}
                </select>
              </label>
              <label>
                作者
                <input readOnly value={authorName} />
              </label>
              <label>
                日期
                <input value={date} onChange={(event) => updateMetaField('date', event.target.value, setDate)} />
              </label>
              <label>
                发布状态
                <select
                  value={postStatus}
                  onChange={(event) => updateMetaField('status', event.target.value as PostStatus, setPostStatus)}
                >
                  <option value="published">已发布</option>
                  <option value="draft">草稿</option>
                  <option value="archived">已归档</option>
                </select>
              </label>
              <label>
                发布时间
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(publishedAt)}
                  onChange={(event) => updateMetaField('publishedAt', fromDatetimeLocalValue(event.target.value), setPublishedAt)}
                />
              </label>
              <label>
                色调
                <select value={tone} onChange={(event) => updateMetaField('tone', event.target.value, setTone)}>
                  {['ink', 'pine', 'cinnabar', 'water'].map((nextTone) => (
                    <option key={nextTone} value={nextTone}>
                      {nextTone}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                摘要
                <textarea
                  rows={4}
                  value={excerpt}
                  onChange={(event) => updateMetaField('excerpt', event.target.value, setExcerpt)}
                  placeholder="给文章写一句简短摘要"
                />
              </label>
              <label>
                SEO 标题
                <input
                  maxLength={80}
                  value={seoTitle}
                  onChange={(event) => updateMetaField('seoTitle', event.target.value, setSeoTitle)}
                  placeholder="留空则使用文章标题"
                />
              </label>
              <label>
                SEO 描述
                <textarea
                  maxLength={180}
                  rows={3}
                  value={seoDescription}
                  onChange={(event) => updateMetaField('seoDescription', event.target.value, setSeoDescription)}
                  placeholder="留空则使用文章摘要"
                />
              </label>
              <div className="composer-cover-field">
                <label>
                  封面图 URL
                  <input
                    value={coverImage}
                    onChange={(event) => updateMetaField('coverImage', event.target.value, setCoverImage)}
                    placeholder="/uploads/gallery/example.webp"
                  />
                </label>
                <label>
                  从图库选择封面
                  <select
                    value={coverImageOptions.some((image) => image.imageUrl === coverImage) ? coverImage : ''}
                    onChange={(event) => updateMetaField('coverImage', event.target.value, setCoverImage)}
                  >
                    <option value="">不使用图库封面</option>
                    {coverImageOptions.map((image) => (
                      <option key={image.id} value={image.imageUrl}>
                        {image.title} · {image.albumTitle}
                      </option>
                    ))}
                  </select>
                </label>
                {coverImage && (
                  <div className="composer-cover-preview">
                    <img alt="" src={coverImage} />
                  </div>
                )}
              </div>
              <div className="tag-editor" aria-label="文章标签">
                <span>标签</span>
                <div className="tag-chip-input">
                  {tags.map((tag) => (
                    <button key={tag} type="button" onClick={() => removeTag(tag)} title={`移除 ${tag}`}>
                      {tag}
                      <X size={13} />
                    </button>
                  ))}
                  <input
                    value={tagInput}
                    onBlur={commitTagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder={tags.length > 0 ? '添加标签' : '写作，生活，夜色'}
                  />
                </div>
                {suggestedTags.length > 0 && (
                  <div className="tag-suggestions" aria-label="已有标签">
                    {suggestedTags.map((tag) => (
                      <button key={tag} type="button" onClick={() => addTags([tag])}>
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </form>

      {showShortcutHelp && (
        <div className="shortcut-layer" role="presentation" onMouseDown={() => setShowShortcutHelp(false)}>
          <section className="shortcut-panel" role="dialog" aria-modal="true" aria-label="快捷键说明" onMouseDown={(event) => event.stopPropagation()}>
            <div className="typora-details-head">
              <div>
                <span>Keyboard</span>
                <strong>快捷键</strong>
              </div>
              <button className="typora-icon-action" type="button" onClick={() => setShowShortcutHelp(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="shortcut-grid">
              {[
                ['Cmd/Ctrl + S', '保存'],
                ['Cmd/Ctrl + B', '加粗'],
                ['Cmd/Ctrl + I', '斜体'],
                ['Cmd/Ctrl + K', '链接'],
                ['Cmd/Ctrl + E', '行内代码'],
                ['Cmd/Ctrl + P', '预览/分屏'],
                ['Cmd/Ctrl + F', '查找'],
                ['Cmd/Ctrl + H', '替换'],
                ['Cmd/Ctrl + /', '快捷键说明'],
              ].map(([shortcut, label]) => (
                <div key={shortcut}>
                  <kbd>{shortcut}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {pendingDraft && (
        <div className="shortcut-layer draft-restore-layer" role="presentation" onMouseDown={closeDraftPrompt}>
          <section
            className="draft-restore-panel"
            role="dialog"
            aria-modal="true"
            aria-label="恢复未发布草稿"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="typora-details-head">
              <div>
                <span>Draft</span>
                <strong>发现未发布草稿</strong>
              </div>
              <button className="typora-icon-action" type="button" onClick={closeDraftPrompt} title="稍后处理">
                <X size={17} />
              </button>
            </div>

            <div className="draft-restore-copy">
              <p>这篇文章有一份本机草稿，可以继续上次的写作状态。</p>
              <dl>
                <div>
                  <dt>标题</dt>
                  <dd>{pendingDraft.title || '未命名文章'}</dd>
                </div>
                <div>
                  <dt>保存</dt>
                  <dd>{formatDraftSavedAt(pendingDraft.savedAt) || '刚刚'}</dd>
                </div>
              </dl>
            </div>

            <div className="draft-restore-actions">
              <button className="secondary-action" type="button" onClick={discardDraft}>
                丢弃草稿
              </button>
              <button className="primary-action" type="button" onClick={() => restoreDraft(pendingDraft)}>
                恢复草稿
              </button>
            </div>
          </section>
        </div>
      )}

      {showFormulaDialog && (
        <div className="shortcut-layer" role="presentation" onMouseDown={() => setShowFormulaDialog(false)}>
          <section
            className="formula-panel"
            role="dialog"
            aria-modal="true"
            aria-label="插入数学公式"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="typora-details-head">
              <div>
                <span>Formula</span>
                <strong>数学公式</strong>
              </div>
              <button className="typora-icon-action" type="button" onClick={() => setShowFormulaDialog(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="formula-mode-tabs" aria-label="公式类型">
              {[
                ['block', '块级公式'],
                ['inline', '行内公式'],
              ].map(([mode, label]) => (
                <button
                  aria-pressed={formulaMode === mode}
                  key={mode}
                  onClick={() => setFormulaMode(mode as FormulaMode)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              aria-label="公式内容"
              autoFocus
              onChange={(event) => setFormulaValue(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  insertFormulaMarkdown();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  setShowFormulaDialog(false);
                }
              }}
              placeholder="E = mc^2"
              rows={5}
              spellCheck={false}
              value={formulaValue}
            />

            <div className="formula-preview" aria-label="公式预览">
              <MarkdownBody markdown={createFormulaMarkdown(formulaValue || 'E = mc^2', formulaMode)} />
            </div>

            <div className="formula-actions">
              <button type="button" onClick={() => setShowFormulaDialog(false)}>
                取消
              </button>
              <button className="primary-action" type="button" onClick={insertFormulaMarkdown}>
                <Sigma size={17} />
                插入公式
              </button>
            </div>
          </section>
        </div>
      )}

      {showGalleryPicker && (
        <div className="shortcut-layer" role="presentation" onMouseDown={() => setShowGalleryPicker(false)}>
          <section
            className="gallery-picker-panel"
            role="dialog"
            aria-modal="true"
            aria-label="插入图库图片"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="typora-details-head">
              <div>
                <span>Gallery</span>
                <strong>插入图库图片</strong>
              </div>
              <button className="typora-icon-action" type="button" onClick={() => setShowGalleryPicker(false)}>
                <X size={17} />
              </button>
            </div>

            {galleryImages.length > 0 ? (
              <div className="gallery-picker-grid">
                {galleryImages.map((image) => (
                  <button key={image.id} type="button" onClick={() => insertGalleryImageMarkdown(image)}>
                    <img alt="" src={image.imageUrl} />
                    <span>
                      <strong>{image.title}</strong>
                      <small>{image.albumTitle}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state">图库还没有图片，请先到图库管理上传。</p>
            )}
          </section>
        </div>
      )}

      {showFindReplace && (
        <div className="find-replace-panel" role="dialog" aria-label="查找替换">
          <input
            aria-label="查找内容"
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                findNextMatch();
              }
            }}
            placeholder="查找"
            value={findQuery}
          />
          <input
            aria-label="替换为"
            onChange={(event) => setReplaceValue(event.target.value)}
            placeholder="替换为"
            value={replaceValue}
          />
          <button type="button" onClick={findNextMatch}>下一个</button>
          <button type="button" onClick={replaceCurrentMatch}>替换</button>
          <button type="button" onClick={replaceAllMatches}>全部</button>
          <button className="typora-icon-action" type="button" onClick={() => setShowFindReplace(false)}>
            <X size={17} />
          </button>
        </div>
      )}
    </section>
  );
}

function AdminNotesPanel({
  noteSections,
  onAddSection,
  onDeleteSection,
  onSectionChange,
  posts,
}: {
  noteSections: NoteSection[];
  onAddSection: () => void;
  onDeleteSection: (index: number) => void;
  onSectionChange: (index: number, section: NoteSection) => void;
  posts: Post[];
}) {
  return (
    <section className="admin-panel" aria-label="札记分类管理">
      <PanelHeader action={<button type="button" onClick={onAddSection}><Plus size={17} />新增札记</button>} title="札记分类" />
      <div className="note-editor-list">
        {noteSections.map((section, index) => {
          const count = posts.filter((post) => post.category === section.category).length;
          return (
            <div className="note-editor-row" key={section.id ?? `note-section-${index}`}>
              <label>
                名称
                <input
                  value={section.category}
                  onChange={(event) => onSectionChange(index, { ...section, category: event.target.value })}
                />
              </label>
              <label>
                描述
                <input
                  value={section.description}
                  onChange={(event) => onSectionChange(index, { ...section, description: event.target.value })}
                />
              </label>
              <span>{count} 篇</span>
              <button className="icon-button" type="button" onClick={() => onDeleteSection(index)} aria-label="删除札记分类">
                <Trash2 size={17} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AdminSeriesPanel({
  onAddSeries,
  onDeleteSeries,
  onSeriesChange,
  posts,
  seriesList,
}: {
  onAddSeries: () => void;
  onDeleteSeries: (index: number) => void;
  onSeriesChange: (index: number, series: FeaturedSeries) => void;
  posts: Post[];
  seriesList: FeaturedSeries[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(seriesList.length / adminSeriesPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const firstSeriesIndex = (safeCurrentPage - 1) * adminSeriesPerPage;
  const pagedSeries = seriesList.slice(firstSeriesIndex, safeCurrentPage * adminSeriesPerPage);
  const firstItemIndex = seriesList.length === 0 ? 0 : firstSeriesIndex + 1;
  const lastItemIndex = Math.min(seriesList.length, safeCurrentPage * adminSeriesPerPage);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  function addSeriesAndOpen() {
    onAddSeries();
    setCurrentPage(Math.max(1, Math.ceil((seriesList.length + 1) / adminSeriesPerPage)));
  }

  function movePost(series: FeaturedSeries, postIndex: number, direction: -1 | 1) {
    const targetIndex = postIndex + direction;
    if (targetIndex < 0 || targetIndex >= series.postSlugs.length) {
      return series;
    }

    const nextPostSlugs = [...series.postSlugs];
    const [currentSlug] = nextPostSlugs.splice(postIndex, 1);
    nextPostSlugs.splice(targetIndex, 0, currentSlug);

    return {
      ...series,
      postSlugs: nextPostSlugs,
    };
  }

  return (
    <section className="admin-panel" aria-label="专题管理">
      <PanelHeader action={<button type="button" onClick={addSeriesAndOpen}><Plus size={17} />新增专题</button>} title="专题管理" />
      <div className="series-editor-list">
        {seriesList.length > 0 ? (
          pagedSeries.map((series, pageIndex) => {
            const index = firstSeriesIndex + pageIndex;
            const selectedPosts = series.postSlugs
              .map((slug) => posts.find((post) => post.slug === slug))
              .filter((post): post is Post => Boolean(post));
            const selectablePosts = posts.filter((post) => !series.postSlugs.includes(post.slug));

            return (
              <article className="series-editor-card" key={series.id}>
                <div className="series-editor-fields">
                  <label>
                    专题标题
                    <input
                      value={series.title}
                      onChange={(event) => onSeriesChange(index, { ...series, title: event.target.value })}
                    />
                  </label>
                  <label>
                    专题主句
                    <input
                      value={series.lead}
                      onChange={(event) => onSeriesChange(index, { ...series, lead: event.target.value })}
                    />
                  </label>
                  <label>
                    专题说明
                    <textarea
                      rows={3}
                      value={series.body}
                      onChange={(event) => onSeriesChange(index, { ...series, body: event.target.value })}
                    />
                  </label>
                </div>

                <div className="series-post-picker">
                  <label>
                    添加文章
                    <select
                      value=""
                      onChange={(event) => {
                        const nextSlug = event.target.value;
                        if (!nextSlug) {
                          return;
                        }
                        onSeriesChange(index, { ...series, postSlugs: [...series.postSlugs, nextSlug] });
                      }}
                    >
                      <option value="">选择已有文章</option>
                      {selectablePosts.map((post) => (
                        <option key={post.slug} value={post.slug}>
                          {post.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="series-selected-posts" aria-label={`${series.title}已选文章`}>
                    {selectedPosts.length > 0 ? (
                      selectedPosts.map((post, postIndex) => (
                        <div className="series-selected-post" key={post.slug}>
                          <span>{String(postIndex + 1).padStart(2, '0')}</span>
                          <strong>{post.title}</strong>
                          <button
                            className="secondary-action"
                            disabled={postIndex === 0}
                            type="button"
                            onClick={() => onSeriesChange(index, movePost(series, postIndex, -1))}
                          >
                            上移
                          </button>
                          <button
                            className="secondary-action"
                            disabled={postIndex === selectedPosts.length - 1}
                            type="button"
                            onClick={() => onSeriesChange(index, movePost(series, postIndex, 1))}
                          >
                            下移
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() =>
                              onSeriesChange(index, {
                                ...series,
                                postSlugs: series.postSlugs.filter((slug) => slug !== post.slug),
                              })
                            }
                          >
                            移除
                          </button>
                        </div>
                      ))
                    ) : (
                      <p>还没有选择文章。</p>
                    )}
                  </div>
                </div>

                <div className="series-editor-footer">
                  <span>{selectedPosts.length} 篇文章</span>
                  <button className="danger-action" type="button" onClick={() => onDeleteSeries(index)}>
                    <Trash2 size={17} />
                    删除专题
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <p>暂无专题。</p>
          </div>
        )}
      </div>
      {seriesList.length > 0 && (
        <nav className="admin-pagination" aria-label="专题分页">
          <span>
            第 {firstItemIndex}-{lastItemIndex} 个，共 {seriesList.length} 个专题
          </span>
          <div>
            <button
              className="secondary-action"
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              上一页
            </button>
            <strong>
              {safeCurrentPage} / {totalPages}
            </strong>
            <button
              className="secondary-action"
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              type="button"
            >
              下一页
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}

function AdminGalleryPanel({
  albums,
  onAddAlbum,
  onAlbumChange,
  onDeleteAlbum,
  onDeleteImage,
  onDeleteImages,
  onImageChange,
  onMoveImage,
  onReplaceImageFile,
  onUploadImages,
}: {
  albums: GalleryAlbum[];
  onAddAlbum: () => void;
  onAlbumChange: (index: number, album: GalleryAlbum) => void;
  onDeleteAlbum: (index: number) => void;
  onDeleteImage: (albumIndex: number, imageIndex: number) => void;
  onDeleteImages: (albumIndex: number, imageIds: string[]) => void;
  onImageChange: (albumIndex: number, imageIndex: number, image: GalleryImage) => void;
  onMoveImage: (albumIndex: number, imageId: string, direction: -1 | 1) => void;
  onReplaceImageFile: (albumIndex: number, imageIndex: number, file: File) => void;
  onUploadImages: (albumIndex: number, files: File[]) => void;
}) {
  const [selectedImageIdsByAlbum, setSelectedImageIdsByAlbum] = useState<Record<string, string[]>>({});
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null);
  const [imageQuery, setImageQuery] = useState('');
  const [imageVisibilityFilter, setImageVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const sortedAlbums = sortGalleryAlbums(albums);
  const activeAlbum = sortedAlbums.find((album) => album.id === activeAlbumId) ?? sortedAlbums[0] ?? null;
  const activeAlbumIndex = activeAlbum ? albums.findIndex((album) => album.id === activeAlbum.id) : -1;
  const sortedImages = activeAlbum ? sortGalleryImages(activeAlbum.images) : [];
  const visibleImages = useMemo(() => {
    const keyword = imageQuery.trim().toLowerCase();

    return sortedImages.filter((image) => {
      const matchesVisibility =
        imageVisibilityFilter === 'all' ||
        (imageVisibilityFilter === 'public' ? image.isPublic : !image.isPublic);
      const searchableText = `${image.title}${image.description}${image.capturedAt ?? ''}${image.fileName}`.toLowerCase();
      return matchesVisibility && (!keyword || searchableText.includes(keyword));
    });
  }, [imageQuery, imageVisibilityFilter, sortedImages]);
  const selectedImageIds = activeAlbum
    ? getSelectedImageIds(activeAlbum.id).filter((imageId) => activeAlbum.images.some((image) => image.id === imageId))
    : [];
  const selectedVisibleImageIds = selectedImageIds.filter((imageId) => visibleImages.some((image) => image.id === imageId));
  const allImagesSelected = visibleImages.length > 0 && visibleImages.every((image) => selectedImageIds.includes(image.id));

  useEffect(() => {
    if (activeAlbumId && albums.some((album) => album.id === activeAlbumId)) {
      return;
    }
    setActiveAlbumId(sortedAlbums[0]?.id ?? null);
  }, [activeAlbumId, albums, sortedAlbums]);

  function getSelectedImageIds(albumId: string) {
    return selectedImageIdsByAlbum[albumId] ?? [];
  }

  function setAlbumSelectedImageIds(albumId: string, imageIds: string[]) {
    setSelectedImageIdsByAlbum((selectedIds) => ({
      ...selectedIds,
      [albumId]: imageIds,
    }));
  }

  function toggleImageSelection(albumId: string, imageId: string) {
    const selectedIds = getSelectedImageIds(albumId);
    setAlbumSelectedImageIds(
      albumId,
      selectedIds.includes(imageId) ? selectedIds.filter((selectedId) => selectedId !== imageId) : [...selectedIds, imageId],
    );
  }

  function deleteSelectedImages(albumIndex: number, album: GalleryAlbum) {
    const selectedIds = getSelectedImageIds(album.id).filter((imageId) => visibleImages.some((image) => image.id === imageId));
    if (selectedIds.length === 0) {
      return;
    }
    if (isSystemGalleryAlbum(album)) {
      window.alert('系统图库里的图片不能删除，只能上传新图片覆盖。');
      return;
    }

    const confirmed = window.confirm(`确定删除选中的 ${selectedIds.length} 张图片吗？`);
    if (!confirmed) {
      return;
    }

    onDeleteImages(albumIndex, selectedIds);
    setAlbumSelectedImageIds(album.id, []);
  }

  const activeAlbumIsSystem = activeAlbum ? isSystemGalleryAlbum(activeAlbum) : false;

  return (
    <section className="admin-panel" aria-label="图库管理">
      <PanelHeader
        action={<button type="button" onClick={onAddAlbum}><Plus size={17} />新增相册</button>}
        title="图库管理"
      />
      <div className="gallery-manager">
        <aside className="gallery-album-list" aria-label="相册列表">
          {sortedAlbums.length > 0 ? (
            sortedAlbums.map((album) => (
              <button
                aria-pressed={activeAlbum?.id === album.id}
                key={album.id}
                onClick={() => setActiveAlbumId(album.id)}
                type="button"
              >
                <span className="gallery-album-thumb">
                  {album.coverImageUrl ? <img alt="" src={album.coverImageUrl} /> : <ImageIcon size={22} />}
                </span>
                <span>
                  <strong>{album.title}</strong>
                  <small>{album.imageCount} 张图片 · {isSystemGalleryAlbum(album) ? '页面图片' : album.isPublic ? '公开' : '私有'}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="empty-state">暂无相册。</p>
          )}
        </aside>

        {activeAlbum && activeAlbumIndex >= 0 ? (
          <div className="gallery-board">
            <div className="gallery-board-toolbar">
              <div>
                <h3>{activeAlbum.title}</h3>
                <p>
                  {activeAlbumIsSystem
                    ? `${activeAlbum.imageCount} 张页面图片，用于维护博客首页、列表页等公共视觉，不包含文章正文图片。`
                    : `${activeAlbum.imageCount} 张图片，路径 /${activeAlbum.slug}`}
                </p>
              </div>
              <div className="gallery-toolbar-actions">
                {!activeAlbumIsSystem && (
                  <>
                    <label className="secondary-action gallery-upload-button">
                      <Plus size={16} />
                      上传图片
                      <input
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        type="file"
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          if (files.length > 0) {
                            onUploadImages(activeAlbumIndex, files);
                            event.currentTarget.value = '';
                          }
                        }}
                      />
                    </label>
                    {visibleImages.length > 0 && (
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() =>
                          setAlbumSelectedImageIds(
                            activeAlbum.id,
                            allImagesSelected
                              ? selectedImageIds.filter((imageId) => !visibleImages.some((image) => image.id === imageId))
                              : Array.from(new Set([...selectedImageIds, ...visibleImages.map((image) => image.id)])),
                          )
                        }
                      >
                        {allImagesSelected ? '取消全选' : '全选'}
                      </button>
                    )}
                    <button
                      className="danger-action"
                      disabled={selectedVisibleImageIds.length === 0}
                      type="button"
                      onClick={() => deleteSelectedImages(activeAlbumIndex, activeAlbum)}
                    >
                      <Trash2 size={16} />
                      删除选中
                    </button>
                  </>
                )}
                {!activeAlbumIsSystem && (
                  <button className="danger-action gallery-delete-album-action" type="button" onClick={() => onDeleteAlbum(activeAlbumIndex)}>
                    <Trash2 size={16} />
                    删除相册
                  </button>
                )}
              </div>
            </div>

            <div className="gallery-filter-toolbar" aria-label="图片搜索和筛选">
              <label className="admin-search-field">
                <Search size={17} />
                <input
                  aria-label="搜索图片"
                  value={imageQuery}
                  onChange={(event) => setImageQuery(event.target.value)}
                  placeholder="搜索标题、说明、日期或文件名"
                />
              </label>
              <div className="admin-filter-tabs admin-status-tabs" role="group" aria-label="按公开状态筛选图片">
                {[
                  ['all', '全部'],
                  ['public', '公开'],
                  ['private', '私有'],
                ].map(([value, label]) => (
                  <button
                    aria-pressed={imageVisibilityFilter === value}
                    key={value}
                    onClick={() => setImageVisibilityFilter(value as 'all' | 'public' | 'private')}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span>{visibleImages.length} 张匹配</span>
            </div>

            <details className="gallery-album-settings">
              <summary>相册设置</summary>
              <div className="gallery-editor-fields">
                <label>
                  相册标题
                  <input
                    disabled={activeAlbumIsSystem}
                    value={activeAlbum.title}
                    onChange={(event) => onAlbumChange(activeAlbumIndex, { ...activeAlbum, title: event.target.value })}
                  />
                </label>
                <label>
                  路径
                  <input
                    disabled={activeAlbumIsSystem}
                    value={activeAlbum.slug}
                    onChange={(event) => onAlbumChange(activeAlbumIndex, { ...activeAlbum, slug: slugifyPostTitle(event.target.value) })}
                  />
                </label>
                <label>
                  排序
                  <input
                    min={0}
                    type="number"
                    value={activeAlbum.sortOrder}
                    onChange={(event) => onAlbumChange(activeAlbumIndex, { ...activeAlbum, sortOrder: Number(event.target.value) || 0 })}
                  />
                </label>
                <label>
                  封面
                  <select
                    value={activeAlbum.coverImageId ?? ''}
                    onChange={(event) => {
                      const coverImageId = event.target.value || null;
                      const coverImage = activeAlbum.images.find((image) => image.id === coverImageId);
                      onAlbumChange(activeAlbumIndex, {
                        ...activeAlbum,
                        coverImageId,
                        coverImageUrl: coverImage?.imageUrl ?? activeAlbum.images[0]?.imageUrl ?? '',
                      });
                    }}
                  >
                    <option value="">自动使用第一张</option>
                    {sortedImages.map((image) => (
                      <option key={image.id} value={image.id}>
                        {image.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wide-field">
                  相册说明
                  <textarea
                    rows={2}
                    value={activeAlbum.description}
                    onChange={(event) => onAlbumChange(activeAlbumIndex, { ...activeAlbum, description: event.target.value })}
                  />
                </label>
                <label className="inline-toggle">
                  <input
                    checked={activeAlbum.isPublic}
                    disabled={activeAlbumIsSystem}
                    type="checkbox"
                    onChange={(event) => onAlbumChange(activeAlbumIndex, { ...activeAlbum, isPublic: event.target.checked })}
                  />
                  {activeAlbumIsSystem ? '系统图库固定公开' : '公开相册'}
                </label>
              </div>
            </details>

            <div className="gallery-image-editor-grid">
              {visibleImages.length > 0 ? (
                visibleImages.map((image) => {
                  const imageIndex = activeAlbum.images.findIndex((item) => item.id === image.id);
                  const sortedImageIndex = sortedImages.findIndex((item) => item.id === image.id);
                  const isSelected = selectedImageIds.includes(image.id);
                  const isExpanded = expandedImageId === image.id;
                  return (
                    <article className="gallery-image-editor" key={image.id}>
                      <div className="gallery-image-preview">
                        <label className="gallery-image-select" aria-label="选择图片">
                          <input
                            checked={isSelected}
                            disabled={activeAlbumIsSystem}
                            type="checkbox"
                            onChange={() => toggleImageSelection(activeAlbum.id, image.id)}
                          />
                        </label>
                        <img alt="" src={image.imageUrl} />
                      </div>
                      <div className="gallery-image-summary">
                        <div>
                          <strong>{image.title}</strong>
                          <span>{image.capturedAt || '未填写日期'} · {image.isPublic ? '公开' : '私有'}</span>
                        </div>
                        <button
                          className="secondary-action"
                          type="button"
                          onClick={() => setExpandedImageId(isExpanded ? null : image.id)}
                        >
                          {isExpanded ? '收起' : '编辑'}
                        </button>
                      </div>
                      <div className="gallery-image-quick-actions">
                        <button
                          className="secondary-action"
                          disabled={sortedImageIndex === 0}
                          type="button"
                          onClick={() => onMoveImage(activeAlbumIndex, image.id, -1)}
                        >
                          上移
                        </button>
                        <button
                          className="secondary-action"
                          disabled={sortedImageIndex === sortedImages.length - 1}
                          type="button"
                          onClick={() => onMoveImage(activeAlbumIndex, image.id, 1)}
                        >
                          下移
                        </button>
                        {activeAlbumIsSystem ? (
                          <label className="secondary-action gallery-upload-button">
                            <ImageIcon size={15} />
                            替换
                            <input
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              type="file"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) {
                                  onReplaceImageFile(activeAlbumIndex, imageIndex, file);
                                  event.currentTarget.value = '';
                                }
                              }}
                            />
                          </label>
                        ) : (
                          <button className="danger-action" type="button" onClick={() => onDeleteImage(activeAlbumIndex, imageIndex)}>
                            <Trash2 size={15} />
                            删除
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="gallery-image-fields">
                          <label>
                            图片标题
                            <input
                              value={image.title}
                              onChange={(event) => onImageChange(activeAlbumIndex, imageIndex, { ...image, title: event.target.value })}
                            />
                          </label>
                          <label>
                            拍摄时间
                            <input
                              value={image.capturedAt ?? ''}
                              onChange={(event) =>
                                onImageChange(activeAlbumIndex, imageIndex, { ...image, capturedAt: event.target.value || null })
                              }
                            />
                          </label>
                          <label>
                            排序
                            <input
                              min={0}
                              type="number"
                              value={image.sortOrder}
                              onChange={(event) =>
                                onImageChange(activeAlbumIndex, imageIndex, { ...image, sortOrder: Number(event.target.value) || 0 })
                              }
                            />
                          </label>
                          <label className="inline-toggle">
                            <input
                              checked={image.isPublic}
                              type="checkbox"
                              onChange={(event) =>
                                onImageChange(activeAlbumIndex, imageIndex, { ...image, isPublic: event.target.checked })
                              }
                            />
                            公开图片
                          </label>
                          <label className="wide-field">
                            图片说明
                            <textarea
                              rows={2}
                              value={image.description}
                              onChange={(event) =>
                                onImageChange(activeAlbumIndex, imageIndex, { ...image, description: event.target.value })
                              }
                            />
                          </label>
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className="empty-state">
                  <p>{sortedImages.length > 0 ? '没有匹配的图片。' : '这个相册还没有图片。'}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="gallery-board gallery-board-empty">
            <ImageIcon size={34} />
            <p>先新建一个相册，再批量上传图片。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminArchivePanel({
  archiveGroups,
  onArchivePosts,
  onMovePostsToArchiveMonth,
  onPublishPosts,
  onUnpublishPosts,
  posts,
}: {
  archiveGroups: ArchiveGroup[];
  onArchivePosts: (slugs: string[]) => Promise<BatchResult>;
  onMovePostsToArchiveMonth: (slugs: string[], monthValue: string) => Promise<BatchResult>;
  onPublishPosts: (slugs: string[]) => Promise<BatchResult>;
  onUnpublishPosts: (slugs: string[]) => Promise<BatchResult>;
  posts: Post[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMonth, setActiveMonth] = useState('all');
  const [activeStatus, setActiveStatus] = useState<'all' | PostStatus>('all');
 const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [targetMonth, setTargetMonth] = useState(() => posts[0] ? getPostArchiveMonthValue(posts[0]) || '' : '');
 const [batchNotice, setBatchNotice] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const monthOptions = useMemo(() => archiveGroups.map((group) => group.month), [archiveGroups]);
  const filteredPosts = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return sortPosts(posts).filter((post) => {
      const matchesMonth = activeMonth === 'all' || getArchiveMonthLabel(getPostArchiveMonthValue(post)) === activeMonth;
      const matchesStatus = activeStatus === 'all' || getPostStatus(post) === activeStatus;
      const searchableText = `${post.title}${post.excerpt}${post.category}${post.tags.join('')}${post.date}${getPostStatusLabel(post)}`.toLowerCase();
      return matchesMonth && matchesStatus && (!keyword || searchableText.includes(keyword));
    });
  }, [activeMonth, activeStatus, posts, searchQuery]);
  const filteredArchiveGroups = useMemo(() => buildArchive(filteredPosts), [filteredPosts]);
  const filteredSlugs = filteredPosts.map((post) => post.slug);
  const allFilteredSelected = filteredSlugs.length > 0 && filteredSlugs.every((slug) => selectedSlugs.includes(slug));
  const selectedCount = selectedSlugs.length;
  const publishedCount = posts.filter((post) => getPostStatus(post) === 'published').length;
  const draftCount = posts.filter((post) => getPostStatus(post) === 'draft').length;
  const archivedCount = posts.filter((post) => getPostStatus(post) === 'archived').length;

  useEffect(() => {
    setSelectedSlugs((slugs) => slugs.filter((slug) => posts.some((post) => post.slug === slug)));
  }, [posts]);

  useEffect(() => {
   if (!targetMonth) {
      setTargetMonth(posts[0] ? getPostArchiveMonthValue(posts[0]) || '' : '');
   }
  }, [posts, targetMonth]);

  function togglePost(slug: string) {
    setSelectedSlugs((slugs) => (slugs.includes(slug) ? slugs.filter((item) => item !== slug) : [...slugs, slug]));
  }

  function toggleFilteredPosts() {
    setSelectedSlugs((slugs) => {
      if (allFilteredSelected) {
        return slugs.filter((slug) => !filteredSlugs.includes(slug));
      }

      return Array.from(new Set([...slugs, ...filteredSlugs]));
    });
  }

  async function runBatch(action: string, slugs: string[], operation: (targetSlugs: string[]) => Promise<BatchResult>) {
    if (slugs.length === 0 || batchBusy) {
      return;
    }

    setBatchBusy(true);
    setBatchNotice('');
    try {
      const result = await operation(slugs);
      setBatchNotice(formatBatchResult(action, result));
      if (result.success > 0) {
        setSelectedSlugs((currentSlugs) => currentSlugs.filter((slug) => !slugs.includes(slug)));
      }
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="归档管理">
      <PanelHeader
        action={
          <a className="secondary-action" href="/archive/page/1">
            查看归档页
          </a>
        }
        title="归档管理"
      />
      <div className="archive-summary">
        <strong>{archiveGroups.length}</strong>
        <span>个月份</span>
        <strong>{publishedCount}</strong>
        <span>公开文章</span>
        <strong>{draftCount}</strong>
        <span>草稿</span>
        <strong>{archivedCount}</strong>
        <span>已归档</span>
      </div>

      <div className="admin-posts-overview">
        <div className="admin-toolbar archive-admin-toolbar" aria-label="归档筛选">
          <label className="admin-search-field">
            <Search size={17} />
            <input
              aria-label="搜索归档文章"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索标题、摘要、分类或标签"
              value={searchQuery}
            />
          </label>
          <div className="archive-filter-controls">
            <select aria-label="按月份筛选归档" value={activeMonth} onChange={(event) => setActiveMonth(event.target.value)}>
              <option value="all">全部月份</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
            <div className="admin-filter-tabs admin-status-tabs" role="group" aria-label="按状态筛选归档文章">
              {[
                ['all', '全部状态'],
                ['published', '已发布'],
                ['draft', '草稿'],
                ['archived', '已归档'],
              ].map(([status, label]) => (
                <button
                  aria-pressed={activeStatus === status}
                  key={status}
                  onClick={() => setActiveStatus(status as 'all' | PostStatus)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-bulk-toolbar" aria-label="归档批量操作">
        <label className="admin-select-all">
          <input checked={allFilteredSelected} type="checkbox" onChange={toggleFilteredPosts} />
          选中当前结果
        </label>
        <span>{selectedCount} 篇已选</span>
        <button
          className="secondary-action"
          disabled={selectedCount === 0 || batchBusy}
          type="button"
          onClick={() => runBatch('批量发布', selectedSlugs, onPublishPosts)}
        >
          批量发布
        </button>
        <button
          className="secondary-action"
          disabled={selectedCount === 0 || batchBusy}
          type="button"
          onClick={() => runBatch('批量下架', selectedSlugs, onUnpublishPosts)}
        >
          批量下架
        </button>
        <button
          className="secondary-action"
          disabled={selectedCount === 0 || batchBusy}
          type="button"
          onClick={() => runBatch('批量归档', selectedSlugs, onArchivePosts)}
        >
          批量归档
        </button>
        <input
          aria-label="目标归档月份"
          disabled={selectedCount === 0 || batchBusy}
          type="month"
          value={targetMonth}
          onChange={(event) => setTargetMonth(event.target.value)}
        />
        <button
          className="secondary-action"
          disabled={selectedCount === 0 || !targetMonth || batchBusy}
          type="button"
          onClick={() =>
            runBatch(`迁移到 ${getArchiveMonthLabel(targetMonth)}`, selectedSlugs, (slugs) =>
              onMovePostsToArchiveMonth(slugs, targetMonth),
            )
          }
        >
          迁移月份
        </button>
      </div>
      {batchNotice && <p className="admin-batch-notice">{batchNotice}</p>}

      <div className="admin-archive-list">
        {filteredArchiveGroups.length > 0 ? (
          filteredArchiveGroups.map((group) => (
            <div className="admin-archive-month" key={group.month}>
              <header>
                <div>
                  <span />
                  <h3>{group.month}</h3>
                </div>
                <small>{group.entries.length} 篇</small>
              </header>
              <div className="admin-archive-entries">
                {group.entries.map((post) => {
                  const postMonth = getPostArchiveMonthValue(post);

                  return (
                    <article className="admin-archive-entry" key={post.slug}>
                      <label className="admin-row-select" aria-label={`选择${post.title}`}>
                        <input
                          checked={selectedSlugs.includes(post.slug)}
                          type="checkbox"
                          onChange={() => togglePost(post.slug)}
                        />
                      </label>
                      <div className="admin-post-main">
                        <div className="admin-post-titleline">
                          <h3>{post.title}</h3>
                          <span>{post.date}</span>
                        </div>
                        <div className="admin-post-meta">
                          <span className={`admin-status-pill status-${getPostStatus(post)}`}>{getPostStatusLabel(post)}</span>
                          <span>{post.category}</span>
                          <span>{post.tags.join('，') || '无标签'}</span>
                        </div>
                      </div>
                      <div className="admin-archive-entry-controls">
                        <input
                          aria-label={`调整${post.title}的归档月份`}
                          disabled={batchBusy}
                          type="month"
                          value={postMonth}
                          onChange={(event) => {
                            const nextMonth = event.target.value;
                            if (nextMonth && nextMonth !== postMonth) {
                              void runBatch(`迁移「${post.title}」`, [post.slug], (slugs) =>
                                onMovePostsToArchiveMonth(slugs, nextMonth),
                              );
                            }
                          }}
                        />
                        {getPostStatus(post) === 'published' ? (
                          <a className="secondary-action" href={`/posts/${post.slug}`}>
                            预览
                          </a>
                        ) : (
                          <button className="secondary-action" disabled type="button" title="草稿和已归档文章不在公开归档页展示">
                            预览
                          </button>
                        )}
                        <a className="secondary-action" href={`/admin/posts/${post.slug}/edit`}>
                          <Pencil size={16} />
                          编辑
                        </a>
                        {getPostStatus(post) === 'published' ? (
                          <button
                            className="secondary-action"
                            disabled={batchBusy}
                            type="button"
                            onClick={() => runBatch('下架', [post.slug], onUnpublishPosts)}
                          >
                            下架
                          </button>
                        ) : (
                          <button
                            className="secondary-action"
                            disabled={batchBusy}
                            type="button"
                            onClick={() => runBatch('发布', [post.slug], onPublishPosts)}
                          >
                            发布
                          </button>
                        )}
                        {getPostStatus(post) !== 'archived' && (
                          <button
                            className="secondary-action"
                            disabled={batchBusy}
                            type="button"
                            onClick={() => runBatch('归档', [post.slug], onArchivePosts)}
                          >
                            归档
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>{posts.length > 0 ? '没有匹配的归档文章。' : '暂无文章可归档。'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminHomepagePanel({
  homepage,
  onHomepageChange,
}: {
  homepage: HomepageCopy;
  onHomepageChange: (homepage: HomepageCopy) => void;
}) {
  type HomepageTextKey = Exclude<keyof HomepageCopy, 'seasonAuto'>;
  const fields: Array<[HomepageTextKey, string, 'input' | 'textarea']> = [
    ['siteName', '站点名称', 'input'],
    ['siteTagline', '站点副标题', 'input'],
    ['heroTitle', '首页大标题', 'input'],
    ['heroSubtitle', '首页引导语', 'textarea'],
    ['primaryCta', '主按钮文案', 'input'],
    ['secondaryCta', '次按钮文案', 'input'],
    ['latestTitle', '文章区标题', 'input'],
    ['topicsTitle', '札记区标题', 'input'],
    ['seriesEyebrow', '专题区角标', 'input'],
    ['seriesTitle', '专题区标题', 'input'],
    ['seriesLead', '专题主句', 'input'],
    ['seriesBody', '专题说明', 'textarea'],
    ['archiveTitle', '归档区标题', 'input'],
    ['aboutTitle', '关于区标题', 'input'],
    ['aboutBody', '关于正文', 'textarea'],
    ['footerSlogan', '页脚短句', 'input'],
  ];

  return (
    <section className="admin-panel" aria-label="主页词汇定制">
      <PanelHeader title="主页词汇" />
      <div className="admin-form homepage-form">
        <div className="season-settings">
          <label className="inline-toggle">
            <input
              checked={homepage.seasonAuto}
              type="checkbox"
              onChange={(event) => onHomepageChange({ ...homepage, seasonAuto: event.target.checked })}
            />
            自动生成今日小记
          </label>
          <label>
            今日小记标题
            <input
              disabled={homepage.seasonAuto}
              value={homepage.seasonTitle}
              onChange={(event) => onHomepageChange({ ...homepage, seasonTitle: event.target.value })}
            />
          </label>
          <label>
            今日小记内容
            <input
              disabled={homepage.seasonAuto}
              value={homepage.seasonText}
              onChange={(event) => onHomepageChange({ ...homepage, seasonText: event.target.value })}
            />
          </label>
        </div>
        {fields.map(([key, label, kind]) => (
          <label className={kind === 'textarea' ? 'wide-field' : undefined} key={key}>
            {label}
            {kind === 'textarea' ? (
              <textarea
                rows={3}
                value={homepage[key]}
                onChange={(event) => onHomepageChange({ ...homepage, [key]: event.target.value })}
              />
            ) : (
              <input value={homepage[key]} onChange={(event) => onHomepageChange({ ...homepage, [key]: event.target.value })} />
            )}
          </label>
        ))}
      </div>
    </section>
  );
}

const llmProviderOptions: Array<{ value: LlmProvider; label: string; model: string; baseUrl: string }> = [
  { value: 'deepseek', label: 'DeepSeek', model: 'deepseek-v4-pro', baseUrl: 'https://api.deepseek.com' },
  { value: 'openai', label: 'OpenAI', model: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', model: 'claude-3-5-sonnet-latest', baseUrl: 'https://api.anthropic.com' },
  { value: 'google', label: 'Google Gemini', model: 'gemini-1.5-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { value: 'moonshot', label: 'Moonshot', model: 'moonshot-v1-128k', baseUrl: 'https://api.moonshot.cn/v1' },
  { value: 'qwen', label: '通义千问', model: 'qwen-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'zhipu', label: '智谱 GLM', model: 'glm-4-plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'custom', label: '自定义', model: 'deepseek-v4-pro', baseUrl: '' },
];

const defaultLlmConfig: ApiLlmConfig = {
  provider: 'deepseek',
  model: 'deepseek-v4-pro',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  temperature: 0.7,
  enabled: true,
};

const defaultLlmTokenUsage: ApiLlmTokenUsagePayload = {
  summary: {
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    unknownTokenRecords: 0,
  },
  items: [],
};

function AdminLlmConfigPanel() {
  const [config, setConfig] = useState<ApiLlmConfig>(defaultLlmConfig);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const [tokenUsage, setTokenUsage] = useState<ApiLlmTokenUsagePayload>(defaultLlmTokenUsage);
  const [tokenUsageStatus, setTokenUsageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [connectionTestStatus, setConnectionTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [connectionTestResult, setConnectionTestResult] = useState<ApiLlmConnectionTestResult | null>(null);
  const activeProvider = llmProviderOptions.find((provider) => provider.value === config.provider) ?? llmProviderOptions[0];

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setTokenUsageStatus('loading');

    Promise.allSettled([fetchAdminLlmConfig(), fetchAdminLlmTokenUsage()])
      .then(([configResult, tokenUsageResult]) => {
        if (cancelled) {
          return;
        }

        if (configResult.status === 'fulfilled') {
          setConfig({ ...defaultLlmConfig, ...configResult.value });
          setStatus('ready');
        } else {
          setStatus('error');
        }

        if (tokenUsageResult.status === 'fulfilled') {
          setTokenUsage({
            summary: { ...defaultLlmTokenUsage.summary, ...tokenUsageResult.value.summary },
            items: tokenUsageResult.value.items ?? [],
          });
          setTokenUsageStatus('ready');
        } else {
          setTokenUsageStatus('error');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setTokenUsageStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshTokenUsage() {
    setTokenUsageStatus('loading');
    try {
      const latestTokenUsage = await fetchAdminLlmTokenUsage();
      setTokenUsage({
        summary: { ...defaultLlmTokenUsage.summary, ...latestTokenUsage.summary },
        items: latestTokenUsage.items ?? [],
      });
      setTokenUsageStatus('ready');
    } catch {
      setTokenUsageStatus('error');
    }
  }

  function updateConfig(nextConfig: ApiLlmConfig) {
    setConfig(nextConfig);
    setConnectionTestStatus('idle');
    setConnectionTestResult(null);
    if (status === 'saved' || status === 'error') {
      setStatus('ready');
    }
  }

  function selectProvider(provider: LlmProvider) {
    const providerDefaults = llmProviderOptions.find((item) => item.value === provider) ?? llmProviderOptions[0];
    updateConfig({
      ...config,
      provider,
      model: providerDefaults.model,
      baseUrl: providerDefaults.baseUrl,
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('saving');
    try {
      const savedConfig = await saveAdminLlmConfig(config);
      setConfig({ ...defaultLlmConfig, ...savedConfig });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  async function handleConnectionTest() {
    setConnectionTestStatus('testing');
    setConnectionTestResult(null);
    try {
      const result = await testAdminLlmConnection();
      setConnectionTestResult(result);
      setConnectionTestStatus(result.ok ? 'success' : 'failed');
    } catch {
      setConnectionTestStatus('failed');
      setConnectionTestResult(null);
    } finally {
      await refreshTokenUsage();
    }
  }

  return (
    <section className="admin-panel" aria-label="LLM 配置">
      <PanelHeader title="LLM 配置" />
      <form className="admin-form llm-config-form" onSubmit={handleSubmit}>
        <label className="inline-toggle">
          <input
            checked={config.enabled}
            type="checkbox"
            onChange={(event) => updateConfig({ ...config, enabled: event.target.checked })}
          />
          启用 LLM 能力
        </label>

        <div className="llm-provider-grid" role="group" aria-label="选择 LLM 服务商">
          {llmProviderOptions.map((provider) => (
            <button
              aria-pressed={config.provider === provider.value}
              key={provider.value}
              onClick={() => selectProvider(provider.value)}
              type="button"
            >
              <strong>{provider.label}</strong>
              <small>{provider.model}</small>
            </button>
          ))}
        </div>

        <div className="form-grid two-columns">
          <label>
            当前服务商
            <select value={config.provider} onChange={(event) => selectProvider(event.target.value as LlmProvider)}>
              {llmProviderOptions.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            模型
            <input
              value={config.model}
              onChange={(event) => updateConfig({ ...config, model: event.target.value })}
              placeholder={activeProvider.model}
            />
          </label>
          <label>
            Base URL
            <input
              value={config.baseUrl}
              onChange={(event) => updateConfig({ ...config, baseUrl: event.target.value })}
              placeholder={activeProvider.baseUrl || 'https://example.com/v1'}
            />
          </label>
          <label>
            API Key
            <input
              autoComplete="off"
              type="password"
              value={config.apiKey}
              onChange={(event) => updateConfig({ ...config, apiKey: event.target.value })}
              placeholder="sk-..."
            />
          </label>
          <label>
            Temperature
            <input
              max={2}
              min={0}
              step={0.1}
              type="number"
              value={config.temperature}
              onChange={(event) => updateConfig({ ...config, temperature: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="llm-config-summary">
          <div>
            <span>默认模型</span>
            <strong>{activeProvider.model}</strong>
            <small>切换服务商会自动带入推荐模型和 Base URL。</small>
          </div>
          <div>
            <span>当前状态</span>
            <strong>{config.enabled ? '已启用' : '未启用'}</strong>
            <small>{status === 'loading' ? '正在读取后台配置' : status === 'saved' ? '配置已保存' : config.baseUrl || '未配置 Base URL'}</small>
          </div>
        </div>

        {status === 'error' && <p className="admin-batch-notice">LLM 配置暂时无法连接后台，请确认服务已启动并且登录没有过期。</p>}
        {status === 'saved' && <p className="admin-batch-notice">LLM 配置已保存。</p>}
        {connectionTestStatus === 'success' && connectionTestResult && (
          <p className="admin-batch-notice llm-test-result is-success">
            LLM 连接正常：{connectionTestResult.provider} / {connectionTestResult.model} 返回 {connectionTestResult.message}
          </p>
        )}
        {connectionTestStatus === 'failed' && (
          <p className="admin-batch-notice llm-test-result is-failed">
            LLM 连接测试失败，请确认已保存配置、API Key、Base URL 和模型名称可用。
          </p>
        )}

        <div className="form-actions">
          <button className="primary-action" disabled={status === 'loading' || status === 'saving'} type="submit">
            {status === 'saving' ? '保存中' : '保存配置'}
          </button>
          <button
            className="secondary-action"
            disabled={status === 'loading' || status === 'saving' || connectionTestStatus === 'testing'}
            type="button"
            onClick={handleConnectionTest}
          >
            {connectionTestStatus === 'testing' ? '测试中' : '测试 LLM 连接'}
          </button>
          <small className="llm-test-hint">测试会使用后台已保存的配置，并写入一次 Token 消耗记录。</small>
        </div>
      </form>

      <section className="llm-token-usage-panel" aria-label="Token 消耗记录">
        <div className="admin-dashboard-section-header">
          <div>
            <span>Token Usage</span>
            <h3>Token 消耗</h3>
          </div>
        </div>

        <div className="llm-token-summary">
          <div>
            <span>累计 Token</span>
            <strong>{formatInteger(tokenUsage.summary.totalTokens)}</strong>
            <small>仅统计服务商返回 usage 的调用</small>
          </div>
          <div>
            <span>Prompt</span>
            <strong>{formatInteger(tokenUsage.summary.promptTokens)}</strong>
            <small>输入 token 累计</small>
          </div>
          <div>
            <span>Completion</span>
            <strong>{formatInteger(tokenUsage.summary.completionTokens)}</strong>
            <small>输出 token 累计</small>
          </div>
          <div>
            <span>调用次数</span>
            <strong>{formatInteger(tokenUsage.summary.totalCalls)}</strong>
            <small>成功 {formatInteger(tokenUsage.summary.successCalls)} 次，失败 {formatInteger(tokenUsage.summary.failedCalls)} 次</small>
          </div>
          <div>
            <span>未知 Token</span>
            <strong>{formatInteger(tokenUsage.summary.unknownTokenRecords)}</strong>
            <small>成功但响应未返回 usage</small>
          </div>
        </div>

        {tokenUsageStatus === 'error' && <p className="admin-batch-notice">Token 消耗记录暂时无法读取。</p>}

        <div className="llm-token-usage-list" aria-label="最近 Token 消耗明细">
          <div className="llm-token-usage-head" role="row">
            <span>时间</span>
            <span>功能</span>
            <span>模型</span>
            <span>状态</span>
            <span>Token</span>
          </div>
          {tokenUsageStatus === 'loading' ? (
            <p className="empty-state">正在读取 Token 消耗记录。</p>
          ) : tokenUsage.items.length > 0 ? (
            tokenUsage.items.map((item) => (
              <div className="llm-token-usage-row" key={item.id} role="row">
                <span data-label="时间">{formatLlmUsageTime(item.createdAt)}</span>
                <span data-label="功能">{formatLlmUsageFeature(item.feature)}</span>
                <span data-label="模型">
                  <strong>{item.model}</strong>
                  <small>{item.provider}</small>
                </span>
                <span data-label="状态">
                  <span className={`llm-token-status is-${item.status}`}>{item.status === 'success' ? '成功' : '失败'}</span>
                </span>
                <span data-label="Token">
                  <strong>{formatTokenCount(item.totalTokens)}</strong>
                  <small>
                    P {formatTokenCount(item.promptTokens)} · C {formatTokenCount(item.completionTokens)}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <p className="empty-state">还没有 Token 消耗记录。</p>
          )}
        </div>
      </section>
    </section>
  );
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('zh-CN').format(Number.isFinite(value) ? value : 0);
}

function formatTokenCount(value: number | null) {
  return value === null ? '未知' : formatInteger(value);
}

function formatLlmUsageFeature(value: string) {
  const labels: Record<string, string> = {
    article_metadata: '文章元数据',
    llm_connection_test: '连接测试',
    starfield_passages: '星图文段',
    starfield_relationships: '星图关系',
  };
  return labels[value] ?? (value || '未知功能');
}

function formatLlmUsageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function AdminAppearancePanel({
  albums,
  colorScheme,
  homepage,
  onOwnerAvatarUrlChange,
  onColorSchemeChange,
  onOwnerNameChange,
  onResetContent,
  onStylePresetChange,
  ownerAvatarUrl,
  ownerName,
  stylePreset,
}: {
  albums: GalleryAlbum[];
  colorScheme: ColorScheme;
  homepage: HomepageCopy;
  onOwnerAvatarUrlChange: (ownerAvatarUrl: string) => void;
  onColorSchemeChange: (colorScheme: ColorScheme) => void;
  onOwnerNameChange: (ownerName: string) => void;
  onResetContent: () => void;
  onStylePresetChange: (stylePreset: StylePreset) => void;
  ownerAvatarUrl: string;
  ownerName: string;
  stylePreset: StylePreset;
}) {
  const [ownerNameDraft, setOwnerNameDraft] = useState(ownerName);
  const [ownerAvatarDraft, setOwnerAvatarDraft] = useState(ownerAvatarUrl);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const systemGalleryImages = useMemo(
    () => sortGalleryImages(albums.find((album) => isSystemGalleryAlbum(album))?.images ?? []),
    [albums],
  );
  const activeSystemGalleryImages = useMemo(() => getSystemGalleryImageUrls(albums), [albums]);
  const previewImage = activeSystemGalleryImages[stylePreset] ?? stylePresetAssets[stylePreset].heroImage;

  useEffect(() => {
    setOwnerNameDraft(ownerName);
  }, [ownerName]);

  useEffect(() => {
    setOwnerAvatarDraft(ownerAvatarUrl);
  }, [ownerAvatarUrl]);

  function commitOwnerName() {
    const nextOwnerName = normalizeOwnerName(ownerNameDraft);
    setOwnerNameDraft(nextOwnerName);
    onOwnerNameChange(nextOwnerName);
  }

  function commitOwnerAvatarUrl() {
    const nextOwnerAvatarUrl = normalizeOwnerAvatarUrl(ownerAvatarDraft);
    setOwnerAvatarDraft(nextOwnerAvatarUrl);
    onOwnerAvatarUrlChange(nextOwnerAvatarUrl);
  }

  return (
    <>
      <section className="admin-panel" aria-label="外观设置">
        <div className="setting-group">
          <div>
            <h3>我叫什么</h3>
            <p>这个名字就是管理员作者名，新写和保存的文章会自动署这个名字。</p>
          </div>
          <input
            className="setting-input"
            maxLength={40}
            onBlur={commitOwnerName}
            onChange={(event) => setOwnerNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            placeholder="输入你的名字"
            type="text"
            value={ownerNameDraft}
          />
        </div>

        <div className="setting-group avatar-setting-group">
          <div>
            <h3>作者头像</h3>
            <p>全站展示的作者头像，推荐从系统图库选择。</p>
          </div>
          <div className="avatar-setting-control">
            <AuthorAvatar ownerAvatarUrl={ownerAvatarDraft} ownerName={ownerNameDraft} size="large" />
            <div className="avatar-setting-fields">
              <select
                aria-label="从系统图库选择作者头像"
                value={systemGalleryImages.some((image) => image.imageUrl === ownerAvatarDraft) ? ownerAvatarDraft : ''}
                onChange={(event) => {
                  const nextOwnerAvatarUrl = event.target.value;
                  setOwnerAvatarDraft(nextOwnerAvatarUrl);
                  onOwnerAvatarUrlChange(nextOwnerAvatarUrl);
                }}
              >
                <option value="">从系统图库选择</option>
                {systemGalleryImages.map((image) => (
                  <option key={image.id} value={image.imageUrl}>
                    {image.title}
                  </option>
                ))}
              </select>
              <input
                className="setting-input"
                maxLength={500}
                onBlur={commitOwnerAvatarUrl}
                onChange={(event) => setOwnerAvatarDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
                placeholder="/images/avatar.png"
                type="text"
                value={ownerAvatarDraft}
              />
            </div>
          </div>
        </div>

        <div className="setting-group">
          <div>
            <h3>视觉风格预设</h3>
            <p>决定首页首图、配色、纹理和整体气质。</p>
          </div>
          <div className="segmented-control" role="group" aria-label="视觉风格预设">
            {stylePresets.map((nextStylePreset) => (
              <button
                aria-pressed={stylePreset === nextStylePreset}
                key={nextStylePreset}
                onClick={() => onStylePresetChange(nextStylePreset)}
                type="button"
              >
                {nextStylePreset === 'classic' ? '中国古风' : '赛博科技'}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-group">
          <div>
            <h3>当前浏览器明暗模式</h3>
            <p>这里只影响你当前浏览器的显示，公开用户可以在前台自己切换。</p>
          </div>
          <div className="segmented-control" role="group" aria-label="明暗模式">
            {colorSchemes.map((nextColorScheme) => (
              <button
                aria-pressed={colorScheme === nextColorScheme}
                key={nextColorScheme}
                onClick={() => onColorSchemeChange(nextColorScheme)}
                type="button"
              >
                {nextColorScheme === 'light' ? '亮色' : '暗色'}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-group danger-setting-group">
          <div>
            <h3>危险区</h3>
            <p>重置会恢复默认内容。请输入站点名称「{homepage.siteName}」后才能执行。</p>
          </div>
          <div className="danger-confirm-control">
            <input
              className="setting-input"
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              placeholder={homepage.siteName}
            />
            <button
              className="danger-action"
              disabled={resetConfirmation !== homepage.siteName}
              type="button"
              onClick={() => {
                if (window.confirm('确定重置站点内容吗？此操作会覆盖当前本地内容。')) {
                  onResetContent();
                  setResetConfirmation('');
                }
              }}
            >
              <Trash2 size={17} />
              重置内容
            </button>
          </div>
        </div>
      </section>

      <section className="admin-preview" aria-label="当前外观预览">
        <div className="preview-visual">
          <img src={previewImage} alt="" />
        </div>
        <div>
          <span>当前预设</span>
          <h2>{stylePreset === 'classic' ? '中国古风' : '赛博科技'}</h2>
          <p>{colorScheme === 'light' ? '亮色模式' : '暗色模式'} · 仅作为当前浏览器偏好保存</p>
          <a className="primary-action" href="/">
            查看首页
            <ChevronRight size={18} />
          </a>
        </div>
      </section>
    </>
  );
}

function PanelHeader({ action, title }: { action?: React.ReactNode; title: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function SiteHeader({
  homepage,
  colorScheme,
  ownerAuthenticated,
  menuOpen,
  onMenuToggle,
  onColorSchemeToggle,
  onSearchOpen,
}: {
  homepage: HomepageCopy;
  colorScheme: ColorScheme;
  ownerAuthenticated: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onColorSchemeToggle: () => void;
  onSearchOpen: () => void;
}) {
  return (
    <header className="site-header">
      <a className="brand" href="/#首页" aria-label={`${homepage.siteName}首页`}>
        <span>{homepage.siteName}</span>
        <small>{homepage.siteTagline}</small>
      </a>

      <nav className="desktop-nav" aria-label="主导航">
        {navItems.map((item) => (
          <a href={item.href} key={item.label}>
            {item.label}
          </a>
        ))}
        {ownerAuthenticated && <a href="/admin">后台</a>}
      </nav>

      <div className="header-actions">
        <button className="icon-button" type="button" onClick={onSearchOpen} aria-label="打开搜索">
          <Search size={19} />
        </button>
        <button className="icon-button" type="button" onClick={onColorSchemeToggle} aria-label="切换明暗模式">
          {colorScheme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
        </button>
        <button
          aria-controls="mobile-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
          className="icon-button mobile-only"
          type="button"
          onClick={onMenuToggle}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}

function HeroMoonScene({
  almanac,
  heroImage,
  homepage,
}: {
  almanac?: AlmanacInfo | null;
  heroImage: string;
  homepage: HomepageCopy;
}) {
  const seasonNote = useMemo(() => (homepage.seasonAuto ? createSeasonNoteFromAlmanac(almanac) ?? createSeasonNote() : null), [almanac, homepage.seasonAuto]);
  const seasonTitle = seasonNote?.title ?? homepage.seasonTitle;
  const seasonText = seasonNote?.text ?? homepage.seasonText;

  return (
    <section className="hero" id="首页">
      <div className="hero-art" aria-hidden="true">
        <img src={heroImage} alt="" />
        <div className="moon-orbit" />
        <div className="water-shimmer" />
      </div>

      <div className="hero-content">
        <div className="seal" aria-label="乙巳夏前">
          <span>乙巳</span>
          <span>夏前</span>
        </div>
        <h1>{homepage.heroTitle}</h1>
        <p>{homepage.heroSubtitle}</p>
        <div className="hero-actions">
          <a className="primary-action" href="/#文章">
            {homepage.primaryCta}
            <ChevronRight size={18} />
          </a>
          <a className="secondary-action" href="/#归档">
            {homepage.secondaryCta}
          </a>
        </div>
      </div>

      <aside className="season-card" aria-label="今日小记">
        <CalendarDays size={18} />
        <div>
          <strong>{seasonTitle}</strong>
          <span>{seasonText}</span>
        </div>
      </aside>
    </section>
  );
}

function createSeasonNoteFromAlmanac(almanac?: AlmanacInfo | null) {
  if (!almanac) {
    return null;
  }

  const termLabel = almanac.solarTerm || (almanac.nextSolarTerm ? `${almanac.nextSolarTerm}前` : '');
  const titleParts = ['今日', almanac.lunarMonth && almanac.lunarDay ? `${almanac.lunarMonth}${almanac.lunarDay}` : '', termLabel].filter(Boolean);
  const goodThings = almanac.goodThings.filter((thing) => thing !== '诸事不忌').slice(0, 3);
  const badThings = almanac.badThings.filter((thing) => thing !== '诸事不忌').slice(0, 2);
  const textParts = [
    goodThings.length > 0 ? `宜：${goodThings.join('、')}` : '',
    badThings.length > 0 ? `忌：${badThings.join('、')}` : '',
  ].filter(Boolean);

  return {
    title: titleParts.join(' · '),
    text: textParts.join('；') || almanac.zodiacClash || almanac.weekDay,
  };
}

function LatestPosts({ homepage, posts }: { homepage: HomepageCopy; posts: Post[] }) {
  const [lead, ...rest] = posts;
  const recentPosts = rest.slice(0, 3);
  const featuredTitleDensity = getFeaturedTitleDensity(lead?.title ?? '');

  if (!lead) {
    return null;
  }

  return (
    <section className="content-section latest" id="文章">
      <SectionHeading
        action={
          <a className="section-link" href="/posts/page/1">
            全部文章
            <ChevronRight size={17} />
          </a>
        }
        eyebrow={homepage.latestEyebrow}
        title={homepage.latestTitle}
      />
      <div className="post-grid">
        <a className={`featured-card tone-${lead.tone}`} href={`/posts/${lead.slug}`}>
          <PostCover className="featured-card-cover" coverImage={lead.coverImage} loading="lazy" />
          <div className="featured-card-body">
            <span>{lead.category}</span>
            <h3 className={`featured-title-${featuredTitleDensity}`}>{lead.title}</h3>
            <p>{lead.excerpt}</p>
            <footer>
              <small>{lead.date}</small>
            </footer>
          </div>
        </a>

        <div className="post-list">
          {recentPosts.map((post) => (
            <PostCard key={post.title} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}

function getFeaturedTitleDensity(title: string) {
  const normalizedTitle = title.trim();
  const titleLength = Array.from(normalizedTitle).length;
  const longestSegmentLength = Math.max(
    0,
    ...normalizedTitle.split(/[\s，。！？、：；,.!?:;()[\]{}"'“”‘’《》<>/\\|-]+/).map((segment) => Array.from(segment).length),
  );

  if (titleLength > 72 || longestSegmentLength > 34) {
    return 'ultra';
  }

  if (titleLength > 52 || longestSegmentLength > 24) {
    return 'dense';
  }

  if (titleLength > 34) {
    return 'compact';
  }

  return 'normal';
}

function PostCard({ post }: { post: Post }) {
  return (
    <a className={`post-card tone-${post.tone}`} href={`/posts/${post.slug}`}>
      <PostCover className="post-card-cover" coverImage={post.coverImage} loading="lazy" />
      <div className="post-card-body">
        <div className="post-card-meta">
          <span>{post.category}</span>
          <small>{post.date}</small>
        </div>
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
        <footer>{post.date}</footer>
      </div>
    </a>
  );
}

function PostCover({
  className,
  coverImage,
  loading,
}: {
  className: string;
  coverImage?: string;
  loading?: 'eager' | 'lazy';
}) {
  const [isBroken, setIsBroken] = useState(false);
  const imageUrl = coverImage?.trim() ?? '';

  useEffect(() => {
    setIsBroken(false);
  }, [imageUrl]);

  if (!imageUrl || isBroken) {
    return null;
  }

  return (
    <div className={className}>
      <img alt="" loading={loading} onError={() => setIsBroken(true)} src={imageUrl} />
    </div>
  );
}

function TopicRiver({ homepage, noteSections }: { homepage: HomepageCopy; noteSections: NoteSection[] }) {
  const riverRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const dragStateRef = useRef({
    dragged: false,
    isDragging: false,
    startScroll: 0,
    startX: 0,
    startY: 0,
  });
  const displaySections = useMemo(() => {
    const sectionPriority = new Map(defaultSiteContent.noteSections.map((section, index) => [section.category, index]));
    return noteSections.filter((section) => section.category !== '功能测试').sort((first, second) => {
      const firstPriority = sectionPriority.get(first.category) ?? 100 + noteSections.indexOf(first);
      const secondPriority = sectionPriority.get(second.category) ?? 100 + noteSections.indexOf(second);
      return firstPriority - secondPriority;
    });
  }, [noteSections]);
  const loopedSections = displaySections.length > 1 ? [...displaySections, ...displaySections] : displaySections;

  const getScrollCycle = (river: HTMLDivElement) => {
    const styles = window.getComputedStyle(river);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    return (river.scrollWidth + gap) / 2;
  };

  const setLoopedScroll = (river: HTMLDivElement, value: number) => {
    const cycle = getScrollCycle(river);

    if (!Number.isFinite(cycle) || cycle <= 0 || river.scrollWidth <= river.clientWidth) {
      return;
    }

    let next = value;
    while (next >= cycle) next -= cycle;
    while (next < 0) next += cycle;
    scrollPositionRef.current = next;
    river.scrollLeft = next;
  };

  useEffect(() => {
    const river = riverRef.current;
    if (!river) return;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => {
      prefersReducedMotionRef.current = reducedMotionQuery.matches;
    };
    updateMotionPreference();
    reducedMotionQuery.addEventListener('change', updateMotionPreference);

    let animationFrame = 0;
    let previousTime = performance.now();
    const speed = 18;

    const animate = (time: number) => {
      const dragState = dragStateRef.current;
      const deltaSeconds = Math.min(time - previousTime, 40) / 1000;
      previousTime = time;

      if (!dragState.isDragging && !prefersReducedMotionRef.current && time >= pauseUntilRef.current) {
        setLoopedScroll(river, scrollPositionRef.current + speed * deltaSeconds);
      }

      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      reducedMotionQuery.removeEventListener('change', updateMotionPreference);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [noteSections]);

  const pauseAutoScroll = (duration = 900) => {
    pauseUntilRef.current = window.performance.now() + duration;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const river = riverRef.current;
    if (!river) return;

    pauseAutoScroll(1200);
    dragStateRef.current = {
      dragged: false,
      isDragging: true,
      startScroll: river.scrollLeft,
      startX: event.clientX,
      startY: event.clientY,
    };
    scrollPositionRef.current = river.scrollLeft;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const river = riverRef.current;
    const dragState = dragStateRef.current;
    if (!river || !dragState.isDragging) return;

    const dragDistance = event.clientX - dragState.startX;
    const verticalDistance = event.clientY - dragState.startY;
    if (Math.hypot(dragDistance, verticalDistance) > 5) {
      dragState.dragged = true;
      river.classList.add('is-dragging');
      if (!river.hasPointerCapture(event.pointerId)) {
        river.setPointerCapture(event.pointerId);
      }
    }

    if (!dragState.dragged) return;

    setLoopedScroll(river, dragState.startScroll - dragDistance * 1.8);
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const river = riverRef.current;
    if (!river || !dragStateRef.current.isDragging) return;

    dragStateRef.current.isDragging = false;
    river.classList.remove('is-dragging');
    if (river.hasPointerCapture(event.pointerId)) {
      river.releasePointerCapture(event.pointerId);
    }
    if (dragStateRef.current.dragged) {
      window.setTimeout(() => {
        dragStateRef.current.dragged = false;
      }, 0);
    }
  };

  const handleChipClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!dragStateRef.current.dragged) return;

    event.preventDefault();
    dragStateRef.current.dragged = false;
  };

  const handleRiverScroll = () => {
    const river = riverRef.current;
    if (!river) return;

    scrollPositionRef.current = river.scrollLeft;
  };

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <section className="content-section" id="札记">
      <SectionHeading eyebrow={homepage.topicsEyebrow} title={homepage.topicsTitle} />
      <div
        className="topic-river"
        aria-label="文章分类"
        onDragStart={handleDragStart}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onScroll={handleRiverScroll}
        onWheel={() => pauseAutoScroll(600)}
        onFocus={() => pauseAutoScroll(1200)}
        ref={riverRef}
      >
        {loopedSections.map((section, index) => {
          const isClone = index >= displaySections.length;

          return (
          <a
            aria-hidden={isClone || undefined}
            className="topic-chip"
            draggable={false}
            href={`/posts/page/1?category=${encodeURIComponent(section.category)}`}
            key={`${section.category}-${index}`}
            onClick={handleChipClick}
            tabIndex={isClone ? -1 : undefined}
          >
            <span>{section.category}</span>
            <small>{section.description}</small>
          </a>
          );
        })}
      </div>
    </section>
  );
}

function FeaturedEssay({
  homepage,
  posts,
  seriesList,
}: {
  homepage: HomepageCopy;
  posts: Post[];
  seriesList: FeaturedSeries[];
}) {
  const featuredSeries = seriesList.find((series) =>
    series.postSlugs.some((slug) => posts.some((post) => post.slug === slug)),
  );

  if (!featuredSeries) {
    return null;
  }

  const seriesPosts = featuredSeries.postSlugs
    .map((slug) => posts.find((post) => post.slug === slug))
    .filter((post): post is Post => Boolean(post));

  return (
    <section className="essay-band">
      <div>
        <SectionHeading eyebrow={homepage.seriesEyebrow} title={featuredSeries.title} />
        <h3>{featuredSeries.lead}</h3>
        <p>{featuredSeries.body}</p>
      </div>
      <div className="chapter-list" aria-label="系列章节">
        {seriesPosts.map((post, index) => (
          <a href={`/posts/${post.slug}`} key={post.slug}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            {post.title}
          </a>
        ))}
      </div>
    </section>
  );
}

function ArchivePreview({ homepage, posts }: { homepage: HomepageCopy; posts: Post[] }) {
  const publishedPosts = useMemo(() => getPublishedPosts(posts), [posts]);
  const archiveGroups = useMemo(() => buildArchive(publishedPosts), [publishedPosts]);
  const previewGroups = useMemo(() => archiveGroups.slice(0, homepageArchivePreviewLimit), [archiveGroups]);
  const hasOverflowingArchivePreview =
    archiveGroups.length > homepageArchivePreviewLimit ||
    previewGroups.some((group) => group.entries.length > homepageArchiveEntriesPerMonthLimit);
  const [openMonth, setOpenMonth] = useState(previewGroups[0]?.month ?? '');

  useEffect(() => {
    if (!previewGroups.some((group) => group.month === openMonth)) {
      setOpenMonth(previewGroups[0]?.month ?? '');
    }
  }, [openMonth, previewGroups]);

  return (
    <section className="content-section archive" id="归档">
      <SectionHeading
        action={
          hasOverflowingArchivePreview ? (
            <a className="section-link" href="/archive/page/1">
              全部归档
            </a>
          ) : undefined
        }
        eyebrow={homepage.archiveEyebrow}
        title={homepage.archiveTitle}
      />
      <div className="timeline">
        {previewGroups.map(({ month, entries }) => {
          const previewEntries = entries.slice(0, homepageArchiveEntriesPerMonthLimit);

          return (
            <div className="timeline-month" key={month}>
              <button type="button" onClick={() => setOpenMonth(openMonth === month ? '' : month)}>
                <span />
                {month}
              </button>
              {openMonth === month && (
                <ul>
                  {previewEntries.map((post) => (
                    <li key={post.slug}>
                      <a href={`/posts/${post.slug}`}>
                        {post.date.slice(5).replace('.', '.')}  {post.title}
                      </a>
                    </li>
                  ))}
                  {entries.length > homepageArchiveEntriesPerMonthLimit && (
                    <li>
                      <a className="timeline-more-link" href="/archive/page/1">
                        查看该月更多文章
                      </a>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AboutBlock({
  homepage,
  noteSections,
  ownerAvatarUrl,
  ownerName,
  posts,
}: {
  homepage: HomepageCopy;
  noteSections: NoteSection[];
  ownerAvatarUrl: string;
  ownerName: string;
  posts: Post[];
}) {
  return (
    <section className="about-band" id="关于">
      <div>
        <SectionHeading eyebrow={homepage.aboutEyebrow} title={homepage.aboutTitle} />
        <p>{homepage.aboutBody}</p>
      </div>
      <div className="about-stats" aria-label="站点摘要">
        <div className="about-author">
          <AuthorAvatar ownerAvatarUrl={ownerAvatarUrl} ownerName={ownerName} size="large" />
          <div>
            <span>作者</span>
            <strong>{ownerName}</strong>
          </div>
        </div>
        <div className="about-metrics">
          <span>
            <strong>{posts.length}</strong>
            <small>近日文章</small>
          </span>
          <span>
            <strong>{noteSections.length}</strong>
            <small>内容主题</small>
          </span>
        </div>
      </div>
    </section>
  );
}

function SearchCommand({
  quickLinks,
  query,
  results,
  onQueryChange,
  onClose,
}: {
  quickLinks: string[];
  query: string;
  results: Post[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      previouslyFocusedElement?.focus();
    };
  }, [onClose]);

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(panelRef.current);
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div className="search-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="search-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="站内搜索"
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-input-row">
          <Search size={20} />
          <input
            aria-label="站内搜索关键词"
            autoFocus
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索诗词、随笔、技术札记"
          />
          <button type="button" onClick={onClose} aria-label="关闭搜索">
            <X size={20} />
          </button>
        </div>

        <div className="quick-links">
          {quickLinks.map((item) => (
            <button type="button" key={item} onClick={() => onQueryChange(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="search-results">
          {results.length > 0 ? (
            results.map((post) => (
              <a href={`/posts/${post.slug}`} key={post.slug}>
                <span>{post.category}</span>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
              </a>
            ))
          ) : (
            <p className="empty-state">没有找到相关内容，换个关键词试试。</p>
          )}
        </div>
      </section>
    </div>
  );
}

function buildSearchQuickLinks(posts: Post[]) {
  const values = posts.flatMap((post) => [post.category, ...post.tags]).filter(Boolean);
  return Array.from(new Set(values)).slice(0, 8);
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('aria-hidden'));
}

function SiteFooter({ homepage, ownerAvatarUrl, ownerName }: { homepage: HomepageCopy; ownerAvatarUrl: string; ownerName: string }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-author">
        <AuthorAvatar ownerAvatarUrl={ownerAvatarUrl} ownerName={ownerName} size="small" />
        <div>
          <strong>{homepage.footerSlogan}</strong>
          <span>© 2026 {ownerName}</span>
        </div>
      </div>
      <nav aria-label="页脚导航">
        <a href="/posts/page/1">全部文章</a>
        <a href="/notes/page/1">札记</a>
        <a href="/archive/page/1">归档</a>
        <a href="/gallery">图库</a>
      </nav>
    </footer>
  );
}

function AllPostsPage({
  category,
  currentPage,
  posts,
  tag,
}: {
  category: string | null;
  currentPage: number;
  posts: Post[];
  tag: string | null;
}) {
  const allPostsPerPage = 5;
  const categories = Array.from(new Set(posts.map((post) => post.category))).filter(Boolean);
  const tags = Array.from(new Set(posts.flatMap((post) => post.tags))).filter(Boolean);
  const visiblePosts = posts.filter((post) => {
    const categoryMatches = category ? post.category === category : true;
    const tagMatches = tag ? post.tags.includes(tag) : true;
    return categoryMatches && tagMatches;
  });
  const pageCount = Math.max(1, Math.ceil(visiblePosts.length / allPostsPerPage));
  const normalizedPage = Math.min(Math.max(currentPage, 1), pageCount);
  const startIndex = (normalizedPage - 1) * allPostsPerPage;
  const pagedPosts = visiblePosts.slice(startIndex, startIndex + allPostsPerPage);
  const pageTitle = category && tag ? `${category} · ${tag}` : category ? `${category}文章` : tag ? `标签：${tag}` : '全部文章';
  const filterHref = (nextCategory: string | null, nextTag: string | null) => {
    const params = new URLSearchParams();
    if (nextCategory) {
      params.set('category', nextCategory);
    }
    if (nextTag) {
      params.set('tag', nextTag);
    }
    const queryString = params.toString();
    return `/posts/page/1${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <section className="content-section listing-page">
      <SectionHeading eyebrow="All Posts" title={pageTitle} />
      <div className="listing-intro">
        <p>
          按发布时间逐页浏览{category ? `“${category}”分类下` : '所有'}{tag ? `、带有“${tag}”标签的` : ''}博客内容。当前第 {normalizedPage}{' '}
          页，共 {pageCount} 页。
        </p>
        {(category || tag) && (
          <a className="section-link" href="/posts/page/1">
            清除筛选
            <X size={16} />
          </a>
        )}
      </div>

      <div className="post-filter-bar" aria-label="文章筛选">
        <div className="post-filter-group" role="group" aria-label="分类筛选">
          <a aria-current={!category && !tag ? 'page' : undefined} href="/posts/page/1">全部</a>
          {categories.map((categoryName) => (
            <a
              aria-current={category === categoryName ? 'page' : undefined}
              href={filterHref(categoryName, tag)}
              key={categoryName}
            >
              {categoryName}
            </a>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="post-filter-group tag-filter-group" role="group" aria-label="标签筛选">
            {tags.slice(0, 16).map((tagName) => (
            <a
              aria-current={tag === tagName ? 'page' : undefined}
              href={filterHref(category, tagName)}
              key={tagName}
            >
                {tagName}
              </a>
            ))}
          </div>
        )}
      </div>

      {pagedPosts.length > 0 ? (
        <div className="listing-grid">
          {pagedPosts.map((post) => (
            <PostListItem key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="empty-state">没有匹配的文章，可以清除筛选后重新浏览。</p>
      )}

      <Pagination category={category} currentPage={normalizedPage} pageCount={pageCount} tag={tag} />
    </section>
  );
}

function AllNotesPage({
  currentPage,
  noteSections,
  posts,
}: {
  currentPage: number;
  noteSections: NoteSection[];
  posts: Post[];
}) {
  const pageCount = Math.max(1, Math.ceil(noteSections.length / postsPerPage));
  const normalizedPage = Math.min(Math.max(currentPage, 1), pageCount);
  const startIndex = (normalizedPage - 1) * postsPerPage;
  const pagedSections = noteSections.slice(startIndex, startIndex + postsPerPage);

  return (
    <section className="content-section listing-page">
      <SectionHeading eyebrow="Notes" title="札记" />
      <div className="listing-intro">
        <p>按主题查看札记分类。当前第 {normalizedPage} 页，共 {pageCount} 页。</p>
      </div>
      <div className="note-listing-grid">
        {pagedSections.map((section) => {
          const sectionPosts = posts.filter((post) => post.category === section.category);
          return (
            <article className="note-section-card" key={section.category}>
              <div>
                <span>{sectionPosts.length} 篇</span>
                <h3>{section.category}</h3>
                <p>{section.description}</p>
              </div>
              <div className="note-section-posts">
                {sectionPosts.slice(0, 3).map((post) => (
                  <a href={`/posts/${post.slug}`} key={post.slug}>{post.title}</a>
                ))}
                <a className="section-link" href={`/posts/page/1?category=${encodeURIComponent(section.category)}`}>
                  查看全部
                  <ChevronRight size={17} />
                </a>
              </div>
            </article>
          );
        })}
      </div>
      <SimplePagination basePath="/notes/page" currentPage={normalizedPage} pageCount={pageCount} />
    </section>
  );
}

function AllArchivePage({ currentPage, posts }: { currentPage: number; posts: Post[] }) {
  const archiveGroups = buildArchive(posts);
  const pageCount = Math.max(1, Math.ceil(archiveGroups.length / postsPerPage));
  const normalizedPage = Math.min(Math.max(currentPage, 1), pageCount);
  const startIndex = (normalizedPage - 1) * postsPerPage;
  const pagedGroups = archiveGroups.slice(startIndex, startIndex + postsPerPage);

  return (
    <section className="content-section listing-page">
      <SectionHeading eyebrow="Archive" title="归档" />
      <div className="listing-intro">
        <p>按月份回看全部文章。当前第 {normalizedPage} 页，共 {pageCount} 页。</p>
        <a className="section-link" href="/#归档">
          返回首页归档
          <ChevronRight size={17} />
        </a>
      </div>
      <div className="timeline">
        {pagedGroups.map(({ month, entries }) => (
          <div className="timeline-month" key={month}>
            <button type="button">
              <span />
              {month}
            </button>
            <ul>
              {entries.map((post) => (
                <li key={post.slug}>
                  <a href={`/posts/${post.slug}`}>{post.date}  {post.title}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <SimplePagination basePath="/archive/page" currentPage={normalizedPage} pageCount={pageCount} />
    </section>
  );
}

function sortGalleryAlbums(albums: GalleryAlbum[]) {
  return [...albums].sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
}

function sortGalleryImages(images: GalleryImage[]) {
  return [...images].sort((first, second) => first.sortOrder - second.sortOrder || first.title.localeCompare(second.title));
}

function isSystemGalleryAlbum(album: GalleryAlbum) {
  return album.id === systemGalleryAlbumId || album.slug === systemGalleryAlbumSlug;
}

function getSystemGalleryImageUrls(albums: GalleryAlbum[]) {
  const systemImages = albums.find((album) => isSystemGalleryAlbum(album))?.images ?? [];

  return {
    avatar: systemImages.find((image) => image.id === 'image-guzhouyue-avatar')?.imageUrl,
    classic: systemImages.find((image) => image.id === 'image-guzhouyue-hero')?.imageUrl,
    cyber: systemImages.find((image) => image.id === 'image-guzhouyue-cyber')?.imageUrl,
  };
}

function getActiveOwnerAvatarUrl(ownerAvatarUrl: string, systemGalleryImages: ReturnType<typeof getSystemGalleryImageUrls>) {
  return ownerAvatarUrl === systemGalleryAssetUrls.avatarImage ? systemGalleryImages.avatar ?? ownerAvatarUrl : ownerAvatarUrl;
}

function normalizeGalleryImageOrder(images: GalleryImage[]) {
  return images.map((image, index) => ({
    ...image,
    sortOrder: index,
  }));
}

function withGalleryAlbumImages(album: GalleryAlbum, images: GalleryImage[]) {
  const coverImage = images.find((image) => image.id === album.coverImageId) ?? images[0] ?? null;

  return {
    ...album,
    coverImageId: coverImage?.id ?? null,
    coverImageUrl: coverImage?.imageUrl ?? '',
    imageCount: images.length,
    images,
  };
}

function isSupportedComposerImageFile(file: File) {
  return supportedComposerImageMimeTypes.has(file.type);
}

function hasImageFileInTransfer(dataTransfer: DataTransfer) {
  if (Array.from(dataTransfer.files ?? []).some((file) => file.type.startsWith('image/'))) {
    return true;
  }

  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === 'file' && item.type.startsWith('image/'));
}

function getImageFilesFromTransfer(dataTransfer: DataTransfer) {
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 0) {
    return files.filter((file) => file.type.startsWith('image/'));
  }

  return Array.from(dataTransfer.items ?? [])
    .map((item) => (item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null))
    .filter((file): file is File => file !== null);
}

function escapeMarkdownAltText(value: string) {
  return value.replace(/[\r\n[\]]/g, ' ').trim() || '图片';
}

function createComposerImageTitle(file: File, index: number) {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim();
  if (baseName && !/^image$/i.test(baseName)) {
    return baseName.slice(0, 80);
  }

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `截图-${timestamp}${index > 0 ? `-${index + 1}` : ''}`;
}

function AuthorAvatar({
  ownerAvatarUrl,
  ownerName,
  size = 'medium',
}: {
  ownerAvatarUrl: string;
  ownerName: string;
  size?: 'small' | 'medium' | 'large';
}) {
  const initial = normalizeOwnerName(ownerName).slice(0, 1);

  return (
    <span className={`author-avatar author-avatar-${size}`} aria-hidden="true">
      {ownerAvatarUrl ? <img alt="" src={ownerAvatarUrl} /> : <span>{initial}</span>}
    </span>
  );
}

function PostListItem({ post }: { post: Post }) {
  return (
    <a className={`list-post tone-${post.tone}`} href={`/posts/${post.slug}`}>
      <PostCover className="list-post-cover" coverImage={post.coverImage} loading="lazy" />
      <div>
        <span>{post.category}</span>
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
      </div>
      <footer>
        <small>{post.date}</small>
      </footer>
    </a>
  );
}

function Pagination({
  category,
  currentPage,
  pageCount,
  tag,
}: {
  category: string | null;
  currentPage: number;
  pageCount: number;
  tag: string | null;
}) {
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (category) {
      params.set('category', category);
    }
    if (tag) {
      params.set('tag', tag);
    }
    const queryString = params.toString();
    return `/posts/page/${page}${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <nav className="pagination" aria-label="文章分页">
      <a aria-disabled={currentPage === 1} href={pageHref(Math.max(1, currentPage - 1))}>
        上一页
      </a>
      <div>
        {pageNumbers.map((page) => (
          <a aria-current={page === currentPage ? 'page' : undefined} href={pageHref(page)} key={page}>
            {page}
          </a>
        ))}
      </div>
      <a aria-disabled={currentPage === pageCount} href={pageHref(Math.min(pageCount, currentPage + 1))}>
        下一页
      </a>
    </nav>
  );
}

function SimplePagination({
  basePath,
  currentPage,
  pageCount,
}: {
  basePath: string;
  currentPage: number;
  pageCount: number;
}) {
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pageHref = (page: number) => `${basePath}/${page}`;

  return (
    <nav className="pagination" aria-label="分页">
      <a aria-disabled={currentPage === 1} href={pageHref(Math.max(1, currentPage - 1))}>
        上一页
      </a>
      <div>
        {pageNumbers.map((page) => (
          <a aria-current={page === currentPage ? 'page' : undefined} href={pageHref(page)} key={page}>
            {page}
          </a>
        ))}
      </div>
      <a aria-disabled={currentPage === pageCount} href={pageHref(Math.min(pageCount, currentPage + 1))}>
        下一页
      </a>
    </nav>
  );
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function decodeHashAnchor(hash: string) {
  const raw = hash.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function calculateReadingMinutes(markdown: string) {
  const chineseCharacters = (markdown.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latinWords = markdown.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil((chineseCharacters + latinWords) / 420));
}

function PostDetailPage({ ownerAvatarUrl, posts, slug }: { ownerAvatarUrl: string; posts: Post[]; slug: string }) {
  const post = getPostBySlug(posts, slug);
  useArticleHead(post ?? null);
  const markdown = post ? getPostMarkdown(post) : '';
  const outlineItems = useMemo(() => getMarkdownOutline(markdown), [markdown]);
  const passageAnchor = typeof window !== 'undefined' ? decodeHashAnchor(window.location.hash) : '';
  const [starfieldPassageAnchors, setStarfieldPassageAnchors] = useState<Array<{ anchor: string; text: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    if (!post || !passageAnchor.startsWith('passage-id-')) {
      setStarfieldPassageAnchors([]);
      return () => {
        cancelled = true;
      };
    }
    fetchPublicStarfield()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setStarfieldPassageAnchors(
          payload.passages
            .filter((passage) => passage.article.slug === post.slug)
            .map((passage) => ({ anchor: passage.anchor, text: passage.text })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setStarfieldPassageAnchors([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [passageAnchor, post]);

  useEffect(() => {
    if (!passageAnchor) {
      return;
    }
    if (passageAnchor.startsWith('passage-id-') && starfieldPassageAnchors.length === 0) {
      return;
    }
    const target = document.getElementById(passageAnchor) ?? document.querySelector('.article-body');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.classList.add('is-passage-target');
    const timeout = window.setTimeout(() => target?.classList.remove('is-passage-target'), 2200);
    return () => window.clearTimeout(timeout);
  }, [passageAnchor, starfieldPassageAnchors]);

  if (!post) {
    return <NotFoundPage />;
  }

  const { previousPost, nextPost } = getAdjacentPosts(posts, slug);
  const readingMinutes = calculateReadingMinutes(markdown);
  const relatedPosts = posts.filter((item) => item.slug !== post.slug && item.category === post.category).slice(0, 3);

  return (
    <article className="article-page">
      <header className={`article-hero tone-${post.tone}`}>
        <PostCover className="article-hero-cover" coverImage={post.coverImage} />
        <div className="article-hero-content">
          <a className="breadcrumb" href="/posts/page/1">
            全部文章
          </a>
          <span>{post.category}</span>
          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
          <div className="article-meta">
            <span className="article-author-meta">
              <AuthorAvatar ownerAvatarUrl={ownerAvatarUrl} ownerName={post.authorName || '孤舟月'} size="small" />
              <small>作者：{post.authorName || '孤舟月'}</small>
            </span>
            <small>{post.date}</small>
            <small>{readingMinutes} 分钟阅读</small>
          </div>
          {post.tags.length > 0 && (
            <div className="article-tags" aria-label="文章标签">
              {post.tags.map((tag) => (
                <a href={`/posts/page/1?category=${encodeURIComponent(post.category)}&tag=${encodeURIComponent(tag)}`} key={tag}>
                  {tag}
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      {outlineItems.length > 0 && (
        <nav className="article-toc" aria-label="文章目录">
          <strong>目录</strong>
          {outlineItems.map((item) => (
            <span className={`toc-level-${item.level}`} key={item.id}>{item.title}</span>
          ))}
        </nav>
      )}

      {passageAnchor && (
        <p className="passage-anchor-notice">
          已从星图定位到文段锚点：{passageAnchor}
        </p>
      )}

      <MarkdownBody markdown={markdown} passageAnchors={starfieldPassageAnchors} />

      <nav className="article-neighbors" aria-label="相邻文章">
        {previousPost ? (
          <a href={`/posts/${previousPost.slug}`}>
            <small>上一篇</small>
            {previousPost.title}
          </a>
        ) : (
          <span />
        )}
        {nextPost ? (
          <a href={`/posts/${nextPost.slug}`}>
            <small>下一篇</small>
            {nextPost.title}
          </a>
        ) : (
          <span />
        )}
      </nav>

      {relatedPosts.length > 0 && (
        <section className="related-posts" aria-label="相关文章">
          <SectionHeading eyebrow="Related" title="相关文章" />
          <div className="listing-grid listing-grid-compact">
            {relatedPosts.map((relatedPost) => (
              <PostListItem key={relatedPost.slug} post={relatedPost} />
            ))}
          </div>
        </section>
      )}

      <ArticleComments slug={post.slug} />
    </article>
  );
}

function NotFoundPage() {
  return (
    <section className="content-section not-found-page">
      <SectionHeading eyebrow="404" title="没有找到这页" />
      <p>这条路径暂时没有内容，可以回到首页或浏览全部文章。</p>
      <div className="hero-actions">
        <a className="primary-action" href="/">
          返回首页
        </a>
        <a className="secondary-action" href="/posts/page/1">
          全部文章
        </a>
      </div>
    </section>
  );
}

function SectionHeading({
  action,
  eyebrow,
  title,
}: {
  action?: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="section-heading">
      <span>
        <Feather size={16} />
        {eyebrow}
      </span>
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export default App;

