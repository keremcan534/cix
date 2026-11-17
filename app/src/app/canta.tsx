// Çantam (docs/CANTA.md): everything I own, wherever it came from (Çarşı, a staff gift, an event I attended, a task, a
// level reached), in tabs: the free gifts from rewards (sent from a room's gift panel), frames, entry effects with the
// rides, chat bubbles and voice waves. Each item says how long it lasts and where it came from, and "Kullan" wears it
// in the same slots as Çarşı (an entry effect and a ride together). Live: the server's list (lib/live/bag), read each
// time the screen comes to the front, which also brings the level rewards I've reached; the demo shows what this
// phone bought.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GiftArt } from '@/components/GiftArt';
import { GlossButton, hueAt } from '@/components/fx/float';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, PressableScale, glassChipOf } from '@/components/fx/surface';
import { voiceOf } from '@/components/room/voice-wave';
import { ItemPreview, Shelf } from '@/components/store-item';
import { Text } from '@/components/text';
import { Header } from '@/components/ui';
import { cosmeticById, type Cosmetic } from '@/data/catalog';
import { BAG_TABS, sourceText, termText, type BagItem, type BagTab } from '@/lib/bag-core';
import { liveMode } from '@/lib/live';
import { refreshBackpack, useBackpack } from '@/lib/live/backpack';
import { useBag } from '@/lib/live/bag';
import { giftById } from '@/lib/live/catalog-live';
import { useApp } from '@/store';
import { fonts, makeStyles, useTheme } from '@/theme';

type Tab = 'gift' | BagTab;
const TABS: { key: Tab; label: string }[] = [{ key: 'gift', label: 'Hediyeler' }, ...BAG_TABS.map((x) => ({ key: x.key, label: x.label }))];
const EMPTY: Record<Tab, string> = {
  gift: 'Görevlerden ve ödüllerden gelen hediyeler burada durur.',
  frame: 'Henüz çerçeven yok.',
  entry: 'Henüz giriş efektin ya da binek yok.',
  bubble: 'Henüz sohbet balonun yok.',
  wave: 'Henüz ses dalgan yok.',
};

export default function BagScreen() {
  const { inventory, equipped, equip, me, settings } = useApp();
  const live = liveMode();
  const [tab, setTab] = useState<Tab>('frame');
  const bag = useBag(live);
  const gifts = useBackpack(live && tab === 'gift');
  const t = useTheme();
  const styles = useStyles();
  const kinds: readonly string[] = BAG_TABS.find((x) => x.key === tab)?.kinds ?? [];
  // Live: the server's items with their days and where they came from; demo: what this phone bought.
  const owned: BagItem[] = live ? (bag?.items ?? []) : [...inventory].map((sku) => ({ sku, kind: cosmeticById(sku)?.kind ?? '', until: null, source: 'shop' }));
  const rows = owned
    .filter((x) => kinds.includes(x.kind))
    .map((x) => ({ x, c: cosmeticById(x.sku) }))
    .filter((r): r is { x: BagItem; c: Cosmetic } => !!r.c);
  // Days left by the server's time of the read (the phone's clock may be off); the opening's time until then.
  const [opened] = useState(() => Date.now());
  const now = bag?.at ?? opened;
  const waiting = live && (tab === 'gift' ? gifts === null : bag === null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Backdrop scene={SCENES.store} />
      <Header title="Çantam" />
      <View style={styles.tabTrack}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, padding: 4 }}>
          {TABS.map((k) => (
            <Pressable
              key={k.key}
              onPress={() => {
                setTab(k.key);
                if (k.key === 'gift') void refreshBackpack();
              }}
              style={[styles.tab, tab === k.key && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k.key }}
            >
              <Text style={[styles.tabText, tab === k.key && { color: t.semantic.actionInk }]}>{k.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {tab === 'gift' && <Text style={styles.note}>Çantandaki hediyeler bir odada, hediye panelinin Çantam rafından ücretsiz gönderilir.</Text>}
        {tab === 'entry' && <Text style={styles.note}>Bir giriş efekti ve bir binek birlikte takılır.</Text>}
        {waiting ? (
          <Text style={styles.empty}>Yükleniyor…</Text>
        ) : tab === 'gift' ? (
          (gifts?.items ?? []).filter((g) => g.count > 0).length === 0 ? (
            <Text style={styles.empty}>{EMPTY.gift}</Text>
          ) : (
            (gifts?.items ?? [])
              .filter((g) => g.count > 0)
              .map((g, i) => {
                const gift = giftById(g.giftId);
                return (
                  <Shelf key={`${g.giftId}-${g.source}`} hue={hueAt(i)}>
                    <View style={styles.giftArt}>
                      <GiftArt giftId={g.giftId} emoji={gift?.emoji ?? '🎁'} size={56} />
                    </View>
                    <Text style={styles.name} numberOfLines={2}>
                      {gift?.name ?? 'Hediye'} ×{g.count}
                    </Text>
                    <Text style={styles.source} numberOfLines={1}>
                      {g.label}
                    </Text>
                  </Shelf>
                );
              })
          )
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>{EMPTY[tab]} Çarşı’dan alabilir, etkinliklerden, görevlerden ve seviye atlayarak kazanabilirsin.</Text>
            <PressableScale onPress={() => router.push('/magaza')}>
              <GlossButton label="Çarşı’ya git" small />
            </PressableScale>
          </View>
        ) : (
          rows.map(({ x, c }, i) => {
            const on = equipped[c.kind] === c.id;
            return (
              <Shelf key={c.id} hue={c.color?.[0] ?? hueAt(i)} on={on}>
                <ItemPreview item={c} avatar={me.avatar} voice={voiceOf(me.gender, me.showGender !== false)} still={settings.reduceMotion} />
                <Text style={styles.name} numberOfLines={2}>
                  {c.name}
                </Text>
                <Text style={styles.meta}>
                  {c.kind === 'ride' ? 'Binek · ' : ''}
                  {/* The demo keeps no dates: the item's term as Çarşı shows it. */}
                  {live ? termText(x.until, now) : c.days ? `${c.days} gün` : 'Kalıcı'}
                </Text>
                <Text style={styles.source} numberOfLines={1}>
                  {sourceText(x)}
                </Text>
                <View style={styles.cta}>
                  <PressableScale onPress={() => equip(on ? null : c.id, c.kind)} accessibilityLabel={`${c.name} ${on ? 'çıkar' : 'kullan'}`}>
                    <GlossButton label={on ? 'Çıkar' : 'Kullan'} tone={on ? 'locked' : 'action'} small />
                  </PressableScale>
                </View>
              </Shelf>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  tabTrack: { marginHorizontal: 16, marginBottom: 12, borderRadius: 999, overflow: 'hidden', ...glassChipOf(t) },
  tab: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999 },
  tabActive: { backgroundColor: t.semantic.action, boxShadow: '0 3px 12px rgba(255,95,162,0.4)' },
  tabText: { color: t.colors.textDim, fontFamily: fonts.displayBold, fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, paddingHorizontal: 16, paddingBottom: 30 },
  note: { width: '100%', color: t.colors.textDim, fontSize: 12, textAlign: 'center' },
  name: { color: t.colors.text, fontFamily: fonts.display, fontSize: 16, lineHeight: 21, textAlign: 'center' },
  meta: { color: t.colors.textDim, fontSize: 12 },
  source: { color: t.colors.primaryText, fontSize: 11, fontWeight: '700' },
  cta: { marginTop: 'auto' },
  giftArt: { height: 104, justifyContent: 'center', alignItems: 'center' },
  emptyBox: { width: '100%', alignItems: 'center', gap: 12, paddingTop: 24 },
  empty: { width: '100%', color: t.colors.textDim, fontSize: 14, textAlign: 'center', paddingTop: 12 },
}));
