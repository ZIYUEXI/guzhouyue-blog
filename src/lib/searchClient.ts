import type { Post } from "../posts";
import type { SearchMode, SearchResult } from "./articleSearch";

type WireResult = Omit<SearchResult, "post"> & { slug: string };
type Pending = {
  resolve: (results: SearchResult[]) => void;
  reject: (error: Error) => void;
};

class SearchClient {
  private worker = new Worker(
    new URL("./articleSearch.worker.ts", import.meta.url),
    { type: "module" },
  );
  private ready: Promise<void>;
  private pending = new Map<number, Pending>();
  private cache = new Map<string, SearchResult[]>();
  private sequence = 0;
  private disposed = false;
  private failed = false;

  get available() {
    return !this.disposed && !this.failed;
  }

  constructor(readonly posts: Post[]) {
    const bySlug = new Map(posts.map((post) => [post.slug, post]));
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (
        event: MessageEvent<
          | { type: "ready" }
          | { type: "results"; id: number; results: WireResult[] }
          | { type: "error"; id: number | null }
        >,
      ) => {
        const message = event.data;
        if (message.type === "ready") {
          resolve();
          return;
        }
        if (message.type === "error") {
          if (message.id === null) {
            this.failed = true;
            reject(new Error("Search initialization failed"));
          } else {
            this.pending.get(message.id)?.reject(new Error("Search failed"));
            this.pending.delete(message.id);
          }
          return;
        }
        const results = message.results.flatMap(({ slug, ...result }) => {
          const post = bySlug.get(slug);
          return post ? [{ ...result, post }] : [];
        });
        this.pending.get(message.id)?.resolve(results);
        this.pending.delete(message.id);
      };
      this.worker.onerror = () => {
        this.failed = true;
        reject(new Error("Search worker failed"));
        this.failPending();
      };
    });
    this.worker.postMessage({ type: "init", posts });
  }

  async search(query: string, mode: SearchMode) {
    await this.ready;
    if (this.disposed) throw new Error("Search client disposed");
    const key = JSON.stringify([query, mode]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const id = ++this.sequence;
    const results = await new Promise<SearchResult[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "search", id, query, mode });
    });
    // 最近查询缓存有固定上限；关掉再打开弹窗时复用同一个索引。
    if (this.cache.size >= 16)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, results);
    return results;
  }

  private failPending() {
    for (const request of this.pending.values())
      request.reject(new Error("Search worker unavailable"));
    this.pending.clear();
  }

  dispose() {
    this.disposed = true;
    this.worker.terminate();
    this.failPending();
    this.cache.clear();
  }
}

let sharedClient: SearchClient | undefined;

export function getSearchClient(posts: Post[]) {
  // 数据刷新时销毁旧线程，避免旧文章索引或多余 Worker 长期驻留。
  if (
    !sharedClient ||
    !sharedClient.available ||
    sharedClient.posts !== posts
  ) {
    sharedClient?.dispose();
    sharedClient = new SearchClient(posts);
  }
  return sharedClient;
}
