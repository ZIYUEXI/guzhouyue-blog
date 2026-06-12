import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const stylesPath = path.join(rootDir, 'src', 'styles.css');
const settingsPath = path.join(rootDir, 'src', 'siteSettings.ts');
const indexPath = path.join(rootDir, 'index.html');

const styles = fs.readFileSync(stylesPath, 'utf8');
const settings = fs.readFileSync(settingsPath, 'utf8');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const requiredHomeVariables = [
  '--home-mist',
  '--home-ink-wash',
  '--home-ink-thread',
  '--home-moon-glow',
  '--home-paper-speck',
];

function readArrayLiteralValues(source, declarationName) {
  const match = source.match(new RegExp(`const\\s+${declarationName}\\s*=\\s*\\[([^\\]]+)\\]`));
  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g), (item) => item[1]);
}

function readSetValues(source, declarationName) {
  const match = source.match(new RegExp(`const\\s+${declarationName}\\s*=\\s*new\\s+Set\\(\\[([^\\]]+)\\]\\)`));
  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g), (item) => item[1]);
}

function readRootBlocks(source) {
  const blocks = [];
  const blockPattern = /:root(?<selector>[^{]*)\{(?<body>[^}]+)\}/g;
  let match;

  while ((match = blockPattern.exec(source)) !== null) {
    const selector = match.groups.selector.trim();
    const variables = new Set(Array.from(match.groups.body.matchAll(/(--[\w-]+)\s*:/g), (item) => item[1]));
    blocks.push({ selector, variables });
  }

  return blocks;
}

function findThemeBlock(blocks, preset, colorScheme) {
  if (preset === 'classic' && colorScheme === 'light') {
    return blocks.find((block) => block.selector === '');
  }

  return blocks.find((block) => {
    const hasPreset = preset === 'classic' || block.selector.includes(`data-style-preset="${preset}"`);
    const hasColorScheme =
      colorScheme === 'light'
        ? !block.selector.includes('data-color-scheme="dark"')
        : block.selector.includes('data-color-scheme="dark"');
    return hasPreset && hasColorScheme;
  });
}

const stylePresets = readArrayLiteralValues(settings, 'stylePresets');
const indexStylePresets = readSetValues(indexHtml, 'stylePresets');
const blocks = readRootBlocks(styles);
const errors = [];

if (stylePresets.length === 0) {
  errors.push('src/siteSettings.ts does not expose a readable stylePresets declaration.');
}

if (indexStylePresets.join(',') !== stylePresets.join(',')) {
  errors.push(`index.html stylePresets (${indexStylePresets.join(',')}) does not match src/siteSettings.ts (${stylePresets.join(',')}).`);
}

for (const preset of stylePresets) {
  for (const colorScheme of ['light', 'dark']) {
    const block = findThemeBlock(blocks, preset, colorScheme);
    if (!block) {
      errors.push(`Missing CSS :root theme block for ${preset}/${colorScheme}.`);
      continue;
    }

    const missingHomeVariables = requiredHomeVariables.filter((variable) => !block.variables.has(variable));
    if (missingHomeVariables.length > 0) {
      errors.push(`${preset}/${colorScheme} is missing homepage background variables: ${missingHomeVariables.join(', ')}.`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Theme audit passed for ${stylePresets.length} presets.`);
