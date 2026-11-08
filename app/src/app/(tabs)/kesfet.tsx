import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art } from '@/components/Art';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { Button, CharmBadge, StateIcon, VerifiedBadge, VipBadge } from '@/components/ui';
import { roomById, USERS, userById, type User } from '@/data/mock';
import { COUNTRIES, DISCOVER_PROMO, DISCOVER_SHORTCUTS, EXTRA_BIOS, PARTY_AVATAR_IDS, REAL_PERSON, countryOf, preciseKm } from '@/data/social-ui';
import { charmRankBoost } from '@/data/charm';
import { wealthCharmOf } from '@/data/profile';
import { useGreet } from '@/components/use-greet';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { EmojiIcon } from '@/components/Icon3D';
import { SimilarityChip } from '@/components/similarity';
import { similarity } from '@/lib/similarity';
import { Photo } from '@/components/photo';
import { callsAvailable, liveMode, reloadDiscoverPeople, useDiscoverPeople, useDiscoverState } from '@/lib/live';
import type { DiscoverList } from '@/lib/api';

const TABS = ['Ana Sayfa', 'Yakındakiler', 'Öne çıkanlar', 'Çevrim içi', 'Yeni kullanıcılar'] as const;
type Tab = (typeof TABS)[number];
/** The server list each tab reads in a live build (Yakındakiler and Çevrim içi narrow Ana Sayfa's). */
const LIST_OF: Record<Tab, DiscoverList> = { 'Ana Sayfa': 'home', Yakındakiler: 'home', 'Çevrim içi': 'home', 'Öne çıkanlar': 'featured', 'Yeni kullanıcılar': 'new' };
type Filters = { country: string };
type Row = { kind: 'user'; user: User } | { kind: 'promo' };

const DEFAULT_FILTERS: Filters = { country: 'ALL' };
const isDefault = (f: Filters) => f.country === 'ALL';
/** Men see women and women see men; anyone, while either of the two hasn't given a gender. */
const matches = (me: User, u: User) => !me.gender || !u.gender || me.gender !== u.gender;
const byOnlineThenCharm = (a: User, b: User) => Number(b.online) - Number(a.online) || charmRankBoost(wealthCharmOf(b.id).charm) - charmRankBoost(wealthCharmOf(a.id).charm);

export default function DiscoverScreen() {
  const [tab, setTab] = useState<Tab>('Ana Sayfa');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const { hasGreeted, greet } = useGreet();
  const { blocked, settings, setSetting, following, toggleFollow, me } = useApp();
  // A live build lists real people from the server (no sample profiles, no distances: the server knows cities only).
  const live = liveMode();
  const list = LIST_OF[tab];
  const serverPeople = useDiscoverPeople(list);
  const peopleState = useDiscoverState(list);
  const pool = live ? (serverPeople ?? []) : USERS;
  const { colors, dark } = useTheme();
  const styles = useStyles();
  // Nearby discovery only with the user's opt-in; blocked users never show up (spec §8.3, PRIV-01).
  const needsOptIn = tab === 'Yakındakiler' && !settings.cityDiscovery;
  const showDistance = !live && (tab === 'Yakındakiler' || settings.cityDiscovery);

  const base = pool.filter((u) => !blocked.has(u.id) && matches(me, u) && (filters.country === 'ALL' || countryOf(u) === filters.country));
  // The server orders its lists (new accounts, who 1v1 lifts); the demo orders its sample people the same way here.
  const users =
    tab === 'Yakındakiler'
      ? live
        ? base.filter((u) => !!me.city && u.city.toLocaleLowerCase('tr-TR') === me.city.toLocaleLowerCase('tr-TR'))
        : base.filter((u) => u.distanceKm < 20).sort((a, b) => a.distanceKm - b.distanceKm)
      : tab === 'Çevrim içi'
        ? base.filter((u) => u.online)
        : tab === 'Yeni kullanıcılar'
          ? live
            ? base
            : [...base].sort((a, b) => (b.joinedAt ?? '').localeCompare(a.joinedAt ?? ''))
          : tab === 'Öne çıkanlar'
            ? live
              ? base
              : // A woman sees the men who spend most, a man the women who earn most (Yankı stands in for 1v1 here).
                [...base].sort((a, b) => (me.gender === 'Kadın' ? wealthCharmOf(b.id).wealth - wealthCharmOf(a.id).wealth : wealthCharmOf(b.id).charm - wealthCharmOf(a.id).charm))
            : // Online first, then Yankı level: charm is what lifts a profile in discovery.
              live
              ? base
              : [...base].sort(byOnlineThenCharm);

  const rows: Row[] = needsOptIn ? [] : users.map((user) => ({ kind: 'user', user }));
  if (rows.length > 0 && !live) rows.splice(Math.min(DISCOVER_PROMO.afterIndex, rows.length), 0, { kind: 'promo' });

  const country = COUNTRIES.find((c) => c.code === filters.country) ?? COUNTRIES[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Backdrop scene={SCENES.discover} />
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'promo' ? 'promo' : r.user.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts}>
              {/* Aile (groups) is local-only: a live build doesn't offer it until the server has it. */}
              {DISCOVER_SHORTCUTS.filter((s) => (s.id !== 'call' || callsAvailable()) && (s.id !== 'tribe' || !live)).map((s) => (
                <Pressable key={s.id} onPress={() => router.push(s.href)}>
                  {/* The shortcut's color lights a navy card from the top instead of filling it. */}
                  <LinearGradient colors={[`${s.colors[1]}${dark ? '5C' : '33'}`, dark ? 'rgba(22,37,60,0.94)' : 'rgba(255,255,255,0.94)']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.shortcut, s.wide && styles.shortcutWide]}>
                    <ShortcutArt id={s.id} emoji={s.emoji} />
                    <Text style={[styles.shortcutTitle, !s.wide && { textAlign: 'center' }]} numberOfLines={s.wide ? 1 : 2}>
                      {s.title}
                    </Text>
                    {s.wide && <Text style={styles.shortcutSub}>{s.subtitle}</Text>}
                  </LinearGradient>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.tabsRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.tabs}>
                {TABS.map((t) => (
                  <Pressable key={t} onPress={() => setTab(t)} style={{ alignItems: 'center' }} accessibilityRole="tab" accessibilityState={{ selected: t === tab }}>
                    <Text style={[styles.tab, t === tab && styles.tabActive]}>{t}</Text>
                    {t === tab && <View style={styles.underline} />}
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={styles.iconBtn} onPress={() => router.push('/siralama')} hitSlop={6} accessibilityLabel="Sıralama">
                <Ionicons name="trophy-outline" size={24} color={colors.text} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => setFilterOpen(true)} hitSlop={6} accessibilityLabel="Ülke seç">
                <Ionicons name="globe-outline" size={24} color={colors.text} />
                {!isDefault(filters) && <View style={styles.filterDot} />}
              </Pressable>
            </View>

            {!isDefault(filters) && (
              <View style={styles.activeFilters}>
                <Text style={styles.activeText} numberOfLines={1}>
                  {country.flag} {country.name}
                </Text>
                <Pressable onPress={() => setFilters(DEFAULT_FILTERS)} hitSlop={8}>
                  <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 12 }}>Temizle</Text>
                </Pressable>
              </View>
            )}

            {tab === 'Yakındakiler' && settings.cityDiscovery && (
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
              <StateIcon name="location-outline" tone="social" />
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>Yakındakileri görmek için şehir bazlı keşfi aç</Text>
              <Text style={{ color: colors.textDim, textAlign: 'center', fontSize: 13 }}>
                Kesin konumun paylaşılmaz; sadece şehrin kullanılır. Ayarlardan istediğin zaman kapatabilirsin.
              </Text>
              <Pressable style={styles.optInBtn} onPress={() => setSetting('cityDiscovery', true)}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Şehir bazlı keşfi aç</Text>
              </Pressable>
              <Pressable onPress={() => setTab('Ana Sayfa')}>
                <Text style={{ color: colors.textDim }}>Şimdilik herkesi göster</Text>
              </Pressable>
            </View>
          ) : live && serverPeople === null && peopleState === 'failed' ? (
            <View style={styles.optIn}>
              <StateIcon name="cloud-offline-outline" size={56} />
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>Bağlantı kurulamadı</Text>
              <Text style={{ color: colors.textDim, textAlign: 'center', fontSize: 13 }}>Kişiler şu an yüklenemedi. İnternetini kontrol edip tekrar dene.</Text>
              <Button title="Tekrar dene" icon="refresh" small variant="tonal" onPress={() => void reloadDiscoverPeople(list)} />
            </View>
          ) : (
            <View style={styles.optIn}>
              <StateIcon name="search-outline" size={56} />
              <Text style={{ color: colors.textDim, textAlign: 'center' }}>
                {live && serverPeople === null
                  ? 'Kişiler yükleniyor…'
                  : live && tab === 'Yakındakiler' && !me.city
                    ? 'Yakındakileri görmek için profiline şehrini ekle.'
                    : tab === 'Çevrim içi'
                      ? 'Şu an çevrim içi kimse yok. Biraz sonra tekrar bak.'
                      : tab === 'Öne çıkanlar'
                        ? 'Şu an öne çıkan kimse yok. Birebir sohbetler arttıkça burası dolacak.'
                        : isDefault(filters)
                          ? 'Şu an burada kimse yok. Biraz sonra tekrar bak.'
                          : 'Bu ülkede şu an kimse yok. Başka bir ülke seçmeyi dene.'}
              </Text>
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
              greeted={hasGreeted(item.user.id)}
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
  const { colors, ink } = useTheme();
  const styles = useStyles();
  if (id === 'call')
    return (
      <View style={styles.artRow}>
        <Ionicons name="mic" size={26} color={ink(0.9)} />
        <Ionicons name="heart" size={22} color="#F87171" />
        <Ionicons name="videocam" size={26} color={ink(0.9)} />
      </View>
    );
  if (id === 'party')
    return (
      <View style={styles.artCenter}>
        <Ionicons name="stats-chart" size={12} color={colors.text} style={{ position: 'absolute', left: 0, top: 0 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* No photo: the person glyph, like every other face in the app (never an empty ring). */}
          {PARTY_AVATAR_IDS.map((uid, i) => (
            <Photo key={uid} uri={userById(uid).avatar} kind="face" style={[styles.partyAvatar, i === 1 && styles.partyAvatarMid, i > 0 && { marginLeft: -10 }]} />
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
      <EmojiIcon emoji={emoji} size={34} />
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
  const { me } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const sim = similarity(me, user);
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]} onPress={() => router.push(`/kullanici/${user.id}`)}>
      <View>
        <Photo uri={user.avatar} kind="face" style={styles.photo} />
        {user.online && <View style={styles.onlineDot} />}
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          {REAL_PERSON.has(user.id) ? (
            <View accessibilityLabel="Gerçek kişi, doğrulandı">
              <Ionicons name="checkmark-circle" size={16} color={colors.green} />
            </View>
          ) : (
            user.verified && <VerifiedBadge size={16} />
          )}
          {user.vip && <VipBadge />}
          <CharmBadge level={wealthCharmOf(user.id).charm} />
        </View>
        <View style={styles.chips}>
          {showDistance && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{preciseKm(user)}</Text>
            </View>
          )}
          {/* An age or gender the person didn't give stays out (never "0", never a guessed icon). */}
          {(!!user.gender || user.age > 0) && (
            <View style={styles.chip}>
              {!!user.gender && <Art name={female ? 'cinsiyet-kadin' : 'cinsiyet-erkek'} size={15} />}
              {user.age > 0 && <Text style={styles.chipText}>{user.age}</Text>}
            </View>
          )}
          <SimilarityChip score={sim.score} />
        </View>
        <Text style={styles.bio} numberOfLines={1}>
          {EXTRA_BIOS[user.id] ?? user.bio}
        </Text>
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Pressable onPress={onGreet} hitSlop={6}>
          <View style={[styles.hiBtn, { backgroundColor: greeted ? colors.cardAlt : semantic.socialFill }]} accessibilityRole="button" accessibilityLabel={greeted ? `${user.name} ile sohbet` : `${user.name} kişisine selam ver`}>
            <Ionicons name={greeted ? 'chatbubble-ellipses' : 'hand-left'} size={13} color={greeted ? colors.text : '#fff'} />
            <Text style={[styles.hiText, greeted && { color: colors.text }]}>{greeted ? 'Sohbet' : 'Selam'}</Text>
          </View>
        </Pressable>
        <Pressable onPress={onToggleFollow} hitSlop={6} style={styles.followBtn}>
          <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={14} color={isFollowing ? colors.pink : colors.text} />
          <Text style={[styles.followText, isFollowing && { color: colors.pink }]}>{isFollowing ? 'Takipte' : 'Takip et'}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function PromoCard() {
  const room = roomById(DISCOVER_PROMO.roomId);
  const styles = useStyles();
  return (
    <Pressable style={styles.promoWrap} onPress={() => router.push(`/oda/${room.id}`)}>
      <LinearGradient colors={['rgba(255,101,118,0.22)', 'rgba(19,217,223,0.22)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
        <View style={styles.promoTop}>
          <Photo uri={room.cover} kind="cover" seed={room.id} style={styles.promoCover} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.promoTitle} numberOfLines={1}>
              {room.title}
            </Text>
            <Text style={styles.promoSub}>{DISCOVER_PROMO.waiting} kişi seni bekliyor</Text>
          </View>
          <View style={styles.goBtn}>
            <Text style={styles.goText}>GİT</Text>
          </View>
        </View>
        <View style={styles.promoAvatars}>
          {DISCOVER_PROMO.avatarIds.map((id) => (
            <Photo key={id} uri={userById(id).avatar} kind="face" style={styles.promoAvatar} />
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
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {/* Above the system navigation bar too (edge-to-edge Android draws the sheet under it). */}
      <View style={[styles.sheet, { paddingBottom: Math.max(34, insets.bottom + 8) }]}>
        <Text style={styles.sheetTitle}>Dünya</Text>

        <Text style={styles.sheetLabel}>Hangi ülkeden kişiler görünsün?</Text>
        <View style={styles.optionWrap}>
          {COUNTRIES.map((c) => (
            <Pressable key={c.code} onPress={() => set('country', c.code)} style={[styles.option, filters.country === c.code && styles.optionActive]}>
              <Text style={[styles.optionText, filters.country === c.code && { color: colors.text }]}>
                {c.flag} {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Pressable style={[styles.sheetBtn, { backgroundColor: colors.cardAlt }]} onPress={() => onChange(DEFAULT_FILTERS)}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Sıfırla</Text>
          </Pressable>
          <Pressable style={[styles.sheetBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Tamam</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, semantic, surface, lift, ink, dark }) => ({
  shortcuts: { gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  shortcut: { width: 92, height: 104, borderRadius: 16, padding: 10, overflow: 'hidden', justifyContent: 'flex-end', gap: 2, borderWidth: 1, borderColor: surface.hairline, ...(dark ? {} : { boxShadow: lift.boxShadow }) },
  shortcutWide: { width: 150 },
  // Two lines for the narrow cards, so "Canlı Odalar" and "Jeton Kazan" are never cut at 360 px.
  shortcutTitle: { color: colors.text, fontWeight: '800', fontSize: 14, lineHeight: 17 },
  shortcutSub: { color: ink(0.8), fontSize: 12 },
  artRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  artCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  // White rings read on the navy card; on paper a soft shadow keeps the stacked faces apart.
  partyAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff', backgroundColor: colors.cardAlt, ...(dark ? {} : { boxShadow: '0 1px 3px rgba(16,36,64,0.18)' }) },
  partyAvatarMid: { width: 34, height: 34, borderRadius: 17, zIndex: 1 },
  starCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12, paddingTop: 14, paddingBottom: 6 },
  tabs: { gap: 18, paddingHorizontal: 16, alignItems: 'center' },
  tab: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  tabActive: { color: colors.text, fontSize: 19, fontWeight: '800' },
  underline: { height: 3, borderRadius: 2, backgroundColor: colors.primary, marginTop: 4, width: 20 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  filterDot: { position: 'absolute', top: 2, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  activeFilters: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, ...lift },
  activeText: { flex: 1, color: colors.text, fontSize: 12 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 4 },
  cityText: { flex: 1, color: colors.textDim, fontSize: 12 },
  optIn: { alignItems: 'center', gap: 10, padding: 24, marginTop: 20 },
  optInBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  photo: { width: 92, height: 92, borderRadius: 16, backgroundColor: colors.cardAlt },
  onlineDot: { position: 'absolute', right: 2, bottom: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: semantic.live, borderWidth: 2, borderColor: colors.bg },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  name: { color: colors.text, fontWeight: '800', fontSize: 17, maxWidth: 140 },
  chips: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { color: colors.text, fontSize: 12 },
  bio: { color: colors.textDim, fontSize: 13 },
  hiBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minWidth: 76, justifyContent: 'center' },
  hiText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  followText: { color: colors.text, fontSize: 12, fontWeight: '600' },
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
  sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 17, textAlign: 'center' },
  sheetLabel: { color: colors.textDim, fontWeight: '700', fontSize: 12, marginTop: 4 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  optionActive: { borderColor: colors.primaryText, backgroundColor: dark ? 'rgba(19,217,223,0.18)' : 'rgba(0,140,148,0.11)' },
  optionText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  sheetBtn: { flex: 1, alignItems: 'center', borderRadius: 999, paddingVertical: 12 },
}));
