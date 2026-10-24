import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EMOJI_PACKS } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

/** Inline emoji picker: free basics, paid packs, VIP-only set, recents. Locked packs show a preview. */
export function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  const { emojiPacks, vipLevel, recentEmojis, rememberEmoji, buyEmojiPack } = useApp();
  const [tab, setTab] = useState<string>(recentEmojis.length ? 'recent' : 'basic');
  const pack = EMOJI_PACKS.find((p) => p.id === tab);
  const unlocked = (id: string) => {
    const p = EMOJI_PACKS.find((x) => x.id === id)!;
    return emojiPacks.has(id) || (!!p.minVip && vipLevel >= p.minVip);
  };
  const list = tab === 'recent' ? recentEmojis : (pack?.emojis ?? []);
  const locked = tab !== 'recent' && !unlocked(tab);

  const pick = (e: string) => {
    if (locked) return;
    rememberEmoji(e);
    onPick(e);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 8 }}>
        {[{ id: 'recent', name: '🕘' }, ...EMOJI_PACKS].map((p) => (
          <Pressable key={p.id} onPress={() => setTab(p.id)} style={[styles.tab, tab === p.id && styles.tabActive]}>
            <Text style={styles.tabText}>
              {p.name}
              {p.id !== 'recent' && !unlocked(p.id) ? ' 🔒' : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={[styles.grid, locked && { opacity: 0.4 }]}>
        {list.length === 0 && <Text style={styles.empty}>Henüz emoji kullanmadın.</Text>}
        {list.map((e) => (
          <Pressable key={e} onPress={() => pick(e)} style={styles.cell}>
            <Text style={{ fontSize: 26 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      {locked && pack && (
        <Pressable
          style={styles.unlock}
          onPress={() => {
            if (pack.minVip && !pack.price) return router.push('/vip');
            const err = buyEmojiPack(pack.id);
            if (err) showAlert('Açılamadı', err);
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{pack.minVip && !pack.price ? `VIP ${pack.minVip} ile açılır` : `Paketi aç · 🪙 ${pack.price}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 10, paddingBottom: 6 },
  tab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tabActive: { backgroundColor: colors.cardAlt },
  tabText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6, minHeight: 60 },
  cell: { width: '12.5%', alignItems: 'center', paddingVertical: 6 },
  empty: { color: colors.textDim, padding: 12 },
  unlock: { alignSelf: 'center', backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, marginBottom: 6 },
});
