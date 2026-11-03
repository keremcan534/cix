// Copy a short text (an ID, an invite code, a username) and confirm it. expo-clipboard works on iOS, Android
// and web; if the system refuses, the value is shown so the user can still read it off.
import * as Clipboard from 'expo-clipboard';

import { showAlert } from '@/lib/alert';

export async function copyText(value: string, what: string) {
  try {
    await Clipboard.setStringAsync(value);
    showAlert(`${what} kopyalandı`, value);
  } catch {
    showAlert(what, value);
  }
}
