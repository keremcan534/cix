/// <reference types="node" />
// The Canlı ayarlar panel's words and local checks (lib/live-settings-format), held to the server's own rules
// (server/api/live-registry.mjs): when a change needs the second "Emin misin?", the rate's ±10 % window, the
// preview line of the rate, Turkish numbers (4.220, %2,0), Istanbul times and the reason rule (3–300).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { LiveKey, LiveValue } from '@/lib/api';
import {
  bigChange,
  campaignError,
  campaignExample,
  campaignOf,
  campaignWhen,
  coinsPer10k,
  compareVersion,
  dayLabel,
  FEATURE_LABEL,
  fmtIstanbul,
  fmtNum,
  fmtPct,
  fmtRate,
  impactText,
  istanbulAt,
  MONEY_STOP,
  parseRate,
  parseWhole,
  rateError,
  rateLine,
  rateWindow,
  REASON_CHIPS,
  reasonChips,
  reasonError,
  valueText,
  versionError,
  wholeError,
} from '@/lib/live-settings-format';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as server from '../../server/api/catalog.mjs';
import * as registry from '../../server/api/live-registry.mjs';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const isBig = (key: LiveKey, before: LiveValue, after: LiveValue) => (registry.isBig as (k: string, b: unknown, a: unknown) => boolean)(key, before, after);
const refuses = (fn: () => void) => {
  try {
    fn();
    return false;
  } catch (e) {
    if (e instanceof registry.LiveError) return true;
    throw e;
  }
};
const camp = (percent: number) => ({ percent, startsAt: new Date(NOW).toISOString(), endsAt: new Date(NOW + 3 * DAY).toISOString(), label: 'Hafta sonu' });

describe('the second confirmation', () => {
  test('matches the server big() for every key', () => {
    const gifts = registry.REGISTRY.gifts_hidden.bounds.options as string[];
    const skus = registry.REGISTRY.shop_hidden.bounds.options as string[];
    const cases: [LiveKey, LiveValue, LiveValue][] = [];
    for (const r of [40, 45, 48.35, 49.8, 51.29, 51.3, 51.5, 54.78, 60, 75]) for (const b of [40, 49.8, 50, 66.6, 75]) cases.push(['exchange_usd_try', b, r]);
    cases.push(['exchange_usd_try', 49.8, null], ['exchange_usd_try', 58, null]);
    for (let n = 0; n <= 8; n++) {
      cases.push(['gifts_hidden', [], n ? gifts.slice(0, n) : null]);
      cases.push(['gifts_hidden', gifts.slice(0, 3), gifts.slice(0, 3 + n)]);
      cases.push(['gifts_hidden', gifts.slice(0, 6), gifts.slice(2, 2 + n)]);
      cases.push(['shop_hidden', [], n ? skus.slice(0, n) : null]);
      cases.push(['shop_hidden', skus.slice(0, 3), skus.slice(0, 3 + n)]);
    }
    for (const p of [5, 20, 25, 30, 50]) cases.push(['campaign', null, camp(p)], ['campaign', camp(40), camp(p)]);
    cases.push(['campaign', camp(40), null], ['campaign', null, null]);
    for (const n of [0, 300, 999, 1000, 1001, 2000]) cases.push(['otp_global_per_hour', 300, n]);
    cases.push(['otp_global_per_hour', 1500, null]);
    cases.push(['min_version', null, '1.2.0'], ['min_version', '1.0.0', null], ['min_version', '1.0.0', '1.0.0']);
    for (const k of ['features_off', 'notice', 'packs_hidden', 'withdraw_max_diamonds', 'withdraw_weekly_diamonds'] as LiveKey[]) cases.push([k, null, null]);
    cases.push(['features_off', [], [...registry.FEATURES]], ['notice', null, 'Bakım var'], ['packs_hidden', [], ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']]);
    cases.push(['withdraw_max_diamonds', 5_000_000, 50_000], ['withdraw_weekly_diamonds', 10_000_000, 50_000]);
    for (const k of ['dm_price', 'call_voice_price', 'call_video_price', 'call_plain_voice_price', 'call_plain_video_price', 'match_voice_price', 'match_video_price'] as LiveKey[])
      for (const a of [0, 100, 119, 120, 240, 480, 481, 2000, null]) cases.push([k, 240, a]);
    for (const k of ['call_free', 'call_free_seconds', 'match_free', 'match_free_seconds', 'heart_voice_level', 'heart_video_level'] as LiveKey[]) cases.push([k, 3, 20], [k, 3, 0], [k, 3, null]);
    for (const [k, b, a] of cases) assert.equal(bigChange(k, b, a), isBig(k, b, a), `${k}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
  });

  test('switching off, ending a campaign and going back to the default never ask twice', () => {
    assert.equal(bigChange('features_off', [], [...MONEY_STOP]), false);
    assert.equal(bigChange('campaign', camp(50), null), false);
    assert.equal(bigChange('exchange_usd_try', 60, null), false);
    assert.equal(bigChange('min_version', '1.2.0', null), false);
  });
});

describe('Turkish numbers', () => {
  test('thousands with a dot, decimals with a comma', () => {
    assert.equal(fmtNum(4220), '4.220');
    assert.equal(fmtNum(10_000_000), '10.000.000');
    assert.equal(fmtRate(49.8), '49,80');
    assert.equal(fmtPct(2), '+%2,0');
    assert.equal(fmtPct(-9.96), '-%10,0');
  });

  test('the rate preview line is the server preview, with "elmas" for the emoji', () => {
    for (const [b, a] of [
      [49.8, 50.84],
      [49.8, 45],
      [55.55, 60],
      [40, 44],
      [75, 67.5],
    ]) {
      const first = (registry.impactOf('exchange_usd_try', b, a) as string).split('). ')[0];
      assert.equal(rateLine(b, a), impactText(first.endsWith('.') ? first : `${first}).`));
    }
    assert.equal(rateLine(49.8, 50.8), '10.000 elmas = 4.220 → 4.305 jeton (+%2,0).');
  });

  test('coins per 10.000 diamonds equal the server exchangeCoins at every rate', () => {
    const exchangeCoins = server.exchangeCoins as (d: number, r?: number) => number;
    for (let c = 4000; c <= 7500; c += 37) assert.equal(coinsPer10k(c / 100), exchangeCoins(10_000, c / 100), `rate ${c / 100}`);
    assert.equal(coinsPer10k(49.8), 4220);
  });

  test('the server preview reads without the emoji', () => {
    const s = registry.impactOf('withdraw_max_diamonds', 5_000_000, 1_000_000, { next: { withdraw_weekly_diamonds: 10_000_000 } }) as string;
    assert.ok(s.includes('💎'));
    assert.equal(impactText(s), 'Tek talepte en çok 5.000.000 → 1.000.000 elmas istenebilir. Bekleyen talepler etkilenmez.');
    assert.ok(!impactText(s).includes('💎'));
  });
});

describe('Istanbul time', () => {
  test('equals Intl Europe/Istanbul, wherever the phone is', () => {
    const intl = (t: number) => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    for (let t = Date.parse('2026-01-01T00:00:00Z'); t < Date.parse('2027-01-01T00:00:00Z'); t += 7 * HOUR + 13 * 60_000) assert.equal(fmtIstanbul(t, t), intl(t));
    assert.equal(fmtIstanbul('2026-11-08T20:59:00Z', NOW), '8 Kasım 23:59');
    assert.equal(fmtIstanbul('2027-01-02T09:00:00Z', NOW), '2 Ocak 2027 12:00');
    assert.equal(fmtIstanbul(null), '');
    assert.equal(fmtIstanbul('dün'), '');
  });

  test('a later start is an Istanbul day and hour', () => {
    // 12:00 UTC is 15:00 in Istanbul.
    assert.equal(new Date(istanbulAt(NOW, 0, 20)).toISOString(), '2026-11-05T17:00:00.000Z');
    assert.equal(new Date(istanbulAt(NOW, 1, 0)).toISOString(), '2026-11-05T21:00:00.000Z');
    // 22:30 UTC is already the next day in Istanbul.
    assert.equal(new Date(istanbulAt(Date.parse('2026-11-05T22:30:00Z'), 0, 9)).toISOString(), '2026-11-06T06:00:00.000Z');
    assert.equal(dayLabel(NOW, 0), 'Bugün');
    assert.equal(dayLabel(NOW, 1), 'Yarın');
    assert.equal(dayLabel(NOW, 5), '10 Kasım Salı');
  });
});

describe('the reason', () => {
  test('every chip passes; 3–300 characters after trimming', () => {
    for (const c of REASON_CHIPS) assert.equal(reasonError(c), null, c);
    assert.equal(reasonError('ab'), 'Neden en az 3 karakter olmalı.');
    assert.equal(reasonError('   ab   '), 'Neden en az 3 karakter olmalı.');
    assert.equal(reasonError('abc'), null);
    assert.equal(reasonError('ğüş'), null);
    assert.equal(reasonError('x'.repeat(300)), null);
    assert.equal(reasonError('x'.repeat(301)), 'Neden en çok 300 karakter olabilir.');
  });

  test('the suggested chip only comes first; nothing is chosen for the admin', () => {
    // The sheet starts with an empty reason, which Uygula refuses until a chip is tapped or one is written.
    assert.notEqual(reasonError(''), null);
    assert.deepEqual(reasonChips(), REASON_CHIPS);
    const ordered = reasonChips('Kampanya');
    assert.equal(ordered[0], 'Kampanya');
    assert.deepEqual([...ordered].sort(), [...REASON_CHIPS].sort());
    assert.equal(ordered.length, REASON_CHIPS.length);
  });
});

describe('local checks match the server', () => {
  test('the rate window is the one the server allows', () => {
    const checkChange = registry.checkChange as (k: string, b: unknown, a: unknown, ctx?: object) => void;
    for (const b of [40, 41.11, 49.8, 55.55, 68.19, 75]) {
      const { lo, hi } = rateWindow(b);
      assert.ok(!refuses(() => checkChange('exchange_usd_try', b, lo)), `${b} → ${lo}`);
      assert.ok(!refuses(() => checkChange('exchange_usd_try', b, hi)), `${b} → ${hi}`);
      assert.equal(rateError(b, lo), null);
      assert.equal(rateError(b, hi), null);
      for (const x of [Math.round(lo * 100 - 1) / 100, Math.round(hi * 100 + 1) / 100]) {
        const server = refuses(() => checkChange('exchange_usd_try', b, x)) || refuses(() => registry.validate('exchange_usd_try', x));
        assert.equal(rateError(b, x) !== null, server, `${b} → ${x}`);
      }
    }
    assert.equal(rateError(49.8, 30), 'Kur 40,00 ile 75,00 arasında olmalı.');
    assert.equal(rateError(49.8, 58), 'Bir kayıtta en çok %10: 44,82–54,78 arası.');
  });

  test('typed rates and whole numbers', () => {
    assert.equal(parseRate('49,8'), 49.8);
    assert.equal(parseRate(' 50.85 '), 50.85);
    assert.equal(parseRate('49,805'), null);
    assert.equal(parseRate('abc'), null);
    assert.equal(parseWhole('1.200.000'), 1_200_000);
    assert.equal(parseWhole('-5'), null);
    const max = registry.REGISTRY.withdraw_max_diamonds.bounds as { min: number; max: number; step: number };
    for (const v of [50_000, 60_000, 65_000, 5_000_000, 5_010_000, 40_000]) {
      assert.equal(wholeError(v, max, 'Tek talep sınırı', ' elmas') === null, !refuses(() => registry.validate('withdraw_max_diamonds', v)), String(v));
    }
    assert.equal(wholeError(65_000, max, 'Tek talep sınırı', ' elmas'), "Tek talep sınırı 50.000–5.000.000 elmas arasında, 10.000'in katı olmalı.");
    const otp = registry.REGISTRY.otp_global_per_hour.bounds as { min: number; max: number; step: number };
    for (const v of [0, 1, 1000, 2000, 2001]) assert.equal(wholeError(v, otp, 'Saatlik SMS sınırı') === null, !refuses(() => registry.validate('otp_global_per_hour', v)), String(v));
  });

  test('a campaign the panel builds is one the server takes', () => {
    for (const percent of [5, 25, 50]) {
      for (const days of [1, 3, 7, 14]) {
        for (const start of ['now', { day: 0, hour: 20 }, { day: 30, hour: 0 }] as const) {
          const c = campaignOf({ percent, label: '  Hafta sonu  ', start, days }, NOW);
          assert.equal(campaignError(c, NOW), null, JSON.stringify(c));
          assert.ok(!refuses(() => registry.validate('campaign', c, { now: NOW })), JSON.stringify(c));
          assert.equal(c.label, 'Hafta sonu');
        }
      }
    }
    const past = campaignOf({ percent: 20, label: 'Geçmiş', start: { day: 0, hour: 9 }, days: 1 }, NOW);
    assert.equal(campaignError(past, NOW), 'Kampanya şimdi ile 30 gün sonrası arasında başlamalı.');
    assert.ok(refuses(() => registry.validate('campaign', past, { now: NOW })));
    assert.equal(campaignError(campaignOf({ percent: 20, label: 'ab', start: 'now', days: 1 }, NOW), NOW), 'Kampanya adı 3–40 karakter olmalı.');
    assert.equal(campaignError({ ...camp(20), percent: 55 }, NOW), "Yüzde 5–50 arasında, 5'in katı olmalı.");
  });

  test('the example line uses the server campaignBonus', () => {
    for (const p of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
      const coins = (registry.campaignBonus as (c: number, k: object, at: number) => number)(100_000, camp(p), NOW);
      assert.equal(campaignExample(p), `100.000 jetonluk paket alan +${coins.toLocaleString('tr-TR')} kampanya jetonu alır.`);
    }
    assert.equal(campaignExample(20), '100.000 jetonluk paket alan +20.000 kampanya jetonu alır.');
    assert.equal(campaignWhen(camp(20), NOW), 'Bitiş: 8 Kasım 15:00');
    assert.equal(campaignWhen({ ...camp(20), startsAt: '2026-11-06T17:00:00Z' }, NOW), 'Başlangıç: 6 Kasım 20:00 · Bitiş: 8 Kasım 15:00');
  });

  test('a forced version newer than the admin’s own app is refused, as on the server', () => {
    const checkChange = registry.checkChange as (k: string, b: unknown, a: unknown, ctx?: object) => void;
    for (const [v, app] of [
      ['1.0.0', '1.0.0'],
      ['1.0.1', '1.0.0'],
      ['1.1', '1.0.9'],
      ['2', '1.9.9'],
      ['1.0', '1.0.0-beta'],
    ]) {
      assert.equal(versionError(v, app) !== null, refuses(() => checkChange('min_version', null, v, { appVersion: app })), `${v} on ${app}`);
      assert.equal(compareVersion(v, app), registry.compareVersion(v, app));
    }
    assert.equal(versionError('1.2.3.4', '9.9.9'), 'Sürüm 1.2.3 biçiminde olmalı.');
    assert.equal(versionError('1.3.0', '1.2.0'), 'Kendi uygulamandan (1.2.0) yeni bir sürümü zorunlu yapamazsın.');
  });

  test('feature names and the money-stop preset are the server’s', () => {
    assert.deepEqual(FEATURE_LABEL, registry.FEATURE_LABEL);
    for (const f of MONEY_STOP) assert.ok(registry.FEATURES.includes(f), f);
    assert.ok(!MONEY_STOP.includes('purchases'));
  });
});

describe('values as the admin reads them', () => {
  test('before → after lines', () => {
    const names = { gift: (id: string) => `Hediye ${id}`, pack: (id: string) => `${id} paketi` };
    assert.equal(valueText('features_off', ['gifts', 'withdraw']), 'Kapalı: Hediye, Para çekme');
    assert.equal(valueText('features_off', []), 'Hepsi açık');
    assert.equal(valueText('exchange_usd_try', 49.8), '1 USD = 49,80 TL');
    assert.equal(valueText('withdraw_weekly_diamonds', 10_000_000), '10.000.000 elmas');
    assert.equal(valueText('otp_global_per_hour', 0), 'SMS durdu');
    assert.equal(valueText('otp_global_per_hour', 1200), 'Saatte 1.200');
    assert.equal(valueText('campaign', camp(20), { now: NOW }), '%20 “Hafta sonu”, 5 Kasım 15:00 – 8 Kasım 15:00');
    assert.equal(valueText('campaign', null), 'Kampanya yok');
    assert.equal(valueText('campaign', null, { stored: true }), 'Varsayılan');
    assert.equal(valueText('notice', ''), 'Duyuru yok');
    assert.equal(valueText('notice', 'Bakım 22:00’de'), '“Bakım 22:00’de”');
    assert.equal(valueText('gifts_hidden', ['a', 'b', 'c', 'd', 'e', 'f'], { names }), 'Gizli: Hediye a, Hediye b, Hediye c, Hediye d ve 2 tane daha');
    assert.equal(valueText('packs_hidden', ['p1'], { names }), 'Gizli: p1 paketi');
    assert.equal(valueText('min_version', null), 'Zorunlu sürüm yok');
    for (const k of Object.keys(registry.REGISTRY) as LiveKey[]) assert.ok(!valueText(k, registry.DEFAULTS[k] as LiveValue).includes('💎'), k);
  });

  test('the server preview sentences need no emoji to read', () => {
    const sentence = impactText(registry.impactOf('exchange_usd_try', 49.8, 45) as string);
    assert.ok(sentence.startsWith('10.000 elmas = 4.220 → '), sentence);
    assert.ok(sentence.includes('uygulamayı güncelle'), sentence);
    const off = registry.impactOf('features_off', [], ['gifts'], { env: { featuresOff: [] }, raw: ['gifts'] }) as string;
    assert.equal(off, 'Yeni hediye gönderimi durur. Eski uygulamalar "Bu özellik geçici olarak kapalı" mesajı görür.');
  });
});
