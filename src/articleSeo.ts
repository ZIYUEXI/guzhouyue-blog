import { useEffect } from 'react';
import type { Post } from './posts';

export function useArticleHead(post: Post | null) {
  useEffect(() => {
    if (!post) {
      return;
    }

    // 公开站复用页面导航，离开文章时恢复原有页头，避免首页保留上一篇的 SEO。
    const previousTitle = document.title;
    const selectors = [
      'meta[name="description"]', 'meta[property="og:type"]', 'meta[property="og:title"]',
      'meta[property="og:description"]', 'meta[property="og:url"]', 'meta[property="og:image"]',
      'meta[name="twitter:card"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]',
      'meta[name="twitter:image"]', 'link[rel="canonical"]', '#article-json-ld',
    ];
    const originals = selectors.map((selector) => document.head.querySelector(selector)?.cloneNode(true));

    const canonicalUrl = `${window.location.origin}/posts/${encodeURIComponent(post.slug)}`;
    const title = post.seoTitle || `${post.title} | 孤舟月`;
    const description = post.seoDescription || post.excerpt;
    const imageUrl = post.coverImage ? new URL(post.coverImage, window.location.origin).toString() : '';

    document.title = title;
    setMetaTag('name', 'description', description);
    setMetaTag('property', 'og:type', 'article');
    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:url', canonicalUrl);
    setMetaTag('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('name', 'twitter:description', description);
    if (imageUrl) {
      setMetaTag('property', 'og:image', imageUrl);
      setMetaTag('name', 'twitter:image', imageUrl);
    }
    setCanonicalUrl(canonicalUrl);
    setJsonLd(post, canonicalUrl, imageUrl);
    return () => {
      document.title = previousTitle;
      selectors.forEach((selector, index) => {
        document.head.querySelector(selector)?.remove();
        if (originals[index]) document.head.appendChild(originals[index]);
      });
    };
  }, [post]);
}

function setMetaTag(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonicalUrl(url: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;
}

function setJsonLd(post: Post, canonicalUrl: string, imageUrl: string) {
  let script = document.getElementById('article-json-ld') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = 'article-json-ld';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    datePublished: post.publishedAt || post.date,
    dateModified: post.publishedAt || post.date,
    author: {
      '@type': 'Person',
      name: post.authorName || '孤舟月',
    },
    image: imageUrl || undefined,
    mainEntityOfPage: canonicalUrl,
  });
}
