import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { SignupHeader } from '@/components/signup-header';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { IS_DEMO } from '@/lib/build';
import { liveMode } from '@/lib/live';
import { signupStep } from '@/lib/signup';

const LENGTH = 6;

/** The SMS code is a prototype (any 6 digits pass). A live build has no phone sign-in, so a link here goes to the start (giris-10). */
export default function CodeRoute() {
  return liveMode() ? <Redirect href="/giris" /> : <CodeScreen />;
}

function CodeScreen() {
  const { phone } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(60);
  const [checking, setChecking] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const onChange = (t: string) => {
    const digits = t.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (digits.length === LENGTH) {
      // Prototype: any 6-digit code is accepted.
      setChecking(true);
      setTimeout(() => {
        setChecking(false);
        router.replace('/giris/profil');
      }, 900);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SignupHeader {...signupStep('kod', false)} title="Doğrulama kodu" subtitle={`${phone || 'Numarana'} gönderilen 6 haneli kodu gir.`} />

      <Pressable style={styles.boxes} onPress={() => input.current?.focus()}>
        {Array.from({ length: LENGTH }).map((_, i) => {
          const active = i === code.length && !checking;
          return (
            <View key={i} style={[styles.box, active && styles.boxActive, !!code[i] && styles.boxFilled]}>
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={LENGTH}
        autoFocus
        style={styles.hidden}
      />

      <View style={{ alignItems: 'center', gap: 14, marginTop: 28 }}>
        {checking ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : seconds > 0 ? (
          <Text style={styles.dim}>Kodu tekrar gönder ({seconds} sn)</Text>
        ) : (
          <Pressable onPress={() => setSeconds(60)}>
            <Text style={styles.link}>Kodu tekrar gönder</Text>
          </Pressable>
        )}
        {IS_DEMO && <Text style={styles.hint}>Demo: herhangi 6 haneli bir kod gir</Text>}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, dark }) => ({
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 32 },
  // Light: white boxes need an outline and a soft shadow to stand off the paper (the active border replaces it).
  box: {
    width: 48,
    height: 58,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: dark ? 'transparent' : colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...(dark ? null : { boxShadow: '0 1px 2px rgba(16,36,64,0.05), 0 6px 16px rgba(16,36,64,0.06)' }),
  },
  boxActive: { borderColor: colors.primaryText },
  boxFilled: { borderColor: colors.primary },
  digit: { color: colors.text, fontSize: 24, fontWeight: '800' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  dim: { color: colors.textDim },
  link: { color: colors.primaryText, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 12, opacity: 0.7 },
}));
