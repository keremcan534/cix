// Music in a server room (lib/live/music): the sheet (what plays, what waits, my library and adding tracks from the
// phone) and the player that keeps this phone on the room's clock. The owner, the room's admins and its DJs play;
// everyone else listens and can switch it off on their own phone. The server keeps the queue and its clock; this
// only shows it and plays the file at the point the clock gives.
import Ionicons from '@expo/vector-icons/Ionicons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ROOM_ICON_ART } from '@/components/RoomArt';
import { roomStyles, useSheetBottom } from '@/components/room/parts';
import { Text } from '@/components/text';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import {
  LIBRARY_MAX,
  QUEUE_MAX,
  mmss,
  myMusic,
  playingNow,
  removeTrack,
  roomMusicAction,
  roomMusicGet,
  uploadTrack,
  type LibraryTrack,
  type MusicAction,
  type NowPlaying,
  type RoomMusic,
} from '@/lib/live/music';
import { colors } from '@/theme';

const ACCENT = '#13D9DF';
export const MUSIC_VOLUMES = [
  { v: 0.35, label: 'Kısık' },
  { v: 0.65, label: 'Orta' },
  { v: 1, label: 'Tam' },
] as const;

/** The file's length in seconds, read by loading it in a player (null when it can't be read in 8 s). */
function probeSeconds(uri: string) {
  return new Promise<number | null>((resolve) => {
    const p = createAudioPlayer({ uri }, { updateInterval: 250 });
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.isLoaded && s.duration > 0) finish(s.duration);
    });
    function finish(v: number | null) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.remove();
      p.remove();
      resolve(v);
    }
    timer = setTimeout(() => finish(p.duration > 0 ? p.duration : null), 8000);
    if (p.isLoaded && p.duration > 0) finish(p.duration);
  });
}

/**
 * Plays the room's music on this phone at the point the room's clock gives (`enabled` off: silent here only).
 * Answers what plays now, read again every second while something does.
 */
export function useRoomMusicPlayer(music: RoomMusic | null, enabled: boolean, volume: number) {
  const [tick, setTick] = useState(0);
  const active = !!music && music.tracks.length > 0 && music.startedAt !== null;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  // `tick` reads the clock again each second.
  const np = useMemo(() => (tick >= 0 ? playingNow(music) : null), [music, tick]);

  const player = useRef<AudioPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const key = enabled && np ? np.track.key : null;
  const url = np?.track.url ?? null;
  const paused = np?.paused ?? true;
  const startedAt = music?.startedAt ?? null;
  const at = useRef(np);
  useEffect(() => {
    at.current = np;
  }, [np]);

  // A track starts, changes, pauses or resumes (a resume moves the room's clock: seek again).
  useEffect(() => {
    let p = player.current;
    if (!key || !url) {
      p?.pause();
      return;
    }
    if (!p) {
      // Mixes with the room's voice: no audio focus taken from it (Android), recording stays on (iOS).
      void setAudioModeAsync({ interruptionMode: 'mixWithOthers', allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
      p = player.current = createAudioPlayer(null, { updateInterval: 1000 });
    }
    if (loaded.current !== key) {
      p.replace({ uri: url });
      loaded.current = key;
    }
    void p.seekTo(at.current?.position ?? 0).catch(() => {});
    if (paused) p.pause();
    else p.play();
  }, [key, url, paused, startedAt]);

  // Each second: back on the room's clock when this phone drifted (a slow load, a stall).
  useEffect(() => {
    const p = player.current;
    if (!p || !np || !key || np.paused || loaded.current !== np.track.key || !p.isLoaded || p.isBuffering) return;
    if (Math.abs(p.currentTime - np.position) > 2.5) void p.seekTo(np.position).catch(() => {});
  }, [np, key]);

  useEffect(() => {
    if (player.current) player.current.volume = volume;
  }, [volume, key]);

  useEffect(
    () => () => {
      const p = player.current;
      player.current = null;
      loaded.current = null;
      p?.remove();
    },
    [],
  );
  return np;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The server room's id. */
  room: string;
  music: RoomMusic | null;
  np: NowPlaying | null;
  /** Owner, admin or DJ (the server checks it again). */
  canPlay: boolean;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  /** Said in the room chat after an action of mine. */
  onDone?: (text: string) => void;
};

export function LiveMusicSheet({ visible, onClose, room, music, np, canPlay, enabled, setEnabled, volume, setVolume, onDone }: Props) {
  const paddingBottom = useSheetBottom();
  const [tab, setTab] = useState<'room' | 'library'>('room');
  const [lib, setLib] = useState<LibraryTrack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [serverCanPlay, setServerCanPlay] = useState<boolean | null>(null);
  const may = serverCanPlay ?? canPlay;

  // Opening the sheet reads the room's music once: the server's clock and whether I may play.
  useEffect(() => {
    if (!visible) return;
    let on = true;
    roomMusicGet(room)
      .then((r) => on && setServerCanPlay(r.canPlay))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [visible, room]);
  useEffect(() => {
    if (!visible || !may || tab !== 'library' || lib) return;
    let on = true;
    myMusic()
      .then((t) => on && setLib(t))
      .catch((e) => on && (setLib([]), showAlert('Kütüphane açılamadı', message(e))));
    return () => {
      on = false;
    };
  }, [visible, may, tab, lib]);

  const tracks = music?.tracks ?? [];
  const upNext = np ? tracks.slice(np.index + 1) : [];
  const queued = np ? tracks.length - np.index : 0;

  const act = (body: MusicAction, done?: string) => {
    if (busy) return;
    setBusy(body.action === 'add' ? `add:${body.track}` : body.action);
    roomMusicAction(room, body)
      .then(() => done && onDone?.(done))
      .catch((e) => showAlert('Müzik değişmedi', message(e)))
      .finally(() => setBusy(null));
  };
  const confirmClear = () =>
    showAlert('Sıra temizlensin mi?', 'Çalan parça durur ve sıradaki tüm parçalar çıkar.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Temizle', style: 'destructive', onPress: () => act({ action: 'clear' }, 'Müzik sırası temizlendi') },
    ]);
  const confirmDelete = (t: LibraryTrack) =>
    showAlert('Parça silinsin mi?', `"${t.title}" kütüphanenden ve çalındığı odaların sırasından çıkar.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () =>
          removeTrack(t.id)
            .then(() => setLib((l) => (l ?? []).filter((x) => x.id !== t.id)))
            .catch((e) => showAlert('Parça silinemedi', message(e))),
      },
    ]);

  const addFromPhone = async () => {
    if (upload) return;
    const left = LIBRARY_MAX - (lib?.length ?? 0);
    if (left <= 0) return showAlert('Kütüphane dolu', `En fazla ${LIBRARY_MAX} parça olabilir; önce birini sil.`);
    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], multiple: true, copyToCacheDirectory: true });
    } catch (e) {
      return showAlert('Dosya seçilemedi', message(e));
    }
    if (res.canceled || !res.assets?.length) return;
    const files = res.assets.slice(0, left);
    const failed: string[] = [];
    setUpload({ done: 0, total: files.length });
    for (const [i, f] of files.entries()) {
      try {
        const seconds = await probeSeconds(f.uri);
        if (seconds === null) throw new Error('Parçanın süresi okunamadı.');
        const t = await uploadTrack({ uri: f.uri, name: f.name, size: f.size, mimeType: f.mimeType }, seconds);
        setLib((l) => [t, ...(l ?? [])]);
      } catch (e) {
        failed.push(`${f.name}: ${message(e)}`);
      }
      setUpload({ done: i + 1, total: files.length });
    }
    setUpload(null);
    const skipped = res.assets.length - files.length;
    if (failed.length || skipped)
      showAlert(
        failed.length ? 'Bazı parçalar eklenmedi' : 'Kütüphane doldu',
        [...failed.slice(0, 4), failed.length > 4 && `+${failed.length - 4} parça daha`, skipped > 0 && `${skipped} parça yer kalmadığı için eklenmedi.`].filter(Boolean).join('\n'),
      );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[roomStyles.sheet, s.sheet, { paddingBottom }]}>
        <View style={s.head}>
          <Image source={ROOM_ICON_ART.music} style={{ width: 34, height: 34 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Oda müziği</Text>
            <Text style={s.sub}>Odadaki herkes aynı parçayı aynı anda dinler</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>

        {may && (
          <View style={s.segment}>
            {(['room', 'library'] as const).map((k) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[s.segItem, tab === k && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                <Text style={[s.segText, tab === k && s.segTextOn]}>{k === 'room' ? 'Odada çalan' : 'Kütüphanem'}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
          {(!may || tab === 'room') && (
            <>
              <View style={s.now}>
                {np ? (
                  <>
                    <Text style={s.nowLabel}>{np.paused ? 'DURAKLATILDI' : 'ŞİMDİ ÇALIYOR'}</Text>
                    <Text style={s.nowTitle} numberOfLines={2}>
                      {np.track.title}
                    </Text>
                    {!!np.track.byName && <Text style={s.nowBy}>{np.track.byName} ekledi</Text>}
                    <View style={s.bar}>
                      <View style={[s.barFill, { width: `${Math.min(100, (np.position / np.track.seconds) * 100)}%` }]} />
                    </View>
                    <View style={s.times}>
                      <Text style={s.time}>{mmss(np.position)}</Text>
                      <Text style={s.time}>{mmss(np.track.seconds)}</Text>
                    </View>
                    {may && (
                      <View style={s.controls}>
                        <Pressable
                          style={s.ctrl}
                          onPress={confirmClear}
                          disabled={!!busy}
                          accessibilityRole="button"
                          accessibilityLabel="Sırayı temizle"
                        >
                          <Ionicons name="stop" size={18} color="#fff" />
                        </Pressable>
                        <Pressable
                          style={[s.ctrl, s.ctrlMain]}
                          onPress={() => act({ action: np.paused ? 'resume' : 'pause' })}
                          disabled={!!busy}
                          accessibilityRole="button"
                          accessibilityLabel={np.paused ? 'Devam ettir' : 'Duraklat'}
                        >
                          {busy === 'pause' || busy === 'resume' ? <ActivityIndicator color="#05262A" /> : <Ionicons name={np.paused ? 'play' : 'pause'} size={26} color="#05262A" />}
                        </Pressable>
                        <Pressable
                          style={s.ctrl}
                          onPress={() => act({ action: 'skip' })}
                          disabled={!!busy}
                          accessibilityRole="button"
                          accessibilityLabel="Sonraki parça"
                        >
                          <Ionicons name="play-skip-forward" size={18} color="#fff" />
                        </Pressable>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={s.empty}>
                    <Ionicons name="musical-notes-outline" size={30} color={colors.textDim} />
                    <Text style={s.emptyTitle}>Şu an çalan parça yok</Text>
                    <Text style={s.emptyText}>{may ? 'Kütüphanem’den sıraya parça ekle; odadaki herkes duyar.' : 'Odada müziği oda sahibi, yöneticiler ve DJ’ler çalar.'}</Text>
                    {may && (
                      <Pressable style={s.pill} onPress={() => setTab('library')} accessibilityRole="button">
                        <Text style={s.pillText}>Kütüphanem</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>

              {upNext.length > 0 && (
                <>
                  <Text style={s.label}>
                    Sıradakiler · {upNext.length}
                  </Text>
                  {upNext.map((t, i) => (
                    <View key={t.key} style={s.row}>
                      <Text style={s.index}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>
                          {t.title}
                        </Text>
                        <Text style={s.rowSub} numberOfLines={1}>
                          {[t.byName, mmss(t.seconds)].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {may && (
                        <Pressable onPress={() => act({ action: 'remove', key: t.key })} hitSlop={8} disabled={!!busy} accessibilityLabel={`${t.title} sıradan çıksın`}>
                          <Ionicons name="close-circle" size={20} color={colors.textDim} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </>
              )}

              <Text style={s.label}>Bu telefonda</Text>
              <View style={s.switchRow}>
                <Text style={s.switchText}>Oda müziğini çal</Text>
                <Switch value={enabled} onValueChange={setEnabled} />
              </View>
              {enabled && (
                <View style={[s.chips, { marginTop: 8 }]}>
                  {MUSIC_VOLUMES.map((o) => {
                    const on = o.v === volume;
                    return (
                      <Pressable key={o.label} onPress={() => setVolume(o.v)} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                        <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text style={s.note}>Kapatırsan yalnızca senin telefonunda susar; odadakiler dinlemeye devam eder.</Text>
            </>
          )}

          {may && tab === 'library' && (
            <>
              <Pressable style={[s.add, !!upload && { opacity: 0.7 }]} onPress={addFromPhone} disabled={!!upload} accessibilityRole="button">
                {upload ? <ActivityIndicator color="#05262A" /> : <Ionicons name="add" size={20} color="#05262A" />}
                <Text style={s.addText}>{upload ? `Yükleniyor ${upload.done}/${upload.total}` : 'Telefondan ekle'}</Text>
              </Pressable>
              <Text style={s.label}>
                Parçalarım · {lib?.length ?? 0}/{LIBRARY_MAX}
              </Text>
              {lib === null && <ActivityIndicator color={ACCENT} style={{ marginVertical: 16 }} />}
              {lib?.length === 0 && <Text style={s.emptyText}>Henüz parça yok. Telefonundaki müzik dosyalarından seç; kütüphanene eklenir.</Text>}
              {lib?.map((t) => {
                const adding = busy === `add:${t.id}`;
                return (
                  <View key={t.id} style={s.row}>
                    <Ionicons name="musical-note" size={18} color={ACCENT} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={s.rowSub}>{mmss(t.seconds)}</Text>
                    </View>
                    <Pressable
                      style={[s.pill, queued >= QUEUE_MAX && { opacity: 0.4 }]}
                      disabled={!!busy || queued >= QUEUE_MAX}
                      onPress={() => act({ action: 'add', track: t.id }, `🎵 ${t.title} sıraya eklendi`)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.title} sıraya eklensin`}
                    >
                      {adding ? <ActivityIndicator size="small" color="#05262A" /> : <Text style={s.pillText}>Sıraya ekle</Text>}
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(t)} hitSlop={8} accessibilityLabel={`${t.title} silinsin`}>
                      <Ionicons name="trash-outline" size={18} color={colors.textDim} />
                    </Pressable>
                  </View>
                );
              })}
              <Text style={s.note}>
                Eklediğin parçaları odadaki herkes duyar: yalnızca çalma hakkın olan müzikleri ekle. Parça başına en fazla 20 MB ve 20 dakika; sırada en fazla {QUEUE_MAX} parça.
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, padding: 3, marginBottom: 10 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  segOn: { backgroundColor: ACCENT },
  segText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  segTextOn: { color: '#05262A' },
  now: { borderRadius: 20, padding: 16, backgroundColor: 'rgba(19,217,223,0.08)', borderWidth: 1, borderColor: 'rgba(19,217,223,0.28)' },
  nowLabel: { color: ACCENT, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  nowTitle: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 6 },
  nowBy: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 14, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: ACCENT },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { color: colors.textDim, fontSize: 11, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 10 },
  ctrl: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  ctrlMain: { width: 60, height: 60, borderRadius: 30, backgroundColor: ACCENT, boxShadow: '0 6px 18px rgba(19,217,223,0.35)' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyText: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 6, letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  index: { color: colors.textDim, width: 18, textAlign: 'center', fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  pill: { minWidth: 92, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: ACCENT },
  pillText: { color: '#05262A', fontSize: 12, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  switchText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center' },
  chipOn: { borderColor: ACCENT, backgroundColor: 'rgba(19,217,223,0.14)' },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: ACCENT },
  note: { color: colors.textDim, fontSize: 11, marginTop: 10, lineHeight: 16 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: ACCENT, boxShadow: '0 6px 18px rgba(19,217,223,0.3)' },
  addText: { color: '#05262A', fontSize: 15, fontWeight: '900' },
});
