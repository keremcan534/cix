// A table or a data copy sent as a real file through the phone's share sheet: written to the app's cache folder
// (expo-file-system) and handed to the share sheet (expo-sharing), where mail, WhatsApp, Drive, "Dosyalara kaydet"
// and the rest take it as an attachment. Where a file can't be shared (web), the text itself is shared instead.
import { Platform, Share } from 'react-native';

/** Shares `text` as the file `name`; false when only the text could be offered (web, no share sheet). */
async function shareText(name: string, title: string, text: string, kind: { mimeType: string; UTI: string; head?: string }): Promise<boolean> {
  if (Platform.OS !== 'web') {
    let uri: string | null = null;
    try {
      const { File, Paths } = await import('expo-file-system');
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        const f = new File(Paths.cache, name);
        if (f.exists) f.delete();
        f.create();
        f.write(`${kind.head ?? ''}${text}`);
        uri = f.uri;
      }
    } catch {
      uri = null;
    }
    if (uri) {
      await import('expo-sharing').then((S) => S.shareAsync(uri, { mimeType: kind.mimeType, dialogTitle: title, UTI: kind.UTI })).catch(() => {});
      return true;
    }
  }
  await Share.share({ title, message: text }).catch(() => {});
  return false;
}

export async function shareCsv(name: string, title: string, csv: string) {
  // The byte order mark tells Excel the file is UTF-8, so Turkish letters show right.
  await shareText(name, title, csv, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', head: '﻿' });
}

/** A JSON document (Verilerimin kopyası) as a .json file; true when it went as a file. */
export const shareJson = (name: string, title: string, json: string) => shareText(name, title, json, { mimeType: 'application/json', UTI: 'public.json' });
