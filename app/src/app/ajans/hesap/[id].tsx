import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Check, Chips, KV, Note, Section, StatusBadge, ViewerBar, s } from '@/components/agency-apps';
import { Button, Header } from '@/components/ui';
import { USERS } from '@/data/mock';
import { resolve, type PermissionKey } from '@/data/rbac';
import { RULES } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import {
  COMMISSION_BASES,
  bankNumbers,
  currentRule,
  decideAgencyPayout,
  enableCoinsBank,
  payoutChecklist,
  personName,
  prepareAgreement,
  regionName,
  regionOf,
  requestAgencyPayout,
  reverseLedgerRow,
  setCommissionRule,
  setPayoutAccount,
  setPayoutEnabled,
  setStaff,
  settlePending,
  signAgreement,
  stamp,
  useAgencyApps,
  useViewer,
  verifyPayoutAccount,
  type AgencyAccount,
  type StaffRole,
} from '@/lib/agency-apps';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const dia = (n: number) => `${fmt(n)} 💎`;
const usd = (n: number) => `≈ ${(n / RULES.diamondsPerUsd).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} USD`;

export default function AgencyAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rbac } = useApp();
  const st = useAgencyApps();
  const viewer = useViewer();
  const ag = st.agencies.find((a) => a.id === id);

  if (!ag) {
    return (
      <SafeAreaView style={s.safe}>
        <Header title="Ajans hesabı" />
        <View style={s.scroll}>
          <Note tone="bad" text="Ajans bulunamadı." />
        </View>
      </SafeAreaView>
    );
  }

  const ctx = { rbac, actor: viewer };
  const region = regionOf(ag.country, ag.city);
  const scope = region ? { type: 'region' as const, id: region } : { type: 'platform' as const };
  const can = (p: PermissionKey) => resolve(rbac, viewer, p, scope).allowed;
  const isOwner = viewer === ag.ownerId;
  const isBd = viewer === ag.bdId;
  const staffView = can('agencies.manage') || can('agencies.payout') || can('agencies.commission');
  // The owner sees only their own agency's money; staff need a finance permission; a BD sees performance only.
  const seesFinance = isOwner || can('agencies.payout') || can('finance.reports.view');
  const hasAccess = isOwner || staffView || (isBd && can('agencies.performance'));

  const ownerOption = { id: ag.ownerId, label: `${personName(ag.ownerId)} · Ajans sahibi` };
  if (!hasAccess) {
    return (
      <SafeAreaView style={s.safe}>
        <Header title="Ajans hesabı" />
        <ViewerBar extra={[ownerOption]} />
        <View style={s.scroll}>
          <Note tone="bad" text="Bu ajans hesabını görüntüleme yetkin yok. Ajans sahipleri yalnız kendi ajanslarını görür." />
        </View>
      </SafeAreaView>
    );
  }

  const r = (err: string | null, ok: string) => {
    if (err) {
      errorHaptic();
      showAlert('İşlem yapılamadı', err);
      return false;
    }
    successHaptic();
    showAlert(ok);
    return true;
  };

  return (
    <SafeAreaView style={s.safe}>
      <Header title={ag.name} />
      <ViewerBar extra={ag.ownerId === 'me' ? [] : [ownerOption]} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <View style={s.row}>
            <Text selectable style={[s.mono, { flex: 1 }]}>
              {ag.id} · Kod {ag.code}
            </Text>
            <StatusBadge status={ag.status} tone={ag.status === 'Aktif' ? 'good' : ag.status === 'Askıda' ? 'bad' : 'warn'} />
          </View>
          <Text style={s.title}>{ag.name}</Text>
          <KV k="Ajans sahibi" v={personName(ag.ownerId)} />
          <KV k="Atanmış BD" v={ag.bdId ? personName(ag.bdId) : '—'} />
          <KV k="Faaliyet" v={`${ag.city}, ${ag.country} · ${regionName(ag.country, ag.city)}`} />
          <KV k="Başvuru / onay" v={`${ag.appliedAt.slice(0, 10)} / ${ag.approvedAt.slice(0, 10)}`} />
          <KV k="Coins Bank" v={ag.coinsBank.enabled ? `Açık (${ag.coinsBank.at?.slice(0, 10)})` : 'Kapalı'} />
          <KV k="Ödeme yetkisi" v={ag.payoutEnabled ? 'Açık' : 'Kapalı'} />
          {isOwner && <Note text="Sahip görünümü: yalnız kendi ajansının kayıtlarını görürsün." />}
          {isBd && !staffView && <Note text="BD görünümü: performans ve genel bilgiler. Finans ve ödeme işlemleri yetkiye bağlı." />}
        </View>

        <Section title="Kurulum adımları" icon="list">
          {payoutChecklist(ag).map((c) => (
            <Check key={c.label} done={c.done} label={c.label} />
          ))}
          <Check done={ag.payoutEnabled} label="Para çekme yetkisi açıldı" />
          <Text style={s.dim}>Başvuru onayı tek başına para çekme yetkisi vermez.</Text>
        </Section>

        <Staff ag={ag} canEdit={can('agencies.manage')} run={(role, uid) => r(setStaff(ctx, ag.id, uid, role), 'Yetkili güncellendi')} />
        <AgreementCard ag={ag} canEdit={can('agencies.manage')} isOwner={isOwner} ctx={ctx} r={r} />
        <CommissionCard ag={ag} canEdit={can('agencies.commission')} ctx={ctx} r={r} />

        <Section title="Bağlı yayıncılar" icon="people">
          {!ag.hosts.length && <Text style={s.dim}>Henüz bağlı yayıncı yok.</Text>}
          {ag.hosts.map((h) => {
            const base = ag.ledger.filter((l) => l.hostId === h.userId && l.status !== 'Ters kayıt').reduce((x, l) => x + l.base, 0);
            return (
              <View key={h.userId} style={s.row}>
                <Ionicons name="mic" size={16} color={colors.primaryText} />
                <Text style={[s.body, { flex: 1 }]}>{personName(h.userId)}</Text>
                <Text style={s.dim}>{seesFinance || isBd ? `Uygun gelir ${dia(base)}` : `Katılım ${h.at.slice(0, 10)}`}</Text>
              </View>
            );
          })}
          <Text style={s.dim}>Yayıncı kazancı yayıncının kendi defterindedir; ajans komisyonu bundan düşülmez.</Text>
        </Section>

        {seesFinance ? (
          <CoinsBankCard ag={ag} ctx={ctx} isOwner={isOwner} can={can} r={r} />
        ) : (
          <Note tone="bad" text="Coins Bank ve finansal kayıtlar: görüntüleme yetkin yok." />
        )}

        {staffView && (
          <Section title="Denetim kayıtları" icon="shield-checkmark">
            {st.audit.filter((a) => a.target.includes(ag.id)).length === 0 && <Text style={s.dim}>Bu oturumda bu ajans için işlem yok.</Text>}
            {st.audit
              .filter((a) => a.target.includes(ag.id))
              .map((a) => (
                <Text key={a.id} style={s.dim}>
                  {a.at} · {personName(a.actor)} · {a.action}
                  {a.detail ? ` · ${a.detail}` : ''} · {a.result}
                </Text>
              ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type Ctx = { rbac: ReturnType<typeof useApp>['rbac']; actor: string };
type Run = (err: string | null, ok: string) => boolean;

function Staff({ ag, canEdit, run }: { ag: AgencyAccount; canEdit: boolean; run: (role: StaffRole | null, uid: string) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole>('Yönetici');
  const candidates = USERS.filter((u) => !ag.users.some((x) => x.userId === u.id)).slice(0, 8);
  return (
    <Section title="Sahip ve yetkililer" icon="person-add">
      {ag.users.map((u) => (
        <View key={u.userId} style={s.row}>
          <Text style={[s.body, { flex: 1 }]}>
            {personName(u.userId)} · <Text style={{ color: u.role === 'Sahip' ? colors.gold : colors.primaryText }}>{u.role}</Text>
          </Text>
          <Text style={s.mono}>{u.at.slice(0, 10)}</Text>
          {canEdit && u.role !== 'Sahip' && <Button title="Kaldır" small variant="ghost" onPress={() => run(null, u.userId)} />}
        </View>
      ))}
      {canEdit ? (
        <>
          <View style={s.divider} />
          <Text style={s.label}>Yetkili ekle veya sahibi değiştir</Text>
          <Chips wrap={false} options={candidates.map((u) => ({ key: u.id, label: u.name }))} value={pick} onChange={setPick} />
          <Chips options={(['Yönetici', 'Asistan', 'Sahip'] as StaffRole[]).map((x) => ({ key: x, label: x }))} value={role} onChange={setRole} />
          <Button title="Kaydet" small variant="tonal" style={{ alignSelf: 'flex-start' }} onPress={() => (pick ? run(role, pick) : showAlert('Bir kişi seç'))} />
        </>
      ) : (
        <Text style={s.dim}>Yetkili değişikliği ajans yönetimi yetkisi ister.</Text>
      )}
    </Section>
  );
}

function AgreementCard({ ag, canEdit, isOwner, ctx, r }: { ag: AgencyAccount; canEdit: boolean; isOwner: boolean; ctx: Ctx; r: Run }) {
  const [months, setMonths] = useState('12');
  const cur = ag.agreements[ag.agreements.length - 1];
  return (
    <Section title="Sözleşme" icon="document-text">
      {cur ? (
        <>
          <View style={s.row}>
            <Text style={[s.label, { flex: 1 }]}>v{cur.version}</Text>
            <StatusBadge status={cur.status} tone={cur.status === 'İmzalandı' ? 'good' : 'warn'} />
          </View>
          <KV k="Süre" v={`${cur.start} – ${cur.end}`} />
          <KV k="Hazırlayan" v={`${personName(cur.preparedBy)} · ${cur.preparedAt}`} />
          {cur.signedAt && <KV k="İmza" v={cur.signedAt} />}
          <Text style={s.dim}>Ana maddeler: komisyon yayıncı kazancından kesilmez, ayrı defterde tutulur · ödeme finansal doğrulama sonrası · yayıncı devri ve fesih kuralları.</Text>
        </>
      ) : (
        <Text style={s.dim}>Henüz sözleşme hazırlanmadı.</Text>
      )}
      {cur?.status === 'İmza bekliyor' && isOwner && <Button title="Sözleşmeyi imzala" icon="create" onPress={() => r(signAgreement(ctx.actor, ag.id), 'Sözleşme imzalandı')} />}
      {cur?.status === 'İmza bekliyor' && !isOwner && canEdit && (
        <Button title="Demo: sahip adına imzala" variant="tonal" small style={{ alignSelf: 'flex-start' }} onPress={() => r(signAgreement(ag.ownerId, ag.id), 'Sözleşme imzalandı (sahip adına, demo)')} />
      )}
      {canEdit && cur?.status !== 'İmza bekliyor' && (
        <>
          <Text style={s.label}>{cur ? 'Yeni sürüm hazırla' : 'Sözleşme hazırla'}</Text>
          <Chips options={['6', '12', '24'].map((m) => ({ key: m, label: `${m} ay` }))} value={months} onChange={setMonths} />
          <Button title="Sözleşmeyi gönder" small variant="tonal" style={{ alignSelf: 'flex-start' }} onPress={() => r(prepareAgreement(ctx, ag.id, Number(months)), 'Sözleşme imzaya gönderildi')} />
        </>
      )}
      {ag.agreements.length > 1 && <Text style={s.dim}>Önceki sürümler: {ag.agreements.slice(0, -1).map((g) => `v${g.version} (${g.status})`).join(', ')}</Text>}
    </Section>
  );
}

function CommissionCard({ ag, canEdit, ctx, r }: { ag: AgencyAccount; canEdit: boolean; ctx: Ctx; r: Run }) {
  const cur = currentRule(ag);
  const [rate, setRate] = useState(String(Math.round((cur?.rate ?? RULES.agencyCommission) * 100)));
  const [basis, setBasis] = useState(cur?.basis ?? COMMISSION_BASES[0]);
  const [from, setFrom] = useState(() => stamp(Date.now()).slice(0, 10));
  const [reason, setReason] = useState('');
  return (
    <Section title="Komisyon kuralları" icon="pie-chart">
      {cur ? (
        <>
          <KV k="Geçerli oran" v={`%${Math.round(cur.rate * 100)} (v${cur.version})`} />
          <KV k="Hesaplama tabanı" v={cur.basis} />
          <KV k="Geçerlilik" v={`${cur.from}'den itibaren${cur.to ? ` – ${cur.to}` : ''}`} />
          <KV k="Tanımlayan" v={`${personName(cur.by)} · ${cur.reason}`} />
        </>
      ) : (
        <Text style={s.dim}>Komisyon kuralı tanımlanmadı.</Text>
      )}
      {ag.rules.length > 1 &&
        ag.rules.slice(0, -1).map((x) => (
          <Text key={x.version} style={s.dim}>
            v{x.version}: %{Math.round(x.rate * 100)} · {x.from} – {x.to ?? '…'} · {personName(x.by)}
          </Text>
        ))}
      <Note text="Ajans komisyonu yayıncı kazancından düşülmez. Yayıncı kazancı ve ajans komisyonu ayrı defterlerde tutulur; platform ikisini ayrı öder." />
      {canEdit ? (
        <>
          <View style={s.divider} />
          <Text style={s.label}>{cur ? 'Yeni sürüm tanımla' : 'Kural tanımla'}</Text>
          <View style={s.row}>
            <Text style={s.dim}>Oran %</Text>
            <TextInput value={rate} onChangeText={(t) => setRate(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" style={[s.input, { width: 80 }]} accessibilityLabel="Komisyon oranı" />
            <Text style={s.dim}>Başlangıç</Text>
            <TextInput value={from} onChangeText={setFrom} style={[s.input, { flex: 1 }]} placeholder="GG.AA.YYYY" placeholderTextColor={colors.textDim} accessibilityLabel="Geçerlilik başlangıcı" />
          </View>
          <Chips options={COMMISSION_BASES.map((b) => ({ key: b, label: b }))} value={basis} onChange={setBasis} />
          <TextInput value={reason} onChangeText={setReason} placeholder="Gerekçe (kritik işlem)" placeholderTextColor={colors.textDim} style={s.input} accessibilityLabel="Gerekçe" />
          <Button
            title="Kuralı kaydet"
            small
            variant="tonal"
            style={{ alignSelf: 'flex-start' }}
            onPress={() => r(setCommissionRule(ctx, ag.id, Number(rate) / 100, basis, from.trim(), reason), 'Komisyon kuralı kaydedildi') && setReason('')}
          />
        </>
      ) : (
        <Text style={s.dim}>Komisyon değişikliği ayrı bir yetki ister (BD’de varsayılan olarak kapalı).</Text>
      )}
    </Section>
  );
}

function CoinsBankCard({ ag, ctx, isOwner, can, r }: { ag: AgencyAccount; ctx: Ctx; isOwner: boolean; can: (p: PermissionKey) => boolean; r: Run }) {
  const [amount, setAmount] = useState(String(RULES.minWithdrawDiamonds));
  const [holder, setHolder] = useState('');
  const [iban, setIban] = useState('');
  const [reason, setReason] = useState('');
  const n = bankNumbers(ag);
  const payoutAdmin = can('agencies.payout');

  if (!ag.coinsBank.enabled) {
    return (
      <Section title="Ajans Coins Bank" icon="wallet">
        <Text style={s.dim}>Coins Bank kapalı. Sözleşme imzalanıp komisyon kuralı tanımlandıktan sonra etkinleştirilir.</Text>
        {can('agencies.coinsbank') ? (
          <Button title="Coins Bank’ı etkinleştir" icon="wallet" onPress={() => r(enableCoinsBank(ctx, ag.id), 'Coins Bank etkinleştirildi')} />
        ) : (
          <Note tone="bad" text="Etkinleştirme yetkin yok." />
        )}
      </Section>
    );
  }

  return (
    <>
      <Section title="Ajans Coins Bank" icon="wallet">
        <View style={s.grid}>
          <Stat label="Toplam hak ediş" value={dia(n.total)} sub={usd(n.total)} />
          <Stat label="Bekleyen" value={dia(n.pending)} sub={`${RULES.pendingDays} gün iade süresi`} />
          <Stat label="Kesinleşmiş" value={dia(n.settled)} />
          <Stat label="Çekilebilir" value={ag.payoutEnabled ? dia(n.withdrawable) : '🔒 Kapalı'} sub={ag.payoutEnabled ? usd(n.withdrawable) : 'Ödeme yetkisi kapalı'} color={ag.payoutEnabled ? semantic.success : colors.textDim} />
          <Stat label="Ödeme sürecinde" value={dia(n.inPayout)} />
          <Stat label="Tamamlanan" value={dia(n.paid)} />
          <Stat label="Reddedilen / başarısız" value={dia(n.rejected)} />
        </View>
        {n.pending > 0 && <Button title="Demo: iade süresi doldu, kesinleştir" small variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => settlePending(ag.id)} />}
      </Section>

      <Section title="Komisyon hesaplama geçmişi" icon="receipt">
        {ag.ledger.map((l) => {
          const reversed = ag.ledger.some((x) => x.reverses === l.id);
          return (
            <View key={l.id} style={{ gap: 2, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={s.row}>
                <Text style={[s.body, { flex: 1 }]}>
                  {personName(l.hostId)} · {l.period}
                </Text>
                <Text style={[s.body, { fontWeight: '800', color: l.amount < 0 ? '#FCA5A5' : '#fff' }]}>{dia(l.amount)}</Text>
              </View>
              <Text style={s.mono}>
                {l.ref} · taban {fmt(l.base)} × %{Math.round(l.rate * 100)} · kural v{l.ruleVersion} · {l.status}
                {l.note ? ` · ${l.note}` : ''}
              </Text>
              {payoutAdmin && l.status !== 'Ters kayıt' && !reversed && (
                <Button title="Ters kayıtla düzelt" small variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => r(reverseLedgerRow(ctx, ag.id, l.id, reason || 'Hatalı hak ediş'), 'Ters kayıt oluşturuldu')} />
              )}
            </View>
          );
        })}
        <Text style={s.dim}>Kayıtlar silinmez; düzeltmeler ters kayıtla yapılır ve denetim kaydına yazılır.</Text>
      </Section>

      <Section title="Ödeme hesabı ve yetki" icon="card">
        {ag.payoutAccount ? (
          <>
            <KV k="Hesap" v={`${ag.payoutAccount.holder} · ${ag.payoutAccount.iban}`} />
            <KV k="Doğrulama" v={ag.payoutAccount.status === 'Doğrulandı' ? `Doğrulandı · ${personName(ag.payoutAccount.verifiedBy ?? '')}` : 'Doğrulama bekliyor'} />
          </>
        ) : (
          <Text style={s.dim}>Ödeme hesabı eklenmedi.</Text>
        )}
        {isOwner && (
          <>
            <Text style={s.label}>{ag.payoutAccount ? 'Hesabı değiştir (yeniden doğrulama gerekir)' : 'Ödeme hesabı ekle'}</Text>
            <TextInput value={holder} onChangeText={setHolder} placeholder="Hesap sahibi" placeholderTextColor={colors.textDim} style={s.input} accessibilityLabel="Hesap sahibi" />
            <TextInput value={iban} onChangeText={setIban} placeholder="TR00 0000 0000 0000 0000 0000 00" placeholderTextColor={colors.textDim} autoCapitalize="characters" style={s.input} accessibilityLabel="IBAN" />
            <Button title="Hesabı kaydet" small variant="tonal" style={{ alignSelf: 'flex-start' }} onPress={() => r(setPayoutAccount(ctx.actor, ag.id, holder, iban), 'Hesap kaydedildi, doğrulama bekliyor')} />
          </>
        )}
        {payoutAdmin && ag.payoutAccount?.status === 'Doğrulanmadı' && <Button title="Finansal doğrulamayı tamamla" small variant="tonal" style={{ alignSelf: 'flex-start' }} onPress={() => r(verifyPayoutAccount(ctx, ag.id), 'Hesap doğrulandı')} />}
        {payoutAdmin && (
          <>
            <View style={s.divider} />
            <Text style={s.label}>Para çekme yetkisi: {ag.payoutEnabled ? 'Açık' : 'Kapalı'}</Text>
            <TextInput value={reason} onChangeText={setReason} placeholder="Gerekçe (kritik işlem)" placeholderTextColor={colors.textDim} style={s.input} accessibilityLabel="Gerekçe" />
            <Button
              title={ag.payoutEnabled ? 'Ödeme yetkisini kapat' : 'Ödeme yetkisini aç'}
              small
              variant={ag.payoutEnabled ? 'danger' : 'money'}
              style={{ alignSelf: 'flex-start' }}
              onPress={() => r(setPayoutEnabled(ctx, ag.id, !ag.payoutEnabled, reason), ag.payoutEnabled ? 'Ödeme yetkisi kapatıldı' : 'Ödeme yetkisi açıldı') && setReason('')}
            />
          </>
        )}
      </Section>

      <Section title="Para çekme talepleri" icon="cash">
        {isOwner && (
          <>
            {ag.payoutEnabled ? (
              <>
                <Text style={s.dim}>
                  Çekilebilir: {dia(n.withdrawable)} · en az {dia(RULES.minWithdrawDiamonds)}
                </Text>
                <View style={s.row}>
                  <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" style={[s.input, { flex: 1 }]} accessibilityLabel="Tutar" />
                  <Button title="Talep et" variant="money" small onPress={() => r(requestAgencyPayout(ctx.actor, ag.id, Number(amount)), 'Talep alındı, tutar bloke edildi')} />
                </View>
              </>
            ) : (
              <Note tone="warn" text="Ödeme yetkin henüz açılmadı. Sözleşme, Coins Bank ve finansal doğrulama tamamlanınca platform açar." />
            )}
          </>
        )}
        {!ag.payouts.length && <Text style={s.dim}>Talep yok.</Text>}
        {ag.payouts.map((p) => (
          <View key={p.id} style={{ gap: 4, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={s.row}>
              <Text style={[s.body, { flex: 1, fontWeight: '800' }]}>{dia(p.amount)}</Text>
              <StatusBadge status={p.status} tone={p.status === 'Ödendi' ? 'good' : p.status === 'Reddedildi' ? 'bad' : 'warn'} />
            </View>
            <Text style={s.mono}>
              {p.ref} · {p.at}
              {p.decidedBy ? ` · ${personName(p.decidedBy)}` : ''}
              {p.reason ? ` · ${p.reason}` : ''}
            </Text>
            {payoutAdmin && p.status === 'İncelemede' && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Öde" small variant="money" onPress={() => r(decideAgencyPayout(ctx, ag.id, p.id, true, ''), 'Ödeme onaylandı')} />
                <Button title="Reddet" small variant="danger" onPress={() => r(decideAgencyPayout(ctx, ag.id, p.id, false, reason || 'Belge eksik'), 'Talep reddedildi, blokaj çözüldü')} />
              </View>
            )}
          </View>
        ))}
      </Section>
    </>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }): ReactNode {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
      {sub && <Text style={s.dim}>{sub}</Text>}
    </View>
  );
}
