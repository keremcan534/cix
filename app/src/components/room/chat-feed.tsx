// Room chat area with Tümü / Hediyeler / Sohbet tabs (lib/chat-feed decides what each shows). One list per
// tab stays mounted, so switching tabs keeps each tab's own reading position and never reloads, rebuilds or
// replays anything. A reader scrolled up is never pulled down by new events; a pill offers to jump instead.
// The chat keeps the height the person chose (drag the handle above the tabs, or tap it: lib/room-chat-size);
// the stage above takes what is left, so banners and mics coming and going never make the chat jump. The tab
// at the handle's right is the room's Küçült / Büyüt: Küçült turns the mics into a short strip and the chat takes
// all the room below it; Büyüt brings the mics back to their size and the chat to the size it had.
// While typing the chat keeps only a strip above the keyboard and the mics stay in view.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, FlatList, PanResponder, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';

import { Text } from '@/components/text';
import { filterFeed, type FeedMsg, type FeedTab } from '@/lib/chat-feed';
import { CHAT_DEFAULT, CHAT_MAX, CHAT_MIN, clampChatShare, getChatShare, isLargeChat, setChatShare, toggledChatShare } from '@/lib/room-chat-size';
import { colors, semantic } from '@/theme';

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

export function ChatFeed({
  messages,
  visible,
  renderItem,
  screenHeight,
  fill,
  onLarge,
  onTouch,
}: {
  messages: FeedMsg[];
  /** filter for the Tümü tab only (personal message settings) */
  visible: (m: FeedMsg) => boolean;
  renderItem: ListRenderItem<FeedMsg>;
  /** The window height the chosen share is taken of. */
  screenHeight: number;
  /** Typing: the chat takes what the mics leave above the keyboard (at least a strip), with no handle. */
  fill: boolean;
  /** The chat became large (the mics go small) or back to normal. */
  onLarge?: (large: boolean) => void;
  /** Any touch on the chat (it is not taken from the list: scrolling still works). */
  onTouch?: () => void;
}) {
  const [tab, setTab] = useState<FeedTab>('all');
  const height = useChatHeight(screenHeight);
  // Large (Küçült): the chat grows into whatever the mic strip leaves; otherwise it keeps its chosen height.
  const [large, setLarge] = useState(() => isLargeChat(height.share));
  const told = useRef(onLarge);
  useEffect(() => {
    told.current = onLarge;
  });
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
    <Animated.View onTouchStart={onTouch} style={[{ marginHorizontal: 12 }, fill ? s.typing : large ? s.grow : { height: height.value, flexShrink: 1, minHeight: 96 }]}>
      {!fill && (
        <View>
          <Handle height={height} />
          <FoldTab height={height} />
        </View>
      )}
      <View style={[s.tabs, !fill && { paddingTop: 0 }]} accessibilityRole="tablist">
        {TABS.map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} hitSlop={{ top: 8, bottom: 8 }} style={[s.tab, tab === k && s.tabOn]} accessibilityRole="tab" aria-selected={tab === k} accessibilityLabel={`${l} mesajları`}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {TABS.map(([k]) => (
        <FeedList key={k} data={data[k]} active={tab === k} empty={EMPTY[k]} renderItem={renderItem} />
      ))}
    </Animated.View>
  );
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

/** The tab at the handle's right: Küçült (small mics, the largest chat) or Büyüt (mics and chat as they were). */
function FoldTab({ height }: { height: ChatHeight }) {
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
      <Text style={s.foldText}>{large ? 'Büyüt' : 'Küçült'}</Text>
    </Pressable>
  );
}

function FeedList({ data, active, empty, renderItem }: { data: FeedMsg[]; active: boolean; empty: string; renderItem: ListRenderItem<FeedMsg> }) {
  const ref = useRef<FlatList<FeedMsg>>(null);
  const [away, setAway] = useState(false);
  const [unread, setUnread] = useState(0);
  const [newest, setNewest] = useState(data[0]?.id);
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
          renderItem={renderItem}
          contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
          initialNumToRender={16}
          windowSize={9}
          scrollEventThrottle={100}
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
  tabs: { flexDirection: 'row', gap: 6, paddingTop: 8, paddingBottom: 4 },
  tab: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderTopColor: 'rgba(255,255,255,0.24)' },
  tabOn: { backgroundColor: semantic.action, borderColor: semantic.action, borderTopColor: '#A5F3F5', boxShadow: '0 0 12px rgba(19,217,223,0.5)' },
  tabText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  tabTextOn: { color: semantic.actionInk, fontWeight: '900' },
  hidden: { display: 'none' },
  // Typing: at least a strip of chat; it grows into whatever the mics leave above the keyboard.
  typing: { flexGrow: 1, flexShrink: 1, flexBasis: 88, minHeight: 88 },
  // Küçült: everything the mic strip leaves.
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minHeight: 120 },
  handle: { height: 22, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.38)' },
  fold: { position: 'absolute', right: 0, top: 0, height: 22, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  foldText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  empty: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 24 },
  pill: { position: 'absolute', alignSelf: 'center', bottom: 8, backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { color: semantic.actionInk, fontWeight: '900', fontSize: 13 },
});
