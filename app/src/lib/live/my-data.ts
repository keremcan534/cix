// Live mode (lib/live): Ayarlar › Verilerimin kopyasını iste. The server puts together everything it keeps about me
// (server/api/my-data.mjs, UK GDPR right of access) and the phone hands it to the share sheet as a .json file, where it
// can be saved to Files or Drive or sent by mail (lib/share-file). Once in 24 hours; the server says when next.
import * as api from '@/lib/api';
import { shareJson } from '@/lib/share-file';

/** The file's name: the day it was made, so copies taken on different days don't overwrite each other. */
export const exportName = (at = new Date()) => `similar-verilerim-${at.toISOString().slice(0, 10)}.json`;

/**
 * Downloads my data and opens the share sheet. 'file': it went as a file; 'text': only the text could be offered
 * (no share sheet here). Throws the server's refusal (once in 24 hours: ApiError 429, code export_wait).
 */
export async function exportMyData(): Promise<'file' | 'text'> {
  const data = await api.myDataExport();
  const asFile = await shareJson(exportName(), 'Verilerimin kopyası', JSON.stringify(data, null, 2));
  return asFile ? 'file' : 'text';
}
