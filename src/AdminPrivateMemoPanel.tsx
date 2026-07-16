import { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Edit3,
  Link2,
  MoreHorizontal,
  Pin,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  createAdminPrivateMemo,
  deleteAdminPrivateMemo,
  updateAdminPrivateMemo,
  type ApiPrivateMemoItem,
  type ApiPrivateMemoNode,
  type ApiPrivateMemoStatus,
} from './apiClient';

type MemoFilter = ApiPrivateMemoStatus | 'all';

const memoFilters: Array<{ value: MemoFilter; label: string }> = [
  { value: 'open', label: '未完成' },
  { value: 'done', label: '已完成' },
  { value: 'all', label: '全部' },
];

export function AdminPrivateMemoPanel({
  items,
  onItemsChange,
}: {
  items: ApiPrivateMemoItem[];
  onItemsChange: (items: ApiPrivateMemoItem[]) => void;
}) {
  const [filter, setFilter] = useState<MemoFilter>('open');
  const [text, setText] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [pinned, setPinned] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);
  const [mobileNodeInputId, setMobileNodeInputId] = useState('');
  const [mobileDetailId, setMobileDetailId] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [nodeDrafts, setNodeDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const filteredItems = useMemo(() => {
    const visibleItems = filter === 'all' ? items : items.filter((item) => item.status === filter);
    return [...visibleItems].sort(comparePrivateMemoItems);
  }, [filter, items]);
  const editingItem = items.find((item) => item.id === editingId) ?? null;
  const mobileDetailItem = items.find((item) => item.id === mobileDetailId) ?? null;
  const canSubmit = text.trim().length > 0 && status !== 'saving';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setStatus('saving');
    try {
      const payload = {
        text: text.trim(),
        reminderAt: toIsoOrNull(reminderAt),
        startedAt: toIsoOrNull(startedAt),
        endedAt: toIsoOrNull(endedAt),
        pinned,
      };
      const savedItem = editingId
        ? await updateAdminPrivateMemo(editingId, payload)
        : await createAdminPrivateMemo(payload);
      if (savedItem) {
        upsertMemoItem(savedItem);
      }
      clearForm();
      setMobileAdvancedOpen(false);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function updateMemo(
    id: string,
    payload: Partial<Pick<ApiPrivateMemoItem, 'text' | 'status' | 'reminderAt' | 'startedAt' | 'endedAt' | 'pinned'>> & {
      nodeText?: string;
    },
  ) {
    setStatus('saving');
    try {
      const savedItem = await updateAdminPrivateMemo(id, payload);
      if (savedItem) {
        upsertMemoItem(savedItem);
      }
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function addNode(item: ApiPrivateMemoItem) {
    const nodeText = (nodeDrafts[item.id] ?? '').trim();
    if (!nodeText || status === 'saving') {
      return;
    }

    await updateMemo(item.id, { status: item.status, nodeText });
    setNodeDrafts((drafts) => ({ ...drafts, [item.id]: '' }));
    setExpanded(item.id, true);
    setMobileNodeInputId('');
  }

  async function changeStatus(item: ApiPrivateMemoItem, nextStatus: ApiPrivateMemoStatus) {
    const nodeText = nextStatus === 'done' ? '标记完成' : '重新打开';
    await updateMemo(item.id, { status: nextStatus, nodeText });
    setExpanded(item.id, true);
    if (mobileDetailId === item.id && nextStatus === 'done') {
      setMobileDetailId('');
    }
  }

  async function removeMemo(id: string) {
    if (!window.confirm('确定删除这条私人备忘吗？')) {
      return;
    }

    setStatus('saving');
    try {
      await deleteAdminPrivateMemo(id);
      onItemsChange(items.filter((item) => item.id !== id));
      setMobileDetailId((currentId) => (currentId === id ? '' : currentId));
      setMobileNodeInputId((currentId) => (currentId === id ? '' : currentId));
      if (editingId === id) {
        clearForm();
      }
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  function startEdit(item: ApiPrivateMemoItem) {
    setMobileDetailId('');
    setEditingId(item.id);
    setText(item.text);
    setReminderAt(toDateTimeLocalValue(item.reminderAt));
    setStartedAt(toDateTimeLocalValue(item.startedAt));
    setEndedAt(toDateTimeLocalValue(item.endedAt));
    setPinned(item.pinned);
    setStatus('idle');
  }

  function clearForm() {
    setEditingId('');
    setText('');
    setReminderAt('');
    setStartedAt('');
    setEndedAt('');
    setPinned(false);
    setMobileAdvancedOpen(false);
  }

  function upsertMemoItem(savedItem: ApiPrivateMemoItem) {
    onItemsChange([savedItem, ...items.filter((item) => item.id !== savedItem.id)]);
  }

  function toggleExpanded(id: string) {
    setExpanded(id, !expandedIds.has(id));
  }

  function setExpanded(id: string, expanded: boolean) {
    setExpandedIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (expanded) {
        nextIds.add(id);
      } else {
        nextIds.delete(id);
      }
      return nextIds;
    });
  }

  return (
    <>
    <section className="admin-panel admin-private-memo-panel" aria-label="私人备忘">
      <header className="panel-header">
        <h2>私人备忘</h2>
        <span className="private-memo-count">{items.filter((item) => item.status === 'open').length} 条未完成</span>
      </header>

      {status === 'error' && <p className="admin-batch-notice">私人备忘暂时无法保存，请确认后台服务和登录状态。</p>}

      <form className="private-memo-compose" onSubmit={handleSubmit}>
        <label className="private-memo-textarea">
          <span>{editingItem ? '编辑备忘' : '快速记录'}</span>
          <textarea
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            placeholder="写下任务目标、提醒或临时想法"
            rows={4}
            value={text}
          />
        </label>
        <div className="private-memo-compose-controls">
          <label>
            开始时间
            <input onChange={(event) => setStartedAt(event.target.value)} type="datetime-local" value={startedAt} />
          </label>
          <label>
            结束时间
            <input onChange={(event) => setEndedAt(event.target.value)} type="datetime-local" value={endedAt} />
          </label>
          <label>
            提醒时间
            <input onChange={(event) => setReminderAt(event.target.value)} type="datetime-local" value={reminderAt} />
          </label>
          <label className="inline-toggle private-memo-pin-toggle">
            <input checked={pinned} onChange={(event) => setPinned(event.target.checked)} type="checkbox" />
            置顶提醒
          </label>
          <div className="private-memo-compose-actions">
            {editingItem && (
              <button className="secondary-action" type="button" onClick={clearForm}>
                <X size={16} />
                取消
              </button>
            )}
            <button className="primary-action" disabled={!canSubmit} type="submit">
              {editingItem ? <Check size={16} /> : <Plus size={16} />}
              {editingItem ? '保存' : '添加'}
            </button>
          </div>
        </div>
      </form>

      <form className="private-memo-mobile-capture" onSubmit={handleSubmit}>
        <div className="private-memo-mobile-capture-row">
          <input
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            placeholder={editingItem ? '编辑备忘' : '记一件事...'}
            type="text"
            value={text}
          />
          <button className="primary-action" disabled={!canSubmit} type="submit">
            {editingItem ? <Check size={16} /> : <Plus size={16} />}
            {editingItem ? '保存' : '添加'}
          </button>
        </div>
        <div className="private-memo-mobile-capture-tools">
          <button className="secondary-action" type="button" onClick={() => setMobileAdvancedOpen((isOpen) => !isOpen)}>
            <SlidersHorizontal size={15} />
            {mobileAdvancedOpen ? '收起设置' : '提醒设置'}
          </button>
          {editingItem && (
            <button className="secondary-action" type="button" onClick={clearForm}>
              <X size={15} />
              取消编辑
            </button>
          )}
        </div>
        {mobileAdvancedOpen && (
          <div className="private-memo-mobile-advanced">
            <label>
              提醒时间
              <input onChange={(event) => setReminderAt(event.target.value)} type="datetime-local" value={reminderAt} />
            </label>
            <label className="inline-toggle private-memo-pin-toggle">
              <input checked={pinned} onChange={(event) => setPinned(event.target.checked)} type="checkbox" />
              置顶提醒
            </label>
          </div>
        )}
      </form>

      <div className="private-memo-tabs" role="tablist" aria-label="私人备忘筛选">
        {memoFilters.map((item) => (
          <button
            aria-pressed={filter === item.value}
            key={item.value}
            onClick={() => setFilter(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="private-memo-list">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const latestNode = getLatestNode(item);
            const expanded = expandedIds.has(item.id);
            const mobileNodeOpen = mobileNodeInputId === item.id;
            const nodeDraft = nodeDrafts[item.id] ?? '';
            return (
              <article className={`private-memo-card is-${item.status}`} key={item.id}>
                <div className="private-memo-card-main">
                  <div className="private-memo-card-meta">
                    <span className={`private-memo-status is-${item.status}`}>{formatMemoStatus(item.status)}</span>
                    {item.pinned && (
                      <span>
                        <Pin size={14} />
                        置顶
                      </span>
                    )}
                    {formatPeriodLabel(item) && (
                      <span>
                        <Clock3 size={14} />
                        {formatPeriodLabel(item)}
                      </span>
                    )}
                    {item.reminderAt && (
                      <span className={isOverdue(item) ? 'is-overdue' : ''}>
                        <Bell size={14} />
                        {formatReminderLabel(item)}
                      </span>
                    )}
                  </div>
                  <p>{item.text}</p>
                  {latestNode && (
                    <div className="private-memo-current-node">
                      <span>当前节点</span>
                      <strong>{latestNode.text}</strong>
                      <small>{formatMemoTime(latestNode.createdAt)}</small>
                    </div>
                  )}
                  {expanded && (
                    <div className="private-memo-chain">
                      {item.nodes.length > 0 ? (
                        item.nodes.map((node, index) => (
                          <article className="private-memo-chain-node" key={node.id}>
                            <span>{index + 1}</span>
                            <div>
                              <strong>{node.text}</strong>
                              <small>
                                {formatMemoStatus(node.status)} · {formatMemoTime(node.createdAt)}
                              </small>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="empty-state">还没有过程节点。</p>
                      )}
                    </div>
                  )}
                  <div className="private-memo-node-compose">
                    <input
                      onChange={(event) => setNodeDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                      placeholder="记录新的过程节点"
                      type="text"
                      value={nodeDraft}
                    />
                    <button className="secondary-action" disabled={!nodeDraft.trim() || status === 'saving'} type="button" onClick={() => void addNode(item)}>
                      <Plus size={15} />
                      添加进展
                    </button>
                  </div>
                  {mobileNodeOpen && (
                    <div className="private-memo-mobile-node-compose">
                      <input
                        autoFocus
                        onChange={(event) => setNodeDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                        placeholder="记录新的过程节点"
                        type="text"
                        value={nodeDraft}
                      />
                      <div>
                        <button className="secondary-action" type="button" onClick={() => setMobileNodeInputId('')}>
                          取消
                        </button>
                        <button className="primary-action" disabled={!nodeDraft.trim() || status === 'saving'} type="button" onClick={() => void addNode(item)}>
                          保存进展
                        </button>
                      </div>
                    </div>
                  )}
                  <small>更新于 {formatMemoTime(item.updatedAt)}</small>
                </div>
                <div className="private-memo-actions">
                  <button className="secondary-action private-memo-mobile-primary-action" type="button" onClick={() => setMobileNodeInputId(mobileNodeOpen ? '' : item.id)}>
                    <Plus size={15} />
                    添加进展
                  </button>
                  <button className="secondary-action" type="button" onClick={() => toggleExpanded(item.id)}>
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    {expanded ? '收起过程' : '查看过程'}
                  </button>
                  <button className="secondary-action" type="button" onClick={() => startEdit(item)}>
                    <Edit3 size={15} />
                    编辑
                  </button>
                  {item.status === 'open' ? (
                    <button className="secondary-action private-memo-mobile-complete-action" type="button" onClick={() => void changeStatus(item, 'done')}>
                      <Check size={15} />
                      完成
                    </button>
                  ) : (
                    <button className="secondary-action private-memo-mobile-complete-action" type="button" onClick={() => void changeStatus(item, 'open')}>
                      <RotateCcw size={15} />
                      重新打开
                    </button>
                  )}
                  <button className="secondary-action danger-inline-action" type="button" onClick={() => void removeMemo(item.id)}>
                    <Trash2 size={15} />
                    删除
                  </button>
                  <button className="secondary-action private-memo-mobile-more-action" type="button" onClick={() => setMobileDetailId(item.id)}>
                    <MoreHorizontal size={15} />
                    更多
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="empty-state">这里还没有私人备忘。</p>
        )}
      </div>

    </section>
    {mobileDetailItem && (
      <PrivateMemoMobileDetailSheet
        item={mobileDetailItem}
        onAddNode={() => {
          setMobileNodeInputId(mobileDetailItem.id);
          setMobileDetailId('');
        }}
        onClose={() => setMobileDetailId('')}
        onEdit={() => startEdit(mobileDetailItem)}
        onRemove={() => void removeMemo(mobileDetailItem.id)}
        onUpdate={(payload) => void updateMemo(mobileDetailItem.id, payload)}
      />
    )}
    </>
  );
}

function PrivateMemoMobileDetailSheet({
  item,
  onAddNode,
  onClose,
  onEdit,
  onRemove,
  onUpdate,
}: {
  item: ApiPrivateMemoItem;
  onAddNode: () => void;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onUpdate: (
    payload: Partial<Pick<ApiPrivateMemoItem, 'text' | 'status' | 'reminderAt' | 'startedAt' | 'endedAt' | 'pinned'>> & {
      nodeText?: string;
    },
  ) => void;
}) {
  const [startedAt, setStartedAt] = useState(toDateTimeLocalValue(item.startedAt));
  const [endedAt, setEndedAt] = useState(toDateTimeLocalValue(item.endedAt));
  const [reminderAt, setReminderAt] = useState(toDateTimeLocalValue(item.reminderAt));
  const [pinned, setPinned] = useState(item.pinned);

  function saveSettings() {
    onUpdate({
      startedAt: toIsoOrNull(startedAt),
      endedAt: toIsoOrNull(endedAt),
      reminderAt: toIsoOrNull(reminderAt),
      pinned,
    });
  }

  return (
    <div className="private-memo-mobile-sheet-layer" role="presentation" onClick={onClose}>
      <aside className="private-memo-mobile-sheet" role="dialog" aria-modal="true" aria-label="私人备忘详情" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{formatMemoStatus(item.status)}</span>
            <strong>{getMemoTitle(item.text)}</strong>
          </div>
          <button aria-label="关闭详情" type="button" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <section className="private-memo-mobile-sheet-section">
          <h3>过程链</h3>
          <div className="private-memo-chain is-mobile-sheet-chain">
            {item.nodes.length > 0 ? (
              item.nodes.map((node, index) => (
                <article className="private-memo-chain-node" key={node.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{node.text}</strong>
                    <small>
                      {formatMemoStatus(node.status)} · {formatMemoTime(node.createdAt)}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">还没有过程节点。</p>
            )}
          </div>
        </section>

        <section className="private-memo-mobile-sheet-section">
          <h3>更多设置</h3>
          <div className="private-memo-mobile-sheet-fields">
            <label>
              开始时间
              <input onChange={(event) => setStartedAt(event.target.value)} type="datetime-local" value={startedAt} />
            </label>
            <label>
              结束时间
              <input onChange={(event) => setEndedAt(event.target.value)} type="datetime-local" value={endedAt} />
            </label>
            <label>
              提醒时间
              <input onChange={(event) => setReminderAt(event.target.value)} type="datetime-local" value={reminderAt} />
            </label>
            <label className="inline-toggle private-memo-pin-toggle">
              <input checked={pinned} onChange={(event) => setPinned(event.target.checked)} type="checkbox" />
              置顶提醒
            </label>
            <button className="secondary-action" type="button" onClick={saveSettings}>
              <Check size={15} />
              保存设置
            </button>
          </div>
        </section>

        <div className="private-memo-mobile-sheet-actions">
          <button className="primary-action" type="button" onClick={onAddNode}>
            <Plus size={15} />
            添加进展
          </button>
          <button className="secondary-action" type="button" onClick={onEdit}>
            <Edit3 size={15} />
            编辑
          </button>
          {item.status === 'open' ? (
            <button className="secondary-action" type="button" onClick={() => onUpdate({ status: 'done', nodeText: '标记完成' })}>
              <Check size={15} />
              完成
            </button>
          ) : (
            <button className="secondary-action" type="button" onClick={() => onUpdate({ status: 'open', nodeText: '重新打开' })}>
              <RotateCcw size={15} />
              重新打开
            </button>
          )}
          <button className="secondary-action danger-inline-action" type="button" onClick={onRemove}>
            <Trash2 size={15} />
            删除
          </button>
        </div>
      </aside>
    </div>
  );
}

export function PrivateMemoReminderToast({
  items,
  onItemsChange,
  onOpenPanel,
}: {
  items: ApiPrivateMemoItem[];
  onItemsChange: (items: ApiPrivateMemoItem[]) => void;
  onOpenPanel: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const reminderItems = useMemo(() => getReminderItems(items), [items]);
  const visibleItems = reminderItems.slice(0, 5);
  const hiddenCount = Math.max(0, reminderItems.length - visibleItems.length);

  if (dismissed || visibleItems.length === 0) {
    return null;
  }

  async function markDone(item: ApiPrivateMemoItem) {
    const savedItem = await updateAdminPrivateMemo(item.id, { status: 'done', nodeText: '标记完成' });
    if (savedItem) {
      onItemsChange([savedItem, ...items.filter((currentItem) => currentItem.id !== savedItem.id)]);
    }
  }

  return (
    <aside className="private-memo-toast" aria-label="私人备忘提醒">
      <header>
        <div>
          <span>私人备忘</span>
          <strong>{visibleItems.length} 条需要关注{hiddenCount > 0 ? `，另有 ${hiddenCount} 条` : ''}</strong>
        </div>
        <button aria-label="关闭本次提醒" type="button" onClick={() => setDismissed(true)}>
          <X size={16} />
        </button>
      </header>
      <div className="private-memo-toast-list" aria-hidden="true">
        {visibleItems.map((item) => (
          <article className={isOverdue(item) ? 'is-overdue' : ''} key={item.id}>
            <p>{getMemoTitle(item.text)}</p>
            <small>{formatReminderLabel(item)}</small>
            <button type="button" onClick={() => void markDone(item)}>
              <Check size={14} />
              完成
            </button>
          </article>
        ))}
      </div>
      <button className="primary-action" type="button" onClick={onOpenPanel}>
        <Link2 size={16} />
        打开私人备忘
      </button>
    </aside>
  );
}

function getReminderItems(items: ApiPrivateMemoItem[]) {
  return items
    .filter((item) => item.status === 'open' && (item.pinned || isDue(item)))
    .sort(comparePrivateMemoItems);
}

function comparePrivateMemoItems(first: ApiPrivateMemoItem, second: ApiPrivateMemoItem) {
  const firstRank = getReminderRank(first);
  const secondRank = getReminderRank(second);
  if (firstRank !== secondRank) {
    return firstRank - secondRank;
  }

  if (firstRank === 0) {
    return getOverdueMs(second) - getOverdueMs(first);
  }

  const firstReminderTime = getReminderTime(first) ?? Number.MAX_SAFE_INTEGER;
  const secondReminderTime = getReminderTime(second) ?? Number.MAX_SAFE_INTEGER;
  if (firstReminderTime !== secondReminderTime) {
    return firstReminderTime - secondReminderTime;
  }

  return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
}

function getReminderRank(item: ApiPrivateMemoItem) {
  if (isOverdue(item)) {
    return 0;
  }
  if (isDue(item)) {
    return 1;
  }
  if (item.pinned) {
    return 2;
  }
  return 3;
}

function isDue(item: ApiPrivateMemoItem) {
  const reminderTime = getReminderTime(item);
  return reminderTime !== null && reminderTime <= Date.now();
}

function isOverdue(item: ApiPrivateMemoItem) {
  return getOverdueMs(item) >= 60_000;
}

function getOverdueMs(item: ApiPrivateMemoItem) {
  const reminderTime = getReminderTime(item);
  return reminderTime === null ? 0 : Math.max(0, Date.now() - reminderTime);
}

function getReminderTime(item: ApiPrivateMemoItem) {
  if (!item.reminderAt) {
    return null;
  }
  const time = new Date(item.reminderAt).getTime();
  return Number.isNaN(time) ? null : time;
}

function formatReminderLabel(item: ApiPrivateMemoItem) {
  if (isOverdue(item)) {
    return `已超时 ${formatDuration(getOverdueMs(item))}`;
  }
  if (isDue(item)) {
    return '现在提醒';
  }
  if (item.reminderAt) {
    return `提醒于 ${formatMemoTime(item.reminderAt)}`;
  }
  return item.pinned ? '已置顶' : '无提醒时间';
}

function formatPeriodLabel(item: ApiPrivateMemoItem) {
  if (item.startedAt && item.endedAt) {
    return `${formatMemoTime(item.startedAt)} - ${formatMemoTime(item.endedAt)}`;
  }
  if (item.startedAt) {
    return `开始于 ${formatMemoTime(item.startedAt)}`;
  }
  if (item.endedAt) {
    return `截止于 ${formatMemoTime(item.endedAt)}`;
  }
  return '';
}

function formatDuration(value: number) {
  const totalMinutes = Math.max(1, Math.floor(value / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days} 天 ${hours} 小时`;
  }
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟`;
  }
  return `${minutes} 分钟`;
}

function formatMemoStatus(status: ApiPrivateMemoStatus) {
  return status === 'done' ? '已完成' : '未完成';
}

function formatMemoTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getLatestNode(item: ApiPrivateMemoItem): ApiPrivateMemoNode | null {
  return [...item.nodes].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0] ?? null;
}

function getMemoTitle(text: string) {
  return text.split('\n').find(Boolean)?.slice(0, 80) || '未命名备忘';
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}
