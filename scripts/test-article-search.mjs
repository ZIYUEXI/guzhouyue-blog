import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// 独立执行实际检索模块，不导入前端运行环境，也不触碰本地权威数据库副本。
const source = fs.readFileSync(
  new URL("../src/lib/articleSearch.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { createArticleSearchIndex, searchArticles, highlightSearchText } =
  await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
const post = (slug, title, extra = {}) => ({
  slug,
  title,
  category: "技术笔记",
  tags: [],
  excerpt: "",
  body: [],
  date: "2026.10.01",
  status: "published",
  tone: "pine",
  ...extra,
});
const documents = [
  post("python-windows", "Windows 安装后白屏：Python MIME 映射排查", {
    tags: ["Python", "Electron"],
    bodyMarkdown:
      "Chromium 拒绝执行 text/plain。排查 Python mimetypes 与 Windows 注册表。",
    excerpt: "安装后白屏的原因与修复。",
    date: "2026.09.01",
  }),
  post("body-only", "一份开发记录", {
    bodyMarkdown: "Python 使用方法。".repeat(80) + " Windows 环境安装。",
    date: "2026.10.09",
  }),
  post("react", "React 项目部署", {
    tags: ["Cloudflare"],
    bodyMarkdown: "React 部署时处理缓存。",
  }),
  post("java", "Java 入门"),
  post("javascript", "JavaScript 入门"),
  post("ml", "机器学习算法笔记", {
    tags: ["算法"],
    category: "人工智能",
    bodyMarkdown: "机器学习讨论方法。",
  }),
  post("remote-body", "图形界面排查", {
    bodyMarkdown:
      "背景说明。".repeat(100) +
      " VulkanSwapchainNeedle 校验失败，需要重新创建交换链。",
    excerpt: "图形界面的故障处理。",
  }),
  post("phrase-good", "machine learning 入门"),
  post("phrase-bad", "machine tools", { bodyMarkdown: "learning more tools" }),
  post("draft-secret", "Python Windows 私密草稿", { status: "draft" }),
  post("archived-secret", "Python Windows 已归档", { status: "archived" }),
  post("deleted-secret", "Python Windows 已删除", { deletedAt: "2026-10-01" }),
];
const index = createArticleSearchIndex(documents);
let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`PASS ${name}`);
}

check(
  "multiple terms may appear in different fields; title outranks recent body-only matches",
  () => {
    const results = searchArticles(index, "Python Windows", "exact");
    assert.equal(results[0].post.slug, "python-windows");
    assert(results.some((result) => result.post.slug === "body-only"));
    assert(results.every((result) => !result.post.slug.includes("secret")));
  },
);
check("NFKC, mixed case, repeated whitespace and punctuation", () => {
  assert.equal(
    searchArticles(index, "  ＰＹＴＨＯＮ，  windows ", "exact")[0].post.slug,
    "python-windows",
  );
});
check("title, category, tags and body support cross-field AND matching", () => {
  assert.equal(
    searchArticles(index, "Electron MIME 技术笔记", "exact")[0].post.slug,
    "python-windows",
  );
});
check("Latin word boundaries prevent Java from matching JavaScript", () => {
  assert.deepEqual(
    searchArticles(index, "java").map((result) => result.post.slug),
    ["java"],
  );
});
check("technical symbols and legacy body arrays stay searchable", () => {
  const technicalIndex = createArticleSearchIndex([
    post("c-sharp", "语言笔记", { bodyMarkdown: "# 示例\n使用 C# 和 C++ 构建工具。" }),
    post("legacy-body", "旧格式文章", { bodyMarkdown: "", body: ["LegacyBodyNeedle 仍然可以搜索。"] }),
  ]);
  assert.equal(searchArticles(technicalIndex, "C#", "exact")[0].post.slug, "c-sharp");
  assert.equal(searchArticles(technicalIndex, "C++", "exact")[0].post.slug, "c-sharp");
  assert.equal(searchArticles(technicalIndex, "C", "exact").length, 0);
  assert.equal(searchArticles(technicalIndex, "LegacyBodyNeedle")[0].post.slug, "legacy-body");
});
check("quoted phrases remain contiguous even in relevance mode", () => {
  assert.deepEqual(
    searchArticles(index, '"machine learning"').map(
      (result) => result.post.slug,
    ),
    ["phrase-good"],
  );
  assert.deepEqual(
    searchArticles(index, "“machine learning”").map(
      (result) => result.post.slug,
    ),
    ["phrase-good"],
  );
});
check("Chinese cosine recall differs from strict matching", () => {
  const chineseIndex = createArticleSearchIndex([
    post("cosine", "机器学习算法"),
  ]);
  const result = searchArticles(chineseIndex, "机器学习方法");
  assert.equal(result[0].post.slug, "cosine");
  assert.equal(result[0].exact, false);
  assert(result[0].similarity > 0 && result[0].similarity <= 1.0000001);
  assert.equal(searchArticles(chineseIndex, "机器学习方法", "exact").length, 0);
});
check("unrelated and mostly unknown queries return no matches", () => {
  assert.equal(searchArticles(index, "绝无此词飞船").length, 0);
  assert.equal(
    searchArticles(index, "Python AbsentOne AbsentTwo AbsentThree").length,
    0,
  );
  assert.equal(searchArticles(index, "% _ ***").length, 0);
});
check("category filter and empty-query recency", () => {
  assert.deepEqual(
    searchArticles(index, "", "relevance", "人工智能").map(
      (result) => result.post.slug,
    ),
    ["ml"],
  );
  assert.equal(searchArticles(index, "")[0].post.slug, "body-only");
  assert.equal(searchArticles(index, "Python", "exact", "人工智能").length, 0);
  assert.equal(
    searchArticles(createArticleSearchIndex([]), "Python").length,
    0,
  );
});
check("body hits produce a contextual snippet", () => {
  const result = searchArticles(index, "VulkanSwapchainNeedle")[0];
  assert(result.snippet.includes("VulkanSwapchainNeedle"));
  assert(result.snippet.startsWith("…"));
  assert(result.snippet.length <= 157);
});
check("highlight stays plain text and respects word boundaries", () => {
  const parts = highlightSearchText("<script>Java & JavaScript</script>", [
    "java",
  ]);
  assert.equal(
    parts.map((part) => part.text).join(""),
    "<script>Java & JavaScript</script>",
  );
  assert.deepEqual(
    parts.filter((part) => part.highlighted).map((part) => part.text),
    ["Java"],
  );
  assert.equal(
    highlightSearchText("C++ and C#", ["c++", "c#"]).filter(
      (part) => part.highlighted,
    ).length,
    2,
  );
});
check(
  "real static corpus: publication isolation and practical query latency",
  () => {
    const corpusPath =
      process.env.SEARCH_TEST_ARTICLES_PATH ??
      new URL("../public/data/articles.json", import.meta.url);
    const payload = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
    const realPosts = (Array.isArray(payload) ? payload : payload.items).map(
      (item) => ({ ...item, body: item.body ?? [], tags: item.tags ?? [] }),
    );
    const started = performance.now();
    const realIndex = createArticleSearchIndex(realPosts);
    const built = performance.now();
    for (const query of [
      "Python Windows",
      "机器学习",
      "React",
      "Cloudflare 静态",
      "共轴 圆筒",
      "Java",
      "不存在的飞船词组",
    ]) {
      const results = searchArticles(realIndex, query);
      assert(
        results.every(
          (result) =>
            (!result.post.status || result.post.status === "published") &&
            !result.post.deletedAt,
        ),
      );
    }
    const ended = performance.now();
    assert(ended - built < 2000, `Seven queries took ${ended - built}ms`);
    console.log(
      `  ${realIndex.articles.length} published articles, index ${(built - started).toFixed(1)}ms, seven queries ${(ended - built).toFixed(1)}ms`,
    );
  },
);
console.log(`Search checks passed: ${checks}.`);
