import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CornerDownLeft,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Post } from "../posts";
import { highlightSearchText } from "../lib/articleSearch";
import type { SearchMode } from "../lib/articleSearch";
import { useArticleSearch } from "../lib/useArticleSearch";

const RESULTS_PER_PAGE = 10;

export function SearchCommand({
  quickLinks,
  posts,
  onClose,
}: {
  quickLinks: string[];
  posts: Post[];
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // 输入状态留在弹窗内，避免每敲一个字都重绘完整首页。
  const [query, onQueryChange] = useState("");
  const [mode, setMode] = useState<SearchMode>("relevance");
  const [category, setCategory] = useState("");
  const [selection, setSelection] = useState<{ key: string; index: number }>({
    key: "",
    index: 0,
  });
  const {
    results: allResults,
    isUpdating,
    error,
  } = useArticleSearch(posts, query, mode);
  const categories = useMemo(
    () =>
      [
        ...new Set(
          posts
            .filter(
              (post) =>
                (!post.status || post.status === "published") &&
                !post.deletedAt,
            )
            .map((post) => post.category),
        ),
      ].filter(Boolean),
    [posts],
  );
  const results = category
    ? allResults.filter((result) => result.post.category === category)
    : allResults;
  // 页大小固定，检索仍覆盖全部文章，任何时候最多挂载十个结果卡片。
  const resultKey = `${query}\u0000${mode}\u0000${category}`;
  const [pagination, setPagination] = useState({ key: "", page: 0 });
  const pageCount = Math.max(1, Math.ceil(results.length / RESULTS_PER_PAGE));
  const page =
    pagination.key === resultKey ? Math.min(pagination.page, pageCount - 1) : 0;
  const visibleResults = results.slice(
    page * RESULTS_PER_PAGE,
    (page + 1) * RESULTS_PER_PAGE,
  );
  const selectionKey = `${resultKey}\u0000${page}`;
  const activeIndex =
    selection.key === selectionKey
      ? Math.min(selection.index, visibleResults.length - 1)
      : 0;
  const hasQuery = Boolean(query.trim());

  useEffect(() => {
    // 查询、模式或分类改变后真正重置页码，清空查询时也不能回到旧的末页。
    setPagination({ key: resultKey, page: 0 });
  }, [resultKey]);

  useEffect(() => {
    setSelection({ key: selectionKey, index: 0 });
  }, [selectionKey]);

  useEffect(() => {
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 先记住触发按钮，再聚焦输入框；不能用 autoFocus 抢先覆盖焦点来源。
    inputRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        !event.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        closeRef.current();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus();
    };
  }, []);

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLAnchorElement>(`[data-search-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, selectionKey, allResults]);

  function navigateResults(event: ReactKeyboardEvent<HTMLElement>) {
    trapFocus(event);
    // 中文输入法确认候选词时不跳转文章，也不拦截方向键。
    if (
      event.nativeEvent.isComposing ||
      event.keyCode === 229 ||
      !visibleResults.length ||
      isUpdating
    )
      return;
    const inResults =
      event.target instanceof HTMLElement &&
      event.target.closest(".search-result");
    if (event.target !== inputRef.current && !inResults) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next =
        (activeIndex +
          (event.key === "ArrowDown" ? 1 : -1) +
          visibleResults.length) %
        visibleResults.length;
      setSelection({ key: selectionKey, index: next });
      if (inResults)
        panelRef.current
          ?.querySelector<HTMLAnchorElement>(`[data-search-index="${next}"]`)
          ?.focus();
    } else if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault();
      panelRef.current
        ?.querySelector<HTMLAnchorElement>(
          `[data-search-index="${activeIndex}"]`,
        )
        ?.click();
    }
  }

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") {
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
        aria-labelledby="site-search-title"
        onKeyDown={navigateResults}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="search-header">
          <div className="search-heading">
            <div>
              <span className="search-eyebrow">字里行间</span>
              <h2 id="site-search-title">寻找一篇文章</h2>
            </div>
            <button
              className="search-close"
              type="button"
              onClick={onClose}
              aria-label="关闭搜索"
            >
              <X size={19} />
            </button>
          </div>
          <div className="search-input-row">
            <Search size={21} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              aria-label="站内搜索关键词"
              aria-describedby="search-query-help"
              maxLength={160}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索标题、标签，或一段正文…"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  onQueryChange("");
                  inputRef.current?.focus();
                }}
                aria-label="清空关键词"
              >
                <X size={16} />
              </button>
            )}
            <kbd className="search-input-shortcut">↵</kbd>
          </div>
          <div className="search-options">
            <div className="search-mode" role="group" aria-label="匹配方式">
              <button
                type="button"
                aria-pressed={mode === "relevance"}
                onClick={() => setMode("relevance")}
              >
                相关优先
              </button>
              <button
                type="button"
                aria-pressed={mode === "exact"}
                onClick={() => setMode("exact")}
              >
                精确匹配
              </button>
            </div>
            <p id="search-query-help">空格分隔关键词 · 双引号锁定词组</p>
          </div>
          {!hasQuery && (
            <div className="search-topics">
              <span>试着搜</span>
              <div className="quick-links">
                {quickLinks.map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => {
                      onQueryChange(item);
                      setCategory("");
                      inputRef.current?.focus();
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        <div className="search-summary">
          <p aria-live="polite" aria-atomic="true">
            {isUpdating ? (
              "正在查找…"
            ) : hasQuery ? (
              <>
                <strong>{results.length}</strong> 篇相关内容
              </>
            ) : (
              <>
                最近发布 <span>· {results.length} 篇文章</span>
              </>
            )}
          </p>
          <label className="search-category">
            <SlidersHorizontal size={14} aria-hidden="true" />
            <select
              aria-label="筛选文章分类"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">全部分类</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="search-results"
          aria-label="搜索结果"
          aria-busy={isUpdating}
        >
          {results.length > 0 ? (
            visibleResults.map((result, i) => (
              <a
                className={`search-result${i === activeIndex ? " is-active" : ""}`}
                href={`/posts/${encodeURIComponent(result.post.slug)}`}
                key={result.post.slug}
                data-search-index={i}
                onFocus={() => setSelection({ key: selectionKey, index: i })}
              >
                <div className="search-result-meta">
                  <span className="search-result-category">
                    {result.post.category || "文章"}
                  </span>
                  <time>{result.post.date}</time>
                  {hasQuery && (
                    <span className="search-match-label">
                      {result.matchLabel}
                    </span>
                  )}
                </div>
                <h3>
                  <HighlightedText
                    text={result.post.title}
                    terms={result.matchedTerms}
                  />
                </h3>
                <p className="search-result-snippet">
                  <HighlightedText
                    text={result.snippet}
                    terms={result.matchedTerms}
                  />
                </p>
                {result.post.tags.length > 0 && (
                  <div className="search-result-tags">
                    {result.post.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>
                        #{" "}
                        <HighlightedText
                          text={tag}
                          terms={result.matchedTerms}
                        />
                      </span>
                    ))}
                  </div>
                )}
                <ArrowRight
                  className="search-result-arrow"
                  size={18}
                  aria-hidden="true"
                />
              </a>
            ))
          ) : (
            <div className="search-empty">
              <BookOpen size={30} strokeWidth={1.3} aria-hidden="true" />
              <h3>
                {isUpdating
                  ? "正在准备搜索…"
                  : error
                    ? "搜索暂时不可用"
                    : "暂时没有找到这篇文章"}
              </h3>
              <p>
                {isUpdating
                  ? "稍等一下，文章马上就好。"
                  : error
                    ? "请关闭后重新打开搜索，或刷新页面再试。"
                    : category
                      ? "试试其他分类，或缩短关键词。"
                      : mode === "exact"
                        ? "精确匹配需要包含全部关键词，试试「相关优先」。"
                        : "换一个词，或用空格拆开多个关键词。"}
              </p>
              {!isUpdating &&
                !error &&
                (category ? (
                  <button type="button" onClick={() => setCategory("")}>
                    查看全部分类
                  </button>
                ) : mode === "exact" ? (
                  <button type="button" onClick={() => setMode("relevance")}>
                    改用相关优先
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onQueryChange("");
                      inputRef.current?.focus();
                    }}
                  >
                    浏览最近文章
                  </button>
                ))}
            </div>
          )}
        </div>
        <footer className="search-footer">
          <span>
            <kbd>
              <ArrowUp size={11} />
              <ArrowDown size={11} />
            </kbd>{" "}
            选择{" "}
            <kbd>
              <CornerDownLeft size={12} />
            </kbd>{" "}
            打开
          </span>
          {results.length > RESULTS_PER_PAGE ? (
            <nav className="search-pagination" aria-label="搜索结果分页">
              <button
                type="button"
                aria-label="上一页搜索结果"
                disabled={page === 0 || isUpdating}
                onClick={() =>
                  setPagination({ key: resultKey, page: page - 1 })
                }
              >
                上一页
              </button>
              <span aria-live="polite">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                aria-label="下一页搜索结果"
                disabled={page >= pageCount - 1 || isUpdating}
                onClick={() =>
                  setPagination({ key: resultKey, page: page + 1 })
                }
              >
                下一页
              </button>
            </nav>
          ) : (
            <span>
              <kbd>Esc</kbd> 关闭
            </span>
          )}
        </footer>
      </section>
    </div>
  );
}

export function buildSearchQuickLinks(posts: Post[]) {
  const frequency = new Map<string, number>();
  for (const post of posts) {
    for (const value of new Set([post.category, ...post.tags].filter(Boolean)))
      frequency.set(value, (frequency.get(value) ?? 0) + 1);
  }
  return [...frequency]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([value]) => value);
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightSearchText(text, terms).map((part, i) =>
        part.highlighted ? <mark key={i}>{part.text}</mark> : part.text,
      )}
    </>
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("aria-hidden"));
}
