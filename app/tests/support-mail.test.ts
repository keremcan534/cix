/// <reference types="node" />
// The e-mails to support (lib/support-mail): a live build sends support requests, the data request (UK GDPR) and
// help from the ban screen as a mail the person sends themselves (giris-3, giris-4, giris-13). The link must open
// with the subject and body intact, carry the account id, and say UK GDPR, never KVKK.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SUPPORT_EMAIL, banHelpMail, dataRequestMail, supportMailUrl, supportRequestMail } from '@/lib/support-mail';

const parse = (url: string) => {
  assert.ok(url.startsWith(`mailto:${SUPPORT_EMAIL}?`));
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1).replace(/\+/g, '%2B'));
  return { subject: q.get('subject'), body: q.get('body') };
};

describe('mailto bağlantısı', () => {
  test('konu ve metin kodlanır, satır sonları CRLF olur; boş metin eklenmez', () => {
    const url = supportMailUrl({ subject: 'Elmas & jeton? #3', body: 'Merhaba,\nsatır 2 + 1' });
    assert.doesNotMatch(url, /\s/);
    assert.match(url, /subject=Elmas%20%26%20jeton%3F%20%233&body=/);
    assert.match(url, /Merhaba%2C%0D%0Asat%C4%B1r%202%20%2B%201$/);
    assert.deepEqual(parse(url), { subject: 'Elmas & jeton? #3', body: 'Merhaba,\r\nsatır 2 + 1' });
    assert.equal(supportMailUrl({ subject: 'Similar Club destek' }), `mailto:${SUPPORT_EMAIL}?subject=Similar%20Club%20destek`);
  });
});

describe('Destek e-postaları', () => {
  test('destek talebi konuyu ve hesap kimliğini taşır; geri bildirim kendi konusuyla gider', () => {
    const m = supportRequestMail('Elmas ve jeton', 'ab12cd34', false);
    assert.equal(m.subject, 'Similar Club destek: Elmas ve jeton');
    assert.match(m.body ?? '', /Hesap kimliği: ab12cd34/);
    assert.equal(supportRequestMail('Geri bildirim', 'ab12cd34', true).subject, 'Similar Club geri bildirim');
    assert.doesNotMatch(supportRequestMail('Hesap', null).body ?? '', /Hesap kimliği/);
  });

  test('veri talebi UK GDPR der, KVKK demez; hesap kimliği ve görünen ad yazılır', () => {
    const m = dataRequestMail('ab12cd34', 'Zeynep');
    assert.equal(m.subject, 'UK GDPR veri erişim talebi');
    assert.match(m.body ?? '', /UK GDPR kapsamında/);
    assert.match(m.body ?? '', /Hesap kimliği: ab12cd34\nGörünen ad: Zeynep/);
    assert.doesNotMatch(`${m.subject} ${m.body}`, /KVKK/i);
  });

  test('yasak ekranından giden e-posta yaptırımın numarasını ve adını taşır', () => {
    const m = banHelpMail(42, 'Hesap yasağı', 'ab12cd34');
    assert.equal(m.subject, 'Hesap erişimi: yaptırım #42');
    assert.match(m.body ?? '', /Yaptırım: #42 · Hesap yasağı\nHesap kimliği: ab12cd34/);
    assert.doesNotMatch(banHelpMail(42, 'Cihaz yasağı', null).body ?? '', /Hesap kimliği/);
  });
});
