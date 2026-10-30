// "Yayına Katılma Modu" sheet: mode tabs, a 3-column grid of layout cards (mini schema, mic count, room level,
// lock and how it opens, PK badge in PK rooms, selection). Picking only ASKS lib/room-modes; the card shows as
// selected only after the domain accepted the change, and a refusal is shown as such.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { layoutSummary, type ModeId, type RoomLayout } from '@/data/room-layouts';
import type { Result } from '@/lib/room-presence';
import { enabledModes, layoutAccess, layoutsOf, modeById, type StageInfo } from '@/lib/room-modes';
import { colors, radius, semantic, space } from '@/theme';

const GAP = 10;
const PREVIEW_H = 64;
const TEAM_TINT = { red: '#FF6576', blue: '#38BDF8' } as const;

/** Small drawing of a layout schema (content screen, video tiles, mics, team zones, couple pairs). */
export function LayoutPreview({ layout, width, pkRoom }: { layout: RoomLayout; width: number; pkRoom: boolean }) {
  const s = layout.layoutSchema;
  const stage = s.slots.filter((x) => x.area === 'stage');
  const side = s.slots.filter((x) => x.area === 'side');
  const cols = Math.max(s.columns, 4);
  const screen = modeById(layout.modeId).content === 'always';
  const screenH = screen ? Math.round((width - 16) * 0.32) + 3 : 0;
  // Fit both ways: row heights in dot units (video tile 1.9, couple main 1.7, mic 1) plus 3 px between rows.
  const units = [...Array(s.rows).keys()].reduce((sum, r) => {
    const row = stage.filter((x) => x.row === r);
    return sum + (row.some((x) => x.kind === 'video') ? 1.9 : row.some((x) => x.kind === 'main') ? 1.7 : 1);
  }, 0);
  const byHeight = (PREVIEW_H - 8 - screenH - (s.rows - 1) * 3) / units;
  const byWidth = (width - 8 - (side.length ? 14 : 0)) / (cols * 1.45);
  const dot = Math.max(4, Math.min(11, Math.floor(Math.min(byHeight, byWidth))));
  const paired = new Set(s.pairs.flat());
  const slot = (i: number) => {
    const x = s.slots[i];
    if (x.kind === 'video')
      return (
        <View key={i} style={[st.tile, { width: dot * 2.6, height: dot * 1.9 }]}>
          <Ionicons name="videocam" size={Math.max(7, dot)} color={semantic.action} />
        </View>
      );
    const size = x.kind === 'main' ? dot * 1.7 : dot;
    const tint = x.team && pkRoom ? TEAM_TINT[x.team] : undefined;
    return <View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint ?? 'rgba(255,255,255,0.45)' }} />;
  };
  const rows = [...Array(s.rows).keys()].map((r) => stage.filter((x) => x.row === r));
  return (
    <View style={[st.preview, { width }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {screen && (
        <View style={[st.screen, { width: width - 16, height: Math.round((width - 16) * 0.32) }]}>
          <Ionicons name="film" size={14} color={colors.gold} />
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <View style={{ gap: 3, alignItems: 'center' }}>
          {rows.map((r, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
              {r.map((x, k) => (
                <View key={x.index} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  {slot(x.index)}
                  {paired.has(x.index) && k % 2 === 0 && r[k + 1] && paired.has(r[k + 1].index) && <Ionicons name="heart" size={dot} color={semantic.social} />}
                </View>
              ))}
            </View>
          ))}
        </View>
        {side.length > 0 && <View style={{ gap: 2, flexWrap: 'wrap', maxHeight: PREVIEW_H - 8, width: dot * 2.4 }}>{side.map((x) => slot(x.index))}</View>}
      </View>
    </View>
  );
}

export function LayoutPickerSheet({
  visible,
  onClose,
  layoutId,
  modeId,
  info,
  classicLabel,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  layoutId: string | null;
  modeId: ModeId | null;
  info: StageInfo;
  /** "Klasik düzen · 10 mikrofon": the room's grid from before modes existed. */
  classicLabel: string;
  /** Asks the domain; the sheet shows its answer. */
  onPick: (layoutId: string | null) => Result;
}) {
  const [tab, setTab] = useState<ModeId>(modeId ?? 'audio');
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [gridW, setGridW] = useState(0);
  // Reopening starts on the room's current mode and without an old message.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setTab(modeId ?? 'audio');
      setNote(null);
    }
  }
  const pkRoom = info.theme === 'pk';
  const cardW = gridW ? Math.floor((gridW - GAP * 2) / 3) : 0;
  const pick = (l: RoomLayout | null) => {
    if (l) {
      const a = layoutAccess(l, info);
      if (!a.ok) return setNote({ tone: 'warn', text: `🔒 ${l.name}: ${a.reason}` });
    }
    const r = onPick(l?.id ?? null);
    setNote(r.ok ? { tone: 'ok', text: `✓ ${l ? `${modeById(l.modeId).name} · ${l.name}` : classicLabel} uygulandı.` } : { tone: 'err', text: r.reason });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Pencereyi kapat" />
      <View style={st.sheet}>
        <View style={st.head}>
          <Text style={st.title} accessibilityRole="header">
            Yayına Katılma Modu
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat" style={st.close}>
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs} accessibilityRole="tablist" style={st.tabBar}>
          {enabledModes().map((m) => {
            const on = m.id === tab;
            return (
              <Pressable key={m.id} onPress={() => setTab(m.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${m.name}: ${m.desc}`} style={st.tab}>
                <Text style={[st.tabText, on && st.tabOn]}>{m.name}</Text>
                {modeId === m.id && <View style={st.tabDot} />}
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={st.desc}>{modeById(tab).desc}</Text>
        <ScrollView contentContainerStyle={{ paddingBottom: space.lg }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          <View style={st.grid}>
            {cardW > 0 &&
              layoutsOf(tab).map((l) => {
                const access = layoutAccess(l, info);
                const selected = l.id === layoutId;
                const locked = !access.ok;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => pick(l)}
                    style={[st.card, { width: cardW }, selected && st.cardOn, locked && st.cardLocked]}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: locked }}
                    accessibilityLabel={`${l.name}. ${layoutSummary(l)}. Oda seviyesi ${l.minimumRoomLevel} gerekir.${locked ? ` Kilitli: ${access.reason}` : ''}${selected ? ' Şu an seçili.' : ''}${l.isPkLayout && pkRoom ? ' PK düzeni.' : ''}`}>
                    {l.isPkLayout && pkRoom && (
                      <View style={st.pk}>
                        <Text style={st.pkText}>PK</Text>
                      </View>
                    )}
                    {selected && (
                      <View style={st.check}>
                        <Ionicons name="checkmark" size={12} color={semantic.actionInk} />
                      </View>
                    )}
                    <LayoutPreview layout={l} width={cardW - 12} pkRoom={pkRoom} />
                    <Text style={st.cardName} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <View style={[st.lv, locked && st.lvLocked]}>
                      {locked && <Ionicons name={access.code === 'level' ? 'lock-closed' : 'ban'} size={10} color={colors.gold} />}
                      <Text style={[st.lvText, locked && { color: colors.gold }]}>OdaLv.{l.minimumRoomLevel}</Text>
                    </View>
                  </Pressable>
                );
              })}
          </View>
          {note && (
            <Text style={[st.note, note.tone === 'ok' ? st.noteOk : note.tone === 'warn' ? st.noteWarn : st.noteErr]} accessibilityLiveRegion="polite" accessibilityRole="alert">
              {note.text}
            </Text>
          )}
          <Pressable onPress={() => pick(null)} style={[st.classic, layoutId === null && st.cardOn]} accessibilityRole="button" accessibilityState={{ selected: layoutId === null }} accessibilityLabel={`${classicLabel}${layoutId === null ? ', şu an seçili' : ''}`}>
            <Ionicons name="grid-outline" size={18} color={layoutId === null ? semantic.action : colors.textDim} />
            <Text style={st.classicText}>{classicLabel}</Text>
            {layoutId === null && <Ionicons name="checkmark-circle" size={18} color={semantic.action} />}
          </Pressable>
          <Text style={st.foot}>Kilitli düzenler oda seviyesi yükselince açılır. Mikrofon sayısı azalırken yeni sınırın dışında oturan biri varsa değişiklik yapılmaz. Kapatmak odayı değiştirmez.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, paddingTop: space.md, maxHeight: '82%' },
  head: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm },
  title: { color: colors.text, fontWeight: '800', fontSize: 17 },
  close: { position: 'absolute', right: 0, top: space.sm },
  tabBar: { flexGrow: 0, flexShrink: 0 },
  tabs: { gap: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { alignItems: 'center', paddingVertical: space.xs, minHeight: 36, justifyContent: 'center' },
  tabText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  tabOn: { color: colors.text, fontWeight: '800', fontSize: 16 },
  tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: semantic.action, marginTop: 3 },
  desc: { color: colors.textDim, fontSize: 12, marginVertical: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: { backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', paddingVertical: space.sm, gap: 6, minHeight: 132 },
  cardOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.10)' },
  cardLocked: { opacity: 0.6 },
  preview: { height: PREVIEW_H, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: radius.sm, overflow: 'hidden' },
  screen: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  tile: { backgroundColor: 'rgba(19,217,223,0.18)', borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  cardName: { color: colors.text, fontWeight: '800', fontSize: 13 },
  lv: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  lvLocked: { backgroundColor: 'rgba(246,189,96,0.14)' },
  lvText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  pk: { position: 'absolute', left: 6, top: 6, zIndex: 1, backgroundColor: semantic.social, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  pkText: { color: '#3A0A10', fontSize: 10, fontWeight: '900' },
  check: { position: 'absolute', right: 6, top: 6, zIndex: 1, backgroundColor: semantic.action, borderRadius: 9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: space.md, padding: space.sm, borderRadius: radius.sm, fontSize: 13, lineHeight: 18 },
  noteOk: { color: semantic.tonalText, backgroundColor: semantic.tonal },
  noteWarn: { color: colors.gold, backgroundColor: 'rgba(246,189,96,0.12)' },
  noteErr: { color: semantic.danger, backgroundColor: 'rgba(217,58,69,0.14)' },
  classic: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.cardAlt },
  classicText: { color: colors.text, fontWeight: '700', flex: 1 },
  foot: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginTop: space.md },
});
