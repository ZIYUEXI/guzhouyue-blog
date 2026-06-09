import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { NoteSection } from './contentStore';
import type { Post, PostStatus } from './posts';

type BatchResult = {
  success: number;
  failed: number;
};

const adminPostsPerPage = 8;

const postStatusLabels: Record<PostStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

export function AdminPostsPanel({
  noteSections,
  onArchivePosts,
  onDeletePosts,
  onMovePostsToCategory,
  onPublishPosts,
  onSyncPost,
  onUnpublishPosts,
  posts,
}: {
  noteSections: NoteSection[];
  onArchivePosts: (slugs: string[]) => Promise<BatchResult>;
  onDeletePosts: (slugs: string[]) => Promise<BatchResult>;
  onMovePostsToCategory: (slugs: string[], category: string) => Promise<BatchResult>;
  onPublishPosts: (slugs: string[]) => Promise<BatchResult>;
  onSyncPost: (slug: string) => Promise<BatchResult>;
  onUnpublishPosts: (slugs: string[]) => Promise<BatchResult>;
  posts: Post[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeStatus, setActiveStatus] = useState<'all' | PostStatus>('all');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState(noteSections[0]?.category ?? '');
  const [batchNotice, setBatchNotice] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const categories = useMemo(() => ['全部', ...Array.from(new Set(posts.map((post) => post.category))).sort()], [posts]);
  const filteredPosts = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesCategory = activeCategory === '全部' || post.category === activeCategory;
      const matchesStatus = activeStatus === 'all' || getPostStatus(post) === activeStatus;
      const searchableText = `${post.title}${post.excerpt}${post.category}${post.tags.join('')}${post.date}${getPostStatusLabel(post)}`.toLowerCase();
      return matchesCategory && matchesStatus && (!keyword || searchableText.includes(keyword));
    });
  }, [activeCategory, activeStatus, posts, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / adminPostsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedPosts = filteredPosts.slice((safeCurrentPage - 1) * adminPostsPerPage, safeCurrentPage * adminPostsPerPage);
  const firstItemIndex = filteredPosts.length === 0 ? 0 : (safeCurrentPage - 1) * adminPostsPerPage + 1;
  const lastItemIndex = Math.min(filteredPosts.length, safeCurrentPage * adminPostsPerPage);
  const visibleSlugs = pagedPosts.map((post) => post.slug);
  const allVisibleSelected = visibleSlugs.length > 0 && visibleSlugs.every((slug) => selectedSlugs.includes(slug));
  const selectedCount = selectedSlugs.length;

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, activeStatus, searchQuery]);

  useEffect(() => {
    setSelectedSlugs((slugs) => slugs.filter((slug) => posts.some((post) => post.slug === slug)));
  }, [posts]);

  useEffect(() => {
    if (!bulkCategory && noteSections[0]?.category) {
      setBulkCategory(noteSections[0].category);
    }
  }, [bulkCategory, noteSections]);

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
    <section className="admin-panel" aria-label="文章管理">
      <header className="panel-header">
        <h2>文章管理</h2>
        <a className="primary-action" href="/admin/posts/new">
          <Plus size={17} />
          创建文章
        </a>
      </header>
      <div className="admin-posts-overview">
        <div className="archive-summary">
          <strong>{posts.length}</strong>
          <span>篇文章</span>
          <strong>{new Set(posts.map((post) => post.category)).size}</strong>
          <span>个分类</span>
          <strong>{posts.filter((post) => getPostStatus(post) === 'draft').length}</strong>
          <span>篇草稿</span>
        </div>

        <div className="admin-toolbar" aria-label="文章筛选">
          <label className="admin-search-field">
            <Search size={17} />
            <input
              aria-label="搜索文章"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索标题、摘要、分类或标签"
              value={searchQuery}
            />
          </label>
          <div className="admin-filter-tabs" role="group" aria-label="按分类筛选文章">
            {categories.map((categoryName) => (
              <button
                aria-pressed={activeCategory === categoryName}
                key={categoryName}
                onClick={() => setActiveCategory(categoryName)}
                type="button"
              >
                {categoryName}
              </button>
            ))}
          </div>
          <div className="admin-filter-tabs admin-status-tabs" role="group" aria-label="按状态筛选文章">
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

        <div className="admin-bulk-toolbar" aria-label="文章批量操作">
          <label className="admin-select-all">
            <input checked={allVisibleSelected} type="checkbox" onChange={toggleVisiblePosts} />
            选中本页
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
          <select
            aria-label="批量迁移分类"
            disabled={selectedCount === 0 || batchBusy}
            value={bulkCategory}
            onChange={(event) => setBulkCategory(event.target.value)}
          >
            {noteSections.map((section) => (
              <option key={section.category} value={section.category}>
                {section.category}
              </option>
            ))}
          </select>
          <button
            className="secondary-action"
            disabled={selectedCount === 0 || !bulkCategory || batchBusy}
            type="button"
            onClick={() => runBatch('批量迁移分类', selectedSlugs, (slugs) => onMovePostsToCategory(slugs, bulkCategory))}
          >
            迁移分类
          </button>
          <button
            className="danger-action"
            disabled={selectedCount === 0 || batchBusy}
            type="button"
            onClick={() => {
              if (window.confirm(`确定删除选中的 ${selectedCount} 篇文章吗？`)) {
                void runBatch('批量删除', selectedSlugs, onDeletePosts);
              }
            }}
          >
            <Trash2 size={16} />
            批量删除
          </button>
        </div>
        {batchNotice && <p className="admin-batch-notice">{batchNotice}</p>}

        {filteredPosts.length > 0 ? (
          <>
            <div className="admin-post-list" aria-label="文章列表">
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
                      <span>{post.date}</span>
                    </div>
                    <p>{post.excerpt}</p>
                    <div className="admin-post-meta">
                      <span className={`admin-status-pill status-${getPostStatus(post)}`}>{getPostStatusLabel(post)}</span>
                      {post.syncStatus === 'local-only' && <span className="admin-status-pill status-local-only">未同步</span>}
                      <span>{post.category}</span>
                      <span>{post.tags.join('，')}</span>
                    </div>
                  </div>
                  <div className="admin-post-actions">
                    {getPostStatus(post) === 'published' ? (
                      <a className="secondary-action" href={`/posts/${post.slug}`}>
                        预览
                      </a>
                    ) : (
                      <button className="secondary-action" disabled type="button" title="草稿和下架文章不可公开预览">
                        预览
                      </button>
                    )}
                    <a className="secondary-action" href={`/admin/posts/${post.slug}/edit`}>
                      <Pencil size={16} />
                      编辑
                    </a>
                    {post.syncStatus === 'local-only' && (
                      <button
                        className="secondary-action"
                        disabled={batchBusy}
                        type="button"
                        onClick={() => runBatch('同步本地稿', [post.slug], ([slug]) => onSyncPost(slug))}
                      >
                        同步
                      </button>
                    )}
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
                    <button
                      className="danger-action"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`确定删除「${post.title}」吗？`)) {
                          void runBatch('删除', [post.slug], onDeletePosts);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <nav className="admin-pagination" aria-label="文章分页">
              <span>
                第 {firstItemIndex}-{lastItemIndex} 篇，共 {filteredPosts.length} 篇
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
            <p>{posts.length > 0 ? '没有匹配的文章。' : '暂无文章。'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function getPostStatus(post: Post): PostStatus {
  return post.status ?? 'published';
}

function getPostStatusLabel(post: Post) {
  return postStatusLabels[getPostStatus(post)];
}

function formatBatchResult(action: string, result: BatchResult) {
  return `${action}完成：成功 ${result.success} 项，失败 ${result.failed} 项。`;
}
