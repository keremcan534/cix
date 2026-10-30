# Çıkartma üretim listesi: ücretli emoji paketleri için özel tasarımlar

Standart Unicode emojiler artık herkese ücretsiz. Satılan paketler yalnızca uygulamaya özel çizim çıkartmalardan oluşuyor (`app/assets/reactions`, `data/catalog.ts` → `STICKER_PACKS`). Şu anki çıkartmaların çoğu standart emojilerin maskotla çizilmiş hâli. Bu listedeki çıkartmalar standart emojilerde karşılığı olmayan, uygulamaya ait tasarımlar. Ücretli paketlerin asıl içeriği bunlar olacak.

Görseller ChatGPT ile üretilecek. Kod tarafında bir çıkartmayı bağlamak için tek gereken, dosyanın bu listedeki adla teslim edilmesi.

**Toplam: 2 yeniden çizim + 5 yeni paket × 8 = 42 görsel.**

## ChatGPT ile üretim

1. Örnek görsel olarak mevcut çıkartmalardan 3–4 tanesini ekleyin: `tepki-temel-gulumseme.png`, `tepki-eglence-havali.png`, `tepki-hayvanlar-tilki.png`, `tepki-ask-kalp.png`. Turkuaz yuvarlak maskot ve cam stil bunlardan anlaşılır.
2. Aşağıdaki stil metnini bir kez gönderin, sonra her paketin tablosunu ayrı ayrı verin.
3. Her görseli **"Dosya adı" sütunundaki adla** kaydedin.

```
Stil (her çıkartma için aynı, eklediğim örnek çıkartmalarla uyumlu):
- Ana karakter, örneklerdeki turkuaz (#13D9DF), yuvarlak, cam/jöle yüzeyli maskot: iki küçük siyah göz, pembe yanaklar, yanlarda yarı saydam kulaklık benzeri yuvarlaklar.
- 3D, parlak, yumuşak stüdyo ışığı; detaylarda altın (#F6BD60) ve mercan (#FF6576). Mor ve mor-pembe gradyan kullanma.
- Tek sahne, ortada, kenarlarda boşluk; şeffaf arka plan (PNG); koyu lacivert (#080F1E) zeminde ve 48 px boyutunda da okunaklı olsun.
- Yazı, harf, rakam, logo, marka, bayrak, gerçek kişi yüzü yok. Başka uygulamaların veya çizgi filmlerin karakterlerine benzemesin.
- 1024 × 1024 px üret; uygulamaya 192 px olarak küçültülerek konur.
Aşağıdaki her satır için ayrı bir çıkartma üret. "Ne çizilecek" sütununu izle, dosyayı "Dosya adı" ile kaydet.
```

## 0. Yeniden çizilecekler (2)

Bu iki dosya başka bir çıkartmanın birebir kopyası olarak teslim edildi. Bu yüzden şu an paketlerde yer almıyorlar.

| # | Dosya adı | Ad | Ne çizilecek | Paket |
|---|---|---|---|---|
| 1 | `tepki-eglence-yerlere-yattim.png` | Yerlere Yattım | Maskot gülmekten yere yatmış, yana devrilmiş, gözlerinden gülme yaşı fışkırıyor (Kahkaha'dan farklı: yatay, yerde yuvarlanıyor) | Eğlence |
| 2 | `tepki-vip-kristal.png` | Kristal | Altın kaideli, turkuaz, çok yüzeyli tek bir kristal; Elmas'tan farklı olarak uzun ve sivri, etrafında küçük ışıltılar (maskot yok) | VIP |

## 1. Ses Odası (8): uygulamaya özgü

Odada en çok yaşanan anlar. Önerilen fiyat 80 jeton.

| # | Dosya adı | Ad | Ne çizilecek |
|---|---|---|---|
| 1 | `tepki-oda-mikrofonda.png` | Mikrofonda | Maskot iki eliyle altın bir mikrofon tutuyor, ağzı açık, şarkı söylüyor |
| 2 | `tepki-oda-soz-istiyorum.png` | Söz İstiyorum | Maskot bir elini havaya kaldırmış, hevesli, üstünde küçük ünlem balonu (yazısız) |
| 3 | `tepki-oda-sessizdeyim.png` | Sessizdeyim | Maskotun ağzında fermuar, yanında üstü çizili küçük mikrofon simgesi |
| 4 | `tepki-oda-kulakligi-taktim.png` | Dinliyorum | Maskot büyük kulaklıkla gözleri kapalı, keyifle sallanıyor, etrafında nota |
| 5 | `tepki-oda-alkis-yagmuru.png` | Alkış Yağmuru | Maskotun etrafında çok sayıda küçük alkışlayan el ve konfeti |
| 6 | `tepki-oda-pk-hazir.png` | PK Hazır | Maskot mercan renkli boks eldivenleriyle savunma pozisyonunda, kararlı bakış |
| 7 | `tepki-oda-dj.png` | DJ | Maskot kulaklıkla pikap başında, tek eli plakta |
| 8 | `tepki-oda-sahne-senin.png` | Sahne Senin | Maskot iki elini öne uzatmış, birini sahneye davet ediyor, üstünde spot ışığı |

## 2. Çay Ocağı (8): yerel kültür

Önerilen fiyat 60 jeton.

| # | Dosya adı | Ad | Ne çizilecek |
|---|---|---|---|
| 1 | `tepki-cay-cay-ister-misin.png` | Çay İster misin | Maskot tabağıyla ince belli bir çay bardağını uzatıyor, buhar çıkıyor |
| 2 | `tepki-cay-simit.png` | Simit | Maskot susamlı bir simidi iki eliyle tutup ısırmış, mutlu |
| 3 | `tepki-cay-turk-kahvesi.png` | Kahve Falı | Maskot ters çevrilmiş kahve fincanına merakla bakıyor |
| 4 | `tepki-cay-nazar.png` | Nazar Değmesin | Maskotun önünde parlak mavi nazar boncuğu, maskot göz kırpıyor |
| 5 | `tepki-cay-lokum.png` | Lokum | Maskot pudra şekerli lokum tabağı uzatıyor, yanağında pudra |
| 6 | `tepki-cay-afiyet-olsun.png` | Afiyet Olsun | Maskot önlüklü, elinde dumanı tüten tencere, göz kırpıyor |
| 7 | `tepki-cay-kolay-gelsin.png` | Kolay Gelsin | Maskot baretle, elinde küçük anahtar, başparmak yukarıda |
| 8 | `tepki-cay-gecmis-olsun.png` | Geçmiş Olsun | Maskot elinde küçük bir buket ve kalp, sevecen bakış |

## 3. Duygular+ (8): standart emojide olmayan ifadeler

Önerilen fiyat 50 jeton.

| # | Dosya adı | Ad | Ne çizilecek |
|---|---|---|---|
| 1 | `tepki-duygu-utandim.png` | Utandım | Maskot iki eliyle yüzünü kapatmış, parmak arasından bakıyor, yanakları kıpkırmızı |
| 2 | `tepki-duygu-kiskandim.png` | Kıskandım | Maskot kollarını kavuşturmuş, yan bakıyor, yanağı şişkin |
| 3 | `tepki-duygu-eridim.png` | Eridim | Maskot sevgiden yarı erimiş, alt yarısı su birikintisine dönüşmüş, gözleri kalp |
| 4 | `tepki-duygu-sinirden-buhar.png` | Buhar Oldum | Maskot kıpkırmızı, kulaklarından buhar çıkıyor, ayağını yere vuruyor |
| 5 | `tepki-duygu-sevincten-agliyorum.png` | Sevinçten Ağlıyorum | Maskot gülümserken iki gözünden çeşme gibi yaş fışkırıyor |
| 6 | `tepki-duygu-kalbim-kirildi.png` | Kalbim Kırıldı | Maskot elinde ikiye çatlamış bir kalp tutuyor, üzgün |
| 7 | `tepki-duygu-sabah-kahvesi.png` | Kahvesiz Olmaz | Maskot uykulu, göz altları torbalı, büyük bir kupa kahveye sarılmış |
| 8 | `tepki-duygu-kafam-karisik.png` | Kafam Karışık | Maskotun başının üstünde dolanmış yumak gibi bir çizgi, gözleri spiral |

## 4. Kutlama (8)

Önerilen fiyat 80 jeton.

| # | Dosya adı | Ad | Ne çizilecek |
|---|---|---|---|
| 1 | `tepki-kutlama-dogum-gunu.png` | Doğum Günü | Maskot parti şapkalı, önünde mumlu pasta (mumda rakam yok) |
| 2 | `tepki-kutlama-tebrikler.png` | Tebrikler | Maskot havaya atlıyor, iki kolu yukarıda, etrafında konfeti |
| 3 | `tepki-kutlama-sampanya.png` | Şerefe | Maskot iki kadehi tokuşturuyor (içecek turkuaz, etiketsiz) |
| 4 | `tepki-kutlama-hediye-acti.png` | Hediye Geldi | Maskot açılmış bir hediye kutusundan çıkan ışıltılara şaşkın bakıyor |
| 5 | `tepki-kutlama-yildiz.png` | Yıldızsın | Maskot elinde parlayan altın bir yıldız tutuyor |
| 6 | `tepki-kutlama-madalya.png` | Birinci | Maskotun boynunda altın madalya, gururlu duruş (madalyada rakam yok) |
| 7 | `tepki-kutlama-dans.png` | Dans | Maskot tek ayak üstünde dans ediyor, etrafında hareket çizgileri ve notalar |
| 8 | `tepki-kutlama-havai-fisek.png` | Kutlu Olsun | Maskotun arkasında turkuaz ve altın havai fişekler patlıyor |

## 5. Maskot Hayvanlar (8): maskotun hayvan kostümleri

Mevcut Hayvanlar paketi hayvanların kendisi; bunlarda maskot kostüm giyiyor. Önerilen fiyat 100 jeton.

| # | Dosya adı | Ad | Ne çizilecek |
|---|---|---|---|
| 1 | `tepki-kostum-kedi.png` | Kedi Kostümü | Maskot kedi kulaklı kapüşon ve bıyıkla, pati kaldırıyor |
| 2 | `tepki-kostum-ayi.png` | Ayıcık | Maskot ayı kostümünde, kocaman sarılma pozunda |
| 3 | `tepki-kostum-tavsan.png` | Tavşan | Maskot uzun tavşan kulaklarıyla zıplıyor, elinde havuç |
| 4 | `tepki-kostum-dinozor.png` | Dinozor | Maskot yeşil yerine turkuaz-mercan pullu dinozor kostümünde, "rawr" pozu (yazısız) |
| 5 | `tepki-kostum-ari.png` | Arı | Maskot altın-siyah çizgili arı kostümünde, küçük kanatlarla uçuyor |
| 6 | `tepki-kostum-penguen.png` | Penguen | Maskot penguen kostümünde buz üstünde kayıyor |
| 7 | `tepki-kostum-tilki.png` | Tilki | Maskot turuncu tilki kostümünde, kurnaz göz kırpışı |
| 8 | `tepki-kostum-aslan.png` | Aslan | Maskotun etrafında altın yele, gururlu kükreme pozu (VIP paketine de konabilir) |

## Teslimden sonra

- Görseller `app/assets/reactions` klasörüne bu adlarla konur, `components/ReactionArt.tsx` ve `data/catalog.ts` → `STICKER_PACKS` içinde yeni paket olarak tanımlanır.
- Yeniden çizilen 2 dosya geldiğinde `catalog.ts`'teki Eğlence ve VIP paketlerine geri eklenir. Testler, aynı görselin iki çıkartmada kullanılmasını yakalar.
- Fiyatlar öneridir; son kararı müşteri verir.
