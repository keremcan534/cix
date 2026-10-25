import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthHeader } from '@/components/AuthHeader';
import { GradientButton } from '@/components/ui';
import { INTERESTS } from '@/data/mock';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

const THIS_YEAR = new Date().getFullYear();

export default function ProfileSetupScreen() {
  const { updateMe } = useApp();
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'Kadın' | 'Erkek' | null>(null);
  const [year, setYear] = useState('');
  const [city, setCity] = useState('İstanbul');
  const [interests, setInterests] = useState<string[]>([]);

  const age = year.length === 4 ? THIS_YEAR - Number(year) : null;
  const ageError = age !== null && (age < 18 || age > 99) ? 'Uygulamayı kullanmak için 18 yaşından büyük olmalısın.' : null;
  const valid = name.trim().length >= 2 && !!gender && age !== null && !ageError;

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  };

  const toggleInterest = (i: string) =>
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : prev.length < 5 ? [...prev, i] : prev));

  const submit = () => {
    if (!valid) return;
    updateMe({
      name: name.trim(),
      gender: gender!,
      age: age!,
      city: city.trim() || 'İstanbul',
      interests,
      bio: interests.length ? interests.join(' ') : 'Yeni buradayım 👋',
      verified: false,
      ...(photo ? { avatar: photo } : {}),
    });
    router.push('/giris/dogrulama');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AuthHeader step={3} title="Profilini oluştur" subtitle="Diğer kullanıcılar seni böyle görecek." />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} keyboardShouldPersistTaps="handled">
          <Pressable style={{ alignSelf: 'center' }} onPress={pickPhoto}>
            <LinearGradient colors={gradient} style={styles.photoRing}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Ionicons name="camera" size={34} color={colors.textDim} />
                </View>
              )}
            </LinearGradient>
            <View style={styles.photoPlus}>
              <Ionicons name="add" size={18} color="#fff" />
            </View>
          </Pressable>

          <Field label="Adın">
            <TextInput value={name} onChangeText={setName} placeholder="Örn. Elif" placeholderTextColor={colors.textDim} style={styles.input} maxLength={20} />
          </Field>

          <Field label="Cinsiyet">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['Kadın', 'Erkek'] as const).map((g) => (
                <Chip key={g} label={g === 'Kadın' ? '👩 Kadın' : '👨 Erkek'} active={gender === g} onPress={() => setGender(g)} grow />
              ))}
            </View>
          </Field>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Doğum yılı">
                <TextInput
                  value={year}
                  onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="2000"
                  placeholderTextColor={colors.textDim}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Şehir">
                <TextInput value={city} onChangeText={setCity} placeholderTextColor={colors.textDim} style={styles.input} />
              </Field>
            </View>
          </View>
          {ageError && <Text style={styles.error}>{ageError}</Text>}

          <Field label={`İlgi alanları (${interests.length}/5)`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INTERESTS.map((i) => (
                <Chip key={i} label={i} active={interests.includes(i)} onPress={() => toggleInterest(i)} />
              ))}
            </View>
          </Field>
        </ScrollView>
        <View style={{ padding: 20, paddingTop: 8 }}>
          <GradientButton title="Devam" onPress={submit} style={{ opacity: valid ? 1 : 0.4 }} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, grow }: { label: string; active: boolean; onPress: () => void; grow?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, grow && { flex: 1, alignItems: 'center' }, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photoRing: { width: 116, height: 116, borderRadius: 58, padding: 3 },
  photo: { flex: 1, borderRadius: 56, borderWidth: 3, borderColor: colors.bg },
  photoEmpty: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  photoPlus: { position: 'absolute', right: 4, bottom: 4, backgroundColor: colors.primary, borderRadius: 14, padding: 4, borderWidth: 2, borderColor: colors.bg },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: colors.card, borderRadius: 14, color: '#fff', fontSize: 16, paddingHorizontal: 16, paddingVertical: 13 },
  error: { color: colors.red, fontSize: 13, marginTop: -12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { borderColor: colors.primaryText, backgroundColor: 'rgba(139,92,246,0.18)' },
  chipText: { color: colors.textDim, fontWeight: '600' },
});
