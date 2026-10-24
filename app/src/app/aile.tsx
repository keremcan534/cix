import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { GroupChat } from '@/components/GroupChat';
import { Avatar, Card, GradientButton, Header } from '@/components/ui';
import { FAMILIES } from '@/data/economy';
import { USERS, userById } from '@/data/mock';
import { FAMILY_PERKS, FAMILY_XP, RULES, familyBonus, familyCapacity, familyLevel, pct } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const CREATE_COST = 500;
const LAST_ACTIVE = ['5 dk önce', '40 dk önce', 'Dün 21:15', '2 gün önce', '6 gün önce'];
type Role = 'owner' | 'helper' | 'member';
type Family = { id: string; name: string; emoji: string; xp: number; weekly: number; members: number; leaderId: string; memberIds: string[] };
type Tab = 'home' | 'chat' | 'members' | 'bonus';
const ROLE_LABEL: Record<Role, string> = { owner: '👑 Sahip', helper: '🛡️ Yardımcı', member: 'Üye' };

// Mock weekly activity per member: active = ≥3 active days AND ≥1,000 valid contribution this week.
const activity = (id: string, i: number) => ({ days: id === 'me' ? 4 : (i * 3 + 2) % 8, contribution: id === 'me' ? 2_500 : Math.max(0, (9 - i) * 2_600 - (i % 3) * 900) });
const isActive = (a: { days: number; contribution: number }) => a.days >= 3 && a.contribution >= 1_000;

export default function FamilyScreen() {
  const { familyId, setFamily, familyRole, setFamilyRole, spendCoins } = useApp();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [custom, setCustom] = useState<Family | null>(null);
  const family: Family | null = FAMILIES.find((f) => f.id === familyId) ?? (custom?.id === familyId ? custom : null);

  if (family) return <FamilyHome family={family} role={familyRole ?? 'member'} onLeave={() => (setFamily(null), setFamilyRole(null))} />;

  const ranked = [...FAMILIES].sort((a, b) => b.points - a.points);
  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Aileler" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {creating ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>Aile kur · 🪙 {CREATE_COST}</Text>
            <TextInput value={newName} onChangeText={setNewName} placeholder="Aile adı" placeholderTextColor={colors.textDim} style={styles.input} maxLength={20} />
            <Text style={styles.dim}>Aileyi kuran kişi aile sahibi olur; yardımcı atayabilir, üye davet edebilir ve başvuruları onaylayabilir.</Text>
            <GradientButton
              title="Kur"
              onPress={() => {
                if (newName.trim().length < 3) return showAlert('Aile adı en az 3 karakter olmalı');
                if (!spendCoins(CREATE_COST)) return showAlert('Yetersiz jeton', `Aile kurmak ${CREATE_COST} jeton.`);
                const id = `custom-${Date.now()}`;
                setCustom({ id, name: newName.trim(), emoji: '🏰', xp: 0, weekly: 0, members: 1, leaderId: 'me', memberIds: ['me'] });
                setFamily(id);
                setFamilyRole('owner');
              }}
            />
          </Card>
        ) : (
          <GradientButton title="Kendi aileni kur" icon="add" onPress={() => setCreating(true)} />
        )}
        <Text style={[styles.title, { marginTop: 6 }]}>Haftalık aile sıralaması</Text>
        {ranked.map((f, i) => {
          const lvl = familyLevel(f.xp);
          return (
            <Card key={f.id} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={{ fontSize: 32 }}>{f.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{f.name}</Text>
                <Text style={styles.dim}>
                  LV{lvl} · {f.members}/{familyCapacity(lvl)} üye · bonus {pct(RULES.familyRates[lvl - 1])}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  {f.memberIds.slice(0, 5).map((id, j) => (
                    <View key={id} style={{ marginLeft: j ? -8 : 0 }}>
                      <Avatar uri={userById(id).avatar} size={22} />
                    </View>
                  ))}
                </View>
              </View>
              <Pressable
                style={styles.join}
                onPress={() => {
                  setFamily(f.id);
                  setFamilyRole('member');
                  showAlert('Başvurun onaylandı', `${f.name} ailesine katıldın. (Demo: başvuru aile sahibi/yardımcı tarafından anında onaylandı.)`);
                }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Katıl</Text>
              </Pressable>
            </Card>
          );
        })}
        <Text style={[styles.dim, { textAlign: 'center' }]}>Bir kullanıcı aynı anda yalnızca bir aileye üye olabilir.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function FamilyHome({ family, role, onLeave }: { family: Family; role: Role; onLeave: () => void }) {
  const { me, familyChat, sendFamilyMessage, familyMuted, setFamilyMuted, toggleBlock } = useApp();
  const [tab, setTab] = useState<Tab>('home');
  const [roles, setRoles] = useState<Record<string, Role>>({ [family.leaderId]: 'owner', [family.memberIds[1] ?? '']: 'helper', me: role });
  const [memberIds, setMemberIds] = useState(() => [...new Set(['me', ...family.memberIds])]);
  const [pending, setPending] = useState(() => USERS.filter((u) => !family.memberIds.includes(u.id)).slice(0, 3).map((u) => u.id));
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const lvl = familyLevel(family.xp);
  const next = FAMILY_XP[lvl] ?? null;
  const progress = next ? (family.xp - FAMILY_XP[lvl - 1]) / (next - FAMILY_XP[lvl - 1]) : 1;
  const canManage = role === 'owner' || role === 'helper';
  const rows = memberIds.map((id, i) => ({ id, ...activity(id, i) })).sort((a, b) => b.contribution - a.contribution);
  const activeRows = rows.filter(isActive);
  const activeTotal = activeRows.reduce((s, r) => s + r.contribution, 0);
  const pool = familyBonus(family.weekly, lvl);
  const myRow = rows.find((r) => r.id === 'me');
  const myShare = myRow && isActive(myRow) && activeTotal ? Math.round((pool * myRow.contribution) / activeTotal) : 0;
  const roleOf = (id: string): Role => roles[id] ?? 'member';

  const leave = () => {
    if (role === 'owner') return showAlert('Önce sahipliği devret', 'Aile sahibi ayrılmadan önce sahipliği bir yardımcıya devretmelidir.');
    showAlert('Aileden ayrıl', 'Ayrılırsan bu haftaki aile bonusu payını kaybedersin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Ayrıl', style: 'destructive', onPress: onLeave },
    ]);
  };

  const target = menuFor ? userById(menuFor) : null;
  const memberOptions = menuFor
    ? [
        { label: 'Profili gör', onPress: () => router.push(`/kullanici/${menuFor}`) },
        ...(role === 'owner' && roleOf(menuFor) === 'member' ? [{ label: '🛡️ Yardımcı yap', onPress: () => setRoles((r) => ({ ...r, [menuFor]: 'helper' })) }] : []),
        ...(role === 'owner' && roleOf(menuFor) === 'helper' ? [{ label: 'Yardımcılığı kaldır', onPress: () => setRoles((r) => ({ ...r, [menuFor]: 'member' })) }] : []),
        ...(canManage && roleOf(menuFor) === 'member'
          ? [{ label: 'Aileden çıkar', destructive: true, onPress: () => setMemberIds((m) => m.filter((x) => x !== menuFor)) }]
          : []),
        { label: '🚫 Engelle', destructive: true, onPress: () => toggleBlock(menuFor) },
        { label: '⚠️ Şikayet et', onPress: () => showAlert('Şikayet alındı', 'Moderasyon ekibi inceleyecek.') },
      ]
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <Header title={`${family.emoji} ${family.name}`} />
      <View style={styles.segment}>
        {(
          [
            ['home', 'Genel'],
            ['chat', 'Sohbet'],
            ['members', 'Üyeler'],
            ['bonus', 'Seviye & Bonus'],
          ] as const
        ).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.segBtn, tab === k && styles.segActive]}>
            <Text style={styles.segText}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'chat' ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.row, { paddingHorizontal: 16 }]}>
            <Text style={[styles.dim, { flex: 1 }]}>🔕 Aile sohbeti bildirimlerini sessize al</Text>
            <Switch value={familyMuted} onValueChange={setFamilyMuted} />
          </View>
          <GroupChat
            members={memberIds.map((id) => (id === 'me' ? me : userById(id)))}
            messages={familyChat}
            onSend={sendFamilyMessage}
            pinned="📢 Aile duyurusu: Bu hafta hedefimiz bir üst seviye! Aile odasında Cuma 21:00."
            lastActive={(u) => LAST_ACTIVE[Number(u.id.slice(1)) % LAST_ACTIVE.length]}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
          {tab === 'home' && (
            <>
              <Card style={{ alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 56 }}>{family.emoji}</Text>
                <Text style={styles.big}>{family.name}</Text>
                <Text style={styles.dim}>
                  LV{lvl} · {memberIds.length + Math.max(0, family.members - family.memberIds.length - 1)}/{familyCapacity(lvl)} üye · {activeRows.length} aktif
                </Text>
                <Text style={styles.dim}>
                  Sahip: {userById(family.leaderId).name} · Rolün: {ROLE_LABEL[role]}
                </Text>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.dim}>{next ? `${family.xp.toLocaleString('tr-TR')} / ${next.toLocaleString('tr-TR')} XP → LV${lvl + 1}` : 'En yüksek seviye'}</Text>
              </Card>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Bu haftaki aile bonusu</Text>
                <Text style={styles.dim}>
                  Uygun aile kazancı 💎 {family.weekly.toLocaleString('tr-TR')} × {pct(RULES.familyRates[lvl - 1])} = <Text style={{ color: colors.gold, fontWeight: '800' }}>💎 {pool.toLocaleString('tr-TR')}</Text>
                </Text>
                <Text style={styles.dim}>
                  Senin tahmini payın: <Text style={{ color: '#fff', fontWeight: '700' }}>💎 {myShare.toLocaleString('tr-TR')}</Text>
                  {myShare ? '' : ' (aktif üye şartını sağlamıyorsun)'}
                </Text>
              </Card>
              <Card style={{ gap: 4 }}>
                <Text style={[styles.title, { marginBottom: 6 }]}>Haftalık katkı</Text>
                {rows.map((r, i) => {
                  const u = r.id === 'me' ? me : userById(r.id);
                  return (
                    <Pressable key={r.id} style={styles.row} onPress={() => r.id !== 'me' && router.push(`/kullanici/${r.id}`)}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      <Avatar uri={u.avatar} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff' }}>
                          {r.id === 'me' ? `${me.name} (sen)` : u.name} {roleOf(r.id) !== 'member' ? ROLE_LABEL[roleOf(r.id)].split(' ')[0] : ''}
                        </Text>
                        <Text style={styles.dim}>
                          {isActive(r) ? '🟢 Aktif' : '⚪ Pasif'} · {r.days} gün
                        </Text>
                      </View>
                      <Text style={{ color: colors.gold, fontWeight: '700' }}>{r.contribution.toLocaleString('tr-TR')}</Text>
                    </Pressable>
                  );
                })}
              </Card>
              <Pressable onPress={leave} style={{ alignItems: 'center', padding: 8 }}>
                <Text style={{ color: colors.red, fontWeight: '600' }}>Aileden ayrıl</Text>
              </Pressable>
            </>
          )}

          {tab === 'members' && (
            <>
              {canManage && (
                <GradientButton title="Üye davet et" icon="person-add" onPress={() => setInviteOpen(true)} />
              )}
              {canManage && pending.length > 0 && (
                <Card style={{ gap: 8 }}>
                  <Text style={styles.title}>Katılım başvuruları ({pending.length})</Text>
                  {pending.map((id) => {
                    const u = userById(id);
                    return (
                      <View key={id} style={styles.row}>
                        <Avatar uri={u.avatar} size={34} />
                        <Text style={{ color: '#fff', flex: 1 }}>{u.name}</Text>
                        <Pressable
                          style={[styles.small, { backgroundColor: colors.green }]}
                          onPress={() => {
                            if (memberIds.length >= familyCapacity(lvl)) return showAlert('Kapasite dolu', `LV${lvl} aile en fazla ${familyCapacity(lvl)} üye alabilir.`);
                            setPending((p) => p.filter((x) => x !== id));
                            setMemberIds((m) => [...m, id]);
                          }}>
                          <Text style={styles.smallText}>Onayla</Text>
                        </Pressable>
                        <Pressable style={[styles.small, { backgroundColor: colors.cardAlt }]} onPress={() => setPending((p) => p.filter((x) => x !== id))}>
                          <Text style={styles.smallText}>Reddet</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </Card>
              )}
              <Card style={{ gap: 4 }}>
                <Text style={styles.title}>Üyeler ({memberIds.length})</Text>
                {memberIds.map((id) => {
                  const u = id === 'me' ? me : userById(id);
                  return (
                    <Pressable key={id} style={styles.row} onPress={() => id !== 'me' && setMenuFor(id)}>
                      <Avatar uri={u.avatar} size={36} online={id === 'me' || u.online} />
                      <Text style={{ color: '#fff', flex: 1 }}>{id === 'me' ? `${me.name} (sen)` : u.name}</Text>
                      <Text style={[styles.dim, roleOf(id) !== 'member' && { color: colors.gold, fontWeight: '700' }]}>{ROLE_LABEL[roleOf(id)]}</Text>
                    </Pressable>
                  );
                })}
              </Card>
              <Card style={{ gap: 4 }}>
                <Text style={styles.title}>Roller</Text>
                <Text style={styles.dim}>👑 Sahip: yardımcı atar/kaldırır, üye çıkarır, aile ayarlarını ve duyuruyu yönetir, sahipliği devreder.</Text>
                <Text style={styles.dim}>🛡️ Yardımcı: üye davet eder, başvuruları onaylar, sohbeti yönetir, normal üyeleri çıkarabilir.</Text>
                <Text style={styles.dim}>Üye: sohbete katılır, aile odalarına girer, katkı verir ve aktifse bonus payı alır.</Text>
              </Card>
            </>
          )}

          {tab === 'bonus' && (
            <>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Aktif üye tanımı</Text>
                <Text style={styles.dim}>Hafta içinde en az 3 gün aktif olan ve en az 1.000 geçerli katkı puanı (hediye, oda süresi, görev) toplayan üye aktif sayılır. Bonus yalnızca aktif üyeler arasında, katkı oranına göre dağıtılır.</Text>
              </Card>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Haftalık bonus hesaplama</Text>
                <Text style={styles.dim}>Aile bonusu = haftalık uygun aile kazancı × seviye oranı</Text>
                <Text style={styles.dim}>Örnek: 💎 100.000 × %3,25 = 💎 {Math.round(100_000 * 0.0325).toLocaleString('tr-TR')}</Text>
                <Text style={styles.dim}>
                  Bu aile: 💎 {family.weekly.toLocaleString('tr-TR')} × {pct(RULES.familyRates[lvl - 1])} = 💎 {pool.toLocaleString('tr-TR')} → {activeRows.length} aktif üyeye katkıya göre
                </Text>
                {activeRows.slice(0, 5).map((r) => (
                  <Text key={r.id} style={styles.dim}>
                    · {r.id === 'me' ? 'Sen' : userById(r.id).name}: {r.contribution.toLocaleString('tr-TR')} / {activeTotal.toLocaleString('tr-TR')} → 💎 {Math.round((pool * r.contribution) / activeTotal).toLocaleString('tr-TR')}
                  </Text>
                ))}
                <Text style={styles.dim}>İade edilen hediyeler, sahte etkileşim ve kısıtlı hesapların katkısı hesaba katılmaz. Bonus haftalık kapanıştan sonra cüzdana elmas olarak yansır.</Text>
              </Card>
              <Card style={{ gap: 2 }}>
                <Text style={[styles.title, { marginBottom: 6 }]}>Seviyeler (LV1–15)</Text>
                <View style={styles.tableRow}>
                  <Text style={[styles.th, { width: 44 }]}>LV</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Gereken XP</Text>
                  <Text style={[styles.th, { width: 70 }]}>Kapasite</Text>
                  <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>Bonus</Text>
                </View>
                {FAMILY_XP.map((xp, i) => (
                  <View key={xp} style={[styles.tableRow, i + 1 === lvl && { backgroundColor: 'rgba(139,92,246,0.25)', borderRadius: 8 }]}>
                    <Text style={[styles.td, { width: 44 }]}>LV{i + 1}</Text>
                    <Text style={[styles.td, { flex: 1 }]}>{xp.toLocaleString('tr-TR')}</Text>
                    <Text style={[styles.td, { width: 70 }]}>{familyCapacity(i + 1)}</Text>
                    <Text style={[styles.td, { width: 60, textAlign: 'right', color: colors.gold }]}>{pct(RULES.familyRates[i])}</Text>
                  </View>
                ))}
              </Card>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Seviye ayrıcalıkları</Text>
                {FAMILY_PERKS.map((p) => (
                  <Text key={p.from} style={[styles.dim, lvl >= p.from && { color: '#fff' }]}>
                    {lvl >= p.from ? '✅' : '🔒'} LV{p.from}–{p.to}: {p.text}
                  </Text>
                ))}
                <Text style={styles.dim}>Oranlar merkezi yönetim panelinden değiştirilebilir; geçmiş haftalar değişmez.</Text>
              </Card>
            </>
          )}
        </ScrollView>
      )}

      <ActionSheet visible={!!menuFor} title={target?.name ?? ''} onClose={() => setMenuFor(null)} options={memberOptions} />
      <ActionSheet
        visible={inviteOpen}
        title="Aileye davet et"
        onClose={() => setInviteOpen(false)}
        options={USERS.filter((u) => !memberIds.includes(u.id) && !pending.includes(u.id))
          .slice(0, 6)
          .map((u) => ({ label: u.name, onPress: () => showAlert('Davet gönderildi', `${u.name} kabul ederse aileye katılır.`) }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  big: { color: '#fff', fontWeight: '800', fontSize: 22 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rank: { color: colors.textDim, fontWeight: '800', width: 18 },
  join: { backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
  segment: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.card, borderRadius: 999, padding: 4, marginBottom: 4 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  segActive: { backgroundColor: colors.primary },
  segText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  bar: { width: '100%', height: 8, backgroundColor: colors.cardAlt, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 8, backgroundColor: colors.gold },
  small: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  smallText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 },
  th: { color: colors.textDim, fontWeight: '800', fontSize: 11 },
  td: { color: '#fff', fontSize: 12 },
});
