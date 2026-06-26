import { Menu, Moon, Search, Sun, X } from 'lucide-react';
import { AuthorAvatar } from '../components';
import type { HomepageCopy } from '../contentStore';
import type { ColorScheme } from '../siteSettings';
import { navItems } from './navigation';

export function SiteHeader({
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

export function SiteFooter({
  homepage,
  ownerAvatarUrl,
  ownerName,
}: {
  homepage: HomepageCopy;
  ownerAvatarUrl: string;
  ownerName: string;
}) {
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
