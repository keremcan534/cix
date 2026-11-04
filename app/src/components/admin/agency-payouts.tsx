// Yönetim › Ajans ödemeleri: agencies' payout requests. Two steps: approve (the amount is right), then mark paid
// with the bank transfer's reference once the money went out. With two-person approval on, the person who
// approved can't mark the same payout paid; the server says so if tried.
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui';
import { ago, fmtDate, fmtNum, fmtUsd } from '@/lib/admin-format';
import * as admin from '@/lib/live/admin';

import { Filters, ItemCard, Line, LoadState, Notice, Quote, SectionScroll, StatusPill, confirmThen, useAdmin, useLoad, type Tone } from './parts';

type Filter = 'open' | 'paid' | 'closed';
const FILTERS: [Filter, string][] = [
  ['open', 'Bekleyen'],
  ['paid', 'Ödenen'],
  ['closed', 'Reddedilen / iptal'],
];
const IN: Record<Filter, admin.PayoutStatus[]> = { open: ['pending', 'ready'], paid: ['paid'], closed: ['rejected', 'cancelled'] };
const TONE: Record<admin.PayoutStatus, Tone> = { pending: 'money', ready: 'action', paid: 'success', rejected: 'danger', cancelled: 'neutral' };

const loadPayouts = async () => {
  const [payouts, twoPerson] = await Promise.all([admin.agencyPayouts(), admin.twoPersonPayouts().catch(() => false)]);
  return { payouts, twoPerson };
};

export function AgencyPayoutsSection() {
  const [filter, setFilter] = useState<Filter>('open');
  const q = useLoad(loadPayouts);
  return (
    <SectionScroll load={q}>
      <Filters value={filter} options={FILTERS} onChange={setFilter} />
      <LoadState
        load={q}
        empty={(d) =>
          d.payouts.some((p) => IN[filter].includes(p.status))
            ? null
            : filter === 'open'
              ? { icon: 'checkmark-done-outline', title: 'Bekleyen ajans ödemesi yok', text: 'Bir ajans ödeme talep edince burada görünür.' }
              : { icon: 'file-tray-outline', title: 'Bu listede ödeme yok' }
        }
      >
        {(d) => {
          // Oldest first while waiting; newest first in the history.
          const rows = d.payouts.filter((p) => IN[filter].includes(p.status));
          if (filter === 'open') rows.reverse();
          return (
            <>
              {filter === 'open' && (
                <Notice
                  text={
                    d.twoPerson
                      ? 'Önce onayla, sonra parayı gönderip “Ödendi” olarak işaretle. İki kişili onay açık: onaylayan kişi aynı ödemeyi ödendi olarak işaretleyemez.'
                      : 'Önce onayla, sonra parayı gönderip “Ödendi” olarak işaretle.'
                  }
                />
              )}
              {rows.map((p) => (
                <PayoutCard key={p.id} p={p} onDone={q.reload} />
              ))}
            </>
          );
        }}
      </LoadState>
    </SectionScroll>
  );
}

const money = (p: admin.AgencyPayout) => `${fmtNum(p.amount)} elmas`;

function PayoutCard({ p, onDone }: { p: admin.AgencyPayout; onDone: () => void }) {
  const ctx = useAdmin();
  const [busy, setBusy] = useState(false);
  const who = `${p.agency.name} (${p.agency.code})`;

  const approve = () =>
    confirmThen(
      ctx,
      { title: 'Ödemeyi onayla', message: `${who} için ${money(p)} · ${fmtUsd(p.usd)} ödemeye hazır olarak işaretlenir. Para bu adımda gönderilmez.`, confirm: 'Onayla' },
      () => admin.decidePayout(p.id, 'approve'),
      () => 'Ödeme onaylandı',
      onDone,
      setBusy,
    );

  const pay = () =>
    ctx.ask({
      kind: 'text',
      title: 'Ödendi olarak işaretle',
      message: `Bu düğme para göndermez. Önce ${fmtUsd(p.usd)} tutarını ${p.agency.name} ajansına bankandan gönder, sonra havale dekontundaki numarayı yaz.`,
      label: 'Havale / dekont numarası',
      placeholder: 'Örn. 2026110412345',
      min: 3,
      max: 100,
      confirm: 'Devam',
      onSubmit: (paymentRef) =>
        confirmThen(
          ctx,
          { title: 'Ödendi olarak işaretle', message: `${who} · ${fmtUsd(p.usd)}\nDekont: ${paymentRef}\n\nAjans ödemenin yapıldığını görür.`, confirm: 'Gönderdim, işaretle' },
          () => admin.decidePayout(p.id, 'pay', { paymentRef }),
          () => `${p.agency.name} için ödeme kaydedildi`,
          onDone,
          setBusy,
        ),
    });

  const close = (action: 'reject' | 'cancel') =>
    ctx.ask({
      kind: 'text',
      title: action === 'reject' ? 'Ödemeyi reddet' : 'Ödemeyi iptal et',
      message: 'Kazanç ajansın çekilebilir bakiyesine geri döner. Yazdığın neden ajansa gösterilir.',
      label: 'Neden',
      placeholder: 'Örn. Banka bilgisi eksik',
      min: 3,
      max: 300,
      confirm: 'Devam',
      destructive: true,
      onSubmit: (note) =>
        confirmThen(
          ctx,
          { title: action === 'reject' ? 'Reddedilsin mi?' : 'İptal edilsin mi?', message: `${who} · ${money(p)}\nNeden: ${note}`, confirm: action === 'reject' ? 'Reddet' : 'İptal et', destructive: true },
          () => admin.decidePayout(p.id, action, { note }),
          () => (action === 'reject' ? 'Ödeme reddedildi' : 'Ödeme iptal edildi'),
          onDone,
          setBusy,
        ),
    });

  return (
    <ItemCard title={money(p)} sub={`${fmtUsd(p.usd)} · ${p.currency === 'TRY' ? 'TL olarak ödenecek' : 'USD olarak ödenecek'}`} pill={<StatusPill text={p.statusLabel} tone={TONE[p.status]} />}>
      <Line label="Ajans" value={who} />
      <Line label="Talep eden" value={`${p.requestedBy} · ${fmtDate(p.requestedAt)} · ${ago(p.requestedAt)}`} />
      {!!p.approvedBy && <Line label="Onaylayan" value={`${p.approvedBy}${p.approvedAt ? ` · ${fmtDate(p.approvedAt)}` : ''}`} />}
      {!!p.paidAt && <Line label="Ödendi" value={fmtDate(p.paidAt)} />}
      {!!p.paymentRef && <Line label="Dekont" value={p.paymentRef} mono />}
      {!!p.note && <Quote text={p.note} />}
      {(p.status === 'pending' || p.status === 'ready') && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          {p.status === 'pending' && <Button title="Onayla" icon="checkmark-circle-outline" variant="tonal" small onPress={approve} disabled={busy} />}
          {p.status === 'ready' && <Button title="Ödendi olarak işaretle" icon="checkmark-done-outline" variant="tonal" small onPress={pay} disabled={busy} />}
          <Button
            title={p.status === 'pending' ? 'Reddet' : 'İptal et'}
            icon="close-circle-outline"
            variant="danger"
            small
            onPress={() => close(p.status === 'pending' ? 'reject' : 'cancel')}
            disabled={busy}
          />
        </View>
      )}
    </ItemCard>
  );
}
