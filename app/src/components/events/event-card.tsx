// Etkinlik Merkezi: one event in a list. The cover is the event's own picture, else its theme's colours with the
// category's sign (the theme art comes from docs/GORSEL_URETIM_LISTESI.md § 20). The time, the state and the places
// are the server's (server/api/events.mjs).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { FadeImage } from '@/components/photo';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import type { EventItem } from '@/lib/api';
import { lookOf, placesText, timeLine } from '@/lib/events';
import { makeStyles, useTheme } from '@/theme';

type Glyph = keyof typeof Ionicons.glyphMap;

/** The state's pill colours: live turquoise, upcoming gold, the rest quiet. */
export function StatePill({ e, small }: { e: Pick<EventItem, 'state' | 'stateLabel'>; small?: boolean }) {
  const { semantic, colors } = useTheme();
  const styles = useStyles();
  const tone =
    e.state === 'live'
      ? { bg: semantic.live, fg: semantic.liveInk }
      : e.state === 'upcoming'
        ? { bg: semantic.money, fg: semantic.moneyInk }
        : e.state === 'rejected' || e.state === 'cancelled'
          ? { bg: 'rgba(239,68,68,0.16)', fg: semantic.danger }
          : e.state === 'review' || e.state === 'draft'
            ? { bg: semantic.tonal, fg: semantic.tonalText }
            : { bg: colors.cardAlt, fg: colors.textDim };
  return (
    <View style={[styles.pill, small && styles.pillSmall, { backgroundColor: tone.bg }]}>
      {e.state === 'live' && <View style={[styles.liveDot, { backgroundColor: tone.fg }]} />}
      <Text style={[styles.pillText, small && { fontSize: 11 }, { color: tone.fg }]} numberOfLines={1}>
        {e.stateLabel}
      </Text>
    </View>
  );
}

/** The cover: the uploaded picture, else the theme's gradient with the category's sign. */
export function EventCover({ e, height, radius = 18 }: { e: Pick<EventItem, 'coverUrl' | 'theme' | 'category'>; height: number; radius?: number }) {
  const look = lookOf(e.theme);
  const styles = useStyles();
  return (
    <View style={{ height, borderRadius: radius, overflow: 'hidden' }}>
      <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
        <Ionicons name={(e.category.icon as Glyph) in Ionicons.glyphMap ? (e.category.icon as Glyph) : look.icon} size={height * 0.36} color="rgba(255,255,255,0.9)" />
        <Ionicons name={look.icon} size={height * 0.9} color="rgba(255,255,255,0.08)" style={styles.watermark} />
      </LinearGradient>
      {e.coverUrl && <FadeImage source={{ uri: e.coverUrl }} style={styles.fill} resizeMode="cover" />}
    </View>
  );
}

export const EventCard = memo(function EventCard({ e, onPress, now }: { e: EventItem; onPress: () => void; now: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]} accessibilityRole="button" accessibilityLabel={`${e.title}, ${e.stateLabel}`}>
      <View>
        <EventCover e={e} height={150} radius={16} />
        <View style={styles.tag}>
          <Ionicons name={(e.category.icon as Glyph) in Ionicons.glyphMap ? (e.category.icon as Glyph) : 'sparkles'} size={12} color="#fff" />
          <Text style={styles.tagText} numberOfLines={1}>
            {e.category.name}
          </Text>
        </View>
        <View style={styles.statePos}>
          <StatePill e={e} small />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {e.title}
        </Text>
        <View style={styles.row}>
          <Avatar uri={e.host.avatarUrl ?? undefined} name={e.host.name} size={22} />
          <Text style={styles.host} numberOfLines={1}>
            {e.host.name} · {e.room.title}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <Ionicons name={e.state === 'live' ? 'radio' : 'time-outline'} size={14} color={e.state === 'live' ? colors.primaryText : colors.textDim} />
            <Text style={[styles.metaText, e.state === 'live' && { color: colors.primaryText }]} numberOfLines={1}>
              {timeLine(e, now)}
            </Text>
          </View>
          <View style={styles.meta}>
            <Ionicons name="people-outline" size={14} color={colors.textDim} />
            <Text style={styles.metaText} numberOfLines={1}>
              {placesText(e)}
            </Text>
          </View>
        </View>
        {e.mine === 'confirmed' && (
          <View style={styles.mine}>
            <Ionicons name="checkmark-circle" size={14} color={colors.green} />
            <Text style={[styles.metaText, { color: colors.green }]}>Yerin ayrıldı</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const useStyles = makeStyles(({ colors }) => ({
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 8, borderWidth: 1, borderColor: colors.border },
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  watermark: { position: 'absolute', right: -18, bottom: -24 },
  tag: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,12,30,0.55)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, maxWidth: '60%' },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  statePos: { position: 'absolute', right: 10, top: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '800' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  body: { paddingHorizontal: 6, paddingTop: 10, paddingBottom: 4, gap: 7 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  host: { color: colors.textDim, fontSize: 13, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  metaText: { color: colors.textDim, fontSize: 12.5, fontWeight: '600' },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
}));
