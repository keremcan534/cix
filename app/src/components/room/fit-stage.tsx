// The room's stage (boards, the shared screen, the mics) over its Balkon bar and chat. The stage doesn't scroll:
// its mics are sized (lib/seat-fit) for the height the chat leaves them, and the stage is exactly as tall as they
// are, so the chat takes the rest and no empty band opens between them. When even the smallest faces don't fit,
// the chat gives way, down to its least height; only past that (a small phone with many boards on) does the stage
// scroll. While typing, the mics keep their size. A drag of the chat's handle redraws only this part, not the room.
// A PK adds to the stage (its board over the mics, the points under the names) and the mics stay as they were:
// the chat gives way for it. Only when the chat is at its least do the faces get smaller.
import { useMemo, useState, type ReactNode } from 'react';
import { LayoutAnimation, ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { easedChange, type Fitted } from '@/lib/seat-fit';
import { useSettings } from '@/store';

/** A real change of the mics' sizes (a banner came or went, the emoji panel, another layout) glides into place. */
const GLIDE = { duration: 260, update: { type: LayoutAnimation.Types.easeInEaseOut } };

/** The chat's least height under the stage (chat-feed's normal minHeight). */
const CHAT_LEAST = 96;
/** Under the mics, inside the stage. */
const PAD_BOTTOM = 4;

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
  chatHidden,
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
  /** The chat is out of sight (the emoji panel is open): the stage takes its place, mics centred in it. */
  chatHidden?: boolean;
  onTouchStart?: () => void;
}) {
  // Stage + Balkon + chat together (they split it), the Balkon, the boards, the mics as drawn, the chat's basis.
  const [box, setBox] = useState(0);
  const [bar, setBar] = useState(0);
  const [topH, setTopH] = useState(0);
  const [drawn, setDrawn] = useState(0);
  const [pkH, setPkH] = useState(0);
  const [basis, setBasis] = useState(-1);
  const measure = (set: (n: number) => void) => (e: LayoutChangeEvent) => set(Math.round(e.nativeEvent.layout.height));

  const known = box > 0 && basis >= 0;
  const chatH = chatHidden ? 0 : basis;
  const least = chatHidden ? 0 : CHAT_LEAST;
  const room = box - bar - chatH - topH - PAD_BOTTOM;
  // A PK: the mics as they are without it (the board's height given back), then as much of the chat as it can
  // give (down to its least) for the board and the points.
  const next = !fit ? null : !known ? fit(guess) : calm ? fit(room + Math.max(0, chatH - least), calm(room + (pkTop ? pkH : 0))) : fit(room);
  // The sizes the mics are drawn with: kept while typing, and replaced only when they change, so a drag of the
  // chat's handle doesn't draw every mic again for every pixel.
  const { reduceMotion } = useSettings();
  const [shown, setShown] = useState(next);
  if (next && !frozen && !same(shown, next)) {
    if (shown && !reduceMotion && easedChange(shown, next)) LayoutAnimation.configureNext(GLIDE);
    setShown(next);
  }
  const fitted = fit ? (shown ?? next) : null;
  const seatsNode = useMemo(() => seats(fitted), [seats, fitted]);
  const chatNode = useMemo(() => chat((px) => setBasis(Math.round(px))), [chat]);

  const needs = fitted && Math.max(0, Math.min(topH + Math.max(fitted.height, drawn) + PAD_BOTTOM, box - bar - least));
  const style: StyleProp<ViewStyle> = !fitted
    ? freeStyle
    : frozen || !known
      ? { flexGrow: 0, flexShrink: 1 }
      : chatHidden
        ? { minHeight: needs || 0, flexGrow: 1, flexShrink: 1 }
        : // The chat gives way first (it shrinks by its own height, the stage by a thousandth of it); the stage only
          // when the chat is at its least (for a moment, while a panel opens below before it is measured again).
          { height: needs || 0, flexGrow: 0, flexShrink: 0.001 };
  return (
    <View style={{ flex: 1 }} onLayout={measure(setBox)}>
      <ScrollView style={style} onTouchStart={onTouchStart} contentContainerStyle={{ paddingBottom: PAD_BOTTOM, flexGrow: 1 }} showsVerticalScrollIndicator={false} alwaysBounceVertical={false}>
        <View onLayout={measure(setTopH)}>
          {top}
          {!!pkTop && <View onLayout={measure(setPkH)}>{pkTop}</View>}
        </View>
        {/* Centred when the stage is taller than they are (the chat out of sight); measured as they are, not as the room around them. */}
        <View style={{ flexGrow: 1, justifyContent: 'center' }}>
          <View onLayout={measure(setDrawn)}>{seatsNode}</View>
        </View>
      </ScrollView>
      <View onLayout={measure(setBar)}>{balcony}</View>
      {chatNode}
    </View>
  );
}
