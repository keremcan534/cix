import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art } from '@/components/Art';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { Button, CharmBadge, StateIcon, VerifiedBadge, VipBadge } from '@/components/ui';
import { roomById, USERS, userById, type User } from '@/data/mock';
import { COUNTRIES, DISCOVER_PROMO, DISCOVER_SHORTCUTS, REAL_PERSON, countryOf, preciseKm } from '@/data/social-ui';
import { charmRankBoost } from '@/data/charm';
import { wealthCharmOf } from '@/data/profile';
import { useGreet } from '@/components/use-greet';
import { useApp } from '@/store';
import { SCRIM, fonts, glass, makeStyles, useTheme } from '@/theme';
import { firstName, greetingFor } from '@/lib/greeting';
import { RowSkeleton, Skeletons } from '@/components/fx/skeleton';
import { EmojiIcon, Icon3D } from '@/components/Icon3D';
import { similarity } from '@/lib/similarity';
import { Photo } from '@/components/photo';
import { liveMode, oneOnOneOpen, reloadDiscoverPeople, useDiscoverPeople, useDiscoverState } from '@/lib/live';
import { levelsOf } from '@/lib/live/levels';
import { cityDistanceText, distanceOf } from '@/lib/live/distances';
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
/** Someone's Yankı level: the server's in a live build (lib/live/levels; 0 until sent or when hidden), the demo's offline. */
const charmOf = (u: User) => (liveMode() ? (levelsOf(u.id)?.charm ?? 0) : wealthCharmOf(u.id).charm);
const byOnlineThenCharm = (a: User, b: User) => Number(b.online) - Number(a.online) || charmRankBoost(charmOf(b)) - charmRankBoost(charmOf(a));

export default function DiscoverScreen() {
  const [tab, setTab] = useState<Tab>('Ana Sayfa');
  // The tab strip scrolls: a picked tab slides fully into view instead of staying cut under the trophy.
  const tabStrip = useRef<ComponentRef<typeof ScrollView>>(null);
  const tabAt = useRef(new Map<Tab, { x: number; w: number }>());
  const [stripW, setStripW] = useState(0);
  // More lists past the strip's right edge (Çevrim içi, Yeni kullanıcılar): a soft fade there says it scrolls.
  const [stripX, setStripX] = useState(0);
  const [stripContentW, setStripContentW] = useState(0);
  const moreRight = stripContentW - (stripX + stripW) > 4;
  const pickTab = (t: Tab) => {
    setTab(t);
    const at = tabAt.current.get(t);
    if (at && stripW) tabStrip.current?.scrollTo({ x: Math.max(0, at.x + at.w / 2 - stripW / 2), animated: true });
  };
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const { hasGreeted, greet } = useGreet();
  const { blocked, settings, setSetting, following, toggleFollow, me } = useApp();
  // The hour when the screen opened: the greeting doesn't change under the reader's eyes.
  const [hour] = useState(() => new Date().getHours());
  // A live build lists real people from the server (no sample profiles; distances by city: lib/live/distances).
  const live = liveMode();
  const list = LIST_OF[tab];
  const serverPeople = useDiscoverPeople(list);
  const peopleState = useDiscoverState(list);
  const pool = live ? (serverPeople ?? []) : USERS;
  const { colors } = useTheme();
  const styles = useStyles();
  // Nearby discovery only with the user's opt-in; blocked users never show up (spec §8.3, PRIV-01).
  const needsOptIn = tab === 'Yakındakiler' && !settings.cityDiscovery;
  const showDistance = tab === 'Yakındakiler' || settings.cityDiscovery;

  const base = pool.filter((u) => !blocked.has(u.id) && matches(me, u) && (filters.country === 'ALL' || countryOf(u) === filters.country));
  // The server orders its lists (new accounts, who 1v1 lifts); the demo orders its sample people the same way here.
  const users =
    tab === 'Yakındakiler'
      ? live
        ? // My city: the same text, or what the server reads as one city ('İzmit' and 'Kocaeli', lib/live/distances).
          base.filter((u) => !!me.city && (!!distanceOf(u.id)?.sameCity || u.city.toLocaleLowerCase('tr-TR') === me.city.toLocaleLowerCase('tr-TR')))
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
            : // Online first, then Yankı level: charm is what lifts a profile in discovery (live: the server's levels;
              // equal ones keep the server's most-recently-active order).
              [...base].sort(byOnlineThenCharm);

  const rows: Row[] = needsOptIn ? [] : users.map((user) => ({ kind: 'user', user }));
  if (rows.length > 0 && !live) rows.splice(Math.min(DISCOVER_PROMO.afterIndex, rows.length), 0, { kind: 'promo' });

  const country = COUNTRIES.find((c) => c.code === filters.country) ?? COUNTRIES[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <Backdrop scene={SCENES.discover} />
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'promo' ? 'promo' : r.user.id)}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListHeaderComponent={
          <View>
            {/* A word for the person, by the time of day ("İyi günler, Ayşe"), on a pink glass bar with a waving hand. */}
            <LinearGradient colors={['#FFF6FA', '#FCE3EF', '#F8CFE4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.greetBar}>
              <View style={styles.greetHand}>
                <EmojiIcon emoji="👋" size={20} />
              </View>
              <Text style={styles.greet} accessibilityRole="header" numberOfLines={1}>
                {greetingFor(hour)}
                {firstName(me.name) ? `, ${firstName(me.name)}` : ''}
              </Text>
              <View style={styles.greetHearts} pointerEvents="none">
                <Icon3D name="heart" size={22} />
                <Icon3D name="heart" size={13} style={styles.greetHeartSmall} />
              </View>
            </LinearGradient>
            {/* Four glossy tiles in one row: Hemen Tanış, Canlı Odalar, Aile, Jeton Kazan. */}
            <View style={styles.tiles}>
              {DISCOVER_SHORTCUTS.filter((s) => s.id !== 'call' || oneOnOneOpen()).map((s, _i, all) => (
                <QuickTile key={s.id} id={s.id} title={s.title} subtitle={s.id === 'call' ? s.subtitle : undefined} emoji={s.emoji} colors={s.colors} count={all.length} onPress={() => router.push(s.href)} />
              ))}
            </View>

            {/* The lists on a pink glass bar: the chosen one on its own pill, then Sıralama and the country. */}
            <View style={styles.tabsBar}>
              <View style={{ flex: 1 }}>
                <ScrollView
                  ref={tabStrip}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.tabs}
                  onLayout={(e) => setStripW(e.nativeEvent.layout.width)}
                  onContentSizeChange={(w) => setStripContentW(w)}
                  onScroll={(e) => setStripX(e.nativeEvent.contentOffset.x)}
                  scrollEventThrottle={32}
                >
                  {TABS.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => pickTab(t)}
                      onLayout={(e) => tabAt.current.set(t, { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width })}
                      style={[styles.tabItem, t === tab && styles.tabItemOn]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: t === tab }}
                    >
                      <Text style={[styles.tab, t === tab && styles.tabActive]}>{t}</Text>
                      {t === tab && <View style={styles.underline} />}
                    </Pressable>
                  ))}
                </ScrollView>
                {moreRight && <LinearGradient colors={['rgba(255,240,247,0)', HOME.glass]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tabFade} pointerEvents="none" />}
              </View>
              <View style={styles.tabSep} />
              <Pressable style={styles.iconBtn} onPress={() => router.push('/siralama')} hitSlop={6} accessibilityLabel="Sıralama">
                <Ionicons name="trophy-outline" size={20} color={HOME.plum} />
              </Pressable>
              <View style={styles.tabSep} />
              <Pressable style={styles.iconBtn} onPress={() => setFilterOpen(true)} hitSlop={6} accessibilityLabel="Ülke seç">
                <Ionicons name="globe-outline" size={20} color={HOME.plum} />
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
          ) : live && serverPeople === null && peopleState !== 'failed' ? (
            <Skeletons count={6} gap={6} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <RowSkeleton face={52} />
            </Skeletons>
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

/** The pink glass on this screen (theme glass): deep ink on light glass, in either scheme. */
const HOME = { ink: glass.ink, plum: glass.plum, pink: glass.pink, deep: glass.deep, glass: glass.fill, line: glass.line } as const;

/** A tile's picture: white glyphs for calls and rooms, the 3D tent and coin for Aile and Jeton Kazan. */
function TileArt({ id, emoji, size }: { id: string; emoji: string; size: number }) {
  const styles = useStyles();
  if (id === 'call')
    return (
      <View style={styles.tileArtRow}>
        <Ionicons name="mic" size={size * 0.62} color="#fff" />
        <Ionicons name="videocam" size={size * 0.7} color="#fff" />
      </View>
    );
  if (id === 'party')
    return (
      <View>
        <Ionicons name="people" size={size * 0.85} color="#fff" />
        <Ionicons name="wifi" size={size * 0.38} color="#fff" style={styles.tileWifi} />
      </View>
    );
  if (id === 'free') return <Icon3D name="coin" size={size * 0.95} />;
  return <EmojiIcon emoji={emoji} size={size * 0.82} />;
}

/** One of the four glossy tiles: its colour, a gloss on top, its picture and its name. */
function QuickTile({ id, title, subtitle, emoji, colors: fill, count, onPress }: { id: string; title: string; subtitle?: string; emoji: string; colors: readonly [string, string]; count: number; onPress: () => void }) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const w = Math.floor((Math.min(width, 640) - 32 - (count - 1) * 8) / count);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <LinearGradient colors={fill} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.tile, { width: w, height: Math.round(w * 1.12), boxShadow: `0 6px 16px ${fill[1]}66` }]}>
        <LinearGradient colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']} style={styles.tileGloss} pointerEvents="none" />
        <View style={styles.tileArt}>
          <TileArt id={id} emoji={emoji} size={Math.min(40, w * 0.42)} />
        </View>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle && w >= 88 ? (
          <Text style={styles.tileSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

/** "%75 benzer": a pink ring when it's a good match (its words deep pink: pink this small is too faint), plum below half. */
function MatchChip({ score }: { score: number }) {
  const styles = useStyles();
  const good = score >= 50;
  return (
    <View style={[styles.matchChip, { borderColor: good ? HOME.pink : HOME.plum }]} accessibilityLabel={`Yüzde ${score} benzer`}>
      <Text style={[styles.matchText, { color: good ? HOME.deep : HOME.plum }]}>%{score} benzer</Text>
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
  const { colors } = useTheme();
  const styles = useStyles();
  const sim = similarity(me, user);
  // A live build: the server's levels (none until sent); the demo's are made up from the id.
  const levels = liveMode() ? levelsOf(user.id) : wealthCharmOf(user.id);
  // Live: the server's distance between our two cities ("Aynı şehir", "350 km"; none when a city is unknown or the
  // profile is private); the demo's sample one.
  const distance = !showDistance ? null : liveMode() ? cityDistanceText(distanceOf(user.id)) : preciseKm(user);
  return (
    // A pink glass card (the owner's design): photo, name and level, age and match, then Selam or Sohbet and Takip.
    // No interests here (the client: they're on the profile; the cards stay short, so more people fit on the screen).
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]} onPress={() => router.push(`/kullanici/${user.id}`)}>
      <View>
        <Photo uri={user.avatar} kind="face" style={[styles.photo, user.online && styles.photoOnline]} />
        {user.online && <View style={styles.onlineDot} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
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
          {typeof levels?.charm === 'number' && <CharmBadge level={levels.charm} />}
        </View>
        <View style={styles.chips}>
          {!!distance && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{distance}</Text>
            </View>
          )}
          {/* An age or gender the person didn't give stays out (never "0", never a guessed icon). */}
          {(!!user.gender || user.age > 0) && (
            <View style={styles.chip}>
              {!!user.gender && <Art name={female ? 'cinsiyet-kadin' : 'cinsiyet-erkek'} size={15} />}
              {user.age > 0 && <Text style={styles.chipText}>{user.age}</Text>}
            </View>
          )}
          <MatchChip score={sim.score} />
        </View>
      </View>
      <View style={styles.cardSep} />
      <View style={styles.actions}>
        <Pressable onPress={onGreet} hitSlop={6} accessibilityRole="button" accessibilityLabel={greeted ? `${user.name} ile sohbet` : `${user.name} kişisine selam ver`}>
          {greeted ? (
            <View style={styles.chatBtn}>
              <Ionicons name="chatbubble-ellipses" size={15} color={HOME.pink} />
              <Text style={styles.chatText}>Sohbet</Text>
            </View>
          ) : (
            <LinearGradient colors={['#FF4A86', '#D8175E']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.hiBtn}>
              <Ionicons name="hand-left" size={15} color="#fff" />
              <Text style={styles.hiText}>Selam</Text>
            </LinearGradient>
          )}
        </Pressable>
        <Pressable onPress={onToggleFollow} hitSlop={6} style={[styles.followBtn, isFollowing && styles.followOn]} accessibilityRole="button" accessibilityLabel={isFollowing ? `${user.name}, takiptesin. Takibi bırak` : `${user.name} kişisini takip et`}>
          <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={15} color={isFollowing ? HOME.pink : HOME.ink} />
          <Text style={[styles.followText, isFollowing && { color: HOME.deep }]}>{isFollowing ? 'Takipte' : 'Takip et'}</Text>
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
      <LinearGradient colors={['rgba(255,101,118,0.22)', 'rgba(255,95,162,0.22)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promo}>
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

const useStyles = makeStyles(({ colors, lift, dark, edge }) => ({
  // The greeting on a pink glass bar: the waving hand in its own circle, the hearts on the right.
  greetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    height: 50,
    borderRadius: 25,
    paddingLeft: 6,
    paddingRight: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 0 18px rgba(255,120,190,0.35)',
  },
  greetHand: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FBD3E5', alignItems: 'center', justifyContent: 'center' },
  greet: { flex: 1, color: HOME.deep, fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.2 },
  greetHearts: { flexDirection: 'row', alignItems: 'flex-start' },
  greetHeartSmall: { marginLeft: -4, marginTop: -8 },
  tiles: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  tile: { borderRadius: 20, padding: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' },
  tileGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '48%' },
  tileArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileArtRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tileWifi: { position: 'absolute', right: -8, top: -8 },
  // White on the coloured tile; a soft shadow keeps it readable on the light end of each gradient.
  tileTitle: { color: '#fff', fontFamily: fonts.display, fontSize: 13, lineHeight: 16, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  tileSub: { color: 'rgba(255,255,255,0.92)', fontSize: 10, textAlign: 'center' },
  tabsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,240,247,0.97)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 0 14px rgba(255,120,190,0.28)',
  },
  tabs: { gap: 2, alignItems: 'center' },
  tabItem: { alignItems: 'center', paddingHorizontal: 10, paddingTop: 5, paddingBottom: 4, borderRadius: 18 },
  tabItemOn: { backgroundColor: glass.tint },
  tab: { color: HOME.plum, fontSize: 13, fontWeight: '600' },
  tabActive: { color: HOME.deep, fontSize: 14, fontWeight: '800' },
  underline: { height: 3, borderRadius: 2, backgroundColor: HOME.pink, marginTop: 2, width: 26 },
  tabFade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 22 },
  tabSep: { width: 1, height: 22, backgroundColor: HOME.line, marginHorizontal: 2 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  filterDot: { position: 'absolute', top: 2, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  activeFilters: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, ...lift },
  activeText: { flex: 1, color: colors.text, fontSize: 12 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 4 },
  cityText: { flex: 1, color: colors.textDim, fontSize: 12 },
  optIn: { alignItems: 'center', gap: 10, padding: 24, marginTop: 20 },
  optInBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  // A person on a pink glass card (the same in either scheme: deep ink on light glass).
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    borderRadius: 20,
    backgroundColor: HOME.glass,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 4px 14px rgba(120,20,70,0.2)',
  },
  photo: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#FBD3E5' },
  photoOnline: { borderWidth: 2, borderColor: '#F25FA8' },
  onlineDot: { position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#22C55E', borderWidth: 2.5, borderColor: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  name: { color: HOME.ink, fontFamily: fonts.display, fontSize: 16, maxWidth: 130 },
  chips: { flexDirection: 'row', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HOME.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { color: HOME.ink, fontSize: 12 },
  matchChip: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  matchText: { fontSize: 12, fontWeight: '800' },
  cardSep: { width: 1, alignSelf: 'stretch', marginVertical: 8, backgroundColor: HOME.line },
  actions: { gap: 5, alignItems: 'stretch', width: 92 },
  hiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 999, paddingVertical: 7, boxShadow: '0 3px 8px rgba(216,23,94,0.35)' },
  hiText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 999, paddingVertical: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: HOME.line },
  chatText: { color: HOME.ink, fontWeight: '800', fontSize: 14 },
  followBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 999, paddingVertical: 5 },
  followOn: { backgroundColor: '#FBD3E5' },
  followText: { color: HOME.ink, fontSize: 13, fontWeight: '700' },
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
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34, gap: 10, ...edge.sheet },
  sheetTitle: { color: colors.text, fontWeight: '800', fontSize: 17, textAlign: 'center' },
  sheetLabel: { color: colors.textDim, fontWeight: '700', fontSize: 12, marginTop: 4 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  optionActive: { borderColor: colors.primaryText, backgroundColor: dark ? 'rgba(255,95,162,0.18)' : 'rgba(208,46,120,0.11)' },
  optionText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  sheetBtn: { flex: 1, alignItems: 'center', borderRadius: 999, paddingVertical: 12 },
}));
