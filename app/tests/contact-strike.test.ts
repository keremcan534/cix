/// <reference types="node" />
// The contact filter's automatic mute, app side (lib/contact-filter): what the server answered about a refusal
// is kept until the next refusal, and the note under the input words it: the last two tries are told, then how
// long messages are off. Time is the server's (the caller passes serverNow). A field checked when editing ends
// counts the same refused text once (fieldRefusal), so leaving it again and again doesn't bring the mute.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CONTACT_MESSAGE, contactRefusal, durationWords, fieldRefusal, getContactStrike, messageRefusal, noteContactStrike, onContactStrike, onContactRefusal, strikeWarning } from '@/lib/contact-filter';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe('otomatik susturma uyarısı', () => {
  test('durationWords: dakika, saat, gün', () => {
    assert.equal(durationWords(1), '1 dakika');
    assert.equal(durationWords(0.2), '1 dakika');
    assert.equal(durationWords(45), '45 dakika');
    assert.equal(durationWords(59.01), '1 saat');
    assert.equal(durationWords(60), '1 saat');
    assert.equal(durationWords(90), '1 saat 30 dakika');
    assert.equal(durationWords(120), '2 saat');
    assert.equal(durationWords(1440), '1 gün');
    assert.equal(durationWords(2880), '2 gün');
  });

  test('kalan hak: yalnızca son ikisi söylenir', () => {
    assert.equal(strikeWarning({ strikesLeft: 2, muteMinutes: 60 }, NOW), '2 deneme hakkın kaldı; sonra 1 saat mesaj yazamazsın.');
    assert.equal(strikeWarning({ strikesLeft: 1, muteMinutes: 60 }, NOW), 'Bir kez daha denersen 1 saat mesaj yazamazsın.');
    assert.equal(strikeWarning({ strikesLeft: 1, muteMinutes: 30 }, NOW), 'Bir kez daha denersen 30 dakika mesaj yazamazsın.');
    assert.equal(strikeWarning({ strikesLeft: 1 }, NOW), 'Bir kez daha denersen 1 saat mesaj yazamazsın.', 'süre gelmezse 1 saat');
    assert.equal(strikeWarning({ strikesLeft: 3, muteMinutes: 60 }, NOW), null);
    assert.equal(strikeWarning({}, NOW), null);
    assert.equal(strikeWarning(null, NOW), null);
  });

  test('susturma başladı: kalan süre sunucunun saatine göre', () => {
    assert.equal(strikeWarning({ muted: true, until: at(60), muteMinutes: 60 }, NOW), 'Art arda denediğin için 1 saat mesaj yazamazsın.');
    assert.equal(strikeWarning({ muted: true, until: at(59.9), muteMinutes: 60 }, NOW), 'Art arda denediğin için 1 saat mesaj yazamazsın.');
    assert.equal(strikeWarning({ muted: true, until: at(25.5), muteMinutes: 60 }, NOW), 'Art arda denediğin için 26 dakika mesaj yazamazsın.');
    assert.equal(strikeWarning({ muted: true, until: at(-1), muteMinutes: 60 }, NOW), null, 'süre bitti');
    assert.equal(strikeWarning({ muted: true, muteMinutes: 60 }, NOW), 'Art arda denediğin için 1 saat mesaj yazamazsın.', 'bitiş gelmezse süresi');
  });

  test('sunucunun cevabı saklanır; yalnızca bilinen alanlar, söylenecek bir şey yoksa boş', () => {
    const heard: unknown[] = [];
    const off = onContactStrike((s) => heard.push(s));
    noteContactStrike({ strikesLeft: 2, muteMinutes: 60, ...({ counted: true, error: 'x', category: 'phone' } as object) });
    assert.deepEqual(getContactStrike(), { strikesLeft: 2, muteMinutes: 60, muted: undefined, until: undefined, sanction: undefined, serverNow: undefined });
    assert.equal(heard.length, 1);
    noteContactStrike({ ...({ counted: true } as object) });
    assert.equal(getContactStrike(), null);
    assert.equal(heard.length, 2);
    noteContactStrike(null);
    assert.equal(heard.length, 2, 'zaten boşken tekrar duyurulmaz');
    noteContactStrike({ muted: true, until: at(60) });
    assert.equal(getContactStrike()?.muted, true);
    off();
    noteContactStrike(null);
    assert.equal(heard.length, 3, 'abonelik bitti');
  });

  test('yeni bir ret eski uyarıyı siler; sunucunun cevabı sonra gelir', () => {
    let atRefusal: unknown = 'unset';
    const off = onContactRefusal(() => (atRefusal = getContactStrike()));
    noteContactStrike({ strikesLeft: 1, muteMinutes: 60 });
    assert.ok(contactRefusal('beni ara 0532 123 45 67', 'room.chat'));
    assert.equal(atRefusal, null, 'ret duyurulurken eski uyarı yok');
    assert.equal(getContactStrike(), null);
    noteContactStrike({ strikesLeft: 2, muteMinutes: 60 });
    assert.ok(messageRefusal('room:x', 'insta: ayse.izmir', 'room.chat'));
    assert.equal(getContactStrike(), null);
    // An accepted text changes nothing.
    noteContactStrike({ strikesLeft: 2, muteMinutes: 60 });
    assert.equal(contactRefusal('Akşam 21.30 gibi odadayım', 'room.chat'), null);
    assert.equal(getContactStrike()?.strikesLeft, 2);
    off();
    noteContactStrike(null);
  });

  test('düzenleme bitince denetlenen alan: aynı metin bir kez sayılır, not her seferinde görünür', () => {
    const counted: string[] = [];
    const off = onContactRefusal((r) => counted.push(`${r.category}:${r.place}`));
    const check = fieldRefusal();
    const phone = 'Bize ulaşın: 0532 123 45 67';
    // Five times in and out of the field, the text unchanged: one refusal, the note every time.
    for (let i = 0; i < 5; i++) assert.equal(check(phone, 'agency.description'), CONTACT_MESSAGE);
    assert.deepEqual(counted, ['phone:agency.description']);
    // A changed text is a new try.
    assert.equal(check('Bize yazın: ajans@gmail.com', 'agency.description'), CONTACT_MESSAGE);
    assert.equal(check('Bize yazın: ajans@gmail.com', 'agency.description'), CONTACT_MESSAGE);
    assert.deepEqual(counted, ['phone:agency.description', 'email:agency.description']);
    // An accepted text, then the refused one typed again: counted again.
    assert.equal(check('Yetenekli yayıncıları büyüten ajans', 'agency.description'), null);
    assert.equal(check(phone, 'agency.description'), CONTACT_MESSAGE);
    assert.equal(counted.length, 3);
    assert.equal(check('', 'agency.description'), null);
    // Each field has its own memory.
    assert.equal(fieldRefusal()(phone, 'agency.description'), CONTACT_MESSAGE);
    assert.equal(counted.length, 4);
    off();
    noteContactStrike(null);
  });
});
