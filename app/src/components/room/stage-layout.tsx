// Draws a room's mic layout from its schema (data/room-layouts). Seats themselves are the room's normal Seat
// (gifts, menus, reactions, PK points keep working): this only decides where each numbered mic goes and how big
// it is. Everything is in normal flow (no absolute positioning), so the stage never overlaps the chat: on a small
// phone it wraps and the room's stage area scrolls.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import type { LayoutSlot, RoomLayout } from '@/data/room-layouts';
import { Art } from '@/components/Art';
import type { ArenaSlot } from '@/components/room/pk';
import { colors, radius, semantic, space } from '@/theme';

const PAD = 12;
const TEAM = { red: { name: 'Kırmızı', color: '#FF6576' }, blue: { name: 'Mavi', color: '#38BDF8' } } as const;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function StageLayout({
  layout,
  width,
  seats,
  pkRoom,
  cameraOf,
  renderSeat,
}: {
  layout: RoomLayout;
  width: number;
  seats: (string | null)[];
  /** PK room theme: each team row sits in a labeled red/blue band. Outside PK rooms team rows are plain rows. */
  pkRoom: boolean;
  /** Whether a seat holder's camera is on (prototype: only the viewer's own). */
  cameraOf: (uid: string) => boolean;
  /** `next`: the seat beside it on the same mic row (and the gap between them), for the Lv4 bond line. */
  renderSeat: (index: number, slot: ArenaSlot, next?: { index: number; gap: number }) => ReactNode;
}) {
  const s = layout.layoutSchema;
  const inner = Math.max(240, Math.min(width, 640) - PAD * 2);
  const stage = s.slots.filter((x) => x.area === 'stage');
  const side = s.slots.filter((x) => x.area === 'side');
  const micCols = Math.max(4, ...[...Array(s.rows).keys()].map((r) => stage.filter((x) => x.row === r && x.kind === 'mic').length));
  // Team rows are drawn as rows, the way the "Sahne Düzeni" card shows them; in PK rooms each sits in a
  // tinted band (padding 5 + 5, border 1 + 1).
  const bands = pkRoom && stage.some((x) => x.team);
  const rowW = inner - (bands ? 12 : 0);
  // The widest mic row must fit on one line together with the gaps between its seats, or its last seat wraps
  // onto a line of its own (5 mics on a 412 px phone were 4 + 1; 7 team mics on a 360 px phone were 6 + 1).
  // Six across get a narrower gap.
  const micGap = micCols >= 6 ? space.xs : space.sm;
  const micW = Math.floor(clamp((rowW - (micCols - 1) * micGap) / micCols, 40, 84));
  const micSlot: ArenaSlot = { width: micW, size: clamp(micW - 28, 30, 48) };
  const paired = new Set(s.pairs.flat());

  const videoTile = (x: LayoutSlot, w: number, h: number) => {
    const uid = seats[x.index];
    const cam = !!uid && cameraOf(uid);
    return (
      <View key={x.index} style={[st.tile, { width: w, height: h }, cam && st.tileLive]} accessibilityLabel={`Görüntülü yuva ${x.index + 1}${cam ? ', kamera açık' : uid ? ', kamera kapalı' : ''}`}>
        <View style={st.tileIcon}>
          <Ionicons name={cam ? 'videocam' : 'videocam-off-outline'} size={12} color={cam ? semantic.live : colors.textDim} />
        </View>
        {renderSeat(x.index, { width: w - 8, size: clamp(Math.min(w, h) - 40, 32, 72) })}
      </View>
    );
  };
  const mainSeat = (x: LayoutSlot) => renderSeat(x.index, { width: clamp(inner / 3, 84, 120), size: clamp(inner / 5, 50, 66) });
  const heart = (a: number, b: number) => {
    const both = !!seats[a] && !!seats[b];
    return (
      <View key={`h${a}`} style={st.heart} accessibilityLabel={both ? 'Çift tamam: iki ana yuva dolu' : 'Çift yuvası: ana yuvalardan biri boş'}>
        <Ionicons name={both ? 'heart' : 'heart-outline'} size={26} color={semantic.social} />
      </View>
    );
  };
  const row = (r: number) => {
    const xs = stage.filter((x) => x.row === r);
    const videos = xs.filter((x) => x.kind === 'video');
    if (videos.length === xs.length) {
      const w = Math.floor(clamp((inner - (xs.length - 1) * space.sm) / xs.length, 96, xs.length === 1 ? inner * 0.72 : 220));
      const h = Math.round(clamp(w * 0.72, 96, 170));
      return (
        <View key={r} style={st.row}>
          {xs.map((x) => videoTile(x, w, h))}
        </View>
      );
    }
    const line = (
      <View key={r} style={[st.row, { columnGap: micGap }]}>
        {xs.map((x, k) => {
          const next = xs[k + 1];
          const linked = paired.has(x.index) && next && s.pairs.some(([a, b]) => a === x.index && b === next.index);
          const beside = x.kind === 'mic' && next?.kind === 'mic' && !x.host && !next.host ? { index: next.index, gap: micGap } : undefined;
          return [
            <View key={x.index}>{x.kind === 'main' ? mainSeat(x) : renderSeat(x.index, x.host && xs.length === 1 ? { width: Math.max(micW, 96), size: 56 } : micSlot, beside)}</View>,
            linked ? heart(x.index, next.index) : null,
          ];
        })}
      </View>
    );
    const t = xs[0]?.team;
    if (!bands || !t) return line;
    return (
      <View key={r} style={[st.zone, { width: inner, backgroundColor: `${TEAM[t].color}1F`, borderColor: `${TEAM[t].color}88` }]} accessibilityLabel={`${TEAM[t].name} takım bölgesi`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Art name={t === 'red' ? 'pk-kirmizi-takim' : 'pk-mavi-takim'} size={15} />
          <Text style={[st.zoneName, { color: TEAM[t].color }]}>{TEAM[t].name}</Text>
        </View>
        {line}
      </View>
    );
  };

  // Big video with mics in a column next to it.
  if (side.length) {
    const sideCols = side.length > 5 ? 2 : 1;
    const sideW = 60 * sideCols;
    const first = stage.filter((x) => x.row === 0);
    const bigW = inner - sideW - space.sm;
    const bigH = Math.round(clamp(bigW * 0.95, 150, 320));
    return (
      <View style={st.wrap}>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <View style={{ gap: space.sm }}>{first.map((x) => videoTile(x, bigW, Math.round(bigH / first.length)))}</View>
          <View style={{ width: sideW, flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>{side.map((x) => <View key={x.index}>{renderSeat(x.index, { width: 60, size: 38 })}</View>)}</View>
        </View>
        {[...Array(s.rows).keys()].slice(1).map(row)}
      </View>
    );
  }

  return <View style={st.wrap}>{[...Array(s.rows).keys()].map(row)}</View>;
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: PAD, paddingTop: space.sm, gap: 10, alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: space.sm, rowGap: 10 },
  tile: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileLive: { borderColor: semantic.live },
  tileIcon: { position: 'absolute', left: 6, top: 6 },
  heart: { paddingHorizontal: 2 },
  zone: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 5, gap: 4 },
  zoneName: { fontWeight: '800', fontSize: 12, textAlign: 'center' },
});
