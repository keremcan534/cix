// SimilarClub palette "Ortak frekans": calm ink surfaces, one violet action color, a turquoise
// signature for sound (live, speaking, mic on), gold only for money, pink only for social signals.
export const colors = {
  bg: '#0D1020',
  card: '#161A2E',
  cardAlt: '#20253D',
  border: '#2C3252',
  text: '#FFFFFF',
  textDim: '#A3A8C9',
  // Fill for buttons and selected states; white text on it is 5.7:1.
  primary: '#7C3AED',
  // Purple for text and icons on dark surfaces (primary itself is too dark there).
  primaryText: '#A78BFA',
  /** Social signals only: likes, follows, hearts, intimacy, gender. */
  pink: '#EC4899',
  gold: '#FBBF24',
  /** Success / approved. Sound and presence use `semantic.live` (turquoise) instead. */
  green: '#22C55E',
  red: '#EF4444',
};

/**
 * Each color carries one meaning, so the eye learns it once:
 * action = buttons, social = likes/follows, money = coins and gifts only,
 * live = sound and presence (online, speaking, mic on), success = approved/done,
 * danger = destructive actions and unread counts.
 */
export const semantic = {
  action: colors.primary,
  actionEdge: '#4C1D95',
  social: '#DB2777',
  money: colors.gold,
  moneyEdge: '#B45309',
  moneyInk: '#3B2300',
  live: '#2DD4BF',
  liveEdge: '#0F766E',
  liveInk: '#042F2E',
  success: colors.green,
  successInk: '#052E16',
  /** Fill for approve/claim buttons with white text (5:1). */
  successFill: '#15803D',
  danger: '#F87171',
  tonal: 'rgba(139,92,246,0.18)',
  tonalText: '#DDD6FE',
  /** Status (VIP, SVIP, nobility) is metallic, never money-gold. */
  status: ['#E2E8F0', '#A5B4FC'] as const,
  statusInk: '#1E1B4B',
};

/** The hero fill: reserved for the one primary button on a screen (violet only, no pink). */
export const gradient = ['#7C3AED', '#5B21B6'] as const;

/** 4-pt spacing scale: every gap and padding in new screens comes from here. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Corner radii by role: chips and pills are round, cards medium, sheets large. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
/** Type scale (sp). Captions never go below 12; amounts use tabular figures. */
export const type = { caption: 12, body: 14, bodyL: 16, title: 18, h2: 22, amount: 24 } as const;
