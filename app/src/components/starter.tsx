// "İlk adımlar": a short path for new people on the home tab. Every step is something that makes the
// app click (join a room, greet someone, send a first gift); progress comes from real app state, and
// finishing all of them pays a one-time reward. Closable; disappears once the reward is claimed.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { RewardBurst } from '@/components/fx/reward';
import { Icon3D, type Icon3DName } from '@/components/Icon3D';
import { liveMode } from '@/lib/live';
import { useApp } from '@/store';
import { makeStyles } from '@/theme';

const REWARD = 300;
/** Tümü and the close button: 44 dp tall, and their touch areas stay apart. */
const HEAD_SLOP = { top: 13, bottom: 13, left: 4, right: 4 };

type Step = { key: string; icon: Icon3DName; title: string; done: boolean; href: Href };

/**
 * `roomHref`: where "join a room" and "first gift" lead. A live build has no sample rooms (their bots would take
 * real coins): the home tab passes a real open room. Without one, "join" opens my own room (or its create sheet)
 * and the first gift goes from a real person's profile in Keşfet.
 */
export function StarterPath({ roomHref }: { roomHref?: Href } = {}) {
  const { me, recentRooms, stats, following, checkedInToday, starter, claimStarter, hideStarter, settings } = useApp();
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const s = useStyles();
  if (starter.hidden || (starter.claimed && !celebrate)) return null;

  const noRoom = liveMode() && !roomHref;
  const room: Href = roomHref ?? (noRoom ? '/oda/yeni' : '/oda/r1');
  const giftAt: Href = roomHref ?? (noRoom ? '/(tabs)/kesfet' : '/oda/r1');
  const steps: Step[] = [
    { key: 'interests', icon: 'heart', title: 'İlgi alanlarını seç', done: (me.interests?.length ?? 0) >= 2, href: '/kullanici/me' },
    { key: 'room', icon: 'mic', title: noRoom ? 'Bir oda aç' : 'Bir odaya katıl', done: recentRooms.length > 0, href: room },
    { key: 'greet', icon: 'chat', title: 'Birine selam ver', done: stats.greetings > 0, href: '/(tabs)/kesfet' },
    { key: 'follow', icon: 'crown', title: 'Birini takip et', done: following.size >= 2, href: '/(tabs)/kesfet' },
    { key: 'gift', icon: 'gift', title: 'İlk hediyeni gönder', done: stats.giftsSent > 0, href: giftAt },
    { key: 'checkin', icon: 'tasks', title: 'Günlük ödülünü al', done: checkedInToday, href: '/gorevler' },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  const next = steps.find((x) => !x.done);
  const shown = open ? steps : next ? [next] : [];

  return (
    // The owners' neon card (23 Nov 2026): deep navy glass inside a pink-to-blue neon rim, in either colour scheme.
    <LinearGradient colors={NEON.rim} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.rim}>
      <LinearGradient colors={NEON.fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.head}>
        <Image source={ROCKET} style={s.rocket} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={s.title}>İlk adımlar</Text>
        <Text style={s.count}>
          {doneCount}/{steps.length}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={HEAD_SLOP} style={s.linkRow} accessibilityLabel={open ? 'Adımları gizle' : 'Tüm adımları göster'}>
          <Text style={s.link}>{open ? 'Gizle' : 'Tümü'}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-forward'} size={15} color={NEON.pink} />
        </Pressable>
        <Pressable onPress={hideStarter} hitSlop={HEAD_SLOP} accessibilityLabel="İlk adımlar kartını kapat">
          <Ionicons name="close" size={18} color={NEON.dim} />
        </Pressable>
      </View>
      <View style={s.track}>
        <LinearGradient colors={['#FF3FD0', '#FF2DB8', '#F05BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: `${(doneCount / steps.length) * 100}%` }]} />
      </View>

      {shown.map((x) => (
        <Pressable key={x.key} style={s.row} onPress={() => !x.done && router.push(x.href)} disabled={x.done} accessibilityLabel={`${x.title}${x.done ? ', tamamlandı' : ''}`}>
          <Icon3D name={x.icon} size={32} style={x.done ? { opacity: 0.45 } : undefined} />
          <Text style={[s.stepText, x.done && s.stepDone]} numberOfLines={1}>
            {x.title}
          </Text>
          {x.done ? (
            <Ionicons name="checkmark-circle" size={22} color="#42E5A3" />
          ) : (
            <LinearGradient colors={['#FF4FCB', '#D81B93', '#A80E78']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={s.goPill}>
              <Text style={s.go}>Git</Text>
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </LinearGradient>
          )}
        </Pressable>
      ))}

      {!next && !starter.claimed && (
        <Pressable
          style={s.claim}
          onPress={() => {
            claimStarter(REWARD);
            setCelebrate(true);
          }}
          accessibilityLabel={`${REWARD} jeton ödülü al`}
        >
          <Icon3D name="coin" size={22} />
          <Text style={s.claimText}>Hepsi tamam! {REWARD} jetonu al</Text>
        </Pressable>
      )}
      {next && (
        <View style={s.hintRow}>
          <Icon3D name="gift" size={22} />
          <Text style={s.hint}>Hepsini bitirince</Text>
          <Icon3D name="coin" size={18} />
          <Text style={s.hint}>{REWARD} hediye</Text>
        </View>
      )}

      <Modal visible={celebrate} transparent animationType="fade" onRequestClose={() => setCelebrate(false)}>
        {celebrate && <RewardBurst reward={{ icon: 'trophy', title: 'İlk adımları tamamladın!', amount: REWARD }} still={settings.reduceMotion} onDone={() => setCelebrate(false)} />}
      </Modal>
      </LinearGradient>
    </LinearGradient>
  );
}

/** The design's colours: the rim (pink, violet, blue, pink), the card's navy glass and its pink. */
const NEON = {
  rim: ['#FF4FD8', '#B44CFF', '#3D8BFF', '#22D3FF', '#FF4FD8'],
  fill: ['#1E0F45', '#140A33', '#1D0B3A'],
  pink: '#FF6FE0',
  dim: 'rgba(255,255,255,0.55)',
} as const;
const ROCKET = require('../../assets/home/ilk-adimlar/roket.webp');

const useStyles = makeStyles(({ semantic }) => ({
  rim: { marginHorizontal: 16, borderRadius: 22, padding: 1.5, boxShadow: '0 0 14px rgba(255,60,210,0.45), 0 0 22px rgba(60,140,255,0.3)' },
  card: { borderRadius: 20.5, paddingHorizontal: 14, paddingVertical: 12, gap: 9 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rocket: { width: 28, height: 26 },
  title: { color: '#FFFFFF', fontWeight: '900', fontSize: 17 },
  count: { color: NEON.pink, fontWeight: '900', fontSize: 15 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 8 },
  link: { color: NEON.pink, fontWeight: '800', fontSize: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)' },
  fill: { height: 8, borderRadius: 4, boxShadow: '0 0 8px rgba(255,60,210,0.9)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  stepText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, flex: 1 },
  stepDone: { color: 'rgba(255,255,255,0.5)', textDecorationLine: 'line-through' },
  goPill: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 14, paddingRight: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,190,240,0.9)', boxShadow: '0 0 10px rgba(255,60,200,0.6)' },
  go: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { color: 'rgba(255,255,255,0.82)', fontSize: 13 },
  claim: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: semantic.money, borderRadius: 999, paddingVertical: 11 },
  claimText: { color: semantic.moneyInk, fontWeight: '900', fontSize: 15 },
}));
