# Coins Bank ve yayıncı/ajans yaşam döngüsü

Uygulamada: **Ben > Coins Bank** (`app/src/app/coins-bank.tsx`), kurallar `app/src/data/rules.ts` (uygulamada sabit varsayılanlar, salt okunur).

Finans yönetimi (kurallar, ödeme onayı/reddi, mutabakat) mobil uygulamada yer almaz; ayrı Finance Control platformuna taşınıyor. Uygulamada kullanıcı bakiyesini görür, çekim talebi oluşturur ve talebin durumunu izler; manuel incelemedeki talepte "Finans ekibi inceliyor" notu görünür.

## Para birimleri
- **Coins**: satın alınır, hediyede harcanır.
- **Diamonds**: yayıncı kazanç ölçüsü; Coins ile aynı bakiye değildir (`creatorDiamondsPerCoin`, `diamondsPerUsd` = 5.000 💎 = 1 USD).
- **Bonus Credits**: kampanya/davet bakiyesi; varsayılan olarak çekilemez (`bonusCashable = 0`).

## Akışlar
1. Coins satın alma → ödeme sağlayıcısı doğrular → bakiye **bir kez** yansır (idempotent).
2. Hediye → Coins düşer → dağıtım motoru yayıncı elmasını ve hak edişleri kurala göre hesaplar → her işlem benzersiz ref + denetim kaydı + kural sürümü.
3. Yayıncı / Ajans / BD Coins Bank: toplam, bekleyen (`pendingDays`), kesinleşmiş, çekilebilir, ödeme sürecinde, tamamlanan/reddedilen, geçmiş.
4. Para çekme: min `minWithdrawDiamonds`, max `maxWithdrawDiamonds`, haftalık `weeklyWithdrawLimitDiamonds`; doğrulanmış ödeme hesabı; talep anında bakiye **bloke**; başarısız ödeme doğrulanınca serbest; aynı bakiye iki talepte kullanılamaz; `autoApproveUnderDiamonds` altı otomatik, üstü manuel onay.

## Komisyonlar (yayıncıdan kesilmez)
- Ajans: `agencyCommission` (%40) × bağlı yayıncıların uygun kazancı.
- BD: `bdCommission` (%5) × BD'nin getirdiği ajansın uygun yayıncı tabanı; her kazanç için **bir kez** hesaplanır (çift komisyon engeli). BD'ye varsayılan olarak ban yetkisi verilmez (Rol ve Yetki Merkezi).
- Örnek: yayıncı 100.000 💎 = 20 USD, ajans 40.000 💎 = 8 USD, BD ayrı → platform yükümlülüğü 28 USD + BD.

## Yayıncı ve ajans kuralları (süreler panelden ayarlanır)
| Kural | Varsayılan | Alan |
| --- | --- | --- |
| Ajanssız yayıncı N gün içinde ajansa katılmazsa yönetim hesabına geçer; kazancı ve çekimi normal devam eder, ajans kazancı oluşmaz | 3 gün | `hostAgencyJoinDays` |
| Ajansa kayıtlı yayıncı N gün çevrimiçi olmaz ve çekim yapmazsa ajanstan düşer, yönetim hesabına aktarılır | 90 gün | `agencyHostInactiveDays` |
| Ajans aktivasyonu: getirilen yayıncı | 20 | `agencyActivationHosts` |
| …bunlardan kazanç hedefini tutan | 10 yayıncı × 10 USD | `agencyActivationEarners`, `agencyActivationEarnUsd` |
| Hedefe ulaşmayan ajans **aday ajans** kalır | — | `agencyStatus()` |
| Her ay eklenmesi gereken yeni yayıncı | 5 | `agencyMonthlyNewHosts` |
| Hedef tutmazsa komisyon düşüşü | 5 puan | `agencyCommissionPenalty` |
| Aktif ajans bu sayının altına inerse tekrar aday olur | 15 | `agencyDemoteBelowHosts` |

## Tablolar
wallets, wallet_transactions, payment_orders, gifts, gift_transactions, diamonds_ledger, creator_earnings_ledger, agency_earnings_ledger, agency_commission_rules, bd_commission_ledger, bonus_ledger, creator_payout_accounts, agency_payout_accounts, payout_requests, payout_transactions, financial_rules, audit_logs. Güncel bakiyeler önbellektir; esas kaynak işlem defterleridir; düzeltme ters kayıtla yapılır.

## Güvenlik
Sunucu tarafı doğrulama, yinelenen satın alma/ödeme engeli, atomik bakiye+defter güncellemesi, şüpheli işlemlerin incelemeye alınması, ödeme hesabı değişikliğinde yeniden doğrulama, kritik değişikliklerin denetim kaydı, görevler ayrılığı (finansal ayarı değiştiren ödemeyi onaylayamaz). Canlıya almadan önce mağaza ödeme politikaları, finansal mevzuat ve ödeme sağlayıcısı gereksinimleri ayrıca doğrulanmalıdır.

## Geliştirme sırası
1) Coins cüzdanı + defter 2) ödeme sağlayıcısı + satın alma doğrulama 3) hediye + Diamonds motoru 4) yayıncı kazanç/çekim 5) ajans hak ediş/çekim 6) BD komisyon/ödeme 7) merkezi finansal kurallar paneli 8) iade, denetim, güvenlik, mutabakat.
