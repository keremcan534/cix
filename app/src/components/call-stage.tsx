// The live part of a 1v1 call or Eşleşme match (lib/live/one-on-one + lib/call-media): the other person's video
// (or their photo for a voice call), my own small video, the timer and what it costs, and the controls. Report
// and block are always one tap away (the menu at the top right).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { CallVideo } from '@/components/call-video';
import { Photo } from '@/components/photo';
import { useReport } from '@/components/report-sheet';
import { Text } from '@/components/text';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { applyBeautyStrength, BEAUTY_LEVELS, nextBeautyLevel, useBeautyLevel } from '@/lib/beauty';
import { flipCallCamera, setCallCamera, setCallMic, useCallMedia } from '@/lib/call-media';
import { beatNow, liveSeconds, MODE_NAME, otherId, type CallView } from '@/lib/live/one-on-one';
import { useApp } from '@/store';
import { colors } from '@/theme';

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

/** What the call costs or earns, in one line. */
export function priceLine(c: CallView) {
  if (c.free) return c.maxSeconds ? `Ücretsiz ${c.kind === 'match' ? 'eşleşme' : 'arama'} · ${c.maxSeconds} saniye` : 'Ücretsiz';
  if (c.iPay && c.price > 0) return `${c.price.toLocaleString('tr-TR')} jeton / dakika`;
  if (c.iEarn && c.price > 0) return 'Her dakika için elmas kazanırsın';
  return 'Ücretsiz';
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
          <View style={styles.meter}>
            <Text style={styles.meterText}>{priceLine(call)}</Text>
          </View>
          {call.iPay && call.coins > 0 && (
            <View style={styles.meter}>
              <Text style={styles.meterText}>Harcanan {call.coins.toLocaleString('tr-TR')}</Text>
            </View>
          )}
          {left !== null && (
            <View style={[styles.meter, left <= 10 && { backgroundColor: 'rgba(255,80,80,0.55)' }]}>
              <Text style={[styles.meterText, { color: '#fff' }]}>Kalan {left} sn</Text>
            </View>
          )}
        </View>
        {banner}
        {beautyNote && (
          <View style={styles.beautyNote} pointerEvents="none">
            <Text style={styles.beautyNoteText}>{beautyNote}</Text>
          </View>
        )}

        <View style={styles.controls}>
          <Ctrl icon={media.micOn ? 'mic' : 'mic-off'} active={!media.micOn} label={media.micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'} onPress={() => setCallMic(!media.micOn)} />
          {video && <Ctrl icon={media.camOn ? 'videocam' : 'videocam-off'} active={!media.camOn} label={media.camOn ? 'Kamerayı kapat' : 'Kamerayı aç'} onPress={() => setCallCamera(!media.camOn)} />}
          {video && <Ctrl icon="camera-reverse" label="Kamerayı çevir" onPress={flipCallCamera} />}
          {beautyMine && <Ctrl icon="sparkles" active={beauty > 0} label={`Güzellik: ${BEAUTY_LEVELS[beauty].name}. Değiştirmek için dokun`} onPress={changeBeauty} />}
          {extra}
          <Pressable style={[styles.ctrl, styles.hang]} onPress={onEnd} accessibilityLabel="Görüşmeyi bitir">
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
        </View>
      </SafeAreaView>
      {safety.sheet}
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
  beautyNote: { alignSelf: 'center', marginBottom: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  beautyNoteText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hang: { backgroundColor: colors.red, width: 64, height: 64, borderRadius: 32 },
});
