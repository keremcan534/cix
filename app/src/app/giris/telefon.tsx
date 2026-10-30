import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { AuthHeader } from '@/components/AuthHeader';
import { GradientButton } from '@/components/ui';
import { useApp } from '@/store';
import { colors } from '@/theme';

// "5321234567" -> "532 123 45 67"
const format = (digits: string) =>
  [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)].filter(Boolean).join(' ');

export default function PhoneScreen() {
  const { setPhone } = useApp();
  const [digits, setDigits] = useState('');
  const valid = digits.length === 10 && digits.startsWith('5');

  const submit = () => {
    if (!valid) return;
    setPhone(`+90 ${format(digits)}`);
    router.push('/giris/kod');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AuthHeader step={1} title="Telefon numaran" subtitle="Sana bir doğrulama kodu göndereceğiz." />
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 28 },
  prefix: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14 },
  prefixText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  // minWidth 0: on web an input won't shrink below its content width and pushed the row off screen.
  input: { flex: 1, minWidth: 0, backgroundColor: colors.card, borderRadius: 14, color: '#fff', fontSize: 20, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 14, letterSpacing: 1 },
  error: { color: colors.red, paddingHorizontal: 20, marginTop: 8 },
});
