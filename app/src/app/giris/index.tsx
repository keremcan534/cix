import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { GradientButton } from '@/components/ui';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { IS_DEMO } from '@/lib/build';
import { openLegal } from '@/lib/legal';
import { showAlert } from '@/lib/alert';
import { liveMode, message } from '@/lib/live';
import { hasDeviceAccount } from '@/lib/api';
import { googleSignInOffered, profileFromServer, signInWithDevice, signInWithGoogle } from '@/lib/live/account';

// The delivered brand mark (two people forming a heart); app icons are generated from the same file.
const LOGO = require('../../../assets/brand/logo.png');

/** Coins given to the demo account on quick login (no real payment). */
const DEMO_TEST_COINS = 1_000_000;

export default function WelcomeScreen() {
  const { updateMe, login, addCoins, coins } = useApp();
  const { colors, semantic, dark } = useTheme();
  const styles = useStyles();
  const demoLogin = () => {
    updateMe({ name: 'Demo', age: 25, birthDate: '2001-03-14', verified: true, bio: '🎧 Müzik 🎮 Oyun', interests: ['🎧 Müzik', '🎮 Oyun', '💬 Sohbet'] });
    // Test balance so every paid flow (gifts, store, VIP) can be tried without the payment step.
    // Balance is saved between launches, so only top up to the test amount instead of adding it every login.
    if (coins < DEMO_TEST_COINS) addCoins(DEMO_TEST_COINS - coins, 'Demo test bakiyesi');
    login();
  };

  // Live mode with Google set up: Google's account picker, then a new account goes through the profile screen.
  const [googleBusy, setGoogleBusy] = useState(false);
  const google = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const r = await signInWithGoogle();
      if (!r) return;
      updateMe(profileFromServer(r.user));
      if (r.needsProfile) router.push({ pathname: '/giris/profil', params: { ad: r.user.name === 'Yeni üye' ? '' : r.user.name } });
      else login();
    } catch (e) {
      showAlert('Google ile giriş yapılamadı', message(e));
    } finally {
      setGoogleBusy(false);
    }
  };

  // Live mode without Google: a phone that already has its account (signed out with "Çıkış yap") signs back in
  // to it. One phone holds one account, so "Hesap oluştur" is not offered again there.
  const [hasAccount, setHasAccount] = useState<boolean | null>(liveMode() && !googleSignInOffered() ? null : false);
  useEffect(() => {
    if (hasAccount !== null) return;
    hasDeviceAccount().then(setHasAccount, () => setHasAccount(false));
  }, [hasAccount]);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const deviceLogin = async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    try {
      const r = await signInWithDevice();
      updateMe(profileFromServer(r.user));
      if (r.needsProfile) router.push({ pathname: '/giris/profil', params: { ad: r.user.name === 'Yeni üye' ? '' : r.user.name } });
      else login();
    } catch (e) {
      showAlert('Giriş yapılamadı', message(e));
    } finally {
      setDeviceBusy(false);
    }
  };

  return (
    <LinearGradient colors={[dark ? '#0B3B4A' : '#D9F1F3', colors.bg, colors.bg]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <Backdrop scene={SCENES.login} />
        <View style={styles.hero}>
          <View style={styles.center}>
            <Image source={LOGO} style={styles.logoMark} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={styles.logo} accessibilityRole="header">Similar Club</Text>
            <Text style={styles.tagline}>Sana benzeyen insanlarla{'\n'}aynı odada buluş.</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {/* Test server (live mode): Google sign-in when it is set up; otherwise the account is this phone's (one device, one account). */}
          {googleSignInOffered() ? (
            <GradientButton title={googleBusy ? 'Google ile bağlanılıyor…' : 'Google ile devam et'} icon="logo-google" onPress={google} style={googleBusy ? { opacity: 0.6 } : undefined} />
          ) : liveMode() && hasAccount === null ? (
            <View style={styles.placeholder} />
          ) : liveMode() && hasAccount ? (
            <>
              <GradientButton title={deviceBusy ? 'Giriş yapılıyor…' : 'Giriş yap'} icon="log-in" onPress={deviceLogin} style={deviceBusy ? { opacity: 0.6 } : undefined} />
              <Text style={styles.terms}>Bu telefondaki hesabınla devam edersin. Bir telefonda tek hesap açılabilir.</Text>
            </>
          ) : liveMode() ? (
            <GradientButton title="Hesap oluştur" icon="person-add" onPress={() => router.push('/giris/profil')} />
          ) : (
            <GradientButton title="Telefon numarası ile devam et" icon="call" onPress={() => router.push('/giris/telefon')} />
          )}
          {!liveMode() && <SocialButton icon="logo-google" title="Google ile devam et" />}
          {!liveMode() && <SocialButton icon="logo-apple" title="Apple ile devam et" />}
          {IS_DEMO && !liveMode() && (
            <Pressable onPress={demoLogin} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 }}>
              <Ionicons name="flash" size={14} color={semantic.tonalText} />
              <Text style={styles.link}>Demo hesabıyla hızlı giriş</Text>
            </Pressable>
          )}
          <Text style={styles.terms}>
            Devam ederek{' '}
            <Text style={styles.link} onPress={() => openLegal('terms')} accessibilityRole="link">
              Kullanım Koşulları
            </Text>{' '}
            ve{' '}
            <Text style={styles.link} onPress={() => openLegal('privacy')} accessibilityRole="link">
              Gizlilik Politikası
            </Text>
            &apos;nı kabul etmiş olursun. 18 yaşından büyük olmalısın.
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function SocialButton({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  // Prototype: social sign-in skips phone verification and goes straight to profile setup.
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.social, pressed && { opacity: 0.8 }]} onPress={() => router.push('/giris/profil')}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.socialText}>{title}</Text>
    </Pressable>
  );
}

// The light scheme lays the photo under a paper veil, so the hero text turns navy (with a paper halo instead of a shadow).
const useStyles = makeStyles(({ colors, semantic, dark, lift }) => ({
  hero: { flex: 1 },
  center: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center', gap: 12 },
  logoMark: { width: 96, height: 96 },
  logo: { color: colors.text, fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  // White with a soft shadow: the hero photo behind it is a bright sky.
  tagline: { color: colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 23, textShadowColor: dark ? 'rgba(8,15,30,0.85)' : 'rgba(243,246,251,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  actions: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  placeholder: { height: 52 },
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
    ...(dark ? null : { boxShadow: lift.boxShadow }),
  },
  socialText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  terms: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  link: { color: semantic.tonalText, fontWeight: '600' },
}));
