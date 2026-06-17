import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, GitBranch, Loader2, Orbit, Plus, Rocket, Sparkles, X } from 'lucide-react';
import {
  createAdminStarfieldVersion,
  fetchAdminStarfieldVersion,
  fetchAdminStarfieldVersions,
  generateAdminStarfieldPassages,
  generateAdminStarfieldRelationships,
  publishAdminStarfieldVersion,
  updateAdminStarfieldPassage,
  updateAdminStarfieldRelationship,
  type ApiAdminStarfieldVersionPayload,
  type ApiStarfieldPassage,
  type ApiStarfieldRelationship,
  type ApiStarfieldVersion,
} from './apiClient';
import type { Post } from './posts';

type ReviewTab = 'passages' | 'relationships';
type ReviewFilter = 'all' | 'suggested' | 'accepted' | 'hidden';

const relationshipTypeOptions: Array<{ value: ApiStarfieldRelationship['relationshipType']; label: string }> = [
  { value: 'same_topic', label: '同一主题' },
  { value: 'prerequisite', label: '前置知识' },
  { value: 'further_reading', label: '延伸阅读' },
  { value: 'problem_solution', label: '问题与解法' },
  { value: 'comparison', label: '对比关系' },
];

const reviewFilters: Array<{ value: ReviewFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'suggested', label: '候选' },
  { value: 'accepted', label: '已接受' },
  { value: 'hidden', label: '已隐藏' },
];

export function AdminStarfieldPanel({ posts }: { posts: Post[] }) {
  const publishedPosts = posts.filter((post) => (post.status ?? 'published') === 'published');
  const [versions, setVersions] = useState<ApiStarfieldVersion[]>([]);
  const [activePayload, setActivePayload] = useState<ApiAdminStarfieldVersionPayload | null>(null);
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [newVersionName, setNewVersionName] = useState('星空版本');
  const [reviewTab, setReviewTab] = useState<ReviewTab>('passages');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('suggested');
  const [selectedPassageId, setSelectedPassageId] = useState('');
  const [selectedRelationshipId, setSelectedRelationshipId] = useState('');
  const [passageDrafts, setPassageDrafts] = useState<Record<string, { title: string; keywords: string }>>({});
  const [relationshipDrafts, setRelationshipDrafts] = useState<Record<string, { relationshipType: ApiStarfieldRelationship['relationshipType']; rationale: string; strength: string }>>({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const activeVersion = activePayload?.version ?? versions[0] ?? null;
  const passages = activePayload?.passages ?? [];
  const relationships = activePayload?.relationships ?? [];
  const acceptedPassages = passages.filter((passage) => passage.status === 'accepted');
  const suggestedPassages = passages.filter((passage) => passage.status === 'suggested');
  const acceptedRelationships = relationships.filter((relationship) => relationship.status === 'accepted');
  const suggestedRelationships = relationships.filter((relationship) => relationship.status === 'suggested');
  const passageById = useMemo(() => Object.fromEntries(passages.map((passage) => [passage.id, passage])), [passages]);
  const filteredPassages = useMemo(() => filterByStatus(passages, reviewFilter), [passages, reviewFilter]);
  const filteredRelationships = useMemo(() => filterByStatus(relationships, reviewFilter), [relationships, reviewFilter]);
  const selectedPassage = passages.find((passage) => passage.id === selectedPassageId) ?? filteredPassages[0] ?? passages[0] ?? null;
  const selectedRelationship = relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? filteredRelationships[0] ?? relationships[0] ?? null;
  const activeJobs = activePayload?.jobs.slice(0, 4) ?? [];

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    fetchAdminStarfieldVersions()
      .then(async (items) => {
        if (cancelled) {
          return;
        }
        setVersions(items);
        const first = items.find((item) => item.isActive) ?? items[0];
        if (first) {
          const payload = await fetchAdminStarfieldVersion(first.id);
          if (!cancelled) {
            setActivePayload(payload);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotice('星图管理接口暂时不可用。');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPassageDrafts(
      Object.fromEntries(
        passages.map((passage) => [
          passage.id,
          {
            title: passage.title,
            keywords: passage.keywords.join('，'),
          },
        ]),
      ),
    );
    setRelationshipDrafts(
      Object.fromEntries(
        relationships.map((relationship) => [
          relationship.id,
          {
            relationshipType: relationship.relationshipType,
            rationale: relationship.rationale,
            strength: String(relationship.strength),
          },
        ]),
      ),
    );
    setSelectedPassageId((id) => (id && passages.some((passage) => passage.id === id) ? id : passages[0]?.id ?? ''));
    setSelectedRelationshipId((id) => (id && relationships.some((relationship) => relationship.id === id) ? id : relationships[0]?.id ?? ''));
  }, [passages, relationships]);

  async function refreshVersion(versionId: string) {
    const payload = await fetchAdminStarfieldVersion(versionId);
    setActivePayload(payload);
    const items = await fetchAdminStarfieldVersions();
    setVersions(items);
  }

  async function runAction(action: () => Promise<ApiAdminStarfieldVersionPayload | void>, message: string) {
    setBusy(true);
    setNotice('');
    try {
      const payload = await action();
      if (payload) {
        setActivePayload(payload);
        setVersions(await fetchAdminStarfieldVersions());
      }
      setNotice(message);
    } catch {
      setNotice('操作失败，请确认登录状态和后台服务。');
    } finally {
      setBusy(false);
    }
  }

  function toggleArticle(articleId: string) {
    setSelectedArticleIds((ids) => (ids.includes(articleId) ? ids.filter((id) => id !== articleId) : [...ids, articleId]));
  }

  async function createVersion() {
    await runAction(async () => {
      const payload = await createAdminStarfieldVersion(newVersionName);
      setSelectedArticleIds([]);
      setReviewTab('passages');
      return payload;
    }, '已创建新的星图版本。');
  }

  async function generatePassages() {
    if (!activeVersion || selectedArticleIds.length === 0) {
      setNotice('请先选择星图版本和文章。');
      return;
    }
    await runAction(() => generateAdminStarfieldPassages(activeVersion.id, selectedArticleIds), 'Passage 候选已生成。');
    setReviewTab('passages');
    setReviewFilter('suggested');
  }

  async function bulkUpdatePassages(items: ApiStarfieldPassage[], status: ApiStarfieldPassage['status']) {
    if (items.length === 0) {
      return;
    }
    await runAction(async () => {
      let payload: ApiAdminStarfieldVersionPayload | void = undefined;
      for (const passage of items) {
        payload = await updateAdminStarfieldPassage(passage.id, { status, title: passage.title, keywords: passage.keywords } as Partial<ApiStarfieldPassage>);
      }
      return payload;
    }, status === 'accepted' ? 'Passage 已批量接受。' : 'Passage 已批量隐藏。');
  }

  async function savePassage(passage: ApiStarfieldPassage, status: ApiStarfieldPassage['status'] = passage.status) {
    const draft = passageDrafts[passage.id] ?? { title: passage.title, keywords: passage.keywords.join('，') };
    await runAction(
      () =>
        updateAdminStarfieldPassage(passage.id, {
          status,
          title: draft.title,
          keywords: splitKeywords(draft.keywords),
        } as Partial<ApiStarfieldPassage>),
      status === passage.status ? 'Passage 已保存。' : status === 'accepted' ? 'Passage 已接受。' : 'Passage 已隐藏。',
    );
  }

  async function saveRelationship(relationship: ApiStarfieldRelationship, status: ApiStarfieldRelationship['status'] = relationship.status) {
    const draft = relationshipDrafts[relationship.id] ?? {
      relationshipType: relationship.relationshipType,
      rationale: relationship.rationale,
      strength: String(relationship.strength),
    };
    await runAction(
      () =>
        updateAdminStarfieldRelationship(relationship.id, {
          status,
          relationshipType: draft.relationshipType,
          rationale: draft.rationale,
          strength: Number(draft.strength),
        }),
      status === relationship.status ? '关系已保存。' : status === 'accepted' ? '关系已接受。' : '关系已隐藏。',
    );
  }

  return (
    <section className="admin-panel starfield-admin starfield-admin-workbench" aria-label="星图管理">
      <div className="panel-header">
        <div>
          <h2>星图管理</h2>
        </div>
        <a className="secondary-action" href="/starfield">
          <Orbit size={17} />
          查看星图
        </a>
      </div>

      {notice && <p className="admin-batch-notice">{notice}</p>}

      <div className="starfield-workbench-shell">
        <aside className="starfield-console">
          <section className="starfield-console-card">
            <div className="starfield-console-head">
              <h3>版本</h3>
              {busy && <Loader2 size={16} />}
            </div>
            <div className="starfield-version-create">
              <input value={newVersionName} onChange={(event) => setNewVersionName(event.target.value)} />
              <button className="primary-action" disabled={busy} type="button" onClick={() => void createVersion()}>
                <Plus size={16} />
              </button>
            </div>
            <div className="starfield-version-list">
              {versions.map((version) => (
                <button
                  aria-pressed={activeVersion?.id === version.id}
                  key={version.id}
                  type="button"
                  onClick={() => void refreshVersion(version.id)}
                >
                  <strong>{version.name}</strong>
                  <small>{version.isActive ? '当前公开' : version.status} · {version.acceptedPassageCount ?? 0} 星点 · {version.acceptedRelationshipCount ?? 0} 关系</small>
                </button>
              ))}
              {versions.length === 0 && <p>还没有星图版本。</p>}
            </div>
          </section>

          <section className="starfield-console-card">
            <h3>生成</h3>
            <div className="starfield-article-tools">
              <small>已选 {selectedArticleIds.length} / {publishedPosts.length}</small>
              <button className="secondary-action" type="button" onClick={() => setSelectedArticleIds(publishedPosts.map((post) => (post as Post & { id?: string }).id ?? post.slug))}>
                全选
              </button>
              <button className="secondary-action" type="button" onClick={() => setSelectedArticleIds([])}>
                清空
              </button>
            </div>
            <div className="starfield-article-picker compact">
              {publishedPosts.map((post) => {
                const articleId = (post as Post & { id?: string }).id ?? post.slug;
                return (
                  <label key={post.slug}>
                    <input checked={selectedArticleIds.includes(articleId)} type="checkbox" onChange={() => toggleArticle(articleId)} />
                    <span>{post.title}</span>
                  </label>
                );
              })}
            </div>
            <button className="primary-action" disabled={busy || !activeVersion || selectedArticleIds.length === 0} type="button" onClick={() => void generatePassages()}>
              {busy ? <Loader2 size={16} /> : <Sparkles size={16} />}
              生成 Passage
            </button>
          </section>

          {activePayload && (
            <section className="starfield-console-card">
              <h3>状态</h3>
              <div className="starfield-metrics">
                <span><strong>{passages.length}</strong><small>Passage</small></span>
                <span><strong>{suggestedPassages.length}</strong><small>待审星点</small></span>
                <span><strong>{relationships.length}</strong><small>关系</small></span>
                <span><strong>{suggestedRelationships.length}</strong><small>待审关系</small></span>
              </div>
              <div className="starfield-job-list">
                {activeJobs.map((job) => (
                  <small key={job.id}>{job.phase} · {job.status}{job.errorMessage ? ` · ${job.errorMessage}` : ''}</small>
                ))}
              </div>
            </section>
          )}
        </aside>

        <main className="starfield-review-workspace">
          <div className="starfield-review-toolbar">
            <div className="starfield-tabs" role="tablist" aria-label="审核类型">
              <button aria-selected={reviewTab === 'passages'} type="button" onClick={() => setReviewTab('passages')}>
                Passage
                <span>{suggestedPassages.length}/{passages.length}</span>
              </button>
              <button aria-selected={reviewTab === 'relationships'} type="button" onClick={() => setReviewTab('relationships')}>
                关系
                <span>{suggestedRelationships.length}/{relationships.length}</span>
              </button>
            </div>
            <div className="starfield-filter-tabs" aria-label="审核状态">
              {reviewFilters.map((filter) => (
                <button aria-pressed={reviewFilter === filter.value} key={filter.value} type="button" onClick={() => setReviewFilter(filter.value)}>
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="starfield-toolbar-actions">
              {reviewTab === 'passages' ? (
                <>
                  <button className="secondary-action" disabled={busy || suggestedPassages.length === 0} type="button" onClick={() => void bulkUpdatePassages(suggestedPassages, 'accepted')}>
                    <Check size={15} />
                    接受候选
                  </button>
                  <button className="secondary-action" disabled={busy || suggestedPassages.length === 0} type="button" onClick={() => void bulkUpdatePassages(suggestedPassages, 'hidden')}>
                    <X size={15} />
                    隐藏候选
                  </button>
                </>
              ) : (
                <button className="primary-action" disabled={busy || acceptedPassages.length < 2 || !activePayload} type="button" onClick={() => void runAction(() => generateAdminStarfieldRelationships(activePayload!.version.id), '关系候选已生成。')}>
                  <GitBranch size={16} />
                  生成关系
                </button>
              )}
              <button className="primary-action" disabled={busy || acceptedPassages.length < 1 || !activePayload} type="button" onClick={() => void runAction(() => publishAdminStarfieldVersion(activePayload!.version.id), '星图已发布给读者。')}>
                <Rocket size={16} />
                发布
              </button>
            </div>
          </div>

          <div className="starfield-review-layout">
            <div className="starfield-review-list compact">
              {reviewTab === 'passages' ? (
                filteredPassages.map((passage) => (
                  <button
                    aria-pressed={selectedPassage?.id === passage.id}
                    className="starfield-review-row"
                    key={passage.id}
                    type="button"
                    onClick={() => setSelectedPassageId(passage.id)}
                  >
                    <StatusPill status={passage.status} />
                    <strong>{passage.title}</strong>
                    <small>{passage.article.title}</small>
                    <p>{passage.excerpt || passage.text.slice(0, 110)}</p>
                  </button>
                ))
              ) : (
                filteredRelationships.map((relationship) => {
                  const source = passageById[relationship.sourcePassageId];
                  const target = passageById[relationship.targetPassageId];
                  return (
                    <button
                      aria-pressed={selectedRelationship?.id === relationship.id}
                      className="starfield-review-row"
                      key={relationship.id}
                      type="button"
                      onClick={() => setSelectedRelationshipId(relationship.id)}
                    >
                      <StatusPill status={relationship.status} />
                      <strong>{source?.title ?? '未知星点'} → {target?.title ?? '未知星点'}</strong>
                      <small>{relationship.relationshipLabel} · {relationship.isCrossArticle ? '跨文章' : '同文章'}</small>
                      <p>{relationship.rationale}</p>
                    </button>
                  );
                })
              )}
              {reviewTab === 'passages' && filteredPassages.length === 0 && <p className="starfield-empty-list">没有符合筛选条件的 Passage。</p>}
              {reviewTab === 'relationships' && filteredRelationships.length === 0 && <p className="starfield-empty-list">没有符合筛选条件的关系。</p>}
            </div>

            <aside className="starfield-detail-panel">
              {reviewTab === 'passages' ? (
                selectedPassage ? (
                  <PassageEditor
                    busy={busy}
                    draft={passageDrafts[selectedPassage.id] ?? { title: selectedPassage.title, keywords: selectedPassage.keywords.join('，') }}
                    passage={selectedPassage}
                    onDraftChange={(draft) => setPassageDrafts((drafts) => ({ ...drafts, [selectedPassage.id]: draft }))}
                    onSave={(status) => void savePassage(selectedPassage, status)}
                  />
                ) : (
                  <EmptyDetail title="没有 Passage" />
                )
              ) : selectedRelationship ? (
                <RelationshipEditor
                  busy={busy}
                  draft={
                    relationshipDrafts[selectedRelationship.id] ?? {
                      relationshipType: selectedRelationship.relationshipType,
                      rationale: selectedRelationship.rationale,
                      strength: String(selectedRelationship.strength),
                    }
                  }
                  relationship={selectedRelationship}
                  source={passageById[selectedRelationship.sourcePassageId]}
                  target={passageById[selectedRelationship.targetPassageId]}
                  onDraftChange={(draft) => setRelationshipDrafts((drafts) => ({ ...drafts, [selectedRelationship.id]: draft }))}
                  onSave={(status) => void saveRelationship(selectedRelationship, status)}
                />
              ) : (
                <EmptyDetail title="没有关系" />
              )}
            </aside>
          </div>
        </main>
      </div>
    </section>
  );
}

function PassageEditor({
  busy,
  draft,
  passage,
  onDraftChange,
  onSave,
}: {
  busy: boolean;
  draft: { title: string; keywords: string };
  passage: ApiStarfieldPassage;
  onDraftChange: (draft: { title: string; keywords: string }) => void;
  onSave: (status?: ApiStarfieldPassage['status']) => void;
}) {
  return (
    <>
      <div className="starfield-detail-head">
        <StatusPill status={passage.status} />
        <span>{passage.article.category}</span>
      </div>
      <label>
        <small>标题</small>
        <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.target.value })} />
      </label>
      <label>
        <small>关键词</small>
        <input value={draft.keywords} onChange={(event) => onDraftChange({ ...draft, keywords: event.target.value })} />
      </label>
      <div className="starfield-source-box">
        <strong>{passage.article.title}</strong>
        <p>{passage.text}</p>
      </div>
      <div className="starfield-detail-actions">
        <button className="secondary-action" disabled={busy} type="button" onClick={() => onSave()}>
          保存
        </button>
        <button className="primary-action" disabled={busy} type="button" onClick={() => onSave('accepted')}>
          接受
        </button>
        <button className="secondary-action" disabled={busy} type="button" onClick={() => onSave('hidden')}>
          隐藏
        </button>
      </div>
    </>
  );
}

function RelationshipEditor({
  busy,
  draft,
  relationship,
  source,
  target,
  onDraftChange,
  onSave,
}: {
  busy: boolean;
  draft: { relationshipType: ApiStarfieldRelationship['relationshipType']; rationale: string; strength: string };
  relationship: ApiStarfieldRelationship;
  source?: ApiStarfieldPassage;
  target?: ApiStarfieldPassage;
  onDraftChange: (draft: { relationshipType: ApiStarfieldRelationship['relationshipType']; rationale: string; strength: string }) => void;
  onSave: (status?: ApiStarfieldRelationship['status']) => void;
}) {
  return (
    <>
      <div className="starfield-detail-head">
        <StatusPill status={relationship.status} />
        <span>{relationship.isCrossArticle ? '跨文章关系' : '同文章关系'}</span>
      </div>
      <div className="starfield-edge-summary">
        <strong>{source?.title ?? '未知星点'}</strong>
        <GitBranch size={16} />
        <strong>{target?.title ?? '未知星点'}</strong>
      </div>
      <div className="starfield-relationship-edit">
        <label>
          <small>关系类型</small>
          <select value={draft.relationshipType} onChange={(event) => onDraftChange({ ...draft, relationshipType: event.target.value as ApiStarfieldRelationship['relationshipType'] })}>
            {relationshipTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <small>强度</small>
          <input max="1" min="0" step="0.05" type="number" value={draft.strength} onChange={(event) => onDraftChange({ ...draft, strength: event.target.value })} />
        </label>
      </div>
      <label>
        <small>关系说明</small>
        <textarea value={draft.rationale} onChange={(event) => onDraftChange({ ...draft, rationale: event.target.value })} />
      </label>
      <div className="starfield-detail-actions">
        <button className="secondary-action" disabled={busy} type="button" onClick={() => onSave()}>
          保存
        </button>
        <button className="primary-action" disabled={busy} type="button" onClick={() => onSave('accepted')}>
          接受
        </button>
        <button className="secondary-action" disabled={busy} type="button" onClick={() => onSave('hidden')}>
          隐藏
        </button>
      </div>
    </>
  );
}

function EmptyDetail({ title }: { title: string }) {
  return (
    <div className="starfield-detail-empty">
      <Eye size={22} />
      <strong>{title}</strong>
      <p>选择左侧列表中的项目后在这里审核。</p>
    </div>
  );
}

function StatusPill({ status }: { status: 'suggested' | 'accepted' | 'hidden' }) {
  const label = status === 'accepted' ? '已接受' : status === 'hidden' ? '已隐藏' : '候选';
  return <span className={`starfield-status-pill is-${status}`}>{label}</span>;
}

function filterByStatus<T extends { status: string }>(items: T[], filter: ReviewFilter) {
  return filter === 'all' ? items : items.filter((item) => item.status === filter);
}

function splitKeywords(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
