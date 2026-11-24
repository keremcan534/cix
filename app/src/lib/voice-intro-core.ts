// Ses tanıtımı (owners, 24 Nov 2026): a voice clip of up to 15 seconds on someone's profile; anyone who may see the
// profile plays it (server/api/voice-intro.mjs). What the screens need without React Native: the limits (the server's
// own), the clip as the server sends it read defensively, its clock ("0:12") and the bars drawn for it.

/** The server's limits: at least 1 second, at most 15 (voice-intro.mjs VOICE_LIMITS). */
export const VOICE_MIN_MS = 1_000;
export const VOICE_MAX_MS = 15_000;

export type VoiceIntro = { url: string; ms: number };

/**
 * A clip from the server's answer (GET /api/user `user.voice`, POST /api/me/voice `voice`): { url, ms }, null for
 * none, undefined when the field isn't there (an older server) or isn't readable.
 */
export function parseVoice(v: unknown): VoiceIntro | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const { url, ms } = v as { url?: unknown; ms?: unknown };
  if (typeof url !== 'string' || !/^(https?:\/\/|\/)/.test(url) || url.length > 1000) return undefined;
  const n = typeof ms === 'number' && Number.isFinite(ms) ? Math.round(ms) : 0;
  return { url, ms: Math.max(0, Math.min(n, VOICE_MAX_MS)) };
}

/** A length as the clip shows it: "0:07", "0:15" (whole seconds, rounded up so a started second counts). */
export function voiceClock(ms: number): string {
  const s = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `n` bar heights from 0.3 to 1 for a clip, always the same for the same address (no sound analysis on the phone). */
export function voiceBars(seed: string, n = 28): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    // A gentle swell in the middle, as speech has, so the bars read as a voice and not as noise.
    const swell = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / n);
    out.push(Math.round((0.3 + 0.7 * ((h % 1000) / 999) * swell) * 100) / 100);
  }
  return out;
}

/** How far a recording may go on (ms left), and whether it must stop now. */
export const recordingLeft = (ms: number) => Math.max(0, VOICE_MAX_MS - Math.max(0, ms));
