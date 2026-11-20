/// <reference types="node" />
// The VIP tab's Ayrıcalıklar view (lib/vip-screen, app/vip, components/vip): which hero a level draws, what the hero
// says at each level, the grid's columns and card sizes, which rights get the design's pictures and when the
// decorative crown has room. The levels and rights themselves stay the server's (levels-live-core).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SVIP_SHOWN, VIP_PLANS } from '@/data/status';
import { parseLiveLevels, subPlansOf, subRightsOf, vipLevelsOf, vipRightsOf } from '@/lib/levels-live-core';
import {
  BADGE,
  HERO_ART,
  HERO_BOX,
  HERO_COUNT,
  HERO_GLOW,
  HERO_LOAD,
  HERO_LOCK,
  HERO_TEXT,
  PLAN,
  PRICE_PREFIX,
  SUB_BUY_TITLE,
  artGlows,
  artScaleFor,
  badgeSize,
  cardMetrics,
  compactPoints,
  compareCellA11y,
  compareRowA11y,
  defaultPlanDays,
  demoBuyText,
  emptyCells,
  gridColumns,
  groupDigits,
  heroFor,
  lowerCrownFits,
  perkMetrics,
  perkTextRoom,
  planA11y,
  planGrid,
  planWidth,
  priceSize,
  rightArtKey,
  rightsOpen,
  rowsOf,
  saveText,
  snapIndex,
  startIndex,
  statusLine,
  subStatusText,
  testBuyText,
  titleFit,
  tryAmount,
  wideSpaces,
} from '@/lib/vip-screen';

describe('VIP tabelası', () => {
  test('her seviyenin kendi rengi; 10 üstü 10. tabelayı, bozuk değer 1. tabelayı kullanır', () => {
    for (let l = 1; l <= 10; l++) assert.equal(heroFor(l), l);
    assert.equal(HERO_COUNT, 10);
    assert.equal(heroFor(11), 10);
    assert.equal(heroFor(50), 10);
    assert.equal(heroFor(0), 1);
    assert.equal(heroFor(-3), 1);
    assert.equal(heroFor(NaN), 1);
    assert.equal(heroFor(2.7), 2);
  });

  test('tabela resmi tasarımın kutusunda, oranı bozulmadan durur; yazı halkaya değmez', () => {
    // 804×391 picture inside the 812×404 box: the same scale both ways.
    const sx = (HERO_ART.width * HERO_BOX.w) / 804;
    const sy = (HERO_ART.height * HERO_BOX.h) / 391;
    assert.ok(Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9);
    assert.ok(HERO_ART.left + HERO_ART.width <= 1 && HERO_ART.top + HERO_ART.height <= 1);
    assert.ok(HERO_TEXT.left + HERO_TEXT.width < HERO_TEXT.ringLeft, 'metin sütunu halkanın solunda biter');
    // The gold light reaches past the box on every side (the carousel leaves room for it above and below).
    assert.ok(HERO_GLOW.left < 0 && HERO_GLOW.top < 0, 'ışık kutunun solundan ve üstünden taşar');
    assert.ok(HERO_GLOW.left + HERO_GLOW.w > HERO_BOX.w && HERO_GLOW.top + HERO_GLOW.h > HERO_BOX.h, 'sağından ve altından da');
  });

  test('kilitli seviyede iki satır ve Yükle altın çerçevenin içinde kalır (her ekran genişliğinde aynı oranda)', () => {
    // Source px of the 812 px box: the title line, the gap, two status lines (1.3 × statusLocked each), Yükle's gap
    // and height. The hero's text and Yükle scale with the card and not with the phone's text size, so this holds
    // on every phone; the gold border's inner edge is at y ≈ 384.
    const bottom = HERO_TEXT.top + HERO_TEXT.title * 1.18 + HERO_TEXT.statusGap + 2 * HERO_TEXT.statusLocked * 1.3 + HERO_LOAD.gap + HERO_LOAD.h;
    assert.ok(bottom <= 384 - 12, `Yükle'nin altı ${bottom.toFixed(1)}`);
    // Readable and tappable on a 320 dp phone (309 dp card): label ≥ 11 dp, button ≥ 24 dp (with its slop ≥ 44).
    const u320 = 309 / HERO_BOX.w;
    assert.ok(HERO_LOAD.font * u320 >= 11 && HERO_LOAD.h * u320 >= 24);
  });

  test('"Kilitli" etiketi tabelayla büyüyüp küçülür, başlığa değmez', () => {
    // In the hero's source px, so it holds on every width: the chip's bottom stays above the title's capitals (they
    // start about a fifth of an em under the title's line box).
    const chipBottom = HERO_LOCK.top + HERO_LOCK.font * 1.25 + 2 * HERO_LOCK.padY;
    assert.ok(chipBottom + 12 <= HERO_TEXT.top + HERO_TEXT.title * 0.2, `etiketin altı ${chipBottom}`);
    // Still readable on a 320 dp phone (309 dp card).
    assert.ok(HERO_LOCK.font * (309 / HERO_BOX.w) >= 9.5);
  });

  test('kilitli satır sayıdan önce bölünür: ikinci satırda tek kelime kalmaz', () => {
    const t = statusLine({ level: 5, points: 7_500_000, myLevel: 3, myPoints: 2_500_000, decay: false }).text;
    assert.equal(t, 'Bu seviyeye\n5M puan kaldı');
    assert.equal(t.split('\n').length, 2);
  });

  test('ağır yazıda kelime aralığı: boşluklar dörtte bir em boşluğa çevrilir, satır yine bölünebilir', () => {
    assert.equal(wideSpaces('VIP 1 Hakları 5/7'), 'VIP\u20051\u2005Hakları\u20055/7');
    assert.equal(wideSpaces('Sessiz ziyaret'), 'Sessiz\u2005ziyaret');
    assert.equal(wideSpaces('Bu seviyeye\n5M puan kaldı'), 'Bu\u2005seviyeye\n5M\u2005puan\u2005kaldı', 'satır sonu korunur');
    assert.equal(wideSpaces('VIP'), 'VIP');
  });

  test('açık seviye: kalıcıysa "Açıldı · Kalıcı", seviye düşmesi açıksa yalnız "Açıldı"', () => {
    assert.deepEqual(statusLine({ level: 1, points: 500_000, myLevel: 3, myPoints: 2_600_000, decay: false }), { kind: 'open', text: '✓ Açıldı · Kalıcı' });
    assert.deepEqual(statusLine({ level: 3, points: 2_500_000, myLevel: 3, myPoints: 2_600_000, decay: true }), { kind: 'open', text: '✓ Açıldı' });
  });

  test('bir sonraki seviye: puan / hedef ve çubuk; hedefe varmadan "500k" yazmaz', () => {
    const next = statusLine({ level: 4, points: 4_000_000, myLevel: 3, myPoints: 2_600_000, decay: false });
    assert.equal(next.kind, 'next');
    assert.equal(next.text, '2,6M / 4M');
    assert.ok(next.kind === 'next' && Math.abs(next.progress - 0.65) < 1e-9);
    const almost = statusLine({ level: 1, points: 500_000, myLevel: 0, myPoints: 499_999, decay: false });
    assert.equal(almost.text, '499,9k / 500k');
    // A level with no points (a broken setting) never divides by zero; the bar never passes its end.
    const zero = statusLine({ level: 1, points: 0, myLevel: 0, myPoints: 10, decay: false });
    assert.ok(zero.kind === 'next' && zero.progress === 0);
    const over = statusLine({ level: 2, points: 100, myLevel: 1, myPoints: 500, decay: false });
    assert.ok(over.kind === 'next' && over.progress === 1);
  });

  test('daha üst seviye: kalan puan kısa yazılır, yukarı yuvarlanır; eksiye düşmez', () => {
    assert.deepEqual(statusLine({ level: 6, points: 15_000_000, myLevel: 3, myPoints: 2_600_000, decay: false }), { kind: 'locked', text: 'Bu seviyeye\n12,4M puan kaldı', left: 12_400_000 });
    // 12.456.789 left is never shown as less (12,45M) than it is.
    assert.equal(statusLine({ level: 6, points: 15_000_000, myLevel: 3, myPoints: 2_543_211, decay: false }).text, 'Bu seviyeye\n12,46M puan kaldı');
    assert.equal(statusLine({ level: 6, points: 100, myLevel: 3, myPoints: 900, decay: false }).text, 'Bu seviyeye\n0 puan kaldı');
    assert.equal(groupDigits(1234567.9), '1.234.567');
  });

  test('seviye adı tek satırda, halkaya varmadan küçülür', () => {
    for (let l = 1; l <= 9; l++) assert.equal(titleFit(`VIP ${l}`), 1, `VIP ${l}`);
    const ten = titleFit('VIP 10');
    assert.ok(ten < 1 && ten > 0.85, String(ten));
    // A long name the panel gave shrinks further, never below 40 %.
    assert.ok(titleFit('Kraliyet Elmas') < ten);
    assert.equal(titleFit('W'.repeat(30)), 0.4);
    assert.equal(titleFit(''), 1);
  });

  test('kısa puan yazımı', () => {
    assert.equal(compactPoints(0), '0');
    assert.equal(compactPoints(999), '999');
    assert.equal(compactPoints(1_000), '1k');
    assert.equal(compactPoints(12_550), '12,5k');
    assert.equal(compactPoints(1_250_000), '1,25M');
    assert.equal(compactPoints(1_259_999), '1,25M');
    assert.equal(compactPoints(400_000_000), '400M');
    assert.equal(compactPoints(-5), '0');
    assert.equal(compactPoints(NaN), '0');
    assert.equal(compactPoints(12_401, true), '12,5k');
    assert.equal(compactPoints(12_400_000, true), '12,4M');
    assert.equal(compactPoints(999, true), '999');
  });

  test('kaydırma üyenin kendi seviyesinde açılır', () => {
    const levels = vipLevelsOf(null);
    assert.equal(startIndex(0, levels), 0, 'VIP olmayan VIP 1 kartında');
    assert.equal(startIndex(1, levels), 0);
    assert.equal(startIndex(3, levels), 2);
    assert.equal(startIndex(10, levels), 9);
    assert.equal(startIndex(14, levels), 9, 'listeden yüksek seviye son kartta');
    assert.equal(startIndex(3, []), 0);
    // The server's own list (12 levels): still by level, not by a fixed 10.
    const twelve = Array.from({ length: 12 }, (_, i) => ({ level: i + 1 }));
    assert.equal(startIndex(12, twelve), 11);
  });

  test('kaydırma durduğu kartı seçer, liste dışına çıkmaz', () => {
    assert.equal(snapIndex(0, 300, 10), 0);
    assert.equal(snapIndex(449, 300, 10), 1);
    assert.equal(snapIndex(451, 300, 10), 2);
    assert.equal(snapIndex(99_999, 300, 10), 9);
    assert.equal(snapIndex(-50, 300, 10), 0);
    assert.equal(snapIndex(100, 0, 10), 0);
    assert.equal(snapIndex(100, 300, 0), 0);
  });
});

describe('VIP hakları ızgarası', () => {
  test('üç sütun; dar ekranda ya da büyük yazıda iki', () => {
    assert.equal(gridColumns(390, 1), 3);
    assert.equal(gridColumns(360, 1.15), 3);
    assert.equal(gridColumns(339, 1), 2);
    assert.equal(gridColumns(390, 1.3), 2);
    assert.equal(gridColumns(430, 2), 2);
  });

  test('390 dp telefonda kartlar tasarımın ölçüsünde; satır ekrana sığar', () => {
    const m = cardMetrics(390, 3, 1);
    assert.equal(m.cardW, 115);
    assert.equal(m.cardH, 107, 'tasarımdaki gibi 107 dp; iki satırlık ad da sığar');
    // Only a larger text size grows the cards (so two lines of the name still fit).
    assert.equal(cardMetrics(390, 3, 0.85).cardH, 107);
    assert.ok(cardMetrics(390, 3, 1.15).cardH > 107);
    for (const [w, cols, fs] of [
      [320, 2, 1],
      [339, 2, 1.3],
      [360, 3, 1],
      [390, 3, 1.15],
      [412, 3, 1],
      [480, 3, 1],
      [390, 2, 1.3],
    ] as const) {
      const c = cardMetrics(w, cols, fs);
      assert.ok(c.margin * 2 + c.cardW * cols + c.gap * (cols - 1) <= w, `${w} dp, ${cols} sütun`);
      // Two lines of the name always fit under the picture, inside the rim, at this text size (capped at 1.15 like
      // components/text).
      assert.ok(c.labelTop >= c.artTop + c.artH - 2, 'ad resmin kutusuna en çok 2 dp biner');
      assert.ok(c.cardH >= 2 * c.rim + c.labelTop + 2 * c.lineH * Math.min(fs, 1.15) + c.padBottom, `${w} dp, yazı ${fs}`);
      assert.ok(c.artH <= c.cardW, 'resim kartın içinde');
      // The tallest picture (the frame, 151 px of the design) keeps the design's size: never squeezed by the box.
      assert.ok(151 * artScaleFor(c.cardW) <= c.artH + 0.5, `${w} dp: çerçeve resmi ${(151 * artScaleFor(c.cardW)).toFixed(1)} > ${c.artH}`);
    }
  });

  test('hak adları tasarımdaki gibi: tek satırlık adlar 360 dp telefonda da tek satır, uzunlar en çok iki satır', () => {
    // Plus Jakarta Sans Bold advances (per 1000 em, no kerning: a little wide) of the letters in the design's names;
    // the cards draw the names with wideSpaces (a quarter-em space).
    const ADV: Record<string, number> = { '\u2005': 250, I: 279, O: 878, P: 648, S: 647, V: 697, a: 580, d: 672, e: 612, f: 406, g: 652, h: 593, i: 252, l: 252, m: 924, o: 652, r: 374, s: 514, t: 413, v: 566, y: 586, z: 481, Ü: 718, ç: 608, ö: 652, ğ: 652, ı: 228, ş: 514 };
    const width = (text: string, c: ReturnType<typeof cardMetrics>) => [...wideSpaces(text)].reduce((sum, ch) => sum + (ADV[ch] ?? 700) / 1000, 0) * c.font + c.letterSpacing * text.length;
    const lines = (name: string, c: ReturnType<typeof cardMetrics>, room: number) => {
      let n = 1;
      let line = '';
      for (const word of name.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && width(next, c) > room) {
          n++;
          line = word;
        } else line = next;
      }
      return n;
    };
    for (const w of [360, 375, 390, 412, 480]) {
      const c = cardMetrics(w, 3, 1);
      const room = c.cardW - 2 * c.rim - 2 * c.padX;
      assert.ok(c.padX >= 6, 'kenara yapışmaz');
      for (const name of ['VIP rozeti', 'Profil çerçevesi', 'Seviyeleri gizle', 'Oda şifresi', 'Sessiz ziyaret']) assert.equal(lines(name, c, room), 1, `${w} dp: ${name} (${width(name, c).toFixed(1)} / ${room})`);
      for (const name of ['VIP mağaza eşyaları', 'Üyelere özel hediyeler']) assert.ok(lines(name, c, room) <= 2, `${w} dp: ${name}`);
    }
    // The design's 13 dp on its 115 dp card, smaller with a narrower card, never larger.
    assert.equal(cardMetrics(390, 3, 1).font, 13);
    assert.ok(cardMetrics(360, 3, 1).font < 12 && cardMetrics(360, 3, 1).font > 11.5);
    assert.equal(cardMetrics(480, 3, 1).font, 13);
  });

  test('resimler kart büyüdükçe bulanıklaşacak kadar büyümez', () => {
    assert.ok(Math.abs(artScaleFor(115) - 115 / 248) < 1e-9);
    assert.equal(artScaleFor(200), 0.56);
  });

  test('çerçevenin boş halkasının içi koyu cam kalır: arkasında sıcak ışık yok', () => {
    assert.equal(artGlows('frame'), false);
    for (const k of ['badge', 'hide_levels', 'room_password', 'vip_store', 'vip_gifts', 'silent_visit'] as const) assert.equal(artGlows(k), true, k);
    assert.equal(artGlows(null), true);
  });

  test('tasarımın yedi hakkı kendi resmini alır; sunucunun eklediği başka hak uygulamanın resmiyle kalır', () => {
    assert.equal(SVIP_SHOWN.length, 7);
    const keys = SVIP_SHOWN.map((r) => rightArtKey(r));
    assert.ok(
      keys.every((k) => k !== null),
      JSON.stringify(SVIP_SHOWN.map((r) => [r.name, rightArtKey(r)])),
    );
    assert.equal(new Set(keys).size, 7);
    // The server's keys, as Seviye ve VIP ayarları send them (LOOK in levels-live-core).
    const perks = ['badge', 'frame', 'hide_levels', 'room_password', 'vip_store', 'vip_gifts', 'silent_visit', 'entry_greeting', 'visitors'].map((key, i) => ({ key, from: 1 + (i % 4) }));
    const l = parseLiveLevels({ vip: { levels: Array.from({ length: 10 }, (_, i) => ({ level: i + 1, points: (i + 1) * 1000, name: `VIP ${i + 1}` })), perks } });
    const rights = vipRightsOf(l);
    const byName = Object.fromEntries(rights.map((r) => [r.name, rightArtKey(r)]));
    assert.equal(byName['VIP rozeti'], 'badge');
    assert.equal(byName['Profil çerçevesi'], 'frame');
    assert.equal(byName['Seviyeleri gizle'], 'hide_levels');
    assert.equal(byName['Oda şifresi'], 'room_password');
    assert.equal(byName['VIP mağaza eşyaları'], 'vip_store');
    assert.equal(byName['Üyelere özel hediyeler'], 'vip_gifts');
    assert.equal(byName['Sessiz ziyaret'], 'silent_visit');
    assert.equal(byName['Giriş karşılaması'], null);
    assert.equal(byName['Profiline bakanları gör'], null);
    assert.equal(rightArtKey({ art: undefined }), null);
  });

  test('açık hak sayısı seçili seviyeden; sabit bir 6/7 yok', () => {
    const rights = [{ level: 1 }, { level: 1 }, { level: 2 }, { level: 5 }];
    assert.equal(rightsOpen(rights, 0), 0);
    assert.equal(rightsOpen(rights, 1), 2);
    assert.equal(rightsOpen(rights, 4), 3);
    assert.equal(rightsOpen(rights, 10), 4);
    assert.equal(rightsOpen([], 3), 0);
  });

  test('son satırın boş hücreleri boş kalır; taç yalnız sığdığı yerde', () => {
    assert.equal(emptyCells(7, 3), 2);
    assert.equal(emptyCells(6, 3), 0);
    assert.equal(emptyCells(8, 3), 1);
    assert.equal(emptyCells(7, 2), 1);
    assert.equal(emptyCells(0, 3), 0);
    const m = cardMetrics(390, 3, 1);
    const crown = 221 * (390 / 841);
    assert.equal(lowerCrownFits(7, 3, m.cardW, m.gap, crown), true, 'tasarımdaki gibi 7 hak');
    assert.equal(lowerCrownFits(8, 3, m.cardW, m.gap, crown), true, 'tek boş hücre de tacı alır');
    assert.equal(lowerCrownFits(6, 3, m.cardW, m.gap, crown), false, 'dolu satırda kartın üstüne binmez');
    assert.equal(lowerCrownFits(9, 3, m.cardW, m.gap, crown), false);
    assert.equal(lowerCrownFits(0, 3, m.cardW, m.gap, crown), false);
    assert.equal(lowerCrownFits(1, 3, 60, 8, crown), true);
    assert.equal(lowerCrownFits(2, 3, 60, 8, crown), false, 'dar tek hücreye sığmaz');
  });
});

describe('Abonelik sekmesi', () => {
  test('durum satırı "Abonelik aktif · n gün kaldı"; gün yoksa satır yok', () => {
    assert.equal(subStatusText(27), 'Abonelik aktif · 27 gün kaldı');
    assert.equal(subStatusText(1), 'Abonelik aktif · 1 gün kaldı');
    assert.equal(subStatusText(0.4), 'Abonelik aktif · 1 gün kaldı', 'kalan yarım gün de 1 gün');
    for (const d of [0, -3, NaN, Infinity * -1]) assert.equal(subStatusText(d), null, String(d));
  });

  test('fiyatlar Türkçe yazılır; indirim etiketi sunucunun indiriminden, indirim yoksa etiket yok', () => {
    assert.equal(tryAmount(285), '285');
    assert.equal(tryAmount(1199), '1.199');
    assert.equal(tryAmount(149.99), '149,99');
    assert.equal(tryAmount(100_000), '100.000');
    assert.equal(tryAmount(NaN), '0');
    assert.equal(saveText(76), '%76 daha uygun');
    assert.equal(saveText(0), null);
    assert.equal(saveText(0.5), null);
    assert.equal(saveText(NaN), null);
    // The app's own plans (no server) give the design's badges: computed from the prices, not written anywhere.
    assert.deepEqual(subPlansOf(null).map((p) => saveText(p.save)), ['%51 daha uygun', '%76 daha uygun', '%83 daha uygun']);
    assert.deepEqual(VIP_PLANS.map((p) => p.days), [7, 30, 90]);
  });

  test('ekran ay planıyla açılır; ay yoksa ilk planla', () => {
    assert.equal(defaultPlanDays(subPlansOf(null)), 30);
    assert.equal(defaultPlanDays([{ days: 7 }, { days: 90 }]), 7);
    assert.equal(defaultPlanDays([]), 0);
    // The server's list (Seviye ve VIP ayarları) with the month hidden.
    const l = parseLiveLevels({ sub: { plans: [{ productId: 'vip_90d', days: 90, label: '3 Ay', tl: 599, was: 3599 }], perks: [] } });
    assert.equal(defaultPlanDays(subPlansOf(l)), 90);
  });

  test('plan kartını ekran okuyucu fiyatıyla okur; abonelik sözcükleri "VIP" değil "Abonelik"', () => {
    const [week, month] = subPlansOf(null);
    assert.equal(planA11y(month), 'Abonelik 1 Ay, 285 TL, önceki fiyat 1.199 TL, %76 daha uygun');
    assert.equal(planA11y(week), 'Abonelik 7 Gün, 145 TL, önceki fiyat 299 TL, %51 daha uygun');
    assert.equal(planA11y({ days: 30, label: 'Aylık', tl: 300, was: 0, save: 0 }), 'Abonelik Aylık, 300 TL');
    assert.equal(SUB_BUY_TITLE, 'Abonelik satın al');
    assert.equal(testBuyText(month), 'Abonelik 1 Ay · Test sürümü: ücretsiz, gerçek ödeme alınmaz. 30 gün eklensin mi?');
    assert.equal(demoBuyText(month, 'Google Play'), 'Abonelik 1 Ay · 285 TL (Google Play). Onaylıyor musun?');
    for (const text of [SUB_BUY_TITLE, testBuyText(month), demoBuyText(month, 'Google Play'), planA11y(month), subStatusText(27) ?? '']) assert.ok(!/VIP/.test(text), text);
  });

  test('390 dp telefonda üç kart tasarımın ölçüsünde, seçili kart daha geniş; satır ekrana sığar', () => {
    const g = planGrid(354, 1, 3);
    assert.equal(g.cols, 3);
    assert.ok(Math.abs(planWidth(g.unit, false) - PLAN.w) < 1.5 && Math.abs(planWidth(g.unit, true) - PLAN.wOn) < 1.5, JSON.stringify(g));
    for (const [w, fs, n] of [
      [284, 1, 3],
      [304, 1, 3],
      [324, 1, 3],
      [354, 1, 3],
      [376, 1, 3],
      [444, 1, 3],
      [354, 1.3, 3],
      [354, 1, 4],
      [354, 1, 5],
      [284, 2, 4],
    ] as const) {
      const { cols, unit } = planGrid(w, fs, n);
      // The widest row: the picked card and the others.
      const row = planWidth(unit, true) + planWidth(unit, false) * (cols - 1) + PLAN.gap * (cols - 1);
      assert.ok(row <= w, `${w} dp, ${n} plan: ${row}`);
      assert.ok(cols >= 2 && cols <= 3);
    }
  });

  test('dar ekranda ya da büyük yazıda kartlar iki sütuna iner; az planda kartlar aşırı büyümez', () => {
    assert.equal(planGrid(324, 1, 3).cols, 3, '360 dp telefon');
    assert.equal(planGrid(304, 1, 3).cols, 2, '340 dp telefon');
    assert.equal(planGrid(284, 1, 3).cols, 2, '320 dp telefon');
    assert.equal(planGrid(354, 1.3, 3).cols, 2, 'büyük yazı');
    assert.equal(planGrid(354, 1, 1).cols, 1);
    assert.equal(planGrid(354, 1, 2).cols, 2);
    assert.equal(planGrid(354, 1, 1).unit, PLAN.maxUnit);
    assert.equal(planGrid(354, 1, 0).cols, 1, 'boş liste bozulmaz');
    assert.deepEqual(rowsOf([1, 2, 3], 2), [[1, 2], [3]]);
    assert.deepEqual(rowsOf([1, 2, 3, 4], 3), [[1, 2, 3], [4]]);
    assert.deepEqual(rowsOf([], 3), []);
  });

  test('fiyat kartına sığar: üç haneli fiyat tasarımın boyunda, uzun fiyat küçülür', () => {
    const room = (on: boolean, unit = 1) => planWidth(unit, on) - 2 * PLAN.padX - 3;
    assert.equal(priceSize('285', room(true), PLAN.priceOn), PLAN.priceOn);
    assert.equal(priceSize('145', room(false), PLAN.price), PLAN.price);
    assert.equal(priceSize('1.199', room(false), PLAN.price), PLAN.price, 'dört haneli fiyat da sığar');
    // 360 dp phone: the narrowest three-column card.
    const u360 = planGrid(324, 1, 3).unit;
    assert.equal(priceSize('599', room(false, u360), PLAN.price), PLAN.price);
    const four = priceSize('1.199', room(false, u360), PLAN.price);
    assert.ok(four < PLAN.price && four >= 25, `dört hane 360 dp kartta biraz küçülür: ${four}`);
    const long = priceSize('100.000', room(false, u360), PLAN.price);
    assert.ok(long < PLAN.price && long >= PLAN.price * 0.45, String(long));
    // What it takes still fits: "TRY", the gap and the number (ExtraBold advances: 1 .413, 0 .7, . .408).
    assert.ok(PRICE_PREFIX.width + PRICE_PREFIX.gap + (0.413 + 0.7 * 5 + 0.408) * long <= room(false, u360) + 0.01);
  });

  test('indirim etiketi kartına sığar: 390 dp telefonda tasarımın boyunda, dar kartta küçülür', () => {
    const g = planGrid(354, 1, 3);
    const roomOn = planWidth(g.unit, true) - BADGE.leftOn - BADGE.crownTab;
    const roomOff = planWidth(g.unit, false) - 6;
    assert.ok(badgeSize('%76 daha uygun', roomOn, BADGE.sizeOn, BADGE.padXOn) >= 10.5);
    assert.equal(badgeSize('%51 daha uygun', roomOff, BADGE.size, BADGE.padX), BADGE.size);
    const u360 = planGrid(324, 1, 3).unit;
    const small = badgeSize('%76 daha uygun', planWidth(u360, true) - BADGE.leftOn - BADGE.crownTab, BADGE.sizeOn, BADGE.padXOn);
    assert.ok(small < BADGE.sizeOn && small >= 8.5, String(small));
    assert.equal(badgeSize('%100 daha uygun', 20, 10, 4), 8.5, 'en küçük 8,5 dp');
  });

  test('karşılaştırmada tik "var", çarpı "yok"; satır tek cümle okunur', () => {
    assert.equal(compareCellA11y(true), 'var');
    assert.equal(compareCellA11y(false), 'yok');
    assert.equal(compareCellA11y('%20'), '%20');
    assert.equal(compareRowA11y('Seviyeleri gizle', false, true), 'Seviyeleri gizle: abone olmayan yok, abone var');
    // The rows are the server's: what it turns off is not listed.
    const l = parseLiveLevels({ sub: { plans: [{ productId: 'vip_30d', days: 30, label: '1 Ay', tl: 285, was: 1199 }], perks: [{ key: 'visitors', from: 1 }] } });
    assert.deepEqual(subRightsOf(l).compare, [['Profiline bakanları gör', false, true]]);
  });

  test('haklar iki sütunda; çok dar panelde tek sütun', () => {
    assert.equal(perkMetrics(356).cols, 2);
    assert.equal(perkMetrics(300).cols, 2);
    assert.equal(perkMetrics(284).cols, 1);
    assert.equal(perkMetrics(356).circle, 35.6, 'tasarımın ikon dairesi');
    assert.deepEqual(
      rowsOf(subRightsOf(null).perks, perkMetrics(356).cols).map((r) => r.map((x) => x.name)),
      [['Ziyaretçiler', 'Seviyeleri gizle']],
    );
  });

  test('hak yazıları tasarımdaki gibi: 360 dp telefonda da başlık ve "Profiline bakanları gör" tek satır', () => {
    // Plus Jakarta Sans advances (em): "Seviyeleri gizle" ExtraBold 7.261 at 12.2 dp, "Profiline bakanları gör"
    // Medium 10.233 at 10 dp (the panel's sizes).
    for (const phone of [360, 375, 390, 412, 480]) {
      const panel = Math.min(phone, 480) - 34;
      const room = perkTextRoom(panel);
      assert.ok(7.261 * 12.2 <= room, `${phone} dp: başlık ${room.toFixed(1)}`);
      assert.ok(10.233 * 10 <= room, `${phone} dp: açıklama ${room.toFixed(1)}`);
    }
    // On a 320 dp phone each right has the whole width.
    assert.ok(perkTextRoom(286) > 150);
  });
});

describe('VIP seti: her seviyenin kendi resimleri', () => {
  test('VIP 1–10 kendi resmini çizer; üstü 10’unkini, 0 ve bozuk sayı hiçbirini', async () => {
    const { levelArtFor } = await import('@/lib/vip-screen');
    assert.equal(levelArtFor(1), 1);
    assert.equal(levelArtFor(7.9), 7);
    assert.equal(levelArtFor(10), 10);
    assert.equal(levelArtFor(14), 10);
    assert.equal(levelArtFor(0), null);
    assert.equal(levelArtFor(-3), null);
    assert.equal(levelArtFor(Number.NaN), null);
  });

  test('liste: rozet ve çerçeve seviyenin resmiyle, sohbet balonu ve giriş efekti sonda bir kez', async () => {
    const { withSetRights, rightNote } = await import('@/lib/vip-screen');
    const list = withSetRights(vipRightsOf(null));
    assert.equal(list.find((r) => r.art === 'ayricalik-svip-rozeti')?.set, 'badge');
    assert.equal(list.find((r) => r.art === 'ayricalik-profil-cercevesi')?.set, 'frame');
    assert.deepEqual(list.slice(-2).map((r) => [r.name, r.set, r.level]), [['Sohbet balonu', 'bubble', 1], ['Giriş efekti', 'entry', 1]]);
    assert.equal(list.length, vipRightsOf(null).length + 2);
    // Run again over its own output: nothing doubles.
    assert.equal(withSetRights(list).length, list.length);
    const bubble = list.find((r) => r.set === 'bubble')!;
    assert.match(rightNote(bubble, true, 'VIP 4', 'VIP 1'), /VIP 4 ile kullanabilirsin\. Bu seviyenin sohbet balonu Çantam'a gelir/);
    assert.equal(rightNote(bubble, false, 'VIP 4', 'VIP 1'), 'VIP 1 ile açılır.');
    const other = list.find((r) => !r.set)!;
    assert.equal(rightNote(other, true, 'VIP 4', 'VIP 1'), 'VIP 4 ile kullanabilirsin.');
  });
});
