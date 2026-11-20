// Where the stage's seats sit and how much room their frames have above the faces (lib/stage-rows): every row of seats,
// the first one included (under the header, under a board, under the Patron seat), and the row under a video tile,
// has a row's room (SEAT_TOP), so the same frame is as big on every row and nothing is cut; a camera-off tile leaves
// it too. A row higher on the screen is drawn over the rows under it, and what it draws over a crown's tip (the points
// pill, a team's name line) is opaque or shadowed.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FRAME_ART_SIZES } from '@/data/frame-art';
import { ROOM_LAYOUTS, type LayoutSchema } from '@/data/room-layouts';
import { PILL_BASE, pkPillFill, tintOver } from '@/lib/pk';
import { seatArt, seatPhotoDisc, seatRoom } from '@/lib/seat-cell';
import {
  BOARD_GAP,
  CELL_GAP,
  PK_LINE,
  ROW_GAP,
  SEAT_TOP,
  STAGE_HEADROOM,
  STAGE_PAD_TOP,
  drawnRows,
  fitGrid,
  isVideoRow,
  layoutHeight,
  layoutPlan,
  layoutSizes,
  rowGapOver,
  seatHeight,
  videoTile,
  type LayoutPlan,
} from '@/lib/seat-fit';
import { SIDE_GAP, TILE_BORDER, TILE_TOP_MIN, firstRowRoom, gridPlace, layoutRows, sidePlace, stageTop, tileCornerSeat, tileSeat, type StageTopOpts } from '@/lib/stage-rows';

const SRC = resolve(import.meta.dirname, '..', 'src');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf8');
const FRAMES = Object.entries(FRAME_ART_SIZES);
const WIDTHS = [320, 360, 390, 412, 480, 640];
/** Every case of what is over the first row. */
const OVER: StageTopOpts[] = [false, true].flatMap((boss) => [false, true].map((boards) => ({ boss, boards })));

/** A layout row's height as stage-layout draws it (lib/seat-fit rowHeight). */
function rowHeight(s: LayoutSchema, plan: LayoutPlan, face: number, r: number) {
  const xs = s.slots.filter((x) => x.area === 'stage' && x.row === r);
  if (isVideoRow(s, r)) return videoTile(plan, xs.length).h;
  const sizes = layoutSizes(plan, face);
  const tallest = xs.some((x) => x.kind === 'main') ? sizes.main.size : xs.length === 1 && xs[0].host ? sizes.host.size : sizes.mic.size;
  return seatHeight(tallest) + (plan.bands && xs[0].team ? 34 : 0);
}

describe('Sahnenin ilk sırası', () => {
  test('ilk sıranın üstünde de bir sıranın payı: başlığın altında, panonun altında, Patron koltuğunun altında', () => {
    assert.equal(SEAT_TOP, ROW_GAP + PK_LINE - CELL_GAP);
    assert.equal(STAGE_HEADROOM + STAGE_PAD_TOP, SEAT_TOP);
    assert.equal(BOARD_GAP, STAGE_HEADROOM, 'panonun altındaki boşluk, panonun örttüğü baş payının yerine');
    for (const layout of [false, true]) {
      for (const o of OVER) {
        const at = `${layout ? 'düzen' : 'ızgara'}, patron ${o.boss}, pano ${o.boards}`;
        assert.ok(firstRowRoom({ ...o, layout }) >= SEAT_TOP, `${at}: ${firstRowRoom({ ...o, layout })} px`);
        assert.equal(stageTop({ ...o, layout }), SEAT_TOP, at);
      }
    }
    // As laid out: the headroom and the padding; under a board its gap and the padding; under the Patron seat its
    // points line and the grid's row gap or the layout's padding.
    assert.equal(firstRowRoom({}), STAGE_HEADROOM + STAGE_PAD_TOP);
    assert.equal(firstRowRoom({ boards: true }), BOARD_GAP + STAGE_PAD_TOP);
    assert.equal(firstRowRoom({ boss: true }), PK_LINE + ROW_GAP);
    assert.equal(firstRowRoom({ boss: true, layout: true }), PK_LINE + STAGE_PAD_TOP);
  });

  test('sahne bu payları çizer ve boyunu bunlarla hesaplar; pano bilgisi ölçüden, ayrı bir onLayout yok', () => {
    const fit = read('components/room/fit-stage.tsx');
    assert.match(fit, /import \{ BOARD_GAP, STAGE_HEADROOM as HEADROOM, easedChange, type Fitted \} from '@\/lib\/seat-fit';/);
    assert.doesNotMatch(fit, /const HEADROOM = /, 'baş payı tek yerde (lib/seat-fit)');
    assert.match(fit, /const boards = topH > 0;/);
    assert.match(fit, /const boardsH = boards \? topH \+ BOARD_GAP : 0;/);
    assert.match(fit, /fitMics\(fit, calm, box, bar, basis, boardsH\)/);
    assert.match(fit, /const holds = boardsH \+ /);
    assert.match(fit, /\{boards && <View style=\{\{ height: BOARD_GAP \}\} \/>\}/);
    assert.match(fit, /seats\(fitted, boards\)/);
    const room = read('components/room/live-room.tsx');
    assert.doesNotMatch(room, /setBoardsOver|boardsOver/, 'panolar kendi onLayout’uyla ayrıca ölçülmez');
    assert.match(room, /const stageSeats = \(f: Fitted \| null, boards: boolean\) =>/);
    assert.match(room, /top=\{stageTop\(\{ boss: bossOn, boards, layout: true \}\)\}/);
    assert.match(room, /gridPlace\(i, f\.cols, allSeats\.length, stageTop\(\{ boss: bossOn, boards \}\)\)/);
    assert.match(room, /seatGrid: \{[^}]*paddingTop: STAGE_PAD_TOP, rowGap: ROW_GAP \}/);
    assert.match(room, /guestGrid: \{[^}]*rowGap: ROW_GAP \}/);
    const layout = read('components/room/stage-layout.tsx');
    assert.match(layout, /wrap: \{[^}]*paddingTop: STAGE_PAD_TOP, gap: ROW_GAP,/);
    assert.match(layout, /new Map\(layoutRows\(s, top\)\.map/);
    assert.match(layout, /marginTop: Math\.max\(0, p\.gap - ROW_GAP\)/);
  });
});

describe('Sıraların yeri', () => {
  test('klasik ızgara: ilk sıra sahnenin payını, öbürleri bir sıranınkini alır; üstteki sıra alttakinin üstünde çizilir', () => {
    for (const width of [360, 390, 412]) {
      for (let count = 1; count <= 30; count++) {
        const f = fitGrid(count, width, 2_000);
        const rows = Math.ceil(count / f.cols);
        for (const o of OVER) {
          const first = stageTop(o);
          for (let i = 0; i < count; i++) {
            const p = gridPlace(i, f.cols, count, first);
            const row = Math.floor(i / f.cols);
            const at = `${width} px, ${count} mikrofon, ${i}. koltuk`;
            assert.equal(p.top, row === 0 ? first : SEAT_TOP, at);
            assert.equal(p.top, SEAT_TOP, `${at}: her sırada aynı pay`);
            assert.equal(p.layer, rows - row, at);
            assert.ok(p.layer >= 1, at);
          }
        }
      }
    }
  });

  test('her düzen, panolu panosuz, Patronlu Patronsuz: her koltuk sırasının üstünde bir sıranın payı gerçekten var', () => {
    for (const l of ROOM_LAYOUTS) {
      const s = l.layoutSchema;
      for (const o of OVER) {
        const first = stageTop({ ...o, layout: true });
        const rows = layoutRows(s, first);
        assert.deepEqual(
          rows.map((r) => r.row),
          drawnRows(s),
          l.id,
        );
        rows.forEach((r, k) => {
          const at = `${l.id} ${r.row}. sıra, patron ${o.boss}, pano ${o.boards}`;
          assert.equal(r.video, isVideoRow(s, r.row), at);
          assert.equal(r.gap, rowGapOver(s, r.row), at);
          assert.equal(r.layer, rows.length - k, `${at}: üstteki sıra üstte çizilir`);
          if (r.video) return;
          assert.equal(r.top, SEAT_TOP, `${at}: her sırada aynı pay`);
          // The px really there: the first row's from the stage; else the gap and, under a row of seats, its points line
          // (a side layout's first row is its big video and the column beside it).
          const prev = rows[k - 1];
          const sided = s.slots.some((x) => x.area === 'side');
          const room = !prev ? firstRowRoom({ ...o, layout: true }) : r.gap + (prev.video || (sided && prev.row === 0) ? 0 : PK_LINE);
          assert.ok(room >= r.top, `${at}: ${room} px var, ${r.top} söylenir`);
        });
      }
    }
  });

  test('video karesinin altındaki koltuk sırası bir puan satırı kadar daha aşağıda; sahne boyu tam bunu sayar', () => {
    let under = 0;
    for (const l of ROOM_LAYOUTS) {
      const s = l.layoutSchema;
      const drawn = drawnRows(s);
      const sided = s.slots.some((x) => x.area === 'side');
      drawn.forEach((r, k) => {
        const prev = drawn[k - 1];
        const want = k === 0 ? 0 : ROW_GAP + ((isVideoRow(s, prev) || (sided && prev === 0)) && !isVideoRow(s, r) ? PK_LINE : 0);
        assert.equal(rowGapOver(s, r), want, `${l.id} ${r}. sıra`);
        if (want > ROW_GAP) under++;
      });
      if (sided) continue;
      // lib/seat-fit layoutHeight counts what stage-layout draws: its top padding, each row and the gap over it.
      for (const width of [360, 390]) {
        for (const pkRoom of [false, true]) {
          const plan = layoutPlan(s, width, pkRoom);
          for (const face of [30, 44, 52]) {
            const sum = STAGE_PAD_TOP + drawn.reduce((h, r) => h + rowGapOver(s, r) + rowHeight(s, plan, face, r), 0);
            assert.equal(layoutHeight(s, plan, face), sum, `${l.id} ${width} px, yüz ${face}`);
          }
        }
      }
    }
    assert.ok(under >= 6, `video altında ${under} sıra`);
  });

  test('yan sütun: ilk koltuklar sahnenin payını, alttakiler aradaki boşlukla üstündekinin puan satırını alır', () => {
    for (const cols of [1, 2, 3]) {
      for (let count = 1; count <= 9; count++) {
        const rows = Math.ceil(count / cols);
        for (let k = 0; k < count; k++) {
          const p = sidePlace(k, cols, rows, SEAT_TOP);
          assert.equal(p.top, k < cols ? SEAT_TOP : SIDE_GAP + PK_LINE);
          assert.equal(p.layer, rows - Math.floor(k / cols));
        }
      }
    }
  });
});

describe('Kamerası kapalı video karesi', () => {
  /** Every tile a layout draws: rows of one to three tiles, and a side layout's big video, on every phone width. */
  function tiles() {
    const out: { w: number; h: number; at: string }[] = [];
    for (const width of WIDTHS) {
      for (const l of ROOM_LAYOUTS) {
        const s = l.layoutSchema;
        const plan = layoutPlan(s, width, false);
        for (const r of drawnRows(s).filter((r) => isVideoRow(s, r))) {
          const n = s.slots.filter((x) => x.area === 'stage' && x.row === r).length;
          const side = s.slots.filter((x) => x.area === 'side');
          if (side.length && r === 0) {
            // stage-layout's big video beside the column (lib/seat-fit layoutHeight's block).
            const sideCols = side.length > 6 ? 3 : side.length > 3 ? 2 : 1;
            const bigW = plan.inner - 60 * sideCols - 8;
            const sideRows = Math.ceil(side.length / sideCols);
            const bigH = Math.max(Math.round(Math.max(150, Math.min(320, bigW * 0.95))), sideRows * seatHeight(38) + (sideRows - 1) * SIDE_GAP);
            out.push({ w: bigW, h: Math.round(bigH / n), at: `${l.id} ${width} px büyük video` });
          } else out.push({ ...videoTile(plan, n), at: `${l.id} ${width} px, sırada ${n}` });
        }
      }
    }
    return out;
  }

  test('yüz, üstünde bir sıranın payı kalacak boyda; koltuk karenin içinde, hiçbir çerçeve kesilmez ya da durmaz', () => {
    const seen = new Set<string>();
    for (const { w, h, at } of tiles()) {
      const t = tileSeat(w, h);
      seen.add(`${w}x${h}:${t.size}`);
      assert.ok(t.size >= 32 && t.size <= 72, `${at}: yüz ${t.size}`);
      assert.ok(t.size <= Math.min(w, h) - 40, `${at}: yüz karenin kenarına yakın`);
      assert.equal(t.width, w - 8, at);
      assert.equal(t.top, t.y, `${at}: koltuğun üstü yüzün üstü`);
      // Every tile a layout draws is at least 96 px tall: a row's room is always left.
      assert.ok(t.top >= SEAT_TOP, `${at}: üstte ${t.top} px`);
      assert.ok(t.y + seatHeight(t.size) <= h - 2 * TILE_BORDER, `${at}: koltuk karenin altından taşar`);
      for (const [id, art] of FRAMES) {
        const s = seatArt(art, t.size, seatRoom(t.size, t.width, t.top));
        assert.ok(!s.clip && !s.still, `${at}, ${id}: kesilir ya da durur`);
        assert.ok(seatPhotoDisc(art, s.frame, s.avatar) >= 0.6 * t.size, `${at}, ${id}: fotoğraf çok küçük`);
      }
    }
    assert.ok(seen.size >= 10, 'farklı kare boyları denendi');
    // The tiles the owners' phones draw (360 and 390 px): two to a row and three to a row.
    assert.deepEqual(tileSeat(164, 118), { width: 156, size: 56, top: SEAT_TOP, y: SEAT_TOP });
    assert.deepEqual(tileSeat(179, 129), { width: 171, size: 67, top: SEAT_TOP, y: SEAT_TOP });
    assert.deepEqual(tileSeat(106, 96), { width: 98, size: 35, top: SEAT_TOP, y: SEAT_TOP });
    assert.equal(tileSeat(241, 170).size, 72, 'tek büyük karede ev sahibi kadar');
  });

  test('çok alçak bir karede en az 16 px üstte kalır, yüz 32’nin altına inmez', () => {
    const t = tileSeat(120, 2 * TILE_BORDER + TILE_TOP_MIN + seatHeight(32));
    assert.equal(t.size, 32);
    assert.ok(t.top >= TILE_TOP_MIN && t.top < SEAT_TOP, `${t.top}`);
    assert.equal(tileSeat(60, 60).size, 32);
  });

  test('kamera açıkken köşedeki küçük koltuk karenin kalan yerini bilir', () => {
    for (const h of [96, 118, 170]) {
      const c = tileCornerSeat(h);
      assert.equal(c.size, 28);
      assert.equal(c.top, h - 2 * TILE_BORDER - 2 - seatHeight(28));
    }
  });
});

describe('Üst sıra alttakinin tacının ucunu örter', () => {
  test('PK puan rozeti opak: altın tonu koyu bir zeminin üstünde, tek renk', () => {
    assert.equal(tintOver('#000000', '#FFFFFF', 0.5), '#808080');
    assert.equal(tintOver('#1A1024', '#F6BD60', 0), '#1A1024');
    assert.equal(tintOver('#1A1024', '#F6BD60', 1), '#F6BD60');
    for (const big of [false, true]) {
      const fill = pkPillFill(big);
      assert.match(fill, /^#[0-9A-F]{6}$/, 'saydam değil');
      assert.equal(fill, tintOver(PILL_BASE, '#F6BD60', big ? 0.3 : 0.18));
    }
    assert.equal(pkPillFill(), '#422F2F');
    const parts = read('components/room/parts.tsx');
    assert.match(parts, /pkPill: \{[^}]*backgroundColor: pkPillFill\(\),/);
    assert.match(parts, /pkPillBig: \{ backgroundColor: pkPillFill\(true\) \}/);
  });

  test('Takım PK yarısının başlığı koyu, neredeyse opak zeminde ve gölgeli; PK düzenindeki takım bandının adı gölgeli', () => {
    const pk = read('components/room/pk.tsx');
    const head = pk.match(/halfHead: \{([^}]*)\}/)?.[1] ?? '';
    const alpha = Number(head.match(/backgroundColor: 'rgba\(\d+,\d+,\d+,([\d.]+)\)'/)?.[1]);
    assert.ok(alpha >= 0.85, `başlığın zemini ${alpha}`);
    assert.match(pk, /<View style=\{\[st\.halfHead, \{ zIndex: 1 \}\]\}>/);
    for (const name of ['halfName', 'halfCount']) assert.match(pk, new RegExp(`${name}: \\{[^}]*textShadowColor: 'rgba\\(0,0,0,0\\.75\\)', textShadowRadius: 3`));
    const layout = read('components/room/stage-layout.tsx');
    assert.match(layout, /zoneName: \{[^}]*textShadowColor: 'rgba\(0,0,0,0\.75\)', textShadowRadius: 3 \}/);
  });
});

describe('Katkı listesi', () => {
  test('çerçevenin dar yayılımı (1.4) yalnız listenin satırlarında ve kendi satırımda; kürsüde her yerdeki gibi', () => {
    const board = read('components/room/contrib-board.tsx');
    assert.match(board, /const ROW_FRAME_SPREAD = 1\.4;/);
    assert.match(board, /<Face who=\{person\('me'\)\} size=\{40\} spread=\{ROW_FRAME_SPREAD\} \/>/);
    assert.match(board, /<Face who=\{who\} size=\{40\} spread=\{ROW_FRAME_SPREAD\} \/>/);
    assert.match(board, /<Face who=\{who\} size=\{face\} ring=\{p\.ring\} wreath=\{wreath\} \/>/, 'kürsüde yayılım verilmez');
    assert.match(board, /artScale=\{spread\}/);
  });
});
