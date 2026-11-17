# Kimlik numarası (kişinin ve odanın ID'si)

Her hesabın kendi **ID'si** var: 12 haneli, sunucunun verdiği, hiç değişmeyen ve başka kimsede olmayan bir numara.
Profilde "ID:…" olarak görünür. **Odanın ID'si, sahibinin ID'sidir.** Oda her açıldığında yeniden kurulsa da ID'si
aynı kalır. Kişiyi ya da odasını bulmak için artık sunucunun hesap kimliği (uuid, "Sunucu hesabı") gerekmez.

## Neden

Önceden ID'yi telefon, hesap kimliğinden hesaplıyordu:

- Numara eşsiz değildi. Yaklaşık bir milyon farklı değer vardı, ilk çakışma birkaç bin hesapta çıkar.
- Sunucu bu numarayla kimseyi bulamıyordu.
- Odanın 8 haneli ID'si her açılışta değişiyordu.

Yetkililer de bu yüzden kişiyi uzun hesap kimliğiyle arıyordu.

## Nasıl çalışır

- `server/api/migrations/082_public_numbers.sql`: `users.public_no`, eşsiz ve değişmez.
  - **Var olan hesaplar** eski uygulamanın gösterdiği numarayı korur. İki hesap aynı numaraya düştüyse numara en eski
    hesapta kalır, öbürü boş bir numara alır.
  - **Yeni hesaplar** kayıtta numarasını alır. Eski uygulamanın hesapladığı numara boşsa o verilir, doluysa rastgele boş
    bir numara.
- **Biçim:** 100000000000 + 7919 × k (10[0-7] ile başlar). İletişim filtresi kullanıcı ID'sini bu biçimden tanır
  (`contact-filter.mjs` `userId`). Bu yüzden mesajda paylaşılan bir ID engellenmez, ID'ye benzeyen bir telefon numarası
  engellenir.
- **Silinen hesabın numarası** kimseye verilmez. Aramada silinen hesap bulunmaz.
- **Özel ID** (mağazadaki "ID 777"): profilde özel ID görünür. Kişi onunla da bulunur.

## Nerede kullanılır

| Yer | Ne yapar |
| --- | --- |
| Uygulama: profil, oda kartı, oda paylaşımı, PK | Sunucunun verdiği ID'yi gösterir; odada sahibinin ID'sini. |
| Uygulama: oda araması | Listede olmayan bir numara yazılırsa sunucuya sorulur. Oda açıksa odaya, kapalıysa kişinin profiline gider. |
| Uygulama: ajans daveti, odalar arası PK araması | ID ile kişi ya da oda bulunur. |
| Uygulama Yönetim'i: Kullanıcılar, Yaptırımlar, İadeler, Ajans merkezi | Kişi ID'siyle aranır. Kullanıcılar ve Yaptırımlar'da kapanmış bir odanın eski 8 haneli ID'si de sahibini bulur; bu, eski APK'dan gelen şikâyetler için. Yaptırımlar silinmiş hesabı da bulur. İadeler'de yalnız 12 haneli ID kişinin alımlarını getirir; kısa sayılar alım numarasıdır. |
| Finans paneli: hesap alanları | Ajans yayıncısı ve yöneticisi, BD, personel, Jeton Noktası, cüzdan denetimi, duyuru hedefi ve yaptırım yetkileri, uuid yerine kişinin ID'sini alır. Toptan jeton satışı, jetonlar geçmeden önce kişinin adını ve ID'sini gösterir. |
| GitHub Actions › **Yetki ver** | Kişinin ID'siyle (ya da hesap kimliğiyle) yetki verilir. |

## Uç noktalar (`server/api/public-no.mjs`)

- `GET /api/lookup?no=` (giriş yapmış herkes):
  - Bulur: kişinin 12 haneli ID'si, sahip olduğu özel ID ya da açık bir odanın eski 8 haneli ID'si.
  - Döner: `{user: {id, name, avatarUrl, publicNo}, room: {id, title, code} | null}`. Oda açıksa `room` dolu gelir.
  - 404: o numarada kimse yoksa ya da o kişi seni engellediyse.
  - Dakikada en çok 30 arama.
- `GET /api/admin/lookup?no=` (yönetici ve panel):
  - Aynı arama, engel kuralı yok.
  - Döner: `{user: {id, name, username, publicNo, role}, room}`.
  - Panelde hesap alanı olan her sayfanın yetkisiyle açılır.
- Cevaplardaki yeni alanlar:
  - Profil cevaplarında (`/api/me`, `/api/user`, listeler) `publicNo`.
  - Oda cevaplarında `code` (sahibinin numarası) ve `owner.publicNo`.

## Eski APK'lar

- Eski uygulama ID'yi kendisi hesaplamaya devam eder. Var olan hesapların neredeyse hepsinde bu, sunucunun numarasıyla
  aynıdır. Fark yalnız çakışan hesaplarda ve aynı numaraya düşen yeni hesaplarda görülür. Yeni APK hepsinde doğru
  numarayı gösterir.
- Eski uygulama odanın ID'sini yine 8 haneli gösterir ve bu ID her açılışta değişir. Sunucu açık odaları bu eski ID'yle
  de bulur. Yeni APK sahibin numarasını gösterir.
- Eski uygulamada ID ile oda aramak yalnız listedeki odalarda çalışır (önceden de böyleydi).

## Sınır

Bu biçimde yaklaşık **1.010.000 hesaplık** yer var. Hesap sayısı 900 bine yaklaşmadan önce biçim genişletilmeli. Bunun
için iletişim filtresinin kullanıcı ID'si kuralı da birlikte değişmeli. Değişmezse daha uzun ID'ler mesajlarda
telefon numarası sayılıp engellenir.
