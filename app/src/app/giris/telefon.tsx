import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { AuthHeader } from '@/components/AuthHeader';
import { GradientButton } from '@/components/ui';
import { emailError, emailTypoHint, normalizeEmail } from '@/lib/email-address';
import { errorHaptic } from '@/lib/haptics';
import { liveMode, message } from '@/lib/live';
import { startSignInCode, type CodeKind } from '@/lib/live/account';
import { groupTrDigits as format, trMobile } from '@/lib/verify-code';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

export default function PhoneScreen() {
  const { setPhone } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  // Live mode: `kind` email (the welcome screen's "E-posta ile devam et") or phone. The prototype is phone only.
  const kind: CodeKind = useLocalSearchParams<{ kind?: string }>().kind === 'email' && liveMode() ? 'email' : 'phone';
  const isEmail = kind === 'email';
  const [digits, setDigits] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = isEmail ? !!address.trim() : digits.length === 10 && digits.startsWith('5');
  const hint = isEmail && !error ? emailTypoHint(address) : null;

  const submit = async () => {
    if (!valid || busy) return;
    if (!liveMode()) {
      setPhone(`+90 ${format(digits)}`);
      router.push('/giris/kod');
      return;
    }
    const target = isEmail ? normalizeEmail(address) : trMobile(digits);
    if (!target) {
      errorHaptic();
      setError(isEmail ? emailError(address) : 'Numara 5 ile başlamalı.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await startSignInCode(kind, target);
      router.push({ pathname: '/giris/kod', params: { kind, target, retry: String(r.retryAfter), challenge: r.challenge } });
    } catch (e) {
      errorHaptic();
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoid style={{ flex: 1 }}>
        {isEmail ? (
          <AuthHeader step={1} title="E-posta adresin" subtitle="Adresine 6 haneli bir giriş kodu göndereceğiz." />
        ) : (
          <AuthHeader step={1} title="Telefon numaran" subtitle="Sana bir doğrulama kodu göndereceğiz." />
        )}
        <View style={styles.row}>
          <View style={styles.prefix}>
            {isEmail ? (
              <Ionicons name="mail-outline" size={20} color={colors.textDim} />
            ) : (
              <>
                <Text style={{ fontSize: 18 }}>🇹🇷</Text>
                <Text style={styles.prefixText}>+90</Text>
              </>
            )}
          </View>
          {isEmail ? (
            <TextInput
              value={address}
              onChangeText={(t) => {
                setAddress(t);
                if (error) setError(null);
              }}
              placeholder="ornek@gmail.com"
              placeholderTextColor={colors.textDim}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              style={[styles.input, styles.emailInput]}
              autoFocus
              onSubmitEditing={() => void submit()}
              accessibilityLabel="E-posta adresi"
            />
          ) : (
            <TextInput
              value={format(digits)}
              onChangeText={(t) => {
                setDigits(t.replace(/\D/g, '').slice(0, 10));
                if (error) setError(null);
              }}
              placeholder="5XX XXX XX XX"
              placeholderTextColor={colors.textDim}
              keyboardType="phone-pad"
              style={styles.input}
              autoFocus
              onSubmitEditing={() => void submit()}
            />
          )}
        </View>
        {!isEmail && digits.length === 10 && !digits.startsWith('5') && <Text style={styles.error}>Numara 5 ile başlamalı.</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!hint && (
          <Pressable onPress={() => setAddress(hint)} hitSlop={6} style={styles.hintRow} accessibilityRole="button" accessibilityLabel={`${hint} olarak düzelt`}>
            <Text style={styles.hint}>
              Bunu mu demek istedin? <Text style={{ color: semantic.actionText, fontWeight: '700' }}>{hint}</Text>
            </Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ padding: 20 }}>
          <GradientButton title={busy ? 'Gönderiliyor…' : 'Kod gönder'} onPress={() => void submit()} style={{ opacity: valid && !busy ? 1 : 0.4 }} />
        </View>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, lift }) => ({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 28 },
  prefix: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, ...lift },
  prefixText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  // minWidth 0: on web an input won't shrink below its content width and pushed the row off screen.
  input: { flex: 1, minWidth: 0, backgroundColor: colors.card, borderRadius: 14, color: colors.text, fontSize: 20, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 14, letterSpacing: 1, ...lift },
  emailInput: { fontSize: 17, letterSpacing: 0 },
  error: { color: colors.red, paddingHorizontal: 20, marginTop: 8 },
  hintRow: { paddingHorizontal: 20, marginTop: 10, alignSelf: 'flex-start' },
  hint: { color: colors.textDim, fontSize: 14 },
}));
