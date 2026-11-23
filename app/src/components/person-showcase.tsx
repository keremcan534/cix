// The person design shared by the room's person card and the profile (the designer's package, Nov 2026): a dark
// plum panel with pink and gold, the level pill by the name, the club and Aile pills, four action tiles, the
// Profili gör · Yönet · Şikâyet et row, and the three walls' links: İlişki Duvarı, Hediye Duvarı and
// Koruma (the profile draws the walls themselves, components/profile-design). The card is drawn with the designer's picture set
// (components/person-card-art); every name, number and photo on it is the person's own.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { CardArt, DIVIDER_ART, SlicePill, type CardArtName } from '@/components/person-card-art';
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
export function LevelPill({ level, h = LEVEL_H }: { level: number; h?: number }) {
  return (
    <View style={[s.levelWrap, { marginVertical: -Math.round(h * 0.18) }]} accessibilityLabel={`Yankı seviyesi ${level}`}>
      <CardArt name="seviye-rozet" h={h} />
      {/* The pink part of the picture, under its crown. */}
      <View style={s.level}>
        <CardArt name="kalp" h={Math.round(h * 0.23)} />
        <Text style={[s.levelText, { fontSize: Math.round(h * 0.27) }]} numberOfLines={1}>
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
  const pill = (a: Affiliation, art: CardArtName) => (
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
      <SlicePill kind="kulup" h={30}>
        <View style={s.club}>
          <CardArt name={art} h={15} />
          <Text style={s.clubText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {a.name}
          </Text>
          {!!a.href && <CardArt name="ok" h={10} />}
        </View>
      </SlicePill>
    </Pressable>
  );
  return (
    <View style={s.clubs}>
      {agency && pill(agency, 'bina')}
      {kabile && pill(kabile, 'grup')}
    </View>
  );
}

/** "💬 Sohbet" → the emoji and the word (an interest without an emoji keeps a dot). */
export const splitInterest = (i: string) => {
  const m = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.+)$/u.exec(i.trim());
  return m ? { emoji: m[1], label: m[2] } : { emoji: '•', label: i.trim() };
};

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
          {/* A ground drawn the same on both sides (the stretched picture's light ran to one corner). */}
          <LinearGradient colors={t.on ? ['rgba(255,57,196,0.42)', 'rgba(150,20,105,0.38)'] : ['rgba(255,255,255,0.10)', 'rgba(120,24,92,0.20)']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[StyleSheet.absoluteFill, s.tileGround, t.on && s.tileOn]} />
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
        {items.map((it, i) => (
          <View key={it.label} style={s.manageCell}>
            {i > 0 && <View style={s.manageSep} />}
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

const WALL_ART: Record<WallKey, { art: CardArtName; h: number }> = { iliski: { art: 'iliski', h: 15 }, hediye: { art: 'hediye', h: 22 }, koruma: { art: 'koruma', h: 23 } };

/** The card's three links, the same width, each its picture over its name inside its pill: each opens that wall. */
export function WallLinks({ onOpen }: { onOpen: (w: WallKey) => void }) {
  return (
    <View style={s.links}>
      {(Object.keys(WALLS) as WallKey[]).map((k) => (
        <Pressable key={k} style={s.linkAt} onPress={() => onOpen(k)} accessibilityRole="button" accessibilityLabel={WALLS[k].label}>
          <LinearGradient colors={WALLS[k].pill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, s.linkGround, { borderColor: WALLS[k].colors[0] }]} />
          <View style={s.link}>
            <CardArt name={WALL_ART[k].art} h={WALL_ART[k].h} />
            {/* The picture over its name, so a 360-point phone keeps "İlişki Duvarı" whole. */}
            <Text style={s.linkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1}>
              {WALLS[k].label}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const LEVEL_H = 44;

const s = StyleSheet.create({
  levelWrap: { flexShrink: 0 },
  level: { position: 'absolute', left: '13%', right: '13%', top: '49%', bottom: '11%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  levelText: { color: '#fff', fontSize: 12, lineHeight: 15, fontWeight: '800' },
  // Two halves, as in the design (one alone keeps its half, on the left).
  // Small chips as wide as their names, in the middle (the owners, 23 Nov 2026: the card symmetric), not two half-card pills.
  clubs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  clubAt: { maxWidth: '64%' },
  club: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 10, minHeight: 30 },
  clubText: { flexShrink: 1, color: SHOW.text, fontSize: 13, fontWeight: '700' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, minHeight: 70, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 8 },
  tileGround: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,120,215,0.35)' },
  tileOn: { borderColor: '#FF6FD8', borderWidth: 1.5 },
  tileText: { color: SHOW.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  divider: { width: '100%', height: 3, marginTop: 2 },
  manage: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  manageCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  manageSep: { width: 1, height: 20, backgroundColor: 'rgba(255, 140, 225, 0.25)' },
  manageItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  manageText: { color: SHOW.dim, fontSize: 13.5, fontWeight: '700', flexShrink: 1 },
  links: { flexDirection: 'row', gap: 6 },
  linkAt: { flex: 1, minWidth: 0, minHeight: 52, justifyContent: 'center' },
  linkGround: { borderRadius: 16, borderWidth: 1 },
  link: { alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 52, paddingHorizontal: 4, paddingVertical: 5 },
  linkText: { color: SHOW.text, fontSize: 11.5, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
});
