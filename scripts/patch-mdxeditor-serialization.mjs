import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const editorDirectory = resolve(scriptDirectory, '../node_modules/@mdxeditor/editor/dist');

function patchFile(fileName, patch) {
  const filePath = resolve(editorDirectory, fileName);
  const source = readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const nextSource = patch(source);

  if (nextSource === source) {
    return;
  }

  writeFileSync(filePath, nextSource);
}

function replaceOnce(source, search, replacement, fileName) {
  if (!source.includes(search)) {
    throw new Error(`Cannot apply the MDXEditor performance patch to ${fileName}. Check the installed editor version.`);
  }

  return source.replace(search, replacement);
}

patchFile('MDXEditor.js', (source) => {
  if (source.includes('__mdxeditorFlushMarkdownSerialization')) {
    return source;
  }

  let nextSource = replaceOnce(
    source,
    'lexicalEditorNamespace: props.lexicalEditorNamespace ?? "MDXEditor"\n',
    'lexicalEditorNamespace: props.lexicalEditorNamespace ?? "MDXEditor",\n          markdownSerializationDelay: props.markdownSerializationDelay ?? 0\n',
    'MDXEditor.js',
  );
  nextSource = replaceOnce(
    nextSource,
    'getMarkdown: () => {\n          const viewMode = realm.getValue(viewMode$);',
    'getMarkdown: () => {\n          realm.getValue(rootEditor$)?.__mdxeditorFlushMarkdownSerialization?.();\n          const viewMode = realm.getValue(viewMode$);',
    'MDXEditor.js',
  );
  return nextSource;
});

patchFile('index.d.ts', (source) => {
  if (source.includes('markdownSerializationDelay?: number;')) {
    return source;
  }

  return replaceOnce(
    source,
    '    lexicalEditorNamespace?: string;\n}',
    '    lexicalEditorNamespace?: string;\n    /** Delay full-document Markdown serialization after edits. */\n    markdownSerializationDelay?: number;\n}',
    'index.d.ts',
  );
});

patchFile('plugins/core/index.js', (source) => {
  const originalHandler = `    // Export handler
    (rootEditor) => {
      return rootEditor.registerUpdateListener(({ dirtyElements, dirtyLeaves, editorState }) => {
        const err = r.getValue(markdownProcessingError$);
        if (err !== null) {
          return;
        }
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
          return;
        }
        let theNewMarkdownValue;
        editorState.read(() => {
          const lastChild = $getRoot().getLastChild();
          if (lastChild instanceof DecoratorNode) {
            rootEditor.update(
              () => {
                $getRoot().append($createParagraphNode());
              },
              { discrete: true }
            );
          }
          theNewMarkdownValue = exportMarkdownFromLexical({
            root: $getRoot(),
            visitors: r.getValue(exportVisitors$),
            jsxComponentDescriptors: r.getValue(jsxComponentDescriptors$),
            toMarkdownExtensions: r.getValue(toMarkdownExtensions$),
            toMarkdownOptions: r.getValue(toMarkdownOptions$),
            jsxIsAvailable: r.getValue(jsxIsAvailable$)
          });
        });
        r.pub(markdown$, theNewMarkdownValue.trim());
        r.pub(initialMarkdownNormalize$, false);
      });
    },`;
  const patchedHandler = `    // Export handler
    (rootEditor) => {
      let markdownExportTimeout = null;
      let hasPendingMarkdownExport = false;
      const serializeMarkdown = () => {
        if (markdownExportTimeout !== null) {
          clearTimeout(markdownExportTimeout);
          markdownExportTimeout = null;
        }
        if (!hasPendingMarkdownExport) {
          return;
        }
        hasPendingMarkdownExport = false;
        const err = r.getValue(markdownProcessingError$);
        if (err !== null) {
          return;
        }
        let theNewMarkdownValue;
        rootEditor.getEditorState().read(() => {
          const lastChild = $getRoot().getLastChild();
          if (lastChild instanceof DecoratorNode) {
            rootEditor.update(
              () => {
                $getRoot().append($createParagraphNode());
              },
              { discrete: true }
            );
          }
          theNewMarkdownValue = exportMarkdownFromLexical({
            root: $getRoot(),
            visitors: r.getValue(exportVisitors$),
            jsxComponentDescriptors: r.getValue(jsxComponentDescriptors$),
            toMarkdownExtensions: r.getValue(toMarkdownExtensions$),
            toMarkdownOptions: r.getValue(toMarkdownOptions$),
            jsxIsAvailable: r.getValue(jsxIsAvailable$)
          });
        });
        r.pub(markdown$, theNewMarkdownValue.trim());
        r.pub(initialMarkdownNormalize$, false);
      };
      rootEditor.__mdxeditorFlushMarkdownSerialization = serializeMarkdown;
      const unregister = rootEditor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (r.getValue(muteChange$) || dirtyElements.size === 0 && dirtyLeaves.size === 0) {
          return;
        }
        hasPendingMarkdownExport = true;
        const delay = r.getValue(markdownSerializationDelay$);
        if (delay > 0) {
          if (markdownExportTimeout !== null) {
            clearTimeout(markdownExportTimeout);
          }
          markdownExportTimeout = setTimeout(serializeMarkdown, delay);
          return;
        }
        serializeMarkdown();
      });
      return () => {
        unregister();
        if (markdownExportTimeout !== null) {
          clearTimeout(markdownExportTimeout);
        }
        delete rootEditor.__mdxeditorFlushMarkdownSerialization;
      };
    },`;

  let nextSource = source;
  if (!nextSource.includes('__mdxeditorFlushMarkdownSerialization')) {
    nextSource = replaceOnce(nextSource, originalHandler, patchedHandler, 'plugins/core/index.js');
  }

  if (!nextSource.includes('const markdownSerializationDelay$ = Cell(0);')) {
    nextSource = replaceOnce(
      nextSource,
      'const markdown$ = Cell("");',
      'const markdown$ = Cell("");\nconst markdownSerializationDelay$ = Cell(0);',
      'plugins/core/index.js',
    );
  }

  if (!nextSource.includes('[markdownSerializationDelay$]: params?.markdownSerializationDelay ?? 0,')) {
    nextSource = replaceOnce(
      nextSource,
      '[initialMarkdown$]: (params == null ? void 0 : params.trim) ? initialMarkdown.trim() : initialMarkdown,',
      '[initialMarkdown$]: (params == null ? void 0 : params.trim) ? initialMarkdown.trim() : initialMarkdown,\n      [markdownSerializationDelay$]: params?.markdownSerializationDelay ?? 0,',
      'plugins/core/index.js',
    );
  }

  return nextSource.replace(
    'const delay = params?.markdownSerializationDelay ?? 0;',
    'const delay = r.getValue(markdownSerializationDelay$);',
  );
});
