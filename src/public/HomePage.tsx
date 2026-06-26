import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { AuthorAvatar, PostCover, SectionHeading } from '../components';
import {
  defaultSiteContent,
  type AlmanacInfo,
  type FeaturedSeries,
  type HomepageCopy,
  type NoteSection,
  type SiteContent,
} from '../contentStore';
import { buildArchive, getPublishedPosts } from '../lib/postUtils';
import type { Post } from '../posts';
import { createSeasonNote } from '../seasonNote';

const homepageArchivePreviewLimit = 4;
const homepageArchiveEntriesPerMonthLimit = 6;

export function HomePage({ content, heroImage }: { content: SiteContent; heroImage: string }) {
  return <HeroMoonScene almanac={content.almanac} heroImage={heroImage} homepage={content.homepage} />;
}

export function HomeContent({
  content,
  ownerAvatarUrl,
  ownerName,
}: {
  content: SiteContent;
  ownerAvatarUrl: string;
  ownerName: string;
}) {
  return (
    <>
      <LatestPosts homepage={content.homepage} posts={content.posts} />
      <TopicRiver homepage={content.homepage} noteSections={content.noteSections} />
      <FeaturedEssay homepage={content.homepage} posts={content.posts} seriesList={content.featuredSeries} />
      <ArchivePreview homepage={content.homepage} posts={content.posts} />
      <AboutBlock homepage={content.homepage} noteSections={content.noteSections} ownerAvatarUrl={ownerAvatarUrl} ownerName={ownerName} posts={content.posts} />
    </>
  );
}

function HeroMoonScene({
  almanac,
  heroImage,
  homepage,
}: {
  almanac?: AlmanacInfo | null;
  heroImage: string;
  homepage: HomepageCopy;
}) {
  const seasonNote = useMemo(() => (homepage.seasonAuto ? createSeasonNoteFromAlmanac(almanac) ?? createSeasonNote() : null), [almanac, homepage.seasonAuto]);
  const seasonTitle = seasonNote?.title ?? homepage.seasonTitle;
  const seasonText = seasonNote?.text ?? homepage.seasonText;

  return (
    <section className="hero" id="首页">
      <div className="hero-art" aria-hidden="true">
        <img src={heroImage} alt="" />
        <div className="moon-orbit" />
        <div className="water-shimmer" />
      </div>

      <div className="hero-content">
        <div className="seal" aria-label="乙巳夏前">
          <span>乙巳</span>
          <span>夏前</span>
        </div>
        <h1>{homepage.heroTitle}</h1>
        <p>{homepage.heroSubtitle}</p>
        <div className="hero-actions">
          <a className="primary-action" href="/#文章">
            {homepage.primaryCta}
            <ChevronRight size={18} />
          </a>
          <a className="secondary-action" href="/#归档">
            {homepage.secondaryCta}
          </a>
        </div>
      </div>

      <aside className="season-card" aria-label="今日小记">
        <CalendarDays size={18} />
        <div>
          <strong>{seasonTitle}</strong>
          <span>{seasonText}</span>
        </div>
      </aside>
    </section>
  );
}

function createSeasonNoteFromAlmanac(almanac?: AlmanacInfo | null) {
  if (!almanac) {
    return null;
  }

  const termLabel = almanac.solarTerm || (almanac.nextSolarTerm ? `${almanac.nextSolarTerm}前` : '');
  const titleParts = ['今日', almanac.lunarMonth && almanac.lunarDay ? `${almanac.lunarMonth}${almanac.lunarDay}` : '', termLabel].filter(Boolean);
  const goodThings = almanac.goodThings.filter((thing) => thing !== '诸事不忌').slice(0, 3);
  const badThings = almanac.badThings.filter((thing) => thing !== '诸事不忌').slice(0, 2);
  const textParts = [
    goodThings.length > 0 ? `宜：${goodThings.join('、')}` : '',
    badThings.length > 0 ? `忌：${badThings.join('、')}` : '',
  ].filter(Boolean);

  return {
    title: titleParts.join(' · '),
    text: textParts.join('；') || almanac.zodiacClash || almanac.weekDay,
  };
}

function LatestPosts({ homepage, posts }: { homepage: HomepageCopy; posts: Post[] }) {
  const [lead, ...rest] = posts;
  const recentPosts = rest.slice(0, 3);
  const featuredTitleDensity = getFeaturedTitleDensity(lead?.title ?? '');

  if (!lead) {
    return null;
  }

  return (
    <section className="content-section latest" id="文章">
      <SectionHeading
        action={
          <a className="section-link" href="/posts/page/1">
            全部文章
            <ChevronRight size={17} />
          </a>
        }
        eyebrow={homepage.latestEyebrow}
        title={homepage.latestTitle}
      />
      <div className="post-grid">
        <a className={`featured-card tone-${lead.tone}`} href={`/posts/${lead.slug}`}>
          <PostCover className="featured-card-cover" coverImage={lead.coverImage} loading="lazy" />
          <div className="featured-card-body">
            <span>{lead.category}</span>
            <h3 className={`featured-title-${featuredTitleDensity}`}>{lead.title}</h3>
            <p>{lead.excerpt}</p>
            <footer>
              <small>{lead.date}</small>
            </footer>
          </div>
        </a>

        <div className="post-list">
          {recentPosts.map((post) => (
            <PostCard key={post.title} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}

function getFeaturedTitleDensity(title: string) {
  const normalizedTitle = title.trim();
  const titleLength = Array.from(normalizedTitle).length;
  const longestSegmentLength = Math.max(
    0,
    ...normalizedTitle.split(/[\s，。！？、：；,.!?:;()[\]{}"'“”‘’《》<>/\\|-]+/).map((segment) => Array.from(segment).length),
  );

  if (titleLength > 72 || longestSegmentLength > 34) {
    return 'ultra';
  }

  if (titleLength > 52 || longestSegmentLength > 24) {
    return 'dense';
  }

  if (titleLength > 34) {
    return 'compact';
  }

  return 'normal';
}

function PostCard({ post }: { post: Post }) {
  return (
    <a className={`post-card tone-${post.tone}`} href={`/posts/${post.slug}`}>
      <PostCover className="post-card-cover" coverImage={post.coverImage} loading="lazy" />
      <div className="post-card-body">
        <div className="post-card-meta">
          <span>{post.category}</span>
          <small>{post.date}</small>
        </div>
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
        <footer>{post.date}</footer>
      </div>
    </a>
  );
}

function TopicRiver({ homepage, noteSections }: { homepage: HomepageCopy; noteSections: NoteSection[] }) {
  const riverRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const dragStateRef = useRef({
    dragged: false,
    isDragging: false,
    startScroll: 0,
    startX: 0,
    startY: 0,
  });
  const displaySections = useMemo(() => {
    const sectionPriority = new Map(defaultSiteContent.noteSections.map((section, index) => [section.category, index]));
    return noteSections.filter((section) => section.category !== '功能测试').sort((first, second) => {
      const firstPriority = sectionPriority.get(first.category) ?? 100 + noteSections.indexOf(first);
      const secondPriority = sectionPriority.get(second.category) ?? 100 + noteSections.indexOf(second);
      return firstPriority - secondPriority;
    });
  }, [noteSections]);
  const loopedSections = displaySections.length > 1 ? [...displaySections, ...displaySections] : displaySections;

  const getScrollCycle = (river: HTMLDivElement) => {
    const styles = window.getComputedStyle(river);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    return (river.scrollWidth + gap) / 2;
  };

  const setLoopedScroll = (river: HTMLDivElement, value: number) => {
    const cycle = getScrollCycle(river);

    if (!Number.isFinite(cycle) || cycle <= 0 || river.scrollWidth <= river.clientWidth) {
      return;
    }

    let next = value;
    while (next >= cycle) next -= cycle;
    while (next < 0) next += cycle;
    scrollPositionRef.current = next;
    river.scrollLeft = next;
  };

  useEffect(() => {
    const river = riverRef.current;
    if (!river) return;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => {
      prefersReducedMotionRef.current = reducedMotionQuery.matches;
    };
    updateMotionPreference();
    reducedMotionQuery.addEventListener('change', updateMotionPreference);

    let animationFrame = 0;
    let previousTime = performance.now();
    const speed = 18;

    const animate = (time: number) => {
      const dragState = dragStateRef.current;
      const deltaSeconds = Math.min(time - previousTime, 40) / 1000;
      previousTime = time;

      if (!dragState.isDragging && !prefersReducedMotionRef.current && time >= pauseUntilRef.current) {
        setLoopedScroll(river, scrollPositionRef.current + speed * deltaSeconds);
      }

      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      reducedMotionQuery.removeEventListener('change', updateMotionPreference);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [noteSections]);

  const pauseAutoScroll = (duration = 900) => {
    pauseUntilRef.current = window.performance.now() + duration;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const river = riverRef.current;
    if (!river) return;

    pauseAutoScroll(1200);
    dragStateRef.current = {
      dragged: false,
      isDragging: true,
      startScroll: river.scrollLeft,
      startX: event.clientX,
      startY: event.clientY,
    };
    scrollPositionRef.current = river.scrollLeft;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const river = riverRef.current;
    const dragState = dragStateRef.current;
    if (!river || !dragState.isDragging) return;

    const dragDistance = event.clientX - dragState.startX;
    const verticalDistance = event.clientY - dragState.startY;
    if (Math.hypot(dragDistance, verticalDistance) > 5) {
      dragState.dragged = true;
      river.classList.add('is-dragging');
      if (!river.hasPointerCapture(event.pointerId)) {
        river.setPointerCapture(event.pointerId);
      }
    }

    if (!dragState.dragged) return;

    setLoopedScroll(river, dragState.startScroll - dragDistance * 1.8);
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const river = riverRef.current;
    if (!river || !dragStateRef.current.isDragging) return;

    dragStateRef.current.isDragging = false;
    river.classList.remove('is-dragging');
    if (river.hasPointerCapture(event.pointerId)) {
      river.releasePointerCapture(event.pointerId);
    }
    if (dragStateRef.current.dragged) {
      window.setTimeout(() => {
        dragStateRef.current.dragged = false;
      }, 0);
    }
  };

  const handleChipClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!dragStateRef.current.dragged) return;

    event.preventDefault();
    dragStateRef.current.dragged = false;
  };

  const handleRiverScroll = () => {
    const river = riverRef.current;
    if (!river) return;

    scrollPositionRef.current = river.scrollLeft;
  };

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <section className="content-section" id="札记">
      <SectionHeading eyebrow={homepage.topicsEyebrow} title={homepage.topicsTitle} />
      <div
        className="topic-river"
        aria-label="文章分类"
        onDragStart={handleDragStart}
        onPointerCancel={stopDragging}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onScroll={handleRiverScroll}
        onWheel={() => pauseAutoScroll(600)}
        onFocus={() => pauseAutoScroll(1200)}
        ref={riverRef}
      >
        {loopedSections.map((section, index) => {
          const isClone = index >= displaySections.length;

          return (
          <a
            aria-hidden={isClone || undefined}
            className="topic-chip"
            draggable={false}
            href={`/posts/page/1?category=${encodeURIComponent(section.category)}`}
            key={`${section.category}-${index}`}
            onClick={handleChipClick}
            tabIndex={isClone ? -1 : undefined}
          >
            <span>{section.category}</span>
            <small>{section.description}</small>
          </a>
          );
        })}
      </div>
    </section>
  );
}

function FeaturedEssay({
  homepage,
  posts,
  seriesList,
}: {
  homepage: HomepageCopy;
  posts: Post[];
  seriesList: FeaturedSeries[];
}) {
  const featuredSeries = seriesList.find((series) =>
    series.postSlugs.some((slug) => posts.some((post) => post.slug === slug)),
  );

  if (!featuredSeries) {
    return null;
  }

  const seriesPosts = featuredSeries.postSlugs
    .map((slug) => posts.find((post) => post.slug === slug))
    .filter((post): post is Post => Boolean(post));

  return (
    <section className="essay-band">
      <div>
        <SectionHeading eyebrow={homepage.seriesEyebrow} title={featuredSeries.title} />
        <h3>{featuredSeries.lead}</h3>
        <p>{featuredSeries.body}</p>
      </div>
      <div className="chapter-list" aria-label="系列章节">
        {seriesPosts.map((post, index) => (
          <a href={`/posts/${post.slug}`} key={post.slug}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            {post.title}
          </a>
        ))}
      </div>
    </section>
  );
}

function ArchivePreview({ homepage, posts }: { homepage: HomepageCopy; posts: Post[] }) {
  const publishedPosts = useMemo(() => getPublishedPosts(posts), [posts]);
  const archiveGroups = useMemo(() => buildArchive(publishedPosts), [publishedPosts]);
  const previewGroups = useMemo(() => archiveGroups.slice(0, homepageArchivePreviewLimit), [archiveGroups]);
  const hasOverflowingArchivePreview =
    archiveGroups.length > homepageArchivePreviewLimit ||
    previewGroups.some((group) => group.entries.length > homepageArchiveEntriesPerMonthLimit);
  const [openMonth, setOpenMonth] = useState(previewGroups[0]?.month ?? '');

  useEffect(() => {
    if (!previewGroups.some((group) => group.month === openMonth)) {
      setOpenMonth(previewGroups[0]?.month ?? '');
    }
  }, [openMonth, previewGroups]);

  return (
    <section className="content-section archive" id="归档">
      <SectionHeading
        action={
          hasOverflowingArchivePreview ? (
            <a className="section-link" href="/archive/page/1">
              全部归档
            </a>
          ) : undefined
        }
        eyebrow={homepage.archiveEyebrow}
        title={homepage.archiveTitle}
      />
      <div className="timeline">
        {previewGroups.map(({ month, entries }) => {
          const previewEntries = entries.slice(0, homepageArchiveEntriesPerMonthLimit);

          return (
            <div className="timeline-month" key={month}>
              <button type="button" onClick={() => setOpenMonth(openMonth === month ? '' : month)}>
                <span />
                {month}
              </button>
              {openMonth === month && (
                <ul>
                  {previewEntries.map((post) => (
                    <li key={post.slug}>
                      <a href={`/posts/${post.slug}`}>
                        {post.date.slice(5).replace('.', '.')}  {post.title}
                      </a>
                    </li>
                  ))}
                  {entries.length > homepageArchiveEntriesPerMonthLimit && (
                    <li>
                      <a className="timeline-more-link" href="/archive/page/1">
                        查看该月更多文章
                      </a>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AboutBlock({
  homepage,
  noteSections,
  ownerAvatarUrl,
  ownerName,
  posts,
}: {
  homepage: HomepageCopy;
  noteSections: NoteSection[];
  ownerAvatarUrl: string;
  ownerName: string;
  posts: Post[];
}) {
  return (
    <section className="about-band" id="关于">
      <div>
        <SectionHeading eyebrow={homepage.aboutEyebrow} title={homepage.aboutTitle} />
        <p>{homepage.aboutBody}</p>
      </div>
      <div className="about-stats" aria-label="站点摘要">
        <div className="about-author">
          <AuthorAvatar ownerAvatarUrl={ownerAvatarUrl} ownerName={ownerName} size="large" />
          <div>
            <span>作者</span>
            <strong>{ownerName}</strong>
          </div>
        </div>
        <div className="about-metrics">
          <span>
            <strong>{posts.length}</strong>
            <small>近日文章</small>
          </span>
          <span>
            <strong>{noteSections.length}</strong>
            <small>内容主题</small>
          </span>
        </div>
      </div>
    </section>
  );
}
