// South African Methodist Church palette: scarlet/burgundy + gold accents on a
// cream background. Used app-wide so the visual identity stays consistent.
export const colors = {
  primary: '#A8232E',
  primaryDark: '#7C1A24',
  primaryLight: '#F5E2E4',
  accent: '#C9A961',
  accentDark: '#9C7E3D',
  background: '#FAF6EE',
  surface: '#FFFFFF',
  text: '#2A1E1F',
  textMuted: '#6B5E60',
  border: '#E5DDD0',
  success: '#4A7C59',
  danger: '#A8232E',
  open: '#3A6EA5',
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

// App-wide React Navigation theme so the tab bar / status bar inherit the
// Methodist palette without per-screen overrides.
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
