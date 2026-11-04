// Yönetim › Para çekme: hosts' diamond withdrawal requests, oldest pending first. The owner pays by bank
// transfer outside the app, then marks the request paid; a rejection (with a reason the host sees) gives the
// diamonds back. A server with test coins refuses to mark anything paid and says so.
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui';
import { ago, fmtDate, fmtDiamonds, fmtUsd } from '@/lib/admin-format';
import { copyText } from '@/lib/clipboard';
import * as admin from '@/lib/live/admin';
import { formatIban } from '@/lib/withdraw-rules';

import { Filters, ItemCard, Line, LoadState, Notice, Quote, SectionScroll, StatusPill, confirmThen, useAdmin, useLoad, type Tone } from './parts';

type Filter = admin.WithdrawalStatus | 'all';
const FILTERS: [Filter, string][] = [
  ['pending', 'Bekleyen'],
  ['paid', 'Ödenen'],
  ['rejected', 'Reddedilen'],
  ['all', 'Tümü'],
];
const TONE: Record<admin.WithdrawalStatus, Tone> = { pending: 'money', paid: 'success', rejected: 'danger', cancelled: 'neutral' };
const REJECT_REASONS = ['IBAN veya hesap bilgisi hatalı', 'Ad soyad hesapla uyuşmuyor', 'Hesapta şüpheli hareket var'];

export function WithdrawalsSection() {
  const [filter, setFilter] = useState<Filter>('pending');
  const load = useLoad(() => admin.withdrawals(filter), [filter]);
  return (
    <SectionScroll load={load}>
      <Filters value={filter} options={FILTERS} onChange={setFilter} />
      <LoadState
        load={load}
        empty={(d) =>
          d.rows.length ? null : filter === 'pending' ? { icon: 'checkmark-done-outline', title: 'Bekleyen talep yok', text: 'Yeni bir para çekme talebi gelince burada görünür.' } : { icon: 'file-tray-outline', title: 'Bu listede talep yok' }
        }
      >
        {(d) => (
          <>
            {d.playMoney && filter === 'pending' && (
              <Notice tone="money" text="Bu sunucuda test jetonu açık. Talepler şimdilik ödendi olarak işaretlenemez; yalnızca reddedilebilir. Gerçek ödemeler test kapatılınca başlar." />
            )}
            {d.rows.map((w) => (
              <WithdrawalCard key={w.id} w={w} onDone={load.reload} />
            ))}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

function WithdrawalCard({ w, onDone }: { w: admin.AdminWithdrawal; onDone: () => void }) {
  const ctx = useAdmin();
  const [busy, setBusy] = useState(false);
  const iban = w.method === 'iban';
  const account = iban ? formatIban(w.account) : w.account;
  const amount = `${fmtDiamonds(w.diamonds)} · ${fmtUsd(w.usd)}`;

  const markPaid = () =>
    confirmThen(
      ctx,
      {
        title: 'Ödendi olarak işaretle',
        message: `Bu düğme para göndermez. Önce ${fmtUsd(w.usd)} tutarını bankandan ${w.holder} adına ${iban ? 'bu IBAN’a' : 'bu hesaba'} gönder:\n\n${account}\n\nGönderdiysen devam et; ${w.user.name} ödemenin yapıldığını görür.`,
        confirm: 'Gönderdim, işaretle',
      },
      () => admin.decideWithdrawal(w.id, true),
      () => `${w.user.name} için ödeme kaydedildi`,
      onDone,
      setBusy,
    );

  const reject = () =>
    ctx.ask({
      kind: 'text',
      title: 'Talebi reddet',
      message: `${fmtDiamonds(w.diamonds)} ${w.user.name} hesabına geri döner. Yazdığın neden kişiye gösterilir.`,
      label: 'Ret nedeni',
      placeholder: 'Örn. IBAN hatalı, lütfen yeniden talep oluştur',
      suggestions: REJECT_REASONS,
      min: 3,
      max: 300,
      confirm: 'Devam',
      destructive: true,
      onSubmit: (note) =>
        confirmThen(
          ctx,
          { title: 'Reddedilsin mi?', message: `${w.user.name} · ${fmtDiamonds(w.diamonds)}\nNeden: ${note}`, confirm: 'Reddet', destructive: true },
          () => admin.decideWithdrawal(w.id, false, note),
          () => 'Talep reddedildi, elmaslar geri verildi',
          onDone,
          setBusy,
        ),
    });

  return (
    <ItemCard title={fmtDiamonds(w.diamonds)} sub={fmtUsd(w.usd)} pill={<StatusPill text={w.statusLabel} tone={TONE[w.status]} />}>
      <Line label="Kişi" value={w.user.phone ? `${w.user.name} · ${w.user.phone}` : w.user.name} onPress={() => ctx.openAccount(w.user.id, w.user.name)} />
      <Line label="Hesap sahibi" value={w.holder} onCopy={() => copyText(w.holder, 'Hesap sahibi')} />
      <Line label={iban ? 'IBAN' : 'Hesap'} value={account} mono onCopy={() => copyText(iban ? w.account.replace(/\s+/g, '') : w.account, iban ? 'IBAN' : 'Hesap bilgisi')} />
      <Line label="Tutar" value={amount} />
      <Line label="Talep" value={`${fmtDate(w.createdAt)} · ${ago(w.createdAt)}`} />
      {!!w.decidedAt && <Line label="Karar" value={fmtDate(w.decidedAt)} />}
      {w.play && <Line label="Not" value="Test jetonuyla kazanılmış; ödenemez" />}
      {!!w.note && <Quote text={w.note} />}
      {w.status === 'pending' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          <Button title="Ödendi olarak işaretle" icon="checkmark-circle-outline" variant="tonal" small onPress={markPaid} disabled={busy} />
          <Button title="Reddet" icon="close-circle-outline" variant="danger" small onPress={reject} disabled={busy} />
        </View>
      )}
    </ItemCard>
  );
}
