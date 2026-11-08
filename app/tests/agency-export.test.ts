/// <reference types="node" />
// Agency streamer earnings as a table (lib/agency-export): opens in Excel in Turkish, a formula can't sneak in.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { csvCell, earningsCsv } from '@/lib/agency-export';

describe('Yayıncı kazancı dışa aktarma', () => {
  test('noktalı virgül, ondalık virgül; bu ayın en yükseği önce', () => {
    const csv = earningsCsv([
      { name: 'Ece', username: 'ece', agencyName: 'Mavi', joinedAt: '2026-10-02T10:00:00Z', week: 1000, month: 5000, diamonds30: 6000 },
      { name: 'Su', username: null, agencyName: 'Mavi', joinedAt: '2026-09-12T10:00:00Z', week: 2500, month: 12500, diamonds30: 13000 },
    ]);
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'Yayıncı;Kullanıcı adı;Ajans;Katılım;Bu hafta (elmas);Bu hafta (USD);Bu ay (elmas);Bu ay (USD);Son 30 gün (elmas)');
    assert.equal(lines[1], 'Su;;Mavi;2026-09-12;2500;0,50;12500;2,50;13000');
    assert.equal(lines[2], 'Ece;ece;Mavi;2026-10-02;1000;0,20;5000;1,00;6000');
  });

  test('ayraç ve tırnak korunur; formül gibi başlayan ad metin olur', () => {
    assert.equal(csvCell('Ay; Yıldız'), '"Ay; Yıldız"');
    assert.equal(csvCell('Kız "Su"'), '"Kız ""Su"""');
    assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell('@ece'), "'@ece");
    assert.equal(csvCell(null), '');
  });
});
