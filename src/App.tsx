import {
  CalendarDays,
  ChevronRight,
  FileText,
  Feather,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  defaultSiteContent,
  readSiteContent,
  resetSiteContent,
  saveSiteContent,
  type HomepageCopy,
  type NoteSection,
  type SiteContent,
} from './contentStore';
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
} from './siteSettings';
import { postsPerPage, type Post } from './posts';

const navItems = [
  { label: '首页', href: '/#首页' },
  { label: '文章', href: '/#文章' },
  { label: '札记', href: '/#札记' },
  { label: '归档', href: '/#归档' },
  { label: '关于', href: '/#关于' },
  { label: '管理', href: '/admin' },
];

function App() {
  const [settings, setSettings] = useState<SiteSettings>(() => readSiteSettings());
  const [content, setContent] = useState<SiteContent>(() => readSiteContent());
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pathname = window.location.pathname;
  const category = new URLSearchParams(window.location.search).get('category');
  const isAdminRoute = pathname === '/admin';

  useEffect(() => {
    applySiteSettings(settings);
  }, [settings]);

  function updateSettings(nextSettings: SiteSettings) {
    setSettings(nextSettings);
    saveSiteSettings(nextSettings);
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
      const searchableText = `${post.title}${post.excerpt}${post.category}${post.tags.join('')}${post.body.join('')}`;
      return searchableText.toLowerCase().includes(keyword);
    });
  }, [content.posts, query]);

  if (isAdminRoute) {
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
          <HomePage
            content={content}
            heroImage={stylePresetAssets[settings.stylePreset].heroImage}
          />
        )}
        {route.name === 'posts' && (
          <AllPostsPage category={category} currentPage={route.page} posts={content.posts} />
        )}
        {route.name === 'notes' && (
          <AllNotesPage currentPage={route.page} noteSections={content.noteSections} posts={content.posts} />
        )}
        {route.name === 'archive' && <AllArchivePage currentPage={route.page} posts={content.posts} />}
        {route.name === 'post' && <PostDetailPage posts={content.posts} slug={route.slug} />}
        {route.name === 'not-found' && <NotFoundPage />}
      </main>

      <SiteFooter homepage={content.homepage} />

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
  const [year = '0', month = '1', day = '1'] = date.split('.');
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
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

function formatToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}

function normalizeSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
      .replace(/-+/g, '-') || `post-${Date.now()}`
  );
}

function splitChineseList(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function HomePage({ content, heroImage }: { content: SiteContent; heroImage: string }) {
  return (
    <>
      <HeroMoonScene heroImage={heroImage} homepage={content.homepage} />
      <LatestPosts homepage={content.homepage} posts={content.posts} />
      <TopicRiver homepage={content.homepage} noteSections={content.noteSections} />
      <FeaturedEssay homepage={content.homepage} />
      <ArchivePreview homepage={content.homepage} posts={content.posts} />
      <AboutBlock homepage={content.homepage} noteSections={content.noteSections} posts={content.posts} />
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
  const [activePanel, setActivePanel] = useState<'posts' | 'notes' | 'archive' | 'homepage' | 'appearance'>(
    'posts',
  );
  const [selectedPostSlug, setSelectedPostSlug] = useState(content.posts[0]?.slug ?? '');
  const selectedPost = content.posts.find((post) => post.slug === selectedPostSlug) ?? content.posts[0];
  const archiveGroups = buildArchive(content.posts);

  useEffect(() => {
    if (!selectedPost && content.posts[0]) {
      setSelectedPostSlug(content.posts[0].slug);
    }
  }, [content.posts, selectedPost]);

  function updateStylePreset(stylePreset: StylePreset) {
    onSettingsChange({ ...settings, stylePreset });
  }

  function updateColorScheme(colorScheme: ColorScheme) {
    onSettingsChange({ ...settings, colorScheme });
  }

  function updatePost(slug: string, nextPost: Post) {
    const nextPosts = content.posts.map((post) => (post.slug === slug ? nextPost : post));
    setSelectedPostSlug(nextPost.slug);
    onContentChange({ ...content, posts: sortPosts(nextPosts) });
  }

  function addPost() {
    const nextPost: Post = {
      slug: `new-post-${Date.now()}`,
      title: '新文章',
      excerpt: '在这里写一段文章摘要。',
      category: content.noteSections[0]?.category ?? '人间札记',
      date: formatToday(),
      readingTime: '3 分钟读完',
      tone: 'ink',
      tags: ['新文章'],
      body: ['这里开始写正文。'],
    };

    setSelectedPostSlug(nextPost.slug);
    onContentChange({ ...content, posts: [nextPost, ...content.posts] });
  }

  function deletePost(slug: string) {
    const nextPosts = content.posts.filter((post) => post.slug !== slug);
    setSelectedPostSlug(nextPosts[0]?.slug ?? '');
    onContentChange({ ...content, posts: nextPosts });
  }

  function updateNoteSection(index: number, nextSection: NoteSection) {
    const nextSections = content.noteSections.map((section, sectionIndex) =>
      sectionIndex === index ? nextSection : section,
    );
    onContentChange({ ...content, noteSections: nextSections });
  }

  function addNoteSection() {
    onContentChange({
      ...content,
      noteSections: [...content.noteSections, { category: '新札记', description: '给这个札记分类写一句说明' }],
    });
  }

  function deleteNoteSection(index: number) {
    onContentChange({
      ...content,
      noteSections: content.noteSections.filter((_, sectionIndex) => sectionIndex !== index),
    });
  }

  function updateHomepage(homepage: HomepageCopy) {
    onContentChange({ ...content, homepage });
  }

  function restoreDefaults() {
    const nextContent = resetSiteContent();
    setSelectedPostSlug(nextContent.posts[0]?.slug ?? '');
    onContentChange(nextContent);
  }

  return (
    <div className="site-shell admin-shell">
      <header className="site-header admin-header">
        <a className="brand" href="/" aria-label={`返回${content.homepage.siteName}首页`}>
          <span>{content.homepage.siteName}</span>
          <small>内容管理</small>
        </a>
        <nav className="desktop-nav" aria-label="管理导航">
          <a href="/">返回首页</a>
        </nav>
      </header>

      <main className="admin-main">
        <section className="admin-hero">
          <SectionHeading eyebrow="Admin" title="站点管理台" />
          <p>管理文章、归档、札记与首页文案。当前原型保存到本机浏览器，刷新后仍会保留。</p>
        </section>

        <section className="admin-workspace">
          <aside className="admin-sidebar" aria-label="管理菜单">
            {[
              ['posts', '文章管理', FileText],
              ['notes', '札记分类', Feather],
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
                onAddPost={addPost}
                onDeletePost={deletePost}
                onPostChange={updatePost}
                onSelectPost={setSelectedPostSlug}
                posts={content.posts}
                selectedPost={selectedPost}
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

            {activePanel === 'archive' && <AdminArchivePanel archiveGroups={archiveGroups} posts={content.posts} />}

            {activePanel === 'homepage' && (
              <AdminHomepagePanel homepage={content.homepage} onHomepageChange={updateHomepage} />
            )}

            {activePanel === 'appearance' && (
              <AdminAppearancePanel
                colorScheme={settings.colorScheme}
                onColorSchemeChange={updateColorScheme}
                onStylePresetChange={updateStylePreset}
                stylePreset={settings.stylePreset}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function AdminPostsPanel({
  onAddPost,
  onDeletePost,
  onPostChange,
  onSelectPost,
  posts,
  selectedPost,
}: {
  onAddPost: () => void;
  onDeletePost: (slug: string) => void;
  onPostChange: (slug: string, post: Post) => void;
  onSelectPost: (slug: string) => void;
  posts: Post[];
  selectedPost?: Post;
}) {
  return (
    <section className="admin-panel" aria-label="文章管理">
      <PanelHeader action={<button type="button" onClick={onAddPost}><Plus size={17} />新增文章</button>} title="文章管理" />
      <div className="post-editor-layout">
        <div className="admin-list" aria-label="文章列表">
          {posts.map((post) => (
            <button
              aria-pressed={selectedPost?.slug === post.slug}
              key={post.slug}
              onClick={() => onSelectPost(post.slug)}
              type="button"
            >
              <strong>{post.title}</strong>
              <span>{post.category} · {post.date}</span>
            </button>
          ))}
        </div>

        {selectedPost ? (
          <PostEditor key={selectedPost.slug} onDelete={onDeletePost} onPostChange={onPostChange} post={selectedPost} />
        ) : (
          <p className="empty-state">还没有文章，先新增一篇。</p>
        )}
      </div>
    </section>
  );
}

function PostEditor({
  onDelete,
  onPostChange,
  post,
}: {
  onDelete: (slug: string) => void;
  onPostChange: (slug: string, post: Post) => void;
  post: Post;
}) {
  function patchPost(patch: Partial<Post>) {
    const nextPost = { ...post, ...patch };
    onPostChange(post.slug, nextPost);
  }

  return (
    <form className="admin-form">
      <div className="form-grid two-columns">
        <label>
          标题
          <input value={post.title} onChange={(event) => patchPost({ title: event.target.value })} />
        </label>
        <label>
          链接标识
          <input value={post.slug} onChange={(event) => patchPost({ slug: normalizeSlug(event.target.value) })} />
        </label>
        <label>
          分类
          <input value={post.category} onChange={(event) => patchPost({ category: event.target.value })} />
        </label>
        <label>
          日期
          <input value={post.date} onChange={(event) => patchPost({ date: event.target.value })} />
        </label>
        <label>
          阅读时间
          <input value={post.readingTime} onChange={(event) => patchPost({ readingTime: event.target.value })} />
        </label>
        <label>
          色调
          <select value={post.tone} onChange={(event) => patchPost({ tone: event.target.value })}>
            {['ink', 'pine', 'cinnabar', 'water'].map((tone) => (
              <option key={tone} value={tone}>{tone}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        摘要
        <textarea rows={3} value={post.excerpt} onChange={(event) => patchPost({ excerpt: event.target.value })} />
      </label>
      <label>
        标签
        <input
          value={post.tags.join('，')}
          onChange={(event) => patchPost({ tags: splitChineseList(event.target.value) })}
        />
      </label>
      <label>
        正文
        <textarea
          rows={9}
          value={post.body.join('\n\n')}
          onChange={(event) => patchPost({ body: splitParagraphs(event.target.value) })}
        />
      </label>
      <div className="form-actions">
        <a className="secondary-action" href={`/posts/${post.slug}`}>预览文章</a>
        <button className="danger-action" type="button" onClick={() => onDelete(post.slug)}>
          <Trash2 size={17} />
          删除文章
        </button>
      </div>
    </form>
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
  const fields: Array<[keyof HomepageCopy, string, 'input' | 'textarea']> = [
    ['siteName', '站点名称', 'input'],
    ['siteTagline', '站点副标题', 'input'],
    ['heroTitle', '首页大标题', 'input'],
    ['heroSubtitle', '首页引导语', 'textarea'],
    ['primaryCta', '主按钮文案', 'input'],
    ['secondaryCta', '次按钮文案', 'input'],
    ['seasonTitle', '今日小记标题', 'input'],
    ['seasonText', '今日小记内容', 'input'],
    ['latestTitle', '文章区标题', 'input'],
    ['topicsTitle', '札记区标题', 'input'],
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
        {fields.map(([key, label, kind]) => (
          <label key={key}>
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
  colorScheme,
  onColorSchemeChange,
  onStylePresetChange,
  stylePreset,
}: {
  colorScheme: ColorScheme;
  onColorSchemeChange: (colorScheme: ColorScheme) => void;
  onStylePresetChange: (stylePreset: StylePreset) => void;
  stylePreset: StylePreset;
}) {
  return (
    <>
      <section className="admin-panel" aria-label="外观设置">
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

function HeroMoonScene({ heroImage, homepage }: { heroImage: string; homepage: HomepageCopy }) {
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
          <a className="primary-action" href="/posts/page/1">
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
          <strong>{homepage.seasonTitle}</strong>
          <span>{homepage.seasonText}</span>
        </div>
      </aside>
    </section>
  );
}

function LatestPosts({ homepage, posts }: { homepage: HomepageCopy; posts: Post[] }) {
  const [lead, ...rest] = posts;

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
          <h3>{lead.title}</h3>
          <p>{lead.excerpt}</p>
          <footer>
            <small>{lead.date}</small>
            <small>{lead.readingTime}</small>
          </footer>
        </a>

        <div className="post-list">
          {rest.map((post) => (
            <PostCard key={post.title} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
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
      <footer>{post.readingTime}</footer>
    </a>
  );
}

function TopicRiver({ homepage, noteSections }: { homepage: HomepageCopy; noteSections: NoteSection[] }) {
  return (
    <section className="content-section" id="札记">
      <SectionHeading eyebrow={homepage.topicsEyebrow} title={homepage.topicsTitle} />
      <div className="topic-river" aria-label="文章分类">
        {noteSections.map((section) => (
          <a className="topic-chip" href={`/posts/page/1?category=${encodeURIComponent(section.category)}`} key={section.category}>
            <span>{section.category}</span>
            <small>{section.description}</small>
          </a>
        ))}
      </div>
    </section>
  );
}

function FeaturedEssay({ homepage }: { homepage: HomepageCopy }) {
  return (
    <section className="essay-band">
      <div>
        <SectionHeading eyebrow={homepage.seriesEyebrow} title={homepage.seriesTitle} />
        <h3>{homepage.seriesLead}</h3>
        <p>{homepage.seriesBody}</p>
      </div>
      <div className="chapter-list" aria-label="系列章节">
        {['第一章：夜航', '第二章：山影', '第三章：归舟'].map((chapter, index) => (
          <a href="/posts/page/1" key={chapter}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            {chapter}
          </a>
        ))}
      </div>
    </section>
  );
}

function ArchivePreview({ homepage, posts }: { homepage: HomepageCopy; posts: Post[] }) {
  const archiveGroups = useMemo(() => buildArchive(posts), [posts]);
  const [openMonth, setOpenMonth] = useState(archiveGroups[0]?.month ?? '');

  useEffect(() => {
    if (!archiveGroups.some((group) => group.month === openMonth)) {
      setOpenMonth(archiveGroups[0]?.month ?? '');
    }
  }, [archiveGroups, openMonth]);

  return (
    <section className="content-section archive" id="归档">
      <SectionHeading eyebrow={homepage.archiveEyebrow} title={homepage.archiveTitle} />
      <div className="timeline">
        {archiveGroups.map(({ month, entries }) => (
          <div className="timeline-month" key={month}>
            <button type="button" onClick={() => setOpenMonth(openMonth === month ? '' : month)}>
              <span />
              {month}
            </button>
            {openMonth === month && (
              <ul>
                {entries.map((post) => (
                  <li key={post.slug}>
                    <a href={`/posts/${post.slug}`}>
                      {post.date.slice(5).replace('.', '.')}  {post.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AboutBlock({
  homepage,
  noteSections,
  posts,
}: {
  homepage: HomepageCopy;
  noteSections: NoteSection[];
  posts: Post[];
}) {
  return (
    <section className="about-band" id="关于">
      <div>
        <SectionHeading eyebrow={homepage.aboutEyebrow} title={homepage.aboutTitle} />
        <p>{homepage.aboutBody}</p>
      </div>
      <div className="about-stats" aria-label="站点摘要">
        <span>
          <strong>{posts.length}</strong>
          近日文章
        </span>
        <span>
          <strong>{noteSections.length}</strong>
          内容主题
        </span>
        <span>
          <strong>2026</strong>
          新站启程
        </span>
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

function SiteFooter({ homepage }: { homepage: HomepageCopy }) {
  return (
    <footer className="site-footer">
      <div>
        <strong>{homepage.footerSlogan}</strong>
        <span>© 2026 {homepage.siteName}</span>
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
  const visiblePosts = category ? posts.filter((post) => post.category === category) : posts;
  const pageCount = Math.max(1, Math.ceil(visiblePosts.length / postsPerPage));
  const normalizedPage = Math.min(Math.max(currentPage, 1), pageCount);
  const startIndex = (normalizedPage - 1) * postsPerPage;
  const pagedPosts = visiblePosts.slice(startIndex, startIndex + postsPerPage);
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
        <small>{post.readingTime}</small>
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

function PostDetailPage({ posts, slug }: { posts: Post[]; slug: string }) {
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
          <small>{post.date}</small>
          <small>{post.readingTime}</small>
        </div>
      </header>

      <div className="article-body">
        {post.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

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
