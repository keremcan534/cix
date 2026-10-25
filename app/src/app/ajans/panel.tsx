import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Card, GradientButton, Header } from '@/components/ui';
import { AGENCY_EVENTS, AGENCY_MEMBERS, PENDING_APPLICATIONS, ROLE_LABEL, can, type AgencyMember, type AgencyRole, type Permission } from '@/data/agency';
import { RULES, pct, settlement, usd, agencyStatus } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

type Tab = 'overview' | 'performance' | 'members' | 'transfers' | 'invites' | 'earnings' | 'tasks' | 'events' | 'team' | 'support' | 'settings';
const TABS: { key: Tab; label: string; perm?: Permission }[] = [
  { key: 'overview', label: 'Genel bakış' },
  { key: 'performance', label: 'Performans', perm: 'agency.members.read' },
  { key: 'members', label: 'Üyeler', perm: 'agency.members.read' },
  { key: 'transfers', label: 'Transferler', perm: 'agency.members.manage' },
  { key: 'invites', label: 'Davetler', perm: 'agency.members.manage' },
  { key: 'earnings', label: 'Kazançlar', perm: 'agency.earnings.read' },
  { key: 'tasks', label: 'Görevler', perm: 'room.events.manage' },
  { key: 'events', label: 'Etkinlikler', perm: 'room.events.manage' },
  { key: 'team', label: 'Ekip', perm: 'agency.settings.manage' },
  { key: 'support', label: 'Destek' },
  { key: 'settings', label: 'Ayarlar', perm: 'agency.settings.manage' },
];

export default function OwnerPanel() {
  const { ownedAgency, agencyRole, setAgencyRole } = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const role: AgencyRole = agencyRole ?? 'member';
  const current = TABS.find((t) => t.key === tab)!;
  const allowed = !current.perm || can(role, current.perm);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={ownedAgency?.name ?? 'Ajans paneli'} />
      {/* Demo role switch to show the permission matrix in action. */}
      <View style={styles.roleBar}>
        <Text style={styles.dim}>Görünüm:</Text>
        {(['owner', 'assistant'] as const).map((r) => (
          <Pressable key={r} onPress={() => setAgencyRole(r)} style={[styles.roleChip, role === r && { backgroundColor: colors.primary }]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{ROLE_LABEL[r]}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
        {TABS.map((t) => {
          const ok = !t.perm || can(role, t.perm);
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t.key && { color: '#fff' }]}>
                {ok ? '' : '🔒 '}
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {!allowed ? (
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 36 }}>🔒</Text>
            <Text style={styles.title}>Bu bölüme erişim yetkin yok</Text>
            <Text style={[styles.dim, { textAlign: 'center' }]}>
              {ROLE_LABEL[role]} rolünde &quot;{current.perm}&quot; izni bulunmuyor. Yetki sunucu tarafında da kontrol edilir; buton gizlemek tek başına yeterli değildir.
            </Text>
          </Card>
        ) : tab === 'overview' ? (
          <Overview />
        ) : tab === 'performance' ? (
          <Performance />
        ) : tab === 'members' ? (
          <Members canManage={can(role, 'agency.members.manage')} />
        ) : tab === 'transfers' ? (
          <Transfers />
        ) : tab === 'invites' ? (
          <Invites />
        ) : tab === 'earnings' ? (
          <Earnings />
        ) : tab === 'tasks' || tab === 'events' ? (
          <Events kind={tab} />
        ) : tab === 'team' ? (
          <Team />
        ) : tab === 'support' ? (
          <Support />
        ) : (
          <Settings />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Bar({ label, value, target }: { label: string; value: number; target: number }) {
  const done = value >= target;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={[styles.dim, { flex: 1, color: '#fff' }]}>{label}</Text>
        <Text style={{ color: done ? colors.green : colors.gold, fontWeight: '800' }}>
          {value}/{target} {done ? '✓' : ''}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${Math.min(100, (value / Math.max(1, target)) * 100)}%`, backgroundColor: done ? colors.green : colors.gold }} />
      </View>
    </View>
  );
}

function Overview() {
  const active = AGENCY_MEMBERS.filter((m) => m.status === 'active').length;
  const earners = AGENCY_MEMBERS.filter((m) => m.diamonds / RULES.diamondsPerUsd >= RULES.agencyActivationEarnUsd).length;
  const newThisMonth = AGENCY_MEMBERS.filter((m) => m.status === 'new').length;
  const st = agencyStatus({ hosts: AGENCY_MEMBERS.length, earners, newThisMonth });
  return (
    <>
      <Card style={{ gap: 10, borderWidth: 1, borderColor: st.status === 'Aktif ajans' ? colors.green : colors.gold }}>
        <Text style={styles.title}>
          {st.status === 'Aktif ajans' ? '✅' : '⏳'} Statü: {st.status}
        </Text>
        <Bar label={`Getirilen yayıncı`} value={AGENCY_MEMBERS.length} target={RULES.agencyActivationHosts} />
        <Bar label={`${RULES.agencyActivationEarnUsd} USD kazanan yayıncı`} value={earners} target={RULES.agencyActivationEarners} />
        <Bar label="Bu ay eklenen yayıncı" value={newThisMonth} target={RULES.agencyMonthlyNewHosts} />
        <Text style={styles.dim}>
          Aktif olmak için {RULES.agencyActivationHosts} yayıncı getirmeli ve en az {RULES.agencyActivationEarners} tanesi {RULES.agencyActivationEarnUsd} USD kazanmalı; o zamana kadar aday ajans statüsünde kalırsın. Her ay en az {RULES.agencyMonthlyNewHosts} yeni yayıncı eklenmezse komisyon {pct(RULES.agencyCommissionPenalty)} düşer; yayıncı sayısı {RULES.agencyDemoteBelowHosts}&apos;in altına inerse tekrar aday olursun.
        </Text>
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          Geçerli komisyon: {pct(st.rate)}
          {st.missedMonthly && st.status === 'Aktif ajans' ? ` (aylık hedef tutmadı, −${pct(RULES.agencyCommissionPenalty)})` : ''}
        </Text>
        <Text style={styles.dim}>
          {RULES.agencyHostInactiveDays} gün çevrimiçi olmayan ve çekim yapmayan yayıncı ajanstan düşer ve yönetim hesabına aktarılır. Süreler yönetim panelinden değiştirilir.
        </Text>
      </Card>
      <View style={styles.grid}>
        <Kpi label="Toplam yayıncı" value={String(AGENCY_MEMBERS.length)} />
        <Kpi label="Aktif yayıncı" value={String(active)} />
        <Kpi label="Bekleyen başvuru" value={String(PENDING_APPLICATIONS.length)} />
        <Kpi label="Bu hafta yayın" value={`${AGENCY_MEMBERS.reduce((s, m) => s + m.hours.w, 0)} sa`} />
      </View>
      <Card style={{ gap: 6 }}>
        <Text style={styles.title}>Bugün</Text>
        <Text style={styles.dim}>• 3 yayıncı şu an yayında</Text>
        <Text style={styles.dim}>• 2 yeni başvuru incelemende</Text>
        <Text style={styles.dim}>• Hafta sonu PK turnuvası Cumartesi 21:00</Text>
      </Card>
    </>
  );
}

function Performance() {
  const [period, setPeriod] = useState<'d' | 'w' | 'm'>('w');
  const rows = [...AGENCY_MEMBERS].sort((a, b) => b.hours[period] - a.hours[period]);
  const total = rows.reduce((s, m) => s + m.hours[period], 0);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['d', 'w', 'm'] as const).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.tab, period === p && styles.tabActive]}>
            <Text style={[styles.tabText, period === p && { color: '#fff' }]}>{p === 'd' ? 'Günlük' : p === 'w' ? 'Haftalık' : 'Aylık'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.dim}>Ajans toplamı: {total} saat · Hesaplama zamanı: bugün 04:00</Text>
      {rows.map((m) => (
        <Card key={m.user.id} style={{ gap: 6, padding: 12 }}>
          <View style={styles.row}>
            <Avatar uri={m.user.avatar} size={34} />
            <Text style={{ color: '#fff', flex: 1, fontWeight: '600' }}>{m.user.name}</Text>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{m.hours[period]} sa</Text>
          </View>
          <View style={styles.track}>
            <View style={{ height: 6, backgroundColor: colors.primary, width: `${Math.min(100, (m.diamonds / m.goal) * 100)}%` }} />
          </View>
          <Text style={styles.dim}>
            Hedef: 💎 {m.diamonds.toLocaleString('tr-TR')} / {m.goal.toLocaleString('tr-TR')} · {m.days} aktif gün
          </Text>
        </Card>
      ))}
    </>
  );
}

function Members({ canManage }: { canManage: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | AgencyMember['status']>('all');
  const [pending, setPending] = useState(PENDING_APPLICATIONS);
  const list = AGENCY_MEMBERS.filter((m) => (filter === 'all' || m.status === filter) && m.user.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      {pending.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Bekleyen başvurular</Text>
          {pending.map((u) => (
            <View key={u.id} style={styles.row}>
              <Avatar uri={u.avatar} size={34} />
              <Text style={{ color: '#fff', flex: 1 }}>{u.name}</Text>
              {canManage ? (
                <>
                  <Pressable style={[styles.small, { backgroundColor: semantic.successFill }]} onPress={() => setPending((p) => p.filter((x) => x.id !== u.id))}>
                    <Text style={styles.smallText}>Kabul</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.small, { backgroundColor: colors.cardAlt }]}
                    onPress={() => {
                      setPending((p) => p.filter((x) => x.id !== u.id));
                      showAlert('Reddedildi', `${u.name} başvurusunun reddedildiğini ve gerekçesini görecek.`);
                    }}
                  >
                    <Text style={styles.smallText}>Reddet</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.dim}>Yetki: sadece görüntüleme</Text>
              )}
            </View>
          ))}
        </Card>
      )}
      <TextInput value={q} onChangeText={setQ} placeholder="Yayıncı ara" placeholderTextColor={colors.textDim} style={styles.input} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['all', 'Tümü'],
            ['active', 'Aktif'],
            ['passive', 'Pasif'],
            ['new', 'Yeni'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[styles.tab, filter === k && styles.tabActive]}>
            <Text style={[styles.tabText, filter === k && { color: '#fff' }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {list.map((m) => (
        <Pressable key={m.user.id} onPress={() => router.push(`/kullanici/${m.user.id}`)}>
          <Card style={[styles.row, { padding: 12 }]}>
            <Avatar uri={m.user.avatar} size={40} online={m.user.online} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{m.user.name}</Text>
              <Text style={styles.dim}>
                {m.status === 'active' ? '🟢 Aktif' : m.status === 'passive' ? '⚪ Pasif' : '🆕 Yeni'} · Katılım {m.joined} · Son yayın {m.hours.d ? 'bugün' : '3 gün önce'}
              </Text>
            </View>
            {canManage && (
              <Pressable onPress={() => showAlert('Bildirim gönderildi', `${m.user.name} kişisine ajans duyurusu iletildi.`)} hitSlop={8}>
                <Ionicons name="notifications-outline" size={20} color={colors.textDim} />
              </Pressable>
            )}
          </Card>
        </Pressable>
      ))}
    </>
  );
}

type IncomingTransfer = { id: string; member: AgencyMember; to: string; reason: string; status: 'Bekliyor' | 'Ücretli onaylandı' | 'Ücretsiz onaylandı' | 'Reddedildi' };

function Transfers() {
  const [items, setItems] = useState<IncomingTransfer[]>([
    { id: 't1', member: AGENCY_MEMBERS[6], to: 'MOON22 · Moonlight Media', reason: 'Yayın saatlerim değişti', status: 'Bekliyor' },
    { id: 't2', member: AGENCY_MEMBERS[8], to: 'Ajanstan ayrılma', reason: 'Bir süre ara vereceğim', status: 'Bekliyor' },
  ]);
  const decide = (id: string, status: IncomingTransfer['status']) => setItems((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));
  return (
    <>
      <Text style={styles.dim}>Onaylarken ücretli veya ücretsiz transfer seçersin. Ücret, yayımlanmış formülle hesaplanır (son 30 gün elmas × %10) ve hedef ajans tarafından ödenir. Tüm kararlar denetim kaydına yazılır; yayıncı itiraz edebilir.</Text>
      {items.map((t) => {
        const fee = Math.round(t.member.diamonds * 0.1);
        return (
          <Card key={t.id} style={{ gap: 8 }}>
            <View style={styles.row}>
              <Avatar uri={t.member.user.avatar} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {t.member.user.name} → {t.to}
                </Text>
                <Text style={styles.dim}>Gerekçe: {t.reason}</Text>
              </View>
            </View>
            <Text style={styles.dim}>
              Hesaplanan ücret: 💎 {fee.toLocaleString('tr-TR')} ({usd(fee)}) · son 30 gün 💎 {t.member.diamonds.toLocaleString('tr-TR')}
            </Text>
            {t.status === 'Bekliyor' ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable style={[styles.small, { backgroundColor: semantic.successFill }]} onPress={() => decide(t.id, 'Ücretli onaylandı')}>
                  <Text style={styles.smallText}>Ücretli onayla</Text>
                </Pressable>
                <Pressable style={[styles.small, { backgroundColor: colors.primary }]} onPress={() => decide(t.id, 'Ücretsiz onaylandı')}>
                  <Text style={styles.smallText}>Ücretsiz onayla</Text>
                </Pressable>
                <Pressable style={[styles.small, { backgroundColor: colors.cardAlt }]} onPress={() => decide(t.id, 'Reddedildi')}>
                  <Text style={styles.smallText}>Reddet</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={{ color: t.status === 'Reddedildi' ? colors.red : colors.green, fontWeight: '800' }}>
                {t.status} · {t.status === 'Reddedildi' ? 'gerekçe yayıncıya bildirildi' : 'hedef ajansın kabulü bekleniyor'}
              </Text>
            )}
          </Card>
        );
      })}
    </>
  );
}

function Invites() {
  const { ownedAgency } = useApp();
  const code = ownedAgency?.code ?? '—';
  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.title}>Davet kodu</Text>
      <Text style={styles.code}>{code}</Text>
      <Text style={styles.dim}>Bağlantı: similarclub://ajans/katil?kod={code}</Text>
      <GradientButton title="Davet bağlantısını paylaş" icon="share-social" onPress={() => Share.share({ message: `Ajansıma katıl! Kod: ${code} · similarclub://ajans/katil?kod=${code}` }).catch(() => {})} />
      <Text style={styles.label}>Davet durumu</Text>
      <Text style={styles.dim}>• 12 bağlantı görüntülendi · 5 kayıt · 2 başvuru bekliyor · 3 üye oldu</Text>
    </Card>
  );
}

function Earnings() {
  const rows = AGENCY_MEMBERS.map((m) => ({ m, share: settlement(m.diamonds, true).commission }));
  const total = rows.reduce((s, r) => s + r.share, 0);
  return (
    <>
      <View style={styles.grid}>
        <Kpi label={`Ajans komisyonu ${pct(RULES.agencyCommission)} (dönem)`} value={`💎 ${total.toLocaleString('tr-TR')}`} />
        <Kpi label="Bekleyen" value={usd(Math.round(total * 0.4))} />
        <Kpi label="Onaylanan" value={usd(Math.round(total * 0.4))} />
        <Kpi label="Ödenen" value={usd(Math.round(total * 0.2))} />
      </View>
      <Text style={styles.dim}>
        Komisyon, yayıncıların uygun kazancının {pct(RULES.agencyCommission)}&apos;ı olarak ayrıca hesaplanır; yayıncı ödemesinden kesilmez. {usd(total)} · {RULES.diamondsPerUsd.toLocaleString('tr-TR')} elmas = 1 USD
      </Text>
      {rows.map(({ m, share }) => (
        <Card key={m.user.id} style={[styles.row, { padding: 12 }]}>
          <Avatar uri={m.user.avatar} size={32} />
          <Text style={{ color: '#fff', flex: 1 }}>{m.user.name}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#7DD3FC', fontWeight: '700' }}>💎 {m.diamonds.toLocaleString('tr-TR')}</Text>
            <Text style={styles.dim}>
              Komisyon 💎 {share.toLocaleString('tr-TR')} · {usd(share)}
            </Text>
          </View>
        </Card>
      ))}
      <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Kazanç' } })}>
        <Text style={{ color: colors.primaryText, fontWeight: '700' }}>Finans itirazı / mutabakat talebi →</Text>
      </Pressable>
    </>
  );
}

function Events({ kind }: { kind: 'tasks' | 'events' }) {
  const [items, setItems] = useState(AGENCY_EVENTS);
  const [title, setTitle] = useState('');
  return (
    <>
      <Card style={{ gap: 8 }}>
        <Text style={styles.title}>{kind === 'tasks' ? 'Yeni görev hedefi' : 'Yeni etkinlik'}</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder={kind === 'tasks' ? 'Örn. Bu hafta 20 saat yayın' : 'Örn. Cuma karaoke gecesi'} placeholderTextColor={colors.textDim} style={styles.input} />
        <GradientButton
          small
          title="Oluştur ve üyelere bildir"
          onPress={() => {
            if (title.trim().length < 4) return;
            setItems((l) => [{ id: String(Date.now()), title: title.trim(), when: 'Bu hafta', reward: 'Ödül koşulu: hedef tamamlanınca', joined: 0 }, ...l]);
            setTitle('');
          }}
        />
      </Card>
      {items.map((e) => (
        <Card key={e.id} style={{ gap: 4 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{e.title}</Text>
          <Text style={styles.dim}>
            {e.when} · {e.reward}
          </Text>
          <Text style={styles.dim}>{e.joined} katılımcı</Text>
        </Card>
      ))}
    </>
  );
}

function Team() {
  const [perms, setPerms] = useState({ members: true, rooms: true, events: true, earnings: false });
  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.title}>Baş asistan · Mert</Text>
      <Text style={styles.dim}>Baş asistan oda adı, kapak ve etkinlikleri yönetebilir; üye kazançlarını ve ajans finans raporlarını göremez.</Text>
      {(
        [
          ['members', 'Üye yönetimi (açık izinle)'],
          ['rooms', 'Oda adı / kapak'],
          ['events', 'Etkinlik tanımlama'],
        ] as const
      ).map(([k, l]) => (
        <View key={k} style={styles.row}>
          <Text style={{ color: '#fff', flex: 1 }}>{l}</Text>
          <Switch value={perms[k]} onValueChange={(v) => setPerms((p) => ({ ...p, [k]: v }))} />
        </View>
      ))}
      <View style={styles.row}>
        <Text style={{ color: colors.textDim, flex: 1 }}>Gelir raporları</Text>
        <Text style={styles.dim}>🔒 Verilemez</Text>
      </View>
      <Text style={styles.dim}>Sahiplik devri ve finansal düzeltmeler ayrı yetki ve ikinci onay gerektirir. Tüm değişiklikler denetim kaydına yazılır.</Text>
    </Card>
  );
}

function Support() {
  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.title}>Platform desteği</Text>
      <Text style={styles.dim}>Teknik, üyelik, kazanç, ödeme, etkinlik veya güvenlik konularında başvuru numaralı talep aç.</Text>
      <GradientButton title="Destek talebi oluştur" icon="help-buoy" onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Ajans' } })} />
    </Card>
  );
}

function Settings() {
  const { ownedAgency } = useApp();
  const [desc, setDesc] = useState('Yetenekli yayıncıları büyüten topluluk ajansı.');
  const [notify, setNotify] = useState(true);
  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.label}>Ajans adı</Text>
      <Text style={{ color: '#fff' }}>{ownedAgency?.name}</Text>
      <Text style={styles.label}>Açıklama</Text>
      <TextInput value={desc} onChangeText={setDesc} style={[styles.input, { minHeight: 60 }]} multiline />
      <View style={styles.row}>
        <Text style={{ color: '#fff', flex: 1 }}>Yeni başvuru bildirimleri</Text>
        <Switch value={notify} onValueChange={setNotify} />
      </View>
      <Text style={styles.dim}>Durum: {ownedAgency?.status} · Davet kodu devre dışı bırakılabilir ve yenilenebilir.</Text>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.dim}>{label}</Text>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  roleBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  roleChip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.card },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  label: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 4 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  small: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  smallText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  code: { color: colors.gold, fontSize: 32, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
});
