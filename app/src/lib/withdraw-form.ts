// Para çek form helpers (app/yayinci/cek): the quick amounts and the suggested amount. Only amounts a request can
// actually use are offered, so nothing on the form promises a payout the server then refuses. Pure, for node --test.
import { RULES, type Rules } from '@/data/rules';

/** Quick amounts from the minimum up to the withdrawable balance; none while the balance is below the minimum. */
export const withdrawPresets = (withdrawable: number, r: Rules = RULES) =>
  [r.minWithdrawDiamonds, r.minWithdrawDiamonds * 2, r.minWithdrawDiamonds * 5].filter((p) => p >= r.minWithdrawDiamonds && p <= withdrawable && p <= r.maxWithdrawDiamonds);

/** The amount the field starts with: the withdrawable balance in whole thousands (one request at most), or 0 below the minimum. */
export function suggestedWithdraw(withdrawable: number, r: Rules = RULES) {
  if (!(withdrawable >= r.minWithdrawDiamonds)) return 0;
  return Math.min(r.maxWithdrawDiamonds, Math.floor(withdrawable / 1000) * 1000);
}
