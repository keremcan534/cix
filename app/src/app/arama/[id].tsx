import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CoinPill, VerifiedBadge } from '@/components/ui';
import { callPrice } from '@/data/economy';
import { GIFTS, userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Phase = 'ringing' | 'connected' | 'ended';

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function CallScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: 'sesli' | 'goruntulu' }>();
  const user = userById(id);
  const video = mode !== 'sesli';
  const price = video ? callPrice(user) : Math.round(callPrice(user) / 2);
  const { coins, spendCoins, bump, me } = useApp();

  const [phase, setPhase] = useState<Phase>('ringing');
  const [seconds, setSeconds] = useState(0);
  const [spent, setSpent] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [front, setFront] = useState(true);
  const [floating, setFloating] = useState<string | null>(null);
  const pulse = useState(() => new Animated.Value(0))[0];
  const spentRef = useRef(0);

  // Ringing -> connected after 2.5s.
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    const t = setTimeout(() => {
      if (!spendCoins(price)) {
        setPhase('ended');
        showAlert('Yetersiz jeton', `Bu arama dakikada ${price} jeton. Jeton yükleyip tekrar dene.`, [{ text: 'Tamam', onPress: () => router.back() }]);
        return;
      }
      spentRef.current = price;
      setSpent(price);
      setPhase('connected');
      bump('calls');
    }, 2500);
    return () => {
      loop.stop();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call timer.
  useEffect(() => {
    if (phase !== 'connected') return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Charge at the start of each new minute.
  useEffect(() => {
    if (phase !== 'connected' || seconds === 0 || seconds % 60 !== 0) return;
    if (spendCoins(price)) {
      spentRef.current += price;
      setSpent(spentRef.current);
    } else {
      setPhase('ended');
      showAlert('Jetonun bitti', 'Arama sonlandırıldı.', [{ text: 'Tamam', onPress: () => router.back() }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  const hangUp = () => {
    setPhase('ended');
    showAlert('Arama bitti', `Süre: ${mmss(seconds)} · Harcanan: ${spentRef.current} jeton`, [{ text: 'Tamam', onPress: () => router.back() }]);
  };

  const sendGift = () => {
    const gift = GIFTS[2];
    if (!spendCoins(gift.price)) return showAlert('Yetersiz jeton');
    bump('giftsSent');
    setFloating(gift.emoji);
    setTimeout(() => setFloating(null), 1200);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* "Remote video": the other person's photo, blurred while ringing / for voice calls. */}
      <Image source={{ uri: user.avatar.replace('200', '800') }} style={StyleSheet.absoluteFill} blurRadius={phase === 'connected' && video ? 0 : 30} />
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name}>{user.name}</Text>
              {user.verified && <VerifiedBadge size={16} />}
            </View>
            <Text style={styles.sub}>
              {phase === 'ringing' ? (video ? 'Görüntülü arama · Çalıyor...' : 'Sesli arama · Çalıyor...') : phase === 'connected' ? mmss(seconds) : 'Arama bitti'}
            </Text>
          </View>
          <CoinPill coins={coins} />
        </View>

        {phase === 'ringing' && (
          <View style={styles.center}>
            <Animated.View
              style={[
                styles.ripple,
                { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] },
              ]}
            />
            <Image source={{ uri: user.avatar }} style={styles.bigAvatar} />
            <Text style={styles.priceNote}>
              🪙 {price} jeton / dakika · {user.name} her dakika için elmas kazanır
            </Text>
          </View>
        )}

        {phase === 'connected' && video && (
          <View style={styles.selfView}>
            {camOn ? (
              <Image source={{ uri: me.avatar }} style={{ flex: 1, transform: [{ scaleX: front ? -1 : 1 }] }} />
            ) : (
              <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="videocam-off" size={26} color="#fff" />
              </View>
            )}
          </View>
        )}

        {phase === 'connected' && (
          <View style={styles.meter}>
            <Text style={styles.meterText}>
              🪙 {price}/dk · Harcanan {spent}
            </Text>
          </View>
        )}

        {floating && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 120 }}>{floating}</Text>
          </View>
        )}

        <View style={{ flex: 1 }} />

        <View style={styles.controls}>
          <Ctrl icon={micOn ? 'mic' : 'mic-off'} active={!micOn} onPress={() => setMicOn((v) => !v)} />
          {video && <Ctrl icon={camOn ? 'videocam' : 'videocam-off'} active={!camOn} onPress={() => setCamOn((v) => !v)} />}
          {video && <Ctrl icon="camera-reverse" onPress={() => setFront((v) => !v)} />}
          <Ctrl icon="gift" onPress={sendGift} gift />
          <Pressable style={[styles.ctrl, { backgroundColor: colors.red, width: 64, height: 64, borderRadius: 32 }]} onPress={hangUp}>
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Ctrl({ icon, onPress, active, gift }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; gift?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.ctrl, active && { backgroundColor: '#fff' }, gift && { backgroundColor: colors.pink }]}>
      <Ionicons name={icon} size={24} color={active ? '#000' : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  center: { alignItems: 'center', marginTop: 60, gap: 24 },
  ripple: { position: 'absolute', top: 0, width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' },
  bigAvatar: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' },
  priceNote: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, fontSize: 13, textAlign: 'center', marginHorizontal: 24 },
  selfView: { position: 'absolute', right: 16, top: 110, width: 100, height: 150, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: '#333' },
  meter: { alignSelf: 'flex-start', marginLeft: 16, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  meterText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, paddingBottom: 24 },
  ctrl: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
