import { useEffect } from 'react';
import type { Post } from './posts';

export function useArticleHead(post: Post | null) {
  useEffect(() => {
    if (!post) {
      return;
    }

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
