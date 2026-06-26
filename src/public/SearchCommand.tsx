import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { Post } from '../posts';

export function SearchCommand({
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

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
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

export function buildSearchQuickLinks(posts: Post[]) {
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
