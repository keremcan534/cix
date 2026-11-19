// Bağlar in live mode: every bond, request and its coins live on the server (server/api/bonds.mjs). A request
// holds the bond gift's coins; the answer that moves them (accept, refuse, withdraw) re-reads the balance.
import * as api from '@/lib/api';
import { applyServerUser, liveMode, once, refreshWallet, rememberUser, toLocal, toServer } from '@/lib/live';
import { BOND_KINDS, isBondKind, type Bond, type BondKind, type BondKindInfo, type RoomBond } from '@/data/bonds';
import { bondKindOf, refreshLiveCatalog } from '@/lib/live/catalog-live';
import { isServerId } from '@/data/mock';

/** Whose bonds come from the server: me (signed in) and real people. Demo people (u1…) keep demo data. */
export const liveBondsFor = (userId: string) => liveMode() && (userId === 'me' ? !!toServer('me') : isServerId(userId));

const toBond = (b: api.ServerBond): Bond => {
  rememberUser(b.partner);
  return {
    id: String(b.id),
    kind: isBondKind(b.kind) ? b.kind : 'kanka',
    status: b.status,
    requester: b.requester,
    partnerId: toLocal(b.partner.id),
    price: b.price,
    score: b.score,
    level: b.level,
    nextLevelAt: b.nextLevelAt,
    since: b.since,
    expiresAt: b.expiresAt,
  };
};

const serverId = (userId: string) => {
  const id = toServer(userId);
  if (!id) throw new Error('Bu kişi sunucuda yok');
  return id;
};

/** Active bonds on `userId`'s profile; `hidden` when they hid them (I still see my own). */
export async function loadBonds(userId: string) {
  const r = await api.bonds(userId === 'me' ? undefined : serverId(userId));
  return { hidden: r.hidden, bonds: r.bonds.map(toBond) };
}

export async function loadBondRequests() {
  const r = await api.bondRequests();
  return { incoming: r.incoming.map(toBond), outgoing: r.outgoing.map(toBond) };
}

/** A bond kind as it is now: in live mode as the server's catalog says (catalog-live bondKindOf), else the app's own. */
export const bondKindNow = (kind: BondKind): BondKindInfo => (liveMode() ? bondKindOf(kind) : BOND_KINDS[kind]);

/**
 * Sends the bond gift with the request; the coins are held until the other person answers. `room`: sent in that room,
 * which sees the gift. `price`: what the screen showed (bondKindNow); a moved price is a 409 price_changed, nothing is
 * taken and the catalog is read again, so the screen shows the new one.
 */
export async function liveRequestBond(to: string, kind: BondKind, room?: string, price = bondKindNow(kind).price) {
  const id = serverId(to);
  try {
    const r = await once(`bond:${id}:${kind}`, (ref) => api.requestBond(id, kind, ref, room, price));
    applyServerUser(r, `Bağ isteği: ${BOND_KINDS[kind].label} (${bondKindNow(kind).gift})`);
    return toBond(r.bond);
  } catch (e) {
    if (e instanceof api.ApiError && e.status === 409 && (e.data.code === 'price_changed' || e.data.code === 'update_required')) void refreshLiveCatalog();
    throw e;
  }
}

/** Accept (the bond gift becomes my diamonds) or refuse (the coins go back to the sender). */
export async function liveRespondBond(id: string, accept: boolean) {
  try {
    return toBond(await api.respondBond(Number(id), accept));
  } finally {
    void refreshWallet().catch(() => {});
  }
}

/** My own request, before it is answered: the coins come back. */
export async function liveWithdrawBond(id: string) {
  try {
    return toBond(await api.withdrawBond(Number(id)));
  } finally {
    void refreshWallet().catch(() => {});
  }
}

/** Bonds of the people in a room (local ids; people only in the demo are skipped). */
export async function loadRoomBonds(ids: readonly string[]): Promise<RoomBond[]> {
  const server = ids.map(toServer).filter((x): x is string => !!x);
  if (!server.length) return [];
  const list = await api.bondsAmong(server);
  return list.filter((r) => isBondKind(r.kind)).map((r) => ({ a: toLocal(r.a), b: toLocal(r.b), kind: r.kind as BondKind, level: r.level }));
}

export const liveEndBond = async (id: string) => toBond(await api.endBond(Number(id)));
export const liveSetBondsHidden = (hidden: boolean) => api.setBondsHidden(hidden);
