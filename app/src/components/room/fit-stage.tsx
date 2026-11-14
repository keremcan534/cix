// The room's stage (boards, the shared screen, the mics) over its Balkon bar and chat. The stage doesn't scroll:
// its mics are sized (lib/seat-fit) for the height the chat leaves them, and the stage is exactly as tall as they
// are, so the chat takes the rest and no empty band opens between them. When even the smallest faces don't fit,
// the chat gives way, down to its least height; only past that (a small phone with many boards on) does the stage
// scroll. While typing, the mics keep their size. A drag of the chat's handle redraws only this part, not the room.
// A PK adds to the stage (its board over the mics, the points under the names) and the mics stay as they were:
// the chat gives way for it. Only when the chat is at its least do the faces get smaller.
// A panel opened from the bottom (the emoji panel: `overlay`) lies over the chat, in the chat's place: the mics keep
// their sizes and places, nothing of the stage moves. So does the keyboard (`frozen`), also as it goes away.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutAnimation, ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { easedChange, type Fitted } from '@/lib/seat-fit';
import { useSettings } from '@/store';

/** A real change of the mics' sizes (a banner came or went, another layout) glides into place. */
const GLIDE = { duration: 260, update: { type: LayoutAnimation.Types.easeInEaseOut } };

/** The chat's least height under the stage (chat-feed's normal minHeight). */
const CHAT_LEAST = 96;
/** Under the mics, inside the stage. */
const PAD_BOTTOM = 4;
/**
 * A panel over the chat is at least this tall (two rows of the emoji panel); only when the chat is shorter (it gave
 * way to many mics) does it come up over the Balkon bar and the stage's lowest edge.
 */
const OVERLAY_LEAST = 210;
/** After the keyboard goes, the room is measured again: the mics wait that long before they may change. */
const SETTLE_MS = 400;

const same = (a: Fitted | null, b: Fitted) => !!a && a.face === b.face && a.cols === b.cols && a.height === b.height && a.slot === b.slot && a.host === b.host;

export function FitStage({
  fit,
  calm,
  pkTop,
  frozen,
  freeStyle,
  guess,
  top,
  seats,
  balcony,
  chat,
  overlay,
  onTouchStart,
}: {
  /**
   * Sizes the mics for a height; with `like`, in its columns and with faces at most its size. Null: they aren't
   * fitted (the mic strip, a team PK), the stage takes `freeStyle`.
   */
  fit: ((height: number, like?: Fitted) => Fitted) | null;
  /** While a PK is on: the sizes the mics have without it (no board, no points under the names). They keep them. */
  calm?: ((height: number) => Fitted) | null;
  /** The PK's board, under the other boards. Its height is the chat's to give, not the mics'. */
  pkTop?: ReactNode;
  /** Typing: the mics keep the size they had and the stage its height; the chat gives way to the keyboard. */
  frozen: boolean;
  freeStyle: StyleProp<ViewStyle>;
  /** The mics' height before anything is measured (the first frame). */
  guess: number;
  /** Boards and banners above the mics. */
  top: ReactNode;
  seats: (fit: Fitted | null) => ReactNode;
  /** The Balkon bar under the stage (nothing while typing). */
  balcony: ReactNode;
  /** The chat; it says how tall the person chose it (its basis): the stage leaves it at least that. */
  chat: (onBasis: (px: number) => void) => ReactNode;
  /** A panel opened from the bottom (the emoji panel): it lies over the chat and fills its place, the stage stays. */
  overlay?: ReactNode;
  onTouchStart?: () => void;
}) {
  // Stage + Balkon + chat together (they split it), the stage as drawn, the Balkon, the boards, the mics as drawn,
  // the chat's basis.
  const [box, setBox] = useState(0);
  const [stageH, setStageH] = useState(0);
  const [bar, setBar] = useState(0);
  const [topH, setTopH] = useState(0);
  const [drawn, setDrawn] = useState(0);
  const [pkH, setPkH] = useState(0);
  const [basis, setBasis] = useState(-1);
  const measure = (set: (n: number) => void) => (e: LayoutChangeEvent) => set(Math.round(e.nativeEvent.layout.height));

  // The keyboard goes before the room is measured again without it: for a moment the stage would be fitted to the
  // smaller room, its mics shrinking for a frame and growing back. They keep their sizes until it is measured.
  const [settling, setSettling] = useState(false);
  const [wasFrozen, setWasFrozen] = useState(frozen);
  if (frozen !== wasFrozen) {
    setWasFrozen(frozen);
    setSettling(!frozen);
  }
  useEffect(() => {
    if (!settling) return;
    const t = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(t);
  }, [settling]);
  const held = frozen || settling;

  const known = box > 0 && basis >= 0;
  const room = box - bar - basis - topH - PAD_BOTTOM;
  // A PK: the mics as they are without it (the board's height given back), then as much of the chat as it can
  // give (down to its least) for the board and the points.
  const next = !fit ? null : !known ? fit(guess) : calm ? fit(room + Math.max(0, basis - CHAT_LEAST), calm(room + (pkTop ? pkH : 0))) : fit(room);
  // The sizes the mics are drawn with: kept while typing, and replaced only when they change, so a drag of the
  // chat's handle doesn't draw every mic again for every pixel.
  const { reduceMotion } = useSettings();
  const [shown, setShown] = useState(next);
  if (next && !held && !same(shown, next)) {
    if (shown && !reduceMotion && easedChange(shown, next)) LayoutAnimation.configureNext(GLIDE);
    setShown(next);
  }
  const fitted = fit ? (shown ?? next) : null;
  const seatsNode = useMemo(() => seats(fitted), [seats, fitted]);
  const chatNode = useMemo(() => chat((px) => setBasis(Math.round(px))), [chat]);

  const needs = fitted && Math.max(0, Math.min(topH + Math.max(fitted.height, drawn) + PAD_BOTTOM, box - bar - CHAT_LEAST));
  const style: StyleProp<ViewStyle> = !fitted
    ? freeStyle
    : held || !known
      ? { flexGrow: 0, flexShrink: 1 }
      : // The chat gives way first (it shrinks by its own height, the stage by a thousandth of it); the stage only
        // when the chat is at its least (for a moment, while a banner comes in before it is measured again).
        { height: needs || 0, flexGrow: 0, flexShrink: 0.001 };
  // The panel takes the chat's place under the Balkon bar; on a short chat it comes up over the bar and the stage.
  const overlayTop = Math.max(0, Math.min(stageH + bar, box - OVERLAY_LEAST));
  return (
    <View style={{ flex: 1 }} onLayout={measure(setBox)}>
      <ScrollView style={style} onLayout={measure(setStageH)} onTouchStart={onTouchStart} contentContainerStyle={{ paddingBottom: PAD_BOTTOM, flexGrow: 1 }} showsVerticalScrollIndicator={false} alwaysBounceVertical={false}>
        <View onLayout={measure(setTopH)}>
          {top}
          {!!pkTop && <View onLayout={measure(setPkH)}>{pkTop}</View>}
        </View>
        {/* Centred when the stage is taller than they are; measured as they are, not as the room around them. */}
        <View style={{ flexGrow: 1, justifyContent: 'center' }}>
          <View onLayout={measure(setDrawn)}>{seatsNode}</View>
        </View>
      </ScrollView>
      <View onLayout={measure(setBar)}>{balcony}</View>
      {chatNode}
      {overlay ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: overlayTop }}>{overlay}</View> : null}
    </View>
  );
}
