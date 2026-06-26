import type { Post, PostStatus } from '../posts';

export type ArchiveGroup = {
  month: string;
  entries: Post[];
};

export const postStatusLabels: Record<PostStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

export function buildArchive(posts: Post[]): ArchiveGroup[] {
  return sortPosts(posts).reduce<ArchiveGroup[]>((months, post) => {
    const [year, month] = post.date.split('.');
    const monthLabel = `${year} 年 ${Number(month)} 月`;
    const existingMonth = months.find((item) => item.month === monthLabel);

    if (existingMonth) {
      existingMonth.entries.push(post);
    } else {
      months.push({ month: monthLabel, entries: [post] });
    }

    return months;
  }, []);
}

export function sortPosts(posts: Post[]) {
  return [...posts].sort((firstPost, secondPost) => parsePostDate(secondPost.date) - parsePostDate(firstPost.date));
}

export function parsePostDate(date: string) {
  const [datePart = '', timePart = '00:00'] = date.trim().split(/\s+/);
  const [year = '0', month = '1', day = '1'] = datePart.split('.');
  const [hour = '0', minute = '0'] = timePart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

export function getPostBySlug(posts: Post[], slug: string) {
  return posts.find((post) => post.slug === slug);
}

export function getAdjacentPosts(posts: Post[], slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);

  return {
    previousPost: index > 0 ? posts[index - 1] : undefined,
    nextPost: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

export function getPostStatus(post: Post): PostStatus {
  return post.status ?? 'published';
}

export function getPostStatusLabel(post: Post) {
  return postStatusLabels[getPostStatus(post)];
}

export function getPublishedPosts(posts: Post[]) {
  return posts.filter((post) => getPostStatus(post) === 'published');
}

export function toDatetimeLocalValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

export function fromDatetimeLocalValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getPostArchiveMonthValue(post: Post) {
  const [year = '', month = ''] = post.date.split(/[.\s]/);
  if (!year || !month) {
    return '';
  }

  return `${year}-${month.padStart(2, '0')}`;
}

export function getPostArchiveDateValue(post: Post) {
  const [datePart = ''] = post.date.trim().split(/\s+/);
  const [year = '', month = '', day = ''] = datePart.split('.');
  if (!year || !month || !day) {
    return '';
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function getArchiveMonthLabel(monthValue: string) {
  const [year = '', month = ''] = monthValue.split('-');
  if (!year || !month) {
    return '未选择月份';
  }

  return `${year} 年 ${Number(month)} 月`;
}

export function getArchiveDateLabel(dateValue: string) {
  const [year = '', month = '', day = ''] = dateValue.split('-');
  if (!year || !month || !day) {
    return '未选择日期';
  }

  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

export function movePostToArchiveDate(post: Post, dateValue: string): Post {
  const [targetYearText, targetMonthText, targetDayText] = dateValue.split('-');
  const targetYear = Number(targetYearText);
  const targetMonth = Number(targetMonthText);
  const targetDay = Number(targetDayText);
  if (!targetYear || !targetMonth || targetMonth < 1 || targetMonth > 12 || !targetDay) {
    return post;
  }

  const maxDay = new Date(targetYear, targetMonth, 0).getDate();
  if (targetDay < 1 || targetDay > maxDay) {
    return post;
  }

  const [, timePart = ''] = post.date.trim().split(/\s+/);
  const [hourText = '0', minuteText = '0'] = timePart.split(':');
  const hour = Number(hourText) || 0;
  const minute = Number(minuteText) || 0;
  const pad = (value: number) => String(value).padStart(2, '0');
  const nextDate = `${targetYear}.${pad(targetMonth)}.${pad(targetDay)}${timePart ? ` ${pad(hour)}:${pad(minute)}` : ''}`;
  const nextPublishedAt = new Date(targetYear, targetMonth - 1, targetDay, hour, minute).toISOString();

  return {
    ...post,
    date: nextDate,
    publishedAt: nextPublishedAt,
  };
}

export function slugifyPostTitle(value: string) {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalizedValue || `post-${Date.now()}`;
}

export function createUniqueSlug(posts: Post[], slug: string, currentSlug?: string) {
  const baseSlug = slugifyPostTitle(slug);
  const existingSlugs = new Set(posts.filter((post) => post.slug !== currentSlug).map((post) => post.slug));

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let index = 2;
  let nextSlug = `${baseSlug}-${index}`;

  while (existingSlugs.has(nextSlug)) {
    index += 1;
    nextSlug = `${baseSlug}-${index}`;
  }

  return nextSlug;
}

export function normalizeTag(value: string) {
  return value.trim().replace(/^#/, '');
}

export function normalizeTags(values: string[]) {
  return values.reduce<string[]>((tags, value) => {
    const tag = normalizeTag(value);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }

    return tags;
  }, []);
}

export function splitTagInput(value: string) {
  return normalizeTags(value.split(/[，,\n]/));
}

export function collectExistingTags(posts: Post[]) {
  return normalizeTags(posts.flatMap((post) => post.tags));
}

export function buildLocalAdminTags(posts: Post[]) {
  const stats = new Map<string, { name: string; articleCount: number; occurrenceCount: number }>();
  posts.forEach((post) => {
    const seenTags = new Set<string>();
    post.tags.forEach((tagName) => {
      const tag = normalizeTag(tagName);
      if (!tag) {
        return;
      }

      const tagStats = stats.get(tag) ?? { name: tag, articleCount: 0, occurrenceCount: 0 };
      tagStats.occurrenceCount += 1;
      if (!seenTags.has(tag)) {
        tagStats.articleCount += 1;
        seenTags.add(tag);
      }
      stats.set(tag, tagStats);
    });
  });

  return Array.from(stats.values()).sort((firstTag, secondTag) =>
    secondTag.articleCount - firstTag.articleCount || firstTag.name.localeCompare(secondTag.name),
  );
}

export function getPostMarkdown(post: Post) {
  return post.bodyMarkdown?.trim() || post.body.join('\n\n') || '这里还没有正文。';
}

export function normalizeMarkdown(value: string) {
  return value.trim() || '这里还没有正文。';
}
