// Yönetim › Hediyeler's pure part (lib/live/gifts-admin does the calls and uploads): what the server answers, which
// picked file goes as what, the order arrows and the video line. No React Native, for node --test.
import type { GiftCat } from '@/data/mock';

export type AdminGift = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  cat: GiftCat;
  minSvip: number;
  sort: number;
  enabled: boolean;
  /** The icon's address at this server. */
  icon: string;
  /** The stacked video in effect: its address at this server (relative), size and length. */
  video: { url: string; bytes: number; ms: number } | null;
  /** A conversion running or one that failed (its reason in Turkish). */
  job: { status: 'processing' | 'failed'; error: string | null } | null;
  sent: { count: number; coins: number };
  createdAt: string;
  updatedAt: string;
  updatedBy: { id: string; name: string | null } | null;
};
export type GiftLimits = {
  nameMin: number;
  nameMax: number;
  priceMax: number;
  svipMax: number;
  iconBytes: number;
  iconMinPx: number;
  iconMaxPx: number;
  videoBytes: number;
  sourceBytes: number;
  videoMinMs: number;
  videoMaxMs: number;
  width: number;
  height: number;
  fps: number;
  fills: number[];
  fill: number;
};
/** GET /api/admin/gifts: the list, the rules, and what this server can do (convert videos, SVGA; store files). */
export type GiftsAdmin = { gifts: AdminGift[]; limits: GiftLimits; convert: boolean; svga: boolean; storage: boolean };

/** A video for a save: a ready stacked MP4, or a source the server converts (`fill`: an SVGA's size on the screen). */
export type VideoSpec = { url: string; kind: 'stacked' | 'source'; fill?: number };
export type GiftFields = { name: string; price: number; cat: GiftCat; minSvip: number; emoji: string; enabled: boolean; icon: string; video: VideoSpec | null };


export const CAT_LABEL: Record<GiftCat, string> = { hot: 'Popüler', couple: 'İkili', gameplay: 'Kutlama', privilege: 'Özel' };
export const CATS: GiftCat[] = ['hot', 'couple', 'gameplay', 'privilege'];
export const FILL_LABEL: Record<string, string> = { '0.45': 'Küçük', '0.6': 'Orta', '0.8': 'Büyük', '1': 'Tam ekran' };

// --- Files ----------------------------------------------------------------------------------------------------
/** A file picked on the phone or in the browser (expo-image-picker / expo-document-picker asset). */
export type PickedFile = { uri: string; name: string; size: number | null; mimeType: string | null; file?: Blob | null };
export type FileKind = 'gifticon' | 'giftvideo' | 'giftsource';
/** What a picked video is, by its name and type: a ready stacked MP4, a transparent source, an SVGA, or none of them. */
export type VideoFileKind = 'stacked' | 'source' | 'svga';

const ending = (name: string) => /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? '';

/** The type a file is uploaded as for `kind`, from its type or name; null when the server won't take it. */
export function contentTypeOf(kind: FileKind, f: Pick<PickedFile, 'name' | 'mimeType'>): string | null {
  const t = (f.mimeType ?? '').toLowerCase();
  const e = ending(f.name);
  if (kind === 'gifticon') return t === 'image/png' || e === 'png' ? 'image/png' : t === 'image/webp' || e === 'webp' ? 'image/webp' : null;
  if (kind === 'giftvideo') return t === 'video/mp4' || e === 'mp4' ? 'video/mp4' : null;
  if (e === 'svga') return 'application/x-svga';
  if (t === 'video/webm' || e === 'webm') return 'video/webm';
  if (t === 'video/quicktime' || e === 'mov') return 'video/quicktime';
  return null;
}

/** Which video a picked file is: an SVGA by its name, a WebM or MOV a source, an MP4 a ready stacked video. */
export function videoKindOf(f: Pick<PickedFile, 'name' | 'mimeType'>): VideoFileKind | null {
  if (ending(f.name) === 'svga') return 'svga';
  if (contentTypeOf('giftsource', f)) return 'source';
  if (contentTypeOf('giftvideo', f)) return 'stacked';
  return null;
}

const mb = (n: number) => (n / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
/** Why a picked file can't go (type or size), before anything is uploaded; null when it may. */
export function fileProblem(kind: FileKind, f: Pick<PickedFile, 'name' | 'mimeType' | 'size'>, limits: GiftLimits): string | null {
  if (!contentTypeOf(kind, f)) {
    return kind === 'gifticon' ? 'İkon PNG ya da WebP olmalı.' : kind === 'giftvideo' ? 'Hazır video MP4 olmalı.' : 'Kaynak WebM, MOV ya da SVGA olmalı.';
  }
  const max = kind === 'gifticon' ? limits.iconBytes : kind === 'giftvideo' ? limits.videoBytes : limits.sourceBytes;
  if (f.size !== null && f.size > max) return `Dosya en fazla ${mb(max)} MB olabilir (bu ${mb(f.size)} MB).`;
  return null;
}

// --- The list on the panel --------------------------------------------------------------------------------------
/** A shelf's gifts in their order, with `id` moved one place up (-1) or down (+1); null when it can't move. */
export function moved(gifts: AdminGift[], id: string, by: -1 | 1): string[] | null {
  const g = gifts.find((x) => x.id === id);
  if (!g) return null;
  const shelf = gifts.filter((x) => x.cat === g.cat).sort((a, b) => a.sort - b.sort || a.id.length - b.id.length || a.id.localeCompare(b.id));
  const i = shelf.findIndex((x) => x.id === id);
  const j = i + by;
  if (j < 0 || j >= shelf.length) return null;
  const ids = shelf.map((x) => x.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

/** What the panel says about a gift's video. */
export function videoLine(g: Pick<AdminGift, 'video' | 'job'>): { text: string; tone: 'success' | 'action' | 'danger' | 'neutral' } {
  if (g.job?.status === 'processing') return { text: g.video ? 'Yeni video çevriliyor (eskisi oynuyor)' : 'Video çevriliyor', tone: 'action' };
  if (g.job?.status === 'failed') return { text: `Çevrilemedi: ${g.job.error ?? 'bilinmeyen hata'}`, tone: 'danger' };
  if (g.video) return { text: `Video hazır · ${(g.video.ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn · ${mb(g.video.bytes)} MB`, tone: 'success' };
  return { text: 'Video yok: gönderilince ikonu uçar', tone: 'neutral' };
}
