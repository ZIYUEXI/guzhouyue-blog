import {
  CalendarDays,
  ChevronRight,
  Code2,
  Columns2,
  Eye,
  FileText,
  Feather,
  Focus,
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
  Sun,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  JSX as ReactJSX,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react';
import ReactMarkdown from 'react-markdown';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  codeBlockPlugin,
  codeMirrorPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
  tablePlugin,
  toolbarPlugin,
  type LexicalVisitor,
  type MdastImportVisitor,
} from '@mdxeditor/editor';
import {
  $getNodeByKey,
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical';
import katex from 'katex';
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math';
import { math as micromarkMath } from 'micromark-extension-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {
  defaultSiteContent,
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
import {
  clearAdminDraft,
  createAdminArticle,
  deleteAdminArticle,
  fetchAdminContent,
  fetchAdminDraft,
  fetchAdminMe,
  createAdminGalleryAlbum,
  deleteAdminGalleryAlbum,
  deleteAdminGalleryImage,
  fetchArticleComments,
  fetchPublicArticles,
  fetchPublicSite,
  fetchAdminDeletedArticles,
  loginAdmin,
  normalizeApiFeaturedSeries,
  normalizeApiGalleryAlbum,
  normalizeApiGalleryAlbums,
  normalizeApiNoteSections,
  normalizeApiPost,
  restoreAdminArticle,
  saveAdminDraft,
  saveAdminFeaturedSeries,
  saveAdminHomepage,
  saveAdminNoteSections,
  saveAdminSettings,
  submitArticleComment,
  updateAdminArticle,
  updateAdminGalleryAlbum,
  updateAdminGalleryImage,
  uploadAdminGalleryImage,
} from './apiClient';
import {
  applySiteSettings,
  colorSchemes,
  readSiteSettings,
  saveSiteSettings,
  stylePresetAssets,
  stylePresets,
  type ColorScheme,
  type SiteSettings,
  type StylePreset,
  normalizeOwnerName,
  normalizeOwnerAvatarUrl,
} from './siteSettings';
import { postsPerPage, type Post } from './posts';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';
import '@mdxeditor/editor/style.css';

const navItems = [
  { label: '首页', href: '/#首页' },
  { label: '文章', href: '/#文章' },
  { label: '札记', href: '/#札记' },
  { label: '归档', href: '/#归档' },
  { label: '关于', href: '/#关于' },
  { label: '登录', href: '/admin' },
];

const homepageArchivePreviewLimit = 4;
const homepageArchiveEntriesPerMonthLimit = 6;
const adminPostsPerPage = 8;

function App() {
  const [settings, setSettings] = useState<SiteSettings>(() => readSiteSettings());
  const [content, setContent] = useState<SiteContent>(() => readSiteContent());
  const [adminAuthStatus, setAdminAuthStatus] = useState<'checking' | 'authenticated' | 'anonymous'>('checking');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pathname = window.location.pathname;
  const category = new URLSearchParams(window.location.search).get('category');
  const isAdminRoute =
    pathname === '/admin' ||
    pathname === '/admin/posts' ||
    pathname === '/admin/posts/new' ||
    /^\/admin\/posts\/[^/]+\/edit$/.test(pathname);

  useEffect(() => {
    applySiteSettings(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function loadSiteData() {
      try {
        if (isAdminRoute) {
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

          if (adminContent.settings) {
            const nextSettings = normalizeLoadedSettings(adminContent.settings, settings);
            setSettings(nextSettings);
            saveSiteSettings(nextSettings);
          }
          return;
        }

        setAdminAuthStatus('anonymous');

        const [sitePayload, articleItems] = await Promise.all([
          fetchPublicSite(),
          fetchPublicArticles(),
        ]);
        if (cancelled) {
          return;
        }

        const posts = articleItems.map(normalizeApiPost).filter((post): post is Post => post !== null);
        const noteSections = normalizeApiNoteSections(sitePayload.noteSections);
        const featuredSeries = normalizeApiFeaturedSeries(sitePayload.featuredSeries);
        const nextContent: SiteContent = {
          posts: posts.length > 0 ? posts : content.posts,
          noteSections: noteSections.length > 0 ? noteSections : content.noteSections,
          featuredSeries: featuredSeries.length > 0 ? featuredSeries : content.featuredSeries,
          galleryAlbums: content.galleryAlbums,
          almanac: sitePayload.almanac ?? null,
          homepage: {
            ...content.homepage,
            ...(sitePayload.homepage ?? {}),
          },
        };
        const nextSettings = normalizeLoadedSettings(sitePayload.settings, settings);

        setContent(nextContent);
        setSettings(nextSettings);
        saveSiteContent(nextContent);
        saveSiteSettings(nextSettings);
      } catch {
        if (isAdminRoute && !cancelled) {
          setAdminAuthStatus('anonymous');
        }
        // API 不可用时保留默认内容和本地缓存，保证公开站点仍可读。
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

  function updateContent(nextContent: SiteContent) {
    setContent(nextContent);
    saveSiteContent(nextContent);
  }

  const filteredPosts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return content.posts;
    }

    return content.posts.filter((post) => {
      const searchableText = `${post.title}${post.excerpt}${post.category}${post.tags.join('')}${getPostMarkdown(post)}`;
      return searchableText.toLowerCase().includes(keyword);
    });
  }, [content.posts, query]);

  if (isAdminRoute) {
    if (adminAuthStatus !== 'authenticated') {
      return (
        <AdminLoginPage
          homepage={content.homepage}
          settings={settings}
          status={adminAuthStatus}
          onLoginSuccess={() => {
            setAdminAuthStatus('authenticated');
            window.location.reload();
          }}
          onThemeToggle={() =>
            updateSettings({
              ...settings,
              colorScheme: settings.colorScheme === 'light' ? 'dark' : 'light',
            })
          }
        />
      );
    }

    return (
      <AdminPage
        content={content}
        settings={settings}
        onContentChange={updateContent}
        onSettingsChange={updateSettings}
      />
    );
  }

  const route = getRoute(pathname);

  return (
    <div className="site-shell">
      <SiteHeader
        homepage={content.homepage}
        colorScheme={settings.colorScheme}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((value) => !value)}
        onColorSchemeToggle={() =>
          updateSettings({
            ...settings,
            colorScheme: settings.colorScheme === 'light' ? 'dark' : 'light',
          })
        }
        onSearchOpen={() => setSearchOpen(true)}
      />
      {menuOpen && (
        <div className="mobile-drawer" id="mobile-navigation" aria-label="移动端导航">
          {navItems.map((item) => (
            <a href={item.href} key={item.label} onClick={() => setMenuOpen(false)}>
              {item.label}
            </a>
          ))}
        </div>
      )}

      <main>
        {route.name === 'home' && (
          <>
            <HomePage content={content} heroImage={stylePresetAssets[settings.stylePreset].heroImage} />
            <div className="home-content-background">
              <HomeContent content={content} ownerAvatarUrl={settings.ownerAvatarUrl} ownerName={settings.ownerName} />
              <SiteFooter homepage={content.homepage} ownerAvatarUrl={settings.ownerAvatarUrl} ownerName={settings.ownerName} />
            </div>
          </>
        )}
        {route.name === 'posts' && (
          <AllPostsPage category={category} currentPage={route.page} posts={content.posts} />
        )}
        {route.name === 'notes' && (
          <AllNotesPage currentPage={route.page} noteSections={content.noteSections} posts={content.posts} />
        )}
        {route.name === 'archive' && <AllArchivePage currentPage={route.page} posts={content.posts} />}
        {route.name === 'post' && <PostDetailPage ownerAvatarUrl={settings.ownerAvatarUrl} posts={content.posts} slug={route.slug} />}
        {route.name === 'not-found' && <NotFoundPage />}
      </main>

      {route.name !== 'home' && (
        <SiteFooter homepage={content.homepage} ownerAvatarUrl={settings.ownerAvatarUrl} ownerName={settings.ownerName} />
      )}

      {searchOpen && (
        <SearchCommand
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
  onLoginSuccess,
  onThemeToggle,
  settings,
  status,
}: {
  homepage: HomepageCopy;
  onLoginSuccess: () => void;
  onThemeToggle: () => void;
  settings: SiteSettings;
  status: 'checking' | 'authenticated' | 'anonymous';
}) {
  const [password, setPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState<'idle' | 'submitting' | 'error'>('idle');

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
    } catch {
      setLoginStatus('error');
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
            {settings.colorScheme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
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
                  if (loginStatus === 'error') {
                    setLoginStatus('idle');
                  }
                }}
                placeholder={status === 'checking' ? '正在检查登录状态' : '输入管理密码'}
                type="password"
                value={password}
              />
            </label>
            {loginStatus === 'error' && <p role="alert">密码不正确，请重新输入。</p>}
            <button disabled={status === 'checking' || loginStatus === 'submitting'} type="submit">
              {loginStatus === 'submitting' ? '登录中' : '登录'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

type Route =
  | { name: 'home' }
  | { name: 'posts'; page: number }
  | { name: 'notes'; page: number }
  | { name: 'archive'; page: number }
  | { name: 'post'; slug: string }
  | { name: 'not-found' };

type ArchiveGroup = {
  month: string;
  entries: Post[];
};

function getRoute(pathname: string): Route {
  if (pathname === '/') {
    return { name: 'home' };
  }

  if (pathname === '/posts') {
    return { name: 'posts', page: 1 };
  }

  const pagedPostsMatch = pathname.match(/^\/posts\/page\/(\d+)$/);
  if (pagedPostsMatch) {
    return { name: 'posts', page: Number(pagedPostsMatch[1]) };
  }

  if (pathname === '/notes') {
    return { name: 'notes', page: 1 };
  }

  const pagedNotesMatch = pathname.match(/^\/notes\/page\/(\d+)$/);
  if (pagedNotesMatch) {
    return { name: 'notes', page: Number(pagedNotesMatch[1]) };
  }

  if (pathname === '/archive') {
    return { name: 'archive', page: 1 };
  }

  const pagedArchiveMatch = pathname.match(/^\/archive\/page\/(\d+)$/);
  if (pagedArchiveMatch) {
    return { name: 'archive', page: Number(pagedArchiveMatch[1]) };
  }

  const postMatch = pathname.match(/^\/posts\/([^/]+)$/);
  if (postMatch) {
    return { name: 'post', slug: decodeURIComponent(postMatch[1]) };
  }

  return { name: 'not-found' };
}

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

type MathMdastNode = {
  type: 'math' | 'inlineMath';
  value: string;
  meta?: string | null;
};

type SerializedFormulaNode = SerializedLexicalNode & {
  formula: string;
  formulaMode: FormulaMode;
};

type FormulaEditorProps = {
  formula: string;
  mode: FormulaMode;
  nodeKey: NodeKey;
  parentEditor: LexicalEditor;
};

function renderFormulaHtml(formula: string, mode: FormulaMode) {
  try {
    return katex.renderToString(formula || ' ', {
      displayMode: mode === 'block',
      output: 'htmlAndMathml',
      throwOnError: false,
    });
  } catch {
    return formula;
  }
}

function FormulaEditor({ formula, mode, nodeKey, parentEditor }: FormulaEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formula);

  useEffect(() => {
    setValue(formula);
  }, [formula]);

  function updateFormula(nextValue: string) {
    const normalizedValue = nextValue.trim() || 'E = mc^2';
    parentEditor.update(() => {
      const lexicalNode = $getNodeByKey(nodeKey);
      if ($isFormulaNode(lexicalNode)) {
        lexicalNode.setFormula(normalizedValue);
      }
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <span className={`wysiwyg-formula-editor ${mode === 'block' ? 'is-block' : 'is-inline'}`}>
        <textarea
          autoFocus
          onBlur={() => updateFormula(value)}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              updateFormula(value);
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(false);
              setValue(formula);
            }
          }}
          rows={mode === 'block' ? 4 : 1}
          spellCheck={false}
          value={value}
        />
      </span>
    );
  }

  return (
    <button
      className={`wysiwyg-formula-node ${mode === 'block' ? 'is-block' : 'is-inline'}`}
      onClick={() => setEditing(true)}
      title="点击编辑公式"
      type="button"
    >
      <span dangerouslySetInnerHTML={{ __html: renderFormulaHtml(formula, mode) }} />
    </button>
  );
}

class FormulaNode extends DecoratorNode<ReactJSX.Element> {
  __formula: string;
  __formulaMode: FormulaMode;

  static getType() {
    return 'formula';
  }

  static clone(node: FormulaNode) {
    return new FormulaNode(node.__formula, node.__formulaMode, node.__key);
  }

  static importJSON(serializedNode: SerializedFormulaNode) {
    return $createFormulaNode(serializedNode.formula, serializedNode.formulaMode);
  }

  constructor(formula: string, formulaMode: FormulaMode, key?: NodeKey) {
    super(key);
    this.__formula = formula;
    this.__formulaMode = formulaMode;
  }

  exportJSON(): SerializedFormulaNode {
    return {
      formula: this.__formula,
      formulaMode: this.__formulaMode,
      type: 'formula',
      version: 1,
    };
  }

  createDOM(_config: EditorConfig) {
    return document.createElement(this.__formulaMode === 'block' ? 'div' : 'span');
  }

  updateDOM() {
    return false;
  }

  getFormula() {
    return this.__formula;
  }

  getFormulaMode() {
    return this.__formulaMode;
  }

  setFormula(nextFormula: string) {
    const writable = this.getWritable();
    writable.__formula = nextFormula;
  }

  decorate(parentEditor: LexicalEditor) {
    return (
      <FormulaEditor
        formula={this.__formula}
        mode={this.__formulaMode}
        nodeKey={this.getKey()}
        parentEditor={parentEditor}
      />
    );
  }

  isInline() {
    return this.__formulaMode === 'inline';
  }
}

function $createFormulaNode(formula: string, formulaMode: FormulaMode) {
  return new FormulaNode(formula, formulaMode);
}

function $isFormulaNode(node: LexicalNode | null | undefined): node is FormulaNode {
  return node instanceof FormulaNode;
}

const MdastFormulaVisitor: MdastImportVisitor<MathMdastNode> = {
  testNode: (node) => node.type === 'math' || node.type === 'inlineMath',
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(
      $createFormulaNode(mdastNode.value, mdastNode.type === 'math' ? 'block' : 'inline'),
    );
  },
};

const FormulaVisitor: LexicalVisitor & {
  testLexicalNode: (node: LexicalNode | null | undefined) => node is FormulaNode;
} = {
  testLexicalNode: $isFormulaNode,
  visitLexicalNode({ lexicalNode, actions }) {
    const formulaNode = lexicalNode as FormulaNode;
    actions.addAndStepInto(
      formulaNode.getFormulaMode() === 'block' ? 'math' : 'inlineMath',
      {
        value: formulaNode.getFormula(),
        ...(formulaNode.getFormulaMode() === 'block' ? { meta: null } : {}),
      },
      false,
    );
  },
};

const mathPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: micromarkMath(),
      [addMdastExtension$]: mathFromMarkdown(),
      [addToMarkdownExtension$]: mathToMarkdown(),
      [addLexicalNode$]: FormulaNode,
      [addImportVisitor$]: MdastFormulaVisitor,
      [addExportVisitor$]: FormulaVisitor,
    });
  },
});

type ComposerDraft = {
  title: string;
  slug: string;
  category: string;
  date: string;
  tone: string;
  excerpt: string;
  tags: string[];
  bodyMarkdown: string;
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
      tone: parsedDraft.tone || 'ink',
      excerpt: parsedDraft.excerpt || '',
      tags: Array.isArray(parsedDraft.tags) ? normalizeTags(parsedDraft.tags) : splitTagInput(String(parsedDraft.tags || '')),
      bodyMarkdown: parsedDraft.bodyMarkdown,
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
    slug: data.slug,
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
    colorScheme: colorSchemes.includes(settings?.colorScheme as ColorScheme) ? settings!.colorScheme! : fallback.colorScheme,
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

function AdminPage({
  content,
  settings,
  onContentChange,
  onSettingsChange,
}: {
  content: SiteContent;
  settings: SiteSettings;
  onContentChange: (content: SiteContent) => void;
  onSettingsChange: (settings: SiteSettings) => void;
}) {
  const [activePanel, setActivePanel] = useState<'posts' | 'trash' | 'notes' | 'series' | 'gallery' | 'archive' | 'homepage' | 'appearance'>(
    'posts',
  );
  const [deletedPosts, setDeletedPosts] = useState<Post[]>([]);
  const [trashNotice, setTrashNotice] = useState('');
  const archiveGroups = buildArchive(content.posts);
  const editPostSlug = getAdminEditPostSlug(window.location.pathname);
  const editingPost = editPostSlug ? getPostBySlug(content.posts, editPostSlug) : undefined;
  const isPostComposerRoute = window.location.pathname === '/admin/posts/new' || Boolean(editPostSlug);

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

  function updateStylePreset(stylePreset: StylePreset) {
    onSettingsChange({ ...settings, stylePreset });
  }

  function updateColorScheme(colorScheme: ColorScheme) {
    onSettingsChange({ ...settings, colorScheme });
  }

  function updateOwnerName(ownerName: string) {
    onSettingsChange({ ...settings, ownerName });
  }

  function updateOwnerAvatarUrl(ownerAvatarUrl: string) {
    onSettingsChange({ ...settings, ownerAvatarUrl: normalizeOwnerAvatarUrl(ownerAvatarUrl) });
  }

  async function deletePost(slug: string) {
    const nextPosts = content.posts.filter((post) => post.slug !== slug);
    const nextFeaturedSeries = content.featuredSeries.map((series) => ({
      ...series,
      postSlugs: series.postSlugs.filter((postSlug) => postSlug !== slug),
    }));
    onContentChange({ ...content, posts: nextPosts, featuredSeries: nextFeaturedSeries });
    try {
      await deleteAdminArticle(slug);
      const deletedPost = content.posts.find((post) => post.slug === slug);
      if (deletedPost) {
        setDeletedPosts((posts) => [{ ...deletedPost, deletedAt: new Date().toISOString() }, ...posts.filter((post) => post.slug !== slug)]);
      }
    } catch {
      // 本地缓存已经更新，等待后端恢复后可由管理台再次保存。
    }
  }

  async function restorePost(slug: string) {
    const deletedPost = deletedPosts.find((post) => post.slug === slug);
    if (!deletedPost) {
      return;
    }

    setTrashNotice('');
    try {
      const restoredPost = normalizeApiPost(await restoreAdminArticle(slug)) ?? deletedPost;
      const nextPosts = [restoredPost, ...content.posts.filter((post) => post.slug !== restoredPost.slug)];
      onContentChange({ ...content, posts: sortPosts(nextPosts) });
      setDeletedPosts((posts) => posts.filter((post) => post.slug !== slug));
    } catch {
      setTrashNotice('恢复失败，请确认后台服务正在运行并且登录没有过期。');
    }
  }

  async function createPost(post: Post) {
    let savedPost = post;
    try {
      savedPost = normalizeApiPost(await createAdminArticle(post)) ?? post;
    } catch {
      // API 保存失败时保留本地缓存，兼容离线草稿发布。
    }

    onContentChange({ ...content, posts: [savedPost, ...content.posts] });
    window.history.pushState({}, '', '/admin/posts');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  async function updatePost(originalSlug: string, post: Post) {
    let savedPost = post;
    try {
      savedPost = normalizeApiPost(await updateAdminArticle(originalSlug, post)) ?? post;
    } catch {
      // API 保存失败时保留本地缓存，避免编辑内容丢失。
    }

    const nextPosts = content.posts.map((currentPost) => (currentPost.slug === originalSlug ? savedPost : currentPost));
    const nextFeaturedSeries = content.featuredSeries.map((series) => ({
      ...series,
      postSlugs: series.postSlugs.map((postSlug) => (postSlug === originalSlug ? savedPost.slug : postSlug)),
    }));
    onContentChange({ ...content, posts: nextPosts, featuredSeries: nextFeaturedSeries });
    window.history.pushState({}, '', '/admin/posts');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  function updateNoteSection(index: number, nextSection: NoteSection) {
    const nextSections = content.noteSections.map((section, sectionIndex) =>
      sectionIndex === index ? nextSection : section,
    );
    onContentChange({ ...content, noteSections: nextSections });
    void saveAdminNoteSections(nextSections).catch(() => undefined);
  }

  function addNoteSection() {
    const nextSections = [...content.noteSections, { category: '新札记', description: '给这个札记分类写一句说明' }];
    onContentChange({ ...content, noteSections: nextSections });
    void saveAdminNoteSections(nextSections).catch(() => undefined);
  }

  function deleteNoteSection(index: number) {
    const nextSections = content.noteSections.filter((_, sectionIndex) => sectionIndex !== index);
    onContentChange({ ...content, noteSections: nextSections });
    void saveAdminNoteSections(nextSections).catch(() => undefined);
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
              onClick={() => updateColorScheme(settings.colorScheme === 'light' ? 'dark' : 'light')}
              aria-label="切换明暗模式"
            >
              {settings.colorScheme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
          </div>
        </header>
      )}

      <main className={isPostComposerRoute ? 'admin-main admin-main-composer' : 'admin-main'}>
        {isPostComposerRoute ? (
          <AdminPostComposer
            editingPost={editingPost}
            galleryAlbums={content.galleryAlbums}
            noteSections={content.noteSections}
            onCreatePost={createPost}
            onUpdatePost={updatePost}
            onThemeToggle={() => updateColorScheme(settings.colorScheme === 'light' ? 'dark' : 'light')}
            posts={content.posts}
            settings={settings}
            siteName={content.homepage.siteName}
          />
        ) : (
          <>
            <section className="admin-hero">
              <SectionHeading eyebrow="Admin" title="站点管理台" />
              <p>管理文章、归档、札记与首页文案。当前原型保存到本机浏览器，刷新后仍会保留。</p>
            </section>

            <section className="admin-workspace">
              <aside className="admin-sidebar" aria-label="管理菜单">
                {[
                  ['posts', '文章管理', FileText],
                  ['trash', '回收站', Trash2],
                  ['notes', '札记分类', Feather],
                  ['series', '专题管理', ListOrdered],
                  ['gallery', '图库管理', ImageIcon],
                  ['archive', '归档管理', CalendarDays],
                  ['homepage', '主页词汇', Settings],
                  ['appearance', '外观设置', Sun],
                ].map(([panel, label, Icon]) => (
                  <button
                    aria-pressed={activePanel === panel}
                    key={panel as string}
                    onClick={() => setActivePanel(panel as typeof activePanel)}
                    type="button"
                  >
                    <Icon size={18} />
                    {label as string}
                  </button>
                ))}
                <button className="danger-action" onClick={restoreDefaults} type="button">
                  <Trash2 size={18} />
                  重置内容
                </button>
              </aside>

              <div className="admin-content">
                {activePanel === 'posts' && (
                  <AdminPostsPanel
                    onDeletePost={deletePost}
                    posts={content.posts}
                  />
                )}

                {activePanel === 'trash' && (
                  <AdminTrashPanel
                    notice={trashNotice}
                    onRestorePost={restorePost}
                    posts={deletedPosts}
                  />
                )}

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
                    onUploadImages={uploadGalleryImages}
                  />
                )}

                {activePanel === 'archive' && <AdminArchivePanel archiveGroups={archiveGroups} posts={content.posts} />}

                {activePanel === 'homepage' && (
                  <AdminHomepagePanel homepage={content.homepage} onHomepageChange={updateHomepage} />
                )}

                {activePanel === 'appearance' && (
                  <AdminAppearancePanel
                    albums={content.galleryAlbums}
                    colorScheme={settings.colorScheme}
                    onColorSchemeChange={updateColorScheme}
                    onOwnerAvatarUrlChange={updateOwnerAvatarUrl}
                    onOwnerNameChange={updateOwnerName}
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

function AdminPostsPanel({
  onDeletePost,
  posts,
}: {
  onDeletePost: (slug: string) => void;
  posts: Post[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(posts.length / adminPostsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedPosts = posts.slice((safeCurrentPage - 1) * adminPostsPerPage, safeCurrentPage * adminPostsPerPage);
  const firstItemIndex = posts.length === 0 ? 0 : (safeCurrentPage - 1) * adminPostsPerPage + 1;
  const lastItemIndex = Math.min(posts.length, safeCurrentPage * adminPostsPerPage);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <section className="admin-panel" aria-label="文章管理">
      <PanelHeader
        action={
          <a className="primary-action" href="/admin/posts/new">
            <Plus size={17} />
            创建文章
          </a>
        }
        title="文章管理"
      />
      <div className="admin-posts-overview">
        <div className="archive-summary">
          <strong>{posts.length}</strong>
          <span>篇文章</span>
          <strong>{new Set(posts.map((post) => post.category)).size}</strong>
          <span>个分类</span>
        </div>

        {posts.length > 0 ? (
          <>
            <div className="admin-post-list" aria-label="文章列表">
              {pagedPosts.map((post) => (
                <article className="admin-post-row" key={post.slug}>
                  <div className="admin-post-main">
                    <div className="admin-post-titleline">
                      <h3>{post.title}</h3>
                      <span>{post.date}</span>
                    </div>
                    <p>{post.excerpt}</p>
                    <div className="admin-post-meta">
                      <span>{post.category}</span>
                      <span>{post.tags.join('，')}</span>
                    </div>
                  </div>
                  <div className="admin-post-actions">
                    <a className="secondary-action" href={`/posts/${post.slug}`}>
                      预览
                    </a>
                    <a className="secondary-action" href={`/admin/posts/${post.slug}/edit`}>
                      <Pencil size={16} />
                      编辑
                    </a>
                    <button className="danger-action" type="button" onClick={() => onDeletePost(post.slug)}>
                      <Trash2 size={17} />
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <nav className="admin-pagination" aria-label="文章分页">
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
            <p>暂无文章。</p>
          </div>
        )}
      </div>
    </section>
  );
}

function AdminTrashPanel({
  notice,
  onRestorePost,
  posts,
}: {
  notice: string;
  onRestorePost: (slug: string) => void;
  posts: Post[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(posts.length / adminPostsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedPosts = posts.slice((safeCurrentPage - 1) * adminPostsPerPage, safeCurrentPage * adminPostsPerPage);
  const firstItemIndex = posts.length === 0 ? 0 : (safeCurrentPage - 1) * adminPostsPerPage + 1;
  const lastItemIndex = Math.min(posts.length, safeCurrentPage * adminPostsPerPage);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  return (
    <section className="admin-panel" aria-label="回收站">
      <PanelHeader title="回收站" />
      <div className="admin-posts-overview">
        <div className="archive-summary">
          <strong>{posts.length}</strong>
          <span>篇已删除文章</span>
        </div>
        {notice && <p className="admin-trash-notice">{notice}</p>}

        {posts.length > 0 ? (
          <>
            <div className="admin-post-list" aria-label="已删除文章列表">
              {pagedPosts.map((post) => (
                <article className="admin-post-row" key={post.slug}>
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
                    <button className="secondary-action" type="button" onClick={() => onRestorePost(post.slug)}>
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

function AdminPostComposer({
  editingPost,
  galleryAlbums,
  noteSections,
  onCreatePost,
  onThemeToggle,
  onUpdatePost,
  posts,
  settings,
  siteName,
}: {
  editingPost?: Post;
  galleryAlbums: GalleryAlbum[];
  noteSections: NoteSection[];
  onCreatePost: (post: Post) => void;
  onThemeToggle: () => void;
  onUpdatePost: (originalSlug: string, post: Post) => void;
  posts: Post[];
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
  const [tone, setTone] = useState(editingPost?.tone ?? 'ink');
  const [excerpt, setExcerpt] = useState(editingPost?.excerpt ?? '');
  const [tags, setTags] = useState<string[]>(editingPost?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [bodyMarkdown, setBodyMarkdown] = useState(editingPost ? getPostMarkdown(editingPost) : '');
  const authorName = normalizeOwnerName(settings.ownerName);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('wysiwyg');
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('clean');
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
  const markdownInputRef = useRef<HTMLTextAreaElement>(null);
  const mdxEditorRef = useRef<MDXEditorMethods>(null);
  const paperRef = useRef<HTMLElement>(null);
  const savedSnapshotRef = useRef('');
  const latestDraftRef = useRef<ComposerDraftData>({
    bodyMarkdown,
    category,
    composerMode,
    date,
    excerpt,
    slug,
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
  function openFormulaDialog(nextMode: FormulaMode = 'block') {
    setFormulaMode(nextMode);
    setShowFormulaDialog(true);
  }

  const mdxPlugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      mathPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'ts' }),
      codeMirrorPlugin({
        codeBlockLanguages: {
          css: 'CSS',
          html: 'HTML',
          js: 'JavaScript',
          json: 'JSON',
          jsx: 'JSX',
          markdown: 'Markdown',
          python: 'Python',
          sh: 'Shell',
          ts: 'TypeScript',
          tsx: 'TSX',
        },
      }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarClassName: 'mdx-rich-toolbar',
        toolbarContents: () => (
          <ConditionalContents
            options={[
              { when: (editor) => editor?.editorType === 'codeblock', contents: () => <ChangeCodeMirrorLanguage /> },
              {
                fallback: () => (
                  <>
                    <UndoRedo />
                    <BlockTypeSelect />
                    <BoldItalicUnderlineToggles />
                    <CodeToggle />
                    <CreateLink />
                    <ListsToggle />
                    <InsertCodeBlock />
                    <InsertTable />
                    <button
                      className="mdx-formula-button"
                      data-toolbar-item="true"
                      onClick={() => setShowGalleryPicker(true)}
                      title="插入图库图片"
                      type="button"
                    >
                      <ImageIcon size={18} />
                    </button>
                    <button
                      className="mdx-formula-button"
                      data-toolbar-item="true"
                      onClick={() => openFormulaDialog('block')}
                      title="插入数学公式"
                      type="button"
                    >
                      <Sigma size={18} />
                    </button>
                  </>
                ),
              },
            ]}
          />
        ),
      }),
    ],
    [],
  );

  const currentDraftData = useMemo<ComposerDraftData>(
    () => ({
      bodyMarkdown,
      category,
      composerMode,
      date,
      excerpt,
      slug,
      tags,
      title,
      tone,
    }),
    [bodyMarkdown, category, composerMode, date, excerpt, slug, tags, title, tone],
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
      date: data.date,
      excerpt: data.excerpt,
      savedAt,
      slug: data.slug,
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

  function savePost() {
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
      tone,
      tags: normalizeTags(tags),
      body: [normalizedBodyMarkdown],
      bodyMarkdown: normalizedBodyMarkdown,
    };

    if (editingPost) {
      onUpdatePost(editingPost.slug, nextPost);
    } else {
      onCreatePost(nextPost);
    }

    clearComposerDraft(draftKey);
    void clearAdminDraft(draftKey).catch(() => undefined);
    savedSnapshotRef.current = currentSnapshot;
    setDraftStatus('published');
    return true;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    savePost();
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

  function insertGalleryImageMarkdown(image: GalleryImage) {
    const altText = image.title || '图片';
    const snippet = `\n![${altText}](${image.imageUrl})\n`;
    const textarea = markdownInputRef.current;
    const selectionStart = textarea?.selectionStart ?? bodyMarkdown.length;
    const selectionEnd = textarea?.selectionEnd ?? bodyMarkdown.length;
    const needsLeadingBreak = selectionStart > 0 && !bodyMarkdown.slice(0, selectionStart).endsWith('\n');
    const nextSnippet = `${needsLeadingBreak ? '\n' : ''}${snippet}`;
    const nextMarkdown = `${bodyMarkdown.slice(0, selectionStart)}${nextSnippet}${bodyMarkdown.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + nextSnippet.length;

    if (composerMode === 'wysiwyg') {
      mdxEditorRef.current?.insertMarkdown(nextSnippet);
      setDraftStatus('dirty');
    } else {
      updateBodyMarkdown(nextMarkdown);
    }
    setShowGalleryPicker(false);

    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    }, 0);
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
      date: draft.date || formatToday(),
      excerpt: draft.excerpt,
      slug: draft.slug,
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
    setTone(draft.tone || 'ink');
    setExcerpt(draft.excerpt);
    setTags(draft.tags);
    setBodyMarkdown(draft.bodyMarkdown);
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
    currentSnapshot,
    date,
    draftKey,
    draftStatus,
    excerpt,
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
    currentSnapshot,
    date,
    draftKey,
    draftStatus,
    excerpt,
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
    if (composerMode === 'wysiwyg') {
      mdxEditorRef.current?.setMarkdown(bodyMarkdown);
    }
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
              onClick={onThemeToggle}
              title="切换明暗模式"
              aria-label="切换明暗模式"
            >
              {settings.colorScheme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
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
            <a className="secondary-action" href="/admin/posts">
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

          <main className="typora-paper" aria-label="正文写作区" ref={paperRef}>
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

            <div className="typora-toolbar" aria-label="Markdown 工具栏">
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
              <MDXEditor
                className="typora-rich-editor"
                contentEditableClassName="typora-rich-content"
                markdown={bodyMarkdown}
                onChange={(nextMarkdown, initialNormalize) => {
                  if (!initialNormalize) {
                    const normalizedMarkdown = normalizeLooseCodeFences(nextMarkdown);
                    if (normalizedMarkdown !== nextMarkdown) {
                      mdxEditorRef.current?.setMarkdown(normalizedMarkdown);
                    }
                    updateBodyMarkdown(normalizedMarkdown);
                  }
                }}
                plugins={mdxPlugins}
                ref={mdxEditorRef}
                spellCheck={false}
              />
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
            <div className="note-editor-row" key={`${section.category}-${index}`}>
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
      <PanelHeader action={<button type="button" onClick={onAddSeries}><Plus size={17} />新增专题</button>} title="专题管理" />
      <div className="series-editor-list">
        {seriesList.length > 0 ? (
          seriesList.map((series, index) => {
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
  onUploadImages: (albumIndex: number, files: File[]) => void;
}) {
  const [selectedImageIdsByAlbum, setSelectedImageIdsByAlbum] = useState<Record<string, string[]>>({});
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null);
  const sortedAlbums = sortGalleryAlbums(albums);
  const activeAlbum = sortedAlbums.find((album) => album.id === activeAlbumId) ?? sortedAlbums[0] ?? null;
  const activeAlbumIndex = activeAlbum ? albums.findIndex((album) => album.id === activeAlbum.id) : -1;
  const sortedImages = activeAlbum ? sortGalleryImages(activeAlbum.images) : [];
  const selectedImageIds = activeAlbum
    ? getSelectedImageIds(activeAlbum.id).filter((imageId) => activeAlbum.images.some((image) => image.id === imageId))
    : [];
  const allImagesSelected = sortedImages.length > 0 && selectedImageIds.length === sortedImages.length;

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
    const selectedIds = getSelectedImageIds(album.id);
    if (selectedIds.length === 0) {
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
                {sortedImages.length > 0 && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() =>
                      setAlbumSelectedImageIds(activeAlbum.id, allImagesSelected ? [] : sortedImages.map((image) => image.id))
                    }
                  >
                    {allImagesSelected ? '取消全选' : '全选'}
                  </button>
                )}
                <button
                  className="danger-action"
                  disabled={selectedImageIds.length === 0}
                  type="button"
                  onClick={() => deleteSelectedImages(activeAlbumIndex, activeAlbum)}
                >
                  <Trash2 size={16} />
                  删除选中
                </button>
                {!activeAlbumIsSystem && (
                  <button className="danger-action gallery-delete-album-action" type="button" onClick={() => onDeleteAlbum(activeAlbumIndex)}>
                    <Trash2 size={16} />
                    删除相册
                  </button>
                )}
              </div>
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
              {sortedImages.length > 0 ? (
                sortedImages.map((image, sortedImageIndex) => {
                  const imageIndex = activeAlbum.images.findIndex((item) => item.id === image.id);
                  const isSelected = selectedImageIds.includes(image.id);
                  const isExpanded = expandedImageId === image.id;
                  return (
                    <article className="gallery-image-editor" key={image.id}>
                      <div className="gallery-image-preview">
                        <label className="gallery-image-select" aria-label="选择图片">
                          <input
                            checked={isSelected}
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
                        <button className="danger-action" type="button" onClick={() => onDeleteImage(activeAlbumIndex, imageIndex)}>
                          <Trash2 size={15} />
                        </button>
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
                  <p>这个相册还没有图片。</p>
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

function AdminArchivePanel({ archiveGroups, posts }: { archiveGroups: ArchiveGroup[]; posts: Post[] }) {
  return (
    <section className="admin-panel" aria-label="归档管理">
      <PanelHeader title="归档管理" />
      <div className="archive-summary">
        <strong>{archiveGroups.length}</strong>
        <span>个月份</span>
        <strong>{posts.length}</strong>
        <span>篇文章</span>
      </div>
      <div className="admin-archive-list">
        {archiveGroups.map((group) => (
          <div className="timeline-month" key={group.month}>
            <button type="button">
              <span />
              {group.month}
            </button>
            <ul>
              {group.entries.map((post) => (
                <li key={post.slug}>
                  <a href={`/posts/${post.slug}`}>{post.date}  {post.title}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
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

function AdminAppearancePanel({
  albums,
  colorScheme,
  onOwnerAvatarUrlChange,
  onColorSchemeChange,
  onOwnerNameChange,
  onStylePresetChange,
  ownerAvatarUrl,
  ownerName,
  stylePreset,
}: {
  albums: GalleryAlbum[];
  colorScheme: ColorScheme;
  onOwnerAvatarUrlChange: (ownerAvatarUrl: string) => void;
  onColorSchemeChange: (colorScheme: ColorScheme) => void;
  onOwnerNameChange: (ownerName: string) => void;
  onStylePresetChange: (stylePreset: StylePreset) => void;
  ownerAvatarUrl: string;
  ownerName: string;
  stylePreset: StylePreset;
}) {
  const [ownerNameDraft, setOwnerNameDraft] = useState(ownerName);
  const [ownerAvatarDraft, setOwnerAvatarDraft] = useState(ownerAvatarUrl);
  const systemGalleryImages = useMemo(
    () => sortGalleryImages(albums.find((album) => isSystemGalleryAlbum(album))?.images ?? []),
    [albums],
  );

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
            <h3>明暗模式</h3>
            <p>每个视觉风格都有独立的亮色和暗色表现。</p>
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
      </section>

      <section className="admin-preview" aria-label="当前外观预览">
        <div className="preview-visual">
          <img src={stylePresetAssets[stylePreset].heroImage} alt="" />
        </div>
        <div>
          <span>当前预设</span>
          <h2>{stylePreset === 'classic' ? '中国古风' : '赛博科技'}</h2>
          <p>{colorScheme === 'light' ? '亮色模式' : '暗色模式'} · 刷新首页后保持生效</p>
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
  menuOpen,
  onMenuToggle,
  onColorSchemeToggle,
  onSearchOpen,
}: {
  homepage: HomepageCopy;
  colorScheme: ColorScheme;
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
          <span>{lead.category}</span>
          <h3 className={`featured-title-${featuredTitleDensity}`}>{lead.title}</h3>
          <p>{lead.excerpt}</p>
          <footer>
            <small>{lead.date}</small>
          </footer>
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
      <div className="post-card-meta">
        <span>{post.category}</span>
        <small>{post.date}</small>
      </div>
      <h3>{post.title}</h3>
      <p>{post.excerpt}</p>
      <footer>{post.date}</footer>
    </a>
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
    river.classList.add('is-dragging');
    river.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const river = riverRef.current;
    const dragState = dragStateRef.current;
    if (!river || !dragState.isDragging) return;

    const dragDistance = event.clientX - dragState.startX;
    const verticalDistance = event.clientY - dragState.startY;
    if (Math.hypot(dragDistance, verticalDistance) > 5) {
      dragState.dragged = true;
    }

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
  const archiveGroups = useMemo(() => buildArchive(posts), [posts]);
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
  query,
  results,
  onQueryChange,
  onClose,
}: {
  query: string;
  results: Post[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="search-layer" role="presentation" onMouseDown={onClose}>
      <section
        className="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="站内搜索"
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
          {['写作', '技术笔记', '读书摘录', '山水游踪'].map((item) => (
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
        <a href="/#归档">归档</a>
        <a href="/admin">站点设置</a>
      </nav>
    </footer>
  );
}

function AllPostsPage({
  category,
  currentPage,
  posts,
}: {
  category: string | null;
  currentPage: number;
  posts: Post[];
}) {
  const allPostsPerPage = 5;
  const visiblePosts = category ? posts.filter((post) => post.category === category) : posts;
  const pageCount = Math.max(1, Math.ceil(visiblePosts.length / allPostsPerPage));
  const normalizedPage = Math.min(Math.max(currentPage, 1), pageCount);
  const startIndex = (normalizedPage - 1) * allPostsPerPage;
  const pagedPosts = visiblePosts.slice(startIndex, startIndex + allPostsPerPage);
  const pageTitle = category ? `${category}文章` : '全部文章';

  return (
    <section className="content-section listing-page">
      <SectionHeading eyebrow="All Posts" title={pageTitle} />
      <div className="listing-intro">
        <p>
          按发布时间逐页浏览{category ? `“${category}”分类下的` : '所有'}博客内容。当前第 {normalizedPage}{' '}
          页，共 {pageCount} 页。
        </p>
      </div>

      <div className="listing-grid">
        {pagedPosts.map((post) => (
          <PostListItem key={post.slug} post={post} />
        ))}
      </div>

      <Pagination category={category} currentPage={normalizedPage} pageCount={pageCount} />
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
}: {
  category: string | null;
  currentPage: number;
  pageCount: number;
}) {
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const pageHref = (page: number) =>
    `/posts/page/${page}${category ? `?category=${encodeURIComponent(category)}` : ''}`;

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

function MarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className="article-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

type CommentItem = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

function getCommentsStorageKey(slug: string) {
  return `guzhouyue-comments:${slug}`;
}

function readPostComments(slug: string): CommentItem[] {
  try {
    const storedComments = window.localStorage.getItem(getCommentsStorageKey(slug));
    const parsedComments = storedComments ? JSON.parse(storedComments) : [];

    if (!Array.isArray(parsedComments)) {
      return [];
    }

    return parsedComments.filter((comment): comment is CommentItem => {
      return (
        typeof comment?.id === 'string' &&
        typeof comment.author === 'string' &&
        typeof comment.content === 'string' &&
        typeof comment.createdAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

function savePostComments(slug: string, comments: CommentItem[]) {
  window.localStorage.setItem(getCommentsStorageKey(slug), JSON.stringify(comments));
}

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function ArticleComments({ slug }: { slug: string }) {
  const [comments, setComments] = useState<CommentItem[]>(() => readPostComments(slug));
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      try {
        const apiComments = await fetchArticleComments(slug);
        if (!cancelled) {
          setComments(apiComments);
          savePostComments(slug, apiComments);
        }
      } catch {
        if (!cancelled) {
          setComments(readPostComments(slug));
        }
      }
    }

    loadComments();
    setIsExpanded(false);
    setNotice('');
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    try {
      const savedComment = await submitArticleComment(slug, {
        authorName: author.trim() || '过路读者',
        content: trimmedContent,
      });

      if (savedComment) {
        const nextComments = [savedComment, ...comments];
        setComments(nextComments);
        savePostComments(slug, nextComments);
        setNotice('');
      } else {
        setNotice('评论已提交，审核后展示。');
      }
      setAuthor('');
      setContent('');
    } catch {
      const nextComment: CommentItem = {
        id: `${Date.now()}`,
        author: author.trim() || '过路读者',
        content: trimmedContent,
        createdAt: new Date().toISOString(),
      };
      const nextComments = [nextComment, ...comments];

      setComments(nextComments);
      savePostComments(slug, nextComments);
      setAuthor('');
      setContent('');
      setNotice('评论接口暂不可用，已临时保存到本机。');
    }
  }

  return (
    <section className="article-comments" aria-label="评论">
      <div className="article-comments-header">
        <span>
          <MessageCircle size={18} />
          评论
        </span>
        <button
          aria-expanded={isExpanded}
          aria-controls="article-comments-panel"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          type="button"
        >
          <strong>{comments.length}</strong>
          {isExpanded ? '收起评论' : '展开评论'}
        </button>
      </div>

      {isExpanded && (
        <div className="article-comments-panel" id="article-comments-panel">
          <form className="comment-form" onSubmit={submitComment}>
            <input
              aria-label="评论昵称"
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="昵称"
              value={author}
            />
            <textarea
              aria-label="评论内容"
              onChange={(event) => setContent(event.target.value)}
              placeholder="写下你的想法"
              rows={4}
              value={content}
            />
            <button type="submit">
              <Send size={17} />
              发表评论
            </button>
          </form>
          {notice && <p className="comment-empty">{notice}</p>}

          {comments.length > 0 ? (
            <div className="comment-list">
              {comments.map((comment) => (
                <article className="comment-item" key={comment.id}>
                  <header>
                    <strong>{comment.author}</strong>
                    <time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>
                  </header>
                  <p>{comment.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="comment-empty">还没有评论，来写第一条。</p>
          )}
        </div>
      )}
    </section>
  );
}

function PostDetailPage({ ownerAvatarUrl, posts, slug }: { ownerAvatarUrl: string; posts: Post[]; slug: string }) {
  const post = getPostBySlug(posts, slug);

  if (!post) {
    return <NotFoundPage />;
  }

  const { previousPost, nextPost } = getAdjacentPosts(posts, slug);

  return (
    <article className="article-page">
      <header className={`article-hero tone-${post.tone}`}>
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
        </div>
      </header>

      <MarkdownBody markdown={getPostMarkdown(post)} />

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
