// Scam and privacy check for private messages. It never blocks anyone: messages from others that look
// like a scam get a warning under the bubble, and sending your own phone/IBAN asks once before it goes out.
// Prototype heuristics; in production this runs on the server next to the moderation queue.
export type Risk = 'phone' | 'iban' | 'link' | 'offplatform' | 'money';

const RULES: [Risk, RegExp][] = [
  ['iban', /\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/i],
  ['phone', /(?:\+?90|0)?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/],
  ['link', /(https?:\/\/|www\.)\S+|\b\S+\.(com|net|org|xyz|link|ly)\b/i],
  ['offplatform', /\b(whatsapp|wp'?den|telegram|tg'?den|insta(gram)?'?(dan|den)?|snap(chat)?|discord)\b/i],
  ['money', /(para (gönder|yolla|at)|havale|\beft\b|papara|doğrulama kodu|sms kodu|ucuz jeton|jeton sat|hediye çeki|yatırım fırsatı|kripto)/i],
];

export function scanMessage(text: string): Risk[] {
  return RULES.filter(([, re]) => re.test(text)).map(([k]) => k);
}

/** Warning under someone else's message; null when it looks fine. */
export function incomingWarning(risks: Risk[]): string | null {
  if (risks.includes('money')) return 'Para, kod veya ucuz jeton isteyen mesajlar genellikle dolandırıcılıktır. Similar Club asla dışarıdan ödeme istemez.';
  if (risks.includes('iban')) return 'Bu mesajda IBAN var. Tanımadığın birine para gönderme.';
  if (risks.includes('offplatform') || risks.includes('phone')) return 'Seni uygulama dışına çekmeye çalışıyor olabilir. Dışarıda yaşananlarda seni koruyamayız.';
  if (risks.includes('link')) return 'Bağlantıya tıklamadan önce emin ol; şifre veya kod isteyen sayfalara bilgi girme.';
  return null;
}

/** Confirmation text before I send my own personal data; null when nothing personal is in it. */
export function outgoingWarning(risks: Risk[]): string | null {
  if (risks.includes('iban')) return 'Mesajında IBAN var. Banka bilgilerini yalnızca güvendiğin kişilerle paylaş.';
  if (risks.includes('phone')) return 'Mesajında telefon numarası var. Numaranı paylaşınca karşı taraf seni uygulama dışında da arayabilir.';
  return null;
}
