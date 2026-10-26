// PK Battle module (spec "PK BATTLE MODÜLÜ"): team PK only, two modes:
//   - room:  one room split into Red and Blue teams; a gift scores for the team of its recipient.
//   - cross: two rooms against each other; every valid gift in a room scores for that room's team.
// No 1v1 / individual PK exists anywhere in this module.
//
// This file plays the PK server: it owns the clock (endAt), the score, idempotent gift records and the
// result. Clients only render. It never touches seats, microphones or room membership.
import { useSyncExternalStore } from 'react';

import { GIFTS, ROOMS, roomById, userById } from '@/data/mock';

export const PK_DURATIONS = [15, 30, 60, 120] as const;
export type PkDuration = (typeof PK_DURATIONS)[number];
export type PkKind = 'room' | 'cross';
export type PkStatus = 'invite' | 'prep' | 'active' | 'done' | 'cancelled';
export type TeamId = 'red' | 'blue';

export type PkConfig = {
  version: number;
  roomPkEnabled: boolean;
  crossPkEnabled: boolean;
  durations: Record<PkDuration, boolean>;
  teamMin: number;
  teamMax: number;
  inviteTimeoutSec: number;
  prepSeconds: number;
  teamNames: Record<TeamId, string>;
  teamColors: Record<TeamId, string>;
  /** PK points per gift id; gifts not listed score 1 point per coin. 0 = gift doesn't score. */
  giftPoints: Record<string, number>;
  /** Users or rooms not allowed to start/join PKs. */
  restricted: string[];
};

export type PkTeam = { id: TeamId; name: string; color: string; roomId: string; members: string[]; score: number };
export type PkRecord = { txId: string; teamId: TeamId; senderId: string; giftId: string; coins: number; points: number; at: number; status: 'Doğrulandı' | 'Reddedildi'; note?: string };
export type PkSession = {
  id: string;
  kind: PkKind;
  status: PkStatus;
  roomId: string; // the room that started it
  opponentRoomId?: string;
  durationMin: PkDuration;
  configVersion: number;
  /** Scoring frozen at start: config changes never affect a running PK. */
  giftPoints: Record<string, number>;
  teams: [PkTeam, PkTeam];
  createdAt: number;
  inviteExpiresAt?: number;
  startAt?: number;
  endAt?: number;
  records: PkRecord[];
  result?: { winner: TeamId | 'tie'; red: number; blue: number; diff: number; validGifts: number };
  cancelReason?: string;
};
export type PkAudit = { id: string; at: string; actor: string; action: string; target: string; note?: string };

const DEFAULT_CONFIG: PkConfig = {
  version: 1,
  roomPkEnabled: true,
  crossPkEnabled: true,
  durations: { 15: true, 30: true, 60: true, 120: true },
  teamMin: 1,
  teamMax: 6,
  inviteTimeoutSec: 60,
  prepSeconds: 5,
  teamNames: { red: 'Kırmızı Takım', blue: 'Mavi Takım' },
  teamColors: { red: '#FF6576', blue: '#3B82F6' },
  giftPoints: {},
  restricted: [],
};

/** Demo switch for the opponent room's answer to a cross-room invite. */
export type InviteScenario = 'accept' | 'decline' | 'timeout';

type State = { config: PkConfig; sessions: PkSession[]; audit: PkAudit[]; duplicates: number; mismatches: string[]; scenario: InviteScenario; seen: string[] };
let state: State = { config: DEFAULT_CONFIG, sessions: [], audit: [], duplicates: 0, mismatches: [], scenario: 'accept', seen: [] };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const getPk = () => state;
export function usePk() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getPk,
    getPk,
  );
}

const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const clock = () => `${new Date().toLocaleDateString('tr-TR')} ${new Date().toTimeString().slice(0, 5)}`;
const log = (actor: string, action: string, target: string, note?: string) => emit({ audit: [{ id: rid(), at: clock(), actor, action, target, note }, ...state.audit].slice(0, 300) });
const put = (s: PkSession) => emit({ sessions: [s, ...state.sessions.filter((x) => x.id !== s.id)] });
const byId = (id: string) => state.sessions.find((s) => s.id === id);
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const later = (pkId: string, ms: number, fn: () => void) => timers.set(pkId, [...(timers.get(pkId) ?? []), setTimeout(fn, ms)]);
const stop = (pkId: string) => {
  timers.get(pkId)?.forEach(clearTimeout);
  timers.delete(pkId);
};

export const pointsFor = (giftPoints: Record<string, number>, giftId: string, coins: number) => (giftId in giftPoints ? giftPoints[giftId] : coins);
const OPEN: PkStatus[] = ['invite', 'prep', 'active'];
/** One active PK per room (spec §4, first-release rule). */
export const pkOfRoom = (roomId: string) => state.sessions.find((s) => OPEN.includes(s.status) && (s.roomId === roomId || s.opponentRoomId === roomId));
export const lastPkOfRoom = (roomId: string) => state.sessions.find((s) => s.roomId === roomId || s.opponentRoomId === roomId);

// --- Admin ---------------------------------------------------------------------------------------
export function updateConfig(patch: Partial<PkConfig>, actor = 'Sen (yönetici)') {
  emit({ config: { ...state.config, ...patch, version: state.config.version + 1 } });
  log(actor, 'PK ayarı değişti', Object.keys(patch).join(', '), `sürüm ${state.config.version}`);
}
export const setInviteScenario = (scenario: InviteScenario) => emit({ scenario });
/** Result card dismissed by this viewer (client-side only). */
export const markPkSeen = (pkId: string) => emit({ seen: [...state.seen, pkId] });

// --- Start ---------------------------------------------------------------------------------------
export type StartResult = { ok: true; pk: PkSession } | { ok: false; reason: string };
function checkStart(kind: PkKind, roomId: string, starterId: string, durationMin: number): string | null {
  const c = state.config;
  if (kind === 'room' && !c.roomPkEnabled) return 'Oda içi takım PK şu an kapalı.';
  if (kind === 'cross' && !c.crossPkEnabled) return 'Odalar arası takım PK şu an kapalı.';
  if (!PK_DURATIONS.includes(durationMin as PkDuration) || !c.durations[durationMin as PkDuration]) return 'Bu süre seçilemez. İzinli süreler: 15, 30, 60, 120 dakika.';
  if (c.restricted.includes(starterId) || c.restricted.includes(roomId)) return 'PK başlatma bu kullanıcı veya oda için kısıtlandı.';
  if (pkOfRoom(roomId)) return 'Bu odada zaten devam eden bir PK var.';
  return null;
}

const teams = (redRoom: string, blueRoom: string, red: string[], blue: string[]): [PkTeam, PkTeam] => [
  { id: 'red', name: state.config.teamNames.red, color: state.config.teamColors.red, roomId: redRoom, members: red, score: 0 },
  { id: 'blue', name: state.config.teamNames.blue, color: state.config.teamColors.blue, roomId: blueRoom, members: blue, score: 0 },
];

/** Room PK: teams are fixed at start; switching teams after start is off. */
export function startRoomPk(roomId: string, starterId: string, durationMin: number, red: string[], blue: string[]): StartResult {
  const err = checkStart('room', roomId, starterId, durationMin);
  if (err) return { ok: false, reason: err };
  const { teamMin, teamMax } = state.config;
  if (red.length < teamMin || blue.length < teamMin) return { ok: false, reason: `Her takımda en az ${teamMin} kişi olmalı.` };
  if (red.length > teamMax || blue.length > teamMax) return { ok: false, reason: `Bir takımda en fazla ${teamMax} kişi olabilir.` };
  if (red.some((u) => blue.includes(u))) return { ok: false, reason: 'Bir kişi iki takımda birden olamaz.' };
  const pk: PkSession = {
    id: `PK-${rid()}`,
    kind: 'room',
    status: 'prep',
    roomId,
    durationMin: durationMin as PkDuration,
    configVersion: state.config.version,
    giftPoints: { ...state.config.giftPoints },
    teams: teams(roomId, roomId, red, blue),
    createdAt: Date.now(),
    records: [],
  };
  put(pk);
  log(userById(starterId).name, 'Oda içi PK başlattı', roomTitle(roomId), `${durationMin} dk · ${red.length}v${blue.length}`);
  begin(pk.id);
  return { ok: true, pk };
}

/** Cross-room PK: an invite the other room's manager must accept within the timeout. */
export function inviteCrossPk(roomId: string, starterId: string, opponentRoomId: string, durationMin: number): StartResult {
  const err = checkStart('cross', roomId, starterId, durationMin);
  if (err) return { ok: false, reason: err };
  if (opponentRoomId === roomId) return { ok: false, reason: 'Odanı kendine davet edemezsin.' };
  if (pkOfRoom(opponentRoomId)) return { ok: false, reason: `${roomTitle(opponentRoomId)} şu an başka bir PK’da.` };
  if (state.config.restricted.includes(opponentRoomId)) return { ok: false, reason: 'Bu oda PK davetlerine kapalı.' };
  const pk: PkSession = {
    id: `PK-${rid()}`,
    kind: 'cross',
    status: 'invite',
    roomId,
    opponentRoomId,
    durationMin: durationMin as PkDuration,
    configVersion: state.config.version,
    giftPoints: { ...state.config.giftPoints },
    teams: teams(roomId, opponentRoomId, [], []),
    createdAt: Date.now(),
    inviteExpiresAt: Date.now() + state.config.inviteTimeoutSec * 1000,
    records: [],
  };
  put(pk);
  log(userById(starterId).name, 'Odalar arası PK daveti', roomTitle(opponentRoomId), `${durationMin} dk`);
  // The other room's manager answers (simulated); no answer = timeout.
  const scenario = state.scenario;
  if (scenario === 'timeout') later(pk.id, state.config.inviteTimeoutSec * 1000, () => expireInvite(pk.id));
  else later(pk.id, 2500, () => answerInvite(pk.id, scenario === 'accept'));
  return { ok: true, pk };
}

export function answerInvite(pkId: string, accept: boolean) {
  const pk = byId(pkId);
  if (!pk || pk.status !== 'invite') return;
  if (!accept) {
    stop(pkId);
    put({ ...pk, status: 'cancelled', cancelReason: `${roomTitle(pk.opponentRoomId!)} daveti reddetti. PK başlamadı.` });
    log(roomTitle(pk.opponentRoomId!), 'PK davetini reddetti', roomTitle(pk.roomId));
    return;
  }
  log(roomTitle(pk.opponentRoomId!), 'PK davetini kabul etti', roomTitle(pk.roomId));
  begin(pkId);
}
function expireInvite(pkId: string) {
  const pk = byId(pkId);
  if (!pk || pk.status !== 'invite') return;
  put({ ...pk, status: 'cancelled', cancelReason: 'Rakip oda zamanında yanıt vermedi. PK başlamadı.' });
  log('Sistem', 'PK daveti zaman aşımı', roomTitle(pk.opponentRoomId!));
}

/** Prep countdown, then active; the end time is set here, once, by the server. */
function begin(pkId: string) {
  const pk = byId(pkId);
  if (!pk) return;
  const startAt = Date.now() + state.config.prepSeconds * 1000;
  const endAt = startAt + pk.durationMin * 60_000;
  put({ ...pk, status: 'prep', startAt, endAt, inviteExpiresAt: undefined });
  later(pkId, startAt - Date.now(), () => {
    const cur = byId(pkId);
    if (cur?.status === 'prep') put({ ...cur, status: 'active' });
    if (cur?.kind === 'cross') simulateOpponentRoom(pkId);
  });
  later(pkId, endAt - Date.now(), () => finalize(pkId));
}

// --- Scoring -------------------------------------------------------------------------------------
export type RecordResult = { ok: true; points: number; teamId: TeamId } | { ok: false; reason: string; duplicate?: boolean };
/**
 * Called by the gift service after the coins were taken successfully. Idempotent per txId.
 * Only gifts inside the active window score; the team comes from the PK, never from the client.
 */
export function recordGift(roomId: string, txId: string, senderId: string, recipientId: string, giftId: string, coins: number): RecordResult {
  const pk = pkOfRoom(roomId);
  if (!pk) return { ok: false, reason: 'Odada aktif PK yok.' };
  if (pk.records.some((r) => r.txId === txId)) {
    emit({ duplicates: state.duplicates + 1 });
    log('Sistem', 'Tekrar eden hediye işlemi reddedildi', pk.id, txId);
    return { ok: false, reason: 'Bu işlem zaten sayıldı.', duplicate: true };
  }
  const now = Date.now();
  if (pk.status !== 'active' || !pk.startAt || !pk.endAt || now < pk.startAt || now >= pk.endAt) return { ok: false, reason: 'PK aktif değil; bu hediye skora eklenmez.' };
  let teamId: TeamId | null;
  if (pk.kind === 'cross') teamId = pk.teams.find((t) => t.roomId === roomId)!.id;
  else teamId = pk.teams.find((t) => t.members.includes(recipientId))?.id ?? null;
  if (!teamId) return { ok: false, reason: 'Hediyeyi alan kişi bir takımda değil; skora eklenmez.' };
  const points = pointsFor(pk.giftPoints, giftId, coins);
  const rec: PkRecord = { txId, teamId, senderId, giftId, coins, points, at: now, status: points > 0 ? 'Doğrulandı' : 'Reddedildi', note: points > 0 ? undefined : 'Bu hediye PK puanı kazandırmıyor' };
  const t = pk.teams.map((x) => (x.id === teamId ? { ...x, score: x.score + Math.max(0, points) } : x)) as [PkTeam, PkTeam];
  put({ ...pk, teams: t, records: [...pk.records, rec] });
  return { ok: true, points, teamId };
}

/** The coins were taken but the PK record failed: kept for reconciliation (spec §6 last rule). */
export function reportMismatch(txId: string, note: string) {
  emit({ mismatches: [`${clock()} · ${txId} · ${note}`, ...state.mismatches].slice(0, 100) });
}

function simulateOpponentRoom(pkId: string) {
  const tick = () => {
    const pk = byId(pkId);
    if (!pk || pk.status !== 'active') return;
    const room = pk.opponentRoomId!;
    const g = GIFTS[Math.floor(Math.random() * 6)];
    const sender = ['u2', 'u4', 'u6', 'u8', 'u10', 'u12'][Math.floor(Math.random() * 6)];
    if (Math.random() < 0.6) recordGift(room, `OPP-${rid()}`, sender, roomById(room)?.hostId ?? 'u1', g.id, g.price);
    later(pkId, 3500, tick);
  };
  later(pkId, 2000, tick);
}

// --- End -----------------------------------------------------------------------------------------
function finalize(pkId: string) {
  const pk = byId(pkId);
  if (!pk || pk.status !== 'active') return;
  stop(pkId);
  const [red, blue] = pk.teams;
  const valid = pk.records.filter((r) => r.status === 'Doğrulandı').length;
  put({ ...pk, status: 'done', result: { winner: red.score === blue.score ? 'tie' : red.score > blue.score ? 'red' : 'blue', red: red.score, blue: blue.score, diff: Math.abs(red.score - blue.score), validGifts: valid } });
  log('Sistem', 'PK tamamlandı', pk.id, `${red.score} - ${blue.score}`);
}

/** Test/admin: end now through the same server path (no client-decided result). */
export function finishNow(pkId: string, actor = 'Sen (yönetici)') {
  const pk = byId(pkId);
  if (!pk || pk.status !== 'active') return;
  log(actor, 'Süreyi bitirdi (test)', pk.id);
  put({ ...pk, endAt: Date.now() });
  finalize(pkId);
}

/**
 * Cancel by a moderator or because a room closed. Policy: no winner; points are void; gifts already
 * delivered stay delivered (recipients received them) and are not refunded.
 */
export function cancelPk(pkId: string, reason: string, actor = 'Sen (moderatör)') {
  const pk = byId(pkId);
  if (!pk || !OPEN.includes(pk.status)) return;
  stop(pkId);
  put({ ...pk, status: 'cancelled', cancelReason: reason });
  log(actor, 'PK iptal edildi', pk.id, reason);
}

export const roomTitle = (id: string) => (id === 'yeni' ? 'Benim Odam' : (roomById(id)?.title ?? id));
/** Rooms that can be invited right now (not already in a PK). */
export const invitableRooms = (roomId: string) => ROOMS.filter((r) => r.id !== roomId && !pkOfRoom(r.id));

export function topSupporters(pk: PkSession, teamId: TeamId, n = 3) {
  const totals: Record<string, number> = {};
  pk.records.filter((r) => r.teamId === teamId && r.status === 'Doğrulandı').forEach((r) => (totals[r.senderId] = (totals[r.senderId] ?? 0) + r.points));
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
