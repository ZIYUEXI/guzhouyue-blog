import { ChevronRight, X } from 'lucide-react';
import { Pagination, PostListItem, SectionHeading, SimplePagination } from '../components';
import type { NoteSection } from '../contentStore';
import { buildArchive } from '../lib/postUtils';
import { postsPerPage, type Post } from '../posts';

export function AllPostsPage({
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
  const visibleTags = tags.slice(0, 16);
  if (tag && tags.includes(tag) && !visibleTags.includes(tag)) {
    visibleTags[visibleTags.length - 1] = tag;
  }
  const visiblePosts = posts.filter((post) => {
    const categoryMatches = category ? post.category === category : true;
    const tagMatches = tag ? post.tags.includes(tag) : true;
    return categoryMatches && tagMatches;
  });
  const pageCount = Math.ceil(visiblePosts.length / allPostsPerPage);
  const normalizedPage = pageCount > 0 ? Math.min(Math.max(currentPage, 1), pageCount) : 1;
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
    <section className="content-section listing-page posts-listing-page">
      <SectionHeading eyebrow="文章索引" title={pageTitle} />
      <div className="listing-intro">
        <p>{visiblePosts.length > 0
          ? `共 ${visiblePosts.length} 篇文章，按发布时间排列。第 ${normalizedPage} / ${pageCount} 页。`
          : '当前筛选下共 0 篇文章。'}</p>
      </div>

      <div className="post-filter-bar" aria-label="文章筛选">
        {(category || tag) && (
          <div className="post-filter-summary" aria-label="当前筛选">
            <span>当前筛选</span>
            <div className="post-filter-selection">
              {category && <strong>分类 · {category}</strong>}
              {tag && <strong>标签 · #{tag}</strong>}
            </div>
            <a className="section-link" href="/posts/page/1">
              清除全部
              <X size={16} />
            </a>
          </div>
        )}
        <div className="post-filter-group" role="group" aria-label="分类筛选">
          <div className="post-filter-label">
            <strong>分类</strong>
            <span>文章栏目</span>
          </div>
          <div className="post-filter-options">
            <a aria-current={!category ? 'page' : undefined} href={filterHref(null, tag)}>全部分类</a>
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
        </div>
        {tags.length > 0 && (
          <div className="post-filter-group tag-filter-group" role="group" aria-label="标签筛选">
            <div className="post-filter-label">
              <strong>标签</strong>
              <span>内容关键词</span>
            </div>
            <div className="post-filter-options">
              {visibleTags.map((tagName) => (
                <a
                  aria-current={tag === tagName ? 'page' : undefined}
                  href={filterHref(category, tagName)}
                  key={tagName}
                >
                  #{tagName}
                </a>
              ))}
            </div>
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

      {visiblePosts.length > 0 && (
        <Pagination category={category} currentPage={normalizedPage} pageCount={pageCount} tag={tag} />
      )}
    </section>
  );
}

export function AllNotesPage({
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

export function AllArchivePage({ currentPage, posts }: { currentPage: number; posts: Post[] }) {
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
