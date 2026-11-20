// İz önizleme (Yönetim › Hediyeler › "İz türlerini önizle"; docs/HEDIYE_YONETIMI.md): how a profile mark kind looks
// on a photo with this phone's own drawing, at the sizes the app really uses: a room's mic faces (30 px when six share a
// row, 52 the standard, 96 the largest, 112 the host's), the person card (78) and a profile (96), each without a frame,
// with a VIP ring and with a shop frame, on a light and a dark ground; and its landing and cleaning played. The kinds
// are the app's own (Kaka İzi, Kırık Cam) and every kind the catalog lists (an overlay uploaded in the panel shows
// here as on everyone's phone). The photo under it is my own (a real one, as the spec asks), else ?foto=<address>.
// It reads and changes nothing on the server: the marks and faces are this screen's own (lib/live/marks-live
// PREVIEW_KEY). ?tur=<kind>&zemin=acik|koyu open it on one.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkLayer } from '@/components/profile-mark';
import { Seat } from '@/components/room/parts';
import { Text } from '@/components/text';
import { Avatar, FramedAvatar } from '@/components/ui';
import { ME, USERS, putServerUser } from '@/data/mock';
import { liveMode } from '@/lib/live';
import { everyGift, giftMarkOf, markKinds, useLiveCatalog } from '@/lib/live/catalog-live';
import { PREVIEW_KEY } from '@/lib/live/marks-live';
import { applyMarkNews, putMarks } from '@/lib/mark-store';
import { goBack } from '@/lib/nav';
import { COMPILED_MARKS } from '@/lib/profile-marks';
import { serverNow } from '@/lib/sanction-time';
import { makeStyles } from '@/theme';

/** The faces the app draws: a mic at its smallest, standard and largest, the host's; the person card; a profile. */
const SEATS = [30, 52, 96, 112];
const LOOKS: { label: string; vip: number; frame?: string }[] = [
  { label: 'Çerçevesiz', vip: 0 },
  { label: 'VIP 6', vip: 6 },
  { label: 'Mağaza çerçevesi', vip: 0, frame: 'fr-crown-gold' },
];
/** The pilots' gifts, for the badge where a kind has no picture: the app's own until the catalog names one. */
const PILOT: Record<string, { gift: string; emoji: string }> = { kaka: { gift: 'k1', emoji: '💩' }, 'kirik-cam': { gift: 'p8', emoji: '🩴' } };
const keyOf = (n: number) => `${PREVIEW_KEY}${n}`;
const KEYS = Array.from({ length: 20 }, (_, i) => keyOf(i));

export default function MarkPreview() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tur?: string; zemin?: string; foto?: string }>();
  // The photo the marks sit on: an address given (?foto=), else mine.
  const face = typeof params.foto === 'string' && /^https?:\/\/\S{1,600}$/.test(params.foto) ? params.foto : ME.avatar;
  // The preview faces are people of their own (lib/live/marks-live PREVIEW_KEY), with that photo.
  // (Kept before the faces are drawn: the seats read them by id.)
  for (const k of KEYS) putServerUser({ id: k, name: 'Ayşe', avatar: face, verified: false });
  const catalog = useLiveCatalog();
  const kinds = useMemo(() => {
    const live = markKinds(catalog);
    return [...new Set([...COMPILED_MARKS, ...Object.keys(live)])].map((kind) => ({ kind, name: live[kind]?.name ?? (kind === 'kaka' ? 'Kaka İzi' : kind === 'kirik-cam' ? 'Kırık Cam' : kind), art: !!live[kind]?.art }));
  }, [catalog]);
  const [kind, setKind] = useState(typeof params.tur === 'string' && params.tur ? params.tur : 'kaka');
  const [light, setLight] = useState(params.zemin === 'acik');
  // The gift that leaves this kind (its badge): one on the shelves, else the pilot's.
  const leave = useMemo(() => {
    const g = everyGift(catalog).find((x) => giftMarkOf(x.id, catalog)?.role === 'leave' && giftMarkOf(x.id, catalog)?.kind === kind);
    return g ? { gift: g.id, emoji: g.emoji } : (PILOT[kind] ?? { gift: 'k1', emoji: '🎁' });
  }, [catalog, kind]);
  const mark = useMemo(() => ({ kind, gift: leave.gift, emoji: leave.emoji, until: serverNow() + 3_600_000 }), [kind, leave]);
  useEffect(() => {
    for (const k of KEYS) putMarks(k, [mark]);
  }, [mark]);
  const land = () => KEYS.forEach((k) => applyMarkNews(k, { role: 'leave', kind, gift: leave.gift, emoji: leave.emoji, until: serverNow() + 3_600_000 }));
  const wash = () => {
    KEYS.forEach((k) => applyMarkNews(k, { role: 'clean', kind, gift: 'k2', emoji: '💧' }));
    setTimeout(() => KEYS.forEach((k) => putMarks(k, [{ ...mark, until: serverNow() + 3_600_000 }])), 2_500);
  };
  // The demo (no server): the same mark on the sample people, then their room, so a real seat, person card and
  // profile can be looked at too. Live, nobody's marks are touched.
  const tryInRoom = () => {
    for (const u of USERS) {
      putMarks(u.id, [{ ...mark, until: serverNow() + 3_600_000 }]);
      if (face) u.avatar = face;
    }
    router.push('/oda/r1');
  };
  const ground = light ? '#F4F1EA' : '#160F28';
  const ink = light ? '#1B1530' : '#FFFFFF';
  // Each face its own mark (one key each), so a landing or a clean plays on all of them at once.
  const at = (look: number, seat: number) => look * SEATS.length + seat;
  const card = LOOKS.length * SEATS.length;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: ground }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 12, gap: 14 }}>
      <View style={styles.bar}>
        <Pressable onPress={() => goBack('/')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Geri">
          <Ionicons name="arrow-back" size={24} color={ink} />
        </Pressable>
        <Text style={[styles.title, { color: ink }]} accessibilityRole="header">
          İz önizleme
        </Text>
      </View>
      <Text style={[styles.hint, { color: ink }]}>Bu telefonun çizimiyle, uygulamanın gerçek boylarında. Sunucuda hiçbir şey değişmez.</Text>
      <View style={styles.chips}>
        {kinds.map((k) => (
          <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[styles.chip, k.kind === kind && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: k.kind === kind }}>
            <Text style={[styles.chipText, k.kind === kind && styles.chipTextOn]}>{`${k.name}${k.art ? ' · yüklenen resim' : ''}`}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setLight((v) => !v)} style={styles.chip} accessibilityRole="button">
          <Text style={styles.chipText}>{light ? 'Açık zemin' : 'Koyu zemin'}</Text>
        </Pressable>
        <Pressable onPress={land} style={styles.chip} accessibilityRole="button">
          <Text style={styles.chipText}>Düşüşü oynat</Text>
        </Pressable>
        <Pressable onPress={wash} style={styles.chip} accessibilityRole="button">
          <Text style={styles.chipText}>Temizlenmeyi oynat</Text>
        </Pressable>
        {!liveMode() && (
          <Pressable onPress={tryInRoom} style={styles.chip} accessibilityRole="button">
            <Text style={styles.chipText}>Örnek odada dene</Text>
          </Pressable>
        )}
      </View>
      {LOOKS.map((look, li) => (
        <View key={look.label} style={styles.section}>
          <Text style={[styles.label, { color: ink }]}>{`Oda koltuğu · ${look.label}`}</Text>
          <View style={styles.row}>
            {SEATS.map((size, si) => (
              <View key={size} style={{ alignItems: 'center' }}>
                <Seat
                  index={at(li, si)}
                  userId={keyOf(at(li, si))}
                  host={size === 112}
                  vipLevel={look.vip}
                  frameId={look.frame}
                  speaking={false}
                  muted
                  still
                  avatarSize={size}
                  slotWidth={Math.max(64, size + 24)}
                  onPress={() => {}}
                />
                <Text style={[styles.size, { color: ink }]}>{`${size} px`}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <View style={styles.section}>
        <Text style={[styles.label, { color: ink }]}>Kişi kartı (78) · Profil (96: kendi, başkasının)</Text>
        <View style={styles.row}>
          <FramedAvatar uri={face} size={78} vipLevel={6} markUid={keyOf(card)} />
          <FramedAvatar uri={face} size={96} vipLevel={0} frameId="fr-silver" markUid={keyOf(card + 1)} />
          <View style={{ width: 96, height: 96 }}>
            <Avatar uri={face} size={96} />
            <MarkLayer uid={keyOf(card + 2)} size={96} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 20, fontWeight: '800' },
  hint: { fontSize: 12.5, opacity: 0.8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: c.cardAlt },
  chipOn: { backgroundColor: c.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: c.text },
  chipTextOn: { color: '#FFFFFF' },
  section: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, flexWrap: 'wrap' },
  size: { fontSize: 11, opacity: 0.7 },
}));
