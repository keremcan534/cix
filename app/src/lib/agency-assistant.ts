// Ajans asistanı (server/api/agency-assistants.mjs, docs/AJANS_ASISTANI.md): the split the owner's screens show as
// an example. The server decides every real amount; this mirrors its arithmetic so the example never promises more
// than it pays: amounts in 1/10,000 diamond, the agency's commission = income × its rate, the assistant's part =
// that × the share (whole percent), toward zero; the owner keeps the rest. Pure, for node --test.

/** One income of `base` diamonds at the agency's own `rate` (0–1) and an assistant share of `pct` percent. */
export function assistantSplit(base: number, rate: number, pct: number) {
  const commission = base * Math.round(rate * 1e4);
  const assistant = Math.trunc((commission * pct) / 100);
  return { commission: commission / 1e4, assistant: assistant / 1e4, owner: (commission - assistant) / 1e4 };
}

const d = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
const p = (r: number) => `%${(r * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

/** "Örnek: … 100 elmas …" for the share sheets and the rules. */
export function assistantExample(rate: number, pct: number) {
  const x = assistantSplit(100, rate, pct);
  return `Örnek: Asistanın getirdiği yayıncı 100 elmas kazanırsa ajans komisyonun (${p(rate)}) ${d(x.commission)} elmas olur. Pay %${pct} ise asistana ${d(x.assistant)}, sana ${d(x.owner)} elmas kalır.`;
}

/** A share as typed: a whole number 0–100, else null. */
export const shareIn = (v: string) => (/^\d{1,3}$/.test(v.trim()) && Number(v) <= 100 ? Number(v) : null);
