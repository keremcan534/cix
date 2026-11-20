// The person design shared by the room's person card and the profile (the designer's package, Nov 2026): a dark
// plum panel with pink and gold, the level pill by the name, the club and Aile pills, the interests row, four action
// tiles, the Profili gör · Yönet · Şikâyet et row, and the three walls' links: İlişki Duvarı, Hediye Duvarı and
// Koruma (the profile draws the walls themselves, components/profile-design). The card is drawn with the designer's picture set
// (components/person-card-art); every name, number and photo on it is the person's own.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/text';
import { CardArt, DIVIDER_ART, SlicePill, TILE_ART, type CardArtName } from '@/components/person-card-art';
import { useAffiliations, type Affiliation } from '@/components/profile-badges';
import type { User } from '@/data/mock';

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

/** "♥ Lv.N" by the name on the crowned pill: their Yankı level. */
export function LevelPill({ level }: { level: number }) {
  return (
    <View style={s.levelWrap} accessibilityLabel={`Yankı seviyesi ${level}`}>
      <CardArt name="seviye-rozet" h={LEVEL_H} />
      {/* The pink part of the picture, under its crown. */}
      <View style={s.level}>
        <CardArt name="kalp" h={10} />
        <Text style={s.levelText} numberOfLines={1}>
          Lv.{level}
        </Text>
      </View>
    </View>
  );
}

/** The agency (building) and Aile (people) a person belongs to, as two pills; none when they have neither. */
export function ClubPills({ user, onOpen }: { user: User; onOpen?: () => void }) {
  const { agency, kabile } = useAffiliations(user);
  if (!agency && !kabile) return null;
  const pill = (a: Affiliation, art: CardArtName, more: boolean) => (
    <Pressable
      key={art}
      style={s.clubAt}
      disabled={!a.href}
      onPress={() => {
        if (!a.href) return;
        onOpen?.();
        router.push(a.href);
      }}
      accessibilityRole={a.href ? 'button' : undefined}
      accessibilityLabel={`${a.sub}: ${a.name}`}
    >
      <SlicePill kind="kulup" h={32}>
        <View style={s.club}>
          <CardArt name={art} h={15} />
          <Text style={s.clubText} numberOfLines={1}>
            {a.name}
          </Text>
          {more && !!a.href && <CardArt name="ok" h={9} />}
        </View>
      </SlicePill>
    </Pressable>
  );
  return (
    <View style={s.clubs}>
      {agency && pill(agency, 'bina', false)}
      {kabile && pill(kabile, 'grup', true)}
    </View>
  );
}

/** "💬 Sohbet" → the emoji and the word (an interest without an emoji keeps a dot). */
export const splitInterest = (i: string) => {
  const m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.+)$/u.exec(i.trim());
  return m ? { emoji: m[1], label: m[2] } : { emoji: '•', label: i.trim() };
};

/** The designer's picture for an interest; any other interest keeps its emoji. */
const interestArt = (label: string): CardArtName | null => {
  const l = label.toLocaleLowerCase('tr-TR');
  if (l.includes('sohbet')) return 'sohbet';
  if (l.includes('dans')) return 'dans';
  if (l.includes('spor') || l.includes('futbol')) return 'spor';
  if (l.includes('oyun')) return 'oyun';
  if (l.includes('film') || l.includes('sinema') || l.includes('dizi')) return 'film';
  return null;
};

/** Their interests on one line (at most five; none: nothing). */
export function InterestRow({ interests, style }: { interests: readonly string[] | undefined; style?: StyleProp<ViewStyle> }) {
  const list = (interests ?? []).slice(0, 5).map(splitInterest);
  if (!list.length) return null;
  return (
    <View style={[s.interests, style]} accessibilityLabel={`İlgi alanları: ${list.map((x) => x.label).join(', ')}`}>
      <View style={s.interestList}>
        {list.map((x) => {
          const art = interestArt(x.label);
          return (
            <View key={x.label} style={s.interest}>
              {art ? <CardArt name={art} h={16} /> : <Text style={s.interestEmoji}>{x.emoji}</Text>}
              <Text style={s.interestText} numberOfLines={1}>
                {x.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// --- Actions --------------------------------------------------------------------------------------------------

export type Tile = { art: CardArtName; label: string; onPress: () => void; on?: boolean; disabled?: boolean };

/** Hediye · Bahset · Takip · Mesaj: four tiles, the "on" one (Takiptesin) lit. */
export function ActionTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <View style={s.tiles}>
      {tiles.map((t) => (
        <Pressable
          key={t.label}
          style={[s.tile, t.disabled && { opacity: 0.5 }]}
          onPress={t.onPress}
          disabled={t.disabled}
          accessibilityRole="button"
          accessibilityLabel={t.label}
          accessibilityState={t.on !== undefined ? { selected: t.on } : undefined}
        >
          <Image source={t.on ? TILE_ART.on : TILE_ART.off} style={s.tileArt} resizeMode="stretch" />
          <CardArt name={t.art} h={25} />
          <Text style={s.tileText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Profili gör · Yönet · Şikâyet et under a thin line (Yönet only with the server's permission; the caller leaves it out). */
export function ManageRow({ items }: { items: { art: CardArtName; label: string; onPress: () => void }[] }) {
  return (
    <View>
      <Image source={DIVIDER_ART} style={s.divider} resizeMode="stretch" />
      <View style={s.manage}>
        {items.map((it) => (
          <View key={it.label} style={s.manageCell}>
            <Pressable style={s.manageItem} onPress={it.onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={it.label}>
              <CardArt name={it.art} h={17} />
              <Text style={s.manageText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {it.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

// --- The three walls ------------------------------------------------------------------------------------------

const WALLS = {
  iliski: { label: 'İlişki Duvarı', icon: 'heart' as IconName, colors: ['#FF7AB8', '#D61F78'] as const, pill: ['rgba(214,31,120,0.55)', 'rgba(74,15,55,0.75)'] as const },
  hediye: { label: 'Hediye Duvarı', icon: 'gift' as IconName, colors: ['#B98CFF', '#6A3DF0'] as const, pill: ['rgba(106,61,240,0.55)', 'rgba(30,22,89,0.75)'] as const },
  koruma: { label: 'Koruma', icon: 'shield' as IconName, colors: ['#FFE29A', '#D99A1E'] as const, pill: ['rgba(217,154,30,0.4)', 'rgba(74,15,55,0.75)'] as const },
};
export type WallKey = keyof typeof WALLS;

const WALL_ART: Record<WallKey, { art: CardArtName; h: number }> = { iliski: { art: 'iliski', h: 19 }, hediye: { art: 'hediye', h: 30 }, koruma: { art: 'koruma', h: 30 } };

/** The card's three links, each with its picture standing out of the pill: each opens that wall. */
export function WallLinks({ onOpen }: { onOpen: (w: WallKey) => void }) {
  return (
    <View style={s.links}>
      {(Object.keys(WALLS) as WallKey[]).map((k) => (
        <Pressable key={k} style={s.linkAt} onPress={() => onOpen(k)} accessibilityRole="button" accessibilityLabel={WALLS[k].label}>
          <SlicePill kind="duvar" h={36}>
            <View style={s.link}>
              {/* One line, as in the design: a narrow phone draws it a little smaller rather than on two lines. */}
              <Text style={s.linkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1}>
                {WALLS[k].label}
              </Text>
              <CardArt name="ok" h={9} />
            </View>
          </SlicePill>
          <View style={s.linkArt} pointerEvents="none">
            <CardArt name={WALL_ART[k].art} h={WALL_ART[k].h} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const LEVEL_H = 44;

const s = StyleSheet.create({
  levelWrap: { flexShrink: 0, marginVertical: -8 },
  level: { position: 'absolute', left: '13%', right: '13%', top: '49%', bottom: '11%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  levelText: { color: '#fff', fontSize: 12, lineHeight: 15, fontWeight: '800' },
  clubs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  clubAt: { flexShrink: 1, maxWidth: '100%' },
  club: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 32 },
  clubText: { color: SHOW.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  interests: { flexDirection: 'row', alignItems: 'center' },
  interestList: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-evenly', columnGap: 10, rowGap: 4 },
  interest: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  interestEmoji: { fontSize: 15 },
  interestText: { color: SHOW.text, fontSize: 13 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, minWidth: 0, minHeight: 66, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 6 },
  tileArt: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  tileText: { color: SHOW.text, fontSize: 12.5, fontWeight: '800' },
  divider: { width: '100%', height: 3, marginTop: 2 },
  manage: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  manageCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  manageItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  manageText: { color: SHOW.dim, fontSize: 13.5, fontWeight: '700', flexShrink: 1 },
  links: { flexDirection: 'row', gap: 6, paddingLeft: 6 },
  linkAt: { flex: 1, minWidth: 0, justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36, paddingLeft: 26, paddingRight: 7 },
  linkArt: { position: 'absolute', left: -8, top: 0, bottom: 0, width: 34, alignItems: 'center', justifyContent: 'center' },
  linkText: { flex: 1, color: SHOW.text, fontSize: 10, lineHeight: 13, fontWeight: '800' },
});
