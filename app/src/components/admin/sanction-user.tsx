// Yönetim › Yaptırımlar › one person (GET /api/admin/sanctions/user): who they are, what runs now, what waits
// for approval, the full history, their devices (risk, accounts, ban) with the risk review, device bans given
// over other accounts on those devices, appeals and the audit log. Opened from search, a report or a pending
// sanction; it replaces the panel's tabs until Geri.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Header } from '@/components/ui';
import { ago, fmtDate, verificationLabel } from '@/lib/admin-format';
import { copyText } from '@/lib/clipboard';
import * as admin from '@/lib/live/admin';
import {
  APPEAL_LABEL,
  AUDIT_RESULT,
  DEVICE_PLATFORM,
  RISKS,
  RISK_LABEL,
  auditAction,
  has,
  roleLabel,
  splitSanctions,
  typeAllowed,
  type SanctionDevice,
  type SanctionMeta,
} from '@/lib/sanction-format';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { ItemCard, Line, LoadState, Notice, Quote, SectionScroll, StatusPill, useAdmin, useLoad, type AdminCtx } from './parts';
import { ApplySheet } from './sanction-apply';
import { ApproveButtons, EmptyLine, SanctionCard, SectionLabel, run } from './sanction-parts';

export function SanctionUserScreen({ id, name, meta, onClose }: { id: string; name: string; meta: SanctionMeta; onClose: () => void }) {
  const ctx = useAdmin();
  const s = useStyles();
  const load = useLoad(() => admin.sanctionUser(id), [id]);
  const d = load.data;
  const title = d?.user.name ?? name;
  const canApply = meta.types.some((t) => typeAllowed(t.type, meta.perms));
  const staffTarget = d ? d.user.role === 'admin' || d.user.role === 'moderator' : false;
  const apply = () => d && ctx.present(<ApplySheet target={{ id, name: title, devices: d.devices, onDone: load.reload }} meta={meta} />);

  return (
    <View style={{ flex: 1 }}>
      <Header title={title} onBack={onClose} />
      <SectionScroll load={load}>
        <LoadState load={load}>
          {(d) => {
            const parts = splitSanctions(d.sanctions);
            return (
              <>
                <View style={s.hero}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.name}>{d.user.name}</Text>
                      <Text style={s.dim} selectable onPress={() => copyText(d.user.id, 'Hesap kimliği')}>
                        {d.user.id}
                      </Text>
                    </View>
                    <StatusPill text={roleLabel(d.user.role)} tone={staffTarget ? 'action' : 'neutral'} />
                  </View>
                  <View style={s.grid}>
                    <Stat label="Süren" value={parts.live.length} tone={parts.live.length ? 'danger' : undefined} />
                    <Stat label="Toplam" value={d.sanctions.length} />
                    <Stat label="Cihaz" value={d.devices.length} />
                    <Stat label="İtiraz" value={d.appeals.length} />
                  </View>
                  <View style={{ gap: 6 }}>
                    {!!d.user.phone && <Line label="Telefon" value={d.user.phone} mono onCopy={() => copyText(d.user.phone ?? '', 'Telefon')} />}
                    <Line label="Hesap açılışı" value={fmtDate(d.user.createdAt)} />
                    {d.user.deleted && <Line label="Durum" value="Hesap silinmiş" />}
                  </View>
                  {staffTarget && <Notice tone="neutral" icon="shield-outline" text="Yetkili hesabı. Kendi seviyendeki veya üstündeki birine yaptırım uygulanamaz." />}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                    {canApply && !d.user.deleted && <Button title="Yaptırım uygula" icon="shield-checkmark-outline" small onPress={apply} />}
                    <Button title="Hesap ve bakiye" icon="wallet-outline" variant="ghost" small onPress={() => ctx.openAccount(d.user.id, d.user.name)} />
                  </View>
                </View>

                <SectionLabel text="Süren yaptırımlar" count={parts.live.length} />
                {parts.live.length ? parts.live.map((x) => <SanctionCard key={x.id} x={x} ctx={ctx} perms={meta.perms} onChanged={load.reload} />) : <EmptyLine text="Şu an süren yaptırım yok." />}

                {parts.pending.length > 0 && (
                  <>
                    <SectionLabel text="Onay bekleyen" count={parts.pending.length} />
                    {parts.pending.map((x) => (
                      <SanctionCard
                        key={x.id}
                        x={x}
                        ctx={ctx}
                        perms={meta.perms}
                        onChanged={load.reload}
                        extra={has(meta.perms, 'sanction.approve') ? <ApproveButtons x={x} ctx={ctx} onDone={load.reload} /> : undefined}
                      />
                    ))}
                  </>
                )}

                <SectionLabel text="Geçmiş" count={parts.history.length} />
                {parts.history.length ? parts.history.map((x) => <SanctionCard key={x.id} x={x} ctx={ctx} perms={meta.perms} onChanged={load.reload} />) : <EmptyLine text="Geçmiş yaptırım yok." />}

                <SectionLabel text="Cihazlar" count={d.devices.length} />
                {d.devices.length ? (
                  d.devices.map((dev) => <DeviceCard key={dev.id} dev={dev} ctx={ctx} perms={meta.perms} onChanged={load.reload} />)
                ) : (
                  <EmptyLine text="Kayıtlı cihaz yok (uygulamanın eski sürümü cihaz bildirmiyor olabilir)." />
                )}

                {d.deviceSanctions.length > 0 && (
                  <>
                    <SectionLabel text="Cihazlarındaki diğer cihaz banları" count={d.deviceSanctions.length} />
                    <Notice
                      tone="money"
                      icon="phone-portrait-outline"
                      text="Bu banlar başka bir hesap üzerinden verildi ama bu kişinin de kullandığı bir cihazda geçerli. Ortak kullanılan bir telefon olabilir."
                    />
                    {d.deviceSanctions.map((x) => (
                      <SanctionCard key={x.id} x={x} ctx={ctx} perms={meta.perms} onChanged={load.reload} userName="" />
                    ))}
                  </>
                )}

                <SectionLabel text="İtirazlar" count={d.appeals.length} />
                {d.appeals.length ? (
                  d.appeals.map((a) => {
                    const [label, tone] = APPEAL_LABEL[a.status];
                    return (
                      <ItemCard key={a.id} title={`İtiraz #${a.id}`} sub={`Yaptırım #${a.sanctionId} · ${fmtDate(a.createdAt)}`} pill={<StatusPill text={label} tone={tone} />}>
                        <Quote text={a.text} />
                        {!!a.reviewedBy && <Line label="İnceleyen" value={a.reviewedBy} />}
                        {!!a.decidedAt && <Line label="Karar" value={fmtDate(a.decidedAt)} />}
                        {!!a.note && <Line label="Karar notu" value={a.note} />}
                      </ItemCard>
                    );
                  })
                ) : (
                  <EmptyLine text="İtiraz yok." />
                )}

                <SectionLabel text="İşlem kaydı" count={d.audit.length} />
                {d.audit.length ? (
                  <View style={s.log}>
                    {d.audit.map((l, i) => {
                      const [rl, rt] = AUDIT_RESULT[l.result] ?? [l.result, 'neutral'];
                      return (
                        <View key={l.id} style={[s.logRow, i > 0 && s.logSep]}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={s.logTitle}>
                              {auditAction(l.action)}
                              {l.sanctionId ? ` · #${l.sanctionId}` : ''}
                            </Text>
                            <Text style={s.dim}>
                              {[l.actor, roleLabel(l.role)].filter(Boolean).join(' · ')} · {fmtDate(l.at)} · {ago(l.at)}
                            </Text>
                          </View>
                          <StatusPill text={rl} tone={rt} />
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <EmptyLine text="Kayıt yok." />
                )}
              </>
            );
          }}
        </LoadState>
      </SectionScroll>
    </View>
  );
}

function DeviceCard({ dev, ctx, perms, onChanged }: { dev: SanctionDevice; ctx: AdminCtx; perms: string[]; onChanged: () => void }) {
  const [label, tone] = RISK_LABEL[dev.risk] ?? [dev.risk, 'neutral'];
  const [busy, setBusy] = useState(false);
  // The review needs the device-ban permission (POST /api/admin/devices/risk).
  const canReview = has(perms, 'sanction.device_ban');
  const review = () =>
    ctx.ask({
      kind: 'choice',
      title: `Cihaz #${dev.id}: risk durumu`,
      message: 'İnceledikten sonra cihazın durumunu seç. Örneğin aile içinde ortak kullanılan bir telefon “Ortak kullanım” olarak işaretlenir. İşaret tek başına kimseyi engellemez.',
      options: RISKS.map((r, i) => ({ value: i, label: RISK_LABEL[r][0] })),
      confirm: 'Devam',
      onSubmit: (i) =>
        ctx.ask({
          kind: 'text',
          title: `Cihaz #${dev.id}: ${RISK_LABEL[RISKS[i]][0]}`,
          message: 'Bu kararı neden verdiğini kısaca yaz; cihazın notuna ve işlem kaydına eklenir.',
          label: 'İnceleme notu',
          placeholder: 'Örn. kardeşler aynı telefonu kullanıyor',
          min: 3,
          max: 300,
          confirm: 'Kaydet',
          onSubmit: (note) =>
            run(
              ctx,
              () => admin.reviewDevice(dev.id, RISKS[i], note),
              () => `Cihaz #${dev.id} “${RISK_LABEL[RISKS[i]][0]}” olarak işaretlendi`,
              onChanged,
              setBusy,
            ),
        }),
    });
  return (
    <ItemCard
      title={`${DEVICE_PLATFORM[dev.platform] ?? dev.platform}${dev.model ? ` · ${dev.model}` : ''}`}
      sub={[`#${dev.id}`, dev.os, dev.app && `uygulama ${dev.app}`].filter(Boolean).join(' · ')}
      pill={<StatusPill text={dev.banned ? 'Banlı' : label} tone={dev.banned ? 'danger' : tone} />}
    >
      {dev.banned && <Line label="Risk" value={label} />}
      <Line label="Hesap sayısı" value={dev.accounts > 1 ? `${dev.accounts} hesap bu cihazı kullanıyor` : 'Yalnızca bu hesap'} />
      <Line label="İlk görülme" value={fmtDate(dev.firstSeenAt)} />
      <Line label="Son görülme" value={`${fmtDate(dev.lastSeenAt)} · ${ago(dev.lastSeenAt)}`} />
      {!!dev.verification && <Line label="Doğrulama" value={verificationLabel(dev.verification)} />}
      {!!dev.riskNote && <Quote text={dev.riskNote} />}
      {canReview && (
        <View style={{ flexDirection: 'row', paddingTop: 4 }}>
          <Button title="Riski incele" icon="search-outline" variant="tonal" small disabled={busy} onPress={review} />
        </View>
      )}
    </ItemCard>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  const { semantic } = useTheme();
  const s = useStyles();
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, tone === 'danger' && value > 0 ? { color: semantic.danger } : null]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors, surface, lift }) => ({
  hero: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: surface.rim, ...lift },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.sm, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  log: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: surface.rim, paddingHorizontal: space.lg, ...lift },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12 },
  logSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: surface.hairline },
  logTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
}));
