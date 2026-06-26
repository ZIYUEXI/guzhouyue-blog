# scripts/audit-theme-vars.mjs

> 源路径：`scripts/audit-theme-vars.mjs`
> 总行数：约 101 行

构建/测试前置脚本：扫描 `src/styles.css`、`src/siteSettings.ts`、`index.html`，确保每个"风格预设 × 配色"组合都存在完整的 `:root` 主题块和首页背景变量。

## 文件概览

`audit-theme-vars.mjs` 是 `package.json` 的 `build` 和 `test:theme` 脚本调用的 Node.js 脚本：

```json
"build": "node scripts/audit-theme-vars.mjs && tsc --noEmit && vite build",
"test:theme": "node scripts/audit-theme-vars.mjs"
```

它在 `vite build` 之前跑，目的是把"漏定义主题变量"这种**编译期发现不了、运行时才会让某个配色下页面白屏**的 bug 提前到构建失败。问题场景例如：

- `src/siteSettings.ts` 里加了新的 `stylePresets`（比如 `"cyber"`），但 `src/styles.css` 里忘了给 `[data-style-preset="cyber"]` 写 `:root` 块。
- `index.html` 的内联脚本里没把新预设加进 `stylePresets` 集合，导致首屏 fallback 不正确。
- 某个 `:root` 块缺了首页背景变量（如 `--home-mist`），导致首页 hero 区域在该配色下背景丢失。

任何一项失败，脚本会 `process.exit(1)`，让 build 中止。

## 输入与必需变量

```javascript
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
```

脚本依赖三个文件：

- **`src/styles.css`**：所有 `:root { ... }` 主题块的定义源。
- **`src/siteSettings.ts`**：导出 `stylePresets` 数组（所有可用的风格预设）。
- **`index.html`**：内联脚本里有 `stylePresets` 集合，用于首屏防止主题闪烁。

`requiredHomeVariables` 是首页 hero 视觉效果依赖的 5 个变量，每个配色都必须定义。

## 读取数组/Set 字面量

```javascript
function readArrayLiteralValues(source, declarationName) {
  const match = source.match(new RegExp(`const\\s+${declarationName}\\s*=\\s*\\[([^\\]]+)\\]`));
  if (!match) {
    return [];
  }
  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g), (item) => item[1]);
}

function readSetValues(source, declarationName) {
  const match = source.match(new RegExp(`const\\s+${declarationName}\\s*=\\s*new\\s+Set\\(\\[([^\\]]+)\\]\\)`));
  ...
}
```

通过正则把 `const stylePresets = ['classic', 'cyber']`（数组）或 `const stylePresets = new Set(['classic', 'cyber'])`（Set）解析成字符串数组。这是项目特有的"轻量级 AST 解析"——不引入 TypeScript compiler，只匹配项目里实际的代码模式。

## 解析 :root 块

```javascript
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
```

把 `:root[data-style-preset="cyber"][data-color-scheme="dark"] { ... }` 这种声明切成 `{ selector, variables }`：

- `selector` 是 `:root` 后面的属性选择器（空字符串表示经典配色亮色，即默认 `:root`）。
- `variables` 是该块里定义的所有 `--xxx:` 自定义属性名集合。

## 主题块查找规则

```javascript
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
```

约定：

- **classic / light**：默认 `:root` 块，无属性选择器。
- **其他预设**：必须用 `[data-style-preset="xxx"]` 选择器。
- **暗色**：必须包含 `[data-color-scheme="dark"]`；亮色则**不能**包含（避免误命中带 dark 标签的块）。

这是项目里"主题切换"的全局约定——前端通过给 `<html>` 加 `data-style-preset` / `data-color-scheme` 属性来切换主题，CSS 用属性选择器命中。

## 主校验流程

```javascript
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
```

三类校验：

1. **`stylePresets` 可读**：`src/siteSettings.ts` 必须导出可被正则识别的 `stylePresets` 数组。
2. **`index.html` 与 `siteSettings.ts` 一致**：两边的预设列表必须完全相同，避免首屏 fallback 列表过期。
3. **每个 `preset × colorScheme` 组合都有完整 `:root` 块**：包括必需的 5 个首页背景变量。

任何错误都会被收集到 `errors` 数组，最后统一抛出。

## 失败退出

```javascript
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Theme audit passed for ${stylePresets.length} presets.`);
```

失败时把所有错误一次性打印（不是发现一个就退出），方便开发者一次性看完所有缺失；`process.exit(1)` 让 `npm run build` 直接失败。成功时打印通过预设数量。

## 备注

- 这个脚本是**纯静态扫描**，不会启动浏览器或执行任何 CSS 计算成本高的逻辑，所以速度极快，可以放在 `build` 最前面。
- 想新增一个主题预设：先在 `src/siteSettings.ts` 的 `stylePresets` 数组里加，然后在 `src/styles.css` 加 `light` + `dark` 两个 `:root[data-style-preset="..."]` 块，最后在 `index.html` 的 `stylePresets` Set 里同步加，否则 build 会失败。
- `requiredHomeVariables` 是项目特定的——如果想强制每个主题都有更多变量（例如 `--card-bg`），直接往数组里追加即可。
