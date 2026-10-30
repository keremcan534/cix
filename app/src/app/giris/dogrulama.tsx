import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { AuthHeader } from '@/components/AuthHeader';
import { GradientButton } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors, gradient } from '@/theme';

type Status = 'idle' | 'checking' | 'done';

const TIPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'sunny-outline', text: 'Aydınlık bir yerde ol' },
  { icon: 'glasses-outline', text: 'Gözlük ve şapkayı çıkar' },
  { icon: 'happy-outline', text: 'Yüzün tam ortada olsun' },
];

export default function VerifyScreen() {
  const { me, updateMe, login, addCoins } = useApp();
  const [selfie, setSelfie] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  const takeSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const res = perm.granted
      ? await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (res.canceled) return;
    setSelfie(res.assets[0].uri);
    // Prototype: fake a face-match check.
    setStatus('checking');
    setTimeout(() => {
      setStatus('done');
      updateMe({ verified: true });
    }, 2000);
  };

  const finish = () => {
    addCoins(100);
    login();
    showAlert('Hoş geldin! 🎉', 'Hoş geldin hediyesi olarak 100 jeton hesabına eklendi.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuthHeader step={4} title="Gerçek kişi doğrulaması" subtitle="Herkesin gerçek olduğu güvenli bir topluluk için kısa bir selfie çek. Fotoğrafın profilinde gösterilmez." />

      <View style={styles.center}>
        <LinearGradient colors={status === 'done' ? [colors.green, '#16A34A'] : gradient} style={styles.ring}>
          {selfie ? (
            <Image source={{ uri: selfie }} style={styles.face} />
          ) : (
            <View style={[styles.face, styles.faceEmpty]}>
              <Ionicons name="scan-outline" size={64} color={colors.textDim} />
            </View>
          )}
        </LinearGradient>

        {status === 'checking' && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={colors.primaryText} />
            <Text style={styles.statusText}>Doğrulanıyor...</Text>
          </View>
        )}
        {status === 'done' && (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={22} color={colors.green} />
            <Text style={[styles.statusText, { color: colors.green }]}>Doğrulandı! Profiline mavi tik eklendi.</Text>
          </View>
        )}
        {status === 'idle' && (
          <View style={{ gap: 10, alignSelf: 'stretch', paddingHorizontal: 30 }}>
            {TIPS.map((t) => (
              <View key={t.text} style={styles.tip}>
                <Ionicons name={t.icon} size={18} color="#A5F3F5" />
                <Text style={styles.tipText}>{t.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ padding: 20, gap: 12 }}>
        {status === 'done' ? (
          <GradientButton title={`Başla, ${me.name}!`} icon="rocket" onPress={finish} />
        ) : (
          <GradientButton title="Selfie çek" icon="camera" onPress={takeSelfie} style={{ opacity: status === 'checking' ? 0.4 : 1 }} />
        )}
        {status !== 'done' && (
          <Pressable onPress={finish} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={styles.skip}>Şimdi değil</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  ring: { width: 210, height: 210, borderRadius: 105, padding: 4 },
  face: { flex: 1, borderRadius: 101, borderWidth: 4, borderColor: colors.bg },
  faceEmpty: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  statusText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  tipText: { color: '#fff', fontSize: 14 },
  skip: { color: colors.textDim, fontWeight: '600' },
});
