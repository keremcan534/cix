import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Icon3D } from '@/components/Icon3D';
import { ChoiceChips, ListBlock, ListGroup, ListRow, ListSwitch } from '@/components/list';
import { AdminPanel } from '@/components/admin/admin-panel';
import { LicensesSheet } from '@/components/licenses-sheet';
import { Avatar, Header } from '@/components/ui';
import { userById } from '@/data/mock';
import { CALLS_FROM_LABEL, DM_FROM_LABEL, type CallsFrom, type DmFrom } from '@/data/privacy';
import { GATES } from '@/data/status';
import { confirmLogout, showAlert } from '@/lib/alert';
import { useApp, type NotifyType, type Settings } from '@/store';
import { makeStyles, useTheme, type Appearance } from '@/theme';
import { IS_DEMO } from '@/lib/build';
import { openLegal } from '@/lib/legal';
import { liveMode, message, myServerId } from '@/lib/live';
import { confirmDeleteLiveAccount, liveSignOut } from '@/lib/live/account';
import { useStaffRole } from '@/lib/live/admin';
import { useLivePrivacy, usePrivacySetter, type PrivacyKey } from '@/lib/live/privacy';
import { type CodeKind } from '@/lib/live/account';
import { useRemoteConfig } from '@/lib/remote-control';
import { useAppUpdate, versionLabel } from '@/lib/app-update';
import { APP_VERSION } from '@/lib/reporting';
import { formatPhone } from '@/lib/verify-code';
import { VerifiedPill, VerifySheet } from '@/components/verify-sheet';
import { useLiveSessions } from '@/lib/live/sessions';
import { openSupportMail } from '@/lib/open-mail';
import { dataRequestMail } from '@/lib/support-mail';

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];
type IconName = keyof typeof Ionicons.glyphMap;

/** A settings switch bound to one boolean in the store. */
function Toggle({ k, ...row }: { k: BoolKey; title: string; subtitle?: string; icon?: IconName; disabled?: boolean }) {
  const { settings, setSetting } = useApp();
  return <ListSwitch {...row} value={settings[k]} onChange={(v) => setSetting(k, v)} />;
}

/** A Gizlilik switch: in a live build kept on the server, which enforces it (lib/live/privacy). */
function PrivacyToggle({ k, ...row }: { k: BoolKey & PrivacyKey; title: string; subtitle?: string; icon?: IconName }) {
  const { settings } = useApp();
  const setPrivacy = usePrivacySetter();
  return <ListSwitch {...row} value={settings[k]} onChange={(v) => setPrivacy(k, v)} />;
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

// The two privacy settings a live build does not offer, with the store's defaults: no live room has invisible entry,
// and no live win is announced with a name (the Uğurlu line names nobody), so neither switch would do anything there.
// One changed on this phone before still acts on this phone, so a live build offers to put them back. The other
// privacy and contact choices are kept and enforced on the server (lib/live/privacy).
const PRIVACY_DEFAULTS: Pick<Settings, 'luckyAnnounce' | 'invisibleEntry'> = {
  luckyAnnounce: true,
  invisibleEntry: false,
};
const PRIVACY_KEYS = Object.keys(PRIVACY_DEFAULTS) as (keyof typeof PRIVACY_DEFAULTS)[];
const nowMs = () => Date.now();

const coin = <Icon3D name="coin" size={14} />;

const APPEARANCE: [Appearance, string, IconName][] = [
  ['system', 'Sistem', 'phone-portrait-outline'],
  ['light', 'Açık', 'sunny-outline'],
  ['dark', 'Koyu', 'moon-outline'],
];

/** Sistem / Açık / Koyu: the app's color scheme. */
function AppearancePicker() {
  const { settings, setSetting } = useApp();
  const t = useTheme();
  return (
    <ListBlock title="Tema">
      <ChoiceChips
        value={settings.appearance}
        options={APPEARANCE.map(([v, label, icon]) => [v, label, <Ionicons key={v} name={icon} size={14} color={settings.appearance === v ? t.colors.text : t.colors.textDim} />])}
        onChange={(v) => setSetting('appearance', v)}
      />
    </ListBlock>
  );
}

const ONE_ACCOUNT_RULE =
  'Kişi başına tek hesap kuralı: aynı cihaz, telefon veya IBAN ile açılmış birden fazla hesap risk incelemesine alınır; ödüller ve hak edişler inceleme bitene kadar bekletilir.';
// The demo's prototype promises (SMS on a new device, re-verification). The server does neither, so a live build
// does not say them.
const DEMO_SESSIONS_FOOTER = `Yeni cihaz veya alışılmadık konumdan girişte bildirim gönderilir ve SMS doğrulaması istenir. Para çekme, IBAN değişikliği ve ajans transferi gibi hassas işlemlerde yeniden doğrulama yapılır. ${ONE_ACCOUNT_RULE}`;

/** Live build: the account's real sessions on the server; Sonlandır ends one there (lib/live/sessions). */
function LiveSessions() {
  const styles = useStyles();
  const { rows, status, busy, reload, revoke } = useLiveSessions(true);
  const end = (id: string) => void revoke(id).catch((e) => showAlert('Oturum sonlandırılamadı', message(e)));
  return (
    <ListGroup label="Aktif oturumlar" footer={`Tanımadığın bir cihaz görürsen oturumunu sonlandır. ${ONE_ACCOUNT_RULE}`}>
      {status === 'failed' && rows.length === 0 ? (
        <ListRow icon="cloud-offline-outline" tone="neutral" title="Oturumlar yüklenemedi" subtitle="Dokun, tekrar deneyelim." onPress={() => void reload()} chevron={false} />
      ) : status === 'loading' ? (
        <ListRow icon="time-outline" tone="neutral" title="Oturumlar yükleniyor…" />
      ) : (
        rows.map((x) => (
          <ListRow
            key={x.id}
            icon={x.web ? 'desktop-outline' : 'phone-portrait-outline'}
            tone={x.current ? 'success' : 'neutral'}
            title={x.title}
            subtitle={x.subtitle}
            right={
              x.current ? (
                <View style={styles.liveDot} accessibilityLabel="Şu an kullandığın cihaz" />
              ) : (
                <Pressable style={[styles.endBtn, busy === x.id && { opacity: 0.5 }]} disabled={!!busy} accessibilityLabel={`${x.title} oturumunu sonlandır`} onPress={() => end(x.id)}>
                  <Text style={styles.endText}>{busy === x.id ? 'Sonlandırılıyor…' : 'Sonlandır'}</Text>
                </Pressable>
              )
            }
          />
        ))
      )}
    </ListGroup>
  );
}

export default function SettingsScreen() {
  const { nobleTier, me, phone, deletionRequested, requestDeletion, logout, resetAll, blocked, toggleBlock, safetyLog, requestDataExport, settings, setSetting, sessions, endSession, notify } = useApp();
  const [licenses, setLicenses] = useState(false);
  // Live mode: the account's e-mail and checked number (the ways the server has on, lib/remote-config).
  const { email, phoneVerified } = useApp();
  const { signIn, verify } = useRemoteConfig();
  const update = useAppUpdate();
  const [verifyKind, setVerifyKind] = useState<CodeKind | null>(null);
  const canAddEmail = liveMode() && !!signIn?.email;
  const canCheckPhone = liveMode() && (verify.sms || verify.whatsapp);
  const staff = useStaffRole();
  const [adminOpen, setAdminOpen] = useState(false);
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const snoozed = settings.snoozeUntil > nowMs();
  const snooze = (h: number) => {
    setSetting('snoozeUntil', h ? nowMs() + h * 3_600_000 : 0);
    if (h) showAlert('Bildirimler ertelendi', `${h} saat boyunca bildirim gelmez. Güvenlik ve ödeme bildirimleri ertelenmez.`);
  };
  const snoozedUntil = new Date(settings.snoozeUntil).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  // A live build shows only what the server really does: its sessions, the privacy and contact choices it keeps
  // and enforces, and no spending switches. The demo keeps every prototype setting.
  const live = liveMode();
  const stalePrivacy = live && PRIVACY_KEYS.some((k) => settings[k] !== PRIVACY_DEFAULTS[k]);
  const resetPrivacy = () => {
    for (const k of PRIVACY_KEYS) setSetting(k, PRIVACY_DEFAULTS[k]);
    showAlert('Eski ayarlar sıfırlandı', 'Bu telefonda kalan gizli giriş ve kazanç duyurusu ayarları varsayılana döndü.');
  };
  // Live: Gizlilik and "Kimler ulaşabilir" come from the server and are saved there (lib/live/privacy).
  useLivePrivacy();
  const setPrivacy = usePrivacySetter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Ayarlar" />
      <ScrollView contentContainerStyle={styles.page}>
        <ListGroup label="Hesap">
          <ListRow
            leading={<Avatar uri={me.avatar} size={40} />}
            title={me.name}
            subtitle={liveMode() ? 'Profilini gör' : phone ? `Telefon · ${phone}` : 'Telefon bağlı değil'}
            onPress={() => router.push('/kullanici/me')}
          />
          {liveMode() && (!!email || canAddEmail) && (
            <ListRow
              icon="mail-outline"
              title={email ? 'E-posta' : 'E-posta ekle'}
              subtitle={email ?? 'Bu adresle de giriş yapabilirsin'}
              subtitleOneLine={!!email}
              right={email ? <VerifiedPill /> : undefined}
              onPress={canAddEmail ? () => setVerifyKind('email') : undefined}
            />
          )}
          {liveMode() && (phoneVerified || canCheckPhone) && (
            <ListRow
              icon="call-outline"
              tone="success"
              title={phoneVerified ? 'Telefon' : 'Telefonunu doğrula'}
              subtitle={phoneVerified && phone ? formatPhone(phone) : 'Numaran profilinde görünmez'}
              right={phoneVerified ? <VerifiedPill /> : undefined}
              onPress={canCheckPhone ? () => setVerifyKind('phone') : undefined}
            />
          )}
          <ListRow icon="receipt-outline" tone="money" title="İşlem geçmişi" subtitle="Satın almalar ve iadeler" onPress={() => router.push('/cuzdan')} />
          {IS_DEMO && <ListRow icon="server-outline" tone="neutral" title="Sunucu hesabı" subtitle="Veritabanı bağlantısı ve test" onPress={() => router.push('/sunucu-hesabi')} />}
          {staff && (
            <ListRow
              icon="speedometer-outline"
              title="Yönetim"
              subtitle={staff === 'admin' ? 'Şikâyetler, yaptırımlar, para çekme, ajans ödemeleri ve iadeler' : 'Yaptırımlar ve itirazlar'}
              onPress={() => setAdminOpen(true)}
            />
          )}
        </ListGroup>

        {live ? (
          <LiveSessions />
        ) : (
          <ListGroup label="Aktif oturumlar" footer={DEMO_SESSIONS_FOOTER}>
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
        )}

        {/* The daily limit lives only on this phone. A live build does not offer it, but a limit saved here
            earlier is still applied to spending, so it stays on screen until it is lifted. */}
        {(!live || settings.dailySpendLimit > 0) && (
          <ListGroup
            label="Harcama"
            footer={
              live
                ? 'Bu limit yalnızca bu telefonda geçerli. Limitsiz seçersen kaldırılır.'
                : 'Limit dolduğunda hediye, mağaza ve oyun harcamaları gece yarısına kadar durdurulur. Limit artışı 24 saat sonra geçerli olur.'
            }
          >
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
        )}

        {live && (
          <>
            {/* Only this phone's Keşfet › Yakındaki list: it shows people whose profile city is mine. Nothing is
                sent to the server, so it does not promise who can find me. */}
            <ListGroup label="Keşfet">
              <Toggle k="cityDiscovery" icon="location-outline" title="Yakındakileri göster" subtitle="Keşfet'teki Yakındaki sekmesi, profilindeki şehre göre listelenir. Kesin konumun kullanılmaz." />
            </ListGroup>
          </>
        )}

        {/* Live: kept and enforced on the server, so the words say where each one acts there. Invisible entry and
            the win announcement stay demo only (PRIVACY_DEFAULTS). */}
        <ListGroup label="Gizlilik" footer={live ? 'Bu ayarlar hesabında saklanır; başka bir telefondan girişte de geçerlidir.' : undefined}>
          <PrivacyToggle
            k="profilePublic"
            icon="globe-outline"
            title="Profilim herkese açık"
            subtitle={live ? 'Kapalıyken yaşını, şehrini, hakkında yazını, ilgi alanlarını ve takip listelerini yalnızca takip ettiğin kişiler görür.' : undefined}
          />
          <PrivacyToggle k="showOnline" icon="radio-button-on-outline" title="Çevrimiçi durumumu göster" subtitle={live ? 'Kapalıyken çevrimiçi ve son görülme bilgin kimseye gösterilmez.' : undefined} />
          <PrivacyToggle k="showLastSeen" icon="time-outline" title="Son görülme bilgimi göster" subtitle="Kapatırsan başkalarının son görülmesini de göremezsin." />
          <PrivacyToggle
            k="showCurrentRoom"
            icon="mic-outline"
            title="Bulunduğum odayı profilimde göster"
            subtitle={live ? 'Kapalıyken bulunduğun oda başkalarına gösterilmez (Aile’deki “Birlikte oynuyor” dahil).' : "Kapalıyken profilinden odana 'Git' ile gelinemez."}
          />
          {!live && (
            <>
              <Toggle k="luckyAnnounce" icon="megaphone-outline" title="Kazançlarımda adım görünsün" subtitle="Uğurlu hediye ve oyun kazançları tüm odalarda duyurulur. Kapalıyken “Bir kullanıcı kazandı” yazar." />
              <Toggle k="cityDiscovery" icon="location-outline" title="Aynı şehirde keşfedilebilir ol" subtitle="Varsayılan kapalı. Kesin konum yerine sadece şehir kullanılır." />
              <Toggle
                k="invisibleEntry"
                icon="eye-off-outline"
                title="Odalara gizli giriş"
                subtitle="Rütbe: Albay ve üstü (Gizli oda girişi) · Moderasyon kayıtlarından gizlenmez."
                disabled={!GATES.invisibleEntry(nobleTier)}
              />
            </>
          )}
          {stalePrivacy && (
            <ListRow
              icon="refresh-outline"
              tone="neutral"
              title="Eski ayarları sıfırla"
              subtitle="Bu telefonda daha önce değiştirdiğin gizli giriş ve kazanç duyurusu ayarları varsayılana döner."
              onPress={resetPrivacy}
              chevron={false}
            />
          )}
        </ListGroup>

        <ListGroup
          label="Kimler ulaşabilir"
          footer={live ? 'Engellediğin kişiler bu seçimlerden bağımsız olarak sana ulaşamaz. Yazdığın kişi sana cevap yazabilir; son 24 saatte aradığın kişi seni geri arayabilir.' : undefined}
        >
          <ListBlock title="Bana kimler mesaj gönderebilir?">
            <ChoiceChips value={settings.dmFrom} options={Object.entries(DM_FROM_LABEL) as [DmFrom, string][]} onChange={(v) => setPrivacy('dmFrom', v)} />
          </ListBlock>
          <ListBlock title="Beni kimler arayabilir?">
            <Text style={styles.blockHint}>{live ? 'Sesli ve görüntülü aramalar; Hemen Tanış eşleşmeleri etkilenmez' : 'Ücretli sesli ve görüntülü aramalar'}</Text>
            <ChoiceChips value={settings.callsFrom} options={Object.entries(CALLS_FROM_LABEL) as [CallsFrom, string][]} onChange={(v) => setPrivacy('callsFrom', v)} />
          </ListBlock>
          <ListBlock title="Beni odalara kimler davet edebilir?">
            <ChoiceChips
              value={settings.invitesFrom}
              options={[
                ['everyone', 'Herkes'],
                ['following', 'Takip ettiklerim'],
                ['nobody', 'Kimse'],
              ]}
              onChange={(v) => setPrivacy('invitesFrom', v)}
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

        <ListGroup label="Görünüm ve erişilebilirlik" footer="Sistem, telefonunun açık veya koyu ayarını izler. Odalar, oyunlar ve aramalar her temada koyu kalır.">
          <AppearancePicker />
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
                  <Text style={[styles.chipText, styles.chipTextOn]}>Ertelemeyi kaldır</Text>
                </Pressable>
              )}
            </View>
          </ListBlock>
        </ListGroup>

        <ListGroup label="Destek">
          <ListRow icon="help-buoy-outline" title="Destek merkezi" subtitle={live ? 'SSS ve e-posta ile destek' : 'Taleplerin ve yanıtlar'} onPress={() => router.push('/destek')} />
          <ListRow
            icon="scale-outline"
            title="Bir karara itiraz et"
            subtitle="Moderasyon, kısıtlama, transfer veya oyun kararı"
            onPress={() => router.push({ pathname: '/destek', params: { kategori: 'Moderasyon kararı' } })}
          />
          <ListRow icon="document-text-outline" title="Kullanım Koşulları" onPress={() => openLegal('terms')} />
          <ListRow icon="shield-checkmark-outline" title="Gizlilik Politikası" onPress={() => openLegal('privacy')} />
          <ListRow icon="code-slash-outline" tone="neutral" title="Açık kaynak lisansları" subtitle="Uygulamada kullanılan kütüphaneler ve yazı tipi" onPress={() => setLicenses(true)} />
          {/* The version, and a newer build when one is out (lib/app-update): a tap downloads it. */}
          {update ? (
            <ListRow
              icon="cloud-download-outline"
              tone="success"
              title="Güncelleme mevcut"
              subtitle={`Yeni sürüm hazır (yapı ${update.build}) · indirmek için dokun · Bu cihazda ${versionLabel(APP_VERSION)}`}
              onPress={() => Linking.openURL(update.url).catch(() => {})}
            />
          ) : (
            <ListRow icon="information-circle-outline" tone="neutral" title="Uygulama sürümü" value={versionLabel(APP_VERSION)} />
          )}
        </ListGroup>

        <ListGroup
          footer={
            deletionRequested ? (
              <Text style={[styles.footnote, { color: semantic.moneyText }]}>
                Hesap silme talebin alındı. 30 gün içinde tamamlanacak; bu sürede giriş yaparak iptal edebilirsin. Yasal olarak saklanması gereken kayıtlar saklama süresi kadar tutulur.
              </Text>
            ) : undefined
          }
        >
          {live ? (
            // No export route on the server yet: the request goes to support as an e-mail from the person's mail app.
            <ListRow
              icon="download-outline"
              tone="neutral"
              title="Verilerimin kopyasını iste"
              subtitle="UK GDPR veri erişim talebi · destek ekibine e-postayla"
              onPress={() => openSupportMail(dataRequestMail(myServerId(), me.name))}
              chevron={false}
            />
          ) : (
            <ListRow icon="download-outline" tone="neutral" title="Verilerimin kopyasını iste" subtitle="UK GDPR kapsamında e-postana gönderilir" onPress={requestDataExport} chevron={false} />
          )}
          <ListRow
            icon="log-out-outline"
            tone="neutral"
            title="Çıkış yap"
            chevron={false}
            onPress={() =>
              confirmLogout(() => {
                logout();
                // Live mode: a Google account's session ends too, so the next sign-in picks an account again.
                if (liveMode()) void liveSignOut().catch(() => {});
              })
            }
          />
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
                // Live mode: deleted on the server right away (asked twice), then this phone starts over.
                liveMode()
                  ? confirmDeleteLiveAccount(resetAll)
                  : showAlert('Hesabı sil', 'Hesabın ve kişisel verilerin silinecek. Aktif abonelikleri mağazadan ayrıca iptal etmen gerekir. Devam edilsin mi?', [
                      { text: 'Vazgeç', style: 'cancel' },
                      { text: 'Silme talebi oluştur', style: 'destructive', onPress: requestDeletion },
                    ])
              }
            />
          )}
        </ListGroup>
      </ScrollView>
      <LicensesSheet visible={licenses} onClose={() => setLicenses(false)} />
      {liveMode() && <VerifySheet kind={verifyKind} onClose={() => setVerifyKind(null)} />}
      {staff && <AdminPanel visible={adminOpen} onClose={() => setAdminOpen(false)} moderator={staff === 'moderator'} />}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48, gap: 22 },
  blockHint: { color: colors.textDim, fontSize: 12, marginTop: -6 },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.success, marginRight: 4 },
  // Tinted with semantic.danger of each scheme.
  endBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,122,130,0.5)' : 'rgba(196,43,55,0.4)',
    backgroundColor: dark ? 'rgba(255,122,130,0.1)' : 'rgba(196,43,55,0.07)',
  },
  endText: { color: semantic.danger, fontWeight: '700', fontSize: 12 },
  snoozeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  // White on the turquoise fill in both schemes.
  chipTextOn: { color: '#fff' },
}));
