// The smiley beside Mesajlar's filters: which calls I take and which messages show a notification on my phone. The
// server keeps and enforces the choices (server/api/privacy.mjs); each is saved as soon as it moves (lib/live/privacy).
// Below them, live only, Otomatik mesaj's choices (lib/live/auto-chat): automatic conversation starts reach me, the
// system may start conversations in my name (a man), my automatic messages go out (a woman streamer).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Switch } from '@/components/luxe-switch';
import { Text } from '@/components/text';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import { setAutoChoice, useAutoMe, type AutoMe } from '@/lib/live/auto-chat';
import { useLivePrivacy, usePrivacySetter } from '@/lib/live/privacy';
import { useApp } from '@/store';
import { makeStyles, SCRIM, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type PrefKey = 'voiceCalls' | 'videoCalls' | 'messagePush' | 'pushCloseOnly';

const ROWS: { key: PrefKey; icon: IconName; title: string; sub: string }[] = [
  { key: 'voiceCalls', icon: 'call', title: 'Sesli arama kabul et', sub: 'Kapalıyken kimse seni sesli arayamaz.' },
  { key: 'videoCalls', icon: 'videocam', title: 'Görüntülü arama kabul et', sub: 'Kapalıyken kimse seni görüntülü arayamaz.' },
  { key: 'messagePush', icon: 'notifications', title: 'Mesaj bildirimleri al', sub: 'Kapalıyken mesajlar yine gelir, telefonuna bildirim düşmez.' },
  { key: 'pushCloseOnly', icon: 'heart', title: 'Yalnızca samimi kişilerden bildirim al', sub: 'Karşılıklı takipleştiğin ya da aranızda kalp seviyesi olan kişiler.' },
];

function PrefsSheet({ onClose }: { onClose: () => void }) {
  const { settings } = useApp();
  const { colors } = useTheme();
  const s = useStyles();
  const { bottom } = useSafeAreaInsets();
  const set = usePrivacySetter();
  // Another phone may have changed them.
  useLivePrivacy();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: SCRIM }} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { paddingBottom: Math.max(bottom, 12) + 8 }]}>
        <View style={s.grip} />
        <Text style={s.title} accessibilityRole="header">
          Arama ve bildirim tercihleri
        </Text>
        {ROWS.map((r) => {
          // Only close people's notifications: there is nothing to narrow while message notifications are off.
          const off = r.key === 'pushCloseOnly' && !settings.messagePush;
          return (
            <View key={r.key} style={[s.row, off && { opacity: 0.55 }]}>
              <View style={s.icon}>
                <Ionicons name={r.icon} size={19} color={colors.primaryText} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowTitle}>{r.title}</Text>
                <Text style={s.rowSub}>{r.sub}</Text>
              </View>
              <Switch value={settings[r.key]} disabled={off} accessibilityLabel={r.title} onValueChange={(v) => set(r.key, v)} />
            </View>
          );
        })}
        <AutoRows />
      </View>
    </Modal>
  );
}

type AutoKey = 'autoReceive' | 'autoOpener' | 'autoSend';
const AUTO_ROWS: { key: AutoKey; icon: IconName; title: string; sub: string; shown: (a: AutoMe) => boolean; value: (a: AutoMe) => boolean }[] = [
  { key: 'autoReceive', icon: 'chatbubbles', title: 'Otomatik sohbet başlangıçlarını al', sub: 'Yayıncıların otomatik mesajları ve sistemin başlattığı sohbetler sana gelir; “Otomatik” diye işaretlidir.', shown: () => true, value: (a) => a.receive },
  {
    key: 'autoOpener',
    icon: 'sparkles',
    title: 'Benim adıma ücretsiz sohbet başlat',
    sub: 'Sistem senin adına günde birkaç ücretsiz “Merhaba” mesajı gönderir; karşı tarafta otomatik olarak görünür. Senden jeton düşmez.',
    shown: (a) => !!a.opener,
    value: (a) => !!a.opener?.sending,
  },
  { key: 'autoSend', icon: 'paper-plane', title: 'Otomatik mesajlarım gönderilsin', sub: 'Çevrimiçiyken şablonlarından biri yeni kullanıcılara gider (günde en çok 10).', shown: (a) => a.tools, value: (a) => !!a.auto?.sending },
];

/** Otomatik mesaj's choices (a live build only; each row only where it applies to me). */
function AutoRows() {
  const a = useAutoMe();
  const { colors } = useTheme();
  const s = useStyles();
  if (!a) return null;
  const save = (k: AutoKey, v: boolean) =>
    void (k === 'autoOpener' ? setAutoChoice('autoOpenerSeen', true).then(() => setAutoChoice(k, v)) : setAutoChoice(k, v)).catch((e) => showAlert('Ayar kaydedilemedi', message(e)));
  return (
    <>
      {AUTO_ROWS.filter((r) => r.shown(a)).map((r) => (
        <View key={r.key} style={s.row}>
          <View style={s.icon}>
            <Ionicons name={r.icon} size={19} color={colors.primaryText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.rowTitle}>{r.title}</Text>
            <Text style={s.rowSub}>{r.sub}</Text>
          </View>
          <Switch value={r.value(a)} accessibilityLabel={r.title} onValueChange={(v) => save(r.key, v)} />
        </View>
      ))}
    </>
  );
}

/** The smiley that opens the preferences. */
export function MessagePrefsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Arama ve bildirim tercihleri">
        <LinearGradient colors={['#FFE27A', '#FFC531', '#F2A10F']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={smile.face}>
          <View style={[smile.eye, { left: 10 }]} />
          <View style={[smile.eye, { right: 10 }]} />
          <View style={smile.mouth} />
        </LinearGradient>
      </Pressable>
      {open && <PrefsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const smile = StyleSheet.create({
  face: { width: 34, height: 34, borderRadius: 17, boxShadow: '0 2px 5px rgba(180,110,0,0.35)' },
  eye: { position: 'absolute', top: 9, width: 4, height: 7, borderRadius: 2, backgroundColor: '#6B3A00' },
  // Only the bottom edge is drawn: it thins out toward the corners of the smile.
  mouth: { position: 'absolute', left: 8, top: 16, width: 18, height: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderBottomWidth: 2.5, borderColor: '#6B3A00' },
});

const useStyles = makeStyles(({ colors }) => ({
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
}));
