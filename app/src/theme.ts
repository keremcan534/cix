// SimilarClub palette v2 "Gece mavisi": night-navy surfaces, turquoise as the single brand color
// (actions, live, sound), coral for social signals, gold for coins, gifts and VIP. No purple.
export const colors = {
  bg: '#080F1E',
  card: '#16253C',
  cardAlt: '#1F3050',
  border: '#2B3F63',
  text: '#FFFFFF',
  textDim: '#A3B1CF',
  /** Turquoise fill for chips, tags and selected states; white text on it is 5.1:1. */
  primary: '#087A80',
  /** Turquoise for text, icons and outlines on dark surfaces (10.9:1 on bg). */
  primaryText: '#13D9DF',
  /** Coral: social signals only (likes, follows, hearts, intimacy, messages). */
  pink: '#FF6576',
  gold: '#F6BD60',
  /** Success / approved. */
  green: '#22C55E',
  red: '#D93A45',
};

/**
 * Each color carries one meaning, so the eye learns it once:
 * action/live = turquoise (buttons, online, speaking, mic on), social = coral,
 * money/status = gold (coins, gifts, VIP), success = green, danger = red.
 * Bright turquoise, coral and gold fills always take dark navy text.
 */
export const semantic = {
  action: '#13D9DF',
  actionEdge: '#0A8F95',
  actionInk: '#04161D',
  social: '#FF6576',
  socialFill: '#C93C4F',
  money: colors.gold,
  moneyEdge: '#B7832E',
  moneyInk: '#3B2300',
  live: '#13D9DF',
  liveEdge: '#0A8F95',
  liveInk: '#04161D',
  success: colors.green,
  successInk: '#052E16',
  /** Fill for approve/claim buttons with white text (5:1). */
  successFill: '#15803D',
  danger: '#FF7A82',
  tonal: 'rgba(19,217,223,0.14)',
  tonalText: '#A5F3F5',
  /** VIP / SVIP / nobility: gold, the "valuable" color. */
  status: ['#F6BD60', '#E89B2C'] as const,
  statusInk: '#3B2300',
};

/** The hero fill: bright turquoise, reserved for the one primary button on a screen (navy text on it). */
export const gradient = ['#13D9DF', '#0FB8BE'] as const;
/** Deep turquoise for icon buttons, headers and bubbles that carry white content. */
export const gradientDeep = ['#0A8F95', '#076A70'] as const;

/** Bottom tab bar height (without the safe-area inset); screens drawn under the glass bar pad by it. */
export const TAB_BAR_HEIGHT = 64;

/** 4-pt spacing scale: every gap and padding in new screens comes from here. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Corner radii by role: chips and pills are round, cards medium, sheets large. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Type scale (sp). Captions never go below 12; amounts use tabular figures. */
export const type = { caption: 12, body: 14, bodyL: 16, title: 18, h2: 22, amount: 24 } as const;
/**
 * Display face (Baloo 2, loaded in the root layout): rounded and heavy, for titles, names and numbers that
 * should have character. Body text stays on the system font. Set no fontWeight with it: the face is the weight.
 */
export const fonts = { display: 'Display', displayBold: 'DisplayBold' } as const;
