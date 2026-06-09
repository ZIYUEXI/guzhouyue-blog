import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { fetchArticleComments, submitArticleComment } from './apiClient';

type CommentItem = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

function getCommentsStorageKey(slug: string) {
  return `guzhouyue-comments:${slug}`;
}

function readPostComments(slug: string): CommentItem[] {
  try {
    const storedComments = window.localStorage.getItem(getCommentsStorageKey(slug));
    const parsedComments = storedComments ? JSON.parse(storedComments) : [];

    if (!Array.isArray(parsedComments)) {
      return [];
    }

    return parsedComments.filter((comment): comment is CommentItem => {
      return (
        typeof comment?.id === 'string' &&
        typeof comment.author === 'string' &&
        typeof comment.content === 'string' &&
        typeof comment.createdAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

function savePostComments(slug: string, comments: CommentItem[]) {
  window.localStorage.setItem(getCommentsStorageKey(slug), JSON.stringify(comments));
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function ArticleComments({ slug }: { slug: string }) {
  const [comments, setComments] = useState<CommentItem[]>(() => readPostComments(slug));
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      try {
        const apiComments = await fetchArticleComments(slug);
        if (!cancelled) {
          setComments(apiComments);
          savePostComments(slug, apiComments);
        }
      } catch {
        if (!cancelled) {
          setComments(readPostComments(slug));
        }
      }
    }

    loadComments();
    setIsExpanded(false);
    setNotice('');
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    try {
      const savedComment = await submitArticleComment(slug, {
        authorName: author.trim() || '过路读者',
        content: trimmedContent,
      });

      if (savedComment) {
        const nextComments = [savedComment, ...comments];
        setComments(nextComments);
        savePostComments(slug, nextComments);
        setNotice('');
      } else {
        setNotice('评论已提交，审核后展示。');
      }
      setAuthor('');
      setContent('');
    } catch {
      const nextComment: CommentItem = {
        id: `${Date.now()}`,
        author: author.trim() || '过路读者',
        content: trimmedContent,
        createdAt: new Date().toISOString(),
      };
      const nextComments = [nextComment, ...comments];

      setComments(nextComments);
      savePostComments(slug, nextComments);
      setAuthor('');
      setContent('');
      setNotice('评论接口暂不可用，已临时保存到本机，尚未公开提交。');
    }
  }

  return (
    <section className="article-comments" aria-label="评论">
      <div className="article-comments-header">
        <span>
          <MessageCircle size={18} />
          评论
        </span>
        <button
          aria-expanded={isExpanded}
          aria-controls="article-comments-panel"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          type="button"
        >
          <strong>{comments.length}</strong>
          {isExpanded ? '收起评论' : '展开评论'}
        </button>
      </div>

      {isExpanded && (
        <div className="article-comments-panel" id="article-comments-panel">
          <form className="comment-form" onSubmit={submitComment}>
            <input
              aria-label="评论昵称"
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="昵称"
              value={author}
            />
            <textarea
              aria-label="评论内容"
              onChange={(event) => setContent(event.target.value)}
              placeholder="写下你的想法"
              rows={4}
              value={content}
            />
            <button type="submit">
              <Send size={17} />
              发表评论
            </button>
          </form>
          {notice && <p className="comment-empty">{notice}</p>}

          {comments.length > 0 ? (
            <div className="comment-list">
              {comments.map((comment) => (
                <article className="comment-item" key={comment.id}>
                  <header>
                    <strong>{comment.author}</strong>
                    <time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>
                  </header>
                  <p>{comment.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="comment-empty">还没有评论，来写第一条。</p>
          )}
        </div>
      )}
    </section>
  );
}
