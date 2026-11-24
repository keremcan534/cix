/// <reference types="node" />
// Ses tanıtımı (lib/voice-intro-core): the clip read defensively from the server (an older server sends none, a
// malformed one is skipped), its clock, the bars drawn for it and the recorder's 15-second limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VOICE_MAX_MS, VOICE_MIN_MS, parseVoice, recordingLeft, voiceBars, voiceClock } from '@/lib/voice-intro-core';

test('sunucunun cevabı: kayıt, kayıt yok (null), eski sunucu ya da bozuk (undefined)', () => {
  assert.deepEqual(parseVoice({ url: 'https://api.example.com/api/media/f/voice/u/a.m4a', ms: 5200 }), { url: 'https://api.example.com/api/media/f/voice/u/a.m4a', ms: 5200 });
  assert.deepEqual(parseVoice({ url: '/api/media/f/voice/u/a.m4a', ms: 4999.6 }), { url: '/api/media/f/voice/u/a.m4a', ms: 5000 });
  assert.equal(parseVoice(null), null);
  assert.equal(parseVoice(undefined), undefined);
  assert.equal(parseVoice('x'), undefined);
  assert.equal(parseVoice({ ms: 3000 }), undefined, 'adres yok');
  assert.equal(parseVoice({ url: 'javascript:alert(1)', ms: 3000 }), undefined, 'garip adres');
  assert.deepEqual(parseVoice({ url: '/a.m4a', ms: 'yok' }), { url: '/a.m4a', ms: 0 }, 'süre okunmazsa 0');
  assert.deepEqual(parseVoice({ url: '/a.m4a', ms: 99_000 }), { url: '/a.m4a', ms: VOICE_MAX_MS }, 'en çok 15 sn');
});

test('saat: başlamış saniye sayılır', () => {
  assert.equal(voiceClock(0), '0:00');
  assert.equal(voiceClock(5200), '0:06');
  assert.equal(voiceClock(15_000), '0:15');
  assert.equal(voiceClock(61_000), '1:01');
  assert.equal(voiceClock(Number.NaN), '0:00');
});

test('çubuklar: aynı kayda hep aynı, 0.3–1 arası', () => {
  const a = voiceBars('https://x/voice/u/a.m4a');
  assert.equal(a.length, 28);
  assert.deepEqual(a, voiceBars('https://x/voice/u/a.m4a'));
  assert.notDeepEqual(a, voiceBars('https://x/voice/u/b.m4a'));
  assert.ok(a.every((h) => h >= 0.3 && h <= 1), String(a));
  assert.equal(voiceBars('x', 12).length, 12);
});

test('kayıt sınırı: 15 saniyede durur; en az 1 saniye', () => {
  assert.equal(recordingLeft(0), VOICE_MAX_MS);
  assert.equal(recordingLeft(14_000), 1000);
  assert.equal(recordingLeft(16_000), 0);
  assert.equal(VOICE_MIN_MS, 1000);
});
