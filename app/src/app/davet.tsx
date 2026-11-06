import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComingSoon } from '@/components/coming-soon';
import { Text } from '@/components/text';
import { Card, Header } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { copyText } from '@/lib/clipboard';
import { liveMode } from '@/lib/live';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';
import { Icon3D } from '@/components/Icon3D';

// Inviting is social, so the page leads with coral; the coin reward stays gold (theme: color = meaning).
// The coral hero and the share button are colored fills in both schemes; the step numbers use coral as text.

/** The only invite reward: coins for both people once the friend enters their first room. */
const INVITE_REWARD = { coins: 200 };
const coinsText = `${INVITE_REWARD.coins.toLocaleString('tr-TR')} jeton`;
const STEPS = [
  'Kodunu ya da davet bağlantını arkadaşınla paylaş.',
  'Arkadaşın kayıt olurken kodunu girsin.',
  `İlk odasına girdiğinde ikinize de ${coinsText} gelir.`,
];

// The server has no referral system yet: no personal code, no code field at sign-up and no payout. A live build
// must not hand everyone the same demo code and promise coins nobody pays, so it lands on ComingSoon.
export default function InviteScreen() {
  return liveMode() ? <ComingSoon title="Arkadaşını Getir" /> : <DemoInvite />;
}

function DemoInvite() {
  const { inviteCode } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();

  const shareInvite = async () => {
    try {
      await Share.share({ message: `Similar Club'a katıl, sesli odalarda tanışalım! Kayıt olurken davet kodumu kullan: ${inviteCode} 🎙️` });
    } catch {
      showAlert('Davet kodun', inviteCode);
    }
  };

  const copy = () => copyText(inviteCode, 'Davet kodu');

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Arkadaşını Getir" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 110 }}>
        <LinearGradient colors={[semantic.socialFill, '#6E2440']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.reward}>
            <Icon3D name="coin" size={44} />
            <Text style={styles.rewardAmount}>{coinsText}</Text>
            <Text style={styles.rewardText}>Arkadaşın ilk odasına girdiğinde ikinize de {coinsText}</Text>
          </View>
          {/* The label sits above the code so the code gets the whole width; at 360 px it shrinks rather than cut. */}
          <View style={styles.codeRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.codeLabel}>Davet kodun</Text>
              <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {inviteCode}
              </Text>
            </View>
            <Pressable onPress={copy} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel="Davet kodunu kopyala">
              <Text style={styles.copyText}>Kopyala</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="help-circle-outline" size={20} color={colors.primaryText} />
            <Text style={styles.cardTitle}>Nasıl çalışır?</Text>
          </View>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.step}>
              <View style={styles.stepN}>
                <Text style={styles.stepNText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
          <Text style={styles.dim}>Her kişi ve her cihaz için tek hesap sayılır. Sahte hesapla kazanılan jetonlar geri alınır.</Text>
        </Card>
      </ScrollView>

      <View style={styles.sticky}>
        <Pressable onPress={shareInvite} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]} accessibilityRole="button">
          <LinearGradient colors={['#E2475B', semantic.socialFill]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.stickyBtn}>
            <Ionicons name="share-social" size={18} color="#fff" />
            <Text style={styles.stickyText}>Davet bağlantını paylaş</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  hero: { borderRadius: 20, padding: 14, gap: 12 },
  reward: { alignItems: 'center', gap: 6, paddingVertical: 10 },
  // On the coral hero: the bright coin gold in both schemes.
  rewardAmount: { color: semantic.money, fontSize: 36, fontWeight: '900' },
  rewardText: { color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 14, lineHeight: 20 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  codeLabel: { color: colors.textDim, fontSize: 13 },
  code: { color: colors.text, fontWeight: '800', fontSize: 18, letterSpacing: 0.5 },
  copyBtn: { backgroundColor: semantic.socialFill, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  copyText: { color: '#fff', fontWeight: '700' },
  cardTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepN: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: semantic.socialText, alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: semantic.socialText, fontWeight: '800', fontSize: 13 },
  stepText: { color: colors.text, fontSize: 14, flex: 1, lineHeight: 20 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, backgroundColor: dark ? 'rgba(8,15,30,0.92)' : 'rgba(243,246,251,0.92)' },
  stickyBtn: { flexDirection: 'row', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  stickyText: { color: '#fff', fontWeight: '700', fontSize: 17 },
}));
