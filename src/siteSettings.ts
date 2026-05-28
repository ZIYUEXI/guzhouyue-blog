export const stylePresets = ['classic', 'cyber'] as const;
export const colorSchemes = ['light', 'dark'] as const;

export type StylePreset = (typeof stylePresets)[number];
export type ColorScheme = (typeof colorSchemes)[number];

export type SiteSettings = {
  stylePreset: StylePreset;
  colorScheme: ColorScheme;
  ownerName: string;
  ownerAvatarUrl: string;
};

export const siteSettings: SiteSettings = {
  stylePreset: 'classic',
  colorScheme: 'light',
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

const siteSettingsStorageKey = 'guzhouyue.siteSettings';

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
      stylePreset: isStylePreset(parsedSettings.stylePreset)
        ? parsedSettings.stylePreset
        : siteSettings.stylePreset,
      colorScheme: isColorScheme(parsedSettings.colorScheme)
        ? parsedSettings.colorScheme
        : siteSettings.colorScheme,
      ownerName: normalizeOwnerName(parsedSettings.ownerName),
      ownerAvatarUrl: normalizeOwnerAvatarUrl(parsedSettings.ownerAvatarUrl),
    };
  } catch {
    return siteSettings;
  }
}

export function saveSiteSettings(settings: SiteSettings) {
  window.localStorage.setItem(siteSettingsStorageKey, JSON.stringify(settings));
}

export function applySiteSettings(settings: SiteSettings) {
  document.documentElement.dataset.stylePreset = settings.stylePreset;
  document.documentElement.dataset.colorScheme = settings.colorScheme;
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
