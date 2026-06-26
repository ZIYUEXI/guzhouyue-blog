import { GitMerge, Search, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ApiAdminTag } from './apiClient';
import type { BatchResult } from './lib/adminTypes';
import type { Post } from './posts';

export function AdminTagsPanel({
  onDeleteTag,
  onMergeTags,
  posts,
  tags,
}: {
  onDeleteTag: (tag: string) => Promise<BatchResult>;
  onMergeTags: (sourceTag: string, targetTag: string) => Promise<BatchResult>;
  posts: Post[];
  tags: ApiAdminTag[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [targetTag, setTargetTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const visibleTags = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return tags;
    }

    return tags.filter((tag) => tag.name.toLowerCase().includes(keyword));
  }, [searchQuery, tags]);
  const selectedTagMeta = tags.find((tag) => tag.name === selectedTag) ?? visibleTags[0] ?? tags[0];
  const tagArticleTitles = selectedTagMeta
    ? posts.filter((post) => post.tags.includes(selectedTagMeta.name)).slice(0, 6).map((post) => post.title)
    : [];
  const mergeTargets = tags.filter((tag) => tag.name !== selectedTagMeta?.name);
  const safeTargetTag = targetTag && mergeTargets.some((tag) => tag.name === targetTag) ? targetTag : mergeTargets[0]?.name ?? '';

  useEffect(() => {
    if (!selectedTagMeta) {
      setSelectedTag('');
      return;
    }

    if (selectedTag !== selectedTagMeta.name) {
      setSelectedTag(selectedTagMeta.name);
    }
  }, [selectedTag, selectedTagMeta]);

  useEffect(() => {
    if (targetTag !== safeTargetTag) {
      setTargetTag(safeTargetTag);
    }
  }, [safeTargetTag, targetTag]);

  async function runDelete(tag: ApiAdminTag) {
    if (busy) {
      return;
    }

    const confirmed = window.confirm(`确定删除标签「${tag.name}」吗？会从 ${tag.articleCount} 篇文章中移除。`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setNotice('');
    try {
      const result = await onDeleteTag(tag.name);
      setNotice(`删除完成：成功更新 ${result.success} 篇文章，失败 ${result.failed} 项。`);
    } finally {
      setBusy(false);
    }
  }

  async function runMerge() {
    if (busy || !selectedTagMeta || !safeTargetTag) {
      return;
    }

    const confirmed = window.confirm(`确定把「${selectedTagMeta.name}」合并到「${safeTargetTag}」吗？源标签会从文章中移除。`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setNotice('');
    try {
      const result = await onMergeTags(selectedTagMeta.name, safeTargetTag);
      setNotice(`合并完成：成功更新 ${result.success} 篇文章，失败 ${result.failed} 项。`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel" aria-label="标签管理">
      <header className="panel-header">
        <h2>标签管理</h2>
      </header>
      <div className="admin-tags-overview">
        <div className="archive-summary admin-post-metrics">
          <div>
            <strong>{tags.length}</strong>
            <span>个标签</span>
          </div>
          <div>
            <strong>{tags.reduce((sum, tag) => sum + tag.articleCount, 0)}</strong>
            <span>篇次引用</span>
          </div>
          <div>
            <strong>{tags.filter((tag) => tag.articleCount <= 1).length}</strong>
            <span>低频标签</span>
          </div>
        </div>

        <div className="admin-tag-tools">
          <label className="admin-search-field">
            <Search size={17} />
            <input
              aria-label="搜索标签"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索标签"
              value={searchQuery}
            />
          </label>
          <div className="admin-tag-merge-box">
            <div className="admin-filter-group-title">
              <GitMerge size={16} />
              <span>合并标签</span>
              <small>{selectedTagMeta ? `${selectedTagMeta.articleCount} 篇` : '无标签'}</small>
            </div>
            <div className="admin-tag-merge-controls">
              <select
                aria-label="选择源标签"
                disabled={busy || tags.length < 2}
                value={selectedTagMeta?.name ?? ''}
                onChange={(event) => setSelectedTag(event.target.value)}
              >
                {tags.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="选择目标标签"
                disabled={busy || mergeTargets.length === 0}
                value={safeTargetTag}
                onChange={(event) => setTargetTag(event.target.value)}
              >
                {mergeTargets.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <button className="primary-action" disabled={busy || !selectedTagMeta || !safeTargetTag} type="button" onClick={runMerge}>
                <GitMerge size={16} />
                合并
              </button>
            </div>
          </div>
        </div>

        {notice && <p className="admin-batch-notice">{notice}</p>}

        {visibleTags.length > 0 ? (
          <div className="admin-tag-grid" aria-label="标签列表">
            {visibleTags.map((tag) => (
              <article
                className="admin-tag-card"
                key={tag.name}
                aria-current={selectedTagMeta?.name === tag.name ? 'true' : undefined}
              >
                <button type="button" onClick={() => setSelectedTag(tag.name)}>
                  <Tags size={17} />
                  <span>{tag.name}</span>
                </button>
                <div>
                  <strong>{tag.articleCount}</strong>
                  <span>篇文章</span>
                  <small>{tag.occurrenceCount} 次出现</small>
                </div>
                <button className="danger-action" disabled={busy} type="button" onClick={() => runDelete(tag)}>
                  <Trash2 size={16} />
                  删除
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>{tags.length > 0 ? '没有匹配的标签。' : '暂无标签。'}</p>
          </div>
        )}

        {selectedTagMeta && (
          <aside className="admin-tag-detail" aria-label="标签引用文章">
            <strong>「{selectedTagMeta.name}」引用文章</strong>
            {tagArticleTitles.length > 0 ? (
              tagArticleTitles.map((title) => <span key={title}>{title}</span>)
            ) : (
              <span>没有文章引用这个标签。</span>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
