// Yönetim › Şikâyetler: the report queue, oldest open first. A report is closed as handled (optionally banning
// the reported person for a while) or as "sorun yok". A running ban can be lifted from the same card.
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui';
import { BAN_OPTIONS, REPORT_TARGET_LABEL, ago, banPhrase, fmtDate } from '@/lib/admin-format';
import * as admin from '@/lib/live/admin';

import { Filters, ItemCard, Line, LoadState, Notice, Quote, SectionScroll, StatusPill, confirmThen, useAdmin, useLoad, type AdminCtx } from './parts';

const FILTERS: [admin.ReportStatus, string][] = [
  ['open', 'Açık'],
  ['actioned', 'İşlem yapıldı'],
  ['dismissed', 'Sorun yok'],
];
const STATUS: Record<admin.ReportStatus, [string, 'money' | 'success' | 'neutral']> = { open: ['Açık', 'money'], actioned: ['İşlem yapıldı', 'success'], dismissed: ['Sorun yok', 'neutral'] };

export function ReportsSection() {
  const [filter, setFilter] = useState<admin.ReportStatus>('open');
  const load = useLoad(() => admin.reports(filter), [filter]);
  return (
    <SectionScroll load={load}>
      <Filters value={filter} options={FILTERS} onChange={setFilter} />
      <LoadState
        load={load}
        empty={(d) =>
          d.length ? null : filter === 'open' ? { icon: 'shield-checkmark-outline', title: 'Açık şikâyet yok', text: 'Kullanıcılar birini veya bir odayı şikâyet edince burada görünür.' } : { icon: 'file-tray-outline', title: 'Bu listede şikâyet yok' }
        }
      >
        {(d) => (
          <>
            {filter === 'open' && <Notice text="Şikâyeti inceledikten sonra kapat. Askıya alınan kişi süre bitene kadar uygulamaya giremez." />}
            {d.map((r) => (
              <ReportCard key={r.id} r={r} onDone={load.reload} />
            ))}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

const targetName = (r: admin.Report) => r.target.name ?? (r.target.type === 'message' ? 'Bir mesaj' : r.target.type === 'moment' ? 'Bir paylaşım' : 'Silinmiş kayıt');

function ReportCard({ r, onDone }: { r: admin.Report; onDone: () => void }) {
  const ctx = useAdmin();
  const [busy, setBusy] = useState(false);
  const isUser = r.target.type === 'user';
  const name = targetName(r);
  const canBan = isUser && !r.target.staff && !!r.target.name;
  const [label, tone] = STATUS[r.status];

  return (
    <ItemCard title={r.reason} sub={`${REPORT_TARGET_LABEL[r.target.type] ?? 'Kayıt'} · ${name}`} pill={<StatusPill text={label} tone={tone} />}>
      {isUser && r.target.name ? <Line label="Şikâyet edilen" value={name} onPress={() => ctx.openAccount(r.target.id, name)} /> : null}
      <Line label="Şikâyet eden" value={r.reporter.name} />
      <Line label="Tarih" value={`${fmtDate(r.createdAt)} · ${ago(r.createdAt)}`} />
      {r.reportsOnTarget > 1 && <Line label="Toplam" value={`Bu ${isUser ? 'kişi' : 'kayıt'} ${r.reportsOnTarget} kez şikâyet edildi`} />}
      {r.target.bannedUntil && <Line label="Askıda" value={`${fmtDate(r.target.bannedUntil)} tarihine kadar`} />}
      {r.target.staff && <Line label="Not" value="Yetkili hesabı; askıya alınamaz" />}
      {!!r.note && <Quote text={r.note} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
        {r.status === 'open' && canBan && !r.target.bannedUntil && (
          <Button title="Askıya al" icon="ban-outline" variant="danger" small disabled={busy} onPress={() => askBan(ctx, r, name, onDone, setBusy)} />
        )}
        {r.status === 'open' && (
          <Button
            title="İşlem yapıldı"
            icon="checkmark-circle-outline"
            variant="tonal"
            small
            disabled={busy}
            onPress={() =>
              confirmThen(
                ctx,
                { title: 'İşlem yapıldı olarak kapat', message: `“${r.reason}” şikâyeti kapatılır. Kimse askıya alınmaz.`, confirm: 'Kapat' },
                () => admin.handleReport(r.id, 'actioned'),
                () => 'Şikâyet kapatıldı',
                onDone,
                setBusy,
              )
            }
          />
        )}
        {r.status === 'open' && (
          <Button
            title="Sorun yok"
            variant="ghost"
            small
            disabled={busy}
            onPress={() =>
              confirmThen(
                ctx,
                { title: 'Sorun yok', message: 'Şikâyet işlem yapılmadan kapatılır.', confirm: 'Kapat' },
                () => admin.handleReport(r.id, 'dismissed'),
                () => 'Şikâyet kapatıldı',
                onDone,
                setBusy,
              )
            }
          />
        )}
        {isUser && r.target.bannedUntil && (
          <Button
            title="Askıyı kaldır"
            icon="lock-open-outline"
            variant="ghost"
            small
            disabled={busy}
            onPress={() =>
              confirmThen(
                ctx,
                { title: 'Askıyı kaldır', message: `${name} hemen yeniden giriş yapabilir.`, confirm: 'Kaldır' },
                () => admin.ban(r.target.id, null),
                () => `${name} için askı kaldırıldı`,
                onDone,
                setBusy,
              )
            }
          />
        )}
      </View>
    </ItemCard>
  );
}

function askBan(ctx: AdminCtx, r: admin.Report, name: string, onDone: () => void, setBusy: (b: boolean) => void) {
  ctx.ask({
    kind: 'choice',
    title: `${name} askıya alınsın`,
    message: 'Ne kadar süre? Süre bitince hesap kendiliğinden açılır. Şikâyet de işlem yapıldı olarak kapanır.',
    options: BAN_OPTIONS.map((o) => ({ value: o.days, label: o.label })),
    confirm: 'Devam',
    destructive: true,
    onSubmit: (days) =>
      confirmThen(
        ctx,
        { title: 'Askıya al', message: `${name} ${banPhrase(days, true)} ve süre bitene kadar uygulamayı kullanamaz.`, confirm: 'Askıya al', destructive: true },
        () => admin.handleReport(r.id, 'actioned', days),
        () => `${name} ${banPhrase(days)}`,
        onDone,
        setBusy,
      ),
  });
}
