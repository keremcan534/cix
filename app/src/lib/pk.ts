// PK module. Three ways to play:
//   - room / solo  ("Normal PK", default): everyone on a mic competes alone; a gift scores for its recipient.
//                  The room keeps its normal mic layout and there are no teams.
//   - room / team  ("Takım PK"): one room split into Red and Blue; a gift scores for the recipient and their team.
//   - cross        (always team): two rooms against each other; every valid gift in a room scores for that room.
//
// This file plays the PK server: it owns the clock (endAt), the team draw, the score, idempotent gift records,
// the result and the crown relations. Clients only render. It reads who is on a mic from the presence server
// (lib/room-presence) and never changes seats, microphones or room membership.
import { useSyncExternalStore } from 'react';

import { GIFTS, ROOMS, roomById, userById } from '@/data/mock';
import { micUsersOf, onMicNow, roleOf } from '@/lib/room-presence';

export const PK_DURATIONS = [15, 30, 60, 120] as const;
export type PkDuration = (typeof PK_DURATIONS)[number];
export type PkKind = 'room' | 'cross';
export type PkMode = 'solo' | 'team';
export type PkStatus = 'invite' | 'prep' | 'active' | 'done' | 'cancelled';
export type TeamId = 'red' | 'blue';

export type PkConfig = {
  version: number;
  /** Normal (individual) room PK. */
  soloPkEnabled: boolean;
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
export type RecordStatus = 'Doğrulandı' | 'Reddedildi' | 'İade edildi';
export type PkRecord = { txId: string; teamId?: TeamId; senderId: string; recipientId: string; giftId: string; coins: number; points: number; at: number; status: RecordStatus; note?: string };
/** One "who crowned whom" relation: the sum of one sender's valid gifts to one crowned person. */
export type PkCrown = { senderId: string; recipientId: string; points: number; gifts: number; /** share of the crowned person's points */ share: number; /** this crowned person's biggest contributor */ top: boolean };
export type PkResultData = {
  /** Team modes: the winning team, or 'tie'. Normal PK: null. */
  winner: TeamId | 'tie' | null;
  /** Normal PK: people with the top score (one = clear winner, several = tie, none = nobody scored). */
  winners: string[];
  red: number;
  blue: number;
  /** Team: score gap. Normal PK: gap between first and second. */
  diff: number;
  validGifts: number;
  ranking: { userId: string; points: number; teamId?: TeamId }[];
  crowned: string[];
  crowns: PkCrown[];
  /** Why nobody was crowned (tie, no points). */
  noCrown?: string;
};
export type PkSession = {
  id: string;
  kind: PkKind;
  mode: PkMode;
  status: PkStatus;
  roomId: string; // the room that started it
  opponentRoomId?: string;
  durationMin: PkDuration;
  configVersion: number;
  /** Scoring frozen at start: config changes never affect a running PK. */
  giftPoints: Record<string, number>;
  /** Team modes only; in Normal PK both teams stay empty and unused. */
  teams: [PkTeam, PkTeam];
  /** Normal PK: everyone competing (mic users at start, then anyone who scores from a mic later). */
  participants: string[];
  /** PK points received per person (valid gifts only). Cross-room PK keys them per room: see `pointKey`. */
  points: Record<string, number>;
  createdAt: number;
  requestId?: string;
  inviteExpiresAt?: number;
  startAt?: number;
  endAt?: number;
  records: PkRecord[];
  result?: PkResultData;
  cancelReason?: string;
};
export type PkAudit = { id: string; at: string; actor: string; action: string; target: string; note?: string };
/** Server-side random team draw, shown to the starter before the PK starts; the start uses it as is. */
export type TeamDraft = { id: string; roomId: string; red: string[]; blue: string[]; out: string[]; at: number };

const DEFAULT_CONFIG: PkConfig = {
  version: 1,
  soloPkEnabled: true,
  roomPkEnabled: true,
  crossPkEnabled: true,
  durations: { 15: true, 30: true, 60: true, 120: true },
  teamMin: 1,
  teamMax: 8,
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
const initial = (): State => ({ config: DEFAULT_CONFIG, sessions: [], audit: [], duplicates: 0, mismatches: [], scenario: 'accept', seen: [] });
let state: State = initial();
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
const drafts = new Map<string, TeamDraft>();
const nameOf = (uid: string) => (uid === 'me' ? 'Sen' : userById(uid).name);

export const pointsFor = (giftPoints: Record<string, number>, giftId: string, coins: number) => (giftId in giftPoints ? giftPoints[giftId] : coins);
const OPEN: PkStatus[] = ['invite', 'prep', 'active'];
/** One active PK per room (spec §4, first-release rule). */
export const pkOfRoom = (roomId: string) => state.sessions.find((s) => OPEN.includes(s.status) && (s.roomId === roomId || s.opponentRoomId === roomId));
export const lastPkOfRoom = (roomId: string) => state.sessions.find((s) => s.roomId === roomId || s.opponentRoomId === roomId);
export const teamOf = (pk: PkSession, uid: string) => pk.teams.find((t) => t.members.includes(uid));
/** Per-person points key. Across rooms the same person may receive gifts in both rooms; those stay apart. */
export const pointKey = (pk: Pick<PkSession, 'kind'>, roomId: string, uid: string) => (pk.kind === 'cross' ? `${roomId}|${uid}` : uid);
/** Points a person received in this PK, as seen from one room. */
export const pkPointsFor = (pk: PkSession, roomId: string, uid: string) => pk.points[pointKey(pk, roomId, uid)] ?? 0;
export const modeLabel = (pk: Pick<PkSession, 'kind' | 'mode'>) => (pk.kind === 'cross' ? 'Odalar arası PK' : pk.mode === 'solo' ? 'Normal PK' : 'Takım PK');

// --- Admin ---------------------------------------------------------------------------------------
export function updateConfig(patch: Partial<PkConfig>, actor = 'Sen (yönetici)') {
  emit({ config: { ...state.config, ...patch, version: state.config.version + 1 } });
  log(actor, 'PK ayarı değişti', Object.keys(patch).join(', '), `sürüm ${state.config.version}`);
}
export const setInviteScenario = (scenario: InviteScenario) => emit({ scenario });
/** Result card / crown screen dismissed by this viewer (client-side only). Keys: `<pkId>` and `<pkId>:crowns`. */
export const markPkSeen = (key: string) => !state.seen.includes(key) && emit({ seen: [...state.seen, key] });

// --- Start ---------------------------------------------------------------------------------------
export type StartResult = { ok: true; pk: PkSession } | { ok: false; reason: string };
function checkStart(kind: PkKind, mode: PkMode, roomId: string, starterId: string, durationMin: number): string | null {
  const c = state.config;
  if (kind === 'room' && mode === 'solo' && !c.soloPkEnabled) return 'Normal PK şu an kapalı.';
  if (kind === 'room' && mode === 'team' && !c.roomPkEnabled) return 'Oda içi takım PK şu an kapalı.';
  if (kind === 'cross' && !c.crossPkEnabled) return 'Odalar arası takım PK şu an kapalı.';
  if (!PK_DURATIONS.includes(durationMin as PkDuration) || !c.durations[durationMin as PkDuration]) return 'Bu süre seçilemez. İzinli süreler: 15, 30, 60, 120 dakika.';
  if (c.restricted.includes(starterId) || c.restricted.includes(roomId)) return 'PK başlatma bu kullanıcı veya oda için kısıtlandı.';
  if (roleOf(roomId, starterId) === 'member') return 'PK’yı oda sahibi veya yöneticiler başlatabilir.';
  if (pkOfRoom(roomId)) return 'Bu odada zaten devam eden bir PK var.';
  return null;
}

const teams = (redRoom: string, blueRoom: string, red: string[], blue: string[]): [PkTeam, PkTeam] => [
  { id: 'red', name: state.config.teamNames.red, color: state.config.teamColors.red, roomId: redRoom, members: red, score: 0 },
  { id: 'blue', name: state.config.teamNames.blue, color: state.config.teamColors.blue, roomId: blueRoom, members: blue, score: 0 },
];

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/**
 * Random teams from the people on a mic right now (server side). Sizes differ by at most one; with more
 * people than both teams can hold, the extra ones stay out of this PK. Calling it again reshuffles.
 */
export function drawTeams(roomId: string, starterId: string): { ok: true; draft: TeamDraft } | { ok: false; reason: string } {
  if (roleOf(roomId, starterId) === 'member') return { ok: false, reason: 'Takımları oda sahibi veya yöneticiler oluşturabilir.' };
  const { teamMin, teamMax } = state.config;
  const pool = shuffle(micUsersOf(roomId));
  const take = pool.slice(0, teamMax * 2);
  if (take.length < teamMin * 2) return { ok: false, reason: `Takım PK için mikrofonda en az ${teamMin * 2} kişi olmalı.` };
  const redSize = take.length % 2 === 0 ? take.length / 2 : Math.floor(take.length / 2) + (Math.random() < 0.5 ? 1 : 0);
  const draft: TeamDraft = { id: `TD-${rid()}`, roomId, red: take.slice(0, redSize), blue: take.slice(redSize), out: pool.slice(take.length), at: Date.now() };
  drafts.set(draft.id, draft);
  return { ok: true, draft };
}

export type StartOpts = { roomId: string; starterId: string; durationMin: number; requestId?: string } & (
  | { mode: 'solo' }
  | { mode: 'team'; draftId: string }
  | { mode: 'team'; red: string[]; blue: string[] }
);
/**
 * Room PK. Normal: everyone on a mic competes. Team: from a server draw (draftId) or a manual split, both
 * validated against the people on a mic now; teams are fixed once it starts. A repeated request (same
 * requestId, e.g. a retry after a dropped connection) returns the PK it already started.
 */
export function startRoomPk(opts: StartOpts): StartResult {
  const { roomId, starterId, durationMin, requestId } = opts;
  const again = requestId ? state.sessions.find((s) => s.requestId === requestId) : undefined;
  if (again) return { ok: true, pk: again };
  const err = checkStart('room', opts.mode, roomId, starterId, durationMin);
  if (err) return { ok: false, reason: err };
  const onMic = micUsersOf(roomId);
  let red: string[] = [];
  let blue: string[] = [];
  let participants: string[] = [];
  if (opts.mode === 'solo') {
    participants = onMic;
    if (participants.length < 2) return { ok: false, reason: 'Normal PK için mikrofonda en az 2 kişi olmalı.' };
  } else {
    if ('draftId' in opts) {
      const d = drafts.get(opts.draftId);
      if (!d || d.roomId !== roomId) return { ok: false, reason: 'Takım dağılımı bulunamadı. Takımları yeniden oluştur.' };
      red = d.red;
      blue = d.blue;
    } else {
      red = [...new Set(opts.red)];
      blue = [...new Set(opts.blue)];
    }
    const { teamMin, teamMax } = state.config;
    if (red.some((u) => blue.includes(u))) return { ok: false, reason: 'Bir kişi iki takımda birden olamaz.' };
    const gone = [...red, ...blue].filter((u) => !onMic.includes(u));
    if (gone.length) return { ok: false, reason: `${gone.map(nameOf).join(', ')} artık mikrofonda değil. Takımları yeniden oluştur.` };
    if (red.length < teamMin || blue.length < teamMin) return { ok: false, reason: `Her takımda en az ${teamMin} kişi olmalı.` };
    if (red.length > teamMax || blue.length > teamMax) return { ok: false, reason: `Bir takımda en fazla ${teamMax} kişi olabilir.` };
    if ('draftId' in opts) drafts.delete(opts.draftId);
  }
  const pk: PkSession = {
    id: `PK-${rid()}`,
    kind: 'room',
    mode: opts.mode,
    status: 'prep',
    roomId,
    durationMin: durationMin as PkDuration,
    configVersion: state.config.version,
    giftPoints: { ...state.config.giftPoints },
    teams: teams(roomId, roomId, red, blue),
    participants,
    points: {},
    createdAt: Date.now(),
    requestId,
    records: [],
  };
  put(pk);
  log(nameOf(starterId), opts.mode === 'solo' ? 'Normal PK başlattı' : 'Oda içi takım PK başlattı', roomTitle(roomId), `${durationMin} dk · ${opts.mode === 'solo' ? `${participants.length} kişi` : `${red.length}v${blue.length}`}`);
  begin(pk.id);
  return { ok: true, pk };
}

/** Cross-room PK: an invite the other room's manager must accept within the timeout. */
export function inviteCrossPk(roomId: string, starterId: string, opponentRoomId: string, durationMin: number): StartResult {
  const err = checkStart('cross', 'team', roomId, starterId, durationMin);
  if (err) return { ok: false, reason: err };
  if (opponentRoomId === roomId) return { ok: false, reason: 'Odanı kendine davet edemezsin.' };
  if (pkOfRoom(opponentRoomId)) return { ok: false, reason: `${roomTitle(opponentRoomId)} şu an başka bir PK’da.` };
  if (state.config.restricted.includes(opponentRoomId)) return { ok: false, reason: 'Bu oda PK davetlerine kapalı.' };
  const pk: PkSession = {
    id: `PK-${rid()}`,
    kind: 'cross',
    mode: 'team',
    status: 'invite',
    roomId,
    opponentRoomId,
    durationMin: durationMin as PkDuration,
    configVersion: state.config.version,
    giftPoints: { ...state.config.giftPoints },
    teams: teams(roomId, opponentRoomId, [], []),
    participants: [],
    points: {},
    createdAt: Date.now(),
    inviteExpiresAt: Date.now() + state.config.inviteTimeoutSec * 1000,
    records: [],
  };
  put(pk);
  log(nameOf(starterId), 'Odalar arası PK daveti', roomTitle(opponentRoomId), `${durationMin} dk`);
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
export type RecordResult = { ok: true; points: number; teamId?: TeamId } | { ok: false; reason: string; duplicate?: boolean };
/**
 * Called by the gift service after the coins were taken successfully. Idempotent per txId.
 * Only gifts inside the active window score. Who scores is decided here, never by the client:
 *  - cross: the team of the room the gift was sent in;
 *  - room: the recipient, who must be on a mic at that moment (and, in Takım PK, on a team).
 * A gift that doesn't score is kept as a rejected record with the reason.
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
  const base = { txId, senderId, recipientId, giftId, coins, at: now };
  const reject = (reason: string, teamId?: TeamId): RecordResult => {
    put({ ...pk, records: [...pk.records, { ...base, teamId, points: 0, status: 'Reddedildi', note: reason }] });
    return { ok: false, reason };
  };
  let teamId: TeamId | undefined;
  let participants = pk.participants;
  if (pk.kind === 'cross') teamId = pk.teams.find((t) => t.roomId === roomId)!.id;
  else {
    if (!onMicNow(roomId, recipientId)) return reject('Hediyeyi alan kişi o anda mikrofonda değildi; PK puanı yazılmaz.');
    if (pk.mode === 'team') {
      teamId = teamOf(pk, recipientId)?.id;
      if (!teamId) return reject('Hediyeyi alan kişi bir takımda değil; skora eklenmez.');
    } else if (!participants.includes(recipientId)) participants = [...participants, recipientId]; // joined a mic after the start
  }
  const points = pointsFor(pk.giftPoints, giftId, coins);
  if (points <= 0) return reject('Bu hediye PK puanı kazandırmıyor', teamId);
  const rec: PkRecord = { ...base, teamId, points, status: 'Doğrulandı' };
  const t = pk.teams.map((x) => (x.id === teamId ? { ...x, score: x.score + points } : x)) as [PkTeam, PkTeam];
  const key = pointKey(pk, roomId, recipientId);
  put({ ...pk, teams: t, participants, points: { ...pk.points, [key]: (pk.points[key] ?? 0) + points }, records: [...pk.records, rec] });
  return { ok: true, points, teamId };
}

/** The coins were taken but the PK record failed: kept for reconciliation (spec §6 last rule). */
export function reportMismatch(txId: string, note: string) {
  emit({ mismatches: [`${clock()} · ${txId} · ${note}`, ...state.mismatches].slice(0, 100) });
}

/**
 * A scored gift was refunded or reversed by the payment side. While the PK is running its points are taken
 * back from the person and the team. After the result is final it never changes; the reversal is kept for
 * reconciliation instead. A cancelled PK has no points to change.
 */
export function revokeGift(txId: string, reason: string, actor = 'Ödeme sistemi'): { ok: true; changed: boolean } | { ok: false; reason: string } {
  const pk = state.sessions.find((s) => s.records.some((r) => r.txId === txId));
  const rec = pk?.records.find((r) => r.txId === txId);
  if (!pk || !rec) return { ok: false, reason: 'Bu işlem hiçbir PK’da sayılmadı.' };
  if (rec.status !== 'Doğrulandı') return { ok: false, reason: 'Bu işlem zaten puan getirmiyor.' };
  if (pk.status === 'done' || pk.status === 'cancelled') {
    reportMismatch(txId, `PK ${pk.status === 'done' ? 'sonuçlandıktan' : 'iptal edildikten'} sonra iade: ${reason}. Sonuç değişmedi.`);
    log(actor, 'Sonuç sonrası iade kaydı', pk.id, txId);
    return { ok: true, changed: false };
  }
  const records = pk.records.map((r) => (r.txId === txId ? { ...r, status: 'İade edildi' as const, note: reason } : r));
  const t = pk.teams.map((x) => (x.id === rec.teamId ? { ...x, score: x.score - rec.points } : x)) as [PkTeam, PkTeam];
  const key = pointKey(pk, pk.teams.find((x) => x.id === rec.teamId)?.roomId ?? pk.roomId, rec.recipientId);
  put({ ...pk, records, teams: t, points: { ...pk.points, [key]: (pk.points[key] ?? 0) - rec.points } });
  log(actor, 'Hediye iadesi PK puanından düşüldü', pk.id, `${txId} · -${rec.points}`);
  return { ok: true, changed: true };
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

// --- Result --------------------------------------------------------------------------------------
/**
 * Crown rule ("Taç Kazandıranlar"):
 *  - The crown goes only to a clear winning side: in Normal PK the single person with the top score; in Takım
 *    PK the winning team's members who received points; across rooms the people in the winning room who
 *    received points. A tie, or a PK where nobody scored, gives no crown.
 *  - Someone "crowned" a person when they sent that person at least one valid gift (verified, not refunded)
 *    during the PK. The contribution is the PK points of those gifts.
 *  - Several senders: one relation per sender → crowned person, sorted by contribution; each crowned
 *    person's biggest contributor (all of them when tied) is marked as the top one.
 */
export function computeCrowns(pk: PkSession, winner: TeamId | 'tie' | null, winners: string[]): Pick<PkResultData, 'crowned' | 'crowns' | 'noCrown'> {
  const valid = pk.records.filter((r) => r.status === 'Doğrulandı');
  if (!valid.length) return { crowned: [], crowns: [], noCrown: 'Bu PK’da geçerli hediye olmadığı için taç verilmedi.' };
  let onWinningSide: (r: PkRecord) => boolean;
  if (pk.mode === 'solo') {
    if (winners.length !== 1) return { crowned: [], crowns: [], noCrown: 'Birinciler berabere kaldığı için taç verilmedi.' };
    onWinningSide = (r) => r.recipientId === winners[0];
  } else {
    if (winner === 'tie' || !winner) return { crowned: [], crowns: [], noCrown: 'Takımlar berabere kaldığı için taç verilmedi.' };
    onWinningSide = (r) => r.teamId === winner;
  }
  const pairs = new Map<string, PkCrown>();
  const received: Record<string, number> = {};
  valid.filter(onWinningSide).forEach((r) => {
    const key = `${r.senderId}→${r.recipientId}`;
    const c = pairs.get(key) ?? { senderId: r.senderId, recipientId: r.recipientId, points: 0, gifts: 0, share: 0, top: false };
    pairs.set(key, { ...c, points: c.points + r.points, gifts: c.gifts + 1 });
    received[r.recipientId] = (received[r.recipientId] ?? 0) + r.points;
  });
  const crowns = [...pairs.values()].map((c) => ({ ...c, share: received[c.recipientId] ? c.points / received[c.recipientId] : 0 }));
  const best: Record<string, number> = {};
  crowns.forEach((c) => (best[c.recipientId] = Math.max(best[c.recipientId] ?? 0, c.points)));
  const crowned = Object.keys(received).sort((a, b) => received[b] - received[a]);
  return {
    crowned,
    crowns: crowns.map((c) => ({ ...c, top: c.points === best[c.recipientId] })).sort((a, b) => crowned.indexOf(a.recipientId) - crowned.indexOf(b.recipientId) || b.points - a.points),
  };
}

/** The final result from the server's records; the same for every viewer. */
export function computeResult(pk: PkSession): PkResultData {
  const [red, blue] = pk.teams;
  const validGifts = pk.records.filter((r) => r.status === 'Doğrulandı').length;
  if (pk.mode === 'solo') {
    const ids = [...new Set([...pk.participants, ...Object.keys(pk.points)])];
    const ranking = ids.map((userId) => ({ userId, points: pk.points[userId] ?? 0 })).sort((a, b) => b.points - a.points);
    const top = ranking[0]?.points ?? 0;
    const winners = top > 0 ? ranking.filter((r) => r.points === top).map((r) => r.userId) : [];
    const diff = winners.length === 1 ? top - (ranking[1]?.points ?? 0) : 0;
    return { winner: null, winners, red: 0, blue: 0, diff, validGifts, ranking, ...computeCrowns(pk, null, winners) };
  }
  const winner: TeamId | 'tie' = red.score === blue.score ? 'tie' : red.score > blue.score ? 'red' : 'blue';
  if (pk.kind === 'cross') {
    // One entry per person per room: keys are `<room>|<user>`.
    const ranking = Object.entries(pk.points)
      .map(([key, points]) => {
        const [roomId, userId] = key.split('|');
        return { userId, points, teamId: pk.teams.find((t) => t.roomId === roomId)?.id };
      })
      .sort((a, b) => b.points - a.points);
    return { winner, winners: [], red: red.score, blue: blue.score, diff: Math.abs(red.score - blue.score), validGifts, ranking, ...computeCrowns(pk, winner, []) };
  }
  const teamByUser: Record<string, TeamId> = {};
  pk.teams.forEach((t) => t.members.forEach((m) => (teamByUser[m] = t.id)));
  pk.records.forEach((r) => r.teamId && (teamByUser[r.recipientId] ??= r.teamId));
  const ids = [...new Set([...pk.teams.flatMap((t) => t.members), ...Object.keys(pk.points)])];
  const ranking = ids.map((userId) => ({ userId, points: pk.points[userId] ?? 0, teamId: teamByUser[userId] })).sort((a, b) => b.points - a.points);
  return { winner, winners: [], red: red.score, blue: blue.score, diff: Math.abs(red.score - blue.score), validGifts, ranking, ...computeCrowns(pk, winner, []) };
}

/** Runs once per PK: only an active PK can be finalized, and the result is written in the same step. */
function finalize(pkId: string) {
  const pk = byId(pkId);
  if (!pk || pk.status !== 'active') return;
  stop(pkId);
  const result = computeResult(pk);
  put({ ...pk, status: 'done', result });
  log('Sistem', 'PK tamamlandı', pk.id, pk.mode === 'solo' ? `kazanan: ${result.winners.map(nameOf).join(', ') || 'yok'}` : `${result.red} - ${result.blue}`);
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

/** Biggest supporters by PK points, for one team or (Normal PK) one recipient or the whole PK. */
export function topSupporters(pk: PkSession, filter?: { teamId?: TeamId; recipientId?: string }, n = 3) {
  const totals: Record<string, number> = {};
  pk.records
    .filter((r) => r.status === 'Doğrulandı' && (!filter?.teamId || r.teamId === filter.teamId) && (!filter?.recipientId || r.recipientId === filter.recipientId))
    .forEach((r) => (totals[r.senderId] = (totals[r.senderId] ?? 0) + r.points));
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
/** Normal PK live ranking. */
export const liveRanking = (pk: PkSession) =>
  [...new Set([...pk.participants, ...Object.keys(pk.points)])].map((userId) => ({ userId, points: pk.points[userId] ?? 0 })).sort((a, b) => b.points - a.points);

/** Test support. */
export function resetPk() {
  timers.forEach((list) => list.forEach(clearTimeout));
  timers.clear();
  drafts.clear();
  state = initial();
}
