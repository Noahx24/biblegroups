// Methodist scarlet + gold on cream. Tokens match the design spec exactly.
import { Platform, type TextStyle } from 'react-native';

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
  // Text ramp — tuned for contrast/readability. Primary is near-black for
  // crisp body copy; "muted"/"mutedSoft" are deliberately darker than a washed
  // beige so secondary text stays legible on small devices.
  text: '#19150F',
  textSoft: '#3A322A',
  textMuted: '#665D50',
  textMutedSoft: '#857B69',
  border: '#E5DDD0',
  borderSoft: '#EFE7D8',
  open: '#3A7FD8',
  openSoft: '#D5E2F6',
  rose: '#C26A7C',
  success: '#4A7C59',
  danger: '#B0202C',
};

// Single modern sans-serif family across the whole app. On iOS this resolves
// to SF Pro, on Android to Roboto — both clean, native, highly legible faces.
// No decorative/serif fonts anywhere. Centralised here so swapping in a bundled
// face later (e.g. Inter) is a one-line change.
const sans = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });

export const fonts = {
  sans,
};

// ─── Type scale ────────────────────────────────────────────────────────────
// The single source of truth for typography. Spread a token into a StyleSheet
// entry and layer on colour/layout, e.g. `{ ...typography.screenTitle, color: colors.text }`.
export const typography = {
  // Large screen / page title.
  screenTitle: { fontFamily: sans, fontSize: 32, fontWeight: '700', lineHeight: 38, letterSpacing: -0.6 },
  // Title-style headings on stacked/detail screens.
  title: { fontFamily: sans, fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: -0.4 },
  // Section heading inside a screen.
  sectionHeading: { fontFamily: sans, fontSize: 20, fontWeight: '600', lineHeight: 26, letterSpacing: -0.3 },
  // Card / list-row title.
  cardTitle: { fontFamily: sans, fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: -0.2 },
  // Default reading text.
  body: { fontFamily: sans, fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyStrong: { fontFamily: sans, fontSize: 16, fontWeight: '600', lineHeight: 24, letterSpacing: -0.1 },
  // Supporting / secondary text.
  secondary: { fontFamily: sans, fontSize: 14, fontWeight: '400', lineHeight: 20 },
  secondaryStrong: { fontFamily: sans, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  // Small print.
  caption: { fontFamily: sans, fontSize: 12, fontWeight: '500', lineHeight: 16 },
  // Bottom-tab / navigation labels.
  navLabel: { fontFamily: sans, fontSize: 12, fontWeight: '500', letterSpacing: 0.1 },
  // Pill / status badge.
  badge: { fontFamily: sans, fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: 0.2 },
  // Uppercase eyebrow / overline label (section dividers, field labels).
  overline: { fontFamily: sans, fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  // Button label.
  button: { fontFamily: sans, fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },
} satisfies Record<string, TextStyle>;

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

// Soft, diffuse, modern elevation — no heavy/skeuomorphic drop shadows.
export const shadow = {
  card: {
    shadowColor: '#19150F',
    shadowOpacity: 0.05,
    shadowRadius: 16,
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
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '900' as const },
  },
};
