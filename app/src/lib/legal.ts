// Legal documents linked from the sign-in, wallet, VIP and settings screens. They live on the website's legal
// pages (docs/yasal, generated into website/tr/*.html; `center` is the list of all of them). A build can point one
// elsewhere with EXPO_PUBLIC_*_URL (eas.json or app/.env.local); Expo inlines these only when read as literal
// process.env.X, so each one is spelled out below. If a page can't be opened, a tap explains where to ask instead.
import { Linking } from 'react-native';

import { showAlert } from '@/lib/alert';

export type LegalDoc = 'terms' | 'privacy' | 'payment' | 'subscription' | 'center';

export const LEGAL_TITLE: Record<LegalDoc, string> = {
  terms: 'Kullanım Koşulları',
  privacy: 'Gizlilik Politikası',
  payment: 'Ödeme Sözleşmesi',
  subscription: 'Abonelik Koşulları',
  center: 'Yasal metinler',
};

const SITE = 'https://similarclub.online';

const URLS: Record<LegalDoc, string | undefined> = {
  terms: process.env.EXPO_PUBLIC_TERMS_URL || `${SITE}/tr/terms`,
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || `${SITE}/tr/privacy`,
  payment: process.env.EXPO_PUBLIC_PAYMENT_TERMS_URL || `${SITE}/tr/refund-policy`,
  subscription: process.env.EXPO_PUBLIC_SUBSCRIPTION_TERMS_URL || `${SITE}/tr/vip-terms`,
  center: `${SITE}/yasal`,
};

export const legalUrl = (doc: LegalDoc) => URLS[doc] || undefined;

export function openLegal(doc: LegalDoc) {
  const title = LEGAL_TITLE[doc];
  const url = legalUrl(doc);
  const fallback = () => showAlert(title, `${title} metnine şu an ulaşılamıyor. Sorunun varsa Ayarlar › Destek'ten bize yazabilirsin.`);
  if (url) Linking.openURL(url).catch(fallback);
  else fallback();
}
