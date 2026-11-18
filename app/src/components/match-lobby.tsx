// What Hemen Tanış shows before a match (the client's design, Nov 2026): a light pink screen in either colour scheme,
// my photo in its ring, the two ways to start, my free matches and the safety rules. Numbers come from the server
// (MatchRights); live-match.tsx holds the queue and the call.
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon3D } from '@/components/Icon3D';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { MODE_NAME, type CallMode, type MatchRights } from '@/lib/live/one-on-one';
import { goBack } from '@/lib/nav';

const INK = { deep: '#54103C', text: '#6A2752', line: 'rgba(84,16,60,0.28)' };
const GOLD = '#E0A23C';
const RING = 148;

/** What the pill on a start card says. */
export function modePill(rights: MatchRights | null, mode: CallMode) {
  if (!rights) return '';
  if (rights.streamer) return 'Ücretsiz';
  return rights.freeLeft > 0 ? `Ücretsiz · ${rights.seconds} sn` : `${rights.price[mode].toLocaleString('tr-TR')} jeton/dk`;
}

export type LobbyGate = 'minor' | 'adult' | 'loading' | null;

type Props = {
  avatar?: string;
  waiting: boolean;
  status: string;
  still: boolean;
  gate: LobbyGate;
  rights: MatchRights | null;
  busy: boolean;
  error: { text: string; coins: boolean } | null;
  onAccept: () => void;
  onStart: (mode: CallMode) => void;
  onCancel: () => void;
};

export function MatchLobby({ avatar, waiting, status, still, gate, rights, busy, error, onAccept, onStart, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#FFE3F1', '#FFF2F8', '#FFDCEE']} style={StyleSheet.absoluteFill} />
      <View style={[s.blob, { top: -90, right: -110, width: 280, height: 280 }]} />
      <View style={[s.blob, { top: 300, left: -150, width: 260, height: 260 }]} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <View style={s.head}>
            <Pressable style={s.back} onPress={() => goBack()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Geri">
              <Ionicons name="chevron-back" size={24} color={INK.deep} />
            </Pressable>
            <TitleMark />
            <Text style={s.title} accessibilityRole="header">
              Hemen Tanış
            </Text>
            <LinearGradient colors={['rgba(224,162,60,0)', GOLD, 'rgba(224,162,60,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.underline} />
          </View>

          {gate === 'minor' ? (
            <Glass>
              <Text style={s.cardTitle}>Hemen Tanış 18 yaş ve üzeri içindir</Text>
              <Text style={s.line}>Sesli odalarda konuşabilir, takip ettiğin kişilerle mesajlaşabilirsin.</Text>
            </Glass>
          ) : gate === 'adult' ? (
            <AdultGate onAccept={onAccept} />
          ) : gate === 'loading' ? null : (
            <>
              <View style={s.stage}>
                <Waves flip={false} />
                <View style={s.ringBox}>
                  <Radar on={waiting} still={still} />
                  <LinearGradient colors={['#E11D9B', '#F6BD60', '#FF5FA2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ring}>
                    <View style={s.ringInner}>
                      {avatar ? (
                        <Photo uri={avatar} kind="face" seed="me" style={s.face} />
                      ) : (
                        <View style={[s.face, s.noFace]}>
                          <Ionicons name="person" size={72} color="#F2B5D0" />
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                  <LinearGradient colors={['#E0259B', '#A80F6E']} style={s.crown}>
                    <Icon3D name="crown" size={24} />
                  </LinearGradient>
                </View>
                <Waves flip />
              </View>

              <Text style={s.status} accessibilityLiveRegion="polite">
                {status}
              </Text>
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Ionicons name="heart-outline" size={18} color={GOLD} />
                <View style={s.dividerLine} />
              </View>

              {error && (
                <Glass style={{ borderColor: '#D93A45' }}>
                  <Text style={[s.line, { color: INK.deep }]}>{error.text}</Text>
                  {error.coins && <Button title="Jeton yükle" small onPress={() => router.push('/cuzdan')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
                </Glass>
              )}

              {waiting ? (
                <Pressable style={s.cancel} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Aramayı iptal et">
                  <Text style={s.cancelText}>Aramayı iptal et</Text>
                </Pressable>
              ) : (
                <View style={s.modes}>
                  <ModeCard mode="voice" pill={modePill(rights, 'voice')} busy={busy} onPress={() => onStart('voice')} />
                  <ModeCard mode="video" pill={modePill(rights, 'video')} busy={busy} onPress={() => onStart('video')} />
                </View>
              )}

              {rights && <RightsCard rights={rights} />}
              <SafetyCard />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Glass({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.glass, style]}>{children}</View>;
}

/** The two speech bubbles with a heart above the title. */
function TitleMark() {
  return (
    <View style={s.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name="chatbubble" size={28} color="#F0468E" style={{ position: 'absolute', right: 6, top: 12, transform: [{ scaleX: -1 }] }} />
      <Ionicons name="chatbubble" size={38} color="#FF5FA2" style={{ position: 'absolute', left: 6, top: 4 }} />
      <Ionicons name="heart" size={17} color="#fff" style={{ position: 'absolute', left: 16.5, top: 13 }} />
      <Ticks style={{ right: 0, top: 0 }} />
    </View>
  );
}

/** Three short gold strokes: something lights up. */
function Ticks({ style }: { style: object }) {
  return (
    <View style={[{ position: 'absolute', width: 16, height: 14 }, style]}>
      <View style={[s.tick, { left: 1, top: 2, transform: [{ rotate: '-20deg' }] }]} />
      <View style={[s.tick, { left: 7, top: 1, transform: [{ rotate: '20deg' }] }]} />
      <View style={[s.tick, { left: 12, top: 5, transform: [{ rotate: '60deg' }] }]} />
    </View>
  );
}

/** The sound bars beside the photo, tallest next to it. */
function Waves({ flip }: { flip: boolean }) {
  const bars = [10, 20, 32, 46, 34];
  return (
    <View style={[s.waves, flip && { flexDirection: 'row-reverse' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((h, i) => (
        <View key={i} style={[s.wave, { height: h, opacity: 0.3 + i * 0.13 }]} />
      ))}
    </View>
  );
}

function Radar({ on, still }: { on: boolean; still: boolean }) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    spin.setValue(0);
    if (!on || still) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [on, still, spin]);
  if (!on) return null;
  return (
    <>
      {[0, 1, 2].map((i) =>
        still ? (
          <View key={i} style={[s.radar, { opacity: 0.5 - i * 0.15, transform: [{ scale: 1 + i * 0.14 }] }]} />
        ) : (
          <Animated.View
            key={i}
            style={[s.radar, { opacity: spin.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: spin.interpolate({ inputRange: [0, 1], outputRange: [0.9 + i * 0.12, 1.3 + i * 0.12] }) }] }]}
          />
        ),
      )}
    </>
  );
}

function ModeCard({ mode, pill, busy, onPress }: { mode: CallMode; pill: string; busy: boolean; onPress: () => void }) {
  const video = mode === 'video';
  return (
    <Pressable onPress={onPress} disabled={busy} style={[s.modeWrap, busy && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${MODE_NAME[mode]} eşleşme başlat${pill ? `, ${pill}` : ''}`}>
      <LinearGradient colors={video ? ['#FF7C83', '#EE3F6E', '#CF1F66'] : ['#DD2AA4', '#B5117F', '#D3208F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.mode}>
        <View style={[s.swell, { bottom: -74, left: -40, right: -20, height: 120 }]} />
        <View style={[s.swell, { bottom: -92, left: 10, right: -60, height: 130 }]} />
        <View style={s.modeArt}>{video ? <VideoArt /> : <MicArt />}</View>
        <Text style={s.modeTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {MODE_NAME[mode]}
        </Text>
        <View style={[s.pill, !pill && { opacity: 0 }]}>
          <Text style={s.pillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {pill || ' '}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function MicArt() {
  return (
    <View style={s.micArt}>
      {/* Two circles around the mic with only their sides drawn: the sound going out. */}
      <View style={[s.arc, { width: 66, height: 66, borderRadius: 33 }]} />
      <View style={[s.arc, { width: 90, height: 90, borderRadius: 45, opacity: 0.7 }]} />
      <Ionicons name="mic" size={48} color="#fff" />
    </View>
  );
}

function VideoArt() {
  return (
    <View style={s.artRow}>
      <LinearGradient colors={['#FFFFFF', '#FFD6E2']} style={s.camera}>
        <Ionicons name="play" size={19} color="#EE3F6E" />
      </LinearGradient>
      <Ionicons name="caret-back" size={28} color="#FFE3EB" style={{ marginLeft: -5 }} />
      <Ticks style={{ right: -14, top: -6 }} />
    </View>
  );
}

function RightsCard({ rights }: { rights: MatchRights }) {
  if (rights.streamer) {
    return (
      <Glass style={s.goldEdge}>
        <View style={s.cardHead}>
          <Icon3D name="gift" size={40} />
          <View style={s.bar} />
          <Text style={[s.cardTitle, { flex: 1 }]}>Yayıncı olarak eşleşmelerin ücretsiz</Text>
        </View>
        <Text style={s.line}>Karşındaki kişi dakika ücretini öderse her dakika için elmas kazanırsın.</Text>
      </Glass>
    );
  }
  const at = rights.nextFreeAt ? new Date(rights.nextFreeAt) : null;
  return (
    <Glass style={s.goldEdge}>
      <View style={s.rightsRow}>
        <Icon3D name="gift" size={44} />
        <View style={[s.bar, { marginTop: 4 }]} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.cardTitle}>
            Ücretsiz hakkın: {rights.freeLeft}/{rights.free}
          </Text>
          <Text style={s.line}>
            Her gün {rights.free} ücretsiz eşleşme hakkın var, her biri en çok {rights.seconds} saniye. Sesli ya da görüntülü kullanabilirsin.
          </Text>
          <Text style={s.line}>
            Haklar bitince dakikası sesli {rights.price.voice.toLocaleString('tr-TR')}, görüntülü {rights.price.video.toLocaleString('tr-TR')} jeton. Ücret eşleşme bağlandığında başlar.
          </Text>
          {rights.freeLeft === 0 && at && (
            <Text style={[s.line, { color: '#8A5A06', fontWeight: '700' }]}>Yeni ücretsiz hak: {at.toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
          )}
        </View>
      </View>
    </Glass>
  );
}

const SAFETY = [
  'Görüşmede sağ üstteki kalkan simgesiyle karşındakini her an şikâyet edebilir veya engelleyebilirsin.',
  'Engellediğin kişiyle bir daha eşleşmezsin.',
  'Uygunsuz görüntü, taciz veya iletişim bilgisi isteme hesabının kapanmasına yol açar.',
  'Bir odadaysan görüşme başlayınca odadan çıkarsın.',
];

function SafetyCard() {
  return (
    <Glass>
      <View style={s.cardHead}>
        <View style={s.shield} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="shield" size={44} color="#F6BD60" style={{ position: 'absolute' }} />
          <Ionicons name="shield-checkmark" size={36} color="#B81F66" style={{ position: 'absolute' }} />
        </View>
        <View style={s.bar} />
        <Text style={s.cardTitle}>Güvenliğin için</Text>
      </View>
      {SAFETY.map((t) => (
        <View key={t} style={s.check}>
          <View style={s.checkDot}>
            <Ionicons name="checkmark" size={15} color="#B81F66" />
          </View>
          <Text style={[s.line, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
    </Glass>
  );
}

function AdultGate({ onAccept }: { onAccept: () => void }) {
  return (
    <Glass>
      <Text style={s.cardTitle}>Başlamadan önce</Text>
      <Text style={s.line}>Hemen Tanış seni tanımadığın biriyle sesli ya da görüntülü görüşmeye bağlar. Yalnızca 18 yaş ve üzeri içindir.</Text>
      <Text style={s.line}>• Çıplaklık, cinsel içerik, taciz ve nefret söylemi yasaktır.</Text>
      <Text style={s.line}>• Görüşmeler kaydedilmez; şikâyet edilen görüşmeleri ekibimiz inceler.</Text>
      <Text style={s.line}>• Rahatsız olursan görüşmeyi bitir, şikâyet et veya engelle.</Text>
      <Button title="18 yaşından büyüğüm, kabul ediyorum" onPress={onAccept} style={{ marginTop: 8 }} />
    </Glass>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFEAF4', overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 200, backgroundColor: 'rgba(255,255,255,0.4)' },
  scroll: { paddingHorizontal: 16, gap: 14, width: '100%', maxWidth: 520, alignSelf: 'center' },
  head: { alignItems: 'center', paddingTop: 4 },
  back: { position: 'absolute', left: 0, top: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)', boxShadow: '0 3px 10px rgba(184,31,102,0.14)' },
  mark: { width: 62, height: 44 },
  title: { color: INK.deep, fontSize: 30, fontWeight: '900', marginTop: 2 },
  underline: { width: 150, height: 2, borderRadius: 1, marginTop: 4 },
  tick: { position: 'absolute', width: 2.5, height: 7, borderRadius: 1.25, backgroundColor: GOLD },
  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 6 },
  ringBox: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { width: RING, height: RING, borderRadius: RING / 2, padding: 5, boxShadow: '0 6px 22px rgba(225,29,155,0.3)' },
  ringInner: { flex: 1, borderRadius: RING / 2, padding: 3, backgroundColor: '#FFF7F2' },
  face: { width: '100%', height: '100%', borderRadius: RING / 2 },
  noFace: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE9F3' },
  crown: { position: 'absolute', right: 4, bottom: 4, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F6BD60' },
  radar: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderColor: '#F0468E' },
  waves: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wave: { width: 5, borderRadius: 3, backgroundColor: '#F27FB6' },
  status: { color: INK.text, fontSize: 15, fontWeight: '600', lineHeight: 21, textAlign: 'center', paddingHorizontal: 8 },
  divider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: -6 },
  dividerLine: { width: 56, height: 1, backgroundColor: 'rgba(184,31,102,0.45)' },
  modes: { flexDirection: 'row', gap: 12 },
  modeWrap: { flex: 1, borderRadius: 24, boxShadow: '0 6px 16px rgba(184,31,102,0.28)' },
  mode: { minHeight: 164, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'space-between', gap: 6, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)' },
  swell: { position: 'absolute', borderRadius: 140, backgroundColor: 'rgba(255,255,255,0.13)' },
  modeArt: { height: 58, alignItems: 'center', justifyContent: 'center' },
  artRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  micArt: { width: 96, height: 58, alignItems: 'center', justifyContent: 'center' },
  arc: { position: 'absolute', borderWidth: 2.5, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#FFA6DC', borderRightColor: '#FFA6DC' },
  camera: { width: 54, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { color: '#fff', fontSize: 23, fontWeight: '900' },
  pill: { maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cancel: { backgroundColor: 'rgba(255,250,252,0.9)', borderRadius: 999, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(184,31,102,0.35)' },
  cancelText: { color: INK.deep, fontWeight: '800', fontSize: 15 },
  glass: { backgroundColor: 'rgba(255,250,252,0.86)', borderRadius: 22, padding: 16, gap: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)', boxShadow: '0 4px 14px rgba(184,31,102,0.1)' },
  goldEdge: { borderColor: 'rgba(224,162,60,0.5)' },
  rightsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { width: 1, height: 36, backgroundColor: INK.line },
  cardTitle: { color: INK.deep, fontSize: 18, fontWeight: '900' },
  line: { color: INK.text, fontSize: 13.5, lineHeight: 20 },
  shield: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 2 },
  checkDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(240,70,142,0.14)' },
});
