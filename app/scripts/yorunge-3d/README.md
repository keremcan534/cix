# Yörünge 3D görselleri (Blender)

Yörünge'nin roketi, alevi, patlaması, rampası, paraşütü, yakıt bidonu, dumanı ve tuşları bu betiklerle Blender'da
(5.3, Cycles, ekran kartıyla) sıfırdan modellenip işlendi (26 Kasım 2026). Hazır model ya da internetten alınmış görsel
yok; uzay arka planı ve gezegen eski haliyle kaldı (`docs/VARLIK_KAYNAKLARI.md` §4c).

Her betik Blender'ın içinde çalışır ve `out/<ad>/` klasörüne kare kare çizer; `assemble.py` (bilgisayardaki Python,
numpy ve Pillow ile) bunları uygulamanın `assets/games/yorunge/` klasörüne sprite sayfası ya da tek resim olarak koyar.

| Betik | Ne çizer | Uygulamadaki dosya |
| --- | --- | --- |
| `rocket.py` | Krom gövde, kırmızı burun ve kanatlar, altın bantlar, camgöbeği lombar; uzun ekseni çevresinde 24 karede bir tur | `roket-don.webp` (6 × 4), `roket.png` (rampadaki duruş) |
| `flame.py` | Hacimli, dilleri akan motor alevi; 22 kare, `assemble` 16 karelik kesintisiz döngü yapar | `alev-don.webp` (8 × 2) |
| `explosion.py` | Mantaflow ateş ve duman simülasyonu, kıvılcımlar, roketten kopan parçalar | `patlama-don.webp` (6 × 5, 27 kare) |
| `ramp.py` | Çelik rampa, ışıklı ray, kafes kule ve kabin; rayın ortasını ve açısını yazar (oyundaki `RAIL_MID`) | `rampa.webp` |
| `props.py parasut / bidon / duman` | Paraşüt ve kaçış kapsülü, yakıt bidonu, duman bulutu | `parasut.png`, `bidon.png`, `duman.webp` |
| `plate.py tus / tus-acik` | Altın çerçeveli emaye tuş (lacivert; seçiliyken yakut), üç parçaya kesilir | `tus-*.png`, `tus-acik-*.png` |

Örnek (PowerShell, bu klasörde):

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup -P rocket.py -- "$PWD\out\rocket"
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup -P explosion.py -- "$PWD\out\explosion"
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup -P exr2npy.py -- "$PWD\out\explosion"
python post.py out\explosion
python assemble.py out ..\..\assets\games\yorunge
```

Alev ve patlama ışık saçtığı için EXR olarak işlenir (`exr2npy.py`, `post.py`): ışık, saydamlıkta kaybolmasın diye
görünürlüğe çevrilir; koyu uzayın üstünde görüntü işlenen haliyle aynıdır. Patlamanın simülasyonu ekran kartıyla
yaklaşık 10 dakika sürer; `ONLY=4,10,18` gibi bir değişkenle önce birkaç kareye bakılabilir.
