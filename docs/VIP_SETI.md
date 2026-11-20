# VIP seti (VIP 1–10 tasarım paketi)

Müşterinin paketi (20 Kasım): "vip 1-10lvl sistem". İçinde her VIP seviyesi için bir rozet, bir profil çerçevesi (durağan ve hareketli SVGA), bir sohbet balonu, bir kişi kartı tasarımı, bir giriş efekti (SVGA) ve giriş efektinin resmi var. Paketin "beni oku" dosyasındaki yerleşim böyle uygulandı:

| Paketteki | Nerede |
| --- | --- |
| VIP rozetleri | VIP sayfasında "VIP rozeti" kartı seçilen seviyenin rozetini gösterir. Profilde ve kişi kartında VIP 1–10 olan kişinin adının yanında eski "VIP n" yazısı yerine kendi seviyesinin rozeti çıkar. |
| Profil çerçeveleri | VIP sayfasında "Profil çerçevesi" kartı seçilen seviyenin çerçevesini gösterir. |
| Hareketli çerçeveler | Her seviyenin hareketli çerçevesi o seviyeye gelenin **Çantam**'ına gelir. |
| Sohbet balonu | VIP sayfasına "Sohbet balonu" kartı eklendi, seçilen seviyenin balonunu gösterir. Balon o seviyeye gelenin **Çantam**'ına gelir. |
| Kişi kartı | VIP 1–10 olan kişinin kartı kendi seviyesinin balon renkleriyle çizilir: içi balonun iç rengi (soldan sağa), kenarı balonun kenar rengi. Balonun konuşma ucu kullanılmadı. Çok açık iç renkler (ör. VIP 5'in altın sarısı) beyaz yazı okunsun diye aynı tonda koyulaştırıldı. |
| Giriş efekti | Her seviyenin giriş efekti o seviyeye gelenin **Çantam**'ına gelir. Odaya girenin adı efektin üst kısmında, yumuşak koyu bir bandın üstünde yazar. |
| Giriş efekti resimleri | VIP sayfasına "Giriş efekti" kartı eklendi, seçilen seviyenin resmini gösterir. Aynı resim mağazada efektin ikonu olarak da kullanılır. |

## VIP sayfası rozet renginde (20 Kasım, akşam)

Müşteri: "VIP rozetinin rengiyle ana ekranları eşleştirsin; VIP rozeti tabeladaki çerçevenin yerine gelsin; hepsi böyle eşleşsin."

- **Tabela (üstteki büyük kart):** her seviyede kendi rozetinin renginde (VIP 1–2–4–8 lacivert/mavi, 3 yeşil, 5–6–10 kırmızı, 7–9 mor). Kanatlı halka kalktı, yerine o seviyenin rozeti çıkar. Altın kenar ve altın dalgalar kaldı.
- **Sayfa zemini, hak kartları ve alttaki bilgi kutusu:** kaydırılan seviyenin rozet renginde; kartların kenarı o seviyenin kenar tonunda (VIP 1 gümüş, VIP 8 buz mavisi, diğerleri altın).
- Rozetler 192 piksel; tabelada büyütüldüğü için çok keskin ekranlarda hafif yumuşak görünebilir. Paketin büyük rozet dosyaları gelirse daha keskin yapılır.
- Eski APK'lar eski görünümü gösterir; yeni görünüm yeni APK ile gelir.
- Tabela resimleri `app/scripts/vip-hero-assets.py` ile üretildi (tasarımın VIP 1 tabelasından, halkasız, rozet rengine boyanmış).

## Çantam'a gelenler

- Sahibin kararı (20 Kasım): **süresiz**, **satışta değil**. Yalnız VIP ödülü olarak gelir.
- Her seviye için 3 eşya: çerçeve, balon, giriş efekti. Toplam 30 eşya. Adları "VIP 3 Çerçevesi", "VIP 3 Balonu", "VIP 3 Girişi" gibi.
- Her eşyanın bir **Seviye ödülü** var: VIP 3'e gelen 1, 2 ve 3'ün üçer eşyasını alır. Ödül kişinin Çantam'ı bir sonraki açılışında gelir. Seviyeyi zaten geçmiş olanlar da alır. SimilarClub Sistem haber verir.
- Sunucu bunları ilk açılışta **bir kez** ekler. Dosyalar depoya yüklenir, eşyalar mağazaya raftan kalkmış olarak girer.
- Panelde her şey görünür ve değişir:
  - **Hediye ve mağaza › Mağaza:** eşyaların adı, fiyatı, VIP seviyesi, satışta olup olmadığı. İsterseniz satışa açabilirsiniz; şu anki fiyat yer tutucu (1.000.000), açmadan önce fiyat yazın.
  - **Seviye ve VIP › Seviye ve görev ödülleri:** hangi seviyenin ne aldığı.
  - Panelden silinen ya da değiştirilen eşya bir daha eklenmez.

## Bilinmesi gerekenler

- **Eski APK'lar** yöneticinin eklediği çerçeve, balon ve giriş efektini çizemez. Ödül onların Çantam'ına da gelir ama görünmesi için yeni APK gerekir. VIP sayfasındaki yeni resimler, rozet ve kişi kartı renkleri de yeni APK ile gelir.
- Balonun ortası mesaja göre uzar, kenarlardaki süsler olduğu gibi kalır. VIP 10'un ortadaki tacı uzun mesajlarda biraz yayılır.
- VIP seviyesi 10'dan fazla yapılırsa üst seviyeler VIP 10'un resimlerini gösterir.
- Seviye düşmesi açılırsa daha önce gelen eşyalar Çantam'da kalır (bütün seviye ödüllerinde böyle).

## Teknik

- Sunucu: `server/api/vip-set.mjs`, `migrations/106_vip_set.sql`, dosyalar `server/api/vip-set/` (çerçeve: durağan PNG + hareketli WebP; giriş: yığılmış MP4 + ikon; balon: PNG; `manifest.json`: çerçevenin fotoğraf yeri, balonun köşeleri ve renkleri). Depo (S3) ayarlı değilse hiçbir şey eklenmez, sonraki açılış yeniden dener. Testlerde `VIP_SET=0`.
- Uygulama: `app/assets/vip/levels/`, `app/src/components/vip/level-art.ts`, `lib/vip-screen.ts` (`withSetRights`, `levelArtFor`), `components/vip/vip-rights.tsx`, `components/ui.tsx` `VipTitle`, `components/person-card-art.tsx` `CardPanel`.
- Dosyaları yeniden üretmek: SVGA'lar sunucunun kendi araçlarıyla çevrilir (`tools/svga-to-webp.py`, `tools/svga-to-fx.py --fill 1`), sonra `python app/scripts/vip-set-assets.py <paket> <çevrilenler>`. Ayrıntı betiğin başında.
- Test: `server/api/test/vip-set.test.mjs`, `app/tests/vip-screen.test.ts`.
