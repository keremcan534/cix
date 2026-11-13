// Grouped lists for settings-style screens: a small caps label, a rounded group of rows separated by hairlines,
// and an optional footnote. Rows carry a tinted icon tile, a title with an optional subtitle and one accessory
// (chevron when it navigates, a switch, a value or a custom node). Custom content (chip pickers) goes in a
// ListBlock so it shares the group's padding.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/text';
import { tapHaptic } from '@/lib/haptics';
import { makeStyles, radius, space, useTheme, type Theme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
export type ListTone = 'action' | 'social' | 'money' | 'success' | 'danger' | 'neutral';

/** The tone's color as an icon on the group's surface (also tints the tile behind it). */
const toneColor = ({ semantic, colors }: Theme, t: ListTone): string =>
  ({
    action: semantic.actionText,
    social: semantic.socialText,
    money: semantic.moneyText,
    success: semantic.successText,
    danger: semantic.danger,
    neutral: colors.textDim,
  })[t];

/** Section: label above, rows in one rounded surface, footnote below. Falsy children (conditional rows) are skipped. */
export function ListGroup({ label, footer, children }: { label?: string; footer?: ReactNode; children: ReactNode }) {
  const s = useStyles();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={s.section}>
      {!!label && <Text style={s.label}>{label.toLocaleUpperCase('tr-TR')}</Text>}
      <View style={s.group}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 && <View style={s.separator} />}
            {row}
          </Fragment>
        ))}
      </View>
      {!!footer && (typeof footer === 'string' ? <Text style={s.footer}>{footer}</Text> : footer)}
    </View>
  );
}

export function ListRow({
  icon,
  tone = 'action',
  leading,
  title,
  subtitle,
  value,
  right,
  onPress,
  destructive,
  disabled,
  chevron = !!onPress,
  accessibilityLabel,
  subtitleOneLine,
}: {
  icon?: IconName;
  tone?: ListTone;
  /** Replaces the icon tile (an avatar, an illustration). */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  /** Short text shown before the chevron (current choice, count). */
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  chevron?: boolean;
  accessibilityLabel?: string;
  /** An address or a number: one line, shortened in the middle when it doesn't fit, so the row keeps its height. */
  subtitleOneLine?: boolean;
}) {
  const t = useTheme();
  const s = useStyles();
  const c = destructive ? t.semantic.danger : toneColor(t, tone);
  const body = (
    <>
      {leading ?? (icon && (
        <View style={[s.tile, { backgroundColor: `${c}1F` }]}>
          <Ionicons name={icon} size={17} color={c} />
        </View>
      ))}
      <View style={s.text}>
        <Text style={[s.title, destructive && { color: t.semantic.danger }]} numberOfLines={2}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={s.subtitle} {...(subtitleOneLine && { numberOfLines: 1, ellipsizeMode: 'middle' as const })}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!value && <Text style={s.value} numberOfLines={1}>{value}</Text>}
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={t.colors.textDim} style={{ opacity: 0.7 }} />}
    </>
  );
  if (!onPress) return <View style={[s.row, disabled && s.disabled]}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        tapHaptic();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [s.row, pressed && s.pressed, disabled && s.disabled]}
    >
      {body}
    </Pressable>
  );
}

/** A row whose accessory is a switch in the brand color. */
export function ListSwitch({
  value,
  onChange,
  disabled,
  ...row
}: Omit<Parameters<typeof ListRow>[0], 'right' | 'onPress' | 'chevron' | 'value'> & { value: boolean; onChange: (v: boolean) => void }) {
  const { colors, dark } = useTheme();
  // The off track is a step darker than the card in the light scheme, where cardAlt would vanish on white.
  const off = dark ? colors.cardAlt : colors.border;
  return (
    <ListRow
      {...row}
      disabled={disabled}
      right={
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ false: off, true: colors.primary }}
          thumbColor="#fff"
          ios_backgroundColor={off}
          accessibilityLabel={row.title}
        />
      }
    />
  );
}

/** Free content inside a group (chip pickers, explanations), padded like a row. */
export function ListBlock({ title, children }: { title?: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.block}>
      {!!title && <Text style={s.blockTitle}>{title}</Text>}
      {children}
    </View>
  );
}

/** Single-choice pills for short option lists inside a ListBlock; an option may lead with an icon. */
export function ChoiceChips<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string, ReactNode?][]; onChange: (v: T) => void }) {
  const s = useStyles();
  return (
    <View style={s.chips}>
      {options.map(([v, label, lead]) => {
        const on = value === v;
        return (
          <Pressable
            key={String(v)}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[s.chip, on && s.chipOn]}
          >
            {lead}
            <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors, surface, dark }) => ({
  section: { gap: space.sm },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: space.xs },
  group: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: surface.rim, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: surface.hairline, marginLeft: 58 },
  footer: { color: colors.textDim, fontSize: 12, lineHeight: 17, paddingHorizontal: space.xs, opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 54, paddingHorizontal: 14, paddingVertical: 10 },
  pressed: { backgroundColor: surface.pressed },
  disabled: { opacity: 0.45 },
  tile: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  subtitle: { color: colors.textDim, fontSize: 12, lineHeight: 16 },
  value: { color: colors.textDim, fontSize: 13, fontWeight: '500', maxWidth: 140 },
  block: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  blockTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: dark ? 'rgba(255,95,162,0.16)' : 'rgba(208,46,120,0.10)', borderColor: dark ? 'rgba(255,95,162,0.55)' : 'rgba(184,31,102,0.45)' },
  chipText: { color: colors.textDim, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: colors.text },
}));
