// Shared building blocks for the agency application screens (applicant form, BD/Admin panel, agency account).
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { STATUS_TONE, personName, setViewer, useViewer, type AppStatus, type StatusChange } from '@/lib/agency-apps';
import { tapHaptic } from '@/lib/haptics';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const TONE: Record<string, { fg: string; bg: string }> = {
  neutral: { fg: colors.textDim, bg: 'rgba(167,156,201,0.14)' },
  info: { fg: '#7DD3FC', bg: 'rgba(56,189,248,0.14)' },
  warn: { fg: colors.gold, bg: 'rgba(251,191,36,0.14)' },
  good: { fg: '#86EFAC', bg: 'rgba(34,197,94,0.16)' },
  bad: { fg: '#FCA5A5', bg: 'rgba(239,68,68,0.16)' },
};

export function StatusBadge({ status, tone }: { status: string; tone?: keyof typeof TONE }) {
  const t = TONE[tone ?? STATUS_TONE[status as AppStatus] ?? 'neutral'];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{status}</Text>
    </View>
  );
}

export function Section({ title, icon, right, children }: { title: string; icon?: keyof typeof Ionicons.glyphMap; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.sectionHead}>
        {icon && <Ionicons name={icon} size={17} color={colors.primaryText} />}
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  multiline,
  keyboardType,
  hint,
  right,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  hint?: string;
  right?: ReactNode;
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>
        {label}
        {required ? <Text style={{ color: colors.pink }}> *</Text> : <Text style={s.optional}> · isteğe bağlı</Text>}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          multiline={multiline}
          keyboardType={keyboardType}
          maxLength={maxLength}
          accessibilityLabel={label}
          style={[s.input, multiline && { minHeight: 84, textAlignVertical: 'top' }, { flex: 1, minWidth: 0 }]}
        />
        {right && <View style={{ flexShrink: 0 }}>{right}</View>}
      </View>
      {hint && <Text style={s.dim}>{hint}</Text>}
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange, wrap = true }: { options: { key: T; label: string }[]; value: T | null; onChange: (v: T) => void; wrap?: boolean }) {
  const body = options.map((o) => (
    <Pressable
      key={o.key}
      onPress={() => {
        tapHaptic();
        onChange(o.key);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: value === o.key }}
      style={[s.chip, value === o.key && s.chipOn]}
    >
      <Text style={[s.chipText, value === o.key && { color: '#fff' }]}>{o.label}</Text>
    </Pressable>
  ));
  return wrap ? <View style={s.chips}>{body}</View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{body}</ScrollView>;
}

export function KV({ k, v }: { k: string; v: string | ReactNode }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvKey}>{k}</Text>
      {typeof v === 'string' ? <Text style={s.kvVal}>{v || '—'}</Text> : <View style={{ flex: 1 }}>{v}</View>}
    </View>
  );
}

export function Timeline({ items }: { items: StatusChange[] }) {
  return (
    <View style={{ gap: 0 }}>
      {[...items].reverse().map((h, i) => (
        <View key={h.id} style={s.tlRow}>
          <View style={{ alignItems: 'center' }}>
            <View style={[s.tlDot, i === 0 && { backgroundColor: colors.primaryText }]} />
            {i < items.length - 1 && <View style={s.tlLine} />}
          </View>
          <View style={{ flex: 1, paddingBottom: 12, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <StatusBadge status={h.to} />
              <Text style={s.mono}>{h.at}</Text>
            </View>
            <Text style={s.dim}>
              {personName(h.actor)}
              {h.note ? ` · ${h.note}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Demo: act as another staff member to see what their role allows (the server re-checks every action). */
export function ViewerBar({ extra }: { extra?: { id: string; label: string }[] }) {
  const { rbac } = useApp();
  const viewer = useViewer();
  const staff = [...new Set(rbac.userRoles.map((u) => u.userId))].map((uid) => ({
    id: uid,
    label: `${personName(uid)} · ${rbac.userRoles
      .filter((u) => u.userId === uid)
      .map((u) => `${rbac.roles.find((r) => r.id === u.roleId)?.name ?? u.roleId}${u.scope.type === 'region' ? ` (${u.scope.id})` : ''}`)
      .join(', ')}`,
  }));
  const all = [...staff, ...(extra ?? [])];
  return (
    <View style={s.viewer}>
      <Text style={s.viewerLabel}>Demo · şu kişi olarak işlem yap:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {all.map((o) => (
          <Pressable key={o.id} onPress={() => setViewer(o.id)} style={[s.chip, viewer === o.id && s.chipOn]} accessibilityState={{ selected: viewer === o.id }}>
            <Text style={[s.chipText, viewer === o.id && { color: '#fff' }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function Note({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'bad' }) {
  const c = tone === 'info' ? '#7DD3FC' : tone === 'warn' ? colors.gold : '#FCA5A5';
  return (
    <View style={[s.note, { backgroundColor: TONE[tone].bg }]}>
      <Ionicons name={tone === 'info' ? 'information-circle' : tone === 'warn' ? 'alert-circle' : 'lock-closed'} size={16} color={c} />
      <Text style={[s.dim, { flex: 1, color: tone === 'info' ? colors.textDim : c }]}>{text}</Text>
    </View>
  );
}

export function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
      <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={done ? semantic.live : colors.textDim} />
      <Text style={[s.body, !done && { color: colors.textDim }]}>{label}</Text>
    </View>
  );
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  body: { color: '#fff', fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  mono: { color: colors.textDim, fontSize: 12, fontFamily: MONO },
  label: { color: '#fff', fontSize: 14, fontWeight: '700' },
  optional: { color: colors.textDim, fontSize: 12, fontWeight: '400' },
  input: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: colors.border },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, maxWidth: 320 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  kv: { flexDirection: 'row', gap: 10, paddingVertical: 3 },
  kvKey: { color: colors.textDim, fontSize: 13, width: 128 },
  kvVal: { color: '#fff', fontSize: 13, flex: 1, fontWeight: '600' },
  tlRow: { flexDirection: 'row', gap: 10 },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border, marginTop: 6 },
  tlLine: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 2 },
  viewer: { backgroundColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.3)', borderWidth: 1, borderRadius: 14, padding: 10, gap: 8, marginHorizontal: 16, marginBottom: 8 },
  viewerLabel: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 12, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  stat: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.cardAlt, borderRadius: 14, padding: 12, gap: 2 },
  statLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  statValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
