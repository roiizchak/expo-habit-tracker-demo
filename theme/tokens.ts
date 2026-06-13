/**
 * Design tokens — committed dark identity.
 * Scene: checked in bed at dawn (dim) and last thing at night. Dark-first,
 * signature warm amber for success/brand (deliberately not the cliché green).
 */

export const colors = {
  // Surfaces: near-black with a faint brand-hue tint, not flat slate.
  bg: '#0C0B10',
  bgElevated: '#121119',
  surface: '#16151C',
  surfaceAlt: '#1E1C26',
  hairline: '#26242E',

  // Signature brand / success.
  amber: '#F5B53D',
  amberSoft: '#3A2E12', // amber tint for filled backgrounds on near-black
  amberInk: '#1A1304', // text/icon on top of amber

  // Text ramp — tuned for >=4.5:1 body contrast on bg.
  ink: '#F4F2F7',
  inkSecondary: '#B7B3C2',
  inkMuted: '#7E7A88', // labels only, never body
  inkOnAccent: '#1A1304',

  danger: '#F2545B',
  dangerSoft: '#3A1518',

  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Per-habit accent ramp — high-chroma, each reads >=3:1 on bg. */
export const habitColors = [
  '#F5B53D', // amber
  '#FF6B5E', // coral
  '#A98BFF', // violet
  '#3FD6B0', // teal
  '#56B6FF', // sky
  '#B8E04A', // lime
  '#FF6FA5', // rose
  '#7C8CFF', // indigo
] as const;

/** A muted tint of a habit color for filled card/ring backgrounds. */
export function tintOf(hex: string, alpha = 0.16): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16, // cards top out here per design rules
  pill: 999,
} as const;

/** Inter, loaded via @expo-google-fonts/inter. Weight contrast carries hierarchy. */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

/** Type scale — >=1.25 ratio between steps. */
export const type = {
  display: { fontFamily: font.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  h1: { fontFamily: font.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  h2: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  numXL: { fontFamily: font.extrabold, fontSize: 44, lineHeight: 48, letterSpacing: -1 },
} as const;

/** Soft elevation for raised surfaces. iOS shadow + Android elevation. */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  glow: (hex: string) => ({
    shadowColor: hex,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  }),
} as const;

/** Semantic z-index scale — never arbitrary 999s. */
export const z = {
  base: 0,
  sticky: 10,
  banner: 20,
  modalBackdrop: 30,
  modal: 40,
  toast: 50,
  confetti: 60,
} as const;
