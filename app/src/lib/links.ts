// Links people can send each other. The app link opens the installed app (scheme in app.json);
// the web link opens the preview build for people who don't have the app yet.
import { Share } from 'react-native';

const SCHEME = 'similarclub://';
const WEB = 'https://keremcan534.github.io/cix/';

export const appLink = (path: string) => `${SCHEME}${path}`;
export const webLink = (path: string) => `${WEB}${path}`;

/** Opens the system share sheet with both links under the message. */
export function shareLink(message: string, path: string) {
  Share.share({ message: `${message}\n\nUygulamada aç: ${appLink(path)}\nTarayıcıda aç: ${webLink(path)}` }).catch(() => {});
}
