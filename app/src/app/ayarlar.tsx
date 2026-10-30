import type Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Art } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import { ChoiceChips, ListBlock, ListGroup, ListRow, ListSwitch } from '@/components/list';
import { Avatar, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { CALLS_FROM_LABEL, DM_FROM_LABEL, type CallsFrom, type DmFrom } from '@/data/privacy';
import { GATES } from '@/data/status';
import { showAlert } from '@/lib/alert';
import { useApp, type NotifyType, type Settings } from '@/store';
import { colors, semantic } from '@/theme';
import { IS_DEMO } from '@/lib/build';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type IconName = keyof typeof Ionicons.glyphMap;

/** A settings switch bound to one boolean in the store. */
function Toggle({ k, ...row }: { k: BoolKey; title: string; subtitle?: string; icon?: IconName; leading?: ReactNode; disabled?: boolean }) {
  const { settings, setSetting } = useApp();
  return <ListSwitch {...row} value={settings[k]} onChange={(v) => setSetting(k, v)} />;
}

const NOTIFY_ROWS: [NotifyType, string, IconName][] = [
  ['live', 'Takip ettiklerin canlı yayında', 'radio-outline'],
  ['invite', 'Oda ve arkadaş davetleri', 'mail-outline'],
  ['event', 'Etkinlik hatırlatmaları', 'calendar-outline'],
  ['agency', 'Ajans duyuruları', 'business-outline'],
  ['fanclub', 'Hayran kulübü', 'heart-outline'],
  ['game', 'Oyun ve turnuva', 'game-controller-outline'],
  ['payment', 'Ödeme ve hak ediş', 'card-outline'],
  ['system', 'Sistem', 'settings-outline'],
];
const LOCKED_NOTIFY: NotifyType[] = ['payment', 'system'];
const nowMs = () => Date.now();

const coin = <Icon3D name="coin" size={14} />;

export default function SettingsScreen() {
  const { nobleTier, me, phone, deletionRequested, requestDeletion, logout, resetAll, blocked, toggleBlock, safetyLog, requestDataExport, settings, setSetting, sessions, endSession, notify } = useApp();
  const snoozed = settings.snoozeUntil > nowMs();
  const snooze = (h: number) => {
    setSetting('snoozeUntil', h ? nowMs() + h * 3_600_000 : 0);
    if (h) showAlert('Bildirimler ertelendi', `${h} saat boyunca bildirim gelmez. Güvenlik ve ödeme bildirimleri ertelenmez.`);
  };
  const snoozedUntil = new Date(settings.snoozeUntil).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ayarlar" />
      <ScrollView contentContainerStyle={styles.page}>
        <ListGroup label="Hesap">
          <ListRow
            leading={<Avatar uri={me.avatar} size={40} />}
            title={me.name}
            subtitle={phone ? `Telefon · ${phone}` : 'Telefon bağlı değil'}
            onPress={() => router.push('/kullanici/me')}
          />
          <ListRow icon="receipt-outline" tone="money" title="İşlem geçmişi" subtitle="Satın almalar ve iadeler" onPress={() => router.push('/cuzdan')} />
          {IS_DEMO && <ListRow icon="server-outline" tone="neutral" title="Sunucu hesabı" subtitle="Veritabanı bağlantısı ve test" onPress={() => router.push('/sunucu-hesabi')} />}
        </ListGroup>

        <ListGroup
          label="Aktif oturumlar"
          footer="Yeni cihaz veya alışılmadık konumdan girişte bildirim gönderilir ve SMS doğrulaması istenir. Para çekme, IBAN değişikliği ve ajans transferi gibi hassas işlemlerde yeniden doğrulama yapılır. Kişi başına tek hesap kuralı: aynı cihaz, telefon veya IBAN ile açılmış birden fazla hesap risk incelemesine alınır; ödüller ve hak edişler inceleme bitene kadar bekletilir."
        >
          {sessions.map((x) => (
            <ListRow
              key={x.id}
              icon={/Web/.test(x.device) ? 'desktop-outline' : 'phone-portrait-outline'}
              tone={x.current ? 'success' : 'neutral'}
              title={x.device}
              subtitle={`${x.place} · ${x.current ? 'Şu an aktif' : x.last}`}
              right={
                x.current ? (
                  <View style={styles.liveDot} accessibilityLabel="Şu an kullandığın cihaz" />
                ) : (
                  <Pressable
                    style={styles.endBtn}
                    accessibilityLabel={`${x.device} oturumunu sonlandır`}
                    onPress={() => {
                      endSession(x.id);
                      notify({ kind: 'security', icon: 'lock-closed', title: 'Oturum sonlandırıldı', body: `${x.device} · ${x.place} oturumu kapatıldı.` });
                    }}
                  >
                    <Text style={styles.endText}>Sonlandır</Text>
                  </Pressable>
                )
              }
            />
          ))}
        </ListGroup>

        <ListGroup label="Harcama" footer="Limit dolduğunda hediye, mağaza ve oyun harcamaları gece yarısına kadar durdurulur. Limit artışı 24 saat sonra geçerli olur.">
          <ListBlock title="Günlük harcama limiti">
            <ChoiceChips
              value={settings.dailySpendLimit}
              options={[
                [0, 'Limitsiz'],
                [500, '500', coin],
                [2000, '2.000', coin],
                [10000, '10.000', coin],
              ]}
              onChange={(v) => setSetting('dailySpendLimit', v)}
            />
          </ListBlock>
        </ListGroup>

        <ListGroup label="Gizlilik">
          <Toggle k="profilePublic" icon="globe-outline" title="Profilim herkese açık" />
          <Toggle k="showOnline" icon="radio-button-on-outline" title="Çevrimiçi durumumu göster" />
          <Toggle k="showLastSeen" icon="time-outline" title="Son görülme bilgimi göster" subtitle="Kapatırsan başkalarının son görülmesini de göremezsin." />
          <Toggle k="showCurrentRoom" icon="mic-outline" title="Bulunduğum odayı profilimde göster" subtitle="Kapalıyken profilinden odana 'Git' ile gelinemez." />
          <Toggle k="luckyAnnounce" icon="megaphone-outline" title="Kazançlarımda adım görünsün" subtitle="Lucky ve oyun kazançları tüm odalarda duyurulur. Kapalıyken “Bir kullanıcı kazandı” yazar." />
          <Toggle k="cityDiscovery" icon="location-outline" title="Aynı şehirde keşfedilebilir ol" subtitle="Varsayılan kapalı. Kesin konum yerine sadece şehir kullanılır." />
          <Toggle
            k="invisibleEntry"
            leading={<Art name="oda-gizli-giris" size={32} />}
            title="Odalara gizli giriş"
            subtitle="Asil Markiz+ (Gizli Oda Girişi) · Moderasyon kayıtlarından gizlenmez."
            disabled={!GATES.invisibleEntry(nobleTier)}
          />
        </ListGroup>

        <ListGroup label="Kimler ulaşabilir">
          <ListBlock title="Bana kimler mesaj gönderebilir?">
            <ChoiceChips value={settings.dmFrom} options={Object.entries(DM_FROM_LABEL) as [DmFrom, string][]} onChange={(v) => setSetting('dmFrom', v)} />
          </ListBlock>
          <ListBlock title="Beni kimler arayabilir?">
            <Text style={styles.blockHint}>Ücretli sesli ve görüntülü aramalar</Text>
            <ChoiceChips value={settings.callsFrom} options={Object.entries(CALLS_FROM_LABEL) as [CallsFrom, string][]} onChange={(v) => setSetting('callsFrom', v)} />
          </ListBlock>
          <ListBlock title="Beni odalara kimler davet edebilir?">
            <ChoiceChips
              value={settings.invitesFrom}
              options={[
                ['everyone', 'Herkes'],
                ['following', 'Takip ettiklerim'],
                ['nobody', 'Kimse'],
              ]}
              onChange={(v) => setSetting('invitesFrom', v)}
            />
          </ListBlock>
        </ListGroup>

        <ListGroup label={`Engellenenler · ${blocked.size}`} footer="Engellediğin kişiler sana mesaj atamaz, seni arayamaz, hediye veya oda daveti gönderemez.">
          {blocked.size === 0 ? (
            <ListRow icon="shield-checkmark-outline" tone="neutral" title="Kimseyi engellemedin" />
          ) : (
            [...blocked].map((id) => {
              const u = userById(id);
              return (
                <ListRow
                  key={id}
                  leading={<Avatar uri={u.avatar} size={36} />}
                  title={u.name}
                  subtitle={`@${u.username}`}
                  onPress={() => router.push(`/kullanici/${id}`)}
                  chevron={false}
                  right={
                    <Pressable style={styles.chip} onPress={() => toggleBlock(id)} accessibilityLabel={`${u.name} engelini kaldır`}>
                      <Text style={styles.chipText}>Engeli kaldır</Text>
                    </Pressable>
                  }
                />
              );
            })
          )}
        </ListGroup>

        <ListGroup label="Güvenlik kayıtları">
          {safetyLog.length === 0 ? (
            <ListRow icon="document-text-outline" tone="neutral" title="Kayıt yok" subtitle="Engelleme, şikâyet ve veri talepleri burada tarihleriyle listelenir." />
          ) : (
            safetyLog.slice(0, 12).map((l) => (
              <ListRow
                key={l.id}
                icon="document-text-outline"
                tone="neutral"
                title={l.action + (l.targetId ? ` · ${userById(l.targetId).name}` : '')}
                subtitle={l.time + (l.detail ? ` · ${l.detail}` : '')}
              />
            ))
          )}
        </ListGroup>

        <ListGroup label="Görünüm ve erişilebilirlik">
          <Toggle k="effectsOff" icon="sparkles-outline" title="Animasyon ve giriş efektlerini kapat" subtitle="Hediye animasyonları ve giriş efektleri gösterilmez; oda işlevleri devam eder." />
          <Toggle k="haptics" icon="pulse-outline" title="Dokunuş titreşimi" subtitle="Butona basınca, mikrofonu açınca ve hediye gönderince telefon hafifçe titrer." />
          <Toggle k="reduceMotion" icon="contrast-outline" title="Hareketi azalt" subtitle="Geçişler ve titreşimli efektler sadeleştirilir." />
          <Toggle k="lowData" icon="cellular-outline" title="Düşük veri modu" subtitle="Kapak görselleri düşük çözünürlükte, otomatik oynatma kapalı, ses kalitesi bağlantıya göre düşürülür." />
        </ListGroup>

        <ListGroup label="Bildirimler" footer="Güvenlik ve ödeme bildirimleri kapatılamaz ve ertelenmez.">
          <Toggle k="notifySocial" icon="chatbubbles-outline" title="Sosyal" subtitle="Mesajlar ve yeni takipçiler" />
          {NOTIFY_ROWS.map(([k, title, icon]) => (
            <ListSwitch
              key={k}
              icon={icon}
              title={title}
              subtitle={LOCKED_NOTIFY.includes(k) ? 'Her zaman açık' : undefined}
              value={settings.notifyTypes[k]}
              disabled={LOCKED_NOTIFY.includes(k)}
              onChange={(v) => setSetting('notifyTypes', { ...settings.notifyTypes, [k]: v })}
            />
          ))}
          <ListBlock title={snoozed ? `Ertelendi · ${snoozedUntil} saatine kadar` : 'Bildirimleri ertele'}>
            <View style={styles.snoozeRow}>
              {[1, 8, 24].map((h) => (
                <Pressable key={h} onPress={() => snooze(h)} style={styles.chip}>
                  <Text style={styles.chipText}>{h} saat</Text>
                </Pressable>
              ))}
              {snoozed && (
                <Pressable onPress={() => snooze(0)} style={[styles.chip, styles.chipOn]}>
                  <Text style={styles.chipText}>Ertelemeyi kaldır</Text>
                </Pressable>
              )}
            </View>
          </ListBlock>
        </ListGroup>

        <ListGroup label="Destek">
          <ListRow icon="help-buoy-outline" title="Destek merkezi" subtitle="Taleplerin ve yanıtlar" onPress={() => router.push('/destek')} />
          <ListRow
            icon="scale-outline"
            title="Bir karara itiraz et"
            subtitle="Moderasyon, kısıtlama, transfer veya oyun kararı"
            onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Moderasyon kararı' } })}
          />
          <ListRow icon="document-text-outline" title="Kullanım koşulları ve gizlilik" onPress={() => showAlert('Kullanım Koşulları', 'Demo metni.')} />
        </ListGroup>

        <ListGroup
          footer={
            deletionRequested ? (
              <Text style={[styles.footnote, { color: semantic.money }]}>
                Hesap silme talebin alındı. 30 gün içinde tamamlanacak; bu sürede giriş yaparak iptal edebilirsin. Yasal olarak saklanması gereken kayıtlar saklama süresi kadar tutulur.
              </Text>
            ) : undefined
          }
        >
          <ListRow icon="download-outline" tone="neutral" title="Verilerimin kopyasını iste" subtitle="KVKK kapsamında e-postana gönderilir" onPress={requestDataExport} chevron={false} />
          <ListRow icon="log-out-outline" tone="neutral" title="Çıkış yap" onPress={logout} chevron={false} />
          {IS_DEMO && (
            <ListRow
              icon="refresh-outline"
              tone="neutral"
              title="Demo verilerini sıfırla"
              chevron={false}
              onPress={() =>
                showAlert('Demo verilerini sıfırla', 'Bakiye, satın alımlar, ayarlar ve sohbetler bu cihazda ilk günkü haline döner. Test için kullanılır.', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Sıfırla', style: 'destructive', onPress: resetAll },
                ])
              }
            />
          )}
          {!deletionRequested && (
            <ListRow
              icon="trash-outline"
              destructive
              title="Hesabı sil"
              chevron={false}
              onPress={() =>
                showAlert('Hesabı sil', 'Hesabın ve kişisel verilerin silinecek. Aktif abonelikleri mağazadan ayrıca iptal etmen gerekir. Devam edilsin mi?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Silme talebi oluştur', style: 'destructive', onPress: requestDeletion },
                ])
              }
            />
          )}
        </ListGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48, gap: 22 },
  blockHint: { color: colors.textDim, fontSize: 12, marginTop: -6 },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.success, marginRight: 4 },
  endBtn: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,122,130,0.5)', backgroundColor: 'rgba(255,122,130,0.1)' },
  endText: { color: semantic.danger, fontWeight: '700', fontSize: 12 },
  snoozeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
