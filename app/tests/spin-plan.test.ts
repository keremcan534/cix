// How the wheels and the board light are timed (components/games/fx/spin-plan): the wheel rests on the drawn slice,
// clear of the pegs; every tick is a peg really passing; the light ends on the drawn option.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARDS } from '@/lib/board-games';
import {
  PEG_FREE,
  PEG_TOUCH,
  REST_FROM,
  REST_TO,
  SPIN_PULL,
  SPIN_WIND,
  chipOf,
  isHotResult,
  litRange,
  optionShare,
  percentText,
  planLight,
  planSpin,
  restAngle,
  runEase,
  runEaseAt,
  runSpeed,
  shortCoins,
  sliceAt,
  spinEase,
  tally,
} from '@/components/games/fx/spin-plan';

const mod = (a: number, n: number) => ((a % n) + n) % n;

describe('Çarkın dönüşü', () => {
  test('koşu 0’dan 1’e hiç geri gitmeden varır; hız sıçramaz, sonda durur', () => {
    assert.equal(runEase(0), 0);
    assert.equal(runEase(1), 1);
    let last = 0;
    let lastSpeed = 0;
    for (let i = 1; i <= 1000; i++) {
      const v = runEase(i / 1000);
      assert.ok(v >= last, `geri gitti: ${i}`);
      const speed = (v - last) * 1000;
      assert.ok(Math.abs(speed - lastSpeed) < 0.06, `hız sıçradı: ${i} ${lastSpeed} → ${speed}`);
      last = v;
      lastSpeed = speed;
    }
    assert.ok(lastSpeed < 0.01, 'sonda hâlâ hızlı');
    assert.equal(runSpeed(1), 0);
    assert.ok(runSpeed(0.07) > 0.99);
  });
  test('ters fonksiyon: yolun p kadarı ne zaman biter', () => {
    for (const u of [0, 0.01, 0.05, 0.07, 0.1, 0.3, 0.5, 0.8, 0.95, 0.999, 1]) assert.ok(Math.abs(runEaseAt(runEase(u)) - u) < 1e-9, `u=${u}`);
  });
  test('önce geri çekilir, sonra bırakılır', () => {
    const e = spinEase(0.01);
    assert.equal(Math.abs(e(0)), 0);
    assert.ok(Math.abs(e(SPIN_WIND) + 0.01) < 1e-12, 'geri çekmenin sonu');
    assert.ok(e(SPIN_WIND / 2) < 0 && e(SPIN_WIND / 2) > -0.01);
    assert.ok(Math.abs(e(1) - 1) < 1e-12);
    for (let i = 56; i < 1000; i++) assert.ok(e((i + 1) / 1000) >= e(i / 1000));
  });
  test('çark çekilen dilimde, çivilerden uzakta durur; en az istenen tur kadar döner', () => {
    for (const slices of [12, 20]) {
      const step = 360 / slices;
      let from = 720;
      for (let n = 0; n < 400; n++) {
        const slice = (n * 7) % slices;
        const r = (n % 11) / 10;
        const p = planSpin({ from, slice, slices, turns: 5, ms: 4600, rnd: () => r });
        const span = p.to - from;
        assert.ok(span >= 5 * 360 && span < 6 * 360, `tur: ${span}`);
        assert.equal(sliceAt(p.to, slices), slice);
        // Its place within the slice, in slices from the middle.
        const off = mod(p.to + slice * step + 180, 360) - 180;
        assert.ok(off / step >= REST_FROM - 1e-9 && off / step <= REST_TO + 1e-9, `yer: ${off / step}`);
        from = mod(p.to, 360) + 720;
      }
    }
  });
  test('her tık gerçekten geçen bir çividir; sıkışık olanlar duyulmaz, son tıklar hissedilir', () => {
    const slices = 20;
    const step = 360 / slices;
    const p = planSpin({ from: 720 + 0.3 * step, slice: 13, slices, turns: 5, ms: 4600, rnd: () => 0.5 });
    assert.ok(p.ticks.length > 30 && p.ticks.length < 4600 / 55, `tık sayısı ${p.ticks.length}`);
    let last = -Infinity;
    for (const t of p.ticks) {
      assert.ok(t.at - last >= 54, `sıkışık: ${last} → ${t.at}`);
      assert.ok(t.at > p.launchAt && t.at < p.ms);
      assert.ok(t.gain >= 0.28 && t.gain <= 0.5);
      // Where the wheel is at that moment: half a slice past a slice's middle.
      const angle = p.from + p.ease(t.at / p.ms) * (p.to - p.from);
      const place = mod(angle, step) / step;
      assert.ok(Math.abs(place - 0.5) < 0.08, `çivide değil: ${place} (${t.at} ms)`);
      last = t.at;
    }
    assert.ok(!p.ticks[5].feel, 'hızlıyken titreşim olmaz');
    assert.ok(p.ticks[p.ticks.length - 1].feel, 'son çivi hissedilir');
    // The last pegs are heard one by one: as many ticks as pegs over the last two slices.
    const lastTwo = p.ticks.filter((t) => p.from + p.ease(t.at / p.ms) * (p.to - p.from) > p.to - 2.2 * step);
    assert.equal(lastTwo.length, 2);
  });
  test('geri çekme hiçbir çiviyi geri geçmez; durduğu yerde ibre serbesttir', () => {
    // The furthest back a resting wheel is pulled: still past the place where the pointer lets go of the peg.
    assert.ok(1 + REST_FROM - SPIN_PULL >= PEG_FREE);
    assert.ok(REST_TO < PEG_TOUCH);
    assert.equal(restAngle(0, 20), 0);
    assert.equal(restAngle(1, 20), 342);
    assert.equal(sliceAt(342, 20), 1);
    assert.equal(sliceAt(720 - 18 * 19, 20), 19);
  });
});

describe('Tahtada dolaşan ışık', () => {
  test('çekilen seçenekte durur; her adım bir öncekinden yavaştır ama hiç durmuş gibi görünmez', () => {
    for (let from = 0; from < 8; from++)
      for (let target = 0; target < 8; target++) {
        const p = planLight({ count: 8, from, target });
        const lastStep = p.steps[p.steps.length - 1];
        assert.equal(p.steps[0].index, from);
        assert.equal(lastStep.index, target);
        assert.equal(p.rest, target);
        assert.equal(p.ms, lastStep.at);
        assert.ok(p.steps.length - 1 >= 24 && p.steps.length - 1 <= 31);
        let gap = 0;
        for (let k = 1; k < p.steps.length; k++) {
          const g = p.steps[k].at - p.steps[k - 1].at;
          assert.ok(g >= gap - 1 && g >= 54 && g <= 331, `adım ${k}: ${g}`);
          assert.equal(p.steps[k].index, (p.steps[k - 1].index + 1) % 8);
          gap = g;
        }
        assert.ok(p.ms > 2500 && p.ms < 4200, `süre ${p.ms}`);
      }
  });
  test('sonuç bir seçenek değilse ışık son vuruşta söner', () => {
    const p = planLight({ count: 8, from: 3, target: null, rnd: () => 0.6 });
    assert.equal(p.rest, null);
    assert.equal(p.steps.length - 1, 24 + 4);
    assert.ok(p.ms - p.steps[p.steps.length - 1].at >= 300);
    for (let i = 0; i < 8; i++) {
      const r = litRange(p, i);
      assert.equal(r.outputRange[r.outputRange.length - 1], 0, `seçenek ${i} yanık kaldı`);
    }
  });
  test('ışığın aralıkları: zamanda geri gitmez, yalnız durduğu seçenek yanık kalır', () => {
    const p = planLight({ count: 8, from: 2, target: 5 });
    for (let i = 0; i < 8; i++) {
      const r = litRange(p, i);
      assert.equal(r.inputRange.length, r.outputRange.length);
      assert.ok(r.inputRange.length >= 2);
      assert.equal(r.inputRange[0], 0);
      for (let k = 1; k < r.inputRange.length; k++) assert.ok(r.inputRange[k] >= r.inputRange[k - 1], `seçenek ${i}: ${r.inputRange}`);
      assert.ok(r.outputRange.every((y) => y === 0 || y === 1));
      assert.equal(r.outputRange[0], i === 2 ? 1 : 0, 'başta yalnız ışığın durduğu yer yanar');
      assert.equal(r.outputRange[r.outputRange.length - 1], i === 5 ? 1 : 0);
    }
    // At any moment of the run one option is fully lit.
    const at = (r: { inputRange: number[]; outputRange: number[] }, x: number) => {
      let k = r.inputRange.findIndex((v) => v > x);
      if (k < 0) return r.outputRange[r.outputRange.length - 1];
      if (k === 0) return r.outputRange[0];
      const [x0, x1, y0, y1] = [r.inputRange[k - 1], r.inputRange[k], r.outputRange[k - 1], r.outputRange[k]];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    };
    const ranges = Array.from({ length: 8 }, (_, i) => litRange(p, i));
    for (let x = 0; x <= p.ms; x += 7) {
      const full = ranges.filter((r) => at(r, x) >= 0.999).length;
      assert.ok(full >= 1, `${x} ms: hiçbiri yanmıyor`);
    }
    assert.deepEqual(litRange(planLight({ count: 8, from: 0, target: 0, laps: 0 }), 4), { inputRange: [0, 1], outputRange: [0, 0] });
  });
});

describe('Ekranların ortak küçük hesapları', () => {
  test('kısa tutar ve yüzde yazımı', () => {
    assert.equal(shortCoins(250), '250');
    assert.equal(shortCoins(1000), '1K');
    assert.equal(shortCoins(2500), '2,5K');
    assert.equal(shortCoins(25_000), '25K');
    assert.equal(shortCoins(1_250_000), '1,2M');
    assert.equal(percentText(0.2), '%20');
    assert.equal(percentText(0.08), '%8');
    assert.equal(percentText(44 / 9000), '%0,49');
  });
  test('seçeneğin kazanma payı, onu ödeyen her sonucu sayar', () => {
    assert.equal(optionShare(BOARDS.slot, 'seven'), 1 / 20);
    assert.equal(optionShare(BOARDS.slot, 'apple'), 4 / 20);
    assert.equal(optionShare(BOARDS.foodwheel, 'tomato'), (540 + 180) / 9000);
    assert.equal(optionShare(BOARDS.foodwheel, 'crab'), (44 + 36) / 9000);
    // The house rule holds for what the sheet shows: chance × multiplier is 40 %.
    for (const b of Object.values(BOARDS)) for (const o of b.options) assert.ok(Math.abs(optionShare(b, o.id) * o.mult - 0.4) < 1e-9, `${b.id}/${o.id}`);
  });
  test('nadir ve yüksek sonuçlar işaretlenir; ödemeyen sonuç hiç işaretlenmez', () => {
    const hot = (board: string) => BOARDS[board].results.filter((r) => isHotResult(BOARDS[board], r)).map((r) => r.id);
    assert.deepEqual(hot('slot'), ['seven']);
    assert.deepEqual(hot('foodwheel').sort(), ['crab', 'fish', 'pizza', 'salad', 'shrimp']);
    assert.deepEqual(hot('magiccard').sort(), ['aquarius', 'leo', 'pisces']);
  });
  test('yığının fişi ve sonuç dökümü', () => {
    const chips = [250, 500, 1000, 5000, 10_000, 25_000];
    assert.equal(chipOf(chips, 250), 250);
    assert.equal(chipOf(chips, 1750), 1000);
    assert.equal(chipOf(chips, 60_000), 25_000);
    assert.equal(chipOf(chips, 0), 250);
    assert.deepEqual(tally([3, 0, 0, 7, 3, 0], (x) => (x === 7 ? Infinity : x)), [
      { item: 7, times: 1 },
      { item: 3, times: 2 },
      { item: 0, times: 3 },
    ]);
  });
});
