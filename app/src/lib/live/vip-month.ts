// VIP aylık değerlendirme in a live build (server/api/vip-month.mjs; the words: lib/vip-month). The VIP page reads
// useLiveVipMonth(); "Koruma dönemi al" calls extendVipLive with the price it showed.
import * as api from '@/lib/api';
import { applyServerUser } from '@/lib/live';
import { focusStore } from '@/lib/live/focus-store';
import { parseVipMonth, type VipMonth } from '@/lib/vip-month';

const store = focusStore(async () => parseVipMonth(await api.myVipMonth()));
/** My VIP month, or null until read or when the answer was malformed. */
export const useLiveVipMonth = (on = true) => store.useData(on);

/**
 * Buys the protection period at `price` (what the screen showed). The coins leave through the server's answer; the
 * new month view replaces the old. A moved price throws the server's 409 (`price_changed`, the new price in it).
 */
export async function extendVipLive(price: number): Promise<VipMonth | null> {
  const r = await api.extendVip(price);
  applyServerUser(r, 'VIP koruma dönemi');
  const m = parseVipMonth(r.month);
  if (m) store.put(m);
  return m;
}
