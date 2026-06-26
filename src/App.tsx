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
import { AdminCommandPanel } from './AdminCommandPanel';
import { AdminDashboardPanel } from './AdminDashboardPanel';
import { AdminPostsPanel } from './AdminPostsPanel';
import { AdminStarfieldPanel } from './AdminStarfieldPanel';
import { AdminTagsPanel } from './AdminTagsPanel';
import {
  AuthorAvatar,
  PanelHeader,
  SectionHeading,
} from './components';
import { MarkdownBody } from './MarkdownBody';
import {
  AllArchivePage,
  AllNotesPage,
  AllPostsPage,
  buildSearchQuickLinks,
  HomeContent,
  HomePage,
  navItems,
  NotFoundPage,
  PostDetailPage,
  SearchCommand,
  SiteFooter,
  SiteHeader,
} from './public';
import { PublicGalleryPage } from './PublicGalleryPage';
import { StarfieldPage } from './StarfieldPage';
import type { RichMarkdownEditorHandle } from './RichMarkdownEditor';
import {
  defaultSiteContent,
  emptySiteContent,
  ensureSystemGalleryAlbums,
  resetSiteContent,
  saveSiteContent,
  type HomepageCopy,
  type FeaturedSeries,
  type GalleryAlbum,
  type GalleryImage,
  type NoteSection,
  type SiteContent,
} from './contentStore';
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
  type ColorScheme,
  type SiteSettings,
  type StylePreset,
  normalizeOwnerName,
  normalizeOwnerAvatarUrl,
} from './siteSettings';
import { postsPerPage, type Post, type PostStatus } from './posts';
import type { BatchResult } from './lib/adminTypes';
import {
  formatBatchResult,
  formatCommentTime,
  formatDeletedAt,
  formatDraftSavedAt,
  formatInteger,
  formatLlmUsageFeature,
  formatLlmUsageTime,
  formatToday,
  formatTokenCount,
} from './lib/formatUtils';
import {
  buildArchive,
  buildLocalAdminTags,
  collectExistingTags,
  createUniqueSlug,
  fromDatetimeLocalValue,
  getArchiveDateLabel,
  getArchiveMonthLabel,
  getPostArchiveDateValue,
  getPostArchiveMonthValue,
  getPostBySlug,
  getPostMarkdown,
  getPostStatus,
  getPostStatusLabel,
  getPublishedPosts,
  movePostToArchiveDate,
  normalizeMarkdown,
  normalizeTags,
  slugifyPostTitle,
  sortPosts,
  splitTagInput,
  toDatetimeLocalValue,
  type ArchiveGroup,
} from './lib/postUtils';
import {
  getLineStartOffset,
  getMarkdownOutline,
  moveMarkdownHeadingBlock,
  normalizeLooseCodeFences,
  type OutlineItem,
} from './lib/markdownUtils';
import {
  createComposerImageTitle,
  escapeMarkdownAltText,
  getActiveOwnerAvatarUrl,
  getImageFilesFromTransfer,
  getSystemGalleryImageUrls,
  hasImageFileInTransfer,
  isLocalGalleryAlbumDraft,
  isSupportedComposerImageFile,
  isSystemGalleryAlbum,
  normalizeGalleryImageOrder,
  sortGalleryAlbums,
  sortGalleryImages,
  withGalleryAlbumImages,
} from './lib/galleryUtils';
import 'katex/dist/katex.min.css';

const RichMarkdownEditor = lazy(() =>
  import('./RichMarkdownEditor').then((module) => ({ default: module.RichMarkdownEditor })),
);

const adminPostsPerPage = 8;
const adminSeriesPerPage = 1;
const composerImageAlbumSlug = 'article-images';
const composerImageAlbumTitle = '文章配图';

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

function getAdminEditPostSlug(pathname: string) {
  const editMatch = pathname.match(/^\/admin\/posts\/([^/]+)\/edit$/);
  return editMatch ? decodeURIComponent(editMatch[1]) : undefined;
}

const commentStatusLabels: Record<AdminCommentStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

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

  async function movePostsToArchiveDate(slugs: string[], dateValue: string): Promise<BatchResult> {
    if (!dateValue) {
      return { success: 0, failed: Array.from(new Set(slugs)).length };
    }

    return updatePosts(slugs, (post) => movePostToArchiveDate(post, dateValue));
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
      window.alert('新增相册失败，请确认后台服务正在运行并且登录没有过期。');
      return;
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

    const nextAlbums = content.galleryAlbums.filter((_, albumIndex) => albumIndex !== index);

    try {
      await deleteAdminGalleryAlbum(album.id || album.slug);
      onContentChange({ ...content, galleryAlbums: nextAlbums });
    } catch (error) {
      if ((error instanceof ApiError && error.status === 404) || isLocalGalleryAlbumDraft(album)) {
        onContentChange({ ...content, galleryAlbums: nextAlbums });
        return;
      }

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
                    onMovePostsToArchiveDate={movePostsToArchiveDate}
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
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [activeCoverAlbumKey, setActiveCoverAlbumKey] = useState('all');
  const [previewCoverImageId, setPreviewCoverImageId] = useState('');
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
  const coverGalleryAlbums = useMemo(
    () =>
      sortGalleryAlbums(galleryAlbums).map((album) => {
        const images = sortGalleryImages(album.images).map((image) => ({
          ...image,
          albumTitle: album.title,
        }));

        return {
          key: album.id || album.slug,
          title: album.title,
          description: album.description,
          imageCount: images.length,
          coverImageUrl: album.coverImageUrl || images[0]?.imageUrl || '',
          images,
        };
      }),
    [galleryAlbums],
  );
  const coverImageOptions = useMemo(
    () => coverGalleryAlbums.flatMap((album) => album.images),
    [coverGalleryAlbums],
  );
  const activeCoverAlbum = coverGalleryAlbums.find((album) => album.key === activeCoverAlbumKey) ?? null;
  const visibleCoverImages = activeCoverAlbumKey === 'all' ? coverImageOptions : activeCoverAlbum?.images ?? [];
  const selectedCoverImage = coverImageOptions.find((image) => image.imageUrl === coverImage) ?? null;
  const activeCoverPreviewImage =
    visibleCoverImages.find((image) => image.id === previewCoverImageId) ??
    selectedCoverImage ??
    visibleCoverImages[0] ??
    coverImageOptions[0] ??
    null;

  useEffect(() => {
    if (activeCoverAlbumKey !== 'all' && !coverGalleryAlbums.some((album) => album.key === activeCoverAlbumKey)) {
      setActiveCoverAlbumKey('all');
    }
  }, [activeCoverAlbumKey, coverGalleryAlbums]);

  useEffect(() => {
    if (visibleCoverImages.length === 0) {
      setPreviewCoverImageId('');
      return;
    }

    const selectedVisibleImage = visibleCoverImages.find((image) => image.imageUrl === coverImage);
    const previewStillVisible = visibleCoverImages.some((image) => image.id === previewCoverImageId);
    if (!previewStillVisible) {
      setPreviewCoverImageId(selectedVisibleImage?.id ?? visibleCoverImages[0].id);
    }
  }, [coverImage, previewCoverImageId, visibleCoverImages]);

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

  function chooseCoverImage(nextCoverImage: string) {
    updateMetaField('coverImage', nextCoverImage, setCoverImage);
    setShowCoverPicker(false);
  }

  function openCoverPicker() {
    const matchedAlbum = coverGalleryAlbums.find((album) => album.images.some((image) => image.imageUrl === coverImage));
    const matchedImage = coverImageOptions.find((image) => image.imageUrl === coverImage);
    setActiveCoverAlbumKey(matchedAlbum?.key ?? 'all');
    setPreviewCoverImageId(matchedImage?.id ?? '');
    setShowCoverPicker(true);
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
                <div className="composer-cover-actions">
                  <button className="secondary-action" type="button" onClick={openCoverPicker}>
                    <ImageIcon size={17} />
                    从图库选择封面
                  </button>
                  {coverImage && (
                    <button className="secondary-action" type="button" onClick={() => chooseCoverImage('')}>
                      <X size={17} />
                      清空封面
                    </button>
                  )}
                </div>
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
      {showCoverPicker && (
        <div className="shortcut-layer" role="presentation" onMouseDown={() => setShowCoverPicker(false)}>
          <section
            className="gallery-picker-panel cover-picker-panel"
            role="dialog"
            aria-modal="true"
            aria-label="选择文章封面"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="typora-details-head">
              <div>
                <span>Cover</span>
                <strong>选择文章封面</strong>
              </div>
              <button className="typora-icon-action" type="button" onClick={() => setShowCoverPicker(false)}>
                <X size={17} />
              </button>
            </div>

            <div className="cover-picker-layout">
              <aside className="cover-picker-sidebar" aria-label="图库列表">
                <button
                  aria-pressed={activeCoverAlbumKey === 'all'}
                  type="button"
                  onClick={() => setActiveCoverAlbumKey('all')}
                >
                  <span className="cover-picker-album-thumb">
                    {coverImageOptions[0]?.imageUrl ? <img alt="" src={coverImageOptions[0].imageUrl} /> : <ImageIcon size={18} />}
                  </span>
                  <span>
                    <strong>全部图片</strong>
                    <small>{coverImageOptions.length} 张图片</small>
                  </span>
                </button>
                {coverGalleryAlbums.map((album) => (
                  <button
                    aria-pressed={activeCoverAlbumKey === album.key}
                    key={album.key}
                    type="button"
                    onClick={() => setActiveCoverAlbumKey(album.key)}
                  >
                    <span className="cover-picker-album-thumb">
                      {album.coverImageUrl ? <img alt="" src={album.coverImageUrl} /> : <ImageIcon size={18} />}
                    </span>
                    <span>
                      <strong>{album.title}</strong>
                      <small>{album.imageCount} 张图片</small>
                    </span>
                  </button>
                ))}
              </aside>

              <div className="cover-picker-content">
                <div className="cover-picker-content-head">
                  <div>
                    <strong>{activeCoverAlbum?.title ?? '全部图片'}</strong>
                    <span>{visibleCoverImages.length} 张可选图片</span>
                  </div>
                  {activeCoverAlbum?.description && <p>{activeCoverAlbum.description}</p>}
                </div>

                {visibleCoverImages.length > 0 ? (
                  <div className="gallery-picker-grid cover-picker-grid">
                    {visibleCoverImages.map((image) => (
                      <button
                        aria-pressed={image.imageUrl === coverImage}
                        key={image.id}
                        type="button"
                        onFocus={() => setPreviewCoverImageId(image.id)}
                        onMouseEnter={() => setPreviewCoverImageId(image.id)}
                        onClick={() => chooseCoverImage(image.imageUrl)}
                      >
                        <img alt="" src={image.imageUrl} />
                        <span>
                          <strong>{image.title}</strong>
                          <small>{image.albumTitle}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">这个图库还没有图片。</p>
                )}
              </div>

              <aside className="cover-picker-preview" aria-label="封面预览">
                {activeCoverPreviewImage ? (
                  <>
                    <div className="cover-picker-preview-frame">
                      <img alt="" src={activeCoverPreviewImage.imageUrl} />
                    </div>
                    <div className="cover-picker-preview-copy">
                      <strong>{activeCoverPreviewImage.title}</strong>
                      <span>{activeCoverPreviewImage.albumTitle}</span>
                      {activeCoverPreviewImage.description && <p>{activeCoverPreviewImage.description}</p>}
                    </div>
                  </>
                ) : (
                  <p className="empty-state">暂无可预览图片。</p>
                )}
              </aside>
            </div>

            <div className="cover-picker-actions">
              <button className="secondary-action" type="button" onClick={() => chooseCoverImage('')}>
                不使用封面
              </button>
            </div>
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
  onMovePostsToArchiveDate,
  onPublishPosts,
  onUnpublishPosts,
  posts,
}: {
  archiveGroups: ArchiveGroup[];
  onArchivePosts: (slugs: string[]) => Promise<BatchResult>;
  onMovePostsToArchiveDate: (slugs: string[], dateValue: string) => Promise<BatchResult>;
  onPublishPosts: (slugs: string[]) => Promise<BatchResult>;
  onUnpublishPosts: (slugs: string[]) => Promise<BatchResult>;
  posts: Post[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMonth, setActiveMonth] = useState('all');
  const [activeStatus, setActiveStatus] = useState<'all' | PostStatus>('all');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState(() => posts[0] ? getPostArchiveDateValue(posts[0]) || '' : '');
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
    if (!targetDate) {
      setTargetDate(posts[0] ? getPostArchiveDateValue(posts[0]) || '' : '');
    }
  }, [posts, targetDate]);

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
          aria-label="目标归档日期"
          disabled={selectedCount === 0 || batchBusy}
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
        />
        <button
          className="secondary-action"
          disabled={selectedCount === 0 || !targetDate || batchBusy}
          type="button"
          onClick={() =>
            runBatch(`迁移到 ${getArchiveDateLabel(targetDate)}`, selectedSlugs, (slugs) =>
              onMovePostsToArchiveDate(slugs, targetDate),
            )
          }
        >
          迁移日期
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
                  const postDate = getPostArchiveDateValue(post);

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
                          aria-label={`调整${post.title}的归档日期`}
                          disabled={batchBusy}
                          type="date"
                          value={postDate}
                          onChange={(event) => {
                            const nextDate = event.target.value;
                            if (nextDate && nextDate !== postDate) {
                              void runBatch(`迁移「${post.title}」`, [post.slug], (slugs) =>
                                onMovePostsToArchiveDate(slugs, nextDate),
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
  apiKeyConfigured: false,
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
  page: 1,
  pageSize: 10,
  pageCount: 1,
  total: 0,
};

const llmTokenUsagePageSize = 10;

function AdminLlmConfigPanel() {
  const [config, setConfig] = useState<ApiLlmConfig>(defaultLlmConfig);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const [tokenUsage, setTokenUsage] = useState<ApiLlmTokenUsagePayload>(defaultLlmTokenUsage);
  const [tokenUsagePage, setTokenUsagePage] = useState(1);
  const [tokenUsageStatus, setTokenUsageStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [connectionTestStatus, setConnectionTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [connectionTestResult, setConnectionTestResult] = useState<ApiLlmConnectionTestResult | null>(null);
  const activeProvider = llmProviderOptions.find((provider) => provider.value === config.provider) ?? llmProviderOptions[0];
  const safeTokenUsagePage = Math.min(Math.max(tokenUsage.page || tokenUsagePage, 1), Math.max(tokenUsage.pageCount || 1, 1));
  const tokenUsageFirstIndex = tokenUsage.total === 0 ? 0 : (safeTokenUsagePage - 1) * tokenUsage.pageSize + 1;
  const tokenUsageLastIndex = Math.min(tokenUsage.total, (safeTokenUsagePage - 1) * tokenUsage.pageSize + tokenUsage.items.length);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    fetchAdminLlmConfig()
      .then((nextConfig) => {
        if (cancelled) {
          return;
        }
        setConfig({ ...defaultLlmConfig, ...nextConfig });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTokenUsageStatus('loading');

    fetchAdminLlmTokenUsage(tokenUsagePage, llmTokenUsagePageSize)
      .then((latestTokenUsage) => {
        if (cancelled) {
          return;
        }
        setTokenUsage({
          ...defaultLlmTokenUsage,
          ...latestTokenUsage,
          summary: { ...defaultLlmTokenUsage.summary, ...latestTokenUsage.summary },
          items: latestTokenUsage.items ?? [],
        });
        setTokenUsageStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setTokenUsageStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tokenUsagePage]);

  async function refreshTokenUsage(page = tokenUsagePage) {
    setTokenUsageStatus('loading');
    try {
      const latestTokenUsage = await fetchAdminLlmTokenUsage(page, llmTokenUsagePageSize);
      setTokenUsage({
        ...defaultLlmTokenUsage,
        ...latestTokenUsage,
        summary: { ...defaultLlmTokenUsage.summary, ...latestTokenUsage.summary },
        items: latestTokenUsage.items ?? [],
      });
      setTokenUsagePage(latestTokenUsage.page || page);
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
      await refreshTokenUsage(1);
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
              placeholder={config.apiKeyConfigured ? '已保存，留空则不修改' : 'sk-...'}
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

        {tokenUsage.total > 0 && (
          <nav className="admin-pagination llm-token-pagination" aria-label="Token 消耗记录分页">
            <span>
              第 {formatInteger(tokenUsageFirstIndex)}-{formatInteger(tokenUsageLastIndex)} 条，共 {formatInteger(tokenUsage.total)} 条
            </span>
            <div>
              <button
                className="secondary-action"
                disabled={tokenUsageStatus === 'loading' || safeTokenUsagePage === 1}
                onClick={() => setTokenUsagePage(Math.max(1, safeTokenUsagePage - 1))}
                type="button"
              >
                上一页
              </button>
              <strong>
                {safeTokenUsagePage} / {tokenUsage.pageCount}
              </strong>
              <button
                className="secondary-action"
                disabled={tokenUsageStatus === 'loading' || safeTokenUsagePage >= tokenUsage.pageCount}
                onClick={() => setTokenUsagePage(Math.min(tokenUsage.pageCount, safeTokenUsagePage + 1))}
                type="button"
              >
                下一页
              </button>
            </div>
          </nav>
        )}
      </section>
    </section>
  );
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

export default App;


