// The opening's timeline (lib/intro-timeline, drawn by components/fx/intro): it starts on the native splash's exact
// pose, keeps still through the splash's fade, follows the logo's own paths, ends inside its time budget, and bakes
// every ease into stops (the phones run an interpolation's own easing linearly).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMET_LEFT, COMET_RIGHT, EDGE_LEFT, EDGE_RIGHT, FILL_BOX, HEAD_CORAL, HEAD_CYAN, LOGO_MARK, MARK_BOX, MARK_SHAPE, RING_BOX, TIP } from '@/lib/intro-path';
import {
  ANIMATED_VIEWS,
  CAP_TOP,
  COMET_MS,
  COMET_SIZE,
  CURTAIN_SEAM,
  DRAWN_FRAME,
  DRAWN_WAIT,
  EIN,
  EXIT,
  EXIT_FAST,
  EXIT_TRACKS,
  EXPO,
  FAILSAFE,
  FAILSAFE_GRACE,
  FAILSAFE_RUN,
  FEATHER,
  FEATHER_STOPS,
  FILL_PEAK,
  FLY,
  HALF_MARK,
  HEAD_LIFT,
  HOLD,
  IO,
  LAYERS,
  LETTERS,
  LETTER_FADE,
  LETTER_MOVE,
  LETTER_RISE,
  LIFT,
  LIN,
  OS_WAIT,
  OUTC,
  PIVOT_CORAL,
  PIVOT_CYAN,
  RING_PEAK,
  RING_SPREAD,
  RISE,
  S_END,
  SAMPLES,
  SETTLE,
  SINE,
  SPARK_AT,
  SPRING,
  STD,
  STREAKS,
  STREAK_SIZE,
  TOTAL,
  VEIL,
  VEIL_MARK,
  WORD_BREAK,
  at,
  bezier,
  curtainEdge,
  featherLeft,
  flight,
  fontSizeFor,
  leanAt,
  letterStart,
  liftTo,
  lockup,
  markPose,
  matchCut,
  sampled,
  stops,
  timeline,
  track,
  uncoverAt,
  type ExitTo,
  type Key,
  type Landing,
  type Pose,
  type Range,
  type Rect,
} from '@/lib/intro-timeline';
import { SPLASH_FADE, SPLASH_MARK, SPLASH_NAVY, SPLASH_WAIT } from '@/lib/splash';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [28, 31, 34];

/** Every track of a timeline with its name, e.g. "streaks.2.opacity". */
function tracks(node: unknown, path = ''): [string, Range][] {
  if (!node || typeof node !== 'object') return [];
  if ('inputRange' in node && 'outputRange' in node) return [[path, node as Range]];
  return Object.entries(node).flatMap(([k, v]) => tracks(v, path ? `${path}.${k}` : k));
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('açılış: eğriler', () => {
  test('bezier eğrileri 0 ile 1 arasında, uçları tam, artan', () => {
    for (const ease of [OUTC, SINE, STD, EXPO, EIN, IO, SETTLE, FLY, bezier(0.25, 0.1, 0.25, 1)]) {
      assert.equal(ease(0), 0);
      assert.equal(ease(1), 1);
      let prev = 0;
      for (let x = 0.01; x < 1; x += 0.01) {
        const y = ease(x);
        assert.ok(y >= prev - 1e-9 && y <= 1 + 1e-9, `${x.toFixed(2)}: ${y}`);
        prev = y;
      }
    }
    // Known shapes: an ease-out is ahead of linear, an ease-in behind it, a symmetric in-out crosses at the middle.
    assert.ok(OUTC(0.25) > 0.5 && EXPO(0.25) > OUTC(0.25));
    assert.ok(EIN(0.5) < 0.5);
    assert.ok(near(SINE(0.5), 0.5, 1e-6) && near(IO(0.5), 0.5, 1e-6));
    // cubic-bezier(0.4, 0, 0.2, 1), solved here independently by bisection on its parameter.
    for (const x of [0.1, 0.3, 0.5, 0.8]) {
      let [lo, hi] = [0, 1];
      for (let i = 0; i < 60; i++) {
        const u = (lo + hi) / 2;
        if (3 * (1 - u) ** 2 * u * 0.4 + 3 * (1 - u) * u * u * 0.2 + u ** 3 < x) lo = u;
        else hi = u;
      }
      const u = (lo + hi) / 2;
      assert.ok(near(STD(x), 3 * (1 - u) * u * u + u ** 3, 1e-7), String(x));
    }
  });

  test('yay eğrisi 1’de biter, 0,456 civarında 1,173’e taşar', () => {
    assert.equal(SPRING(0), 0);
    assert.equal(SPRING(1), 1);
    let peak = 0;
    let atR = 0;
    for (let r = 0; r <= 1; r += 0.001) {
      if (SPRING(r) > peak) [peak, atR] = [SPRING(r), r];
    }
    assert.ok(near(peak, 1.173, 0.001), String(peak));
    assert.ok(Math.abs(atR - 0.456) < 0.01, String(atR));
  });

  test('stops(): kolaylaştırma ara duraklara gömülü, giriş hep artan, uçlar tam', () => {
    const keys: Key[] = [[100, 0, OUTC], [300, 10, SINE], [500, -4], [501, 7, EXPO], [900, 0]];
    const r = stops(keys);
    assert.equal(r.inputRange.length, r.outputRange.length);
    for (let i = 1; i < r.inputRange.length; i++) assert.ok(r.inputRange[i] > r.inputRange[i - 1]);
    // Eased segments carry SAMPLES - 1 inner stops, a linear one none.
    assert.equal(r.inputRange.length, keys.length + 3 * (SAMPLES - 1));
    for (const [ms, v] of keys) assert.equal(at(r, ms), v);
    // Linear between the stops (what a phone shows) stays within a hair of the true curve.
    const exact = track(keys);
    let worst = 0;
    for (let ms = 0; ms <= 1000; ms++) worst = Math.max(worst, Math.abs(at(r, ms) - exact(ms)));
    assert.ok(worst < 0.45, `en büyük sapma ${worst}`);
    // LIN adds nothing.
    assert.deepEqual(stops([[0, 0, LIN], [10, 1]]), { inputRange: [0, 10], outputRange: [0, 1] });
  });

  test('sampled(): iki ucu da tam, adımlar eşit', () => {
    const r = sampled((ms) => ms * 2, 200, 1880);
    assert.equal(r.inputRange[0], 200);
    assert.equal(r.inputRange.at(-1), 1880);
    assert.equal(r.inputRange.length, 169);
    for (let i = 1; i < r.inputRange.length; i++) assert.ok(near(r.inputRange[i] - r.inputRange[i - 1], 10));
    assert.equal(r.outputRange.at(-1), 3760);
    assert.equal(sampled(() => 1, 0, 25).inputRange.at(-1), 25);
  });

  test('at(): uçların dışında sabit (clamp)', () => {
    const r = { inputRange: [10, 20], outputRange: [1, 3] };
    assert.equal(at(r, 0), 1);
    assert.equal(at(r, 15), 2);
    assert.equal(at(r, 99), 3);
  });
});

describe('açılış: ilk kare telefonun açılış ekranının aynısı', () => {
  for (const F of SIZES) {
    test(`F ${F}: t = 0'da logo yerinde ve tam boy, başka hiçbir katman görünmüyor`, () => {
      const tl = timeline(F);
      assert.equal(at(tl.mark.scale, 0), 1);
      assert.equal(at(tl.mark.y, 0), 0);
      assert.equal(at(tl.lean, 0), 0);
      const opacities = tracks(tl).filter(([name]) => name.endsWith('opacity') || name === 'ambience');
      assert.ok(opacities.length >= 11 + tl.fill.length + tl.streaks.length + LETTERS.length);
      for (const [name, r] of opacities) assert.equal(at(r, 0), 0, name);
      for (const l of tl.letters) assert.equal(at(l.opacity, 0), 0);
      // The exit clock at rest: the cover and the lockup as they are.
      assert.equal(at(EXIT_TRACKS.lockupOpacity, 0), 1);
      assert.equal(at(EXIT_TRACKS.calm, 0), 0);
      assert.equal(at(EXIT_TRACKS.markCut, 0), 1);
      assert.equal(at(EXIT_TRACKS.nameCut, 0), 1);
      assert.equal(at(EXIT_TRACKS.curtain, 0), 0);
      assert.equal(at(EXIT_TRACKS.lift, 0), 0);
      assert.equal(at(EXIT_TRACKS.fly, 0), 0);
      // And the still path's veil at rest leaves the mark as it is.
      assert.equal(at(VEIL_MARK, 1), 1);
    });

    test(`F ${F}: açılış ekranı solarken (ilk ${HOLD} ms) hiçbir şey kıpırdamıyor`, () => {
      for (const [name, r] of tracks(timeline(F))) {
        assert.ok(r.inputRange[0] >= HOLD, `${name} ${r.inputRange[0]} ms'de başlıyor`);
        for (const ms of [0, 50, 120, 199, HOLD]) assert.equal(at(r, ms), at(r, 0), `${name} @${ms}`);
      }
    });
  }

  test('açılış ekranının rengi, boyu ve süreleri app.json ile aynı', () => {
    const app = JSON.parse(readFileSync(resolve(APP, 'app.json'), 'utf8')).expo;
    const splash = app.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    assert.equal(splash.backgroundColor, SPLASH_NAVY);
    assert.equal(splash.dark.backgroundColor, SPLASH_NAVY);
    assert.equal(app.backgroundColor, SPLASH_NAVY);
    assert.equal(app.android.adaptiveIcon.backgroundColor, SPLASH_NAVY);
    assert.equal(splash.imageWidth, SPLASH_MARK);
    assert.equal(MARK_BOX, SPLASH_MARK);
    // The splash's own fade ends inside the hold; the wait for the first frame (under the same picture) stays short.
    assert.ok(SPLASH_FADE < HOLD);
    assert.ok(SPLASH_WAIT >= 250 && SPLASH_WAIT <= 300);
  });

  test('web: sayfa uygulama yüklenirken açılış ekranının kendisi: lacivert ve ortada 200 px logo (beyaz ya da boş sayfa yok)', () => {
    const html = readFileSync(resolve(APP, 'public/index.html'), 'utf8');
    // The page itself (html: the body is transparent and has no margin, so the middle is the screen's): the navy and
    // the native splash's picture, 200 px in the middle, once.
    const bg = html.match(/html\s*\{\s*background:\s*([^\n]+);\s*\}/)?.[1] ?? '';
    assert.ok(bg.startsWith(SPLASH_NAVY + ' url(data:image/webp;base64,'), bg.slice(0, 60));
    assert.ok(bg.endsWith(') no-repeat center / 200px 200px'), bg.slice(-60));
    assert.equal(SPLASH_MARK, 200);
    assert.match(html, /body\s*\{\s*margin:\s*0;/);
    assert.ok(!/body\s*\{[^}]*background/.test(html), 'the body would paint over the splash');
    // The picture is the native splash's own file at 2x (lossless WebP, 400 x 400), written by scripts/intro-layers.py
    // from the file whose md5 the page notes: a changed splash fails here until the script runs again.
    const webp = Buffer.from(bg.match(/base64,([A-Za-z0-9+/=]+)\)/)![1], 'base64');
    assert.equal(webp.toString('latin1', 0, 4), 'RIFF');
    assert.equal(webp.toString('latin1', 8, 16), 'WEBPVP8L');
    assert.equal(webp[20], 0x2f);
    const bits = webp.readUInt32LE(21);
    assert.deepEqual([(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1], [2 * SPLASH_MARK, 2 * SPLASH_MARK]);
    const native = createHash('md5').update(readFileSync(resolve(APP, 'assets/splash-icon-native.png'))).digest('hex');
    assert.ok(html.includes(`splash-icon-native.png md5 ${native}`), 'public/index.html: run scripts/intro-layers.py again');
    const splash = JSON.parse(readFileSync(resolve(APP, 'app.json'), 'utf8')).expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    assert.equal(splash.image, './assets/splash-icon-native.png');
    // Expo fills in these when it exports the single page.
    assert.ok(html.includes('%WEB_TITLE%') && html.includes('%LANG_ISO_CODE%') && html.includes('<div id="root"></div>'));
    // A single-page export: +html.tsx would be ignored there.
    const app = JSON.parse(readFileSync(resolve(APP, 'app.json'), 'utf8')).expo;
    assert.ok(!app.web?.output || app.web.output === 'single');
  });
});

/** The lights on the mark: all out at the timeline's end, and put out by the exit's calm after a tap. */
const LIGHTS = ['ring', 'coralShine', 'cyanShine', 'sparkHalo', 'spark', 'cometL', 'cometR', 'tipBloom', 'tipFlash'] as const;
/** Every light's opacity track (with the fill's stages and the streaks). */
const lightTracks = (tl: ReturnType<typeof timeline>) => [...LIGHTS.map((name) => tl[name].opacity), ...tl.fill.map((f) => f.opacity), ...tl.streaks.map((b) => b.opacity)];

describe('açılış: süre ve son kare', () => {
  test('ana zaman çizgisi ≤ 2300 ms, çıkış ≤ 400 ms, emniyet hepsinden sonra', () => {
    assert.ok(TOTAL <= 2300);
    assert.ok(EXIT <= 400 && EXIT_FAST <= EXIT);
    // Before the clock runs: the splash wait and the phone's answer come well before the failsafe.
    assert.ok(FAILSAFE > SPLASH_WAIT + OS_WAIT + 1000);
    assert.ok(OS_WAIT + DRAWN_WAIT + DRAWN_FRAME + VEIL < FAILSAFE);
    // Once it runs: the failsafe, counted from the clock's start, comes after the timeline and its exit.
    assert.ok(FAILSAFE_RUN > TOTAL + EXIT + 500);
    assert.ok(FAILSAFE_GRACE >= 200);
  });

  for (const F of SIZES) {
    test(`F ${F}: her iz artan ve süresinin içinde`, () => {
      for (const [name, r] of tracks(timeline(F))) {
        assert.equal(r.inputRange.length, r.outputRange.length, name);
        for (let i = 1; i < r.inputRange.length; i++) assert.ok(r.inputRange[i] > r.inputRange[i - 1], `${name}: ${r.inputRange[i - 1]} → ${r.inputRange[i]}`);
        assert.ok(r.inputRange[0] >= 0 && r.inputRange.at(-1)! <= TOTAL, name);
        assert.ok(r.outputRange.every(Number.isFinite), name);
      }
      for (const [name, r] of tracks(EXIT_TRACKS)) {
        for (let i = 1; i < r.inputRange.length; i++) assert.ok(r.inputRange[i] > r.inputRange[i - 1], name);
        assert.ok(r.inputRange[0] >= 0 && r.inputRange.at(-1)! <= EXIT, name);
      }
    });

    test(`F ${F}: son karede logo isimle kilitli, ışıklar sönmüş, harfler yerinde`, () => {
      const tl = timeline(F);
      const { TY_END } = lockup(F);
      assert.ok(near(at(tl.mark.scale, TOTAL), S_END));
      assert.equal(at(tl.mark.y, TOTAL), TY_END);
      assert.equal(at(tl.lean, TOTAL), 0);
      assert.equal(at(tl.aura.opacity, TOTAL), 0.22);
      assert.equal(at(tl.ambience, TOTAL), 1);
      for (const name of LIGHTS) assert.equal(at(tl[name].opacity, TOTAL), 0, name);
      for (const f of tl.fill) assert.equal(at(f.opacity, TOTAL), 0);
      for (const b of tl.streaks) assert.equal(at(b.opacity, TOTAL), 0);
      for (const l of tl.letters) {
        assert.equal(at(l.opacity, TOTAL), 1);
        assert.equal(at(l.x, TOTAL), 0);
        assert.equal(at(l.y, TOTAL), 0);
      }
    });
  }

  test('çıkışın sonunda örtü gitmiş: lacivert her çıkışta perde gibi kalkıyor, erime yok', () => {
    assert.equal(at(EXIT_TRACKS.curtain, EXIT), 1);
    assert.equal(at(EXIT_TRACKS.markCut, EXIT), 0);
    assert.equal(at(EXIT_TRACKS.lockupOpacity, 170), 0);
    assert.equal(at(EXIT_TRACKS.lift, EXIT), 1);
    assert.equal(at(EXIT_TRACKS.fly, EXIT), 1);
    assert.equal(at(EXIT_TRACKS.calm, EXIT), 1);
    // No dissolve track any more: the cover's own opacity is only the still path's veil.
    assert.deepEqual(Object.keys(EXIT_TRACKS).sort(), ['calm', 'curtain', 'fly', 'lift', 'lockupOpacity', 'markCut', 'nameCut']);
    // A skip (300 ms) runs the same clock faster: the exit clock reaches EXIT either way.
    assert.ok(EXIT_FAST > 0 && EXIT_FAST < EXIT);
  });

  for (const [W, H] of [
    [390, 844],
    [360, 640],
  ] as const) {
    test(`${W} x ${H}, logosuz ekran (ana sayfa): logo ile isim, perdenin yumuşak kenarı onlara varmadan gidiyor; ekran hemen alttan açılıyor`, () => {
      const F = fontSizeFor(W);
      const { WORD_Y, lineHeight } = lockup(F);
      // The opaque edge rises from the screen's bottom; the screen shows below it (through the feather).
      const edge = (ms: number) => curtainEdge(H, at(EXIT_TRACKS.curtain, ms));
      // The lockup's lowest point as it lifts: the name's line bottom.
      const lowest = (ms: number) => H / 2 + LIFT.y * at(EXIT_TRACKS.lift, ms) + LIFT.scale * (WORD_Y + lineHeight / 2);
      for (let ms = 0; ms <= EXIT; ms++) {
        if (edge(ms) < lowest(ms)) assert.ok(at(EXIT_TRACKS.lockupOpacity, ms) < 0.05, `${ms} ms`);
      }
      // No moment of bare navy: the screen shows half through at the bottom while the lockup is still well there,
      // about 100 ms in (a skip: 75 ms).
      const shows = [...Array(EXIT + 1).keys()].find((ms) => featherLeft((H - edge(ms)) / FEATHER) <= 0.5)!;
      assert.ok(shows <= 110 && at(EXIT_TRACKS.lockupOpacity, shows) > 0.3, `${shows} ms: ${at(EXIT_TRACKS.lockupOpacity, shows)}`);
      // And the lockup is there (over half) until the curtain has started to move.
      assert.ok(at(EXIT_TRACKS.lockupOpacity, EXIT_TRACKS.curtain.inputRange[0]) > 0.5);
    });
  }

  test('eşleşen geçişte uçuş yumuşak: 320 ms, karede en çok yaklaşık 28 dp', () => {
    assert.equal(EXIT_TRACKS.fly.inputRange.at(-1), 320);
    // The steepest frame (60 fps) of the flight over the 230 dp it covers on a 390 x 844 sign-in screen.
    let step = 0;
    for (let ms = 0; ms + 1000 / 60 <= 320; ms++) step = Math.max(step, at(EXIT_TRACKS.fly, ms + 1000 / 60) - at(EXIT_TRACKS.fly, ms));
    assert.ok(step * 230 <= 28.5, `${(step * 230).toFixed(1)} dp`);
    // Off gently and down softly: the first and the last 40 ms move it under 5% each.
    assert.ok(FLY(40 / 320) < 0.05 && 1 - FLY(280 / 320) < 0.05);
  });

  test('hareket azaltılınca logo lacivertten önce gidiyor (ilk ~95 ms), lacivert 200 ms’de eriyor', () => {
    // The veil runs 1 → 0 in VEIL ms on Easing.inOut(Easing.quad); the mark's own opacity is VEIL_MARK of it.
    const quad = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
    const veil = (ms: number) => 1 - quad(Math.min(1, ms / VEIL));
    let goneAt = -1;
    for (let ms = 0; ms <= VEIL; ms++) {
      if (goneAt < 0 && at(VEIL_MARK, veil(ms)) === 0) goneAt = ms;
    }
    assert.ok(goneAt > 0 && goneAt <= 100, String(goneAt));
    // While the mark still shows, the navy is still mostly there (the screen beneath barely shows).
    for (let ms = 0; ms < goneAt; ms++) assert.ok(veil(ms) > 0.55, String(ms));
    assert.equal(at(VEIL_MARK, 0), 0);
  });

  for (const F of SIZES) {
    test(`F ${F}: kalkış, logoyu tek resim gibi ekranın ortasına göre büyütüp yukarı alıyor (nerede olursa olsun)`, () => {
      const tl = timeline(F);
      const { TY_END, WORD_Y } = lockup(F);
      // From the lockup (the timeline's end) and from part-way through (a tap): every point of the mark, and of the
      // name, lands where the whole lifted picture puts it.
      for (const ms of [TOTAL, 600, 1500]) {
        const from = markPose(tl, ms);
        const to = liftTo(F, from);
        for (const d of [-40, 0, 25]) {
          assert.ok(near(LIFT.y + LIFT.scale * (from.y + from.k * d), to.mark.y + to.mark.k * d, 1e-9), `${ms} ms, ${d}`);
          assert.ok(near(LIFT.y + LIFT.scale * (WORD_Y + d), WORD_Y + to.name.y + to.name.k * d, 1e-9));
        }
        assert.equal(to.mark.x, 0);
        assert.equal(to.name.x, 0);
      }
      assert.deepEqual(markPose(tl, TOTAL), { x: 0, y: TY_END, k: at(tl.mark.scale, TOTAL) });
      assert.ok(near(markPose(tl, TOTAL).k, S_END));
    });
  }
});

describe('açılış: giriş ekranına eşleşen geçiş', () => {
  // The sign-in screen at 390 x 844: its 96 dp logo and its 38 dp title, as measureInWindow gives them.
  const cover: Rect = { x: 0, y: 0, width: 390, height: 844 };
  const to: Landing = { logo: { x: 147, y: 140, width: 96, height: 96 }, title: { x: 86, y: 248, width: 218, height: 48 } };

  for (const F of SIZES) {
    test(`F ${F}: logo giriş ekranının logosunun tam üstüne, isim başlığın üstüne iniyor`, () => {
      const nameWidth = 6.1 * F;
      const cut = matchCut(F, cover, nameWidth, to)!;
      assert.ok(cut);
      const { WORD_Y } = lockup(F);
      // Where the drawn mark ends: its box's centre there, scaled k about it.
      const scale = cut.mark.k;
      const cx = cover.width / 2 + cut.mark.x + scale * (MARK_SHAPE.cx - MARK_BOX / 2);
      const cy = cover.height / 2 + cut.mark.y + scale * (MARK_SHAPE.cy - MARK_BOX / 2);
      assert.ok(near(cx, to.logo.x + 96 * LOGO_MARK.cx, 1e-9) && near(cy, to.logo.y + 96 * LOGO_MARK.cy, 1e-9));
      assert.ok(near(scale * MARK_SHAPE.width, 96 * LOGO_MARK.width, 1e-9));
      // About 67 dp wide there, from about 103 in the lockup.
      assert.ok(Math.abs(scale * MARK_SHAPE.width - 66.5) < 1);
      assert.ok(Math.abs(S_END * MARK_SHAPE.width - 102.6) < 1);
      // The name's centre on the title's, as wide as it.
      assert.ok(near(cover.width / 2 + cut.name.x, to.title.x + to.title.width / 2, 1e-9));
      assert.ok(near(cover.height / 2 + WORD_Y + cut.name.y, to.title.y + to.title.height / 2, 1e-9));
      assert.ok(near(cut.name.k * nameWidth, to.title.width, 1e-9));
    });
  }

  test('perde: lacivert yukarı kalkar; başlık isim gittikten, logo işaret neredeyse yerine indikten sonra açılır', () => {
    // On the sign-in screen at 390 x 844 (the landing above). The curtain's opaque bottom edge is at y_b (just below
    // the screen at rest), its feather FEATHER below it: a point shows once the edge has risen past it.
    const H = cover.height;
    const edge = (ms: number) => curtainEdge(H, at(EXIT_TRACKS.curtain, ms));
    const first = (pred: (ms: number) => boolean) => [...Array(EXIT + 1).keys()].find(pred)!;
    // The name fades on its way (it moves while it fades) and is gone before the title starts to show.
    const nameGone = first((ms) => at(EXIT_TRACKS.nameCut, ms) === 0);
    assert.equal(nameGone, 140);
    assert.ok(at(EXIT_TRACKS.fly, 100) > 0.2 && at(EXIT_TRACKS.nameCut, 100) > 0);
    const titleShows = first((ms) => edge(ms) < to.title.y + to.title.height);
    assert.ok(titleShows > nameGone + 50, String(titleShows));
    // The logo starts to show only once the mark is nearly on it.
    const logoShows = first((ms) => edge(ms) < to.logo.y + to.logo.height);
    assert.ok(at(EXIT_TRACKS.fly, logoShows) > 0.95, `${logoShows} ms: ${at(EXIT_TRACKS.fly, logoShows)}`);
    // The mark fades into the screen's own logo only once it has all but landed (98%), and never faster than the
    // curtain uncovers the logo's top (its feather goes along a smoothstep), so the navy never shows through it.
    const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const uncovered = (y: number, ms: number) => smooth((y - edge(ms)) / FEATHER);
    const markFades = first((ms) => at(EXIT_TRACKS.markCut, ms) < 1);
    assert.ok(at(EXIT_TRACKS.fly, markFades) > 0.98, String(at(EXIT_TRACKS.fly, markFades)));
    for (let ms = 0; ms <= EXIT; ms++) {
      assert.ok(1 - at(EXIT_TRACKS.markCut, ms) <= uncovered(to.logo.y, ms) + 1e-9, `${ms} ms`);
    }
    assert.equal(at(EXIT_TRACKS.markCut, EXIT), 0);
    // It rises steadily from where it covers everything (its feather below the screen) to off the top, by the end.
    for (let ms = 1; ms <= EXIT; ms++) assert.ok(at(EXIT_TRACKS.curtain, ms) >= at(EXIT_TRACKS.curtain, ms - 1));
    assert.ok(edge(EXIT) + FEATHER <= 0);
    assert.ok(FEATHER >= 80 && FEATHER <= 160);
  });

  test('perdenin lacivertiyle yumuşak kenarı arasında ek yeri yok: yumuşak kenar en az 2 dp içeriden, orada tam opak başlıyor', () => {
    assert.ok(CURTAIN_SEAM >= 2);
    const h = FEATHER + CURTAIN_SEAM;
    const { locations, alpha } = FEATHER_STOPS;
    assert.equal(locations.length, alpha.length);
    for (let i = 1; i < locations.length; i++) assert.ok(locations[i] > locations[i - 1]);
    assert.equal(locations[0], 0);
    assert.equal(locations.at(-1), 1);
    // Solid over the seam (its first CURTAIN_SEAM dp, which lie over the navy), then the smoothstep to nothing.
    assert.deepEqual(alpha.slice(0, 2), [1, 1]);
    assert.ok(near(locations[1] * h, CURTAIN_SEAM, 1e-9));
    locations.slice(1).forEach((l, i) => assert.ok(near(alpha[i + 1], featherLeft((l * h - CURTAIN_SEAM) / FEATHER), 1e-9)));
    // What a phone draws at the join, at any fractional offset: each edge covers its row in part. Butted, the screen
    // beneath shows through a quarter at worst (the light line); overlapped by CURTAIN_SEAM, never.
    const cover = (top: number, bottom: number, row: number) => Math.max(0, Math.min(bottom, row + 1) - Math.max(top, row));
    const join = (seam: number) => {
      let worst = 1;
      for (let f = 0; f < 1; f += 0.05) {
        // The navy's lower edge at 500 + f; the soft edge, one view, from `seam` above it down FEATHER below it.
        const edge = 500 + f;
        for (let row = 495; row <= 501; row++) {
          const navy = cover(0, edge, row);
          const down = row + 0.5 - edge;
          const feather = cover(edge - seam, edge + FEATHER, row) * (down < 0 ? 1 : featherLeft(down / FEATHER));
          worst = Math.min(worst, 1 - (1 - navy) * (1 - feather));
        }
      }
      return worst;
    };
    assert.ok(join(0) < 0.8, String(join(0)));
    assert.ok(join(CURTAIN_SEAM) > 0.99, String(join(CURTAIN_SEAM)));
    // And the component lays them out so: the navy reaches CURTAIN_SEAM below the screen, the room light and the soft
    // edge start at the screen's bottom (at rest the overlap is off the screen: the first frame is the splash's).
    const code = readFileSync(resolve(APP, 'src/components/fx/intro.tsx'), 'utf8');
    assert.ok(code.includes("curtain: { position: 'absolute', top: 0, right: 0, bottom: -(CURTAIN_SEAM + FEATHER), left: 0"));
    assert.ok(code.includes("navy: { position: 'absolute', top: 0, right: 0, bottom: FEATHER, left: 0, backgroundColor: SPLASH_NAVY }"));
    assert.ok(code.includes("sky: { position: 'absolute', top: 0, right: 0, bottom: CURTAIN_SEAM + FEATHER, left: 0 }"));
    assert.ok(code.includes("feather: { position: 'absolute', right: 0, bottom: 0, left: 0, height: CURTAIN_SEAM + FEATHER }"));
    assert.ok(code.includes('rise.setValue(-(height + CURTAIN_SEAM + FEATHER))'));
    assert.ok(code.includes('locations={FEATHER_AT}') && code.includes('FEATHER_STOPS.locations'));
    // At rest the opaque edge is the overlap's bottom, below the screen; at the end the soft edge is off the top.
    assert.equal(curtainEdge(844, 0), 844 + CURTAIN_SEAM);
    assert.equal(curtainEdge(844, 1) + FEATHER, 0);
  });

  test('logo kutusu kare değilse resim ortalanmış ("contain")', () => {
    const wide = matchCut(34, cover, 207, { ...to, logo: { x: 127, y: 140, width: 136, height: 96 } })!;
    const square = matchCut(34, cover, 207, to)!;
    assert.ok(near(wide.mark.x, square.mark.x, 1e-9) && near(wide.mark.y, square.mark.y, 1e-9) && near(wide.mark.k, square.mark.k, 1e-9));
  });

  test('anlamsız ölçüde eşleşme yok (her zamanki kalkış)', () => {
    assert.equal(matchCut(34, cover, 0, to), null);
    assert.equal(matchCut(34, { ...cover, width: 0 }, 207, to), null);
    assert.equal(matchCut(34, cover, 207, { ...to, logo: { ...to.logo, width: 0, height: 0 } }), null);
    assert.equal(matchCut(34, cover, 207, { ...to, logo: { ...to.logo, y: 2000 } }), null);
    assert.equal(matchCut(34, cover, 207, { ...to, title: { ...to.title, width: 20 } }), null);
    assert.equal(matchCut(34, cover, 207, { ...to, title: { ...to.title, x: Number.NaN } }), null);
  });
});

describe('açılış: dokununca da aynı geçiş, daha hızlı, logonun o anki yerinden', () => {
  // The sign-in screen at 390 x 844 (as above).
  const cover: Rect = { x: 0, y: 0, width: 390, height: 844 };
  const to: Landing = { logo: { x: 147, y: 140, width: 96, height: 96 }, title: { x: 86, y: 248, width: 218, height: 48 } };
  /** Where the drawn mark's middle is on the screen, and how wide it is, for a pose of its box. */
  const drawn = (p: Pose) => ({
    x: cover.width / 2 + p.x + p.k * (MARK_SHAPE.cx - MARK_BOX / 2),
    y: cover.height / 2 + p.y + p.k * (MARK_SHAPE.cy - MARK_BOX / 2),
    w: p.k * MARK_SHAPE.width,
  });
  /** A tap at `tap` ms of the main clock: the exit runs EXIT_FAST ms while the main clock plays on underneath. */
  const skip = (F: number, tap: number, exit: ExitTo, ms: number) => {
    const tl = timeline(F);
    const e = Math.min(EXIT, (ms * EXIT) / EXIT_FAST);
    return { tl, e, t: Math.min(TOTAL, tap + ms), pose: flight(markPose(tl, Math.min(TOTAL, tap + ms)), exit.mark, at(EXIT_TRACKS.fly, e)) };
  };

  for (const tap of [150, 600, 1700, TOTAL]) {
    test(`${tap} ms'de dokunuş: logo sıçramadan kalkıp giriş logosunun tam üstüne iniyor; ışıkları sönüp başları dikleşiyor`, () => {
      const F = 34;
      const cut = matchCut(F, cover, 6.1 * F, to)!;
      const tl = timeline(F);
      // Not a jump: at the exit's start it is exactly where the main clock has it.
      assert.deepEqual(skip(F, tap, cut, 0).pose, markPose(tl, tap));
      // Smooth: under 40 dp a frame (60 fps) all the way, though it covers about 230 dp in 300 ms.
      let worst = 0;
      for (let ms = 0; ms + 1000 / 60 <= EXIT_FAST; ms += 1) {
        const [a, b] = [drawn(skip(F, tap, cut, ms).pose), drawn(skip(F, tap, cut, ms + 1000 / 60).pose)];
        worst = Math.max(worst, Math.hypot(b.x - a.x, b.y - a.y));
      }
      assert.ok(worst < 40, `${worst.toFixed(1)} dp`);
      // And it lands exactly on the logo, at the logo's size, wherever the main clock has got to.
      const end = drawn(skip(F, tap, cut, EXIT_FAST).pose);
      assert.ok(near(end.x, to.logo.x + 96 * LOGO_MARK.cx, 1e-9) && near(end.y, to.logo.y + 96 * LOGO_MARK.cy, 1e-9));
      assert.ok(near(end.w, 96 * LOGO_MARK.width, 1e-9));
      // Before it starts to fade into the logo (and before the curtain uncovers the logo) it is the logo's own
      // picture: heads upright, every light out (each times 1 - calm).
      const fades = [...Array(EXIT + 1).keys()].find((e) => at(EXIT_TRACKS.markCut, e) < 1)!;
      for (let e = fades; e <= EXIT; e++) {
        const t = Math.min(TOTAL, tap + (e * EXIT_FAST) / EXIT);
        const calmed = 1 - at(EXIT_TRACKS.calm, e);
        assert.equal(at(tl.lean, t) * calmed, 0, `lean @${e}`);
        for (const r of lightTracks(tl)) assert.equal(at(r, t) * calmed, 0, `light @${e}`);
      }
      // The name is gone before the title shows (as in the match cut at the end).
      assert.equal(at(EXIT_TRACKS.nameCut, 140), 0);
    });
  }

  test('ana sayfada (logosuz) dokunuş: logo o anki yerinden biraz kalkıp sönüyor', () => {
    const F = 34;
    const tl = timeline(F);
    for (const tap of [150, 600, 1700]) {
      const lift = liftTo(F, markPose(tl, tap));
      assert.deepEqual(flight(markPose(tl, tap), lift.mark, at(EXIT_TRACKS.lift, 0)), markPose(tl, tap));
      // Up by about 16 dp, a touch bigger: not flown off to the lockup's place.
      assert.ok(lift.mark.y < markPose(tl, tap).y && markPose(tl, tap).y - lift.mark.y < 20);
      assert.ok(near(lift.mark.k, LIFT.scale * markPose(tl, tap).k, 1e-9));
    }
  });

  test('sakinleşme, zaman çizgisinin sonundaki çıkışta hiçbir şeyi değiştirmiyor', () => {
    const tl = timeline(34);
    assert.equal(at(tl.lean, TOTAL), 0);
    for (const r of lightTracks(tl)) assert.equal(at(r, TOTAL), 0);
    // It is done well before the mark fades into the logo, and moves on its own clock only.
    assert.ok(EXIT_TRACKS.calm.inputRange.at(-1)! < EXIT_TRACKS.markCut.inputRange[EXIT_TRACKS.markCut.outputRange.lastIndexOf(1)]);
  });
});

describe('açılış: ilk ekran çizilmeden açılmıyor', () => {
  const gone = 10_000;
  test('veil/çıkış, açılış ekranının solması bitmeden ve ilk ekran çizilmeden başlamıyor; en geç 600 ms', () => {
    assert.ok(DRAWN_WAIT <= 600 && DRAWN_WAIT >= 400);
    assert.ok(DRAWN_FRAME >= 16 && DRAWN_FRAME <= 34);
    const earliest = gone + SPLASH_FADE;
    // Drawn before the splash's fade ends: the veil starts as the fade ends, as before.
    assert.equal(uncoverAt(earliest, gone + 50, gone), earliest);
    // Drawn later (the web's sign-in screen, about 290 ms): a frame after it says so.
    assert.equal(uncoverAt(earliest, gone + 290, gone), gone + 290 + DRAWN_FRAME);
    // Never: at most DRAWN_WAIT after the splash went; drawn too late changes nothing.
    assert.equal(uncoverAt(earliest, null, gone), gone + DRAWN_WAIT);
    assert.equal(uncoverAt(earliest, gone + 5000, gone), gone + DRAWN_WAIT);
    // Whatever happens, it is never later than that (a tap after it: at once).
    for (const drawnAt of [null, gone, gone + 100, gone + 590, gone + 2000]) {
      for (const at0 of [earliest, gone + 150, gone + 400]) assert.ok(uncoverAt(at0, drawnAt, gone) <= gone + DRAWN_WAIT, `${drawnAt} ${at0}`);
      assert.equal(uncoverAt(gone + 1700, drawnAt, gone), gone + 1700);
    }
    // A tap at 150 ms waits for the screen (about 290 ms on the web), then goes.
    assert.equal(uncoverAt(gone + 150, gone + 290, gone), gone + 290 + DRAWN_FRAME);
  });
});

describe('açılış: iki baş', () => {
  test('bakış 200 ms’de başlıyor, yaylı eğilme 588 ms civarında 11,5°, 860’ta 10,5°, 1520’den sonra tam logo duruşu', () => {
    const tl = timeline(34);
    let peak = 0;
    let peakAt = 0;
    for (let ms = 0; ms <= TOTAL; ms++) {
      const a = at(tl.lean, ms);
      if (a > peak) [peak, peakAt] = [a, ms];
    }
    assert.ok(Math.abs(peak - 11.45) < 0.1, String(peak));
    assert.ok(Math.abs(peakAt - 588) <= 10, String(peakAt));
    assert.ok(near(leanAt(860), 10.5, 1e-9));
    // Right after the hold the glance is already clear (not a still logo for half a second).
    assert.ok(leanAt(HOLD) === 0 && leanAt(280) > 3.5, String(leanAt(280)));
    for (let ms = 1520; ms <= TOTAL; ms++) assert.equal(at(tl.lean, ms), 0, String(ms));
    assert.equal(leanAt(1520), 0);
    // Only toward each other (never away) until they straighten.
    for (let ms = 0; ms <= 1520; ms++) assert.ok(at(tl.lean, ms) >= -1e-9, String(ms));
    // Each head rises with its lean, about 2 dp at the peak (its inner rim keeps the logo's gap above its shoulder),
    // and is back down exactly when upright.
    assert.ok(near(HEAD_LIFT * peak, -2, 0.05), String(HEAD_LIFT * peak));
    assert.equal(HEAD_LIFT * at(tl.lean, TOTAL), -0);
  });

  test('her baş dış boyun köşesinden döner; kıvılcım iki başın arasında', () => {
    assert.deepEqual(PIVOT_CYAN, { x: EDGE_LEFT.x[0], y: EDGE_LEFT.y[0] });
    assert.deepEqual(PIVOT_CORAL, { x: EDGE_RIGHT.x[0], y: EDGE_RIGHT.y[0] });
    assert.ok(PIVOT_CYAN.x < HEAD_CYAN.cx && PIVOT_CORAL.x > HEAD_CORAL.cx, 'dış taraf');
    assert.ok(SPARK_AT.x > HEAD_CYAN.cx + HEAD_CYAN.r && SPARK_AT.x < HEAD_CORAL.cx - HEAD_CORAL.r);
    assert.ok(Math.abs(SPARK_AT.y - (HEAD_CYAN.cy + HEAD_CORAL.cy) / 2) < 5);
  });

  test('parıltılar kafanın içinde gidip geliyor ve görünmezken başa sarıyor', () => {
    const tl = timeline(34);
    for (const sh of [tl.coralShine, tl.cyanShine]) {
      for (let ms = 0; ms <= TOTAL; ms++) {
        const x = at(sh.x, ms);
        assert.ok(Math.abs(x) <= 38);
        // A jump of the sweep (a step) happens only while it is invisible.
        if (Math.abs(x - at(sh.x, ms - 1)) > 2) assert.equal(at(sh.opacity, ms), 0, String(ms));
      }
    }
    // The last glint: cyan first, then coral, left to right.
    assert.ok(tl.cyanShine.x.inputRange.at(-1)! < tl.coralShine.x.inputRange.at(-1)!);
    assert.ok(at(tl.cyanShine.x, 1960) < at(tl.cyanShine.x, 2120));
  });
});

describe('açılış: ışıklar kalbin kenarından uca', () => {
  test('kuyruklu yıldız zamanları formülden ve gittikçe hızlanıyor', () => {
    assert.deepEqual(COMET_MS, [660, 722, 756, 783, 807, 830, 850, 869, 887, 905, 921, 937, 953, 968, 983, 997, 1011, 1024, 1038, 1050, 1063, 1076, 1088, 1100]);
    assert.equal(COMET_MS.length, COMET_LEFT.x.length);
    assert.equal(COMET_MS.length, COMET_RIGHT.x.length);
    for (let i = 2; i < COMET_MS.length; i++) assert.ok(COMET_MS[i] - COMET_MS[i - 1] <= COMET_MS[i - 1] - COMET_MS[i - 2] + 1, `adım ${i}`);
  });

  for (const [name, side, edge] of [
    ['sol', 'cometL', COMET_LEFT],
    ['sağ', 'cometR', COMET_RIGHT],
  ] as const) {
    test(`${name} ışık kendi yolundan (kenarın hemen dışı) ayrılmıyor ve 1100 ms'de uçta`, () => {
      const c = timeline(34)[side];
      for (let i = 0; i < COMET_MS.length; i++) {
        assert.equal(at(c.x, COMET_MS[i]), edge.x[i]);
        assert.equal(at(c.y, COMET_MS[i]), edge.y[i]);
        assert.ok(near(at(c.angle, COMET_MS[i]), edge.angle[i]));
      }
      // Between two points it is on the straight piece between them.
      for (let ms = COMET_MS[0]; ms <= COMET_MS.at(-1)!; ms++) {
        const i = Math.max(0, COMET_MS.findIndex((m) => m >= ms) - 1);
        const [x, y] = [at(c.x, ms), at(c.y, ms)];
        const [ax, ay, bx, by] = [edge.x[i], edge.y[i], edge.x[i + 1] ?? edge.x[i], edge.y[i + 1] ?? edge.y[i]];
        const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
        assert.ok(Math.abs(cross) < 1e-6, `${ms} ms`);
      }
      assert.deepEqual([at(c.x, 1100), at(c.y, 1100)], [TIP.x, TIP.y]);
      assert.deepEqual([at(c.x, TOTAL), at(c.y, TOTAL)], [TIP.x, TIP.y]);
      // Seen only on its way: it fades in after it sets off and out once it has met the other at the tip.
      assert.equal(at(c.opacity, 660), 0);
      assert.equal(at(c.opacity, 800), 1);
      assert.equal(at(c.opacity, 1130), 0);
    });
  }

  test('iki ışık küçük yola çıkıp boyuna uzuyor, uçta şişip parlamaya karışıyor', () => {
    const tl = timeline(34);
    for (const c of [tl.cometL, tl.cometR]) {
      assert.ok(at(c.scale, 660) <= 0.5 && at(c.scale, 780) === 1);
      assert.equal(at(c.scale, 1000), 1);
      assert.ok(at(c.scale, 1095) > 1.8);
      assert.ok(at(c.opacity, 1085) === 1 && at(tl.tipFlash.opacity, 1110) === 1);
    }
    // The sprite: its head at the centre, room for its 28 dp tail.
    assert.ok(COMET_SIZE.width / 2 >= 28 && COMET_SIZE.height <= 16);
  });

  test('her ışığın ardında iki iz kendi yolunda, yola dönük; iz kesintisiz (noktalı değil)', () => {
    const tl = timeline(34);
    assert.equal(tl.streaks.length, 2 * STREAKS.length);
    [COMET_LEFT, COMET_LEFT, COMET_RIGHT, COMET_RIGHT].forEach((path, i) => {
      const b = tl.streaks[i];
      const lag = STREAKS[i % STREAKS.length].lag;
      assert.ok(lag >= 10 && lag <= 40);
      // On the comet's own path, lag ms behind it, turned the way the path goes there.
      for (let k = 0; k < COMET_MS.length; k++) {
        assert.equal(at(b.x, COMET_MS[k] + lag), path.x[k]);
        assert.equal(at(b.y, COMET_MS[k] + lag), path.y[k]);
        assert.ok(near(at(b.angle, COMET_MS[k] + lag), path.angle[k]));
      }
      // Dimmer than its comet, and gone into the tip's flash before it would arrive there after it.
      assert.ok(Math.max(...b.opacity.outputRange) < 1);
      assert.equal(at(b.opacity, 1105), 0);
    });
    // Close enough to overlap all the way: the comet and its first streak, and the two streaks, are never further
    // apart than the shorter streak is long (the comet's own tail is longer still).
    const len = (i: number) => STREAK_SIZE.width * STREAKS[i].size;
    for (const [c, s1, s2] of [
      [tl.cometL, tl.streaks[0], tl.streaks[1]],
      [tl.cometR, tl.streaks[2], tl.streaks[3]],
    ] as const) {
      for (let ms = 760; ms <= 1060; ms++) {
        const p = (r: { x: Range; y: Range }) => [at(r.x, ms), at(r.y, ms)] as const;
        const [a, b, d] = [p(c), p(s1), p(s2)];
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < Math.min(len(0), 28), `${ms} ms`);
        assert.ok(Math.hypot(b[0] - d[0], b[1] - d[1]) < len(1), `${ms} ms`);
      }
    }
  });
});

describe('açılış: kalbi dolduran ışık, atış', () => {
  test('ışık uçtan üç yumuşak kenarlı aşamada, 220 ms’de yükseliyor, sırayla, yalnız saydamlıkla', () => {
    const tl = timeline(34);
    assert.equal(tl.fill.length, 3);
    // Each stage peaks after the one before; at most two show at once, and together never over FILL_PEAK.
    const peaks = tl.fill.map((f) => f.opacity.inputRange[f.opacity.outputRange.indexOf(FILL_PEAK)]);
    assert.deepEqual([...peaks].sort((a, b) => a - b), peaks);
    assert.ok(peaks[0] >= 1095 && peaks[2] <= 1320, String(peaks));
    // It is seen to climb: from the first light to the whole heart about 220 ms.
    const from = tl.fill[0].opacity.inputRange[0];
    assert.ok(peaks[2] - from >= 200 && peaks[2] - from <= 240, String(peaks[2] - from));
    for (let ms = 1000; ms <= 1900; ms += 5) {
      const o = tl.fill.map((f) => at(f.opacity, ms));
      assert.ok(o.filter((v) => v > 0).length <= 2, `${ms} ms`);
      assert.ok(o[0] + o[1] + o[2] <= FILL_PEAK + 1e-9, `${ms} ms`);
    }
    assert.ok(FILL_PEAK <= 0.55);
    // The last stage (the whole heart) holds the light a moment, then lets it go.
    assert.equal(at(tl.fill[2].opacity, 1380), FILL_PEAK);
    assert.equal(at(tl.fill[2].opacity, 1800), 0);
    // The stages are cut to the heart's glass, inside the mark's box.
    assert.ok(FILL_BOX.left >= 0 && FILL_BOX.top >= 0 && FILL_BOX.left + FILL_BOX.width <= MARK_BOX && FILL_BOX.top + FILL_BOX.height <= MARK_BOX);
    assert.ok(FILL_BOX.top + FILL_BOX.height >= TIP.y && FILL_BOX.top < HEAD_CYAN.cy + HEAD_CYAN.r);
  });

  test('ilk atışta halka kenardan dalga gibi yayılıyor: kenarın parıltısından çıkınca en parlak, yayılırken sönüyor', () => {
    const tl = timeline(34);
    const r = tl.ring;
    // Bright enough to read (the review found 0.5 on the rim invisible), not a second solid outline.
    assert.ok(RING_PEAK >= 0.7 && RING_PEAK <= 0.8);
    assert.equal(Math.max(...r.opacity.outputRange), RING_PEAK);
    // It spreads from the rim (1.0) to RING_SPREAD (1.12) in about 220 ms, from the lub's peak.
    assert.equal(at(r.scale, 1250), 1);
    assert.ok(near(RING_SPREAD, 1.12) && near(at(r.scale, 1470), RING_SPREAD));
    const spread = r.scale.inputRange.at(-1)! - r.scale.inputRange[0];
    assert.ok(spread >= 200 && spread <= 240, String(spread));
    // At its brightest it is already a few dp off the rim on the lobes' outer sides (where the rim is furthest from
    // the ring's centre), out of the rim's own glow.
    const peakAt = r.opacity.inputRange[r.opacity.outputRange.indexOf(RING_PEAK)];
    const cx = RING_BOX.left + RING_BOX.width / 2;
    const out = (at(r.scale, peakAt) - 1) * (cx - Math.min(...EDGE_LEFT.x));
    assert.ok(out >= 2.5 && out <= 5, `${out.toFixed(2)} dp`);
    // Gone while it is still spreading: whenever it shows (over 0.1) it moves at least 0.0003 a ms, and it is out
    // before it has spread all the way.
    for (let ms = 1250; ms < 1470; ms++) {
      if (at(r.opacity, ms) > 0.1) assert.ok(at(r.scale, ms + 1) - at(r.scale, ms) > 0.0003, String(ms));
    }
    assert.equal(at(r.opacity, r.opacity.inputRange.at(-1)!), 0);
    assert.ok(r.opacity.inputRange.at(-1)! < 1470);
    // It spreads about the middle of the heart, and stays inside the mark's box.
    const grown = (v: number, c: number) => c + RING_SPREAD * (v - c);
    const cy = RING_BOX.top + RING_BOX.height / 2;
    assert.ok(grown(RING_BOX.left, cx) >= 0 && grown(RING_BOX.left + RING_BOX.width, cx) <= MARK_BOX);
    assert.ok(grown(RING_BOX.top, cy) >= 0 && grown(RING_BOX.top + RING_BOX.height, cy) <= MARK_BOX);
    // The aura no longer washes the glass out.
    assert.ok(Math.max(...tl.aura.opacity.outputRange) <= 0.35);
    assert.ok(Math.max(...tl.aura.scale.outputRange) <= 1.04);
    // The glints are soft: at most 0.45.
    for (const sh of [tl.coralShine, tl.cyanShine]) assert.ok(Math.max(...sh.opacity.outputRange) <= 0.45);
  });
});

describe('açılış: isim', () => {
  test('yazı boyu ekrana göre: 320 dp 28, 360 dp 31, 393 dp 34, daha genişi 34', () => {
    assert.deepEqual([320, 360, 393, 430].map(fontSizeFor), [28, 31, 34, 34]);
    const l = lockup(34);
    assert.ok(near(l.TY_END, -33.1, 0.05), String(l.TY_END));
    assert.ok(near(l.WORD_Y, 51.1, 0.05), String(l.WORD_Y));
    assert.equal(l.lineHeight, 43);
    assert.ok(near(HALF_MARK, 72.2, 1e-9));
  });

  test('"Similar" soldan turkuaz, "Club" sağdan mercan; ortadan dışa doğru iner', () => {
    assert.equal(LETTERS.map((l) => l.ch).join(''), 'SimilarClub');
    assert.equal(LETTERS[WORD_BREAK].ch, 'r');
    const similar = LETTERS.slice(0, WORD_BREAK + 1);
    const club = LETTERS.slice(WORD_BREAK + 1);
    assert.deepEqual(similar.map((l) => l.k), [6, 5, 4, 3, 2, 1, 0]);
    assert.deepEqual(club.map((l) => l.k), [0, 1, 2, 3]);
    assert.deepEqual(LETTERS.map((l) => l.dx), [-22, -20, -18, -16, -14, -12, -10, 10, 12, 14, 16]);
    assert.ok(new Set(similar.map((l) => l.color)).size === 1 && new Set(club.map((l) => l.color)).size === 1);
    assert.notEqual(similar[0].color, club[0].color);
    // The last letter lands at 1984, well before the exit.
    const last = Math.max(...LETTERS.map((l) => letterStart(l.k) + LETTER_MOVE));
    assert.equal(last, 1984);
    assert.ok(TOTAL - last >= 200);
  });

  for (const F of SIZES) {
    test(`F ${F}: bitmiş "Similar Club" çıkıştan önce en az 450 ms duruyor`, () => {
      const tl = timeline(F);
      // Finished: every letter fully there (98%) and within half a dp of its place (what a frame shows as still), and
      // the mark in the lockup.
      const finished = (ms: number) =>
        tl.letters.every((l) => at(l.opacity, ms) >= 0.98 && Math.abs(at(l.x, ms)) <= 0.5 && Math.abs(at(l.y, ms)) <= 0.5) && at(tl.mark.y, ms) === lockup(F).TY_END;
      const from = [...Array(TOTAL + 1).keys()].find(finished)!;
      for (let ms = from; ms <= TOTAL; ms++) assert.ok(finished(ms), String(ms));
      assert.ok(TOTAL - from >= 450, `${from} ms: ${TOTAL - from} ms`);
      // The mark has risen into the lockup before the name is finished, from the heartbeat's dub on.
      assert.ok(RISE[1] <= from && RISE[0] >= 1250 && RISE[0] < 1400);
    });
  }

  test('harfler hızlı beliriyor, satır düz kalıyor (en çok 0,12 F yükselme)', () => {
    assert.ok(LETTER_FADE <= 160);
    assert.ok(LETTER_RISE <= 0.12);
    const tl = timeline(34);
    tl.letters.forEach((l, i) => {
      const s = letterStart(LETTERS[i].k);
      assert.equal(at(l.opacity, s + LETTER_FADE), 1);
      assert.ok(Math.max(...l.y.outputRange) <= 0.12 * 34 + 1e-9);
    });
  });

  for (const F of SIZES) {
    test(`F ${F}: kalbin ucu (ve ışığı) her harf başlarken harflerin üst çizgisinin üstünde`, () => {
      const tl = timeline(F);
      const { WORD_Y } = lockup(F);
      LETTERS.forEach((l, i) => {
        const s = letterStart(l.k);
        const tip = at(tl.mark.y, s) + HALF_MARK * at(tl.mark.scale, s);
        const capTop = WORD_Y - CAP_TOP * F + at(tl.letters[i].y, s);
        assert.ok(tip + 8 < capTop, `${l.ch}: uç ${tip.toFixed(1)}, üst çizgi ${capTop.toFixed(1)}`);
        assert.equal(at(tl.tipBloom.opacity, s), 0);
        assert.equal(at(tl.tipFlash.opacity, s), 0);
      });
      // And once settled, the gap between the tip and the cap line is about GAP.
      const tipEnd = at(tl.mark.y, TOTAL) + HALF_MARK * at(tl.mark.scale, TOTAL);
      const capEnd = WORD_Y - CAP_TOP * F;
      assert.ok(capEnd - tipEnd > 16 && capEnd - tipEnd < 24, String(capEnd - tipEnd));
    });
  }
});

describe('açılış: bütçe', () => {
  test(`en çok 35 hareketli görünüm (bu açılışta ${ANIMATED_VIEWS})`, () => {
    assert.equal(ANIMATED_VIEWS, LAYERS.length + LETTERS.length);
    assert.ok(ANIMATED_VIEWS <= 35);
    assert.equal(new Set(LAYERS).size, LAYERS.length);
  });

  test('bileşen: her katman bir kez, kolaylaştırma yalnız Animated.timing’de, hepsi yerel sürücüde, görseller ≤ 600 px', () => {
    const src = readFileSync(resolve(APP, 'src/components/fx/intro.tsx'), 'utf8');
    const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    // The fixed layers are written once each; the fill's stages, the streaks and the letters come from one line each.
    const tl = timeline(34);
    assert.equal((code.match(/<Animated\.(View|Image)\b/g) ?? []).length, LAYERS.length - tl.fill.length - tl.streaks.length + 3);
    assert.equal(LAYERS.filter((l) => l.startsWith('fill')).length, tl.fill.length);
    assert.equal(LAYERS.filter((l) => l.startsWith('streak')).length, tl.streaks.length);
    // No interpolation carries an easing (the phones would run it linearly): easing appears only in Animated.timing.
    const interpolations = code.split('.interpolate(').slice(1).map((rest) => rest.slice(0, rest.indexOf('})')));
    assert.ok(interpolations.length >= 4);
    for (const conf of interpolations) assert.ok(!conf.includes('easing'), conf);
    const timings = code.match(/Animated\.timing\([^;]*?\}\)/g) ?? [];
    assert.equal(timings.length, 3, 'üç saat: t, e, örtü');
    for (const tm of timings) assert.ok(tm.includes('useNativeDriver: NATIVE'), tm);
    assert.equal((code.match(/easing:/g) ?? []).length, timings.length);
    // The splash's own navy, not the app theme's bg; no Lottie, no SVG.
    assert.ok(code.includes('backgroundColor: SPLASH_NAVY'));
    assert.ok(!/colors\.bg|lottie|react-native-svg/.test(code));
    // Every picture is at most 600 px on a side and every Image skips Android's fade-in.
    const files = [...code.matchAll(/require\('\.\.\/\.\.\/\.\.\/(assets\/[^']+)'\)/g)].map((m) => m[1]);
    assert.ok(files.length >= 9);
    for (const f of files) {
      const b = readFileSync(resolve(APP, f));
      const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
      assert.ok(w <= 600 && h <= 600, `${f} ${w}x${h}`);
    }
    for (const img of code.match(/<(Animated\.)?Image\b[^>]*>/g) ?? []) assert.ok(img.includes('fadeDuration={0}'), img);
    // The cropped layers are drawn in their own boxes, at their own shape (no "cover" crop): 3 px per dp.
    for (const [name, box] of [
      ['fill-1.png', FILL_BOX],
      ['fill-2.png', FILL_BOX],
      ['fill-3.png', FILL_BOX],
      ['heart-ring.png', RING_BOX],
    ] as const) {
      const b = readFileSync(resolve(APP, 'assets/intro', name));
      assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [3 * box.width, 3 * box.height], name);
    }
    assert.ok(code.includes('fill: boxed(FILL_BOX)') && code.includes('ring: boxed(RING_BOX)'));
    // No hard-edged light bar any more, and no window sliding over the heart.
    assert.ok(!/front|fillWindow|overflow: 'hidden' as const \}\);\n\s*fill/.test(code));
    // The exit's lockup fades as one picture.
    assert.ok(/<Animated\.View needsOffscreenAlphaCompositing style=\{\[s\.box, n\.markStyle\]\}/.test(code));
    // The failsafe leaves as a tap does; only after the exit's own time is the cover cut.
    assert.ok(code.includes('arm(FAILSAFE, FAILSAFE + EXIT_FAST + FAILSAFE_GRACE)'));
    assert.ok(code.includes('arm(FAILSAFE_RUN, FAILSAFE_RUN + EXIT_FAST + FAILSAFE_GRACE)'));
    assert.ok(!/setTimeout\(onDone, FAILSAFE\)/.test(code));
    // The skip keeps its accessible name and hint.
    assert.ok(code.includes('accessibilityLabel="Similar Club"') && code.includes('accessibilityHint="Açılışı geçmek için dokun"'));
  });
});
