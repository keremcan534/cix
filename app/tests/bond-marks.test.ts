/// <reference types="node" />
// Bağlar, Güncelleme 7 (docs/BAGLAR.md): levels up to Lv20 on both sides, the mark between two bonded people growing
// every five levels, a bond gift again going as an ordinary gift to someone I have that bond with, the rules and the
// end confirmation saying the nightly drop and the quiet end (no more "Puan düşmez"), the catalog's new numbers read
// defensively, a bond push opening my Bağlar tab, and SimilarClub Sistem's new 'bond' category.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BOND_LEVELS, BOND_REWARDS, bondEndText, bondGiftMode, bondKindOfGift, bondPointsOf, bondRulesText, bondTier, levelFloor, tierLook, type RoomBond } from '@/data/bonds';
import { markSize } from '@/lib/bond-link';
import { parseBondNumbers, parseLiveCatalog } from '@/lib/live/catalog-live';
import { pushTarget } from '@/lib/push-target';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as server from '../../server/api/bond-rules.mjs';
import { NOTICE_CATEGORIES } from '../../server/api/auto-chat-rules.mjs';

const SRC = resolve(import.meta.dirname, '../src');

describe('Bağ seviyeleri ve işaretleri', () => {
  test('Lv20’ye kadar, sunucuyla aynı; mikrofon işareti Lv1’den', () => {
    assert.deepEqual(BOND_LEVELS, server.LEVELS);
    assert.equal(server.MAX_LEVEL, 20);
    assert.equal(BOND_REWARDS.find((r) => r.id === 'mikrofon')?.level, 1);
    assert.equal(levelFloor(1), 0);
    assert.equal(levelFloor(11), 3000);
    assert.equal(levelFloor(25), 45000, 'eski bir sunucu fazlasını söylese de çökmez');
  });

  test('işaret her beş seviyede büyür: halka kalınlaşır, ışıltı artar; sunucunun basamağıyla aynı', () => {
    assert.deepEqual([1, 5, 6, 10, 11, 15, 16, 20, 99, 0].map(bondTier), [1, 1, 2, 2, 3, 3, 4, 4, 4, 1]);
    for (const lv of [1, 5, 6, 10, 11, 15, 16, 20]) assert.equal(bondTier(lv), server.tierOf(lv), `Lv${lv}`);
    for (const kind of ['cift', 'kanka'] as const) {
      const looks = ([1, 2, 3, 4] as const).map((t) => tierLook(kind, t));
      for (let i = 1; i < looks.length; i++) {
        assert.ok(looks[i].width > looks[i - 1].width, 'halka kalınlaşır');
        assert.ok(looks[i].glow > looks[i - 1].glow, 'ışıltı artar');
      }
      assert.equal(looks[3].sparkle, true);
    }
    assert.notDeepEqual(tierLook('cift', 1).ring, tierLook('kanka', 1).ring, 'Çift pembe, diğerleri mavi');
  });

  test('odadaki işaret eski 16 px düğümden büyük, 24–34 px; etiket okunur kalır', () => {
    assert.deepEqual([40, 56, 64, 90].map(markSize), [24, 28, 32, 34]);
    const mark = readFileSync(resolve(SRC, 'components/bond-mark.tsx'), 'utf8');
    assert.match(mark, /Math\.max\(9, /, 'etiket 9 px altına inmez');
    assert.match(mark, /maxFontSizeMultiplier=\{1\}/);
  });
});

describe('Bağ hediyesi yeniden', () => {
  const list: RoomBond[] = [
    { a: 'me', b: 'u1', kind: 'kanka', level: 3 },
    { a: 'u2', b: 'me', kind: 'cift', level: 12 },
  ];
  test('aynı tür bağ varsa sıradan hediye, başka tür varsa olmaz, bağ yoksa istek', () => {
    assert.deepEqual(bondGiftMode(list, 'me', ['u1'], 'bag-kanka')?.mode, 'again');
    assert.deepEqual(bondGiftMode(list, 'me', ['u2'], 'bag-cift')?.mode, 'again', 'Çift de, iki yönden');
    const other = bondGiftMode(list, 'me', ['u1'], 'bag-kardes');
    assert.equal(other?.mode, 'other');
    assert.equal(other?.bond?.kind, 'kanka');
    assert.deepEqual(bondGiftMode(list, 'me', ['u7'], 'bag-kanka'), { mode: 'ask', bond: null });
    assert.equal(bondGiftMode(list, 'me', ['u1', 'u2'], 'bag-kanka'), null, 'bağ hediyesi tek kişiye');
    assert.equal(bondGiftMode(list, 'me', ['u1'], 'g4'), null, 'bağ hediyesi değil');
    assert.equal(bondKindOfGift('bag-patron'), null);
    assert.deepEqual([bondPointsOf(2500), bondPointsOf(99), bondPointsOf(-5)], [25, 0, 0]);
  });
});

describe('Kurallar ve bitirme yazısı', () => {
  test('gece düşüşü ve hediyesiz bitiş anlatılır; "Puan düşmez" kalmadı', () => {
    const text = bondRulesText().join(' ');
    assert.doesNotMatch(text, /Puan düşmez/);
    assert.match(text, /her gece bağ puanı düşer \(%10, en az 10 puan\)/);
    assert.match(text, /30 gün boyunca ikinizden hiç hediye gitmezse bağ kendiliğinden biter; 3 gün önce SimilarClub Sistem’den uyarı gelir/);
    assert.match(text, /aynı bağ hediyesi istediğin kadar gönderilebilir/);
    const panel = bondRulesText({ answerDays: 3, talkDaily: 10, cooldownDays: 0, dropPct: 0, dropFlat: 0, idleEndDays: 0, idleWarnDays: 0 }).join(' ');
    assert.match(panel, /Puan düşmez/, 'panelde düşüş kapatılırsa');
    assert.doesNotMatch(panel, /kendiliğinden biter/);
  });
  test('bitirme onayı bekleme süresini sunucudan söyler (eskiden hep "7 gün")', () => {
    assert.match(bondEndText('Ayşe', 'kanka', { answerDays: 3, talkDaily: 10, cooldownDays: 14 }), /^Ayşe ile Kanka bağın biter\..*14 gün yeniden bağ kurulamaz\.$/);
    assert.match(bondEndText('Ayşe', 'kanka', { answerDays: 3, talkDaily: 10, cooldownDays: 0 }), /hemen yeniden/);
    const tab = readFileSync(resolve(SRC, 'components/bonds.tsx'), 'utf8');
    assert.doesNotMatch(tab, /7 gün yeniden bağ kurulamaz/);
    assert.match(tab, />Bağı bitir</, 'görünür bir "Bağı bitir" düğmesi');
    assert.match(tab, /Bağ hediyesi gönder/);
  });
});

describe('Katalogun bağ sayıları', () => {
  test('yeni sayılar okunur; bozuk olan bırakılır, eski sunucunun cevabı aynen', () => {
    const levels = [...server.LEVELS];
    const n = parseBondNumbers({ answerDays: 3, cooldownDays: 7, talkDaily: 10, max: {}, levels, dropPct: 15, dropFlat: 20, idleEndDays: 0, idleWarnDays: 3 });
    assert.deepEqual(n, { answerDays: 3, cooldownDays: 7, talkDaily: 10, max: {}, levels, dropPct: 15, dropFlat: 20, idleEndDays: 0, idleWarnDays: 3 });
    const bad = parseBondNumbers({ answerDays: 3, cooldownDays: 7, talkDaily: 10, levels: [0, 10, 5], dropPct: -1, idleEndDays: 'çok' });
    assert.deepEqual(bad, { answerDays: 3, cooldownDays: 7, talkDaily: 10, max: {} });
    assert.equal(parseBondNumbers({ answerDays: 3, cooldownDays: 7, talkDaily: 10, levels: levels.map((x, i) => (i === 0 ? 1 : x)) })?.levels, undefined, 'ilki 0 olmalı');
    assert.equal(parseLiveCatalog({ gifts: [], bonds: { answerDays: 3, cooldownDays: 7, talkDaily: 10, max: { kanka: 1000 } } }).bonds?.max.kanka, 1000);
  });
});

describe('Bağ bildirimleri', () => {
  test('bağ bildirimine dokununca kendi Bağlar sekmem açılır (eskiden boş Bildirimler)', () => {
    assert.equal(pushTarget({ type: 'bond', id: '5' }), '/kullanici/me?tab=iliski');
  });
  test('SimilarClub Sistem’in her türü uygulamada bir simge ve adla; bağ dahil', () => {
    const inbox = readFileSync(resolve(SRC, 'components/team-inbox.tsx'), 'utf8');
    const block = inbox.slice(inbox.indexOf('const CATEGORY'), inbox.indexOf('};', inbox.indexOf('const CATEGORY')));
    for (const c of NOTICE_CATEGORIES as string[]) assert.match(block, new RegExp(`\\b${c}: \\{`), c);
    assert.match(block, /bond: \{ icon: 'link', color: '#[0-9A-F]{6}', label: 'Bağlar' \}/);
  });
});
