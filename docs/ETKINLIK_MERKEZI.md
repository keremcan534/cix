# Etkinlik Merkezi

Şartname: kullanıcının gönderdiği "SimilarClub — Etkinlik Merkezi" belgesi (19 bölüm, 5 aşama). Sahibin kararları: önce Aşama 1–3, sonra Aşama 4; odadaki eski "Oda etkinlikleri" listesi yeni sisteme geçer; her oda sahibi başvurabilir (oda seviyesi şartı Canlı ayarlar'dan yükseltilebilir).

## Bu adımda yapılanlar (Aşama 1–3)

| Şartname | Durum | Nerede |
|---|---|---|
| 2. Erişim: Odalar sekmesindeki takvim, odanın içi, bildirim | ✅ | Odalar › takvim düğmesi; oda menüsü › Etkinlikler; `/?etkinlik=ID` bağlantısı ve bildirime dokunma |
| 2. İki sekme: Etkinlik Alanı, Odamın Etkinlikleri | ✅ | `components/events/event-center.tsx` |
| 3. Kartlar (kapak, ad, tür, düzenleyen, oda, zaman, durum, katılım, kapasite) | ✅ | `components/events/event-card.tsx` |
| 3.1 Filtreler (durum, tür, zaman, sıralama, takip ettiğim odalar), birlikte çalışır | ✅ | Tarih seç (takvimden gün) sonraya kaldı; Bugün/Yarın/Bu Hafta/Şu An var |
| 3.2 Arama (ad, oda, düzenleyen, tür), yazdıkça | ✅ | 300 ms bekleyip sunucuda arar |
| 4. Detay sayfası ve duruma göre düğmeler | ✅ | `event-detail.tsx`. "Paylaş" ve "Hatırlatma kur" Aşama 4'te |
| 5. Başvuru formu, taslak, inceleme, ret gerekçesi, yeniden gönderme | ✅ | `event-form.tsx`; kapak 16:9 kesilip yüklenir |
| 6. Yetkiler | ✅ | Başvuru/düzenleme/iptal: oda sahibi. Başlat/bitir: sahip ve Süper Yönetici. Katılımcıları görme: oda yöneticileri. Onay/ret/kaldırma: platform yöneticisi |
| 7. Rezervasyon (kimlik, açık mı, kapasite, mükerrer, iptal) | ✅ | Bekleme listesi için `waiting` durumu ayrıldı, açılmadı; ücretli rezervasyon yok |
| 9. Canlı oda: başlık, süre, katılımcı, tema, bitiş, oda kapanınca bitme | ✅ | `components/events/room-events.tsx`; sunucuda her 30 sn kontrol |
| 10. Tema ve efektler, kapatılabilir | ✅ (geçici görünüm) | 9 tema, oda seviyesiyle açılır; "Efektleri kapat" ve "Animasyonları azalt" efekti kapatır. Görseller: GORSEL_URETIM_LISTESI § 20 |
| 11. Odamın Etkinlikleri: başvuru, inceleme, yaklaşan, süren, biten, iptal | ✅ | Ayrıca "Yer ayırttıklarım" |
| 12. Kurallar: aynı saatte tek etkinlik, kapasite, geç başlatma yaptırımı | ✅ | Tolerans, süre, kapasite, ihlal sınırı ve kısıt Canlı ayarlar › Etkinlikler'de |
| 15. Yönetim paneli: kuyruk, onay, ret, kaldırma, arama, türler, kurallar | ✅ | Yönetim › Etkinlikler; kurallar Canlı ayarlar'da; tema atama türün varsayılan teması olarak |
| 16. Sunucu durumu belirler, tekrar başlatma/rezervasyon engelli | ✅ | Odada tek süren etkinlik veritabanı düzeyinde zorunlu |
| 17. Güvenlik | ✅ | Yetkiler sunucuda; metinler iletişim filtresinden geçer; her işlem kayıtlı |

## Sonraya kalanlar

- **Aşama 4:** hatırlatmalar (1 saat / 15 dk önce / başlarken, kullanıcı tercihi), paylaşım bağlantısı, profilde etkinlik geçmişi, oda sahibi ve yönetim raporları (§ 14).
- **Aşama 5:** temaya özel çerçeve ve sohbet balonu ("kıyafet"), yarışma sıralaması, gelişmiş istatistikler, bekleme listesi, takvimden tarih seçme.
- Tema ve tür görselleri ChatGPT ile çizilecek (GORSEL_URETIM_LISTESI § 20); o zamana kadar renk geçişi ve simge.

## Kurallar (varsayılan, Canlı ayarlar › Etkinlikler)

Başvuru Lv.1 oda ve üstü · en erken 30 dk sonrası için · en uzun 180 dk · en fazla 500 kişi · başlangıçtan 15 dk içinde başlatılmazsa biter ve ihlal yazılır · 30 günde 3 ihlalde 14 gün başvuru yapılamaz. Etkinlik başlangıçtan 10 dk önce başlatılabilir; zamanı geldiğinde odada biri varsa kendiliğinden başlar.

## Teknik

- Tablolar (`server/api/migrations/055_event_center.sql`): `event_categories`, `events` (başvuru durumu ve çalışma ayrı alanlarda), `event_reservations`, `event_participants`, `event_log`.
- Sunucu: `server/api/events.mjs` (istekler, zamanlayıcı `EVENT_SWEEP_MS`), `server/api/event-rules.mjs` (temalar, durumlar, zaman pencereleri, plan kontrolü).
- Bağlantılar: oda kapatma (`rooms.mjs`), LiveKit giriş ve oda boşalması (`live.mjs`), `GET /api/room` içinde odanın etkinlik özeti, veri kopyası (`my-data.mjs`), kapak yüklemesi (`media.mjs` türü `eventcover`).
- Uygulama: `app/src/components/events/*`, `app/src/lib/events.ts`, `app/src/components/admin/events-admin.tsx`.
- Eski `room-events.mjs` kurulu eski sürümler için duruyor; yeni uygulama kullanmıyor. Eski kayıtların zamanı serbest yazı olduğu için yeni sisteme aktarılmadı.
- Kişisel veri: UK GDPR. Etkinliği oluşturan, rezervasyonlar ve katılımlar veri kopyasında; işlem kaydı (`event_log`) yönetim kaydıdır.
