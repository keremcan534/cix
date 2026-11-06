// What a sanctioned person sees (lib/sanctions): the full-screen notice for an account or device ban, the details
// sheet for a mute, the small banner in a room or chat, and the appeal form. Every time on these screens is the
// server's; nothing here decides whether a sanction is on.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import type { SanctionView } from '@/lib/api';
import { openLegal } from '@/lib/legal';
import { message, myServerId } from '@/lib/live';
import { openSupportMail } from '@/lib/open-mail';
import { SUPPORT_EMAIL, banHelpMail } from '@/lib/support-mail';
import { APPEAL_STATUS, formatAt, formatLeft, refreshSanctions, remaining, sendAppeal, showSanction, stopping, useSanctions, type Action } from '@/lib/sanctions';
import { makeStyles, radius, space } from '@/theme';

/** Re-renders every second while something counts down. */
function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

const WHAT: Record<string, string> = {
  room_text: 'Oda sohbetine yazamazsın',
  room_voice: 'Odada mikrofonu açamazsın',
  dm: 'Özel mesaj gönderemezsin',
  call: 'Sesli arama yapamazsın',
  account: 'Hesabınla uygulamaya giremezsin',
  device: 'Bu cihazdan hiçbir hesapla giriş yapılamaz',
};

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** What is restricted, why, from when until when, by whom, and how long is left (live). */
export function SanctionDetails({ s }: { s: SanctionView }) {
  const styles = useStyles();
  const left = remaining(s);
  useTick(left !== Infinity);
  return (
    <View style={styles.card}>
      <View style={styles.leftBox}>
        <Text style={styles.leftLabel}>{left === Infinity ? 'Süre' : 'Kalan süre'}</Text>
        <Text style={styles.leftValue}>{left === Infinity ? (s.type.endsWith('ban') ? 'Ömür boyu' : 'Kaldırılana kadar') : formatLeft(left)}</Text>
      </View>
      <Row label="Yaptırım" value={s.label} />
      <Row label="Sebep" value={s.reason} />
      {s.reasonText ? <Row label="Açıklama" value={s.reasonText} /> : null}
      <Row label="Başlangıç" value={formatAt(s.startAt)} />
      <Row label="Bitiş" value={s.permanent ? 'Süresiz' : formatAt(s.endAt)} />
      <Row label="Uygulayan" value={s.appliedBy} />
      <View style={styles.restricts}>
        {s.restricts.map((r) => (
          <View key={r} style={styles.restrictRow}>
            <Ionicons name="remove-circle" size={16} color={styles.danger.color} />
            <Text style={styles.restrictText}>{WHAT[r] ?? r}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The appeal: one open appeal per sanction; after it, its status. */
function Appeal({ s }: { s: SanctionView }) {
  const styles = useStyles();
  const { appeals } = useSanctions();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = appeals.find((a) => a.sanctionId === s.id);
  if (mine || s.appeal) {
    const status = mine?.status ?? (s.appeal as keyof typeof APPEAL_STATUS);
    return (
      <View style={styles.appealDone}>
        <Ionicons name="document-text-outline" size={18} color={styles.dim.color} />
        <View style={{ flex: 1 }}>
          <Text style={styles.appealTitle}>İtirazın: {APPEAL_STATUS[status] ?? status}</Text>
          {mine?.note ? <Text style={styles.appealNote}>{mine.note}</Text> : <Text style={styles.appealNote}>Ekibimiz itirazını inceleyip sana buradan sonucu bildirecek.</Text>}
        </View>
      </View>
    );
  }
  if (!open) return <Button title="İtiraz et" icon="chatbox-ellipses-outline" variant="tonal" onPress={() => setOpen(true)} />;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendAppeal(s.id, text.trim());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const short = text.trim().length < 10;
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.appealTitle}>Neden haksız olduğunu düşünüyorsun?</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
        placeholder="Ne olduğunu kısaca anlat (en az 10 karakter)"
        placeholderTextColor={styles.dim.color}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={busy ? 'Gönderiliyor…' : 'İtirazı gönder'} disabled={busy || short} onPress={() => void send()} />
    </View>
  );
}

/**
 * Ways out that need no account: the support address (a decided appeal, a lifetime or device ban, a request to
 * erase or copy the data under UK GDPR) and the legal texts (giris-13).
 */
function BanHelp({ s }: { s: SanctionView }) {
  const styles = useStyles();
  return (
    <View style={styles.help}>
      <Pressable
        style={styles.helpRow}
        onPress={() => openSupportMail(banHelpMail(s.id, s.label, myServerId()))}
        accessibilityRole="link"
        accessibilityLabel={`Destek: ${SUPPORT_EMAIL}`}
      >
        <Ionicons name="mail-outline" size={18} color={styles.link.color} />
        <Text style={styles.helpText}>
          Destek: <Text style={styles.link}>{SUPPORT_EMAIL}</Text>
        </Text>
      </Pressable>
      <Text style={styles.helpNote}>Kararla ilgili sorun, verilerinin bir kopyası veya silinmesi (UK GDPR) için bu adrese yazabilirsin.</Text>
      <Text style={styles.helpNote}>
        <Text style={styles.link} onPress={() => openLegal('terms')} accessibilityRole="link">
          Kullanım Koşulları
        </Text>
        {'  ·  '}
        <Text style={styles.link} onPress={() => openLegal('privacy')} accessibilityRole="link">
          Gizlilik Politikası
        </Text>
      </Text>
    </View>
  );
}

/** Full screen over the whole app while an account or device ban is on. Only the appeal and the help links work from here. */
export function BanScreen() {
  const styles = useStyles();
  const { block, sanctions } = useSanctions();
  const insets = useSafeAreaInsets();
  if (!block) return null;
  const s = sanctions.find((x) => x.id === block.sanction.id) ?? block.sanction;
  const device = block.code === 'device_banned';
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <KeyboardAvoid style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.screenBody, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.badge}>
            <Ionicons name={device ? 'phone-portrait-outline' : 'lock-closed-outline'} size={34} color={styles.danger.color} />
          </View>
          <Text style={styles.title}>{device ? 'Bu cihazın erişimi kapatıldı' : 'Hesabının erişimi kapatıldı'}</Text>
          <Text style={styles.lead}>
            {device
              ? 'Topluluk kurallarımız nedeniyle bu cihazdan Similar Club’a giriş yapılamıyor. Başka bir hesap açmak bu kısıtlamayı kaldırmaz.'
              : 'Topluluk kurallarımız nedeniyle hesabın şu an kullanılamıyor. Süre dolduğunda yeniden giriş yapabilirsin.'}
          </Text>
          <SanctionDetails s={s} />
          {block.appealSession ? <Appeal s={s} /> : <Text style={styles.appealNote}>İtiraz için uygulamayı kapatıp yeniden aç.</Text>}
          <Button title="Durumu yenile" icon="refresh" variant="ghost" onPress={() => void refreshSanctions().catch(() => {})} />
          <BanHelp s={s} />
        </ScrollView>
      </KeyboardAvoid>
    </Modal>
  );
}

/** The details sheet for a mute (opened from a banner or a refusal), with the appeal. */
export function SanctionSheet() {
  const styles = useStyles();
  const { shown } = useSanctions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!shown} transparent animationType="slide" onRequestClose={() => showSanction(null)}>
      <Pressable style={styles.scrim} onPress={() => showSanction(null)} accessibilityLabel="Kapat" />
      <KeyboardAvoid style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.grip} />
          <Text style={styles.sheetTitle}>{shown?.label ?? ''}</Text>
          <ScrollView contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
            {shown ? <SanctionDetails s={shown} /> : null}
            {shown ? <Appeal s={shown} /> : null}
          </ScrollView>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

/** Both layers, once, above every screen (app/_layout). `signedIn`: load my sanctions after each sign-in. */
export function SanctionLayer({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (signedIn) void refreshSanctions().catch(() => {});
  }, [signedIn]);
  return (
    <>
      <SanctionSheet />
      <BanScreen />
    </>
  );
}

/** The sanction that stops `action` here, kept current by the store's clock. */
export function useStopped(action: Action, roomId?: string | null) {
  const { sanctions } = useSanctions();
  const s = stopping(sanctions, action, roomId);
  useTick(!!s && remaining(s) !== Infinity);
  return s;
}

/** A thin bar above a composer or mic: what is stopped and for how long; tap for details and the appeal. */
export function MuteBanner({ s, text }: { s: SanctionView; text: string }) {
  const styles = useStyles();
  const left = remaining(s);
  return (
    <Pressable style={styles.banner} onPress={() => showSanction(s)} accessibilityRole="button" accessibilityLabel={`${text}. Ayrıntı`}>
      <Ionicons name="volume-mute" size={16} color={styles.danger.color} />
      <Text style={styles.bannerText} numberOfLines={1}>
        {text} · {left === Infinity ? 'süresiz' : `${formatLeft(left)} kaldı`}
      </Text>
      <Text style={styles.bannerLink}>Ayrıntı</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  danger: { color: semantic.danger },
  dim: { color: colors.textDim },
  screen: { flex: 1, backgroundColor: colors.bg },
  screenBody: { paddingHorizontal: space.lg, gap: space.lg, alignItems: 'stretch' },
  badge: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  lead: { color: colors.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  leftBox: { alignItems: 'center', paddingBottom: space.md, marginBottom: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  leftLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  leftValue: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  rowLabel: { color: colors.textDim, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  restricts: { marginTop: space.sm, gap: 6 },
  restrictRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  restrictText: { color: colors.text, fontSize: 13, flex: 1 },
  appealDone: { flexDirection: 'row', gap: space.sm, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' },
  appealTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  appealNote: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 2 },
  input: { minHeight: 110, textAlignVertical: 'top', color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, fontSize: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  error: { color: semantic.danger, fontSize: 13 },
  help: { gap: space.sm, alignItems: 'center', paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 },
  helpText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  helpNote: { color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  link: { color: colors.primaryText, fontWeight: '700' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md, maxHeight: '88%' },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.danger },
  bannerText: { color: colors.text, fontSize: 13, flex: 1 },
  bannerLink: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
}));
