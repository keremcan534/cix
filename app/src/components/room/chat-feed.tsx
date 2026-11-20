// Room chat area with Tümü / Hediyeler / Sohbet tabs (lib/chat-feed decides what each shows). One list per
// tab stays mounted, so switching tabs keeps each tab's own reading position and never reloads, rebuilds or
// replays anything. A reader scrolled up is never pulled down by new events; a pill offers to jump instead.
// The chat is at least the height the person chose (drag the handle above the tabs, or tap it: lib/room-chat-size)
// and takes whatever the mics leave too, so there is never an empty band between the mics and the chat; when the
// stage needs more (banners, boards), it scrolls before the chat gives up any of its chosen height. The button
// at the tabs' right is the room's Küçült / Büyüt: Küçült turns the mics into a short strip and the chat takes
// all the room below it; Büyüt brings the mics back to their size and the chat to the size it had.
// While typing, the keyboard takes its room from the chat alone (lib/room-split): the last lines stay in sight between
// the Balkon bar and the field, with no handle and no tabs, and the mics above never move.
// A line that names me (@bahset) and went by unseen gets a chip at the chat's top: a tap goes to it and lights it up
// (lib/mention-chip, Güncelleme 7 madde 2).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, AppState, FlatList, PanResponder, Pressable, StyleSheet, View, useWindowDimensions, type ListRenderItem, type ListViewToken } from 'react-native';

import { Text } from '@/components/text';
import { filterFeed, type FeedMsg, type FeedTab } from '@/lib/chat-feed';
import { FLASH_MS, chipLabel, mentionChip, type MentionMark } from '@/lib/mention-chip';
import { CHAT_DEFAULT, CHAT_MAX, CHAT_MIN, clampChatShare, getChatShare, isLargeChat, setChatShare, toggledChatShare } from '@/lib/room-chat-size';
import { colors, fonts, semantic } from '@/theme';

const TABS: [FeedTab, string][] = [
  ['all', 'Tümü'],
  ['gifts', 'Hediyeler'],
  ['chat', 'Sohbet'],
];
const EMPTY: Record<FeedTab, string> = {
  all: 'Henüz mesaj yok.',
  gifts: 'Henüz hediye gönderilmedi. Hediyeler burada listelenir.',
  chat: 'Henüz kimse yazmadı. İlk mesajı sen yaz!',
};
/** Distance from the newest message (px) under which the list keeps following new events. */
const FOLLOW_PX = 60;
/** How long an unseen mention is off screen before its chip shows. */
const CHIP_WAIT_MS = 700;

export function ChatFeed({
  messages,
  visible,
  renderItem,
  renderTyping,
  screenHeight,
  fill,
  onLarge,
  onBasis,
  onTouch,
  hidden,
  sideRoom = 0,
  mentions = NO_MENTIONS,
  onMentionsSeen,
  attended = true,
}: {
  messages: FeedMsg[];
  /** filter for the Tümü tab only (personal message settings) */
  visible: (m: FeedMsg) => boolean;
  renderItem: ListRenderItem<FeedMsg>;
  /** While typing: one short line per message, so a few fit over the field. */
  renderTyping?: ListRenderItem<FeedMsg>;
  /** The window height the chosen share is taken of. */
  screenHeight: number;
  /** Typing: the chat keeps what is left between the Balkon bar and the field over the keyboard, with no handle or tabs. */
  fill: boolean;
  /** The chat became large (the mics go small) or back to normal. */
  onLarge?: (large: boolean) => void;
  /** The height the person chose for the chat (px), also while dragging: the room's stage leaves it that much. */
  onBasis?: (px: number) => void;
  /** Any touch on the chat (it is not taken from the list: scrolling still works). */
  onTouch?: () => void;
  /** Out of sight but kept (its tab and messages stay): the emoji panel is open and the room's mics take its place. */
  hidden?: boolean;
  /** Room kept free on the right for a floating button over the chat, so no message runs under it. */
  sideRoom?: number;
  /** Lines that name me (@bahset) not seen yet, oldest first (lib/mention-chip): the chip goes to them. */
  mentions?: readonly MentionMark[];
  /** These lines were seen: on screen while the chat could be read, or jumped to. */
  onMentionsSeen?: (ids: string[]) => void;
  /** The chat can be read now (the room in front, no sheet over it): only then does a line on screen count as seen. */
  attended?: boolean;
}) {
  const [tab, setTab] = useState<FeedTab>('all');
  // @bahset: the lines the open tab shows now, and a jump to one of them (lib/mention-chip).
  const [onScreen, setOnScreen] = useState<ReadonlySet<string>>(NO_IDS);
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null);
  const seenTold = useRef(onMentionsSeen);
  useEffect(() => {
    seenTold.current = onMentionsSeen;
  });
  // The open list tells which lines it shows; the chat draws again for it only while a mention waits (not on every
  // scroll of a room where nobody wrote my name).
  const shownNow = useRef<ReadonlySet<string>>(NO_IDS);
  const waiting = mentions.length > 0;
  const waitingRef = useRef(waiting);
  const tellOnScreen = useCallback((ids: ReadonlySet<string>) => {
    shownNow.current = ids;
    if (waitingRef.current) setOnScreen(ids);
  }, []);
  useEffect(() => {
    waitingRef.current = waiting;
    if (waiting) setOnScreen(shownNow.current);
  }, [waiting]);
  const appActive = useAppActive();
  const reading = attended && appActive && !hidden;
  useEffect(() => {
    if (!reading) return;
    const seen = mentions.filter((m) => onScreen.has(m.id)).map((m) => m.id);
    if (seen.length) seenTold.current?.(seen);
  }, [reading, mentions, onScreen]);
  // A line that just came in is on screen a moment later (the list tells once it is drawn): the chip waits that long,
  // so it never flickers for a mention read as it arrives.
  const want = fill || hidden ? null : mentionChip(mentions, onScreen);
  const wantKey = want ? `${want.to}:${want.count}` : '';
  const [settled, setSettled] = useState('');
  useEffect(() => {
    if (!wantKey) return;
    const t = setTimeout(() => setSettled(wantKey), CHIP_WAIT_MS);
    return () => clearTimeout(t);
  }, [wantKey]);
  const chip = want && settled === wantKey ? want : null;
  const goToMention = (to: string) => {
    // A chat line is in Tümü and Sohbet, never in Hediyeler.
    if (tab === 'gifts') setTab('all');
    setJump((j) => ({ id: to, n: (j?.n ?? 0) + 1 }));
    seenTold.current?.([to]);
  };
  const height = useChatHeight(screenHeight);
  // Large (Küçült): the chat grows into whatever the mic strip leaves; otherwise it keeps its chosen height.
  const [large, setLarge] = useState(() => isLargeChat(height.share));
  const told = useRef(onLarge);
  const toldBasis = useRef(onBasis);
  useEffect(() => {
    told.current = onLarge;
    toldBasis.current = onBasis;
  });
  useEffect(() => {
    toldBasis.current?.(height.share * height.screenHeight);
    const id = height.value.addListener(({ value }) => toldBasis.current?.(value));
    return () => height.value.removeListener(id);
  }, [height]);
  useEffect(() => {
    const f = () => {
      const l = isLargeChat(height.share);
      setLarge(l);
      told.current?.(l);
    };
    height.listeners.add(f);
    return () => void height.listeners.delete(f);
  }, [height]);
  const data = useMemo(
    () => ({
      all: filterFeed(messages, 'all').filter(visible).reverse(),
      gifts: filterFeed(messages, 'gifts').reverse(),
      chat: filterFeed(messages, 'chat').reverse(),
    }),
    [messages, visible],
  );
  return (
    <Animated.View onTouchStart={onTouch} style={[{ marginHorizontal: 12 }, fill ? s.typing : large ? s.grow : { flexBasis: height.value, flexGrow: 1, flexShrink: 1, minHeight: 0 }, hidden && { display: 'none' }]}>
      {!fill && <Handle height={height} />}
      {!fill && (
        <View style={s.tabs} accessibilityRole="tablist">
          {TABS.map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} hitSlop={{ top: 2, bottom: 8 }} style={[s.tab, tab === k && s.tabOn]} accessibilityRole="tab" aria-selected={tab === k} accessibilityLabel={`${l} mesajları`}>
              <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l}</Text>
            </Pressable>
          ))}
          <FoldTab height={height} />
        </View>
      )}
      <View style={s.lists}>
        {TABS.map(([k]) => (
          <FeedList
            key={k}
            data={data[k]}
            active={tab === k}
            empty={EMPTY[k]}
            renderItem={fill && renderTyping ? renderTyping : renderItem}
            tight={fill}
            sideRoom={sideRoom}
            onScreen={tellOnScreen}
            jump={tab === k ? jump : null}
          />
        ))}
        {chip && (
          <Pressable
            onPress={() => goToMention(chip.to)}
            hitSlop={6}
            style={s.mention}
            accessibilityRole="button"
            accessibilityLabel={`${chipLabel(chip.count)}. Mesaja git`}
          >
            <Text style={s.mentionAt}>@</Text>
            <Text style={s.mentionText} numberOfLines={1}>
              {chipLabel(chip.count)}
            </Text>
            <Ionicons name="arrow-up" size={13} color="#1B1405" />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const NO_MENTIONS: readonly MentionMark[] = [];
const NO_IDS: ReadonlySet<string> = new Set();

/** The line a jump went to: lit up in gold, fading out (lib/mention-chip FLASH_MS). */
function Flash() {
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const a = Animated.timing(o, { toValue: 0, delay: FLASH_MS / 2, duration: FLASH_MS / 2, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View pointerEvents="none" style={[s.flash, { opacity: o }]} />;
}

/** Whether the app is in front (a line on screen while it is in the background was not seen). */
function useAppActive() {
  const [active, setActive] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** The chat's height as an animated value, so dragging moves it without drawing the room again. One per chat. */
class ChatHeight {
  share = getChatShare();
  /** The size Büyüt goes back to (the last one that was not large). */
  normal = isLargeChat(this.share) ? CHAT_DEFAULT : this.share;
  screenHeight: number;
  value: Animated.Value;
  listeners = new Set<() => void>();
  constructor(screenHeight: number) {
    this.screenHeight = screenHeight;
    this.value = new Animated.Value(this.share * screenHeight);
  }
  private saved(x: number) {
    this.share = setChatShare(x);
    if (!isLargeChat(this.share)) this.normal = this.share;
    this.listeners.forEach((f) => f());
  }
  resize(screenHeight: number) {
    this.screenHeight = screenHeight;
    this.value.setValue(this.share * screenHeight);
  }
  /** While dragging: `x` is the share from the drag start, not saved yet. */
  preview(x: number) {
    this.value.setValue(clampChatShare(x) * this.screenHeight);
  }
  commit(x: number) {
    this.saved(x);
    this.value.setValue(this.share * this.screenHeight);
  }
  animateTo(x: number) {
    this.saved(x);
    Animated.spring(this.value, { toValue: this.share * this.screenHeight, useNativeDriver: false, bounciness: 4 }).start();
  }
}
function useChatHeight(screenHeight: number) {
  const [h] = useState(() => new ChatHeight(screenHeight));
  useEffect(() => h.resize(screenHeight), [h, screenHeight]);
  return h;
}

/** The bar above the tabs: drag it up for a taller chat, down for more stage; a tap switches large / normal. */
function Handle({ height }: { height: ChatHeight }) {
  const [pan] = useState(() => {
    let start = 0;
    let moved = false;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start = height.share;
        moved = false;
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dy) > 4) moved = true;
        if (moved) height.preview(start - g.dy / height.screenHeight);
      },
      onPanResponderRelease: (_, g) => {
        if (moved) height.commit(start - g.dy / height.screenHeight);
        else height.animateTo(toggledChatShare(height.share));
      },
      onPanResponderTerminate: (_, g) => height.commit(start - g.dy / height.screenHeight),
    });
  });
  const step = (d: number) => height.animateTo(height.share + d);
  return (
    <View
      {...pan.panHandlers}
      style={s.handle}
      // Not further up: a touch higher than this belongs to the Balkon bar.
      hitSlop={{ top: 4, bottom: 0 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Sohbet alanının boyu. Yukarı çek: büyüt, aşağı çek: küçült, dokun: büyük ya da normal"
      accessibilityValue={{ min: Math.round(CHAT_MIN * 100), max: Math.round(CHAT_MAX * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 0.08 : -0.08)}
    >
      <View style={s.grip} />
    </View>
  );
}

/** The button at the tabs' right: Küçült (small mics, the largest chat) or Büyüt (mics and chat as they were). */
function FoldTab({ height }: { height: ChatHeight }) {
  // The narrowest phones keep the three tabs on one line: the icon alone (its label stays for screen readers).
  const iconOnly = useWindowDimensions().width < 360;
  const [large, setLarge] = useState(() => isLargeChat(height.share));
  useEffect(() => {
    const f = () => setLarge(isLargeChat(height.share));
    height.listeners.add(f);
    return () => void height.listeners.delete(f);
  }, [height]);
  return (
    <Pressable
      onPress={() => height.animateTo(large ? height.normal : CHAT_MAX)}
      hitSlop={8}
      style={s.fold}
      accessibilityRole="button"
      accessibilityLabel={large ? 'Mikrofonları büyüt' : 'Mikrofonları küçült, sohbeti genişlet'}
    >
      <Ionicons name={large ? 'expand-outline' : 'contract-outline'} size={13} color={colors.text} />
      {!iconOnly && <Text style={s.foldText}>{large ? 'Büyüt' : 'Küçült'}</Text>}
    </Pressable>
  );
}

/** A line counts as on screen when at least half of it shows. */
const VIEWABLE = { itemVisiblePercentThreshold: 50 };

function FeedList({
  data,
  active,
  empty,
  renderItem,
  tight,
  sideRoom,
  onScreen,
  jump,
}: {
  data: FeedMsg[];
  active: boolean;
  empty: string;
  renderItem: ListRenderItem<FeedMsg>;
  tight: boolean;
  sideRoom: number;
  /** The open tab's list says which lines it shows (by id), whenever that changes. */
  onScreen: (ids: ReadonlySet<string>) => void;
  /** Scroll to this line and light it up (a new `n` each time). */
  jump: { id: string; n: number } | null;
}) {
  const ref = useRef<FlatList<FeedMsg>>(null);
  const [away, setAway] = useState(false);
  const [unread, setUnread] = useState(0);
  const [newest, setNewest] = useState(data[0]?.id);
  // The lines on screen (FlatList's viewability; its callback must stay the same function), told while this tab is open.
  const shown = useRef<ReadonlySet<string>>(NO_IDS);
  const live = useRef({ active, onScreen, data });
  useEffect(() => {
    live.current = { active, onScreen, data };
  });
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    shown.current = new Set(viewableItems.map((v) => v.key));
    if (live.current.active) live.current.onScreen(shown.current);
  });
  useEffect(() => {
    if (active) live.current.onScreen(data.length ? shown.current : NO_IDS);
    // Only as the tab opens; the viewability callback tells the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  // A jump (the @bahset chip): scroll the line to the middle and light it up. The list has no fixed row heights, so a
  // line far up may need a rough scroll first (onScrollToIndexFailed), then the exact one.
  const [flash, setFlash] = useState<string | null>(null);
  const jumped = useRef(0);
  const tries = useRef(0);
  useEffect(() => {
    if (!jump || !active || jump.n === jumped.current) return;
    jumped.current = jump.n;
    const index = live.current.data.findIndex((m) => m.id === jump.id);
    if (index < 0) return;
    tries.current = 0;
    setFlash(jump.id);
    // After the tab has been drawn (the chip may have just opened Tümü).
    const go = setTimeout(() => ref.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }), 60);
    return () => clearTimeout(go);
  }, [jump, active]);
  useEffect(() => {
    if (!flash) return;
    const off = setTimeout(() => setFlash(null), FLASH_MS + 400);
    return () => clearTimeout(off);
  }, [flash]);
  // Only the newest lines, which pass the floating button, keep clear of it; the older ones use the whole width. Inside
  // its cell this margin stays on the right: Android turns both the inverted list and each cell around (scale -1).
  const drawRow = useCallback<ListRenderItem<FeedMsg>>(
    (p) => (
      <View style={p.index < 3 && sideRoom ? { marginRight: sideRoom } : undefined}>
        {/* Behind the line, so its words stay sharp. */}
        {p.item.id === flash && <Flash />}
        {renderItem(p)}
      </View>
    ),
    [renderItem, sideRoom, flash],
  );
  if (data[0]?.id !== newest) {
    // Derived transition: count what arrived while the reader was scrolled up.
    const before = data.findIndex((m) => m.id === newest);
    setNewest(data[0]?.id);
    if (away) setUnread((n) => n + (before > 0 ? before : 1));
  }
  return (
    <View style={[{ flex: 1 }, !active && s.hidden]} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      {data.length === 0 ? (
        <Text style={s.empty}>{empty}</Text>
      ) : (
        <FlatList
          ref={ref}
          data={data}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={drawRow}
          contentContainerStyle={tight ? { gap: 2, paddingVertical: 2 } : { gap: 6, paddingVertical: 4 }}
          initialNumToRender={16}
          windowSize={9}
          scrollEventThrottle={100}
          extraData={flash}
          viewabilityConfig={VIEWABLE}
          onViewableItemsChanged={onViewable}
          onScrollToIndexFailed={(info) => {
            // Not laid out yet: a rough jump by the average line height, then the exact one (a few times at most).
            if (++tries.current > 3) return;
            ref.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => ref.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 120);
          }}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: FOLLOW_PX }}
          onScroll={(e) => {
            const isAway = e.nativeEvent.contentOffset.y > FOLLOW_PX;
            if (isAway === away) return;
            setAway(isAway);
            if (!isAway) setUnread(0);
          }}
        />
      )}
      {away && unread > 0 && (
        <Pressable
          style={s.pill}
          onPress={() => {
            ref.current?.scrollToOffset({ offset: 0, animated: true });
            setUnread(0);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${unread} yeni mesaj, en yeniye git`}
        >
          <Text style={s.pillText}>↓ {unread} yeni</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  tab: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderTopColor: 'rgba(255,255,255,0.24)' },
  tabOn: { backgroundColor: semantic.action, borderColor: semantic.action, borderTopColor: '#FFC2DC', boxShadow: '0 0 12px rgba(255,95,162,0.5)' },
  tabText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  tabTextOn: { color: semantic.actionInk, fontWeight: '900' },
  hidden: { display: 'none' },
  // Typing: whatever is left between the Balkon bar and the field over the keyboard (on a short phone, a line or two).
  typing: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 },
  // Küçült: everything the mic strip leaves.
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minHeight: 0 },
  handle: { height: 12, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.38)' },
  fold: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  foldText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  empty: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 8 },
  pill: { position: 'absolute', alignSelf: 'center', bottom: 8, backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { color: semantic.actionInk, fontWeight: '900', fontSize: 13 },
  lists: { flex: 1, minHeight: 0 },
  // @bahset: the chip at the chat's top (gold, as the note and the "senden bahsetti" tag), and the lit line.
  mention: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.gold,
    borderRadius: 999,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
  },
  mentionAt: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', textAlign: 'center', lineHeight: 20, backgroundColor: '#1B1405', color: colors.gold, fontFamily: fonts.displayBold, fontSize: 12 },
  mentionText: { color: '#1B1405', fontFamily: fonts.displayBold, fontSize: 13, flexShrink: 1 },
  flash: { position: 'absolute', left: -4, right: -4, top: -2, bottom: -2, borderRadius: 12, backgroundColor: 'rgba(246,189,96,0.28)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.7)' },
});
