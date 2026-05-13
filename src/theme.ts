// Methodist scarlet + gold on cream. Tokens match the design spec exactly.
import { Platform } from 'react-native';

export const colors = {
  primary: '#B0202C',
  primaryDark: '#8E1924',
  primaryLight: '#F2D9DC',
  accent: '#C89441',
  accentDark: '#9C7E3D',
  accentLight: '#E8C77A',
  accentTint: '#F7E9C8',
  background: '#FAF6EC',
  backgroundSoft: '#F7F1E5',
  surface: '#FFFFFF',
  text: '#1F1A14',
  textSoft: '#3D352B',
  textMuted: '#7A7164',
  textMutedSoft: '#9A917F',
  border: '#E5DDD0',
  borderSoft: '#EFE7D8',
  open: '#3A7FD8',
  openSoft: '#D5E2F6',
  rose: '#C26A7C',
  success: '#4A7C59',
  danger: '#B0202C',
};

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const shadow = {
  card: {
    shadowColor: '#1F1A14',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};

export const navigationTheme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};
