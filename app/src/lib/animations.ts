// Animation platform: catalog state (admin-editable), content providers, audit log, the room event bus
// and `sendAnimation`, which plays the server's part for paid and free sends.
//
// Server rules mirrored here: the client sends only an animation id; price, active state, licence and
// campaign window are read from the catalog at send time. Each request id is processed once. If the
// room broadcast fails after the charge, the charge is refunded; once broadcast, a client that cannot
// render the file shows the preview instead (no refund, the others saw it).
import { useSyncExternalStore } from 'react';

import { ANIMATION_SEED, type Animation, type Asset, type LicenseStatus } from '@/data/animations';

// --- Providers --------------------------------------------------------------------------------
export type Provider = { id: string; name: string; hasApi: boolean; online: boolean; terms: string };
export type ProviderItem = { provider_id: string; name: string; category_id: string; format: Animation['format']; preview: Asset; license: LicenseStatus; terms: string; duration_ms: number };

const PROVIDERS0: Provider[] = [
  { id: 'builtin', name: 'Similar Club yerleşik', hasApi: false, online: true, terms: 'Kendi içeriğimiz; kısıt yok.' },
  {
    id: 'demo-store',
    name: 'Örnek mağaza (API simülasyonu)',
    hasApi: true,
    online: true,
    terms: 'Gerçek bir sağlayıcı değildir; içe aktarma akışını göstermek için. Gerçek sağlayıcının API’si ve lisansı doğrulanınca aynı arayüzle bağlanır.',
  },
  { id: 'manual', name: 'Manuel yükleme (API yok)', hasApi: false, online: true, terms: 'Sağlayıcının API’si yoksa dosya ve lisans belgesi yönetici tarafından elle eklenir; otomatik eşitleme yapılmaz.' },
];

// What the demo store "returns". One item is not licensed for in-app coin sale, so it can't go live.
const DEMO_STORE: ProviderItem[] = [
  { provider_id: 'ds-1001', name: 'Anka Kuşu', category_id: 'fantasy', format: 'lottie', preview: { kind: 'art', value: 'anka-kusu' }, license: 'approved', terms: 'Ticari kullanım ve uygulama içi satış serbest; önbelleğe alma serbest.', duration_ms: 3000 },
  { provider_id: 'ds-1002', name: 'Kristal Kale', category_id: 'royal', format: 'svga', preview: { kind: 'art', value: 'kristal-kale' }, license: 'approved', terms: 'Ticari kullanım serbest; dosya dönüştürme serbest.', duration_ms: 3200 },
  { provider_id: 'ds-1003', name: 'Peluş Ayı', category_id: 'cute', format: 'lottie', preview: { kind: 'art', value: 'pelus-ayi' }, license: 'pending', terms: 'Uygulama içi coin karşılığı satış için ek lisans gerekli (beklemede).', duration_ms: 2400 },
  { provider_id: 'ds-1004', name: 'Galaksi Tüneli', category_id: 'space', format: 'vap', preview: { kind: 'art', value: 'galaksi-tuneli' }, license: 'rejected', terms: 'Yalnızca kişisel kullanım; ticari kullanım ve dağıtım yasak.', duration_ms: 4000 },
];

// --- State -------------------------------------------------------------------------------------
export type AuditRow = { id: string; at: string; actor: string; action: string; target: string; before?: string; after?: string };
export type RoomAnimEvent = { eventId: string; roomId: string; animationId: string; fromUserId: string; startAt: number; requestId: string };
type State = { catalog: Animation[]; providers: Provider[]; audit: AuditRow[]; busOnline: boolean };
let state: State = { catalog: ANIMATION_SEED, providers: PROVIDERS0, audit: [], busOnline: true };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export const getAnimations = () => state;
export function useAnimations() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getAnimations,
    getAnimations,
  );
}

const stamp = () => new Date().toISOString();
const short = () => `${new Date().toLocaleDateString('tr-TR')} ${new Date().toTimeString().slice(0, 5)}`;
const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
export const newAnimRequestId = () => `ar-${Date.now()}-${rid()}`;

/** Live = usable by users right now (active, licensed, inside its campaign window). */
export function isLive(a: Animation, now = new Date()) {
  if (!a.is_active || a.license_status !== 'approved') return false;
  const d = now.toISOString().slice(0, 10);
  if (a.starts_at && d < a.starts_at) return false;
  if (a.ends_at && d > a.ends_at) return false;
  return true;
}
export const animById = (id: string) => state.catalog.find((a) => a.animation_id === id);

// --- Admin -------------------------------------------------------------------------------------
const log = (action: string, target: string, before?: string, after?: string) =>
  emit({ audit: [{ id: rid(), at: short(), actor: 'Sen (yönetici)', action, target, before, after }, ...state.audit].slice(0, 200) });

export type AdminResult = { ok: true } | { ok: false; reason: string };
/** Edits one record. Going live requires an approved licence; price, activity and licence changes are logged. */
export function updateAnimation(id: string, patch: Partial<Animation>): AdminResult {
  const cur = animById(id);
  if (!cur) return { ok: false, reason: 'Kayıt bulunamadı.' };
  const next = { ...cur, ...patch, updated_at: stamp() };
  if (next.is_active && next.license_status !== 'approved') return { ok: false, reason: `Lisans durumu "${next.license_status}": lisansı onaylanmamış içerik yayına alınamaz.` };
  if (!next.is_free && next.coin_price <= 0) return { ok: false, reason: 'Ücretli içerikte fiyat 0’dan büyük olmalı.' };
  if (patch.coin_price !== undefined && patch.coin_price !== cur.coin_price) log('Fiyat değişti', cur.name, String(cur.coin_price), String(patch.coin_price));
  if (patch.is_active !== undefined && patch.is_active !== cur.is_active) log(patch.is_active ? 'Yayına alındı' : 'Yayından kaldırıldı', cur.name);
  if (patch.license_status && patch.license_status !== cur.license_status) log('Lisans durumu', cur.name, cur.license_status, patch.license_status);
  if (patch.is_free !== undefined && patch.is_free !== cur.is_free) log(patch.is_free ? 'Ücretsiz yapıldı' : 'Ücretli yapıldı', cur.name);
  emit({ catalog: state.catalog.map((a) => (a.animation_id === id ? next : a)) });
  return { ok: true };
}

export function addAnimation(a: Omit<Animation, 'animation_id' | 'created_at' | 'updated_at'>): Animation {
  const rec: Animation = { ...a, animation_id: `an-${rid().toLowerCase()}`, created_at: stamp(), updated_at: stamp() };
  emit({ catalog: [rec, ...state.catalog] });
  log('Yeni animasyon eklendi', rec.name, undefined, `${rec.display_type} · ${rec.is_free ? 'ücretsiz' : rec.coin_price}`);
  return rec;
}

export function setProviderOnline(id: string, online: boolean) {
  emit({ providers: state.providers.map((p) => (p.id === id ? { ...p, online } : p)) });
  log(online ? 'Sağlayıcı bağlandı' : 'Sağlayıcı bağlantısı kesildi', id);
}
export function setBusOnline(online: boolean) {
  emit({ busOnline: online });
}

/** Provider catalog. Only providers that really have an API can list; otherwise use manual upload. */
export function listProvider(id: string): { ok: true; items: ProviderItem[] } | { ok: false; reason: string } {
  const p = state.providers.find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'Sağlayıcı yok.' };
  if (!p.hasApi) return { ok: false, reason: `${p.name} API sunmuyor; içerik dosya ve lisans belgesiyle elle eklenir.` };
  if (!p.online) return { ok: false, reason: `${p.name} şu an erişilemiyor. İçe aktarılmış içerikler önbellekten çalışmaya devam eder.` };
  return { ok: true, items: id === 'demo-store' ? DEMO_STORE : [] };
}

/** Imports a provider item as an inactive record with its own animation_id; provider_id is kept for mapping. */
export function importItem(providerId: string, item: ProviderItem): AdminResult {
  if (state.catalog.some((a) => a.provider === providerId && a.provider_id === item.provider_id)) return { ok: false, reason: 'Bu içerik zaten içe aktarılmış.' };
  addAnimation({
    provider: providerId,
    provider_id: item.provider_id,
    name: item.name,
    category_id: item.category_id,
    preview_asset: item.preview,
    animation_asset: { kind: 'file', value: `cache/${providerId}/${item.provider_id}.${item.format}` },
    format: item.format,
    motion: 'zoom',
    count: 1,
    duration_ms: item.duration_ms,
    display_type: 'gift',
    audio_asset: null,
    coin_price: 500,
    is_free: false,
    is_active: false,
    license_status: item.license,
    license_note: item.terms,
  });
  log('Sağlayıcıdan içe aktarıldı', item.name, undefined, `${providerId}:${item.provider_id} · lisans ${item.license}`);
  return { ok: true };
}

// --- Room event bus (stands in for the realtime room channel) ---------------------------------------
const roomListeners = new Map<string, Set<(e: RoomAnimEvent) => void>>();
export function subscribeRoom(roomId: string, fn: (e: RoomAnimEvent) => void) {
  const set = roomListeners.get(roomId) ?? new Set();
  set.add(fn);
  roomListeners.set(roomId, set);
  return () => {
    set.delete(fn);
  };
}
/** Everyone in the room starts the same event at `startAt` (server time + small lead). */
function broadcast(e: RoomAnimEvent) {
  roomListeners.get(e.roomId)?.forEach((fn) => fn(e));
}

// --- Send (server stand-in) ------------------------------------------------------------------------
export type SendDeps = { spend: (n: number, reason: string) => boolean; refund: (n: number, reason: string) => void };
export type SendResult = { ok: true; charged: number; replay: boolean; event: RoomAnimEvent } | { ok: false; reason: string; refunded?: number };
const done = new Map<string, SendResult>();
const lastFree = new Map<string, number>();
const LEAD_MS = 250;

export function sendAnimation(animationId: string, roomId: string, fromUserId: string, requestId: string, deps: SendDeps): SendResult {
  const seen = done.get(requestId);
  if (seen) return seen.ok ? { ...seen, replay: true } : seen;
  const finish = (r: SendResult) => (done.set(requestId, r), r);
  const a = animById(animationId);
  if (!a || !isLive(a)) return finish({ ok: false, reason: 'Bu animasyon şu an kullanılamıyor.' });
  if (a.display_type === 'mic_effect' || a.display_type === 'entry') return finish({ ok: false, reason: 'Bu içerik gönderilmez; mağazadan alınıp kullanılır.' });
  // Free reactions are rate limited per sender so they can't flood the room.
  if (a.is_free) {
    const last = lastFree.get(fromUserId) ?? 0;
    if (Date.now() - last < 1200) return { ok: false, reason: 'Biraz yavaş: ücretsiz tepkiler arasında kısa bir bekleme var.' };
    lastFree.set(fromUserId, Date.now());
  }
  const price = a.is_free ? 0 : a.coin_price; // from the catalog, never from the client
  const ref = `AN-${rid()}`;
  if (price > 0 && !deps.spend(price, `Animasyon: ${a.name} · ${ref}`)) return finish({ ok: false, reason: 'Yetersiz jeton (veya günlük harcama limiti).' });
  const event: RoomAnimEvent = { eventId: ref, roomId, animationId, fromUserId, startAt: Date.now() + LEAD_MS, requestId };
  if (!state.busOnline) {
    if (price > 0) deps.refund(price, `Animasyon iadesi: ${a.name} · ${ref} (odaya iletilemedi)`);
    return finish({ ok: false, reason: 'Oda bağlantısı yok; animasyon iletilemedi.' + (price ? ` ${price} jeton iade edildi.` : ''), refunded: price });
  }
  broadcast(event);
  return finish({ ok: true, charged: price, replay: false, event });
}

/** Other participants' sends arrive through the same bus (prototype: simulated bots). */
export function simulateRemoteSend(roomId: string, fromUserId: string, animationId: string) {
  const a = animById(animationId);
  if (!a || !isLive(a) || !state.busOnline) return;
  broadcast({ eventId: `AN-${rid()}`, roomId, animationId, fromUserId, startAt: Date.now() + LEAD_MS, requestId: newAnimRequestId() });
}
