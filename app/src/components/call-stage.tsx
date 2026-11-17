// The live part of a 1v1 call or Eşleşme match (lib/live/one-on-one + lib/call-media): the other person's video
// (or their photo for a voice call), my own small video, the timer, what the earner earns, gifts, and the controls.
// Report and block are always one tap away (the menu at the top right). The payer saw the price before calling: in
// the call nothing shows what it costs or what was spent (the owners: nothing small that puts people off); the earner
// sees each minute's diamonds and the total growing, with a cheer each minute.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { CallVideo } from '@/components/call-video';
import { useChatGift } from '@/components/one-on-one-bar';
import { Photo } from '@/components/photo';
import { useReport } from '@/components/report-sheet';
import { Text } from '@/components/text';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { applyBeautyStrength, BEAUTY_LEVELS, nextBeautyLevel, useBeautyLevel } from '@/lib/beauty';
import { callGifts } from '@/lib/call-gifts';
import { flipCallCamera, setCallCamera, setCallMic, useCallMedia } from '@/lib/call-media';
import { giftShelf, useLiveCatalog } from '@/lib/live/catalog-live';
import { applyMask, maskAvailable, maskName, nextMaskKind, useMaskKind } from '@/lib/mask';
import { beatNow, liveSeconds, MODE_NAME, otherId, type CallView } from '@/lib/live/one-on-one';
import { useApp } from '@/store';
import { colors } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** Every this many minutes the earner's cheer is a bigger one. */
const CHEER_EVERY = 5;

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** Seconds since the call went live, ticking every second. */
export function useCallSeconds(call: CallView | null) {
  const [, setTick] = useState(0);
  const live = call?.status === 'live';
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);
  return call ? liveSeconds(call) : 0;
}

/**
 * The call in one line while it rings: the payer saw its price before calling, so here it is only "paid"; the
 * earner sees what each minute brings.
 */
export function priceLine(c: CallView) {
  if (c.free) return c.maxSeconds ? `Ücretsiz ${c.kind === 'match' ? 'eşleşme' : 'arama'} · ${c.maxSeconds} saniye` : 'Ücretsiz';
  if (c.iPay && c.price > 0) return 'Ücretli arama';
  if (c.iEarn && c.price > 0) return `Her dakika ${fmt(c.price)} elmas kazanırsın`;
  return 'Ücretsiz';
}

/**
 * A short note that pops in over the controls and goes after a moment (`text` null: none). A new text pops again.
 */
function Pop({ text, big }: { text: string | null; big?: boolean }) {
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!text) return;
    shown.setValue(0);
    const a = Animated.spring(shown, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [text, shown]);
  if (!text) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pop, big && styles.popBig, { opacity: shown, transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      <Text style={[styles.popText, big && styles.popTextBig]}>{text}</Text>
    </Animated.View>
  );
}

/** A note that clears itself `ms` after it was set. */
function useNote(ms: number) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), ms);
    return () => clearTimeout(t);
  }, [note, ms]);
  return [note, setNote] as const;
}

/** The menu at the top right: report and block, for the person in the call. */
export function useSafetyMenu(peer: string, name: string, onBlocked: () => void) {
  const { blocked, toggleBlock } = useApp();
  const report = useReport();
  const [open, setOpen] = useState(false);
  const block = () => {
    if (blocked.has(peer)) return;
    showAlert(`${name} kişisini engellemek istiyor musun?`, 'Görüşme biter; birbirinize mesaj atamaz, birbirinizi arayamazsınız. Engeli istediğin zaman kaldırabilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Engelle', style: 'destructive', onPress: () => (onBlocked(), toggleBlock(peer)) },
    ]);
  };
  const button = (
    <Pressable onPress={() => setOpen(true)} hitSlop={10} style={styles.menuBtn} accessibilityLabel="Şikâyet et veya engelle">
      <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
    </Pressable>
  );
  const sheet = (
    <>
      <ActionSheet
        visible={open}
        title={name}
        onClose={() => setOpen(false)}
        options={[
          { label: 'Şikâyet et', icon: 'flag-outline', onPress: () => report.start({ type: 'user', id: peer, name, note: 'Bire bir görüşme', onBlock: () => (onBlocked(), toggleBlock(peer)) }, () => {}) },
          { label: 'Engelle', icon: 'ban-outline', destructive: true, onPress: block },
        ]}
      />
      {report.sheet}
    </>
  );
  return { button, sheet };
}

export function CallStage({ call, onEnd, extra, banner }: { call: CallView; onEnd: () => void; /** More controls (Eşleşme: next). */ extra?: ReactNode; /** A line over the controls. */ banner?: ReactNode }) {
  const media = useCallMedia();
  const seconds = useCallSeconds(call);
  const peer = otherId(call);
  const user = userById(peer);
  const video = call.mode === 'video';
  const safety = useSafetyMenu(peer, call.other.name, onEnd);
  const left = call.free && call.maxSeconds ? Math.max(0, call.maxSeconds - seconds) : null;
  // A free call's time ran out here: ask the server now, so the call ends on time rather than at the next beat.
  const timeUp = left === 0 && call.status === 'live';
  useEffect(() => {
    if (timeUp) beatNow();
  }, [timeUp]);
  const avatar = call.other.avatarUrl ?? user.avatar;
  // Güzellik filtresi: women's own camera in a video call, at the level they chose (one tap: the next level).
  const me = useApp().me;
  const beautyMine = video && me.gender === 'Kadın';
  const beauty = useBeautyLevel();
  useEffect(() => applyBeautyStrength(beautyMine, beauty), [beautyMine, beauty]);
  const [beautyNote, setBeautyNote] = useState<string | null>(null);
  useEffect(() => {
    if (!beautyNote) return;
    const t = setTimeout(() => setBeautyNote(null), 1500);
    return () => clearTimeout(t);
  }, [beautyNote]);
  const changeBeauty = () => setBeautyNote(`Güzellik: ${BEAUTY_LEVELS[nextBeautyLevel()].name}`);
  // Maske: what covers a woman's face on her camera (one tap: the next mask). It stays on through a voice call, so the
  // next video call starts covered; her own small video shows what the other side sees.
  const maskMine = me.gender === 'Kadın';
  const mask = useMaskKind();
  useEffect(() => applyMask(maskMine, mask), [maskMine, mask]);
  const [hasMask] = useState(maskAvailable);
  const [maskNote, setMaskNote] = useNote(3500);
  const changeMask = () => {
    const k = nextMaskKind();
    setMaskNote(k === 'off' ? 'Maske kapalı' : `Maske: ${maskName(k)}. Yüzün görünmezse görüntünün tamamı karelenir.`);
  };

  // What the earner earned in this call: its minutes (a diamond for each coin the payer pays) and the gifts received.
  const gifts = callGifts(call);
  const earning = call.iEarn && call.price > 0;
  const earned = earning ? call.coins + gifts.received : 0;
  // Each paid minute pops a cheer for the earner with the total so far; every CHEER_EVERY minutes a bigger one.
  const [cheer, setCheer] = useNote(2800);
  const [giftNote, setGiftNote] = useNote(3200);
  const seen = useRef({ coins: call.coins, gift: gifts.last?.id ?? 0 });
  useEffect(() => {
    const was = seen.current.coins;
    seen.current.coins = call.coins;
    if (!earning || call.coins <= was) return;
    const total = call.coins + gifts.received;
    setCheer(call.minutes > 0 && call.minutes % CHEER_EVERY === 0 ? `Harika gidiyorsun! ${call.minutes} dakikada ${fmt(total)} 💎` : `+${fmt(call.coins - was)} 💎 · Toplam ${fmt(total)} 💎`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.coins]);
  // A gift from them during the call shows here too (it is also a line in our chat).
  const shelf = giftShelf(useLiveCatalog());
  const lastGift = gifts.last;
  useEffect(() => {
    if (!lastGift || lastGift.id === seen.current.gift) return;
    seen.current.gift = lastGift.id;
    if (lastGift.fromMe) return;
    const name = shelf.find((g) => g.id === lastGift.giftId)?.name ?? 'hediye';
    setGiftNote(`🎁 ${call.other.name} sana ${lastGift.count > 1 ? `${lastGift.count} × ` : ''}${name} gönderdi${earning ? ` · +${fmt(lastGift.total)} 💎` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastGift?.id]);
  // A gift to them from the call, as from our chat (it costs what the gift sheet shows).
  const gift = useChatGift(user, () => setGiftNote('🎁 Hediyen gönderildi'));

  return (
    <View style={styles.root}>
      {video && media.remoteVideo ? (
        <CallVideo track={media.remoteVideo} style={styles.fill} />
      ) : (
        <Photo uri={avatar} kind="face" seed={peer} style={StyleSheet.absoluteFill} blurRadius={30} />
      )}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {call.other.name}
            </Text>
            <Text style={styles.sub}>
              {MODE_NAME[call.mode]} {call.kind === 'match' ? 'eşleşme' : 'arama'} · {mmss(seconds)}
            </Text>
          </View>
          {safety.button}
        </View>

        {!video || !media.remoteVideo ? (
          <View style={styles.center}>
            <Photo uri={avatar} kind="face" seed={peer} style={styles.bigAvatar} />
            <Text style={styles.state}>{media.status === 'connecting' ? 'Bağlanıyor…' : media.status === 'reconnecting' ? 'Yeniden bağlanıyor…' : media.status === 'failed' ? (media.error ?? 'Bağlantı kurulamadı') : !media.peerHere ? `${call.other.name} bekleniyor…` : video ? 'Kamerası kapalı' : 'Görüşme sürüyor'}</Text>
          </View>
        ) : null}

        {beautyMine && (
          <View style={styles.tools}>
            <Tool icon="sparkles" active={beauty > 0} text="Güzellik" label={`Güzellik: ${BEAUTY_LEVELS[beauty].name}. Değiştirmek için dokun`} onPress={changeBeauty} />
            {hasMask && <Tool icon="glasses" active={mask !== 'off'} text="Maske" label={`Maske: ${maskName(mask)}. Değiştirmek için dokun`} onPress={changeMask} />}
          </View>
        )}

        {video && (
          <View style={styles.selfView}>
            {media.localVideo && media.camOn ? (
              <CallVideo track={media.localVideo} style={{ flex: 1 }} mirror={media.front} onTop />
            ) : (
              <View style={styles.camOff}>
                <Ionicons name="videocam-off" size={24} color="#fff" />
              </View>
            )}
          </View>
        )}

        <View style={{ flex: 1 }} />

        <View style={styles.meterRow}>
          {earning && (
            <View style={[styles.meter, styles.earnMeter]} accessibilityLabel={`Bu görüşmede ${earned} elmas kazandın; her dakika ${call.price} elmas`}>
              <Text style={styles.earnText}>💎 {fmt(earned)}</Text>
              <Text style={styles.earnSub}>her dakika +{fmt(call.price)}</Text>
            </View>
          )}
          {call.free && (
            <View style={styles.meter}>
              <Text style={styles.meterText}>{priceLine(call)}</Text>
            </View>
          )}
          {left !== null && (
            <View style={[styles.meter, left <= 10 && { backgroundColor: 'rgba(255,80,80,0.55)' }]}>
              <Text style={[styles.meterText, { color: '#fff' }]}>Kalan {left} sn</Text>
            </View>
          )}
        </View>
        {banner}
        <Pop text={cheer} big={!!cheer?.startsWith('Harika')} />
        <Pop text={giftNote} />
        {(beautyNote ?? maskNote) && (
          <View style={styles.beautyNote} pointerEvents="none">
            <Text style={styles.beautyNoteText}>{beautyNote ?? maskNote}</Text>
          </View>
        )}

        <View style={styles.controls}>
          <Ctrl icon={media.micOn ? 'mic' : 'mic-off'} active={!media.micOn} label={media.micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'} onPress={() => setCallMic(!media.micOn)} />
          {video && <Ctrl icon={media.camOn ? 'videocam' : 'videocam-off'} active={!media.camOn} label={media.camOn ? 'Kamerayı kapat' : 'Kamerayı aç'} onPress={() => setCallCamera(!media.camOn)} />}
          {video && <Ctrl icon="camera-reverse" label="Kamerayı çevir" onPress={flipCallCamera} />}
          {call.kind === 'call' && <Ctrl icon="gift" label="Hediye gönder" onPress={gift.open} />}
          {extra}
          <Pressable style={[styles.ctrl, styles.hang]} onPress={onEnd} accessibilityLabel="Görüşmeyi bitir">
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
        </View>
      </SafeAreaView>
      {safety.sheet}
      {gift.sheet}
    </View>
  );
}

/** A camera tool in the column under my own video (Güzellik, Maske), with its name under it. */
function Tool({ text, ...ctrl }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; label: string; text: string }) {
  return (
    <View style={styles.tool}>
      <Ctrl {...ctrl} />
      <Text style={styles.toolText}>{text}</Text>
    </View>
  );
}

export function Ctrl({ icon, onPress, active, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; active?: boolean; label: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.ctrl, active && { backgroundColor: '#fff' }]} accessibilityLabel={label}>
      <Ionicons name={icon} size={24} color={active ? '#000' : '#fff'} />
    </Pressable>
  );
}

export const callStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05080F' },
  ripple: { position: 'absolute', top: 0, width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' },
  bigAvatar: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' },
  note: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, fontSize: 13, textAlign: 'center', marginHorizontal: 24, overflow: 'hidden' },
  name: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.8)', marginTop: 2 },
});

const styles = StyleSheet.create({
  ...callStyles,
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  menuBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', marginTop: 60, gap: 18 },
  state: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
  selfView: { position: 'absolute', right: 16, top: 110, width: 104, height: 156, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: '#1B2333' },
  camOff: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  meter: { backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  meterText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, paddingBottom: 24 },
  ctrl: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  tools: { position: 'absolute', right: 16, top: 280, gap: 10 },
  tool: { alignItems: 'center', gap: 3 },
  toolText: { color: '#fff', fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  beautyNote: { alignSelf: 'center', marginBottom: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  beautyNoteText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  earnMeter: { flexDirection: 'row', alignItems: 'baseline', gap: 6, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.45)' },
  earnText: { color: '#E0F2FE', fontWeight: '900', fontSize: 15 },
  earnSub: { color: 'rgba(224,242,254,0.75)', fontWeight: '700', fontSize: 11 },
  pop: { alignSelf: 'center', marginBottom: 10, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(14,116,144,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  popBig: { paddingHorizontal: 20, paddingVertical: 11, backgroundColor: 'rgba(219,39,119,0.9)' },
  popText: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  popTextBig: { fontSize: 16 },
  hang: { backgroundColor: colors.red, width: 64, height: 64, borderRadius: 32 },
});
