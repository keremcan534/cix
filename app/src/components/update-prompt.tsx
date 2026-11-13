// The side-loaded APK's own update card: when a newer build is out (lib/app-update), a card over the tab bar says so
// once per start. "Güncelle" downloads it inside the app with a progress bar and opens Android's installer
// (lib/app-install); "Sonra" hides it until the next start (Ayarlar › Güncelleme mevcut still has it). Old downloads
// are deleted when the app starts.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { cleanOldDownloads, installUpdate, useInstallState } from '@/lib/app-install';
import { useAppUpdate } from '@/lib/app-update';
import { makeStyles, radius, space, useTheme } from '@/theme';

/** Over the tab bar (about 64 high) and the phone's own bottom edge. */
const ABOVE_TABS = 76;

export function UpdatePrompt() {
  const update = useAppUpdate();
  const install = useInstallState();
  const [later, setLater] = useState(false);
  const insets = useSafeAreaInsets();
  const { semantic } = useTheme();
  const s = useStyles();
  useEffect(() => {
    void cleanOldDownloads();
  }, []);
  if (Platform.OS !== 'android' || !update || (later && install.phase === 'idle')) return null;

  const busy = install.phase === 'downloading' || install.phase === 'installing';
  const pct = install.phase === 'downloading' ? Math.round(install.progress * 100) : 0;
  const line =
    install.phase === 'downloading'
      ? `İndiriliyor · %${pct}`
      : install.phase === 'installing'
        ? 'Kurulum ekranı açılıyor…'
        : install.phase === 'failed'
          ? `${install.error}. İnternet bağlantını kontrol edip yeniden dene.`
          : 'Uygulamanın içinden güncellenir; hesabın ve verilerin silinmez.';

  return (
    <View style={[s.wrap, { bottom: ABOVE_TABS + insets.bottom }]} pointerEvents="box-none">
      <View style={s.card} accessibilityLiveRegion="polite">
        <View style={s.row}>
          <View style={s.icon}>
            <Ionicons name="cloud-download" size={20} color={semantic.actionInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Yeni sürüm hazır</Text>
            <Text style={s.body}>{line}</Text>
          </View>
        </View>
        {install.phase === 'downloading' && (
          <View style={s.bar}>
            <View style={[s.fill, { width: `${Math.max(3, pct)}%` }]} />
          </View>
        )}
        {!busy && (
          <View style={s.actions}>
            <Pressable onPress={() => setLater(true)} style={s.later} accessibilityRole="button" hitSlop={6}>
              <Text style={s.laterText}>Sonra</Text>
            </Pressable>
            <Pressable onPress={() => void installUpdate(update)} style={({ pressed }) => [s.go, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Text style={s.goText}>{install.phase === 'failed' ? 'Yeniden dene' : 'Güncelle'}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, edge }) => ({
  wrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  card: { width: '100%', maxWidth: 520, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, gap: space.sm, ...edge.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: semantic.action, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontWeight: '800', fontSize: 15 },
  body: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: semantic.action },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.md },
  later: { paddingVertical: 6, paddingHorizontal: space.sm },
  laterText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  go: { backgroundColor: semantic.action, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: space.lg },
  goText: { color: semantic.actionInk, fontWeight: '800', fontSize: 14 },
}));
