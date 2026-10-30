import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Art, type ArtName } from '@/components/Art';
import { Avatar, Card, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { CALLS_FROM_LABEL, DM_FROM_LABEL, type CallsFrom, type DmFrom } from '@/data/privacy';
import { GATES } from '@/data/status';
import { showAlert } from '@/lib/alert';
import { useApp, type NotifyType, type Settings } from '@/store';
import { colors } from '@/theme';
import { IS_DEMO } from '@/lib/build';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function Toggle({ k, label, art, hint, disabled }: { k: BoolKey; label: string; art?: ArtName; hint?: string; disabled?: boolean }) {
  const { settings, setSetting } = useApp();
  return (
    <View style={[styles.row, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1 }}>
        {art ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Art name={art} size={20} />
            <Text style={{ color: '#fff', flexShrink: 1 }}>{label}</Text>
          </View>
        ) : (
          <Text style={{ color: '#fff' }}>{label}</Text>
        )}
        {hint && <Text style={styles.dim}>{hint}</Text>}
      </View>
      <Switch value={settings[k]} disabled={disabled} onValueChange={(v) => setSetting(k, v)} />
    </View>
  );
}

const NOTIFY_LABELS: [NotifyType, string][] = [
  ['live', '🔴 Takip ettiklerin canlı yayında'],
  ['invite', '✉️ Oda ve arkadaş davetleri'],
  ['event', '📅 Etkinlik hatırlatmaları'],
  ['agency', '🏢 Ajans duyuruları'],
  ['fanclub', '💜 Hayran kulübü'],
  ['game', '🎮 Oyun ve turnuva'],
  ['payment', '💳 Ödeme ve hak ediş'],
  ['system', '⚙️ Sistem'],
];
const LOCKED_NOTIFY: NotifyType[] = ['payment', 'system'];
const nowMs = () => Date.now();

function Chips<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(([v, l]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={[styles.chip, value === v && { backgroundColor: colors.primary }]}>
          <Text style={styles.chipText}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const { nobleTier, me, phone, deletionRequested, requestDeletion, logout, resetAll, blocked, toggleBlock, safetyLog, requestDataExport, settings, setSetting, sessions, endSession, notify } = useApp();
  const snoozed = settings.snoozeUntil > nowMs();
  const snooze = (h: number) => {
    setSetting('snoozeUntil', h ? nowMs() + h * 3_600_000 : 0);
    if (h) showAlert('Bildirimler ertelendi', `${h} saat boyunca bildirim gelmez. Güvenlik ve ödeme bildirimleri ertelenmez.`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ayarlar" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Text style={styles.section}>Hesap</Text>
        <Card style={{ gap: 8 }}>
          <Text style={{ color: '#fff' }}>
            {me.name} · {phone || 'Telefon bağlı değil'}
          </Text>
          <Pressable onPress={() => router.push('/cuzdan')}>
            <Text style={styles.link}>İşlem geçmişi, satın almalar ve iadeler →</Text>
          </Pressable>
          {IS_DEMO && (
            <Pressable onPress={() => router.push('/sunucu-hesabi')}>
              <Text style={styles.link}>Sunucu hesabı (veritabanı, test) →</Text>
            </Pressable>
          )}
        </Card>

        <Text style={styles.section}>Güvenlik</Text>
        <Card style={{ gap: 10 }}>
          <Text style={styles.title}>Aktif oturumlar</Text>
          {sessions.map((x) => (
            <View key={x.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff' }}>
                  {x.device}
                  {x.current ? ' · bu cihaz' : ''}
                </Text>
                <Text style={styles.dim}>
                  {x.place} · {x.last}
                </Text>
              </View>
              {!x.current && (
                <Pressable
                  style={[styles.chip, { backgroundColor: colors.red }]}
                  onPress={() => {
                    endSession(x.id);
                    notify({ kind: 'security', icon: '🔐', title: 'Oturum sonlandırıldı', body: `${x.device} · ${x.place} oturumu kapatıldı.` });
                  }}>
                  <Text style={styles.chipText}>Sonlandır</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Text style={styles.dim}>
            Yeni cihaz veya alışılmadık konumdan girişte bildirim gönderilir ve SMS doğrulaması istenir. Para çekme, IBAN değişikliği ve ajans transferi gibi hassas işlemlerde yeniden doğrulama yapılır.
          </Text>
          <Text style={styles.dim}>
            Kişi başına tek hesap kuralı: aynı cihaz, telefon veya IBAN ile açılmış birden fazla hesap risk incelemesine alınır; ödüller ve hak edişler inceleme bitene kadar bekletilir.
          </Text>
        </Card>

        <Text style={styles.section}>Harcama</Text>
        <Card style={{ gap: 10 }}>
          <Text style={{ color: '#fff' }}>Günlük harcama limiti</Text>
          <Chips
            value={settings.dailySpendLimit}
            options={[
              [0, 'Limitsiz'],
              [500, '🪙 500'],
              [2000, '🪙 2.000'],
              [10000, '🪙 10.000'],
            ]}
            onChange={(v) => setSetting('dailySpendLimit', v)}
          />
          <Text style={styles.dim}>Limit dolduğunda hediye, mağaza ve oyun harcamaları gece yarısına kadar durdurulur. Limit artışı 24 saat sonra geçerli olur.</Text>
        </Card>

        <Text style={styles.section}>Gizlilik</Text>
        <Card style={{ gap: 12 }}>
          <Toggle k="profilePublic" label="Profilim herkese açık" />
          <Toggle k="showOnline" label="Çevrimiçi durumumu göster" />
          <Toggle k="showLastSeen" label="Son görülme bilgimi göster" hint="Kapatırsan başkalarının son görülmesini de göremezsin." />
          <Toggle k="showCurrentRoom" label="Bulunduğum odayı profilimde göster" hint="Kapalıyken profilinden odana 'Git' ile gelinemez." />
          <Toggle k="luckyAnnounce" label="Kazançlarımda adım tüm odalarda görünsün" hint="Lucky ve oyun kazançları tüm odalarda duyurulur. Kapalıyken “Bir kullanıcı kazandı” yazar." />
          <Text style={{ color: '#fff' }}>Bana kimler mesaj gönderebilir?</Text>
          <Chips value={settings.dmFrom} options={Object.entries(DM_FROM_LABEL) as [DmFrom, string][]} onChange={(v) => setSetting('dmFrom', v)} />
          <Text style={{ color: '#fff' }}>Beni kimler arayabilir? (ücretli sesli/görüntülü)</Text>
          <Chips value={settings.callsFrom} options={Object.entries(CALLS_FROM_LABEL) as [CallsFrom, string][]} onChange={(v) => setSetting('callsFrom', v)} />
          <Toggle k="cityDiscovery" label="Aynı şehirde keşfedilebilir ol" hint="Varsayılan kapalı. Kesin konum yerine sadece şehir kullanılır." />
          <Toggle k="invisibleEntry" label="Odalara gizli giriş" art="oda-gizli-giris" hint="Asil Markiz+ (Gizli Oda Girişi) · Moderasyon kayıtlarından gizlenmez." disabled={!GATES.invisibleEntry(nobleTier)} />
          <Text style={{ color: '#fff' }}>Beni odalara kimler davet edebilir?</Text>
          <Chips
            value={settings.invitesFrom}
            options={[
              ['everyone', 'Herkes'],
              ['following', 'Takip ettiklerim'],
              ['nobody', 'Kimse'],
            ]}
            onChange={(v) => setSetting('invitesFrom', v)}
          />
        </Card>

        <Text style={styles.section}>Engellenenler · {blocked.size}</Text>
        <Card style={{ gap: 10 }}>
          {blocked.size === 0 ? (
            <Text style={styles.dim}>Kimseyi engellemedin. Engellediğin kişiler sana mesaj atamaz, seni arayamaz, hediye veya oda daveti gönderemez.</Text>
          ) : (
            [...blocked].map((id) => {
              const u = userById(id);
              return (
                <View key={id} style={styles.row}>
                  <Avatar uri={u.avatar} size={36} />
                  <Pressable style={{ flex: 1 }} onPress={() => router.push(`/kullanici/${id}`)}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{u.name}</Text>
                    <Text style={styles.dim}>@{u.username}</Text>
                  </Pressable>
                  <Pressable style={styles.chip} onPress={() => toggleBlock(id)} accessibilityLabel={`${u.name} engelini kaldır`}>
                    <Text style={styles.chipText}>Engeli kaldır</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </Card>

        <Text style={styles.section}>Güvenlik kayıtları</Text>
        <Card style={{ gap: 6 }}>
          {safetyLog.length === 0 ? (
            <Text style={styles.dim}>Engelleme, şikâyet ve veri talepleri burada tarihleriyle listelenir.</Text>
          ) : (
            safetyLog.slice(0, 12).map((l) => (
              <Text key={l.id} style={styles.dim}>
                {l.time} · {l.action}
                {l.targetId ? ` · ${userById(l.targetId).name}` : ''}
                {l.detail ? ` · ${l.detail}` : ''}
              </Text>
            ))
          )}
        </Card>

        <Text style={styles.section}>Görünüm ve erişilebilirlik</Text>
        <Card style={{ gap: 12 }}>
          <Toggle k="effectsOff" label="Animasyon ve giriş efektlerini kapat" hint="Hediye animasyonları ve giriş efektleri gösterilmez; oda işlevleri devam eder." />
          <Toggle k="haptics" label="Dokunuş titreşimi" hint="Butona basınca, mikrofonu açınca ve hediye gönderince telefon hafifçe titrer." />
          <Toggle k="reduceMotion" label="Hareketi azalt" hint="Geçişler ve titreşimli efektler sadeleştirilir." />
          <Toggle k="lowData" label="📶 Düşük veri modu" hint="Kapak görselleri düşük çözünürlükte, otomatik oynatma kapalı, ses kalitesi bağlantıya göre düşürülür." />
        </Card>

        <Text style={styles.section}>Bildirimler</Text>
        <Card style={{ gap: 12 }}>
          <Toggle k="notifySocial" label="Sosyal (mesaj, takip)" />
          {NOTIFY_LABELS.map(([k, l]) => (
            <View key={k} style={styles.row}>
              <Text style={{ color: '#fff', flex: 1 }}>{l}</Text>
              <Switch
                value={settings.notifyTypes[k]}
                disabled={LOCKED_NOTIFY.includes(k)}
                onValueChange={(v) => setSetting('notifyTypes', { ...settings.notifyTypes, [k]: v })}
              />
            </View>
          ))}
          <Text style={{ color: '#fff', marginTop: 4 }}>{snoozed ? `🔕 Ertelendi · ${new Date(settings.snoozeUntil).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} saatine kadar` : 'Bildirimleri ertele'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[1, 8, 24].map((h) => (
              <Pressable key={h} onPress={() => snooze(h)} style={styles.chip}>
                <Text style={styles.chipText}>{h} saat</Text>
              </Pressable>
            ))}
            {snoozed && (
              <Pressable onPress={() => snooze(0)} style={[styles.chip, { backgroundColor: colors.primary }]}>
                <Text style={styles.chipText}>Ertelemeyi kaldır</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.dim}>Güvenlik ve ödeme bildirimleri kapatılamaz ve ertelenmez.</Text>
        </Card>

        <Text style={styles.section}>Destek</Text>
        <Card style={{ gap: 10 }}>
          <Pressable onPress={() => router.push('/destek')}>
            <Text style={styles.link}>🛟 Destek merkezi ve taleplerim</Text>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Moderasyon kararı' } })}>
            <Text style={styles.link}>⚖️ Bir karara itiraz et (moderasyon, kısıtlama, transfer, oyun)</Text>
          </Pressable>
          <Pressable onPress={() => showAlert('Kullanım Koşulları', 'Demo metni.')}>
            <Text style={styles.link}>📄 Kullanım koşulları ve gizlilik politikası</Text>
          </Pressable>
        </Card>

        <Card style={{ gap: 10 }}>
          <Pressable onPress={requestDataExport}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>📦 Verilerimin kopyasını iste (KVKK)</Text>
          </Pressable>
          <Pressable onPress={logout}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Çıkış yap</Text>
          </Pressable>
          {IS_DEMO && (
            <Pressable
              onPress={() =>
                showAlert('Demo verilerini sıfırla', 'Bakiye, satın alımlar, ayarlar ve sohbetler bu cihazda ilk günkü haline döner. Test için kullanılır.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Sıfırla', style: 'destructive', onPress: resetAll },
                ])
              }
            >
              <Text style={{ color: colors.textDim, fontWeight: '700' }}>Demo verilerini sıfırla</Text>
            </Pressable>
          )}
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
  title: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
