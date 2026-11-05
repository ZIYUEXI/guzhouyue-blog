import { memo, isValidElement, useEffect, useId, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
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

type MermaidDiagramProps = {
  chart: string;
};

let mermaidRenderSequence = 0;
let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null;

export const MarkdownBody = memo(function MarkdownBody({ markdown, passageAnchors = [] }: MarkdownBodyProps) {
  const headingAnchors = createHeadingAnchorQueue(markdown);
  const blockAnchorResolver = createBlockAnchorResolver(passageAnchors);
  const markdownComponents: Components = {
    h1: createHeadingComponent('h1', headingAnchors),
    h2: createHeadingComponent('h2', headingAnchors),
    h3: createHeadingComponent('h3', headingAnchors),
    h4: createHeadingComponent('h4', headingAnchors),
    p: createBlockComponent('p', blockAnchorResolver),
    blockquote: createBlockComponent('blockquote', blockAnchorResolver),
    ul: createBlockComponent('ul', blockAnchorResolver),
    ol: createBlockComponent('ol', blockAnchorResolver),
    // Mermaid 代码块需要脱离 <pre>，否则 SVG 会被代码块样式限制。
    pre: createPreComponent(blockAnchorResolver),
    code: renderMarkdownCode,
  };

  return (
    <div className="article-body">
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { plainText: ['mermaid', 'mmd'] }]]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
});

function renderMarkdownCode({ className, children }: { className?: string; children?: ReactNode }) {
  const language = className?.match(/(?:^|\s)language-([^\s]+)/i)?.[1]?.toLowerCase();
  const code = getNodeText(children).replace(/\n$/, '');

  if (language === 'mermaid' || language === 'mmd') {
    return <MermaidDiagram chart={code} />;
  }

  return <code className={className}>{children}</code>;
}

function createPreComponent(resolveAnchor: (text: string) => string | undefined) {
  return function Pre({ children }: { children?: ReactNode }) {
    const anchor = resolveAnchor(getNodeText(children));
    const mermaidDiagram = findMermaidDiagram(children);
    if (mermaidDiagram) {
      // 去掉 Markdown 代码块外壳，避免通用 code 样式影响 SVG 图表布局。
      return (
        <div id={anchor} className="mermaid-block">
          {mermaidDiagram}
        </div>
      );
    }

    return <pre id={anchor}>{children}</pre>;
  };
}

function findMermaidDiagram(node: ReactNode): ReactNode | null {
  if (isValidElement(node)) {
    if (node.type === MermaidDiagram) {
      return node;
    }
    // React 此时还没有执行 code 组件，需要从代码元素属性识别语言。
    const props = node.props as { className?: string; children?: ReactNode };
    if (/(?:^|\s)language-(?:mermaid|mmd)(?:\s|$)/i.test(props.className ?? '')) {
      return <MermaidDiagram chart={getNodeText(props.children).replace(/\n$/, '')} />;
    }
    return findMermaidDiagram(props.children);
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const diagram = findMermaidDiagram(child);
      if (diagram) {
        return diagram;
      }
    }
  }
  return null;
}

function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const stableId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [colorScheme, setColorScheme] = useState(() => getColorScheme());

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const observer = new MutationObserver(() => setColorScheme(getColorScheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-scheme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const renderId = `mermaid-${stableId}-${++mermaidRenderSequence}`;

    // 使用严格安全模式，避免文章内容中的 Mermaid 标签执行任意 HTML 或脚本。
    setSvg('');
    setError('');
    void loadMermaid()
      .then(async ({ default: mermaid }) => {
        if (cancelled) {
          return;
        }
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          ...getMermaidTheme(),
        });
        // 先校验语法，避免 Mermaid 把报错 SVG 遗留在整页 body 中。
        await mermaid.parse(chart);
        if (cancelled) {
          return;
        }
        return mermaid.render(renderId, chart);
      })
      .then((result) => {
        if (!cancelled && result) {
          setSvg(result.svg);
        }
      })
      .catch((renderError: unknown) => {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'Mermaid 语法解析失败。');
        }
      })
      .finally(() => {
        // 布局等非语法错误同样需要清理 Mermaid 创建的临时容器。
        document.getElementById(`d${renderId}`)?.remove();
      });

    return () => {
      cancelled = true;
    };
  }, [chart, colorScheme, stableId]);

  if (error) {
    return (
      <div className="mermaid-error" role="alert">
        <strong>流程图无法渲染</strong>
        <span>{error}</span>
        <pre>{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="mermaid-loading" aria-label="流程图加载中">流程图加载中…</div>;
  }

  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function loadMermaid() {
  return (mermaidModulePromise ??= import('mermaid'));
}

function getColorScheme() {
  return typeof document !== 'undefined' && document.documentElement.dataset.colorScheme === 'dark' ? 'dark' : 'light';
}
function getMermaidTheme() {
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.colorScheme === 'dark';
  return {
    theme: 'base' as const,
    themeVariables: isDark
      ? {
          primaryColor: '#263b45',
          primaryTextColor: '#f4efe5',
          primaryBorderColor: '#79c7c5',
          lineColor: '#b8d8d8',
          secondaryColor: '#3a3040',
          tertiaryColor: '#26352f',
          clusterBkg: '#182329',
          clusterBorder: '#79c7c5',
          edgeLabelBackground: '#182329',
        }
      : {
          primaryColor: '#edf5f3',
          primaryTextColor: '#20302f',
          primaryBorderColor: '#438b87',
          lineColor: '#526b6a',
          secondaryColor: '#f8eee7',
          tertiaryColor: '#f0f4e9',
          clusterBkg: '#f6f8f2',
          clusterBorder: '#438b87',
          edgeLabelBackground: '#fffdf8',
        },
  };
}

function createBlockComponent(Tag: 'p' | 'blockquote' | 'ul' | 'ol', resolveAnchor: (text: string) => string | undefined) {
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
