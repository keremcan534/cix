# Kullanıcı Profili: Gereksinim Karşılaştırması

Kaynak: *Similarclup – Kullanıcı Profili Alanları ve Yazılım Güncelleme Gereksinimleri*. Bu belgede her madde mevcut yazılımla karşılaştırıldı. Eksikler bu güncellemede geliştirildi.

## Durum kodları

| Kod | Anlamı |
|---|---|
| **1** | Mevcut ve çalışır durumda (sunucu gerektirmeyen, tamamen istemci tarafı) |
| **2** | Arayüzü mevcut, sunucu entegrasyonu eksik |
| **3** | Geliştirilmesi gerekiyor |
| **4** | Ürün kararı bekliyor |

> **Önemli:** Uygulama şu an bir **prototip**. Henüz sunucu ve veritabanı yok, veriler cihazda tutuluyor (AsyncStorage). Bu yüzden ekranda çalışan özelliklerin neredeyse tamamı **2** durumunda: arayüz ve kurallar hazır, sunucu tarafı yazılmadı. "Bu güncellemede" sütunu, maddenin bu çalışmada mı eklendiğini (🆕) yoksa önceden mi var olduğunu (✓) gösterir.

Ekran adları: **Profil** = `src/app/kullanici/[id].tsx`, **Ayarlar** = `src/app/ayarlar.tsx`.

## 2-A. Temel profil bilgileri

| Madde | Durum | Bu güncellemede | Nerede / not |
|---|---|---|---|
| Profil fotoğrafı | 2 | 🆕 değiştirme | Kendi profilinde avatara dokun veya *Profili düzenle → Fotoğrafı değiştir*. Yeni fotoğraf önce incelemeye düşer ("İncelemede"); onaylanana kadar başkaları eski fotoğrafı görür. |
| Kullanıcı adı (@handle) | 2 | 🆕 | Benzersiz; 3–20 karakter, harfle başlar, a-z 0-9 . _ kullanılır. Ayrılmış adlar (admin, destek, similarclub…) ve alınmış adlar reddedilir. Kopyalanabilir. |
| Benzersiz kullanıcı ID'si | 2 | ✓ | 12 haneli, değiştirilemez, kopyalanabilir. ID'yi sunucu üretmeli. |
| Görünen ad / takma ad | 2 | ✓ (kurallar 🆕) | En fazla 20 karakter, küfür filtresi. |
| Doğum tarihi / yaş | 2 | 🆕 tarih düzenleme | GG.AA.YYYY olarak girilir, 18 yaş altı reddedilir. Doğum tarihini yalnızca sahibi görür, diğerleri sadece yaşı görür. Not: kayıt ekranı şu an sadece doğum yılını soruyor. |
| Cinsiyet (isteğe bağlı) | 2 | 🆕 gizleme, 🆕 görünürlük | Kadın / Erkek / Belirtmek istemiyorum. Rozette simge, cinsiyet ve yaş yazar (örn. "♂ Erkek · 24"); ayrıca *Temel Bilgiler → Cinsiyet*. Gizlenirse başkaları rozette sadece yaşı görür, satır gösterilmez. Sahibi kendi cinsiyetini soluk ve göz kapalı simgesiyle görür. Profil sekmesinde de rozet var. |
| Ülke | 2 | 🆕 | Bayrak ve ülke adı gösterilir (önceden her profilde sabit TR yazıyordu). Keşfet'teki ülke filtresi de bu alanı kullanıyor. |
| Şehir (isteğe bağlı) | 2 | ✓ (boş bırakma 🆕) | Boş bırakılırsa profilde gösterilmez. Mesafe yalnızca "Aynı şehirde keşfedilebilir ol" açıkken görünür. |
| Biyografi | 2 | ✓ (kurallar 🆕) | 150 karakter (önceden 80). Küfür, telefon, IBAN, bağlantı ve başka uygulama hesabı engellenir. |
| Profil oluşturulma tarihi | 2 | 🆕 | *Temel Bilgiler → Üyelik: Eylül 2026*. Sadece ay ve yıl gösterilir, güven işareti olarak işe yarar. |

## 2-B. Kullanıcı durumu

| Madde | Durum | Bu güncellemede | Nerede / not |
|---|---|---|---|
| Çevrimiçi / çevrimdışı | 2 | ✓ (gizlilik 🆕) | Kullanıcı gizlediyse profilde "Durum gizli" yazar. |
| Son görülme | 2 | 🆕 | Örnek: "Son görülme Dün 23:40". Kendi son görülmesini kapatan kişi başkalarınınkini de göremez. |
| Meşgul / görüşmede | 2 | ✓ | "Şu an sesli/görüntülü görüşmede". Görüşmeye katılınamaz. |
| Mevcut bir odada mı | 2 | ✓ | "Şu an odada: … · Git" (şifreli odada şifre sorulur). |
| Oda bilgisini gizleme | 2 | 🆕 | *Ayarlar → Bulunduğum odayı profilimde göster*. Kapalıysa profilde oda kartı ve "Git" görünmez. |

## 2-C. Sosyal bilgiler

| Madde | Durum | Bu güncellemede | Nerede / not |
|---|---|---|---|
| Takipçi / takip sayısı | 2 | ✓ | Diğer kullanıcılarda sayılar örnek veri. |
| Arkadaş sayısı | 2 | 🆕 | Arkadaş = karşılıklı takip. Ayrı bir istek sistemi için 3. bölümdeki ürün kararına bak. |
| Profil ziyaretçileri | 2 | ✓ | *Mesajlar → Profilimi kimler ziyaret etti* (VIP ayrıcalığı). |
| Katıldığı odalar / topluluklar | 2 | ✓ (ajans 🆕) | Profilde *Oda*, *Ajans* ve *Kabile* kartları; ajans ve kabile adı ayrıca adın altında küçük etiket olarak görünür (Profil sekmesinde de). Ajans herkese açık, odadaki ajans etiketi gibi; başkalarına yalnızca "Ajans sahibi" veya "Ajans yayıncısı" yazar, kazanç gösterilmez. Kapanmış ajans gösterilmez. Ajansı veya kabilesi olmayan kişide etiket çıkmaz, kartta "Ajansı yok" / "Kabilesi yok" yazar; sahibine "Katıl" önerilir. Etikete dokununca açılan sayfa o ajansı/kabileyi gösteriyorsa bağlantı vardır. |
| Rozetler ve başarılar | 2 | ✓ | *Onur* sekmesi: madalyalar, unvanlar, hediye duvarı, koleksiyonlar. |

## 2-D. Görseller ve kişiselleştirme

| Madde | Durum | Bu güncellemede | Nerede / not |
|---|---|---|---|
| Fotoğraf ekleme / değiştirme | 2 | 🆕 | Yukarıdaki profil fotoğrafı maddesine bak. |
| Fotoğraf albümü | 2 | 🆕 yükleme | *Albüm*: en fazla 6 fotoğraf eklenip kaldırılabilir, paylaşılan anlardaki fotoğraflar da burada görünür. |
| Profil çerçevesi | 2 | ✓ | Mağazadan alınan, hareketli çerçeveler dahil. |
| Seviye ve seviye görseli | 2 | ✓ | Servet ve çekicilik seviye rozetleri. |
| Özel unvan / rozet | 2 | ✓ | VIP unvanı, *Onur* sekmesindeki unvanlar. |
| Profil teması | **4** | — | Ürün kararı gerekiyor: temalar ücretli mi olacak (mağaza/VIP), yoksa herkese açık mı? Karar verilince kapak rengi ve arka plan teması eklenebilir. |

## 2-E. Uygulama içi değerler ve ekonomi

| Madde | Durum | Bu güncellemede | Nerede / not |
|---|---|---|---|
| Jeton / elmas bakiyesi (yalnızca sahibine) | 2 | 🆕 profilde | Kendi profilinde kilitli **"Yalnızca sen görürsün"** kartı: jeton, elmas, VIP. Başkasının profilinde hiçbir bakiye görünmez. |
| Kullanıcı seviyesi | 2 | ✓ | |
| Toplam XP | 2 | 🆕 profilde | Servet XP (geçerli harcama) ve Çekicilik XP (alınan elmas) gösteriliyor; ayrıntısı *Kullanıcı Seviyesi* ekranında. |
| Hediye gönderme / alma istatistiği | 2 | 🆕 sahibine | "X gönderdin, Y aldın". Başkalarına sadece alınan hediye sayısı (*Hediye*) görünür. |
| VIP durumu | 2 | ✓ | VIP rozeti herkese görünür. |
| VIP bitiş tarihi (yalnızca sahibine) | 2 | 🆕 | Özel kartta "VIP bitişi: GG.AA.YYYY". |

## 3. Profil üzerinden yapılabilecek işlemler

### Profil sahibi

| İşlem | Durum | Bu güncellemede | Not |
|---|---|---|---|
| Profil bilgilerini düzenleme | 2 | 🆕 genişletildi | Ad, kullanıcı adı, biyografi, doğum tarihi, cinsiyet, ülke, şehir, ilgi alanları. Hatalar alanın altında gösterilir, başarılı kayıtta "Profil güncellendi" bildirimi çıkar. |
| Fotoğraf değiştirme | 2 | 🆕 | İnceleme akışıyla. |
| Biyografi ve kişisel bilgiler | 2 | ✓ | |
| Gizlilik ve görünürlük | 2 | 🆕 genişletildi | Ayarlar → Gizlilik: çevrimiçi, son görülme, bulunduğum oda, mesaj izni, arama izni, oda daveti izni, şehir keşfi. |
| Engellenenleri görüntüleme | 2 | 🆕 | Ayarlar → **Engellenenler** listesi; buradan engel kaldırılabilir. |
| Bildirim ve iletişim tercihleri | 2 | ✓ | Ayarlar → Bildirimler. |

### Diğer kullanıcılar

| İşlem | Durum | Bu güncellemede | Not |
|---|---|---|---|
| Mesaj gönderme | 2 | ✓ (izin kontrolü 🆕) | |
| Takip / takipten çıkma | 2 | ✓ | |
| Arkadaşlık isteği | **4** | — | Ürün kararı gerekiyor: şu an arkadaşlık = karşılıklı takip. Ayrı bir istek/kabul sistemi isteniyor mu? |
| Ücretli sesli arama | 2 | ✓ (fiyat gösterimi 🆕) | Arama menüsünde dakika ücreti artık her iki arama türü için yazıyor. |
| Ücretli görüntülü arama | 2 | ✓ | |
| Odaya davet | 2 | 🆕 | ⋯ menüsü → **Odama davet et**. |
| Hediye gönderme | 2 | ✓ | |
| Engelleme / şikâyet | 2 | ✓ (kayıt 🆕) | |

**Kontroller (🆕):** Tüm işlemler tek bir kural fonksiyonundan geçiyor (`src/lib/interaction.ts`). Kontrol sırası:
1. Kendi profilin mi?
2. Kişiyi engelledin mi?
3. Hesap durumu (askıda / kısıtlı)
4. 18 yaş kontrolü
5. Karşı tarafın gizlilik tercihi

İzin verilmeyen buton soluk görünür; dokununca nedeni yazar. Arama ekranı da bu kontrolü tekrar yapar, böylece sohbet ekranından veya arama geçmişinden başlatılan aramalar da engele takılır.

Denemek için demo kullanıcılar:
- **Zeynep:** sadece takip ettiklerinden mesaj ve arama alıyor
- **Burak:** arama kabul etmiyor
- **Kaan:** hesabı geçici olarak kısıtlı
- **Deniz:** çevrimiçi durumunu ve odasını gizliyor
- **Melis:** sadece takip ettiklerinden oda daveti alıyor

## 4. Rozet, seviye ve kimlik

| Madde | Durum | Bu güncellemede | Not |
|---|---|---|---|
| Kullanıcı seviyesi | 2 | ✓ | |
| VIP rozeti | 2 | ✓ | |
| Özel rozetler | 2 | ✓ | |
| Başarı rozetleri | 2 | ✓ | |
| Yönetici / moderatör rozeti | 2 | 🆕 | "Yönetici" (kırmızı) ve "Moderatör" (mavi) rozetleri yalnızca rol atamasından gelir (`staffBadgeOf`, rol ve yetki merkezi). Kullanıcı bunları değiştiremez. Not: demo hesabı Super Admin rolünde olduğu için demo profilinde "Yönetici" rozeti görünür. |
| Benzersiz ID | 2 | ✓ | |
| Kullanıcı adı / ID kopyalama | 1 | 🆕 kullanıcı adı | Panoya kopyalama tamamen istemci tarafında çalışır. |

## 5. Gizlilik ve güvenlik

| Madde | Durum | Bu güncellemede | Not |
|---|---|---|---|
| Çevrimiçi ve son görülmeyi gizleme | 2 | 🆕 son görülme | |
| Kimin mesaj atabileceği | 2 | 🆕 | Herkes / Takip ettiklerim / Karşılıklı takip. |
| Kimin arayabileceği (ücretli sesli/görüntülü) | 2 | 🆕 | Herkes / Takip ettiklerim / Kimse. |
| Engellenen engeli aşamaz | 2 | 🆕 genişletildi | Mesaj, sesli/görüntülü arama, hediye ve oda daveti aynı kontrolden geçer. Arama ekranı da kontrol ediyor. |
| Doğum tarihi gizli, yalnızca yaş | 2 | ✓ | |
| Fotoğraf ve biyografi denetimi | 2 | 🆕 | Biyografi ve ad: küfür sözlüğü ve iletişim bilgisi filtresi (`src/lib/profile-rules.ts`). Fotoğraf: onaylanana kadar yalnızca sahibine görünür. Gerçek görsel denetimi sunucuda yapılmalı (aşağıya bak). |
| Şikâyet ve engellemenin kaydı | 2 | 🆕 | Ayarlar → **Güvenlik kayıtları**: engelleme, engel kaldırma, şikâyet, veri talebi ve fotoğraf incelemesi tarih ve saatiyle tutulur. Şikâyetler ayrıca destek talebi açar. |
| Hesap silme ve kişisel veri yönetimi | 2 | ✓ (veri dökümü 🆕) | Hesabı sil (30 gün bekleme süresi) ve **Verilerimin kopyasını iste (KVKK md. 11)**. |

## 6. Sunucu ve veritabanı gereksinimleri

Bu bölümün tamamı **3: Geliştirilmesi gerekiyor**, çünkü projede henüz sunucu yok. Önerilen yapı (Supabase Postgres, Frankfurt):

```
users                -- kimlik, değişmez
  id            bigint primary key       -- 12 haneli, sunucu üretir, asla değişmez
  created_at    timestamptz not null
  status        text check (status in ('active','restricted','suspended','deleted'))

profiles             -- herkese açılabilen alanlar
  user_id       bigint primary key references users(id)
  username      citext unique not null   -- değişim sınırı: 30 günde 1
  display_name  text not null
  bio           text
  birth_date    date not null            -- istemciye sadece sahibine döner; diğerlerine yaş
  gender        text, show_gender boolean default true
  country       char(2), city text
  avatar_url    text, avatar_pending_url text   -- denetimden geçene kadar pending
  interests     text[]
  updated_at    timestamptz

profile_photos       (id, user_id, url, status pending|approved|rejected, created_at)
privacy_settings     (user_id, show_online, show_last_seen, show_current_room,
                      dm_from, calls_from, invites_from, profile_public)
presence             (user_id, online, last_seen_at, room_id, in_call)   -- gerçek zamanlı servis
follows              (follower_id, followee_id, created_at)              -- arkadaş = karşılıklı
blocks               (blocker_id, blocked_id, created_at)
reports              (id, reporter_id, target_id, reason, context, status, created_at)
safety_audit         (id, actor_id, action, target_id, detail, created_at)  -- sadece ekleme, silme yok
user_badges          (user_id, badge_id, granted_by, created_at)          -- yetkili sistem yazar
user_roles           -- mevcut rol ve yetki merkezi (data/rbac.ts) ile aynı model

-- finans ayrı şemada, profil uç noktalarından erişilemez:
wallets              (user_id, coins, diamonds)                   -- yalnızca hareketlerle değişir
wallet_transactions  (id, user_id, currency, amount, reason, ref, created_at)
subscriptions        (user_id, kind vip|noble, level, ends_at)
```

Kurallar:

1. **Tek kural kaynağı:** `profile-rules.ts` ve `interaction.ts` içindeki kurallar sunucuda da aynen uygulanmalı (paylaşılan paket veya Postgres fonksiyonu). İstemcideki kontrol yalnızca hatayı önceden göstermek için var.
2. **Profil güncelleme uç noktası:** `PATCH /me/profile` yalnızca izin verilen alanları kabul eder. Seviye, VIP, rozet, bakiye ve rol alanları istekte gelse bile yok sayılır, bunlar sadece yetkili servislerce yazılır. Başarıda güncel profil, hatada alan bazlı hata listesi döner.
3. **Profil okuma uç noktası:** `GET /users/:id` görüntüleyene göre alan süzer. Doğum tarihi, bakiye, VIP bitişi ve son görülme kurallara göre çıkarılır. Engelli ilişkide profil kısıtlı döner.
4. **Etkileşim kontrolü:** Mesaj, arama kurulumu, hediye ve davet uç noktalarının her biri `can_interact(actor, target, action)` çağırır. Ücretli arama başlamadan önce kontrol edilir; reddedilen işlemde jeton düşülmez.
5. **Denetim:** Ad ve biyografi metin denetiminden geçer. Fotoğraflar görsel denetim servisinden (çıplaklık, şiddet, reşit olmayan) geçmeden `approved` olmaz. Reddedilen içerik kullanıcıya gerekçesiyle bildirilir.
6. **Kayıt:** Engelleme, şikâyet, rol ve rozet atamaları `safety_audit` / `audit` tablolarına yazılır. Kayıtlar silinmez, düzeltme yeni kayıt olarak eklenir.
7. **KVKK:** Veri dökümü talebi 30 gün içinde e-postayla yanıtlanır. Hesap silme 30 gün sonra kalıcı olur; yasal saklama süresi olan finansal kayıtlar anonimleştirilerek tutulur.

## 7. Öncelik durumu

| Aşama | İçerik | Prototip durumu |
|---|---|---|
| 1 – Zorunlu | Fotoğraf, kullanıcı adı, ID, biyografi, temel bilgiler; çevrimiçi durum ve gizlilik; mesaj, ücretli arama, hediye; engelleme ve şikâyet; seviye ve VIP | Arayüzü ve kuralları tamam (**2**). Sunucu yazılmalı. |
| 2 – Sosyal | Takipçi/takip, rozetler, çerçeve, ziyaretçiler | Arayüzü tamam (**2**). |
| 3 – Gelişmiş | Albüm, özel unvan, ayrıntılı istatistik | Arayüzü tamam (**2**). |
| 3 – Gelişmiş | Profil temaları | **4**: ücretli mi ücretsiz mi kararı bekliyor. |

## Ürün kararı bekleyen konular

1. **Arkadaşlık isteği:** Arkadaşlık karşılıklı takip olarak mı kalsın, yoksa ayrı bir istek/kabul sistemi mi kurulsun?
2. **Profil temaları:** Mağazada satılan bir ürün mü olsun, VIP ayrıcalığı mı, yoksa herkese ücretsiz mi?
3. **Kullanıcı adı değiştirme sıklığı:** Önerimiz 30 günde 1. Eski ad 14 gün başkasına verilmeyerek taklit önlenebilir.
4. **Son görülme hassasiyeti:** Tam saat mi gösterilsin, yoksa "bugün / bu hafta" gibi yaklaşık mı? Yaklaşık gösterim takibi zorlaştırır.
