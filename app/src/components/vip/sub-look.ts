// The Abonelik tab's colours and shadows, as measured on the client's light-pink design (SimilarClub VIP Abonelik
// Paketi). The tab draws them in both of the app's colour schemes, like the VIP tab keeps its night purple.
export const SUB = {
  /** The page: an almost flat pink, a touch lighter at the top. */
  page: ['#FBEEF3', '#F9E6EC', '#F9E7EE'] as const,
  pageAt: [0, 0.45, 1] as const,
  ground: '#F9E8EF',
  /** White cards: a soft mauve shadow (the darker pink round the cards in the design). */
  cardShadow: '0 3px 10px rgba(160,80,110,0.16)',
  /** The picked plan: a warm one. */
  cardShadowOn: '0 4px 12px rgba(194,114,66,0.22)',
  card: '#FEFDFE',
  cardEdge: '#EDD7E1',
  /** Gold text: the status line, the rights' titles, the name. */
  gold: '#8E5207',
  goldDeep: '#8E5401',
  heading: '#14020F',
  /** Mauve text: durations, descriptions, the notes. */
  mauve: '#673558',
  mauveSoft: '#714064',
  plum: '#5F2D50',
} as const;
