import { useEffect, useMemo, useState } from "react";
import type { Post } from "../posts";
import type { SearchMode, SearchResult } from "./articleSearch";
import { getSearchClient } from "./searchClient";

export function useArticleSearch(
  posts: Post[],
  query: string,
  mode: SearchMode,
) {
  const client = useMemo(() => getSearchClient(posts), [posts]);
  const key = JSON.stringify([query, mode]);
  const [state, setState] = useState<{
    client: typeof client | null;
    key: string;
    results: SearchResult[];
    error: boolean;
  }>({ client: null, key: "", results: [], error: false });

  useEffect(() => {
    let cancelled = false;
    // 连续输入短暂合并，过期响应不覆盖最新查询；清空搜索立即生效。
    const timer = window.setTimeout(
      () => {
        client.search(query, mode).then(
          (results) => {
            if (!cancelled) setState({ client, key, results, error: false });
          },
          () => {
            if (!cancelled) setState({ client, key, results: [], error: true });
          },
        );
      },
      query.trim() ? 100 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, key, query, mode]);

  return {
    results: state.client === client ? state.results : [],
    isUpdating: state.client !== client || state.key !== key,
    error: state.client === client && state.key === key && state.error,
  };
}
