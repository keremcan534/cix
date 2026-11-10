/// <reference types="node" />
// Room chat @mentions (lib/room-mention): "@" offers the room's people, a pick writes "@Name ", a line naming me stands out.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { checkText } from '@/lib/contact-filter';
import { insertMention, mentionPicks, mentionQuery, mentionRuns, mentions, stripMentions } from '@/lib/room-mention';

describe('@bahset', () => {
  test('yazılan "@…" bulunur; e-posta gibi bitişik "@" sayılmaz', () => {
    assert.equal(mentionQuery('@'), '');
    assert.equal(mentionQuery('selam @Ay'), 'Ay');
    assert.equal(mentionQuery('selam @Ayşe '), null);
    assert.equal(mentionQuery('selam'), null);
    assert.equal(mentionQuery('ali@ver'), null);
  });

  test('seçilen kişi satırın sonuna yazılır', () => {
    assert.equal(insertMention('selam @Ay', 'Ayşe Nur'), 'selam @Ayşe Nur ');
    assert.equal(insertMention('@', 'Can'), '@Can ');
    assert.equal(insertMention('', 'Can'), '@Can ');
    assert.equal(insertMention('selam  ', 'Can'), 'selam @Can ');
  });

  test('önce adı yazılanla başlayanlar, sonra içerenler', () => {
    const people = [{ name: 'Mehmet' }, { name: 'Ahmet' }, { name: 'Melis' }, { name: 'İlker' }];
    assert.deepEqual(mentionPicks(people, 'me').map((p) => p.name), ['Mehmet', 'Melis', 'Ahmet']);
    assert.deepEqual(mentionPicks(people, 'il').map((p) => p.name), ['İlker']);
    assert.equal(mentionPicks(people, '', 2).length, 2);
  });

  test('beni anan satır: ad tam yazılmalı', () => {
    assert.equal(mentions('@Ayşe Nur geldin mi', 'Ayşe Nur'), true);
    assert.equal(mentions('hey @ayşe nur!', 'Ayşe Nur'), true);
    assert.equal(mentions('@Ayşe Nurcan selam', 'Ayşe Nur'), false);
    assert.equal(mentions('Ayşe Nur selam', 'Ayşe Nur'), false);
    assert.equal(mentions('@', ''), false);
  });

  test('odadaki birinden bahsetmek iletişim filtresine takılmaz; dışarıdan bir @hesap takılır', () => {
    const room = ['Ayşe', 'Ayşe Yılmaz', 'Kral (Ali)', 'Deniz'];
    const ok = (t: string) => checkText(stripMentions(t, room)).ok;
    assert.equal(checkText('@Ayşe selam').ok, false, 'filtre tek başına @isim görünce reddeder');
    assert.equal(ok('@Ayşe selam'), true);
    assert.equal(ok('selam @ayşe nasılsın'), true, 'büyük küçük harf');
    assert.equal(ok('@Ayşe Yılmaz hoş geldin'), true, 'boşluklu ad bütün olarak');
    assert.equal(ok('@Kral (Ali) ve @Deniz gelin'), true, 'özel işaretli ad, iki bahsetme');
    assert.equal(stripMentions('@Ayşe Yılmaz hey', room), 'Ayşe Yılmaz hey');
    assert.equal(ok('@ayse.insta takip et'), false, 'odada olmayan bir @hesap');
    assert.equal(ok('@Ayşeinsta'), false, 'adın devamı başka bir hesap');
    assert.equal(ok('@Ayşe beni 0532 123 45 67 ara'), false, 'bahsetme telefonu geçirmez');
  });
});

describe('@bahset: satırda adlar renkli', () => {
  const names = ['Ayşe', 'Ayşe Yılmaz', 'Mert'];
  test('odadaki birinin adı ayrı parça olur, en uzun ad önce', () => {
    assert.deepEqual(mentionRuns('@Ayşe Yılmaz selam @mert nasılsın', names), [
      { text: '@Ayşe Yılmaz', name: 'Ayşe Yılmaz' },
      { text: ' selam ' },
      { text: '@mert', name: 'Mert' },
      { text: ' nasılsın' },
    ]);
  });
  test('adın devamı varsa ya da kimse değilse düz yazı kalır', () => {
    assert.deepEqual(mentionRuns('@Mertcan ve @kimse', names), [{ text: '@Mertcan ve @kimse' }]);
    assert.deepEqual(mentionRuns('selam', names), [{ text: 'selam' }]);
    assert.deepEqual(mentionRuns('@Ayşe', []), [{ text: '@Ayşe' }]);
  });
});
