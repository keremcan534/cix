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
  /** PK room theme: team zones are tinted red/blue. Outside PK rooms the zones are neutral and unlabeled. */
  pkRoom: boolean;
  /** Whether a seat holder's camera is on (prototype: only the viewer's own). */
  cameraOf: (uid: string) => boolean;
  renderSeat: (index: number, slot: ArenaSlot) => ReactNode;
}) {
  const s = layout.layoutSchema;
  const inner = Math.max(240, Math.min(width, 640) - PAD * 2);
  const stage = s.slots.filter((x) => x.area === 'stage');
  const side = s.slots.filter((x) => x.area === 'side');
  const micCols = Math.max(4, ...[...Array(s.rows).keys()].map((r) => stage.filter((x) => x.row === r && x.kind === 'mic').length));
  // The widest mic row must fit on one line together with the gaps between its seats, or its last seat wraps
  // onto a line of its own (5 mics on a 412 px phone were 4 + 1). Six across get a narrower gap.
  const micGap = micCols >= 6 ? space.xs : space.sm;
  const micW = Math.floor(clamp((inner - (micCols - 1) * micGap) / micCols, 48, 84));
  const micSlot: ArenaSlot = { width: micW, size: clamp(micW - 24, 32, 56) };
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
  const mainSeat = (x: LayoutSlot) => renderSeat(x.index, { width: clamp(inner / 3, 84, 120), size: clamp(inner / 4.5, 56, 76) });
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
    return (
      <View key={r} style={[st.row, { columnGap: micGap }]}>
        {xs.map((x, k) => {
          const next = xs[k + 1];
          const linked = paired.has(x.index) && next && s.pairs.some(([a, b]) => a === x.index && b === next.index);
          return [
            <View key={x.index}>{x.kind === 'main' ? mainSeat(x) : renderSeat(x.index, x.host && xs.length === 1 ? { width: Math.max(micW, 96), size: 64 } : micSlot)}</View>,
            linked ? heart(x.index, next.index) : null,
          ];
        })}
      </View>
    );
  };

  // Team zones: host seats on top, then the red and blue halves side by side.
  if (stage.some((x) => x.team)) {
    const hosts = stage.filter((x) => !x.team);
    // Inner width of one zone: half the row minus its padding (5 + 5) and border (1 + 1), with a pixel to spare.
    const half = Math.floor((inner - space.sm) / 2) - 14;
    const cols = clamp(Math.floor(half / 58), 1, 4);
    const w = Math.floor(half / cols);
    const slot: ArenaSlot = { width: w, size: clamp(w - 22, 30, 52) };
    return (
      <View style={st.wrap}>
        {hosts.length > 0 && <View style={st.row}>{hosts.map((x) => renderSeat(x.index, { width: Math.max(micW, 96), size: 64 }))}</View>}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(['red', 'blue'] as const).map((t) => (
            <View
              key={t}
              style={[st.zone, pkRoom && { backgroundColor: `${TEAM[t].color}1F`, borderColor: `${TEAM[t].color}88` }]}
              accessibilityLabel={pkRoom ? `${TEAM[t].name} takım bölgesi` : undefined}>
              {pkRoom && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Art name={t === 'red' ? 'pk-kirmizi-takim' : 'pk-mavi-takim'} size={15} />
                  <Text style={[st.zoneName, { color: TEAM[t].color }]}>{TEAM[t].name}</Text>
                </View>
              )}
              <View style={st.zoneSeats}>{stage.filter((x) => x.team === t).map((x) => <View key={x.index}>{renderSeat(x.index, slot)}</View>)}</View>
            </View>
          ))}
        </View>
      </View>
    );
  }

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
  zone: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 5, gap: 4 },
  zoneName: { fontWeight: '800', fontSize: 12, textAlign: 'center' },
  zoneSeats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 6 },
});
