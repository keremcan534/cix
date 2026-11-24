// VIP aylık değerlendirme on the VIP tab (owners, 24 Nov 2026; server/api/vip-month.mjs, lib/vip-month), in the tab's
// own look (the gold-rimmed points panel, the picked level's colours): "Bu ay" — the month's points against the keep
// amount, the next level, the evaluation date, a missed month, the protection period — and the table of every
// level's keep amount and what moving up from it takes, the account's own level marked.
import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { keepTable, monthLines, type VipMonth } from '@/lib/vip-month';
import { VipPanel } from './vip-rights';

const n = (x: number) => x.toLocaleString('tr-TR');
/** The points panel's text colours (vip-rights.tsx infoText) and the heading's gold. */
const TEXT = '#d8c29c';
const DIM = '#b9a8c9';
const GOLD = '#f4dfa6';
const dateText = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });

function Bar({ progress, warn }: { progress: number; warn?: boolean }) {
  return (
    <View style={s.track}>
      <LinearGradient colors={warn ? ['#f9a8a8', '#e25563'] : ['#fcefc0', '#e8c37a', '#c99a4f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: `${Math.max(3, progress * 100)}%` }]} />
    </View>
  );
}

/** "Bu ay": the bar to the keep amount (or to the next level once kept) and the sentences. */
export function VipMonthCard({ m, level, onExtend, busy }: { m: VipMonth; level: number; onExtend?: () => void; busy?: boolean }) {
  const lines = monthLines(m, dateText);
  const keeping = m.active && !m.first && !m.kept;
  const target = keeping ? m.keep : m.next ? m.points + m.next.need : m.points;
  const progress = target > 0 ? Math.min(1, m.points / target) : 1;
  return (
    <VipPanel level={level} title="Bu ay">
      {m.active && m.evalAt && <Text style={s.dim}>Değerlendirme: {dateText(m.evalAt)} 00:00</Text>}
      {m.active && (
        <View style={{ gap: 5 }}>
          <Bar progress={progress} warn={keeping && m.misses > 0} />
          <View style={s.row}>
            <Text style={s.figure}>{n(m.points)} puan</Text>
            <Text style={s.dim}>{keeping ? `koruma ${n(m.keep)}` : m.next ? `VIP ${m.next.level}: ${n(m.points + m.next.need)}` : 'en üst seviye'}</Text>
          </View>
        </View>
      )}
      {lines.map((t) => (
        <Text key={t} style={s.text} maxFontSizeMultiplier={1.2}>
          {t}
        </Text>
      ))}
      {m.extension?.offered && onExtend && (
        <Pressable disabled={busy} onPress={onExtend} accessibilityRole="button" style={busy && { opacity: 0.6 }}>
          <LinearGradient colors={['#b06cf0', '#7c3aed', '#5b21b6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.button}>
            <Text style={s.buttonText}>
              Yükseltme koruma dönemi · {m.extension.days} gün · {n(m.extension.price)} jeton
            </Text>
          </LinearGradient>
        </Pressable>
      )}
      {m.extension?.bought && <Text style={s.dim}>Bu ay yükseltme koruma dönemi alındı; değerlendirme ertelendi.</Text>}
    </VipPanel>
  );
}

const Cell = ({ children, first, head, mine }: { children: ReactNode; first?: boolean; head?: boolean; mine?: boolean }) => (
  <Text style={[s.cell, first && s.first, head && s.head, mine && s.mineText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.15}>
    {children}
  </Text>
);

/** Every level: its points, the keep amount (each month) and what moving up from it takes; `mine` marked. */
export function VipKeepTable({ levels, mine, level }: { levels: { level: number; xp: number; name: string }[]; mine: number; level: number }) {
  const rows = keepTable(levels);
  return (
    <VipPanel level={level} title="Seviye koruma tablosu">
      <View style={[s.tr, s.th]}>
        <Cell first head>
          Seviye
        </Cell>
        <Cell head>Toplam</Cell>
        <Cell head>Aylık koruma</Cell>
        <Cell head>Sonrakine</Cell>
      </View>
      {rows.map((r) => (
        <View key={r.level} style={[s.tr, r.level === mine && s.mine]}>
          <Cell first mine={r.level === mine}>
            {r.name}
          </Cell>
          <Cell mine={r.level === mine}>{n(r.points)}</Cell>
          <Cell mine={r.level === mine}>{n(r.keep)}</Cell>
          <Cell mine={r.level === mine}>{r.next === null ? '—' : n(r.next)}</Cell>
        </View>
      ))}
      <Text style={s.dim} maxFontSizeMultiplier={1.2}>
        1 yüklenen jeton = 1 puan. Aylık koruma yüklenmezse seviye bir düşer; iki ay üst üste tutmazsa VIP sıfırlanır. Ay içinde yükselen yeni seviyesinde kalır.
      </Text>
    </VipPanel>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  text: { color: TEXT, fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  dim: { color: DIM, fontSize: 11.5, lineHeight: 15.5 },
  figure: { color: GOLD, fontSize: 14, fontWeight: '800' },
  track: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,240,220,0.12)', overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  button: { marginTop: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', boxShadow: '0 0 10px rgba(176,108,240,0.45)' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 12.5, textAlign: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 8 },
  th: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(244,223,166,0.35)', borderRadius: 0 },
  cell: { flex: 1, color: TEXT, fontSize: 12, textAlign: 'right' },
  first: { flex: 0.85, textAlign: 'left', fontWeight: '700' },
  head: { color: DIM, fontSize: 10.5, fontWeight: '700' },
  mine: { backgroundColor: 'rgba(244,223,166,0.16)' },
  mineText: { color: GOLD, fontWeight: '800' },
});
