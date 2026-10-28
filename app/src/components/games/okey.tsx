// Okey table in a room (rules: lib/okey, table + clock: lib/okey-table). Everyone in the room can open it,
// take a free seat between hands or watch. The viewer's own seat is drawn at the bottom; spectators see
// seat 1 there. Hands come only from `viewFor`, so a spectator's screen has no one's tiles. The rack is the
// player's own arrangement: tap a tile then a slot, or drag; drag a tile up to discard it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { EdgeLight, Gloss, PressableScale, glow } from '@/components/fx/surface';
import type { Player } from '@/components/games/room-games';
import {
  arrangePairs,
  arrangeRuns,
  isWild,
  meldsOf,
  moveOnRack,
  nextSeat,
  prevSeat,
  RACK_SLOTS,
  syncRack,
  viewFor,
  type Face,
  type SeatHolder,
  type Tile,
  type TableView,
} from '@/lib/okey';
import {
  TURN_MS,
  fillOkeyBots,
  fromOtherClient,
  moveOkey,
  openOkey,
  removeOkeyBot,
  sitOkey,
  standOkey,
  startOkey,
  unwatchOkey,
  useOkeyTable,
  viewerKey,
  watchOkey,
} from '@/lib/okey-table';
import { tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, fonts, semantic } from '@/theme';

const INK = ['#D99A00', '#1E6FD9', '#1C2433', '#D93A45'];
const FELT = ['#0E5A5E', '#0A3C47', '#08283A'] as const;
const ROW = 13;
const GAP = 2;
const TW = 23;
const TH = 33;

export function OkeyTable({ roomId, me, crowd }: { roomId: string; me: Player; crowd: Player[] }) {
  const { settings } = useApp();
  const [viewer] = useState<SeatHolder>(() => ({ id: viewerKey(me.id), name: me.name, avatar: me.avatar, bot: false }));
  const table = useOkeyTable(roomId);
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [arranged, setArranged] = useState<{ hand: number; slots: (number | null)[] }>({ hand: -1, slots: [] });
  const [now, setNow] = useState(() => Date.now());

  // Opening the game from the room menu opens the room's table (or joins the one already open) as a viewer.
  useEffect(() => {
    const t = openOkey(
      roomId,
      viewer,
      crowd.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, bot: false })),
    );
    if (!t.seats.some((s) => s?.id === viewer.id)) watchOkey(roomId, viewer);
    return () => unwatchOkey(roomId, viewer.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, viewer]);

  const live = !!table?.game && table.game.phase !== 'over';
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!table) return <Text style={s.dim}>Masa hazırlanıyor…</Text>;
  const v = viewFor(table, viewer.id);
  const seated = v.mySeat >= 0;
  const anchor = seated ? v.mySeat : 0;
  const myTurn = seated && v.turn === v.mySeat && (v.phase === 'draw' || v.phase === 'discard');
  const canSeat = v.phase === 'waiting' || v.phase === 'over';
  const full = v.seats.every((x) => x.holder);
  const slots = v.myHand.length ? (arranged.hand === v.hand ? syncRack(arranged.slots, v.myHand) : arrangeRuns(v.myHand, v.okey!)) : [];
  const setSlots = (next: (number | null)[]) => setArranged({ hand: v.hand, slots: next });
  const tileById = new Map(v.myHand.map((t) => [t.id, t]));

  const report = (r: { ok: true } | { ok: false; reason: string }) => setNote(r.ok ? '' : r.reason);
  const draw = (from: 'pile' | 'discard') => {
    if (!myTurn || v.phase !== 'draw') return;
    tapHaptic();
    report(moveOkey(roomId, viewer.id, { type: 'draw', from }));
  };
  const discard = (tileId: number) => {
    if (!myTurn || v.phase !== 'discard') return setNote(v.phase === 'draw' ? 'Önce taş çek.' : 'Sıra sende değil.');
    setSelected(null);
    report(moveOkey(roomId, viewer.id, { type: 'discard', tileId }));
  };
  const leave = () => {
    report(standOkey(roomId, viewer.id));
    watchOkey(roomId, viewer);
  };
  const onDrop = (slot: number, dx: number, dy: number) => {
    const id = slots[slot];
    if (id === null) return;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return setSelected((cur) => (cur === id ? null : id));
    if (dy < -TH * 1.6 && myTurn && v.phase === 'discard') return discard(id);
    const row = Math.min(1, Math.max(0, Math.floor(slot / ROW) + Math.round(dy / (TH + GAP))));
    const col = Math.min(ROW - 1, Math.max(0, (slot % ROW) + Math.round(dx / (TW + GAP))));
    setSlots(moveOnRack(slots, slot, row * ROW + col));
    setSelected(null);
  };
  const tapSlot = (slot: number) => {
    if (selected === null) return;
    setSlots(moveOnRack(slots, slots.indexOf(selected), slot));
    setSelected(null);
  };

  // Seats around the felt, the viewer's at the bottom; turns go to the right (counter-clockwise).
  const at = { bottom: anchor, right: nextSeat(anchor), top: nextSeat(nextSeat(anchor)), left: prevSeat(anchor) };
  const turnHolder = v.turn >= 0 ? v.seats[v.turn].holder : null;
  const secondsLeft = turnHolder && !turnHolder.bot && live ? Math.min(TURN_MS / 1000, Math.max(0, Math.ceil((table.turnAt + TURN_MS - now) / 1000))) : null;
  const takeTop = seated ? v.seats[prevSeat(v.mySeat)].discardTop : undefined;

  const status = (() => {
    if (v.phase === 'waiting') return full ? 'Masa hazır · eli başlat' : `Oyuncu bekleniyor · ${v.seats.filter((x) => x.holder).length}/4`;
    if (v.phase === 'over') {
      if (v.winner === null) return 'Ortada taş kalmadı · el berabere';
      const w = v.seats[v.winner].holder?.name ?? '';
      const how = v.finish === 'pairs' ? 'çiftlerle' : v.okeyFinish ? 'okey atarak' : 'serilerle';
      return `🏆 ${v.winner === v.mySeat ? 'Elini bitirdin' : `${w} bitirdi`} · ${how}`;
    }
    if (myTurn) return v.phase === 'draw' ? 'Sıra sende · ortadan ya da soldaki taşı çek' : 'Bir taş at · seç ve At, ya da yukarı sürükle';
    return `${turnHolder?.name ?? ''} oynuyor…`;
  })();

  return (
    <View style={s.root}>
      <View style={s.topRow}>
        <Text style={s.handNo}>{v.hand > 0 ? `${v.hand}. el` : 'Okey masası'}</Text>
        <View style={s.watch}>
          <Ionicons name="eye" size={13} color={colors.textDim} />
          <Text style={s.watchText}>{v.watchers.length} izliyor</Text>
          <View style={s.watchAvs}>{v.watchers.slice(0, 4).map((w) => (w.avatar ? <Image key={w.id} source={{ uri: w.avatar }} style={s.watchAv} /> : null))}</View>
          {seated && live && (
            <Pressable
              onPress={leave}
              hitSlop={8}
              style={s.leave}
              accessibilityLabel="Masadan kalk, yerine bot oynasın"
            >
              <Ionicons name="exit-outline" size={14} color={colors.textDim} />
              <Text style={s.watchText}>Kalk</Text>
            </Pressable>
          )}
        </View>
      </View>

      <LinearGradient colors={FELT} style={s.felt}>
        <EdgeLight inset={30} strength={0.25} />
        <View style={s.feltRow}>
          <DiscardSlot top={v.seats[at.top].discardTop} count={v.seats[at.top].discardCount} okey={v.okey} />
          <SeatChip v={v} seat={at.top} canSeat={canSeat} seated={seated} viewer={viewer} roomId={roomId} onNote={setNote} reduceMotion={settings.reduceMotion} />
          <DiscardSlot top={v.seats[at.right].discardTop} count={v.seats[at.right].discardCount} okey={v.okey} />
        </View>
        <View style={s.feltRow}>
          <SeatChip v={v} seat={at.left} canSeat={canSeat} seated={seated} viewer={viewer} roomId={roomId} onNote={setNote} reduceMotion={settings.reduceMotion} />
          <View style={s.center}>
            {v.indicator ? (
              <>
                <Pressable onPress={() => draw('pile')} disabled={!myTurn || v.phase !== 'draw'} accessibilityLabel={`Ortadan taş çek, ${v.pile} taş kaldı`}>
                  <View style={[s.pile, myTurn && v.phase === 'draw' && glow(semantic.action, 14, 0)]}>
                    <LinearGradient colors={['#13D9DF', '#0A8F95']} style={StyleSheet.absoluteFill} />
                    <Gloss radius={6} strength={0.35} />
                    <Text style={s.pileText}>{v.pile}</Text>
                  </View>
                </Pressable>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <TileFace t={v.indicator} w={30} h={42} />
                  <Text style={s.tiny}>gösterge</Text>
                </View>
              </>
            ) : (
              <Text style={s.tiny}>Taşlar el başlayınca dağıtılır</Text>
            )}
          </View>
          <SeatChip v={v} seat={at.right} canSeat={canSeat} seated={seated} viewer={viewer} roomId={roomId} onNote={setNote} reduceMotion={settings.reduceMotion} />
        </View>
        <View style={s.feltRow}>
          <Pressable onPress={() => draw('discard')} disabled={!myTurn || v.phase !== 'draw' || !takeTop} accessibilityLabel="Soldaki oyuncunun attığı taşı al">
            <DiscardSlot top={v.seats[at.left].discardTop} count={v.seats[at.left].discardCount} okey={v.okey} lit={myTurn && v.phase === 'draw' && !!takeTop} />
          </Pressable>
          <SeatChip v={v} seat={at.bottom} canSeat={canSeat} seated={seated} viewer={viewer} roomId={roomId} onNote={setNote} reduceMotion={settings.reduceMotion} />
          <DiscardSlot top={v.seats[at.bottom].discardTop} count={v.seats[at.bottom].discardCount} okey={v.okey} />
        </View>
      </LinearGradient>

      <View style={s.statusRow} accessibilityLiveRegion="polite">
        <Text style={[s.status, myTurn && { color: semantic.action }]} numberOfLines={2}>
          {status}
        </Text>
        {secondsLeft !== null && <Text style={[s.timer, secondsLeft <= 10 && { color: colors.pink }]}>{secondsLeft} sn</Text>}
      </View>
      {!!note && <Text style={s.note}>{note}</Text>}

      {v.phase === 'over' && v.winnerHand.length > 0 && v.winner !== v.mySeat && (
        <View style={s.winHand} accessibilityLabel="Kazananın taşları">
          {(meldsOf(v.winnerHand, v.okey!) ?? [v.winnerHand]).map((set, i) => (
            <View key={i} style={s.meld}>
              {set.map((t) => (
                <TileFace key={t.id} t={t} w={20} h={28} okey={v.okey} />
              ))}
            </View>
          ))}
        </View>
      )}

      {seated && v.myHand.length > 0 && (
        <>
          <Rack slots={slots} tiles={tileById} okey={v.okey!} selected={selected} onDrop={onDrop} onTapSlot={tapSlot} />
          <View style={s.actions}>
            <Action label="Seri diz" icon="git-commit-outline" onPress={() => setSlots(arrangeRuns(v.myHand, v.okey!))} />
            <Action label="Çift diz" icon="copy-outline" onPress={() => setSlots(arrangePairs(v.myHand, v.okey!))} />
            <Action label="At" icon="arrow-up-circle" primary disabled={!myTurn || v.phase !== 'discard' || selected === null} onPress={() => selected !== null && discard(selected)} />
          </View>
        </>
      )}

      {!seated && <Text style={s.dim}>İzliyorsun · oyuncuların taşlarını yalnızca kendileri görür. {canSeat ? 'Boş ya da botlu bir koltuğa dokunup oturabilirsin.' : 'El bitince boş ya da botlu bir koltuğa oturabilirsin.'}</Text>}

      {canSeat && (
        <View style={s.actions}>
          {!full && <Action label="Boşlara bot ekle" icon="hardware-chip-outline" onPress={() => report(fillOkeyBots(roomId))} />}
          {full && seated && <Action label={v.phase === 'over' ? 'Yeni el' : 'Eli başlat'} icon="play" primary onPress={() => report(startOkey(roomId))} />}
          {seated && <Action label="Masadan kalk" icon="exit-outline" onPress={leave} />}
        </View>
      )}
    </View>
  );
}

function SeatChip({
  v,
  seat,
  canSeat,
  seated,
  viewer,
  roomId,
  onNote,
  reduceMotion,
}: {
  v: TableView;
  seat: number;
  canSeat: boolean;
  seated: boolean;
  viewer: SeatHolder;
  roomId: string;
  onNote: (s: string) => void;
  reduceMotion: boolean;
}) {
  const sv = v.seats[seat];
  const h = sv.holder;
  const turn = v.turn === seat && (v.phase === 'draw' || v.phase === 'discard');
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!turn || reduceMotion) return pulse.setValue(0);
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [turn, reduceMotion, pulse]);

  if (!h)
    return (
      <PressableScale
        style={s.empty}
        disabled={!canSeat || seated}
        accessibilityLabel={`${seat + 1}. koltuğa otur`}
        onPress={() => {
          const r = sitOkey(roomId, seat, viewer);
          onNote(r.ok ? '' : r.reason);
        }}
      >
        <Ionicons name="add" size={18} color={canSeat && !seated ? semantic.action : colors.textDim} />
        <Text style={s.emptyText}>{canSeat && !seated ? 'Otur' : 'Boş'}</Text>
      </PressableScale>
    );
  const name = h.id === viewer.id ? 'Sen' : h.name;
  // Between hands a bot's seat can be taken by a spectator, or the bot sent away by a player.
  const takeable = h.bot && canSeat && !seated;
  const removable = h.bot && canSeat && seated;
  return (
    <Pressable
      disabled={!takeable && !removable}
      onPress={() => {
        const r = takeable ? sitOkey(roomId, seat, viewer) : removeOkeyBot(roomId, seat);
        onNote(r.ok ? '' : r.reason);
      }}
      accessibilityLabel={takeable ? `${h.name} yerine otur` : removable ? `${h.name} botunu kaldır` : h.name}
      style={[s.seat, turn && { borderColor: semantic.action }, v.winner === seat && { borderColor: colors.gold }, takeable && s.seatOpen]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, s.seatGlow, { opacity: pulse }]} />
      {h.bot ? (
        <View style={[s.av, s.botAv]}>
          <Text style={{ fontSize: 15 }}>🤖</Text>
        </View>
      ) : (
        <Image source={{ uri: h.avatar }} style={s.av} />
      )}
      <View style={{ flexShrink: 1 }}>
        <Text style={s.seatName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={s.seatMeta} numberOfLines={1}>
          {fromOtherClient(h) ? 'diğer sekme' : sv.tiles ? `${sv.tiles} taş` : h.bot ? 'bot' : 'hazır'}
        </Text>
      </View>
      <Text style={s.score} accessibilityLabel={`${sv.score} puan`}>
        {sv.score}
      </Text>
      {removable && <Ionicons name="close-circle" size={14} color={colors.textDim} />}
      {takeable && <Ionicons name="log-in-outline" size={14} color={semantic.action} />}
    </Pressable>
  );
}

function DiscardSlot({ top, count, okey, lit }: { top?: Tile; count: number; okey?: Face; lit?: boolean }) {
  return (
    <View style={[s.discard, lit && { borderColor: semantic.action, ...glow(semantic.action, 12, 0) }]}>
      {top ? <TileFace t={top} w={26} h={36} okey={okey} /> : <Text style={s.tiny}>—</Text>}
      {count > 1 && <Text style={s.count}>{count}</Text>}
    </View>
  );
}

/** A tile: ivory face, the number in its color, a false joker as a star; okeys get a gold rim in a hand. */
function TileFace({ t, w, h, okey, lifted }: { t: Tile; w: number; h: number; okey?: Face; lifted?: boolean }) {
  const wild = okey && isWild(t, okey);
  return (
    <View style={[s.tile, { width: w, height: h }, wild && s.wild, lifted && { borderColor: semantic.action, ...glow(semantic.action, 10, 0) }]}>
      <LinearGradient colors={['#FFFDF6', '#EFE5CD']} style={StyleSheet.absoluteFill} />
      {t.fake ? (
        <Text style={{ fontSize: h * 0.5, color: '#0F766E' }}>★</Text>
      ) : (
        <>
          <Text style={[s.num, { fontSize: h * 0.5, lineHeight: h * 0.62, color: INK[t.c] }]}>{t.n}</Text>
          <View style={[s.pip, { backgroundColor: INK[t.c], width: h * 0.14, height: h * 0.14 }]} />
        </>
      )}
    </View>
  );
}

function Rack({
  slots,
  tiles,
  okey,
  selected,
  onDrop,
  onTapSlot,
}: {
  slots: (number | null)[];
  tiles: Map<number, Tile>;
  okey: Face;
  selected: number | null;
  onDrop: (slot: number, dx: number, dy: number) => void;
  onTapSlot: (slot: number) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  return (
    <LinearGradient colors={['#7A4A22', '#5A3417']} style={s.rack}>
      <EdgeLight inset={20} strength={0.3} />
      {[0, 1].map((row) => (
        <View key={row} style={s.rackRow}>
          {Array.from({ length: ROW }, (_, col) => {
            const slot = row * ROW + col;
            const id = slot < RACK_SLOTS ? slots[slot] : null;
            const t = id !== null ? tiles.get(id) : undefined;
            return (
              <View key={slot} style={[s.slot, dragging === slot && { zIndex: 10 }]}>
                {t ? (
                  <DragTile slot={slot} tile={t} okey={okey} lifted={selected === t.id} onDrop={onDrop} onDrag={setDragging} />
                ) : (
                  <Pressable style={StyleSheet.absoluteFill} onPress={() => onTapSlot(slot)} accessibilityLabel={`Boş yuva ${slot + 1}`} />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </LinearGradient>
  );
}

function DragTile({ slot, tile, okey, lifted, onDrop, onDrag }: { slot: number; tile: Tile; okey: Face; lifted: boolean; onDrop: (slot: number, dx: number, dy: number) => void; onDrag: (slot: number | null) => void }) {
  const [pos] = useState(() => new Animated.ValueXY());
  // Plain responder props (re-read on every event), so a re-render mid-drag keeps the gesture.
  const startRef = useRef({ x: 0, y: 0 });
  const end = (e: GestureResponderEvent, drop: boolean) => {
    const dx = e.nativeEvent.pageX - startRef.current.x;
    const dy = e.nativeEvent.pageY - startRef.current.y;
    pos.setValue({ x: 0, y: 0 });
    onDrag(null);
    if (drop) onDrop(slot, dx, dy);
  };
  const label = tile.fake ? 'Sahte okey' : `${['Sarı', 'Mavi', 'Siyah', 'Kırmızı'][tile.c]} ${tile.n}${isWild(tile, okey) ? ', okey' : ''}`;
  return (
    <Animated.View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        startRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        onDrag(slot);
      }}
      onResponderMove={(e) => pos.setValue({ x: e.nativeEvent.pageX - startRef.current.x, y: e.nativeEvent.pageY - startRef.current.y })}
      onResponderRelease={(e) => end(e, true)}
      onResponderTerminate={(e) => end(e, false)}
      accessible accessibilityRole="button" accessibilityLabel={label} style={{ transform: [{ translateX: pos.x }, { translateY: Animated.add(pos.y, lifted ? -6 : 0) }] }}>
      <TileFace t={tile} w={TW} h={TH} okey={okey} lifted={lifted} />
    </Animated.View>
  );
}

function Action({ label, icon, onPress, primary, disabled }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <PressableScale style={[s.action, primary && s.actionPrimary, disabled && { opacity: 0.4 }]} disabled={disabled} onPress={onPress} accessibilityLabel={label}>
      {primary && <Gloss strength={0.3} />}
      <Ionicons name={icon} size={15} color={primary ? semantic.actionInk : colors.text} />
      <Text style={[s.actionText, primary && { color: semantic.actionInk }]}>{label}</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  // Mouse drags on web would otherwise select the tile numbers as text.
  root: { gap: 10, userSelect: 'none' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  handNo: { color: '#fff', fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  watchText: { color: colors.textDim, fontSize: 12 },
  watchAvs: { flexDirection: 'row', marginLeft: 6 },
  watchAv: { width: 18, height: 18, borderRadius: 9, marginLeft: -5, borderWidth: 1, borderColor: colors.card },
  leave: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.cardAlt },
  felt: { borderRadius: 22, padding: 8, gap: 8, borderWidth: 1, borderColor: 'rgba(19,217,223,0.25)', boxShadow: '0 10px 24px rgba(0,0,0,0.35)', overflow: 'hidden' },
  feltRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  center: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  pile: { width: 34, height: 46, borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  pileText: { color: semantic.actionInk, fontFamily: fonts.display, fontSize: 16, lineHeight: 20 },
  tiny: { color: 'rgba(255,255,255,0.6)', fontSize: 10, textAlign: 'center' },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(4,22,29,0.55)', paddingVertical: 3, paddingLeft: 3, paddingRight: 5, maxWidth: 124, overflow: 'hidden' },
  seatOpen: { borderStyle: 'dashed', borderColor: semantic.action },
  seatGlow: { backgroundColor: 'rgba(19,217,223,0.22)', borderRadius: 999 },
  av: { width: 26, height: 26, borderRadius: 13 },
  botAv: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  seatName: { color: '#fff', fontSize: 11, fontWeight: '800' },
  seatMeta: { color: colors.textDim, fontSize: 10 },
  score: { color: semantic.moneyInk, backgroundColor: colors.gold, fontFamily: fonts.display, fontSize: 11, lineHeight: 15, minWidth: 18, textAlign: 'center', borderRadius: 9, overflow: 'hidden', paddingHorizontal: 4 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.25)', paddingVertical: 6, paddingHorizontal: 10 },
  emptyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  discard: { width: 38, height: 48, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(0,0,0,0.18)', alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', right: -5, bottom: -5, minWidth: 16, textAlign: 'center', fontSize: 9, color: '#fff', fontWeight: '800', backgroundColor: colors.cardAlt, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 3 },
  tile: { borderRadius: 5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', boxShadow: '0 2px 3px rgba(0,0,0,0.35)' },
  wild: { borderColor: colors.gold, borderWidth: 2 },
  num: { fontFamily: fonts.display },
  pip: { borderRadius: 99, marginTop: -1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6 },
  status: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 },
  timer: { color: colors.textDim, fontFamily: fonts.display, fontSize: 15, lineHeight: 19 },
  note: { color: colors.pink, fontSize: 12 },
  winHand: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, rowGap: 6, justifyContent: 'center' },
  meld: { flexDirection: 'row', gap: 1 },
  rack: { borderRadius: 12, paddingVertical: 6, paddingHorizontal: 4, gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', boxShadow: '0 6px 14px rgba(0,0,0,0.4)' },
  rackRow: { flexDirection: 'row', justifyContent: 'center', gap: GAP, borderBottomWidth: 2, borderColor: 'rgba(0,0,0,0.25)', paddingBottom: 2 },
  slot: { width: TW, height: TH, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.12)' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  actionPrimary: { backgroundColor: semantic.action, borderColor: semantic.actionEdge },
  actionText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
