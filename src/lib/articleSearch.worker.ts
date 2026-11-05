import { createArticleSearchIndex, searchArticles } from "./articleSearch";
import type { Post } from "../posts";
import type { ArticleSearchIndex, SearchMode } from "./articleSearch";

let index: ArticleSearchIndex | null = null;

// 全文分词、索引和排序在后台线程执行，不阻塞弹窗、输入和页面滚动。
self.onmessage = (
  event: MessageEvent<
    | { type: "init"; posts: Post[] }
    | { type: "search"; id: number; query: string; mode: SearchMode }
  >,
) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      index = createArticleSearchIndex(message.posts);
      self.postMessage({ type: "ready" });
    } else {
      if (!index) throw new Error("Search index is not ready");
      // 只传回命中元数据，不在每次查询时重复复制完整文章正文。
      const results = searchArticles(index, message.query, message.mode).map(
        ({ post, ...result }) => ({ ...result, slug: post.slug }),
      );
      self.postMessage({ type: "results", id: message.id, results });
    }
  } catch {
    self.postMessage({
      type: "error",
      id: message.type === "search" ? message.id : null,
    });
  }
};
