# Etkinlik Merkezi

Şartname: kullanıcının gönderdiği "SimilarClub — Etkinlik Merkezi" belgesi (19 bölüm, 5 aşama). Sahibin kararları: önce Aşama 1–3, sonra Aşama 4; odadaki eski "Oda etkinlikleri" listesi yeni sisteme geçer; her oda sahibi başvurabilir (oda seviyesi şartı Canlı ayarlar'dan yükseltilebilir). Aşama 1–4 yapıldı; Aşama 5 kaldı.

## Bu adımda yapılanlar (Aşama 1–3)

| Şartname | Durum | Nerede |
|---|---|---|
| 2. Erişim: Odalar sekmesindeki takvim, odanın içi, bildirim | ✅ | Odalar › takvim düğmesi; oda menüsü › Etkinlikler; `/?etkinlik=ID` bağlantısı ve bildirime dokunma |
| 2. İki sekme: Etkinlik Alanı, Odamın Etkinlikleri | ✅ | `components/events/event-center.tsx` |
| 3. Kartlar (kapak, ad, tür, düzenleyen, oda, zaman, durum, katılım, kapasite) | ✅ | `components/events/event-card.tsx` |
| 3.1 Filtreler (durum, tür, zaman, sıralama, takip ettiğim odalar), birlikte çalışır | ✅ | Tarih seç (takvimden gün) sonraya kaldı; Bugün/Yarın/Bu Hafta/Şu An var |
| 3.2 Arama (ad, oda, düzenleyen, tür), yazdıkça | ✅ | 300 ms bekleyip sunucuda arar |
| 4. Detay sayfası ve duruma göre düğmeler | ✅ | `event-detail.tsx`. "Paylaş" ve hatırlatma anahtarı Aşama 4'te eklendi |
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

## Aşama 4 (bu adımda)

| Şartname | Durum | Nerede |
|---|---|---|
| 8. Hatırlatmalar: 1 saat ve 15 dk önce, başlarken | ✅ | Yer ayırtmış kişiye bildirim (açık uygulamaya da gider) ve Similar Ekibi'nde kişisel not. Sunucunun etkinlik kontrolü (`sweepEvents` › `remindEvents`) gönderir; elle başlatınca başlangıç hatırlatması hemen gider |
| 8. Hangi hatırlatmalar gider | ✅ | Canlı ayarlar › Etkinlikler › Hatırlatmalar (`event_reminders_off`); varsayılan üçü de açık |
| 8. Kişi tercihi | ✅ | Bir etkinlik için: detay ekranında "Bu etkinliği hatırlat". Tüm etkinlikler için: Ayarlar › Bildirimler › Etkinlik hatırlatmaları (canlı sürümde sunucuda tutulur) |
| 8. Aynı hatırlatma iki kez gitmez | ✅ | `event_reminders_sent` (etkinlik, kişi, tür, başlangıç saati benzersiz): yeniden başlatma ya da aynı anda iki kontrol çift göndermez; saati değişen etkinlik yeni saati için yeniden hatırlatılır. Sonradan yer ayırtana geçmiş zamanın hatırlatması gitmez (40 dk kala ayırtan yalnız 15 dk ve başlangıç hatırlatmasını alır) |
| 8. İptal bildirimi | ✅ | Bildirim vardı; artık Similar Ekibi'nde gerekçeli kişisel not da var (oda kapanınca, iptal, yönetim kaldırınca) |
| 13. Paylaş: telefonun paylaşım ekranı | ✅ | Detay › Paylaş › Diğer uygulamalarla paylaş: kısa metin, `similarclub://?etkinlik=ID` ve web bağlantısı; uygulama Odalar'da `?etkinlik=` okuyup etkinliği açar |
| 13. Arkadaşına gönder | ✅ | Odayı paylaşır gibi takip ettiğin ya da mesajlaştığın kişiye mesaj. Mesaj etkinliği taşır (`messages.event_id`); yeni uygulama etkinlik kartı çizer, eski uygulama metni gösterir (metinde bağlantı yok, ad Etkinlik Alanı'nda aranır) |
| 13. Bağlantıdan açılan kaldırılmış/bitmiş etkinlik | ✅ | "Yayından kaldırıldı" (gerekçeyle), "Etkinlik iptal edildi", "Etkinlik sona erdi · N katılımcı"; görülemiyorsa "Etkinlik açılamadı" |
| 14. Raporlar | ✅ | Oda sahibi: Odamın Etkinlikleri › Etkinlik raporu (yalnız kendi odaları, oda seçilebilir). Yönetim: Yönetim › Etkinlikler › Rapor (tüm odalar). 7 / 30 / 90 gün |
| 2. Profilde etkinlik geçmişi | ✅ | Ben › Etkinliklerim: merkezi Odamın Etkinlikleri'nde açar (yer ayırttıklarım, geçmiş ayırtmalarım, odalarımın etkinlikleri) |

**Rapor nasıl sayar:** dönemde başvurusu yapılan ya da başlangıç saati gelen etkinlikler (taslaklar sayılmaz). Etkinlik, onaylanan (incelemede onay almış; sonra iptal edilse de), reddedilen, iptal edilen, yer ayırtma (iptal edilenler hariç), katılımcı (odada bulunan herkes), katılım oranı (biten etkinliklerde yer ayırtıp gelen / yer ayırtan), ortalama katılım (başlayan etkinlik başına), en çok katılım alan 5 tür, nasıl bitti (düzenleyen, süre, oda kapandı, başlatılmadı, yönetim) ve dönemdeki son 20 başlangıç/bitiş kaydı.

## Sonraya kalanlar

- **Aşama 5:** temaya özel çerçeve ve sohbet balonu ("kıyafet"), yarışma sıralaması, gelişmiş istatistikler (gün/saat dağılımı, oda karşılaştırma, rapor dışa aktarma), bekleme listesi (`waiting` durumu hazır), takvimden tarih seçme.
- Hatırlatma saatleri (1 saat / 15 dk) sabit; yalnız açık/kapalı ayarlanır. Kişiye özel hatırlatma saati yok.
- Paylaşım bağlantısı giriş yapmamış kişide giriş ekranından sonra etkinliği açmaz (bildirim bağlantılarıyla aynı davranış).
- Tema ve tür görselleri ChatGPT ile çizilecek (GORSEL_URETIM_LISTESI § 20); o zamana kadar renk geçişi ve simge.

## Kurallar (varsayılan, Canlı ayarlar › Etkinlikler)

Başvuru Lv.1 oda ve üstü · en erken 30 dk sonrası için · en uzun 180 dk · en fazla 500 kişi · başlangıçtan 15 dk içinde başlatılmazsa biter ve ihlal yazılır · 30 günde 3 ihlalde 14 gün başvuru yapılamaz. Etkinlik başlangıçtan 10 dk önce başlatılabilir; zamanı geldiğinde odada biri varsa kendiliğinden başlar. Yer ayırtana 1 saat ve 15 dk önce, bir de başlarken hatırlatma gider (üçü de açık).

## Teknik

- Tablolar (`server/api/migrations/055_event_center.sql`): `event_categories`, `events` (başvuru durumu ve çalışma ayrı alanlarda), `event_reservations`, `event_participants`, `event_log`. Aşama 4 (`059_event_center_more.sql`): `event_reminders_sent`, `event_reminder_optout`, `event_reservations.remind`, `messages.event_id`.
- Aşama 4 istekleri: `POST /api/events/remind`, `GET`/`POST /api/events/reminders`, `GET /api/events/report?days=&room=` (oda sahibi), `GET /api/admin/events/report?days=` (yönetim); `POST /api/messages` artık `event` alır.
- Sunucu: `server/api/events.mjs` (istekler, zamanlayıcı `EVENT_SWEEP_MS`), `server/api/event-rules.mjs` (temalar, durumlar, zaman pencereleri, plan kontrolü).
- Bağlantılar: oda kapatma (`rooms.mjs`), LiveKit giriş ve oda boşalması (`live.mjs`), `GET /api/room` içinde odanın etkinlik özeti, veri kopyası (`my-data.mjs`), kapak yüklemesi (`media.mjs` türü `eventcover`).
- Uygulama: `app/src/components/events/*`, `app/src/lib/events.ts`, `app/src/components/admin/events-admin.tsx`.
- Eski `room-events.mjs` kurulu eski sürümler için duruyor; yeni uygulama kullanmıyor. Eski kayıtların zamanı serbest yazı olduğu için yeni sisteme aktarılmadı.
- Kişisel veri: UK GDPR. Etkinliği oluşturan, rezervasyonlar (hatırlatma tercihiyle), katılımlar, gönderilen hatırlatmalar, "tüm hatırlatmalar kapalı" tercihi ve mesajın taşıdığı etkinlik veri kopyasında; hesap silinince hatırlatma kayıtları ve tercih silinir. İşlem kaydı (`event_log`) yönetim kaydıdır.
- Testler: `server/api/test/events.test.mjs`, `event-reminders.test.mjs` (zamanlama, ikinci bir sunucu aynı veritabanını tararken ve yeniden başlarken çift gönderim yok, kişi/etkinlik/platform kapatmaları, paylaşım mesajı, kaldırılan etkinlik), `event-report.test.mjs` (sayılar, yalnız kendi odaları, dönem); uygulama: `app/tests/events.test.ts`, `dm-thread.test.ts`, `live-settings-format.test.ts`.
