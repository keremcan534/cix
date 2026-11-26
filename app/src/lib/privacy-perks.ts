// Gizlilik as a VIP / Rütbe right (owners, 26 Nov 2026; server/api/privacy.mjs PRIVACY_PERKS, levels.mjs): an
// account without the right doesn't see the choice at all. A live build has the server's list (GET /api/me/privacy
// `perks`); the demo works it out from its own VIP level and Rütbe tier with the default levels below.

/** Which right each Gizlilik choice needs. */
export const PRIVACY_PERK_OF = {
  showCurrentRoom: 'privacy_room',
  globalHideName: 'privacy_global',
  showOnline: 'privacy_online',
  showLastSeen: 'privacy_online',
  profileMarks: 'privacy_marks',
  marksFrom: 'privacy_marks',
  profilePublic: 'privacy_profile',
} as const;
export type PrivacyPerkKey = keyof typeof PRIVACY_PERK_OF;
export type PrivacyPerk = (typeof PRIVACY_PERK_OF)[PrivacyPerkKey];

/** Where each right opens by default (the server's Seviye ayarları may move them): VIP level and Rütbe tier. */
export const PRIVACY_PERK_DEFAULTS: Record<PrivacyPerk, { vip: number; noble: number }> = {
  privacy_room: { vip: 2, noble: 1 },
  privacy_global: { vip: 3, noble: 2 },
  privacy_online: { vip: 4, noble: 3 },
  privacy_marks: { vip: 5, noble: 3 },
  privacy_profile: { vip: 6, noble: 4 },
};

/** The demo's rights from its VIP level and Rütbe tier. */
export function demoPrivacyPerks(vipLevel: number, nobleTier: number): Set<string> {
  return new Set(
    Object.entries(PRIVACY_PERK_DEFAULTS)
      .filter(([, at]) => vipLevel >= at.vip || (nobleTier > 0 && nobleTier >= at.noble))
      .map(([k]) => k),
  );
}

/**
 * Whether a choice shows. `perks` undefined: an older server that doesn't say (every choice, as before); null: not
 * read yet (none, so nothing flashes and then goes).
 */
export function privacyShown(perks: Set<string> | null | undefined, key: PrivacyPerkKey): boolean {
  if (perks === undefined) return true;
  return !!perks && perks.has(PRIVACY_PERK_OF[key]);
}

/** The rights from a server answer: undefined when it sends none (older server); malformed entries are dropped. */
export function perksFromServer(v: unknown): Set<string> | undefined {
  return Array.isArray(v) ? new Set(v.filter((x): x is string => typeof x === 'string')) : undefined;
}
