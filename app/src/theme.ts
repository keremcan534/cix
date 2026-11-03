// SimilarClub palette v2 "Gece mavisi": night-navy surfaces, turquoise as the single brand color
// (actions, live, sound), coral for social signals, gold for coins, gifts and VIP. No purple.
//
// Two schemes share every token: `dark` (the original night palette, unchanged) and `light` (white cards on a
// cool paper background, navy ink). Screens read the active scheme through useTheme() / makeStyles(); the
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
    /** Turquoise fill for chips, tags and selected states; white text on it is 5.1:1. */
    primary: string;
    /** Turquoise for text, icons and outlines (10.9:1 on the dark bg, 5:1 on the light one). */
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
   * action/live = turquoise (buttons, online, speaking, mic on), social = coral,
   * money/status = gold (coins, gifts, VIP), success = green, danger = red.
   * The plain names are fills (bright turquoise, coral and gold always take dark navy ink); the `…Text` names are
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
  /** The hero fill: bright turquoise, reserved for the one primary button on a screen (navy text on it). */
  gradient: Pair;
  /** Deep turquoise for icon buttons, headers and bubbles that carry white content. */
  gradientDeep: Pair;
  /**
   * The scheme's ink at an opacity: white on dark, navy on light. For glass chips, hairlines and soft fills that
   * used to be `rgba(255,255,255,a)` on the night background.
   */
  ink: (alpha: number) => string;
};

const DARK: Theme = {
  scheme: 'dark',
  dark: true,
  colors: {
    bg: '#080F1E',
    card: '#16253C',
    cardAlt: '#1F3050',
    border: '#2B3F63',
    text: '#FFFFFF',
    textDim: '#A3B1CF',
    primary: '#087A80',
    primaryText: '#13D9DF',
    pink: '#FF6576',
    gold: '#F6BD60',
    green: '#22C55E',
    red: '#D93A45',
  },
  semantic: {
    action: '#13D9DF',
    actionText: '#13D9DF',
    actionEdge: '#0A8F95',
    actionInk: '#04161D',
    social: '#FF6576',
    socialText: '#FF6576',
    socialFill: '#C93C4F',
    money: '#F6BD60',
    moneyText: '#F6BD60',
    moneyEdge: '#B7832E',
    moneyInk: '#3B2300',
    live: '#13D9DF',
    liveEdge: '#0A8F95',
    liveInk: '#04161D',
    success: '#22C55E',
    successText: '#22C55E',
    successInk: '#052E16',
    successFill: '#15803D',
    danger: '#FF7A82',
    tonal: 'rgba(19,217,223,0.14)',
    tonalText: '#A5F3F5',
    status: ['#F6BD60', '#E89B2C'],
    statusInk: '#3B2300',
    diamondText: '#7DD3FC',
  },
  surface: {
    glass: 'rgba(8,15,30,0.55)',
    blurTint: 'dark',
    veil: '8,15,30',
    photo: 1,
    glow: 1,
    depth: ['#1C2E4A', '#132239'],
    rim: 'rgba(255,255,255,0.07)',
    hairline: 'rgba(255,255,255,0.08)',
    pressed: 'rgba(255,255,255,0.04)',
    shadow: 'rgba(0,0,0,0.35)',
  },
  lift: {},
  gradient: ['#13D9DF', '#0FB8BE'],
  gradientDeep: ['#0A8F95', '#076A70'],
  ink: (a) => `rgba(255,255,255,${a})`,
};

// Light: cool paper background, white cards, navy ink. Every text color here is at least 4.5:1 on the background
// and on cards; fills keep the dark scheme's colors so buttons, badges and the brand gradient look the same.
const LIGHT: Theme = {
  scheme: 'light',
  dark: false,
  colors: {
    bg: '#F3F6FB',
    card: '#FFFFFF',
    cardAlt: '#E9EFF7',
    border: '#D5DEEA',
    text: '#0B1A2E',
    textDim: '#566580',
    primary: '#087A80',
    primaryText: '#00757B',
    pink: '#C8304A',
    gold: '#9A6408',
    green: '#15803D',
    red: '#CC2E3A',
  },
  semantic: {
    action: '#13D9DF',
    actionText: '#00757B',
    actionEdge: '#0A8F95',
    actionInk: '#04161D',
    social: '#FF6576',
    socialText: '#C8304A',
    socialFill: '#C93C4F',
    money: '#F6BD60',
    moneyText: '#9A6408',
    moneyEdge: '#B7832E',
    moneyInk: '#3B2300',
    live: '#13D9DF',
    liveEdge: '#0A8F95',
    liveInk: '#04161D',
    success: '#22C55E',
    successText: '#15803D',
    successInk: '#052E16',
    successFill: '#15803D',
    danger: '#C42B37',
    tonal: 'rgba(0,140,148,0.10)',
    tonalText: '#006A70',
    status: ['#F6BD60', '#E89B2C'],
    statusInk: '#3B2300',
    diamondText: '#0369A1',
  },
  surface: {
    glass: 'rgba(255,255,255,0.74)',
    blurTint: 'light',
    veil: '243,246,251',
    photo: 0.32,
    glow: 0.55,
    depth: ['#FFFFFF', '#F8FAFD'],
    rim: 'rgba(11,26,46,0.07)',
    hairline: 'rgba(11,26,46,0.08)',
    pressed: 'rgba(11,26,46,0.04)',
    shadow: 'rgba(16,36,64,0.10)',
  },
  lift: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11,26,46,0.08)',
    boxShadow: '0 1px 2px rgba(16,36,64,0.05), 0 6px 16px rgba(16,36,64,0.06)',
  },
  gradient: ['#13D9DF', '#0FB8BE'],
  gradientDeep: ['#0A8F95', '#076A70'],
  ink: (a) => `rgba(11,26,46,${a})`,
};

export const themes: Record<Scheme, Theme> = { dark: DARK, light: LIGHT };

/** Dark-scheme tokens for surfaces that stay dark in both modes (room, games, calls). Screens use useTheme(). */
export const colors = DARK.colors;
export const semantic = DARK.semantic;
export const gradient = DARK.gradient;
export const gradientDeep = DARK.gradientDeep;

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
