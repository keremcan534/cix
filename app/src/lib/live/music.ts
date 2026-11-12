// Live mode (lib/live): music in the rooms (server/api/music.mjs). The owner, the room's admins and its DJs keep
// a library of tracks they added from their phone (the file goes to the photo storage, media kind 'music') and
// put them on the room's playlist. Everyone in the room hears the same point of the same track: the server keeps
// the list, which row plays and when it started (the room metadata `music`, lib/live/room-bus), and each phone
// plays the file itself at the position the server's clock gives (nowPlaying). Only lib/api and lib/sanction-time
// are used, so Node tests can load this; the sheet and the player are in components/room/room-music.
import * as api from '@/lib/api';
import { LIST_MAX, parseMusic, type MusicRepeat, type QueueTrack, type RoomMusic } from '@/lib/live/room-bus';
import { serverNow, setServerNow } from '@/lib/sanction-time';

export type { MusicRepeat, QueueTrack, RoomMusic };
export { LIST_MAX };
/** A track in my library (`artist` '' when none). */
export type LibraryTrack = { id: string; title: string; artist?: string; url: string; seconds: number; createdAt: string };
/** A file the picker returned (expo-document-picker asset). */
export type PickedAudio = { uri: string; name: string; size?: number | null; mimeType?: string | null };
/**
 * What the owner, admins and DJs do to the room's music (server/api/music.mjs): add tracks of my library to the
 * list; play one now (older apps' "Çal"); a row now (jump), next (top) or off the list (remove); next, previous,
 * pause, resume; the repeat mode; stop (the music stops, the list stays: "Kapat"); clear (the list empties too).
 */
export type MusicAction =
  | { action: 'add'; tracks: string[] }
  | { action: 'play' | 'add'; track: string }
  | { action: 'jump' | 'top' | 'remove'; key: string }
  | { action: 'skip' | 'prev' | 'pause' | 'resume' | 'stop' | 'clear' }
  | { action: 'repeat'; mode: MusicRepeat };

/** The server's limits (music.mjs, media.mjs). */
export const LIBRARY_MAX = 50;
export const TRACK_MAX_BYTES = 20 * 1024 * 1024;
export const NO_MUSIC: RoomMusic = { tracks: [], startedAt: null, pausedAt: null, repeat: 'off', list: [] };

/**
 * What plays at `now` (server ms): the track the room's clock is in and how far into it (seconds), or null when
 * nothing does. A track that has played through stays first in the metadata until the server next writes it, so
 * the clock is walked through the tracks rather than trusting tracks[0]: round and round with repeat one (a single
 * track) and all (the whole list). `lap` counts the rounds, so the player starts a track again that comes round.
 */
export function nowPlaying(m: RoomMusic | null, now: number) {
  if (!m || !m.tracks.length || m.startedAt === null) return null;
  const paused = m.pausedAt !== null;
  let at = Math.max(0, (m.pausedAt ?? now) - m.startedAt);
  const tracks = m.repeat === 'one' ? m.tracks.slice(0, 1) : m.tracks;
  let lap = 0;
  if (m.repeat !== 'off') {
    const round = tracks.reduce((n, t) => n + t.seconds * 1000, 0);
    lap = Math.floor(at / round);
    at -= lap * round;
  }
  for (let i = 0; i < tracks.length; i++) {
    const len = tracks[i].seconds * 1000;
    if (at < len) return { index: i, track: tracks[i], position: at / 1000, paused, lap };
    at -= len;
  }
  return null;
}
export type NowPlaying = NonNullable<ReturnType<typeof nowPlaying>>;

/** The repeat button: off → all → one → off. */
export const nextRepeat = (r: MusicRepeat): MusicRepeat => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off');
export const REPEAT_LABEL: Record<MusicRepeat, string> = { off: 'Tekrar kapalı', all: 'Liste tekrarlanıyor', one: 'Parça tekrarlanıyor' };

// The types media.mjs takes; a picker that says nothing (or something odd) is read by the file's extension.
const TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/wav', 'audio/x-wav']);
const BY_EXT: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav' };
/** The file's type for the upload, or null when the server would refuse it. */
export function audioType(name: string, picked?: string | null): string | null {
  const p = picked?.toLowerCase();
  if (p && TYPES.has(p)) return p;
  const ext = name.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return BY_EXT[ext] ?? null;
}

const bareName = (name: string) =>
  name
    .replace(/\.[A-Za-z0-9]{2,5}$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** "gece_mavisi-01.mp3" → "gece mavisi-01": the file's name without its extension, at most 80 characters. */
export const trackTitle = (name: string) => (bareName(name) || 'Parça').slice(0, 80);

/**
 * "Sezen Aksu - Gülümse.mp3" → { artist: 'Sezen Aksu', title: 'Gülümse' }: music files are mostly named
 * "Sanatçı - Parça". A name without " - " is all title.
 */
export function trackName(name: string): { title: string; artist: string } {
  const m = /^(.+?) [-–—] (.+)$/.exec(bareName(name));
  if (!m || m[1].length > 80) return { title: trackTitle(name), artist: '' };
  return { title: m[2].slice(0, 80), artist: m[1] };
}

/** "3:05" */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Turkish letters folded, so "ŞARKI" finds "şarkı" and "i" finds "İ". */
const fold = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
/** The search field: every word in the title, the artist or who added it. */
export function matchTrack(t: { title: string; artist?: string; byName?: string }, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([t.title, t.artist, t.byName].filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

export const myMusic = () => api.apiRequest<{ tracks: LibraryTrack[] }>('GET', '/api/music').then((r) => r.tracks);
/** Takes the track out of my library and off every room list it is on. */
export const removeTrack = (id: string) => api.apiRequest<{ removed: true }>('POST', '/api/music/remove', { id });

/**
 * A picked file into my library: checked here first (type, size, length), then a signed upload address for its
 * exact type and size, the file PUT there, then the track saved. `seconds` is its length (the player reads it).
 * Throws with a message to show when a step fails (nothing is saved then).
 */
export async function uploadTrack(a: PickedAudio, seconds: number, name = trackName(a.name)): Promise<LibraryTrack> {
  const type = audioType(a.name, a.mimeType);
  if (!type) throw new Error('Bu dosya çalınamıyor. MP3, M4A, AAC, OGG, FLAC ya da WAV seç.');
  if (a.size && a.size > TRACK_MAX_BYTES) throw new Error('Dosya en fazla 20 MB olabilir.');
  const secs = Math.round(seconds);
  if (!(secs >= 5 && secs <= 1200)) throw new Error('Parça 5 saniye ile 20 dakika arası olmalı.');
  let file: ArrayBuffer;
  try {
    file = (await api.readFile(a.uri)).data;
  } catch {
    throw new Error('Dosya okunamadı. Başka bir dosya seç.');
  }
  const size = file.byteLength;
  if (!size || size > TRACK_MAX_BYTES) throw new Error('Dosya en fazla 20 MB olabilir.');
  const target = await api.uploadUrl('music', type, size);
  let res: Response;
  try {
    res = await fetch(target.uploadUrl, { method: target.method ?? 'PUT', headers: target.headers, body: file });
  } catch {
    throw new Error('Parça yüklenemedi. İnternetini kontrol edip tekrar dene.');
  }
  if (!res.ok) throw new Error(`Parça yüklenemedi (${await api.storageRefusal(res)}). Tekrar dene.`);
  const body = { title: name.title, ...(name.artist ? { artist: name.artist } : {}), url: target.publicUrl, seconds: secs, size };
  return (await api.apiRequest<{ track: LibraryTrack }>('POST', '/api/music', body)).track;
}

/** The room's music now and whether I may play there; also sets the server clock the position is read on. */
export async function roomMusicGet(room: string) {
  const r = await api.apiRequest<{ music: unknown; canPlay: boolean; serverNow: string }>('GET', `/api/rooms/music?room=${encodeURIComponent(room)}`);
  setServerNow(r.serverNow);
  return { music: parseMusic(r.music) ?? NO_MUSIC, canPlay: r.canPlay === true };
}

/** Owner, admins and DJs: a change to the room's music (MusicAction). Answers the music now. */
export async function roomMusicAction(room: string, body: MusicAction) {
  const r = await api.apiRequest<{ music: unknown; serverNow: string }>('POST', '/api/rooms/music', { room, ...body });
  setServerNow(r.serverNow);
  return parseMusic(r.music) ?? NO_MUSIC;
}

/** What plays in the room right now on the server's clock. */
export const playingNow = (m: RoomMusic | null) => nowPlaying(m, serverNow());
