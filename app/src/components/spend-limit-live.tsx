// Ayarlar › Harcama in a live build: the daily spending limit kept and enforced on the server (lib/live/spend-limit,
// server/api/spend-limit.mjs). Lowering applies at once; raising or lifting is asked about first and waits 24 hours.
// A limit this phone kept before the server did moves to the server once (never a looser one), then the phone's
// copy is cleared, so the two never disagree.
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Icon3D } from '@/components/Icon3D';
import { ChoiceChips, ListBlock, ListGroup, ListRow } from '@/components/list';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import { changeSpendLimit, refreshSpendLimit, useServerSpendLimit } from '@/lib/live/spend-limit';
import { LIMIT_OPTIONS, confirmRaise, limitFooter } from '@/lib/spend-limit-view';
import { useApp } from '@/store';

const coin = <Icon3D name="coin" size={14} />;
const LABEL: Record<(typeof LIMIT_OPTIONS)[number], string> = { 0: 'Limitsiz', 500: '500', 2000: '2.000', 10000: '10.000' };

export function LiveSpendLimit() {
  const { settings, setSetting } = useApp();
  const s = useServerSpendLimit();
  const [busy, setBusy] = useState(false);
  const moved = useRef(false);

  // The phone's old limit (from before the server kept it) goes to the server when it is tighter, then is cleared.
  const local = settings.dailySpendLimit;
  useEffect(() => {
    if (!s || !(local > 0) || moved.current) return;
    moved.current = true;
    const tighter = s.limit === null || local < s.limit;
    // Tried once per visit: a failure leaves the phone's copy (still applied here) for the next visit.
    (tighter ? changeSpendLimit(local) : Promise.resolve('now' as const)).then(() => setSetting('dailySpendLimit', 0)).catch(() => {});
  }, [s, local, setSetting]);

  const apply = (v: number) => {
    setBusy(true);
    changeSpendLimit(v)
      .then((when) => {
        if (when === 'later') showAlert('Limit değişikliği kaydedildi', '24 saat sonra geçerli olacak. O zamana kadar şimdiki limitin geçerli.');
      })
      .catch((e: unknown) => showAlert('Limit kaydedilemedi', message(e)))
      .finally(() => setBusy(false));
  };
  const choose = (v: number) => {
    if (!s || busy || v === (s.limit ?? 0)) return;
    const ask = confirmRaise(s, v);
    if (!ask) return apply(v);
    showAlert(ask.title, ask.message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Onayla', onPress: () => apply(v) },
    ]);
  };

  return (
    <ListGroup label="Harcama" footer={s ? limitFooter(s) : undefined}>
      {s ? (
        <ListBlock title="Günlük harcama limiti">
          <ChoiceChips value={s.limit ?? 0} options={LIMIT_OPTIONS.map((v) => [v, LABEL[v], v ? coin : undefined] as [number, string, ReactNode?])} onChange={choose} />
        </ListBlock>
      ) : (
        <ListRow icon="time-outline" tone="neutral" title="Günlük harcama limiti" subtitle="Yükleniyor… Dokun, tekrar deneyelim." onPress={() => void refreshSpendLimit()} chevron={false} />
      )}
    </ListGroup>
  );
}
