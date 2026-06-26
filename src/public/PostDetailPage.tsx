import { useEffect, useMemo, useState } from 'react';
import { AuthorAvatar, PostCover, PostListItem, SectionHeading } from '../components';
import { ArticleComments } from '../ArticleComments';
import { fetchPublicStarfield } from '../apiClient';
import { useArticleHead } from '../articleSeo';
import { calculateReadingMinutes, decodeHashAnchor, getMarkdownOutline } from '../lib/markdownUtils';
import { getAdjacentPosts, getPostBySlug, getPostMarkdown } from '../lib/postUtils';
import { MarkdownBody } from '../MarkdownBody';
import type { Post } from '../posts';

export function PostDetailPage({ ownerAvatarUrl, posts, slug }: { ownerAvatarUrl: string; posts: Post[]; slug: string }) {
  const post = getPostBySlug(posts, slug);
  useArticleHead(post ?? null);
  const markdown = post ? getPostMarkdown(post) : '';
  const outlineItems = useMemo(() => getMarkdownOutline(markdown), [markdown]);
  const passageAnchor = typeof window !== 'undefined' ? decodeHashAnchor(window.location.hash) : '';
  const [starfieldPassageAnchors, setStarfieldPassageAnchors] = useState<Array<{ anchor: string; text: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    if (!post || !passageAnchor.startsWith('passage-id-')) {
      setStarfieldPassageAnchors([]);
      return () => {
        cancelled = true;
      };
    }
    fetchPublicStarfield()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setStarfieldPassageAnchors(
          payload.passages
            .filter((passage) => passage.article.slug === post.slug)
            .map((passage) => ({ anchor: passage.anchor, text: passage.text })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setStarfieldPassageAnchors([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [passageAnchor, post]);

  useEffect(() => {
    if (!passageAnchor) {
      return;
    }
    if (passageAnchor.startsWith('passage-id-') && starfieldPassageAnchors.length === 0) {
      return;
    }
    const target = document.getElementById(passageAnchor) ?? document.querySelector('.article-body');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.classList.add('is-passage-target');
    const timeout = window.setTimeout(() => target?.classList.remove('is-passage-target'), 2200);
    return () => window.clearTimeout(timeout);
  }, [passageAnchor, starfieldPassageAnchors]);

  if (!post) {
    return <NotFoundPage />;
  }

  const { previousPost, nextPost } = getAdjacentPosts(posts, slug);
  const readingMinutes = calculateReadingMinutes(markdown);
  const relatedPosts = posts.filter((item) => item.slug !== post.slug && item.category === post.category).slice(0, 3);

  return (
    <article className="article-page">
      <header className={`article-hero tone-${post.tone}`}>
        <PostCover className="article-hero-cover" coverImage={post.coverImage} />
        <div className="article-hero-content">
          <a className="breadcrumb" href="/posts/page/1">
            全部文章
          </a>
          <span>{post.category}</span>
          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
          <div className="article-meta">
            <span className="article-author-meta">
              <AuthorAvatar ownerAvatarUrl={ownerAvatarUrl} ownerName={post.authorName || '孤舟月'} size="small" />
              <small>作者：{post.authorName || '孤舟月'}</small>
            </span>
            <small>{post.date}</small>
            <small>{readingMinutes} 分钟阅读</small>
          </div>
          {post.tags.length > 0 && (
            <div className="article-tags" aria-label="文章标签">
              {post.tags.map((tag) => (
                <a href={`/posts/page/1?category=${encodeURIComponent(post.category)}&tag=${encodeURIComponent(tag)}`} key={tag}>
                  {tag}
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      {outlineItems.length > 0 && (
        <nav className="article-toc" aria-label="文章目录">
          <strong>目录</strong>
          {outlineItems.map((item) => (
            <span className={`toc-level-${item.level}`} key={item.id}>{item.title}</span>
          ))}
        </nav>
      )}

      {passageAnchor && (
        <p className="passage-anchor-notice">
          已从星图定位到文段锚点：{passageAnchor}
        </p>
      )}

      <MarkdownBody markdown={markdown} passageAnchors={starfieldPassageAnchors} />

      <nav className="article-neighbors" aria-label="相邻文章">
        {previousPost ? (
          <a href={`/posts/${previousPost.slug}`}>
            <small>上一篇</small>
            {previousPost.title}
          </a>
        ) : (
          <span />
        )}
        {nextPost ? (
          <a href={`/posts/${nextPost.slug}`}>
            <small>下一篇</small>
            {nextPost.title}
          </a>
        ) : (
          <span />
        )}
      </nav>

      {relatedPosts.length > 0 && (
        <section className="related-posts" aria-label="相关文章">
          <SectionHeading eyebrow="Related" title="相关文章" />
          <div className="listing-grid listing-grid-compact">
            {relatedPosts.map((relatedPost) => (
              <PostListItem key={relatedPost.slug} post={relatedPost} />
            ))}
          </div>
        </section>
      )}

      <ArticleComments slug={post.slug} />
    </article>
  );
}

export function NotFoundPage() {
  return (
    <section className="content-section not-found-page">
      <SectionHeading eyebrow="404" title="没有找到这页" />
      <p>这条路径暂时没有内容，可以回到首页或浏览全部文章。</p>
      <div className="hero-actions">
        <a className="primary-action" href="/">
          返回首页
        </a>
        <a className="secondary-action" href="/posts/page/1">
          全部文章
        </a>
      </div>
    </section>
  );
}
