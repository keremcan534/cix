# Takım PK Modülü

Kaynak: *SIMILARCLUP — PK BATTLE MODÜLÜ*. Önceki 60 saniyelik "PK Modu" kaldırıldı ve yerine bu modül geldi. **1v1 / bireysel PK yoktur.**

## Dosyalar

| Dosya | Görevi |
|---|---|
| `src/lib/pk.ts` | PK sunucusunun yerine geçen katman: oturumlar, sayaç (bitiş zamanını sunucu belirler), puanlama, sonuç, iptal, ayarlar, denetim kayıtları. Odaya, koltuğa ve mikrofona dokunmaz. |
| `src/components/room/pk.tsx` | Kurulum paneli (Oda içi / Odalar arası), odadaki canlı skor çubuğu, ayrıntı kartı, sonuç ekranı. |
| `src/app/oda/[id].tsx` | Menü › **Takım PK** (oda sahibi ve yöneticiler). Hediyeler PK'ya tek işlem kimliğiyle yazılır; oda içi PK'da koltuklarda takım rengi halkası görünür. |
| `src/app/pk-yonetimi.tsx` | Yönetim paneli (`pk.manage` yetkisi). |

## Kurallar

- **Süreler:** Yalnızca 15, 30, 60 ve 120 dakika. Yönetici bunlardan bazılarını kapatabilir ama yeni süre ekleyemez. Başlayan PK'nın süresi değişmez.
- **Sayaç sunucuda:** Bitiş zamanı (`endAt`) PK başlarken bir kez belirlenir ve sonucu sunucu hesaplar. Telefondaki sayaç yalnızca gösterim içindir.
- **Oda içi PK:**
  - Kırmızı ve Mavi takım. Takımlar "Dengeli dağıt" veya "Ben seçeceğim" yöntemiyle kurulur; takım başına en az/en fazla kişi sınırı vardır.
  - **Hediyeyi alan kişinin takımı** puan kazanır.
  - PK başladıktan sonra takım değiştirilemez.
- **Odalar arası PK:**
  - Davet → rakip odanın kabul etmesi → 5 sn hazırlık → aktif.
  - Davet reddedilir veya süresinde yanıtlanmazsa PK başlamaz.
  - O odadaki geçerli hediyeler, o odanın takımına sayılır.
  - Bir oda aynı anda tek PK'ya katılabilir (oda içi ve odalar arası dahil).
- **Puan:**
  - Varsayılan olarak 1 jeton = 1 PK puanı. Hediye başına puan yönetim panelinden ayarlanır; 0 yazılan hediye puan getirmez.
  - Ayarlar PK başladığı anda dondurulur (ayar sürümü kaydedilir); sonradan yapılan değişiklikler devam eden PK'yı etkilemez.
  - PK başlamadan önce ve bittikten sonra gönderilen hediyeler sayılmaz.
  - Aynı işlem kimliği ikinci kez gelirse reddedilir ve sayılır.
  - Jeton düşüldüğü hâlde PK puanı yazılamayan işlemler "düzeltme bekliyor" listesine düşer.
- **Sonuç:**
  - Kazanan, skorlar, fark, süre, destekçiler ve geçerli hediye sayısı gösterilir. Eşitlikte "Berabere".
  - Sonuç gelmeden kazanan gösterilmez.
  - Kaybeden takımdan ek jeton kesilmez.
- **İptal** (moderatör iptali veya oda kapanması):
  - Kazanan açıklanmaz, PK puanları geçersiz olur.
  - Gönderilen hediyeler alıcıya ulaştığı için iade edilmez.
  - İptaller denetim kaydına yazılır.
- **Bağlantı kopması:** Tek bir katılımcının bağlantısının kopması takımı kaybettirmez; PK devam eder.

## Kabul testleri (web prototipi, Playwright)

| Test | Sonuç |
|---|---|
| Kurulumda yalnız 15/30/60/120 dk | ✅ |
| Oda içi PK: hazırlık → aktif → canlı skor → sonuç | ✅ |
| Hediye alıcının takımına puan yazar; destekçi listesi oluşur | ✅ |
| Odalar arası: davet reddedilince PK başlamaz | ✅ ("PK iptal edildi · daveti reddetti") |
| Odalar arası: kabul → iki odanın skoru → sonuç | ✅ |
| Mikrofon ve koltuk: PK başlatma, aktiflik, sonuç ekranı ve kapatma | ✅ Mikrofon ve koltuk değişmedi |
| Mikrofonu kapalı kullanıcı | ✅ PK boyunca ve sonrasında kapalı kaldı |
| Süre doğal olarak dolduğunda (saat 15 dk ileri sarılarak) | ✅ Sonuç sunucudan geldi; koltuklar ve mikrofon korundu |
| Yönetici paneli: aktif PK izleme, bitirme (test), iptal, geçmiş, kayıtlar | ✅ |

**Gerçek cihaz testleri:** Belgenin istediği farklı cihazlarda ve aynı anda gelen hediyelerle testler, gerçek zamanlı altyapı (LiveKit + sunucu) kurulduğunda yapılmalı.

## Sunucuya taşınacaklar

| Tablo | Alanlar |
|---|---|
| `pk_sessions` | id, kind, status, room_id, opponent_room_id, duration_min, config_version, start_at, end_at, result_json, cancel_reason |
| `pk_teams` | id, pk_id, name, color, room_id, score |
| `pk_participants` | user_id, pk_id, team_id, joined_at, state |
| `pk_score_events` | tx_id (benzersiz), pk_id, team_id, sender_id, gift_id, coins, points, status, at |

Ek gereksinimler:
- **Tutarlılık:** Hediye işlemi (`wallet_transactions`) ve PK puan kaydı aynı veritabanı işleminde yazılmalı; bu yapılamıyorsa telafi kuyruğu kullanılmalı.
- **Sayaç:** Bitiş zamanını sunucudaki zamanlanmış bir iş tetiklemeli. Telefonlara süre ve skor gerçek zamanlı kanaldan gönderilmeli.
- **Kötüye kullanım:** Saniye başına hediye sınırı ve şüpheli yoğunluk uyarısı eklenebilir.

## Karar bekleyenler

- **Oda içi PK'yı kim başlatır?** Şu an oda sahibi ve yöneticiler.
- **Destekçi ödülleri:** PK sonunda en çok destek veren kişiye rozet veya çerçeve verilecek mi?
- **Hazırlık süresi:** 5 saniye yeterli mi?
