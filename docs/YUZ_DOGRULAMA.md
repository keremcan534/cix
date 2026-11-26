# Kimlik ve yüz doğrulaması

Sahiplerin isteği (26 Kasım 2026): "yüz doğrulamaya ihtiyacımız var". Kod: `server/api/verify.mjs`,
`server/api/verify-rules.mjs`, uygulamada `app/src/app/kimlik-dogrulama.tsx` (Ben › Kimlik Doğrulamam).

## Kısaca

İki ayrı doğrulama var, ikisini de bizim adımıza **Didit** yapıyor:

| | Kimlik doğrulaması | Gerçek kişi rozeti |
| --- | --- | --- |
| Ne yapılır | Kimlik kartı ya da pasaport fotoğrafı + kısa canlı selfie; yüz kimlikteki fotoğrafla karşılaştırılır | Kısa canlı selfie; yüz profil fotoğrafıyla karşılaştırılır |
| Kimden | Para çekenler: kadın yayıncılar, ajans sahipleri, 10+ üyeli aile sahipleri | İsteyen herkes |
| Ne sağlar | 18 yaş, kimlikteki cinsiyet ve ad, aynı kimliğin başka hesapta olmaması | Profilde mavi rozet (fotoğraf değişince düşer) |
| Zorunlu mu | Canlı ayarlar › Kimlik doğrulama › "Para çekmede kimlik şartı" **1** olunca (varsayılan 0) | Hayır |
| Fiyat (liste) | 0,33 USD | 0,15 USD |

**18+ yaş güvencesi için asıl yol bu değil:** Türkiye'de 1 Kasım 2026'dan beri sosyal ağlara **e-Devlet yaş doğrulama
belirteci** zorunlu (aşağıda "Hukuk"). Yüz doğrulaması onun yerini tutmaz. Belirtecin teknik kılavuzu yayımlanınca ayrıca
bağlanacak.

## Sahiplerin kararları (26 Kasım 2026)

- Para çekenlere zorunlu kimlik + canlı selfie (şart Canlı ayarlardan açılır).
- Mavi rozet isteğe bağlı, otomatik (sağlayıcı).
- Sağlayıcı: Didit. Aylık bütçe başlangıçta 100 USD (Canlı ayarlar › Kimlik doğrulama › "Aylık doğrulama bütçesi").
- Herkese kayıtta yüz taraması yok.

## Kişi ne görür

1. Ben › **Kimlik Doğrulamam** iki kart açar: Kimlik doğrulaması ve Gerçek kişi rozeti.
2. **Doğrula** dokunuşu önce aydınlatma metnini ve açık rıza kutusunu gösterir. Kutu boş başlar; işaretlenmeden devam
   edilmez. Metin sunucudan gelir ve sürümlüdür. Metin değişmişse sunucu eski onayı kabul etmez, kişi yenisini görür.
3. **Devam et**, Didit'in sayfasını telefonun tarayıcısında açar. Kişi kimliğini ve yüzünü çeker. Sayfa bitince
   uygulamaya döner (`similarclub://kimlik-dogrulama`); uygulama sonucu sunucudan sorar.
4. Sonuç kartta yazar: onaylandı, inceleniyor, tamamlanamadı (tekrar dene) ya da yarım kaldı.
5. **Rızamı geri al ve sil:** o türün bütün kayıtları silinir, sağlayıcıdaki kopya da hemen silinir. Rozet kalkar;
   şart açıksa para çekmek için yeniden doğrulamak gerekir.

Para çekme şartı açıkken doğrulanmamış biri Para Çek'te ve Gelir'de "Para çekmek için önce kimliğini doğrula" cümlesini
görür; yeni uygulamada cümle doğrulama ekranını açar.

## Ne saklanır, ne silinir

- **Bizde (tablo `identity_checks`):** yalnız sonuç. Hangi rıza metniyle, ne zaman, hangi IP'den açıldığı; durum.
  - Kimlik için ayrıca: kimlikteki ad soyad, cinsiyet, 18 yaşından büyük olup olmadığı, kimliği veren ülke.
  - Kimlik numarasının kendisi tutulmaz; ondan üretilen geri çevrilemez bir iz (HMAC) tutulur. Aynı kimlik ikinci bir
    hesapta kullanılırsa bu iz yakalar.
  - Rozet için: eşleşen profil fotoğrafının adresi.
  - **Fotoğraf, selfie, yüz şablonu ya da doğum tarihi tutulmaz.**
- **Didit'te:** görüntüler ve kimlik bilgisi. Karardan **30 gün sonra** sunucu Didit'teki kopyayı siler (itiraz için
  süre). Yarım kalan oturum 48 saatte kapanır; yerine yenisi açılınca eskisi hemen silinir.
- **Rıza geri alınınca:** kayıtlar hemen, Didit'teki kopya hemen. Didit'e o an ulaşılamazsa kişinin bilgileri yine
  hemen silinir; geriye yalnız Didit oturum numarası kalır, kopyanın silinmesi otomatik olarak tekrar denenir.
- **Hesap silinince:** kimlik bilgileri aynı anda boşaltılır; Didit'teki kopya ve satırlar birkaç saniye içinde
  silinir.
- **Yedekler:** gecelik veritabanı yedeğinde yalnız sonuç satırları var (görüntü yok). Silinen bir kayıt eski yedeklerde
  yedeklerin kendi saklama süresi boyunca kalır; bu gizlilik politikasında yazmalı.
- **Veri kopyası (Verilerimi indir):** kişinin kendi kayıtları, kimlikte okunan bilgilerle birlikte (`identityChecks`).
- Didit'e bizim kişi numaramız gitmez; hesaptan üretilen sabit bir işaret gider (`u-…`).

## İncelemeye düşenler ve yönetim

Didit onaylasa bile şu durumlarda sonuç "İncelemede" olur, para çekme açılmaz:

| Sebep | Ne demek |
| --- | --- |
| `under_18` | Kimliğe göre 18 yaşından küçük. **Alarm verir** (`verify_minor`): 18+ uygulamada hesap kapatılmalı. |
| `sex_mismatch` | Kimlikteki cinsiyet hesaptakiyle uyuşmuyor (kendini kadın seçen erkek hesap açığı). |
| `no_sex`, `no_age`, `no_name` | Kimlikte bu bilgi okunamadı. |
| `duplicate_document` | Aynı kimlik başka bir hesapta kullanılmış. |
| `duplicate_face` | Didit aynı yüzü başka bir doğrulamada görmüş. |
| `provider_review` | Didit'in kendi incelemesinde. |

Yönetim uçları (finans panelinden çağrılabilir, `PANEL_ROUTES`):

- `GET /api/admin/verify?status=review` — bekleyenler, kimlikte okunanlar, sebepler. Görüntülere Didit Business
  Console'dan, oturum numarasıyla bakılır.
- `POST /api/admin/verify/decide` — onay ya da ret.
- `POST /api/admin/verify/reset` — yeniden doğrulat; örneğin çalıntı fotoğraf şikâyetinde rozeti kaldırmak için.
- `POST /api/admin/verify/manual` — **yüz taramasız yol**. KVKK, rıza vermeyene ceza olmadan başka bir yol istiyor:
  personel kimliğe kendisi bakar (görüntülü görüşme, ofis) ve not yazar.

Her işlem `audit_events`'e önce/sonra haliyle yazılır. Yönetimin kararını Didit'ten sonra gelen bir güncelleme
değiştirmez.

**Panel sayfası yok (sahiplerin kararı, 26 Kasım 2026: "finans paneline gerek yok"):** görüntülere ve Didit'in kendi
incelemesine Didit Business Console'dan bakılır; orada verilen karar webhook'la buraya gelir. Bizim kurallarımızın
incelemeye düşürdüğü kayıtları (18 yaş altı, cinsiyet uyuşmazlığı, aynı kimlik, aynı yüz) Didit'ten karara bağlamak
mümkün değil: bunlar yönetim uçlarıyla kapanır. Elle doğrulama da öyle. Arayüz olmadığı için bu işleri istenince Claude
uçları çağırarak yapar. Çekim talebindeki ad uyuşması (`holderMatchesId`, `idName`) da panelde görünmez.

## Para çekme şartı

- Canlı ayarlar › Kimlik doğrulama › "Para çekmede kimlik şartı" **1**. Şart üç yere birden gelir: Para Çek, Jeton
  Noktası'na elmas bozdurma ve ajans ödemesi (ajans sahibinin kimliği).
- Didit anahtarları yoksa şart uygulanmaz (kimse doğrulayamazken herkesin parası kilitlenmesin).
- **Açmadan önce:** yeni APK dağıtılmalı ve Canlı ayarlar › Zorunlu sürüm yükseltilmeli. Eski uygulamada doğrulama
  ekranı yok; şart açılınca eski uygulamadaki yayıncılar para çekemez, yalnız "uygulamanı güncelle" cümlesini görür.
- Her çekim talebinde hesap sahibinin adı kimlikteki adla karşılaştırılır. Sonuç finans personeline gösterilir
  (`holderMatchesId`, `idName`); talep yine de alınır, ödemeyi personel onaylar.

## Kurulum (siz)

1. **Didit hesabı:** [business.didit.me](https://business.didit.me), şirket adına (SIMILARCLUB LTD).
   - **Veri işleme sözleşmesini (DPA)** isteyin ve imzalayın.
   - İşleme bölgesi **AB (İrlanda)**.
   - Saklama süresi en kısa: **1 ay**. Sunucu zaten 30 günde siliyor.
   - Yüz şablonu saklama (face retention) **kapalı** kalsın.
2. **İki iş akışı (Console › Workflows):**
   - **KYC Workflow:** kimlik + canlılık + yüz eşleşmesi; çift hesap (duplicate) kontrolü açık.
   - **Biometric Authentication Workflow:** canlılık + verilen fotoğrafla yüz eşleşmesi.
   - İkisinin kimliği (UUID) GitHub **değişkeni** olur: `DIDIT_KYC_WORKFLOW`, `DIDIT_FACE_WORKFLOW`.
3. **Webhook (Console › API & Webhooks):**
   - Adres `https://130-61-230-94.sslip.io/api/verify/webhook`. Alan adı gelince `https://<alan>/api/verify/webhook`.
   - Olay: `status.updated`.
   - Gösterilen gizli anahtar (secret) GitHub **sırrı** `DIDIT_WEBHOOK_SECRET` olur.
4. **API anahtarı:** GitHub **sırrı** `DIDIT_API_KEY`.
   - Ayrıca uzun, rastgele bir `VERIFY_HASH_KEY` sırrı: aynı kimliğin iki hesapta kullanılmasını yakalayan izin
     anahtarı. **Bir kez konur, sonra değiştirilmez.** Değişirse eski kayıtlarla karşılaştırma yapılamaz.
5. **Önce deneme:** Didit'in sandbox uygulamasının anahtarlarıyla test sunucusunda denenir (ücretsiz, günde 500
   oturum). Sonra canlı anahtarlar.
6. Actions › **Server** › Run workflow. Anahtarlar `.env`'e yazılır.

## Eski APK'lar

- Kendi profillerinde `verified` gelirse mavi rozeti gösterirler. Başkalarının rozetini göstermezler: o alanı yalnız
  yeni uygulama okur.
- Doğrulama yapamazlar. Şart açılırsa para çekemezler, sunucunun cümlesini görürler.
- Ben › Kimlik Doğrulamam eski uygulamada hâlâ eski yazıyı gösterir ("selfie doğrulaması yap"); sunucu değiştiremez.

## Hukuk (avukata gidecek)

- **Yüz eşleştirme biyometrik veridir:** KVKK m.6'da özel nitelikli, UK GDPR m.9'da özel kategori.
  - Dayanak açık rıza. Rıza ekranı kayıttaki genel onaydan ayrı.
  - Rıza vermeyene ceza olmadan alternatif yol var: elle doğrulama.
- **Metinler taslak:** rıza ve aydınlatma metni `server/api/verify-rules.mjs` `CONSENT`. Avukat onaylamalı; değişen
  metin yeni sürüm numarası alır.
- **Gerekenler:**
  - UK için veri koruma etki değerlendirmesi (DPIA).
  - Didit ile DPA.
  - Türkiye'den AB'ye aktarım için KVKK **standart sözleşmesi**: imzadan sonra 5 iş günü içinde Kurul'a bildirilir.
  - VERBİS kaydı ve Türkiye temsilcisi (yasal taslakta boş).
  - Gizlilik politikasında Didit'in veri işleyen olarak adı.
- **e-Devlet yaş doğrulaması:** 7578 sayılı Kanun, 5651 ek m.4. Yönetmelik 10 Ekim 2026, RG 33396; yürürlük 1 Kasım
  2026.
  - Hesap açılışında e-Devlet belirteci zorunlu, yetişkinler dahil.
  - Var olan hesaplar için son gün 31 Mart 2027.
  - Platforma yalnız 15/18 yaş eşiği bilgisi gelir.
  - Teknik kılavuz henüz yayımlanmamış görünüyor.
  - Yaptırımlar: ciro cezası, reklam yasağı, bant daraltma.
  - Similar Club'ın "sosyal ağ sağlayıcı" sayılıp sayılmadığını avukat teyit etmeli.
  - Bu bilgi hukuk bürolarının özetlerinden alındı, Resmî Gazete metni okunmadı.
- **Rıza geri alınınca silme:** sonuç da silinir. Dolandırıcılığa karşı aynı kimlik izinin bir süre tutulması gerekip
  gerekmediği avukatın sorusu.
- **Mağaza:**
  - Google Play Veri güvenliği formunda kimlik belgesi bilgisi, fotoğraf/selfie ve Didit'le paylaşım beyan edilir.
  - Toplamadan önce uygulama içinde belirgin açıklama gerekir: rıza ekranı bu işi görür.

## Kalanlar

- **Sahiplerin kararı bekleniyor (27 Kasım 2026, "bu pahalı, ücretsiz lazım"):**
  - **1. yol (öneri):** Didit yalnız aylık ücretsiz krediyle (10 USD, iş e-postasıyla açılan hesapta). Ayda yaklaşık 30
    kimlik ya da 65 rozet eder. Canlı ayarlar › Kimlik doğrulama › Aylık bütçe 10 yapılır; kredi bitince o ay yeni
    doğrulama açılmaz.
  - **2. yol:** tamamen ücretsiz, ekibin baktığı doğrulama. Kişi kimlik fotoğrafı ve kimlikle selfie (rozet için pozlu
    selfie) yükler, yönetici bakar. Uygulamada yöneticilere bir inceleme ekranı gerekir. Kimlik fotoğraflarını biz
    saklarız (30 gün).
  - Didit anahtarları GitHub'a henüz girilmedi; doğrulama kapalı.
- e-Devlet yaş belirteci: kılavuz çıkınca.
- Hemen Tanış (yabancıyla görüntülü) için rozet şartı ya da öne çıkarma: sahiplerin kararı.
- Telefonda denenmeli: Didit sayfasının Android tarayıcıda kamerayı açması ve uygulamaya dönüş.
