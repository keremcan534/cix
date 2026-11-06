import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ComingSoon } from '@/components/coming-soon';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Art } from '@/components/Art';
import { goToMember } from '@/components/GroupChat';
import { Avatar, Card, GradientButton, Header, StateIcon } from '@/components/ui';
import { FAMILIES } from '@/data/economy';
import {
  KABILE_CHESTS,
  KABILE_COUPLES,
  KABILE_CREATE_COST,
  KABILE_ROUTES,
  KABILE_TASKS,
  KABILE_THEMES,
  KEEP_GOAL,
  findKabile,
  fmt,
  fmtK,
  kabileMemberIds,
  kabileMeta,
  createKabile,
  powerTier,
  taskProgress,
  useKabileProgress,
  type KabileFamily,
} from '@/data/kabile';
import { USERS, userById, type User } from '@/data/mock';
import { presenceLabel, presenceOf } from '@/data/presence';
import { FAMILY_PERKS, FAMILY_XP, RULES, familyBonus, familyCapacity, familyLevel, pct } from '@/data/rules';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { liveMode } from '@/lib/live';
import { youLabel } from '@/lib/tr';
import { copyText } from '@/lib/clipboard';
import { useApp } from '@/store';
import { ThemeScope, makeStyles, useTheme } from '@/theme';

type Role = 'owner' | 'helper' | 'member';
type Tab = 'oda' | 'gorev' | 'cift' | 'durum' | 'tema';
type Sheet = 'stats' | 'rules' | 'ranking' | 'highlights' | null;
const ROLE_LABEL: Record<Role, string> = { owner: '👑 Lider', helper: '🛡️ Yardımcı', member: 'Üye' };
const ROLE_ORDER: Record<Role, number> = { owner: 0, helper: 1, member: 2 };
const TABS = [
  ['oda', 'Oda'],
  ['gorev', 'Görev'],
  ['cift', 'İkili'],
  ['durum', 'Durum'],
  ['tema', 'Tema'],
] as const;
const WEEK_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const WEEK_SHARE = [0.1, 0.12, 0.15, 0.13, 0.18, 0.17, 0.15];

// Mock weekly activity per member: active = ≥3 active days AND ≥1,000 valid contribution this week.
const activity = (id: string, i: number) => ({ days: id === 'me' ? 4 : (i * 3 + 2) % 8, contribution: id === 'me' ? 2_500 : Math.max(0, (9 - i) * 2_600 - (i % 3) * 900) });
const isActive = (a: { days: number; contribution: number }) => a.days >= 3 && a.contribution >= 1_000;

// Tayfa has no server yet (data/kabile tayfaAvailable): a live build shows a notice instead of sample tayfas and
// a "Tayfa kur" that would take real coins for a tayfa that exists only on this phone.
export default function FamilyScreen() {
  return liveMode() ? <ComingSoon title="Tayfalar" /> : <DemoFamilies />;
}

function DemoFamilies() {
  const { familyId, setFamily, familyRole, setFamilyRole, spendCoins } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const family = findKabile(familyId);

  if (family) return <FamilyHome key={family.id} family={family} role={familyRole ?? 'member'} onLeave={() => (setFamily(null), setFamilyRole(null))} />;

  const ranked = [...FAMILIES].sort((a, b) => b.points - a.points);
  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.family} />
      <Header title="Tayfalar" />
      <KeyboardAvoid style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          {creating ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.title}>Tayfa kur · 🪙 {KABILE_CREATE_COST}</Text>
              <TextInput value={newName} onChangeText={setNewName} placeholder="Tayfa adı" placeholderTextColor={colors.textDim} style={styles.input} maxLength={20} />
              <Text style={styles.dim}>Tayfayı kuran kişi tayfa lideri olur; yardımcı atayabilir, üye davet edebilir ve başvuruları onaylayabilir.</Text>
              <GradientButton
                title="Kur"
                onPress={() => {
                  if (newName.trim().length < 3) return showAlert('Tayfa adı en az 3 karakter olmalı');
                  const made = createKabile(newName.trim(), spendCoins);
                  if (made === 'off') return;
                  if (made === 'coins') return showAlert('Yetersiz jeton', `Tayfa kurmak ${KABILE_CREATE_COST} jeton.`);
                  setFamily(made.id);
                  setFamilyRole('owner');
                }}
              />
            </Card>
          ) : (
            <GradientButton title="Kendi tayfanı kur" icon="add" onPress={() => setCreating(true)} />
          )}
          <Text style={[styles.title, { marginTop: 6 }]}>Haftalık tayfa sıralaması</Text>
          {ranked.map((f, i) => {
            const lvl = familyLevel(f.xp);
            return (
              <Card key={f.id} style={styles.row}>
                <Text style={styles.rank}>{i + 1}</Text>
                <Text style={{ fontSize: 32 }}>{f.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{f.name}</Text>
                  <Text style={styles.dim} numberOfLines={1}>
                    Lv.{lvl} · {f.members}/{familyCapacity(lvl)} üye
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    {f.memberIds.slice(0, 5).map((id, j) => (
                      <View key={id} style={{ marginLeft: j ? -8 : 0 }}>
                        <Avatar uri={userById(id).avatar} size={22} />
                      </View>
                    ))}
                    <Text style={[styles.dim, { marginLeft: 8 }]}>Bonus {pct(RULES.familyRates[lvl - 1])}</Text>
                  </View>
                </View>
                <Pressable
                  style={styles.join}
                  onPress={() => {
                    setFamily(f.id);
                    setFamilyRole('member');
                    showAlert('Başvurun onaylandı', `${f.name} tayfasına katıldın. (Demo: başvuru lider/yardımcı tarafından anında onaylandı.)`);
                  }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Katıl</Text>
                </Pressable>
              </Card>
            );
          })}
          <Text style={[styles.dim, { textAlign: 'center' }]}>Bir kullanıcı aynı anda yalnızca bir tayfaya üye olabilir.</Text>
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

function FamilyHome({ family, role, onLeave }: { family: KabileFamily; role: Role; onLeave: () => void }) {
  const { me, familyMuted, setFamilyMuted, toggleBlock, createTicket } = useApp();
  const { colors, semantic, gradientDeep, dark } = useTheme();
  const styles = useStyles();
  const progress = useKabileProgress();
  const meta = kabileMeta(family.id);
  const [tab, setTab] = useState<Tab>('oda');
  const [roles, setRoles] = useState<Record<string, Role>>({ [family.leaderId]: 'owner', [family.memberIds[1] ?? '']: 'helper', me: role });
  const [memberIds, setMemberIds] = useState(() => kabileMemberIds(family));
  const [pending, setPending] = useState(() => USERS.filter((u) => !kabileMemberIds(family).includes(u.id)).slice(0, 3).map((u) => u.id));
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [announcement, setAnnouncement] = useState(meta.announcement);
  const [annDraft, setAnnDraft] = useState<string | null>(null);
  const [themeId, setThemeId] = useState(KABILE_THEMES[family.id === 'f1' ? 1 : 0].id);

  const lvl = familyLevel(family.xp);
  const next = FAMILY_XP[lvl] ?? null;
  const xpProgress = next ? (family.xp - FAMILY_XP[lvl - 1]) / (next - FAMILY_XP[lvl - 1]) : 1;
  const canManage = role === 'owner' || role === 'helper';
  const rows = memberIds.map((id, i) => ({ id, ...activity(id, i) })).sort((a, b) => b.contribution - a.contribution);
  const activeRows = rows.filter(isActive);
  const activeTotal = activeRows.reduce((s, r) => s + r.contribution, 0);
  const pool = familyBonus(family.weekly, lvl);
  const myRow = rows.find((r) => r.id === 'me');
  const myShare = myRow && isActive(myRow) && activeTotal ? Math.round((pool * myRow.contribution) / activeTotal) : 0;
  const roleOf = (id: string): Role => roles[id] ?? 'member';
  const userOf = (id: string): User => (id === 'me' ? me : userById(id));

  // Members not in the shown sample still count towards the total.
  const shownCounted = kabileMemberIds(family).filter((id) => id !== 'me' || family.memberIds.includes('me')).length;
  const hidden = Math.max(0, family.members - shownCounted);
  const totalMembers = memberIds.length + hidden;
  const power = meta.power + progress.addedPower;
  const weeklyPower = meta.weeklyPower + progress.addedPower;
  const { tier, next: nextTier } = powerTier(power);
  const keep = Math.min(KEEP_GOAL, meta.keep + progress.addedPower);
  const theme = KABILE_THEMES.find((t) => t.id === themeId) ?? KABILE_THEMES[0];
  const sortedMembers = [...memberIds].sort((a, b) => ROLE_ORDER[roleOf(a)] - ROLE_ORDER[roleOf(b)]);
  const playing = memberIds.filter((id) => id !== 'me').map(userById).filter((u) => u.online || presenceOf(u.id));
  const featured = rows.find((r) => r.id !== 'me') ?? rows[0];

  const leave = () => {
    if (role === 'owner') return showAlert('Önce liderliği devret', 'Tayfa lideri ayrılmadan önce liderliği bir yardımcıya devretmelidir.');
    showAlert('Tayfadan ayrıl', 'Ayrılırsan bu haftaki tayfa bonusu payını kaybedersin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Ayrıl', style: 'destructive', onPress: onLeave },
    ]);
  };

  const openMember = (u: User) => (presenceOf(u.id)?.kind === 'room' ? goToMember(u) : router.push(`/kullanici/${u.id}`));

  const target = menuFor ? userById(menuFor) : null;
  const targetInRoom = menuFor ? presenceOf(menuFor)?.kind === 'room' : false;
  const memberOptions: SheetOption[] = menuFor
    ? [
        { label: 'Profili gör', icon: 'person-outline' as const, onPress: () => router.push(`/kullanici/${menuFor}`) },
        ...(targetInRoom && target ? [{ label: 'Odasına git', icon: 'enter-outline' as const, onPress: () => goToMember(target) }] : []),
        ...(role === 'owner' && roleOf(menuFor) === 'member' ? [{ label: 'Yardımcı yap', icon: 'shield-checkmark-outline' as const, onPress: () => setRoles((r) => ({ ...r, [menuFor]: 'helper' })) }] : []),
        ...(role === 'owner' && roleOf(menuFor) === 'helper' ? [{ label: 'Yardımcılığı kaldır', icon: 'shield-outline' as const, onPress: () => setRoles((r) => ({ ...r, [menuFor]: 'member' })) }] : []),
        ...(canManage && roleOf(menuFor) === 'member'
          ? [{ label: 'Tayfadan çıkar', icon: 'person-remove-outline' as const, destructive: true, onPress: () => setMemberIds((m) => m.filter((x) => x !== menuFor)) }]
          : []),
        { label: 'Engelle', icon: 'ban-outline' as const, destructive: true, onPress: () => toggleBlock(menuFor) },
        { label: 'Şikâyet et', icon: 'flag-outline' as const, onPress: () => showAlert('Şikâyet alındı', 'Moderasyon ekibi inceleyecek.') },
      ]
    : [];

  const report = () => {
    const number = createTicket('Şikâyet', `Tayfa şikayeti: ${family.name} (ID ${meta.tagId})`);
    showAlert('Şikayet alındı', `Talep #${number} oluşturuldu. Moderasyon ekibi inceleyecek.`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* The announcement field sits in the scroll: the keyboard must not cover it (Android draws edge to edge). */}
      <KeyboardAvoid style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {/* The tribe's theme header stays dark in both schemes (white type on the theme gradient). */}
        <ThemeScope scheme="dark">
        <LinearGradient colors={theme.colors} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <View style={styles.topBar}>
            <Pressable onPress={() => goBack()} hitSlop={10} accessibilityLabel="Geri">
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.topBtn} onPress={() => setSheet('rules')} accessibilityLabel="Tayfa kuralları">
              <Ionicons name="document-text-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable style={[styles.topBtn, { flexDirection: 'row', gap: 6, paddingHorizontal: 12 }]} onPress={() => setSheet('stats')} accessibilityLabel="Veri Merkezi">
              <Ionicons name="stats-chart" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700' }}>Veri Merkezi</Text>
            </Pressable>
            <Pressable style={styles.topBtn} onPress={() => setMoreOpen(true)} accessibilityLabel="Menü">
              <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
            </Pressable>
          </View>

          <View style={[styles.row, { gap: 14, marginTop: 8 }]}>
            <View style={styles.logo}>
              <Text style={{ fontSize: 46 }}>{family.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={styles.nameRow}>
                <Text style={styles.big} numberOfLines={1}>
                  {family.name}
                </Text>
                <Text style={styles.badgeChip}>🏷️ {meta.badge}</Text>
                <Text style={styles.powerChip}>🔥×{fmt(meta.multiplier)}</Text>
              </View>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setTab('durum')} accessibilityLabel="Üyeler">
                {memberIds.slice(0, 4).map((id, j) => (
                  <View key={id} style={{ marginLeft: j ? -6 : 0 }}>
                    <Avatar uri={userOf(id).avatar} size={36} ring={roleOf(id) !== 'member'} />
                  </View>
                ))}
                {totalMembers > 4 && (
                  <View style={styles.more}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>+{totalMembers - 4}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          <Pressable onPress={() => setTab('durum')} accessibilityLabel="Tayfa seviyesi">
            <LinearGradient colors={['#047857', '#14532D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelCard}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tier}>{tier.name}</Text>
                  <Text style={{ color: '#fff', marginTop: 4 }}>
                    <Text style={{ fontWeight: '900', fontSize: 20 }}>{fmt(power)}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)' }}>{nextTier ? `/${fmt(nextTier.min)}` : ''}</Text>
                  </Text>
                </View>
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <StateIcon name="shield-checkmark-outline" />
                  <Text style={styles.lvChip}>
                    Lv.{lvl} · {pct(RULES.familyRates[lvl - 1])}
                  </Text>
                </View>
              </View>
              <View style={[styles.bar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <View style={[styles.barFill, { backgroundColor: '#fff', width: `${nextTier ? Math.round(((power - tier.min) / (nextTier.min - tier.min)) * 100) : 100}%` }]} />
              </View>
              <Pressable
                style={[styles.row, { marginTop: 8, gap: 6 }]}
                onPress={() => showAlert('Seviyeyi koruma', `Tayfanın ${tier.name} kademesinde kalması için her hafta toplam ${fmt(KEEP_GOAL)} katkı puanı toplaması gerekir. Hedefe ulaşılamazsa haftalık kapanışta bir kademe düşer.`)}>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Seviyeyi koruma ilerlemesi ⓘ</Text>
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {fmt(keep)}/{fmt(KEEP_GOAL)}
                </Text>
              </Pressable>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
        </ThemeScope>

        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>Tayfa Duyurusu</Text>
            {canManage && annDraft === null && (
              <Pressable onPress={() => setAnnDraft(announcement)} hitSlop={8} accessibilityLabel="Duyuruyu düzenle">
                <Ionicons name="create-outline" size={18} color={colors.textDim} />
              </Pressable>
            )}
          </View>
          {annDraft === null ? (
            <Text style={styles.dim}>{announcement}</Text>
          ) : (
            <View style={{ gap: 8 }}>
              <TextInput value={annDraft} onChangeText={setAnnDraft} multiline maxLength={140} style={[styles.input, { minHeight: 70 }]} placeholderTextColor={colors.textDim} placeholder="Duyuru" />
              <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                <Pressable style={[styles.small, { backgroundColor: colors.cardAlt }]} onPress={() => setAnnDraft(null)}>
                  <Text style={[styles.smallText, { color: colors.text }]}>Vazgeç</Text>
                </Pressable>
                <Pressable
                  style={[styles.small, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (annDraft.trim()) setAnnouncement(annDraft.trim());
                    setAnnDraft(null);
                  }}>
                  <Text style={styles.smallText}>Kaydet</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={[styles.row, { marginTop: 16 }]}>
            <Text style={styles.sectionTitle}>Tayfa Etiketi</Text>
            <Pressable style={[styles.row, { gap: 4 }]} onPress={() => copyText(String(meta.tagId), 'Tayfa ID')} accessibilityLabel="Tayfa ID kopyala">
              <Text style={styles.dim}>ID:{meta.tagId}</Text>
              <Ionicons name="copy-outline" size={14} color={colors.textDim} />
            </Pressable>
          </View>
          <View style={styles.tags}>
            {meta.tags.map((t) => (
              <Text key={t.label} style={styles.tag}>
                {t.emoji} {t.label}
              </Text>
            ))}
          </View>

          <View style={styles.cards}>
            <Pressable style={[styles.miniCard, { backgroundColor: '#0A8F95' }]} onPress={() => featured && featured.id !== 'me' && router.push(`/kullanici/${featured.id}`)}>
              <Text style={styles.miniTitle} numberOfLines={1}>
                Haftanın Öne Çıkan Kişisi
              </Text>
              {featured && (
                <View style={[styles.row, { gap: 6 }]}>
                  <Avatar uri={userOf(featured.id).avatar} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }} numberOfLines={1}>
                      {userOf(featured.id).name}
                    </Text>
                    <Text style={styles.miniChip}>{fmtK(featured.contribution)}</Text>
                  </View>
                </View>
              )}
            </Pressable>
            <Pressable style={[styles.miniCard, { backgroundColor: '#065A60' }]} onPress={() => setSheet('ranking')}>
              <Text style={styles.miniTitle} numberOfLines={1}>
                Haftalık Tayfa Sıralaması
              </Text>
              <Text style={{ color: '#fff', fontSize: 13 }}>{meta.weeklyRank ? `No.${meta.weeklyRank}` : 'Sırasız'}</Text>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>{fmtK(weeklyPower)} puan</Text>
            </Pressable>
            <Pressable style={[styles.miniCard, { backgroundColor: '#B45309' }]} onPress={() => setSheet('highlights')}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }} numberOfLines={2}>
                Öne Çıkanlar
              </Text>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 18 }}>»</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabs}>
          {TABS.map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={styles.tabBtn} accessibilityLabel={l}>
              <Text style={[styles.tabText, tab === k && { color: colors.text, fontSize: 19 }]}>{l}</Text>
              {tab === k && <View style={styles.tabLine} />}
            </Pressable>
          ))}
        </View>

        <View style={{ padding: 16, gap: 14 }}>
          {tab === 'oda' && (
            <>
              <Card style={{ gap: 10 }}>
                <Text style={styles.title}>Birlikte oynuyor</Text>
                {playing.length === 0 ? (
                  <Text style={styles.dim}>Şu anda çevrimiçi üye yok.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {playing.map((u) => (
                      <PlayingChip key={u.id} u={u} onPress={() => openMember(u)} />
                    ))}
                  </ScrollView>
                )}
                <Pressable style={styles.roomCard} onPress={() => router.push(`/oda/${meta.roomId}`)} accessibilityLabel="Tayfa odası">
                  <Text style={{ fontSize: 22 }}>🎙️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '800' }}>Tayfa odası</Text>
                    <Text style={styles.dim}>Tayfa odasında 15 dakika kal görevi buradan sayılır</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
                </Pressable>
              </Card>
              <Card style={{ gap: 2 }}>
                <Text style={[styles.title, { marginBottom: 6 }]}>
                  Üyeler ({memberIds.length}
                  {hidden ? ` / ${totalMembers}` : ''})
                </Text>
                {sortedMembers.map((id) => {
                  const u = userOf(id);
                  const r = roleOf(id);
                  const p = id === 'me' ? null : presenceOf(id);
                  return (
                    <Pressable key={id} style={styles.row} onPress={() => id !== 'me' && setMenuFor(id)} accessibilityLabel={u.name}>
                      <Avatar uri={u.avatar} size={40} online={id === 'me' || u.online} />
                      <View style={{ flex: 1, paddingVertical: 4 }}>
                        <View style={[styles.row, { gap: 6, paddingVertical: 0 }]}>
                          <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                            {id === 'me' ? youLabel(me.name) : u.name}
                          </Text>
                          {r !== 'member' && <Text style={[styles.roleBadge, r === 'helper' && { backgroundColor: dark ? 'rgba(19,217,223,0.16)' : 'rgba(0,140,148,0.10)', color: colors.primaryText }]}>{ROLE_LABEL[r]}</Text>}
                        </View>
                        <Text style={[styles.dim, p?.kind === 'room' && { color: colors.gold }]} numberOfLines={1}>
                          {id === 'me' ? 'Çevrimiçi' : presenceLabel(p, u.online)}
                        </Text>
                      </View>
                      {p?.kind === 'room' && (
                        <Pressable style={styles.goBtn} onPress={() => goToMember(u)} accessibilityLabel={`${u.name} odasına git`}>
                          <Text style={styles.smallText}>Git</Text>
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </Card>
            </>
          )}

          {tab === 'gorev' && <TasksTab roomId={meta.roomId} weeklyPower={weeklyPower} />}

          {tab === 'cift' && <CoupleTab />}

          {tab === 'durum' && (
            <>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Tayfa seviyesi · Lv.{lvl}</Text>
                <Text style={styles.dim}>
                  {totalMembers}/{familyCapacity(lvl)} üye · {activeRows.length} aktif · Lider: {userOf(family.leaderId).name} · Rolün: {ROLE_LABEL[role]}
                </Text>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.round(xpProgress * 100)}%` }]} />
                </View>
                <Text style={styles.dim}>{next ? `${fmt(family.xp)} / ${fmt(next)} XP → Lv.${lvl + 1}` : 'En yüksek seviye'}</Text>
              </Card>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Bu haftaki tayfa bonusu</Text>
                <Text style={styles.dim}>
                  Uygun tayfa kazancı 💎 {fmt(family.weekly)} × {pct(RULES.familyRates[lvl - 1])} = <Text style={{ color: colors.gold, fontWeight: '800' }}>💎 {fmt(pool)}</Text>
                </Text>
                <Text style={styles.dim}>
                  Senin tahmini payın: <Text style={{ color: colors.text, fontWeight: '700' }}>💎 {fmt(myShare)}</Text>
                  {myShare ? '' : ' (aktif üye şartını sağlamıyorsun)'}
                </Text>
              </Card>
              <Card style={{ gap: 4 }}>
                <Text style={[styles.title, { marginBottom: 6 }]}>Haftalık katkı</Text>
                {rows.map((r, i) => {
                  const u = userOf(r.id);
                  return (
                    <Pressable key={r.id} style={styles.row} onPress={() => r.id !== 'me' && router.push(`/kullanici/${r.id}`)}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      <Avatar uri={u.avatar} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text }}>
                          {r.id === 'me' ? youLabel(me.name) : u.name} {roleOf(r.id) !== 'member' ? ROLE_LABEL[roleOf(r.id)].split(' ')[0] : ''}
                        </Text>
                        <Text style={styles.dim}>
                          {isActive(r) ? '🟢 Aktif' : '⚪ Pasif'} · {r.days} gün
                        </Text>
                      </View>
                      <Text style={{ color: colors.gold, fontWeight: '700' }}>{fmt(r.contribution)}</Text>
                    </Pressable>
                  );
                })}
              </Card>

              {canManage && <GradientButton title="Üye davet et" icon="person-add" onPress={() => setInviteOpen(true)} />}
              {canManage && pending.length > 0 && (
                <Card style={{ gap: 8 }}>
                  <Text style={styles.title}>Katılım başvuruları ({pending.length})</Text>
                  {pending.map((id) => {
                    const u = userById(id);
                    return (
                      <View key={id} style={styles.row}>
                        <Avatar uri={u.avatar} size={34} />
                        <Text style={{ color: colors.text, flex: 1 }}>{u.name}</Text>
                        <Pressable
                          style={[styles.small, { backgroundColor: semantic.successFill }]}
                          onPress={() => {
                            if (totalMembers >= familyCapacity(lvl)) return showAlert('Kapasite dolu', `Lv.${lvl} tayfa en fazla ${familyCapacity(lvl)} üye alabilir.`);
                            setPending((p) => p.filter((x) => x !== id));
                            setMemberIds((m) => [...m, id]);
                          }}>
                          <Text style={styles.smallText}>Onayla</Text>
                        </Pressable>
                        <Pressable style={[styles.small, { backgroundColor: colors.cardAlt }]} onPress={() => setPending((p) => p.filter((x) => x !== id))}>
                          <Text style={[styles.smallText, { color: colors.text }]}>Reddet</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </Card>
              )}
              <Card style={{ gap: 4 }}>
                <Text style={styles.title}>Roller</Text>
                <Text style={styles.dim}>👑 Lider: yardımcı atar/kaldırır, üye çıkarır, tayfa ayarlarını ve duyuruyu yönetir, liderliği devreder.</Text>
                <Text style={styles.dim}>🛡️ Yardımcı: üye davet eder, başvuruları onaylar, sohbeti ve duyuruyu yönetir, normal üyeleri çıkarabilir.</Text>
                <Text style={styles.dim}>Üye: sohbete katılır, tayfa odalarına girer, katkı verir ve aktifse bonus payı alır.</Text>
                <Text style={[styles.dim, { marginTop: 4 }]}>Üye yönetimi için Oda sekmesindeki üyeye dokun.</Text>
              </Card>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Aktif üye tanımı</Text>
                <Text style={styles.dim}>Hafta içinde en az 3 gün aktif olan ve en az 1.000 geçerli katkı puanı (hediye, oda süresi, görev) toplayan üye aktif sayılır. Bonus yalnızca aktif üyeler arasında, katkı oranına göre dağıtılır.</Text>
              </Card>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Haftalık bonus hesaplama</Text>
                <Text style={styles.dim}>Tayfa bonusu = haftalık uygun tayfa kazancı × seviye oranı</Text>
                <Text style={styles.dim}>Örnek: 💎 100.000 × %3,25 = 💎 {fmt(Math.round(100_000 * 0.0325))}</Text>
                <Text style={styles.dim}>
                  Bu tayfa: 💎 {fmt(family.weekly)} × {pct(RULES.familyRates[lvl - 1])} = 💎 {fmt(pool)} → {activeRows.length} aktif üyeye katkıya göre
                </Text>
                {activeRows.slice(0, 5).map((r) => (
                  <Text key={r.id} style={styles.dim}>
                    · {r.id === 'me' ? 'Sen' : userById(r.id).name}: {fmt(r.contribution)} / {fmt(activeTotal)} → 💎 {fmt(Math.round((pool * r.contribution) / activeTotal))}
                  </Text>
                ))}
                <Text style={styles.dim}>İade edilen hediyeler, sahte etkileşim ve kısıtlı hesapların katkısı hesaba katılmaz. Bonus haftalık kapanıştan sonra cüzdana elmas olarak yansır.</Text>
              </Card>
              <Card style={{ gap: 2 }}>
                <Text style={[styles.title, { marginBottom: 6 }]}>Seviyeler (Lv.1–15)</Text>
                <View style={styles.tableRow}>
                  <Text style={[styles.th, { width: 44 }]}>Lv</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Gereken XP</Text>
                  <Text style={[styles.th, { width: 70 }]}>Kapasite</Text>
                  <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>Bonus</Text>
                </View>
                {FAMILY_XP.map((xp, i) => (
                  <View key={xp} style={[styles.tableRow, i + 1 === lvl && { backgroundColor: dark ? 'rgba(19,217,223,0.25)' : 'rgba(0,140,148,0.15)', borderRadius: 8 }]}>
                    <Text style={[styles.td, { width: 44 }]}>Lv.{i + 1}</Text>
                    <Text style={[styles.td, { flex: 1 }]}>{fmt(xp)}</Text>
                    <Text style={[styles.td, { width: 70 }]}>{familyCapacity(i + 1)}</Text>
                    <Text style={[styles.td, { width: 60, textAlign: 'right', color: colors.gold }]}>{pct(RULES.familyRates[i])}</Text>
                  </View>
                ))}
              </Card>
              <Card style={{ gap: 6 }}>
                <Text style={styles.title}>Seviye ayrıcalıkları</Text>
                {FAMILY_PERKS.map((p) => (
                  <View key={p.from} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <Ionicons name={lvl >= p.from ? 'checkmark-circle' : 'lock-closed'} size={14} color={lvl >= p.from ? colors.green : colors.textDim} style={{ marginTop: 2 }} />
                    <Text style={[styles.dim, { flex: 1 }, lvl >= p.from && { color: colors.text }]}>
                      Lv.{p.from}–{p.to}: {p.text}
                    </Text>
                  </View>
                ))}
                <Text style={styles.dim}>Oranlar merkezi yönetim panelinden değiştirilebilir; geçmiş haftalar değişmez.</Text>
              </Card>
              <Pressable onPress={leave} style={{ alignItems: 'center', padding: 8 }}>
                <Text style={{ color: colors.red, fontWeight: '600' }}>Tayfadan ayrıl</Text>
              </Pressable>
            </>
          )}

          {tab === 'tema' && <ThemeTab themeId={themeId} onPick={setThemeId} level={lvl} canManage={canManage} />}
        </View>
      </ScrollView>
      </KeyboardAvoid>

      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <Pressable style={{ flex: 1 }} onPress={() => setShareOpen(true)} accessibilityLabel="Paylaş">
          <LinearGradient colors={['#FF8A96', semantic.social]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bottomBtn}>
            <Ionicons name="arrow-redo" size={20} color="#fff" />
            <Text style={styles.bottomText}>Paylaş</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(KABILE_ROUTES.sohbet)} accessibilityLabel="Sohbet">
          <LinearGradient colors={gradientDeep} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bottomBtn}>
            <Ionicons name="chatbubbles" size={20} color="#fff" />
            <Text style={styles.bottomText}>Sohbet</Text>
          </LinearGradient>
        </Pressable>
      </SafeAreaView>

      <ActionSheet visible={!!menuFor} title={target?.name ?? ''} onClose={() => setMenuFor(null)} options={memberOptions} />
      <ActionSheet
        visible={inviteOpen}
        title="Tayfaya davet et"
        onClose={() => setInviteOpen(false)}
        options={USERS.filter((u) => !memberIds.includes(u.id) && !pending.includes(u.id))
          .slice(0, 6)
          .map((u) => ({ label: u.name, onPress: () => showAlert('Davet gönderildi', `${u.name} kabul ederse tayfaya katılır.`) }))}
      />
      <ActionSheet
        visible={moreOpen}
        title={family.name}
        onClose={() => setMoreOpen(false)}
        options={[
          { label: 'Veri Merkezi', icon: 'stats-chart-outline' as const, onPress: () => setSheet('stats') },
          { label: 'Tayfa kuralları', icon: 'document-text-outline' as const, onPress: () => setSheet('rules') },
          { label: familyMuted ? 'Sohbet bildirimlerini aç' : 'Sohbeti sessize al', icon: familyMuted ? ('notifications-outline' as const) : ('notifications-off-outline' as const), onPress: () => setFamilyMuted(!familyMuted) },
          ...(canManage ? [{ label: 'Üye davet et', icon: 'person-add-outline' as const, onPress: () => setInviteOpen(true) }] : []),
          { label: 'Tayfayı şikâyet et', icon: 'flag-outline' as const, onPress: report },
          { label: 'Tayfadan ayrıl', icon: 'exit-outline' as const, destructive: true, onPress: leave },
        ]}
      />
      <ActionSheet
        visible={shareOpen}
        title="Tayfayı paylaş"
        onClose={() => setShareOpen(false)}
        options={[
          { label: 'Bağlantıyı paylaş', icon: 'link-outline' as const, onPress: () => Share.share({ message: `${family.emoji} ${family.name} tayfasına katıl! Tayfa ID: ${meta.tagId}` }).catch(() => {}) },
          { label: 'Arkadaşlarını davet et', icon: 'people-outline' as const, onPress: () => (canManage ? setInviteOpen(true) : copyText(`Tayfa ID: ${meta.tagId}`, 'Davet bilgisi')) },
        ]}
      />

      <InfoSheet visible={sheet === 'stats'} title="📊 Veri Merkezi" onClose={() => setSheet(null)}>
        <View style={styles.statGrid}>
          <Stat label="Haftalık katkı puanı" value={fmt(weeklyPower)} />
          <Stat label="Toplam katkı puanı" value={fmt(power)} />
          <Stat label="Haftalık sıra" value={meta.weeklyRank ? `No.${meta.weeklyRank}` : '—'} />
          <Stat label="Üyeler" value={`${totalMembers}/${familyCapacity(lvl)}`} />
          <Stat label="Aktif üye" value={String(activeRows.length)} />
          <Stat label="Tayfa Sandığı" value={`🔮 ${fmt(meta.treasure + progress.addedTreasure)}`} />
          <Stat label="Haftalık uygun kazanç" value={`💎 ${fmt(family.weekly)}`} />
          <Stat label="Bonus havuzu" value={`💎 ${fmt(pool)}`} />
          <Stat label="Tahmini payın" value={`💎 ${fmt(myShare)}`} />
          <Stat label="Katkım" value={fmt(progress.myPower)} />
        </View>
        <Text style={[styles.title, { marginTop: 12, marginBottom: 8 }]}>Bu hafta günlük katkı</Text>
        <View style={styles.chart}>
          {WEEK_DAYS.map((d, i) => (
            <View key={d} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={[styles.chartBar, { height: Math.max(4, WEEK_SHARE[i] * 400) }]} />
              <Text style={styles.dim}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.dim, { marginTop: 8 }]}>Günlük dağılım örnek veridir (demo).</Text>
      </InfoSheet>

      <InfoSheet visible={sheet === 'rules'} title="📜 Tayfa kuralları" onClose={() => setSheet(null)}>
        <Text style={styles.dim}>• Bir kullanıcı aynı anda yalnızca bir tayfaya üye olabilir.</Text>
        <Text style={styles.dim}>• Aktif üye: hafta içinde en az 3 gün aktif ve en az 1.000 geçerli katkı puanı.</Text>
        <Text style={styles.dim}>• Haftalık tayfa bonusu = uygun tayfa kazancı × seviye oranı ({pct(RULES.familyRates[lvl - 1])}); aktif üyelere katkı oranına göre dağıtılır.</Text>
        <Text style={styles.dim}>• Kademeyi korumak için haftalık {fmt(KEEP_GOAL)} katkı puanı gerekir.</Text>
        <Text style={styles.dim}>• Sandık ve görev ödülleri sabittir; rastgele ödül yoktur.</Text>
        <Text style={styles.dim}>• Taciz, sahte etkileşim ve hediye iadesi istismarı yasaktır; bu katkılar sayılmaz.</Text>
      </InfoSheet>

      <InfoSheet visible={sheet === 'ranking'} title="🏆 Haftalık Tayfa Sıralaması" onClose={() => setSheet(null)}>
        {[...FAMILIES]
          .sort((a, b) => kabileMeta(b.id).weeklyPower - kabileMeta(a.id).weeklyPower)
          .map((f) => {
            const m = kabileMeta(f.id);
            const mine = f.id === family.id;
            return (
              <View key={f.id} style={[styles.row, mine && { backgroundColor: dark ? 'rgba(19,217,223,0.2)' : 'rgba(0,140,148,0.12)', borderRadius: 10, paddingHorizontal: 6 }]}>
                <Text style={[styles.rank, { width: 40 }]}>No.{m.weeklyRank}</Text>
                <Text style={{ fontSize: 24 }}>{f.emoji}</Text>
                <Text style={{ color: colors.text, flex: 1, fontWeight: mine ? '800' : '500' }}>{f.name}</Text>
                <Text style={{ color: semantic.tonalText, fontWeight: '800' }}>{fmtK(mine ? weeklyPower : m.weeklyPower)}</Text>
              </View>
            );
          })}
        <Text style={[styles.dim, { marginTop: 8 }]}>Sıralama haftalık katkı puanına göre yapılır ve Pazartesi 0:00&apos;da (UTC+3) sıfırlanır.</Text>
      </InfoSheet>

      <InfoSheet visible={sheet === 'highlights'} title="⭐ Öne Çıkanlar" onClose={() => setSheet(null)}>
        {rows
          .filter((r) => r.id !== 'me')
          .slice(0, 3)
          .map((r, i) => (
            <View key={r.id} style={styles.row}>
              <Art name={(['derece-1', 'derece-2', 'derece-3'] as const)[i]} size={25} />
              <Avatar uri={userById(r.id).avatar} size={34} />
              <Text style={{ color: colors.text, flex: 1 }}>{userById(r.id).name}</Text>
              <Text style={{ color: colors.gold, fontWeight: '700' }}>{fmt(r.contribution)} katkı</Text>
            </View>
          ))}
        {KABILE_COUPLES[0] && (
          <Text style={[styles.dim, { marginTop: 8 }]}>
            💞 En tatlı çift: {userById(KABILE_COUPLES[0].a).name} & {userById(KABILE_COUPLES[0].b).name} · {fmtK(KABILE_COUPLES[0].score)} ❤
          </Text>
        )}
        <Text style={styles.dim}>🎉 Şu an odada: {playing.filter((u) => presenceOf(u.id)?.kind === 'room').length} üye</Text>
      </InfoSheet>
    </SafeAreaView>
  );
}

function PlayingChip({ u, onPress }: { u: User; onPress: () => void }) {
  const styles = useStyles();
  const p = presenceOf(u.id);
  return (
    <Pressable style={{ alignItems: 'center', width: 66 }} onPress={onPress} accessibilityLabel={`${u.name} ${presenceLabel(p, u.online)}`}>
      <Avatar uri={u.avatar} size={50} />
      <Text style={[styles.chip, p?.kind === 'room' ? { backgroundColor: '#0FB8BE' } : p?.kind === 'call' ? { backgroundColor: '#F59E0B' } : null]} numberOfLines={1}>
        {p?.kind === 'room' ? '🎉 Partide' : p?.kind === 'call' ? '📞 Görüşmede' : '💬 Çevrimiçi'}
      </Text>
      <Text style={[styles.dim, { fontSize: 12 }]} numberOfLines={1}>
        {u.name}
      </Text>
    </Pressable>
  );
}

function TasksTab({ roomId, weeklyPower }: { roomId: string; weeklyPower: number }) {
  const { stats, spentTotal } = useApp();
  const { colors, semantic, lift } = useTheme();
  const styles = useStyles();
  const p = useKabileProgress();
  const counters = { roomMinutes: stats.roomMinutes, giftsSent: stats.giftsSent, spentTotal };
  const countTasks = KABILE_TASKS.filter((t) => t.kind === 'count');
  const done = countTasks.filter((t) => p.claimed.includes(t.id)).length;
  const readyChests = KABILE_CHESTS.filter((c) => weeklyPower >= c.need && !p.chests.includes(c.id)).length;
  return (
    <>
      <Card style={{ gap: 8 }}>
        <View style={styles.row}>
          <Text style={[styles.title, { flex: 1 }]}>Günlük Görev</Text>
          <Text style={{ color: semantic.tonalText, fontWeight: '800' }}>
            {done}/{countTasks.length}
          </Text>
        </View>
        <Text style={styles.dim}>Görevler her gün saat 0:00&apos;da yenilenir (UTC+3). Bu hafta katkın: {fmt(p.myPower)} puan</Text>
        {KABILE_TASKS.map((t) => {
          const prog = taskProgress(t, p, counters);
          return (
            <View key={t.id} style={[styles.row, { paddingVertical: 4 }]}>
              <Text style={{ fontSize: 20 }}>{t.emoji}</Text>
              <Text style={{ color: colors.text, flex: 1, fontSize: 13 }} numberOfLines={2}>
                {t.title}
              </Text>
              <Text style={[styles.dim, prog.claimable && { color: colors.green, fontWeight: '800' }]}>
                {prog.claimed ? 'Alındı' : prog.claimable ? 'Al' : t.kind === 'rate' ? `+${t.power} puan/${t.per}🪙` : `+${t.power} puan`}
              </Text>
            </View>
          );
        })}
        <GradientButton title="Görevler" icon="flash" onPress={() => router.push(KABILE_ROUTES.merkez)} />
      </Card>
      <Card style={[styles.row, { gap: 10 }]}>
        <Text style={{ fontSize: 30 }}>🧰</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Haftalık sandıklar</Text>
          <Text style={styles.dim}>{readyChests ? `${readyChests} sandık alınmayı bekliyor` : 'Yeni sandık için tayfanın katkı puanını artır'}</Text>
        </View>
        <Pressable style={[styles.small, { backgroundColor: colors.primary }]} onPress={() => router.push(KABILE_ROUTES.merkez)}>
          <Text style={styles.smallText}>Aç</Text>
        </Pressable>
      </Card>
      <Pressable style={[styles.roomCard, { backgroundColor: colors.card }, lift]} onPress={() => router.push(`/oda/${roomId}`)}>
        <Text style={{ fontSize: 22 }}>🎙️</Text>
        <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>Tayfa odasına git</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
      </Pressable>
    </>
  );
}

function CoupleTab() {
  const { colors, semantic, dark } = useTheme();
  const styles = useStyles();
  const top = KABILE_COUPLES[0];
  return (
    <>
      {/* Brand card: teal-to-pink in both schemes, so its type stays white. */}
      {top && (
        <ThemeScope scheme="dark">
        <LinearGradient colors={['#076A70', '#BE185D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 16, gap: 10 }}>
          <Text style={[styles.title, { textAlign: 'center', color: '#fff' }]}>💞 En Uyumlu İkili</Text>
          <View style={styles.row}>
            <Avatar uri={userById(top.a).avatar} size={48} />
            <View style={{ marginLeft: -16 }}>
              <Avatar uri={userById(top.b).avatar} size={48} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>
                {userById(top.a).name} & {userById(top.b).name}
              </Text>
              <Text style={[styles.dim, { color: '#A3B1CF' }]}>İkili · Lv.{top.level}</Text>
            </View>
            <Text style={{ color: '#F9A8D4', fontWeight: '900', fontSize: 16 }}>{fmtK(top.score)} ❤</Text>
          </View>
        </LinearGradient>
        </ThemeScope>
      )}
      <Card style={{ gap: 6 }}>
        {KABILE_COUPLES.slice(1, 4).map((c, i) => (
          <View key={`${c.a}-${c.b}`} style={styles.row}>
            <Text style={styles.rank}>{i + 2}</Text>
            <Avatar uri={userById(c.a).avatar} size={30} />
            <View style={{ marginLeft: -12 }}>
              <Avatar uri={userById(c.b).avatar} size={30} />
            </View>
            <Text style={{ color: colors.text, flex: 1 }}>
              {userById(c.a).name} & {userById(c.b).name}
            </Text>
            <Text style={{ color: dark ? '#F9A8D4' : semantic.socialText, fontWeight: '700' }}>{fmtK(c.score)} ❤</Text>
          </View>
        ))}
        <Text style={styles.dim}>Dostlar aynı tayfadaysa tayfa avantajlarından da yararlanır.</Text>
      </Card>
      <GradientButton title="Uyum Köşesi" icon="heart" onPress={() => router.push(KABILE_ROUTES.iliski)} />
    </>
  );
}

function ThemeTab({ themeId, onPick, level, canManage }: { themeId: string; onPick: (id: string) => void; level: number; canManage: boolean }) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.title}>Tayfa teması</Text>
      <Text style={styles.dim}>{canManage ? 'Tema tayfa profilinin üst kısmında herkes için görünür.' : 'Temayı yalnızca lider ve yardımcılar değiştirebilir.'}</Text>
      <View style={styles.themeGrid}>
        {KABILE_THEMES.map((t) => {
          const locked = level < t.minLevel;
          const active = t.id === themeId;
          return (
            <Pressable
              key={t.id}
              style={[styles.themeItem, active && { borderColor: colors.gold }]}
              onPress={() => {
                if (locked) return showAlert('Kilitli tema', `${t.name} Lv.${t.minLevel} tayfalarda açılır.`);
                if (!canManage) return showAlert('Yetki yok', 'Temayı yalnızca lider ve yardımcılar değiştirebilir.');
                onPick(t.id);
              }}
              accessibilityLabel={t.name}>
              <LinearGradient colors={t.colors} style={styles.themeSwatch}>
                {locked && <Ionicons name="lock-closed" size={18} color="#fff" />}
                {active && <Ionicons name="checkmark-circle" size={20} color={semantic.money} />}
              </LinearGradient>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{t.name}</Text>
              <Text style={styles.dim}>{locked ? `Lv.${t.minLevel}` : active ? 'Kullanılıyor' : 'Açık'}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.dim}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{value}</Text>
    </View>
  );
}

function InfoSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  // Android modals draw edge to edge: keep the sheet's end above the navigation bar.
  const paddingBottom = Math.max(34, useSafeAreaInsets().bottom + 8);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom }]}>
        <View style={[styles.row, { marginBottom: 10 }]}>
          <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 18 },
  // Only on the theme header, which is dark in both schemes.
  big: { color: '#fff', fontWeight: '800', fontSize: 22, flexShrink: 1 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rank: { color: colors.textDim, fontWeight: '800', width: 18 },
  join: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
  bar: { width: '100%', height: 8, backgroundColor: colors.cardAlt, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 8, backgroundColor: semantic.money },
  small: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  smallText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 },
  th: { color: colors.textDim, fontWeight: '800', fontSize: 12 },
  td: { color: colors.text, fontSize: 12 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  topBtn: { height: 36, minWidth: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 86, height: 86, borderRadius: 16, borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  badgeChip: { color: '#fff', fontSize: 12, fontWeight: '800', backgroundColor: '#16A34A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  powerChip: { color: '#fff', fontSize: 12, fontWeight: '800', backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  more: { width: 36, height: 36, borderRadius: 18, marginLeft: -6, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  levelCard: { marginTop: 16, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  tier: { color: '#fff', fontSize: 24, fontWeight: '900', fontStyle: 'italic' },
  lvChip: { color: '#fff', fontSize: 12, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  body: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -8, padding: 16, gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tag: {
    color: dark ? '#E9D5FF' : semantic.tonalText,
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: dark ? 'rgba(19,217,223,0.22)' : 'rgba(0,140,148,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  cards: { flexDirection: 'row', gap: 8, marginTop: 14 },
  miniCard: { flex: 1, borderRadius: 14, padding: 10, gap: 6, minHeight: 96 },
  miniTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  // On the colored mini cards: the bright gold fill color, in both schemes.
  miniChip: { color: semantic.money, fontSize: 12, fontWeight: '800' },
  tabs: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { alignItems: 'center', paddingBottom: 8, minWidth: 50 },
  tabText: { color: colors.textDim, fontSize: 16, fontWeight: '700' },
  tabLine: { width: 22, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 4 },
  chip: { marginTop: -8, fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: '#16A34A', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', maxWidth: 66 },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10 },
  roleBadge: { color: colors.gold, fontSize: 11, fontWeight: '800', backgroundColor: 'rgba(246,189,96,0.18)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  goBtn: { backgroundColor: '#0FB8BE', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: dark ? 'rgba(8,15,30,0.92)' : 'rgba(243,246,251,0.94)',
    ...(dark ? {} : { boxShadow: '0 -1px 0 rgba(11,26,46,0.06), 0 -6px 16px rgba(16,36,64,0.05)' }),
  },
  bottomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 13 },
  bottomText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeItem: { width: '30%', flexGrow: 1, alignItems: 'center', gap: 4, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', padding: 6, backgroundColor: colors.cardAlt },
  themeSwatch: { width: '100%', height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, maxHeight: '80%' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48%', flexGrow: 1, backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, gap: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 },
  chartBar: { width: '70%', backgroundColor: colors.primary, borderRadius: 4 },
}));
