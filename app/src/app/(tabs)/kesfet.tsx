import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VerifiedBadge, VipBadge } from '@/components/ui';
import { roomById, USERS, userById, type User } from '@/data/mock';
import { COUNTRIES, DISCOVER_PROMO, DISCOVER_SHORTCUTS, EXTRA_BIOS, PARTY_AVATAR_IDS, REAL_PERSON, countryOf, preciseKm } from '@/data/social-ui';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const TABS = ['Senin için', 'Yakındaki'] as const;
type Tab = (typeof TABS)[number];
type Gender = 'Hepsi' | 'Kadın' | 'Erkek';
type Filters = { country: string; gender: Gender; onlineOnly: boolean; newest: boolean };
type Row = { kind: 'user'; user: User } | { kind: 'promo' };

const DEFAULT_FILTERS: Filters = { country: 'ALL', gender: 'Hepsi', onlineOnly: false, newest: false };
const isDefault = (f: Filters) => f.country === 'ALL' && f.gender === 'Hepsi' && !f.onlineOnly && !f.newest;

export default function DiscoverScreen() {
  const [tab, setTab] = useState<Tab>('Senin için');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [greeted, setGreeted] = useState<Set<string>>(new Set());
  const { blocked, settings, setSetting, sendMessage, bump, following, toggleFollow } = useApp();
  // Nearby discovery only with the user's opt-in; blocked users never show up (spec §8.3, PRIV-01).
  const needsOptIn = tab === 'Yakındaki' && !settings.cityDiscovery;
  const showDistance = tab === 'Yakındaki' || settings.cityDiscovery;

  let users =
    tab === 'Yakındaki'
      ? USERS.filter((u) => u.distanceKm < 20).sort((a, b) => a.distanceKm - b.distanceKm)
      : [...USERS].sort((a, b) => Number(b.online) - Number(a.online));
  if (filters.newest) users = [...users].reverse();
  users = users.filter(
    (u) =>
      !blocked.has(u.id) &&
      (filters.gender === 'Hepsi' || u.gender === filters.gender) &&
      (!filters.onlineOnly || u.online) &&
      (filters.country === 'ALL' || countryOf(u) === filters.country),
  );

  const rows: Row[] = needsOptIn ? [] : users.map((user) => ({ kind: 'user', user }));
  if (rows.length > 0) rows.splice(Math.min(DISCOVER_PROMO.afterIndex, rows.length), 0, { kind: 'promo' });

  const greet = (user: User) => {
    if (greeted.has(user.id)) return router.push(`/sohbet/${user.id}`);
    // A greeting is a free icebreaker; follow-up DMs follow the paid-DM rule in the chat screen.
    sendMessage(user.id, 'Selam! 👋');
    bump('greetings');
    setGreeted((prev) => new Set(prev).add(user.id));
  };

  const country = COUNTRIES.find((c) => c.code === filters.country) ?? COUNTRIES[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'promo' ? 'promo' : r.user.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts}>
              {DISCOVER_SHORTCUTS.map((s) => (
                <Pressable key={s.id} onPress={() => router.push(s.href)}>
                  <LinearGradient colors={s.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.shortcut, s.wide && styles.shortcutWide]}>
                    <ShortcutArt id={s.id} emoji={s.emoji} />
                    <Text style={[styles.shortcutTitle, !s.wide && { textAlign: 'center' }]} numberOfLines={1}>
                      {s.title}
                    </Text>
                    {s.wide && <Text style={styles.shortcutSub}>{s.subtitle}</Text>}
                  </LinearGradient>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.tabsRow}>
              {TABS.map((t) => (
                <Pressable key={t} onPress={() => setTab(t)} style={{ alignItems: 'center' }}>
                  <Text style={[styles.tab, t === tab && styles.tabActive]}>{t}</Text>
                  {t === tab && <View style={styles.underline} />}
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <Pressable style={styles.iconBtn} onPress={() => router.push('/siralama')} hitSlop={6} accessibilityLabel="Sıralama">
                <Ionicons name="trophy-outline" size={24} color="#fff" />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => setFilterOpen(true)} hitSlop={6} accessibilityLabel="Ülke ve filtreler">
                <Text style={{ fontSize: 24 }}>🌍</Text>
                {!isDefault(filters) && <View style={styles.filterDot} />}
              </Pressable>
            </View>

            {!isDefault(filters) && (
              <View style={styles.activeFilters}>
                <Text style={styles.activeText} numberOfLines={1}>
                  {country.flag} {country.name}
                  {filters.gender !== 'Hepsi' ? ` · ${filters.gender}` : ''}
                  {filters.onlineOnly ? ' · Çevrimiçi' : ''}
                  {filters.newest ? ' · Yeni üyeler' : ''}
                </Text>
                <Pressable onPress={() => setFilters(DEFAULT_FILTERS)} hitSlop={8}>
                  <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 12 }}>Temizle</Text>
                </Pressable>
              </View>
            )}

            {tab === 'Yakındaki' && settings.cityDiscovery && (
              <View style={styles.cityRow}>
                <Ionicons name="location" size={13} color={colors.green} />
                <Text style={styles.cityText}>Şehir bazlı keşif açık · kesin konumun paylaşılmaz</Text>
                <Pressable onPress={() => setSetting('cityDiscovery', false)} hitSlop={8}>
                  <Text style={{ color: colors.textDim, fontWeight: '700', fontSize: 12 }}>Kapat</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          needsOptIn ? (
            <View style={styles.optIn}>
              <Text style={{ fontSize: 40 }}>📍</Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' }}>Yakındakileri görmek için şehir bazlı keşfi aç</Text>
              <Text style={{ color: colors.textDim, textAlign: 'center', fontSize: 13 }}>
                Kesin konumun paylaşılmaz; sadece şehrin kullanılır. Ayarlardan istediğin zaman kapatabilirsin.
              </Text>
              <Pressable style={styles.optInBtn} onPress={() => setSetting('cityDiscovery', true)}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Şehir bazlı keşfi aç</Text>
              </Pressable>
              <Pressable onPress={() => setTab('Senin için')}>
                <Text style={{ color: colors.textDim }}>Şimdilik herkesi göster</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.optIn}>
              <Text style={{ fontSize: 36 }}>🔍</Text>
              <Text style={{ color: colors.textDim, textAlign: 'center' }}>Bu filtrelerle şu an kimse yok. Filtreleri değiştirmeyi dene.</Text>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === 'promo' ? (
            <PromoCard />
          ) : (
            <UserRow
              user={item.user}
              showDistance={showDistance}
              greeted={greeted.has(item.user.id)}
              onGreet={() => greet(item.user)}
              isFollowing={following.has(item.user.id)}
              onToggleFollow={() => toggleFollow(item.user.id)}
            />
          )
        }
      />

      <FilterSheet visible={filterOpen} filters={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />
    </SafeAreaView>
  );
}

function ShortcutArt({ id, emoji }: { id: string; emoji: string }) {
  if (id === 'call')
    return (
      <View style={styles.artRow}>
        <Ionicons name="mic" size={26} color="rgba(255,255,255,0.9)" />
        <Ionicons name="heart" size={22} color="#F87171" />
        <Ionicons name="videocam" size={26} color="rgba(255,255,255,0.9)" />
      </View>
    );
  if (id === 'party')
    return (
      <View style={styles.artCenter}>
        <Ionicons name="stats-chart" size={12} color="#fff" style={{ position: 'absolute', left: 0, top: 0 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {PARTY_AVATAR_IDS.map((uid, i) => (
            <Image
              key={uid}
              source={{ uri: userById(uid).avatar }}
              style={[styles.partyAvatar, i === 1 && styles.partyAvatarMid, i > 0 && { marginLeft: -10 }]}
            />
          ))}
        </View>
      </View>
    );
  if (id === 'free')
    return (
      <View style={styles.artCenter}>
        <View style={styles.starCircle}>
          <Ionicons name="star" size={20} color={colors.primaryText} />
        </View>
      </View>
    );
  return (
    <View style={styles.artCenter}>
      <Text style={{ fontSize: 34 }}>{emoji}</Text>
    </View>
  );
}

function UserRow({
  user,
  showDistance,
  greeted,
  onGreet,
  isFollowing,
  onToggleFollow,
}: {
  user: User;
  showDistance: boolean;
  greeted: boolean;
  onGreet: () => void;
  isFollowing: boolean;
  onToggleFollow: () => void;
}) {
  const female = user.gender === 'Kadın';
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]} onPress={() => router.push(`/kullanici/${user.id}`)}>
      <View>
        <Image source={{ uri: user.avatar }} style={styles.photo} />
        {user.online && <View style={styles.onlineDot} />}
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          {REAL_PERSON.has(user.id) ? (
            <View style={styles.realBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.green} />
              <Text style={styles.realText}>Gerçek</Text>
            </View>
          ) : (
            user.verified && <VerifiedBadge size={16} />
          )}
          {user.vip && <VipBadge />}
        </View>
        <View style={styles.chips}>
          {showDistance && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{preciseKm(user)}</Text>
            </View>
          )}
          <View style={styles.chip}>
            <Text style={[styles.chipText, { color: female ? colors.pink : '#38BDF8' }]}>{female ? '♀' : '♂'}</Text>
            <Text style={styles.chipText}>{user.age}</Text>
          </View>
        </View>
        <Text style={styles.bio} numberOfLines={1}>
          {EXTRA_BIOS[user.id] ?? user.bio}
        </Text>
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Pressable onPress={onGreet} hitSlop={6}>
          <LinearGradient colors={greeted ? [colors.cardAlt, colors.cardAlt] : [semantic.socialFill, '#A82F42']} style={styles.hiBtn}>
            {greeted ? (
              <>
                <Ionicons name="chatbubble-ellipses" size={13} color="#fff" />
                <Text style={styles.hiText}>Sohbet</Text>
              </>
            ) : (
              <Text style={styles.hiText}>Hi ❤</Text>
            )}
          </LinearGradient>
        </Pressable>
        <Pressable onPress={onToggleFollow} hitSlop={6} style={styles.followBtn}>
          <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={14} color={isFollowing ? colors.pink : colors.textDim} />
          <Text style={[styles.followText, isFollowing && { color: colors.pink }]}>{isFollowing ? 'Takipte' : 'Takip et'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function PromoCard() {
  const room = roomById(DISCOVER_PROMO.roomId);
  return (
    <Pressable style={styles.promoWrap} onPress={() => router.push(`/oda/${room.id}`)}>
      <LinearGradient colors={['rgba(255,101,118,0.22)', 'rgba(19,217,223,0.22)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
        <View style={styles.promoTop}>
          <Image source={{ uri: room.cover }} style={styles.promoCover} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.promoTitle} numberOfLines={1}>
              👑 {room.title} 👑
            </Text>
            <Text style={styles.promoSub}>{DISCOVER_PROMO.waiting} kişi seni bekliyor</Text>
          </View>
          <View style={styles.goBtn}>
            <Text style={styles.goText}>GİT</Text>
          </View>
        </View>
        <View style={styles.promoAvatars}>
          {DISCOVER_PROMO.avatarIds.map((id) => (
            <Image key={id} source={{ uri: userById(id).avatar }} style={styles.promoAvatar} />
          ))}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function FilterSheet({
  visible,
  filters,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Filtreler</Text>

        <Text style={styles.sheetLabel}>Ülke</Text>
        <View style={styles.optionWrap}>
          {COUNTRIES.map((c) => (
            <Pressable key={c.code} onPress={() => set('country', c.code)} style={[styles.option, filters.country === c.code && styles.optionActive]}>
              <Text style={[styles.optionText, filters.country === c.code && { color: '#fff' }]}>
                {c.flag} {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sheetLabel}>Cinsiyet</Text>
        <View style={styles.optionWrap}>
          {(['Hepsi', 'Kadın', 'Erkek'] as const).map((g) => (
            <Pressable key={g} onPress={() => set('gender', g)} style={[styles.option, filters.gender === g && styles.optionActive]}>
              <Text style={[styles.optionText, filters.gender === g && { color: '#fff' }]}>{g}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Sadece çevrimiçi</Text>
          <Switch value={filters.onlineOnly} onValueChange={(v) => set('onlineOnly', v)} trackColor={{ true: colors.primary, false: colors.cardAlt }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Yeni üyeler önce</Text>
          <Switch value={filters.newest} onValueChange={(v) => set('newest', v)} trackColor={{ true: colors.primary, false: colors.cardAlt }} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Pressable style={[styles.sheetBtn, { backgroundColor: colors.cardAlt }]} onPress={() => onChange(DEFAULT_FILTERS)}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Sıfırla</Text>
          </Pressable>
          <Pressable style={[styles.sheetBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Tamam</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shortcuts: { gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  shortcut: { width: 92, height: 104, borderRadius: 16, padding: 10, overflow: 'hidden', justifyContent: 'flex-end', gap: 2 },
  shortcutWide: { width: 138 },
  shortcutTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  shortcutSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  artRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  artCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  partyAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff', backgroundColor: colors.cardAlt },
  partyAvatarMid: { width: 34, height: 34, borderRadius: 17, zIndex: 1 },
  starCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  tab: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  tabActive: { color: '#fff', fontSize: 19, fontWeight: '800' },
  underline: { height: 3, borderRadius: 2, backgroundColor: colors.primary, marginTop: 4, width: 20 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  filterDot: { position: 'absolute', top: 2, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  activeFilters: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  activeText: { flex: 1, color: '#fff', fontSize: 12 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 4 },
  cityText: { flex: 1, color: colors.textDim, fontSize: 12 },
  optIn: { alignItems: 'center', gap: 10, padding: 24, marginTop: 20 },
  optInBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  photo: { width: 92, height: 92, borderRadius: 16, backgroundColor: colors.cardAlt },
  onlineDot: { position: 'absolute', right: 2, bottom: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: semantic.live, borderWidth: 2, borderColor: colors.bg },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  name: { color: '#fff', fontWeight: '800', fontSize: 17, maxWidth: 140 },
  realBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(34,197,94,0.14)', borderRadius: 6, paddingLeft: 2, paddingRight: 6, paddingVertical: 1 },
  realText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { color: '#fff', fontSize: 12 },
  bio: { color: colors.textDim, fontSize: 13 },
  hiBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 74, justifyContent: 'center' },
  hiText: { color: '#fff', fontWeight: '900', fontSize: 13, fontStyle: 'italic' },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  followText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  promoWrap: { marginHorizontal: 16, marginVertical: 10 },
  promo: { borderRadius: 20, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  promoTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  promoCover: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.cardAlt },
  promoTitle: { color: colors.gold, fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  promoSub: { color: colors.pink, fontSize: 15, fontWeight: '600' },
  promoAvatars: { flexDirection: 'row', justifyContent: 'space-between' },
  promoAvatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: colors.pink, backgroundColor: colors.cardAlt },
  goBtn: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 7 },
  goText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, gap: 10 },
  sheetTitle: { color: '#fff', fontWeight: '800', fontSize: 17, textAlign: 'center' },
  sheetLabel: { color: colors.textDim, fontWeight: '700', fontSize: 12, marginTop: 4 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  optionActive: { borderColor: colors.primaryText, backgroundColor: 'rgba(19,217,223,0.18)' },
  optionText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchText: { color: '#fff', fontSize: 14 },
  sheetBtn: { flex: 1, alignItems: 'center', borderRadius: 999, paddingVertical: 12 },
});
