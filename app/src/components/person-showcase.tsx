// The person design shared by the room's person card and the profile (the designer's package, Nov 2026): a dark
// plum panel with pink and gold, the level pill by the name, the club and Aile pills, the interests row, four action
// tiles, the Profili gör · Yönet · Şikâyet et row, and the three walls: İlişki Duvarı, Hediye Duvarı and Koruma
// (small links on the card, banners on the profile). Every name, number and photo is the person's own; the
// designer's sample person, their ornate frame and the flat banner pictures are not used.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { GiftArt } from '@/components/GiftArt';
import { Photo } from '@/components/photo';
import { useAffiliations, type Affiliation } from '@/components/profile-badges';
import type { User } from '@/data/mock';
import { guardPoints, type GuardPerson } from '@/lib/guard-core';

type IconName = keyof typeof Ionicons.glyphMap;

/** The package's colors (shared/design-tokens.json): the panel looks the same in light and dark mode. */
export const SHOW = {
  bg: '#21101F',
  panel: '#281329',
  tile: 'rgba(255,255,255,0.06)',
  line: 'rgba(255,255,255,0.10)',
  pink: '#FF39C4',
  rose: '#E2187A',
  gold: '#FFD475',
  text: '#FFF7FC',
  dim: '#E8B4D1',
  blue: '#68CAFF',
} as const;

// --- Name line ------------------------------------------------------------------------------------------------

/** "♥ Lv.N" by the name: their Yankı level. */
export function LevelPill({ level }: { level: number }) {
  return (
    <LinearGradient colors={['#FF6FB5', SHOW.rose]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.level} accessibilityLabel={`Yankı seviyesi ${level}`}>
      <Ionicons name="heart" size={12} color="#fff" />
      <Text style={s.levelText}>Lv.{level}</Text>
    </LinearGradient>
  );
}

/** The agency (building) and Aile (people) a person belongs to, as two outlined pills; none when they have neither. */
export function ClubPills({ user, onOpen }: { user: User; onOpen?: () => void }) {
  const { agency, kabile } = useAffiliations(user);
  if (!agency && !kabile) return null;
  const pill = (a: Affiliation, icon: IconName, more: boolean) => (
    <Pressable
      key={icon}
      style={s.club}
      disabled={!a.href}
      onPress={() => {
        if (!a.href) return;
        onOpen?.();
        router.push(a.href);
      }}
      accessibilityRole={a.href ? 'button' : undefined}
      accessibilityLabel={`${a.sub}: ${a.name}`}
    >
      <Ionicons name={icon} size={15} color={SHOW.pink} />
      <Text style={s.clubText} numberOfLines={1}>
        {a.name}
      </Text>
      {more && !!a.href && <Ionicons name="chevron-forward" size={14} color={SHOW.dim} />}
    </Pressable>
  );
  return (
    <View style={s.clubs}>
      {agency && pill(agency, 'business', false)}
      {kabile && pill(kabile, 'people', true)}
    </View>
  );
}

/** "💬 Sohbet" → the emoji and the word (an interest without an emoji keeps a dot). */
export const splitInterest = (i: string) => {
  const m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.+)$/u.exec(i.trim());
  return m ? { emoji: m[1], label: m[2] } : { emoji: '•', label: i.trim() };
};

/** Their interests on one line between two gold laurels (at most five; none: nothing). */
export function InterestRow({ interests, style }: { interests: readonly string[] | undefined; style?: StyleProp<ViewStyle> }) {
  const list = (interests ?? []).slice(0, 5).map(splitInterest);
  if (!list.length) return null;
  return (
    <View style={[s.interests, style]} accessibilityLabel={`İlgi alanları: ${list.map((x) => x.label).join(', ')}`}>
      <Ionicons name="leaf" size={16} color={SHOW.gold} style={{ transform: [{ scaleX: -1 }] }} />
      <View style={s.interestList}>
        {list.map((x, i) => (
          <View key={x.label} style={s.interest}>
            {i > 0 && <View style={s.interestSep} />}
            <Text style={s.interestEmoji}>{x.emoji}</Text>
            <Text style={s.interestText} numberOfLines={1}>
              {x.label}
            </Text>
          </View>
        ))}
      </View>
      <Ionicons name="leaf" size={16} color={SHOW.gold} />
    </View>
  );
}

// --- Actions --------------------------------------------------------------------------------------------------

export type Tile = { icon: IconName; label: string; onPress: () => void; tint?: string; on?: boolean; disabled?: boolean };

/** Hediye · Bahset · Takip · Mesaj: four tiles, the "on" one (Takiptesin) lit pink. */
export function ActionTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <View style={s.tiles}>
      {tiles.map((t) => {
        const body = (
          <>
            <Ionicons name={t.icon} size={26} color={t.tint ?? SHOW.text} />
            <Text style={s.tileText} numberOfLines={1} adjustsFontSizeToFit>
              {t.label}
            </Text>
          </>
        );
        return (
          <Pressable
            key={t.label}
            style={[s.tile, t.on && s.tileOn, t.disabled && { opacity: 0.5 }]}
            onPress={t.onPress}
            disabled={t.disabled}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            accessibilityState={t.on !== undefined ? { selected: t.on } : undefined}
          >
            {t.on ? (
              <LinearGradient colors={['rgba(255,57,196,0.32)', 'rgba(226,24,122,0.18)']} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
            ) : null}
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Profili gör · Yönet · Şikâyet et (Yönet only with the server's permission; the caller leaves it out). */
export function ManageRow({ items }: { items: { icon: IconName; label: string; onPress: () => void }[] }) {
  return (
    <View style={s.manage}>
      {items.map((it, i) => (
        <View key={it.label} style={s.manageCell}>
          {i > 0 && <View style={s.manageSep} />}
          <Pressable style={s.manageItem} onPress={it.onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={it.label}>
            <Ionicons name={it.icon} size={17} color={SHOW.dim} />
            <Text style={s.manageText} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// --- The three walls ------------------------------------------------------------------------------------------

const WALLS = {
  iliski: { label: 'İlişki Duvarı', icon: 'heart' as IconName, colors: ['#FF7AB8', '#D61F78'] as const },
  hediye: { label: 'Hediye Duvarı', icon: 'gift' as IconName, colors: ['#B98CFF', '#6A3DF0'] as const },
  koruma: { label: 'Koruma', icon: 'shield' as IconName, colors: ['#FFE29A', '#D99A1E'] as const },
};
export type WallKey = keyof typeof WALLS;

/** The card's three small links: each opens that wall. */
export function WallLinks({ onOpen }: { onOpen: (w: WallKey) => void }) {
  return (
    <View style={s.links}>
      {(Object.keys(WALLS) as WallKey[]).map((k) => {
        const w = WALLS[k];
        return (
          <Pressable key={k} style={s.link} onPress={() => onOpen(k)} accessibilityRole="button" accessibilityLabel={w.label}>
            <LinearGradient colors={w.colors} style={s.linkIcon}>
              <Ionicons name={w.icon} size={13} color="#fff" />
            </LinearGradient>
            {/* Two short lines on a narrow phone ("İlişki / Duvarı") rather than a cut word. */}
            <Text style={s.linkText} numberOfLines={2}>
              {w.label}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={SHOW.dim} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** One of the profile's wall banners: the title between laurels, a picture on the left, the person's data. */
function Banner({ wall, colors, art, onPress, children }: { wall: WallKey; colors: readonly [string, string, ...string[]]; art: React.ReactNode; onPress: () => void; children: React.ReactNode }) {
  const w = WALLS[wall];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={w.label}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
        <View style={s.bannerTitle}>
          <Ionicons name="leaf" size={15} color={SHOW.gold} style={{ transform: [{ scaleX: -1 }] }} />
          <Ionicons name={w.icon} size={18} color={w.colors[0]} />
          <Text style={s.bannerTitleText}>{w.label}</Text>
          <Ionicons name="leaf" size={15} color={SHOW.gold} />
        </View>
        <View style={s.bannerBody}>
          <View style={s.bannerArt}>{art}</View>
          <View style={s.bannerData}>{children}</View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Face({ uri, size, ring = SHOW.gold, style }: { uri: string | null | undefined; size: number; ring?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ring, overflow: 'hidden', backgroundColor: SHOW.panel }, style]}>
      {uri ? <Photo uri={uri} kind="face" style={{ width: '100%', height: '100%' }} /> : <Ionicons name="person" size={size * 0.55} color={SHOW.dim} style={{ alignSelf: 'center', marginTop: size * 0.2 }} />}
    </View>
  );
}

/** İlişki Duvarı: the person and their top bond's partner, and how many days it has lasted. */
export function RelationshipBanner({ owner, partner, days, onPress }: { owner: string | null | undefined; partner: { uri: string | null | undefined; name: string } | null; days: number | null; onPress: () => void }) {
  return (
    <Banner wall="iliski" colors={['#5A1240', '#B0246E', '#4A0F37']} onPress={onPress} art={<Text style={s.bigEmoji}>💞</Text>}>
      {partner ? (
        <View style={s.pairRow}>
          <View style={s.pair}>
            <Face uri={owner} size={52} />
            <Face uri={partner.uri} size={52} style={{ marginLeft: -12 }} />
            <View style={s.pairHeart}>
              <Ionicons name="heart" size={14} color="#fff" />
            </View>
          </View>
          {days !== null && (
            <View style={s.daysPill}>
              <Ionicons name="heart" size={14} color={SHOW.pink} />
              <Text style={s.daysText}>{days} gün</Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={s.empty}>Henüz bağ yok</Text>
      )}
    </Banner>
  );
}

/** Hediye Duvarı: the three gifts they received most, and how many kinds of the catalog they have. */
export function GiftWallBanner({ top, lit, total, received, onPress }: { top: { giftId: string; emoji: string }[]; lit: number | null; total: number | null; received: number | null; onPress: () => void }) {
  return (
    <Banner wall="hediye" colors={['#251C6B', '#4B3AC2', '#1E1659']} onPress={onPress} art={<GiftArt giftId={top[0]?.giftId} emoji={top[0]?.emoji ?? '🎁'} size={64} />}>
      <View style={s.giftRow}>
        <View style={s.giftBadges}>
          {[0, 1, 2].map((i) =>
            top[i] ? (
              <GiftArt key={top[i].giftId} giftId={top[i].giftId} emoji={top[i].emoji} size={30} />
            ) : (
              <View key={`e${i}`} style={s.giftEmpty} />
            ),
          )}
        </View>
        <View style={s.giftCount}>
          <Text style={s.giftCountText} numberOfLines={1} adjustsFontSizeToFit>
            {lit !== null && total ? `${lit}/${total}` : received !== null ? guardPoints(received) : '—'}
          </Text>
          <Text style={s.giftCountSub}>{lit !== null && total ? 'çeşit' : 'hediye'}</Text>
        </View>
      </View>
    </Banner>
  );
}

/**
 * Koruma: their top guardian (the one over their threshold), and whom they guard most when that is someone else.
 * Empty: nobody yet, and how to become one.
 */
export function GuardBanner({ guardian, ward, off, onPress }: { guardian: GuardPerson | null; ward: GuardPerson | null; off: boolean; onPress: () => void }) {
  const second = ward && ward.id !== guardian?.id ? ward : null;
  return (
    <Banner wall="koruma" colors={['#3A0F4A', '#8A2A9E', '#3A0F4A']} onPress={onPress} art={<GiftArt giftId="koruma" emoji="🛡️" size={70} />}>
      {guardian || second ? (
        <View style={{ gap: 8 }}>
          {guardian && <GuardLine person={guardian} label="Koruma" />}
          {second && <GuardLine person={second} label="Koruduğu" />}
        </View>
      ) : (
        <Text style={s.empty}>{off ? 'Koruma kapalı' : 'Henüz koruyucusu yok · Koruma Kartı gönder, koruyucusu ol'}</Text>
      )}
    </Banner>
  );
}

function GuardLine({ person, label }: { person: GuardPerson; label: string }) {
  return (
    <View style={s.guardLine}>
      <Face uri={person.avatarUrl} size={48} />
      <View style={s.guardTag}>
        <Ionicons name="shield-half" size={14} color={SHOW.gold} />
        <View style={{ flexShrink: 1 }}>
          <Text style={s.guardLabel}>{label}</Text>
          <Text style={s.guardName} numberOfLines={1}>
            {person.name} · {guardPoints(person.points)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** The guardian on a profile's header: their photo in a gold ring under a "KORUMA" ribbon. */
export function GuardBadge({ person, onPress }: { person: GuardPerson; onPress: () => void }) {
  return (
    <Pressable style={s.badge} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Koruma: ${person.name}`}>
      <LinearGradient colors={['#FFE6A8', '#FF7AB8', '#B23CF0']} style={s.badgeRing}>
        <Face uri={person.avatarUrl} size={64} ring="#fff" />
      </LinearGradient>
      <LinearGradient colors={['#FFE29A', '#D99A1E']} style={s.badgeRibbon}>
        <Ionicons name="shield" size={10} color="#5B2A00" />
        <Text style={s.badgeText}>KORUMA</Text>
      </LinearGradient>
      <Text style={s.badgeName} numberOfLines={1}>
        {person.name}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  level: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: SHOW.gold },
  levelText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  clubs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  club: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,57,196,0.45)', backgroundColor: 'rgba(255,57,196,0.08)', paddingHorizontal: 12, minHeight: 34, maxWidth: '100%' },
  clubText: { color: SHOW.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  interests: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  interestList: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 4 },
  interest: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  interestSep: { width: 1, height: 14, backgroundColor: SHOW.line, marginHorizontal: 7 },
  interestEmoji: { fontSize: 15 },
  interestText: { color: SHOW.text, fontSize: 14 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 18, backgroundColor: SHOW.tile, borderWidth: 1, borderColor: SHOW.line, paddingHorizontal: 2, overflow: 'hidden' },
  tileOn: { borderColor: SHOW.pink },
  tileText: { color: SHOW.text, fontSize: 13, fontWeight: '800' },
  manage: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: SHOW.line, backgroundColor: 'rgba(255,255,255,0.03)', minHeight: 44 },
  manageCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  manageSep: { width: 1, height: 18, backgroundColor: SHOW.line },
  manageItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  manageText: { color: SHOW.dim, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  links: { flexDirection: 'row', gap: 6 },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, borderRadius: 999, paddingLeft: 4, paddingRight: 5, borderWidth: 1, borderColor: 'rgba(255,212,117,0.45)', backgroundColor: 'rgba(255,57,196,0.10)' },
  linkIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  linkText: { flex: 1, color: SHOW.text, fontSize: 12, lineHeight: 14, fontWeight: '800' },
  banner: { borderRadius: 22, borderWidth: 1.5, borderColor: 'rgba(255,212,117,0.6)', padding: 12, gap: 6, overflow: 'hidden' },
  bannerTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bannerTitleText: { color: SHOW.text, fontSize: 19, fontWeight: '900', fontStyle: 'italic' },
  bannerBody: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 84 },
  bannerArt: { width: 84, alignItems: 'center', justifyContent: 'center' },
  bannerData: { flex: 1, minWidth: 0 },
  bigEmoji: { fontSize: 54, lineHeight: 64 },
  empty: { color: SHOW.dim, fontSize: 14, lineHeight: 20 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pair: { flexDirection: 'row', alignItems: 'center' },
  pairHeart: { position: 'absolute', left: 33, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: SHOW.pink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  daysPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, borderColor: SHOW.gold, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 12, paddingVertical: 5 },
  daysText: { color: '#7A1450', fontSize: 15, fontWeight: '900' },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  giftBadges: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(104,202,255,0.35)', paddingVertical: 6 },
  giftEmpty: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)' },
  giftCount: { alignItems: 'center', minWidth: 64 },
  giftCountText: { color: SHOW.gold, fontSize: 20, fontWeight: '900' },
  giftCountSub: { color: SHOW.dim, fontSize: 11 },
  guardLine: { flexDirection: 'row', alignItems: 'center' },
  guardTag: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: -10, paddingLeft: 16, paddingRight: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,212,117,0.35)', zIndex: -1 },
  guardLabel: { color: SHOW.gold, fontSize: 11, fontWeight: '800' },
  guardName: { color: SHOW.text, fontSize: 14, fontWeight: '800' },
  badge: { width: 92, alignItems: 'center' },
  badgeRing: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  badgeRibbon: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: -12, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#FEF3C7' },
  badgeText: { color: '#5B2A00', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  badgeName: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 3, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
