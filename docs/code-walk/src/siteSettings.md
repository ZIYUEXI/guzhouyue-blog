# siteSettings

> 源路径：`src/siteSettings.ts`
> 总行数：约 104 行

存放站点级的"出厂设置"（博主名、头像、风格预设、配色），并提供读写 `localStorage`、规范化字段、把配置应用到 `<html>` 上的辅助函数。

## 文件概览

这个文件是站点视觉/身份信息的单点真源（single source of truth）。它同时承载两套数据：一是常量 `siteSettings`（默认的博主身份），二是 `stylePresetAssets` / `systemGalleryAssetUrls`（不同风格预设对应的 hero 图、系统相册用到的图片）。后台保存的"自定义配置"会写入 `localStorage`，公开站点在初始化时通过 `readSiteSettings()` 读出来覆盖默认值，并调 `applySiteSettings()` 把 `data-style-preset` 和 `data-color-scheme` 写到 `<html>` 上，由 `src/styles.css` 中的属性选择器切换主题。

## 类型与默认配置

`stylePresets` / `colorSchemes` 用 `as const` 定义枚举数组，再从中提取类型，从而让 `StylePreset` / `ColorScheme` 是字面量联合而不是 `string`，避免下游误传非法值。

```ts
export const stylePresets = ['classic', 'cyber'] as const;
export const colorSchemes = ['light', 'dark'] as const;
export type StylePreset = (typeof stylePresets)[number];
export type ColorScheme = (typeof colorSchemes)[number];

export const siteSettings: SiteSettings = {
  stylePreset: 'classic',
  ownerName: '孤舟月',
  ownerAvatarUrl: '/images/guzhouyue-avatar.png',
};
```

`stylePresetAssets` 提供每个预设下的 hero 图地址，`systemGalleryAssetUrls` 则把头像和两个 hero 图打包成一组，被 `contentStore.ts` 中"系统相册"的默认图片使用（详见 `src/contentStore.md`）。

## localStorage 读写与 SSR 兜底

`readSiteSettings` 在 `typeof window === 'undefined'` 时直接返回默认值，给单元测试或未来 SSR 留出退路。从 localStorage 取出的 JSON 经过 `Partial<SiteSettings>` 解析，每个字段都单独走类型/格式校验：风格预设必须落在枚举内（否则用默认）、博主名和头像 URL 走 `normalizeOwnerName` / `normalizeOwnerAvatarUrl`。

```ts
return {
  stylePreset: isStylePreset(parsedSettings.stylePreset) ? parsedSettings.stylePreset : siteSettings.stylePreset,
  ownerName: parsedSettings.ownerName !== undefined ? normalizeOwnerName(parsedSettings.ownerName) : siteSettings.ownerName,
  ownerAvatarUrl:
    parsedSettings.ownerAvatarUrl !== undefined
      ? normalizeOwnerAvatarUrl(parsedSettings.ownerAvatarUrl)
      : siteSettings.ownerAvatarUrl,
};
```

解析失败（脏数据）时 catch 住异常，安全地退回默认值。`readUserColorScheme` / `saveUserColorScheme` 与之配套，但只存一个值（'light' 或 'dark'），不存对象。

## 字段规范化与 DOM 应用

`normalizeOwnerName` 先 trim 再截断到 40 字符，空串时退回默认 `'孤舟月'`；`normalizeOwnerAvatarUrl` 截断到 500 字符但不做 URL 合法性校验——它假设后台保存前已经校验过，这里只是防御性的长度限制。

`applySiteSettings` 把当前配置塞到 `<html>` 的 `dataset` 上（CSS 通过 `html[data-color-scheme="dark"]` 等选择器应用主题），并显式 `removeProperty` 掉之前可能写入的内联 `background-color`/`color`/`color-scheme`，避免上一次设置残留导致样式串味。这是切换风格预设后保持视觉一致性的关键清理动作。

```ts
export function applySiteSettings(settings: SiteSettings, colorScheme: ColorScheme) {
  document.documentElement.dataset.stylePreset = settings.stylePreset;
  document.documentElement.dataset.colorScheme = colorScheme;
  document.documentElement.style.removeProperty('background-color');
  document.documentElement.style.removeProperty('color');
  document.documentElement.style.removeProperty('color-scheme');
}
```
