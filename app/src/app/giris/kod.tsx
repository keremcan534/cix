import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { AuthHeader } from '@/components/AuthHeader';
import { CodeBoxes, useResendWait } from '@/components/code-boxes';
import { TextLink } from '@/components/ui';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { IS_DEMO } from '@/lib/build';
import { showAlert } from '@/lib/alert';
import { ApiError } from '@/lib/api';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { liveMode, message } from '@/lib/live';
import { profileFromServer, signInWithCode, startSignInCode } from '@/lib/live/account';
import { CODE_LENGTH, codeFailure, codeFailureText, deviceAccountText, formatPhone, resendLabel, retrySeconds, waitFromMessage } from '@/lib/verify-code';

type Params = { kind?: string; target?: string; retry?: string; challenge?: string };

export default function CodeScreen() {
  const { phone, updateMe, login } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  // Live mode: the address or number the code went to (giris/telefon), the server's wait and the code's challenge.
  const params = useLocalSearchParams<Params>();
  const live = liveMode();
  const kind = params.kind === 'email' ? 'email' : 'phone';
  const target = params.target ?? '';
  const [challenge, setChallenge] = useState(params.challenge ?? '');
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const [seconds, restartWait] = useResendWait(retrySeconds(params.retry));

  const check = async (digits: string) => {
    setChecking(true);
    setError(null);
    try {
      const r = await signInWithCode(kind, target, digits, challenge);
      successHaptic();
      updateMe(profileFromServer(r.user));
      if (r.needsProfile) router.replace({ pathname: '/giris/profil', params: { ad: r.user.name === 'Yeni üye' ? '' : r.user.name } });
      else login();
    } catch (e) {
      errorHaptic();
      const failure = e instanceof ApiError ? codeFailure(e.status, e.data.code, e.message) : 'other';
      setCode('');
      // Another way in for this person: say so (for the phone's account, which way it signs in), then back to the welcome screen.
      if (failure === 'device_has_account' || failure === 'use_other') {
        showAlert('Giriş yapılamadı', failure === 'device_has_account' && e instanceof ApiError ? deviceAccountText(message(e), e.data.method) : message(e));
        router.dismissTo('/giris');
        return;
      }
      setRefused(failure === 'wrong' || failure === 'expired' || failure === 'tries');
      setError(codeFailureText(failure, message(e)));
    } finally {
      setChecking(false);
    }
  };

  const onChange = (digits: string) => {
    setCode(digits);
    setRefused(false);
    if (error) setError(null);
    if (digits.length < CODE_LENGTH || checking) return;
    if (live) {
      void check(digits);
      return;
    }
    // Prototype: any 6-digit code is accepted.
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      router.replace('/giris/profil');
    }, 900);
  };

  // A new code has its own challenge; the old code stops counting once this one is asked for.
  const resend = async () => {
    if (!live) return restartWait(60);
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await startSignInCode(kind, target, true);
      setChallenge(r.challenge);
      setCode('');
      setRefused(false);
      restartWait(r.retryAfter);
    } catch (e) {
      const w = e instanceof ApiError && e.status === 429 ? waitFromMessage(e.message) : null;
      if (w) restartWait(w);
      errorHaptic();
      setError(message(e));
    } finally {
      setSending(false);
    }
  };

  const isEmail = live && kind === 'email';
  const subtitle = !live
    ? `${phone || 'Numarana'} gönderilen 6 haneli kodu gir.`
    : isEmail
      ? `${target} adresine gönderilen 6 haneli kodu gir.`
      : `${formatPhone(target)} numarasına gönderilen 6 haneli kodu gir.`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuthHeader step={2} title="Doğrulama kodu" subtitle={subtitle} />

      <View style={styles.boxes}>
        <CodeBoxes value={code} onChange={onChange} error={refused} busy={checking} autoComplete={isEmail ? 'one-time-code' : 'sms-otp'} />
      </View>

      <View style={{ alignItems: 'center', gap: 14, marginTop: 24, paddingHorizontal: 20 }}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {checking ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : seconds > 0 ? (
          <Text style={styles.dim}>{resendLabel(seconds)}</Text>
        ) : (
          <Pressable onPress={() => void resend()} disabled={sending} accessibilityRole="button">
            <Text style={[styles.link, sending && { opacity: 0.5 }]}>{sending ? 'Gönderiliyor…' : 'Kodu tekrar gönder'}</Text>
          </Pressable>
        )}
        {isEmail && <Text style={styles.note}>Gelen kutunda yoksa Spam / Gereksiz klasörüne de bak.</Text>}
        {live && <TextLink title={isEmail ? 'Adresi değiştir' : 'Numarayı değiştir'} color={colors.textDim} onPress={() => router.back()} center />}
        {IS_DEMO && !live && <Text style={styles.hint}>Demo: herhangi 6 haneli bir kod gir</Text>}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  boxes: { marginTop: 32, paddingHorizontal: 20 },
  dim: { color: colors.textDim },
  link: { color: colors.primaryText, fontWeight: '700' },
  error: { color: semantic.danger, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  note: { color: colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  hint: { color: colors.textDim, fontSize: 12, opacity: 0.7 },
}));
