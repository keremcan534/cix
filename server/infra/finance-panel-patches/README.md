# Finans paneli yamaları (geçici)

Bu klasördeki yamalar `keremcan534/similarclup-finance-control` deposu içindir. Claude'un bu oturumda o depoya yazma
izni olmadığı için burada bekliyorlar; panel deposuna uygulanınca bu klasör silinir.

| Yama | Ne |
| --- | --- |
| 0001 | Uygulama › Hediyeler uygulamanın kendi hediyelerini de gösterir; yeni sayfa Uygulama › Emojiler |
| 0002 | Uygulama › Yaptırımlar, Ajans personeli, Mağaza eşyaları, Jeton Noktası; Moderatör rolü; yetkiler (007) |

Uygulamak (panel deposunda, `main`'in güncel hâlinde):

```sh
git am /yol/cix/server/infra/finance-panel-patches/*.patch
npx -y node@24 --test --test-concurrency=1 tests/*.test.ts && npx -y node@24 node_modules/.bin/tsc --noEmit
```

En kolayı: hem `cix` hem `similarclup-finance-control` seçili yeni bir Claude oturumu açıp "panel yamalarını uygula ve
gönder" demek.
