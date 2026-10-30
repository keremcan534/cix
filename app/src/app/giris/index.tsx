import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { GradientButton } from '@/components/ui';
import { useApp } from '@/store';
import { USERS } from '@/data/mock';
import { colors, gradient, semantic } from '@/theme';
import { IS_DEMO } from '@/lib/build';

// Avatars floating around the logo: [user index, size, top %, left %]
const BUBBLES: [number, number, `${number}%`, `${number}%`][] = [
  [0, 78, '6%', '8%'],
  [4, 64, '2%', '66%'],
  [1, 56, '30%', '78%'],
  [6, 70, '54%', '4%'],
  [10, 60, '62%', '70%'],
  [8, 52, '70%', '18%'],
];

/** Coins given to the demo account on quick login (no real payment). */
const DEMO_TEST_COINS = 1_000_000;

export default function WelcomeScreen() {
  const { updateMe, login, addCoins, coins } = useApp();
  const demoLogin = () => {
    updateMe({ name: 'Demo', age: 25, birthDate: '2001-03-14', verified: true, bio: '🎧 Müzik 🎮 Oyun', interests: ['🎧 Müzik', '🎮 Oyun', '💬 Sohbet'] });
    // Test balance so every paid flow (gifts, store, VIP) can be tried without the payment step.
    // Balance is saved between launches, so only top up to the test amount instead of adding it every login.
    if (coins < DEMO_TEST_COINS) addCoins(DEMO_TEST_COINS - coins, 'Demo test bakiyesi');
    login();
  };

  return (
    <LinearGradient colors={['#0B3B4A', colors.bg, colors.bg]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <Backdrop scene={SCENES.login} />
        <View style={styles.hero}>
          {BUBBLES.map(([i, size, top, left]) => (
            <View key={i} style={[styles.bubble, { top, left, width: size, height: size, borderRadius: size / 2 }]}>
              <Image source={{ uri: USERS[i].avatar }} style={{ flex: 1, borderRadius: size / 2 }} />
            </View>
          ))}
          <View style={styles.center}>
            <LinearGradient colors={gradient} style={styles.logoMark}>
              <Ionicons name="mic" size={44} color={semantic.actionInk} />
            </LinearGradient>
            <Text style={styles.logo}>Similar Club</Text>
            <Text style={styles.tagline}>Sesli odalarda yeni insanlarla tanış,{'\n'}sohbet et, eğlen.</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <GradientButton title="Telefon numarası ile devam et" icon="call" onPress={() => router.push('/giris/telefon')} />
          <SocialButton icon="logo-google" title="Google ile devam et" />
          <SocialButton icon="logo-apple" title="Apple ile devam et" />
          {IS_DEMO && (
            <Pressable onPress={demoLogin} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <Text style={styles.link}>⚡ Demo hesabıyla hızlı giriş</Text>
            </Pressable>
          )}
          <Text style={styles.terms}>
            Devam ederek <Text style={styles.link}>Kullanım Koşulları</Text> ve{' '}
            <Text style={styles.link}>Gizlilik Politikası</Text>&apos;nı kabul etmiş olursun. 18 yaşından büyük olmalısın.
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function SocialButton({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  // Prototype: social sign-in skips phone verification and goes straight to profile setup.
  return (
    <Pressable style={({ pressed }) => [styles.social, pressed && { opacity: 0.8 }]} onPress={() => router.push('/giris/profil')}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={styles.socialText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1 },
  bubble: { position: 'absolute', padding: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  center: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center', gap: 12 },
  logoMark: { width: 96, height: 96, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  logo: { color: '#fff', fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  // White with a soft shadow: the hero photo behind it is a bright sky.
  tagline: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 23, textShadowColor: 'rgba(8,15,30,0.85)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  actions: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  socialText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  terms: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  link: { color: '#A5F3F5', fontWeight: '600' },
});
