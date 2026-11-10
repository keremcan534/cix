// Oda Süslemesi (the picture behind the room's stage: Ücretsiz, Ücretli, Özel) and Oda Kapağı (the picture on the
// room's card in lists), opened from Oda Ayarları and from the room card. They are two things: choosing one never
// changes the other. A server room's are kept, charged and shown to everyone by the server (lib/live/room-decor);
// my room in the demo keeps the same in its own state and spends the demo's coins (lib/room-decor). Both give the
// screens one shape (api.RoomDecor), so the two builds look the same.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon3D } from '@/components/Icon3D';
import { Photo } from '@/components/photo';
import { ROOM_BG_ART, roomBgSource, themeStagePhoto } from '@/components/room/stage-backdrop';
import { Text } from '@/components/text';
import { ROOM_BACKGROUNDS, ROOM_BG_CUSTOM, ROOM_BG_SIZE, ROOM_COVER_SIZE, type RoomBackground, type RoomTheme } from '@/data/catalog';
import { showAlert } from '@/lib/alert';
import type { RoomDecor } from '@/lib/api';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { message } from '@/lib/live';
import type { PickedImage } from '@/lib/live/profile';
import * as server from '@/lib/live/room-decor';
import {
  DEMO_ROOM_COVER,
  backgroundName,
  daysLeft,
  demoBackground,
  demoBuy,
  demoDecorView,
  demoPick,
  demoPickFree,
  demoRemoveCustom,
  demoSetCustom,
  uploadedDemoCover,
  type DemoChange,
} from '@/lib/room-decor';
import { pickRoomPicture } from '@/lib/room-picture';
import { useApp } from '@/store';
import { colors } from '@/theme';

export type LookScreen = 'decor' | 'cover' | null;
/** What the room screen, Oda Ayarları and the room card need of Oda Süslemesi and Oda Kapağı. */
export type RoomLook = {
  /** This room has them at all: my own room in the demo, or a server room. */
  available: boolean;
  /** I may change them: the owner or a Süper Yönetici (the rule the room's name has). */
  canEdit: boolean;
  /** What the stage draws now (null: the theme's stage), and the free background under a paid one. */
  stage: RoomBackground | null;
  freeId: string | null;
  /** The settings rows' values and the picture of what the stage draws. */
  decorLabel: string;
  coverLabel: string;
  thumb: ImageSourcePropType;
  /** The two screens, rendered inside the caller's own Modal so they open on top of it. */
  render: (open: LookScreen, close: () => void) => ReactNode;
};

type Ctl = {
  view: RoomDecor | null;
  error: string | null;
  busy: boolean;
  theme: RoomTheme;
  /** The kind of what the stage draws now (known from the room itself, before the settings are read). */
  kind: RoomBackground['kind'];
  /** What the room's card shows now (the uploaded cover or what the lists fall back to). */
  cover: string;
  seed: string;
  reload: () => void;
  pickFree: (bgId: string | null) => void;
  pickOwned: (pick: string) => void;
  buy: (sku: string, price: number) => void;
  /** Lets the person choose a picture, cut to the stage's shape; null when they backed out or it failed. */
  choose: (size: { width: number; height: number }) => Promise<PickedImage | null>;
  useCustom: (img: PickedImage, price: number, done: () => void) => void;
  removeCustom: () => void;
  setCover: (img: PickedImage | null) => void;
};

const fmt = (n: number) => n.toLocaleString('tr-TR');
const NO_REFUND = 'Kurallara aykırı görseller kaldırılır; kaldırılan süsleme için jeton iadesi yapılmaz.';

/**
 * Oda Süslemesi and Oda Kapağı of the room on screen. `rank`: mine in a server room (3 owner, 2 Süper Yönetici);
 * `serverBackground` / `serverFreeId` / `serverCoverUrl`: what the room read says the stage draws and whether a
 * cover is uploaded. `onChanged` draws the room again after a change on this phone; `log` writes the room's log line.
 */
export function useRoomLook(o: {
  roomId: string;
  real: boolean;
  isOwn: boolean;
  rank: number;
  level: number;
  theme: RoomTheme;
  cover: string;
  serverBackground?: RoomBackground;
  serverFreeId?: string | null;
  serverCoverUrl?: string | null;
  onChanged: () => void;
  log: (what: string) => void;
}): RoomLook {
  const { coins, spendCoins, myRoom, updateMyRoom } = useApp();
  const [decor, setDecor] = useState<RoomDecor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const working = useRef(false);

  const available = o.isOwn || o.real;
  const canEdit = o.isOwn || (o.real && o.rank >= 2);
  const view = o.real ? decor : o.isOwn ? demoDecorView(myRoom.decor, { level: o.level, uploadedCover: uploadedDemoCover(myRoom.cover), now }) : null;
  const stage = o.real ? (o.serverBackground ?? null) : o.isOwn ? demoBackground(myRoom.decor, now) : null;
  const freeId = o.real ? (o.serverFreeId ?? null) : o.isOwn ? myRoom.decor.bgId : null;

  /** One change at a time; a refusal is shown, a success draws the room again. */
  const act = (what: string, run: () => Promise<RoomDecor | void>, after?: () => void) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    run()
      .then((d) => {
        if (d) setDecor(d);
        successHaptic();
        o.log(what);
        o.onChanged();
        after?.();
      })
      .catch((e: unknown) => {
        errorHaptic();
        showAlert('Kaydedilemedi', message(e));
        // What the server refused may have changed since the screen read it (a new price, an ended term).
        server.loadRoomDecor(o.roomId).then(setDecor, () => {});
      })
      .finally(() => {
        working.current = false;
        setBusy(false);
      });
  };
  /** A demo change: the demo's coins pay for it, then the room keeps it. */
  const demo = (what: string, reason: string, ch: DemoChange, after?: () => void) => {
    if (!ch.ok) return showAlert('Kaydedilemedi', ch.error);
    if (ch.price > 0) {
      if (coins < ch.price) return showAlert('Yetersiz jeton', `Bu süsleme ${fmt(ch.price)} jeton. Cüzdan’dan jeton yükleyebilirsin.`);
      // A refusal here is the daily spending limit, which says so itself.
      if (!spendCoins(ch.price, reason)) return;
    }
    updateMyRoom({ decor: ch.decor });
    setNow(Date.now());
    successHaptic();
    o.log(what);
    o.onChanged();
    after?.();
  };
  const id = o.roomId;
  /** A server room: the coins are checked here first, so a picture isn't uploaded for a purchase that can't go through. */
  const short = (price: number) => {
    if (coins >= price) return false;
    showAlert('Yetersiz jeton', `Bu süsleme ${fmt(price)} jeton. Cüzdan’dan jeton yükleyebilirsin.`);
    return true;
  };
  const ctl: Ctl = {
    view,
    error,
    busy,
    theme: o.theme,
    kind: stage?.kind ?? 'free',
    cover: o.cover,
    seed: id,
    reload: () => {
      setNow(Date.now());
      if (!o.real) return;
      setError(null);
      server.loadRoomDecor(id).then(setDecor, (e: unknown) => setError(message(e)));
    },
    pickFree: (bgId) => (o.real ? act('Oda süslemesini değiştirdi', () => server.pickFreeBackground(id, bgId)) : demo('Oda süslemesini değiştirdi', '', demoPickFree(myRoom.decor, bgId, o.level))),
    pickOwned: (pick) => (o.real ? act('Oda süslemesini değiştirdi', () => server.pickOwnedBackground(id, pick)) : demo('Oda süslemesini değiştirdi', '', demoPick(myRoom.decor, pick, Date.now()))),
    buy: (sku, price) =>
      o.real
        ? !short(price) && act('Ücretli oda süslemesi aldı', () => server.buyBackground(id, sku, price))
        : demo('Ücretli oda süslemesi aldı', `Oda süslemesi: ${backgroundName({ kind: 'paid', id: sku, url: null })}`, demoBuy(myRoom.decor, sku, Date.now())),
    choose: async (size) => {
      try {
        return await pickRoomPicture(size);
      } catch (e) {
        showAlert('Görsel kullanılamadı', message(e));
        return null;
      }
    },
    useCustom: (img, price, done) =>
      o.real
        ? // Inside a paid term the picture is only replaced: nothing to pay.
          !(daysLeft(view?.custom.until, Date.now()) === 0 && short(price)) && act('Özel oda süslemesi yükledi', async () => (await server.setCustomBackground(id, img, price)).decor, done)
        : demo('Özel oda süslemesi yükledi', `Oda süslemesi: özel görsel (${ROOM_BG_CUSTOM.days} gün)`, demoSetCustom(myRoom.decor, img.uri, Date.now()), done),
    removeCustom: () => (o.real ? act('Özel oda süslemesini kaldırdı', () => server.removeCustomBackground(id)) : demo('Özel oda süslemesini kaldırdı', '', demoRemoveCustom(myRoom.decor))),
    setCover: (img) => {
      const what = img ? 'Oda kapağını değiştirdi' : 'Oda kapağını kaldırdı';
      if (o.real)
        return act(what, async () => {
          const url = await server.setCover(id, img);
          setDecor((d) => d && { ...d, cover: { url } });
        });
      updateMyRoom({ cover: img ? img.uri : DEMO_ROOM_COVER });
      successHaptic();
      o.log(what);
      o.onChanged();
    },
  };

  return {
    available,
    canEdit,
    stage,
    freeId,
    decorLabel: backgroundName(stage),
    coverLabel: (o.real ? o.serverCoverUrl : uploadedDemoCover(myRoom.cover)) ? 'Yüklendi' : 'Varsayılan',
    thumb: roomBgSource(stage, freeId) ?? themeStagePhoto(o.theme),
    render: (open, close) => (
      <>
        <RoomDecorScreen visible={open === 'decor'} onClose={close} ctl={ctl} now={now} />
        <RoomCoverScreen visible={open === 'cover'} onClose={close} ctl={ctl} />
      </>
    ),
  };
}

// --- Shared pieces ------------------------------------------------------------------------------------------------
/** A full screen over the settings. `onShow`: each time it opens (the room's decoration is read again then). */
function Frame({ visible, onClose, onShow, title, ctl, children }: { visible: boolean; onClose: () => void; onShow: () => void; title: string; ctl: Ctl; children: (view: RoomDecor) => ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <SafeAreaView style={s.screen}>
        <View style={s.topBar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Geri">
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={s.topTitle}>{title}</Text>
          {ctl.busy && <ActivityIndicator color="#fff" />}
        </View>
        {ctl.view ? (
          children(ctl.view)
        ) : ctl.error ? (
          <View style={s.center}>
            <Text style={s.dim}>{ctl.error}</Text>
            <Btn title="Tekrar dene" onPress={ctl.reload} />
          </View>
        ) : (
          <View style={s.center}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Btn({ title, onPress, primary, danger, disabled }: { title: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[s.btn, primary && { backgroundColor: colors.primary, borderColor: colors.primary }, danger && { borderColor: colors.red }, disabled && { opacity: 0.45 }]}>
      <Text style={[s.btnText, danger && { color: colors.red }]}>{title}</Text>
    </Pressable>
  );
}

const Notice = ({ text, danger }: { text: string; danger?: boolean }) => (
  <View style={[s.notice, danger && { borderColor: colors.red }]}>
    <Ionicons name={danger ? 'alert-circle-outline' : 'information-circle-outline'} size={18} color={danger ? colors.red : colors.gold} />
    <Text style={[s.dim, { flex: 1, color: '#fff' }]}>{text}</Text>
  </View>
);

const Price = ({ price, days }: { price: number; days: number }) => (
  <View style={s.price}>
    <Icon3D name="coin" size={14} />
    <Text style={s.priceText}>
      {fmt(price)} · {days} gün
    </Text>
  </View>
);

/** A portrait tile, the stage's shape: a background's picture, or a clean placeholder until its art is in the app. */
function Tile({
  source,
  name,
  selected,
  locked,
  soon,
  onPress,
  children,
}: {
  source?: ImageSourcePropType;
  name: string;
  selected?: boolean;
  locked?: string;
  soon?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const face = (
    <>
      <View style={[s.tileArt, selected && { borderColor: colors.primaryText }]}>
        {source ? (
          <Image source={source} resizeMode="cover" style={[s.fill, !!locked && { opacity: 0.45 }]} />
        ) : (
          <LinearGradient colors={['#2B3550', '#141A2B']} style={[s.fill, s.centerBox]}>
            <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.45)" />
          </LinearGradient>
        )}
        {!!locked && (
          <View style={[s.fill, s.centerBox]}>
            <Ionicons name="lock-closed" size={20} color="#fff" />
            <Text style={s.lockText}>{locked}</Text>
          </View>
        )}
        {soon && <Text style={s.badge}>Yakında</Text>}
        {selected && (
          <View style={s.check}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        )}
      </View>
      <Text style={s.tileName} numberOfLines={1}>
        {name}
      </Text>
    </>
  );
  // A tile with its own buttons under it is not one button itself, so a screen reader reaches each of them.
  if (!onPress) {
    return (
      <View style={s.tile}>
        {face}
        {children}
      </View>
    );
  }
  return (
    <Pressable style={s.tile} onPress={onPress} accessibilityRole="button" accessibilityLabel={locked ? `${name}, kilitli, ${locked}` : name} accessibilityState={{ selected: !!selected }}>
      {face}
      {children}
    </Pressable>
  );
}

// --- Oda Süslemesi ------------------------------------------------------------------------------------------------
const TABS = [
  { id: 'free', name: 'Ücretsiz' },
  { id: 'paid', name: 'Ücretli' },
  { id: 'custom', name: 'Özel' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function RoomDecorScreen({ visible, onClose, ctl, now }: { visible: boolean; onClose: () => void; ctl: Ctl; now: number }) {
  const [tab, setTab] = useState<Tab>('free');
  // A picture chosen for Özel, shown before it is used (and paid for).
  const [draft, setDraft] = useState<PickedImage | null>(null);
  // Each time it opens: read again, on the tab of what the room shows now, without a draft left from last time.
  const onShow = () => {
    ctl.reload();
    setTab(ctl.kind);
    setDraft(null);
  };

  return (
    <Frame visible={visible} onClose={onClose} onShow={onShow} title="Oda Süslemesi" ctl={ctl}>
      {(view) => {
        const left = daysLeft(view.showing.until, now);
        return (
          <>
            <View style={s.nowRow}>
              <Image source={roomBgSource(view.showing, view.bgId) ?? themeStagePhoto(ctl.theme)} resizeMode="cover" style={s.nowArt} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.dim}>Odada şu an</Text>
                <Text style={s.h2}>{backgroundName(view.showing)}</Text>
                {left > 0 && <Text style={s.dim}>{left} gün kaldı; bitince oda ücretsiz süslemesine döner</Text>}
              </View>
            </View>
            <View style={s.tabs} accessibilityRole="tablist">
              {TABS.map((t) => (
                <Pressable key={t.id} onPress={() => setTab(t.id)} style={[s.tab, tab === t.id && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }}>
                  <Text style={[s.tabText, tab === t.id && { color: '#fff' }]}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
              {!view.canEdit && <Notice text="Oda süslemesini oda sahibi veya Süper Yönetici değiştirir." />}
              {tab === 'free' && <FreeTab view={view} ctl={ctl} />}
              {tab === 'paid' && <PaidTab view={view} ctl={ctl} now={now} />}
              {tab === 'custom' && <CustomTab view={view} ctl={ctl} now={now} draft={draft} setDraft={setDraft} />}
            </ScrollView>
          </>
        );
      }}
    </Frame>
  );
}

function FreeTab({ view, ctl }: { view: RoomDecor; ctl: Ctl }) {
  const free = view.showing.kind === 'free';
  const edit = view.canEdit && !ctl.busy;
  return (
    <>
      <View style={s.grid}>
        <Tile source={themeStagePhoto(ctl.theme)} name="Tema görünümü" selected={free && view.bgId === null} onPress={edit ? () => ctl.pickFree(null) : undefined} />
        {view.free
          .filter((f) => ROOM_BG_ART[f.id])
          .map((f) => (
            <Tile
              key={f.id}
              source={ROOM_BG_ART[f.id]}
              name={ROOM_BACKGROUNDS.find((b) => b.id === f.id)?.name ?? f.id}
              selected={free && view.bgId === f.id}
              locked={f.open ? undefined : `Lv.${f.minLevel}`}
              onPress={edit ? () => (f.open ? ctl.pickFree(f.id) : showAlert('Kilitli', `Bu süsleme Lv.${f.minLevel} odada açılır. Odan şu an Lv.${view.level}.`)) : undefined}
            />
          ))}
      </View>
      <Text style={s.small}>
        Ücretsiz süslemeler oda seviyesiyle açılır; “Tema görünümü” odanın temasının kendi sahnesidir. Ücretli ya da özel süslemenin süresi bitince oda buradaki seçimine döner
        {!free ? ` (${backgroundName({ kind: 'free', id: view.bgId, url: null })})` : ''}.
      </Text>
    </>
  );
}

function PaidTab({ view, ctl, now }: { view: RoomDecor; ctl: Ctl; now: number }) {
  // Sold here only with its picture in this app and the server selling it.
  const buyable = (sku: string, onSale: boolean) => !!ROOM_BG_ART[sku] && onSale && view.paid.on;
  const any = view.paid.items.some((it) => buyable(it.sku, it.onSale));
  return (
    <>
      {!view.paid.on && <Notice text="Ücretli süslemeler şu an satışta değil. Aldıkların süresi bitene kadar kullanılır." />}
      <View style={s.grid}>
        {view.paid.items.map((it) => {
          const left = daysLeft(it.until, now);
          const showing = view.showing.kind === 'paid' && view.showing.id === it.sku;
          const sale = buyable(it.sku, it.onSale);
          const ask = () =>
            showAlert(it.name, `${fmt(it.price)} jeton karşılığında ${it.days} gün boyunca senindir ve odada hemen görünür.`, [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Satın al', onPress: () => ctl.buy(it.sku, it.price) },
            ]);
          return (
            <Tile key={it.sku} source={ROOM_BG_ART[it.sku]} name={it.name} selected={showing} soon={!sale && left === 0}>
              {left > 0 ? <Text style={s.tileSub}>{left} gün kaldı</Text> : <Price price={it.price} days={it.days} />}
              {left > 0 && view.canEdit && <Btn title={showing ? 'Kullanılıyor' : 'Kullan'} disabled={showing || ctl.busy} onPress={() => ctl.pickOwned(it.sku)} />}
              {left === 0 && sale && view.owner && <Btn title="Satın al" primary disabled={ctl.busy} onPress={ask} />}
            </Tile>
          );
        })}
      </View>
      <Text style={s.small}>
        {any
          ? `Ücretli süsleme satın alındığında odada hemen görünür ve süresi boyunca oda sahibinindir; süre bitince oda ücretsiz süslemesine döner.${view.owner ? '' : ' Satın almayı yalnızca oda sahibi yapar.'}`
          : 'Ücretli süslemelerin görselleri hazırlanıyor. Hazır olanlar burada satışa açılacak; fiyatlar şimdiden yukarıda.'}
      </Text>
    </>
  );
}

function CustomTab({ view, ctl, now, draft, setDraft }: { view: RoomDecor; ctl: Ctl; now: number; draft: PickedImage | null; setDraft: (d: PickedImage | null) => void }) {
  const c = view.custom;
  const left = daysLeft(c.until, now);
  const term = left > 0;
  const showing = view.showing.kind === 'custom';
  const picture = draft ? { uri: draft.uri } : c.url ? { uri: c.url } : null;
  const choose = async () => {
    const img = await ctl.choose(ROOM_BG_SIZE);
    if (img) setDraft(img);
  };
  const use = () => {
    if (!draft) return;
    const go = () => ctl.useCustom(draft, c.price, () => setDraft(null));
    if (term) return go();
    showAlert('Özel süsleme', `${fmt(c.price)} jeton karşılığında bu görsel ${c.days} gün boyunca odanın arka planı olur. Süre içinde ücretsiz değiştirebilir veya kaldırabilirsin. ${NO_REFUND}`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Öde ve kullan', onPress: go },
    ]);
  };
  const remove = () =>
    showAlert('Görseli kaldır', `Görselin silinir ve oda ücretsiz süslemesine döner. Süren ${left} gün daha geçerli: bu sürede yeni görseli ücretsiz yüklersin.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Kaldır', style: 'destructive', onPress: ctl.removeCustom },
    ]);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <View style={s.customArt}>
          {picture ? (
            <Image source={picture} resizeMode="cover" style={s.fill} />
          ) : (
            <LinearGradient colors={['#2B3550', '#141A2B']} style={[s.fill, s.centerBox]}>
              <Ionicons name="image-outline" size={30} color="rgba(255,255,255,0.45)" />
            </LinearGradient>
          )}
          {draft && <Text style={s.badge}>Önizleme</Text>}
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={s.h2}>Kendi görselin</Text>
          <Text style={s.dim}>
            {term ? `Özel süslemen ${left} gün daha geçerli${showing ? ' ve odada görünüyor' : ''}.` : `Kendi görselin ${c.days} gün boyunca odanın arka planı olur; odadaki herkes görür.`}
          </Text>
          {!term && <Price price={c.price} days={c.days} />}
          <Text style={s.dim}>
            Görsel {fmt(ROOM_BG_SIZE.width)} × {fmt(ROOM_BG_SIZE.height)} piksele (dikey) kırpılır.
          </Text>
          {term && view.owner && <Text style={s.dim}>Bugün {c.changesLeft} kez daha değiştirebilirsin.</Text>}
        </View>
      </View>
      {c.removed && <Notice danger text="Önceki görselin kurallara aykırı bulunduğu için kaldırıldı ve süslemenin süresi bitti. Kaldırılan süsleme için iade yapılmaz." />}
      {!c.on && !term && <Notice text="Özel süsleme şu an satışta değil." />}
      {draft ? (
        <>
          <Btn primary disabled={ctl.busy} title={term ? 'Bu görseli kullan (ücretsiz)' : `Bu görseli kullan · ${fmt(c.price)} jeton`} onPress={use} />
          <Btn disabled={ctl.busy} title="Başka görsel seç" onPress={choose} />
          <Btn disabled={ctl.busy} title="Vazgeç" onPress={() => setDraft(null)} />
        </>
      ) : (
        <>
          {view.owner && (term || c.on) && <Btn primary disabled={ctl.busy || (term && c.changesLeft === 0)} title={term ? (c.url ? 'Görseli değiştir (ücretsiz)' : 'Görsel seç (ücretsiz)') : 'Görsel seç'} onPress={choose} />}
          {view.canEdit && term && !!c.url && !showing && <Btn disabled={ctl.busy} title="Odada kullan" onPress={() => ctl.pickOwned('custom')} />}
          {view.owner && term && !!c.url && <Btn danger disabled={ctl.busy} title="Görseli kaldır" onPress={remove} />}
          {!view.owner && <Text style={s.small}>Özel görseli yalnızca oda sahibi satın alır, yükler ve kaldırır.</Text>}
        </>
      )}
      <Text style={s.small}>
        Görselin topluluk kurallarına uygun olmalı. {NO_REFUND} Süre içinde görseli günde en fazla {ROOM_BG_CUSTOM.changesPerDay} kez ücretsiz değiştirebilir, dilediğinde kaldırabilirsin. Süre bitince görsel
        silinir ve oda ücretsiz süslemesine döner.
      </Text>
    </>
  );
}

// --- Oda Kapağı ---------------------------------------------------------------------------------------------------
function RoomCoverScreen({ visible, onClose, ctl }: { visible: boolean; onClose: () => void; ctl: Ctl }) {
  return (
    <Frame visible={visible} onClose={onClose} onShow={ctl.reload} title="Oda Kapağı" ctl={ctl}>
      {(view) => {
        const uploaded = !!view.cover.url;
        const choose = async () => {
          const img = await ctl.choose(ROOM_COVER_SIZE);
          if (img) ctl.setCover(img);
        };
        return (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
            <Photo uri={view.cover.url ?? ctl.cover} kind="cover" seed={ctl.seed} style={s.cover} />
            <Text style={[s.dim, { textAlign: 'center' }]}>
              {uploaded ? 'Yüklediğin kapak' : 'Henüz kapak yüklenmedi; listelerde bu resim görünüyor'}
            </Text>
            <Text style={s.dim}>
              Kapak, odanın Odalar listesinde, oda kartında ve Mesajlar’da görünen resmidir. Oda süslemesinden (odanın arka planı) ayrıdır: biri değişince diğeri değişmez.
            </Text>
            <Text style={s.dim}>
              Görsel {ROOM_COVER_SIZE.width} × {ROOM_COVER_SIZE.height} piksele (kare) kırpılır. Ücretsizdir.
            </Text>
            {view.canEdit ? (
              <>
                <Btn primary disabled={ctl.busy} title={uploaded ? 'Kapağı değiştir' : 'Görsel seç'} onPress={choose} />
                {uploaded && (
                  <Btn
                    danger
                    disabled={ctl.busy}
                    title="Kapağı kaldır"
                    onPress={() =>
                      showAlert('Kapağı kaldır', 'Yüklediğin kapak silinir; listelerde odanın önceki resmi görünür.', [
                        { text: 'Vazgeç', style: 'cancel' },
                        { text: 'Kaldır', style: 'destructive', onPress: () => ctl.setCover(null) },
                      ])
                    }
                  />
                )}
              </>
            ) : (
              <Notice text="Oda kapağını oda sahibi veya Süper Yönetici değiştirir." />
            )}
            <Text style={s.small}>Kapak görseli topluluk kurallarına uygun olmalı; kurallara aykırı kapaklar kaldırılır.</Text>
          </ScrollView>
        );
      }}
    </Frame>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1C1B22' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  topTitle: { color: '#fff', fontWeight: '800', fontSize: 20, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  centerBox: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  small: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  h2: { color: '#fff', fontWeight: '800', fontSize: 17 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  nowArt: { width: 45, height: 80, borderRadius: 8, backgroundColor: '#34333B' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#34333B', borderRadius: 999, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999 },
  tabOn: { backgroundColor: colors.primary },
  tabText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  // Three to a row: each tile carries half the gutter on either side.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, rowGap: 14 },
  tile: { width: '33.333%', paddingHorizontal: 5, gap: 4 },
  tileArt: { width: '100%', aspectRatio: 9 / 16, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: '#34333B' },
  tileName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tileSub: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  lockText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  badge: { position: 'absolute', top: 6, left: 6, color: '#fff', fontSize: 11, fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  btn: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10 },
  customArt: { width: 112, aspectRatio: 9 / 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#34333B' },
  cover: { width: 200, height: 200, borderRadius: 16, alignSelf: 'center', backgroundColor: '#34333B' },
});
