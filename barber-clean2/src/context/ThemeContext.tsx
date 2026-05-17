import React, {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getToken,
  getUserProfile,
  saveUserProfile,
} from '../services/authStorage';
import { getCurrentUser } from '../services/api';
import {
  getBusinessCopy,
  normalizeBusinessType,
  type BusinessCopy,
  type BusinessType,
} from '../utils/businessCopy';

export type ThemeConfig = {
  mode?: ThemeMode | null;
  webPreset?: 'dark' | 'light' | 'vintage' | null;
  primary?: string | null;
  secondary?: string | null;
  card?: string | null;
  gradientColors?: string[] | null;
  logoDataUrl?: string | null;
  bannerDataUrl?: string | null;
  mobileBannerDataUrl?: string | null;
};

type ThemeProfile = {
  shopSlug?: string | null;
  themeConfig?: ThemeConfig | null;
  businessType?: BusinessType | null;
};

export type Theme = {
  mode: ThemeMode;
  primary: string;
  secondary: string;
  background: string;
  card: string;
  gradientColors: string[];
  logo: any;
  surfaceAlt: string;
  input: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  placeholder: string;
  overlay: string;
};

export type ThemeMode = 'dark' | 'light';

type ThemeSeed = {
  mode: ThemeMode;
  primary: string;
  secondary: string;
  background: string;
  card: string;
  gradientColors: string[];
  logo: any;
};

function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === 'light' || value === 'dark' ? value : null;
}

function getReadableTextColor(hexColor: string) {
  const normalized = hexColor.replace('#', '');
  if (normalized.length !== 6) return '#FFFFFF';

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness >= 160 ? '#111111' : '#FFFFFF';
}

function enrichTheme(seed: ThemeSeed): Theme {
  const isLight = seed.mode === 'light';

  return {
    ...seed,
    surfaceAlt: isLight ? '#F3F4F6' : '#161616',
    input: isLight ? '#FFFFFF' : '#252525',
    border: isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255,255,255,0.08)',
    textPrimary: isLight ? '#111827' : '#FFFFFF',
    textSecondary: isLight ? '#334155' : '#D1D5DB',
    textMuted: isLight ? '#64748B' : '#8E8E8E',
    textOnPrimary: getReadableTextColor(seed.primary),
    placeholder: isLight ? '#94A3B8' : '#555555',
    overlay: isLight ? 'rgba(255,255,255,0.30)' : 'rgba(10,10,14,0.46)',
  };
}

export function buildThemeFromConfig(
  presetTheme: Theme,
  customTheme?: ThemeConfig | null,
): Theme {
  const requestedMode =
    normalizeThemeMode(customTheme?.mode) ??
    normalizeThemeMode(presetTheme.mode) ??
    'light';
  const mode = requestedMode === 'dark' ? 'light' : requestedMode;

  const gradientColors =
    Array.isArray(customTheme?.gradientColors) &&
    customTheme.gradientColors.length === 4
      ? customTheme.gradientColors
      : presetTheme.gradientColors;

  return enrichTheme({
    mode,
    primary: customTheme?.primary || presetTheme.primary,
    secondary: customTheme?.secondary || presetTheme.secondary,
    background: presetTheme.background,
    card: customTheme?.card || presetTheme.card,
    gradientColors,
    logo: customTheme?.logoDataUrl
      ? { uri: customTheme.logoDataUrl }
      : presetTheme.logo,
  });
}

const DEFAULT_THEME: Theme = {
  mode: 'light',
  primary: '#111111',
  secondary: '#1F2937',
  background: 'transparent',
  card: '#FFFFFF',
  gradientColors: ['#FFFFFF', '#F8FAFC', '#EEF2F7', '#E2E8F0'],
  logo: require('../assets/logo.png'),
  surfaceAlt: '#F3F4F6',
  input: '#FFFFFF',
  border: 'rgba(15, 23, 42, 0.12)',
  textPrimary: '#111827',
  textSecondary: '#334155',
  textMuted: '#64748B',
  textOnPrimary: '#FFFFFF',
  placeholder: '#94A3B8',
  overlay: 'rgba(255,255,255,0.30)',
};

const themes: Record<string, Theme> = {
  codex: DEFAULT_THEME,
  orion: {
    ...DEFAULT_THEME,
  },
  saiko: {
    mode: 'light',
    primary: '#8B5CF6',
    secondary: '#6D28D9',
    background: 'transparent',
    card: '#FFFFFF',
    gradientColors: ['#FAF5FF', '#F3E8FF', '#E9D5FF', '#DDD6FE'],
    logo: require('../assets/LogoKevin.png'),
    surfaceAlt: '#F5F3FF',
    input: '#FFFFFF',
    border: 'rgba(109, 40, 217, 0.12)',
    textPrimary: '#1F2937',
    textSecondary: '#4C1D95',
    textMuted: '#7C3AED',
    textOnPrimary: '#FFFFFF',
    placeholder: '#A78BFA',
    overlay: 'rgba(255,255,255,0.30)',
  },
};

type ThemeContextValue = {
  theme: Theme;
  shopSlug: string | null;
  businessType: BusinessType;
  businessCopy: BusinessCopy;
  setShopSlug: (slug: string | null) => void;
  applyUserTheme: (profile: ThemeProfile | null) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  shopSlug: null,
  businessType: 'other',
  businessCopy: getBusinessCopy('other'),
  setShopSlug: () => {},
  applyUserTheme: () => {},
});

function buildThemeFromProfile(profile: ThemeProfile | null) {
  const normalizedSlug = (profile?.shopSlug ?? '').trim().toLowerCase();
  const presetTheme = themes[normalizedSlug] ?? DEFAULT_THEME;
  const customTheme = profile?.themeConfig;

  if (!customTheme) {
    return {
      resolvedSlug: profile?.shopSlug ?? null,
      resolvedTheme: presetTheme,
    };
  }

  return {
    resolvedSlug: profile?.shopSlug ?? null,
    resolvedTheme: buildThemeFromConfig(presetTheme, customTheme),
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [businessType, setBusinessType] = useState<BusinessType>('other');
  const [businessCopy, setBusinessCopy] = useState<BusinessCopy>(
    getBusinessCopy('other'),
  );

  const applyUserTheme = useCallback((profile: ThemeProfile | null) => {
    const { resolvedSlug, resolvedTheme } = buildThemeFromProfile(profile);
    setShopSlug(resolvedSlug);
    setTheme(resolvedTheme);
    const resolvedBusinessType = normalizeBusinessType(profile?.businessType);
    setBusinessType(resolvedBusinessType);
    setBusinessCopy(getBusinessCopy(resolvedBusinessType));
  }, []);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const profile = await getUserProfile<ThemeProfile>();
      if (isMounted) {
        applyUserTheme(profile);
      }

      const token = await getToken();
      if (!token) return;

      try {
        const response = await getCurrentUser();
        const freshUser = response.user;
        await saveUserProfile(freshUser);

        if (isMounted) {
          applyUserTheme(freshUser);
        }
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, [applyUserTheme]);

  const value = useMemo(
    () => ({
      theme,
      shopSlug,
      businessType,
      businessCopy,
      setShopSlug,
      applyUserTheme,
    }),
    [theme, shopSlug, businessType, businessCopy, applyUserTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
