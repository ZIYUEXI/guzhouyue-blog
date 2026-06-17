import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

export type PassageAnchorTarget = {
  anchor: string;
  text: string;
};

type MarkdownBodyProps = {
  markdown: string;
  passageAnchors?: PassageAnchorTarget[];
};

export function MarkdownBody({ markdown, passageAnchors = [] }: MarkdownBodyProps) {
  const headingAnchors = createHeadingAnchorQueue(markdown);
  const blockAnchorResolver = createBlockAnchorResolver(passageAnchors);
  const headingComponents = {
    h1: createHeadingComponent('h1', headingAnchors),
    h2: createHeadingComponent('h2', headingAnchors),
    h3: createHeadingComponent('h3', headingAnchors),
    h4: createHeadingComponent('h4', headingAnchors),
    p: createBlockComponent('p', blockAnchorResolver),
    blockquote: createBlockComponent('blockquote', blockAnchorResolver),
    ul: createBlockComponent('ul', blockAnchorResolver),
    ol: createBlockComponent('ol', blockAnchorResolver),
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

function createBlockComponent(Tag: 'p' | 'blockquote' | 'ul' | 'ol' | 'pre', resolveAnchor: (text: string) => string | undefined) {
  return function Block({ children }: { children?: ReactNode }) {
    const anchor = resolveAnchor(getNodeText(children));
    return <Tag id={anchor}>{children}</Tag>;
  };
}

function createHeadingComponent(Tag: 'h1' | 'h2' | 'h3' | 'h4', headingAnchors: Map<string, string[]>) {
  return function Heading({ children }: { children?: ReactNode }) {
    const title = getNodeText(children);
    const key = title || 'section';
    const anchors = headingAnchors.get(key) ?? [`passage-${slugifyHeading(key)}`];
    const anchor = anchors.shift() ?? `passage-${slugifyHeading(key)}`;

    return <Tag id={anchor}>{children}</Tag>;
  };
}

function createHeadingAnchorQueue(markdown: string) {
  const counts = new Map<string, number>();
  const anchors = new Map<string, string[]>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#{1,4}\s+(.+)$/);
    if (!match) {
      continue;
    }
    const title = match[1].trim();
    const baseAnchor = `passage-${slugifyHeading(title || 'section')}`;
    const count = (counts.get(baseAnchor) ?? 0) + 1;
    counts.set(baseAnchor, count);
    const anchor = count === 1 ? baseAnchor : `${baseAnchor}-${count}`;
    anchors.set(title, [...(anchors.get(title) ?? []), anchor]);
  }
  return anchors;
}

function createBlockAnchorResolver(passageAnchors: PassageAnchorTarget[]) {
  const remaining = passageAnchors
    .filter((passage) => passage.anchor.startsWith('passage-id-') && passage.text.trim())
    .map((passage) => ({
      anchor: passage.anchor,
      text: collapseText(passage.text),
    }));

  return function resolveAnchor(blockText: string) {
    const collapsedBlock = collapseText(blockText);
    const index = remaining.findIndex((passage) => passage.text.includes(collapsedBlock) || collapsedBlock.includes(passage.text.slice(0, Math.min(80, passage.text.length))));
    if (index < 0) {
      return undefined;
    }
    const [matched] = remaining.splice(index, 1);
    return matched.anchor;
  };
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).join('');
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return getNodeText(props?.children);
  }
  return '';
}

function slugifyHeading(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'section';
}

function collapseText(value: string) {
  return value.replace(/\s+/g, '');
}
