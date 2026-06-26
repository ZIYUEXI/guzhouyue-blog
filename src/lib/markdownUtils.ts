export type OutlineItem = {
  id: string;
  lineIndex: number;
  level: number;
  title: string;
  warning?: string;
};

export function normalizeLooseCodeFences(markdown: string) {
  const lines = markdown.split('\n');
  const normalizedLines: string[] = [];
  let index = 0;

  const fencePattern = /^((?:\\`|`){3})\s*([\w-]+)?\s*$/;
  const unescapeFence = (value: string) => value.replace(/\\`/g, '`');

  while (index < lines.length) {
    const openingMatch = lines[index].match(fencePattern);
    const openingLanguage = openingMatch?.[2];

    if (!openingMatch || !openingLanguage) {
      normalizedLines.push(lines[index]);
      index += 1;
      continue;
    }

    const closingIndex = lines.findIndex((line, lineIndex) => {
      if (lineIndex <= index) {
        return false;
      }

      const closingMatch = line.match(fencePattern);
      return Boolean(closingMatch && !closingMatch[2]);
    });

    if (closingIndex < 0) {
      normalizedLines.push(lines[index]);
      index += 1;
      continue;
    }

    normalizedLines.push(`\`\`\`${openingLanguage}`);
    normalizedLines.push(...lines.slice(index + 1, closingIndex).map(unescapeFence));
    normalizedLines.push('```');
    index = closingIndex + 1;

    let lookaheadIndex = index;
    while (lines[lookaheadIndex] === '') {
      lookaheadIndex += 1;
    }

    const nextOpening = lines[lookaheadIndex]?.match(fencePattern);
    if (nextOpening?.[2]) {
      let nextClosingIndex = lookaheadIndex + 1;
      while (lines[nextClosingIndex] === '') {
        nextClosingIndex += 1;
      }

      const nextClosing = lines[nextClosingIndex]?.match(fencePattern);
      if (nextClosing && !nextClosing[2]) {
        index = nextClosingIndex + 1;
      }
    }
  }

  return normalizedLines.join('\n');
}

export function getMarkdownOutline(markdown: string): OutlineItem[] {
  let previousLevel = 1;

  return markdown.split('\n').reduce<OutlineItem[]>((items, line, lineIndex) => {
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (!headingMatch) {
      return items;
    }

    const level = headingMatch[1].length;
    const title = headingMatch[2].replace(/[#\s]+$/g, '').trim() || '未命名标题';
    const warning = level > previousLevel + 1 ? `标题层级从 H${previousLevel} 跳到 H${level}` : undefined;
    previousLevel = level;

    items.push({
      id: `heading-${lineIndex}`,
      lineIndex,
      level,
      title,
      warning,
    });

    return items;
  }, []);
}

function getHeadingBlockRange(lines: string[], headingLineIndex: number) {
  const headingMatch = lines[headingLineIndex]?.match(/^(#{2,6})\s+/);
  if (!headingMatch) {
    return null;
  }

  const level = headingMatch[1].length;
  let endIndex = lines.length;

  for (let index = headingLineIndex + 1; index < lines.length; index += 1) {
    const nextHeadingMatch = lines[index].match(/^(#{2,6})\s+/);
    if (nextHeadingMatch && nextHeadingMatch[1].length <= level) {
      endIndex = index;
      break;
    }
  }

  return { endIndex, level, startIndex: headingLineIndex };
}

export function moveMarkdownHeadingBlock(markdown: string, sourceLineIndex: number, targetLineIndex: number) {
  if (sourceLineIndex === targetLineIndex) {
    return markdown;
  }

  const lines = markdown.split('\n');
  const sourceRange = getHeadingBlockRange(lines, sourceLineIndex);
  const targetRange = getHeadingBlockRange(lines, targetLineIndex);
  if (!sourceRange || !targetRange) {
    return markdown;
  }

  const block = lines.slice(sourceRange.startIndex, sourceRange.endIndex);
  const withoutBlock = [
    ...lines.slice(0, sourceRange.startIndex),
    ...lines.slice(sourceRange.endIndex),
  ];
  const adjustedTargetIndex =
    targetRange.startIndex > sourceRange.startIndex
      ? Math.max(targetRange.startIndex - block.length, 0)
      : targetRange.startIndex;

  return [
    ...withoutBlock.slice(0, adjustedTargetIndex),
    ...block,
    ...withoutBlock.slice(adjustedTargetIndex),
  ].join('\n');
}

export function getLineStartOffset(markdown: string, lineIndex: number) {
  if (lineIndex <= 0) {
    return 0;
  }

  return markdown
    .split('\n')
    .slice(0, lineIndex)
    .reduce((offset, line) => offset + line.length + 1, 0);
}

export function decodeHashAnchor(hash: string) {
  const raw = hash.replace(/^#/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function calculateReadingMinutes(markdown: string) {
  const chineseCharacters = (markdown.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latinWords = markdown.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil((chineseCharacters + latinWords) / 420));
}
