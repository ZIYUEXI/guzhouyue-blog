import type { Post } from "../posts";

export type SearchMode = "relevance" | "exact";
export type SearchResult = {
  post: Post;
  score: number;
  similarity: number;
  matchLabel: string;
  matchedTerms: string[];
  snippet: string;
  exact: boolean;
};

type SearchField = {
  text: string;
  normalized: string;
  weight: number;
  label: string;
};
type IndexedArticle = {
  post: Post;
  fields: SearchField[];
  vector: Map<string, number>;
  norm: number;
};
export type ArticleSearchIndex = {
  articles: IndexedArticle[];
  idf: Map<string, number>;
};
type QueryPart = { text: string; quoted: boolean };

const wordPattern =
  /[a-z0-9]+(?:[._+#-][a-z0-9]+)*(?:\+\+|#)?|[\u3400-\u9fff]+/g;
const stopWords = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "in",
  "and",
  "or",
  "的",
  "了",
  "是",
]);

export function normalizeSearchText(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

// 保留代码文本供检索，剔除 Markdown 链接地址、标签和排版符号。
export function plainSearchText(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, " ")
    .replace(/[*`~>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 中文以相邻双字构建向量；英文按完整技术词分词，避免 Java 误中 JavaScript。
function tokenize(text: string) {
  const tokens: string[] = [];
  for (const match of normalizeSearchText(text).matchAll(wordPattern)) {
    const word = match[0];
    if (stopWords.has(word)) continue;
    if (/^[\u3400-\u9fff]+$/.test(word) && word.length > 1) {
      for (let i = 0; i < word.length - 1; i += 1)
        tokens.push(word.slice(i, i + 2));
    } else tokens.push(word);
  }
  return tokens;
}

function parseQuery(query: string): QueryPart[] {
  const parts: QueryPart[] = [];
  const normalized = normalizeSearchText(query.slice(0, 160));
  for (const match of normalized.matchAll(/"([^"]+)"|“([^”]+)”|([^\s"“”]+)/g)) {
    const phrase = match[1] ?? match[2];
    if (phrase) parts.push({ text: phrase, quoted: true });
    else {
      for (const word of match[3].matchAll(wordPattern)) {
        if (!stopWords.has(word[0]))
          parts.push({ text: word[0], quoted: false });
      }
    }
  }
  return parts
    .filter(
      (part, i) =>
        parts.findIndex(
          (other) => other.text === part.text && other.quoted === part.quoted,
        ) === i,
    )
    .slice(0, 16);
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string) {
  // 拉丁字母和数字使用词边界；中文仍允许连续词组匹配。
  const start = /^[a-z0-9]/.test(term) ? "(?<![a-z0-9_])" : "";
  const end = /[a-z0-9+#]$/.test(term) ? "(?![a-z0-9_+#])" : "";
  return new RegExp(`${start}${escapeRegExp(term)}${end}`, "u").test(text);
}

function dateValue(post: Post) {
  return post.publishedAt || post.date || "";
}

export function createArticleSearchIndex(posts: Post[]): ArticleSearchIndex {
  const idf = new Map<string, number>();
  // 即使调用方传入全部后台数据，草稿、归档和回收站内容也不会进入公开索引。
  const articles = posts
    .filter(
      (post) =>
        (!post.status || post.status === "published") && !post.deletedAt,
    )
    .map((post) => {
      const fields = [
        { text: post.title, weight: 6, label: "标题匹配" },
        { text: post.tags.join(" "), weight: 4, label: "标签匹配" },
        { text: post.category, weight: 3, label: "分类匹配" },
        { text: plainSearchText(post.excerpt), weight: 2, label: "摘要匹配" },
        {
          text: plainSearchText(post.bodyMarkdown || post.body.join("\n\n")),
          weight: 1,
          label: "正文匹配",
        },
      ].map((field) => ({
        ...field,
        normalized: normalizeSearchText(field.text),
      }));
      const vector = new Map<string, number>();
      for (const field of fields) {
        const frequencies = new Map<string, number>();
        for (const token of tokenize(field.normalized))
          frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
        for (const [token, count] of frequencies) {
          vector.set(
            token,
            (vector.get(token) ?? 0) + field.weight * (1 + Math.log(count)),
          );
        }
      }
      for (const token of vector.keys())
        idf.set(token, (idf.get(token) ?? 0) + 1);
      return { post, fields, vector, norm: 0 };
    });
  for (const [token, frequency] of idf)
    idf.set(token, 1 + Math.log((articles.length + 1) / (frequency + 1)));
  for (const article of articles) {
    for (const [token, frequency] of article.vector)
      article.vector.set(token, frequency * idf.get(token)!);
    article.norm = Math.sqrt(
      [...article.vector.values()].reduce(
        (sum, value) => sum + value * value,
        0,
      ),
    );
  }
  return { articles, idf };
}

function makeSnippet(
  article: IndexedArticle,
  terms: string[],
  hasQuery: boolean,
) {
  const excerpt = article.fields[3].text;
  const body = article.fields[4].text;
  const text =
    hasQuery &&
    !terms.some((term) => containsTerm(normalizeSearchText(excerpt), term))
      ? body || excerpt
      : excerpt || body;
  // 用原文位置截取命中段落，避免长正文摘要从开头截取而看不到关键词。
  const pattern = terms.length
    ? new RegExp(terms.map(escapeRegExp).join("|"), "iu")
    : null;
  const position = pattern?.exec(text)?.index ?? 0;
  const start = Math.max(0, position - 42);
  const end = Math.min(text.length, start + 155);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export function searchArticles(
  index: ArticleSearchIndex,
  query: string,
  mode: SearchMode = "relevance",
  category = "",
): SearchResult[] {
  const parts = parseQuery(query);
  const hasQuery = Boolean(query.trim());
  if (hasQuery && !parts.length) return [];
  const queryTokens = [
    ...new Set(parts.flatMap((part) => tokenize(part.text))),
  ];
  // 未知词也计入查询向量长度，不能把未命中的词丢掉后产生虚高相似度。
  const queryVector = new Map(
    queryTokens.map((token) => [
      token,
      index.idf.get(token) ?? 1 + Math.log(index.articles.length + 1),
    ]),
  );
  const queryNorm = Math.hypot(...queryVector.values());
  const results: SearchResult[] = [];
  for (const article of index.articles) {
    if (category && article.post.category !== category) continue;
    const matches = parts.map((part) =>
      article.fields.filter((field) =>
        containsTerm(field.normalized, part.text),
      ),
    );
    if (parts.some((part, i) => part.quoted && !matches[i].length)) continue;
    const exact = matches.every((fields) => fields.length > 0);
    let dot = 0;
    let tokenHits = 0;
    for (const [token, weight] of queryVector) {
      const value = article.vector.get(token) ?? 0;
      dot += value * weight;
      if (value) tokenHits += 1;
    }
    const similarity =
      queryNorm && article.norm ? dot / (queryNorm * article.norm) : 0;
    // 相似召回必须覆盖至少 60% 查询词元，且满足最低相似度，抑制泛词误召回。
    if (
      !exact &&
      (mode === "exact" ||
        tokenHits / Math.max(1, queryTokens.length) < 0.6 ||
        similarity < 0.08)
    )
      continue;
    const strongestField = article.fields.find(
      (field) =>
        parts.length &&
        parts.every((part) => containsTerm(field.normalized, part.text)),
    );
    const fieldScore =
      matches.reduce(
        (sum, fields) =>
          sum + Math.max(0, ...fields.map((field) => field.weight)),
        0,
      ) / Math.max(1, parts.length);
    const phrase = parts.map((part) => part.text).join(" ");
    const titlePhrase =
      parts.length && containsTerm(article.fields[0].normalized, phrase)
        ? 18
        : 0;
    const score = hasQuery
      ? (exact ? 100 : 0) + fieldScore * 5 + titlePhrase + similarity * 25
      : 0;
    const matchedTerms = exact
      ? parts.map((part) => part.text)
      : [
          ...new Set([
            ...parts
              .filter((_, i) => matches[i].length)
              .map((part) => part.text),
            ...queryTokens.filter((token) => article.vector.has(token)),
          ]),
        ];
    results.push({
      post: article.post,
      score,
      similarity,
      exact,
      matchedTerms,
      matchLabel: hasQuery
        ? (strongestField?.label ?? (exact ? "多关键词匹配" : "相关内容"))
        : "",
      snippet: makeSnippet(article, matchedTerms, hasQuery),
    });
  }
  return results.sort(
    (a, b) =>
      b.score - a.score ||
      dateValue(b.post).localeCompare(dateValue(a.post)) ||
      a.post.slug.localeCompare(b.post.slug),
  );
}

// 输出纯文本片段，由 React 渲染高亮，绝不把文章内容注入 HTML。
export function highlightSearchText(
  text: string,
  terms: string[],
): { text: string; highlighted: boolean }[] {
  const unique = [...new Set(terms)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!unique.length) return [{ text, highlighted: false }];
  const pattern = new RegExp(
    unique
      .map((term) => {
        const start = /^[a-z0-9]/i.test(term) ? "(?<![a-z0-9_])" : "";
        const end = /[a-z0-9+#]$/i.test(term) ? "(?![a-z0-9_+#])" : "";
        return `${start}${escapeRegExp(term)}${end}`;
      })
      .join("|"),
    "giu",
  );
  const pieces: { text: string; highlighted: boolean }[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    if (start > offset)
      pieces.push({ text: text.slice(offset, start), highlighted: false });
    pieces.push({ text: match[0], highlighted: true });
    offset = start + match[0].length;
  }
  if (offset < text.length)
    pieces.push({ text: text.slice(offset), highlighted: false });
  return pieces;
}
