// The room's shared screen (Video and Sinema Salonu): one YouTube player that follows the room's PlaybackState
// (lib/room-modes). People allowed to manage the stage open links and play / pause / seek for everyone; everybody
// else can only mute or pause for themselves, which never changes the room.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { YouTubePlayer } from '@/components/room/youtube-player';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { SEEK_STEP_S, expectedPosition, pauseVideo, playVideo, reportPlayer, seekVideo, setVideo, stopVideo, type PlaybackState } from '@/lib/room-modes';
import type { Result } from '@/lib/room-presence';
import { thumbnailUrl, watchUrl, ytErrorText } from '@/lib/youtube';
import { colors, radius, semantic, space } from '@/theme';

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};
const STATUS: Record<PlaybackState['playbackStatus'], { text: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  playing: { text: 'Oynatılıyor', color: semantic.live, icon: 'play' },
  paused: { text: 'Duraklatıldı', color: colors.textDim, icon: 'pause' },
  ended: { text: 'Bitti', color: colors.textDim, icon: 'checkmark' },
  error: { text: 'Oynatılamıyor', color: semantic.danger, icon: 'alert-circle' },
};

export function RoomScreen({
  roomId,
  playback,
  always,
  canControl,
  denyReason,
  width,
  offline,
  onChanged,
}: {
  roomId: string;
  playback: PlaybackState | null;
  /** Sinema Salonu: the screen is always there. Video: a slim bar until a video is opened. */
  always: boolean;
  canControl: boolean;
  denyReason: string | null;
  width: number;
  /** Viewer offline: the player keeps going locally and is synced to the room on reconnect. */
  offline: boolean;
  /** A successful room-wide change, for the chat line. */
  onChanged: (text: string) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [hold, setHold] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // A new video clears this viewer's own hold and errors.
  const [shownId, setShownId] = useState(playback?.videoId ?? null);
  if ((playback?.videoId ?? null) !== shownId) {
    setShownId(playback?.videoId ?? null);
    setHold(false);
    setLocalError(null);
    setBlocked(false);
  }
  // The time line under the player moves once a second while the room plays.
  const [now, setNow] = useState(() => Date.now());
  const ticking = playback?.playbackStatus === 'playing';
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  const h = Math.round(Math.min(width - space.lg * 2, 640) * 9 / 16);

  const run = (r: Result, text?: string) => {
    if (!r.ok) showAlert('Yapılamadı', r.reason);
    else if (text) onChanged(text);
    return r.ok;
  };
  const open = () => {
    const r = setVideo(roomId, 'me', link);
    if (!r.ok) return setLinkError(r.reason);
    setLinkOpen(false);
    setLink('');
    setLinkError(null);
    onChanged('📺 Ortak ekranda yeni bir YouTube videosu açtı');
  };
  const pos = playback ? expectedPosition(playback, now) : 0;
  const seekBy = (d: number) => playback && run(seekVideo(roomId, 'me', expectedPosition(playback) + d));

  if (!playback && !always)
    return canControl ? (
      <>
        <Pressable onPress={() => setLinkOpen(true)} style={st.bar} accessibilityRole="button" accessibilityLabel="Ortak ekranda YouTube videosu aç">
          <Ionicons name="logo-youtube" size={18} color={semantic.danger} />
          <Text style={st.barText}>Ortak ekranda YouTube videosu aç</Text>
          <Ionicons name="add-circle-outline" size={20} color={semantic.action} />
        </Pressable>
        <LinkModal visible={linkOpen} link={link} setLink={setLink} error={linkError} onOpen={open} onClose={() => setLinkOpen(false)} />
      </>
    ) : null;

  const status = playback ? STATUS[playback.playbackStatus] : null;
  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Ionicons name="logo-youtube" size={16} color={semantic.danger} />
        <Text style={st.headText} numberOfLines={1}>
          Ortak ekran
        </Text>
        {status && (
          <View style={st.chip} accessibilityLabel={`Oda durumu: ${status.text}`}>
            <Ionicons name={status.icon} size={11} color={status.color} />
            <Text style={[st.chipText, { color: status.color }]}>{status.text}</Text>
          </View>
        )}
        <Text style={st.who} numberOfLines={1}>
          {canControl ? 'Kontrol sende' : 'Oda yönetimi kontrol ediyor'}
        </Text>
      </View>

      <View style={[st.screen, { height: h }]}>
        {playback && playback.playbackStatus !== 'error' && !loadError ? (
          <YouTubePlayer
            playback={playback}
            hold={hold}
            muted={muted}
            onReport={(r) => {
              if (r.errorCode !== undefined) setLocalError(ytErrorText(r.errorCode));
              reportPlayer(roomId, 'me', { videoId: playback.videoId, ...r });
            }}
            onUserState={(playing) => setHold(!playing || playback.playbackStatus !== 'playing')}
            onBlocked={setBlocked}
            onLoadError={setLoadError}
          />
        ) : playback ? (
          <View style={st.center}>
            {thumbnailUrl(playback.videoId) && <Image source={{ uri: thumbnailUrl(playback.videoId)! }} style={[StyleSheet.absoluteFill, { opacity: 0.25 }]} blurRadius={6} />}
            <Ionicons name="alert-circle" size={30} color={semantic.danger} />
            <Text style={st.centerText} accessibilityRole="alert">
              {loadError ?? playback.error ?? 'Video oynatılamıyor.'}
            </Text>
            {loadError && (
              <Pressable onPress={() => setLoadError(null)} style={st.small} accessibilityRole="button">
                <Text style={st.smallText}>Yeniden dene</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={st.center}>
            <Ionicons name="film-outline" size={34} color={colors.gold} />
            <Text style={st.centerText}>{canControl ? 'Herkesle birlikte izlemek için bir YouTube bağlantısı aç.' : 'Oda yönetimi henüz bir video açmadı.'}</Text>
            {canControl && (
              <Pressable onPress={() => setLinkOpen(true)} style={st.primary} accessibilityRole="button" accessibilityLabel="YouTube bağlantısı aç">
                <Text style={st.primaryText}>YouTube bağlantısı aç</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {localError && playback?.playbackStatus !== 'error' && (
        <Text style={st.warn} accessibilityRole="alert">
          ⚠️ Bu cihazda: {localError}
        </Text>
      )}
      {blocked && !hold && <Text style={st.warn}>▶ Tarayıcı/cihaz sesli otomatik oynatmayı durdurdu. Oynatmak için videoya dokun; oda konumuna eşitlenir.</Text>}
      {offline && playback && <Text style={st.warn}>Bağlantı yok: video bu cihazda kaldığı yerden sürer. Bağlantı gelince oda konumuna eşitlenir.</Text>}

      {playback && (
        <View style={st.controls}>
          {canControl ? (
            <>
              <Ctl icon="play-back" label={`${SEEK_STEP_S} saniye geri`} onPress={() => seekBy(-SEEK_STEP_S)} />
              {playback.playbackStatus === 'playing' ? (
                <Ctl icon="pause" label="Herkes için duraklat" big onPress={() => run(pauseVideo(roomId, 'me'), '⏸ Ortak videoyu duraklattı')} />
              ) : (
                <Ctl icon="play" label="Herkes için oynat" big onPress={() => run(playVideo(roomId, 'me'), '▶ Ortak videoyu oynattı')} />
              )}
              <Ctl icon="play-forward" label={`${SEEK_STEP_S} saniye ileri`} onPress={() => seekBy(SEEK_STEP_S)} />
              <Ctl icon="swap-horizontal" label="Videoyu değiştir" onPress={() => setLinkOpen(true)} />
              <Ctl icon="stop" label="Ortak ekranı kapat" onPress={() => run(stopVideo(roomId, 'me'), '⏹ Ortak videoyu kapattı')} />
            </>
          ) : (
            <Text style={st.dim} numberOfLines={2}>
              {denyReason ?? 'Oynat/duraklat oda yönetimindedir.'}
            </Text>
          )}
          <View style={{ flex: 1 }} />
          <Ctl icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Sesi benim için aç' : 'Benim için sessize al'} onPress={() => setMuted((m) => !m)} />
          {hold && <Ctl icon="sync" label="Odayla eşitle" onPress={() => setHold(false)} />}
          {watchUrl(playback.videoId) && <Ctl icon="open-outline" label="YouTube'da aç" onPress={() => Linking.openURL(watchUrl(playback.videoId)!).catch(() => {})} />}
        </View>
      )}
      {playback && (
        <Text style={st.dim} numberOfLines={1}>
          {fmt(pos)}
          {playback.duration ? ` / ${fmt(playback.duration)}` : ''} · son değişiklik: {playback.updatedBy === 'me' ? 'sen' : userById(playback.updatedBy).name}
          {hold ? ' · senin için duraklatıldı' : ''}
        </Text>
      )}
      <LinkModal visible={linkOpen} link={link} setLink={setLink} error={linkError} onOpen={open} onClose={() => setLinkOpen(false)} />
    </View>
  );
}

function Ctl({ icon, label, onPress, big }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; big?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[st.ctl, big && st.ctlBig]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={big ? 22 : 18} color={big ? semantic.actionInk : colors.text} />
    </Pressable>
  );
}

function LinkModal({ visible, link, setLink, error, onOpen, onClose }: { visible: boolean; link: string; setLink: (s: string) => void; error: string | null; onOpen: () => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={st.dialog}>
        <Text style={st.dialogTitle}>YouTube bağlantısı</Text>
        <Text style={st.dim}>youtube.com/watch, youtu.be, youtube.com/embed, m.youtube.com veya Shorts bağlantısı yapıştır. Başka sitelerin bağlantıları açılmaz.</Text>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="https://www.youtube.com/watch?v=…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={onOpen}
          style={st.input}
          accessibilityLabel="YouTube bağlantısı"
        />
        {error && (
          <Text style={st.err} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Text style={st.dim}>Arama bu sürümde yok (YouTube arama hizmeti bağlı değil); videoyu bağlantısıyla aç. Herkes aynı konuma ±2 sn içinde eşitlenir; reklam ve ağ gecikmesi kişiye göre fark yaratabilir.</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <Pressable onPress={onClose} style={[st.small, { flex: 1 }]} accessibilityRole="button">
            <Text style={st.smallText}>Vazgeç</Text>
          </Pressable>
          <Pressable onPress={onOpen} style={[st.primary, { flex: 1 }]} accessibilityRole="button" accessibilityLabel="Herkes için aç">
            <Text style={st.primaryText}>Herkes için aç</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { marginHorizontal: space.lg, marginTop: space.sm, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '700' },
  who: { color: colors.textDim, fontSize: 11, flex: 1, textAlign: 'right' },
  screen: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: colors.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg },
  centerText: { color: colors.text, textAlign: 'center', fontSize: 13, lineHeight: 18 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  ctl: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  ctlBig: { width: 44, height: 44, borderRadius: 22, backgroundColor: semantic.action },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  warn: { color: colors.gold, fontSize: 12, lineHeight: 17 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border },
  barText: { color: colors.text, fontWeight: '700', flex: 1 },
  primary: { backgroundColor: semantic.action, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 10, alignItems: 'center' },
  primaryText: { color: semantic.actionInk, fontWeight: '800' },
  small: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 10, alignItems: 'center' },
  smallText: { color: colors.text, fontWeight: '700' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  dialog: { marginTop: 'auto', marginBottom: 'auto', marginHorizontal: space.lg, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, maxWidth: 520, alignSelf: 'center', width: '92%' },
  dialogTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 14 },
  err: { color: semantic.danger, fontSize: 13 },
});
