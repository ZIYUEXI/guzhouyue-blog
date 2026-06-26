import type { BatchResult } from './adminTypes';

export function formatToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day} ${hour}:${minute}`;
}

export function formatDeletedAt(value?: string) {
  if (!value) {
    return '删除时间未知';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '删除时间未知';
  }

  return `删除于 ${new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
}

export function formatDraftSavedAt(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

export function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat('zh-CN').format(Number.isFinite(value) ? value : 0);
}

export function formatTokenCount(value: number | null) {
  return value === null ? '未知' : formatInteger(value);
}

export function formatLlmUsageFeature(value: string) {
  const labels: Record<string, string> = {
    article_metadata: '文章元数据',
    llm_connection_test: '连接测试',
    starfield_passages: '星图文段',
    starfield_relationships: '星图关系',
  };
  return labels[value] ?? (value || '未知功能');
}

export function formatLlmUsageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatBatchResult(action: string, result: BatchResult) {
  return `${action}完成：成功 ${result.success} 项，失败 ${result.failed} 项。`;
}
