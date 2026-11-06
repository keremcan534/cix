import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { SignupHeader } from '@/components/signup-header';
import { GradientButton } from '@/components/ui';
import { liveMode } from '@/lib/live';
import { signupStep } from '@/lib/signup';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

// "5321234567" -> "532 123 45 67"
const format = (digits: string) =>
  [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)].filter(Boolean).join(' ');

/** Phone sign-in is a prototype (no SMS is sent). A live build has none, so a link here goes to the start (giris-10). */
export default function PhoneRoute() {
  return liveMode() ? <Redirect href="/giris" /> : <PhoneScreen />;
}

function PhoneScreen() {
  const { setPhone } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const [digits, setDigits] = useState('');
  const valid = digits.length === 10 && digits.startsWith('5');

  const submit = () => {
    if (!valid) return;
    setPhone(`+90 ${format(digits)}`);
    router.push('/giris/kod');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoid style={{ flex: 1 }}>
        <SignupHeader {...signupStep('telefon', false)} title="Telefon numaran" subtitle="Sana bir doğrulama kodu göndereceğiz." />
        <View style={styles.row}>
          <View style={styles.prefix}>
            <Text style={{ fontSize: 18 }}>🇹🇷</Text>
            <Text style={styles.prefixText}>+90</Text>
          </View>
          <TextInput
            value={format(digits)}
            onChangeText={(t) => setDigits(t.replace(/\D/g, '').slice(0, 10))}
            placeholder="5XX XXX XX XX"
            placeholderTextColor={colors.textDim}
            keyboardType="phone-pad"
            style={styles.input}
            autoFocus
            onSubmitEditing={submit}
          />
        </View>
        {digits.length === 10 && !valid && <Text style={styles.error}>Numara 5 ile başlamalı.</Text>}
        <View style={{ flex: 1 }} />
        <View style={{ padding: 20 }}>
          <GradientButton title="Kod gönder" onPress={submit} style={{ opacity: valid ? 1 : 0.4 }} />
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
  error: { color: colors.red, paddingHorizontal: 20, marginTop: 8 },
}));
