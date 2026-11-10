// Live mode (lib/live): Jeton Noktası on the server (server/api/jeton.mjs) for /coins-bank. Everyone sees the banks
// (blocks either way left out) and their own transfers; a Jeton Noktası account also sees its stock by source
// (wallet.mjs GET /api/wallet/coins) and the people who wrote to it lately (its buyers reach it by message). Read
// again each time the screen comes to the front. A sale answers with the new balance, which reaches the wallet like
// every live call. Without a server address none of this runs.
import * as api from '@/lib/api';
import { applyServerUser, once } from '@/lib/live';
import { focusStore } from '@/lib/live/focus-store';
import { sellToBank } from '@/lib/live/withdraw';

export type JetonStock = { coins: number; channels: { channel: string; label: string; remaining: number }[] };
export type JetonView = { banks: api.UserCard[]; mine: boolean; transfers: api.JetonTransfer[]; stock: JetonStock | null; buyers: api.UserCard[] };

const store = focusStore(async (): Promise<JetonView> => {
  const [b, transfers] = await Promise.all([api.jetonBanks(), api.jetonTransfers()]);
  const mine = !!b.mine;
  const [stock, buyers] = mine ? await Promise.all([api.walletCoins(), api.jetonBuyers()]) : [null, []];
  return { banks: b.banks, mine, transfers, stock: stock && { coins: stock.coins, channels: stock.channels }, buyers };
});

/** The banks, my transfers and (a bank's) stock; null until read. */
export const useJeton = () => store.useData();
export const refreshJeton = store.refresh;
/** What is held now (null: never read, or the last read failed with nothing before it). */
export const jetonNow = store.current;

/** A Jeton Noktası sells `coins` from its stock to `to`, who paid outside the app (`paymentRef`: the receipt). */
export async function sellCoins(to: string, coins: number, paymentRef: string, note: string) {
  const r = await once(`jeton:${to}:${coins}:${paymentRef.trim()}`, (ref) => api.jetonTransfer(to, coins, paymentRef.trim(), note.trim(), ref));
  applyServerUser(r, 'Jeton Noktası satışı');
  void refreshJeton();
  return r.transfer;
}

/** A host sells unlocked diamonds to a Jeton Noktası (Para çek's way, lib/live/withdraw); the list is read again. */
export async function sellDiamonds(bank: string, diamonds: number) {
  const t = await sellToBank(bank, diamonds);
  void refreshJeton();
  return t;
}
