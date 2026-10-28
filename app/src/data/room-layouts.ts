// Mic layout catalog ("Yayına Katılma Modu"). Modes and layouts are DATA: a new layout is one more line in
// LAYOUT_SPECS (or one more RoomLayout object from a panel) — no screen code changes. The renderer
// (components/room/stage-layout) draws any schema; the domain (lib/room-modes) validates every change.
//
// Starting data follows the reference screens. Room levels are the starting values and use the room's own
// level (1–15, data/catalog roomLevel); "locked" is not stored, it is the room level being below
// minimumRoomLevel (or a feature the room doesn't have).

export type ModeId = 'audio' | 'video' | 'cinema' | 'couple';
export type TeamZone = 'red' | 'blue';
/** Features a layout can need; rooms list what they have (lib/room-modes StageInfo.features). */
export type RoomFeature = 'youtube' | 'camera';

export type RoomMode = {
  id: ModeId;
  name: string;
  /** Ionicons name for the tab. */
  icon: string;
  desc: string;
  /** Layouts of this mode have a shared content area (YouTube) — always shown, or only once a video is set. */
  content: 'none' | 'optional' | 'always';
  isEnabled: boolean;
  sortOrder: number;
};

/**
 * One mic slot. `index` is the presence seat index (lib/room-presence seats[index]); seat 0 is the room's
 * host seat as before. `area` 'side' puts the slot in a column next to the first stage row (big video + side mics).
 */
export type LayoutSlot = {
  index: number;
  area: 'stage' | 'side';
  row: number;
  col: number;
  /** mic = voice seat · video = camera tile (görüntülü yuva) · main = couple-room main participant. */
  kind: 'mic' | 'video' | 'main';
  host?: boolean;
  team?: TeamZone;
};
export type LayoutSchema = {
  /** Shared YouTube screen above the slots (Video: optional, Sinema Salonu: always). */
  content: { placement: 'top' } | null;
  slots: LayoutSlot[];
  /** Stage rows and the widest row (for sizing). */
  rows: number;
  columns: number;
  /** Couple pairs drawn linked (slot indexes). */
  pairs: [number, number][];
};
export type RoomLayout = {
  id: string;
  modeId: ModeId;
  name: string;
  microphoneCapacity: number;
  minimumRoomLevel: number;
  layoutSchema: LayoutSchema;
  isPkLayout: boolean;
  requiresFeature?: RoomFeature;
  isEnabled: boolean;
  sortOrder: number;
};

export const ROOM_MODES: RoomMode[] = [
  { id: 'audio', name: 'Ses', icon: 'mic', desc: 'Yalnızca sesli mikrofonlar', content: 'none', isEnabled: true, sortOrder: 1 },
  { id: 'video', name: 'Video', icon: 'videocam', desc: 'Görüntülü yuvalar ve ortak YouTube ekranı', content: 'optional', isEnabled: true, sortOrder: 2 },
  { id: 'cinema', name: 'Sinema Salonu', icon: 'film', desc: 'Büyük ortak ekran (YouTube), altta mikrofonlar', content: 'always', isEnabled: true, sortOrder: 3 },
  { id: 'couple', name: 'Çift Odası', icon: 'heart', desc: 'İki ana katılımcı öne çıkar', content: 'none', isEnabled: true, sortOrder: 4 },
];

/**
 * Compact layout notation, compiled below into LayoutSchema. One string per stage row, one letter per slot:
 *   h host mic · m mic · H host video tile · v video tile · M main (couple) · r / b red / blue team mic
 * `side` lists slots shown in a column next to the first row. `pairs` links couple slots by index.
 */
type Spec = {
  id: string;
  mode: ModeId;
  level: number;
  rows: string[];
  side?: string;
  name?: string;
  pk?: boolean;
  pairs?: [number, number][];
  feature?: RoomFeature;
  enabled?: boolean;
};
const LAYOUT_SPECS: Spec[] = [
  // Ses
  { id: 'audio-2', mode: 'audio', level: 1, rows: ['hm'] },
  { id: 'audio-5-pk', mode: 'audio', level: 1, rows: ['h', 'mmmm'], pk: true },
  { id: 'audio-6', mode: 'audio', level: 1, rows: ['h', 'mmmmm'] },
  { id: 'audio-6-grid', mode: 'audio', level: 1, rows: ['hmm', 'mmm'] },
  { id: 'audio-6-team', mode: 'audio', level: 1, rows: ['rrr', 'bbb'], pk: true },
  { id: 'audio-9-pk', mode: 'audio', level: 1, rows: ['h', 'mmmm', 'mmmm'], pk: true },
  { id: 'audio-9-team', mode: 'audio', level: 1, rows: ['h', 'rrrr', 'bbbb'], pk: true },
  { id: 'audio-11', mode: 'audio', level: 1, rows: ['h', 'mmmmm', 'mmmmm'] },
  { id: 'audio-12-team', mode: 'audio', level: 1, rows: ['rrrrrr', 'bbbbbb'], pk: true },
  { id: 'audio-13-pk', mode: 'audio', level: 4, rows: ['h', 'mmmm', 'mmmm', 'mmmm'], pk: true },
  { id: 'audio-15-team', mode: 'audio', level: 1, rows: ['h', 'rrrrrrr', 'bbbbbbb'], pk: true },
  { id: 'audio-15', mode: 'audio', level: 5, rows: ['hmmmm', 'mmmmm', 'mmmmm'] },
  { id: 'audio-16-pk', mode: 'audio', level: 6, rows: ['hmmm', 'mmmm', 'mmmm', 'mmmm'], pk: true },
  { id: 'audio-20', mode: 'audio', level: 7, rows: ['hmmmm', 'mmmmm', 'mmmmm', 'mmmmm'] },
  { id: 'audio-24', mode: 'audio', level: 8, rows: ['hmmmmm', 'mmmmmm', 'mmmmmm', 'mmmmmm'] },
  { id: 'audio-30', mode: 'audio', level: 9, rows: ['hmmmmm', 'mmmmmm', 'mmmmmm', 'mmmmmm', 'mmmmmm'] },
  // Video: camera tiles are mic slots too (their holders speak), so they count in the capacity.
  { id: 'video-5', mode: 'video', level: 5, rows: ['H', 'mmmm'], feature: 'camera' },
  { id: 'video-6-side', mode: 'video', level: 5, rows: ['H'], side: 'mmmmm', feature: 'camera' },
  { id: 'video-6-duo', mode: 'video', level: 6, rows: ['Hv', 'mmmm'], feature: 'camera' },
  { id: 'video-7', mode: 'video', level: 7, rows: ['H', 'vv', 'mmmm'], feature: 'camera' },
  { id: 'video-8', mode: 'video', level: 5, rows: ['H', 'mmmm', 'mmm'], feature: 'camera' },
  { id: 'video-8-quad', mode: 'video', level: 7, rows: ['Hv', 'vv', 'mmmm'], feature: 'camera' },
  { id: 'video-10-side', mode: 'video', level: 5, rows: ['H'], side: 'mmmmmmmmm', feature: 'camera' },
  { id: 'video-10-six', mode: 'video', level: 8, rows: ['Hvv', 'vvv', 'mmmm'], feature: 'camera' },
  { id: 'video-11', mode: 'video', level: 6, rows: ['Hv', 'mmmmm', 'mmmm'], feature: 'camera' },
  { id: 'video-12', mode: 'video', level: 7, rows: ['H', 'vv', 'mmmmm', 'mmmm'], feature: 'camera' },
  { id: 'video-13', mode: 'video', level: 8, rows: ['Hv', 'vv', 'mmmmm', 'mmmm'], feature: 'camera' },
  { id: 'video-15', mode: 'video', level: 9, rows: ['Hvv', 'vvv', 'mmmmm', 'mmmm'], feature: 'camera' },
  // Sinema Salonu: the screen is the content area; mics below.
  { id: 'cinema-2', mode: 'cinema', level: 2, rows: ['hm'], feature: 'youtube' },
  { id: 'cinema-3', mode: 'cinema', level: 2, rows: ['hmm'], feature: 'youtube' },
  { id: 'cinema-4', mode: 'cinema', level: 2, rows: ['hmmm'], feature: 'youtube' },
  { id: 'cinema-7', mode: 'cinema', level: 5, rows: ['hmmm', 'mmm'], feature: 'youtube' },
  // Çift Odası
  { id: 'couple-date', mode: 'couple', level: 1, name: 'Randevu', rows: ['h', 'MM', 'mm'], pairs: [[1, 2]] },
  { id: 'couple-wedding', mode: 'couple', level: 3, name: 'Düğün', rows: ['MM', 'mmmm', 'mmmm'], pairs: [[0, 1]] },
];

const KIND: Record<string, Pick<LayoutSlot, 'kind' | 'host' | 'team'>> = {
  h: { kind: 'mic', host: true },
  m: { kind: 'mic' },
  H: { kind: 'video', host: true },
  v: { kind: 'video' },
  M: { kind: 'main' },
  r: { kind: 'mic', team: 'red' },
  b: { kind: 'mic', team: 'blue' },
};

/** Compiles the notation into a schema: stage rows first (left to right, top to bottom), then the side column. */
export function compileSchema(rows: string[], side = '', mode: ModeId, pairs: [number, number][] = []): LayoutSchema {
  const slots: LayoutSlot[] = [];
  const add = (ch: string, area: LayoutSlot['area'], row: number, col: number) => {
    const k = KIND[ch];
    if (!k) throw new Error(`Bilinmeyen yuva harfi: ${ch}`);
    slots.push({ index: slots.length, area, row, col, ...k });
  };
  rows.forEach((r, row) => [...r].forEach((ch, col) => add(ch, 'stage', row, col)));
  [...side].forEach((ch, row) => add(ch, 'side', row, 0));
  const content = ROOM_MODES.find((m) => m.id === mode)!.content === 'none' ? null : ({ placement: 'top' } as const);
  return { content, slots, rows: rows.length, columns: Math.max(...rows.map((r) => r.length)), pairs };
}

const MODE_ORDER = Object.fromEntries(ROOM_MODES.map((m) => [m.id, m.sortOrder]));
export const ROOM_LAYOUTS: RoomLayout[] = LAYOUT_SPECS.map((s, i) => {
  const layoutSchema = compileSchema(s.rows, s.side, s.mode, s.pairs);
  return {
    id: s.id,
    modeId: s.mode,
    name: s.name ?? `${layoutSchema.slots.length} mikrofon`,
    microphoneCapacity: layoutSchema.slots.length,
    minimumRoomLevel: s.level,
    layoutSchema,
    isPkLayout: !!s.pk,
    requiresFeature: s.feature,
    isEnabled: s.enabled ?? true,
    sortOrder: MODE_ORDER[s.mode] * 1000 + i,
  };
});

/** Short description of a layout's shape, for cards and screen readers. */
export function layoutSummary(l: RoomLayout) {
  const s = l.layoutSchema.slots;
  const video = s.filter((x) => x.kind === 'video').length;
  const red = s.filter((x) => x.team === 'red').length;
  const parts = [`${l.microphoneCapacity} mikrofon`];
  if (video) parts.push(`${video} görüntülü yuva`);
  if (s.some((x) => x.area === 'side')) parts.push('yan sütunda mikrofonlar');
  if (red) parts.push(`${red}'e ${s.filter((x) => x.team === 'blue').length} kırmızı-mavi takım bölgesi`);
  if (l.layoutSchema.pairs.length) parts.push('iki ana katılımcı yuvası');
  if (l.layoutSchema.content) parts.push('ortak YouTube ekranı');
  return parts.join(', ');
}
