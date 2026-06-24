import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, GitBranch, Loader2, Orbit, Plus, Rocket, Sparkles, Trash2, X } from 'lucide-react';
import {
  bulkUpdateAdminStarfieldDeepPaths,
  bulkUpdateAdminStarfieldPassages,
  bulkUpdateAdminStarfieldRelationships,
  createAdminStarfieldVersion,
  deleteAdminStarfieldVersion,
  fetchAdminTasks,
  fetchAdminStarfieldVersion,
  fetchAdminStarfieldVersions,
  generateAdminStarfieldDeepRelationships,
  generateAdminStarfieldPassages,
  generateAdminStarfieldRelationships,
  publishAdminStarfieldVersion,
  updateAdminStarfieldDeepPath,
  updateAdminStarfieldPassage,
  updateAdminStarfieldRelationship,
  type ApiAdminTask,
  type ApiAdminStarfieldVersionPayload,
  type ApiStarfieldCanonicalKeyword,
  type ApiStarfieldDeepPath,
  type ApiStarfieldPassage,
  type ApiStarfieldRelationship,
  type ApiStarfieldVersion,
} from './apiClient';
import type { Post } from './posts';

type ReviewTab = 'passages' | 'relationships' | 'deepPaths';
type ReviewFilter = 'all' | 'suggested' | 'accepted' | 'hidden';

const relationshipTypeOptions: Array<{ value: ApiStarfieldRelationship['relationshipType']; label: string }> = [
  { value: 'same_topic', label: '同一主题' },
  { value: 'prerequisite', label: '前置知识' },
  { value: 'further_reading', label: '延伸阅读' },
  { value: 'problem_solution', label: '问题与解法' },
  { value: 'comparison', label: '对比关系' },
  { value: 'shared_principle', label: '共同原则' },
  { value: 'same_problem_shape', label: '同构问题' },
  { value: 'method_transfer', label: '方法迁移' },
  { value: 'tradeoff_parallel', label: '取舍相似' },
  { value: 'case_generalization', label: '案例与一般化' },
  { value: 'implementation_echo', label: '实现呼应' },
];

const reviewFilters: Array<{ value: ReviewFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'suggested', label: '候选' },
  { value: 'accepted', label: '已接受' },
  { value: 'hidden', label: '已隐藏' },
];

type StarfieldPanelMode = 'generation' | 'review' | 'tasks';

export function AdminStarfieldPanel({ mode, posts }: { mode: StarfieldPanelMode; posts: Post[] }) {
  const publishedPosts = posts.filter((post) => (post.status ?? 'published') === 'published');
  const [versions, setVersions] = useState<ApiStarfieldVersion[]>([]);
  const [activePayload, setActivePayload] = useState<ApiAdminStarfieldVersionPayload | null>(null);
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [newVersionName, setNewVersionName] = useState('星空版本');
  const [reviewTab, setReviewTab] = useState<ReviewTab>('passages');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('suggested');
  const [selectedPassageId, setSelectedPassageId] = useState('');
  const [selectedRelationshipId, setSelectedRelationshipId] = useState('');
  const [selectedDeepPathId, setSelectedDeepPathId] = useState('');
  const [selectedCanonicalKeywordId, setSelectedCanonicalKeywordId] = useState('');
  const [passageDrafts, setPassageDrafts] = useState<Record<string, { title: string; keywords: string }>>({});
  const [relationshipDrafts, setRelationshipDrafts] = useState<Record<string, { relationshipType: ApiStarfieldRelationship['relationshipType']; rationale: string; strength: string }>>({});
  const [taskItems, setTaskItems] = useState<ApiAdminTask[]>([]);
  const [taskSourceFilter, setTaskSourceFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const activeVersion = activePayload?.version ?? versions[0] ?? null;
  const passages = activePayload?.passages ?? [];
  const relationships = activePayload?.relationships ?? [];
  const crossArticleRelationships = relationships.filter((relationship) => relationship.isCrossArticle);
  const canonicalKeywords = activePayload?.canonicalKeywords ?? [];
  const deepPaths = activePayload?.deepPaths ?? [];
  const acceptedPassages = passages.filter((passage) => passage.status === 'accepted');
  const suggestedPassages = passages.filter((passage) => passage.status === 'suggested');
  const acceptedRelationships = crossArticleRelationships.filter((relationship) => relationship.status === 'accepted');
  const suggestedRelationships = crossArticleRelationships.filter((relationship) => relationship.status === 'suggested');
  const suggestedDeepPaths = deepPaths.filter((path) => path.status === 'suggested');
  const passageById = useMemo(() => Object.fromEntries(passages.map((passage) => [passage.id, passage])), [passages]);
  const selectedCanonicalKeyword = canonicalKeywords.find((keyword) => keyword.id === selectedCanonicalKeywordId) ?? null;
  const filteredPassages = useMemo(
    () => filterByCanonicalKeyword(filterByStatus(passages, reviewFilter), selectedCanonicalKeyword),
    [passages, reviewFilter, selectedCanonicalKeyword],
  );
  const filteredRelationships = useMemo(
    () => filterRelationshipsByCanonicalKeyword(filterByStatus(crossArticleRelationships, reviewFilter), selectedCanonicalKeyword),
    [crossArticleRelationships, reviewFilter, selectedCanonicalKeyword],
  );
  const filteredDeepPaths = useMemo(() => filterByStatus(deepPaths, reviewFilter), [deepPaths, reviewFilter]);
  const keywordPassages = useMemo(() => filterByCanonicalKeyword(passages, selectedCanonicalKeyword), [passages, selectedCanonicalKeyword]);
  const keywordRelationships = useMemo(
    () => filterRelationshipsByCanonicalKeyword(relationships, selectedCanonicalKeyword),
    [relationships, selectedCanonicalKeyword],
  );
  const visibleSuggestedPassages = filteredPassages.filter((passage) => passage.status === 'suggested');
  const visibleSuggestedRelationships = filteredRelationships.filter((relationship) => relationship.status === 'suggested');
  const visibleSuggestedDeepPaths = filteredDeepPaths.filter((path) => path.status === 'suggested');
  const selectedPassage = filteredPassages.find((passage) => passage.id === selectedPassageId) ?? filteredPassages[0] ?? null;
  const selectedRelationship = filteredRelationships.find((relationship) => relationship.id === selectedRelationshipId) ?? filteredRelationships[0] ?? null;
  const selectedDeepPath = filteredDeepPaths.find((path) => path.id === selectedDeepPathId) ?? filteredDeepPaths[0] ?? null;
  const sortedJobs = useMemo(
    () =>
      [...(activePayload?.jobs ?? [])]
        .sort((left, right) => Number(right.status === 'pending' || right.status === 'running') - Number(left.status === 'pending' || left.status === 'running')),
    [activePayload?.jobs],
  );
  const activeJobs = sortedJobs.slice(0, 6);
  const runningStarfieldJob = activePayload?.jobs.find((job) => job.status === 'pending' || job.status === 'running') ?? null;
  const passageGenerationBusy = Boolean(runningStarfieldJob && runningStarfieldJob.phase === 'passages');
  const taskSourceOptions = useMemo(() => {
    const sources = new Map<string, string>();
    taskItems.forEach((task) => {
      const key = task.sourceType || 'unknown';
      sources.set(key, task.sourceLabel || key);
    });
    return Array.from(sources.entries());
  }, [taskItems]);
  const filteredTaskItems = useMemo(
    () => (taskSourceFilter === 'all' ? taskItems : taskItems.filter((task) => (task.sourceType || 'unknown') === taskSourceFilter)),
    [taskItems, taskSourceFilter],
  );

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
    if (mode !== 'tasks') {
      return;
    }
    let cancelled = false;
    const loadTasks = async () => {
      try {
        const items = await fetchAdminTasks();
        if (!cancelled) {
          setTaskItems(items);
        }
      } catch {
        if (!cancelled) {
          setNotice('任务管理接口暂时不可用。');
        }
      }
    };
    void loadTasks();
    const interval = window.setInterval(() => void loadTasks(), 1600);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mode]);

  useEffect(() => {
    if (!activeVersion || !runningStarfieldJob) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshVersion(activeVersion.id);
    }, 1600);
    return () => window.clearInterval(interval);
  }, [activeVersion?.id, runningStarfieldJob?.id, runningStarfieldJob?.status]);

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
    setSelectedDeepPathId((id) => (id && deepPaths.some((path) => path.id === id) ? id : deepPaths[0]?.id ?? ''));
  }, [passages, relationships, deepPaths]);

  useEffect(() => {
    setSelectedCanonicalKeywordId((id) => (id && canonicalKeywords.some((keyword) => keyword.id === id) ? id : ''));
  }, [canonicalKeywords]);

  async function refreshVersion(versionId: string) {
    const payload = await fetchAdminStarfieldVersion(versionId);
    setActivePayload(payload);
    const items = await fetchAdminStarfieldVersions();
    setVersions(items);
  }

  async function runAction(action: () => Promise<ApiAdminStarfieldVersionPayload | void>, message: string, onPayload?: (payload: ApiAdminStarfieldVersionPayload) => void) {
    setBusy(true);
    setNotice('');
    try {
      const payload = await action();
      if (payload) {
        setActivePayload(payload);
        setVersions(await fetchAdminStarfieldVersions());
        onPayload?.(payload);
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

  function selectCanonicalKeyword(keywordId: string) {
    setSelectedCanonicalKeywordId((currentId) => (currentId === keywordId ? '' : keywordId));
  }

  async function createVersion() {
    await runAction(async () => {
      const payload = await createAdminStarfieldVersion(newVersionName);
      setSelectedArticleIds([]);
      setReviewTab('passages');
      return payload;
    }, '已创建新的星图版本。');
  }

  async function deleteVersion(version: ApiStarfieldVersion) {
    const confirmed = window.confirm(`确定删除星图版本“${version.name}”吗？此操作会删除它的 Passage、关系和任务记录，无法撤销。`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setNotice('');
    try {
      await deleteAdminStarfieldVersion(version.id);
      const items = await fetchAdminStarfieldVersions();
      setVersions(items);
      const nextVersion = items.find((item) => item.isActive) ?? items[0] ?? null;
      if (nextVersion) {
        setActivePayload(await fetchAdminStarfieldVersion(nextVersion.id));
      } else {
        setActivePayload(null);
      }
      setNotice('星图版本已删除。');
    } catch {
      setNotice('删除失败，请确认登录状态和后台服务。');
    } finally {
      setBusy(false);
    }
  }

  async function generatePassages() {
    if (!activeVersion || selectedArticleIds.length === 0) {
      setNotice('请先选择星图版本和文章。');
      return;
    }
    await runAction(() => generateAdminStarfieldPassages(activeVersion.id, selectedArticleIds), 'Passage 生成任务已创建，AI-agent 正在后台拆分文段。');
    setReviewTab('passages');
    setReviewFilter('suggested');
  }

  async function bulkUpdatePassages(items: ApiStarfieldPassage[], status: ApiStarfieldPassage['status']) {
    if (!activePayload || items.length === 0) {
      return;
    }
    await runAction(
      () => bulkUpdateAdminStarfieldPassages(activePayload.version.id, { status, passageIds: items.map((item) => item.id) }),
      status === 'accepted' ? `已接受 ${items.length} 个 Passage。` : `已隐藏 ${items.length} 个 Passage。`,
    );
  }

  async function acceptAllSuggestedPassages() {
    if (!activePayload || suggestedPassages.length === 0) {
      return;
    }
    await runAction(
      () => bulkUpdateAdminStarfieldPassages(activePayload.version.id, { status: 'accepted', sourceStatus: 'suggested' }),
      `已一键接受 ${suggestedPassages.length} 个候选 Passage。下一步点击“生成关系”。`,
    );
  }

  async function savePassage(passage: ApiStarfieldPassage, status: ApiStarfieldPassage['status'] = passage.status) {
    const draft = passageDrafts[passage.id] ?? { title: passage.title, keywords: passage.keywords.join('，') };
    const shouldAdvanceSelection = status !== passage.status;
    const nextPassageId = shouldAdvanceSelection ? getNextItemId(filteredPassages, passage.id) : passage.id;
    await runAction(
      () =>
        updateAdminStarfieldPassage(passage.id, {
          status,
          title: draft.title,
          keywords: splitKeywords(draft.keywords),
        } as Partial<ApiStarfieldPassage>),
      status === passage.status ? 'Passage 已保存。' : status === 'accepted' ? 'Passage 已接受。' : 'Passage 已隐藏。',
      (payload) => {
        if (!shouldAdvanceSelection) {
          return;
        }

        const nextKeyword = selectedCanonicalKeyword ? payload.canonicalKeywords.find((keyword) => keyword.id === selectedCanonicalKeyword.id) ?? null : null;
        const nextPassages = filterByCanonicalKeyword(filterByStatus(payload.passages, reviewFilter), nextKeyword);
        const nextSelection = nextPassages.find((item) => item.id === nextPassageId) ?? nextPassages[0] ?? payload.passages[0];
        setSelectedPassageId(nextSelection?.id ?? '');
      },
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

  async function bulkUpdateRelationships(items: ApiStarfieldRelationship[], status: ApiStarfieldRelationship['status']) {
    if (!activePayload || items.length === 0) {
      return;
    }
    await runAction(
      () =>
        bulkUpdateAdminStarfieldRelationships(activePayload.version.id, {
          status,
          relationshipIds: items.map((item) => item.id),
          crossArticleOnly: true,
        }),
      status === 'accepted' ? `已接受 ${items.length} 条跨文章关系。` : `已隐藏 ${items.length} 条跨文章关系。`,
    );
  }

  async function acceptAllSuggestedRelationships() {
    if (!activePayload || suggestedRelationships.length === 0) {
      return;
    }
    await runAction(
      () => bulkUpdateAdminStarfieldRelationships(activePayload.version.id, { status: 'accepted', sourceStatus: 'suggested', crossArticleOnly: true }),
      `已一键接受 ${suggestedRelationships.length} 条跨文章关系。`,
    );
  }

  async function saveDeepPath(path: ApiStarfieldDeepPath, status: ApiStarfieldDeepPath['status'] = path.status) {
    await runAction(
      () => updateAdminStarfieldDeepPath(path.id, { status }),
      status === path.status ? '深层路径已保存。' : status === 'accepted' ? '深层路径已接受。' : '深层路径已隐藏。',
    );
  }

  async function bulkUpdateDeepPaths(items: ApiStarfieldDeepPath[], status: ApiStarfieldDeepPath['status']) {
    if (!activePayload || items.length === 0) {
      return;
    }
    await runAction(
      () =>
        bulkUpdateAdminStarfieldDeepPaths(activePayload.version.id, {
          status,
          pathIds: items.map((item) => item.id),
        }),
      status === 'accepted' ? `已接受 ${items.length} 条深层路径。` : `已隐藏 ${items.length} 条深层路径。`,
    );
  }

  async function acceptAllSuggestedDeepPaths() {
    if (!activePayload || suggestedDeepPaths.length === 0) {
      return;
    }
    await runAction(
      () => bulkUpdateAdminStarfieldDeepPaths(activePayload.version.id, { status: 'accepted', sourceStatus: 'suggested' }),
      `已一键接受 ${suggestedDeepPaths.length} 条深层路径。`,
    );
  }

  const title = mode === 'generation' ? '星图生成' : mode === 'review' ? '星图审批' : '任务管理';
  const subtitle = mode === 'generation' ? 'Passage 切割与标签生成' : mode === 'review' ? '审核 Passage、标签关系与发布星图' : '查看 AI-agent 后台任务状态';

  return (
    <section className={`admin-panel starfield-admin starfield-admin-${mode}`} aria-label={title}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <a className="secondary-action" href="/starfield">
          <Orbit size={17} />
          查看星图
        </a>
      </div>

      {notice && <p className="admin-batch-notice">{notice}</p>}

      {mode === 'generation' && (
        <div className="starfield-generation-shell">
          <section className="starfield-console-card starfield-version-card">
            <div className="starfield-section-head">
              <div>
                <h3>版本</h3>
                <p>为每一轮星图生成保留独立版本。</p>
              </div>
              {busy && <Loader2 size={16} />}
            </div>
            <div className="starfield-version-create-control">
              <input value={newVersionName} onChange={(event) => setNewVersionName(event.target.value)} />
              <button aria-label="新建星图版本" className="primary-action icon-only-action" disabled={busy} title="新建星图版本" type="button" onClick={() => void createVersion()}>
                <Plus size={16} />
              </button>
            </div>
            <div className="starfield-version-list">
              {versions.map((version) => (
                <div className="starfield-version-row" key={version.id}>
                  <button
                    aria-pressed={activeVersion?.id === version.id}
                    className="starfield-version-select-action"
                    type="button"
                    onClick={() => void refreshVersion(version.id)}
                  >
                    <strong>{version.name}</strong>
                    <small>{version.isActive ? '当前公开' : version.status} · {version.acceptedPassageCount ?? 0} 星点 · {version.acceptedRelationshipCount ?? 0} 关系</small>
                  </button>
                  <button
                    aria-label={`删除星图版本 ${version.name}`}
                    className="secondary-action starfield-version-delete-action"
                    disabled={busy}
                    title="删除星图版本"
                    type="button"
                    onClick={() => void deleteVersion(version)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {versions.length === 0 && <p>还没有星图版本。</p>}
            </div>
          </section>

          <section className="starfield-console-card starfield-generation-card">
            <div className="starfield-section-head">
              <div>
                <h3>Passage 切割</h3>
                <p>选择已发布文章后创建 AI-agent 后台任务。</p>
              </div>
              <button className="primary-action" disabled={busy || passageGenerationBusy || !activeVersion || selectedArticleIds.length === 0} type="button" onClick={() => void generatePassages()}>
                {passageGenerationBusy ? <Loader2 size={16} /> : <Sparkles size={16} />}
                生成 Passage
              </button>
            </div>
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
          </section>

          {activePayload && (
            <section className="starfield-console-card starfield-status-card">
              <StarfieldMetrics passages={passages} relationships={relationships} canonicalKeywords={canonicalKeywords} deepPaths={deepPaths} />
              <JobList jobs={activeJobs} />
            </section>
          )}
        </div>
      )}

      {mode === 'review' && (
        <main className="starfield-review-workspace">
          <div className="starfield-review-toolbar">
            <div className="starfield-version-select">
              <span>版本</span>
              <select value={activeVersion?.id ?? ''} onChange={(event) => void refreshVersion(event.target.value)}>
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="starfield-tabs" role="tablist" aria-label="审核类型">
              <button aria-selected={reviewTab === 'passages'} type="button" onClick={() => setReviewTab('passages')}>
                Passage
                <span>{suggestedPassages.length}/{passages.length}</span>
              </button>
              <button aria-selected={reviewTab === 'relationships'} type="button" onClick={() => setReviewTab('relationships')}>
                关系
                <span>{suggestedRelationships.length}/{crossArticleRelationships.length}</span>
              </button>
              <button aria-selected={reviewTab === 'deepPaths'} type="button" onClick={() => setReviewTab('deepPaths')}>
                深层路径
                <span>{suggestedDeepPaths.length}/{deepPaths.length}</span>
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
                  <button className="primary-action" disabled={busy || suggestedPassages.length === 0 || !activePayload} type="button" onClick={() => void acceptAllSuggestedPassages()}>
                    <Check size={15} />
                    一键接受全部
                  </button>
                  <button className="secondary-action" disabled={busy || visibleSuggestedPassages.length === 0} type="button" onClick={() => void bulkUpdatePassages(visibleSuggestedPassages, 'accepted')}>
                    <Check size={15} />
                    接受当前筛选
                  </button>
                  <button className="secondary-action" disabled={busy || visibleSuggestedPassages.length === 0} type="button" onClick={() => void bulkUpdatePassages(visibleSuggestedPassages, 'hidden')}>
                    <X size={15} />
                    隐藏候选
                  </button>
                </>
              ) : reviewTab === 'relationships' ? (
                <>
                  <button className="primary-action" disabled={busy || suggestedRelationships.length === 0 || !activePayload} type="button" onClick={() => void acceptAllSuggestedRelationships()}>
                    <Check size={15} />
                    一键接受全部
                  </button>
                  <button className="secondary-action" disabled={busy || visibleSuggestedRelationships.length === 0} type="button" onClick={() => void bulkUpdateRelationships(visibleSuggestedRelationships, 'accepted')}>
                    <Check size={15} />
                    接受当前筛选
                  </button>
                  <button className="secondary-action" disabled={busy || visibleSuggestedRelationships.length === 0} type="button" onClick={() => void bulkUpdateRelationships(visibleSuggestedRelationships, 'hidden')}>
                    <X size={15} />
                    隐藏候选
                  </button>
                </>
              ) : (
                <>
                  <button className="primary-action" disabled={busy || suggestedDeepPaths.length === 0 || !activePayload} type="button" onClick={() => void acceptAllSuggestedDeepPaths()}>
                    <Check size={15} />
                    一键接受全部
                  </button>
                  <button className="secondary-action" disabled={busy || visibleSuggestedDeepPaths.length === 0} type="button" onClick={() => void bulkUpdateDeepPaths(visibleSuggestedDeepPaths, 'accepted')}>
                    <Check size={15} />
                    接受当前筛选
                  </button>
                  <button className="secondary-action" disabled={busy || visibleSuggestedDeepPaths.length === 0} type="button" onClick={() => void bulkUpdateDeepPaths(visibleSuggestedDeepPaths, 'hidden')}>
                    <X size={15} />
                    隐藏候选
                  </button>
                  <span className="starfield-toolbar-note">相邻星线可在“关系”中审核。</span>
                </>
              )}
              <button className="primary-action" disabled={busy || acceptedPassages.length < 2 || !activePayload} type="button" onClick={() => void runAction(() => generateAdminStarfieldRelationships(activePayload!.version.id), '关系生成任务已创建，可在任务管理查看进度。')}>
                <GitBranch size={16} />
                生成关系
              </button>
              <button className="secondary-action" disabled={busy || acceptedPassages.length < 2 || !activePayload} type="button" onClick={() => void runAction(() => generateAdminStarfieldDeepRelationships(activePayload!.version.id), '深度关系挖掘任务已创建，可在任务管理查看进度。')}>
                <Sparkles size={16} />
                深度关系挖掘
              </button>
              <button className="primary-action" disabled={busy || acceptedPassages.length < 1 || !activePayload} type="button" onClick={() => void runAction(() => publishAdminStarfieldVersion(activePayload!.version.id), '星图已发布给读者。')}>
                <Rocket size={16} />
                发布
              </button>
            </div>
            {selectedCanonicalKeyword && (
              <div className="starfield-active-keyword-filter">
                <span>
                  标签筛选：<strong>{selectedCanonicalKeyword.label}</strong>
                </span>
                <small>{keywordPassages.length} 文段 · {keywordRelationships.length} 关系</small>
                <button className="secondary-action" type="button" onClick={() => setSelectedCanonicalKeywordId('')}>
                  清除
                </button>
              </div>
            )}
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
              ) : reviewTab === 'relationships' ? (
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
                      {relationship.evidenceKeywords.length > 0 && <small>证据：{relationship.evidenceKeywords.slice(0, 3).join('，')}</small>}
                      <p>{relationship.rationale}</p>
                    </button>
                  );
                })
              ) : (
                filteredDeepPaths.map((path) => (
                  <button
                    aria-pressed={selectedDeepPath?.id === path.id}
                    className="starfield-review-row"
                    key={path.id}
                    type="button"
                    onClick={() => setSelectedDeepPathId(path.id)}
                  >
                    <StatusPill status={path.status} />
                    <strong>{path.title}</strong>
                    <small>{path.pathType} · {path.passageIds.length} 步 · 强度 {path.strength.toFixed(2)}</small>
                    <p>{path.inquiry.question || path.rationale}</p>
                  </button>
                ))
              )}
              {reviewTab === 'passages' && filteredPassages.length === 0 && <p className="starfield-empty-list">没有符合筛选条件的 Passage。</p>}
              {reviewTab === 'relationships' && filteredRelationships.length === 0 && (
                <p className="starfield-empty-list">
                  {acceptedPassages.length < 2 ? '至少接受 2 个 Passage 后才能生成关系。' : '还没有关系候选，请点击上方“生成关系”，然后到任务管理查看进度。'}
                </p>
              )}
              {reviewTab === 'deepPaths' && filteredDeepPaths.length === 0 && (
                <p className="starfield-empty-list">
                  {acceptedPassages.length < 2 ? '至少接受 2 个 Passage 后才能深层挖掘。' : '还没有深层路径，请点击上方“深度关系挖掘”。'}
                </p>
              )}
            </div>

            <aside className="starfield-detail-panel">
              {selectedCanonicalKeyword && (
                <CanonicalKeywordSummary
                  keyword={selectedCanonicalKeyword}
                  passageCount={keywordPassages.length}
                  relationshipCount={keywordRelationships.length}
                />
              )}
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
              ) : reviewTab === 'relationships' ? selectedRelationship ? (
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
              ) : selectedDeepPath ? (
                <DeepPathDetail busy={busy} path={selectedDeepPath} passageById={passageById} onSave={(status) => void saveDeepPath(selectedDeepPath, status)} />
              ) : (
                <EmptyDetail title="没有深层路径" />
              )}
            </aside>
          </div>
        </main>
      )}

      {mode === 'tasks' && (
        <div className="starfield-tasks-shell">
          <section className="starfield-console-card">
            <div className="starfield-section-head">
              <div>
                <h3>任务类型</h3>
                <p>按后台任务来源筛选，不绑定具体星图版本。</p>
              </div>
              {busy && <Loader2 size={16} />}
            </div>
            <div className="starfield-task-source-list">
              <button aria-pressed={taskSourceFilter === 'all'} type="button" onClick={() => setTaskSourceFilter('all')}>
                <strong>全部任务</strong>
                <small>{taskItems.length} 个任务</small>
              </button>
              {taskSourceOptions.map(([sourceType, label]) => (
                <button
                  aria-pressed={taskSourceFilter === sourceType}
                  key={sourceType}
                  type="button"
                  onClick={() => setTaskSourceFilter(sourceType)}
                >
                  <strong>{label}</strong>
                  <small>{taskItems.filter((task) => (task.sourceType || 'unknown') === sourceType).length} 个任务</small>
                </button>
              ))}
            </div>
          </section>

          <section className="starfield-console-card">
            <div className="starfield-section-head">
              <div>
                <h3>后台任务</h3>
                <p>{taskSourceFilter === 'all' ? '所有后台任务' : `来源：${taskSourceOptions.find(([sourceType]) => sourceType === taskSourceFilter)?.[1] ?? taskSourceFilter}`}</p>
              </div>
            </div>
            <JobList jobs={filteredTaskItems} large showSource />
          </section>
        </div>
      )}
    </section>
  );
}

function StarfieldMetrics({
  passages,
  relationships,
  canonicalKeywords,
  deepPaths,
}: {
  passages: ApiStarfieldPassage[];
  relationships: ApiStarfieldRelationship[];
  canonicalKeywords: ApiStarfieldCanonicalKeyword[];
  deepPaths: ApiStarfieldDeepPath[];
}) {
  const suggestedPassages = passages.filter((passage) => passage.status === 'suggested');
  const suggestedRelationships = relationships.filter((relationship) => relationship.status === 'suggested');
  return (
    <div className="starfield-metrics">
      <span><strong>{passages.length}</strong><small>Passage</small></span>
      <span><strong>{suggestedPassages.length}</strong><small>待审星点</small></span>
      <span><strong>{relationships.length}</strong><small>关系</small></span>
      <span><strong>{suggestedRelationships.length}</strong><small>待审关系</small></span>
      <span><strong>{deepPaths.length}</strong><small>深层路径</small></span>
      <span><strong>{canonicalKeywords.length}</strong><small>合并标签</small></span>
    </div>
  );
}

function JobList({ jobs, large = false, showSource = false }: { jobs: ApiAdminTask[]; large?: boolean; showSource?: boolean }) {
  return (
    <div className={`starfield-job-list${large ? ' is-large' : ''}`}>
      {jobs.map((job) => (
        <div className="starfield-job-item" key={job.id}>
          <small>{formatTaskPhase(job.phase)} · {job.status}{showSource && job.sourceName ? ` · ${job.sourceLabel || '来源'}：${job.sourceName}` : ''}{job.errorMessage ? ` · ${job.errorMessage}` : ''}</small>
          <span>{job.currentStep || (job.status === 'pending' || job.status === 'running' ? '等待 AI-agent 更新任务状态。' : '任务没有记录详细步骤。')}</span>
          <progress max={Math.max(1, job.progressTotal)} value={Math.min(job.progressCurrent, Math.max(1, job.progressTotal))} />
        </div>
      ))}
      {jobs.length === 0 && <p>还没有后台任务。</p>}
    </div>
  );
}

function formatTaskPhase(phase: string) {
  const labels: Record<string, string> = {
    passages: 'Passage 生成',
    relationships: '关系生成',
    'deep-relationships': '深度关系挖掘',
  };
  return labels[phase] ?? phase;
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
      {relationship.evidenceKeywords.length > 0 && (
        <div className="starfield-evidence-keywords">
          <small>证据标签</small>
          <div>
            {relationship.evidenceKeywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        </div>
      )}
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

function DeepPathDetail({
  busy,
  onSave,
  passageById,
  path,
}: {
  busy: boolean;
  onSave: (status?: ApiStarfieldDeepPath['status']) => void;
  passageById: Record<string, ApiStarfieldPassage>;
  path: ApiStarfieldDeepPath;
}) {
  return (
    <>
      <div className="starfield-detail-head">
        <StatusPill status={path.status} />
        <span>深层路径 · {path.pathType}</span>
      </div>
      <section className="starfield-deep-path-section">
        <small>Inquirer Agent</small>
        <strong>{path.inquiry.question || path.title}</strong>
        {path.inquiry.intentType && <span>{path.inquiry.intentType}</span>}
      </section>
      <section className="starfield-deep-path-steps">
        <small>Path-Builder Agent</small>
        {path.passageIds.map((passageId, index) => {
          const passage = passageById[passageId];
          return (
            <div key={`${path.id}-${passageId}`}>
              <span>{index + 1}</span>
              <div>
                <strong>{passage?.title ?? '未知 Passage'}</strong>
                <small>{passage?.article.title ?? passageId}</small>
              </div>
            </div>
          );
        })}
      </section>
      <section className="starfield-deep-path-section">
        <small>路径说明</small>
        <p>{path.rationale}</p>
      </section>
      {path.retrievalNotes.length > 0 && (
        <section className="starfield-deep-path-section">
          <small>Retriever Agent</small>
          <ul>
            {path.retrievalNotes.map((note, index) => (
              <li key={`${path.id}-note-${index}`}>{note}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="starfield-deep-path-section">
        <small>Critic Agent</small>
        <p>{path.critique || '没有记录质疑说明。'}</p>
      </section>
      <section className="starfield-deep-path-section">
        <small>强度</small>
        <strong>{path.strength.toFixed(2)}</strong>
      </section>
      <div className="starfield-detail-actions">
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

function CanonicalKeywordSummary({
  keyword,
  passageCount,
  relationshipCount,
}: {
  keyword: ApiStarfieldCanonicalKeyword;
  passageCount: number;
  relationshipCount: number;
}) {
  return (
    <section className="starfield-keyword-summary" aria-label="当前合并标签">
      <div>
        <small>当前标签</small>
        <strong>{keyword.label}</strong>
      </div>
      <div className="starfield-keyword-summary-metrics">
        <span>{passageCount} 文段</span>
        <span>{relationshipCount} 关系</span>
      </div>
      {keyword.aliases.length > 0 && (
        <div className="starfield-keyword-aliases">
          {keyword.aliases.map((alias) => (
            <span key={alias}>{alias}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: 'suggested' | 'accepted' | 'hidden' }) {
  const label = status === 'accepted' ? '已接受' : status === 'hidden' ? '已隐藏' : '候选';
  return <span className={`starfield-status-pill is-${status}`}>{label}</span>;
}

function filterByStatus<T extends { status: string }>(items: T[], filter: ReviewFilter) {
  return filter === 'all' ? items : items.filter((item) => item.status === filter);
}

function filterByCanonicalKeyword<T extends { id: string }>(items: T[], keyword: ApiStarfieldCanonicalKeyword | null) {
  if (!keyword) {
    return items;
  }

  const passageIds = new Set(keyword.passageIds);
  return items.filter((item) => passageIds.has(item.id));
}

function filterRelationshipsByCanonicalKeyword(items: ApiStarfieldRelationship[], keyword: ApiStarfieldCanonicalKeyword | null) {
  if (!keyword) {
    return items;
  }

  return items.filter((relationship) => relationshipMatchesCanonicalKeyword(relationship, keyword));
}

function relationshipMatchesCanonicalKeyword(relationship: ApiStarfieldRelationship, keyword: ApiStarfieldCanonicalKeyword) {
  const passageIds = new Set(keyword.passageIds);
  const evidenceLabels = new Set([keyword.label, ...keyword.aliases].map(normalizeKeywordLabel).filter(Boolean));
  const hasEvidenceKeyword = relationship.evidenceKeywords.some((item) => evidenceLabels.has(normalizeKeywordLabel(item)));
  const linksCoveredPassages = passageIds.has(relationship.sourcePassageId) && passageIds.has(relationship.targetPassageId);
  return hasEvidenceKeyword || linksCoveredPassages;
}

function normalizeKeywordLabel(value: string) {
  return value.trim().toLowerCase();
}

function getNextItemId<T extends { id: string }>(items: T[], currentId: string) {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) {
    return items[0]?.id ?? '';
  }

  return items[currentIndex + 1]?.id ?? items[currentIndex - 1]?.id ?? '';
}

function splitKeywords(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
