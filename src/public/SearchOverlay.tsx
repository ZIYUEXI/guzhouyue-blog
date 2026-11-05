import { useEffect, useRef, useState } from 'react';
import { SearchCommand, buildSearchQuickLinks } from './SearchCommand';
import { loadSearchArticles } from './publicData';
import type { Post } from '../posts';

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const loadingSearch = !posts;
  // 仅搜索弹窗请求全文，索引计算继续交给既有 Worker。
  useEffect(() => {
    let active = true;
    setError('');
    loadSearchArticles().then((items) => { if (active) setPosts(items); })
      .catch((reason) => { if (active) setError(String(reason.message || reason)); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!loadingSearch) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) onClose();
    };
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [loadingSearch, onClose]);
  if (posts) return <SearchCommand posts={posts} quickLinks={buildSearchQuickLinks(posts)} onClose={onClose} />;
  return <div className="search-layer" onClick={onClose}>
    <section className="search-panel" role="dialog" aria-modal="true" aria-label="全文搜索" onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll('button')];
        const target = event.shiftKey ? buttons.at(-1) : buttons[0];
        const boundary = event.shiftKey ? buttons[0] : buttons.at(-1);
        if (document.activeElement === boundary) { event.preventDefault(); target?.focus(); }
      }}>
      <p role="status">{error || '正在准备全文搜索…'}</p>
      {error && <button type="button" onClick={() => setAttempt((value) => value + 1)}>重新加载</button>}
      <button type="button" ref={closeButton} onClick={onClose}>关闭搜索</button>
    </section>
  </div>;
}
