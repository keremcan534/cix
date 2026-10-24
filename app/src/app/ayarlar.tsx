import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Header } from '@/components/ui';
import { VIP_INVISIBLE_LEVEL } from '@/data/economy';
import { showAlert } from '@/lib/alert';
import { useApp, type Settings } from '@/store';
import { colors } from '@/theme';

function Toggle({ k, label, hint, disabled }: { k: keyof Settings; label: string; hint?: string; disabled?: boolean }) {
  const { settings, setSetting } = useApp();
  return (
    <View style={[styles.row, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff' }}>{label}</Text>
        {hint && <Text style={styles.dim}>{hint}</Text>}
      </View>
      <Switch value={settings[k]} disabled={disabled} onValueChange={(v) => setSetting(k, v)} />
    </View>
  );
}

export default function SettingsScreen() {
  const { vipLevel, me, phone, deletionRequested, requestDeletion, logout, blocked } = useApp();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ayarlar" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Text style={styles.section}>Hesap</Text>
        <Card style={{ gap: 8 }}>
          <Text style={{ color: '#fff' }}>
            {me.name} · {phone || 'Telefon bağlı değil'}
          </Text>
          <Text style={styles.dim}>Bağlı oturumlar: Bu cihaz (aktif)</Text>
          <Pressable onPress={() => router.push('/cuzdan')}>
            <Text style={styles.link}>Satın alma geçmişi ve iadeler →</Text>
          </Pressable>
        </Card>

        <Text style={styles.section}>Gizlilik</Text>
        <Card style={{ gap: 12 }}>
          <Toggle k="profilePublic" label="Profilim herkese açık" />
          <Toggle k="showOnline" label="Çevrimiçi durumumu göster" />
          <Toggle k="cityDiscovery" label="Aynı şehirde keşfedilebilir ol" hint="Varsayılan kapalı. Kesin konum yerine sadece şehir kullanılır." />
          <Toggle k="invisibleEntry" label="👻 Odalara gizli giriş" hint={`VIP ${VIP_INVISIBLE_LEVEL}+ · Moderasyon kayıtlarından gizlenmez.`} disabled={vipLevel < VIP_INVISIBLE_LEVEL} />
          <Text style={styles.dim}>Engellenen kullanıcılar: {blocked.size}</Text>
        </Card>

        <Text style={styles.section}>Görünüm ve erişilebilirlik</Text>
        <Card style={{ gap: 12 }}>
          <Toggle k="effectsOff" label="Animasyon ve giriş efektlerini kapat" hint="Hediye animasyonları ve giriş efektleri gösterilmez; oda işlevleri devam eder." />
        </Card>

        <Text style={styles.section}>Bildirimler</Text>
        <Card style={{ gap: 12 }}>
          <Toggle k="notifySocial" label="Sosyal (mesaj, takip, oda daveti)" />
          <Toggle k="notifyFinance" label="Finans (hak ediş, ödeme)" />
          <Text style={styles.dim}>Güvenlik bildirimleri kapatılamaz.</Text>
        </Card>

        <Text style={styles.section}>Destek</Text>
        <Card style={{ gap: 10 }}>
          <Pressable onPress={() => router.push('/destek')}>
            <Text style={styles.link}>🛟 Destek merkezi ve taleplerim</Text>
          </Pressable>
          <Pressable onPress={() => showAlert('Kullanım Koşulları', 'Demo metni.')}>
            <Text style={styles.link}>📄 Kullanım koşulları ve gizlilik politikası</Text>
          </Pressable>
        </Card>

        <Card style={{ gap: 10 }}>
          <Pressable onPress={logout}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Çıkış yap</Text>
          </Pressable>
          {deletionRequested ? (
            <Text style={{ color: colors.gold }}>Hesap silme talebin alındı. 30 gün içinde tamamlanacak; bu sürede giriş yaparak iptal edebilirsin. Yasal olarak saklanması gereken kayıtlar saklama süresi kadar tutulur.</Text>
          ) : (
            <Pressable
              onPress={() =>
                showAlert('Hesabı sil', 'Hesabın ve kişisel verilerin silinecek. Aktif abonelikleri mağazadan ayrıca iptal etmen gerekir. Devam edilsin mi?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Silme talebi oluştur', style: 'destructive', onPress: requestDeletion },
                ])
              }
            >
              <Text style={{ color: colors.red, fontWeight: '700' }}>Hesabı sil</Text>
            </Pressable>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.textDim, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  link: { color: '#fff', fontWeight: '600' },
});
