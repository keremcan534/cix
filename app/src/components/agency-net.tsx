// Building blocks of the agency network panels (ajans/ofis, ajans/merkez, the hub): loading and example-data
// states, KPI tiles, the commission split bar, the tier ladder, tabs, status pills, a small stacked bar chart and
// a reason sheet (every centre decision and every request carries a written reason).
//
// Chart colors are validated on the card surface (dark mode, dataviz validator): own share #0A9FA5, parent share
// #C27F1C, the rest neutral. Text never wears a series color; legends always name the series.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DepthCard } from '@/components/fx/surface';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { fmtD, fmtPct, fmtScore, fmtUsd, usdOf, type Loaded, type Tier } from '@/lib/agency-net';
import { colors, fonts, radius, semantic, space } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
export const SERIES = { own: '#0A9FA5', parent: '#C27F1C', rest: '#33445F' } as const;

/** The example-data label: shown on every panel while the server cannot be reached. */
export function DemoBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={s.demo} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color={semantic.money} />
      <Text style={s.demoText}>Örnek veri — sunucu bağlantısı yok</Text>
      {onRetry && (
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button" accessibilityLabel="Tekrar dene">
          <Text style={s.demoRetry}>Tekrar dene</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Loading / error / content for one loaded resource; the example label goes above the content. */
export function NetState<T>({ q, children }: { q: Loaded<T>; children: (data: T) => ReactNode }) {
  if (q.loading && !q.data)
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primaryText} />
      </View>
    );
  if (q.error || !q.data)
    return (
      <View style={[s.center, { gap: space.md }]}>
        <Ionicons name="alert-circle-outline" size={36} color={semantic.danger} />
        <Text style={s.errTitle}>Yüklenemedi</Text>
        <Text style={s.dimCenter}>{q.error ?? 'Veri yok'}</Text>
        <Button title="Tekrar dene" variant="tonal" small onPress={q.reload} />
      </View>
    );
  return (
    <>
      {q.demo && <DemoBanner onRetry={q.reload} />}
      {children(q.data)}
    </>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: object }) {
  return <DepthCard style={[s.panel, style]}>{children}</DepthCard>;
}

/** A headline number with its label and an optional second line (USD, change). */
export function Kpi({ label, value, sub, icon, tone = 'action' }: { label: string; value: string; sub?: string; icon?: IconName; tone?: 'action' | 'money' | 'social' | 'success' | 'danger' }) {
  const c = { action: semantic.action, money: semantic.money, social: semantic.social, success: semantic.success, danger: semantic.danger }[tone];
  return (
    <DepthCard style={s.kpi}>
      <View style={s.kpiHead}>
        {icon && (
          <View style={[s.kpiIcon, { backgroundColor: `${c}1F` }]}>
            <Ionicons name={icon} size={14} color={c} />
          </View>
        )}
        <Text style={s.kpiLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {!!sub && (
        <Text style={s.kpiSub} numberOfLines={1}>
          {sub}
        </Text>
      )}
    </DepthCard>
  );
}
export function KpiGrid({ children }: { children: ReactNode }) {
  return <View style={s.kpiGrid}>{children}</View>;
}

/** Diamonds as the figure, the unit and USD value underneath (5000 diamonds = 1 USD); keeps big figures on one line. */
export const diamondsKpi = (v: number | null | undefined) => ({ value: fmtD(v), sub: v === null || v === undefined ? 'elmas' : `elmas · ${fmtUsd(usdOf(v))}` });

/**
 * How one gift's commission splits: this agency's rate, the parent's difference share and what the platform keeps,
 * on one bar of 100% of the streamer's gift diamonds (the streamer's own diamonds are not reduced).
 */
export function RateSplit({ rate, parentShare, poolCap, ownLabel = 'Bu ajans', parentLabel = 'Üst ajans farkı', note = true }: { rate: number; parentShare: number; poolCap: number; ownLabel?: string; parentLabel?: string; note?: boolean }) {
  // Rates are 4-decimal fractions; round so 0.40 − 0.25 − 0.15 doesn't leave a float crumb as a "%0" segment.
  const rest = Math.max(0, Math.round((poolCap - rate - parentShare) * 1e4) / 1e4);
  const segs = [
    { k: 'own', w: rate, c: SERIES.own, label: ownLabel },
    { k: 'parent', w: parentShare, c: SERIES.parent, label: parentLabel },
    { k: 'rest', w: rest, c: SERIES.rest, label: 'Kullanılmayan havuz' },
  ].filter((x) => x.w > 0);
  return (
    <View style={{ gap: space.sm }}>
      <View style={s.splitTrack} accessibilityLabel={`${ownLabel} ${fmtPct(rate)}, ${parentLabel} ${fmtPct(parentShare)}, toplam havuz sınırı ${fmtPct(poolCap)}`}>
        {segs.map((x, i) => (
          <View key={x.k} style={[s.splitSeg, { width: `${x.w * 100}%`, backgroundColor: x.c, marginLeft: i ? 2 : 0, borderTopLeftRadius: i ? 0 : 4, borderBottomLeftRadius: i ? 0 : 4, borderTopRightRadius: i === segs.length - 1 ? 4 : 0, borderBottomRightRadius: i === segs.length - 1 ? 4 : 0 }]} />
        ))}
      </View>
      <View style={s.legend}>
        {segs.map((x) => (
          <View key={x.k} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: x.c }]} />
            <Text style={s.legendText}>
              {x.label} <Text style={s.legendValue}>{fmtPct(x.w)}</Text>
            </Text>
          </View>
        ))}
      </View>
      {note && <Text style={s.foot}>Toplam ajans havuzu en fazla {fmtPct(poolCap)}. Oranlar yayıncının hediye elmasları üzerinden; yayıncının kendi elması azalmaz, komisyonu platform öder.</Text>}
    </View>
  );
}

/** The tiers from the server's settings, the current one highlighted, with what the next one needs. */
export function TierLadder({ tiers, current, score, poolCap, floor = 0.01 }: { tiers: Tier[]; current: string | null; score: number | null; poolCap: number; floor?: number }) {
  const at = Math.max(0, tiers.findIndex((t) => t.key === current));
  return (
    <View style={{ gap: 6 }}>
      {[...tiers].reverse().map((t) => {
        const i = tiers.indexOf(t);
        const on = i === at;
        const done = i < at;
        return (
          <View key={t.key} style={[s.tier, on && s.tierOn]}>
            <View style={[s.tierDot, on ? { backgroundColor: semantic.action } : done ? { backgroundColor: SERIES.own } : null]}>
              {done && <Ionicons name="checkmark" size={11} color={semantic.actionInk} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.tierName, on && { color: '#fff' }]}>{t.name}</Text>
              <Text style={s.tierNeed}>
                Puan {t.min_score}+{t.min_active ? ` · ${t.min_active} aktif yayıncı` : ''}
                {t.overtake ? ' · üst ajans puanını geçmek' : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.tierRate, on && { color: semantic.action }]}>{fmtPct(t.sub_rate)}</Text>
              <Text style={s.tierNeed}>üst {fmtPct(Math.max(floor, poolCap - t.sub_rate))}</Text>
            </View>
          </View>
        );
      })}
      {score !== null && <Text style={s.foot}>Güncel puan {fmtScore(score)} / 100. Seviye değişiklikleri gelecek dönemden geçerlidir; geçmiş kazançlar değişmez.</Text>}
    </View>
  );
}

/** A 0–100 score bar with the parent's score as a marker. */
export function ScoreBar({ score, parentScore }: { score: number; parentScore?: number | null }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={s.scoreTrack}>
        <View style={[s.scoreFill, { width: `${Math.min(100, Math.max(0, score))}%` }]} />
        {parentScore !== null && parentScore !== undefined && <View style={[s.scoreMark, { left: `${Math.min(100, Math.max(0, parentScore))}%` }]} />}
      </View>
      {parentScore !== null && parentScore !== undefined && (
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: SERIES.own }]} />
            <Text style={s.legendText}>
              Bu ajans <Text style={s.legendValue}>{fmtScore(score)}</Text>
            </Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: '#fff', width: 3 }]} />
            <Text style={s.legendText}>
              Üst ajans <Text style={s.legendValue}>{fmtScore(parentScore)}</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/** Weekly (or monthly) earnings as stacked columns: direct and difference commission; one axis. */
export function StackedColumns({ rows }: { rows: { label: string; a: number; b: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.a + r.b));
  const [sel, setSel] = useState<number | null>(null);
  const shown = sel === null ? rows.length - 1 : sel;
  const cur = rows[shown];
  return (
    <View style={{ gap: space.sm }}>
      {cur && (
        <Text style={s.chartRead}>
          {cur.label}: <Text style={{ color: '#fff' }}>{fmtD(cur.a + cur.b)} elmas</Text> · doğrudan {fmtD(cur.a)} · fark {fmtD(cur.b)}
        </Text>
      )}
      <View style={s.chart}>
        {rows.map((r, i) => {
          const h = ((r.a + r.b) / max) * 100;
          const ha = r.a + r.b ? (r.a / (r.a + r.b)) * h : 0;
          return (
            <Pressable key={r.label + i} onPress={() => setSel(i)} style={s.colHit} accessibilityLabel={`${r.label}: ${fmtD(r.a + r.b)} elmas`}>
              <View style={{ height: `${h}%`, width: '100%', maxWidth: 22, justifyContent: 'flex-end', opacity: shown === i ? 1 : 0.72 }}>
                {r.b > 0 && <View style={{ flex: h - ha, backgroundColor: SERIES.parent, borderTopLeftRadius: 4, borderTopRightRadius: 4, marginBottom: r.a > 0 ? 2 : 0 }} />}
                {r.a > 0 && <View style={{ flex: ha, backgroundColor: SERIES.own, borderTopLeftRadius: r.b > 0 ? 0 : 4, borderTopRightRadius: r.b > 0 ? 0 : 4 }} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={s.axis} />
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: SERIES.own }]} />
          <Text style={s.legendText}>Doğrudan komisyon</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: SERIES.parent }]} />
          <Text style={s.legendText}>Alt ajans farkı</Text>
        </View>
      </View>
    </View>
  );
}

/** Horizontal tabs (glass pills); a locked tab shows a lock and stays selectable to explain why. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string; badge?: number; locked?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.tabs}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.tab, on && s.tabOn]}>
            {o.locked && <Ionicons name="lock-closed" size={11} color={on ? semantic.actionInk : colors.textDim} />}
            <Text style={[s.tabText, on && s.tabTextOn]}>{o.label}</Text>
            {!!o.badge && (
              <View style={[s.badge, on && { backgroundColor: semantic.actionInk }]}>
                <Text style={[s.badgeText, on && { color: semantic.action }]}>{o.badge > 99 ? '99+' : o.badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export type PillTone = 'action' | 'money' | 'success' | 'danger' | 'neutral';
export function Pill({ text, tone = 'neutral', icon }: { text: string; tone?: PillTone; icon?: IconName }) {
  const c = { action: semantic.action, money: semantic.money, success: semantic.success, danger: semantic.danger, neutral: colors.textDim }[tone];
  return (
    <View style={[s.pill, { backgroundColor: `${c}1F`, borderColor: `${c}40` }]}>
      {icon && <Ionicons name={icon} size={11} color={c} />}
      <Text style={[s.pillText, { color: tone === 'neutral' ? colors.textDim : '#fff' }]}>{text}</Text>
    </View>
  );
}
export const statusTone = (st: string): PillTone =>
  st === 'approved' || st === 'completed' || st === 'paid' || st === 'earned' ? 'success' : st === 'pending' || st === 'calculating' || st === 'ready' || st === 'draft' ? 'money' : st === 'rejected' || st === 'suspended' || st === 'closed' || st === 'cancelled' ? 'danger' : 'neutral';

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={28} color={colors.textDim} />
      <Text style={s.dimCenter}>{text}</Text>
    </View>
  );
}

/** A labelled row of two values inside a panel. */
export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={[s.lineValue, strong && { color: '#fff', fontFamily: fonts.displayBold }]}>{value}</Text>
    </View>
  );
}

// --- Reason sheet ---------------------------------------------------------------------------------------------
export type Ask = { title: string; message?: string; placeholder?: string; reasonLabel?: string; confirm?: string; danger?: boolean; min?: number; field?: { label: string; placeholder?: string; keyboard?: 'default' | 'numeric' | 'decimal-pad'; caps?: boolean } };
type AskResult = { reason: string; field: string };

/** A sheet that collects a written reason (and one extra field when needed); returns null when cancelled. */
export function useAsk(): [ReactNode, (a: Ask) => Promise<AskResult | null>] {
  const [ask, setAsk] = useState<(Ask & { resolve: (v: AskResult | null) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const [field, setField] = useState('');
  const open = (a: Ask) =>
    new Promise<AskResult | null>((resolve) => {
      setReason('');
      setField('');
      setAsk({ ...a, resolve });
    });
  const close = (v: AskResult | null) => {
    ask?.resolve(v);
    setAsk(null);
  };
  const min = ask?.min ?? 3;
  const ok = reason.trim().length >= min && (!ask?.field || field.trim().length > 0);
  const node = (
    <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => close(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(null)} accessibilityLabel="Kapat" />
        <DepthCard style={s.sheet}>
          <Text style={s.sheetTitle}>{ask?.title}</Text>
          {!!ask?.message && <Text style={s.sheetMsg}>{ask.message}</Text>}
          {ask?.field && (
            <View style={{ gap: 6 }}>
              <Text style={s.fieldLabel}>{ask.field.label}</Text>
              <TextInput value={field} onChangeText={setField} placeholder={ask.field.placeholder} placeholderTextColor={colors.textDim} keyboardType={ask.field.keyboard ?? 'default'} autoCapitalize={ask.field.caps === false ? 'none' : 'characters'} style={s.input} />
            </View>
          )}
          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>{ask?.reasonLabel ?? 'Gerekçe'}</Text>
            <TextInput value={reason} onChangeText={setReason} placeholder={ask?.placeholder ?? 'Kısa bir açıklama yaz'} placeholderTextColor={colors.textDim} multiline maxLength={300} style={[s.input, { minHeight: 84, textAlignVertical: 'top' }]} />
            <Text style={s.foot}>Kayda geçer ve denetim geçmişinde görünür.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Vazgeç" variant="ghost" onPress={() => close(null)} style={{ flex: 1 }} />
            <Button title={ask?.confirm ?? 'Gönder'} variant={ask?.danger ? 'danger' : 'hero'} disabled={!ok} onPress={() => close({ reason: reason.trim(), field: field.trim() })} style={{ flex: 1 }} />
          </View>
        </DepthCard>
      </KeyboardAvoidingView>
    </Modal>
  );
  return [node, open];
}

export const ns = StyleSheet.create({
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
  title: { color: '#fff', fontSize: 17, fontFamily: fonts.displayBold },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});

const s = StyleSheet.create({
  demo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.md, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: 'rgba(246,189,96,0.12)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.32)', alignSelf: 'flex-start' },
  demoText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  demoRetry: { color: semantic.money, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  center: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  errTitle: { color: '#fff', fontSize: 17, fontFamily: fonts.displayBold },
  dimCenter: { color: colors.textDim, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  panel: { padding: space.lg, gap: space.md },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: { flexGrow: 1, flexBasis: '46%', padding: 14, gap: 4 },
  kpiHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kpiIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  kpiLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600', flex: 1 },
  kpiValue: { color: '#fff', fontSize: 21, fontFamily: fonts.display, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  kpiSub: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  splitTrack: { flexDirection: 'row', height: 14, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' },
  splitSeg: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: colors.textDim, fontSize: 12 },
  legendValue: { color: '#fff', fontWeight: '700', fontVariant: ['tabular-nums'] },
  foot: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  tier: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.03)' },
  tierOn: { backgroundColor: 'rgba(19,217,223,0.10)', borderWidth: 1, borderColor: 'rgba(19,217,223,0.35)' },
  tierDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  tierName: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  tierNeed: { color: colors.textDim, fontSize: 11.5, marginTop: 1 },
  tierRate: { color: '#fff', fontSize: 15, fontFamily: fonts.displayBold, fontVariant: ['tabular-nums'] },
  scoreTrack: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'visible', justifyContent: 'center' },
  scoreFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5, backgroundColor: SERIES.own },
  scoreMark: { position: 'absolute', width: 3, height: 18, marginLeft: -1.5, borderRadius: 2, backgroundColor: '#fff' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 },
  colHit: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  axis: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginTop: -space.sm },
  chartRead: { color: colors.textDim, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  tabs: { gap: 8, paddingHorizontal: space.lg, paddingVertical: space.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  tabOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  tabText: { color: colors.textDim, fontSize: 13, fontFamily: fonts.displayBold },
  tabTextOn: { color: semantic.actionInk },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.social },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: 2 },
  lineLabel: { color: colors.textDim, fontSize: 13, flexShrink: 1 },
  lineValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'right' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4,8,18,0.6)' },
  sheet: { margin: space.md, padding: space.xl, gap: space.lg, borderRadius: radius.xl },
  sheetTitle: { color: '#fff', fontSize: 19, fontFamily: fonts.display },
  sheetMsg: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  fieldLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
});
