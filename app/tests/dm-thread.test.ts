/// <reference types="node" />
// Live chats (lib/dm-thread): how the server's copy of a thread joins the one on this phone. Both directions
// arrive, nothing comes twice, a deleted message stays deleted, my unconfirmed message gets the server's id
// instead of a second copy, and the unread count follows the server without lighting up an open chat.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { Conversation } from '@/data/mock';
import { applyThread, hideIds, markSent, mergeThread, settle, type ChatMessage, type ServerDm } from '@/lib/dm-thread';
import { isTodayTime, messageTime } from '@/data/messages-ui';
import { noticeHref } from '@/lib/notice-links';

const ME = 'me1';
const PEER = 'p1';
const dm = (id: number, from: string, text: string, extra: Partial<ServerDm> = {}): ServerDm => ({
  id,
  from,
  to: from === PEER ? ME : PEER,
  text,
  createdAt: `2026-11-06T10:${String(id).padStart(2, '0')}:00.000Z`,
  ...extra,
});

describe('Sohbet eşitleme (mergeThread)', () => {
  test('iki yöndeki mesajlar sunucu sırasıyla ve sunucu saatiyle eklenir', () => {
    const r = mergeThread([], [dm(3, PEER, 'naber'), dm(2, ME, 'selam')], { peer: PEER, after: 0 });
    assert.deepEqual(r.messages.map((m) => [m.text, m.fromMe, m.sid]), [
      ['selam', true, 2],
      ['naber', false, 3],
    ]);
    assert.equal(r.messages[0].at, '2026-11-06T10:02:00.000Z');
    assert.equal(r.incoming, 1);
    assert.equal(r.changed, true);
  });

  test('bilinen mesaj ikinci kez eklenmez', () => {
    const first = mergeThread([], [dm(5, PEER, 'a')], { peer: PEER, after: 0 }).messages;
    const again = mergeThread(first, [dm(5, PEER, 'a')], { peer: PEER, after: 0 });
    assert.equal(again.messages.length, 1);
    assert.equal(again.changed, false);
    assert.equal(again.incoming, 0);
  });

  test('silinen mesaj (eşiğin altında ya da gizli listede) geri gelmez', () => {
    const r = mergeThread([], [dm(4, PEER, 'eski'), dm(7, PEER, 'gizli'), dm(8, PEER, 'yeni')], { peer: PEER, after: 4, hidden: [7] });
    assert.deepEqual(r.messages.map((m) => m.text), ['yeni']);
  });

  test('cevabı gelmeden kalan kendi mesajım sunucu kimliğini alır, hata notu silinir', () => {
    const local: ChatMessage[] = [{ id: 'l1', fromMe: true, text: 'selam', time: '10:00', ref: 'r1', failed: 'Sunucuya ulaşılamadı', noRetry: false }];
    const r = mergeThread(local, [dm(9, ME, 'selam')], { peer: PEER, after: 0 });
    assert.equal(r.messages.length, 1);
    assert.equal(r.messages[0].sid, 9);
    assert.equal(r.messages[0].ref, 'r1');
    assert.equal('failed' in r.messages[0], false);
    assert.equal('noRetry' in r.messages[0], false);
  });

  test('karşı taraf okuyunca mesajım okundu olur', () => {
    const local: ChatMessage[] = [{ id: 'l1', fromMe: true, text: 'selam', time: '10:00', sid: 2 }];
    const r = mergeThread(local, [dm(2, ME, 'selam', { readAt: '2026-11-06T10:05:00.000Z' })], { peer: PEER, after: 2 });
    assert.equal(r.messages[0].read, true);
    assert.equal(r.changed, true);
    const fresh = mergeThread([], [dm(3, ME, 'x', { readAt: '2026-11-06T10:05:00.000Z' })], { peer: PEER, after: 0 });
    assert.equal(fresh.messages[0].read, true);
  });
});

describe('Eşik ve gizli kimlikler (settle, hideIds)', () => {
  test('eşik en yüksek kimliğe çıkar, altında kalan gizli kimlikler atılır', () => {
    assert.deepEqual(settle({ peer: PEER, after: 3, hidden: [5, 12] }, [dm(4, PEER, 'a'), dm(9, PEER, 'b')]), { after: 9, hidden: [12] });
    assert.deepEqual(settle({ peer: PEER, after: 10 }, []), { after: 10, hidden: [] });
  });

  test('yalnızca eşiğin üstündeki sunucu mesajları gizlenir, tekrarsız', () => {
    assert.deepEqual(hideIds({ peer: PEER, after: 5, hidden: [8] }, [3, 8, 9, undefined]), [8, 9]);
  });
});

describe('Sohbet listesi (applyThread, markSent)', () => {
  const conv = (unread: number, messages: ChatMessage[] = [{ id: 'm1', fromMe: false, text: 'eski', time: '09:00', sid: 1 }]): Conversation => ({
    id: `c-${PEER}`,
    userId: PEER,
    unread,
    messages,
  });

  test('yeni sohbet sunucu sayısıyla en üste eklenir, boş sohbet açılmaz', () => {
    const other: Conversation = { id: 'c-x', userId: 'x', unread: 0, messages: [] };
    const list = applyThread([other], PEER, [dm(2, PEER, 'selam')], { peer: PEER, after: 0 }, 1);
    assert.deepEqual(list.map((c) => c.userId), [PEER, 'x']);
    assert.equal(list[0].unread, 1);
    const same = [other];
    assert.equal(applyThread(same, PEER, [], { peer: PEER, after: 0 }, 0), same);
  });

  test('açık sohbette (sayı yok) yeni gelenler yerel sayıya eklenir', () => {
    const list = applyThread([conv(0)], PEER, [dm(2, PEER, 'a'), dm(3, PEER, 'b')], { peer: PEER, after: 1 }, null);
    assert.equal(list[0].unread, 2);
  });

  test('yeni mesaj yokken sunucunun düşürdüğü sayı alınır, artanı alınmaz', () => {
    assert.equal(applyThread([conv(3)], PEER, [], { peer: PEER, after: 1 }, 0)[0].unread, 0);
    assert.equal(applyThread([conv(0)], PEER, [], { peer: PEER, after: 1 }, 4)[0].unread, 0);
  });

  test('değişiklik yoksa aynı liste döner', () => {
    const list = [conv(0)];
    assert.equal(applyThread(list, PEER, [dm(1, PEER, 'eski')], { peer: PEER, after: 1 }, 0), list);
  });

  test('sunucu mesajımı aldı: kimliği ve saati yazılır, hata silinir', () => {
    const list = [conv(0, [{ id: 'l1', fromMe: true, text: 'x', time: '10:00', ref: 'r1', failed: 'Hata' }])];
    const next = markSent(list, PEER, 'r1', { id: 42, createdAt: '2026-11-06T10:42:00.000Z' });
    assert.equal(next[0].messages[0].sid, 42);
    assert.equal(next[0].messages[0].at, '2026-11-06T10:42:00.000Z');
    assert.equal('failed' in next[0].messages[0], false);
    // Silinmiş ya da eşitlemenin zaten eşlediği mesaj: liste değişmez.
    assert.equal(markSent(list, PEER, 'yok', { id: 43, createdAt: '' }), list);
    assert.equal(markSent(next, PEER, 'r1', { id: 42, createdAt: '' }), next);
  });
});

describe('Mesaj saati (messageTime, isTodayTime)', () => {
  const now = new Date(2026, 10, 6, 15, 0);
  const at = (d: Date) => ({ time: '10:00', at: d.toISOString() });

  test('bugün saat, dün "Dün", daha eski gün ve ay, başka yıl yılıyla', () => {
    assert.equal(messageTime(at(new Date(2026, 10, 6, 9, 5)), now), '09:05');
    assert.equal(messageTime(at(new Date(2026, 10, 5, 23, 0)), now), 'Dün');
    assert.equal(messageTime(at(new Date(2026, 10, 3, 12, 0)), now), '3 Kas');
    assert.equal(messageTime(at(new Date(2025, 1, 14, 12, 0)), now), '14 Şub 2025');
  });

  test('zamanı olmayan (demo) mesaj kendi etiketini gösterir', () => {
    assert.equal(messageTime({ time: 'Dün' }, now), 'Dün');
    assert.equal(messageTime({ time: '10:00', at: 'bozuk' }, now), '10:00');
  });

  test('"Bugün" süzgeci gerçek tarihe bakar', () => {
    assert.equal(isTodayTime(at(new Date(2026, 10, 6, 1, 0)), now), true);
    assert.equal(isTodayTime(at(new Date(2026, 10, 2, 10, 0)), now), false);
    assert.equal(isTodayTime({ time: '14:20' }, now), true);
    assert.equal(isTodayTime({ time: 'Dün' }, now), false);
  });
});

describe('Bildirim bağlantıları (noticeHref)', () => {
  test('demoda her bağlantı açılır', () => {
    assert.equal(noticeHref('/anlar', false), '/anlar');
    assert.equal(noticeHref('/sohbet/u3', false), '/sohbet/u3');
  });

  test('canlıda demo bölümleri ve örnek kişi/oda açılmaz', () => {
    for (const href of ['/anlar', '/(tabs)/anlar', '/aile', '/kabile/k1', '/eslesme', '/sohbet/u3', '/kullanici/u12', '/oda/r2', '/arama/u1?mode=sesli']) {
      assert.equal(noticeHref(href, true), undefined, href);
    }
  });

  test('canlıda gerçek hedefler açılır', () => {
    const uuid = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    for (const href of ['/cuzdan', `/sohbet/${uuid}`, `/kullanici/${uuid}`, `/oda/${uuid}`, '/bildirimler']) assert.equal(noticeHref(href, true), href, href);
    assert.equal(noticeHref(undefined, true), undefined);
  });
});
