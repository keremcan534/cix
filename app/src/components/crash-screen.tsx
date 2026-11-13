// What the user sees instead of a closed app when something breaks while drawing a screen.
// RootCrashScreen replaces the whole app (an error above the screens: the store, the room layer, the saved
// state); it doesn't use the store, so it still draws when the store is the problem. ScreenCrashScreen
// replaces one screen; the tabs and the rest of the app keep working.
// Colors come from the theme context only (never the store): outside the store's ThemeScope (the root boundary)
// useTheme() falls back to the dark scheme, inside it (a screen boundary) the screen follows the active scheme.
// Both report the error (lib/reporting) when crash reporting is on.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text as T } from '@/components/text';
import { showAlert } from '@/lib/alert';
import { errorMessage } from '@/lib/crash-guard';
import { reportError } from '@/lib/reporting';
import { resetLocalData, useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

type Action = { label: string; onPress: () => void; kind: 'primary' | 'secondary' | 'link' };

function CrashLayout({ title, body, error, actions }: { title: string; body: string; error: Error; actions: Action[] }) {
  const [details, setDetails] = useState(false);
  const { semantic } = useTheme();
  const s = useStyles();
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <View style={s.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="refresh" size={30} color={semantic.actionText} />
      </View>
      <T style={s.title} accessibilityRole="header">
        {title}
      </T>
      <T style={s.body}>{body}</T>
      <View style={s.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            style={({ pressed }) => [a.kind === 'primary' ? s.primary : a.kind === 'secondary' ? s.secondary : s.link, pressed && { opacity: 0.8 }]}
          >
            <T style={a.kind === 'primary' ? s.primaryText : a.kind === 'secondary' ? s.secondaryText : s.linkText}>{a.label}</T>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => setDetails((d) => !d)} accessibilityRole="button" style={s.detailsToggle}>
        <T style={s.detailsLabel}>{details ? 'Ayrıntıyı gizle' : 'Hata ayrıntısı'}</T>
      </Pressable>
      {details ? (
        <T style={s.details} selectable>
          {errorMessage(error)}
        </T>
      ) : null}
    </ScrollView>
  );
}

const confirmReset = (onConfirm: () => void) =>
  showAlert('Bu cihazdaki veriler silinsin mi?', 'Uygulama ilk açıldığı haline döner: bu cihazda kayıtlı bakiye, ayarlar ve geçmiş silinir. Sunucudaki hesabın etkilenmez.', [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sıfırla', style: 'destructive', onPress: onConfirm },
  ]);

/** The root layout's error boundary: the app itself failed, often because of what was saved on the device. */
export function RootCrashScreen({ error, retry }: ErrorBoundaryProps) {
  // The splash screen may still be up if the failure came before the first screen.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  useEffect(() => reportError(error, { boundary: 'root' }), [error]);
  return (
    <CrashLayout
      error={error}
      title="Bir şeyler ters gitti"
      body="Uygulama beklenmedik bir hatayla karşılaştı. Tekrar deneyebilirsin. Sorun sürerse bu cihazdaki kayıtlı verileri sıfırlamak çoğu zaman çözer."
      actions={[
        { label: 'Tekrar dene', kind: 'primary', onPress: () => void retry() },
        { label: 'Verileri sıfırla ve yeniden başlat', kind: 'secondary', onPress: () => confirmReset(() => void resetLocalData().then(retry)) },
      ]}
    />
  );
}

/** Every screen's error boundary (root Stack): only this screen is replaced; the rest of the app keeps working. */
export function ScreenCrashScreen({ error, retry }: ErrorBoundaryProps) {
  const { resetAll } = useApp();
  useEffect(() => reportError(error, { boundary: 'screen' }), [error]);
  return (
    <CrashLayout
      error={error}
      title="Bu sayfa açılamadı"
      body="Sayfada beklenmedik bir hata oldu. Uygulamanın geri kalanı çalışıyor; tekrar deneyebilir veya ana sayfaya dönebilirsin."
      actions={[
        { label: 'Tekrar dene', kind: 'primary', onPress: () => void retry() },
        { label: 'Ana sayfaya dön', kind: 'secondary', onPress: () => router.replace('/') },
        {
          label: 'Sorun sürüyorsa: bu cihazdaki verileri sıfırla',
          kind: 'link',
          onPress: () =>
            confirmReset(() => {
              resetAll();
              router.replace('/');
            }),
        },
      ]}
    />
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 64, gap: 12 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: dark ? 'rgba(255,95,162,0.10)' : 'rgba(208,46,120,0.06)',
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,95,162,0.30)' : 'rgba(208,46,120,0.18)',
    marginBottom: 8,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textDim, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  actions: { alignSelf: 'stretch', maxWidth: 360, width: '100%', marginTop: 16, gap: 10, alignItems: 'stretch' },
  primary: { backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: semantic.actionInk, fontSize: 16, fontWeight: '700' },
  secondary: { borderRadius: 999, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  link: { paddingVertical: 10, alignItems: 'center' },
  linkText: { color: colors.textDim, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  detailsToggle: { marginTop: 20, paddingVertical: 6, paddingHorizontal: 12 },
  detailsLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  details: { color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 360, opacity: 0.8 },
}));
