// A table sent as a real file (opens in Excel or Sheets) through the phone's share sheet: written to the app's
// cache folder (expo-file-system) and handed to the share sheet (expo-sharing), where mail, WhatsApp, Drive and
// the rest take it as an attachment. Where a file can't be shared (web), the text itself is shared instead.
import { Platform, Share } from 'react-native';

export async function shareCsv(name: string, title: string, csv: string) {
  if (Platform.OS !== 'web') {
    let uri: string | null = null;
    try {
      const { File, Paths } = await import('expo-file-system');
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        const f = new File(Paths.cache, name);
        if (f.exists) f.delete();
        f.create();
        // The byte order mark tells Excel the file is UTF-8, so Turkish letters show right.
        f.write(`﻿${csv}`);
        uri = f.uri;
      }
    } catch {
      uri = null;
    }
    if (uri) {
      await import('expo-sharing').then((S) => S.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: title, UTI: 'public.comma-separated-values-text' })).catch(() => {});
      return;
    }
  }
  await Share.share({ title, message: csv }).catch(() => {});
}
