// Legal documents linked from the sign-in, wallet, VIP and settings screens.
// The owner publishes each document on the web and sets its address at build time (EXPO_PUBLIC_*_URL,
// e.g. in eas.json or app/.env.local). Expo inlines these only when read as literal process.env.X, so each
// one is spelled out below. Until an address is set, a tap explains where the text will live instead of
// opening a dead page. Store review needs real links, so this is on the launch checklist.
import { Linking } from 'react-native';

import { showAlert } from '@/lib/alert';

export type LegalDoc = 'terms' | 'privacy' | 'payment' | 'subscription';

export const LEGAL_TITLE: Record<LegalDoc, string> = {
  terms: 'Kullanım Koşulları',
  privacy: 'Gizlilik Politikası',
  payment: 'Ödeme Sözleşmesi',
  subscription: 'Abonelik Koşulları',
};

const URLS: Record<LegalDoc, string | undefined> = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL,
  payment: process.env.EXPO_PUBLIC_PAYMENT_TERMS_URL,
  subscription: process.env.EXPO_PUBLIC_SUBSCRIPTION_TERMS_URL,
};

export const legalUrl = (doc: LegalDoc) => URLS[doc] || undefined;

export function openLegal(doc: LegalDoc) {
  const title = LEGAL_TITLE[doc];
  const url = legalUrl(doc);
  const fallback = () => showAlert(title, `${title} metnine şu an ulaşılamıyor. Sorunun varsa Ayarlar › Destek'ten bize yazabilirsin.`);
  if (url) Linking.openURL(url).catch(fallback);
  else fallback();
}
