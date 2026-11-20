// The profile's pieces in the client's profile package (Nov 2026: Profil, Vitrin and Bağlar on light pink glass):
// stat bar, edit and share row, completion card, the İlişki, Koruma and Hediye walls, info cards and rows, section
// labels, agency and Aile cards, the connection counts and the room card. Native views only: the package's pictures
// were references, so every picture here is the app's own (assets/person-card, gift art, the person's photos), and
// every name and number comes from the caller, never from the package. Colours are the app's light glass (theme
// `glass`) plus the package's five gradients; the same in either scheme, as the profile header always was.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { GiftArt } from '@/components/GiftArt';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { guardPoints } from '@/lib/guard-core';
import { fonts, glass, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** The package's gradients (tokenlar.json), on the app's glass. */
export const PROFILE_GRADIENT = {
  cta: ['#D72A92', '#71104E'],
  relation: ['#9E0A62', '#6B1251'],
  gift: ['#4B249C', '#20155F'],
  completion: ['#E62A91', '#7F43ED', '#35B7EF'],
  protection: ['#A00A65', '#5F0F58'],
} as const;
const GOLD = '#F2C66E';
const VERIFIED = '#168CCD';
const SUCCESS = '#268B52';

const ART = {
  iliski: require('../../assets/person-card/iliski.png'),
  koruma: require('../../assets/person-card/koruma.png'),
  hediye: require('../../assets/person-card/hediye.png'),
};

// --- Building blocks -----------------------------------------------------------------------------------------

/** A light card (radius 20); a button when it has `onPress`. */
export function PCard({ children, onPress, label, style }: { children: ReactNode; onPress?: () => void; label?: string; style?: StyleProp<ViewStyle> }) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel={label}>
      {children}
    </Pressable>
  );
}

export type Tone = 'pink' | 'soft' | 'blue' | 'purple' | 'plum';
const TONES: Record<Tone, { bg: readonly [string, string]; fg: string }> = {
  pink: { bg: ['#FF5FA2', '#D8175E'], fg: '#fff' },
  soft: { bg: [glass.well, glass.tint], fg: glass.pink },
  blue: { bg: ['#E8F4FF', '#D6EBFF'], fg: VERIFIED },
  purple: { bg: ['#EFE6FF', '#E0D2FF'], fg: '#6D3AE0' },
  plum: { bg: ['#6B1251', '#3E0A30'], fg: GOLD },
};

/** A rounded square with an icon (the package's card icons). */
export function IconTile({ icon, tone = 'soft', size = 44 }: { icon: IconName; tone?: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <LinearGradient colors={t.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.tile, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={t.fg} />
    </LinearGradient>
  );
}

/** A card's head: icon, title (and a line under it), what sits right, and a chevron only when it opens something. */
export function CardHead({ icon, tone, title, sub, right, chevron, small }: { icon: IconName; tone?: Tone; title: string; sub?: ReactNode; right?: ReactNode; chevron?: boolean; small?: boolean }) {
  return (
    <View style={s.head}>
      <IconTile icon={icon} tone={tone} size={small ? 34 : 44} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[s.title, small && { fontSize: 16 }]} numberOfLines={1}>
          {title}
        </Text>
        {typeof sub === 'string' ? (
          <Text style={s.sub} numberOfLines={2}>
            {sub}
          </Text>
        ) : (
          sub
        )}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={glass.plum} />}
    </View>
  );
}

/** A heading between cards: icon, word and a thin line to the edge (Bağlar: Ajans, Aile, Bağlantılar). */
export function SectionLabel({ icon, title }: { icon: IconName; title: string }) {
  // On the page itself, so in the scheme's colours (the cards are glass in either).
  const { colors } = useTheme();
  return (
    <View style={s.label} accessibilityRole="header">
      <Ionicons name={icon} size={20} color={colors.primaryText} />
      <Text style={[s.labelText, { color: colors.primaryText }]}>{title}</Text>
      <View style={[s.labelLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

// --- Numbers and actions -------------------------------------------------------------------------------------

/** n null: not known yet (live mode, before the server answered), shown as a dash. */
export type Stat = { n: number | null; label: string; onPress?: () => void };

/** Takipçi · Takip · Arkadaş · Hediye, each opening its list only when it has one. */
export function StatBar({ stats }: { stats: Stat[] }) {
  return (
    <View style={s.stats}>
      {stats.map((st, i) => (
        <View key={st.label} style={s.statCell}>
          {i > 0 && <View style={s.statSep} />}
          <Pressable style={s.stat} onPress={st.onPress} disabled={!st.onPress} accessibilityRole={st.onPress ? 'button' : 'text'} accessibilityLabel={st.n === null ? st.label : `${st.n.toLocaleString('tr-TR')} ${st.label}`}>
            <Text style={s.statN} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {st.n === null ? '—' : st.n.toLocaleString('tr-TR')}
            </Text>
            <Text style={s.statL} numberOfLines={1}>
              {st.label}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** The one strong action on my own profile, with Paylaş beside it. */
export function EditShareRow({ onEdit, onShare, busy }: { onEdit: () => void; onShare: () => void; busy?: boolean }) {
  return (
    <View style={s.actions}>
      <EditButton onPress={onEdit} busy={busy} style={{ flex: 1.9 }} />
      <Pressable onPress={onShare} style={({ pressed }) => [s.share, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel="Profili paylaş">
        <Ionicons name="share-social-outline" size={20} color={glass.deep} />
        <Text style={s.shareText} numberOfLines={1}>
          Paylaş
        </Text>
      </Pressable>
    </View>
  );
}

/** "Profili Düzenle" on the package's plum gradient. */
export function EditButton({ onPress, busy, style }: { onPress: () => void; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [style, (pressed || busy) && s.pressed]} accessibilityRole="button" accessibilityLabel="Profili düzenle" accessibilityState={{ busy }}>
      <LinearGradient colors={PROFILE_GRADIENT.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.edit}>
        <Ionicons name={busy ? 'hourglass-outline' : 'create-outline'} size={20} color="#fff" />
        <Text style={s.editText} numberOfLines={1}>
          {busy ? 'Açılıyor…' : 'Profili Düzenle'}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Profilini tamamla: how much is filled in; with `button` the edit button under it (Vitrin). */
export function CompletionCard({ percent, onPress, button }: { percent: number; onPress: () => void; button?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const bar = (
    <View style={s.head}>
      <IconTile icon="person-outline" tone="pink" />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={s.title} numberOfLines={1}>
          Profilini tamamla
        </Text>
        <View style={s.progressRow}>
          <Text style={s.sub} numberOfLines={1}>
            Tamamlanma oranı
          </Text>
          <View style={s.track}>
            <LinearGradient colors={PROFILE_GRADIENT.completion} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.pct}>%{pct}</Text>
        </View>
      </View>
      {!button && <Ionicons name="chevron-forward" size={18} color={glass.plum} />}
    </View>
  );
  if (!button) return (
    <PCard onPress={onPress} label={`Profilini tamamla: yüzde ${pct}. Profili düzenle`}>
      {bar}
    </PCard>
  );
  return (
    <PCard style={{ gap: 12 }}>
      <View accessible accessibilityLabel={`Profil tamamlanma oranı yüzde ${pct}`}>{bar}</View>
      <EditButton onPress={onPress} />
    </PCard>
  );
}

// --- The walls -----------------------------------------------------------------------------------------------

/** The two faces of a bond with the heart between them. */
function Pair({ owner, partner, size }: { owner: string | null | undefined; partner: string | null | undefined; size: number }) {
  return (
    <View style={s.pair}>
      <Face uri={owner} size={size} ring={GOLD} />
      <Face uri={partner} size={size} ring={GOLD} style={{ marginLeft: -size * 0.22 }} />
      <View style={[s.pairHeart, { left: size * 0.78 - 12 }]}>
        <Ionicons name="heart" size={13} color="#fff" />
      </View>
    </View>
  );
}

function Days({ days, small }: { days: number; small?: boolean }) {
  return (
    <View style={[s.days, small && s.daysSmall]}>
      <Ionicons name="heart" size={small ? 12 : 14} color={glass.pink} />
      <Text style={[s.daysText, small && { fontSize: 13 }]} numberOfLines={1}>
        {days.toLocaleString('tr-TR')} gün
      </Text>
    </View>
  );
}

function Leaves({ children }: { children: ReactNode }) {
  return (
    <View style={s.leaves}>
      <Ionicons name="leaf" size={15} color={GOLD} style={{ transform: [{ scaleX: -1 }] }} />
      {children}
      <Ionicons name="leaf" size={15} color={GOLD} />
    </View>
  );
}

export type BondPartner = { uri: string | null | undefined; name: string } | null;

/**
 * İlişki Duvarı: the profile's top bond (the two faces and its days). The banner on Profil; `compact`, the row that
 * heads Bağlar. No bond: says so.
 */
export function RelationWall({ owner, partner, days, onPress, compact }: { owner: string | null | undefined; partner: BondPartner; days: number | null; onPress?: () => void; compact?: boolean }) {
  const label = partner ? `İlişki Duvarı: ${partner.name}${days !== null ? `, ${days} gün` : ''}` : 'İlişki Duvarı: henüz bağ yok';
  // A narrow phone keeps the words and the faces whole and leaves the hearts picture out.
  const { width } = useWindowDimensions();
  if (compact) {
    return (
      <PCard onPress={onPress} label={label} style={s.relRow}>
        {width >= 370 && <Image source={ART.iliski} style={s.relArtSmall} resizeMode="contain" />}
        <Text style={s.relTitle} numberOfLines={2}>
          İlişki Duvarı
        </Text>
        <View style={{ flex: 1 }} />
        {partner ? (
          <>
            <Pair owner={owner} partner={partner.uri} size={36} />
            {days !== null && <Days days={days} small />}
          </>
        ) : (
          <Text style={s.sub}>Henüz bağ yok</Text>
        )}
        {onPress && <Ionicons name="chevron-forward" size={18} color={glass.plum} />}
      </PCard>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => pressed && s.pressed} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}>
      <LinearGradient colors={PROFILE_GRADIENT.relation} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
        <Leaves>
          <Ionicons name="heart" size={17} color="#FF8CC6" />
          <Text style={s.bannerTitle}>İlişki Duvarı</Text>
        </Leaves>
        <View style={s.bannerBody}>
          <Image source={ART.iliski} style={s.relArt} resizeMode="contain" />
          {partner ? (
            <View style={s.bannerData}>
              <Pair owner={owner} partner={partner.uri} size={52} />
              {days !== null && <Days days={days} />}
            </View>
          ) : (
            <Text style={[s.bannerEmpty, { flex: 1 }]}>Henüz bağ yok</Text>
          )}
          {onPress && <Ionicons name="chevron-forward" size={20} color="#fff" />}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/** One person of a Koruma (the server's top guardian, whom they guard most; the demo's sample supporter). */
export type GuardFace = { id: string; name: string; avatarUrl: string | null | undefined; points: number };
export type GuardEntry = { person: GuardFace; label: string };

/**
 * Koruma: everyone the area has (the top guardian, whom they guard), not one fixed person. The light row on Profil;
 * `hero`, the plum card heading Bağlar with the shield. `mine`: my own Koruma of them (someone else's profile).
 */
export function GuardWall({ people, mine, off, onPress, onOpen, hero }: { people: GuardEntry[]; mine?: { days: number; points: number } | null; off?: boolean; onPress: () => void; onOpen?: (id: string) => void; hero?: boolean }) {
  const [first, ...rest] = people;
  const empty = off ? 'Koruma kapalı' : 'Henüz koruyucusu yok';
  const ink = hero ? '#fff' : glass.ink;
  const dim = hero ? '#F6C9E3' : glass.plum;
  const label = first ? `Koruma: ${people.map((g) => `${g.label} ${g.person.name}`).join(', ')}` : `Koruma: ${empty}`;
  // A narrow phone leaves the shield picture out and draws the face smaller, so the name stays whole.
  const { width } = useWindowDimensions();
  const roomy = width >= 370;
  // The faces open their profiles and the rest of the card opens Koruma: side by side, never one button inside another.
  const body = (
    <>
      <View style={s.guardTop}>
        {first ? (
          <Pressable onPress={onOpen ? () => onOpen(first.person.id) : undefined} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={`${first.person.name} profilini aç`}>
            <Face uri={first.person.avatarUrl} size={hero && roomy ? 76 : 60} ring={hero ? '#FF7AC8' : glass.pink} />
          </Pressable>
        ) : (
          <View style={[s.guardEmptyFace, hero && { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.35)' }]}>
            <Ionicons name="shield-outline" size={28} color={hero ? GOLD : glass.plum} />
          </View>
        )}
        <Pressable style={({ pressed }) => [s.guardMain, pressed && s.pressed]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={s.guardLabelRow}>
              <Ionicons name="shield" size={16} color={GOLD} />
              <Text style={[s.guardLabel, { color: ink }]} numberOfLines={1}>
                {first?.label ?? 'Koruma'}
                {/* The hero has the shield beside it: its points are on Benim Koruma and the Profil card. */}
                {first && !hero && <Text style={[s.guardPoints, { color: dim }]}> · {guardPoints(first.person.points)} puan</Text>}
              </Text>
            </View>
            {first ? (
              <Text style={[s.guardName, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {first.person.name.toLocaleUpperCase('tr-TR')}
              </Text>
            ) : (
              <Text style={[s.sub, { color: dim }]} numberOfLines={2}>
                {empty}
              </Text>
            )}
            {first && hero && (
              <View style={s.activePill}>
                <View style={s.activeDot} />
                <Text style={s.activeText} numberOfLines={1}>
                  Aktif koruma
                </Text>
              </View>
            )}
          </View>
          {hero && roomy && <Image source={ART.koruma} style={s.guardArt} resizeMode="contain" accessibilityIgnoresInvertColors />}
          <Ionicons name="chevron-forward" size={20} color={hero ? '#fff' : glass.plum} />
        </Pressable>
      </View>
      {rest.map((g) => (
        <Pressable key={`${g.label}-${g.person.id}`} style={[s.guardMore, hero && s.guardMoreHero]} onPress={onOpen ? () => onOpen(g.person.id) : undefined} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={`${g.label}: ${g.person.name}`}>
          <Face uri={g.person.avatarUrl} size={36} ring={GOLD} />
          <Text style={[s.guardMoreText, { color: ink }]} numberOfLines={1}>
            <Text style={{ color: dim }}>{g.label} · </Text>
            {g.person.name}
          </Text>
          <Text style={[s.sub, { color: dim }]}>{guardPoints(g.person.points)}</Text>
        </Pressable>
      ))}
      {mine && (
        <Text style={[s.sub, { color: dim, marginTop: 6 }]} numberOfLines={2}>
          Sen de koruyorsun · {mine.days.toLocaleString('tr-TR')} gün · {guardPoints(mine.points)} puan
        </Text>
      )}
    </>
  );
  if (!hero) return <PCard>{body}</PCard>;
  return (
    <LinearGradient colors={PROFILE_GRADIENT.protection} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.guardHero}>
      {body}
    </LinearGradient>
  );
}

export type WallGift = { giftId: string; emoji: string };

/**
 * Hediye Duvarı on Profil: their most received gift large, the next three in a pill, and how many kinds of the
 * catalog they have (or, before the Vitrin is read, how many gifts).
 */
export function GiftWall({ top, lit, total, received, onPress }: { top: WallGift[]; lit: number | null; total: number | null; received: number | null; onPress: () => void }) {
  const kinds = lit !== null && !!total;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && s.pressed} accessibilityRole="button" accessibilityLabel={`Hediye Duvarı${kinds ? `: ${lit} / ${total} çeşit` : ''}`}>
      <LinearGradient colors={PROFILE_GRADIENT.gift} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
        <Leaves>
          <Ionicons name="gift" size={17} color="#C9B2FF" />
          <Text style={s.bannerTitle}>Hediye Duvarı</Text>
        </Leaves>
        <View style={s.bannerBody}>
          {top[0] ? <GiftArt giftId={top[0].giftId} emoji={top[0].emoji} size={58} textStyle={{ fontSize: 44 }} /> : <Image source={ART.hediye} style={{ width: 58, height: 58 }} resizeMode="contain" />}
          <View style={s.giftPill}>
            {[0, 1, 2].map((i) =>
              top[i] ? <GiftArt key={top[i].giftId} giftId={top[i].giftId} emoji={top[i].emoji} size={30} textStyle={{ fontSize: 24 }} /> : <View key={`e${i}`} style={s.giftEmpty} />,
            )}
          </View>
          <View style={s.giftCount}>
            <Text style={s.giftCountText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {kinds ? `${lit}/${total}` : received !== null ? guardPoints(received) : '—'}
            </Text>
            <Text style={s.giftCountSub}>{kinds ? 'çeşit' : 'hediye'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/** Vitrin Öğeleri: the three gifts they received most, side by side on the purple strip (empty slots dim). */
export function ShowcaseStrip({ top }: { top: WallGift[] }) {
  return (
    <LinearGradient colors={PROFILE_GRADIENT.gift} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.strip}>
      {[0, 1, 2].map((i) => (
        <View key={top[i]?.giftId ?? `e${i}`} style={s.stripCell}>
          {i > 0 && <View style={s.stripSep} />}
          <View style={s.stripItem}>{top[i] ? <GiftArt giftId={top[i].giftId} emoji={top[i].emoji} size={48} textStyle={{ fontSize: 36 }} /> : <View style={s.stripEmpty} />}</View>
        </View>
      ))}
    </LinearGradient>
  );
}

// --- Info ----------------------------------------------------------------------------------------------------

/** A card with an icon, a title and its text (Hakkımda, Arkadaşlık Sloganı, Doğrulama). */
export function InfoCard({ icon, tone, title, text, onPress, quiet, label }: { icon: IconName; tone: Tone; title: string; text: string; onPress?: () => void; quiet?: boolean; label?: string }) {
  return (
    <PCard onPress={onPress} label={label ?? `${title}: ${text}`} style={tone === 'blue' ? s.blueCard : undefined}>
      <CardHead icon={icon} tone={tone} title={title} chevron={!!onPress} sub={<Text style={[s.infoText, quiet && s.infoQuiet]}>{text}</Text>} />
    </PCard>
  );
}

/** Temel Bilgiler: a titled card of rows. */
export function InfoTable({ children }: { children: ReactNode }) {
  return (
    <PCard style={{ paddingBottom: 6 }}>
      <CardHead icon="person-outline" tone="soft" title="Temel Bilgiler" />
      <View style={s.rows}>{children}</View>
    </PCard>
  );
}

/** One row: its icon in a small well, the label (and a hint under it), the value, and copy when it can be copied. */
export function InfoLine({ icon, label, hint, children, onCopy, copyLabel }: { icon: IconName; label: string; hint?: string; children: ReactNode; onCopy?: () => void; copyLabel?: string }) {
  return (
    <View style={s.line}>
      <View style={s.lineIcon}>
        <Ionicons name={icon} size={17} color={glass.deep} />
      </View>
      {/* The label keeps its width; a long value gives way instead. */}
      <View style={{ flex: 1, minWidth: 96, gap: 2 }}>
        <Text style={s.lineLabel}>{label}</Text>
        {hint && <Text style={s.lineHint}>{hint}</Text>}
      </View>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{children}</View>
      {onCopy && (
        <Pressable onPress={onCopy} hitSlop={10} style={s.copy} accessibilityRole="button" accessibilityLabel={copyLabel ?? `${label} kopyala`}>
          <Ionicons name="copy-outline" size={18} color={glass.plum} />
        </Pressable>
      )}
    </View>
  );
}

/** A value in a row. */
export function LineValue({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <Text selectable style={[s.lineValue, accent ? { color: accent } : null]} numberOfLines={1} ellipsizeMode="middle">
      {children}
    </Text>
  );
}

/** A pill for an interest or a personal detail. */
export function PChip({ icon, emoji, art, label }: { icon?: IconName; emoji?: string; art?: ReactNode; label: string }) {
  return (
    <View style={s.chip}>
      {icon && <Ionicons name={icon} size={15} color={glass.plum} />}
      {art ?? (emoji ? <Text style={{ fontSize: 15 }}>{emoji}</Text> : null)}
      <Text style={s.chipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// --- Bağlar: agency, Aile, connections -----------------------------------------------------------------------

/** Ajans or Aile: its emblem on a plum square, its name and the person's role there. */
export function LinkCard({ emblem, icon, title, sub, onPress, empty, label }: { emblem?: string; icon: IconName; title: string; sub?: string; onPress?: () => void; empty?: boolean; label: string }) {
  return (
    <PCard onPress={onPress} label={label} style={s.linkCard}>
      <LinearGradient colors={['#7A1A63', '#3E0A30']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.emblem}>
        {emblem ? <Text style={{ fontSize: 26 }}>{emblem}</Text> : <Ionicons name={icon} size={26} color={GOLD} />}
      </LinearGradient>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[s.title, empty && s.emptyTitle]} numberOfLines={empty ? 2 : 1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={s.sub} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      {empty && <Text style={s.join}>Katıl</Text>}
      {onPress && <Ionicons name="chevron-forward" size={18} color={glass.plum} />}
    </PCard>
  );
}

/** Bağlantılar: Arkadaş, Takipçi, Takip as three pills (only mine open a list). */
export function ConnectionCounts({ items }: { items: { icon: IconName; label: string; n: number | null; onPress?: () => void }[] }) {
  // Three to a row: a wide phone puts icon, word and number on one line; a narrower one stacks the number over the
  // word, so no word is cut.
  const { width } = useWindowDimensions();
  const wide = width >= 390;
  return (
    <View style={s.counts}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          style={({ pressed }) => [s.count, !wide && s.countStack, pressed && s.pressed]}
          onPress={it.onPress}
          disabled={!it.onPress}
          accessibilityRole={it.onPress ? 'button' : 'text'}
          accessibilityLabel={it.n === null ? it.label : `${it.n.toLocaleString('tr-TR')} ${it.label}`}
        >
          {wide && <Ionicons name={it.icon} size={18} color={glass.deep} />}
          {wide ? (
            <Text style={s.countLabel} numberOfLines={1}>
              {it.label}
            </Text>
          ) : null}
          <Text style={s.countN} numberOfLines={1}>
            {it.n === null ? '—' : it.n.toLocaleString('tr-TR')}
          </Text>
          {!wide && (
            <Text style={s.countUnder} numberOfLines={1}>
              {it.label}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// --- Vitrin: the room ----------------------------------------------------------------------------------------

/** Their room: its cover, its name with a crown, and how many are in it (or its announcement). */
export function RoomBanner({ cover, title, line, people, level, onPress }: { cover: string | undefined; title: string; line: string | null; people: number | null; level: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && s.pressed} accessibilityRole="button" accessibilityLabel={`Oda: ${title}${people !== null ? `, ${people} kişi içeride` : ''}`}>
      <LinearGradient colors={PROFILE_GRADIENT.relation} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.room}>
        <Photo uri={cover} kind="cover" seed={title} style={s.roomCover} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={s.roomTitleRow}>
            <Ionicons name="ribbon" size={16} color={GOLD} />
            <Text style={s.roomTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {people !== null && (
            <View style={s.roomPill}>
              <Ionicons name="people-outline" size={14} color="#fff" />
              <Text style={s.roomPillText} numberOfLines={1}>
                {people.toLocaleString('tr-TR')} kişi içeride
              </Text>
            </View>
          )}
          {!!line && (
            <Text style={s.roomLine} numberOfLines={2}>
              {line}
            </Text>
          )}
          {level}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#fff" />
      </LinearGradient>
    </Pressable>
  );
}

// --- Faces ---------------------------------------------------------------------------------------------------

export function Face({ uri, size, ring = GOLD, style }: { uri: string | null | undefined; size: number; ring?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ring, overflow: 'hidden', backgroundColor: glass.well }, style]}>
      {uri ? <Photo uri={uri} kind="face" style={{ width: '100%', height: '100%' }} /> : <Ionicons name="person" size={size * 0.55} color={glass.plum} style={{ alignSelf: 'center', marginTop: size * 0.2 }} />}
    </View>
  );
}

export const PROFILE_COLORS = { gold: GOLD, verified: VERIFIED, success: SUCCESS } as const;

const s = StyleSheet.create({
  card: { backgroundColor: glass.white, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: glass.line, boxShadow: glass.shadow },
  blueCard: { backgroundColor: '#F7FBFF', borderColor: 'rgba(22,140,205,0.25)' },
  pressed: { opacity: 0.85 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: glass.ink, fontSize: 17, fontFamily: fonts.displayBold },
  emptyTitle: { color: glass.plum, fontFamily: undefined, fontWeight: '600', fontSize: 14 },
  sub: { color: glass.plum, fontSize: 13 },
  infoText: { color: glass.ink, fontSize: 14, lineHeight: 20 },
  infoQuiet: { color: glass.plum, fontStyle: 'italic' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingHorizontal: 4 },
  labelText: { color: glass.deep, fontSize: 18, fontFamily: fonts.displayBold },
  labelLine: { flex: 1, height: 1, backgroundColor: glass.line, marginLeft: 6 },
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: glass.white, borderRadius: 20, paddingVertical: 12, borderWidth: 1, borderColor: glass.line, boxShadow: glass.shadow },
  statCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statSep: { width: 1, height: 28, backgroundColor: glass.line },
  stat: { flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  statN: { color: glass.ink, fontSize: 21, fontFamily: fonts.display },
  statL: { color: glass.plum, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10 },
  edit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 24, paddingHorizontal: 16 },
  editText: { color: '#fff', fontSize: 16, fontFamily: fonts.displayBold, flexShrink: 1 },
  share: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 24, paddingHorizontal: 12, backgroundColor: glass.fill, borderWidth: 1.5, borderColor: glass.line },
  shareText: { color: glass.deep, fontSize: 16, fontFamily: fonts.displayBold, flexShrink: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: glass.well, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  pct: { color: glass.deep, fontSize: 14, fontWeight: '900', backgroundColor: glass.tint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden' },
  banner: { borderRadius: 22, padding: 12, gap: 6, borderWidth: 1, borderColor: 'rgba(242,198,110,0.45)', overflow: 'hidden', boxShadow: glass.shadow },
  leaves: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bannerTitle: { color: '#fff', fontSize: 18, fontFamily: fonts.displayBold },
  bannerBody: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  bannerData: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  bannerEmpty: { color: '#F6C9E3', fontSize: 14 },
  relArt: { width: 80, height: 46 },
  relArtSmall: { width: 40, height: 23 },
  relRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  relTitle: { color: glass.ink, fontSize: 16, fontFamily: fonts.displayBold, flexShrink: 1 },
  pair: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  pairHeart: { position: 'absolute', bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: glass.pink, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  days: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, borderColor: GOLD, backgroundColor: '#FFF8FC', paddingHorizontal: 12, paddingVertical: 5 },
  daysText: { color: '#7A1450', fontSize: 15, fontWeight: '900' },
  daysSmall: { gap: 3, paddingHorizontal: 8, paddingVertical: 3 },
  guardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  guardMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 },
  guardEmptyFace: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: glass.well, borderWidth: 1.5, borderStyle: 'dashed', borderColor: glass.line },
  guardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guardLabel: { fontSize: 16, fontFamily: fonts.displayBold, flexShrink: 1 },
  guardPoints: { fontSize: 13, fontFamily: undefined, fontWeight: '600' },
  guardName: { fontSize: 22, fontFamily: fonts.display },
  guardArt: { width: 60, height: 68, opacity: 0.95 },
  guardHero: { borderRadius: 22, padding: 14, borderWidth: 1, borderColor: 'rgba(242,198,110,0.45)', boxShadow: glass.shadow, overflow: 'hidden' },
  guardMore: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: glass.line },
  guardMoreHero: { borderTopColor: 'rgba(255,255,255,0.2)' },
  guardMoreText: { flex: 1, fontSize: 14, fontWeight: '800' },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: '#FFF8FC', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#22C55E' },
  activeText: { color: glass.ink, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  giftPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(104,202,255,0.35)', paddingVertical: 6 },
  giftEmpty: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.08)' },
  giftCount: { alignItems: 'center', minWidth: 58, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)', paddingLeft: 8 },
  giftCountText: { color: GOLD, fontSize: 22, fontFamily: fonts.display },
  giftCountSub: { color: '#E5D9FF', fontSize: 12 },
  strip: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingVertical: 10, overflow: 'hidden' },
  stripCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stripSep: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.22)' },
  stripItem: { flex: 1, alignItems: 'center' },
  stripEmpty: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  rows: { marginTop: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: glass.line },
  lineIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: glass.well, alignItems: 'center', justifyContent: 'center' },
  lineLabel: { color: glass.ink, fontSize: 15 },
  lineHint: { color: glass.plum, fontSize: 12 },
  lineValue: { color: glass.ink, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  copy: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  chip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: glass.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: glass.line },
  chipText: { color: glass.ink, fontSize: 14, flexShrink: 1 },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  emblem: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  join: { color: glass.deep, fontWeight: '800', fontSize: 13 },
  counts: { flexDirection: 'row', gap: 8 },
  count: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, paddingHorizontal: 10, borderRadius: 16, backgroundColor: glass.white, borderWidth: 1, borderColor: glass.line, boxShadow: glass.shadow },
  countLabel: { flex: 1, color: glass.ink, fontSize: 14, minWidth: 0 },
  countStack: { flexDirection: 'column', justifyContent: 'center', gap: 0, paddingVertical: 6 },
  countUnder: { color: glass.plum, fontSize: 13 },
  countN: { color: glass.ink, fontSize: 18, fontFamily: fonts.display },
  room: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 10, overflow: 'hidden' },
  roomCover: { width: 96, height: 72, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomTitle: { color: '#fff', fontSize: 17, fontFamily: fonts.displayBold, flexShrink: 1 },
  roomPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  roomPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  roomLine: { color: '#F6C9E3', fontSize: 13 },
});
