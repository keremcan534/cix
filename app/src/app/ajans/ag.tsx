import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Avatar, Card, Header } from '@/components/ui';
import { COMMISSIONS, SAMPLE_RATES, networkChildren, type CommissionRow, type NetNode } from '@/data/agency';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const STATUS_COLOR: Record<string, string> = {
  Oluşturuldu: colors.textDim,
  Doğrulamada: '#13D9DF',
  Beklemede: colors.gold,
  Onaylandı: '#7DD3FC',
  Ödenebilir: colors.green,
  Ödendi: colors.green,
  Reddedildi: colors.red,
  'Geri alındı': colors.red,
};

export default function NetworkScreen() {
  const [tab, setTab] = useState<'tree' | 'earnings'>('tree');
  const { agencyId } = useApp();
  // Network and commission data are only for active agency members (also enforced server-side).
  if (!agencyId)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Üye ağım" />
        <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 40 }}>🔒</Text>
          <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Üye ağı ve komisyonlar yalnızca aktif ajans üyeliği olan kullanıcılara açıktır.</Text>
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Üye ağım" />
      <View style={styles.segment}>
        {(['tree', 'earnings'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.segBtn, tab === t && styles.segActive]}>
            <Text style={styles.segText}>{t === 'tree' ? 'Ağ ağacı' : 'Kazançlarım'}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'tree' ? <Tree /> : <Earnings />}
    </SafeAreaView>
  );
}

function Tree() {
  const { referralCode } = useApp();
  const [filter, setFilter] = useState<'all' | 'direct' | 'active'>('all');
  const root = networkChildren('root', 1);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      <View style={styles.grid}>
        <Kpi label="Toplam ağ" value="38" />
        <Kpi label="Doğrudan davet" value={String(root.length)} />
        <Kpi label="Aktif üye" value="29" />
        <Kpi label="Bekleyen aktivasyon" value="4" />
      </View>
      <Card style={{ gap: 8 }}>
        <Text style={styles.title}>Davet kodun: {referralCode}</Text>
        <Text style={styles.dim}>Davet ettiğin kişiler senin alt ağına bağlanır; onların davet ettikleri bir alt seviyeye. Ağ derinliği sınırsızdır, alt seviyeler dokundukça yüklenir.</Text>
        <Pressable onPress={() => Share.share({ message: `Similar Club'a katıl! Davet kodum: ${referralCode}` }).catch(() => {})} style={styles.shareBtn}>
          <Ionicons name="share-social" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>Davet linkini paylaş</Text>
        </Pressable>
      </Card>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['all', 'Tümü'],
            ['direct', 'Doğrudan'],
            ['active', 'Aktif'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && { backgroundColor: colors.primary }]}>
            <Text style={styles.chipText}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <Card style={{ padding: 8 }}>
        {root
          .filter((n) => filter !== 'active' || n.active)
          .map((n) => (
            <Node key={n.id} node={n} expandable={filter !== 'direct'} activeOnly={filter === 'active'} />
          ))}
      </Card>
      <Text style={styles.dim}>Gizlilik: ağda yalnızca ad, katılım tarihi, seviye ve durum görünür; ödeme ve iletişim bilgileri gösterilmez.</Text>
    </ScrollView>
  );
}

function Node({ node, expandable, activeOnly }: { node: NetNode; expandable: boolean; activeOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const u = userById(node.userId);
  const kids = open ? networkChildren(node.id, node.level + 1).filter((k) => !activeOnly || k.active) : [];
  return (
    <View>
      <Pressable style={[styles.node, { paddingLeft: 8 + Math.min(node.level - 1, 6) * 14 }]} onPress={() => expandable && node.childCount > 0 && setOpen((v) => !v)}>
        {expandable && node.childCount > 0 ? <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textDim} /> : <View style={{ width: 14 }} />}
        <Avatar uri={u.avatar} size={28} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>
            {u.name} <Text style={styles.dim}>· Seviye {node.level}</Text>
          </Text>
          <Text style={styles.dim}>
            {node.active ? '🟢 Aktif' : '⏳ Aktivasyon bekliyor'} · {node.joined}
            {node.childCount ? ` · ${node.childCount} alt üye` : ''}
          </Text>
        </View>
      </Pressable>
      {kids.map((k) => (
        <Node key={k.id} node={k} expandable={expandable} activeOnly={activeOnly} />
      ))}
    </View>
  );
}

function Earnings() {
  const { createTicket } = useApp();
  const [detail, setDetail] = useState<CommissionRow | null>(null);
  const sum = (src: CommissionRow['source']) => COMMISSIONS.filter((c) => c.source === src).reduce((s, c) => s + c.amount, 0);
  const byStatus = ['Beklemede', 'Doğrulamada', 'Onaylandı', 'Ödenebilir', 'Ödendi', 'Reddedildi', 'Geri alındı'].map((st) => ({
    st,
    v: COMMISSIONS.filter((c) => c.status === st).reduce((s, c) => s + c.amount, 0),
  }));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      <View style={styles.grid}>
        <Kpi label="Üye kazanımı komisyonu" value={`💎 ${sum('Üye kazanımı')}`} />
        <Kpi label="Platform faaliyeti komisyonu" value={`💎 ${sum('Platform faaliyeti')}`} />
      </View>
      <Card style={{ gap: 6 }}>
        <Text style={styles.title}>Duruma göre</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {byStatus.map((b) => (
            <View key={b.st} style={styles.statusChip}>
              <Text style={{ color: STATUS_COLOR[b.st], fontSize: 12, fontWeight: '700' }}>{b.st}</Text>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{b.v}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Text style={styles.title}>Komisyon defteri</Text>
      {COMMISSIONS.map((c) => (
        <Pressable key={c.id} onPress={() => setDetail(c)}>
          <Card style={[styles.rowCard, { padding: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>
                {c.source} · Seviye {c.level}
              </Text>
              <Text style={styles.dim}>
                {c.ref} · kural {c.rule} · {c.period}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: c.amount < 0 ? colors.red : '#7DD3FC', fontWeight: '800' }}>
                {c.amount > 0 ? '+' : ''}
                {c.amount} 💎
              </Text>
              <Text style={{ color: STATUS_COLOR[c.status], fontSize: 12, fontWeight: '700' }}>{c.status}</Text>
            </View>
          </Card>
        </Pressable>
      ))}
      <Card style={{ gap: 6 }}>
        <Text style={styles.title}>Örnek dağıtım (simülasyon)</Text>
        {SAMPLE_RATES.map((r) => (
          <View key={r.level} style={styles.rowCard}>
            <Text style={{ color: '#fff', flex: 1 }}>{r.level}</Text>
            <Text style={{ color: colors.gold, fontWeight: '700' }}>%{Math.round(r.rate * 100)}</Text>
          </View>
        ))}
        <Text style={styles.dim}>
          Oranlar yalnızca test/simülasyon örneğidir; ticari karar değildir. Komisyonlar sadece sunucuda doğrulanan olaylardan hesaplanır; düzeltmeler ters kayıtla yapılır, geçmiş satırlar silinmez. Canlıya almadan önce
          hukuk/uyum incelemesi gerekir.
        </Text>
      </Card>
      <ActionSheet
        visible={!!detail}
        title={detail ? `${detail.source} · ${detail.amount} 💎 · ${detail.status}` : ''}
        onClose={() => setDetail(null)}
        options={
          detail
            ? [
                { label: `Kaynak: ${detail.ref} · Kural ${detail.rule} · Seviye ${detail.level}`, onPress: () => {} },
                {
                  label: '⚖️ Bu satıra itiraz et',
                  onPress: () => {
                    const no = createTicket('İtiraz', `Komisyon itirazı ${detail.ref} (${detail.amount})`);
                    showAlert('İtiraz açıldı', `İtiraz numaran #${no}. İnceleme durumu ve karar geçmişi Destek ekranında.`);
                  },
                },
              ]
            : []
        }
      />
    </ScrollView>
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
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4, marginBottom: 4 },
  segBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700' },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 4 },
  chip: { backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  shareBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  node: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingRight: 8 },
  statusChip: { backgroundColor: colors.cardAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
