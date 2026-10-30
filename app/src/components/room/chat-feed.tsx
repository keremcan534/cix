// Room chat area with Tümü / Hediyeler / Sohbet tabs (lib/chat-feed decides what each shows). One list per
// tab stays mounted, so switching tabs keeps each tab's own reading position and never reloads, rebuilds or
// replays anything. A reader scrolled up is never pulled down by new events; a pill offers to jump instead.
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from 'react-native';

import { Text } from '@/components/text';
import { filterFeed, type FeedMsg, type FeedTab } from '@/lib/chat-feed';
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

export function ChatFeed({ messages, visible, renderItem }: { messages: FeedMsg[]; /** filter for the Tümü tab only (personal message settings) */ visible: (m: FeedMsg) => boolean; renderItem: ListRenderItem<FeedMsg> }) {
  const [tab, setTab] = useState<FeedTab>('all');
  const data = useMemo(
    () => ({
      all: filterFeed(messages, 'all').filter(visible).reverse(),
      gifts: filterFeed(messages, 'gifts').reverse(),
      chat: filterFeed(messages, 'chat').reverse(),
    }),
    [messages, visible],
  );
  return (
    <View style={{ flex: 1, marginHorizontal: 12 }}>
      <View style={s.tabs} accessibilityRole="tablist">
        {TABS.map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} hitSlop={{ top: 8, bottom: 8 }} style={[s.tab, tab === k && s.tabOn]} accessibilityRole="tab" aria-selected={tab === k} accessibilityLabel={`${l} mesajları`}>
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {TABS.map(([k]) => (
        <FeedList key={k} data={data[k]} active={tab === k} empty={EMPTY[k]} renderItem={renderItem} />
      ))}
    </View>
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
  empty: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 24 },
  pill: { position: 'absolute', alignSelf: 'center', bottom: 8, backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { color: semantic.actionInk, fontWeight: '900', fontSize: 13 },
});
