# Seviye ve VIP ayarları (tasarım)

Sahibin kararı (17 Kasım): VIP, Rütbe, Cömertlik, Yankı ve Abonelik'in bütün ayarları finans panelinden yapılır.
- Seviye eşikleri.
- Seviye adları.
- Hangi seviyede hangi hakkın açıldığı.
- Çerçeve ve giriş efekti.
- Seviye düşmesi.
- Abonelik paketleri.

Müşterinin sorusu: *"Bu seviyelere denk gelen çerçeve, giriş efekti ve diğer tüm özellikleri tasarlayıp değiştirebileceğimiz, seviyeler arasındaki atış miktarını belirleyebileceğimiz, hangi seviyede hangi ödülün açılacağını seçebileceğimiz ekran nerede?"* Sahibin eki: *"Yükleme yapmayanlar, yayıncıların çalışmalarının yavaşlaması durması gibi durumlarda bu seviyeler geriye doğru düşecek."*

Seviyeye bağlı eşya (bir seviyeye gelenin Çantam'ına düşen çerçeve, giriş efekti, binek, balon, dalga) ayrı sayfada: **Seviye ve VIP › Seviye ödülleri** ([`CANTA.md`](CANTA.md)).

## Bugün

Hepsi kodda sabit: eşikler hem uygulamada hem sunucuda var, testler ikisinin aynı kalmasını ister. Ad, renk, rozet ve hak listeleri yalnız APK'da. Panelde hiçbirinin ekranı yok. Seviye düşmesi yok. Ayrıntılı harita:

| Sistem | Puan | Eşik / fiyat (sunucu) | Uygulama |
|---|---|---|---|
| VIP | `users.svip_xp`: mağazadan alınan jeton (1 jeton = 1 puan); bonus, kampanya ve Jeton Noktası sayılmaz | `catalog.mjs` `SVIP_XP` (10 seviye) | `data/status.ts` `SVIP_LEVELS` |
| Rütbe | Satın alınır, 30 gün | `catalog.mjs` `SHOP_ROWS` noble-1..5 (fiyat, gün) | `status.ts` `NOBLE_TIERS` |
| Cömertlik | Harcanan jeton, defterden toplanır (sütun yok) | `profile-rules.mjs` `WEALTH_XP` (Lv.0–50) | `data/wealth.ts` |
| Yankı | Karşı taraftan gelen elmas, defterden toplanır | `profile-rules.mjs` `CHARM_XP` (Lv.0–50) | `data/charm.ts` |
| Abonelik | Mağaza aboneliği `vip_7d / 30d / 90d` | `catalog.mjs` `VIP_SUBS` | `status.ts` `VIP_PLANS` |

## Tasarım

### Panelde ne ayarlanır

| Sistem | Seviyeler | Haklar | Düşme |
|---|---|---|---|
| VIP | Seviye sayısı, her seviyenin puanı ve adı, çerçeve ve giriş efekti | Hangi hak hangi seviyede, açık / kapalı | Var |
| Rütbe | Kademe adı, fiyatı (jeton), süresi (gün), çerçeve ve giriş efekti | Aynı | Yok (süreyle biter) |
| Cömertlik | Her seviyenin puanı, grup adları | Aynı | Var |
| Yankı | Her seviyenin puanı, grup adları | Aynı | Var |
| Abonelik | Hangi paket görünür, etiketi ("En çok tercih edilen"), uygulamada yazan fiyat | Aynı | Yok (süreyle biter) |

Abonelikte **ödenen fiyatı mağaza belirler** (Play Console / App Store Connect). Panelden değişmez. Panelde yazan fiyat yalnız uygulamada gösterilir; mağazadakiyle aynı tutulmalı.

### Haklar kataloğu

Her hakkın bir anahtarı var ve iki durumdan biri: **hazır** (uygulama ve sunucu yapıyor) ya da **henüz yapılmadı**.
- Panel hazır olanları istediği seviyeye bağlar, açar, kapatır.
- Yapılmamış olan panelde görünür ama açılamaz. Her biri bir kez kodla yapılınca hazır olur.

Hazır olanlar (bugünkü yerleriyle):

| Anahtar | Hak | Bugün | Sunucuda denetlenir mi |
|---|---|---|---|
| `badge` | Seviye / VIP / Rütbe rozeti | her sistemde | gösterim |
| `frame` | Profil çerçevesi | VIP 1, Rütbe 1 | gösterim (görünüm `vipLevel`, `noble`) |
| `hide_levels` | Seviyeleri gizle | VIP 1, Rütbe 1, Abonelik | evet (`profiles.mjs`) |
| `room_password` | Oda şifresi / kilitleme | VIP 1, Rütbe 1 (ya da oda Lv.4) | evet (`rooms.mjs`) |
| `vip_store` | VIP mağaza eşyaları (kapı) | VIP 1; her eşyanın kendi VIP seviyesi de geçerli, burada seçilen en düşük sınırdır | evet (`economy.mjs`) |
| `vip_gifts` | Üyelere özel hediyeler (kapı) | VIP 1; her hediyenin kendi VIP seviyesi de geçerli (Hediyeler sayfası; uygulamanın kendi VIP hediyeleri VIP 2'den başlar), burada seçilen en düşük sınırdır | evet (`gifts.mjs`, `lucky-bags.mjs`) |
| `silent_visit` | Sessiz ziyaret | VIP 7 | evet (`social.mjs`) |
| `entry_greeting` | Giriş karşılaması | Rütbe 1 | gösterim |
| `visitors` | Profiline bakanları gör | Abonelik | evet (`social.mjs`) |
| `discover_boost` | Ana Sayfa'da öne çıkma | Yankı 1 | telefonda sıralama |
| `moments_post` | Anlar'da paylaşım (kapı) | Yankı 5 | evet (`moments.mjs`) |
| `casino` | Oyun Salonu erişimi (kapı) | Cömertlik 2 | evet (`wheel`, `casino`, `lucky`) |

**Kapı** olan haklar (Oyun Salonu, Anlar, VIP hediyeleri, VIP mağaza eşyaları) kapatılamaz; yalnız seviyesi değişir.

Henüz yapılmamış olanlar (#164'te gizlendi):
- Özel giriş duyurusu.
- Renkli sohbet balonu.
- Puanla alışveriş.
- Profil kartı çerçevesi.
- Hediye serisi efekti.
- Kendi unvanını yaz.
- Dolu odaya girme.
- Mesaj çevirisi.
- Kazanç bonusu (Yankı).
- Madalya.
- Mikrofon halkası.
- Binek.
- Seviye hediyesi.
- Odada ve platformda seviye duyurusu.
- Arama indirimi, günlük ücretsiz eşleşme, altın isim, Hoş Geldin Kutusu (Abonelik).

Bir hakkın seviyesi değişince sunucu da onu uygular. Örnek: sessiz ziyaret VIP 5'e çekilirse VIP 5 kişinin ziyareti görünmez olur. Kapatılan hak sunucuda da kapanır.

### Seviye düşmesi

VIP, Cömertlik ve Yankı için ayrı ayrı. **Başlangıçta kapalı**: siz açana kadar kimsenin seviyesi değişmez.

| Ayar | Anlamı | Örnek |
|---|---|---|
| Açık | Kural çalışıyor mu | kapalı |
| Hareketsizlik (gün) | Bu kadar gün hareket yoksa düşer | 30 |
| Kaç seviye | Her düşüşte kaç seviye | 1 |
| Ne sıklıkla (gün) | Hareketsizlik sürerken ne sıklıkla tekrar düşer | 30 |
| Taban | Bunun altına düşmez | 0 |

"Hareket" sistemlere göre şöyle:
- **VIP:** mağazadan jeton yüklemek.
- **Cömertlik:** sayılan bir harcama.
- **Yankı:** birinden hediye ya da ücretli arama geliri almak. Yayıncı çalışmayı bırakınca Yankı'sı düşer.

Nasıl işler:
- **Her gün bir kez:** Kuralı tutan kişinin puanı, düşeceği seviyenin eşiğine indirilir. VIP'te `svip_xp`; Cömertlik ve Yankı'da defter değişmez, kişiye bir "düşüş payı" yazılır.
- **Kayıt ve haber:** Her düşüş kaydedilir (`level_drops`: kim, hangi sistem, hangi seviyeden hangisine, puan önce/sonra). Kişiye bildirim gider, örnek: "30 gündür jeton yüklemediğin için VIP seviyen 5'ten 4'e düştü. Yükleme yapınca puanın yeniden artar."
- **Geri kazanma:** Yeni hareket puanı her zamanki gibi artırır.
- **Etkilenmeyenler:** Abonelik ve Rütbe süreyle biter, düşmeye girmez.
- **Panelde önizleme:** Kural açılmadan önce "bu kuralla bugün N kişi düşer" gösterilir.
- **Çifte düşme olmaz:** Her kişi düşürülmeden hemen önce yeniden okunur; arada yükleme, harcama ya da hediye geldiyse düşmez.
- **Test sunucusu:** Yönetici hesapları orada her seviyenin en üstünde görünür; düşmeye girmez.
- **Veri ve silme:** Kişinin düşüşleri "Verilerimin kopyası"nda yer alır; hesap silinince düşüş kayıtları da silinir.

**Hukuk ve mağaza:** Parayla kazanılan VIP düşebilecekse bu açıkça yazılmalı.
- Kural açıkken VIP ve Seviye sayfaları kuralı kendi cümlesiyle gösterir.
- Kullanım Koşulları'na genel bir madde eklenir.

### Telefonlar ve eski APK'lar

- **Yeni uygulama:** `GET /api/catalog?levels=1` ile bütün ayarları alır (`levels`). `/api/me` kişinin kendi seviyelerini sunucunun hesabıyla verir; telefon artık eşikleri kendi içinde hesaplamaz. Ayar değişince katalog sürümü (`v`) artar, telefonlar yeniden okur.
- **Eski APK'lar** ayarları istemez ve kendi içindeki eşiklerle gösterir. Eşik değişirse kişinin kendi telefonunda gördüğü seviye bir süre sunucununkinden farklı olabilir. Sunucunun denetimleri (hediye kilidi, sessiz ziyaret, Oyun Salonu, Anlar) herkes için yeni ayara göre çalışır.
  - Panel eşik değişirken bunu söyler.
  - Yeni APK yayıldıktan sonra Canlı ayarlar'daki "en düşük sürüm" yükseltilerek eski APK'lar güncellemeye yönlendirilir.
- **Rütbe fiyatı ve günü (para kuralı):** Kimse gördüğünden farklı bir fiyat ya da gün için ödemez.
  - Yeni uygulama gösterdiği fiyatı ve günü gönderir; biri değiştiyse `409 price_changed` döner (yenisi gelir), jeton düşmez.
  - Eski APK kendi içindeki kademeyi gösterir. Panelde adı, fiyatı ya da günü değişmiş kademeyi almak isteyince `update_required` alır ("uygulamayı güncelle"), jeton düşmez.
  - Başarılı bir alımın tekrarı (bağlantı koptu, telefon yeniden gönderdi) fiyat sonradan değişse de aynı alım sayılır, ikinci kez ödetmez.
- **Abonelik paketleri:** Panelde gizlenen paket yeni uygulamada görünmez. Eski APK kendi içindeki üç paketi göstermeye devam eder ve mağazadan alabilir; satışı gerçekten durdurmak için paket Play Console'da da kapatılmalı. Mağazada ödenmiş bir abonelik, paket gizli olsa da açılır (para alınmış).

### Para ve hukuk kuralları

- Düşme kuralı başlangıçta kapalı. Açılınca kişiye bildirim gider ve kural sayfada yazar.
- Abonelik ve Rütbe süresi dolmadan geri alınmaz.
- Panelden yapılan her değişiklik denetim kaydına yazılır (`audit_events`, önce / sonra).
- **Eşik yükseltilirse ve düşme kuralı kapalıysa:** Bugünkü seviyesi yeni eşiğin altında kalan kişinin seviyesi düşer. Panel kaydetmeden önce kaç kişinin etkileneceğini gösterir ve onay ister.

## Adımlar

1. **Sunucu ve panel (yeni APK gerekmez):** sunucu tarafı yapıldı (17 Kasım); panel sayfası panel deposunda.
   - Ayar tabloları, haklar kataloğu.
   - Sunucu denetimlerinin ayardan okunması.
   - Düşme işi (kapalı), önizleme, denetim kaydı.
   - Panelde **Seviyeler** sayfası: VIP, Rütbe, Cömertlik, Yankı, Abonelik sekmeleri.
2. **Uygulama (yeni APK):** yapıldı (17 Kasım).
   - Telefon ayarları katalogla birlikte okur (`levels=1`), telefonda saklar; bozuk bir bölümde o bölüm için uygulamanın kendi tablosunu kullanır.
   - Şunlar ayara uyar: VIP sayfası (seviye adları, puanları, hakları), Abonelik (görünen paketler, etiket, fiyat; üstü çizili fiyat 0 ise gösterilmez), Rütbe (ad, fiyat, gün, haklar), Seviye sayfası (puanlar, grup adları, haklar), seviye rozetleri, Oyun Salonu kilidi.
   - Panelde değişmiş bir Rütbe kademesi gösterilen fiyat ve günle alınır (`POST /api/shop/buy`); ret gelirse rütbe geri alınır ve sebebi yazılır.
   - Seviye düşmesi açıksa VIP ve Seviye sayfaları kuralı kendi cümlesiyle yazar; VIP kartında "kalıcı" yazmaz.
   - Yerelde gerçek sunucuyla denendi: "Er" kademesi 20.000 jeton / 15 gün yapıldı; telefon 20.000 jetonla aldı, sunucu 15 gün verdi.
   - VIP, Seviye, profil ve mağaza ekranları ayarları sunucudan okur.
   - Kişinin kendi seviyesi sunucudan gelir.
   - Düşme kuralı açıksa sayfalarda yazar.
   - Abonelikte mağazanın gerçek fiyatı gösterilir.
3. **Görseller:** Her seviyeye çerçeve ve giriş efekti panelden yüklenir (hediyelerdeki gibi: saydam PNG, video ya da SVGA). Telefonlar indirir. Yeni APK 2. adımla birlikte çıkar.
4. **Eksik haklar:** Sahibin seçtiği sırayla, her biri ayrı. Önerilen ilk dört: renkli sohbet balonu, profil kartı çerçevesi, kendi unvanını yaz, özel giriş duyurusu. Mesaj çevirisi ücretli bir çeviri servisi ister.

## Açık kararlar (varsayılanla)

| Konu | Varsayılan |
|---|---|
| Jeton Noktası'ndan alınan jeton VIP puanına sayılsın mı? | Hayır (bugünkü gibi); panelde ayar olarak eklenebilir |
| Düşüşte bildirim | Evet, uygulama içi bildirim |
| Düşme kuralı varsayılanı | Kapalı |
| Bugünkü değerler | Ayarlar bugünkü kodun değerleriyle başlar; hiçbir şey kendiliğinden değişmez |
