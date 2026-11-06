// Live room session, independent of any screen. It owns which room the user is in, the voice connection
// (through lib/audio-engine), what the microphone is asked to do versus what it really sends, the audio
// output, interruptions, the app's foreground/background state and reconnection. Screens only render it:
// the full room and the mini card read the same session, so switching between them never reconnects.
//
// Leaving is explicit: only endRoom('left') (the "Odadan çık" choice) ends the membership. Minimizing, hiding
// the mini card, navigating, or the app going to the background never do.
import { useSyncExternalStore } from 'react';

import { createSimulatedEngine, type AudioEngine, type AudioRoute } from '@/lib/audio-engine';
import { isOnline } from '@/lib/room-presence';

export type SessionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'ended';
export type EndReason = 'left' | 'switched' | 'kicked' | 'server' | 'denied';
export type Interruption = 'phone_call' | 'focus_loss' | null;
/** Why a microphone the user turned on isn't sending audio right now. */
export type MicBlock = 'not_seated' | 'sanctioned' | 'mod_muted' | 'in_app_call' | 'permission' | 'phone_call' | 'focus_loss' | 'background' | 'connection' | null;

export type RoomSession = {
  roomId: string;
  via?: string;
  title: string;
  cover: string;
  startedAt: number;
  status: SessionStatus;
  endReason?: EndReason;
  /** The server's own words for an ended session (ör. "Oda kapandı", "Oda şifresi yanlış"). */
  endText?: string;
  /** Opened again after the app was closed: the mic starts off. */
  recovered: boolean;
  /** Membership confirmed by the room (presence join succeeded). */
  joined: boolean;
  /** What the user asked for with the mic button. */
  micWant: boolean;
  seated: boolean;
  modMuted: boolean;
  /** The server took the mic (voice mute, lib/sanctions): LiveKit refuses to publish until it gives it back. */
  sanctionMuted: boolean;
  /** The server took room chat (text mute): messages cannot go out over the voice connection. */
  sanctionChat: boolean;
  inAppCall: boolean;
  permission: 'granted' | 'denied';
  interruption: Interruption;
  route: AudioRoute;
  appState: 'active' | 'background';
  /** The engine can't run audio in the background, so audio is paused until the app is back. */
  audioSuspended: boolean;
  reconnectAttempt: number;
  /** The voice connection was up at least once in this session. Until then a failure is "could not connect",
   *  never "the connection dropped", and nothing on screen is a stale copy of what was loaded. */
  everConnected: boolean;
  miniHidden: boolean;
};
export type Notice = { id: number; text: string; tone: 'info' | 'warn' };
type State = {
  session: RoomSession | null;
  leaveDialog: boolean;
  /** Set while the user's own leave/minimize navigation runs, so the room route lets itself be removed. */
  leaving: boolean;
  switchTo: { roomId: string; title: string; cover: string; via?: string } | null;
  notice: Notice | null;
  /** Last session found after a restart (the app was closed while in a room). */
  recovery: { roomId: string; title: string } | null;
};

/** Reconnect waits (ms): 1, 2, 4, 8, 16 s, then the session shows "disconnected" with a retry. */
export const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000];
export const CONNECT_MS = 300;

let state: State = { session: null, leaveDialog: false, leaving: false, switchTo: null, notice: null, recovery: null };
const listeners = new Set<() => void>();
let engine: AudioEngine = createSimulatedEngine(() => isOnline());
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let connectTimer: ReturnType<typeof setTimeout> | undefined;
/** Stops both pending timers and forgets their handles. */
function stopRetry() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
}
function stopTimers() {
  stopRetry();
  clearTimeout(connectTimer);
  connectTimer = undefined;
}
let noticeSeq = 0;
let persist: (s: { roomId: string; title: string } | null) => void = () => {};
let pendingLeave: (() => void) | null = null;

const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  syncEngine();
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getSession = () => state;
export function useRoomSession() {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
function patchSession(p: Partial<RoomSession>) {
  if (state.session) emit({ session: { ...state.session, ...p, ...(p.status === 'connected' ? { everConnected: true } : null) } });
}
const notify = (text: string, tone: Notice['tone'] = 'info') => emit({ notice: { id: ++noticeSeq, text, tone } });
export function clearNotice(id: number) {
  if (state.notice?.id === id) emit({ notice: null });
}

// --- Microphone: wanted vs really sent ---------------------------------------------------------------
export function micBlock(s: RoomSession | null): MicBlock {
  if (!s || s.status === 'ended') return 'connection';
  if (!s.seated) return 'not_seated';
  if (s.sanctionMuted) return 'sanctioned';
  if (s.modMuted) return 'mod_muted';
  if (s.inAppCall) return 'in_app_call';
  if (s.permission === 'denied') return 'permission';
  if (s.interruption) return s.interruption;
  if (s.audioSuspended) return 'background';
  if (s.status !== 'connected') return 'connection';
  return null;
}
export const micSending = (s: RoomSession | null) => !!s && s.micWant && micBlock(s) === null;
/** Audio from the room reaches the user's ears right now. */
export const hearing = (s: RoomSession | null) => !!s && s.status === 'connected' && !s.audioSuspended && s.interruption === null;
export const MIC_BLOCK_LABEL: Record<Exclude<MicBlock, null>, string> = {
  not_seated: 'Mikrofonda değilsin',
  sanctioned: 'Sesli susturma uygulandı',
  mod_muted: 'Oda yönetimi mikrofonunu kapattı',
  in_app_call: 'Mikrofon bire bir görüşmende',
  permission: 'Mikrofon izni yok',
  phone_call: 'Telefon görüşmesi sürüyor',
  focus_loss: 'Ses başka bir uygulamada',
  background: 'Uygulama arka planda; bu sürümde arka plan sesi yok',
  connection: 'Oda bağlantısı yok',
};
/** The in-room connection line (SessionBanner); null while the connection is fine. `retry`: offer "Yeniden dene". */
export type ConnectionLine = { text: string; bad: boolean; retry: boolean };
export function connectionLine(s: RoomSession, offline: boolean): ConnectionLine | null {
  if (s.status === 'ended') return null;
  const attempt = s.reconnectAttempt ? ` (${s.reconnectAttempt}. deneme)` : '';
  if (!s.everConnected) {
    // Never joined: nothing dropped, and nothing on screen came from this room's connection yet.
    if (s.status === 'disconnected') return { text: 'Odaya bağlanılamadı. Ağ dönünce yeniden denenecek.', bad: true, retry: true };
    if (s.status === 'reconnecting') return { text: `Bağlanılamadı · yeniden deneniyor${attempt}.`, bad: false, retry: true };
    if (s.status === 'connecting') return { text: offline ? 'İnternet bağlantısı yok · bağlanılıyor…' : 'Bağlanılıyor…', bad: false, retry: false };
    return null;
  }
  if (s.status === 'disconnected') return { text: 'Oda bağlantısı kesildi. Sayılar ve liste son alınan durumu gösteriyor.', bad: true, retry: true };
  if (s.status === 'reconnecting' || offline) return { text: `Bağlantı koptu · yeniden bağlanılıyor${attempt}. Sayılar ve liste son alınan durumu gösteriyor.`, bad: false, retry: s.status === 'reconnecting' };
  return null;
}
/** The engine always follows the session: one place decides whether the mic track is published. */
function syncEngine() {
  const s = state.session;
  engine.setPublishing(!!s && s.status !== 'ended' && micSending(s));
  if (s) engine.setRoute(s.route);
}

// --- Open, switch, end -------------------------------------------------------------------------------
export type OpenResult = 'started' | 'same' | 'confirm';
/**
 * Opens a room, or brings back the one already open (no reconnect, no new join). Opening another room while
 * one is live asks first (the old one would be left).
 */
export function openRoom(roomId: string, info: { title: string; cover: string; via?: string; recovered?: boolean }): OpenResult {
  const cur = state.session;
  if (cur && cur.status !== 'ended' && cur.roomId === roomId) {
    if (cur.miniHidden) patchSession({ miniHidden: false });
    return 'same';
  }
  if (cur && cur.status !== 'ended') {
    emit({ switchTo: { roomId, title: info.title, cover: info.cover, via: info.via } });
    return 'confirm';
  }
  start(roomId, info);
  return 'started';
}
function start(roomId: string, info: { title: string; cover: string; via?: string; recovered?: boolean }) {
  stopTimers();
  const session: RoomSession = {
    roomId,
    via: info.via,
    title: info.title,
    cover: info.cover,
    startedAt: Date.now(),
    status: 'connecting',
    recovered: !!info.recovered,
    joined: false,
    micWant: false,
    seated: false,
    modMuted: false,
    sanctionMuted: false,
    sanctionChat: false,
    inAppCall: false,
    permission: 'granted',
    interruption: null,
    route: engine.stats().route,
    appState: 'active',
    audioSuspended: false,
    reconnectAttempt: 0,
    everConnected: false,
    miniHidden: false,
  };
  engine.connect(roomId);
  emit({ session, switchTo: null, recovery: null });
  persist({ roomId, title: info.title });
  if (info.recovered) notify('Odaya yeniden bağlandın. Uygulama kapandığı için güvenlik amacıyla mikrofonun kapalı başladı.');
  connectTimer = setTimeout(() => {
    connectTimer = undefined;
    if (state.session?.roomId !== roomId || state.session.status !== 'connecting') return;
    // A real engine says when it joined (engineEvent); only a missing network is decided here.
    if (engine.capabilities.reportsState) return void (isOnline() || lostConnection());
    if (isOnline()) patchSession({ status: 'connected' });
    else lostConnection();
  }, CONNECT_MS);
}
export function confirmSwitch() {
  const to = state.switchTo;
  if (!to) return;
  endRoom('switched');
  start(to.roomId, to);
}
export const cancelSwitch = () => emit({ switchTo: null });

/**
 * Ends the session in a safe order: stop sending the mic, close the voice connection, then drop the
 * session (the room screen unmounts and leaves the presence membership). Ending for a reason the user
 * didn't choose (kicked, server) keeps an "ended" session so the mini card can say what happened.
 */
export function endRoom(reason: EndReason, endText?: string) {
  const s = state.session;
  if (!s || s.status === 'ended') return;
  stopTimers();
  state = { ...state, session: { ...s, micWant: false } };
  engine.setPublishing(false);
  engine.disconnect();
  persist(null);
  // Ended by the room (kicked, closed by the server): keep an "ended" session so the UI can say why.
  const shown = reason === 'kicked' || reason === 'server';
  emit({ session: shown ? { ...s, micWant: false, status: 'ended', endReason: reason, endText } : null, leaveDialog: false });
}
/**
 * What an ended session says. The title is the server's own words when it gave any ("Oda şifresi yanlış",
 * "Bu odaya giremezsin", "Oda kapandı"); "Odadan çıkarıldın" only for a removal that came without words.
 * Someone who never got in is not told that their mic and voice connection were closed.
 */
export function endedText(s: Pick<RoomSession, 'endReason' | 'endText' | 'everConnected' | 'title'>): { title: string; body: string } {
  const own = s.endText?.trim().replace(/\.$/, '');
  const closed = 'Mikrofonun ve ses bağlantın kapatıldı.';
  if (own) return { title: own, body: s.everConnected ? closed : `“${s.title}” odasına girilemedi.` };
  if (s.endReason === 'server') return { title: 'Oda sona erdi', body: `“${s.title}” odası sunucu tarafından kapatıldı. ${closed}` };
  return { title: 'Odadan çıkarıldın', body: `Oda yönetimi seni “${s.title}” odasından çıkardı. ${closed}` };
}
/** Clears an ended session after the user read why it ended. */
export function dismissEnded() {
  if (state.session?.status === 'ended') emit({ session: null });
}

// --- Reported by the room screen -------------------------------------------------------------------------
export function reportRoomState(roomId: string, p: Partial<Pick<RoomSession, 'seated' | 'modMuted' | 'inAppCall' | 'joined'>>) {
  const s = state.session;
  if (!s || s.roomId !== roomId || s.status === 'ended') return;
  if ((Object.keys(p) as (keyof typeof p)[]).every((k) => s[k] === p[k])) return;
  patchSession(p);
}
export function setMicWant(on: boolean) {
  const s = state.session;
  if (!s || s.status === 'ended' || s.micWant === on) return;
  patchSession({ micWant: on });
}

// --- Leave dialog, mini card ---------------------------------------------------------------------------
/** Back / close on the full room: ask "küçült" or "çık". `onContinue` replays a blocked back navigation. */
export function requestLeave(onContinue?: () => void) {
  pendingLeave = onContinue ?? null;
  if (!state.leaveDialog) emit({ leaveDialog: true });
}
export function closeLeaveDialog() {
  pendingLeave = null;
  emit({ leaveDialog: false });
}
/** Runs the blocked back navigation (if any) once; returns false when the caller must navigate itself. */
export function continueLeave(): boolean {
  const go = pendingLeave;
  pendingLeave = null;
  emit({ leaveDialog: false, leaving: true });
  go?.();
  return !!go;
}
export function setLeaving(leaving: boolean) {
  if (state.leaving !== leaving) emit({ leaving });
}
export const setMiniHidden = (miniHidden: boolean) => patchSession({ miniHidden });

/** Room routes currently in the navigation stack, by room id (so "expand" can go back to one instead of stacking another). */
const openers = new Map<string, number>();
export function registerOpener(roomId: string) {
  openers.set(roomId, (openers.get(roomId) ?? 0) + 1);
  return () => {
    const n = (openers.get(roomId) ?? 1) - 1;
    if (n > 0) openers.set(roomId, n);
    else openers.delete(roomId);
  };
}
export const hasOpener = (roomId: string) => openers.has(roomId);

// --- App lifecycle ---------------------------------------------------------------------------------------
/**
 * Background never ends the session or touches the mic setting. With an engine that can't play audio in the
 * background, audio pauses until the app is back (shown as such, never as "connected and talking").
 */
export function onAppState(next: 'active' | 'background') {
  const s = state.session;
  if (!s || s.status === 'ended' || s.appState === next) return;
  if (next === 'background') {
    patchSession({ appState: 'background', audioSuspended: !engine.capabilities.backgroundAudio });
    // The OS may end the process while in the background: keep the room on disk for a safe reconnect.
    persist({ roomId: s.roomId, title: s.title });
    return;
  }
  const wasSuspended = s.audioSuspended;
  patchSession({ appState: 'active', audioSuspended: false });
  if (wasSuspended) notify('Uygulama arka plandayken oda sesi duraklatıldı (bu sürümde arka plan sesi yok). Oda üyeliğin ve mikrofon ayarın korundu.', 'warn');
  if (!isOnline()) lostConnection();
}

// --- Network and reconnection ----------------------------------------------------------------------------
function lostConnection() {
  const s = state.session;
  if (!s || s.status === 'ended' || s.status === 'reconnecting' || s.status === 'disconnected') return;
  patchSession({ status: 'reconnecting', reconnectAttempt: 0 });
  scheduleRetry();
}
function scheduleRetry() {
  stopRetry();
  const s = state.session;
  if (!s || s.status !== 'reconnecting') return;
  const delay = RECONNECT_DELAYS[s.reconnectAttempt];
  if (delay === undefined) {
    patchSession({ status: 'disconnected' });
    notify('Oda bağlantısı kurulamadı. Ağ dönünce yeniden denenecek; istersen şimdi yeniden dene.', 'warn');
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    tryReconnect();
  }, delay);
}
function tryReconnect() {
  const s = state.session;
  if (!s || (s.status !== 'reconnecting' && s.status !== 'disconnected')) return;
  // A real engine reports the join itself (engineEvent 'connected'); until then the session stays "reconnecting".
  if (engine.reconnect() && !engine.capabilities.reportsState) {
    patchSession({ status: 'connected', reconnectAttempt: 0 });
    // The first join that only worked on a retry is not a "re"-connection.
    if (s.everConnected) notify('Oda bağlantısı yeniden kuruldu.');
    return;
  }
  patchSession({ status: 'reconnecting', reconnectAttempt: s.reconnectAttempt + 1 });
  scheduleRetry();
}
/** Called when the device's realtime connection goes down or comes back. */
export function onNetwork(up: boolean) {
  const s = state.session;
  if (!s || s.status === 'ended') return;
  if (!up) return lostConnection();
  if (s.status === 'reconnecting' || s.status === 'disconnected') {
    stopRetry();
    tryReconnect();
  }
}
export function retryNow() {
  const s = state.session;
  if (!s || (s.status !== 'disconnected' && s.status !== 'reconnecting')) return;
  patchSession({ status: 'reconnecting', reconnectAttempt: 0 });
  stopRetry();
  tryReconnect();
}

// --- Reported by a real voice engine (capabilities.reportsState) ----------------------------------------------
export type EngineEvent =
  | { type: 'connected' }
  /** The voice connection dropped; LiveKit retries by itself and the session's backoff calls reconnect(). */
  | { type: 'lost' }
  /** Joining failed. `final`: the server refused for good (room closed, banned, wrong password): no retry. */
  | { type: 'failed'; message: string; final: boolean; reason?: 'kicked' | 'server' }
  | { type: 'mic_denied' }
  /** What the server lets us do in this room (voice token / a live change): mic, and chat over data. */
  | { type: 'grant'; canPublish: boolean; canChat: boolean }
  /** The room removed us (kick) or was deleted on the voice server. */
  | { type: 'removed'; reason: 'kicked' | 'server' };
export function engineEvent(roomId: string, e: EngineEvent) {
  const s = state.session;
  if (!s || s.roomId !== roomId || s.status === 'ended') return;
  switch (e.type) {
    case 'connected': {
      stopRetry();
      if (s.status === 'connected') return;
      patchSession({ status: 'connected', reconnectAttempt: 0 });
      if (s.everConnected && (s.status === 'reconnecting' || s.status === 'disconnected')) notify('Oda bağlantısı yeniden kuruldu.');
      return;
    }
    case 'lost':
      return lostConnection();
    case 'failed':
      if (e.final) return endRoom(e.reason ?? 'server', e.message);
      // Not reachable right now (network, server busy): the backoff tries again, then offers "yeniden dene".
      return lostConnection();
    case 'mic_denied':
      return setPermission(false);
    case 'grant': {
      const mic = !e.canPublish;
      const chat = !e.canChat;
      if (s.sanctionMuted === mic && s.sanctionChat === chat) return;
      patchSession({ sanctionMuted: mic, sanctionChat: chat });
      if (mic && !s.sanctionMuted) notify('Sesli susturma uygulandı: bu sürede mikrofonun açılamaz.', 'warn');
      else if (!mic && s.sanctionMuted) notify('Sesli susturman bitti. Mikrofonu yeniden açabilirsin.');
      if (chat && !s.sanctionChat) notify('Yazılı susturma uygulandı: bu sürede oda sohbetine yazamazsın.', 'warn');
      else if (!chat && s.sanctionChat) notify('Yazılı susturman bitti.');
      return;
    }
    case 'removed':
      return endRoom(e.reason);
  }
}

// --- Device events (from the OS in a real build; from the test panel in the prototype) ----------------
/** A phone call takes the audio. When it ends the room plays again, but the mic stays off until the user turns it on. */
export function phoneCall(active: boolean) {
  const s = state.session;
  if (!s || s.status === 'ended') return;
  if (active) return patchSession({ interruption: 'phone_call' });
  if (s.interruption !== 'phone_call') return;
  const hadMic = s.micWant;
  patchSession({ interruption: null, micWant: false });
  notify(hadMic ? 'Telefon görüşmesi bitti, oda sesi devam ediyor. Güvenlik için mikrofonun kapatıldı.' : 'Telefon görüşmesi bitti, oda sesi devam ediyor.');
}
/** Short audio focus loss (another app plays a sound): audio and mic resume as they were. */
export function audioFocus(lost: boolean) {
  const s = state.session;
  if (!s || s.status === 'ended') return;
  if (lost && !s.interruption) patchSession({ interruption: 'focus_loss' });
  if (!lost && s.interruption === 'focus_loss') patchSession({ interruption: null });
}
export function setRoute(route: AudioRoute) {
  const s = state.session;
  if (!s || s.route === route) return;
  patchSession({ route });
  notify(route === 'bluetooth' ? 'Ses Bluetooth kulaklığa geçti.' : 'Bluetooth ayrıldı; ses telefon hoparlörüne geçti.');
}
export function setPermission(granted: boolean) {
  const s = state.session;
  if (!s || s.status === 'ended') return;
  const permission = granted ? 'granted' : 'denied';
  if (s.permission === permission) return;
  patchSession({ permission });
  if (!granted) notify('Mikrofon izni kaldırıldı. Konuşmak için telefon ayarlarından izin ver; dinlemeye devam ediyorsun.', 'warn');
}

// --- Restart recovery ------------------------------------------------------------------------------------
export const setPersist = (fn: typeof persist) => (persist = fn);
export const setRecovery = (recovery: State['recovery']) => emit({ recovery });

// --- Engine and test support -------------------------------------------------------------------------------
export const engineInfo = () => ({ name: engine.name, capabilities: engine.capabilities, stats: engine.stats() });
export function setEngine(next: AudioEngine) {
  engine = next;
}
export function resetSession() {
  stopTimers();
  pendingLeave = null;
  openers.clear();
  persist = () => {};
  engine = createSimulatedEngine(() => isOnline());
  state = { session: null, leaveDialog: false, leaving: false, switchTo: null, notice: null, recovery: null };
}
