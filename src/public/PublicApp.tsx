import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminMe, fetchPublicGallery, fetchPublicSite, normalizeApiGalleryAlbums, normalizeApiFeaturedSeries, normalizeApiNoteSections } from '../apiClient';
import { defaultSiteContent, type SiteContent } from '../contentStore';
import { applySiteSettings, readSiteSettings, readUserColorScheme, saveSiteSettings, saveUserColorScheme, stylePresetAssets } from '../siteSettings';
import { getRoute, isAdminPath } from '../routing';
import { publicBootstrap } from '../lib/publicSnapshot';
import { HomeContent, HomePage } from './HomePage';
import { SiteHeader, SiteFooter } from './SiteLayout';
import { navItems } from './navigation';
import { loadArticleIndex, type PublicSite } from './publicData';

const Listings = lazy(() => import('./ListingPages'));
const Detail = lazy(() => import('./PostDetailPage').then((module) => ({ default: module.PostDetailPage })));
const Gallery = lazy(() => import('../PublicGalleryPage').then((module) => ({ default: module.PublicGalleryPage })));
const Starfield = lazy(() => import('../StarfieldPage').then((module) => ({ default: module.StarfieldPage })));
const Search = lazy(() => import('./SearchOverlay').then((module) => ({ default: module.SearchOverlay })));
const loading = <p className="content-section" role="status">正在加载内容…</p>;

export function PublicApp() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search + window.location.hash);
  const [site, setSite] = useState<PublicSite | null>(() => publicBootstrap?.site as PublicSite || null);
  const [posts, setPosts] = useState<SiteContent['posts']>([]);
  const [albums, setAlbums] = useState<SiteContent['galleryAlbums']>([]);
  const [galleryReady, setGalleryReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ownerAuthenticated, setOwnerAuthenticated] = useState(false);
  const settings = useMemo(() => ({ ...readSiteSettings(), ...(site?.settings || {}) }), [site]);
  const [colorScheme, setColorScheme] = useState(() => readUserColorScheme());
  const route = getRoute(window.location.pathname);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const content = useMemo<SiteContent>(() => ({
    ...defaultSiteContent, posts, galleryAlbums: albums,
    homepage: { ...defaultSiteContent.homepage, ...site?.homepage },
    noteSections: normalizeApiNoteSections(site?.noteSections),
    featuredSeries: normalizeApiFeaturedSeries(site?.featuredSeries),
    almanac: site?.almanac || null,
  }), [site, posts, albums]);

  useEffect(() => {
    let active = true;
    setError('');
    // 配置与摘要独立更新，首屏无需等待图库或全文。
    fetchPublicSite().then((value) => { if (active) setSite(value as PublicSite); })
      .catch((reason) => { if (active) setError(reason.message); });
    loadArticleIndex().then((items) => { if (active) setPosts(items); })
      .catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    applySiteSettings(settings, colorScheme);
    saveSiteSettings(settings);
  }, [settings, colorScheme]);

  useEffect(() => {
    // 管理入口状态延后检查，避免认证请求占用首屏加载链路。
    const timer = window.setTimeout(() => { void fetchAdminMe().then(() => setOwnerAuthenticated(true)).catch(() => undefined); }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const changed = () => {
      setLocation(window.location.pathname + window.location.search + window.location.hash);
      setMenuOpen(false);
      setSearchOpen(false);
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin || isAdminPath(url.pathname) || url.pathname.startsWith('/api/') || getRoute(url.pathname).name === 'not-found') return;
      // 保留同页锚点的浏览器默认行为，跨公开页面复用已加载的模块与数据。
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      event.preventDefault();
      window.history.pushState({}, '', url.pathname + url.search + url.hash);
      changed();
    };
    window.addEventListener('popstate', changed);
    document.addEventListener('click', navigate);
    return () => { window.removeEventListener('popstate', changed); document.removeEventListener('click', navigate); };
  }, []);

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const frame = window.requestAnimationFrame(() => {
      if (hash) document.getElementById(hash)?.scrollIntoView();
      else window.scrollTo({ top: 0 });
    });
    if (route.name !== 'post') document.title = content.homepage.siteName;
    return () => window.cancelAnimationFrame(frame);
  }, [location]);

  useEffect(() => {
    if (route.name !== 'gallery' || galleryReady) return;
    let active = true;
    fetchPublicGallery().then((items) => {
      if (active) { setAlbums(normalizeApiGalleryAlbums(items)); setGalleryReady(true); }
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [route.name, galleryReady, attempt]);

  const searchParams = new URLSearchParams(window.location.search);
  const hero = site?.media?.hero;
  const avatar = site?.media?.avatar || settings.ownerAvatarUrl;
  const adminHref = `${import.meta.env.VITE_ADMIN_ORIGIN || ''}/admin`;
  return <div className="site-shell">
    <SiteHeader homepage={content.homepage} colorScheme={colorScheme} ownerAuthenticated={ownerAuthenticated}
      adminHref={adminHref} menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((value) => !value)}
      onSearchOpen={() => setSearchOpen(true)} onColorSchemeToggle={() => {
        const next = colorScheme === 'light' ? 'dark' : 'light'; saveUserColorScheme(next); setColorScheme(next);
      }} />
    {menuOpen && <nav className="mobile-drawer" id="mobile-navigation" aria-label="移动端导航">
      {navItems.map((item) => <a href={item.href} key={item.label} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
      {ownerAuthenticated && <a href={adminHref}>后台</a>}
    </nav>}
    {error && <p className="data-source-notice" role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
    <main><Suspense fallback={loading}>
      {route.name === 'home' && <><HomePage content={content} heroImage={hero?.src || stylePresetAssets[settings.stylePreset].heroImage} heroSources={hero} />
        <div className="home-content-background"><HomeContent content={content} ownerAvatarUrl={avatar} ownerName={settings.ownerName} />
          <SiteFooter homepage={content.homepage} ownerAvatarUrl={avatar} ownerName={settings.ownerName} /></div></>}
      {['posts', 'notes', 'archive'].includes(route.name) && <Listings route={route} posts={posts} noteSections={content.noteSections} category={searchParams.get('category')} tag={searchParams.get('tag')} />}
      {route.name === 'post' && <Detail key={route.slug} ownerAvatarUrl={avatar} posts={posts} slug={route.slug} />}
      {route.name === 'gallery' && (galleryReady ? <Gallery albums={albums} /> : loading)}
      {route.name === 'starfield' && <Starfield />}
      {route.name === 'not-found' && <section className="content-section"><h1>页面不存在</h1><a href="/">返回首页</a></section>}
    </Suspense></main>
    {route.name !== 'home' && <SiteFooter homepage={content.homepage} ownerAvatarUrl={avatar} ownerName={settings.ownerName} />}
    {searchOpen && <Suspense fallback={loading}><Search onClose={closeSearch} /></Suspense>}
  </div>;
}
