// Hediye ve giriş efektleri, admins only (Ayarlar, next to Yönetim): every full-screen video effect
// (components/fx/video-fx) plays over a room's stage at a tap, without sending a gift or paying anything. Its sound
// plays unless "Sessiz" is on. A phone build without the transparent video module, and the web, say so instead.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GiftArt } from '@/components/GiftArt';
import { Text } from '@/components/text';
import { Header } from '@/components/ui';
import { EFFECT_VIDEOS, VideoFx } from '@/components/fx/video-fx';
import { StageBackdrop } from '@/components/room/stage-backdrop';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { alphaVideoAvailable } from '../../../modules/similar-alpha-video';

export function EffectPreviewPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && <Body onClose={onClose} />}
    </Modal>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const [playing, setPlaying] = useState<{ key: string; run: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const current = playing ? EFFECT_VIDEOS.find((v) => v.key === playing.key) : undefined;
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
        <View style={{ flex: 1 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.list}>
          {EFFECT_VIDEOS.map((v) => {
            const on = playing?.key === v.key;
            return (
              <Pressable
                key={v.key}
                onPress={() => setPlaying((p) => ({ key: v.key, run: (p?.run ?? 0) + 1 }))}
                style={({ pressed }) => [s.chip, on && { borderColor: semantic.action }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                accessibilityLabel={`${v.label} (${v.kind}) oynat`}
              >
                {v.kind === 'Hediye' ? <GiftArt giftId={v.key} emoji='🎁' size={44} /> : <Text style={{ fontSize: 34 }}>🐉</Text>}
                <Ionicons name={on ? 'play-circle' : 'play-circle-outline'} size={20} color={on ? semantic.action : colors.text} />
                <Text style={s.chipName}>{v.label}</Text>
                <Text style={s.chipKind}>{v.kind}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
      {current && playing && <VideoFx key={`${current.key}-${playing.run}`} media={current.media} muted={muted} onDone={() => setPlaying(null)} />}
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
