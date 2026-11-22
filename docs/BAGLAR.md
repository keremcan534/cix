# Bağlar

İki kişinin karşılıklı kabul ettiği bağ: Çift, Kardeş, Bacı, Ağabey, Abla, Yenge, Enişte, Kanka. Profilin **Bağlar** sekmesinde görünür.

Sekmede iki bölüm var: **Çift** ve **Aile ve Dost** (diğer yedi tür). Aile ve Dost boşken yedi tür resmi ve fiyatıyla görünür; başkasının profilinde birine dokununca fiyat bir kez sorulur ve istek gider. Doluyken bağların üstünde türlerin adları yazar. Sohbetteki **kalp** başka bir şeydir: iki kişinin yakınlığı, hediye ve sohbetle dolar, sessiz kalınca düşer (`one-on-one.mjs`, [`SUNUCU.md`](SUNUCU.md)).

Odadaki hediye panelinde **Aile ve Dost** rafı var: Koruma Kartı ve sekiz bağ hediyesi (20 Kasım 2026'dan beri Bağ Yüzüğü de; aşağıda **Bağ Yüzüğü rafta**). Bu raftan gönderilen bağ hediyesi, aranızda bağ yoksa bağ isteğidir: jeton bekletilir, kabul edilince bağ kurulur, reddedilirse geri döner; tek kişiye, birer birer gider. Aranızda **o türde bir bağ varsa** normal hediye olarak gider (aşağıda **Bağ hediyesi yeniden**). Panelde Hediyeler › Aile ve Dost rafından adı, ikonu, videosu ve fiyatı değişir (aşağıda **Fiyat panelden**). Eski APK'lar bu rafı görmez; Koruma Kartı onlarda İkili rafında kalır.

## Panelden bağ işaretleri (21 Kasım 2026)

Müşteri: "Bağların seviyeleri ilerledikçe koltukta oturan bağ sahipleri arasında kalp gibi duygusal efektler var; bunları yönetim panelinde seviye seviye görelim, her seviyeye özgü ikon, SVGA ve hareketli görsel girebilelim."

- Panelde **Uygulama › Hediyeler › Bağ işaretleri** sekmesi (yetki: Hediyeler). Üstte sekiz bağ türü, altta seçilen türün **20 seviyesi**. Her satırda o seviyede şu an ne göründüğü yazar: kendi tasarımı, bir alttaki seviyenin devam eden tasarımı ya da uygulamanın kendi işareti (hangi halka olduğu).
- Bir seviyeye **Tasarım yükle**:
  - **Durağan resim:** saydam, kare PNG ya da WebP (64–1024 px). 512 px'ten ya da 512 KB'tan büyüğü sunucuda küçültülür.
  - **Hareketli hali:** saydam, kare, hareketli WebP (64–512 px, en çok 3 MB) ya da **SVGA**. SVGA'yı uygulamanın sunucusu hareketli WebP'ye ve durağan resme çevirir (mağaza çerçevelerinde olduğu gibi). Yalnız hareketli hal yüklenirse ilk karesi durağan resim olur.
  - **Boyut:** uygulamanın kendi işaretinin 1–3 katı. Kalp, ışık gibi çevreye taşan efektler için büyütülür; resim iki koltuğun ortasına oturur.
  - Pencerede iki örnek koltuğun arasında koyu ve açık zeminde önizleme var.
- **Seviye seviye devam:** bir seviyeye yüklenen tasarım, kendi tasarımı olan bir üst seviyeye kadar sürer. Örneğin Çift Lv1, Lv6, Lv11 ve Lv16'ya tasarım yüklenirse Lv1–5 ilkini, Lv6–10 ikincisini gösterir. İlk tasarımın altındaki seviyelerde (ya da hiç tasarım yoksa) uygulama kendi işaretini çizer (türün resmi, beş seviyede bir değişen halka; yukarıda **İşaretler**).
- **Kaldır:** o seviyenin tasarımı kalkar; seviye yine bir alttakini ya da uygulamanın kendi işaretini gösterir. Başka seviyenin kullanmadığı dosyalar depodan silinir.
- **Nerede görünür:** mikrofonda yan yana oturan bağlı iki kişinin arasında ve profilin Bağlar satırında, işaretin olduğu her yerde. Hareketli hali varsa telefon onu, yoksa durağan resmi çizer; altındaki "Lv" etiketi kalır.
- Değişiklik uygulama güncellemesi olmadan telefonlara gider (katalog yeniden okunur, en geç birkaç dakika).
- **Eski APK'lar** tasarımları görmez, kendi işaretini çizmeye devam eder. Görünmesi için yeni APK gerekir.
- Her kayıt `audit_events`'e yazılır (`bondlook.save`, `bondlook.clear`, `bondlook.svga`: önceki ve sonraki hali, paneldeki kişi).
- Teknik: sunucu `server/api/bond-looks.mjs`, tablo `migrations/107_bond_looks.sql` (satır silinmez, boşaltılır), katalog `GET /api/catalog?bondlooks=1` → `bondLooks`; uygulama `src/lib/bond-looks.ts`, `src/components/bond-mark.tsx`; panel `web/pages/app-bond-looks.js`, `web/bond-looks.js`. Testler: `test/bond-looks.test.mjs`, `tests/bond-looks.test.ts`, panelde `tests/app-admin.test.ts` ve `tests/panel-forms.test.ts`.

## Bağ Yüzüğü rafta (20 Kasım 2026)

Müşteri: "İlişki başlatma hediyesi nerede? Panelde yok, Aile ve Dost'ta dursun, ben güncellerim." Çift bağının hediyesi Bağ Yüzüğü (`bag-cift`, 5.000 jeton) eskiden yalnız profilden "Bağ kur › Çift" ile gidiyordu; uygulamanın hediye listesinde satırı yoktu, bu yüzden panelde görünmüyordu.

- Panelde **Hediyeler › Aile ve Dost**'ta diğer yedi bağ hediyesinin yanında (sonda; sürükleyip yeri değiştirilebilir). Adı, ikonu, videosu ve fiyatı oradan değişir; profildeki "Bağ kur" ve Bağlar sekmesi de panelin adını ve fiyatını kullanır. Rafı değişmez (Aile ve Dost'ta kalır).
- Odadaki hediye panelinde **Aile ve Dost** rafında. Aranızda bağ yoksa Çift bağı isteği olarak gider (jeton bekletilir, kabul edilince ilişki kurulur, reddedilirse döner); Çift bağınız varsa normal hediye olarak gidip bağ puanı getirir; başka türde bağınız varsa gönderilemez. Çift kişi başına yine 1.
- Yeni uygulama yüzüğün kendi resmini çizer. Bu sürümden önceki APK'lar bağ hediyelerini tanıyorsa rafta 💍 ya da panelin ikonuyla görebilir ve aynı kurallarla gönderir; Aile ve Dost rafı olmayan çok eski APK'lar hiç görmez. Profilden "Bağ kur" hepsinde çalışır.

## Güncelleme 7 (19 Kasım 2026): bağ hediyesi yeniden, seviye düşüşü, Lv20, işaretler, Sistem bildirimleri

Müşterinin isteği: "Bağları olan kişilere aynı hediyeler tekrardan atılmıyor; seviyeler artmalı ve atış olmazsa düşmeli, hiç atış olmazsa bağ düşmeli; seviyeye göre değişen işaretler; sınırsız bağ; her bağ bildirimi SimilarClub Sistem'e; bağ iptal edilebilmeli." Sahiplerin kararları (hepsi önerilen):

- **Bağ hediyesi yeniden:** aranızda **aynı türde** etkin bir bağ varsa bağ hediyesi `POST /api/gifts/send` ile **normal ücretli hediye** olarak gider: jeton hemen karşı tarafa elmas olur (Gelir kilidi, ajans geliri, PK, oda roketi, oda puanı, Koruma, hepsi her hediye gibi), istediğin kadar (×1, ×5, ×10 …), iki taraf da gönderebilir ve her 100 jeton 1 bağ puanı getirir. Fiyat ekranda görünen fiyattır; arada değişmişse 409 `price_changed`, hiçbir şey düşmez.
  - Aranızda bağ yoksa: 409 `bond_needed` ("Aranızda Kanka bağı yok: bu hediye önce bağ isteği olarak gider"); yeni uygulama bunu bağ isteği olarak göndermeyi önerir.
  - Aranızda **başka türde** bağ varsa: 409 `bond_kind` "Aranızda Kanka bağı var". İki kişi arasında yine tek bağ olur.
  - Bağın etkin olduğu, hediyenin istek kimliği (ref) kaydedildikten sonra, iki hesap kilitliyken bağ satırı `FOR SHARE` ile denetlenir: aynı anda gelen bitirme hediyeyi bekler, hediyenin puanı gerçekten var olan bağa yazılır; aynı isteğin tekrarı yine tekrar cevabını alır.
  - Uygulamada: odanın Aile ve Dost rafında bağın olan kişiyi seçince adet seçilebilir ve altta "+5 bağ puanı" yazar. Başka türde bağın olan kişiye "Aranızda Kanka bağı var" yazar, gönderilemez. Profilin Bağlar sekmesinde her bağın altında **Bağ hediyesi gönder** düğmesi var (adet seçilir: ×1 … ×100, puanıyla). Bağ Yüzüğü (Çift) 20 Kasım 2026'dan beri rafta da var (aşağıda).
  - **Eski APK:** bağ hediyesini her zaman istek olarak gönderir. Bağı olan kişiye gönderirse 409 "Aranızda Kanka bağı var. Bağ hediyesini yeniden göndermek için uygulamayı güncelle" görür, jeton düşmez. Bağı olan iki kişinin normal hediyeleri eski APK'da da puan getirir.
- **Sınırsız bağ:** Aile türleri (Kardeş, Bacı, Ağabey, Abla, Yenge, Enişte) ve Kanka için kişi başına en fazla **1000** (pratikte sınırsız, panelden düşürülebilir). Çift yine **1** (panelden 5'e kadar). Bekleyen istek yine en fazla **10**: her istek jetonunu bekletir.
  - Profilde bağlar 50'şer gelir, altta "+N bağ daha" (`GET /api/bonds?offset=`). Eski APK ilk 50'yi görür.
  - Odada `POST /api/bonds/among` artık ikisi de odadaki kişiler arasındaki bütün bağları ve her kişinin sohbet balonu için en iyi Lv10+ bağını (eşi odada olmasa da) verir; eskisi gibi 500 satırda kesilmez, çok bağı olan birinin yanındaki bağ kaybolmaz.
- **Puan düşüşü:** Türkiye saatiyle her gece, o gün iki taraftan hiçbiri diğerine hediye göndermediyse bağ puanının **%10'u, en az 10 puan** düşer (0'ın altına inmez). İki taraftan birinin o gün gönderdiği herhangi bir hediye (bağ hediyesi, odadaki, sohbetteki, Şanslı hediyenin payı) o günün düşüşünü durdurur. Mesajlaşma puan getirmeye devam eder ama düşüşü durdurmaz. **Kabulden sonraki ilk gece düşmez.** Puan düşünce seviye de düşebilir.
  - **Kendiliğinden bitiş:** **30 gün** boyunca iki taraftan hiç hediye gitmezse bağ kendiliğinden biter: jeton iadesi yok, yeniden kurmak için **bekleme yok**. Bitmeden **3 gün önce** iki tarafa SimilarClub Sistem'den bir kez uyarı gider.
  - Güncellemeden önce kurulmuş bağların sayacı güncellemenin yapıldığı gün başlar (eski kural "puan düşmez" diyordu).
  - Hepsi Canlı ayarlar › Bağlar'dan değişir (`bond_drop_pct`, `bond_drop_flat`, `bond_idle_end_days` (0: hiç bitmez), `bond_idle_warn_days`).
  - Koruma olduğu gibi kaldı ([`KORUMA.md`](KORUMA.md)).
- **Seviyeler Lv20'ye kadar:** basamaklar Canlı ayarlar › Bağlar › **Seviye basamakları**'ndan değişir (20 sayı, ilki 0). Puan = (birbirinize gönderilen jeton / 100) + sohbet puanı − gecelerin aldığı (0'ın altına inmez).
  - **Eski APK (f9671d9 ve öncesi):** ilerleme çubuğunu kendi içindeki 10 basamaktan çizer, Lv10'dan sonrasının başlangıcını 0 sayar. Bu yüzden eski APK'ya puan ve sonraki basamak, çubuk seviyenin içindeki gerçek ilerlemeyi gösterecek kadar kaydırılarak gider: Lv11'de 3.200 puanlı bir bağ eski APK'da "200 / 1500 puan · Lv.12 için 1300 puan" ve %13'lük çubuk olarak görünür (kaydırmasaydık "3200 / 4500" yazıp çubuğu %71 dolu gösterirdi). Sonraki seviyeye kalan puan ve seviye her zaman doğru; Lv1–10'da hiçbir şey değişmez. Yeni uygulama `?lv=20` der ve gerçek puanı görür ([`SUNUCU.md`](SUNUCU.md) › Bağlar).
- **İşaretler:** iki kişinin arasında bağ türünün resmi, seviyeye göre büyüyen bir halkanın içinde ve altında "Lv" etiketi. Halka her beş seviyede değişir: Lv1–5 ince (Çift pembe, diğerleri mavi), Lv6–10 türün renginde parlayan, Lv11–15 altın, Lv16–20 parlak elmas halka ve yıldız.
  - Profilin Bağlar satırında iki fotoğrafın arasında, isim yanındaki rozette küçük haliyle, odada yan yana oturan iki kişinin arasında.
  - **Odada işaret Lv1'den görünür** (eskiden Lv4'ten, 16 px düğüm). Mikrofonların arasındaki çizgi iki çerçevenin arkasından geçer, işaret ikisinin de önünde durur; boyu yüze göre 24–34 px, etiket en az 9 px (telefonun yazı büyütmesinden etkilenmez).
  - Yeni çizim gerekmedi: var olan 8 bağ resmi ve 4 halka. Eski APK'lar eski çizimi (Lv4 düğüm) gösterir.
- **Sistem bildirimleri (3a):** her bağ değişikliği Mesajlar › SimilarClub Sistem'e bir kez yazılır (tür `bond`, panelde "Bağ bildirimleri"; Canlı ayarlar › SimilarClub Sistem'den kapatılabilir). Bildirime dokununca kendi Bağlar sekmem açılır (istekler orada cevaplanır).
  - İstek → alana · kabul → ikisine · ret, süre dolması, satın alma iadesiyle iptal → isteyene (iade edilen jetonla) · geri çekme → alana · bitirme → diğer tarafa · seviye değişince (yükselme ya da düşme) → ikisine · bitiş uyarısı ve kendiliğinden bitiş → ikisine. Her gece düşen puan için bildirim gitmez, yalnız seviye değişince.
  - **Profilden gönderilen bağ hediyesi (22 Kasım 2026):** Bağlar sekmesinden ya da profilden (oda dışından) gönderilen her bağ hediyesi alana SimilarClub Sistem'den bir kez yazılır: "🔗 Bağ hediyesi geldi · Ayşe sana profil üzerinden Kalbim Seninle ×5 gönderdi. 💎 25.000 elmas hesabına geçti (Gelir › Profilden gelen hediyeler). Bağ puanınız +250." Dokununca Gelir açılır. Gelir yalnız toplamı gösterdiği için kimin ne gönderdiği buradan görünür. Odada gönderilende yazılmaz (orada sahnede görünür). Eski APK'larda Similar Ekibi'nde "Duyuru" kartı olarak durur.
  - Bildirimler değişiklik kaydolduktan sonra yazılır, hediye işleminin içinde asla. Telefona bildirim (push) bugünkü gibi yalnız istek, kabul, ret ve bitirmede gider; Sistem kayıtları ayrıca push göndermez.
  - Bağ push'una dokunmak eskiden boş Bildirimler ekranını açıyordu; yeni APK'da Bağlar sekmesini açar. Eski APK'larda push yine Bildirimler'i açar ama aynı bildirim Similar Ekibi'nde "Duyuru" kartı olarak durur ve dokununca Bağlar sekmesine gider.
- **Bağı bitirme (3b):** her bağ satırında görünür **Bağı bitir** düğmesi (eskiden yazısız "…"); onay sorulur. Onaydaki bekleme süresi panelin değeridir (eskiden hep "7 gün" yazıyordu). Kurallar sayfası ("?") puan düşüşünü ve kendiliğinden bitişi anlatır; "Puan düşmez" cümlesi kalktı.
  - **Eski APK'lar** kendi içindeki eski kural yazısını ("Puan düşmez") göstermeye devam eder. Kullanıcılara bir duyuruyla (Canlı ayarlar › Duyuru ya da Similar Ekibi) söylenmeli: "Bağ puanları artık hediyesiz gecelerde düşüyor; 30 gün hediye gitmeyen bağ bitiyor. Bağ hediyesini tekrar göndermek için uygulamayı güncelleyin."

## Kurallar

| Tür | Bağ hediyesi | Fiyat | Bir kişide en fazla |
|---|---|---|---|
| Çift | Bağ Yüzüğü | 5.000 jeton | 1 |
| Kardeş | Kardeş Bilekliği | 1.000 jeton | 1000 |
| Bacı | Bacı Kolyesi | 1.000 jeton | 1000 |
| Ağabey | Ağabey Saati | 1.000 jeton | 1000 |
| Abla | Abla Broşu | 1.000 jeton | 1000 |
| Yenge | Yenge Çiçeği | 1.000 jeton | 1000 |
| Enişte | Enişte Kravatı | 1.000 jeton | 1000 |
| Kanka | Kanka Rozeti | 500 jeton | 1000 |

Tablodaki fiyatlar ve sınırlar uygulamanın kendi değerleridir (1000: pratikte sınırsız; Güncelleme 7'den önce 3 ve 5). Fiyat Hediyeler'den; sınırlar, cevap süresi, bekleme, sohbet puanı, gece düşüşü, kendiliğinden bitiş ve seviye basamakları Canlı ayarlar › **Bağlar**'dan değişir ([`ELLE_AYARLAR.md`](ELLE_AYARLAR.md)).

**Fiyat panelden (19 Kasım 2026):** Hediyeler › Aile ve Dost'ta bağ hediyesinin fiyatı değişir; **Orijinale dön** uygulamanın fiyatına geri alır.
- Yeni uygulama Bağlar sekmesinde ve odadaki rafta panelin fiyatını gösterir ve gösterdiği fiyatı istekle gönderir. Arada fiyat değiştiyse jeton düşmez, yeni fiyat söylenir.
- **Eski APK** (bu sürümden önceki her APK, bugünkü dahil) kendi fiyatını gösterir. Panelde fiyat uygulamanınkinden farklıyken eski APK'dan bağ isteği gitmez, "uygulamayı güncelle" denir. Fiyat orijinaline dönünce eski APK yine gönderir.
- Bekleyen istek, gönderildiği fiyatı tutar: reddedilir ya da süresi dolarsa o kadar jeton döner, kabul edilirse o kadar elmas olur.

- **İstek:** birinin profilinde Bağlar → "Bağ kur" → tür seçilir. Bağ hediyesinin jetonu hemen düşer ve bekletilir. Onay sorulmaz (hediye kuralı).
- **Kabul:** jetonlar karşı tarafa elmas olarak geçer, normal bir hediye gibi (Gelir kilidi, ajans geliri, finans panelinde hediye olayı `bag-<tür>`).
- **Ret, geri çekme, 3 gün yanıtsız kalma:** jetonlar gönderenin aynı jeton kaynağına geri döner. Finans paneline olay gitmez.
- Aynı iki kişi arasında aynı anda tek bağ (ya da tek bekleyen istek) olur. Bir kişinin aynı anda en fazla 10 bekleyen isteği olur.
- **Puan:** bağ sürerken birbirinize gönderdiğiniz her 100 jeton 1 puan (bağ hediyesi dahil); karşılıklı mesajlaşmada karşı tarafın mesajına verilen her yanıt 1 puan, günde en fazla 10 (İstanbul günü). Hediyesiz gecelerde düşer (yukarıda **Puan düşüşü**).
- **Seviye:** Lv1 0 · Lv2 10 · Lv3 30 · Lv4 60 · Lv5 100 · Lv6 200 · Lv7 400 · Lv8 700 · Lv9 1.200 · Lv10 2.000 · Lv11 3.000 · Lv12 4.500 · Lv13 6.500 · Lv14 9.000 · Lv15 12.000 · Lv16 16.000 · Lv17 21.000 · Lv18 27.000 · Lv19 35.000 · Lv20 45.000 puan (Lv20 = 4,5 milyon jeton).
- **Ödüller:** Lv1 mikrofonda yan yana oturunca bağ işareti · Lv2 profilde bağ rozeti · Lv6 profil çerçevesi · Lv8 odaya birlikte giriş efekti · Lv10 özel sohbet balonu. (Eski APK'larda mikrofon çizgisi Lv4'ten.)
- **Bitirme:** iki taraf da istediği zaman bitirebilir ("Bağı bitir"). Seviye ve ödüller sıfırlanır, jeton iadesi yok. Aynı kişiyle 7 gün yeniden bağ kurulamaz (Canlı ayarlar); kendiliğinden biten bağda bekleme yok.
- **Gizlilik:** kendi Bağlar sekmendeki göz simgesi bağlarını başkalarından gizler (rozet ve çerçeve de görünmez). Sen her zaman görürsün. Bir bağda en son ne zaman hediye gittiği (sessiz gün, bitişe kalan gün) yalnız bağın iki tarafına gider; başkasının profilindeki bağlarda bu bilgi gelmez (hediye özel sohbette de gitmiş olabilir).
- Engellenen biriyle bağ kurulamaz; silinen hesabın bağları kendiliğinden biter, bekleyen isteklerin jetonu iade edilir.
- **Engel bağı bitirir** (Kasım 2026 incelemesi): iki kişiden biri diğerini engelleyince aradaki bağ hemen biter (`end_reason 'block'`). Kimseye bildirim gitmez: engellenen engeli hiçbir yerden öğrenmez (Verilerimin kopyası'nda da ona bitiş nedeni yazmaz), engelleyene de diğerinin adını taşıyan bir bildirim gitmez. Jeton iadesi yok. Engel kalkarsa 7 günlük bekleme olmadan yeniden bağ kurulabilir. Önceden, engelden sonra bağ sürüyordu: gece düşüşü ve "bağın bitmek üzere" bildirimleri engellenen kişinin adını SimilarClub Sistem'e yazıyor, engelin yasakladığı bir hediyeyi öneriyordu; odada ikisi yan yana oturunca işaret çiziliyordu. Güncellemeyle, o gün engelli olan çiftlerin bağları da aynı sessizlikle biter (`104_bond_block.sql`). Not (siz): engelleyip hemen kaldırmak, elle bitirilen bağdaki 7 günlük beklemeyi atlatır; bunu istemezseniz engelle biten bağa da aynı bekleme konabilir.
- **Verilerimin kopyası:** her bağda gecelerin aldığı puan (`pointsLost`), son kaydedilen seviye (`level`), son hediye günü (`giftDay`) ve kendiliğinden biten bağın nedeni (`endReason`: `idle` 30 gün hediyesiz, `gone` hesap kapandı, `refund` satın alma iadesi, `block` yalnız engelleyene).

## Odada

- **Bağ işareti (Lv1'den):** bağlı iki kişi mikrofonda yan yana (aynı sırada, biri ev sahibi değil) oturunca avatarları arasında bağ renginde parlayan çizgi ve ortasında bağın işareti (türün resmi, seviyenin halkası, "Lv" etiketi; yukarıda **İşaretler**). Çizgi iki kişinin çerçevesinin de arkasından geçer, işaret ikisinin de önünde durur (Güncelleme 7, madde 13: eskiden soldaki çerçevenin üstünden, sağdakinin altından geçiyordu). Soldaki koltuk çizgiyi kendi yüzünden önce, sağdaki koltuk işareti en son çizer (`src/lib/bond-link.ts`, `src/components/bond-mark.tsx`, `tests/bond-link.test.ts`). Eski APK'larda eski çizim (Lv4, 16 px düğüm) kalır.
- **Lv8 birlikte giriş:** yalnız ikisi odaya aynı anda girdiğinde (aralarında en çok 20 saniye, `JOINT_WINDOW_MS`) "A & B · Çift Lv8 · birlikte odaya girdi" giriş efekti, iki fotoğrafla; ikisinin kendi giriş efektlerinden sonra, onların yerine değil. Biri, bir süredir odada olan eşinin yanına girerse yalnız kendi girişi gösterilir (çift bildirimi yok). Her ikili bir ziyarette bir kez: ilk birlikte girişte; aynı ziyarette çıkıp yine birlikte girince tekrar gösterilmez. Odaya sonradan giren, içeridekilerin girişlerini ve birlikte girişini görmez. Giriş zamanları sunucu odasında ses sunucusunun saatinden (LiveKit), demo odasında telefonun saatinden. Giriş efektleri sırayla oynar (en fazla 3 bekler); efektleri kapatan ya da görünmez giren görmez, engellenen kişiler gösterilmez.
- **Lv10 sohbet balonu:** kişinin mesajı bağ renginde balonla ve adının yanında "Çift Lv10" etiketiyle görünür. Takılı özel balon varsa o önce gelir. Birden çok Lv10 bağı varsa Çift önce, sonra en yüksek seviye.
- Sunucu odalarında bağlar `POST /api/bonds/among { ids }` ile gelir (en fazla 80 kişi): ikisi de odadakiler arasındaki etkin bağlar ve her kişinin en iyi Lv10+ bağı (balon için, eşi odada olmasa da). Gizleyen birinin bağı başkasına gelmez, kendisine gelir. Katılma ve ayrılmalardan 1,2 saniye sonra, bir bağ hediyesi bağ yüzünden reddedilince de hemen yeniden sorulur.

## Nerede

- Sunucu: `server/api/bonds.mjs` (uçlar, bağ hediyesi denetimi), `server/api/bond-life.mjs` (gece düşüşü, kendiliğinden bitiş, Sistem bildirimleri), `server/api/bond-rules.mjs` (türler, fiyatlar, seviyeler, halka basamakları), tablo `migrations/012_bonds.sql` ve `099_bond_decay.sql` (`points_lost`, `gift_day`, `decayed_on`, `level`, `level_said`, `told_status`, `end_reason`), testler `test/bonds.test.mjs`.
- Uygulama: `src/components/bonds.tsx` (sekme, rozet, çerçeve), `src/components/bond-mark.tsx` (işaret), `src/data/bonds.ts` (aynı kurallar, halkaların görünüşü, kurallar yazısı ve çevrimdışı örnek), `src/lib/live/bonds.ts` (sunucu çağrıları). `tests/bonds.test.ts` ve `tests/bond-marks.test.ts` iki tarafın fiyat, seviye ve basamaklarının aynı kaldığını denetler.
- Bir gece işi bütün etkin bağ satırlarına günde bir kez yazar (500'erli, hesap satırına dokunmadan); bağ sayısı çok büyürse süresi `bond drop:` kaydından izlenir.
- Çevrimdışı demoda örnek bağlar gösterilir; gönderilen istekler telefonda tutulur ve geri çekilebilir.

## Görsel listesi (ChatGPT)

`docs/GORSEL_URETIM_LISTESI.md` içindeki "ChatGPT ile üretim" stil metnini kullanın. Her satır bir görsel; 1024 × 1024 px şeffaf PNG, uygulamaya 512 px olarak konur. Dosyayı "Dosya adı" ile kaydedin. Görseller gelene kadar uygulama bağ türünü simge ve renkle gösterir.

| # | Dosya adı | Ad | Ne çizilecek | Öncelik |
|---|---|---|---|---|
| 1 | `bag-cift.png` | Bağ Yüzüğü | iç içe geçmiş iki altın yüzük, birinde küçük mercan taş, etrafında ışıltı | P1 |
| 2 | `bag-kardes.png` | Kardeş Bilekliği | iki örgü bileklik birbirine dolanmış, turkuaz ve altın boncuklu | P1 |
| 3 | `bag-baci.png` | Bacı Kolyesi | ince altın zincirde iki küçük birbirine değen kalp madalyon | P1 |
| 4 | `bag-agabey.png` | Ağabey Saati | klasik altın kol saati, lacivert kadran, kalkan biçimli küçük süs | P1 |
| 5 | `bag-abla.png` | Abla Broşu | çiçek biçimli altın broş, ortada turkuaz taş | P1 |
| 6 | `bag-yenge.png` | Yenge Çiçeği | kurdeleyle bağlı küçük buket, mercan ve beyaz çiçekler | P1 |
| 7 | `bag-enishte.png` | Enişte Kravatı | lacivert ipek kravat, altın kravat iğnesi | P1 |
| 8 | `bag-kanka.png` | Kanka Rozeti | yuvarlak altın rozet üzerinde iki çarpışan yumruk silueti (insan yüzü yok) | P1 |
