import type { Post } from '../posts';
import { PostCover } from './PostCover';

export function PostListItem({ post }: { post: Post }) {
  return (
    <a className={`list-post tone-${post.tone}`} href={`/posts/${post.slug}`}>
      <PostCover className="list-post-cover" coverImage={post.coverImage} loading="lazy" />
      <div className="list-post-body">
        <div className="list-post-meta">
          <span>{post.category}</span>
          <small>{post.date}</small>
        </div>
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
      </div>
    </a>
  );
}
