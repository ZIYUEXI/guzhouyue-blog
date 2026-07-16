import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { JSX as ReactJSX } from 'react';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  $isCodeBlockNode,
  $createCodeBlockNode,
  CodeBlockNode,
  activeEditor$,
  addComposerChild$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  codeBlockLanguages$,
  codeBlockPlugin,
  codeMirrorPlugin,
  editorInFocus$,
  getCodeBlockLanguageSelectData,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  realmPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type LexicalVisitor,
  type MdastImportVisitor,
  type CodeBlockLanguage,
} from '@mdxeditor/editor';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { useCellValues } from '@mdxeditor/gurx';
import {
  $getNodeByKey,
  DecoratorNode,
  type ElementNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical';
import type { ElementTransformer } from '@lexical/markdown';
import { Image as ImageIcon, Sigma, Trash2 } from 'lucide-react';
import katex from 'katex';
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math';
import { math as micromarkMath } from 'micromark-extension-math';
import '@mdxeditor/editor/style.css';

type FormulaMode = 'block' | 'inline';

type MathMdastNode = {
  type: 'math' | 'inlineMath';
  value: string;
  meta?: string | null;
};

type SerializedFormulaNode = SerializedLexicalNode & {
  formula: string;
  formulaMode: FormulaMode;
};

type FormulaEditorProps = {
  formula: string;
  mode: FormulaMode;
  nodeKey: NodeKey;
  parentEditor: LexicalEditor;
};

export type RichMarkdownEditorHandle = {
  focus: () => void;
  insertMarkdown: (markdown: string) => void;
  setMarkdown: (markdown: string) => void;
};

type RichMarkdownEditorProps = {
  markdown: string;
  onChange: (markdown: string, initialNormalize: boolean) => void;
  onInsertFormula: () => void;
  onInsertGalleryImage: () => void;
};

function renderFormulaHtml(formula: string, mode: FormulaMode) {
  try {
    return katex.renderToString(formula || ' ', {
      displayMode: mode === 'block',
      output: 'htmlAndMathml',
      throwOnError: false,
    });
  } catch {
    return escapeHtml(formula);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function FormulaEditor({ formula, mode, nodeKey, parentEditor }: FormulaEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formula);

  useEffect(() => {
    setValue(formula);
  }, [formula]);

  function updateFormula(nextValue: string) {
    const normalizedValue = nextValue.trim() || 'E = mc^2';
    parentEditor.update(() => {
      const lexicalNode = $getNodeByKey(nodeKey);
      if ($isFormulaNode(lexicalNode)) {
        lexicalNode.setFormula(normalizedValue);
      }
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <span className={`wysiwyg-formula-editor ${mode === 'block' ? 'is-block' : 'is-inline'}`}>
        <textarea
          autoFocus
          onBlur={() => updateFormula(value)}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              updateFormula(value);
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(false);
              setValue(formula);
            }
          }}
          rows={mode === 'block' ? 4 : 1}
          spellCheck={false}
          value={value}
        />
      </span>
    );
  }

  return (
    <button
      className={`wysiwyg-formula-node ${mode === 'block' ? 'is-block' : 'is-inline'}`}
      onClick={() => setEditing(true)}
      title="点击编辑公式"
      type="button"
    >
      <span dangerouslySetInnerHTML={{ __html: renderFormulaHtml(formula, mode) }} />
    </button>
  );
}

class FormulaNode extends DecoratorNode<ReactJSX.Element> {
  __formula: string;
  __formulaMode: FormulaMode;

  static getType() {
    return 'formula';
  }

  static clone(node: FormulaNode) {
    return new FormulaNode(node.__formula, node.__formulaMode, node.__key);
  }

  static importJSON(serializedNode: SerializedFormulaNode) {
    return $createFormulaNode(serializedNode.formula, serializedNode.formulaMode);
  }

  constructor(formula: string, formulaMode: FormulaMode, key?: NodeKey) {
    super(key);
    this.__formula = formula;
    this.__formulaMode = formulaMode;
  }

  exportJSON(): SerializedFormulaNode {
    return {
      formula: this.__formula,
      formulaMode: this.__formulaMode,
      type: 'formula',
      version: 1,
    };
  }

  createDOM(_config: EditorConfig) {
    return document.createElement(this.__formulaMode === 'block' ? 'div' : 'span');
  }

  updateDOM() {
    return false;
  }

  getFormula() {
    return this.__formula;
  }

  getFormulaMode() {
    return this.__formulaMode;
  }

  setFormula(nextFormula: string) {
    const writable = this.getWritable();
    writable.__formula = nextFormula;
  }

  decorate(parentEditor: LexicalEditor) {
    return (
      <FormulaEditor
        formula={this.__formula}
        mode={this.__formulaMode}
        nodeKey={this.getKey()}
        parentEditor={parentEditor}
      />
    );
  }

  isInline() {
    return this.__formulaMode === 'inline';
  }
}

function $createFormulaNode(formula: string, formulaMode: FormulaMode) {
  return new FormulaNode(formula, formulaMode);
}

function $isFormulaNode(node: LexicalNode | null | undefined): node is FormulaNode {
  return node instanceof FormulaNode;
}

const MdastFormulaVisitor: MdastImportVisitor<MathMdastNode> = {
  testNode: (node) => node.type === 'math' || node.type === 'inlineMath',
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(
      $createFormulaNode(mdastNode.value, mdastNode.type === 'math' ? 'block' : 'inline'),
    );
  },
};

const FormulaVisitor: LexicalVisitor & {
  testLexicalNode: (node: LexicalNode | null | undefined) => node is FormulaNode;
} = {
  testLexicalNode: $isFormulaNode,
  visitLexicalNode({ lexicalNode, actions }) {
    const formulaNode = lexicalNode as FormulaNode;
    actions.addAndStepInto(
      formulaNode.getFormulaMode() === 'block' ? 'math' : 'inlineMath',
      {
        value: formulaNode.getFormula(),
        ...(formulaNode.getFormulaMode() === 'block' ? { meta: null } : {}),
      },
      false,
    );
  },
};

const mathPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: micromarkMath(),
      [addMdastExtension$]: mathFromMarkdown(),
      [addToMarkdownExtension$]: mathToMarkdown(),
      [addLexicalNode$]: FormulaNode,
      [addImportVisitor$]: MdastFormulaVisitor,
      [addExportVisitor$]: FormulaVisitor,
    });
  },
});

const SPACED_CODE_FENCE: ElementTransformer = {
  dependencies: [CodeBlockNode],
  export: () => null,
  regExp: /^[ \t]*```\s*(?:\{([^\s{}]+)\}|([^\s{}]+))?\s$/,
  replace: (parentNode: ElementNode, _children: LexicalNode[], match: string[]) => {
    parentNode.replace($createCodeBlockNode({ code: '', language: match[1] ?? match[2] ?? '', meta: '' }));
  },
  type: 'element',
};

const codeBlockLanguages: CodeBlockLanguage[] = [
  { name: 'Bash / Shell', alias: ['bash', 'sh', 'shell', 'zsh'], extensions: ['sh', 'bash', 'zsh'] },
  { name: 'C#', alias: ['csharp', 'cs', 'c#'], extensions: ['cs'] },
  { name: 'C++', alias: ['cpp', 'c++', 'cc', 'cxx'], extensions: ['cpp', 'c++', 'cc', 'cxx', 'hpp'] },
  { name: 'CSS', alias: ['css'], extensions: ['css'] },
  { name: 'Go', alias: ['go'], extensions: ['go'] },
  { name: 'HTML', alias: ['html'], extensions: ['html', 'htm'] },
  { name: 'Java', alias: ['java'], extensions: ['java'] },
  { name: 'JavaScript', alias: ['js', 'javascript'], extensions: ['js', 'mjs', 'cjs'] },
  { name: 'JSON', alias: ['json'], extensions: ['json'] },
  { name: 'JSX', alias: ['jsx'], extensions: ['jsx'] },
  { name: 'Markdown', alias: ['markdown', 'md'], extensions: ['md', 'markdown'] },
  { name: 'Python', alias: ['python', 'py'], extensions: ['py'] },
  { name: 'Rust', alias: ['rust', 'rs'], extensions: ['rs'] },
  { name: 'TypeScript', alias: ['ts', 'typescript'], extensions: ['ts'] },
  { name: 'TSX', alias: ['tsx'], extensions: ['tsx'] },
];

const spacedCodeFenceShortcutPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addComposerChild$]: () => <MarkdownShortcutPlugin transformers={[SPACED_CODE_FENCE]} />,
    });
  },
});

function normalizeCodeFenceShortcut(markdownValue: string) {
  const parsedFence = parseCodeFenceShortcut(markdownValue);
  if (!parsedFence) {
    return markdownValue;
  }

  return `\`\`\`${parsedFence.language}\n${parsedFence.code}\n\`\`\``;
}

function shouldImportAsCodeFenceMarkdown(markdownValue: string) {
  return parseCodeFenceShortcut(markdownValue) !== null;
}

function parseCodeFenceShortcut(markdownValue: string) {
  const normalizedValue = markdownValue.trim().replace(/\\+`/g, '`');
  const match = normalizedValue.match(/^```\s*(?:\{([^\s{}]+)\}|([^\s{}]+))?\s*\r?\n([\s\S]*?)\r?\n```$/);
  if (!match) {
    return null;
  }

  const codeLines = match[3].replace(/\r\n/g, '\n').split('\n');
  if (codeLines.some((line) => line.trim() === '```')) {
    return null;
  }

  while (codeLines[0]?.trim() === '') {
    codeLines.shift();
  }
  while (codeLines[codeLines.length - 1]?.trim() === '') {
    codeLines.pop();
  }

  return {
    code: codeLines.join('\n'),
    language: match[1] ?? match[2] ?? '',
  };
}

function NativeCodeBlockToolbar() {
  const [editorInFocus, activeEditor, codeBlockLanguages] = useCellValues(
    editorInFocus$,
    activeEditor$,
    codeBlockLanguages$,
  );
  const codeBlockNode = $isCodeBlockNode(editorInFocus?.rootNode) ? editorInFocus.rootNode : null;
  if (!codeBlockNode) {
    return null;
  }

  const { value, items } = getCodeBlockLanguageSelectData(codeBlockLanguages, codeBlockNode.getLanguage());

  return (
    <div className="mdx-native-code-tools">
      <label className="mdx-native-code-language">
        <span>代码语言</span>
        <select
          aria-label="代码块语言"
          onChange={(event) => {
            const nextLanguage = event.target.value;
            activeEditor?.update(() => {
              codeBlockNode.setLanguage(nextLanguage);
              window.setTimeout(() => {
                activeEditor.update(() => {
                  codeBlockNode.getLatest().select();
                });
              });
            });
          }}
          value={value}
        >
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="mdx-native-code-delete"
        onClick={() => {
          activeEditor?.update(() => {
            codeBlockNode.remove();
          });
        }}
        title="删除代码块"
        type="button"
      >
        <Trash2 size={16} />
        <span>删除</span>
      </button>
    </div>
  );
}

export const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor({ markdown, onChange, onInsertFormula, onInsertGalleryImage }, ref) {
    const editorRef = useRef<MDXEditorMethods>(null);
    const [parseError, setParseError] = useState('');
    const plugins = useMemo(
      () => [
        headingsPlugin(),
        imagePlugin({
          disableImageResize: true,
          disableImageSettingsButton: true,
        }),
        listsPlugin(),
        quotePlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        thematicBreakPlugin(),
        mathPlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: 'ts' }),
        codeMirrorPlugin({
          codeBlockLanguages,
        }),
        spacedCodeFenceShortcutPlugin(),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarClassName: 'mdx-rich-toolbar',
          toolbarContents: () => (
            <ConditionalContents
              options={[
                { when: (editor) => editor?.editorType === 'codeblock', contents: () => <NativeCodeBlockToolbar /> },
                {
                  fallback: () => (
                    <>
                      <UndoRedo />
                      <BlockTypeSelect />
                      <BoldItalicUnderlineToggles />
                      <CodeToggle />
                      <CreateLink />
                      <ListsToggle />
                      <InsertCodeBlock />
                      <InsertTable />
                      <button
                        className="mdx-formula-button"
                        data-toolbar-item="true"
                        onClick={onInsertGalleryImage}
                        title="插入图库图片"
                        type="button"
                      >
                        <ImageIcon size={18} />
                      </button>
                      <button
                        className="mdx-formula-button"
                        data-toolbar-item="true"
                        onClick={onInsertFormula}
                        title="插入数学公式（Cmd/Ctrl + Alt + M）"
                        type="button"
                      >
                        <Sigma size={18} />
                      </button>
                    </>
                  ),
                },
              ]}
            />
          ),
        }),
      ],
      [onInsertFormula, onInsertGalleryImage],
    );

    useImperativeHandle(ref, () => ({
      focus() {
        editorRef.current?.focus();
      },
      insertMarkdown(markdownValue: string) {
        editorRef.current?.insertMarkdown(markdownValue);
      },
      setMarkdown(markdownValue: string) {
        editorRef.current?.setMarkdown(markdownValue);
      },
    }));

    return (
      <>
        {parseError && (
          <div className="typora-rich-error" role="alert">
            {parseError}
          </div>
        )}
        <div
          onPasteCapture={(event) => {
            const pastedMarkdown = event.clipboardData.getData('text/plain');
            if (!shouldImportAsCodeFenceMarkdown(pastedMarkdown)) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            editorRef.current?.insertMarkdown(normalizeCodeFenceShortcut(pastedMarkdown.trim()));
            editorRef.current?.focus();
          }}
        >
          <MDXEditor
            className="typora-rich-editor"
            contentEditableClassName="typora-rich-content"
            markdown={markdown}
            onChange={(nextMarkdown, initialNormalize) => {
              setParseError('');
              onChange(nextMarkdown, initialNormalize);
            }}
            onError={(payload) => setParseError(payload.error)}
            plugins={plugins}
            ref={editorRef}
            spellCheck={false}
            suppressHtmlProcessing
          />
        </div>
      </>
    );
  },
);
