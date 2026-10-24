import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthHeader } from '@/components/AuthHeader';
import { useApp } from '@/store';
import { colors } from '@/theme';

const LENGTH = 6;

export default function CodeScreen() {
  const { phone } = useApp();
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
      <AuthHeader step={2} title="Doğrulama kodu" subtitle={`${phone || 'Numarana'} gönderilen 6 haneli kodu gir.`} />

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
          <ActivityIndicator color={colors.pink} />
        ) : seconds > 0 ? (
          <Text style={styles.dim}>Kodu tekrar gönder ({seconds} sn)</Text>
        ) : (
          <Pressable onPress={() => setSeconds(60)}>
            <Text style={styles.link}>Kodu tekrar gönder</Text>
          </Pressable>
        )}
        <Text style={styles.hint}>Demo: herhangi 6 haneli bir kod gir</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 32 },
  box: { width: 48, height: 58, borderRadius: 14, backgroundColor: colors.card, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  boxActive: { borderColor: colors.pink },
  boxFilled: { borderColor: colors.primary },
  digit: { color: '#fff', fontSize: 24, fontWeight: '800' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  dim: { color: colors.textDim },
  link: { color: colors.pink, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 12, opacity: 0.7 },
});
