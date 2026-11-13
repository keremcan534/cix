// Admin: the central animation catalog (spec §7). Every change applies at once to every room, without
// an app update, because rooms read the catalog live (lib/animations). Going live needs an approved
// licence; price, activity and licence changes are written to the audit log.
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Switch, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ANIM_ART_NAMES, ANIM_CATEGORY_ART, type AnimArtName } from '@/components/fx/anim-art';
import { AnimPlay, AssetView } from '@/components/fx/anim-player';
import { GiftShowFx, showPartsReady } from '@/components/fx/gift-show';
import { SHOW_PARTS } from '@/components/fx/gift-show-art';
import { GiftArt } from '@/components/GiftArt';
import { GIFT_SHOWS, showFiles, type GiftShow } from '@/data/gift-shows';
import { GIFTS } from '@/data/mock';
import { Card, Header } from '@/components/ui';
import type { Icon3DName } from '@/components/Icon3D';
import { ANIM_CATEGORIES, DISPLAY_LABEL, FORMAT_LABEL, MOTION_LABEL, type Animation, type Asset, type DisplayType, type LicenseStatus, type Motion } from '@/data/animations';
import { resolve } from '@/data/rbac';
import { showAlert } from '@/lib/alert';
import { addAnimation, importItem, isLive, listProvider, setBusOnline, setProviderOnline, updateAnimation, useAnimations, type ProviderItem } from '@/lib/animations';
import { useApp } from '@/store';
import { ThemeScope, makeStyles, useTheme } from '@/theme';

type Tab = 'catalog' | 'gifts' | 'providers' | 'new' | 'audit';
const LICENSE_LABEL: Record<LicenseStatus, string> = { approved: 'Onaylı', pending: 'Beklemede', rejected: 'Uygun değil', expired: 'Süresi dolmuş' };
const ICONS: Icon3DName[] = ['heart', 'crown', 'coin', 'diamond', 'gift', 'trophy', 'mic', 'bolt'];

function Chips<T extends string | number>({ value, options, onChange, icons }: { value: T; options: [T, string][]; onChange: (v: T) => void; icons?: Record<string, number> }) {
  const s = useStyles();
  return (
    <View style={s.chips}>
      {options.map(([v, l]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={[s.chip, value === v && s.chipOn, icons?.[String(v)] !== undefined && s.chipRow]}>
          {icons?.[String(v)] !== undefined && <Image source={icons[String(v)]} style={s.chipIcon} />}
          <Text style={s.chipText}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function AnimationAdmin() {
  const { rbac } = useApp();
  const { catalog, providers, audit, busOnline } = useAnimations();
  const [tab, setTab] = useState<Tab>('catalog');
  const [cat, setCat] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Animation | null>(null);
  const [showPreview, setShowPreview] = useState<GiftShow | null>(null);
  const can = resolve(rbac, 'me', 'animations.manage', { type: 'platform' });
  const { colors } = useTheme();
  const s = useStyles();

  if (!can.allowed)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Header title="Animasyon kataloğu" />
        <Text style={[s.dim, { padding: 16 }]}>Bu ekran için animasyon yönetimi yetkisi gerekiyor. {can.reason}</Text>
      </SafeAreaView>
    );

  const apply = (id: string, patch: Partial<Animation>) => {
    const r = updateAnimation(id, patch);
    if (!r.ok) showAlert('Kaydedilemedi', r.reason);
  };
  const list = catalog.filter((a) => cat === 'all' || a.category_id === cat);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Animasyon kataloğu" />
      <View style={{ paddingHorizontal: 16 }}>
        <Chips
          value={tab}
          options={[
            ['catalog', `Katalog · ${catalog.length}`],
            ['gifts', `Büyük hediyeler · ${GIFT_SHOWS.length}`],
            ['providers', 'Sağlayıcılar'],
            ['new', 'Yeni ekle'],
            ['audit', 'Kayıtlar'],
          ]}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {tab === 'catalog' && (
          <>
            <Chips value={cat} options={[['all', 'Tümü'], ...ANIM_CATEGORIES.map((c) => [c.id, c.name] as [string, string])]} onChange={setCat} icons={ANIM_CATEGORY_ART} />
            {list.map((a) => (
              <Card key={a.animation_id} style={{ gap: 8 }}>
                <Pressable style={s.row} onPress={() => setOpen(open === a.animation_id ? null : a.animation_id)} accessibilityLabel={`${a.name} düzenle`}>
                  <AssetView asset={a.preview_asset} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{a.name}</Text>
                    <Text style={s.dim}>
                      {DISPLAY_LABEL[a.display_type]} · {a.is_free ? 'Ücretsiz' : `${a.coin_price.toLocaleString('tr-TR')} jeton`} · {FORMAT_LABEL[a.format]}
                      {a.provider === 'builtin' ? ' · Yerleşik' : ` · ${a.provider}${a.provider_id ? `:${a.provider_id}` : ''}`}
                    </Text>
                  </View>
                  <Text style={[s.badge, { color: isLive(a) ? colors.green : colors.textDim }]}>{isLive(a) ? 'Yayında' : a.starts_at && a.is_active ? 'Kampanya' : 'Kapalı'}</Text>
                </Pressable>
                {open === a.animation_id && (
                  <View style={{ gap: 8 }}>
                    <Text style={s.dim}>
                      {a.animation_id} · {a.duration_ms} ms · güncellendi {a.updated_at.slice(0, 16).replace('T', ' ')}
                      {a.starts_at ? ` · kampanya ${a.starts_at} → ${a.ends_at}` : ''}
                    </Text>
                    <View style={s.row}>
                      <Text style={s.label}>Yayında (aktif)</Text>
                      <Switch value={a.is_active} onValueChange={(v) => apply(a.animation_id, { is_active: v })} />
                    </View>
                    <View style={s.row}>
                      <Text style={s.label}>Ücretsiz</Text>
                      <Switch value={a.is_free} onValueChange={(v) => apply(a.animation_id, { is_free: v, coin_price: v ? 0 : Math.max(a.coin_price, 10) })} />
                    </View>
                    {!a.is_free && <PriceInput value={a.coin_price} onSave={(n) => apply(a.animation_id, { coin_price: n })} />}
                    <Text style={s.label}>Gösterim türü</Text>
                    <Chips<DisplayType> value={a.display_type} options={Object.entries(DISPLAY_LABEL) as [DisplayType, string][]} onChange={(v) => apply(a.animation_id, { display_type: v })} />
                    <Text style={s.label}>Hareket</Text>
                    <Chips<Motion> value={a.motion} options={Object.entries(MOTION_LABEL) as [Motion, string][]} onChange={(v) => apply(a.animation_id, { motion: v })} />
                    <Text style={s.label}>Kategori</Text>
                    <Chips value={a.category_id} options={ANIM_CATEGORIES.map((c) => [c.id, c.name] as [string, string])} onChange={(v) => apply(a.animation_id, { category_id: v })} />
                    <Text style={s.label}>Lisans</Text>
                    <Chips<LicenseStatus> value={a.license_status} options={Object.entries(LICENSE_LABEL) as [LicenseStatus, string][]} onChange={(v) => apply(a.animation_id, { license_status: v, ...(v !== 'approved' ? { is_active: false } : {}) })} />
                    <Text style={s.dim}>Lisans notu: {a.license_note}</Text>
                    {!['emoji', 'image', 'code'].includes(a.format) && <Text style={s.warn}>{a.format.toUpperCase()} oynatıcısı uygulamada henüz yok; odada önizleme görseli aynı hareketle gösterilir.</Text>}
                    <Pressable style={s.btn} onPress={() => setPreview(a)} accessibilityLabel={`${a.name} test oynat`}>
                      <Text style={s.btnText}>▶ Test oynat</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            ))}
          </>
        )}

        {tab === 'gifts' && (
          <>
            <Text style={s.dim}>En pahalı hediyeler odada tam ekran gösteri olarak oynar. Parçalı görseller gelene kadar hediyenin kendi resmi aynı hareketle oynar (docs/BUYUK_HEDIYELER.md).</Text>
            {GIFT_SHOWS.map((sh) => {
              const g = GIFTS.find((x) => x.id === sh.giftId);
              const files = showFiles(sh);
              const have = files.filter((f) => SHOW_PARTS[f] !== undefined).length;
              return (
                <Card key={sh.giftId} style={{ gap: 8 }}>
                  <View style={s.row}>
                    <GiftArt giftId={sh.giftId} emoji={g?.emoji ?? '🎁'} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.title}>{g?.name ?? sh.giftId}</Text>
                      <Text style={s.dim}>
                        {(g?.price ?? 0).toLocaleString('tr-TR')} jeton · {(sh.durationMs / 1000).toLocaleString('tr-TR')} sn · parça {have}/{files.length}
                      </Text>
                    </View>
                    <Text style={[s.badge, { color: showPartsReady(sh) ? colors.green : colors.textDim }]}>{showPartsReady(sh) ? 'Parçalı' : 'Tek resim'}</Text>
                  </View>
                  <Pressable style={s.btn} onPress={() => setShowPreview(sh)} accessibilityLabel={`${g?.name ?? sh.giftId} gösterisini test oynat`}>
                    <Text style={s.btnText}>▶ Test oynat</Text>
                  </Pressable>
                </Card>
              );
            })}
          </>
        )}

        {tab === 'providers' && (
          <>
            <Card style={{ gap: 6 }}>
              <View style={s.row}>
                <Text style={s.label}>Oda olay kanalı (gerçek zamanlı)</Text>
                <Switch value={busOnline} onValueChange={setBusOnline} />
              </View>
              <Text style={s.dim}>Test: kapatınca ücretli gönderim odaya iletilemez ve jeton otomatik iade edilir.</Text>
            </Card>
            {providers.map((p) => (
              <ProviderCard key={p.id} id={p.id} />
            ))}
          </>
        )}

        {tab === 'new' && <NewForm onCreated={() => setTab('catalog')} />}

        {tab === 'audit' &&
          (audit.length === 0 ? (
            <Text style={s.dim}>Henüz kayıt yok. Fiyat, yayın, lisans değişiklikleri ve içe aktarmalar burada tarih ve kişiyle listelenir.</Text>
          ) : (
            audit.map((r) => (
              <Text key={r.id} style={s.dim}>
                {r.at} · {r.actor} · {r.action} · {r.target}
                {r.before !== undefined ? ` · ${r.before} → ${r.after}` : r.after ? ` · ${r.after}` : ''}
              </Text>
            ))
          ))}
      </ScrollView>
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        {/* The stage stands in for a room, and rooms are dark in both schemes. */}
        <ThemeScope scheme="dark">
          <PreviewStage anim={preview} onClose={() => setPreview(null)} />
        </ThemeScope>
      </Modal>
      <Modal visible={!!showPreview} transparent animationType="fade" onRequestClose={() => setShowPreview(null)}>
        <ThemeScope scheme="dark">
          <GiftShowStage show={showPreview} onClose={() => setShowPreview(null)} />
        </ThemeScope>
      </Modal>
    </SafeAreaView>
  );
}

function PriceInput({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const s = useStyles();
  return (
    <View style={s.row}>
      <Text style={s.label}>Jeton fiyatı</Text>
      <TextInput value={text} onChangeText={setText} keyboardType="number-pad" style={s.input} />
      <Pressable style={s.small} onPress={() => onSave(Math.max(0, Math.floor(Number(text) || 0)))} accessibilityLabel="Fiyatı kaydet">
        <Text style={s.chipText}>Kaydet</Text>
      </Pressable>
    </View>
  );
}

function GiftShowStage({ show, onClose }: { show: GiftShow | null; onClose: () => void }) {
  const [run, setRun] = useState(0);
  const s = useStyles();
  const gift = GIFTS.find((g) => g.id === show?.giftId);
  if (!show || !gift) return null;
  return (
    <Pressable style={s.stage} onPress={onClose} accessibilityLabel="Önizlemeyi kapat">
      <GiftShowFx key={run} show={show} play={{ key: String(run), gift, fromName: 'Sen', toText: 'Oda sahibi', count: 1 }} onDone={() => setRun((n) => n + 1)} />
      <Text style={s.stageText}>{gift.name} · tekrar oynuyor · kapatmak için dokun</Text>
    </Pressable>
  );
}

function PreviewStage({ anim, onClose }: { anim: Animation | null; onClose: () => void }) {
  const screen = useWindowDimensions();
  const [run, setRun] = useState(0);
  const s = useStyles();
  if (!anim) return null;
  const origin = { x: screen.width / 2, y: screen.height * 0.7 };
  return (
    <Pressable style={s.stage} onPress={onClose} accessibilityLabel="Önizlemeyi kapat">
      <View style={[s.seat, { left: origin.x - 30, top: origin.y - 30 }]} />
      <AnimPlay key={run} anim={anim} origin={origin} screen={screen} onDone={() => setRun((n) => n + 1)} />
      <Text style={s.stageText}>{anim.name} · tekrar oynuyor · kapatmak için dokun</Text>
    </Pressable>
  );
}

function ProviderCard({ id }: { id: string }) {
  const { providers, catalog } = useAnimations();
  const p = providers.find((x) => x.id === id)!;
  const [items, setItems] = useState<ProviderItem[] | null>(null);
  const [msg, setMsg] = useState('');
  const s = useStyles();
  const fetchItems = () => {
    const r = listProvider(id);
    if (r.ok) {
      setItems(r.items);
      setMsg('');
    } else {
      setItems(null);
      setMsg(r.reason);
    }
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={s.title}>{p.name}</Text>
      <Text style={s.dim}>
        {p.hasApi ? 'API var' : 'API yok'} · {p.online ? 'bağlı' : 'bağlantı yok'} · {catalog.filter((a) => a.provider === id).length} kayıt katalogda
      </Text>
      <Text style={s.dim}>{p.terms}</Text>
      {id !== 'builtin' && (
        <View style={s.row}>
          <Text style={s.label}>Bağlantı (test)</Text>
          <Switch value={p.online} onValueChange={(v) => setProviderOnline(id, v)} />
        </View>
      )}
      {id !== 'builtin' && (
        <Pressable style={s.small} onPress={fetchItems} accessibilityLabel={`${p.name} kataloğunu getir`}>
          <Text style={s.chipText}>Sağlayıcı kataloğunu getir</Text>
        </Pressable>
      )}
      {!!msg && <Text style={s.warn}>{msg}</Text>}
      {items?.map((it) => {
        const imported = catalog.some((a) => a.provider === id && a.provider_id === it.provider_id);
        return (
          <View key={it.provider_id} style={s.row}>
            <AssetView asset={it.preview} size={28} />
            <View style={{ flex: 1 }}>
              <Text style={s.label}>
                {it.name} · {FORMAT_LABEL[it.format]}
              </Text>
              <Text style={s.dim}>
                {LICENSE_LABEL[it.license]} · {it.terms}
              </Text>
            </View>
            <Pressable
              style={[s.small, imported && { opacity: 0.5 }]}
              disabled={imported}
              onPress={() => {
                const r = importItem(id, it);
                showAlert(r.ok ? 'İçe aktarıldı' : 'Aktarılamadı', r.ok ? `${it.name} katalogda pasif olarak duruyor. ${it.license === 'approved' ? 'Fiyatı ayarlayıp yayına alabilirsin.' : 'Lisans onaylanmadan yayına alınamaz.'}` : r.reason);
              }}
            >
              <Text style={s.chipText}>{imported ? 'Aktarıldı' : 'İçe aktar'}</Text>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

/** A new record from bundled assets needs no code: asset + motion + display type + price. */
function NewForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Asset['kind']>('emoji');
  const [value, setValue] = useState('🎉');
  const [display, setDisplay] = useState<DisplayType>('reaction');
  const [motion, setMotion] = useState<Motion>('rise');
  const [category, setCategory] = useState('cute');
  const [free, setFree] = useState(true);
  const [price, setPrice] = useState('100');
  const { colors } = useTheme();
  const s = useStyles();
  const asset = (kind === 'icon' ? { kind, value: value as Icon3DName } : kind === 'art' ? { kind, value: value as AnimArtName } : { kind, value }) as Asset;
  const create = () => {
    if (!name.trim()) return showAlert('Ad gerekli');
    if (!value.trim()) return showAlert('Görsel gerekli');
    const bundled = kind !== 'url';
    const rec = addAnimation({
      provider: bundled ? 'builtin' : 'manual',
      provider_id: null,
      name: name.trim(),
      category_id: category,
      preview_asset: asset,
      animation_asset: asset,
      format: kind === 'emoji' ? 'emoji' : 'image',
      motion,
      count: motion === 'rain' ? 20 : motion === 'burst' ? 10 : motion === 'zoom' || motion === 'fly' ? 1 : 5,
      duration_ms: display === 'fullscreen' ? 3000 : 2000,
      display_type: display,
      audio_asset: null,
      coin_price: free ? 0 : Math.max(1, Number(price) || 0),
      is_free: free,
      // Bundled assets are ours, so they can go live now; an outside URL waits for its licence.
      is_active: bundled,
      license_status: bundled ? 'approved' : 'pending',
      license_note: bundled ? 'Yerleşik görsel.' : 'Harici dosya: lisans belgesi eklenip onaylanmalı.',
    });
    showAlert('Eklendi', `${rec.name} ${bundled ? 'yayında; odalarda emoji panelinin Hareketli sekmesinde görünür.' : 'pasif olarak eklendi; lisans onaylanınca yayına alınabilir.'}`);
    onCreated();
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={s.label}>Ad</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Örn. Konfeti Patlaması" placeholderTextColor={colors.textDim} style={s.inputWide} />
      <Text style={s.label}>Görsel kaynağı</Text>
      <Chips<Asset['kind']>
        value={kind}
        options={[
          ['emoji', 'Emoji'],
          ['art', 'Efekt görseli'],
          ['icon', '3D ikon'],
          ['url', 'Dosya URL (manuel)'],
        ]}
        onChange={(k) => {
          setKind(k);
          setValue(k === 'icon' ? 'heart' : k === 'art' ? 'alkis' : k === 'emoji' ? '🎉' : '');
        }}
      />
      {kind === 'icon' ? (
        <Chips value={value} options={ICONS.map((i) => [i, i] as [string, string])} onChange={setValue} />
      ) : kind === 'art' ? (
        <Chips value={value} options={ANIM_ART_NAMES.map((n) => [n, n] as [string, string])} onChange={setValue} />
      ) : (
        <TextInput value={value} onChangeText={setValue} placeholder={kind === 'url' ? 'https://… (PNG/GIF)' : 'Emoji'} placeholderTextColor={colors.textDim} style={s.inputWide} autoCapitalize="none" />
      )}
      <Text style={s.label}>Gösterim türü</Text>
      <Chips<DisplayType> value={display} options={(Object.entries(DISPLAY_LABEL) as [DisplayType, string][]).filter(([k]) => k !== 'entry')} onChange={setDisplay} />
      <Text style={s.label}>Hareket</Text>
      <Chips<Motion> value={motion} options={Object.entries(MOTION_LABEL) as [Motion, string][]} onChange={setMotion} />
      <Text style={s.label}>Kategori</Text>
      <Chips value={category} options={ANIM_CATEGORIES.map((c) => [c.id, c.name] as [string, string])} onChange={setCategory} />
      <View style={s.row}>
        <Text style={s.label}>Ücretsiz</Text>
        <Switch value={free} onValueChange={setFree} />
      </View>
      {!free && <TextInput value={price} onChangeText={setPrice} keyboardType="number-pad" style={s.inputWide} placeholder="Jeton fiyatı" placeholderTextColor={colors.textDim} />}
      <View style={[s.row, { justifyContent: 'center', paddingVertical: 6 }]}>
        <AssetView asset={asset} size={48} />
      </View>
      <Pressable style={s.btn} onPress={create} accessibilityLabel="Kataloğa ekle">
        <Text style={s.btnText}>Kataloğa ekle</Text>
      </Pressable>
    </Card>
  );
}

// stage, seat and stageText are read inside the preview's dark ThemeScope, so they always get the dark values.
const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  title: { color: colors.text, fontWeight: '800', fontSize: 15 },
  label: { color: colors.text, fontSize: 13, flex: 1 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  warn: { color: colors.gold, fontSize: 12, lineHeight: 17 },
  badge: { fontWeight: '800', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: semantic.actionText, backgroundColor: dark ? 'rgba(255,95,162,0.15)' : 'rgba(208,46,120,0.09)' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipIcon: { width: 18, height: 18 },
  small: { borderRadius: 999, backgroundColor: colors.cardAlt, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start' },
  btn: { backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: semantic.actionInk, fontWeight: '900' },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, width: 90 },
  inputWide: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  stage: { flex: 1, backgroundColor: 'rgba(22,14,18,0.92)' },
  seat: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  stageText: { position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', color: colors.textDim },
}));
