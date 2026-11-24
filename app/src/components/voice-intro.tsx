// Ses tanıtımı (owners, 24 Nov 2026): a voice clip of up to 15 seconds on the profile. VoiceCard plays someone's clip
// (and on my own profile invites me to record one, or to change it); VoiceRecorderSheet records it: tap to start, tap
// to stop (it stops itself at 15 seconds), listen, then save or record again. The server reads the file and refuses a
// wrong one (server/api/voice-intro.mjs); the demo keeps mine on this phone only (lib/voice-intro-store).
import Ionicons from '@expo/vector-icons/Ionicons';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, type RecordingOptions } from 'expo-audio';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardHead, PCard } from '@/components/profile-design';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { mixWithVoices } from '@/lib/audio-mode';
import { tapHaptic } from '@/lib/haptics';
import { getSession } from '@/lib/room-session';
import { VOICE_MAX_MS, VOICE_MIN_MS, recordingLeft, voiceBars, voiceClock, type VoiceIntro } from '@/lib/voice-intro-core';
import { SCRIM, glass } from '@/theme';

/** A voice in mono at 64 kbit/s: 15 seconds are about 120 KB (the server takes up to 1 MB), in an AAC .m4a. */
const PRESET: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000 };

/** The bars of a clip, lit up to `played` (0–1). */
function Bars({ seed, played, n = 28 }: { seed: string; played: number; n?: number }) {
  const bars = voiceBars(seed, n);
  return (
    <View style={s.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((h, i) => (
        <View key={i} style={[s.bar, { height: `${Math.round(h * 100)}%`, backgroundColor: (i + 0.5) / n <= played ? glass.pink : '#F3B8D2' }]} />
      ))}
    </View>
  );
}

/** A clip's play button, its bars as it plays and its clock. */
function Player({ voice }: { voice: VoiceIntro }) {
  const player = useAudioPlayer({ uri: voice.url });
  const st = useAudioPlayerStatus(player);
  const total = st.duration > 0 ? st.duration * 1000 : voice.ms;
  const at = st.currentTime * 1000;
  const played = st.playing || at > 0 ? Math.min(1, total ? at / total : 0) : 0;
  // At the end it waits at the start again.
  useEffect(() => {
    if (st.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [st.didJustFinish, player]);
  const toggle = () => {
    tapHaptic();
    if (st.playing) return player.pause();
    mixWithVoices();
    if (total && at >= total - 50) void player.seekTo(0);
    player.play();
  };
  const loading = !st.isLoaded && !st.playing;
  return (
    <View style={s.player}>
      <Pressable onPress={toggle} style={s.play} hitSlop={6} accessibilityRole="button" accessibilityLabel={st.playing ? 'Ses tanıtımını durdur' : 'Ses tanıtımını dinle'}>
        <LinearGradient colors={['#FF5FA2', '#D8175E']} style={StyleSheet.absoluteFill} />
        {loading && st.isBuffering ? <ActivityIndicator color="#fff" /> : <Ionicons name={st.playing ? 'pause' : 'play'} size={22} color="#fff" style={!st.playing && { marginLeft: 3 }} />}
      </Pressable>
      <Bars seed={voice.url} played={played} />
      <Text style={s.clock}>{voiceClock(st.playing || at > 0 ? Math.max(0, total - at) : voice.ms || total)}</Text>
    </View>
  );
}

/**
 * The profile's Ses tanıtımı card: their clip to play; on my own profile also "Değiştir", or, with none, an invitation
 * to record one. Someone else without a clip: nothing.
 */
export function VoiceCard({ voice, mine, onEdit }: { voice: VoiceIntro | null; mine: boolean; onEdit?: () => void }) {
  if (!voice && !mine) return null;
  if (!voice)
    return (
      <PCard onPress={onEdit} label="Ses tanıtımı ekle">
        <CardHead icon="mic-outline" tone="pink" title="Ses tanıtımı ekle" sub="15 saniyede kendini anlat; profiline bakan herkes dinleyebilir." chevron />
      </PCard>
    );
  return (
    <PCard label="Ses tanıtımı">
      <CardHead
        icon="mic"
        tone="pink"
        title="Ses tanıtımı"
        small
        right={
          mine ? (
            <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ses tanıtımını değiştir">
              <Text style={s.change}>Değiştir</Text>
            </Pressable>
          ) : undefined
        }
      />
      <Player key={voice.url} voice={voice} />
    </PCard>
  );
}

type Phase = { at: 'idle' } | { at: 'recording'; started: number } | { at: 'recorded'; uri: string; ms: number } | { at: 'saving'; uri: string; ms: number };

/**
 * Records my clip. `save` puts it on my profile (the server's own refusal shows as it is); `remove` takes the one I
 * have off. Open while `visible`.
 */
export function VoiceRecorderSheet({
  visible,
  current,
  onClose,
  save,
  remove,
}: {
  visible: boolean;
  current: VoiceIntro | null;
  onClose: () => void;
  save: (uri: string, ms: number) => Promise<void>;
  remove: () => Promise<void>;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible && <RecorderBody current={current} onClose={onClose} save={save} remove={remove} />}
    </Modal>
  );
}

function RecorderBody({ current, onClose, save, remove }: { current: VoiceIntro | null; onClose: () => void; save: (uri: string, ms: number) => Promise<void>; remove: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(PRESET);
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const stopping = useRef(false);

  const stop = async () => {
    if (phase.at !== 'recording' || stopping.current) return;
    stopping.current = true;
    const ms = Math.min(VOICE_MAX_MS, Math.round(recorder.currentTime * 1000) || Date.now() - phase.started);
    try {
      await recorder.stop();
    } catch {
      // A recorder that failed to stop leaves no file: said below.
    }
    stopping.current = false;
    const uri = recorder.uri;
    if (!uri) {
      setPhase({ at: 'idle' });
      return showAlert('Kayıt alınamadı', 'Ses kaydı alınamadı. Tekrar dene.');
    }
    if (ms < VOICE_MIN_MS) {
      setPhase({ at: 'idle' });
      return showAlert('Çok kısa', 'Ses tanıtımı en az 1 saniye olmalı. Mikrofona basıp konuş, bitince yeniden bas.');
    }
    setPhase({ at: 'recorded', uri, ms });
  };

  // The clock while recording, and the stop at 15 seconds.
  useEffect(() => {
    if (phase.at !== 'recording') return;
    const t = setInterval(() => {
      const ms = Math.round(recorder.currentTime * 1000) || Date.now() - phase.started;
      setElapsed(ms);
      if (recordingLeft(ms) === 0) void stop();
    }, 100);
    return () => clearInterval(t);
    // stop reads the phase it closes over; the interval is made again for each recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.at]);

  // Closing in the middle of a recording ends it.
  useEffect(
    () => () => {
      if (recorder.isRecording) void recorder.stop().catch(() => {});
    },
    [recorder],
  );

  const start = async () => {
    tapHaptic();
    if (Platform.OS === 'web') return showAlert('Telefonda kaydedilir', 'Ses tanıtımını uygulamadan, telefonunla kaydet.');
    // The room holds the microphone: recording beside it would cut voices or the room's own sound.
    const room = getSession().session;
    if (room && room.status !== 'ended') return showAlert('Odadasın', 'Odadayken ses kaydı yapılamaz. Önce odadan çık, sonra kaydet.');
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted)
      return showAlert('Mikrofon izni gerekli', 'Ses tanıtımı kaydetmek için mikrofon izni ver.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Ayarları aç', onPress: () => void Linking.openSettings() },
      ]);
    try {
      mixWithVoices();
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      return showAlert('Kayıt başlamadı', 'Mikrofon şu an kullanılamıyor. Başka bir uygulama kullanıyorsa kapatıp tekrar dene.');
    }
    setElapsed(0);
    setPhase({ at: 'recording', started: Date.now() });
  };

  const doSave = async () => {
    if (phase.at !== 'recorded') return;
    setPhase({ at: 'saving', uri: phase.uri, ms: phase.ms });
    try {
      await save(phase.uri, phase.ms);
      onClose();
    } catch (e) {
      setPhase({ at: 'recorded', uri: phase.uri, ms: phase.ms });
      showAlert('Kaydedilemedi', e instanceof Error ? e.message : 'Ses tanıtımı kaydedilemedi. Tekrar dene.');
    }
  };

  const doRemove = () =>
    showAlert('Ses tanıtımı silinsin mi?', 'Profilinden kalkar; istediğin zaman yenisini kaydedebilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          remove()
            .then(onClose)
            .catch((e) => showAlert('Silinemedi', e instanceof Error ? e.message : 'Tekrar dene.'))
            .finally(() => setBusy(false));
        },
      },
    ]);

  const recording = phase.at === 'recording';
  const ready = phase.at === 'recorded' || phase.at === 'saving';
  const left = recordingLeft(elapsed);
  return (
    <View style={s.backdropWrap}>
      <Pressable style={s.backdrop} onPress={recording || phase.at === 'saving' ? undefined : onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom: 20 + insets.bottom }]}>
        <View style={s.grip} />
        <Text style={s.title}>Ses tanıtımı</Text>
        <Text style={s.hint}>
          {recording
            ? 'Konuş; bitince yeniden bas. 15 saniyede kendiliğinden durur.'
            : ready
              ? 'Dinle; beğendiysen kaydet. Profiline bakan herkes dinleyebilir.'
              : 'Mikrofona bas ve en çok 15 saniye kendini anlat.'}
        </Text>

        {ready ? (
          <View style={s.preview}>
            <Player key={phase.uri} voice={{ url: phase.uri, ms: phase.ms }} />
          </View>
        ) : (
          <View style={s.recArea}>
            <Pressable onPress={recording ? () => void stop() : () => void start()} style={[s.mic, recording && s.micOn]} accessibilityRole="button" accessibilityLabel={recording ? 'Kaydı bitir' : 'Kaydı başlat'}>
              <LinearGradient colors={recording ? ['#FF3B6B', '#C0103F'] : ['#FF5FA2', '#D8175E']} style={StyleSheet.absoluteFill} />
              <Ionicons name={recording ? 'stop' : 'mic'} size={38} color="#fff" />
            </Pressable>
            <Text style={[s.timer, recording && { color: '#C0103F' }]}>
              {voiceClock(elapsed)} / {voiceClock(VOICE_MAX_MS)}
            </Text>
            {recording && (
              <View style={s.track}>
                <View style={[s.trackFill, { width: `${Math.round((1 - left / VOICE_MAX_MS) * 100)}%` }]} />
              </View>
            )}
          </View>
        )}

        {ready && (
          <View style={s.row}>
            <Button title="Yeniden kaydet" variant="tonal" icon="refresh" style={{ flex: 1 }} disabled={phase.at === 'saving'} onPress={() => setPhase({ at: 'idle' })} />
            <Button title={phase.at === 'saving' ? 'Kaydediliyor…' : 'Kaydet'} icon="checkmark" style={{ flex: 1 }} disabled={phase.at === 'saving'} onPress={() => void doSave()} />
          </View>
        )}
        {!recording && !ready && current && (
          <Pressable onPress={doRemove} disabled={busy} style={s.remove} accessibilityRole="button" accessibilityLabel="Ses tanıtımını sil">
            {busy ? <ActivityIndicator color="#C0103F" /> : <Ionicons name="trash-outline" size={18} color="#C0103F" />}
            <Text style={s.removeText}>Şu anki ses tanıtımını sil</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  play: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, height: 34, flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { flex: 1, borderRadius: 2, minHeight: 4 },
  clock: { minWidth: 38, textAlign: 'right', color: glass.plum, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  change: { color: glass.pink, fontSize: 14, fontWeight: '800' },
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: SCRIM },
  sheet: { backgroundColor: glass.fill, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, gap: 14 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: glass.tint },
  title: { color: glass.deep, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  hint: { color: glass.plum, fontSize: 14, textAlign: 'center' },
  recArea: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  mic: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  micOn: { transform: [{ scale: 1.06 }] },
  timer: { color: glass.ink, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: glass.tint, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: '#C0103F' },
  preview: { backgroundColor: glass.white, borderRadius: 18, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 },
  row: { flexDirection: 'row', gap: 10 },
  remove: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  removeText: { color: '#C0103F', fontSize: 14, fontWeight: '700' },
});
