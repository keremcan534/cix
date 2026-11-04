// Building blocks of the Yönetim panel: loading a list from the server, the calm loading / empty / error states,
// the section scroll with pull-to-refresh, filter chips, item cards with label–value lines, status pills, a
// bottom sheet (a written reason, a payment reference, a ban length) and the short result toast. Themed for
// both schemes through makeStyles / useTheme.
import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoid } from '@/components/keyboard-avoid';

import { Text, TextInput } from '@/components/text';
import { Button, StateIcon } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import { makeStyles, radius, space, useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

// --- Loading -----------------------------------------------------------------------------------------------
export type Load<T> = { data: T | null; error: string | null; loading: boolean; refreshing: boolean; reload: () => void; refresh: () => void };

/**
 * Loads `load()` and again when `deps` change (a filter) or on reload. A failed reload keeps the last answer
 * and its error; `loading` is true only until the first answer for the current deps.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): Load<T> {
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const base = JSON.stringify(deps);
  const key = `${base}#${tick}`;
  const [res, setRes] = useState<{ base: string; data: T | null; error: string | null } | null>(null);
  const fn = useRef(load);
  useEffect(() => {
    fn.current = load;
  });
  useEffect(() => {
    let live = true;
    fn.current()
      .then(
        (data) => ({ data, error: null }),
        (e: unknown) => ({ data: null, error: message(e) }),
      )
      .then((r) => {
        if (!live) return;
        setRes((prev) => ({ base, data: r.data ?? (prev?.base === base ? prev.data : null), error: r.error }));
        setRefreshing(false);
      });
    return () => {
      live = false;
    };
    // `key` carries `base` and the reload tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const same = res?.base === base;
  return {
    data: same ? res.data : null,
    error: same ? res.error : null,
    loading: !same,
    refreshing,
    reload: () => setTick((t) => t + 1),
    refresh: () => {
      setRefreshing(true);
      setTick((t) => t + 1);
    },
  };
}

// --- Panel context: result toast, the account sheet, the input sheet, pending counts -------------------------
export type SheetSpec =
  | {
      kind: 'text';
      title: string;
      message: string;
      label: string;
      placeholder?: string;
      suggestions?: string[];
      min: number;
      max: number;
      confirm: string;
      destructive?: boolean;
      onSubmit: (text: string) => void;
    }
  | { kind: 'choice'; title: string; message: string; options: { value: number; label: string }[]; confirm: string; destructive?: boolean; onSubmit: (value: number) => void };

export type AdminCtx = {
  toast: (text: string) => void;
  ask: (s: SheetSpec) => void;
  openAccount: (id: string, name: string) => void;
  /** Re-reads the pending counts (tab badges, Özet). */
  changed: () => void;
};
export const AdminContext = createContext<AdminCtx>({ toast: () => {}, ask: () => {}, openAccount: () => {}, changed: () => {} });
export const useAdmin = () => useContext(AdminContext);

/**
 * Asks first (`showAlert`), then runs `job`; a success shows `done(result)` as a toast and reloads, a refusal
 * shows the server's own sentence calmly.
 */
export function confirmThen<T>(
  ctx: AdminCtx,
  q: { title: string; message: string; confirm: string; destructive?: boolean },
  job: () => Promise<T>,
  done: (r: T) => string,
  after?: () => void,
  setBusy?: (b: boolean) => void,
) {
  showAlert(q.title, q.message, [
    { text: 'Vazgeç', style: 'cancel' },
    {
      text: q.confirm,
      style: q.destructive ? 'destructive' : 'default',
      onPress: () => {
        setBusy?.(true);
        job()
          .then((r) => {
            ctx.toast(done(r));
            ctx.changed();
            after?.();
          })
          .catch((e: unknown) => showAlert('İşlem yapılamadı', message(e)))
          .finally(() => setBusy?.(false));
      },
    },
  ]);
}

// --- Layout ------------------------------------------------------------------------------------------------
/** The scrolling body of a section, with pull-to-refresh. */
export function SectionScroll({ load, children }: { load: Pick<Load<unknown>, 'refreshing' | 'refresh'>; children: ReactNode }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <ScrollView
      contentContainerStyle={s.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={load.refreshing} onRefresh={load.refresh} tintColor={colors.primaryText} colors={[colors.primary]} />}
    >
      {children}
    </ScrollView>
  );
}

/** Loading, error (with Tekrar dene) or the content; `empty` when the content would be an empty list. */
export function LoadState<T>({ load, empty, children }: { load: Load<T>; empty?: (d: T) => { icon: IconName; title: string; text?: string } | null; children: (d: T) => ReactNode }) {
  const { colors } = useTheme();
  const s = useStyles();
  if (load.loading)
    return (
      <View style={s.state}>
        <ActivityIndicator color={colors.primaryText} />
        <Text style={s.stateText}>Yükleniyor…</Text>
      </View>
    );
  if (!load.data)
    return (
      <View style={s.state}>
        <StateIcon name="cloud-offline-outline" size={56} />
        <Text style={s.stateTitle}>Şu an yüklenemedi</Text>
        {!!load.error && <Text style={s.stateText}>{load.error}</Text>}
        <Button title="Tekrar dene" variant="tonal" small onPress={load.reload} style={{ marginTop: space.sm }} />
      </View>
    );
  const e = empty?.(load.data);
  return (
    <>
      {!!load.error && <Notice tone="danger" icon="cloud-offline-outline" text={`Son yenileme olmadı: ${load.error}`} />}
      {e ? (
        <View style={s.state}>
          <StateIcon name={e.icon} size={56} />
          <Text style={s.stateTitle}>{e.title}</Text>
          {!!e.text && <Text style={s.stateText}>{e.text}</Text>}
        </View>
      ) : (
        children(load.data)
      )}
    </>
  );
}

/** Single-choice filter pills at the top of a list. */
export function Filters<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const s = useStyles();
  return (
    <View style={s.filters} accessibilityRole="radiogroup">
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable key={v} onPress={() => onChange(v)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[s.filter, on && s.filterOn]}>
            <Text style={[s.filterText, on && s.filterTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type Tone = 'action' | 'money' | 'success' | 'danger' | 'neutral';
const useTone = (tone: Tone) => {
  const { semantic, colors } = useTheme();
  return {
    fg: { action: semantic.actionText, money: semantic.moneyText, success: semantic.successText, danger: semantic.danger, neutral: colors.textDim }[tone],
    bg: { action: semantic.action, money: semantic.money, success: semantic.success, danger: semantic.danger, neutral: colors.textDim }[tone],
  };
};

export function StatusPill({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const s = useStyles();
  const c = useTone(tone);
  return (
    <View style={[s.pill, { backgroundColor: `${c.bg}1A`, borderColor: `${c.bg}40` }]}>
      <Text style={[s.pillText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

/** A calm line above a list: what the owner should know before acting. */
export function Notice({ text, tone = 'action', icon = 'information-circle-outline' }: { text: string; tone?: Tone; icon?: IconName }) {
  const s = useStyles();
  const c = useTone(tone);
  return (
    <View style={[s.notice, { backgroundColor: `${c.bg}14`, borderColor: `${c.bg}33` }]} accessibilityRole="text">
      <Ionicons name={icon} size={18} color={c.fg} style={{ marginTop: 1 }} />
      <Text style={s.noticeText}>{text}</Text>
    </View>
  );
}

/** One request, report or purchase. */
export function ItemCard({ title, sub, pill, children, actions }: { title: string; sub?: string; pill?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.cardTitle}>{title}</Text>
          {!!sub && <Text style={s.cardSub}>{sub}</Text>}
        </View>
        {pill}
      </View>
      {children && <View style={s.lines}>{children}</View>}
      {actions && <View style={s.actions}>{actions}</View>}
    </View>
  );
}

/** A label and its value inside an ItemCard; `onCopy` adds a copy button, `onPress` makes the value a link. */
export function Line({ label, value, mono, onCopy, onPress }: { label: string; value: string; mono?: boolean; onCopy?: () => void; onPress?: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  if (!value) return null;
  const v = (
    <Text style={[s.lineValue, mono && s.mono, onPress && { color: colors.primaryText }]} selectable={!onPress}>
      {value}
    </Text>
  );
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <View style={s.lineRight}>
        {onPress ? (
          <Pressable onPress={onPress} hitSlop={6} accessibilityRole="link" style={{ flexShrink: 1 }}>
            {v}
          </Pressable>
        ) : (
          v
        )}
        {onCopy && (
          <Pressable onPress={onCopy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${label} kopyala`} style={s.copy}>
            <Ionicons name="copy-outline" size={15} color={colors.primaryText} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** A quoted free text (a report's note, a decision's note). */
export function Quote({ text }: { text: string }) {
  const s = useStyles();
  if (!text) return null;
  return <Text style={s.quote}>{text}</Text>;
}

// --- Sheet (bottom, over the panel) -------------------------------------------------------------------------
/** The bottom card over a dimmed panel; tapping outside closes it. */
export function Overlay({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const s = useStyles();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.dim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
      <KeyboardAvoid style={s.sheetWrap} pointerEvents="box-none">
        <View style={s.sheet} accessibilityViewIsModal accessibilityLabel={label}>
          <View style={s.grabber} />
          {children}
        </View>
      </KeyboardAvoid>
    </View>
  );
}

/** Asks for a written reason (or a payment reference) or one choice, then hands it to the caller. */
export function InputSheet({ spec, onClose }: { spec: SheetSpec; onClose: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const clean = text.trim();
  const ok = spec.kind === 'text' ? clean.length >= spec.min && clean.length <= spec.max : choice !== null;
  const submit = () => {
    if (!ok) return;
    onClose();
    if (spec.kind === 'text') spec.onSubmit(clean);
    else if (choice !== null) spec.onSubmit(choice);
  };
  return (
    <Overlay onClose={onClose} label={spec.title}>
      <ScrollView contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
        <Text style={s.sheetTitle}>{spec.title}</Text>
        <Text style={s.sheetText}>{spec.message}</Text>
        {spec.kind === 'text' ? (
          <>
            {!!spec.suggestions?.length && (
              <View style={s.filters}>
                {spec.suggestions.map((x) => (
                  <Pressable key={x} onPress={() => setText(x)} style={[s.filter, clean === x && s.filterOn]} accessibilityRole="button">
                    <Text style={[s.filterText, clean === x && s.filterTextOn]}>{x}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={{ gap: 6 }}>
              <Text style={s.inputLabel}>{spec.label}</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={spec.placeholder}
                placeholderTextColor={colors.textDim}
                style={s.input}
                maxLength={spec.max}
                multiline={spec.max > 100}
                autoFocus={!spec.suggestions?.length}
                accessibilityLabel={spec.label}
              />
            </View>
          </>
        ) : (
          <View style={s.filters} accessibilityRole="radiogroup">
            {spec.options.map((o) => {
              const on = choice === o.value;
              return (
                <Pressable key={o.value} onPress={() => setChoice(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[s.filter, s.choice, on && s.filterOn]}>
                  <Text style={[s.filterText, on && s.filterTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={s.sheetButtons}>
          <Button title="Vazgeç" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button title={spec.confirm} variant={spec.destructive ? 'danger' : 'tonal'} onPress={submit} disabled={!ok} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </Overlay>
  );
}

// --- Toast -------------------------------------------------------------------------------------------------
/** The short result of an action, at the bottom for a few seconds. */
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const s = useStyles();
  const { semantic } = useTheme();
  const [o] = useState(() => new Animated.Value(0));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    o.setValue(0);
    const a = Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(3200),
      Animated.timing(o, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
    ]);
    a.start(({ finished }) => finished && done.current());
    return () => a.stop();
  }, [text, o]);
  return (
    <Animated.View style={[s.toast, { opacity: o }]} pointerEvents="none" accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Ionicons name="checkmark-circle" size={18} color={semantic.success} />
      <Text style={s.toastText}>{text}</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, surface, dark, lift }) => ({
  scroll: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 96, gap: space.md },
  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: space.xl, gap: space.sm },
  stateTitle: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: space.xs },
  stateText: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  filterOn: { backgroundColor: dark ? 'rgba(19,217,223,0.16)' : 'rgba(0,140,148,0.10)', borderColor: dark ? 'rgba(19,217,223,0.55)' : 'rgba(0,117,123,0.45)' },
  filterText: { color: colors.textDim, fontWeight: '600', fontSize: 13 },
  filterTextOn: { color: colors.text },
  choice: { paddingHorizontal: 16, paddingVertical: 10 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  notice: { flexDirection: 'row', gap: 10, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  noticeText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: surface.rim, ...lift },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cardSub: { color: colors.textDim, fontSize: 13, fontVariant: ['tabular-nums'] },
  lines: { gap: 8, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: surface.hairline },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  lineLabel: { color: colors.textDim, fontSize: 13, width: 104 },
  lineRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  copy: { padding: 4, borderRadius: radius.sm, backgroundColor: surface.pressed },
  quote: { color: colors.text, fontSize: 13, lineHeight: 19, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: dark ? 'rgba(0,0,0,0.55)' : 'rgba(11,26,46,0.35)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    maxHeight: '88%',
    gap: space.md,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.xs },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sheetText: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  inputLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  input: { color: colors.text, fontSize: 15, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, borderWidth: 1, borderColor: colors.border },
  sheetButtons: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: dark ? colors.cardAlt : '#0B1A2E',
    boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
    maxWidth: 560,
    alignSelf: 'center',
  },
  toastText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
}));
