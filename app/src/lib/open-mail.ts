// Opens the phone's mail app with an e-mail to support (lib/support-mail). Without a mail app it shows the address.
import { Linking } from 'react-native';

import { showAlert } from '@/lib/alert';
import { SUPPORT_EMAIL, supportMailUrl, type Mail } from '@/lib/support-mail';

export function openSupportMail(mail: Mail) {
  Linking.openURL(supportMailUrl(mail)).catch(() => showAlert('E-posta uygulaması açılamadı', `Bize ${SUPPORT_EMAIL} adresinden yazabilirsin.`));
}
