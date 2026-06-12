export const stylePresets = ['classic', 'cyber'] as const;
export const colorSchemes = ['light', 'dark'] as const;

export type StylePreset = (typeof stylePresets)[number];
export type ColorScheme = (typeof colorSchemes)[number];

export type SiteSettings = {
  stylePreset: StylePreset;
  ownerName: string;
  ownerAvatarUrl: string;
};

export const siteSettings: SiteSettings = {
  stylePreset: 'classic',
  ownerName: '孤舟月',
  ownerAvatarUrl: '/images/guzhouyue-avatar.png',
};

export const stylePresetAssets: Record<StylePreset, { heroImage: string }> = {
  classic: {
    heroImage: '/images/guzhouyue-hero.png',
  },
  cyber: {
    heroImage: '/images/guzhouyue-hero-cyber.png',
  },
};

export const systemGalleryAssetUrls = {
  avatarImage: '/images/guzhouyue-avatar.png',
  classicHeroImage: stylePresetAssets.classic.heroImage,
  cyberHeroImage: stylePresetAssets.cyber.heroImage,
};

const siteSettingsStorageKey = 'guzhouyue.siteSettings';
const userColorSchemeStorageKey = 'guzhouyue.userColorScheme';

export function readSiteSettings(): SiteSettings {
  if (typeof window === 'undefined') {
    return siteSettings;
  }

  const storedSettings = window.localStorage.getItem(siteSettingsStorageKey);
  if (!storedSettings) {
    return siteSettings;
  }

  try {
    const parsedSettings = JSON.parse(storedSettings) as Partial<SiteSettings>;
    return {
      stylePreset: isStylePreset(parsedSettings.stylePreset) ? parsedSettings.stylePreset : siteSettings.stylePreset,
      ownerName: parsedSettings.ownerName !== undefined ? normalizeOwnerName(parsedSettings.ownerName) : siteSettings.ownerName,
      ownerAvatarUrl:
        parsedSettings.ownerAvatarUrl !== undefined
          ? normalizeOwnerAvatarUrl(parsedSettings.ownerAvatarUrl)
          : siteSettings.ownerAvatarUrl,
    };
  } catch {
    return siteSettings;
  }
}

export function saveSiteSettings(settings: SiteSettings) {
  window.localStorage.setItem(siteSettingsStorageKey, JSON.stringify(settings));
}

export function readUserColorScheme(): ColorScheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const storedColorScheme = window.localStorage.getItem(userColorSchemeStorageKey);
  return isColorScheme(storedColorScheme) ? storedColorScheme : 'light';
}

export function saveUserColorScheme(colorScheme: ColorScheme) {
  window.localStorage.setItem(userColorSchemeStorageKey, colorScheme);
}

export function applySiteSettings(settings: SiteSettings, colorScheme: ColorScheme) {
  document.documentElement.dataset.stylePreset = settings.stylePreset;
  document.documentElement.dataset.colorScheme = colorScheme;
  document.documentElement.style.removeProperty('background-color');
  document.documentElement.style.removeProperty('color');
  document.documentElement.style.removeProperty('color-scheme');
}

function isStylePreset(value: unknown): value is StylePreset {
  return stylePresets.includes(value as StylePreset);
}

function isColorScheme(value: unknown): value is ColorScheme {
  return colorSchemes.includes(value as ColorScheme);
}

export function normalizeOwnerName(value: unknown) {
  const ownerName = typeof value === 'string' ? value.trim() : '';
  return ownerName.slice(0, 40) || siteSettings.ownerName;
}

export function normalizeOwnerAvatarUrl(value: unknown) {
  const ownerAvatarUrl = typeof value === 'string' ? value.trim() : '';
  return ownerAvatarUrl.slice(0, 500);
}
