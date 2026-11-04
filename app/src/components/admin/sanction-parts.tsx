// Shared pieces of the Yaptırımlar screens: a sanction card (what, why, how long, who, its state and the lift
// action), the duration picker (presets the staff member may give, Süresiz / Ömür boyu, a custom length in dk /
// saat / gün / ay / yıl), a labelled input, a multi-select row, a small section label and the run-and-report
// helper. Built on parts.tsx so they look like the rest of the panel.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/list';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { ago, fmtDate } from '@/lib/admin-format';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import * as admin from '@/lib/live/admin';
import {
  APPEAL_LABEL,
  SOURCE_LABEL,
  STATE_LABEL,
  UNITS,
  coverage,
  customError,
  fmtLength,
  lengthOf,
  mayLift,
  minutesFrom,
  roleLabel,
  stateOf,
  type DurationOption,
  type SanctionMeta,
  type SanctionType,
  type StaffSanction,
} from '@/lib/sanction-format';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { ItemCard, Line, Quote, StatusPill, type AdminCtx } from './parts';

/** Runs `job` (already confirmed); success shows `done(r)` and calls `after`, a refusal shows the server's sentence. */
export function run<T>(ctx: AdminCtx, job: () => Promise<T>, done: (r: T) => string, after?: (r: T) => void, setBusy?: (b: boolean) => void) {
  setBusy?.(true);
  job()
    .then((r) => {
      ctx.toast(done(r));
      ctx.changed();
      after?.(r);
    })
    .catch((e: unknown) => showAlert('İşlem yapılamadı', message(e)))
    .finally(() => setBusy?.(false));
}

/** The value after it has stayed the same for `ms` (search as you type). */
export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Small caps label over a group of cards, with an optional count. */
export function SectionLabel({ text, count, right }: { text: string; count?: number; right?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>{text.toLocaleUpperCase('tr-TR')}</Text>
      {count !== undefined && (
        <View style={s.count}>
          <Text style={s.countText}>{count}</Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

/** A quiet line inside a section when it has nothing to show. */
export function EmptyLine({ text }: { text: string }) {
  const s = useStyles();
  return <Text style={s.empty}>{text}</Text>;
}

/** Asks for the reason, then lifts this one sanction (any other keeps running). */
export function askLift(ctx: AdminCtx, x: StaffSanction, after: () => void) {
  ctx.ask({
    kind: 'text',
    title: 'Yaptırımı kaldır',
    message: `${x.label} (#${x.id}) hemen sona erer. Kişinin diğer yaptırımları sürer. Gerekçe işlem kaydına yazılır.`,
    label: 'Kaldırma gerekçesi',
    placeholder: 'Örn. itiraz haklı bulundu',
    suggestions: ['İtiraz haklı bulundu', 'Hatalı uygulama', 'Süre yeterli görüldü'],
    min: 3,
    max: 300,
    confirm: 'Kaldır',
    destructive: true,
    onSubmit: (reason) =>
      run(
        ctx,
        () => admin.liftSanction(x.id, reason),
        () => `#${x.id} kaldırıldı`,
        after,
      ),
  });
}

/** Onayla / Reddet for a pending sanction (needs sanction.approve; the proposer can't approve their own). */
export function ApproveButtons({ x, ctx, onDone }: { x: StaffSanction; ctx: AdminCtx; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const decide = (approve: boolean) =>
    ctx.ask({
      kind: 'text',
      title: approve ? 'Yaptırımı onayla' : 'Yaptırımı reddet',
      message: approve ? `${x.label} (#${x.id}) onaylanınca hemen başlar; süresi onay anından sayılır.` : `${x.label} (#${x.id}) uygulanmaz ve “Reddedildi” olarak kalır.`,
      label: approve ? 'Onay notu' : 'Ret gerekçesi',
      placeholder: approve ? 'Örn. kanıtlar yeterli' : 'Örn. kanıt yetersiz',
      min: 3,
      max: 300,
      confirm: approve ? 'Onayla' : 'Reddet',
      destructive: approve && (x.type === 'account_ban' || x.type === 'device_ban'),
      onSubmit: (note) =>
        run(
          ctx,
          () => admin.approveSanction(x.id, approve, note),
          () => (approve ? `#${x.id} onaylandı ve başladı` : `#${x.id} reddedildi`),
          onDone,
          setBusy,
        ),
    });
  return (
    <>
      <Button title="Onayla" icon="checkmark-circle-outline" variant="tonal" small disabled={busy} onPress={() => decide(true)} />
      <Button title="Reddet" icon="close-circle-outline" variant="ghost" small disabled={busy} onPress={() => decide(false)} />
    </>
  );
}

/** One sanction with everything staff may see; `extra` adds buttons (approve / reject) next to Kaldır. */
export function SanctionCard({
  x,
  ctx,
  perms,
  onChanged,
  userName,
  extra,
}: {
  x: StaffSanction;
  ctx: AdminCtx;
  perms: string[];
  onChanged: () => void;
  /** Shows the person's line (lists that mix people: pending, device bans over others). */
  userName?: string;
  extra?: ReactNode;
}) {
  const state = stateOf(x);
  const [label, tone] = STATE_LABEL[state];
  const len = lengthOf(x);
  const by = x.createdBy.role === 'system' ? 'Otomatik sistem' : [x.createdBy.name, roleLabel(x.createdBy.role)].filter(Boolean).join(' · ');
  const source = [SOURCE_LABEL[x.source] ?? x.source, x.policyStep ? `${x.policyStep}. kademe` : '', x.reportId ? `şikâyet #${x.reportId}` : ''].filter(Boolean).join(' · ');
  const canLift = mayLift(x, perms) && x.status === 'active' && x.live;
  const s = useStyles();
  return (
    <ItemCard title={x.label} sub={`#${x.id} · ${x.reason}`} pill={<StatusPill text={label} tone={tone} />}>
      {userName !== undefined && <Line label="Kişi" value={userName || 'Yaptırım geçmişini aç'} onPress={() => ctx.openSanctions(x.userId, userName || 'Kullanıcı')} />}
      <Line label="Süre" value={fmtLength(x.type, len)} />
      <Line label="Başlangıç" value={state === 'pending' ? 'Onaylanınca başlar' : fmtDate(x.startAt)} />
      <Line label="Bitiş" value={x.endAt ? fmtDate(x.endAt) : fmtLength(x.type, null)} />
      {!!coverage(x) && <Line label="Kapsam" value={coverage(x)} />}
      {x.room && <Line label="Oda" value={x.room.title ?? x.room.id} />}
      {x.deviceId !== null && <Line label="Cihaz" value={`#${x.deviceId}`} mono />}
      <Line label="Uygulayan" value={by} />
      <Line label="Kaynak" value={source} />
      <Line label="Tarih" value={`${fmtDate(x.createdAt)} · ${ago(x.createdAt)}`} />
      {x.approvedBy && <Line label={x.status === 'rejected' ? 'Reddeden' : 'Onaylayan'} value={x.approvedBy.name ?? '—'} />}
      {x.status === 'lifted' && <Line label="Kaldıran" value={[x.revokedBy?.name, fmtDate(x.revokedAt)].filter(Boolean).join(' · ')} />}
      {x.appealStatus && <Line label="İtiraz" value={APPEAL_LABEL[x.appealStatus][0]} />}
      <Text style={s.quoteLabel}>Kullanıcıya gösterilen gerekçe</Text>
      <Quote text={x.reasonText} />
      {!!x.revocationReason && (
        <>
          <Text style={s.quoteLabel}>Kaldırma gerekçesi</Text>
          <Quote text={x.revocationReason} />
        </>
      )}
      {!!x.note && (
        <>
          <Text style={s.quoteLabel}>İç not (yalnızca yetkililer görür)</Text>
          <Quote text={x.note} />
        </>
      )}
      {x.evidence.length > 0 && <Evidence items={x.evidence} />}
      {(canLift || extra) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          {extra}
          {canLift && <Button title="Kaldır" icon="lock-open-outline" variant="ghost" small onPress={() => askLift(ctx, x, onChanged)} />}
        </View>
      )}
    </ItemCard>
  );
}

function Evidence({ items }: { items: StaffSanction['evidence'] }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.quoteLabel}>Kanıtlar</Text>
      {items.map((e) => (
        <View key={e.id} style={s.evidence}>
          <Ionicons
            name={e.kind === 'link' ? 'link-outline' : e.kind === 'report' ? 'flag-outline' : e.kind === 'message' ? 'chatbubble-outline' : 'document-text-outline'}
            size={15}
            color={colors.textDim}
          />
          <Text style={s.evidenceText} selectable>
            {e.content}
          </Text>
          {!!e.by && <Text style={s.evidenceBy}>{e.by}</Text>}
        </View>
      ))}
    </View>
  );
}

// --- Inputs ------------------------------------------------------------------------------------------------
/** A labelled text box with an optional hint under it. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  max,
  multiline,
  keyboard,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  max?: number;
  multiline?: boolean;
  keyboard?: 'numeric' | 'default';
  mono?: boolean;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[s.inputLabel, { flex: 1 }]}>{label}</Text>
        {!!max && value.length > max * 0.8 && <Text style={s.hint}>{`${value.length}/${max}`}</Text>}
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        style={[s.input, multiline && s.inputMulti, mono && s.mono]}
        maxLength={max}
        multiline={multiline}
        keyboardType={keyboard === 'numeric' ? 'number-pad' : 'default'}
        autoCapitalize={mono ? 'none' : 'sentences'}
        autoCorrect={!mono}
        accessibilityLabel={label}
      />
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

/** A row that toggles one item of a multi-select (devices to ban). */
export function CheckRow({ on, title, sub, onPress, right }: { on: boolean; title: string; sub?: string; onPress: () => void; right?: ReactNode }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={({ pressed }) => [s.check, on && s.checkOn, pressed && { opacity: 0.85 }]}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primaryText : colors.textDim} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.checkTitle}>{title}</Text>
        {!!sub && <Text style={s.hint}>{sub}</Text>}
      </View>
      {right}
    </Pressable>
  );
}

const key = (m: number | null) => (m === null ? 'perm' : `m${m}`);

/**
 * Preset lengths (only those allowed), Süresiz / Ömür boyu when allowed, and Özel süre: an amount and a unit.
 * `value` undefined = nothing chosen; null = permanent. `meta` checks a custom length against the permissions.
 */
export function DurationPicker({
  type,
  options,
  value,
  onChange,
  meta,
}: {
  type: SanctionType;
  options: DurationOption[];
  value: number | null | undefined;
  onChange: (m: number | null | undefined) => void;
  meta?: Pick<SanctionMeta, 'perms' | 'limits'>;
}) {
  const s = useStyles();
  const preset = value !== undefined && options.some((o) => o.minutes === value);
  const [custom, setCustom] = useState(value !== undefined && !preset);
  const [amount, setAmount] = useState(value && !preset ? String(value) : '');
  const [unit, setUnit] = useState('dk');
  const minutes = minutesFrom(amount, unit);
  const err = custom && amount ? (meta ? customError(type, minutes, meta) : minutes === null ? 'Süre 1 dakika ile 10 yıl arası olmalı' : null) : null;
  const pick = (k: string) => {
    if (k === 'custom') {
      setCustom(true);
      onChange(minutes !== null && !err ? minutes : undefined);
      return;
    }
    setCustom(false);
    const o = options.find((x) => key(x.minutes) === k);
    onChange(o ? o.minutes : undefined);
  };
  const setCustomValue = (a: string, u: string) => {
    setAmount(a);
    setUnit(u);
    const m = minutesFrom(a, u);
    const e = meta ? customError(type, m, meta) : m === null ? 'x' : null;
    onChange(m !== null && !e ? m : undefined);
  };
  const chips: [string, string][] = [...options.map((o): [string, string] => [key(o.minutes), o.label]), ['custom', 'Özel süre']];
  return (
    <View style={{ gap: space.sm }}>
      <ChoiceChips value={custom ? 'custom' : value === undefined ? '' : key(value)} options={chips} onChange={pick} />
      {custom && (
        <View style={s.customRow}>
          <View style={{ width: 96 }}>
            <Field label="Miktar" value={amount} onChange={(a) => setCustomValue(a.replace(/[^\d]/g, ''), unit)} keyboard="numeric" placeholder="Örn. 2" max={7} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.inputLabel}>Birim</Text>
            <ChoiceChips value={unit} options={UNITS.map((u): [string, string] => [u.key, u.label])} onChange={(u) => setCustomValue(amount, u)} />
          </View>
        </View>
      )}
      {!!err && <Text style={s.error}>{err}</Text>}
    </View>
  );
}

const useStyles = makeStyles(({ colors, surface, semantic }) => ({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.xs, marginTop: space.sm },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  countText: { color: colors.text, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  empty: { color: colors.textDim, fontSize: 13, paddingHorizontal: space.xs },
  quoteLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  evidence: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  evidenceText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  evidenceBy: { color: colors.textDim, fontSize: 11 },
  inputLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  input: {
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMulti: { minHeight: 76, textAlignVertical: 'top' },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.3, fontSize: 14 },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  error: { color: semantic.danger, fontSize: 12, fontWeight: '600' },
  customRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: surface.rim,
  },
  checkOn: { borderColor: colors.primaryText },
  checkTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
}));
