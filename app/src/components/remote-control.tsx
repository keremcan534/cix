// What the server's remote config (lib/remote-control) shows on the phone, without new routes:
// - RemoteControl (mounted once above the stack): reads the config at start and on every return to the
//   foreground, shows the notice banner (APP_NOTICE), the blocking "Güncelleme gerekli" window (APP_MIN_VERSION)
//   and quietly downloads an over-the-air update (expo-updates) for the next start.
// - FeatureGate (every pushed screen, inside ScreenEnter): a screen whose feature is switched off is replaced by a
//   calm notice (rooms, games, Jeton Noktası) or keeps its content with a notice card (messages, wallet, income).
// - FeatureNotice: the same card inline, for a screen that wants it in its own layout.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useRoute } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text as T } from '@/components/text';
import { featureLabel, needsUpdate, offMessage, routeGate, type Feature } from '@/lib/remote-config';
import { refreshRemoteConfig, useRemoteConfig } from '@/lib/remote-control';
import { APP_VERSION } from '@/lib/reporting';
import { useRoomSession } from '@/lib/room-session';
import { makeStyles, useTheme } from '@/theme';

const DISMISSED_KEY = 'similarclub:notice-dismissed';
const DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const UPDATE_GAP_MS = 30 * 60_000;
let updateCheckedAt = 0;

/**
 * Downloads a published over-the-air update in the background (at most every 30 minutes); it is used from the
 * next start, so nothing changes under the person's fingers. Off in development, on the web and in builds without
 * an update address (expo-updates then runs the bundle inside the app).
 */
async function fetchUpdateQuietly() {
  if (DEV || Platform.OS === 'web' || !Updates.isEnabled) return;
  if (Date.now() - updateCheckedAt < UPDATE_GAP_MS) return;
  updateCheckedAt = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) await Updates.fetchUpdateAsync();
  } catch {
    // No network or no update server: the app keeps the update it has.
  }
}

/** Reads the config at start and on each return to the foreground; shows the notice and the update window. */
export function RemoteControl() {
  useEffect(() => {
    void refreshRemoteConfig(true);
    void fetchUpdateQuietly();
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void refreshRemoteConfig();
      void fetchUpdateQuietly();
    });
    return () => sub.remove();
  }, []);
  return (
    <>
      <NoticeBanner />
      <UpdateRequired />
    </>
  );
}

/** APP_NOTICE as a card at the top; closing it hides that text until the server sends a different one. */
function NoticeBanner() {
  const { notice } = useRemoteConfig();
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useStyles();
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissed(v))
      .catch(() => setDismissed(null));
  }, []);
  // Wait for the saved choice, so a closed notice doesn't flash at start.
  if (!notice || dismissed === undefined || dismissed === notice) return null;
  const close = () => {
    setDismissed(notice);
    AsyncStorage.setItem(DISMISSED_KEY, notice).catch(() => {});
  };
  return (
    <View style={[s.topLayer, { top: insets.top + 8 }]} pointerEvents="box-none">
      <View style={s.card} accessibilityRole="summary">
        <Ionicons name="megaphone-outline" size={20} color={colors.primaryText} />
        <T style={s.cardText}>{notice}</T>
        <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Duyuruyu kapat" style={s.close}>
          <Ionicons name="close" size={18} color={colors.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

/** APP_MIN_VERSION: a window that can't be closed until the app is updated. */
function UpdateRequired() {
  const config = useRemoteConfig();
  const { semantic } = useTheme();
  const s = useStyles();
  if (!needsUpdate(APP_VERSION, config)) return null;
  const url = config.updateUrl;
  const update = () => {
    if (Platform.OS === 'web') return globalThis.location?.reload();
    if (url) Linking.openURL(url).catch(() => {});
  };
  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={s.backdrop}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="refresh-circle" size={34} color={semantic.actionText} />
          </View>
          <T style={s.title} accessibilityRole="header">
            Güncelleme gerekli
          </T>
          <T style={s.body}>
            Similar Club’ın yeni bir sürümü var. Devam etmek için uygulamayı güncellemen gerekiyor; hesabın, bakiyen ve sohbetlerin olduğu gibi kalır.
          </T>
          <T style={s.versions}>
            Bu cihazda {APP_VERSION} · En az {config.minVersion}
          </T>
          {Platform.OS === 'web' || url ? (
            <Pressable onPress={update} accessibilityRole="button" style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}>
              <T style={s.primaryText}>{Platform.OS === 'web' ? 'Sayfayı yenile' : 'Güncelle'}</T>
            </Pressable>
          ) : (
            <T style={s.body}>Yeni sürümü uygulamayı indirdiğin yerden alabilirsin.</T>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** The calm card for a switched-off feature; `onClose` adds a close button. */
export function FeatureNotice({ feature, onClose }: { feature: Feature; onClose?: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.card} accessibilityRole="summary">
      <Ionicons name="information-circle-outline" size={20} color={colors.primaryText} />
      <T style={s.cardText}>{offMessage(feature)}</T>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Bildirimi kapat" style={s.close}>
          <Ionicons name="close" size={18} color={colors.textDim} />
        </Pressable>
      ) : null}
    </View>
  );
}

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Wraps every pushed screen (root stack's screenLayout); see lib/remote-config ROUTE_FEATURES for which. */
export function FeatureGate({ children }: { children: ReactNode }) {
  const route = useRoute();
  const config = useRemoteConfig();
  const gate = routeGate(config, route.name);
  if (!gate) return children;
  if (route.name === 'oda/[id]') return <RoomGate feature={gate.feature}>{children}</RoomGate>;
  return gate.mode === 'block' ? <FeatureBlocked feature={gate.feature} /> : <FeatureBanner feature={gate.feature}>{children}</FeatureBanner>;
}

/** Rooms switched off: no new room opens, but the room someone is already in stays as it is. */
function RoomGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useRoomSession();
  if (session && session.roomId === id && session.status !== 'ended') return children;
  return <FeatureBlocked feature={feature} />;
}

function FeatureBlocked({ feature }: { feature: Feature }) {
  const { semantic } = useTheme();
  const s = useStyles();
  return (
    <View style={s.page}>
      <View style={s.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="time-outline" size={30} color={semantic.actionText} />
      </View>
      <T style={s.title} accessibilityRole="header">
        {featureLabel(feature)} kısa bir mola verdi
      </T>
      <T style={s.body}>{offMessage(feature)}</T>
      <Pressable onPress={goBack} accessibilityRole="button" style={({ pressed }) => [s.secondary, pressed && { opacity: 0.85 }]}>
        <T style={s.secondaryText}>Geri dön</T>
      </Pressable>
    </View>
  );
}

function FeatureBanner({ feature, children }: { feature: Feature; children: ReactNode }) {
  const [closed, setClosed] = useState(false);
  const insets = useSafeAreaInsets();
  const s = useStyles();
  return (
    <View style={{ flex: 1 }}>
      {children}
      {!closed && (
        <View style={[s.bottomLayer, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
          <FeatureNotice feature={feature} onClose={() => setClosed(true)} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  topLayer: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 50, elevation: 50 },
  bottomLayer: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: dark ? 'rgba(19,217,223,0.30)' : 'rgba(0,140,148,0.18)',
    shadowColor: '#000',
    shadowOpacity: dark ? 0.35 : 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  close: { padding: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(4,8,20,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderRadius: 24,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  page: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: dark ? 'rgba(19,217,223,0.10)' : 'rgba(0,140,148,0.06)',
    borderWidth: 1,
    borderColor: dark ? 'rgba(19,217,223,0.30)' : 'rgba(0,140,148,0.18)',
    marginBottom: 4,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textDim, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  versions: { color: colors.textDim, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  primary: { alignSelf: 'stretch', marginTop: 8, backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: semantic.actionInk, fontSize: 16, fontWeight: '700' },
  secondary: {
    alignSelf: 'stretch',
    maxWidth: 360,
    marginTop: 16,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
}));
