# Rol ve Yetki Modeli (merkezi panel)

Tüm yetkiler tek bir merkezi panelden (uygulamada: **Ben > Rol ve Yetki Merkezi**, `app/src/app/yetki.tsx`, model `app/src/data/rbac.ts`) yönetilir.

## Tablolar

| Tablo | Alanlar | Açıklama |
| --- | --- | --- |
| `roles` | id, name, priority, protected, created_by, created_at | Rol tanımları (Super Admin, Admin, Moderatör, BD, özel roller) |
| `role_permissions` | role_id, permission_key, effect (`allow`/`deny`) | Rolün izinleri ve açık yasakları |
| `role_scopes` | role_id, scope_type (`platform`/`region`/`agency`/`room`) | Rolün atanabileceği kapsamlar |
| `user_roles` | id, user_id, role_id, scope_type, scope_id, granted_by, granted_at, expires_at | Kullanıcılara atanmış roller (bir kullanıcının birden çok rolü olabilir) |
| `permission_audit_logs` | id, actor_id, action, target, before_json, after_json, result, reason, ip, at | Yetki değişikliklerinin değiştirilemez geçmişi (reddedilen denemeler dahil) |
| `moderation_actions` | id, actor_id, user_id, action (mute/ban/unban/warn), scope_type, scope_id, reason, duration, expires_at, result, at | Ban, susturma vb. işlemler |
| `commission_rules` | id, party (`agency`/`bd`), rate, basis, version, effective_from, created_by | BD ve ajans gelir paylaşımı (sürümlü) |
| `permissions` (kodda) | key, label, group, critical, min_scope | Desteklenen işlem türleri kataloğu |

## İzinler (işlem türleri)

Kullanıcıları görüntüle, Kullanıcı susturma, Kullanıcı banlama (kritik), Oda yönetimi, Ajansları görüntüle, Ajans oluşturma başvurusu, Ajans atama, BD komisyon raporunu görüntüle, Komisyon oranı değiştirme (kritik, yalnız platform kapsamı), Finansal raporları görüntüle (kritik), Rol oluşturma (kritik, platform), Rol ve yetki değiştirme (kritik, platform).

## Kapsam

`platform ⊃ bölge ⊃ ajans ⊃ oda`. Bir atama yalnızca kendi kapsamını ve altını etkiler (ör. Marmara bölgesi moderatörü, Marmara'daki ajansların odalarında işlem yapabilir; Ege'de yapamaz).

## Birleşim ve öncelik kuralı

Bir kullanıcının etkin izni, kapsamı hedefi kapsayan rollerinin birleşimidir. Çelişkide sıra:

1. **Açık yasak (deny) her zaman kazanır.**
2. **Kritik işlemlerde** yalnızca gereken kapsamdaki (ör. platform) yetki sayılır; gerekçe zorunludur, kayda yazılır.
3. Aksi halde kapsamı hedefi kapsayan **en yüksek öncelikli** rolün izni geçerlidir.
4. Eşleşme yoksa **reddet** (varsayılan deny).

Güvenlik sınırları: kimse kendi rolünü değiştiremez/kaldıramaz; sahip olmadığı izni başkasına veremez; kendinden yüksek öncelikli rolü düzenleyemez/atayamaz; Super Admin korumalıdır. Tüm kontroller sunucuda yapılır.

## Esneklik sınırı

Yeni rol, izin kombinasyonu, kapsam ve atama **kod değiştirmeden** panelden eklenir. Daha önce hiç olmayan **yeni bir işlem türü** eklenirse (yeni bir yönetim işlemi), o işlemin yazılımda uygulanması ve sunucuda yetki kontrolüne bağlanması gerekir; ardından panelde izin olarak görünür.

## Komisyon (örnek)

Yayıncı 100.000 💎 (kesinti yok) · Ajans %40 = 40.000 💎 · BD %5 × (yayıncı + ajans) = 7.000 💎 · platform maliyeti 147.000 💎. Oranlar `commission_rules` üzerinden sürümlenir; geçmiş hak edişler eski sürümle kalır.
