export const stylePresets = ['classic', 'cyber'] as const;
export const colorSchemes = ['light', 'dark'] as const;

export type StylePreset = (typeof stylePresets)[number];
export type ColorScheme = (typeof colorSchemes)[number];

export type SiteSettings = {
  stylePreset: StylePreset;
  colorScheme: ColorScheme;
};

export const siteSettings: SiteSettings = {
  stylePreset: 'classic',
  colorScheme: 'light',
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
}

function isStylePreset(value: unknown): value is StylePreset {
  return stylePresets.includes(value as StylePreset);
}

function isColorScheme(value: unknown): value is ColorScheme {
  return colorSchemes.includes(value as ColorScheme);
}
