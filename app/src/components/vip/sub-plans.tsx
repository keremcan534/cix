// The Abonelik tab's top: "Abonelik aktif · n gün kaldı", the plan cards (radio buttons; the picked one gold-rimmed
// with a crown tab, the saving on a red badge) and the purple buy button with its crown, as the client's design draws
// them. Plans, prices and savings are the server's (levels-live-core subPlansOf); nothing here is hard-coded.
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { BADGE, PLAN, badgeSize, planA11y, planGrid, planWidth, priceSize, rowsOf, saveText, tryAmount } from '@/lib/vip-screen';
import { SOFT_GLOW, SUB_ART } from './assets';
import { SUB } from './sub-look';

export type SubPlan = { productId: string; days: number; label: string; tl: number; was: number; save: number };

/** "Abonelik aktif · 27 gün kaldı" after the design's crown, centred. */
export function SubStatus({ text }: { text: string }) {
  return (
    <View style={s.status} accessible accessibilityLabel={text}>
      <Image source={SUB_ART.statusCrown.source} style={{ width: SUB_ART.statusCrown.w, height: SUB_ART.statusCrown.h }} resizeMode="contain" />
      <Text style={s.statusText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The plans as radio buttons. One row of three on a 360 dp phone and up, as in the design; two a row on a narrower one
 * or with the phone's text size well up (lib/vip-screen planGrid). Every card of a row is as tall as the picked one
 * less its lift, so the texts line up whatever the text size.
 */
export function PlanCards({ plans, selected, onSelect, width, fontScale }: { plans: SubPlan[]; selected: number; onSelect: (days: number) => void; width: number; fontScale: number }) {
  const { cols, unit } = planGrid(width, fontScale, plans.length);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Abonelik planları" style={{ gap: PLAN.rowGap }}>
      {rowsOf(plans, cols).map((row) => (
        <View key={row.map((p) => p.days).join('-')} style={s.planRow}>
          {row.map((p) => (
            <PlanCard key={p.days} plan={p} on={p.days === selected} unit={unit} onPress={() => onSelect(p.days)} />
          ))}
        </View>
      ))}
    </View>
  );
}

function PlanCard({ plan, on, unit, onPress }: { plan: SubPlan; on: boolean; unit: number; onPress: () => void }) {
  const w = planWidth(unit, on);
  const amount = tryAmount(plan.tl);
  const size = priceSize(amount, w - 2 * PLAN.padX - 3, on ? PLAN.priceOn : PLAN.price);
  const save = saveText(plan.save);
  const ink = on ? '#0C0109' : '#2E3B56';
  const body = (
    <View style={[s.texts, on && s.textsOn]}>
      <Text style={[s.duration, on && { fontSize: 15 }]} numberOfLines={2}>
        {plan.label}
      </Text>
      <View style={s.priceRow}>
        <Text style={[s.prefix, { color: ink }]} maxFontSizeMultiplier={1}>
          TRY
        </Text>
        <Text style={[s.price, { fontSize: size, color: ink }]} maxFontSizeMultiplier={1} numberOfLines={1}>
          {amount}
        </Text>
      </View>
      {plan.was > plan.tl && (
        <Text style={s.was} numberOfLines={1}>
          TRY{tryAmount(plan.was)}
        </Text>
      )}
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={planA11y(plan)}
      style={({ pressed }) => [{ width: w, minHeight: on ? PLAN.hOn : PLAN.h }, !on && { marginTop: PLAN.lift, marginBottom: PLAN.drop }, pressed && { opacity: 0.88 }]}>
      {on ? (
        // A gold rim, light at the top and deep at the bottom, a pale inner line and the cream fill.
        <View style={s.cardOn}>
          <LinearGradient colors={['#F6CD74', '#DD9339', '#C47A1A', '#B46A1A']} locations={[0, 0.35, 0.8, 1]} style={s.rimOn}>
            <LinearGradient colors={['#FEF6EE', '#FEF8F2', '#FEFBF5']} style={s.fillOn}>
              {body}
            </LinearGradient>
          </LinearGradient>
          {/* A small glint on the top rim, as in the design. */}
          <Image source={SOFT_GLOW} resizeMode="stretch" style={s.glint} />
        </View>
      ) : (
        <View style={s.card}>{body}</View>
      )}
      {on && <CrownTab />}
      {save && <SaveBadge text={save} on={on} cardW={w} />}
    </Pressable>
  );
}

/** The picked card's crown tab at its top right, partly under the badge; its right end is round. */
function CrownTab() {
  return (
    <LinearGradient colors={['#F2BE69', '#CA7D23']} style={s.tabRim} pointerEvents="none">
      <LinearGradient colors={['#FEF7E5', '#FDDCAD', '#F8BB6E']} style={s.tabFill}>
        <Image source={SUB_ART.planCrown.source} style={{ width: SUB_ART.planCrown.w, height: SUB_ART.planCrown.h }} resizeMode="contain" />
      </LinearGradient>
    </LinearGradient>
  );
}

/** The red saving badge: centred over a card's top edge; on the picked card a pill inside its top left. */
function SaveBadge({ text, on, cardW }: { text: string; on: boolean; cardW: number }) {
  const room = on ? cardW - BADGE.leftOn - BADGE.crownTab : cardW - 6;
  const size = on ? badgeSize(text, room, BADGE.sizeOn, BADGE.padXOn) : badgeSize(text, room, BADGE.size, BADGE.padX);
  const label = (
    <Text style={[s.badgeText, { fontSize: size }]} numberOfLines={1} maxFontSizeMultiplier={1}>
      {text}
    </Text>
  );
  if (on)
    return (
      <LinearGradient colors={['#E94956', '#E33A4F', '#DE2A48']} style={[s.badgeOn, { maxWidth: room }]} pointerEvents="none">
        <LinearGradient colors={['rgba(215,60,84,0)', 'rgba(204,55,85,0.4)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: BADGE.h / 2 }]} />
        {label}
      </LinearGradient>
    );
  return (
    <View style={s.badgeWrap} pointerEvents="none">
      <LinearGradient colors={['#EA4B54', '#E54C5C', '#D23B5A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.badge, { maxWidth: room }]}>
        {/* The bottom a little darker. */}
        <LinearGradient colors={['rgba(120,0,30,0)', 'rgba(120,0,30,0.14)']} style={[StyleSheet.absoluteFill, { borderRadius: 6.6 }]} />
        {label}
      </LinearGradient>
    </View>
  );
}

/** The design's buy button: a gold rim round a plum-to-rose pill, the crown and "Abonelik Satın Al". */
const BUY_FILL = ['#E46B8C', '#C75586', '#A8377A', '#8C2569', '#7F245E', '#7A1F5C', '#721B54', '#731F5F', '#893679', '#A24B8A', '#CF6D97', '#CE5E8E', '#CF537E'] as const;
const BUY_AT = [0, 0.07, 0.13, 0.19, 0.27, 0.5, 0.68, 0.77, 0.83, 0.86, 0.89, 0.92, 1] as const;

export function SubBuyButton({ onPress, busy, hint }: { onPress: () => void; busy?: boolean; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Abonelik Satın Al"
      accessibilityHint={hint}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      style={({ pressed }) => [s.buy, (busy || pressed) && { opacity: busy ? 0.7 : 0.92 }]}>
      <LinearGradient colors={['#FFF3BE', '#FED07F', '#FCC77A', '#FDCD71', '#E99F62']} locations={[0, 0.2, 0.55, 0.8, 1]} style={s.buyRim}>
        <LinearGradient colors={BUY_FILL} locations={BUY_AT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.buyFill}>
          {/* Lighter at the top, darker at the bottom. */}
          <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.12)']} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
          <Image source={SUB_ART.buyCrown.source} style={{ width: SUB_ART.buyCrown.w, height: SUB_ART.buyCrown.h }} resizeMode="contain" />
          <Text style={s.buyText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {busy ? 'İşleniyor…' : 'Abonelik Satın Al'}
          </Text>
        </LinearGradient>
      </LinearGradient>
      {/* The bright flare on the rim's top middle. */}
      <Image source={SOFT_GLOW} resizeMode="stretch" style={s.buyFlare} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5.4, paddingHorizontal: 8 },
  statusText: { color: SUB.gold, fontSize: 13, lineHeight: 17, fontWeight: '500', flexShrink: 1, textAlign: 'center' },
  planRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'stretch', gap: PLAN.gap },
  card: { flex: 1, borderRadius: 12, backgroundColor: SUB.card, borderWidth: StyleSheet.hairlineWidth, borderColor: SUB.cardEdge, boxShadow: SUB.cardShadow },
  cardOn: { flex: 1, borderRadius: 12, boxShadow: SUB.cardShadowOn },
  rimOn: { flex: 1, borderRadius: 12, padding: 1.4 },
  fillOn: { flex: 1, borderRadius: 10.6, borderWidth: 0.8, borderColor: '#FBD27C' },
  glint: { position: 'absolute', top: -2.5, left: '30%', width: '40%', height: 5, tintColor: '#FFE7A6', opacity: 0.9, pointerEvents: 'none' },
  // The texts start at the same height in every card: the picked one is 9.5 dp higher.
  texts: { flex: 1, alignItems: 'center', paddingTop: 18, paddingBottom: 12, paddingHorizontal: PLAN.padX },
  textsOn: { paddingTop: 18 + PLAN.lift - 2.2, paddingBottom: 12 + PLAN.drop - 2.2 },
  duration: { color: SUB.mauve, fontSize: 14, lineHeight: 18, fontWeight: '500', textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 3, marginTop: 4 },
  prefix: { fontSize: 11.7, lineHeight: 15, fontWeight: '600' },
  price: { lineHeight: 32, fontWeight: '800', letterSpacing: -0.3 },
  was: { color: '#744566', fontSize: 12, lineHeight: 15, fontWeight: '500', marginTop: 1, textDecorationLine: 'line-through', textDecorationColor: '#744566' },
  tabRim: { position: 'absolute', top: -1.5, right: -2, width: 40, height: 18.2, borderRadius: 9, borderTopRightRadius: 12, padding: 0.6 },
  tabFill: { flex: 1, borderRadius: 8.4, borderTopRightRadius: 11.4, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4.4 },
  badgeWrap: { position: 'absolute', top: -5, left: 0, right: 0, alignItems: 'center' },
  badge: { height: BADGE.h, borderRadius: 6.6, paddingHorizontal: BADGE.padX, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeOn: {
    position: 'absolute',
    top: 0.7,
    left: BADGE.leftOn,
    height: BADGE.h,
    borderRadius: BADGE.h / 2,
    paddingHorizontal: BADGE.padXOn,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 6px rgba(225,50,80,0.4)',
  },
  badgeText: { color: '#fff', fontWeight: '800', lineHeight: BADGE.h - 2 },
  // 44 dp tall (the design's 41 plus a little, for the finger).
  buy: { borderRadius: 999, boxShadow: '0 3px 10px rgba(150,30,90,0.22)' },
  buyRim: { borderRadius: 999, padding: 1.6 },
  buyFill: { minHeight: 44 - 3.2, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 18, overflow: 'hidden' },
  buyText: { color: '#fff', fontSize: 17.6, lineHeight: 22, fontWeight: '800', flexShrink: 1 },
  buyFlare: { position: 'absolute', top: -3, left: '36%', width: '28%', height: 7, tintColor: '#FFFFC3', opacity: 0.95, pointerEvents: 'none' },
});
