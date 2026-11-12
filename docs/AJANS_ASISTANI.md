# Ajans asistanı

Güncelleme 4, madde 17. Ajans sahibi, ajansına yeni yayıncı getirmesine yardım eden bir **asistan** atar. Asistanın
getirdiği yayıncılar kazandıkça, ajansın o yayıncılardan aldığı komisyonun sahibin belirlediği yüzdesi asistanın
hesabına **elmas** olarak geçer. Pay ajansın komisyonundan çıkar; yayıncının kazancından da platformdan da ek bir şey
çıkmaz.

Kod: `server/api/agency-assistants.mjs` (uç noktalar ve kurallar), `server/api/agency-lib.mjs` (komisyon motorunda
bölüşüm: `assistantAt`, `bookAssistantShare`, `reverseAssistantShares`), `migrations/058_agency_assistants.sql`,
`test/agency-assistant.test.mjs`. Uygulama: `app/src/components/agency-assistants.tsx` (Ajans paneli › **Asistanlar**
sekmesi, asistanın kendi kartı), `app/src/lib/agency-assistant.ts` (örnek hesap), Gelir › Gelir kaynakları
"Ajans asistanı payı".

## Para akışı

Matrah, **ajansın kendi komisyonudur**: komisyon kaydında yayıncının ajansına yazılan `direct` satırı (geçiş komisyonu
varsa ondan sonra kalan). Üst ajansın fark payına dokunulmaz.

```
asistan payı = ajansın komisyonu × pay %          (1/10.000 elmas, sıfıra doğru; küsurat sahipte kalır)
sahibe kalan = ajansın komisyonu − asistan payı
```

Komisyonu yazan işlemin içinde (`calcEvent`), aynı anda:

| Kayıt | Tutar |
|---|---|
| `agency_ledger` `direct` (sahip) | + ajansın komisyonu (değişmedi) |
| `agency_ledger` `assistant` (sahip) | − asistan payı |
| `agency_assistant_ledger` (asistan) | + asistan payı (kesin), `wallet`: cüzdana geçen tam elmas |
| `users.diamonds` ve `ledger` "Ajans asistanı payı" (kanal `asistan`) | + tam elmas |
| `diamond_locks` (kanal `asistan`) | aynı elmas, mağaza jetonu kilidi kadar (`LOCK_DAYS_STORE`, 7 gün) |

**Örnek:** yayıncı 100 elmas kazanır, ajansın oranı %20 → ajansın komisyonu 20 elmas. Pay %80 → asistana 16, sahibe
4 elmas. `agency_commissions.agency_amount` 20 kalır, `assistant_amount` 16 yazılır; ödemede sahibin hesabı 4 elmas
olarak sayılır.

**Küsurat:** cüzdana yalnız tam elmas geçer. Asistanın kesin toplamı birikir; her bölüşümde cüzdana
`⌊kesin toplam⌋ − daha önce geçen` kadar elmas geçer. 7 elmaslık gelirde pay 1,12 elmastır: 1 elmas geçer, 0,12
bekler ve sonraki paylarla tamamlanır. Cüzdana geçen hiçbir zaman kesin toplamı aşmaz.

**İade ve ters kayıt:** iade, hediyenin zamanına tarihli negatif bir gelirdir (`jeton.mjs`); aynı kurallarla, aynı payla
hesaplanır: sahibin `assistant` satırı artı, asistanın satırı eksi, cüzdandan elmas geri alınır. Asistanın bakiyesi
yetmezse alınabildiği kadar alınır; kalan borç olarak kalır ve sonraki paylar önce onu kapatır. Merkezin
`commissions/reverse` ters kaydı da asistan payını aynı yoldan geri alır. Her bölüşüm bir kez yazılır
(`agency_assistant_ledger.commission_id` tekil, ters kayıt `reverses` tekil); satırlar değiştirilemez ve silinemez.

## Kurallar

- **Kim atar:** yalnız ajans sahibi atar, payı değiştirir, çıkarır (merkez `agencies.manage` ile çıkarabilir).
- **Kim asistan olur:** ajansın şu anki yayıncılarından ya da ekibinden biri; sahibin kendisi olamaz; kişi aynı anda
  tek ajansta asistan olabilir.
- **Sınır:** aynı anda en fazla `assistant_policy.max` asistan (varsayılan 1). Merkez, Ajans Merkezi › Kurallar'dan
  değiştirir.
- **Getirdiği yayıncı:** `agency_streamers.invited_by`. Asistanın uygulamadan gönderdiği ve kabul edilen davet
  (`agency_requests.created_by`) ya da asistanın kendi davet koduyla katılım. Asistan kodu ajans kodu gibi
  "Davet koduyla katıl"a yazılır; yayıncı ajansın kendisine katılır. Eski davetler, migration'da kabul edilen davetten
  dolduruldu; ajans koduyla katılımlarda davet eden kaydı yoktu, kod yoluyla kayıt bu sürümden itibaren tutulur.
- **Pay:** %0–100, tam sayı. İlk pay atamayla başlar. Değişiklik **her takvim haftasında bir kez** yapılır ve
  **sonraki pazartesi 00:00'da (Türkiye saati)** başlar; o zamana kadar eski pay sürer. Geçmiş kazançlar değişmez:
  her gelir, gerçekleştiği andaki payla hesaplanır.
- **Çıkarma, ayrılma, silme:** asistanlıktan çıkarılınca, kişi ajanstan ayrılınca (yayıncılığı ve ekip görevi bitince)
  ya da hesabını silince o andan sonra pay yazılmaz. Getirdiği yayıncılar ajansta kalır, komisyonun tamamı sahibe
  yazılır. Sahip, çıkardığı kişiyi aynı hafta yeniden ekleyemez (payın haftalık kuralı böyle aşılmasın diye).

## Destekçi payı neden yok

Ekran örneklerinde destekçilerin jeton yüklemesinden de bir pay vardı. Bizde ajans komisyonu yalnız **yayıncının
geliri** üzerinden yazılır (`income_events`); jeton yüklemeleri (`purchases`) hiçbir ajansa gelir yazmaz. Asistanın
payı ajansın komisyonundan çıktığı için, destekçi tarafında bölüşülecek bir ajans geliri yoktur. Yeni bir gelir icat
edilmedi; destekçi payı yalnız kurallar sayfasında açıklandı.

## API

| Uç nokta | İş |
|---|---|
| `GET /api/agency/assistants?id=` | Sahip (ve merkez): sınır, asistanlar, payları, sayılar |
| `GET /api/agency/assistants/candidates?id=&q=` | Asistan yapılabilecek kişiler (ajansın yayıncıları ve ekibi) |
| `POST /api/agency/assistants/add` `{ id, user, pct }` | Asistan ata; ilk pay hemen başlar |
| `POST /api/agency/assistants/share` `{ id, assistantId, pct }` | Payı değiştir (haftada bir, pazartesiden geçerli) |
| `POST /api/agency/assistants/remove` `{ id, assistantId }` | Asistanlığı bitir |
| `GET /api/agency/me` → `assistant` | Asistanın kendi kartı: pay, kod, getirdikleri, kazancı, son paylar |
| `GET /api/agency/lookup?code=` | Asistan kodunda `assistant.name` döner |
| `GET /api/wallet/income` | Asistan olan ya da olmuş kişide "Ajans asistanı payı" satırı |

## Bilinen sınırlamalar

- Asistan elması, hediyenin jetonu nereden gelirse gelsin mağaza jetonu kilidi kadar kilitlenir.
- İade asistanın elmasını geri alırken kilit satırlarına dokunmaz; kalan kilit en çok kilit süresi boyunca başka
  elmasları da kilitli gösterebilir (para çıkmaz, yalnız erken çıkamaz).
- Ajans hesabındaki elmas (5.000 elmas = 1 USD, ajans ödemesiyle) ile cüzdan elması aynı sayıyla taşınır; cüzdan
  elmasının çekim değeri cüzdan kurallarındadır.
- Ajanstan ayrılan asistanın kaydı, sahip yeni asistan ekleyene ya da çıkarana kadar "Ajanstan ayrıldı" olarak görünür;
  pay ayrıldığı andan itibaren zaten yazılmaz.
- Merkezin asistanlar için ayrı bir ekranı yok; merkez API ile görür ve çıkarır, sınırı Kurallar'dan değiştirir.
