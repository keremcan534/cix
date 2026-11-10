// Yönetim › Canlı ayarlar (admin only; server/api/live-settings.mjs): what the owner may change without a new
// APK. Acil durum (a switch per feature, 'Para işlemlerini durdur', the notice) always on top, then Kampanya,
// Hediyeler ve paketler, Çevirme kuru, Para çekme sınırları, Birebir, Yeni üye ödülleri, SMS, Zorunlu sürüm and Geçmiş. Every change opens
// the same sheet (live-change-sheet): the server's preview, a reason, Uygula, and a second confirmation for a
// big change. The server checks every value again; the local checks here only say early what it will refuse.
// Safe mode on the server (LIVE_SAFE_MODE) shows a red banner and nothing can be changed.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type HostInstance } from 'react-native';

import { GiftArt } from '@/components/GiftArt';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ChoiceChips, ListGroup, ListRow, ListSwitch } from '@/components/list';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { GIFTS } from '@/data/mock';
import { ApiError, liveHistory, liveSettings, type CatalogCampaign, type LiveBatch, type LiveKey, type LiveSetting, type LiveSettingsView, type LiveValue } from '@/lib/api';
import {
  bigChange,
  CAMPAIGN_DAYS,
  CAMPAIGN_PERCENT,
  campaignError,
  campaignExample,
  campaignOf,
  campaignWhen,
  coinsPer10k,
  dayLabel,
  FEATURE_LABEL,
  fmtIstanbul,
  fmtNum,
  fmtRate,
  istanbulHour,
  MONEY_STOP,
  ONE_ON_ONE_KEYS,
  parseRate,
  parseWhole,
  PURCHASE_WARNING,
  rateError,
  rateLine,
  rateWindow,
  REWARD_KEYS,
  REWARD_LABEL,
  valueText,
  versionError,
  wholeError,
  type CampaignDraft,
  type IntBounds,
  type Names,
} from '@/lib/live-settings-format';
import { APP_VERSION } from '@/lib/reporting';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { LiveChangeSheet, type LiveChanges, type LiveJob } from './live-change-sheet';
import { ItemCard, LoadState, Notice, Quote, SectionScroll, StatusPill, useAdmin, useLoad, type Load } from './parts';
import { Field } from './sanction-parts';

export type LiveAccess = { view: LiveSettingsView | null };
/** The settings, or view null when this account isn't an admin (403): the tab is hidden then. */
export async function loadLiveAccess(): Promise<LiveAccess> {
  try {
    return { view: await liveSettings() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return { view: null };
    throw e;
  }
}

type History = { batches: LiveBatch[]; next: number | null };
const PAGE = 20;
const loadHistory = (before?: number): Promise<History> => liveHistory(before, PAGE).then((r) => ({ batches: r.batches, next: (r as { next?: number | null }).next ?? null }));

const GIFT_BY_ID = new Map(GIFTS.map((g) => [g.id, g]));
const listOf = (v: LiveValue): string[] => (Array.isArray(v) ? v : []);
const numOf = (v: LiveValue, d = 0) => (typeof v === 'number' ? v : d);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const trLower = (t: string) => t.toLocaleLowerCase('tr-TR');

/** A reason chip the change sheet picks first for this kind of change. */
type Suggest = 'Acil durum' | 'Kampanya' | 'Geri dönüş' | 'Bakım';

/** Context the cards share: the view, one setting, opening the change sheet, read-only in safe mode. */
type Kit = {
  view: LiveSettingsView;
  get: (k: LiveKey) => LiveSetting;
  open: (title: string, build: () => LiveChanges, suggest?: Suggest) => void;
  locked: boolean;
  names: Names;
  /** The server's clock (GET serverNow) as of now: a campaign starts against it, not the phone's clock. */
  now: () => number;
};

export function LiveSettingsSection({ load }: { load: Load<LiveAccess> }) {
  const ctx = useAdmin();
  const history = useLoad(() => loadHistory());
  const [stale, setStale] = useState(false);
  // The fields sit in the scroll itself, not in a sheet: Android draws edge to edge, so without this the keyboard
  // covers the lower cards (Para çekme, SMS, Zorunlu sürüm) and their Gözden geçir. KeyboardAvoid measures itself
  // against its parent, which starts below the header and the tab row: that distance, read on the device.
  const wrap = useRef<HostInstance>(null);
  const [top, setTop] = useState(0);
  const reloadAll = () => {
    load.reload();
    history.reload();
  };
  return (
    <View ref={wrap} style={{ flex: 1 }} onLayout={() => wrap.current?.measureInWindow((_x, y) => setTop(Math.max(0, Math.round(y))))}>
      <KeyboardAvoid style={{ flex: 1 }} offset={top}>
        <SectionScroll
          load={{
            refreshing: load.refreshing,
            refresh: () => {
              setStale(false);
              load.refresh();
              history.reload();
            },
          }}
        >
          <LoadState load={load} empty={(d) => (d.view ? null : { icon: 'lock-closed-outline', title: 'Yönetici hesabı gerekli', text: 'Canlı ayarları yalnız yöneticiler görür.' })}>
            {(d) =>
              d.view && (
                <Body
                  key={d.view.v}
                  view={d.view}
                  stale={stale}
                  history={history}
                  open={(job, baseV, names, suggest) =>
                    ctx.present(
                      <LiveChangeSheet
                        job={job}
                        baseV={baseV}
                        names={names}
                        suggest={suggest}
                        onSaved={() => {
                          setStale(false);
                          reloadAll();
                        }}
                        onStale={() => {
                          setStale(true);
                          reloadAll();
                        }}
                      />,
                    )
                  }
                />
              )
            }
          </LoadState>
        </SectionScroll>
      </KeyboardAvoid>
    </View>
  );
}

function Body({
  view,
  stale,
  history,
  open,
}: {
  view: LiveSettingsView;
  stale: boolean;
  history: Load<History>;
  open: (job: LiveJob, baseV: number, names: Names, suggest?: Suggest) => void;
}) {
  const locked = view.safeMode;
  const byKey = useMemo(() => new Map(view.settings.map((x) => [x.key, x])), [view]);
  const packLabels = (byKey.get('packs_hidden')?.bounds.labels ?? {}) as Record<string, string>;
  const shopLabels = (byKey.get('shop_hidden')?.bounds.labels ?? {}) as Record<string, string>;
  const names: Names = { gift: (id) => GIFT_BY_ID.get(id)?.name ?? id, pack: (id) => packLabels[id] ?? id, shop: (sku) => shopLabels[sku] ?? sku };
  const serverNow = Date.parse((view as { serverNow?: string }).serverNow ?? '');
  const [skew] = useState(() => (Number.isFinite(serverNow) ? serverNow - Date.now() : 0));
  const kit: Kit = {
    view,
    get: (k) => byKey.get(k) as LiveSetting,
    open: (title, build, suggest) => open({ kind: 'save', title, build }, view.v, names, suggest),
    locked,
    names,
    now: () => Date.now() + skew,
  };
  const invalid = view.settings.filter((x) => x.invalid);
  return (
    <>
      {locked && (
        <Notice
          tone="danger"
          icon="lock-closed"
          text="Güvenli mod açık: sunucu kayıtlı canlı ayarları yok sayıyor ve burada değişiklik yapılamaz. Geçerli olan sunucu ayarları (.env)."
        />
      )}
      {stale && <Notice tone="money" icon="refresh-outline" text="Ayarlar bu arada değişti. Güncel hâli yüklendi; değişikliğini yeniden yap." />}
      {invalid.length > 0 && (
        <Notice tone="money" icon="alert-circle-outline" text={`${invalid.map((x) => x.label).join(', ')}: kayıtlı değer artık kurala uymuyor; geçersiz, varsayılan kullanılıyor.`} />
      )}
      {byKey.size > 0 && (
        <>
          {/* Safe mode: every save button is off already; this also stops the chips and fields taking input. */}
          <View style={{ gap: space.md, pointerEvents: locked ? 'none' : 'auto' }} accessibilityState={{ disabled: locked }}>
            <EmergencyCard kit={kit} />
            <CampaignCard kit={kit} />
            <GiftsCard kit={kit} />
            <PacksCard kit={kit} />
            <RateCard kit={kit} />
            <WithdrawCard kit={kit} />
            {kit.get('dm_price') && <OneOnOneCard kit={kit} />}
            {kit.get('rewards_off') && <RewardsCard kit={kit} />}
            <SmsCard kit={kit} />
            <VersionCard kit={kit} />
          </View>
          <HistoryCard view={view} load={history} names={names} locked={locked} byKey={byKey} open={(job, suggest) => open(job, view.v, names, suggest)} />
        </>
      )}
    </>
  );
}

// --- Small parts ---------------------------------------------------------------------------------------------
/** "Son değişiklik: Elif · 5 Kasım 14:05 · Bakım", or nothing when the setting was never saved. */
function lastChange(...xs: (LiveSetting | undefined)[]) {
  const x = xs.filter((y): y is LiveSetting => !!y?.changedAt).sort((a, b) => Date.parse(b.changedAt ?? '') - Date.parse(a.changedAt ?? ''))[0];
  if (!x) return undefined;
  return `Son değişiklik: ${[x.changedBy?.name ?? 'Yönetici', fmtIstanbul(x.changedAt), x.reason].filter(Boolean).join(' · ')}`;
}

function Card({ title, footer, pill, children }: { title: string; footer?: string; pill?: ReactNode; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        {pill}
      </View>
      {children}
      {!!footer && <Text style={s.footer}>{footer}</Text>}
    </View>
  );
}

function InvalidPill({ x }: { x?: LiveSetting }) {
  return x?.invalid ? <StatusPill text="geçersiz, varsayılan kullanılıyor" tone="money" /> : null;
}

/** − value + with 48 pt targets. */
function Stepper({ value, onMinus, onPlus, minusOff, plusOff, label, disabled }: { value: string; onMinus: () => void; onPlus: () => void; minusOff?: boolean; plusOff?: boolean; label: string; disabled?: boolean }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={s.stepper} accessibilityLabel={`${label}: ${value}`}>
      <Pressable onPress={onMinus} disabled={disabled || minusOff} accessibilityRole="button" accessibilityLabel={`${label} azalt`} style={[s.stepBtn, (disabled || minusOff) && s.off]} hitSlop={4}>
        <Ionicons name="remove" size={22} color={colors.text} />
      </Pressable>
      <Text style={s.stepValue}>{value}</Text>
      <Pressable onPress={onPlus} disabled={disabled || plusOff} accessibilityRole="button" accessibilityLabel={`${label} artır`} style={[s.stepBtn, (disabled || plusOff) && s.off]} hitSlop={4}>
        <Ionicons name="add" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

function Problem({ text }: { text: string | null }) {
  const s = useStyles();
  return text ? <Text style={s.problem}>{text}</Text> : null;
}

// --- Acil durum ----------------------------------------------------------------------------------------------
function EmergencyCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const features = kit.get('features_off');
  const notice = kit.get('notice');
  const envOff = kit.view.env.featuresOff;
  const effective = listOf(features.effective);
  // The live list (what this panel saves); a stored value that no longer passes counts as empty.
  const stored = features.invalid ? [] : listOf(features.value);
  const options = (features.bounds.options as string[] | undefined) ?? Object.keys(FEATURE_LABEL);
  const ordered = (xs: string[]) => options.filter((f) => xs.includes(f));
  const saveOff = (next: string[]) => (next.length ? ordered(next) : null);
  const toStop = MONEY_STOP.filter((f) => !effective.includes(f));

  const [text, setText] = useState(typeof notice.effective === 'string' ? notice.effective : '');
  const current = typeof notice.effective === 'string' ? notice.effective : '';
  const clean = text.trim();
  const tooLong = clean.length > 300;

  return (
    <>
      <View style={s.section}>
        <Text style={s.sectionLabel}>ACİL DURUM</Text>
        <ListGroup>
          {options.map((f) => {
            const env = envOff.includes(f);
            const on = !effective.includes(f);
            return (
              <ListSwitch
                key={f}
                icon={on ? 'checkmark-circle-outline' : 'pause-circle-outline'}
                tone={on ? 'success' : 'danger'}
                title={FEATURE_LABEL[f] ?? f}
                subtitle={env ? 'Sunucu ayarında kapalı; buradan açılamaz' : f === 'purchases' ? PURCHASE_WARNING : on ? 'Açık' : 'Kapalı'}
                value={on}
                disabled={kit.locked || env}
                onChange={(v) =>
                  kit.open(`${FEATURE_LABEL[f]} ${v ? 'açılsın' : 'kapatılsın'}`, () => ({ features_off: saveOff(v ? stored.filter((x) => x !== f) : [...stored, f]) }), v ? 'Geri dönüş' : 'Acil durum')
                }
              />
            );
          })}
        </ListGroup>
        <Button
          title="Para işlemlerini durdur"
          icon="hand-left-outline"
          variant="danger"
          disabled={kit.locked || toStop.length === 0}
          onPress={() => kit.open('Para işlemlerini durdur', () => ({ features_off: saveOff([...new Set([...stored, ...MONEY_STOP])]) }), 'Acil durum')}
        />
        <Text style={s.footer}>
          {toStop.length === 0
            ? 'Para işlemleri zaten durdurulmuş. Açmak için tek tek aç ya da Geçmiş’ten geri al.'
            : 'Hediye, jeton yükleme, elmas çevirme, Jeton Noktası, para çekme ve oyunlar tek kayıtta kapanır. Jeton satın alma açık kalır.'}
        </Text>
        {!!lastChange(features) && <Text style={s.footer}>{lastChange(features)}</Text>}
      </View>

      <Card title="Duyuru" footer={lastChange(notice)} pill={<InvalidPill x={notice} />}>
        <Text style={s.hint}>{current ? `Şu an: “${current}”` : 'Şu an duyuru yok.'}</Text>
        <Field label="Duyuru metni" value={text} onChange={setText} placeholder="Örn. Bu gece 02:00–03:00 bakım var." multiline max={300} hint={`${clean.length}/300 karakter · uygulamanın üstünde görünür`} />
        {tooLong && <Problem text="Duyuru en çok 300 karakter olabilir." />}
        <View style={s.row}>
          <Button
            title="Kaldır"
            icon="close-circle-outline"
            variant="ghost"
            disabled={kit.locked || !current}
            onPress={() => kit.open('Duyuru kaldırılsın', () => ({ notice: '' }), 'Geri dönüş')}
            style={{ flex: 1 }}
          />
          <Button
            title="Yayınla"
            icon="megaphone-outline"
            variant="tonal"
            disabled={kit.locked || !clean || tooLong || clean === current}
            onPress={() => kit.open('Duyuru yayınlansın', () => ({ notice: clean }), 'Bakım')}
            style={{ flex: 1 }}
          />
        </View>
        {notice.value !== null && !!kit.view.env.notice && (
          <Button title="Sunucu ayarındaki duyuruya dön" variant="ghost" small disabled={kit.locked} onPress={() => kit.open('Duyuru varsayılana dönsün', () => ({ notice: null }), 'Geri dönüş')} />
        )}
      </Card>
    </>
  );
}

// --- Kampanya ------------------------------------------------------------------------------------------------
function CampaignCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const x = kit.get('campaign');
  const c = x.effective && typeof x.effective === 'object' && !Array.isArray(x.effective) ? (x.effective as CatalogCampaign) : null;
  const now = kit.now();
  const [d, setD] = useState<CampaignDraft>({ percent: 10, label: '', start: 'now', days: 3 });
  const later = d.start !== 'now' ? d.start : null;
  const draft = campaignOf(d, now);
  const problem = campaignError(draft, now);
  const state = c ? (Date.parse(c.endsAt) <= now ? 'Bitti' : Date.parse(c.startsAt) > now ? 'Başlamadı' : 'Sürüyor') : null;
  const set = (p: Partial<CampaignDraft>) => setD((o) => ({ ...o, ...p }));
  const hour = istanbulHour(now);

  return (
    <Card title="Kampanya" footer={lastChange(x)} pill={x.invalid ? <InvalidPill x={x} /> : state ? <StatusPill text={state} tone={state === 'Sürüyor' ? 'success' : 'neutral'} /> : undefined}>
      {c ? (
        <View style={s.current}>
          <Text style={s.currentBig}>{`+%${c.percent} · ${c.label}`}</Text>
          <Text style={s.hint}>{`${campaignWhen(c, now)} (İstanbul saati)`}</Text>
          <Text style={s.hint}>{campaignExample(c.percent)}</Text>
          <Button title="Kampanyayı bitir" icon="stop-circle-outline" variant="ghost" small disabled={kit.locked} onPress={() => kit.open('Kampanya bitsin', () => ({ campaign: null }), 'Kampanya')} />
        </View>
      ) : (
        <Text style={s.hint}>Şu an kampanya yok. Her jeton paketine yüzde olarak ek jeton verir; mağaza deneme alımlarına (Play test, TestFlight) verilmez.</Text>
      )}

      <Text style={s.label}>{c ? 'Yeni kampanya (şimdikinin yerine geçer)' : 'Yeni kampanya'}</Text>
      <View style={s.rowCenter}>
        <Text style={[s.hint, { flex: 1 }]}>Ek jeton</Text>
        <Stepper
          label="Kampanya yüzdesi"
          value={`%${d.percent}`}
          disabled={kit.locked}
          minusOff={d.percent <= CAMPAIGN_PERCENT.min}
          plusOff={d.percent >= CAMPAIGN_PERCENT.max}
          onMinus={() => set({ percent: Math.max(CAMPAIGN_PERCENT.min, d.percent - CAMPAIGN_PERCENT.step) })}
          onPlus={() => set({ percent: Math.min(CAMPAIGN_PERCENT.max, d.percent + CAMPAIGN_PERCENT.step) })}
        />
      </View>
      <Text style={s.example}>{campaignExample(d.percent)}</Text>
      {d.percent > CAMPAIGN_PERCENT.big && <Text style={s.hint}>%25’in üstü ikinci bir onay ister.</Text>}

      <Text style={s.label}>Başlangıç</Text>
      <ChoiceChips
        value={later ? 'later' : 'now'}
        options={[
          ['now', 'Şimdi'],
          ['later', 'Daha sonra'],
        ]}
        onChange={(v) => set({ start: v === 'now' ? 'now' : { day: hour >= 23 ? 1 : 0, hour: hour >= 23 ? 0 : hour + 1 } })}
      />
      {later && (
        <>
          <View style={s.rowCenter}>
            <Text style={[s.hint, { flex: 1 }]}>Gün</Text>
            <Stepper
              label="Başlangıç günü"
              value={dayLabel(now, later.day)}
              disabled={kit.locked}
              minusOff={later.day <= 0}
              plusOff={later.day >= 29}
              onMinus={() => set({ start: { ...later, day: later.day - 1 } })}
              onPlus={() => set({ start: { ...later, day: later.day + 1 } })}
            />
          </View>
          <View style={s.rowCenter}>
            <Text style={[s.hint, { flex: 1 }]}>Saat (İstanbul)</Text>
            <Stepper
              label="Başlangıç saati"
              value={`${String(later.hour).padStart(2, '0')}:00`}
              disabled={kit.locked}
              minusOff={later.hour <= 0}
              plusOff={later.hour >= 23}
              onMinus={() => set({ start: { ...later, hour: later.hour - 1 } })}
              onPlus={() => set({ start: { ...later, hour: later.hour + 1 } })}
            />
          </View>
        </>
      )}

      <Text style={s.label}>Süre</Text>
      <ChoiceChips value={d.days} options={CAMPAIGN_DAYS.map((n): [number, string] => [n, `${n} gün`])} onChange={(days) => set({ days })} />
      <Text style={s.hint}>{`${fmtIstanbul(draft.startsAt, now)} – ${fmtIstanbul(draft.endsAt, now)} (İstanbul saati)`}</Text>

      <Field label="Kampanya adı" value={d.label} onChange={(label) => set({ label })} placeholder="Örn. Hafta sonu" max={40} />
      <Problem text={d.label.trim() ? problem : null} />
      <Button
        title={c ? 'Kampanyayı değiştir' : 'Kampanyayı başlat'}
        icon="pricetag-outline"
        variant="tonal"
        disabled={kit.locked || !!problem}
        onPress={() => kit.open(c ? 'Kampanya değişsin' : 'Kampanya başlasın', () => ({ campaign: campaignOf(d, kit.now()) }), 'Kampanya')}
      />
      <Text style={s.footer}>Eski uygulamalar kampanyayı göstermez; duyuruyla da haber ver.</Text>
    </Card>
  );
}

// --- Hediyeler ve paketler -----------------------------------------------------------------------------------
function GiftsCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const { colors } = useTheme();
  const x = kit.get('gifts_hidden');
  const options = (x.bounds.options as string[] | undefined) ?? GIFTS.map((g) => g.id);
  const saved = listOf(x.effective);
  const [hidden, setHidden] = useState<string[]>(saved);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const dirty = !sameList(hidden, saved);
  const changed = options.filter((id) => hidden.includes(id) !== saved.includes(id));
  const query = trLower(q.trim());
  const shown = query
    ? options.filter((id) => trLower(kit.names.gift?.(id) ?? id).includes(query))
    : all
      ? options
      : options.filter((id) => hidden.includes(id) || saved.includes(id));
  const next = options.filter((id) => hidden.includes(id));
  const big = bigChange('gifts_hidden', saved, next.length ? next : null);

  return (
    <Card title="Hediyeler" footer={lastChange(x)} pill={<InvalidPill x={x} />}>
      <Text style={s.hint}>{saved.length ? `${options.length} hediyeden ${saved.length} tanesi gizli. Gizlenen hediye listeden çıkar ve sunucu onu reddeder.` : `${options.length} hediyenin hepsi görünür.`}</Text>
      <View style={s.search}>
        <Ionicons name="search" size={18} color={colors.textDim} />
        <TextInput value={q} onChangeText={setQ} placeholder="Hediye ara" placeholderTextColor={colors.textDim} style={s.searchInput} accessibilityLabel="Hediye ara" autoCorrect={false} />
        {!!q && (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
            <Ionicons name="close-circle" size={18} color={colors.textDim} />
          </Pressable>
        )}
      </View>
      {shown.length > 0 ? (
        <ListGroup>
          {shown.map((id) => {
            const g = GIFT_BY_ID.get(id);
            const on = !hidden.includes(id);
            return (
              <ListSwitch
                key={id}
                leading={<GiftArt giftId={id} emoji={g?.emoji ?? '🎁'} size={32} />}
                title={g?.name ?? id}
                subtitle={`${g ? `${fmtNum(g.price)} jeton · ` : ''}${on ? 'Görünür' : 'Gizli'}${changed.includes(id) ? ' (kaydedilmedi)' : ''}`}
                value={on}
                disabled={kit.locked}
                onChange={(v) => setHidden((h) => (v ? h.filter((y) => y !== id) : [...h, id]))}
              />
            );
          })}
        </ListGroup>
      ) : (
        <Text style={s.hint}>{query ? 'Bu adla hediye yok.' : 'Gizli hediye yok.'}</Text>
      )}
      {!query && <Button title={all ? 'Yalnız gizlileri göster' : `Tüm hediyeleri göster (${options.length})`} variant="ghost" small onPress={() => setAll((a) => !a)} />}
      {dirty && (
        <View style={s.draftBar}>
          <Text style={[s.hint, { flex: 1 }]}>{`${changed.length} değişiklik${big ? ' · 5’ten fazla gizleme ikinci onay ister' : ''}`}</Text>
          <Button title="Vazgeç" variant="ghost" small onPress={() => setHidden(saved)} />
          <Button title="Gözden geçir" variant="tonal" small disabled={kit.locked} onPress={() => kit.open('Hediyeler değişsin', () => ({ gifts_hidden: next.length ? next : null }))} />
        </View>
      )}
    </Card>
  );
}

function PacksCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const x = kit.get('packs_hidden');
  const options = (x.bounds.options as string[] | undefined) ?? [];
  const hidden = listOf(x.effective);
  const visible = options.filter((id) => !hidden.includes(id));
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>JETON PAKETLERİ</Text>
      <ListGroup>
        {options.map((id) => {
          const on = !hidden.includes(id);
          const last = on && visible.length <= 1;
          return (
            <ListSwitch
              key={id}
              icon="wallet-outline"
              tone="money"
              title={kit.names.pack?.(id) ?? id}
              subtitle={last ? 'En az bir paket açık kalmalı' : on ? 'Mağazada' : 'Gizli'}
              value={on}
              disabled={kit.locked || last}
              onChange={(v) => {
                const next = options.filter((p) => (p === id ? !v : hidden.includes(p)));
                kit.open(`${kit.names.pack?.(id) ?? id} ${v ? 'mağazaya dönsün' : 'gizlensin'}`, () => ({ packs_hidden: next.length ? next : null }));
              }}
            />
          );
        })}
      </ListGroup>
      <Text style={s.footer}>Satışı tümden durdurmak için Acil durum’da Jeton satın almayı kapat. Ödemesi alınmış satın almalar yine yüklenir.</Text>
      {!!lastChange(x) && <Text style={s.footer}>{lastChange(x)}</Text>}
    </View>
  );
}

// --- Çevirme kuru --------------------------------------------------------------------------------------------
function RateCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const { colors } = useTheme();
  const x = kit.get('exchange_usd_try');
  const current = numOf(x.effective, 49.8);
  const def = numOf(x.default, 49.8);
  const [text, setText] = useState(fmtRate(current));
  const next = parseRate(text);
  const problem = rateError(current, next);
  const w = rateWindow(current);
  const changed = next !== null && Math.round(next * 100) !== Math.round(current * 100);
  const step = (d: number) => {
    const base = next ?? current;
    const v = Math.round((base + d) * 100) / 100;
    setText(fmtRate(Math.min(w.hi, Math.max(w.lo, v))));
  };
  const resetProblem = x.value !== null ? rateError(current, def) : null;
  return (
    <Card title="Çevirme kuru" footer={lastChange(x)} pill={<InvalidPill x={x} />}>
      <Text style={s.currentBig}>{`1 USD = ${fmtRate(current)} TL`}</Text>
      <Text style={s.hint}>{`10.000 elmas = ${fmtNum(coinsPer10k(current))} jeton (Gelir › Çevir)`}</Text>
      <View style={s.rowCenter}>
        <Pressable onPress={() => step(-0.1)} disabled={kit.locked} style={[s.stepBtn, kit.locked && s.off]} accessibilityRole="button" accessibilityLabel="Kuru 0,10 azalt">
          <Text style={s.stepText}>−0,10</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(t) => setText(t.replace(/[^\d.,]/g, ''))}
          keyboardType="decimal-pad"
          style={[s.input, s.rateInput]}
          editable={!kit.locked}
          maxLength={6}
          accessibilityLabel="Yeni kur (TL)"
          placeholderTextColor={colors.textDim}
        />
        <Pressable onPress={() => step(0.1)} disabled={kit.locked} style={[s.stepBtn, kit.locked && s.off]} accessibilityRole="button" accessibilityLabel="Kuru 0,10 artır">
          <Text style={s.stepText}>+0,10</Text>
        </Pressable>
      </View>
      {changed && !problem && next !== null && <Text style={s.example}>{rateLine(current, next)}</Text>}
      {changed && <Problem text={problem} />}
      {changed && !problem && next !== null && bigChange('exchange_usd_try', current, next) && <Text style={s.hint}>%3’ten büyük değişiklik ikinci bir onay ister.</Text>}
      <Text style={s.hint}>{`İzin verilen 40,00–75,00 TL. Bir kayıtta en çok ±%10: şimdi ${fmtRate(w.lo)}–${fmtRate(w.hi)}.`}</Text>
      <View style={s.row}>
        <Button
          title="Varsayılana dön"
          variant="ghost"
          small
          disabled={kit.locked || x.value === null || !!resetProblem}
          onPress={() => kit.open('Kur varsayılana dönsün', () => ({ exchange_usd_try: null }), 'Geri dönüş')}
          style={{ flex: 1 }}
        />
        <Button
          title="Gözden geçir"
          variant="tonal"
          small
          disabled={kit.locked || !changed || !!problem}
          onPress={() => next !== null && kit.open('Çevirme kuru değişsin', () => ({ exchange_usd_try: next }))}
          style={{ flex: 1 }}
        />
      </View>
      {!!resetProblem && <Text style={s.hint}>{`Varsayılan ${fmtRate(def)} bu kayıtta izin verilen aralığın dışında; kuru adım adım geri getir.`}</Text>}
    </Card>
  );
}

// --- Para çekme sınırları ------------------------------------------------------------------------------------
function WithdrawCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const max = kit.get('withdraw_max_diamonds');
  const week = kit.get('withdraw_weekly_diamonds');
  const [a, setA] = useState(fmtNum(numOf(max.effective)));
  const [b, setB] = useState(fmtNum(numOf(week.effective)));
  const va = parseWhole(a);
  const vb = parseWhole(b);
  const ea = wholeError(va, max.bounds as IntBounds, 'Tek talep sınırı', ' elmas');
  const eb = wholeError(vb, week.bounds as IntBounds, 'Haftalık sınır', ' elmas');
  const changes: LiveChanges = {};
  if (va !== null && va !== max.effective) changes.withdraw_max_diamonds = va;
  if (vb !== null && vb !== week.effective) changes.withdraw_weekly_diamonds = vb;
  const dirty = Object.keys(changes).length > 0;
  const reset: LiveChanges = {};
  if (max.value !== null) reset.withdraw_max_diamonds = null;
  if (week.value !== null) reset.withdraw_weekly_diamonds = null;
  return (
    <Card title="Para çekme sınırları" footer={lastChange(max, week)} pill={<InvalidPill x={max.invalid ? max : week} />}>
      <Text style={s.hint}>{`Yalnız bugünkü değerlerden aşağı çekilebilir (en çok ${fmtNum((max.bounds as IntBounds).max)} ve ${fmtNum((week.bounds as IntBounds).max)} elmas). Bekleyen talepler etkilenmez.`}</Text>
      <Field label="Tek talepte en çok (elmas)" value={a} onChange={setA} keyboard="numeric" max={11} hint={`Şu an ${fmtNum(numOf(max.effective))} elmas`} />
      <Problem text={va !== max.effective ? ea : null} />
      <Field label="7 günde en çok (elmas)" value={b} onChange={setB} keyboard="numeric" max={11} hint={`Şu an ${fmtNum(numOf(week.effective))} elmas`} />
      <Problem text={vb !== week.effective ? eb : null} />
      {va !== null && vb !== null && vb < va && <Text style={s.hint}>Haftalık sınır tek talep sınırından düşük; tek talepte de en çok haftalık sınır kadar istenebilir.</Text>}
      <View style={s.row}>
        <Button
          title="Varsayılana dön"
          variant="ghost"
          small
          disabled={kit.locked || Object.keys(reset).length === 0}
          onPress={() => kit.open('Para çekme sınırları varsayılana dönsün', () => reset, 'Geri dönüş')}
          style={{ flex: 1 }}
        />
        <Button
          title="Gözden geçir"
          variant="tonal"
          small
          disabled={kit.locked || !dirty || (!!ea && 'withdraw_max_diamonds' in changes) || (!!eb && 'withdraw_weekly_diamonds' in changes)}
          onPress={() => kit.open('Para çekme sınırları değişsin', () => changes)}
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

// --- Birebir ve eşleşme --------------------------------------------------------------------------------------
/**
 * The 1v1 prices, the heart levels that open calls, and Eşleşme's free matches, saved together. A call keeps the
 * price it started with; a price that more than doubles or halves asks twice.
 */
function OneOnOneCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const rows = ONE_ON_ONE_KEYS.map(({ key, unit }) => ({ key, unit, x: kit.get(key) })).filter((r) => !!r.x);
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, fmtNum(numOf(r.x.effective))])));
  const changes: LiveChanges = {};
  const errors: Record<string, string | null> = {};
  for (const r of rows) {
    const v = parseWhole(texts[r.key] ?? '');
    const changed = v !== r.x.effective;
    errors[r.key] = changed ? wholeError(v, r.x.bounds as IntBounds, r.x.label, r.unit) : null;
    if (changed && v !== null) changes[r.key] = v;
  }
  const dirty = Object.keys(changes).length > 0;
  const bad = rows.some((r) => errors[r.key]);
  const reset: LiveChanges = {};
  for (const r of rows) if (r.x.value !== null) reset[r.key] = null;
  const voice = numOf(kit.get('heart_voice_level')?.effective);
  const video = numOf(kit.get('heart_video_level')?.effective);
  return (
    <Card title="Birebir ve eşleşme" footer={lastChange(...rows.map((r) => r.x))} pill={<InvalidPill x={rows.find((r) => r.x.invalid)?.x} />}>
      <Text style={s.hint}>Yalnız yayıncı ile yayıncı olmayan arasında ücret alınır; ödeyen yayıncı olmayandır, yayıncı aynı sayıda elmas kazanır. Süren aramalar başladıkları fiyatla devam eder.</Text>
      {rows.map((r) => (
        <View key={r.key}>
          <Field
            label={r.x.label}
            value={texts[r.key] ?? ''}
            onChange={(t) => setTexts((m) => ({ ...m, [r.key]: t }))}
            keyboard="numeric"
            max={7}
            hint={`Şu an ${valueText(r.key, r.x.effective)} · ${r.x.help}`}
          />
          <Problem text={errors[r.key] ?? null} />
        </View>
      ))}
      {video < voice && <Text style={s.hint}>Görüntülü arama, sesli aramadan önce açılıyor; genelde görüntülü daha yüksek seviyede açılır.</Text>}
      <View style={s.row}>
        <Button
          title="Varsayılana dön"
          variant="ghost"
          small
          disabled={kit.locked || Object.keys(reset).length === 0}
          onPress={() => kit.open('Birebir ayarları varsayılana dönsün', () => reset, 'Geri dönüş')}
          style={{ flex: 1 }}
        />
        <Button title="Gözden geçir" variant="tonal" small disabled={kit.locked || !dirty || bad} onPress={() => kit.open('Birebir ayarları değişsin', () => changes)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// --- Yeni üye ödülleri ---------------------------------------------------------------------------------------
/**
 * The welcome coins, the invite reward and the first-purchase gift: a switch each (rewards_off), and the welcome and
 * invite amounts with the invite's daily cap per person, saved together. Reward coins: the shop only.
 */
function RewardsCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const off = kit.get('rewards_off');
  const effective = listOf(off.effective);
  const stored = off.invalid ? [] : listOf(off.value);
  const options = (off.bounds.options as string[] | undefined) ?? Object.keys(REWARD_LABEL);
  const saveOff = (next: string[]) => (next.length ? options.filter((k) => next.includes(k)) : null);
  const rows = REWARD_KEYS.map(({ key, unit }) => ({ key, unit, x: kit.get(key) })).filter((r) => !!r.x);
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.key, fmtNum(numOf(r.x.effective))])));
  const changes: LiveChanges = {};
  const errors: Record<string, string | null> = {};
  for (const r of rows) {
    const v = parseWhole(texts[r.key] ?? '');
    const changed = v !== r.x.effective;
    errors[r.key] = changed ? wholeError(v, r.x.bounds as IntBounds, r.x.label, r.unit) : null;
    if (changed && v !== null) changes[r.key] = v;
  }
  const dirty = Object.keys(changes).length > 0;
  const bad = rows.some((r) => errors[r.key]);
  const reset: LiveChanges = {};
  for (const r of rows) if (r.x.value !== null) reset[r.key] = null;
  return (
    <Card title="Yeni üye ödülleri" footer={lastChange(off, ...rows.map((r) => r.x))} pill={<InvalidPill x={[off, ...rows.map((r) => r.x)].find((x) => x.invalid)} />}>
      <Text style={s.hint}>Hoş geldin ve davet jetonları ödül jetonudur: yalnız mağazada harcanır, hediye edilemez. Kapatılan ödül hemen durur; verilmiş jetonlar geri alınmaz.</Text>
      <ListGroup>
        {options.map((k) => {
          const on = !effective.includes(k);
          return (
            <ListSwitch
              key={k}
              icon={on ? 'checkmark-circle-outline' : 'pause-circle-outline'}
              tone={on ? 'success' : 'danger'}
              title={REWARD_LABEL[k] ?? k}
              subtitle={on ? 'Açık' : 'Kapalı'}
              value={on}
              disabled={kit.locked}
              onChange={(v) => kit.open(`${REWARD_LABEL[k]} ${v ? 'açılsın' : 'kapatılsın'}`, () => ({ rewards_off: saveOff(v ? stored.filter((x) => x !== k) : [...stored, k]) }), v ? 'Geri dönüş' : 'Acil durum')}
            />
          );
        })}
      </ListGroup>
      {rows.map((r) => (
        <View key={r.key}>
          <Field
            label={r.x.label}
            value={texts[r.key] ?? ''}
            onChange={(t) => setTexts((m) => ({ ...m, [r.key]: t }))}
            keyboard="numeric"
            max={6}
            hint={`Şu an ${valueText(r.key, r.x.effective)} · ${r.x.help}`}
          />
          <Problem text={errors[r.key] ?? null} />
        </View>
      ))}
      <View style={s.row}>
        <Button
          title="Varsayılana dön"
          variant="ghost"
          small
          disabled={kit.locked || Object.keys(reset).length === 0}
          onPress={() => kit.open('Ödül miktarları varsayılana dönsün', () => reset, 'Geri dönüş')}
          style={{ flex: 1 }}
        />
        <Button title="Gözden geçir" variant="tonal" small disabled={kit.locked || !dirty || bad} onPress={() => kit.open('Ödül miktarları değişsin', () => changes)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// --- SMS -----------------------------------------------------------------------------------------------------
function SmsCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const x = kit.get('otp_global_per_hour');
  const current = numOf(x.effective);
  const [text, setText] = useState(String(current));
  const v = parseWhole(text);
  const problem = wholeError(v, x.bounds as IntBounds, 'Saatlik SMS sınırı');
  const changed = v !== null && v !== current;
  return (
    <Card title="SMS" footer={lastChange(x)} pill={current === 0 ? <StatusPill text="Durdu" tone="danger" /> : <InvalidPill x={x} />}>
      <Field
        label="Saatte en çok giriş kodu (bütün numaralar)"
        value={text}
        onChange={setText}
        keyboard="numeric"
        max={4}
        hint={`Şu an ${current === 0 ? '0 (SMS ile giriş durdu)' : fmtNum(current)} · 0: SMS ile giriş durur, Google ile giriş açık kalır.`}
      />
      {changed && <Problem text={problem} />}
      {changed && !problem && v !== null && v > 1000 && <Text style={s.hint}>1.000’in üstü ikinci bir onay ister.</Text>}
      <View style={s.row}>
        <Button
          title={x.value === null ? 'SMS’i durdur' : 'Varsayılana dön'}
          variant="ghost"
          small
          disabled={kit.locked || (x.value === null && current === 0)}
          onPress={() => (x.value === null ? kit.open('SMS ile giriş dursun', () => ({ otp_global_per_hour: 0 }), 'Acil durum') : kit.open('SMS sınırı varsayılana dönsün', () => ({ otp_global_per_hour: null }), 'Geri dönüş'))}
          style={{ flex: 1 }}
        />
        <Button title="Gözden geçir" variant="tonal" small disabled={kit.locked || !changed || !!problem} onPress={() => v !== null && kit.open('SMS sınırı değişsin', () => ({ otp_global_per_hour: v }))} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// --- Zorunlu sürüm -------------------------------------------------------------------------------------------
function VersionCard({ kit }: { kit: Kit }) {
  const s = useStyles();
  const x = kit.get('min_version');
  const current = typeof x.effective === 'string' ? x.effective : null;
  const [text, setText] = useState(current ?? '');
  const clean = text.trim();
  const problem = clean ? versionError(clean, APP_VERSION) : null;
  return (
    <Card title="Zorunlu sürüm" footer={lastChange(x)} pill={<InvalidPill x={x} />}>
      <Text style={s.currentBig}>{current ? `En az ${current}` : 'Zorunlu sürüm yok'}</Text>
      <Text style={s.hint}>{`Senin uygulaman: ${APP_VERSION}. Bundan yeni bir sürümü zorunlu yapamazsın. Eski uygulamalar “Güncelleme gerekli” ekranında kalır; yöneticiler devam edebilir.`}</Text>
      <Field label="Yeni zorunlu sürüm" value={text} onChange={setText} placeholder="1.2.3" max={20} mono />
      <Problem text={problem} />
      <View style={s.row}>
        <Button
          title="Varsayılana dön"
          variant="ghost"
          small
          disabled={kit.locked || x.value === null}
          onPress={() => kit.open('Zorunlu sürüm varsayılana dönsün', () => ({ min_version: null }), 'Geri dönüş')}
          style={{ flex: 1 }}
        />
        <Button
          title="Gözden geçir"
          variant="tonal"
          small
          disabled={kit.locked || !clean || !!problem || clean === current}
          onPress={() => kit.open('Zorunlu sürüm değişsin', () => ({ min_version: clean }))}
          style={{ flex: 1 }}
        />
      </View>
      {!!kit.view.env.minVersion && <Text style={s.footer}>{`Varsayılan, sunucu ayarındaki ${kit.view.env.minVersion}.`}</Text>}
    </Card>
  );
}

// --- Geçmiş --------------------------------------------------------------------------------------------------
function HistoryCard({
  view,
  load,
  names,
  locked,
  byKey,
  open,
}: {
  view: LiveSettingsView;
  load: Load<History>;
  names: Names;
  locked: boolean;
  byKey: Map<LiveKey, LiveSetting>;
  open: (job: LiveJob, suggest?: 'Geri dönüş') => void;
}) {
  const s = useStyles();
  const [more, setMore] = useState<{ v: number; batches: LiveBatch[]; next: number | null; busy: boolean; error: string | null }>({ v: view.v, batches: [], next: null, busy: false, error: null });
  // Older pages read for an earlier version are dropped when the settings change.
  const extra = more.v === view.v ? more : { v: view.v, batches: [], next: null, busy: false, error: null };
  const first = load.data;
  const batches = [...(first?.batches ?? []), ...extra.batches];
  const cursor = extra.batches.length ? extra.next : (first?.next ?? null);
  const older = () => {
    if (cursor === null) return;
    setMore({ ...extra, busy: true, error: null });
    loadHistory(cursor).then(
      (r) => setMore({ v: view.v, batches: [...extra.batches, ...r.batches], next: r.next, busy: false, error: null }),
      (e: unknown) => setMore({ ...extra, busy: false, error: e instanceof Error ? e.message : String(e) }),
    );
  };
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>GEÇMİŞ</Text>
      <LoadState load={load} empty={(d) => (d.batches.length ? null : { icon: 'time-outline', title: 'Henüz değişiklik yok', text: 'Kaydedilen her değişiklik burada görünür; buradan geri alınabilir.' })}>
        {() => (
          <>
            {batches.map((b) => (
              <ItemCard
                key={b.batch}
                title={b.changes.map((c) => c.label).join(', ')}
                sub={`${b.by?.name ?? 'Yönetici'} · ${fmtIstanbul(b.at)}`}
                pill={b.rollbackOf ? <StatusPill text="Geri alma" tone="action" /> : undefined}
                actions={
                  <Button
                    title="Geri al"
                    icon="arrow-undo-outline"
                    variant="tonal"
                    small
                    disabled={locked}
                    onPress={() => open({ kind: 'rollback', title: 'Bu değişiklik geri alınsın', batch: b.batch }, 'Geri dönüş')}
                  />
                }
              >
                <Quote text={b.reason} />
                {b.changes.map((c) => (
                  <View key={c.key} style={s.histLine}>
                    <Text style={s.histLabel}>{c.label}</Text>
                    <Text style={s.histValue}>{`${valueText(c.key, c.before, { stored: true, names })} → ${valueText(c.key, c.after, { stored: true, names })}`}</Text>
                    <ListRow
                      title="Varsayılana dön"
                      icon="refresh-outline"
                      tone="neutral"
                      disabled={locked || !byKey.has(c.key) || byKey.get(c.key)?.value === null}
                      onPress={() => open({ kind: 'save', title: `${c.label} varsayılana dönsün`, build: () => ({ [c.key]: null }) }, 'Geri dönüş')}
                      chevron={false}
                    />
                  </View>
                ))}
              </ItemCard>
            ))}
            {!!extra.error && <Notice tone="danger" icon="cloud-offline-outline" text={extra.error} />}
            {cursor !== null && <Button title={extra.busy ? 'Yükleniyor…' : 'Daha eski'} variant="ghost" disabled={extra.busy} onPress={older} />}
          </>
        )}
      </LoadState>
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, surface, lift }) => ({
  section: { gap: space.sm },
  sectionLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: space.xs, marginTop: space.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: surface.rim, ...lift },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800', flex: 1 },
  footer: { color: colors.textDim, fontSize: 12, lineHeight: 17, paddingHorizontal: space.xs, opacity: 0.9 },
  hint: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  problem: { color: semantic.danger, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  example: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  current: { gap: 6, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  currentBig: { color: colors.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: {
    minWidth: 48,
    height: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepText: { color: colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stepValue: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 76, textAlign: 'center', fontVariant: ['tabular-nums'] },
  off: { opacity: 0.4 },
  input: { color: colors.text, fontSize: 15, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, borderWidth: 1, borderColor: colors.border },
  // minWidth 0: on web an input keeps its intrinsic width and would push the +0,10 button out of the card.
  rateInput: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 48, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 10 },
  draftBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  histLine: { gap: 2 },
  histLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  histValue: { color: colors.text, fontSize: 14, lineHeight: 19 },
}));
