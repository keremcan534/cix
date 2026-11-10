// The support address and the e-mails the app prepares for it. Help from the ban screen goes out as an e-mail the
// person sends from their own mail app (giris-13); support requests and data requests (UK GDPR) do too when the
// server has no ticket or data-copy route yet (server/api/support.mjs, my-data.mjs). Pure, so the node tests load
// it; lib/open-mail opens the mail app.

export const SUPPORT_EMAIL = 'destek@similarclub.app';

export type Mail = { subject: string; body?: string };

/** mailto: link to the support address. Line breaks become CRLF, as mail links expect (RFC 6068). */
export function supportMailUrl({ subject, body }: Mail): string {
  const q = [`subject=${encodeURIComponent(subject)}`];
  if (body) q.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${SUPPORT_EMAIL}?${q.join('&')}`;
}

/** The lines that tell the team whose account it is; nothing when the account is not known yet. */
const accountLines = (accountId: string | null | undefined, name?: string) =>
  [accountId ? `Hesap kimliği: ${accountId}` : '', name ? `Görünen ad: ${name}` : ''].filter(Boolean).join('\n');

/** A support request on a topic; the person writes what happened above the account lines. */
export function supportRequestMail(topic: string, accountId: string | null | undefined, feedback = false): Mail {
  const account = accountLines(accountId);
  return {
    subject: feedback ? 'Similar Club geri bildirim' : `Similar Club destek: ${topic}`,
    body: `Merhaba,\n\n\n${account ? `---\n${account}\n` : ''}`,
  };
}

/** Ayarlar › Verilerimin kopyasını iste: a subject access request under UK GDPR. */
export function dataRequestMail(accountId: string | null | undefined, name: string): Mail {
  const account = accountLines(accountId, name);
  return {
    subject: 'UK GDPR veri erişim talebi',
    body: `Merhaba,\n\nUK GDPR kapsamında Similar Club hesabıma ait kişisel verilerimin bir kopyasını istiyorum.\n${account ? `\n${account}\n` : ''}\nTeşekkürler.`,
  };
}

/** From the ban screen: the sanction's number, so the team finds it at once. */
export function banHelpMail(sanctionId: number | string, label: string, accountId: string | null | undefined): Mail {
  const account = accountLines(accountId);
  return {
    subject: `Hesap erişimi: yaptırım #${sanctionId}`,
    body: `Merhaba,\n\n\n---\nYaptırım: #${sanctionId} · ${label}${account ? `\n${account}` : ''}\n`,
  };
}
