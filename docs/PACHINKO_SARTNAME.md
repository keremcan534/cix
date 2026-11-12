# SimilarClub — Pachinko Mini Oyun Sistemi

Oyun tasarımı, kazanç dağılımı ve teknik geliştirme şartnamesi. 11 Kasım 2026'da iletilen metin olduğu gibi buradadır. Uygulamadaki adı da **Pachinko** (kod içi kimliği `bilye`); 1. aşama yapıldı, neyin yapıldığı ve neyin beklediği `docs/OYUN_MERKEZI.md` › Pachinko bölümünde.

## 1. Projenin Amacı

SimilarClub içerisinde Japon Pachinko oyunlarından esinlenen, özgün tasarıma sahip, fizik tabanlı bir mini oyun geliştirilecektir.

Oyunun temel amacı kullanıcıya gerçek bir Pachinko deneyimine yakın, eğlenceli ve görsel olarak tatmin edici bir oyun sunmaktır.

Oyun; bireysel oynanabilmeli, canlı odalarla etkileşime girebilmeli, etkinliklere ve turnuvalara katılabilmelidir.

Oyun ekonomisinin temel dağılımı:

- %40 Oyuncu Kazanç Havuzu
- %60 Platform Kasası

Bu oranlar sistemin temel ekonomik kuralıdır ve yönetim panelinden yetkili kişiler tarafından değiştirilebilir olmalıdır.

## 2. Oyun Mekaniği

Oyun dikey mobil ekran için tasarlanacaktır.

Ekranın üst bölümünden oyuna bırakılan top, aşağı doğru ilerlerken çeşitli engellere ve çivilere çarparak yön değiştirecektir.

Oyun gerçekçi 2D fizik motoruyla çalışmalıdır.

Temel mekanikler:

- Yerçekimi etkisi.
- Topun çivilere çarpması.
- Çarpışma sonucunda yön değiştirmesi.
- Farklı açılarda sekmesi.
- Farklı ödül değerlerine sahip hedef cepleri.
- Ayarlanabilir top fırlatma gücü.
- Topun hedef bölgelere ulaşması.
- Kazanılan ödülün animasyonla gösterilmesi.

Topun hareketi tamamen oyun içi kontroller ve fizik motoruyla sağlanacaktır.

Telefonu sağa-sola eğerek kontrol etme, ivmeölçer veya jiroskopla yönlendirme özelliği kesinlikle eklenmeyecektir.

İlk sürümde tek, kaliteli ve dengeli bir Pachinko oyun tahtası hazırlanacaktır. İlerleyen aşamalarda farklı oyun tahtaları eklenebilecek şekilde mimari kurulmalıdır.

## 3. Oyun Ekonomisi ve %40 / %60 Dağılımı

Oyunun ekonomik sistemi aşağıdaki şekilde çalışacaktır:

- Kullanıcıların oyun için harcadığı toplam uygun katılım değeri hesaplanır.
- Bu toplam değerin %40'ı oyunculara dağıtılabilecek ödül havuzuna ayrılır.
- Toplam değerin %60'ı platform kasasında kalır.
- Dağıtım tek tek oyunlar üzerinden değil, toplam oyun hacmi üzerinden uzun vadeli oran olarak hesaplanır.

Örnek hesaplama:

| İşlem | Tutar |
|---|---|
| Toplam oyun katılım hacmi | 100.000 |
| Oyuncu kazanç havuzu (%40) | 40.000 |
| Platform kasası (%60) | 60.000 |

Bu hesaplama yalnızca örnek birim üzerinden gösterilmiştir. Gerçek hesaplama, oyunda kullanılan katılım bedeli ve ödül biriminin mevcut SimilarClub ekonomi sistemiyle uyumlu hâle getirilmesiyle yapılacaktır.

### 3.1. Kazanç havuzu kuralları

- Oyuncuların kazançları %40'lık toplam ödül havuzundan karşılanmalıdır.
- Her oyunun ödülü ayrı hesaplanmalıdır.
- Oyuncunun kazanabileceği miktar oyun kurallarına göre değişebilir.
- Bazı oyunlarda ödül yüksek, bazılarında düşük veya sıfır olabilir.
- Tek bir kullanıcıya her oyunda sabit kazanç garantisi verilmemelidir.
- Ödül havuzu toplamı ayrılan bütçeyi aşmamalıdır.
- Henüz dağıtılmamış ödül havuzu bakiyesi sistemde izlenmelidir.
- Dağıtılan ödüller ve kalan bakiye ayrı ayrı raporlanmalıdır.

### 3.2. Platform kasası kuralları

- Toplam uygun oyun katılım hacminin %60'ı platform kasasına ayrılmalıdır.
- Bu tutar oyuncu ödül havuzuna otomatik olarak eklenmemelidir.
- Platform kasasına giren tutarlar ayrı bir muhasebe kaydında tutulmalıdır.
- Yönetim panelinde günlük, haftalık, aylık ve toplam kasa bakiyesi görüntülenebilmelidir.
- İptal edilen veya iade edilen işlemler kasa ve ödül havuzu hesaplamalarına doğru şekilde yansıtılmalıdır.

### 3.3. Oranların yönetimi

Yönetim panelinde aşağıdaki değişkenler bulunmalıdır:

- Oyuncu kazanç oranı: Varsayılan %40.
- Platform kasa oranı: Varsayılan %60.
- Minimum oyun katılım bedeli.
- Maksimum oyun katılım bedeli.
- Minimum ödül.
- Maksimum ödül.
- Oyun başına ödül limiti.
- Günlük toplam ödül limiti.
- Günlük kullanıcı katılım limiti.
- Ödül havuzu üst limiti.

Oyuncu oranı ile platform kasa oranının toplamı her zaman %100 olmalıdır.

Oran değişikliği geçmiş oyunların hesaplamalarını değiştirmemelidir. Yeni oranlar yalnızca yürürlüğe girdikleri tarihten sonraki işlemlere uygulanmalıdır.

## 4. Önemli Finansal ve Muhasebe Kuralları

Sistem, oyun ekonomisini mevcut SimilarClub coin, diamond, hediye ve yayıncı kazanç sisteminden bağımsız olarak takip edebilmelidir.

- Pachinko puanları doğrudan nakde çevrilememelidir.
- Pachinko puanları doğrudan yayıncı kazancına eklenmemelidir.
- Pachinko puanları doğrudan ajans komisyonu oluşturmamalıdır.
- Oyun puanları kullanıcılar arasında transfer edilememelidir.
- Oyun puanları hediye gönderiminde kullanılamamalıdır.
- Oyun puanları çekim talebine konu olmamalıdır.

Eğer oyun katılımında coin veya başka bir mevcut SimilarClub birimi kullanılması kararlaştırılırsa, bu birimin tahsilatı ve ödül dönüşümü ayrı muhasebe kayıtlarıyla yönetilmelidir.

Ödül havuzunun hangi birimle kullanıcıya verileceği mevcut sistem incelendikten sonra kesinleştirilmelidir. Nakit, diamond veya yayıncı kazancı olarak ödeme yapılması bu şartnamenin kapsamına dahil değildir.

## 5. Jackpot Sistemi

Oyunda ortak Jackpot sistemi bulunmalıdır.

- Jackpot hedefi yönetim panelinden belirlenebilmelidir.
- Jackpot birikimi ve dağıtımı kayıt altına alınmalıdır.
- Jackpot ödülü %40'lık oyuncu kazanç havuzu sınırları içerisinde kalmalıdır.
- Jackpot dağıtımı havuzda karşılığı bulunmadan gerçekleştirilememelidir.
- Kazanan kullanıcı, ödül miktarı ve işlem zamanı kaydedilmelidir.
- Aynı Jackpot ödülü birden fazla kez dağıtılamamalıdır.

Jackpot için ayrı bir bütçe tanımlanabilir ancak bu bütçe %40'lık toplam oyuncu ödül yükümlülüğünü aşmamalıdır.

## 6. Fever Modu

Fever modu, oyun sırasında belirli koşullar gerçekleştiğinde etkinleşen özel oyun aşamasıdır.

Özellikler:

- Fever animasyonu.
- Özel hedefler.
- Bonus atışlar.
- Artırılmış ödül ihtimalleri.
- Özel oyun tahtası varyasyonları.
- Yönetim panelinden ayarlanabilir etkinleşme koşulları.

Fever modunda verilen ödüller de %40'lık oyuncu kazanç havuzu içerisinde hesaplanmalıdır.

## 7. Canlı Oda Entegrasyonu

Pachinko, SimilarClub canlı odalarında kullanılabilmelidir.

Planlanan özellikler:

- Oda içinden oyuna katılım.
- Oda üyelerinin oyun etkinliğini takip etmesi.
- Ortak Jackpot etkinlikleri.
- Oda içi skor tabloları.
- Kullanıcılar arası düellolar.
- Aile turnuvaları.
- Ajans turnuvaları.
- Günlük ve haftalık yarışmalar.

Oda etkinliklerinde dağıtılan ödüller de ana ödül havuzu kurallarına uygun hesaplanmalıdır.

## 8. Yönetim Paneli

Yönetim panelinde Pachinko için bağımsız bir yönetim bölümü oluşturulmalıdır.

Oyun ayarları:

- Oyunu aktif/pasif yapma.
- Oyun tahtası seçimi.
- Top fiziği ayarları.
- Top fırlatma gücü.
- Hedef cep değerleri.
- Oyun zorluk seviyesi.
- Bonus atış ayarları.

Ekonomi ayarları:

- Oyuncu kazanç oranı (%40 varsayılan).
- Platform kasa oranı (%60 varsayılan).
- Katılım bedelleri.
- Ödül limitleri.
- Jackpot bütçesi.
- Fever ödül bütçesi.
- Günlük ödül limiti.
- Kullanıcı bazlı limitler.

Raporlama:

- Toplam oyun katılım hacmi.
- Toplam oyuncu ödülü.
- Platform kasasına ayrılan tutar.
- Kullanılabilir ödül havuzu.
- Dağıtılmamış ödül bakiyesi.
- Jackpot toplamı ve dağıtımları.
- Fever ödülleri.
- Günlük, haftalık, aylık ve tarih aralığı raporları.
- Kullanıcı bazında oyun geçmişi.
- İşlem ve muhasebe kayıtları.

## 9. Teknik Mimari ve Veri Tabloları

Aşağıdaki veri yapıları değerlendirilmeli ve mevcut veritabanı mimarisine uygun şekilde uygulanmalıdır:

PachinkoGames, PachinkoBoards, PachinkoBoardLayouts, PachinkoTargets, PachinkoRules, PachinkoSessions, PachinkoAttempts, PachinkoResults, PachinkoPoints, PachinkoBonusRounds, PachinkoPrizePools, PachinkoPrizeTransactions, PachinkoPlatformTreasury, PachinkoJackpots, PachinkoJackpotTransactions, PachinkoLeaderboards, PachinkoRoomEvents, PachinkoTournaments, PachinkoTournamentParticipants, PachinkoEconomySettings, PachinkoAuditLogs.

Tablo isimleri ve alanlar mevcut proje mimarisi incelendikten sonra kesinleştirilmelidir.

## 10. Güvenlik ve Hile Önleme

Oyun sonuçları yalnızca istemcinin gönderdiği verilere güvenilerek belirlenmemelidir.

- Oyun oturumu sunucu tarafından doğrulanmalıdır.
- Her oyun denemesine benzersiz işlem kimliği verilmelidir.
- Aynı oyun işlemi iki kez ödül oluşturmamalıdır.
- Katılım bedeli ve ödül hesaplamaları sunucuda doğrulanmalıdır.
- Ödül havuzu sınırları sunucu tarafında kontrol edilmelidir.
- Kullanıcı bakiyesi ve ödül kayıtları atomik işlemlerle güncellenmelidir.
- Bağlantı kopması durumunda işlem durumu korunmalıdır.
- Sonuçlar ve finansal hareketler denetim kayıtlarına yazılmalıdır.
- Sahte istekler, tekrar oynatma saldırıları ve bakiye manipülasyonu engellenmelidir.

## 11. Geliştirme Aşamaları

**Aşama 1 — Temel Pachinko:** tek oyun tahtası, fizik motoru, top hareketleri, hedef cepleri, ödül hesaplama, mobil uyumlu arayüz.

**Aşama 2 — Oyun Ekonomisi:** %40 oyuncu ödül havuzu, %60 platform kasası, işlem kayıtları, ödül ve kasa raporları, yönetim paneli.

**Aşama 3 — Özel Modlar:** Jackpot, Fever modu, bonus atışlar, alternatif oyun tahtaları.

**Aşama 4 — Sosyal Özellikler:** canlı oda entegrasyonu, düellolar, ortak Jackpot, aile ve ajans turnuvaları, liderlik tabloları.

## 12. Kabul ve Test Kriterleri

Geliştirme tamamlandığında aşağıdaki kontroller yapılmalıdır:

1. Top fizik motoruyla doğal şekilde hareket etmelidir.
2. Çivi ve engel çarpışmaları doğru çalışmalıdır.
3. Top doğru hedef cebine ulaştığında ilgili ödül hesaplanmalıdır.
4. Toplam uygun oyun hacminin %40'ı ödül havuzuna ayrılmalıdır.
5. Aynı hacmin %60'ı platform kasasına kaydedilmelidir.
6. Ödül havuzu hiçbir koşulda ayrılan bütçeyi aşmamalıdır.
7. Jackpot ve Fever ödülleri %40 sınırına uymalıdır.
8. Oran değişiklikleri geçmiş işlemleri değiştirmemelidir.
9. Aynı işlem tekrar gönderildiğinde ikinci kez ödül oluşmamalıdır.
10. İnternet bağlantısı kesildiğinde finansal işlem tutarlılığı korunmalıdır.
11. Kullanıcı oyun geçmişini görebilmelidir.
12. Yönetim panelindeki kasa ve ödül raporları muhasebe kayıtlarıyla eşleşmelidir.
13. Telefon hareket sensörleri oyun kontrolünde kullanılmamalıdır.

## 13. Geliştirici İçin Uygulama Talimatı

Geliştirmeye başlamadan önce mevcut SimilarClub kod tabanı, veritabanı, coin/diamond sistemi, ödeme akışları ve finansal kayıt yapısı incelenmelidir.

Mevcut çalışan özellikler bozulmamalı, aynı işlevi yapan ikinci bir sistem gereksiz yere oluşturulmamalıdır.

%40 oyuncu ödül havuzu ve %60 platform kasası kuralı merkezi, denetlenebilir ve yönetilebilir bir finansal yapı olarak uygulanmalıdır.

Bu oranlar yalnızca arayüzde gösterilmemeli; gerçek oyun işlemlerinde sunucu tarafında hesaplanmalı ve muhasebe kayıtlarına işlenmelidir.

Geliştirme sonunda tamamlanan özellikler, değiştirilen dosyalar, oluşturulan veri tabloları, API ve entegrasyonlar, çalıştırılan testler, başarısız testler ve henüz tamamlanmayan işler ayrı ayrı raporlanmalıdır.

Test edilmemiş hiçbir özellik tamamlanmış olarak bildirilmemelidir.
