import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { EntryEffect, type EntryFx, type EntryShow } from '@/components/fx/entry';
import { PlateName, VideoFx, entryClipOf } from '@/components/fx/video-fx';
import { GlossButton, hueAt } from '@/components/fx/float';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, PressableScale, glassChipOf } from '@/components/fx/surface';
import { CoinPill, Header } from '@/components/ui';
import { COSMETIC_KINDS, shopCosmetics, type Cosmetic, type CosmeticKind } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import { useLiveCatalog } from '@/lib/live/catalog-live';
import { livePacks } from '@/lib/live/emoji-live';
import { useApp } from '@/store';
import { ItemPreview, Shelf } from '@/components/store-item';
import { FramePreviewSheet } from '@/components/frame-preview';
import { fonts, makeStyles, useTheme } from '@/theme';
import { Icon3D } from '@/components/Icon3D';
import { EMOJI_PACKS_ICON, StickerArt } from '@/components/ReactionArt';
import { STORE_TAB_ART, storeArtOf } from '@/components/StoreArt';
import { voiceOf } from '@/components/room/voice-wave';

type Tab = CosmeticKind | 'emoji';

export default function StoreScreen() {
  const { coins, inventory, equipped, buyCosmetic, equip, packUnlocked, buyEmojiPack, vipLevel, settings, me } = useApp();
  // The sticker packs as Yönetim › Emojiler has them now (name, price, VIP level, order, the admins' own).
  const stickerPacks = livePacks(useLiveCatalog());
  const [tab, setTab] = useState<Tab>('frame');
  const [preview, setPreview] = useState<EntryShow | null>(null);
  // Çerçeveler: the frame round my own photo, large, on a room seat and on my profile, before I buy it (components/frame-preview).
  const [frameShown, setFrameShown] = useState<string | null>(null);
  const t = useTheme();
  const styles = useStyles();
  const playPreview = (c: Cosmetic) => {
    const fx = c.kind === 'entry' ? ((c.fx as EntryFx | undefined) ?? 'vip') : 'vip';
    // The team's own entry effect (Yönetim › Mağaza): its clip and the plate my name is written on.
    const clip = c.kind === 'entry' && c.remote?.video ? { clip: c.id, plate: c.remote.plate ?? null } : {};
    setPreviewMedia(c.kind === 'entry' && !settings.reduceMotion ? entryClipOf({ fx, ...clip }) : null);
    setPreview({
      name: me.name,
      avatar: me.avatar,
      fx,
      ...clip,
      ride: c.kind === 'ride' ? c.emoji : undefined,
      rideArt: c.kind === 'ride' ? storeArtOf(c.id) : undefined,
    });
  };
  // The shop as Yönetim › Mağaza has it (names, prices, days, order, the team's own), else the app's own. An item no
  // longer sold (data/catalog `retired`) isn't shown at all, not even to someone who has it.
  // Rides are sold with the entry effects (the owner, 17 Nov): one of each can be worn, the ride crossing behind the
  // effect's banner.
  const items = shopCosmetics().filter((c) => (tab === 'entry' ? c.kind === 'entry' || c.kind === 'ride' : c.kind === tab) && !c.retired);
  // Read once per preview: a clip not on the phone yet starts downloading and the drawn banner plays this time.
  const [previewMedia, setPreviewMedia] = useState<ReturnType<typeof entryClipOf>>(null);

  // The item's button: wear or take off what I own, the VIP lock, or its price (buy, with the confirmation). The same in
  // the frame preview's sheet; `onLock`: the sheet closes before the VIP page opens.
  // Süre paketleri (Güncelleme 8): an item with other durations shows them as chips; the price and the buy follow the
  // one picked (its main term until another is picked).
  const [picked, setPicked] = useState<Record<string, number>>({});
  const durationsOf = (c: Cosmetic) => (c.days && c.plans?.length ? [{ days: c.days, price: c.price }, ...c.plans].sort((a, b) => a.days - b.days) : null);
  const chosenOf = (c: Cosmetic) => durationsOf(c)?.find((o) => o.days === picked[c.id]) ?? { days: c.days, price: c.price };
  const cta = (c: Cosmetic, onLock?: () => void) => {
    const isEquipped = equipped[c.kind] === c.id;
    if (inventory.has(c.id))
      return (
        <PressableScale hitSlop={7} onPress={() => equip(isEquipped ? null : c.id, c.kind)}>
          <GlossButton label={isEquipped ? 'Çıkar' : 'Kullan'} tone={isEquipped ? 'locked' : 'action'} small />
        </PressableScale>
      );
    if (c.minVip && vipLevel < c.minVip)
      return (
        <PressableScale
          hitSlop={7}
          onPress={() => {
            onLock?.();
            router.push('/vip');
          }}
        >
          <GlossButton label={`VIP ${c.minVip}`} tone="locked" small icon={<Ionicons name="lock-closed" size={12} color={t.dark ? '#C7D2E5' : t.colors.textDim} />} />
        </PressableScale>
      );
    return (
      <PressableScale hitSlop={7} onPress={() => buy(c)}>
        <GlossButton label={chosenOf(c).price.toLocaleString('tr-TR')} small icon={<Icon3D name="coin" size={16} />} />
      </PressableScale>
    );
  };
  // The frame the preview sheet shows, as the shop lists it now (it may have left the shelf meanwhile).
  const framePreview = frameShown ? (shopCosmetics().find((c) => c.id === frameShown && c.kind === 'frame') ?? null) : null;

  const buy = (c: Cosmetic) => {
    const o = chosenOf(c);
    showAlert(`${c.emoji} ${c.name}`, `Fiyat: ${o.price.toLocaleString('tr-TR')} jeton · Süre: ${o.days ? `${o.days} gün` : 'kalıcı'}`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Satın al',
        onPress: () => {
          const err = buyCosmetic(c.id, o.days ?? undefined);
          if (err) showAlert('Satın alınamadı', err);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Backdrop scene={SCENES.store} />
      <Header title="Çarşı" right={<CoinPill coins={coins} onPress={() => router.push('/cuzdan')} />} />
      <View style={styles.tabTrack}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, padding: 4 }}>
          {[...COSMETIC_KINDS.filter((k) => k.kind !== 'ride'), { kind: 'emoji' as const, label: 'Çıkartma paketleri', emoji: '' }].map((k) => {
            const art = k.kind === 'emoji' ? EMOJI_PACKS_ICON : STORE_TAB_ART[k.kind];
            return (
              <Pressable key={k.kind} onPress={() => setTab(k.kind)} hitSlop={{ top: 4, bottom: 4 }} style={[styles.tab, styles.tabRow, tab === k.kind && styles.tabActive]}>
                {art ? <Image source={art} style={{ width: 18, height: 18 }} /> : <Text style={styles.tabText}>{k.emoji}</Text>}
                <Text style={[styles.tabText, tab === k.kind && { color: t.semantic.actionInk }]}>{k.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {settings.effectsOff && (tab === 'entry' || tab === 'ride') && (
        <Text style={styles.warn}>Efektler ayarlardan kapalı: satın aldığın giriş efektleri sende gösterilmez, diğerleri görür.</Text>
      )}

      <ScrollView contentContainerStyle={styles.grid}>
        {tab === 'entry' && <Text style={styles.freeNote}>Binekler de burada: bir giriş efekti ve bir binek birlikte takılır.</Text>}
        {tab === 'emoji' && <Text style={styles.freeNote}>Standart emojiler herkese ücretsiz. Buradaki paketler özel çizim çıkartmalardır.</Text>}
        {tab === 'emoji'
          ? stickerPacks.filter((p) => !p.roomOnly && !p.retired && p.stickers.length > 0).map((p, i) => {
              const owned = packUnlocked(p.id);
              const hue = hueAt(i + 2);
              return (
                <Shelf key={p.id} hue={hue}>
                  <View style={styles.packPreview} accessibilityLabel={p.stickers.slice(0, 4).map((x) => x.name).join(', ')}>
                    {p.stickers.slice(0, 4).map((x) => (
                      <StickerArt key={x.id} id={x.id} size={30} />
                    ))}
                  </View>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.meta}>
                    {p.stickers.length} çıkartma · {p.animated ? 'animasyonlu · kalıcı' : p.price || p.minVip ? 'kalıcı' : 'ücretsiz'}
                  </Text>
                  {/* Pinned to the card bottom, as on the other tabs. */}
                  <View style={styles.cta}>
                    {owned ? (
                      <Text style={styles.owned}>✓ Açık</Text>
                    ) : p.minVip && !p.price ? (
                      <View>
                        <GlossButton label={`VIP ${p.minVip}`} tone="locked" small icon={<Ionicons name="lock-closed" size={12} color={t.dark ? '#C7D2E5' : t.colors.textDim} />} />
                      </View>
                    ) : (
                      <PressableScale
                        hitSlop={7}
                        onPress={() => {
                          const err = buyEmojiPack(p.id);
                          if (err) showAlert('Satın alınamadı', err);
                        }}
                      >
                        <GlossButton label={String(p.price)} small icon={<Icon3D name="coin" size={16} />} />
                      </PressableScale>
                    )}
                  </View>
                </Shelf>
              );
            })
          : items.map((c, i) => {
              const isEquipped = equipped[c.kind] === c.id;
              return (
                <Shelf key={c.id} hue={c.color?.[0] ?? hueAt(i)} on={isEquipped}>
                  {/* One height for every kind of preview, so names and durations line up across a row. */}
                  {/* A frame's picture opens its preview sheet too (round my photo, large, on a seat, on my profile). */}
                  <Pressable
                    style={styles.previewSlot}
                    disabled={c.kind !== 'frame'}
                    onPress={() => setFrameShown(c.id)}
                    accessibilityRole={c.kind === 'frame' ? 'button' : undefined}
                    accessibilityLabel={c.kind === 'frame' ? `${c.name} önizle` : undefined}
                  >
                    <ItemPreview item={c} avatar={me.avatar} voice={voiceOf(me.gender, me.showGender !== false)} still={settings.reduceMotion} />
                  </Pressable>
                  {(c.kind === 'entry' || c.kind === 'ride' || c.kind === 'frame') && (
                    <Pressable
                      onPress={() => (c.kind === 'frame' ? setFrameShown(c.id) : playPreview(c))}
                      style={styles.previewBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name} önizle`}
                    >
                      <Ionicons name={c.kind === 'frame' ? 'eye' : 'play'} size={12} color={t.colors.primaryText} />
                      <Text style={styles.previewText}>Önizle</Text>
                    </Pressable>
                  )}
                  <Text style={styles.name}>{c.name}</Text>
                  {durationsOf(c) && !inventory.has(c.id) ? (
                    <View style={styles.durations} accessibilityRole="radiogroup" accessibilityLabel="Süre">
                      {durationsOf(c)!.map((o) => {
                        const on = o.days === chosenOf(c).days;
                        return (
                          <Pressable key={o.days} onPress={() => setPicked((m) => ({ ...m, [c.id]: o.days }))} hitSlop={4} style={[styles.duration, on && styles.durationOn]} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${o.days} gün, ${o.price.toLocaleString('tr-TR')} jeton`}>
                            <Text style={[styles.durationText, on && styles.durationTextOn]}>{o.days}g</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.meta}>
                      {c.kind === 'ride' ? 'Binek · ' : ''}
                      {c.days ? `${c.days} gün` : 'Kalıcı'}
                      {c.minVip ? ` · VIP ${c.minVip}+` : ''}
                    </Text>
                  )}
                  {/* Pinned to the card bottom so prices line up when a name wraps to two lines. */}
                  <View style={styles.cta}>{cta(c)}</View>
                </Shelf>
              );
            })}
      </ScrollView>
      <Text style={styles.footer}>Kozmetik satın alımları komisyon programına dahil değildir.</Text>
      <FramePreviewSheet item={framePreview} onClose={() => setFrameShown(null)} footer={framePreview ? cta(framePreview, () => setFrameShown(null)) : undefined} />
      {preview &&
        (previewMedia ? (
          // A video entry plays its clip as in a room, with the name banner over it; the clip ends the preview.
          <VideoFx key={`${preview.clip ?? preview.fx}-video`} media={previewMedia} muted={false} onDone={() => setPreview(null)}>
            {preview.plate ? <PlateName name={preview.name} plate={preview.plate} /> : <EntryEffect show={preview} still top={140} />}
          </VideoFx>
        ) : (
          <EntryEffect key={`${preview.fx}-${preview.ride}`} show={preview} still={settings.reduceMotion} top={140} onDone={() => setPreview(null)} />
        ))}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  previewSlot: { height: 104, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 999, backgroundColor: t.dark ? 'rgba(255,95,162,0.18)' : 'rgba(208,46,120,0.11)' },
  previewText: { color: t.colors.primaryText, fontWeight: '700', fontSize: 12 },
  durations: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  duration: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: t.dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)' },
  durationOn: { backgroundColor: t.colors.primaryText, borderColor: t.colors.primaryText },
  durationText: { color: t.colors.textDim, fontSize: 11, fontWeight: '700' },
  durationTextOn: { color: '#fff' },
  tabTrack: { marginHorizontal: 16, marginBottom: 12, borderRadius: 999, overflow: 'hidden', ...glassChipOf(t) },
  tab: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999 },
  tabActive: { backgroundColor: t.semantic.action, boxShadow: '0 3px 12px rgba(255,95,162,0.4)' },
  tabText: { color: t.colors.textDim, fontFamily: fonts.displayBold, fontSize: 13, lineHeight: 18 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  warn: { color: t.colors.gold, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, paddingHorizontal: 16, paddingBottom: 30 },
  cta: { marginTop: 'auto' },
  packPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 64 },
  freeNote: { width: '100%', color: t.colors.textDim, fontSize: 12, textAlign: 'center' },
  name: { color: t.colors.text, fontFamily: fonts.display, fontSize: 16, lineHeight: 21, textAlign: 'center' },
  meta: { color: t.colors.textDim, fontSize: 12, textAlign: 'center' },
  owned: { color: t.colors.green, fontWeight: '700', paddingVertical: 7 },
  footer: { color: t.colors.textDim, fontSize: 12, textAlign: 'center', paddingBottom: 12 },
}));
