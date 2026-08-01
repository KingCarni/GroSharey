import { Platform, TextStyle, ViewStyle } from 'react-native';
import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';

// ---------- Palette ----------
// Preserves the existing GroSharey greens (#173F35 / #102C25 / #F4F7F2)
// and layers warm cream, hairline, and a restrained terracotta accent
// to give the app the "warm & organic" premium feel.
export const colors = {
  // Surfaces
  bg: '#F4F7F2',
  bgWarm: '#EDE7D7',        // warm cream (panels, inputs)
  surface: '#FFFFFF',
  surfaceInk: '#F7F4EA',    // subtle warm surface
  surfaceElevated: '#FFFFFF',

  // Text
  ink: '#102C25',           // primary text (existing deep green)
  inkMuted: '#3E4F49',
  muted: '#657069',
  subtle: '#9AA49F',
  onPrimary: '#F7F4EA',     // warm off-white on green

  // Lines
  hairline: '#E4E8DF',
  hairlineWarm: '#DFD8C4',
  hairlineStrong: '#CFD5CB',

  // Brand
  primary: '#173F35',       // existing dark green
  primaryDark: '#0E2A24',
  primarySoft: '#D5E1DA',
  primaryTint: '#E9F0EC',

  // Accent (warm terracotta, used sparingly)
  accent: '#B85E3A',
  accentSoft: '#F1DDD0',
  accentInk: '#763720',

  // Semantic
  success: '#3F7A5A',
  successSoft: '#DDEBDF',
  danger: '#A94B3B',
  dangerSoft: '#F2DAD3',
  warning: '#B8842B',
  warningSoft: '#F3E5C6',
} as const;

// ---------- Spacing (4pt scale) ----------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
  xxxxl: 56,
} as const;

// ---------- Radii ----------
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
  pill: 999,
} as const;

// ---------- Typography ----------
// Serif: Fraunces (warm, expressive display)
// Sans:  Manrope  (calm, geometric body)
export const fonts = {
  serif: 'Fraunces_500Medium',
  serifSemi: 'Fraunces_600SemiBold',
  serifBold: 'Fraunces_700Bold',
  sans: 'Manrope_400Regular',
  sansMed: 'Manrope_500Medium',
  sansSemi: 'Manrope_600SemiBold',
  sansBold: 'Manrope_700Bold',
} as const;

// Named text styles — use these instead of ad-hoc font sizes.
export const type = {
  display: {
    fontFamily: fonts.serifSemi,
    fontSize: 34,
    lineHeight: 40,
    color: colors.ink,
    letterSpacing: -0.6,
  } as TextStyle,
  h1: {
    fontFamily: fonts.serifSemi,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
    letterSpacing: -0.4,
  } as TextStyle,
  h2: {
    fontFamily: fonts.serifSemi,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    letterSpacing: -0.2,
  } as TextStyle,
  h3: {
    fontFamily: fonts.sansSemi,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
  } as TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkMuted,
  } as TextStyle,
  bodyStrong: {
    fontFamily: fonts.sansMed,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  } as TextStyle,
  bodySmall: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  } as TextStyle,
  caption: {
    fontFamily: fonts.sansMed,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  } as TextStyle,
  eyebrow: {
    fontFamily: fonts.sansSemi,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.6,
    color: colors.muted,
    textTransform: 'uppercase',
  } as TextStyle,
  button: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.1,
  } as TextStyle,
  label: {
    fontFamily: fonts.sansMed,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkMuted,
  } as TextStyle,
  input: {
    fontFamily: fonts.sansMed,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  } as TextStyle,
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 20,
    letterSpacing: 4,
    color: colors.ink,
  } as TextStyle,
} as const;

// ---------- Shadows ----------
export const shadows = {
  none: {} as ViewStyle,
  card: {
    shadowColor: '#0B1E19',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  } as ViewStyle,
  raised: {
    shadowColor: '#0B1E19',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  } as ViewStyle,
} as const;

// ---------- Fonts loader map ----------
// Imported here so App root can register with expo-font in one call.
export const fontMap = {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} as const;

export const theme = { colors, spacing, radii, fonts, type, shadows } as const;
export type Theme = typeof theme;
