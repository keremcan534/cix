// Şeffaf video testi (POC), admins only: opened from Ayarlar next to Yönetim (a live build's admins; the offline
// demo shows it like its other demo admin tools). A full-screen sheet, not a route. A mock room (dark stage, 8
// seats, a chat you can scroll and tap) with 1, 3 or 5 transparent videos over it (modules/similar-alpha-video,
// pointerEvents none, so the room stays usable and visible through the clear parts). It never starts LiveKit and
// the videos are always muted. Closing the sheet or Temizle unmounts the videos, which releases player, textures
// and EGL. Spec and the device checklist: docs/SEFFAF_VIDEO_POC.md.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/list';
import { Text } from '@/components/text';
import { Button, Header } from '@/components/ui';
import { ALPHA_COUNTS, ALPHA_VARIANTS, alphaCacheName, fpsOf, overlayOffset, readySummary, type AlphaCount, type AlphaVariantKey } from '@/lib/alpha-video';
import { message } from '@/lib/live';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { AlphaVideoView, alphaVideoAvailable, alphaVideoMemory } from '../../../modules/similar-alpha-video';
import { Notice } from './parts';

const MEDIA: Record<AlphaVariantKey, number> = {
  '720p24': require('../../../assets/video/alpha-test/alpha_720p24.mp4'),
  '720p30': require('../../../assets/video/alpha-test/alpha_720p30.mp4'),
  '1080p24': require('../../../assets/video/alpha-test/alpha_1080p24.mp4'),
  '1080p30': require('../../../assets/video/alpha-test/alpha_1080p30.mp4'),
};

type Mode = 'bundle' | 'cache';

/** Pakettan: the bundled asset's URI as it is. Önbellekten: a copy in the cache folder, played from file://. */
async function sourceFor(key: AlphaVariantKey, mode: Mode): Promise<string> {
  if (Platform.OS === 'web') return '';
  if (mode === 'bundle') {
    const uri = Image.resolveAssetSource(MEDIA[key])?.uri;
    if (!uri) throw new Error('Paketteki video bulunamadı');
    return uri;
  }
  const [{ Asset }, { Directory, File, Paths }] = await Promise.all([import('expo-asset'), import('expo-file-system')]);
  const dir = new Directory(Paths.cache, 'alpha-test');
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, alphaCacheName(key));
  if (!dest.exists) {
    // expo-asset gives the bundled file a local path (in a release build it reads it out of the APK).
    const asset = Asset.fromModule(MEDIA[key]);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('Video dosyası okunamadı');
    await new File(asset.localUri).copy(dest);
  }
  return dest.uri;
}

const SEATS = ['AY', 'BK', 'CE', 'DN', 'EG', 'FS', 'GT', 'HZ'];
const SEAT_COLORS = ['#E5487A', '#3D8BFD', '#13B8A6', '#F59E0B', '#8B5CF6', '#EF4444', '#22C55E', '#0EA5E9'];
const CHAT = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  who: SEATS[i % SEATS.length],
  text: ['Merhaba herkese 👋', 'Video arkada mı görünüyor?', 'Sohbet kayıyor mu?', 'Mikrofonu açıyorum', 'Harika 🎉', 'Biraz takılma var mı?'][i % 6],
}));

type Hermes = { HermesInternal?: { getInstrumentedStats?: () => { js_heapSize?: number } } };

export function AlphaVideoTestPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && <PanelBody onClose={onClose} />}
    </Modal>
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  const [variant, setVariant] = useState<AlphaVariantKey>('720p30');
  const [count, setCount] = useState<AlphaCount>(1);
  const [mode, setMode] = useState<Mode>('bundle');
  const [loop, setLoop] = useState(true);
  const [source, setSource] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [readyMs, setReadyMs] = useState<number[]>([]);
  const [errors, setErrors] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [ends, setEnds] = useState(0);
  const [taps, setTaps] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [mics, setMics] = useState<boolean[]>(() => SEATS.map((_, i) => i % 3 === 0));
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const mountAt = useRef(0);
  const mounted = source !== null;

  // JS FPS from requestAnimationFrame, shown twice a second.
  const [fps, setFps] = useState(0);
  useEffect(() => {
    const stamps: number[] = [];
    let frame = 0;
    let shown = 0;
    const tick = (t: number) => {
      stamps.push(t);
      if (stamps.length > 240) stamps.splice(0, stamps.length - 240);
      if (t - shown > 500) {
        shown = t;
        setFps(fpsOf(stamps, t));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Heap once a second: Android's Java/native heap (the module) and Hermes' JS heap, where cheap to read.
  const [heap, setHeap] = useState('–');
  useEffect(() => {
    const read = () => {
      const m = alphaVideoMemory();
      const js = (globalThis as Hermes).HermesInternal?.getInstrumentedStats?.()?.js_heapSize;
      const parts = [
        m?.javaHeapMb !== undefined ? `Java ${m.javaHeapMb.toFixed(0)}/${(m.javaMaxMb ?? 0).toFixed(0)} MB` : null,
        m?.nativeHeapMb !== undefined ? `native ${m.nativeHeapMb.toFixed(0)} MB` : null,
        js ? `JS ${(js / 1048576).toFixed(0)} MB` : null,
      ].filter(Boolean);
      setHeap(parts.length ? parts.join(' · ') : '–');
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, []);

  const launch = async (v: AlphaVariantKey, m: Mode) => {
    setBusy(true);
    try {
      const uri = await sourceFor(v, m);
      mountAt.current = performance.now();
      setReadyMs([]);
      setEnds(0);
      setPaused(false);
      setRun((r) => r + 1);
      setSource(uri);
    } catch (e) {
      setErrors((n) => n + 1);
      setLastError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    if (mounted) setPaused(false);
    else void launch(variant, mode);
  };
  const clear = () => {
    setSource(null);
    setReadyMs([]);
  };
  // A new clip, source or count while playing: everything is mounted afresh (so mount → onReady stays honest).
  const pickVariant = (v: AlphaVariantKey) => {
    setVariant(v);
    if (mounted) void launch(v, mode);
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    if (mounted) void launch(variant, m);
  };
  const pickCount = (n: AlphaCount) => {
    setCount(n);
    if (mounted) void launch(variant, mode);
  };

  const videoW = room.width;
  const videoH = (room.width * 9) / 16;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Şeffaf video testi (POC)" onBack={onClose} />
      <View style={s.room} onLayout={(e) => setRoom({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        <View style={s.seats}>
          {SEATS.map((name, i) => (
            <Pressable key={name} style={s.seat} onPress={() => setMics((x) => x.map((on, j) => (j === i ? !on : on)))} accessibilityLabel={`Koltuk ${i + 1}`}>
              <View style={[s.avatar, { backgroundColor: SEAT_COLORS[i] }]}>
                <Text style={s.initials}>{name}</Text>
              </View>
              <View style={s.mic}>
                <Ionicons name={mics[i] ? 'mic' : 'mic-off'} size={11} color={mics[i] ? '#13D9DF' : '#8A97B3'} />
              </View>
            </Pressable>
          ))}
        </View>
        <ScrollView style={s.chat} contentContainerStyle={{ padding: space.sm, gap: 6 }}>
          {CHAT.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => {
                setTaps((n) => n + 1);
                setPicked(m.id);
              }}
              style={[s.msg, picked === m.id && s.msgOn]}
            >
              <Text style={s.msgText}>
                <Text style={s.msgWho}>{m.who}: </Text>
                {m.text}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* The overlays: never take touches, so the seats and chat below keep working. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {mounted &&
            videoW > 0 &&
            Array.from({ length: count }, (_, i) => {
              const o = overlayOffset(i, count);
              return (
                <AlphaVideoView
                  key={`${run}-${i}`}
                  source={source}
                  loop={loop}
                  paused={paused}
                  muted
                  restartKey={restartKey}
                  pointerEvents="none"
                  style={{ position: 'absolute', left: o.dx, top: room.height * 0.12 + o.dy, width: videoW, height: videoH }}
                  onReady={() => setReadyMs((x) => [...x, performance.now() - mountAt.current])}
                  onEnd={() => setEnds((n) => n + 1)}
                  onError={(e) => {
                    setErrors((n) => n + 1);
                    setLastError(e.message);
                  }}
                />
              );
            })}
          <View style={s.metrics}>
            <Text style={s.metric}>JS FPS {fps}</Text>
            <Text style={s.metric}>Hazır: {readySummary(readyMs)}</Text>
            <Text style={s.metric}>
              Oynayan {mounted ? `${readyMs.length}/${count}` : 0} · bitti {ends} · hata {errors}
            </Text>
            <Text style={s.metric}>Bellek: {heap}</Text>
            <Text style={s.metric}>Dokunma: {taps}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.controls} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        <View style={s.buttons}>
          <Button small title="Başlat" icon="play" onPress={start} disabled={busy} />
          <Button small variant="tonal" title="Durdur" icon="pause" onPress={() => setPaused(true)} disabled={!mounted} />
          <Button small variant="tonal" title="Tekrar oynat" icon="refresh" onPress={() => { setPaused(false); setRestartKey((k) => k + 1); }} disabled={!mounted} />
          <Button small variant="danger" title="Temizle" icon="trash-outline" onPress={clear} disabled={!mounted} />
        </View>
        {!!lastError && <Notice tone="danger" icon="alert-circle-outline" text={`Son hata: ${lastError}`} />}
        {!alphaVideoAvailable && (
          <Notice icon="desktop-outline" text="Bu ortamda şeffaf video oynatılmaz (web ya da modülü olmayan eski bir uygulama sürümü). Düzen ve kontroller görünür; asıl test Android APK'da yapılır." />
        )}
        <Text style={s.label}>Çözünürlük · FPS</Text>
        <ChoiceChips value={variant} options={ALPHA_VARIANTS.map((v) => [v.key, v.label] as [AlphaVariantKey, string])} onChange={pickVariant} />
        <Text style={s.label}>Aynı anda</Text>
        <ChoiceChips value={count} options={ALPHA_COUNTS.map((n) => [n, `${n} video`] as [AlphaCount, string])} onChange={pickCount} />
        <Text style={s.label}>Kaynak</Text>
        <ChoiceChips
          value={mode}
          options={[
            ['bundle', 'Paketten'],
            ['cache', 'Önbellekten oynat'],
          ]}
          onChange={pickMode}
        />
        <ChoiceChips
          value={loop ? 'on' : 'off'}
          options={[
            ['on', 'Döngü açık'],
            ['off', 'Bir kez'],
          ]}
          onChange={(v) => setLoop(v === 'on')}
        />
        <Notice
          icon="volume-mute-outline"
          text="Sesli oda açıkken: bu panel LiveKit başlatmaz ve videolar her zaman sessizdir. Bir sesli odadayken açarsan yalnızca videomuzun sessiz kaldığını ve odanın sesinin kesilmediğini kontrol et."
        />
        <Text style={s.hint}>Önbellekten oynat: klip önce uygulamanın önbellek klasörüne kopyalanır, sonra dosyadan oynatılır (internet gerekmez).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  room: { flex: 1, minHeight: 280, backgroundColor: '#0B1020', overflow: 'hidden' },
  seats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingVertical: space.md, paddingHorizontal: space.sm, rowGap: space.md },
  seat: { width: '23%', alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  initials: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  mic: { marginTop: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: '#1A2238', alignItems: 'center', justifyContent: 'center' },
  chat: { flex: 1, marginHorizontal: space.sm, marginBottom: space.sm, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.04)' },
  msg: { alignSelf: 'flex-start', maxWidth: '85%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  msgOn: { backgroundColor: 'rgba(19,217,223,0.3)' },
  msgText: { color: '#E6ECF7', fontSize: 13 },
  msgWho: { color: '#13D9DF', fontWeight: '700' },
  metrics: { position: 'absolute', right: 6, bottom: 6, padding: 6, borderRadius: radius.sm, backgroundColor: 'rgba(0,0,0,0.6)', gap: 1 },
  metric: { color: '#FFFFFF', fontSize: 11, fontVariant: ['tabular-nums'] },
  controls: { flexGrow: 0, maxHeight: '45%', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 12 },
}));
