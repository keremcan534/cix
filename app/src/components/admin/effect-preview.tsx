// Hediye ve giriş efektleri, admins only (Ayarlar, next to Yönetim): every full-screen video effect the server
// lists (components/fx/video-fx, lib/fx-videos) plays over a room's stage at a tap, without sending a gift or paying
// anything; one not on the phone yet is downloaded first. Its sound plays unless "Sessiz" is on. A phone build
// without the transparent video module, and the web, say so instead.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GiftArt } from '@/components/GiftArt';
import { Text } from '@/components/text';
import { Header } from '@/components/ui';
import { VideoFx, type FxMedia } from '@/components/fx/video-fx';
import { StageBackdrop } from '@/components/room/stage-backdrop';
import { COSMETICS } from '@/data/catalog';
import { GIFTS } from '@/data/mock';
import { fetchFxNow, useFxState } from '@/lib/fx-videos';
import { fxFileName, type FxVideo } from '@/lib/fx-videos-core';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { alphaVideoAvailable } from '../../../modules/similar-alpha-video';

export function EffectPreviewPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && <Body onClose={onClose} />}
    </Modal>
  );
}

/** The name a clip is shown with: its gift's or its entry effect's. */
const labelOf = (v: FxVideo) =>
  v.kind === 'gift' ? (GIFTS.find((g) => g.id === v.id)?.name ?? v.id) : (COSMETICS.find((c) => c.kind === 'entry' && c.fx === v.id)?.name ?? v.id);
const keyOf = (v: FxVideo) => `${v.kind}:${v.id}`;

function Body({ onClose }: { onClose: () => void }) {
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const { list, ready, loading } = useFxState();
  const [playing, setPlaying] = useState<{ key: string; media: FxMedia; run: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const play = async (v: FxVideo) => {
    setFailed(null);
    const media = await fetchFxNow(v.kind, v.id);
    if (media) setPlaying((p) => ({ key: keyOf(v), media, run: (p?.run ?? 0) + 1 }));
    else setFailed(labelOf(v));
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StageBackdrop theme="chat" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <Header
          title="Hediye ve giriş efektleri"
          onBack={onClose}
          right={
            <Pressable onPress={() => setMuted((m) => !m)} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: muted }} accessibilityLabel="Sessiz">
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={colors.text} />
            </Pressable>
          }
        />
        {!alphaVideoAvailable && (
          <Text style={s.notice}>Bu cihazda şeffaf video oynatıcı yok (web ya da eski uygulama sürümü). Efektler yeni APK&apos;da görünür.</Text>
        )}
        {alphaVideoAvailable && !list.length && <Text style={s.notice}>Sunucu henüz video listesi göndermedi. Bağlantını kontrol et ya da biraz sonra tekrar aç.</Text>}
        {!!failed && <Text style={s.notice}>{failed} indirilemedi. Bağlantını kontrol edip tekrar dene.</Text>}
        <View style={{ flex: 1 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.list}>
          {list.map((v) => {
            const on = playing?.key === keyOf(v);
            const name = fxFileName(v);
            const busy = loading.has(name);
            const kind = v.kind === 'gift' ? 'Hediye' : 'Giriş efekti';
            const mb = (v.bytes / 1_048_576).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
            return (
              <Pressable
                key={keyOf(v)}
                onPress={() => void play(v)}
                disabled={busy}
                style={({ pressed }) => [s.chip, on && { borderColor: semantic.action }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel={`${labelOf(v)} (${kind}) oynat`}
              >
                {v.kind === 'gift' ? <GiftArt giftId={v.id} emoji="🎁" size={44} /> : <Text style={{ fontSize: 34 }}>🐉</Text>}
                {busy ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name={on ? 'play-circle' : 'play-circle-outline'} size={20} color={on ? semantic.action : colors.text} />}
                <Text style={s.chipName}>{labelOf(v)}</Text>
                <Text style={s.chipKind}>{kind}</Text>
                <Text style={s.chipKind}>{busy ? 'İniyor…' : ready.has(name) ? `Telefonda · ${mb} MB` : `İnecek · ${mb} MB`}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
      {playing && <VideoFx key={`${playing.key}-${playing.run}`} media={playing.media} muted={muted} onDone={() => setPlaying(null)} />}
    </View>
  );
}

const useStyles = makeStyles(({ colors, ink }) => ({
  notice: { color: colors.textDim, fontSize: 13, marginHorizontal: space.lg, marginTop: space.sm, backgroundColor: 'rgba(22,14,18,0.6)', borderRadius: radius.md, padding: space.sm },
  list: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg, alignItems: 'flex-start' },
  chip: { width: 108, alignItems: 'center', gap: 4, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: 'rgba(22,14,18,0.72)', borderWidth: 1.5, borderColor: ink(0.12) },
  chipName: { color: colors.text, fontWeight: '800', fontSize: 13 },
  chipKind: { color: colors.textDim, fontSize: 11 },
}));
