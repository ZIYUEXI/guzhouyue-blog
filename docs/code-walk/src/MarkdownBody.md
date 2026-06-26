# MarkdownBody

> 源路径：`src/MarkdownBody.tsx`
> 总行数：约 132 行

把 markdown 字符串渲染成带语法高亮、数学公式、GFM 表格的 React 节点，并为标题/段落打上"可定位锚点"的通用渲染组件。

## 文件概览

`MarkdownBody` 是文章详情页和后台预览共用的 markdown 渲染器。它包装了 `react-markdown`，配上四组插件：`remark-gfm`（GitHub Flavored Markdown，支持表格、删除线等）、`remark-math` + `rehype-katex`（LaTeX 数学公式）、`rehype-highlight`（代码块语法高亮，配套 `highlight.js/styles/github-dark.css`），并加载 `katex/dist/katex.min.css` 让公式排版正确。

除了渲染本身，组件还有一个重要职责：给标题（h1-h4）和段落（p/blockquote/ul/ol/pre）注入 `id` 属性，让 `StarfieldPage` 等地方可以通过 `#passage-xxx` 锚点直接定位到原文某段。锚点来源有两个：从 markdown 文本里扫描的标题 slug 队列，和外部传入的 `passageAnchors`（带显式 anchor 与原文匹配的"段落引用"）。

## MarkdownBody 主组件

组件接收 markdown 字符串和可选的 `passageAnchors`（类型 `PassageAnchorTarget[]`，每项是 `{anchor, text}`）。挂载时先用 `createHeadingAnchorQueue` 扫一遍 markdown 行得到"每个标题依次对应的锚点队列"，再用 `createBlockAnchorResolver` 把外部传入的显式 anchor 与块文本匹配上。然后构造一个 `components` 映射，让 react-markdown 在渲染对应标签时调用我们的包装函数。

```tsx
export function MarkdownBody({ markdown, passageAnchors = [] }: MarkdownBodyProps) {
  const headingAnchors = createHeadingAnchorQueue(markdown);
  const blockAnchorResolver = createBlockAnchorResolver(passageAnchors);
  const headingComponents = {
    h1: createHeadingComponent('h1', headingAnchors),
    // ...
    p: createBlockComponent('p', blockAnchorResolver),
    blockquote: createBlockComponent('blockquote', blockAnchorResolver),
    pre: createBlockComponent('pre', blockAnchorResolver),
  };

  return (
    <div className="article-body">
      <ReactMarkdown
        components={headingComponents}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
```

注意 `components` 同时覆盖了标题和段落级元素——这意味着 react-markdown 默认的渲染逻辑被替换，我们自行决定 `id` 怎么来。整体被包在 `<div class="article-body">` 里，这个类名在 `src/styles.css` 中定义文章正文的排版规则。

## 标题锚点队列

`createHeadingAnchorQueue` 是关键：它逐行扫描 markdown，匹配 `^#{1,4}\s+(.+)$`（1-4 级标题），为每个标题生成 `passage-<slug>` 形式的锚点，并按出现顺序维护"同标题文本对应的多个锚点"队列。同名标题第二次出现时锚点加 `-2`、`-3` 等后缀，避免重复。

```ts
function createHeadingAnchorQueue(markdown: string) {
  const counts = new Map<string, number>();
  const anchors = new Map<string, string[]>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,4}\s+(.+)$/);
    if (!match) continue;
    const title = match[1].trim();
    const baseAnchor = `passage-${slugifyHeading(title || 'section')}`;
    const count = (counts.get(baseAnchor) ?? 0) + 1;
    counts.set(baseAnchor, count);
    const anchor = count === 1 ? baseAnchor : `${baseAnchor}-${count}`;
    anchors.set(title, [...(anchors.get(title) ?? []), anchor]);
  }
  return anchors;
}
```

`createHeadingComponent` 返回一个渲染函数，每次拿到一个标题（react-markdown 传 `children`），就从对应队列里 `shift()` 出最早的一个 anchor 用作 `id`，保证渲染顺序与 markdown 中的出现顺序对齐。

## 段落锚点解析器

`createBlockAnchorResolver` 处理外部传入的 `passageAnchors`（这些 anchor 通常以 `passage-id-` 开头，来自后台或星图数据）。它先把待匹配的文本 `collapseText`（去掉所有空白），再为每个被渲染的块（p、blockquote 等）拿 `getNodeText` 抽出文本，做"互相包含"判断——只要块文本或 anchor 文本任一方包含对方较短一截，就算匹配成功。

```ts
return function resolveAnchor(blockText: string) {
  const collapsedBlock = collapseText(blockText);
  const index = remaining.findIndex(
    (passage) => passage.text.includes(collapsedBlock) || collapsedBlock.includes(passage.text.slice(0, Math.min(80, passage.text.length))),
  );
  if (index < 0) return undefined;
  const [matched] = remaining.splice(index, 1);
  return matched.anchor;
};
```

`splice(index, 1)` 是关键设计：每个 anchor 用一次就移除，避免同一段文本被重复锚定到不同位置。这种"消费式匹配"保证星图里的 passageId ↔ 原文段落是稳定的一一对应。

## 辅助函数

`getNodeText` 递归遍历 React 节点（字符串、数字、数组、带 props 的元素）抽出纯文本，用来在标题/段落里拿到不含标签的文本以做 slug 和匹配。`slugifyHeading` 把标题转成 url 友好的 slug：转小写、空白替换成 `-`、保留 `a-z0-9` 和中文（`一-龥`），其他字符删除。这保证中文标题也能生成稳定的 anchor（如 `## 山行散记` → `passage-山行散记`）。

```ts
function slugifyHeading(value: string) {
  const normalized = value
    .trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9一-龥-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'section';
}
```

`collapseText` 把所有空白字符压平成无空白字符串，匹配时对 markdown 内部的换行、多余空格不敏感。
