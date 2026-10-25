import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chips, Note, StatusBadge, ViewerBar, s } from '@/components/agency-apps';
import { Header } from '@/components/ui';
import {
  APP_STATUSES,
  CAPACITY_BANDS,
  agenciesOfBd,
  bankNumbers,
  canManageAgency,
  canSeeApp,
  hostCapacity,
  personName,
  regionName,
  stamp,
  useAgencyApps,
  useViewer,
  type AppStatus,
} from '@/lib/agency-apps';
import { resolve } from '@/data/rbac';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Tab = 'apps' | 'agencies' | 'perf' | 'audit';
const DAY = 86_400_000;
const fmt = (n: number) => n.toLocaleString('tr-TR');

export default function AgencyAdminPanel() {
  const { rbac } = useApp();
  const st = useAgencyApps();
  const viewer = useViewer();
  const ctx = { rbac, actor: viewer };
  const [tab, setTab] = useState<Tab>('apps');
  const [status, setStatus] = useState<AppStatus | 'all'>('all');
  const [country, setCountry] = useState('all');
  const [period, setPeriod] = useState<'all' | '7' | '30'>('all');
  const [bd, setBd] = useState('all');
  const [cap, setCap] = useState<(typeof CAPACITY_BANDS)[number]['key']>('all');
  const [openedAt] = useState(() => Date.now());

  const platform = { type: 'platform' as const };
  const seeAll = resolve(rbac, viewer, 'agency_apps.view_all', platform).allowed;
  const seesPerf = resolve(rbac, viewer, 'agencies.performance', platform).allowed || rbac.userRoles.some((u) => u.userId === viewer && rbac.roles.find((r) => r.id === u.roleId)?.permissions.includes('agencies.performance'));
  const visible = st.apps.filter((a) => canSeeApp(ctx, a));
  const band = CAPACITY_BANDS.find((b) => b.key === cap)!;
  const list = visible
    .filter((a) => status === 'all' || a.status === status)
    .filter((a) => country === 'all' || a.form.country === country)
    .filter((a) => period === 'all' || (a.submittedTs ?? a.createdTs) >= openedAt - Number(period) * DAY)
    .filter((a) => bd === 'all' || (bd === 'none' ? !a.assignedBd : a.assignedBd === bd))
    .filter((a) => hostCapacity(a) >= band.min && hostCapacity(a) <= band.max)
    .sort((a, b) => (b.submittedTs ?? b.createdTs) - (a.submittedTs ?? a.createdTs));
  const count = (xs: AppStatus[]) => visible.filter((a) => xs.includes(a.status)).length;
  const countries = [...new Set(visible.map((a) => a.form.country))];
  const bds = [...new Set(visible.map((a) => a.assignedBd).filter((x): x is string => !!x))];
  const statuses = APP_STATUSES.filter((x) => visible.some((a) => a.status === x));
  const agencies = st.agencies.filter((ag) => canManageAgency(ctx, ag) || ag.bdId === viewer);
  const mine = agenciesOfBd(viewer);

  const tabs: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'apps', label: 'Başvurular', icon: 'documents' },
    { key: 'agencies', label: 'Ajanslar', icon: 'business' },
    ...(seesPerf ? [{ key: 'perf' as const, label: 'Performans', icon: 'stats-chart' as const }] : []),
    ...(seeAll ? [{ key: 'audit' as const, label: 'Denetim', icon: 'shield-checkmark' as const }] : []),
  ];

  return (
    <SafeAreaView style={s.safe}>
      <Header title="Ajans Başvuru Yönetimi" />
      <ViewerBar />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' }} style={{ flexGrow: 0, flexShrink: 0 }}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.chip, { flexDirection: 'row', gap: 6, alignItems: 'center' }, tab === t.key && s.chipOn]} accessibilityState={{ selected: tab === t.key }}>
            <Ionicons name={t.icon} size={15} color={tab === t.key ? '#fff' : colors.textDim} />
            <Text style={[s.chipText, tab === t.key && { color: '#fff' }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll}>
        {tab === 'apps' && (
          <>
            {!seeAll && <Note text={visible.length ? 'Yalnız sana atanmış başvuruları görüyorsun.' : 'Sana atanmış başvuru yok veya başvuru görüntüleme yetkin bulunmuyor.'} />}
            <View style={s.grid}>
              <Stat label="Yeni" value={count(['Başvuru Alındı', 'Ön İncelemede'])} />
              <Stat label="BD'de" value={count(['BD Değerlendirmesinde', 'Ek Bilgi Bekleniyor'])} />
              <Stat label="Onay bekleyen" value={count(['Admin Onayı Bekleniyor'])} />
              <Stat label="Sonuçlanan" value={count(['Onaylandı', 'Reddedildi', 'Başvuru İptal Edildi'])} />
            </View>
            <View style={s.card}>
              <Text style={s.label}>Durum</Text>
              <Chips wrap={false} options={[{ key: 'all' as const, label: 'Tümü' }, ...statuses.map((x) => ({ key: x, label: x }))]} value={status} onChange={setStatus} />
              <Text style={s.label}>Ülke</Text>
              <Chips wrap={false} options={[{ key: 'all', label: 'Tümü' }, ...countries.map((c) => ({ key: c, label: c }))]} value={country} onChange={setCountry} />
              <Text style={s.label}>Tarih</Text>
              <Chips options={[{ key: 'all' as const, label: 'Tümü' }, { key: '7' as const, label: 'Son 7 gün' }, { key: '30' as const, label: 'Son 30 gün' }]} value={period} onChange={setPeriod} />
              {seeAll && (
                <>
                  <Text style={s.label}>BD</Text>
                  <Chips wrap={false} options={[{ key: 'all', label: 'Tümü' }, { key: 'none', label: 'Atanmamış' }, ...bds.map((b) => ({ key: b, label: personName(b) }))]} value={bd} onChange={setBd} />
                </>
              )}
              <Text style={s.label}>Yayıncı kapasitesi</Text>
              <Chips wrap={false} options={CAPACITY_BANDS.map((b) => ({ key: b.key, label: b.label }))} value={cap} onChange={setCap} />
            </View>
            <Text style={s.dim}>{list.length} başvuru</Text>
            {list.map((a) => (
              <Pressable key={a.id} onPress={() => router.push(`/ajans/yonetim/${a.id}`)} accessibilityRole="button" accessibilityLabel={`${a.number} ${a.form.agencyName}`}>
                <View style={s.card}>
                  <View style={s.row}>
                    <Text style={[s.mono, { flex: 1 }]}>{a.number}</Text>
                    <StatusBadge status={a.status} />
                  </View>
                  <Text style={s.title}>{a.form.agencyName}</Text>
                  <Text style={s.dim}>
                    {a.form.fullName} · {a.form.city}, {a.form.country} · {regionName(a.form.country, a.form.city)}
                  </Text>
                  <View style={[s.row, { flexWrap: 'wrap', gap: 14 }]}>
                    <Meta icon="people" text={`${hostCapacity(a)} yayıncı`} />
                    <Meta icon="person-circle" text={a.assignedBd ? `BD: ${personName(a.assignedBd)}` : 'BD atanmadı'} />
                    <Meta icon="calendar" text={a.submittedTs ? stamp(a.submittedTs).slice(0, 10) : '—'} />
                  </View>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {tab === 'agencies' && (
          <>
            {!agencies.length && <Note text="Görüntüleyebileceğin ajans hesabı yok." />}
            {agencies.map((ag) => (
              <Pressable key={ag.id} onPress={() => router.push(`/ajans/hesap/${ag.id}`)}>
                <View style={s.card}>
                  <View style={s.row}>
                    <Text style={[s.mono, { flex: 1 }]}>{ag.id}</Text>
                    <StatusBadge status={ag.status} tone={ag.status === 'Aktif' ? 'good' : ag.status === 'Askıda' ? 'bad' : 'warn'} />
                  </View>
                  <Text style={s.title}>{ag.name}</Text>
                  <Text style={s.dim}>
                    Sahip {personName(ag.ownerId)} · BD {ag.bdId ? personName(ag.bdId) : '—'} · {ag.hosts.length} yayıncı
                  </Text>
                  <View style={[s.row, { flexWrap: 'wrap', gap: 14 }]}>
                    <Meta icon="wallet" text={ag.coinsBank.enabled ? 'Coins Bank açık' : 'Coins Bank kapalı'} />
                    <Meta icon={ag.payoutEnabled ? 'lock-open' : 'lock-closed'} text={ag.payoutEnabled ? 'Ödeme yetkisi açık' : 'Ödeme yetkisi kapalı'} />
                  </View>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {tab === 'perf' && (
          <>
            <Note text="Getirdiğin (sana atanmış) ajansların performansı. Finansal ayrıntılar ve ödeme işlemleri yetkiye bağlıdır." />
            {!mine.length && <Text style={s.dim}>Sana atanmış ajans yok.</Text>}
            {mine.map((ag) => {
              const n = bankNumbers(ag);
              return (
                <View key={ag.id} style={s.card}>
                  <Text style={s.title}>{ag.name}</Text>
                  <View style={s.grid}>
                    <Stat label="Bağlı yayıncı" value={ag.hosts.length} />
                    <Stat label="Yayıncı tabanı" value={`${fmt(ag.ledger.filter((r) => r.status !== 'Ters kayıt').reduce((x, r) => x + r.base, 0))} 💎`} />
                    <Stat label="Ajans hak edişi" value={`${fmt(n.total)} 💎`} />
                    <Stat label="Durum" value={ag.status} />
                  </View>
                </View>
              );
            })}
          </>
        )}

        {tab === 'audit' && (
          <View style={s.card}>
            <Text style={s.dim}>Tüm başvuru, atama, karar, sözleşme, komisyon ve ödeme işlemleri. Reddedilen denemeler de kaydedilir. Kayıtlar silinmez.</Text>
            {!st.audit.length && <Text style={s.dim}>Henüz bu oturumda işlem yok.</Text>}
            {st.audit.map((r) => (
              <View key={r.id} style={{ gap: 2, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={s.row}>
                  <Text style={[s.body, { flex: 1, fontWeight: '700' }]}>{r.action}</Text>
                  <StatusBadge status={r.result} tone={r.result === 'Uygulandı' ? 'good' : 'bad'} />
                </View>
                <Text style={s.dim}>
                  {r.target}
                  {r.detail ? ` · ${r.detail}` : ''}
                </Text>
                <Text style={s.mono}>
                  {r.at} · {personName(r.actor)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={[s.row, { gap: 4 }]}>
      <Ionicons name={icon} size={14} color={colors.textDim} />
      <Text style={s.dim}>{text}</Text>
    </View>
  );
}
