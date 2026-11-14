// Yönetim › Hediyeler (admins): gifts added, changed, taken off, ordered and deleted here appear on everyone's gift
// shelves without an app update (server/api/custom-gifts.mjs, lib/live/gifts-admin, docs/HEDIYE_YONETIMI.md). The
// list is per shelf, in the order the phones show it (first on their shelf, before the compiled gifts); the editor
// takes a name, price, shelf, VIP level, emoji, an icon and a video (a ready stacked MP4, a transparent WebM / MOV, or
// an SVGA, which the server converts), shows the tile and the icon as the shelf will, and plays a video that is ready.
// Nothing here removes a background: the editor says so before anything is picked.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { VideoFx, type FxMedia } from '@/components/fx/video-fx';
import { StageBackdrop } from '@/components/room/stage-backdrop';
import { Text, TextInput } from '@/components/text';
import { Button, Header } from '@/components/ui';
import type { GiftCat } from '@/data/mock';
import { ago } from '@/lib/admin-format';
import { showAlert } from '@/lib/alert';
import { previewFx } from '@/lib/fx-videos';
import { message } from '@/lib/live';
import { refreshLiveCatalog } from '@/lib/live/catalog-live';
import {
  CATS,
  CAT_LABEL,
  FILL_LABEL,
  createGift,
  deleteGift,
  fileProblem,
  loadGiftsAdmin,
  moved,
  orderGifts,
  updateGift,
  uploadGiftFile,
  videoKindOf,
  videoLine,
  type AdminGift,
  type GiftFields,
  type GiftsAdmin,
  type PickedFile,
  type VideoFileKind,
} from '@/lib/live/gifts-admin';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { alphaVideoAvailable } from '../../../modules/similar-alpha-video';
import { Filters, ItemCard, Line, LoadState, Notice, SectionScroll, StatusPill, confirmThen, useAdmin, useLoad } from './parts';

type Shelf = 'all' | GiftCat;
type VideoChoice = { mode: 'keep' } | { mode: 'none' } | { mode: 'file'; file: PickedFile; kind: VideoFileKind; fill: number };
type Draft = {
  /** null: a new gift. */
  gift: AdminGift | null;
  name: string;
  price: string;
  cat: GiftCat;
  minSvip: number;
  emoji: string;
  enabled: boolean;
  icon: PickedFile | null;
  video: VideoChoice;
};

const fmt = (n: number) => n.toLocaleString('tr-TR');
const mb = (n: number) => (n / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const draftOf = (g: AdminGift | null): Draft =>
  g
    ? { gift: g, name: g.name, price: String(g.price), cat: g.cat, minSvip: g.minSvip || 1, emoji: g.emoji, enabled: g.enabled, icon: null, video: { mode: 'keep' } }
    : { gift: null, name: '', price: '', cat: 'hot', minSvip: 1, emoji: '', enabled: true, icon: null, video: { mode: 'none' } };
const assetOf = (a: DocumentPicker.DocumentPickerAsset): PickedFile => ({ uri: a.uri, name: a.name, size: a.size ?? null, mimeType: a.mimeType ?? null, file: a.file ?? null });

export function GiftsAdminSection() {
  const ctx = useAdmin();
  const load = useLoad(loadGiftsAdmin);
  const s = useStyles();
  const { colors } = useTheme();
  const [shelf, setShelf] = useState<Shelf>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<{ media: FxMedia; run: number } | null>(null);
  const data = load.data;
  const converting = !!data?.gifts.some((g) => g.job?.status === 'processing');
  // A conversion runs on the server: the list is read again every few seconds until it is over.
  useEffect(() => {
    if (!converting) return;
    const t = setInterval(load.reload, 4000);
    return () => clearInterval(t);
  }, [converting, load.reload]);

  const changed = (text: string) => {
    ctx.toast(text);
    load.reload();
    // This phone's own shelves follow at once (everyone else's within a few minutes).
    void refreshLiveCatalog();
  };
  const move = (gifts: AdminGift[], g: AdminGift, by: -1 | 1) => {
    const ids = moved(gifts, g.id, by);
    if (!ids) return;
    setBusy(true);
    orderGifts(ids)
      .then(() => changed('Sıra kaydedildi'))
      .catch((e: unknown) => showAlert('Sıralanamadı', message(e)))
      .finally(() => setBusy(false));
  };
  const toggle = (g: AdminGift) =>
    confirmThen(
      ctx,
      g.enabled
        ? { title: 'Raftan kaldır', message: `“${g.name}” raflardan kalksın mı? Gönderilemez; burada kalır ve yeniden açılabilir.`, confirm: 'Kaldır' }
        : { title: 'Rafa koy', message: `“${g.name}” herkesin hediye panelinde görünsün mü?`, confirm: 'Rafa koy' },
      () => updateGift(g.id, { enabled: !g.enabled }),
      () => (g.enabled ? 'Raftan kaldırıldı' : 'Rafa kondu'),
      () => void refreshLiveCatalog().then(load.reload),
    );
  const remove = (g: AdminGift) =>
    confirmThen(
      ctx,
      {
        title: 'Hediyeyi sil',
        message: `“${g.name}” raflardan ve bu listeden kalksın mı? İkonu ve videosu silinir; gönderim geçmişi kalır. Geri alınamaz.`,
        confirm: 'Sil',
        destructive: true,
      },
      () => deleteGift(g.id),
      () => 'Hediye silindi',
      () => void refreshLiveCatalog().then(load.reload),
    );
  const play = async (g: AdminGift) => {
    if (!g.video) return;
    const media = await previewFx(g.video.url, g.video.ms);
    if (media) setPlaying((p) => ({ media, run: (p?.run ?? 0) + 1 }));
    else showAlert('Oynatılamadı', 'Video indirilemedi. Bağlantını kontrol edip tekrar dene.');
  };

  if (draft && data) {
    return (
      <Editor
        key={draft.gift?.id ?? 'yeni'}
        start={draft}
        admin={data}
        onClose={() => setDraft(null)}
        onSaved={(text) => {
          setDraft(null);
          changed(text);
        }}
      />
    );
  }

  return (
    <SectionScroll load={load}>
      <Notice text="Buradan eklenen hediye uygulama güncellemesi olmadan herkesin hediye panelinde, rafının başında görünür (bu özelliği taşıyan sürümden itibaren). Fiyatı sunucu belirler; gönderim, PK, oda seviyesi ve elmaslar diğer hediyeler gibi işler." />
      <LoadState load={load}>
        {(d) => (
          <>
            {!d.storage && <Notice tone="danger" icon="cloud-offline-outline" text="Sunucuda dosya deposu açık değil: ikon ve video yüklenemez, yeni hediye eklenemez." />}
            <Button title="Yeni hediye" icon="add" disabled={!d.storage} onPress={() => setDraft(draftOf(null))} />
            <Filters value={shelf} options={[['all', 'Tümü'], ...CATS.map((c) => [c, CAT_LABEL[c]] as [GiftCat, string])]} onChange={setShelf} />
            {!d.gifts.length && <Text style={s.hint}>Henüz eklenmiş hediye yok. “Yeni hediye” ile ilkini ekle.</Text>}
            {d.gifts
              .filter((g) => shelf === 'all' || g.cat === shelf)
              .map((g) => {
                const v = videoLine(g);
                const onShelf = d.gifts.filter((x) => x.cat === g.cat);
                const i = onShelf.findIndex((x) => x.id === g.id);
                return (
                  <ItemCard
                    key={g.id}
                    title={g.name}
                    sub={`${CAT_LABEL[g.cat]} · ${i + 1}. sırada · ${fmt(g.price)} jeton${g.cat === 'privilege' ? ` · VIP ${g.minSvip}+` : ''}`}
                    pill={<StatusPill text={g.enabled ? 'Rafta' : 'Kapalı'} tone={g.enabled ? 'success' : 'neutral'} />}
                    actions={
                      <View style={s.actions}>
                        <Button title="Düzenle" icon="create-outline" small variant="tonal" disabled={busy} onPress={() => setDraft(draftOf(g))} />
                        <Button title={g.enabled ? 'Raftan kaldır' : 'Rafa koy'} small variant="ghost" disabled={busy} onPress={() => toggle(g)} />
                        <Button title="Sil" small variant="danger" disabled={busy} onPress={() => remove(g)} />
                      </View>
                    }
                  >
                    <View style={s.row}>
                      <Image source={{ uri: g.icon }} style={s.listIcon} resizeMode="contain" accessibilityIgnoresInvertColors />
                      <View style={{ flex: 1, gap: 4 }}>
                        <StatusPill text={v.text} tone={v.tone} />
                        <Text style={s.hint}>
                          {g.sent.count ? `${fmt(g.sent.count)} kez gönderildi · ${fmt(g.sent.coins)} jeton` : 'Henüz gönderilmedi'} · {ago(g.updatedAt)}
                          {g.updatedBy?.name ? ` · ${g.updatedBy.name}` : ''}
                        </Text>
                      </View>
                      <View style={s.arrows}>
                        <Pressable onPress={() => move(d.gifts, g, -1)} disabled={busy || i === 0} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${g.name} bir üste`}>
                          <Ionicons name="chevron-up" size={22} color={i === 0 ? colors.textDim : colors.text} />
                        </Pressable>
                        <Pressable onPress={() => move(d.gifts, g, 1)} disabled={busy || i === onShelf.length - 1} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${g.name} bir alta`}>
                          <Ionicons name="chevron-down" size={22} color={i === onShelf.length - 1 ? colors.textDim : colors.text} />
                        </Pressable>
                      </View>
                    </View>
                    {!!g.video && (
                      <Button title={alphaVideoAvailable ? 'Videoyu oynat' : 'Video bu cihazda oynamaz (web)'} icon="play-circle-outline" small variant="ghost" disabled={!alphaVideoAvailable} onPress={() => void play(g)} />
                    )}
                    <Line label="Kimlik" value={g.id} mono />
                  </ItemCard>
                );
              })}
          </>
        )}
      </LoadState>
      {playing && <PreviewStage media={playing.media} run={playing.run} onDone={() => setPlaying(null)} />}
    </SectionScroll>
  );
}

/** A clip over a room's stage, as the phones play it. */
function PreviewStage({ media, run, onDone }: { media: FxMedia; run: number; onDone: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <View style={{ flex: 1 }}>
        <StageBackdrop theme="chat" />
        <VideoFx key={run} media={media} muted={false} onDone={onDone} />
      </View>
    </Modal>
  );
}

function Editor({ start, admin, onClose, onSaved }: { start: Draft; admin: GiftsAdmin; onClose: () => void; onSaved: (text: string) => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const L = admin.limits;
  const [d, setD] = useState(start);
  const [step, setStep] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ media: FxMedia; run: number } | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const isNew = !d.gift;
  const price = Number(d.price.replace(/\./g, ''));
  const iconUri = d.icon?.uri ?? d.gift?.icon ?? null;

  const pickIcon = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/webp'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const f = assetOf(r.assets[0]);
    const problem = fileProblem('gifticon', f, L);
    if (problem) return showAlert('İkon seçilemedi', problem);
    set({ icon: f });
  };
  const pickVideo = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const f = assetOf(r.assets[0]);
    const kind = videoKindOf(f);
    if (!kind) return showAlert('Video seçilemedi', 'Hazır yığılmış MP4, saydam WebM / MOV ya da SVGA seç.');
    if (kind === 'svga' && !admin.svga) return showAlert('SVGA çevrilemiyor', 'Bu sunucu şu an SVGA çeviremiyor. Hazır yığılmış MP4 yükle.');
    if (kind === 'source' && !admin.convert) return showAlert('Video çevrilemiyor', 'Bu sunucu şu an video çeviremiyor. Hazır yığılmış MP4 yükle.');
    const problem = fileProblem(kind === 'stacked' ? 'giftvideo' : 'giftsource', f, L);
    if (problem) return showAlert('Video seçilemedi', problem);
    set({ video: { mode: 'file', file: f, kind, fill: L.fill } });
  };
  const playPicked = () => {
    const v = d.video;
    if (v.mode === 'file' && v.kind === 'stacked') setPlaying((p) => ({ media: { uri: v.file.uri, ms: 0 }, run: (p?.run ?? 0) + 1 }));
  };
  const playSaved = async () => {
    const v = d.gift?.video;
    const media = v ? await previewFx(v.url, v.ms) : null;
    if (media) setPlaying((p) => ({ media, run: (p?.run ?? 0) + 1 }));
    else showAlert('Oynatılamadı', 'Video indirilemedi. Bağlantını kontrol edip tekrar dene.');
  };

  const save = async () => {
    const name = d.name.replace(/\s+/g, ' ').trim();
    if (name.length < L.nameMin || name.length > L.nameMax) return showAlert('Kaydedilemedi', `Ad ${L.nameMin}–${L.nameMax} karakter olmalı.`);
    if (!Number.isSafeInteger(price) || price < 1 || price > L.priceMax) return showAlert('Kaydedilemedi', `Fiyat 1–${fmt(L.priceMax)} jeton arasında bir tam sayı olmalı.`);
    if (isNew && !d.icon) return showAlert('Kaydedilemedi', 'İkon seç.');
    try {
      setStep(d.icon ? 'İkon yükleniyor…' : 'Kaydediliyor…');
      const icon = d.icon ? await uploadGiftFile('gifticon', d.icon) : undefined;
      let video: GiftFields['video'] | undefined;
      if (d.video.mode === 'none') video = null;
      if (d.video.mode === 'file') {
        setStep(`Video yükleniyor${d.video.file.size ? ` (${mb(d.video.file.size)} MB)` : ''}…`);
        const url = await uploadGiftFile(d.video.kind === 'stacked' ? 'giftvideo' : 'giftsource', d.video.file);
        video = d.video.kind === 'stacked' ? { url, kind: 'stacked' } : { url, kind: 'source', ...(d.video.kind === 'svga' ? { fill: d.video.fill } : {}) };
      }
      setStep('Kaydediliyor…');
      const fields = { name, price, cat: d.cat, minSvip: d.cat === 'privilege' ? d.minSvip : 0, emoji: d.emoji.trim(), enabled: d.enabled };
      if (d.gift) {
        const g = d.gift;
        const patch: Partial<GiftFields> = {};
        if (fields.name !== g.name) patch.name = fields.name;
        if (fields.price !== g.price) patch.price = fields.price;
        if (fields.cat !== g.cat) patch.cat = fields.cat;
        if (fields.minSvip !== g.minSvip) patch.minSvip = fields.minSvip;
        if ((fields.emoji || '🎁') !== g.emoji) patch.emoji = fields.emoji;
        if (fields.enabled !== g.enabled) patch.enabled = fields.enabled;
        if (icon) patch.icon = icon;
        if (video !== undefined && !(video === null && !g.video && !g.job)) patch.video = video;
        if (!Object.keys(patch).length) return onClose();
        await updateGift(g.id, patch);
      } else {
        await createGift({ ...fields, icon: icon!, video: video ?? null });
      }
      onSaved(video && video.kind === 'source' ? 'Kaydedildi; video sunucuda çevriliyor' : isNew ? 'Hediye eklendi' : 'Kaydedildi');
    } catch (e) {
      showAlert('Kaydedilemedi', message(e));
    } finally {
      setStep(null);
    }
  };

  const tilePrice = Number.isSafeInteger(price) && price > 0 ? fmt(price) : '—';
  return (
    <View style={{ flex: 1 }}>
      <Header title={isNew ? 'Yeni hediye' : d.gift!.name} onBack={onClose} />
      <SectionScroll load={{ refreshing: false, refresh: () => {} }}>
        <Text style={s.label}>Ad</Text>
        <TextInput value={d.name} onChangeText={(name) => set({ name })} maxLength={L.nameMax} placeholder="Ör. Altın Yıldız" placeholderTextColor={colors.textDim} style={s.input} accessibilityLabel="Ad" />
        <Text style={s.label}>Fiyat (jeton)</Text>
        <TextInput value={d.price} onChangeText={(p) => set({ price: p.replace(/[^\d]/g, '') })} keyboardType="number-pad" maxLength={7} placeholder="Ör. 9999" placeholderTextColor={colors.textDim} style={s.input} accessibilityLabel="Fiyat" />
        <Text style={s.hint}>1–{fmt(L.priceMax)} jeton. Değişiklik yeni gönderimlerden itibaren geçer.</Text>
        <Text style={s.label}>Raf</Text>
        <Filters value={d.cat} options={CATS.map((c) => [c, CAT_LABEL[c]] as [GiftCat, string])} onChange={(cat) => set({ cat })} />
        {d.cat === 'privilege' && (
          <>
            <Text style={s.label}>En düşük VIP seviyesi</Text>
            <Filters
              value={String(d.minSvip)}
              options={Array.from({ length: L.svipMax }, (_, i) => [String(i + 1), `VIP ${i + 1}`] as [string, string])}
              onChange={(v) => set({ minSvip: Number(v) })}
            />
          </>
        )}
        <Text style={s.label}>Emoji (isteğe bağlı)</Text>
        <TextInput value={d.emoji} onChangeText={(emoji) => set({ emoji })} maxLength={8} placeholder="🎁" placeholderTextColor={colors.textDim} style={[s.input, { width: 96 }]} accessibilityLabel="Emoji" />
        <Text style={s.hint}>Sohbet satırlarında ve ikon yüklenmeden önce görünür.</Text>
        <Text style={s.label}>Durum</Text>
        <Filters
          value={d.enabled ? 'on' : 'off'}
          options={[
            ['on', 'Rafta'],
            ['off', 'Kapalı'],
          ]}
          onChange={(v) => set({ enabled: v === 'on' })}
        />

        <Text style={[s.label, s.section]}>İkon</Text>
        <Text style={s.hint}>
          Saydam (arka planı silinmiş) PNG ya da WebP, kare, {L.iconMinPx}–{L.iconMaxPx} piksel (önerilen 512 × 512), en çok {mb(L.iconBytes)} MB.
        </Text>
        <Button title={iconUri ? 'İkonu değiştir' : 'İkon seç'} icon="image-outline" variant="tonal" small onPress={() => void pickIcon()} />

        <Text style={[s.label, s.section]}>Video (isteğe bağlı)</Text>
        <Notice
          tone="money"
          icon="warning-outline"
          text="Arka plan silme yapılmaz. Sunucu yalnız saydam (arka planı silinmiş) videoyu çevirir; siyah ya da renkli zeminli video reddedilir."
        />
        <Text style={s.hint}>
          • Hazır yığılmış MP4: üst yarı renk, alt yarı alfa (ör. 540 × 1920), {L.videoMinMs / 1000}–{L.videoMaxMs / 1000} sn, en çok {mb(L.videoBytes)} MB.{'\n'}• Saydam WebM (VP8/VP9 alfa) ya da ProRes 4444 .mov, en çok {mb(L.sourceBytes)} MB: sunucu {L.width} × {L.height}, {L.fps} fps, sesli videoya çevirir.{'\n'}• SVGA 2.x: sunucu aynı biçime çevirir, sesini korur; vektör şekiller ve maskeler çizilmez.{'\n'}Çevirme birkaç dakika sürebilir; bu sürede hediye videosuz (ikonu uçarak) gönderilir.
        </Text>
        {d.video.mode === 'file' ? (
          <View style={s.fileBox}>
            <Ionicons name={d.video.kind === 'svga' ? 'sparkles-outline' : 'film-outline'} size={20} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={s.fileName} numberOfLines={1}>
                {d.video.file.name}
              </Text>
              <Text style={s.hint}>
                {d.video.kind === 'stacked' ? 'Hazır yığılmış video: olduğu gibi kullanılır' : d.video.kind === 'svga' ? 'SVGA: sunucu çevirir' : 'Saydam kaynak: sunucu çevirir'}
                {d.video.file.size ? ` · ${mb(d.video.file.size)} MB` : ''}
              </Text>
            </View>
          </View>
        ) : d.video.mode === 'keep' && (d.gift?.video || d.gift?.job) ? (
          <StatusPill text={videoLine(d.gift).text} tone={videoLine(d.gift).tone} />
        ) : (
          <Text style={s.hint}>Video yok: gönderilince ikonu uçar.</Text>
        )}
        {d.video.mode === 'file' && d.video.kind === 'svga' && (
          <>
            <Text style={s.label}>Ekrandaki boyutu</Text>
            <Filters
              value={String(d.video.fill)}
              options={L.fills.map((f) => [String(f), `${FILL_LABEL[String(f)] ?? ''} (%${Math.round(f * 100)})`] as [string, string])}
              onChange={(v) => setD((x) => (x.video.mode === 'file' ? { ...x, video: { ...x.video, fill: Number(v) } } : x))}
            />
          </>
        )}
        <View style={s.actions}>
          <Button title={d.video.mode === 'file' ? 'Başka video seç' : 'Video seç'} icon="film-outline" variant="tonal" small onPress={() => void pickVideo()} />
          {(d.video.mode === 'file' || (d.video.mode === 'keep' && (d.gift?.video || d.gift?.job))) && (
            <Button title="Videoyu kaldır" variant="ghost" small onPress={() => set({ video: { mode: 'none' } })} />
          )}
          {d.video.mode === 'none' && (d.gift?.video || d.gift?.job) && <Button title="Vazgeç" variant="ghost" small onPress={() => set({ video: { mode: 'keep' } })} />}
        </View>

        <Text style={[s.label, s.section]}>Önizleme</Text>
        <View style={s.preview}>
          <View style={s.tile}>
            {iconUri ? (
              <Image source={{ uri: iconUri }} style={{ width: 42, height: 42 }} resizeMode="contain" accessibilityIgnoresInvertColors />
            ) : (
              <Text style={{ fontSize: 34, lineHeight: 42 }}>{d.emoji.trim() || '🎁'}</Text>
            )}
            <Text style={s.tileName} numberOfLines={2}>
              {d.name.trim() || 'Hediye adı'}
            </Text>
            {d.cat === 'privilege' ? (
              <Text style={s.tilePrice}>VIP {d.minSvip}</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Icon3D name="coin" size={13} />
                <Text style={s.tilePrice}>{tilePrice}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, alignItems: 'center', gap: space.xs }}>
            {iconUri ? <Image source={{ uri: iconUri }} style={{ width: 120, height: 120 }} resizeMode="contain" accessibilityIgnoresInvertColors /> : <View style={{ width: 120, height: 120 }} />}
            <Text style={s.hint}>
              {CAT_LABEL[d.cat]} rafının başında · {d.enabled ? 'rafta' : 'kapalı'}
            </Text>
          </View>
        </View>
        {d.video.mode === 'file' && d.video.kind === 'stacked' && alphaVideoAvailable && <Button title="Seçilen videoyu oynat" icon="play-circle-outline" small variant="ghost" onPress={playPicked} />}
        {d.video.mode === 'keep' && !!d.gift?.video && alphaVideoAvailable && <Button title="Videoyu oynat" icon="play-circle-outline" small variant="ghost" onPress={() => void playSaved()} />}
        {!alphaVideoAvailable && <Text style={s.hint}>Videolar bu cihazda oynamaz (web ya da eski sürüm); telefondaki yeni sürümde oynar.</Text>}

        <Button title={step ?? (isNew ? 'Hediyeyi ekle' : 'Kaydet')} icon={step ? undefined : 'checkmark'} disabled={!!step} onPress={() => void save()} style={{ marginTop: space.md }} />
        {!!step && <ActivityIndicator color={colors.text} />}
      </SectionScroll>
      {playing && <PreviewStage media={playing.media} run={playing.run} onDone={() => setPlaying(null)} />}
    </View>
  );
}

const useStyles = makeStyles(({ colors, surface }) => ({
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: space.sm },
  section: { marginTop: space.lg, fontSize: 16 },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  arrows: { alignItems: 'center', gap: 2 },
  listIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  fileBox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  fileName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: '#1A1220', borderWidth: 1, borderColor: surface.rim },
  tile: { width: 84, alignItems: 'center', gap: 2, paddingTop: space.md, paddingBottom: space.sm, paddingHorizontal: 4, borderRadius: radius.md, borderWidth: 2, borderColor: colors.primary, backgroundColor: 'rgba(255,255,255,0.03)' },
  tileName: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  tilePrice: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontVariant: ['tabular-nums'] },
}));
