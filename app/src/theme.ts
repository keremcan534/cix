export const colors = {
  bg: '#120B24',
  card: '#1E1538',
  cardAlt: '#2A1F4A',
  border: '#33285A',
  text: '#FFFFFF',
  textDim: '#A79CC9',
  // Fill for buttons and selected states; white text on it is 5.7:1.
  primary: '#7C3AED',
  // Purple for text and icons on dark surfaces (primary itself is too dark there).
  primaryText: '#A78BFA',
  pink: '#EC4899',
  gold: '#FBBF24',
  green: '#22C55E',
  red: '#EF4444',
};

/**
 * Each color carries one meaning, so the eye learns it once:
 * action = buttons, social = likes/follows, money = coins and gifts only,
 * live = online / speaking / mic on, danger = destructive actions and unread counts.
 */
export const semantic = {
  action: colors.primary,
  actionEdge: '#5B21B6',
  social: '#DB2777',
  money: colors.gold,
  moneyEdge: '#B45309',
  moneyInk: '#3B2300',
  live: colors.green,
  liveEdge: '#15803D',
  liveInk: '#052E16',
  danger: '#F87171',
  tonal: 'rgba(139,92,246,0.18)',
  tonalText: '#DDD6FE',
};

/** The hero gradient: reserved for the one primary button on a screen. White text stays above 4.5:1 on both ends. */
export const gradient = ['#7C3AED', '#DB2777'] as const;

/** 4-pt spacing scale: every gap and padding in new screens comes from here. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Corner radii by role: chips and pills are round, cards medium, sheets large. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Type scale (sp). Captions never go below 12; amounts use tabular figures. */
export const type = { caption: 12, body: 14, bodyL: 16, title: 18, h2: 22, amount: 24 } as const;
