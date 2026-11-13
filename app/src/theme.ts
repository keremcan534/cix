// SimilarClub palette v3 "Pembe": warm dark surfaces, the logo's pink as the single brand color
// (actions, live, sound), coral for social signals, gold for coins, gifts and VIP. No purple.
//
// Two schemes share every token: `dark` (the main palette) and `light` (white cards on a
// soft pink paper background, warm dark ink). Screens read the active scheme through useTheme() / makeStyles(); the
// static exports below (colors, semantic, gradient, gradientDeep) are the dark scheme and stay for surfaces that
// are dark in both modes: the live room, games, calls and the match layer (see ThemeScope).
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

export type Scheme = 'dark' | 'light';
/** The choice in Ayarlar › Görünüm; `system` follows the phone. */
export type Appearance = 'system' | Scheme;

type Pair = readonly [string, string];

export type Theme = {
  scheme: Scheme;
  dark: boolean;
  colors: {
    bg: string;
    card: string;
    cardAlt: string;
    border: string;
    text: string;
    textDim: string;
    /** Pink fill for chips, tags and selected states; white text on it is 6.1:1. */
    primary: string;
    /** Pink for text, icons and outlines (6.7:1 on the dark bg, 5.7:1 on the light one). */
    primaryText: string;
    /** Coral: social signals only (likes, follows, hearts, intimacy, messages). Text-safe in both schemes. */
    pink: string;
    /** Gold for coin amounts, coin icons and status text. Fills use semantic.money. */
    gold: string;
    /** Success / approved. */
    green: string;
    red: string;
  };
  /**
   * Each color carries one meaning, so the eye learns it once:
   * action/live = pink (buttons, online, speaking, mic on), social = coral,
   * money/status = gold (coins, gifts, VIP), success = green, danger = red.
   * The plain names are fills (bright pink, coral and gold always take dark ink); the `…Text` names are
   * the same meaning as text or an icon on the screen's own surface. In the dark scheme both are the same color.
   */
  semantic: {
    action: string;
    actionText: string;
    actionEdge: string;
    actionInk: string;
    social: string;
    socialText: string;
    socialFill: string;
    money: string;
    moneyText: string;
    moneyEdge: string;
    moneyInk: string;
    live: string;
    liveEdge: string;
    liveInk: string;
    success: string;
    successText: string;
    successInk: string;
    /** Fill for approve/claim buttons with white text (5:1). */
    successFill: string;
    /** Danger as text, icon or outline. */
    danger: string;
    tonal: string;
    tonalText: string;
    /** VIP / SVIP / nobility: gold, the "valuable" color. */
    status: Pair;
    statusInk: string;
    /** Diamond amounts and diamond icons as text (the sky-blue of the diamond). */
    diamondText: string;
  };
  /** Surfaces that float or frame: glass bars, the photo veil, card depth, hairlines and shadows. */
  surface: {
    /** Tint over the blur of glass bars and headers. */
    glass: string;
    blurTint: 'dark' | 'light';
    /** r,g,b of the veil laid over screen photos (fx/surface Backdrop). */
    veil: string;
    /** How much of the screen photo shows through (multiplies the Backdrop strength). */
    photo: number;
    /** How strong the ambient color glows are. */
    glow: number;
    /** DepthCard gradient. */
    depth: Pair;
    /** Faint rim around cards and grouped lists. */
    rim: string;
    /** Separators between rows. */
    hairline: string;
    /** Pressed row / tile highlight. */
    pressed: string;
    /** Drop shadow color under cards and sheets. */
    shadow: string;
  };
  /**
   * Extra style for a card that sits on the screen background: nothing in the dark scheme (cards stand out by
   * color there), a hairline rim and a soft shadow in the light one so white cards do not melt into the paper.
   */
  lift: ViewStyle;
  /**
   * The rim and shadow of what opens over a screen, which has no grey veil behind it (SCRIM): `sheet` for a bottom
   * sheet or menu (its top edge), `card` for a popup card (all round).
   */
  edge: { sheet: ViewStyle; card: ViewStyle };
  /** The hero fill: bright pink, reserved for the one primary button on a screen (dark text on it). */
  gradient: Pair;
  /** Deep pink for icon buttons, headers and bubbles that carry white content. */
  gradientDeep: Pair;
  /**
   * The scheme's ink at an opacity: white on dark, warm dark on light. For glass chips, hairlines and soft fills that
   * used to be `rgba(255,255,255,a)` on the dark background.
   */
  ink: (alpha: number) => string;
};

const DARK: Theme = {
  scheme: 'dark',
  dark: true,
  colors: {
    bg: '#160E12',
    card: '#2A1A22',
    cardAlt: '#36222D',
    border: '#4A3040',
    text: '#FFFFFF',
    textDim: '#CDB3C0',
    primary: '#B81F66',
    primaryText: '#FF5FA2',
    pink: '#FF6576',
    gold: '#F6BD60',
    green: '#22C55E',
    red: '#D93A45',
  },
  semantic: {
    action: '#FF5FA2',
    actionText: '#FF5FA2',
    actionEdge: '#D02E78',
    actionInk: '#2A0A18',
    social: '#FF6576',
    socialText: '#FF6576',
    socialFill: '#C93C4F',
    money: '#F6BD60',
    moneyText: '#F6BD60',
    moneyEdge: '#B7832E',
    moneyInk: '#3B2300',
    live: '#FF5FA2',
    liveEdge: '#D02E78',
    liveInk: '#2A0A18',
    success: '#22C55E',
    successText: '#22C55E',
    successInk: '#052E16',
    successFill: '#15803D',
    danger: '#FF7A82',
    tonal: 'rgba(255,95,162,0.14)',
    tonalText: '#FFC2DC',
    status: ['#F6BD60', '#E89B2C'],
    statusInk: '#3B2300',
    diamondText: '#7DD3FC',
  },
  surface: {
    glass: 'rgba(22,14,18,0.55)',
    blurTint: 'dark',
    veil: '22,14,18',
    photo: 1,
    glow: 1,
    depth: ['#2F1D27', '#24161D'],
    rim: 'rgba(255,255,255,0.07)',
    hairline: 'rgba(255,255,255,0.08)',
    pressed: 'rgba(255,255,255,0.04)',
    shadow: 'rgba(0,0,0,0.35)',
  },
  lift: {},
  edge: {
    sheet: { borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 -10px 30px rgba(0,0,0,0.45)' },
    card: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 12px 36px rgba(0,0,0,0.5)' },
  },
  gradient: ['#FF5FA2', '#F0468E'],
  gradientDeep: ['#D02E78', '#9C1857'],
  ink: (a) => `rgba(255,255,255,${a})`,
};

// Light: soft pink paper background, white cards, warm dark ink. Every text color here is at least 4.5:1 on the background
// and on cards; fills keep the dark scheme's colors so buttons, badges and the brand gradient look the same.
const LIGHT: Theme = {
  scheme: 'light',
  dark: false,
  colors: {
    bg: '#FBF4F7',
    card: '#FFFFFF',
    cardAlt: '#F6E9EF',
    border: '#EBD5DF',
    text: '#2A1520',
    textDim: '#7A5868',
    primary: '#B81F66',
    primaryText: '#B81F66',
    pink: '#C8304A',
    gold: '#9A6408',
    green: '#15803D',
    red: '#CC2E3A',
  },
  semantic: {
    action: '#FF5FA2',
    actionText: '#B81F66',
    actionEdge: '#D02E78',
    actionInk: '#2A0A18',
    social: '#FF6576',
    socialText: '#C8304A',
    socialFill: '#C93C4F',
    money: '#F6BD60',
    moneyText: '#9A6408',
    moneyEdge: '#B7832E',
    moneyInk: '#3B2300',
    live: '#FF5FA2',
    liveEdge: '#D02E78',
    liveInk: '#2A0A18',
    success: '#22C55E',
    successText: '#15803D',
    successInk: '#052E16',
    successFill: '#15803D',
    danger: '#C42B37',
    tonal: 'rgba(208,46,120,0.10)',
    tonalText: '#9C1857',
    status: ['#F6BD60', '#E89B2C'],
    statusInk: '#3B2300',
    diamondText: '#0369A1',
  },
  surface: {
    glass: 'rgba(255,255,255,0.74)',
    blurTint: 'light',
    veil: '251,244,247',
    photo: 0.32,
    glow: 0.55,
    depth: ['#FFFFFF', '#F8FAFD'],
    rim: 'rgba(42,21,32,0.07)',
    hairline: 'rgba(42,21,32,0.08)',
    pressed: 'rgba(42,21,32,0.04)',
    shadow: 'rgba(64,20,40,0.10)',
  },
  lift: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42,21,32,0.08)',
    boxShadow: '0 1px 2px rgba(64,20,40,0.05), 0 6px 16px rgba(64,20,40,0.06)',
  },
  edge: {
    sheet: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(42,21,32,0.12)', boxShadow: '0 -8px 28px rgba(64,20,40,0.16)' },
    card: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(42,21,32,0.12)', boxShadow: '0 10px 32px rgba(64,20,40,0.18)' },
  },
  gradient: ['#FF5FA2', '#F0468E'],
  gradientDeep: ['#D02E78', '#9C1857'],
  ink: (a) => `rgba(42,21,32,${a})`,
};

export const themes: Record<Scheme, Theme> = { dark: DARK, light: LIGHT };

/** Dark-scheme tokens for surfaces that stay dark in both modes (room, games, calls). Screens use useTheme(). */
export const colors = DARK.colors;
export const semantic = DARK.semantic;
export const gradient = DARK.gradient;
export const gradientDeep = DARK.gradientDeep;
export const edge = DARK.edge;

/**
 * Behind a sheet, a menu or a popup: nothing, so the screen is not greyed out and only what opened stands over it.
 * The tap-outside-to-close area stays, clear; the sheet or card carries its own edge (Theme.edge). Only dialogs
 * that must stop everything (a sanction, a forced update, a call or match taking the screen) keep a veil.
 */
export const SCRIM = 'transparent';

const ThemeCtx = createContext<Theme>(DARK);

/** The active theme: the app's scheme, or the scheme of the nearest ThemeScope. */
export function useTheme(): Theme {
  return useContext(ThemeCtx);
}

/** Pins a subtree to one scheme (the store provides the app's; rooms, games and calls pin `dark`). */
export function ThemeScope({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  return createElement(ThemeCtx.Provider, { value: themes[scheme] }, children);
}

type Styles = Parameters<typeof StyleSheet.create>[0];

/**
 * Themed StyleSheet: `const useStyles = makeStyles((t) => ({ root: { backgroundColor: t.colors.bg } }))`, then
 * `const s = useStyles()` in the component. Both schemes are built once when the module loads, so switching is a
 * lookup and a render never creates styles.
 */
export function makeStyles<S extends Styles>(build: (t: Theme) => S & Styles): () => Readonly<S> {
  const sheets = { dark: StyleSheet.create(build(DARK)), light: StyleSheet.create(build(LIGHT)) };
  return function useStyles() {
    return sheets[useTheme().scheme];
  };
}

/** Bottom tab bar height (without the safe-area inset); screens drawn under the glass bar pad by it. */
export const TAB_BAR_HEIGHT = 64;

/** 4-pt spacing scale: every gap and padding in new screens comes from here. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Corner radii by role: chips and pills are round, cards medium, sheets large. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Type scale (sp). Captions never go below 12; amounts use tabular figures. */
export const type = { caption: 12, body: 14, bodyL: 16, title: 18, h2: 22, amount: 24 } as const;
/**
 * Heading faces of the brand typeface (Plus Jakarta Sans, loaded in the root layout): extra bold for titles and
 * big numbers, bold for tabs and labels. All other text gets the same family through components/text, which
 * picks the weight file from fontWeight. Set no fontWeight with these: the face is the weight.
 */
export const fonts = { display: 'JakartaExtraBold', displayBold: 'JakartaBold' } as const;
