# Ajans Başvuru Sistemi ve Yönetim Paneli

Uygulamada:
- **Başvuru sahibi:** Ben > Ajansa katıl / ajans başvurusu > Ajans kur (`app/src/app/ajans/basvuru.tsx`)
- **BD / Admin paneli:** Ben > Ajans başvuru yönetimi (`app/src/app/ajans/yonetim/`)
- **Ajans hesabı:** `app/src/app/ajans/hesap/[id].tsx`
- **İş kuralları ve yetki kontrolleri:** `app/src/lib/agency-apps.ts`

> Prototip: backend yok. `lib/agency-apps.ts` sunucunun yerini tutar. Her işlem fonksiyonu yapan kişinin yetkisini merkezi rol modeliyle (`data/rbac.ts`, `resolve`) yeniden kontrol eder, arayüze güvenmez. Reddedilen denemeler de denetim kaydına yazılır.

## İş akışı

```
Taslak → Başvuru Alındı → Ön İncelemede → BD Değerlendirmesinde → Admin Onayı Bekleniyor → Onaylandı
                                 ↑               │  ↑                      │
                                 └ Ek Bilgi Bekleniyor (yanıt gelince kaldığı yere döner)
Her açık aşamadan: Reddedildi (gerekçe zorunlu) · Askıya Alındı (gerekçe zorunlu, geri alınabilir) · Başvuru İptal Edildi (başvuru sahibi)
```

Onaydan sonra ajans hesabı **Kurulum** durumunda açılır:

1. Ajans hesabı oluşturuldu (benzersiz `AGY-xxxxxx` kimliği ve davet kodu)
2. Sözleşme hazırlandı ve ajans sahibi imzaladı
3. Komisyon kuralı tanımlandı (oran, hesaplama tabanı, geçerlilik tarihi, gerekçe)
4. Ajans Coins Bank etkinleştirildi
5. Finansal doğrulama: ajans sahibinin eklediği ödeme hesabı doğrulandı
6. Para çekme yetkisi **ayrıca** açıldı (1–5 tamam değilse sunucu reddeder)

Başvurunun onaylanması tek başına para çekme yetkisi vermez.

## Başvuru formu

| Alan | Zorunlu |
| --- | --- |
| Ajans adı, ad soyad | Evet |
| E-posta (kodla doğrulanır), telefon (kodla doğrulanır) | Evet |
| Faaliyet ülkesi, şehir / bölge | Evet |
| Ajans deneyimi (4 seçenek) | Evet |
| Tahmini yayıncı sayısı | Evet |
| Gizlilik bildirimi ve veri işleme onayı | Evet |
| Önceki platformlar, şirket bilgisi, bağlantılar, yayıncı planı, büyüme hedefi, ek açıklama, belge / kanıt | Hayır |

- **Vergi numarası istenmez.**
- Form taslak olarak kaydedilebilir.
- Göndermeden önce "Bilgilerini kontrol et" adımı var.
- Gönderince `SC-AJ-YYYY-NNNNNN` biçiminde başvuru numarası verilir.
- Başvuru sahibi durumu ve geçmişi takip eder, ek bilgi taleplerine yanıt verir (belge ekleyebilir), karar öncesinde başvuruyu iptal edebilir, ret kararına itiraz edebilir.
- Başvuru sahibi personel adlarını ve dahili notları görmez; yalnız kendisine yönelik notları (ek bilgi sorusu, ret / askı gerekçesi) görür.

## Yetkiler (Rol ve Yetki Merkezi'nde "Ajans başvurusu" grubu)

| İzin | Varsayılan rol | Kritik |
| --- | --- | --- |
| `agency_apps.view_assigned`: atanmış başvuruları görüntüle | BD, Admin | |
| `agency_apps.view_all`: tüm başvuruları görüntüle | Admin | |
| `agency_apps.review`: dahili not, ek bilgi, Admin onayına gönderme | BD, Admin | |
| `agency_apps.documents`: belgeleri görüntüle | BD, Admin | |
| `agency_apps.assign`: ön incelemeye alma, BD atama / devir | Admin | |
| `agency_apps.decide`: kesin onay, ret, askıya alma | Admin | ✓ |
| `agencies.manage`: sahip / yöneticiler, sözleşme | Admin | |
| `agencies.commission`: ajans komisyon kuralı (yalnız platform kapsamı) | Admin | ✓ |
| `agencies.coinsbank`: Coins Bank etkinleştirme | Admin | ✓ |
| `agencies.payout`: finansal doğrulama, ödeme yetkisi, ödeme onayı, ters kayıt (yalnız platform kapsamı) | Admin | ✓ |
| `agencies.performance`: atanmış ajans performansı | BD, Admin | |

- BD'nin kesin onay, komisyon değiştirme, ödeme onaylama ve kullanıcı banlama yetkisi **varsayılan olarak kapalı**dır. Panelden ayrıca verilebilir.
- Kapsam bölgeye göredir. Örneğin Marmara BD'si yalnız Marmara'daki başvurulara atanabilir. Bölge dışı ülkeler yalnız platform kapsamındaki rollerce görülür.
- **Görevler ayrılığı:** geçerli komisyon kuralını tanımlayan kişi aynı ajansın ödemesini onaylayamaz.

## Güvenlik

- E-posta ve telefon doğrulaması zorunludur.
- **Mükerrer kontrol:** aynı e-posta veya telefonla açık başvuru, aynı adla ajans ya da açık başvuru varsa gönderim ve onay reddedilir. Bir kişinin aynı anda tek açık başvurusu olabilir.
- Başvuru sahibi yalnız kendi başvurusunu görür ve değiştirir. Başkasınınkine erişim denemesi kaydedilir.
- Belgeler yalnız yetkili personele görünür ve her görüntüleme kişi ve saatle kaydedilir. Canlıda belgeler şifreli depolanmalı ve süreli bağlantıyla sunulmalıdır.
- Ajans sahibi yalnız kendi ajansının finansal kayıtlarını görür. BD performans görünümünde ödeme ve finans işlemi yapamaz.
- Ödeme hesabı değişince doğrulama sıfırlanır ve ödeme yetkisi kapanır.
- Hiçbir kayıt silinmez:
  - Başvuru durumları ileri gider, her değişiklik tarih, saat, kişi ve açıklamayla tutulur.
  - Komisyon kuralları sürümlenir; eski sürüm kapatılır, düzenlenmez.
  - Hak ediş düzeltmeleri ters kayıtla yapılır.
- Ajans komisyonu yayıncı kazancından düşülmez. Yayıncı kazancı ve ajans hak edişi ayrı defterlerdedir.

## Tablolar (kodda karşılıkları)

| Tablo | Tip (`lib/agency-apps.ts`) | Önemli alanlar |
| --- | --- | --- |
| `agency_applications` | `Application`, `ApplicationForm` | number, applicant_id, form alanları, email_verified, phone_verified, status, resume_to, assigned_bd, submitted_at, decided_at, decision_reason, agency_id |
| `agency_application_documents` | `AppDocument` | application_id, kind, file_ref (şifreli), size, uploaded_at |
| `agency_application_reviews` | `Review`, `InfoRequest` | application_id, actor_id, kind, text, scores, question / answer |
| `agency_application_status_history` | `StatusChange` | application_id, from, to, actor_id, note, at |
| `agency_assignments` | `Assignment` | application_id, bd_id, assigned_by, kind (Atama/Devir), note |
| `agencies` | `AgencyAccount` | id, code, name, owner_id, bd_id, country, city, status, coins_bank_enabled, payout_enabled |
| `agency_users` | `AgencyUser` | agency_id, user_id, role (Sahip/Yönetici/Asistan), added_by |
| `agency_agreements` | `Agreement` | agency_id, version, status, start, end, prepared_by, signed_at |
| `agency_commission_rules` | `CommissionRule` | agency_id, version, rate, basis, effective_from, effective_to, created_by, reason |
| `agency_earnings_ledger` | `LedgerRow` | agency_id, host_id, period, base, rate, rule_version, amount, status, reverses |
| `agency_payout_accounts` | `PayoutAccount` | agency_id, holder, iban, status, verified_by |
| `agency_payout_requests` | `PayoutRequest` | agency_id, amount, status, requested_by, decided_by, reason |
| `audit_logs` | `Audit` | actor_id, action, target, detail, result (Uygulandı/Reddedildi), at |

## Demo ipuçları

- Panelin üstündeki sarı çubuktan farklı personel olarak işlem yapabilirsin:
  - Sen: Super Admin
  - Zeynep: Admin
  - Selin: BD Marmara
  - Mert: BD Ege
- Ajans hesabında "Ajans sahibi" seçeneğiyle sahip görünümüne geçilir.
- Hazır örnekler:
  - `SC-AJ-2026-000109` Admin onayı bekliyor.
  - `SC-AJ-2026-000104` ek bilgi bekliyor.
  - `AGY-100081` Melodi Ajans aktif, Coins Bank ve ödeme yetkisi açık.
- **Görevler ayrılığı denemesi:** komisyon kuralını "Sen" olarak tanımla, ödemeyi "Sen" ile onaylamayı dene; işlem reddedilir. Zeynep ile onaylanır.
