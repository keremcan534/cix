// Room stage server stand-in ("Yayına Katılma Modu" + ortak izleme). Per room it owns the selected mode and
// mic layout and the one shared YouTube playback state. Every change is validated here — role, room level,
// layout availability, the capacity rule and the video link — so a layout id sent straight from a client is
// checked exactly like one picked in the sheet. Screens only render what this module holds.
//
// Seats stay in lib/room-presence: this module only asks it who sits where and resizes it after a valid change.
// No backend exists in the prototype; in the real product these functions run on the server.
import { useSyncExternalStore } from 'react';

import { userById } from '@/data/mock';
import { ROOM_LAYOUTS, ROOM_MODES, type ModeId, type RoomFeature, type RoomLayout } from '@/data/room-layouts';
import { getRoom, isOnline, resize, roleOf, setLocks, type Result, type RoomLive } from '@/lib/room-presence';
import { YT_ERRORS, parseYouTubeUrl } from '@/lib/youtube';

export type PlaybackStatus = 'playing' | 'paused' | 'ended' | 'error';
/** The room's one shared player. `position` (seconds) is where the video was at `updatedAt` (ms). */
export type PlaybackState = {
  provider: 'youtube';
  videoId: string;
  playbackStatus: PlaybackStatus;
  position: number;
  updatedAt: number;
  updatedBy: string;
  /** Reported by a player once known (seconds). */
  duration?: number;
  error?: string;
};
export type RoomStage = {
  roomId: string;
  /** null = the room's classic mic grid (its capacity from the room settings, as before this feature). */
  modeId: ModeId | null;
  layoutId: string | null;
  playback: PlaybackState | null;
  version: number;
};
/** What the server knows about the room (level from room XP, settings); synced from the room settings. */
export type StageInfo = {
  level: number;
  /** Room theme (data/catalog ROOM_THEMES); PK badges show only in a PK room. */
  theme: string;
  /** "Oda işlevlerini yönet": owner only, or owner and admins. */
  manageFunctions: 'owner' | 'admins';
  classicCapacity: number;
  classicMax: number;
  features: RoomFeature[];
};
export type StageAudit = { id: string; at: number; roomId: string; actor: string; action: string; target: string; ok: boolean; note?: string };
type State = { stages: Record<string, RoomStage>; info: Record<string, StageInfo>; layouts: RoomLayout[]; audit: StageAudit[] };

export const ALL_FEATURES: RoomFeature[] = ['youtube', 'camera'];
/** Players closer than this (seconds) to the room position are left alone; further away they seek. */
export const SYNC_TOLERANCE_S = 2;
export const SEEK_STEP_S = 10;

let state: State = { stages: {}, info: {}, layouts: ROOM_LAYOUTS, audit: [] };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getStages = () => state;
export const getStage = (roomId: string): RoomStage | undefined => state.stages[roomId];
export const getStageInfo = (roomId: string): StageInfo | undefined => state.info[roomId];
export function useStages() {
  return useSyncExternalStore(subscribe, getStages, getStages);
}

const rid = () => Math.random().toString(36).slice(2, 10);
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
function put(s: RoomStage) {
  emit({ stages: { ...state.stages, [s.roomId]: { ...s, version: s.version + 1 } } });
}
function log(roomId: string, actor: string, action: string, target: string, ok: boolean, note?: string) {
  emit({ audit: [{ id: rid(), at: Date.now(), roomId, actor, action, target, ok, note }, ...state.audit].slice(0, 200) });
}
const OFFLINE = 'Bağlantı yok. Değişiklik gönderilmedi; bağlantı gelince yeniden dene.';

// --- Catalog ---------------------------------------------------------------------------------------------
export const layoutById = (id: string | null | undefined) => (id ? state.layouts.find((l) => l.id === id) : undefined);
export const modeById = (id: ModeId) => ROOM_MODES.find((m) => m.id === id)!;
export const enabledModes = () => ROOM_MODES.filter((m) => m.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder);
/** Cards of one tab: enabled layouts of the mode, in catalog order. */
export const layoutsOf = (modeId: ModeId) => state.layouts.filter((l) => l.modeId === modeId && l.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder);
/** Admin/test support: replace the catalog (a panel would edit this list; no code change needed). */
export const setLayoutCatalog = (layouts: RoomLayout[]) => emit({ layouts });

export type Access = { ok: true } | { ok: false; code: 'disabled' | 'level' | 'feature'; reason: string };
const FEATURE_NAME: Record<RoomFeature, string> = { youtube: 'YouTube oynatıcı', camera: 'Görüntülü yuvalar' };
/** Can this room use the layout at all (independent of who asks)? Also drives the lock on the cards. */
export function layoutAccess(l: RoomLayout, info: Pick<StageInfo, 'level' | 'features'>): Access {
  if (!l.isEnabled || !modeById(l.modeId).isEnabled) return { ok: false, code: 'disabled', reason: 'Bu yerleşim şu an kullanıma kapalı.' };
  if (info.level < l.minimumRoomLevel) return { ok: false, code: 'level', reason: `Oda Lv.${l.minimumRoomLevel} gerekir; bu oda Lv.${info.level}. Oda XP'si hediyelerle artar.` };
  if (l.requiresFeature && !info.features.includes(l.requiresFeature)) return { ok: false, code: 'feature', reason: `${FEATURE_NAME[l.requiresFeature]} bu odada açık değil.` };
  return { ok: true };
}

// --- Room setup (silent, like room-presence seedRoom) ------------------------------------------------------
/** Creates the room's stage the first time the room is opened; later visits find it as it is. */
export function seedStage(roomId: string, opts: { layoutId?: string | null; info: StageInfo }): RoomStage {
  if (!state.info[roomId]) state = { ...state, info: { ...state.info, [roomId]: opts.info } };
  const have = state.stages[roomId];
  if (have) return have;
  const l = layoutById(opts.layoutId);
  const stage: RoomStage = { roomId, modeId: l?.modeId ?? null, layoutId: l?.id ?? null, playback: null, version: 0 };
  state = { ...state, stages: { ...state.stages, [roomId]: stage } };
  return stage;
}
/** Keeps the server's room facts in step with the room settings (level, theme, who manages functions). */
export function setStageInfo(roomId: string, info: StageInfo) {
  const cur = state.info[roomId];
  if (cur && JSON.stringify(cur) === JSON.stringify(info)) return;
  emit({ info: { ...state.info, [roomId]: info } });
}
export function stageCapacity(roomId: string) {
  const l = layoutById(state.stages[roomId]?.layoutId);
  return l ? l.microphoneCapacity : (state.info[roomId]?.classicCapacity ?? 0);
}
export const stageLayout = (roomId: string) => layoutById(state.stages[roomId]?.layoutId);

// --- Permission ------------------------------------------------------------------------------------------
/**
 * Who may change the mode/layout and control the shared player: the room owner, and admins when the room
 * lets admins manage room functions (the existing "Oda işlevlerini yönet" setting). Roles come from the
 * presence server, never from the client.
 */
export function stagePermission(roomId: string, actorId: string): string | null {
  const role = roleOf(roomId, actorId);
  if (role === 'owner') return null;
  if (role === 'admin') return (state.info[roomId]?.manageFunctions ?? 'admins') === 'admins' ? null : 'Bu odada düzeni ve ortak oynatıcıyı yalnızca oda sahibi yönetir.';
  return 'Düzeni ve ortak oynatıcıyı yalnızca oda sahibi veya yöneticiler değiştirebilir.';
}
export const canManageStage = (roomId: string, actorId: string) => stagePermission(roomId, actorId) === null;

// --- Capacity rule ---------------------------------------------------------------------------------------
/** Speakers sitting on a mic that a smaller capacity would remove. */
export const seatsOutside = (r: RoomLive, capacity: number) =>
  r.seats.map((uid, index) => ({ uid, index })).filter((s): s is { uid: string; index: number } => !!s.uid && s.index >= capacity);
/** A capacity change is refused while anyone sits beyond the new limit: nobody is moved off a mic silently. */
export function checkCapacity(roomId: string, capacity: number): Result {
  const r = getRoom(roomId);
  if (!r) return { ok: true };
  const out = seatsOutside(r, capacity);
  if (!out.length) return { ok: true };
  const who = out.map((s) => `${s.index + 1}. mikrofonda ${userById(s.uid).name}`).join(', ');
  return fail(`${out.length} konuşmacı yeni ${capacity} mikrofonluk düzenin dışında kalıyor (${who}). Önce bu kişileri mikrofondan indir veya daha geniş bir düzen seç.`);
}

// --- Changing the layout ------------------------------------------------------------------------------------
/**
 * Changes the room's layout (null = back to the classic grid). Checks, in order: connection, layout exists
 * and is open, permission, room level / feature, capacity rule. On success the seats are resized (nobody is
 * beyond the new limit, so nobody moves), seat locks outside the new capacity are dropped, and leaving a
 * layout with a screen pauses the shared video at its current position.
 */
export function changeLayout(roomId: string, actorId: string, layoutId: string | null, now = Date.now()): Result<{ stage: RoomStage }> {
  const s = state.stages[roomId];
  const info = state.info[roomId];
  if (!s || !info) return fail('Oda bulunamadı.');
  if (!isOnline()) return fail(OFFLINE);
  const target = layoutId === null ? null : layoutById(layoutId);
  const name = target ? `${modeById(target.modeId).name} · ${target.name}` : 'Klasik düzen';
  if (layoutId !== null && !target) {
    log(roomId, actorId, 'Reddedildi: düzen değiştirme', String(layoutId), false, 'Bilinmeyen yerleşim');
    return fail('Bu yerleşim bulunamadı.');
  }
  const why = stagePermission(roomId, actorId);
  if (why) {
    log(roomId, actorId, 'Reddedildi: düzen değiştirme', name, false, why);
    return fail(why);
  }
  if (target) {
    const access = layoutAccess(target, info);
    if (!access.ok) {
      log(roomId, actorId, 'Reddedildi: düzen değiştirme', name, false, access.reason);
      return fail(access.reason);
    }
  }
  if (s.layoutId === (target?.id ?? null)) return { ok: true, stage: s };
  const capacity = target ? target.microphoneCapacity : info.classicCapacity;
  const cap = checkCapacity(roomId, capacity);
  if (!cap.ok) {
    log(roomId, actorId, 'Reddedildi: düzen değiştirme', name, false, cap.reason);
    return cap;
  }
  const r = getRoom(roomId);
  if (r) {
    resize(roomId, capacity);
    if (r.locked.some((i) => i >= capacity)) setLocks(roomId, r.locked.filter((i) => i < capacity));
  }
  let playback = s.playback;
  if (playback && !target?.layoutSchema.content && playback.playbackStatus === 'playing') {
    playback = { ...playback, playbackStatus: 'paused', position: expectedPosition(playback, now), updatedAt: now, updatedBy: actorId };
  }
  put({ ...s, modeId: target?.modeId ?? null, layoutId: target?.id ?? null, playback });
  log(roomId, actorId, 'Düzeni değiştirdi', name, true);
  return { ok: true, stage: state.stages[roomId] };
}
/** Classic grid mic count (owner settings): same capacity rule; applied to the seats only while classic is on. */
export function setClassicCapacity(roomId: string, actorId: string, capacity: number): Result {
  const s = state.stages[roomId];
  const info = state.info[roomId];
  if (!s || !info) return fail('Oda bulunamadı.');
  if (!isOnline()) return fail(OFFLINE);
  const why = stagePermission(roomId, actorId);
  if (why) return fail(why);
  if (capacity < 1 || capacity > info.classicMax) return fail(`Klasik düzende bu odada en fazla ${info.classicMax} mikrofon açılabilir.`);
  if (s.layoutId === null) {
    const cap = checkCapacity(roomId, capacity);
    if (!cap.ok) return cap;
    resize(roomId, capacity);
    const r = getRoom(roomId);
    if (r?.locked.some((i) => i >= capacity)) setLocks(roomId, r.locked.filter((i) => i < capacity));
  }
  emit({ info: { ...state.info, [roomId]: { ...info, classicCapacity: capacity } } });
  return { ok: true };
}

// --- Slot states --------------------------------------------------------------------------------------------
export type SlotState = 'empty' | 'locked' | 'invited' | 'on' | 'mic_off' | 'mod_muted';
export const SLOT_STATE_LABEL: Record<SlotState, string> = {
  empty: 'boş',
  locked: 'kilitli',
  invited: 'davet bekliyor',
  on: 'mikrofonu açık',
  mic_off: 'mikrofonu kapalı',
  mod_muted: 'yönetim tarafından susturuldu',
};
/**
 * State of every numbered mic, from the presence model. A pending invite marks the seat it asked for, or the
 * free seat it will take when accepted. `micOff(uid)` says whether someone's own mic switch is off.
 */
export function slotStates(r: RoomLive, micOff: (uid: string) => boolean): { state: SlotState; invitee?: string }[] {
  const out: { state: SlotState; invitee?: string }[] = r.seats.map((uid, i) =>
    uid ? { state: r.micMuted.includes(uid) ? 'mod_muted' : micOff(uid) ? 'mic_off' : 'on' } : { state: r.locked.includes(i) ? 'locked' : 'empty' },
  );
  for (const inv of [...r.invites].reverse()) {
    if (inv.status !== 'pending') continue;
    const asked = inv.seat !== undefined && inv.seat > 0 && out[inv.seat]?.state === 'empty' ? inv.seat : -1;
    const seat = asked >= 0 ? asked : out.findIndex((x, i) => i > 0 && x.state === 'empty');
    if (seat >= 0) out[seat] = { state: 'invited', invitee: inv.toId };
  }
  return out;
}

// --- Shared playback ("ortak izleme") ---------------------------------------------------------------------------
/** Where the room's video is now: a playing video moved on by the time since the last change. */
export function expectedPosition(p: Pick<PlaybackState, 'playbackStatus' | 'position' | 'updatedAt' | 'duration'>, now = Date.now()) {
  const pos = p.playbackStatus === 'playing' ? p.position + Math.max(0, now - p.updatedAt) / 1000 : p.position;
  return p.duration ? Math.min(pos, p.duration) : pos;
}
/**
 * What one viewer's player must do to match the room (on reconnect, on every room change, and periodically):
 * seek when further than the tolerance, and play or pause like the room. A viewer who paused or muted for
 * themselves passes `localHold` and is left alone.
 */
export function playerSync(p: PlaybackState, local: { position: number; playing: boolean }, now = Date.now(), localHold = false) {
  const target = expectedPosition(p, now);
  const play = p.playbackStatus === 'playing' && !localHold;
  const seek = !localHold && Math.abs(local.position - target) > SYNC_TOLERANCE_S ? target : null;
  return { seek, play, target };
}

function controlled(roomId: string, actorId: string, action: string): { ok: false; reason: string } | { ok: true; s: RoomStage } {
  const s = state.stages[roomId];
  if (!s) return fail('Oda bulunamadı.');
  if (!isOnline()) return fail(OFFLINE);
  const why = stagePermission(roomId, actorId);
  if (why) {
    log(roomId, actorId, `Reddedildi: ${action}`, s.playback?.videoId ?? '-', false, why);
    return fail(why);
  }
  if (!layoutById(s.layoutId)?.layoutSchema.content) return fail('Bu düzende ortak ekran yok. Video veya Sinema Salonu düzeni seç.');
  return { ok: true, s };
}
/** Opens a YouTube link for the whole room (validated; only the video id is stored). Starts playing. */
export function setVideo(roomId: string, actorId: string, url: string, now = Date.now()): Result<{ playback: PlaybackState }> {
  const c = controlled(roomId, actorId, 'video açma');
  if (!c.ok) return c;
  const parsed = parseYouTubeUrl(url);
  if (!parsed.ok) {
    log(roomId, actorId, 'Reddedildi: video açma', url.slice(0, 80), false, parsed.reason);
    return parsed;
  }
  const playback: PlaybackState = { provider: 'youtube', videoId: parsed.videoId, playbackStatus: 'playing', position: parsed.startSeconds ?? 0, updatedAt: now, updatedBy: actorId };
  put({ ...c.s, playback });
  log(roomId, actorId, 'Video açtı', parsed.videoId, true);
  return { ok: true, playback };
}
function control(roomId: string, actorId: string, action: string, next: (p: PlaybackState) => PlaybackState | string): Result<{ playback: PlaybackState }> {
  const c = controlled(roomId, actorId, action);
  if (!c.ok) return c;
  const p = c.s.playback;
  if (!p) return fail('Odada açık bir video yok.');
  const n = next(p);
  if (typeof n === 'string') return fail(n);
  put({ ...c.s, playback: n });
  log(roomId, actorId, action, p.videoId, true);
  return { ok: true, playback: n };
}
export const playVideo = (roomId: string, actorId: string, now = Date.now()) =>
  control(roomId, actorId, 'Oynattı', (p) => {
    if (p.playbackStatus === 'error') return p.error ?? 'Bu video oynatılamıyor.';
    const at = p.playbackStatus === 'ended' ? 0 : expectedPosition(p, now);
    return { ...p, playbackStatus: 'playing', position: at, updatedAt: now, updatedBy: actorId };
  });
export const pauseVideo = (roomId: string, actorId: string, now = Date.now()) =>
  control(roomId, actorId, 'Duraklattı', (p) => (p.playbackStatus === 'error' ? p : { ...p, playbackStatus: 'paused', position: expectedPosition(p, now), updatedAt: now, updatedBy: actorId }));
/** Seek to an absolute position (seconds); clamped to the video. Keeps playing or paused as it was. */
export const seekVideo = (roomId: string, actorId: string, seconds: number, now = Date.now()) =>
  control(roomId, actorId, 'Konum değiştirdi', (p) => {
    if (!Number.isFinite(seconds)) return 'Geçersiz konum.';
    if (p.playbackStatus === 'error') return p.error ?? 'Bu video oynatılamıyor.';
    const position = Math.max(0, p.duration ? Math.min(seconds, p.duration) : seconds);
    return { ...p, position, playbackStatus: p.playbackStatus === 'ended' ? 'paused' : p.playbackStatus, updatedAt: now, updatedBy: actorId };
  });
export function stopVideo(roomId: string, actorId: string): Result {
  const c = controlled(roomId, actorId, 'Videoyu kapattı');
  if (!c.ok) return c;
  if (!c.s.playback) return { ok: true };
  put({ ...c.s, playback: null });
  log(roomId, actorId, 'Videoyu kapattı', c.s.playback.videoId, true);
  return { ok: true };
}
/**
 * A viewer's player reports what only YouTube knows: the duration, the end, or an error. Errors that belong to
 * the video (removed, private, not embeddable) mark it for the whole room; device errors stay on that device.
 * A report about another video than the current one is ignored (it arrived late).
 */
export function reportPlayer(roomId: string, reporterId: string, report: { videoId: string; duration?: number; ended?: boolean; errorCode?: number }, now = Date.now()) {
  const s = state.stages[roomId];
  const p = s?.playback;
  if (!s || !p || p.videoId !== report.videoId || !getRoom(roomId)?.members.includes(reporterId)) return;
  let next = p;
  if (report.duration && report.duration > 0 && p.duration !== report.duration) next = { ...next, duration: report.duration };
  if (report.errorCode !== undefined && YT_ERRORS[report.errorCode]?.videoLevel && p.playbackStatus !== 'error') {
    next = { ...next, playbackStatus: 'error', error: YT_ERRORS[report.errorCode].text, position: expectedPosition(p, now), updatedAt: now };
  }
  if (report.ended && p.playbackStatus === 'playing' && next.duration && expectedPosition(next, now) >= next.duration - SYNC_TOLERANCE_S) {
    next = { ...next, playbackStatus: 'ended', position: next.duration, updatedAt: now };
  }
  if (next !== p) put({ ...s, playback: next });
}

/** Test support: forget all stages and restore the catalog. */
export function resetStages() {
  state = { stages: {}, info: {}, layouts: ROOM_LAYOUTS, audit: [] };
}
