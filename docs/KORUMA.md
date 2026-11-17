# Koruma

Birinin yanında olduğunu göstermenin yolu. Birine **Koruma Kartı** hediye eden onun koruyucusu olur; sonra ona
gönderdiği her hediye koruma puanı getirir. En çok puanı olan koruyucu, korunan kişinin profilinde "KORUMA" çerçevesiyle
görünür. Birbirine kart gönderen iki kişi, ikisinin profilinde de birbirini görür.

Sunucu: `server/api/guards.mjs` (yollar ve gece düşüşü), sayılar `guard-rules.mjs`, tablo `090_guards.sql`.
Uygulama: `app/src/app/koruma/` (Benim Koruma, kurallar), `lib/live/guard.ts`, `lib/guard-core.ts`, profilde ve oda
kişi kartında Koruma alanı (`components/person-showcase.tsx`).

## Kurallar

| Kural | Değer |
| --- | --- |
| Koruma nasıl başlar | Koruma Kartı (`koruma`) hediyesi gidince. Kart sıradan bir hediyedir: jetonu düşer, alana elmas olur. Kartın jetonu ilk puandır. |
| Puan | Koruyucunun o kişiye gönderdiği her hediye: 1 jeton = 1 puan. Oda, mesaj, profil, aile, çanta, bağ, şanslı hediye: hepsi sayılır (`gift_events` tetikleyicisi). Başkasının hediyesi saymaz. |
| Gece düşüşü | Her gece 00:00 (Türkiye saati), bir önceki gün hiç hediye yoksa: 5.000 puan ve üstünde puanın %10'u, altında 1.000 puan düşer (en az 0). Kartın gönderildiği günün gecesi düşmez. Günde bir kez; sunucu bir geceyi kaçırırsa telafi etmez. |
| Bitirme | Yalnız koruyucu bitirir (Benim Koruma › Koruduklarım › uzun bas). Puan sıfırlanır; yeniden kart sıfırdan başlar. Korunan bitiremez. |
| Korumayı kapatmak | Kişi kendi korumasını kapatırsa kimse yeni koruyucusu olamaz (kart 403 döner, jeton düşmez). Olan koruyucular kalır. |
| Profilde görünmek | En çok puanlı koruyucu, puanı 0'dan büyükse ve kişinin eşiğini geçiyorsa. |
| Eşik | Kişinin koyduğu en düşük puan. En çok 50.000 × (Yankı seviyesi + 1). Haftada bir değişir. |
| Liste | Benim Koruma'da iki yön ayrı ayrı, puana göre ilk 50. |
| Engel | Engelli kişiler arasında kart gitmez (hediye kuralı). |

## Sahiplerin kararı

- **Kartın fiyatı 999 jeton** (varsayılan). Yönetim › Hediyeler'den değiştirilebilir.
- **Eşik sınırı** (50.000 × (Yankı + 1)) bizim önerimiz. Örnekteki uygulama "Çekicilik seviyesi yükseldikçe sınır artar"
  diyor ama sayı vermiyor.

## Eski APK'lar

Kart eski uygulamalarda sıradan bir hediye olarak "İkili" rafında görünür ve gönderilebilir: Koruma yine başlar ve puan
yine sayılır. Eski uygulamada Benim Koruma sayfası, profildeki Koruma alanı ve kurallar yoktur.

## Veri

`guards` (çiftler, biten çiftler `ended_at` ile kalır) ve `guard_settings` (kapalı mı, eşik) kişinin veri kopyasında
(`my-data.mjs` → `guard`). Hesap silinince ikisi de silinir (`ON DELETE CASCADE`).
