// Music in a server room (lib/live/music): the sheet and the player that keeps this phone on the room's clock.
// The sheet is the room's playlist ("Çalma listesi"): a search, the rows (the playing one lit), and a small player
// under them: previous, play/pause, next and repeat for the owner, the room's admins and its DJs; the progress
// and this phone's volume for everyone. "Müzik ekle" opens Kütüphanem: my tracks, several of them picked at once
// and put on the list, more added from the phone, or deleted. The server keeps the list and its clock (every phone
// plays the same thing); this only shows it, asks the server for changes and plays the file at the point the clock
// gives. No music comes from us: only what people add from their own phone.
import Ionicons from '@expo/vector-icons/Ionicons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { useSheetBottom } from '@/components/room/parts';
import { Text, TextInput } from '@/components/text';
import { showAlert } from '@/lib/alert';
import { ensureMixAudioMode } from '@/lib/audio-mode';
import { message } from '@/lib/live';
import {
  LIBRARY_MAX,
  REPEAT_LABEL,
  matchTrack,
  mmss,
  myMusic,
  nextRepeat,
  playingNow,
  removeTrack,
  roomMusicAction,
  roomMusicGet,
  uploadTrack,
  NO_MUSIC,
  type LibraryTrack,
  type MusicAction,
  type NowPlaying,
  type QueueTrack,
  type RoomMusic,
} from '@/lib/live/music';
import { SCRIM, makeStyles, radius, space, useTheme } from '@/theme';

/** This phone's volume when it comes back from silent and had none before. */
const DEFAULT_VOLUME = 0.65;

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
 * Plays the room's music on this phone at the point the room's clock gives (`enabled` off or volume 0: silent
 * here only, and no file is loaded). Answers what plays now, read again every second while something does.
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
  const on = enabled && volume > 0;
  const key = on && np ? np.track.key : null;
  // A track that comes round again (repeat) starts again: its round is part of what the player follows.
  const round = key && np ? `${key}:${np.lap}` : null;
  const url = np?.track.url ?? null;
  const paused = np?.paused ?? true;
  const startedAt = music?.startedAt ?? null;
  const at = useRef(np);
  useEffect(() => {
    at.current = np;
  }, [np]);

  // A track starts, changes, comes round, pauses or resumes (a resume or a restart moves the room's clock).
  useEffect(() => {
    let p = player.current;
    if (!key || !url) {
      p?.pause();
      return;
    }
    if (!p) {
      // Mixes with the room's voice: no audio focus taken from it (Android), recording stays on (iOS). Set once,
      // before the room's audio session started; setting it again here broke the room's echo cancellation.
      void ensureMixAudioMode();
      p = player.current = createAudioPlayer(null, { updateInterval: 1000 });
    }
    const fresh = loaded.current !== key;
    if (fresh) {
      p.replace({ uri: url });
      loaded.current = key;
    }
    // To the room's point, unless the player is already there (a resume needs no jump).
    const pos = at.current?.position ?? 0;
    if (fresh || !p.isLoaded || Math.abs(p.currentTime - pos) > 1) void p.seekTo(pos).catch(() => {});
    if (paused) p.pause();
    else p.play();
  }, [key, round, url, paused, startedAt]);

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
  /** What plays now (useRoomMusicPlayer); the sheet reads the clock itself too. */
  np?: NowPlaying | null;
  /** Owner, admin or DJ (the server checks it again). */
  canPlay: boolean;
  /** Room music on this phone; the sheet turns it back on when the volume goes up. */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** This phone's volume, 0–1 (0: silent here). */
  volume: number;
  setVolume: (v: number) => void;
  /** Said in the room chat after an action of mine. */
  onDone?: (text: string) => void;
};

/** What a row's second line says: its length and the performer when the file's name gave one. */
const subOf = (t: { seconds: number; artist?: string }) => [mmss(t.seconds), t.artist].filter(Boolean).join(' · ');

export function LiveMusicSheet({ visible, onClose, room, music, canPlay, enabled, setEnabled, volume, setVolume, onDone }: Props) {
  const s = useStyles();
  const t = useTheme();
  const paddingBottom = useSheetBottom();
  const [view, setView] = useState<'list' | 'library'>('list');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [serverCanPlay, setServerCanPlay] = useState<boolean | null>(null);
  // The server's answer to my last change, shown until the room's metadata brings the music again (it is newer).
  const [answer, setAnswer] = useState<{ base: RoomMusic | null; music: RoomMusic } | null>(null);
  const may = serverCanPlay ?? canPlay;
  const shown = answer && answer.base === music ? answer.music : (music ?? NO_MUSIC);

  // The progress moves each second while the sheet is open and something plays.
  const [, setTick] = useState(0);
  const ticking = visible && shown.startedAt !== null && shown.pausedAt === null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  const np = playingNow(shown);

  // Opening the sheet reads the room's music once: the server's clock, whether I may play, and the music itself
  // (shown until the metadata brings it again).
  const latest = useRef(music);
  useEffect(() => {
    latest.current = music;
  }, [music]);
  useEffect(() => {
    if (!visible) return;
    let on = true;
    const base = latest.current;
    roomMusicGet(room)
      .then((r) => {
        if (!on) return;
        setServerCanPlay(r.canPlay);
        setAnswer({ base, music: r.music });
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [visible, room]);

  const act = (body: MusicAction, done?: string) => {
    if (busy) return;
    setBusy('key' in body ? `${body.action}:${body.key}` : body.action);
    const base = music;
    roomMusicAction(room, body)
      .then((m) => {
        setAnswer({ base, music: m });
        if (done) onDone?.(done);
      })
      .catch((e) => showAlert('Müzik değişmedi', message(e)))
      .finally(() => setBusy(null));
  };

  // Kütüphanem's picks onto the list; back to the list once they are on it.
  const addTracks = async (ids: string[]) => {
    const base = music;
    try {
      const m = await roomMusicAction(room, { action: 'add', tracks: ids });
      setAnswer({ base, music: m });
      setView('list');
      onDone?.(`🎵 ${ids.length} parça çalma listesine eklendi`);
    } catch (e) {
      showAlert('Listeye eklenmedi', message(e));
    }
  };

  const close = () => {
    setView('list');
    setQuery('');
    onClose();
  };

  // This phone's volume: off here counts as 0, and turning it up turns the music back on here.
  const level = enabled ? volume : 0;
  const lastLevel = useRef(level || DEFAULT_VOLUME);
  const setLevel = (v: number) => {
    if (v > 0) lastLevel.current = v;
    if (v > 0 && !enabled) setEnabled(true);
    setVolume(v);
  };
  const toggleMute = () => setLevel(level > 0 ? 0 : lastLevel.current || DEFAULT_VOLUME);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoid style={{ flex: 1 }}>
        <Pressable style={s.scrim} onPress={close} accessibilityLabel="Kapat" />
        <View style={[s.sheet, { paddingBottom }]}>
          <View style={s.grip} />
          {view === 'library' && may ? (
            <Library list={shown.list} onBack={() => setView('list')} onAdd={addTracks} />
          ) : (
            <>
              <View style={s.head}>
                <Text style={s.title} accessibilityRole="header">
                  Çalma listesi <Text style={s.count}>({shown.list.length})</Text>
                </Text>
                {may && (
                  <Pressable style={s.addBtn} onPress={() => setView('library')} accessibilityRole="button" hitSlop={6}>
                    <Ionicons name="add-circle" size={20} color={t.semantic.actionText} />
                    <Text style={s.addBtnText}>Müzik ekle</Text>
                  </Pressable>
                )}
                <Pressable onPress={close} hitSlop={10} accessibilityLabel="Kapat" accessibilityRole="button">
                  <Ionicons name="close" size={22} color={t.colors.textDim} />
                </Pressable>
              </View>

              {shown.list.length > 0 && (
                <View style={s.search}>
                  <Ionicons name="search" size={16} color={t.colors.textDim} />
                  <TextInput
                    style={s.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Parça ya da sanatçı ara"
                    placeholderTextColor={t.colors.textDim}
                    autoCorrect={false}
                    returnKeyType="search"
                    accessibilityLabel="Çalma listesinde ara"
                  />
                  {!!query && (
                    <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Aramayı temizle" accessibilityRole="button">
                      <Ionicons name="close-circle" size={18} color={t.colors.textDim} />
                    </Pressable>
                  )}
                </View>
              )}

              <Playlist
                list={shown.list}
                query={query}
                np={np}
                may={may}
                busy={busy}
                onJump={(r) => act({ action: 'jump', key: r.key }, `🎵 ${r.title} çalıyor`)}
                onTop={(r) => act({ action: 'top', key: r.key })}
                onRemove={(r) => act({ action: 'remove', key: r.key })}
                onClear={() =>
                  showAlert('Liste boşaltılsın mı?', 'Müzik durur ve listedeki bütün parçalar çıkar. Kütüphanendekiler yerinde kalır.', [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Boşalt', style: 'destructive', onPress: () => act({ action: 'clear' }, 'Çalma listesi boşaltıldı') },
                  ])
                }
              />

              <Player music={shown} np={np} may={may} busy={busy} act={act} level={level} setLevel={setLevel} onMute={toggleMute} />
            </>
          )}
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

function Playlist({
  list,
  query,
  np,
  may,
  busy,
  onJump,
  onTop,
  onRemove,
  onClear,
}: {
  list: QueueTrack[];
  query: string;
  np: NowPlaying | null;
  may: boolean;
  busy: string | null;
  onJump: (r: QueueTrack) => void;
  onTop: (r: QueueTrack) => void;
  onRemove: (r: QueueTrack) => void;
  onClear: () => void;
}) {
  const s = useStyles();
  const t = useTheme();
  const rows = query.trim() ? list.filter((r) => matchTrack(r, query)) : list;
  const playing = np?.track.key ?? null;
  // The row after the playing one already plays next: no "öne al" on it (nor on the first when nothing plays).
  const at = list.findIndex((r) => r.key === playing);
  const nextKey = list[at + 1]?.key ?? null;

  if (!list.length)
    return (
      <View style={s.empty}>
        <Ionicons name="musical-notes-outline" size={30} color={t.colors.textDim} />
        <Text style={s.emptyTitle}>Liste boş</Text>
        <Text style={s.emptyText}>{may ? '“Müzik ekle” ile kütüphanenden parça seç; odadaki herkes aynı anda dinler.' : 'Odada müziği oda sahibi, yöneticiler ve DJ’ler açar.'}</Text>
      </View>
    );
  return (
    <ScrollView style={s.rows} contentContainerStyle={{ paddingBottom: space.sm }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {rows.map((r) => {
        const on = r.key === playing;
        const sub = subOf(r);
        return (
          <View key={r.key} style={[s.row, on && s.rowOn]}>
            {/* The row's text plays it (who may play); its buttons sit beside it, not inside. */}
            <Pressable
              style={({ pressed }) => [s.rowMain, pressed && may && !on && s.rowPressed]}
              onPress={may && !on ? () => onJump(r) : undefined}
              disabled={!may || on || !!busy}
              accessibilityRole={may && !on ? 'button' : 'text'}
              accessibilityLabel={`${r.title}${r.artist ? `, ${r.artist}` : ''}, ${mmss(r.seconds)}${on ? (np?.paused ? ', duraklatıldı' : ', çalıyor') : ''}`}
              accessibilityHint={may && !on ? 'Odada bu parça çalar' : undefined}
            >
              {on && <Ionicons name={np?.paused ? 'pause' : 'volume-high'} size={16} color={t.semantic.actionText} />}
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, on && s.rowTitleOn]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {sub}
                </Text>
              </View>
            </Pressable>
            {may && !on && r.key !== nextKey && !(at < 0 && r.key === list[0].key) && (
              <Pressable onPress={() => onTop(r)} disabled={!!busy} hitSlop={8} style={s.rowBtn} accessibilityRole="button" accessibilityLabel={`${r.title} sıradaki olsun`}>
                {busy === `top:${r.key}` ? <ActivityIndicator size="small" color={t.colors.textDim} /> : <Ionicons name="arrow-up-circle-outline" size={22} color={t.colors.textDim} />}
              </Pressable>
            )}
            {may && (
              <Pressable onPress={() => onRemove(r)} disabled={!!busy} hitSlop={8} style={s.rowBtn} accessibilityRole="button" accessibilityLabel={`${r.title} listeden çıksın`}>
                {busy === `remove:${r.key}` ? <ActivityIndicator size="small" color={t.colors.textDim} /> : <Ionicons name="close" size={20} color={t.colors.textDim} />}
              </Pressable>
            )}
          </View>
        );
      })}
      {!rows.length && <Text style={[s.emptyText, { marginTop: space.lg }]}>“{query.trim()}” listede yok.</Text>}
      {may && !query.trim() && (
        <Pressable onPress={onClear} disabled={!!busy} style={s.clear} accessibilityRole="button" hitSlop={6}>
          <Text style={s.clearText}>Listeyi boşalt</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/** The small player under the list: progress and this phone's volume for everyone, the controls for who plays. */
function Player({
  music,
  np,
  may,
  busy,
  act,
  level,
  setLevel,
  onMute,
}: {
  music: RoomMusic;
  np: NowPlaying | null;
  may: boolean;
  busy: string | null;
  act: (body: MusicAction) => void;
  level: number;
  setLevel: (v: number) => void;
  onMute: () => void;
}) {
  const s = useStyles();
  const t = useTheme();
  const track = np?.track ?? null;
  const pos = np?.position ?? 0;
  const by = [track?.artist, track?.byName && `${track.byName} ekledi`].filter(Boolean).join(' · ');
  const repeatOn = music.repeat !== 'off';
  const has = music.list.length > 0;
  const spin = (a: string, icon: keyof typeof Ionicons.glyphMap, size: number, color: string) =>
    busy === a ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={size} color={color} />;

  return (
    <View style={s.player}>
      <Text style={[s.npTitle, !track && s.npIdle]} numberOfLines={1}>
        {track ? track.title : has ? 'Şu an çalan yok' : 'Müzik yok'}
      </Text>
      {!!by && (
        <Text style={s.npSub} numberOfLines={1}>
          {by}
        </Text>
      )}
      <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={track ? { min: 0, max: track.seconds, now: Math.floor(pos) } : undefined}>
        <View style={[s.barFill, { width: track ? `${Math.min(100, (pos / track.seconds) * 100)}%` : '0%' }]} />
      </View>
      <View style={s.times}>
        <Text style={s.time}>{mmss(pos)}</Text>
        <Text style={s.time}>{track ? mmss(track.seconds) : '0:00'}</Text>
      </View>

      {may && (
        <View style={s.controls}>
          <Pressable
            onPress={() => act({ action: 'repeat', mode: nextRepeat(music.repeat) })}
            disabled={!!busy}
            style={s.ctrl}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${REPEAT_LABEL[music.repeat]}. Değiştir`}
          >
            {spin('repeat', 'repeat', 22, repeatOn ? t.semantic.actionText : t.colors.textDim)}
            {music.repeat === 'one' && busy !== 'repeat' && <Text style={s.repeatOne}>1</Text>}
          </Pressable>
          <Pressable onPress={() => act({ action: 'prev' })} disabled={!!busy || !has} style={[s.ctrl, !has && s.off]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Önceki parça">
            {spin('prev', 'play-skip-back', 24, t.colors.text)}
          </Pressable>
          <Pressable
            onPress={() => act({ action: np && !np.paused ? 'pause' : 'resume' })}
            disabled={!!busy || !has}
            style={[s.play, !has && s.off]}
            accessibilityRole="button"
            accessibilityLabel={np && !np.paused ? 'Duraklat' : 'Çal'}
          >
            {busy === 'pause' || busy === 'resume' ? (
              <ActivityIndicator color={t.semantic.actionInk} />
            ) : (
              <Ionicons name={np && !np.paused ? 'pause' : 'play'} size={26} color={t.semantic.actionInk} style={np && !np.paused ? undefined : { marginLeft: 3 }} />
            )}
          </Pressable>
          <Pressable onPress={() => act({ action: 'skip' })} disabled={!!busy || !np} style={[s.ctrl, !np && s.off]} hitSlop={6} accessibilityRole="button" accessibilityLabel="Sonraki parça">
            {spin('skip', 'play-skip-forward', 24, t.colors.text)}
          </Pressable>
          {/* Balances the repeat button, so play stays in the middle. */}
          <View style={s.ctrl} />
        </View>
      )}

      <View style={s.volume}>
        <Pressable
          onPress={onMute}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={level > 0 ? 'Bu telefonda sesi kapat' : 'Bu telefonda sesi aç'}
        >
          <Ionicons name={level === 0 ? 'volume-mute' : level < 0.4 ? 'volume-low' : level < 0.75 ? 'volume-medium' : 'volume-high'} size={20} color={level === 0 ? t.colors.textDim : t.colors.text} />
        </Pressable>
        <VolumeSlider value={level} onChange={setLevel} />
        <Text style={s.volumeNote}>Bu telefonda</Text>
      </View>
    </View>
  );
}

const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

/** A horizontal slider, 0–1: drag or tap along it; the value is set when the finger lifts. */
function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const s = useStyles();
  const [drag, setDrag] = useState<number | null>(null);
  const width = useRef(1);
  // Where the finger came down: along the slider and on the screen; a move is read from the screen.
  const start = useRef({ x: 0, page: 0 });
  const last = useRef(value);
  const to = (pageX: number) => {
    last.current = clamp((start.current.x + pageX - start.current.page) / width.current);
    setDrag(last.current);
  };
  const end = () => {
    onChange(last.current);
    setDrag(null);
  };
  const v = drag ?? value;
  return (
    <View
      style={s.slider}
      onLayout={(e) => (width.current = Math.max(1, e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        start.current = { x: e.nativeEvent.locationX, page: e.nativeEvent.pageX };
        to(e.nativeEvent.pageX);
      }}
      onResponderMove={(e) => to(e.nativeEvent.pageX)}
      onResponderRelease={end}
      onResponderTerminate={end}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Bu telefonda müziğin sesi"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)))}
    >
      <View style={s.sliderTrack} pointerEvents="none">
        <View style={[s.sliderFill, { width: `${v * 100}%` }]} />
      </View>
      <View style={[s.sliderThumb, { left: `${v * 100}%` }]} pointerEvents="none" />
    </View>
  );
}

/** Kütüphanem: my tracks, picked (several at once) and put on the room's list; more from the phone; deleted. */
function Library({ list, onBack, onAdd }: { list: QueueTrack[]; onBack: () => void; onAdd: (ids: string[]) => Promise<void> }) {
  const s = useStyles();
  const t = useTheme();
  const [lib, setLib] = useState<LibraryTrack[] | null>(null);
  // Picked ids in the order they were tapped: that is the order they go on the list.
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    let on = true;
    myMusic()
      .then((x) => on && setLib(x))
      .catch((e) => on && (setLib([]), showAlert('Kütüphane açılamadı', message(e))));
    return () => {
      on = false;
    };
  }, []);

  const tracks = lib ?? [];
  const onList = new Set(list.map((r) => r.url));
  const all = tracks.length > 0 && picked.length === tracks.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const addPicked = () => {
    if (!picked.length || busy) return;
    setBusy(true);
    // On success the sheet goes back to the list (this view closes); on failure the picks stay.
    void onAdd(picked).finally(() => setBusy(false));
  };

  const deletePicked = () => {
    const ids = [...picked];
    showAlert(
      ids.length === 1 ? 'Parça silinsin mi?' : `${ids.length} parça silinsin mi?`,
      'Kütüphanenden ve odalardaki çalma listelerinden çıkar.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const gone: string[] = [];
            let failed: unknown = null;
            for (const id of ids) {
              try {
                await removeTrack(id);
                gone.push(id);
              } catch (e) {
                failed = e;
              }
            }
            setLib((l) => (l ?? []).filter((x) => !gone.includes(x.id)));
            setPicked((p) => p.filter((x) => !gone.includes(x)));
            setBusy(false);
            if (failed) showAlert('Bazı parçalar silinemedi', message(failed));
          },
        },
      ],
    );
  };

  const addFromPhone = async () => {
    if (upload) return;
    const left = LIBRARY_MAX - tracks.length;
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
        const added = await uploadTrack({ uri: f.uri, name: f.name, size: f.size, mimeType: f.mimeType }, seconds);
        setLib((l) => [added, ...(l ?? [])]);
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
    <>
      <View style={s.head}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Çalma listesine dön">
          <Ionicons name="arrow-back" size={22} color={t.colors.text} />
        </Pressable>
        <Text style={[s.title, { flex: 1 }]} accessibilityRole="header">
          Kütüphanem{' '}
          <Text style={s.count}>
            {tracks.length}/{LIBRARY_MAX}
          </Text>
        </Text>
        {picked.length > 0 && (
          <Pressable onPress={deletePicked} disabled={busy} style={s.delBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Seçilen ${picked.length} parçayı sil`}>
            <Ionicons name="trash-outline" size={17} color={t.semantic.danger} />
            <Text style={s.delText}>Sil</Text>
          </Pressable>
        )}
      </View>

      {tracks.length > 0 && (
        <Pressable
          style={s.pickAll}
          onPress={() => setPicked(all ? [] : tracks.map((x) => x.id))}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: all }}
          accessibilityLabel="Tümünü seç"
        >
          <Ionicons name={all ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={all ? t.semantic.actionText : t.colors.textDim} />
          <Text style={s.pickAllText}>Tümünü seç</Text>
          {picked.length > 0 && <Text style={s.rowSub}>{picked.length} seçili</Text>}
        </Pressable>
      )}

      <ScrollView style={s.rows} contentContainerStyle={{ paddingBottom: space.sm }} showsVerticalScrollIndicator={false}>
        {lib === null && <ActivityIndicator color={t.semantic.actionText} style={{ marginVertical: space.lg }} />}
        {lib?.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="library-outline" size={30} color={t.colors.textDim} />
            <Text style={s.emptyTitle}>Kütüphanen boş</Text>
            <Text style={s.emptyText}>“Telefondan ekle” ile telefonundaki müzik dosyalarını seç; burada durur, istediğini listeye koyarsın.</Text>
          </View>
        )}
        {tracks.map((x) => {
          const on = picked.includes(x.id);
          return (
            <Pressable
              key={x.id}
              style={({ pressed }) => [s.row, on && s.rowPicked, pressed && s.rowPressed]}
              onPress={() => toggle(x.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${x.title}${x.artist ? `, ${x.artist}` : ''}, ${mmss(x.seconds)}`}
            >
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? t.semantic.actionText : t.colors.textDim} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>
                  {x.title}
                </Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {subOf(x)}
                </Text>
              </View>
              {onList.has(x.url) && <Text style={s.tag}>Listede</Text>}
            </Pressable>
          );
        })}
        {tracks.length > 0 && <Text style={s.note}>Yalnızca çalma hakkın olan müzikleri ekle. Parça başına en fazla 20 MB ve 20 dakika.</Text>}
      </ScrollView>

      <View style={s.libBar}>
        <Pressable style={[s.secondary, !!upload && { opacity: 0.7 }]} onPress={addFromPhone} disabled={!!upload} accessibilityRole="button">
          {upload ? <ActivityIndicator size="small" color={t.semantic.actionText} /> : <Ionicons name="phone-portrait-outline" size={18} color={t.semantic.actionText} />}
          <Text style={s.secondaryText} numberOfLines={1}>
            {upload ? `Yükleniyor ${upload.done}/${upload.total}` : 'Telefondan ekle'}
          </Text>
        </Pressable>
        <Pressable style={[s.primary, (!picked.length || busy) && s.primaryOff]} onPress={addPicked} disabled={!picked.length || busy} accessibilityRole="button">
          {busy ? (
            <ActivityIndicator size="small" color={t.semantic.actionInk} />
          ) : (
            <Text style={[s.primaryText, !picked.length && s.primaryTextOff]} numberOfLines={1}>
              Çalma listesine ekle{picked.length ? ` (${picked.length})` : ''}
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

const THUMB = 18;
const useStyles = makeStyles(({ colors, semantic, surface, edge, ink }) => ({
  scrim: { flex: 1, backgroundColor: SCRIM },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    height: '78%',
    maxHeight: '92%',
    ...edge.sheet,
  },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: ink(0.18), marginBottom: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md, minHeight: 32 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  count: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: semantic.tonal },
  addBtnText: { color: semantic.tonalText, fontSize: 13, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, height: 40, borderRadius: radius.pill, backgroundColor: ink(0.06), marginBottom: space.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  rows: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.sm, borderRadius: radius.md },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, alignSelf: 'stretch', borderRadius: radius.sm },
  rowOn: { backgroundColor: semantic.tonal },
  rowPicked: { backgroundColor: ink(0.04) },
  rowPressed: { backgroundColor: surface.pressed },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowTitleOn: { color: semantic.actionText, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  rowBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  tag: { color: colors.textDim, fontSize: 11, fontWeight: '700', paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: ink(0.2) },
  clear: { alignSelf: 'center', marginTop: space.md, paddingHorizontal: space.md, paddingVertical: 6 },
  clearText: { color: colors.textDim, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: space.xl, paddingVertical: space.lg },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyText: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  note: { color: colors.textDim, fontSize: 11, marginTop: space.md, lineHeight: 16, paddingHorizontal: space.sm },
  // Player
  player: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: surface.hairline, paddingTop: space.md, marginHorizontal: -space.lg, paddingHorizontal: space.lg },
  npTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  npIdle: { color: colors.textDim, fontWeight: '600' },
  npSub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  bar: { height: 4, borderRadius: 2, backgroundColor: ink(0.12), marginTop: space.md, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: semantic.action },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { color: colors.textDim, fontSize: 11, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs, paddingHorizontal: space.sm },
  ctrl: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  repeatOne: { position: 'absolute', right: 6, top: 6, color: semantic.actionText, fontSize: 10, fontWeight: '800' },
  play: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.action, boxShadow: '0 6px 18px rgba(255,95,162,0.3)' },
  off: { opacity: 0.35 },
  volume: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm, paddingVertical: space.xs },
  volumeNote: { color: colors.textDim, fontSize: 11 },
  slider: { flex: 1, height: 28, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 2, backgroundColor: ink(0.12), overflow: 'hidden' },
  sliderFill: { height: 4, backgroundColor: colors.textDim },
  sliderThumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, marginLeft: -THUMB / 2, backgroundColor: colors.text, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  // Library
  delBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 4 },
  delText: { color: semantic.danger, fontSize: 13, fontWeight: '700' },
  pickAll: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: surface.hairline, marginBottom: space.xs },
  pickAllText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  libBar: { flexDirection: 'row', gap: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: surface.hairline, marginHorizontal: -space.lg, paddingHorizontal: space.lg },
  secondary: { flex: 1, height: 46, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: semantic.tonal },
  secondaryText: { color: semantic.tonalText, fontSize: 14, fontWeight: '700' },
  primary: { flex: 1.3, height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.action, paddingHorizontal: space.sm },
  primaryOff: { backgroundColor: ink(0.08) },
  primaryText: { color: semantic.actionInk, fontSize: 14, fontWeight: '800' },
  primaryTextOff: { color: colors.textDim },
}));
