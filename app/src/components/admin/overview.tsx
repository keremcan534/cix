// Yönetim › Özet: is everything fine (server, alarms), what is waiting for the owner, and whether the automatic
// jobs (the finance panel feed, Google's refund check) are running.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { ListGroup, ListRow } from '@/components/list';
import { Text } from '@/components/text';
import { ago, fmtNum, fmtUptime, type Pending } from '@/lib/admin-format';
import * as admin from '@/lib/live/admin';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { LoadState, SectionScroll, useLoad, type Load } from './parts';

type IconName = keyof typeof Ionicons.glyphMap;
export type Tab = 'ozet' | 'ayarlar' | 'sikayet' | 'cekim' | 'ajans' | 'iade' | 'yaptirim';

type Overview = {
  health: admin.Health | null;
  alerts: admin.Alerts | null;
  alertsError: string | null;
  finance: admin.FinanceSync | null;
  google: admin.GoogleSync | null;
};

const settled = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
const reason = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null);

async function loadOverview(): Promise<Overview> {
  const [h, a, f, p] = await Promise.allSettled([admin.health(), admin.alerts(), admin.financeSync(), admin.purchases('')]);
  // Nothing answered: the error state with Tekrar dene, not a page of blanks.
  if ([h, a, f, p].every((x) => x.status === 'rejected')) throw new Error(reason(a) ?? 'Sunucuya ulaşılamadı');
  return { health: settled(h), alerts: settled(a), alertsError: reason(a), finance: settled(f), google: settled(p)?.googleSync ?? null };
}

export function OverviewSection({ pending, onPending, goTo }: { pending: Partial<Pending> | null; onPending: () => void; goTo: (t: Tab) => void }) {
  const load = useLoad(loadOverview);
  const both: Load<Overview> = {
    ...load,
    refresh: () => {
      load.refresh();
      onPending();
    },
  };
  return (
    <SectionScroll load={both}>
      <LoadState load={load}>
        {(d) => (
          <>
            <StatusCard d={d} />
            <PendingTiles pending={pending} goTo={goTo} />
            {!!d.alerts?.warnings.length && (
              <ListGroup label="Uyarılar" footer="Uyarılar sunucunun kendi kontrollerinden gelir ve sorun geçince kendiliğinden kalkar.">
                {d.alerts.warnings.map((w, i) => (
                  <ListRow key={`${w.code}-${i}`} icon="alert-circle-outline" tone="danger" title={w.message} />
                ))}
              </ListGroup>
            )}
            <ListGroup label="Otomatik işler">
              <FinanceRow f={d.finance} />
              <GoogleRow g={d.google} />
            </ListGroup>
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

function StatusCard({ d }: { d: Overview }) {
  const { semantic } = useTheme();
  const s = useStyles();
  const n = d.alerts?.warnings.length ?? 0;
  const down = !d.health;
  const unknown = !d.alerts;
  const tone = down || n > 0 ? semantic.danger : unknown ? semantic.moneyText : semantic.successText;
  const fill = down || n > 0 ? semantic.danger : unknown ? semantic.money : semantic.success;
  const icon: IconName = down ? 'cloud-offline-outline' : n > 0 ? 'alert-circle-outline' : unknown ? 'help-circle-outline' : 'checkmark-circle-outline';
  const title = down ? 'Sunucuya ulaşılamadı' : n > 0 ? `Dikkat isteyen ${n} konu var` : unknown ? 'Uyarılar okunamadı' : 'Her şey yolunda';
  const sub = d.health ? `Sunucu çalışıyor · sürüm ${d.health.version} · ${fmtUptime(d.health.uptime)} önce açıldı` : 'Bağlantı gelince bilgiler burada görünür.';
  return (
    <View style={s.status} accessibilityRole="summary">
      <View style={[s.statusIcon, { backgroundColor: `${fill}1F` }]}>
        <Ionicons name={icon} size={26} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.statusTitle}>{title}</Text>
        <Text style={s.statusSub}>{unknown && d.alertsError ? `${sub} · ${d.alertsError}` : sub}</Text>
      </View>
    </View>
  );
}

function PendingTiles({ pending, goTo }: { pending: Partial<Pending> | null; goTo: (t: Tab) => void }) {
  const s = useStyles();
  const tiles: { tab: Tab; label: string; value: number | undefined; icon: IconName }[] = [
    { tab: 'cekim', label: 'Para çekme', value: pending?.withdrawals, icon: 'cash-outline' },
    { tab: 'ajans', label: 'Ajans ödemesi', value: pending?.payouts, icon: 'business-outline' },
    { tab: 'sikayet', label: 'Şikâyet', value: pending?.reports, icon: 'flag-outline' },
  ];
  return (
    <View style={{ gap: space.sm }}>
      <Text style={s.label}>BEKLEYEN İŞLER</Text>
      <View style={s.tiles}>
        {tiles.map((t) => (
          <Tile key={t.tab} {...t} onPress={() => goTo(t.tab)} />
        ))}
      </View>
    </View>
  );
}

function Tile({ label, value, icon, onPress }: { label: string; value: number | undefined; icon: IconName; onPress: () => void }) {
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const waiting = !!value;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value === undefined ? 'okunamadı' : value ? `${value} bekliyor` : 'bekleyen yok'}`}
      style={({ pressed }) => [s.tile, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={18} color={waiting ? semantic.moneyText : colors.textDim} />
      <Text style={[s.tileValue, !waiting && { color: colors.textDim }]}>{value === undefined ? '–' : fmtNum(value)}</Text>
      <Text style={s.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function FinanceRow({ f }: { f: admin.FinanceSync | null }) {
  if (!f) return <ListRow icon="swap-horizontal-outline" tone="neutral" title="Finans paneline aktarım" subtitle="Durum okunamadı" />;
  if (!f.enabled) return <ListRow icon="swap-horizontal-outline" tone="neutral" title="Finans paneline aktarım" subtitle="Kapalı · sunucuda ayarlanmamış" />;
  const extra = [f.behind > 0 && `sırada ${fmtNum(f.behind)} kayıt`, f.failed > 0 && `reddedilen ${fmtNum(f.failed)} olay`].filter(Boolean).join(' · ');
  const base = f.lastError ? `Sorun var: ${f.lastError}` : f.lastOkAt ? `Çalışıyor · son aktarım ${ago(f.lastOkAt)}` : 'Henüz aktarım olmadı';
  return <ListRow icon="swap-horizontal-outline" tone={f.lastError || f.failed ? 'danger' : 'success'} title="Finans paneline aktarım" subtitle={extra ? `${base} · ${extra}` : base} />;
}

function GoogleRow({ g }: { g: admin.GoogleSync | null }) {
  if (!g) return <ListRow icon="logo-google-playstore" tone="neutral" title="Google Play iade kontrolü" subtitle="Durum okunamadı" />;
  if (!g.enabled) return <ListRow icon="logo-google-playstore" tone="neutral" title="Google Play iade kontrolü" subtitle="Kapalı · Google Play bağlantısı ayarlanmamış" />;
  const every = g.everyMin > 0 ? `${g.everyMin} dakikada bir` : 'Otomatik kontrol kapalı';
  const sub = g.lastError ? `Sorun var: ${g.lastError}` : g.lastOkAt ? `${every} · son kontrol ${ago(g.lastOkAt)}` : `${every} · henüz kontrol edilmedi`;
  return <ListRow icon="logo-google-playstore" tone={g.lastError ? 'danger' : 'success'} title="Google Play iade kontrolü" subtitle={sub} />;
}

const useStyles = makeStyles(({ colors, surface, lift }) => ({
  status: { flexDirection: 'row', alignItems: 'center', gap: space.lg, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: surface.rim, ...lift },
  statusIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  statusSub: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: space.xs },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, minWidth: 0, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.md, gap: 4, borderWidth: 1, borderColor: surface.rim, ...lift },
  tileValue: { color: colors.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
}));
