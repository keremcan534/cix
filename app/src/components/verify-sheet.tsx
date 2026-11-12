// Ayarlar → E-posta / Telefon: adding an e-mail address or checking a phone number on the signed-in account, in
// a bottom sheet (the giris screens sit behind the signed-out guard). E-mail and SMS: the address or number, then
// the 6-digit code (server/api/auth.mjs /api/me/*). WhatsApp (whatsapp.mjs): a ready message to our number; while
// the sheet is open it asks the server every 3 s whether the message arrived. Each way shows only when the server
// switches it on (lib/remote-config verify, signIn.email).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, View } from 'react-native';

import { CodeBoxes, useResendWait } from '@/components/code-boxes';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Button, TextLink } from '@/components/ui';
import * as api from '@/lib/api';
import { emailError, emailTypoHint, normalizeEmail } from '@/lib/email-address';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { message, refreshWallet } from '@/lib/live';
import { startLinkCode, verifyLinkCode, type CodeKind } from '@/lib/live/account';
import { useRemoteConfig } from '@/lib/remote-control';
import { CODE_LENGTH, codeFailure, codeFailureText, formatPhone, groupTrDigits, resendLabel, retrySeconds, reusableCode, trMobile, waitFromMessage, whatsappResultText, type SentCode } from '@/lib/verify-code';
import { useApp } from '@/store';
import { SCRIM, makeStyles, useTheme } from '@/theme';

const POLL_MS = 3000;

type Step =
  | { at: 'enter' }
  | { at: 'code'; target: string; challenge: string }
  /** `link` null: not started yet; otherwise waiting for the message. */
  | { at: 'whatsapp'; link: string | null }
  | { at: 'result'; title: string; body: string; ok: boolean };

/** The green "Doğrulandı" mark at the end of an Ayarlar row. */
export function VerifiedPill() {
  const { semantic } = useTheme();
  const s = useStyles();
  return (
    <View style={s.pill} accessible accessibilityLabel="Doğrulandı">
      <Ionicons name="checkmark-circle" size={13} color={semantic.successText} />
      <Text style={s.pillText}>Doğrulandı</Text>
    </View>
  );
}

/** Open while `kind` is set; each opening starts from the first step. */
export function VerifySheet({ kind, onClose }: { kind: CodeKind | null; onClose: () => void }) {
  // The last kind stays on screen while the sheet slides away; a new opening gets a fresh body (key).
  const [shown, setShown] = useState<{ kind: CodeKind; n: number } | null>(null);
  const [prev, setPrev] = useState<CodeKind | null>(null);
  if (kind !== prev) {
    setPrev(kind);
    if (kind) setShown({ kind, n: (shown?.n ?? 0) + 1 });
  }
  return (
    <Modal visible={!!kind} transparent animationType="slide" onRequestClose={onClose}>
      {shown && <SheetBody key={shown.n} kind={shown.kind} open={!!kind} onClose={onClose} />}
    </Modal>
  );
}

function SheetBody({ kind, open, onClose }: { kind: CodeKind; open: boolean; onClose: () => void }) {
  const { email, phoneVerified } = useApp();
  const { verify } = useRemoteConfig();
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const byWhatsapp = kind === 'phone' && verify.whatsapp;
  const first: Step = byWhatsapp ? { at: 'whatsapp', link: null } : { at: 'enter' };
  const [step, setStep] = useState<Step>(first);
  const [raw, setRaw] = useState('');
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [wait, restartWait] = useResendWait();
  // The last code sent from this sheet: sending to the same target again within the wait goes back to it.
  const sent = useRef<SentCode | null>(null);

  const isEmail = kind === 'email';
  // Adding or changing, as it was when the sheet opened: a success updates the store while the result still shows.
  const [changing] = useState(() => (isEmail ? !!email : phoneVerified));
  const title = isEmail ? (changing ? 'E-postanı değiştir' : 'E-posta ekle') : changing ? 'Numaranı değiştir' : 'Telefonunu doğrula';
  const hint = isEmail && step.at === 'enter' && !error ? emailTypoHint(raw) : null;
  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  /** A code to the typed address / number, or a new one to the same (`step` code). */
  const send = async () => {
    const target = step.at === 'code' ? step.target : isEmail ? normalizeEmail(raw) : trMobile(raw);
    if (!target) {
      errorHaptic();
      setError(isEmail ? emailError(raw) : 'Numaranı 5XX XXX XX XX biçiminde yaz.');
      return;
    }
    const toCode = (challenge: string, seconds: number) => {
      restartWait(seconds);
      setCode('');
      setCodeError(false);
      go({ at: 'code', target, challenge });
    };
    // Back from "Adresi değiştir" with the same address: the code already sent still works (a new one: 429).
    const again = step.at === 'enter' ? reusableCode(sent.current, target, Date.now()) : null;
    if (again) return toCode(again.challenge, again.retryAfter);
    setBusy(true);
    setError(null);
    try {
      const r = await startLinkCode(kind, target);
      const seconds = retrySeconds(r.retryAfter);
      sent.current = { target, challenge: r.challenge, resendAt: Date.now() + seconds * 1000 };
      toCode(r.challenge, seconds);
    } catch (e) {
      const w = e instanceof api.ApiError && e.status === 429 ? waitFromMessage(e.message) : null;
      if (w) restartWait(w);
      errorHaptic();
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const check = async (digits: string) => {
    if (step.at !== 'code') return;
    setBusy(true);
    setError(null);
    try {
      await verifyLinkCode(kind, step.target, digits, step.challenge);
      successHaptic();
      // A change replaces the old address on the server (it is told), so it no longer signs in.
      setStep(
        !isEmail
          ? { at: 'result', ok: true, title: 'Numaran doğrulandı', body: `${formatPhone(step.target)} hesabına bağlandı. Numaran profilinde görünmez.` }
          : changing
            ? { at: 'result', ok: true, title: 'E-postan değişti', body: `Artık ${step.target} adresiyle giriş yapacaksın. Eski adres hesabından kaldırıldı.` }
            : { at: 'result', ok: true, title: 'E-postan eklendi', body: `${step.target} artık hesabına bağlı. Bu adresle de giriş yapabilirsin.` },
      );
    } catch (e) {
      errorHaptic();
      const failure = e instanceof api.ApiError ? codeFailure(e.status, e.data.code, e.message) : 'other';
      // That code can't be used any more: going back and sending again asks for a new one.
      if (failure === 'expired' || failure === 'tries') sent.current = null;
      setCode('');
      setCodeError(failure === 'wrong' || failure === 'expired' || failure === 'tries');
      setError(codeFailureText(failure, message(e)));
    } finally {
      setBusy(false);
    }
  };

  const onCode = (digits: string) => {
    setCode(digits);
    setCodeError(false);
    if (error) setError(null);
    if (digits.length === CODE_LENGTH && !busy) void check(digits);
  };

  const openWhatsapp = (link: string) => Linking.openURL(link).catch(() => setError('WhatsApp açılamadı. Telefonunda WhatsApp yüklü mü, kontrol et.'));
  const startWhatsapp = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.whatsappStart();
      setStep({ at: 'whatsapp', link: r.link });
      await openWhatsapp(r.link);
    } catch (e) {
      errorHaptic();
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  // Waiting for the WhatsApp message: ask every 3 s, and at once when the person comes back from WhatsApp.
  // Stops on a result, when the sheet closes and when it goes away.
  const waiting = open && step.at === 'whatsapp' && !!step.link;
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    let asking = false;
    const poll = async () => {
      if (asking) return;
      asking = true;
      try {
        const r = await api.phoneStatus();
        const text = whatsappResultText(r.result);
        if (!alive || !text) return;
        alive = false;
        if (text.ok) {
          successHaptic();
          // The store takes the number from the account (lib/live → store applyServer).
          void refreshWallet().catch(() => {});
        } else errorHaptic();
        setStep({ at: 'result', ...text, ...(text.ok && r.phone ? { body: `${formatPhone(r.phone)} hesabına bağlandı. Numaran profilinde görünmez.` } : null) });
      } catch {
        // Offline for a moment: the next round asks again.
      } finally {
        asking = false;
      }
    };
    const t = setInterval(() => void poll(), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void poll());
    return () => {
      alive = false;
      clearInterval(t);
      sub.remove();
    };
  }, [waiting]);

  const errorLine = !!error && <Text style={s.error}>{error}</Text>;
  const otherWay =
    kind === 'phone' && verify.whatsapp && verify.sms ? (
      <View style={s.center}>
        {step.at === 'whatsapp' ? <TextLink title="SMS ile doğrula" onPress={() => go({ at: 'enter' })} center /> : <TextLink title="WhatsApp ile doğrula" onPress={() => go({ at: 'whatsapp', link: null })} center />}
      </View>
    ) : null;

  let content;
  if (step.at === 'enter') {
    content = (
      <>
        <Text style={s.sub}>
          {isEmail
            ? `Adresine 6 haneli bir kod göndereceğiz.${email ? ` Şu anki adresin: ${email}` : ''}`
            : 'Numarana 6 haneli bir kod göndereceğiz. Numaran profilinde görünmez.'}
        </Text>
        <View style={[s.field, focused && { borderColor: semantic.actionText }]}>
          {isEmail ? <Ionicons name="mail-outline" size={20} color={colors.textDim} /> : <Text style={s.prefix}>+90</Text>}
          <TextInput
            value={isEmail ? raw : groupTrDigits(raw)}
            onChangeText={(t) => {
              // A pasted "+90 532 …" keeps only the national part.
              const d = t.replace(/\D/g, '');
              setRaw(isEmail ? t : (d.length > 10 && d.startsWith('90') ? d.slice(2) : d).replace(/^0+/, '').slice(0, 10));
              if (error) setError(null);
            }}
            placeholder={isEmail ? 'ornek@gmail.com' : '5XX XXX XX XX'}
            placeholderTextColor={colors.textDim}
            keyboardType={isEmail ? 'email-address' : 'phone-pad'}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={isEmail ? 'email' : 'tel-national'}
            textContentType={isEmail ? 'emailAddress' : 'telephoneNumber'}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
            style={s.input}
            accessibilityLabel={isEmail ? 'E-posta adresi' : 'Telefon numarası'}
          />
        </View>
        {errorLine}
        {!!hint && (
          <Pressable onPress={() => setRaw(hint)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${hint} olarak düzelt`}>
            <Text style={s.hint}>
              Bunu mu demek istedin? <Text style={s.hintStrong}>{hint}</Text>
            </Text>
          </Pressable>
        )}
        <Button title={busy ? 'Gönderiliyor…' : 'Kod gönder'} disabled={busy || !raw.trim()} onPress={() => void send()} />
        {otherWay}
      </>
    );
  } else if (step.at === 'code') {
    content = (
      <>
        <Text style={s.sub}>
          <Text style={s.subStrong}>{isEmail ? step.target : formatPhone(step.target)}</Text>
          {isEmail ? ' adresine gönderilen 6 haneli kodu yaz.' : ' numarasına gönderilen 6 haneli kodu yaz.'}
        </Text>
        <View style={{ marginTop: 4 }}>
          <CodeBoxes value={code} onChange={onCode} error={codeError} busy={busy} onSheet autoComplete={isEmail ? 'one-time-code' : 'sms-otp'} />
        </View>
        <View style={s.status}>
          {busy ? <ActivityIndicator color={colors.primaryText} /> : error ? <Text style={[s.error, s.centerText]}>{error}</Text> : isEmail ? <Text style={s.fine}>Gelen kutunda yoksa Spam / Gereksiz klasörüne de bak.</Text> : null}
        </View>
        <View style={s.links}>
          <TextLink title={isEmail ? 'Adresi değiştir' : 'Numarayı değiştir'} color={colors.textDim} onPress={() => go({ at: 'enter' })} center />
          {wait > 0 ? (
            <Text style={s.dim}>{resendLabel(wait)}</Text>
          ) : (
            <TextLink title={busy ? 'Gönderiliyor…' : 'Kodu tekrar gönder'} onPress={() => !busy && void send()} center />
          )}
        </View>
      </>
    );
  } else if (step.at === 'whatsapp' && !step.link) {
    content = (
      <>
        <View style={s.hero}>
          <View style={[s.heroIcon, s.heroOk]}>
            <Ionicons name="logo-whatsapp" size={30} color={semantic.successText} />
          </View>
          <Text style={s.heroBody}>WhatsApp’ta hazır bir mesaj açılır. Göndermen yeterli; numaranı WhatsApp doğrular, SMS gerekmez.</Text>
        </View>
        {errorLine}
        <Button title={busy ? 'Açılıyor…' : 'WhatsApp ile doğrula'} icon="logo-whatsapp" disabled={busy} onPress={() => void startWhatsapp()} />
        <Text style={[s.fine, s.centerText]}>Mesajı değiştirmeden gönder. Numaran profilinde görünmez.</Text>
        {otherWay}
      </>
    );
  } else if (step.at === 'whatsapp' && step.link) {
    const link = step.link;
    content = (
      <>
        <View style={s.hero}>
          <ActivityIndicator size="large" color={semantic.successText} />
          <Text style={s.heroTitle}>Mesajın bekleniyor</Text>
          <Text style={s.heroBody}>WhatsApp’ta mesajı gönder, sonra buraya dön. Birkaç saniye içinde doğrulanır.</Text>
        </View>
        {errorLine}
        <View style={s.center}>
          <TextLink title="WhatsApp’ı yeniden aç" onPress={() => void openWhatsapp(link)} center />
        </View>
        <Text style={[s.fine, s.centerText]}>Mesaj 10 dakika geçerli.</Text>
      </>
    );
  } else if (step.at === 'result') {
    content = (
      <>
        <View style={s.hero}>
          <View style={[s.heroIcon, step.ok ? s.heroOk : s.heroBad]}>
            <Ionicons name={step.ok ? 'checkmark' : 'alert'} size={30} color={step.ok ? semantic.successText : semantic.danger} />
          </View>
          <Text style={s.heroTitle}>{step.title}</Text>
          <Text style={s.heroBody}>{step.body}</Text>
        </View>
        {step.ok ? (
          <Button title="Tamam" onPress={onClose} />
        ) : (
          <>
            <Button title="Tekrar dene" onPress={() => go(first)} />
            <Button title="Kapat" variant="ghost" onPress={onClose} />
          </>
        )}
      </>
    );
  }

  return (
    <KeyboardAvoid style={{ flex: 1 }}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.head}>
          <Text style={s.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={s.closeBtn} accessibilityLabel="Kapat">
            <Ionicons name="close" size={18} color={colors.textDim} />
          </Pressable>
        </View>
        {content}
      </View>
    </KeyboardAvoid>
  );
}

const useStyles = makeStyles(({ colors, semantic, ink, dark }) => ({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 12,
    borderTopWidth: 1,
    borderColor: ink(0.12),
    boxShadow: dark ? '0 -10px 30px rgba(0,0,0,0.45)' : '0 -1px 2px rgba(16,36,64,0.05), 0 -10px 30px rgba(16,36,64,0.12)',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: -4 },
  subStrong: { color: colors.text, fontWeight: '700' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, height: 56 },
  prefix: { color: colors.text, fontSize: 17, fontWeight: '700' },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, fontWeight: '600', paddingVertical: 0, outlineStyle: 'none' } as object,
  error: { color: semantic.danger, fontSize: 13, lineHeight: 18, marginTop: -4, marginLeft: 4 },
  hint: { color: colors.textDim, fontSize: 13, marginTop: -4, marginLeft: 4 },
  hintStrong: { color: semantic.actionText, fontWeight: '700' },
  status: { minHeight: 22, alignItems: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  dim: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  fine: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center', marginLeft: 0 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  heroOk: { backgroundColor: `${semantic.successText}1F` },
  heroBad: { backgroundColor: `${semantic.danger}1F` },
  heroTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heroBody: { color: colors.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: `${semantic.successText}1F` },
  pillText: { color: semantic.successText, fontSize: 12, fontWeight: '700' },
}));
