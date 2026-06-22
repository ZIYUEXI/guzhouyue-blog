import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { JSX as ReactJSX } from 'react';
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  CodeToggle,
  ConditionalContents,
  CreateLink,
  InsertCodeBlock,
  InsertTable,
  ListsToggle,
  MDXEditor,
  type MDXEditorMethods,
  UndoRedo,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  codeBlockPlugin,
  codeMirrorPlugin,
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
} from '@mdxeditor/editor';
import {
  $getNodeByKey,
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical';
import { Image as ImageIcon, Sigma } from 'lucide-react';
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
    return formula;
  }
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
          codeBlockLanguages: {
            css: 'CSS',
            html: 'HTML',
            js: 'JavaScript',
            json: 'JSON',
            jsx: 'JSX',
            markdown: 'Markdown',
            python: 'Python',
            sh: 'Shell',
            ts: 'TypeScript',
            tsx: 'TSX',
          },
        }),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarClassName: 'mdx-rich-toolbar',
          toolbarContents: () => (
            <ConditionalContents
              options={[
                { when: (editor) => editor?.editorType === 'codeblock', contents: () => <ChangeCodeMirrorLanguage /> },
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
                        title="插入数学公式"
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
      </>
    );
  },
);
