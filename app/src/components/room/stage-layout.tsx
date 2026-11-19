// Draws a room's mic layout from its schema (data/room-layouts). Seats themselves are the room's normal Seat
// (gifts, menus, reactions, PK points keep working): this only decides where each numbered mic goes and how big
// it is. The sizes come from lib/seat-fit, which the room also uses to fit the stage to the height the chat
// leaves it (`face`), so what is measured there is what is drawn here. Everything is in normal flow (no absolute
// positioning), so the stage never overlaps the chat. A frame's crown may rise into the room above its face (lib/seat-cell
// SEAT_TOP: the row gap and the row above's points line); each seat is told where it has less, and a row higher on
// the screen is drawn over the rows under it, so its names and points pills cover a lower crown's tip.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CallVideo } from '@/components/call-video';
import { Text } from '@/components/text';
import type { LayoutSlot, RoomLayout } from '@/data/room-layouts';
import { Art } from '@/components/Art';
import type { ArenaSlot } from '@/components/room/pk';
import type { TrackRef } from '@/lib/call-media';
import { PK_LINE, ROW_GAP, layoutPlan, layoutSizes, seatHeight, videoTile as videoSize } from '@/lib/seat-fit';
import { colors, radius, semantic, space } from '@/theme';

const PAD = 12;
/** The padding over the first row (lib/seat-fit layoutHeight counts it). */
export const LAYOUT_PAD_TOP = space.sm;
/** Between two seats of the side column beside the big video (lib/seat-fit layoutHeight budgets it). */
const SIDE_GAP = 6;
/** A video tile's border, and the corner its seat shrinks to with the camera's picture on (inset from the border). */
const TILE_BORDER = 1;
const TILE_SEAT: ArenaSlot = { width: 64, size: 28 };
const TILE_INSET = 2;
const TEAM = { red: { name: 'Kırmızı', color: '#FF6576' }, blue: { name: 'Mavi', color: '#38BDF8' } } as const;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function StageLayout({
  layout,
  width,
  face,
  seats,
  pkRoom,
  cameraOf,
  videoOf,
  top,
  renderSeat,
}: {
  layout: RoomLayout;
  width: number;
  /** The mic face that fits the stage's height (lib/seat-fit fitLayout); the host and main seats follow it. */
  face: number;
  seats: (string | null)[];
  /** PK room theme: each team row sits in a labeled red/blue band. Outside PK rooms team rows are plain rows. */
  pkRoom: boolean;
  /** Whether a seat holder's camera is on (the demo: only the viewer's own). */
  cameraOf: (uid: string) => boolean;
  /** A server room: the seat holder's live camera, drawn over the whole tile (lib/live/room-cams). */
  videoOf?: (uid: string) => TrackRef | null;
  /**
   * The px free above the first row's faces (the stage's headroom, the gap under a board, the Patron seat's points
   * line); none: a row's (lib/seat-cell SEAT_TOP).
   */
  top?: number;
  /** `next`: the seat beside it on the same mic row (and the gap between them), for the Lv4 bond line. */
  renderSeat: (index: number, slot: ArenaSlot, next?: { index: number; gap: number }) => ReactNode;
}) {
  const s = layout.layoutSchema;
  const stage = s.slots.filter((x) => x.area === 'stage');
  const side = s.slots.filter((x) => x.area === 'side');
  // Team rows are drawn as rows, the way the "Sahne Düzeni" card shows them; in PK rooms each sits in a tinted
  // band (padding 5 + 5, border 1 + 1). The widest mic row fits on one line with the gaps between its seats (or its
  // last seat would wrap onto a line of its own); six across get a narrower gap.
  const plan = layoutPlan(s, width, pkRoom);
  const { inner, bands, micGap } = plan;
  const sizes = layoutSizes(plan, face);
  const micSlot: ArenaSlot = sizes.mic;
  const paired = new Set(s.pairs.flat());

  const videoTile = (x: LayoutSlot, w: number, h: number) => {
    const uid = seats[x.index];
    const cam = !!uid && cameraOf(uid);
    const video = uid ? (videoOf?.(uid) ?? null) : null;
    return (
      <View key={x.index} style={[st.tile, { width: w, height: h }, cam && st.tileLive]} accessibilityLabel={`Görüntülü yuva ${x.index + 1}${cam ? ', kamera açık' : uid ? ', kamera kapalı' : ''}`}>
        {video && <CallVideo track={video} style={st.tileVideo} mirror={uid === 'me'} />}
        <View style={st.tileIcon}>
          <Ionicons name={cam ? 'videocam' : 'videocam-off-outline'} size={12} color={cam ? semantic.live : colors.textDim} />
        </View>
        {/* With the picture on, the seat (name, mic, gifts, menu) shrinks to the tile's corner. The tile cuts what passes
            its edge: a seat's frame keeps to the room the tile leaves above its face. */}
        {video ? <View style={st.tileSeat}>{renderSeat(x.index, { ...TILE_SEAT, top: Math.max(0, h - 2 * TILE_BORDER - TILE_INSET - seatHeight(TILE_SEAT.size)) })}</View> : renderSeat(x.index, tileSeat(w, h))}
      </View>
    );
  };
  const mainSeat = (x: LayoutSlot, top?: number) => renderSeat(x.index, { ...sizes.main, top });
  const heart = (a: number, b: number) => {
    const both = !!seats[a] && !!seats[b];
    return (
      <View key={`h${a}`} style={st.heart} accessibilityLabel={both ? 'Çift tamam: iki ana yuva dolu' : 'Çift yuvası: ana yuvalardan biri boş'}>
        <Ionicons name={both ? 'heart' : 'heart-outline'} size={26} color={semantic.social} />
      </View>
    );
  };
  // The rows with seats, top to bottom, and the room over each one's faces: the first row's is the stage's (`top`);
  // under a video tile (no points line under it; a side layout's row 0 is the big video and its column) only the gap
  // between the rows; else a row's.
  const drawn = [...Array(s.rows).keys()].filter((r) => stage.some((x) => x.row === r));
  const isVideoRow = (r: number) => stage.filter((x) => x.row === r).every((x) => x.kind === 'video');
  const topOf = (r: number) => {
    const k = drawn.indexOf(r);
    const prev = k > 0 ? drawn[k - 1] : side.length && r > 0 ? 0 : -1;
    if (prev < 0) return top;
    return (side.length && prev === 0) || isVideoRow(prev) ? ROW_GAP : undefined;
  };
  // A row higher on the screen is drawn over the rows under it.
  const layerOf = (r: number) => drawn.length - Math.max(0, drawn.indexOf(r));
  const row = (r: number) => {
    const xs = stage.filter((x) => x.row === r);
    const videos = xs.filter((x) => x.kind === 'video');
    if (videos.length === xs.length) {
      const { w, h } = videoSize(plan, xs.length);
      return (
        <View key={r} style={[st.row, { zIndex: layerOf(r) }]}>
          {xs.map((x) => videoTile(x, w, h))}
        </View>
      );
    }
    const t = xs[0]?.team;
    const band = bands && !!t;
    const above = topOf(r);
    const line = (
      <View key={r} style={[st.row, { columnGap: micGap }, !band && { zIndex: layerOf(r) }]}>
        {xs.map((x, k) => {
          const next = xs[k + 1];
          const linked = paired.has(x.index) && next && s.pairs.some(([a, b]) => a === x.index && b === next.index);
          const beside = x.kind === 'mic' && next?.kind === 'mic' && !x.host && !next.host ? { index: next.index, gap: micGap } : undefined;
          return [
            <View key={x.index}>{x.kind === 'main' ? mainSeat(x, above) : renderSeat(x.index, { ...(x.host && xs.length === 1 ? sizes.host : micSlot), top: above }, beside)}</View>,
            linked ? heart(x.index, next.index) : null,
          ];
        })}
      </View>
    );
    if (!band || !t) return line;
    return (
      <View key={r} style={[st.zone, { zIndex: layerOf(r), width: inner, backgroundColor: `${TEAM[t].color}1F`, borderColor: `${TEAM[t].color}88` }]} accessibilityLabel={`${TEAM[t].name} takım bölgesi`}>
        {/* The team's name is drawn over a crown that rises into it. */}
        <View style={{ zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Art name={t === 'red' ? 'pk-kirmizi-takim' : 'pk-mavi-takim'} size={15} />
          <Text style={[st.zoneName, { color: TEAM[t].color }]}>{TEAM[t].name}</Text>
        </View>
        {line}
      </View>
    );
  };

  // Big video with mics in a column next to it.
  if (side.length) {
    // The same columns as lib/seat-fit layoutHeight: the mics stand beside the video, not in a column far taller than it.
    const sideCols = side.length > 6 ? 3 : side.length > 3 ? 2 : 1;
    const sideW = 60 * sideCols;
    const sideRows = Math.ceil(side.length / sideCols);
    const first = stage.filter((x) => x.row === 0);
    const bigW = inner - sideW - space.sm;
    // As tall as the mics beside it, so no empty block is left under the video.
    const bigH = Math.max(Math.round(clamp(bigW * 0.95, 150, 320)), sideRows * seatHeight(38) + (sideRows - 1) * SIDE_GAP);
    return (
      <View style={st.wrap}>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', zIndex: layerOf(0) }}>
          <View style={{ gap: space.sm }}>{first.map((x) => videoTile(x, bigW, Math.round(bigH / first.length)))}</View>
          <View style={{ width: sideW, flexDirection: 'row', flexWrap: 'wrap', rowGap: SIDE_GAP }}>
            {/* Under a seat of the column: the gap and its points line; a higher seat is drawn over the ones under it. */}
            {side.map((x, k) => (
              <View key={x.index} style={{ zIndex: sideRows - Math.floor(k / sideCols) }}>
                {renderSeat(x.index, { width: 60, size: 38, top: k < sideCols ? top : SIDE_GAP + PK_LINE })}
              </View>
            ))}
          </View>
        </View>
        {[...Array(s.rows).keys()].slice(1).map(row)}
      </View>
    );
  }

  return <View style={st.wrap}>{[...Array(s.rows).keys()].map(row)}</View>;
}

/** A seat on a video tile with no picture: in the tile's middle; the tile cuts what passes its edge. */
function tileSeat(w: number, h: number): ArenaSlot {
  const size = clamp(Math.min(w, h) - 40, 32, 72);
  return { width: w - 8, size, top: Math.max(0, Math.floor((h - 2 * TILE_BORDER - seatHeight(size)) / 2)) };
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: PAD, paddingTop: LAYOUT_PAD_TOP, gap: 10, alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: space.sm, rowGap: 10 },
  tile: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.md, borderWidth: TILE_BORDER, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileLive: { borderColor: semantic.live },
  tileIcon: { position: 'absolute', left: 6, top: 6 },
  tileVideo: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  tileSeat: { position: 'absolute', left: TILE_INSET, bottom: TILE_INSET },
  heart: { paddingHorizontal: 2 },
  zone: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 5, gap: 4 },
  zoneName: { fontWeight: '800', fontSize: 12, textAlign: 'center' },
});
