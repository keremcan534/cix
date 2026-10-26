// Hemen Tanış call screen. Opened by MatchLayer when a match connects; a room the user was in stays
// open underneath ("Odaya dön" goes back to it, still as a listener).
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { IncomingCard } from '@/components/match-layer';
import { VerifiedBadge } from '@/components/ui';
import { MATCH_GRACE_SECONDS } from '@/data/economy';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useMedia } from '@/lib/media';
import { PHASE_LABEL, cancelMatch, dropConnection, hangUp, modeLabel, nextMatch, priceOf, resetMatch, startMatch, useMatch } from '@/lib/match';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const REPORT_REASONS = ['Uygunsuz görüntü', 'Taciz / hakaret', 'Reşit değil', 'Dolandırıcılık', 'Sahte profil'];

export default function MatchCall() {
  const m = useMatch();
  const media = useMedia();
  const { me, toggleBlock, createTicket, logSafety } = useApp();
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [camDenied, setCamDenied] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'more' | 'report'>('none');
  const [pulse] = useState(() => new Animated.Value(0));

  const active = m.phase === 'active';
  const video = m.mode === 'video';
  const peer = m.peerId ? userById(m.peerId) : m.last ? userById(m.last.peerId) : null;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Camera is used only with the user's permission; voice matches never need it.
  useEffect(() => {
    if (!active || !video || Platform.OS === 'web') return;
    ImagePicker.requestCameraPermissionsAsync().then((p) => {
      if (!p.granted) {
        setCamDenied(true);
        setCamOn(false);
      }
    });
  }, [active, video]);

  const leave = () => {
    if (active) return hangUp();
    resetMatch();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Not connected (anymore): searching for the next one, waiting, or the end-of-call summary.
  if (!active) {
    const last = m.last;
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.top}>
          <Pressable onPress={leave} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={s.topTitle}>{modeLabel(m.mode)}</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={s.center}>
          {['found', 'awaiting_peer', 'connecting'].includes(m.phase) ? (
            <IncomingCard inline />
          ) : m.phase === 'searching' ? (
            <>
              <Text style={s.state}>{PHASE_LABEL.searching}…</Text>
              <Pressable style={s.secondary} onPress={cancelMatch}>
                <Text style={s.secondaryText}>Aramayı iptal et</Text>
              </Pressable>
            </>
          ) : (
            <View style={s.summary}>
              <Text style={s.state}>{PHASE_LABEL[m.phase]}</Text>
              {!!m.message && <Text style={s.dim}>{m.message}</Text>}
              {last && peer && (
                <View style={s.summaryCard}>
                  <Image source={{ uri: peer.avatar }} style={s.summaryAvatar} />
                  <Text style={s.summaryName}>{peer.name}</Text>
                  <Text style={s.dim}>
                    Süre {mmss(last.seconds)} · Ücret 🪙 {last.charged}
                    {last.refunded ? ` · İade 🪙 ${last.refunded} (${MATCH_GRACE_SECONDS} sn altı)` : ''}
                  </Text>
                </View>
              )}
              {media.room && <Text style={s.roomLine}>🎙️ “{media.room.title}” odasındasın · dinleyici olarak devam ediyorsun. Mikrofon istemek veya kameranı açmak sana kalmış.</Text>}
              <Pressable style={s.primary} onPress={() => (resetMatch(), startMatch(m.mode, m.filter))}>
                <Ionicons name="flash" size={18} color={semantic.actionInk} />
                <Text style={s.primaryText}>Sonraki eşleşme</Text>
              </Pressable>
              <Pressable style={s.secondary} onPress={leave}>
                <Text style={s.secondaryText}>{media.room ? 'Odaya dön' : 'Kapat'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (!peer) return null;
  const price = priceOf(m.mode);
  return (
    <View style={s.screen}>
      {/* Remote side: the peer's "video" (prototype: their photo) or a voice avatar. */}
      {video ? (
        <Image source={{ uri: peer.avatar.replace('200', '800') }} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient colors={['#0B3B4A', colors.bg]} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient colors={['rgba(8,15,30,0.7)', 'transparent', 'rgba(8,15,30,0.85)']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.top}>
          <Pressable onPress={() => setSheet('more')} hitSlop={10} accessibilityLabel="Diğer">
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <View style={s.nameRow}>
              <Text style={s.topTitle}>
                {peer.name}, {peer.age}
              </Text>
              {peer.verified && <VerifiedBadge size={16} />}
            </View>
            <Text style={s.dim}>
              {modeLabel(m.mode)} · {mmss(m.elapsed)} · 🪙 {m.charged} ({price}/dk)
            </Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {media.room && (
          <View style={s.roomBanner}>
            <Ionicons name="radio" size={14} color={colors.gold} />
            <Text style={s.roomBannerText} numberOfLines={2}>
              “{media.room.title}” odasında dinleyici olarak kalıyorsun · oda mikrofonun ve kameran kapalı
            </Text>
          </View>
        )}
        {m.lowBalance && <Text style={s.low}>⚠️ Bakiyen bir sonraki dakikaya yetmiyor; görüşme dakika dolunca sonlanacak.</Text>}

        <View style={s.center}>
          {!video && (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View
                style={[s.ring, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }]}
              />
              <Image source={{ uri: peer.avatar }} style={s.voiceAvatar} />
            </View>
          )}
        </View>

        {video && (
          <View style={s.selfView}>
            {camOn ? <Image source={{ uri: me.avatar }} style={{ flex: 1 }} /> : <Ionicons name="videocam-off" size={26} color={colors.textDim} style={{ margin: 'auto' }} />}
          </View>
        )}

        <View style={s.controls}>
          <Ctl icon={micOn ? 'mic' : 'mic-off'} label={micOn ? 'Mikrofon' : 'Kapalı'} on={micOn} onPress={() => setMicOn((v) => !v)} />
          {video && (
            <Ctl
              icon={camOn ? 'videocam' : 'videocam-off'}
              label={camOn ? 'Kamera' : 'Kapalı'}
              on={camOn}
              onPress={() => (camDenied ? showAlert('Kamera izni yok', 'Kamerayı açmak için cihaz ayarlarından Similar Club’a kamera izni ver.') : setCamOn((v) => !v))}
            />
          )}
          <Pressable style={s.end} onPress={hangUp} accessibilityLabel="Görüşmeyi sonlandır">
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
          <Ctl icon="play-skip-forward" label="Sonraki" on onPress={nextMatch} />
        </View>
      </SafeAreaView>

      <ActionSheet
        visible={sheet === 'more'}
        title={peer.name}
        onClose={() => setSheet('none')}
        options={[
          { label: '🚩 Şikâyet et', onPress: () => setTimeout(() => setSheet('report'), 300) },
          {
            label: '⛔ Engelle ve görüşmeyi bitir',
            destructive: true,
            onPress: () => {
              toggleBlock(peer.id);
              hangUp();
            },
          },
          { label: '📶 Bağlantı kopmasını dene (demo)', onPress: dropConnection },
        ]}
      />
      <ActionSheet
        visible={sheet === 'report'}
        title="Şikâyet sebebi"
        onClose={() => setSheet('none')}
        options={REPORT_REASONS.map((r) => ({
          label: r,
          onPress: () => {
            const no = createTicket('Şikâyet', `Hemen Tanış · ${peer.name} (${peer.id}) · ${r}`);
            logSafety('Şikâyet etti', peer.id, `Hemen Tanış · ${r} · #${no}`);
            showAlert('Şikâyet alındı', `Talep #${no}. İstersen görüşmeyi bitirip kişiyi engelleyebilirsin.`);
          },
        }))}
      />
    </View>
  );
}

function Ctl({ icon, label, on, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={label} accessibilityState={{ selected: on }}>
      <View style={[s.ctl, !on && { backgroundColor: '#fff' }]}>
        <Ionicons name={icon} size={24} color={on ? '#fff' : colors.bg} />
      </View>
      <Text style={s.ctlText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  topTitle: { color: '#fff', fontWeight: '900', fontSize: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dim: { color: colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 14 },
  state: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  summary: { alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  summaryCard: { alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 18, padding: 16, alignSelf: 'stretch' },
  summaryAvatar: { width: 72, height: 72, borderRadius: 36 },
  summaryName: { color: '#fff', fontWeight: '800', fontSize: 16 },
  roomLine: { color: colors.gold, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 14, alignSelf: 'stretch' },
  primaryText: { color: semantic.actionInk, fontWeight: '900', fontSize: 16 },
  secondary: { backgroundColor: colors.card, borderRadius: 999, paddingVertical: 13, paddingHorizontal: 24, alignItems: 'center', alignSelf: 'stretch' },
  secondaryText: { color: '#fff', fontWeight: '800' },
  roomBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, backgroundColor: 'rgba(8,15,30,0.7)', borderRadius: 12, padding: 10 },
  roomBannerText: { color: colors.text, fontSize: 12, flex: 1 },
  low: { color: colors.gold, textAlign: 'center', marginTop: 8, marginHorizontal: 16, fontWeight: '700' },
  ring: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 3, borderColor: semantic.action },
  voiceAvatar: { width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: semantic.action },
  selfView: { position: 'absolute', right: 16, top: 120, width: 100, height: 140, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-evenly', paddingBottom: 28, paddingHorizontal: 12 },
  ctl: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  ctlText: { color: '#fff', fontSize: 12 },
  end: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center' },
});
