// The room's stage (boards, the shared screen, the mics) over its Balkon bar and chat: the room's top part
// (lib/room-split). The stage doesn't scroll: its mics are sized (lib/seat-fit) for the height the chat leaves them
// in the room as it is with no keyboard up (`box`, from the room's steady height), and the stage is exactly as tall
// as they are, so the chat takes the rest and no empty band opens between them. When even the smallest faces don't
// fit, the chat gives way, down to its least height; only past that (a small phone with many boards on) does the
// stage scroll. A drag of the chat's handle redraws only this part, not the room.
// A board or banner that comes over the mics (music, a poll, a PK's board and the points under the names) adds to the
// stage and the mics keep their sizes: the chat gives way for it. Only when the chat is down to two whole messages
// (lib/room-split CHAT_ROOM) do the faces get smaller.
// The stage's height is a number worked out from the room, never what is left over: a keyboard (the room's own or a
// sheet's), the emoji panel, a note over the controls or the chat itself can't shrink it, cut it or move it. The
// emoji panel (`overlay`) lies over the chat, under the Balkon bar, never over it.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutAnimation, ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { STAGE_PAD, fitMics, stageHeight } from '@/lib/room-split';
import { easedChange, type Fitted } from '@/lib/seat-fit';
import { useSettings } from '@/store';

/** A real change of the mics' sizes (a banner came or went, another layout) glides into place. */
const GLIDE = { duration: 260, update: { type: LayoutAnimation.Types.easeInEaseOut } };

/**
 * The stage reaches this far up into the header's lower padding: the first row's host frame and crown rise above the
 * seat and would be cut by the scroll view's edge. The seats themselves stay where they were (the same top padding).
 */
const HEADROOM = 8;

const chatInFlow: ViewStyle = { flex: 1, minHeight: 0 };
/** Three of the chat's short typing lines (17 px each) over the lower mics. */
const chatOverMics: ViewStyle = { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64, backgroundColor: 'rgba(12,8,20,0.88)', zIndex: 5 };

const same = (a: Fitted | null, b: Fitted) => !!a && a.face === b.face && a.cols === b.cols && a.height === b.height && a.slot === b.slot && a.host === b.host;

export function FitStage({
  fit,
  calm,
  pkTop,
  box: steadyBox,
  floor = 0,
  guess,
  top,
  seats,
  balcony,
  chat,
  overlay,
  typing = false,
  onLine,
  onTouchStart,
}: {
  /**
   * Sizes the mics for a height; with `like`, in its columns and with faces at most its size. Null: they aren't
   * fitted (the mic strip, a team PK) and the stage is as tall as what it holds.
   */
  fit: ((height: number, like?: Fitted) => Fitted) | null;
  /** While a PK is on: the sizes the mics have without it (no board, no points under the names). They keep them. */
  calm?: ((height: number) => Fitted) | null;
  /** The PK's board, under the other boards. Its height, like every board's, is the chat's to give, not the mics'. */
  pkTop?: ReactNode;
  /**
   * The height the stage, the Balkon bar and the chat share with no keyboard up (lib/room-split steadyBox). 0 until
   * the room is measured: then this part's own height stands in for the first frames.
   */
  box: number;
  /**
   * A stage that isn't fitted (the strip, a team PK's arena) leaves the chat its chosen height and is never made
   * shorter than this while it holds that much.
   */
  floor?: number;
  /** The mics' height before anything is measured (the first frame). */
  guess: number;
  /** Boards and banners above the mics. */
  top: ReactNode;
  seats: (fit: Fitted | null) => ReactNode;
  /** The Balkon bar under the stage: the line the bottom part starts at. */
  balcony: ReactNode;
  /** The chat; it says how tall the person chose it (its basis): the stage leaves it at least that. */
  chat: (onBasis: (px: number) => void) => ReactNode;
  /** A panel opened from the bottom (the emoji panel): it lies over the chat, from the Balkon line down. */
  overlay?: ReactNode;
  /** The room's own keyboard is up: on a short phone the last lines of the chat then lie over the lower mics. */
  typing?: boolean;
  /** The Balkon line: the stage and the Balkon bar's height, from this part's top. */
  onLine?: (px: number) => void;
  onTouchStart?: () => void;
}) {
  // This part as laid out (for the first frames), the stage as drawn, the Balkon bar, the boards, the mics as drawn,
  // the chat's basis.
  const [own, setOwn] = useState(0);
  const [stageH, setStageH] = useState(0);
  const [bar, setBar] = useState(0);
  const [topH, setTopH] = useState(0);
  const [drawn, setDrawn] = useState(0);
  const [basis, setBasis] = useState(-1);
  const measure = (set: (n: number) => void) => (e: LayoutChangeEvent) => set(Math.round(e.nativeEvent.layout.height));

  const box = steadyBox > 0 ? steadyBox : own;
  const known = box > 0 && basis >= 0;
  // The mics keep the sizes they have in the room with no boards and no PK; the boards take from the chat.
  const next = !fit ? null : !known ? fit(guess) : fitMics(fit, calm, box, bar, basis, topH);
  // The sizes the mics are drawn with, replaced only when they change, so a drag of the chat's handle doesn't draw
  // every mic again for every pixel.
  const { reduceMotion } = useSettings();
  const [shown, setShown] = useState(next);
  if (next && !same(shown, next)) {
    if (shown && !reduceMotion && easedChange(shown, next)) LayoutAnimation.configureNext(GLIDE);
    setShown(next);
  }
  const fitted = fit ? (shown ?? next) : null;
  const seatsNode = useMemo(() => seats(fitted), [seats, fitted]);
  const chatNode = useMemo(() => chat((px) => setBasis(Math.round(px))), [chat]);

  // What the stage holds: the boards and the mics (as fitted, or as drawn when they are taller or not fitted).
  const holds = topH + Math.max(fitted?.height ?? 0, drawn) + STAGE_PAD;
  const height = known && (fitted || drawn > 0) ? (fitted ? stageHeight(holds, box, bar) : stageHeight(holds, box, bar, basis, floor)) : null;
  const style: StyleProp<ViewStyle> = height !== null ? { height: height + HEADROOM, marginTop: -HEADROOM, flexGrow: 0, flexShrink: 0 } : { marginTop: -HEADROOM, flexGrow: 0, flexShrink: 1 };
  const line = stageH > 0 ? stageH - HEADROOM + bar : 0;
  // Mics hidden under the Balkon bar: the scroll bar stays in sight, so people can tell the stage scrolls.
  const scrolls = height !== null && holds > height;
  // Typing on a short phone: the keyboard leaves the chat no line under the Balkon bar. The mics don't move, so the
  // chat's last lines lie over their lower part, and nothing of the stage shows through the field's buttons.
  const squeezed = typing && own > 0 && own - line < 60;
  useEffect(() => {
    if (line > 0) onLine?.(line);
  }, [line, onLine]);
  return (
    <View style={[{ flex: 1 }, squeezed && { overflow: 'hidden' }]} onLayout={measure(setOwn)}>
      <ScrollView style={style} onLayout={measure(setStageH)} onTouchStart={onTouchStart} contentContainerStyle={{ paddingTop: HEADROOM, paddingBottom: STAGE_PAD, flexGrow: 1 }} showsVerticalScrollIndicator={scrolls} persistentScrollbar={scrolls} alwaysBounceVertical={false}>
        <View onLayout={measure(setTopH)}>
          {top}
          {pkTop}
        </View>
        {/* Centred when the stage is taller than they are; measured as they are, not as the room around them. */}
        <View style={{ flexGrow: 1, justifyContent: 'center' }}>
          <View onLayout={measure(setDrawn)}>{seatsNode}</View>
        </View>
      </ScrollView>
      <View onLayout={measure(setBar)}>{balcony}</View>
      {/* Always this wrapper, so the chat keeps its lists and reading position when it moves over the mics. */}
      <View style={squeezed ? chatOverMics : chatInFlow}>{chatNode}</View>
      {overlay ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: line }}>{overlay}</View> : null}
    </View>
  );
}
