// Bağlar on a profile: the bonds (Çift, Kardeş, Kanka…), requests to answer, sending a new one with its bond
// gift, ending one, hiding them, and the Lv2 badge / Lv6 frame that a bond gives the profile header.
// Live mode reads and changes everything on the server (lib/live/bonds); the offline demo keeps it on the phone.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { Text } from '@/components/text';
import { Avatar } from '@/components/ui';
import { BOND_KINDS, BOND_LEVELS, BOND_ORDER, BOND_REWARDS, BOND_RULES, bondDays, demoBondsOf, hasReward, sortBonds, topBond, type Bond, type BondKind } from '@/data/bonds';
import { userById, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { ApiError } from '@/lib/api';
import { message } from '@/lib/live';
import { liveBondsFor, liveEndBond, liveRequestBond, liveRespondBond, liveSetBondsHidden, liveWithdrawBond, loadBondRequests, loadBonds } from '@/lib/live/bonds';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

/** Bond gift pictures (docs/BAGLAR.md "Görsel listesi", app/assets/bonds, 192 px). A kind without one yet keeps its
 *  sign on the kind's colours. */
const BOND_ART: Partial<Record<BondKind, number>> = {
  cift: require('../../assets/bonds/bag-cift.png'),
  kardes: require('../../assets/bonds/bag-kardes.png'),
  baci: require('../../assets/bonds/bag-baci.png'),
  agabey: require('../../assets/bonds/bag-agabey.png'),
  abla: require('../../assets/bonds/bag-abla.png'),
  yenge: require('../../assets/bonds/bag-yenge.png'),
  enishte: require('../../assets/bonds/bag-enishte.png'),
  kanka: require('../../assets/bonds/bag-kanka.png'),
};

// --- Offline demo: my requests and endings on this phone, until the app closes ---------------------------
type Demo = { sent: Bond[]; ended: Set<string>; hidden: boolean };
let demo: Demo = { sent: [], ended: new Set(), hidden: false };
const listeners = new Set<() => void>();
const setDemo = (d: Partial<Demo>) => {
  demo = { ...demo, ...d };
  listeners.forEach((l) => l());
};
const useDemo = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => demo,
  );

/** A request I sent on this phone (offline demo): nobody answers it, I can withdraw it. */
const demoRequest = (to: string, kind: BondKind): Bond => ({
  id: `d-sent-${to}-${kind}`,
  kind,
  status: 'pending',
  requester: true,
  partnerId: to,
  price: BOND_KINDS[kind].price,
  score: 0,
  level: 1,
  nextLevelAt: 10,
  since: null,
  expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
});

type Requests = { incoming: Bond[]; outgoing: Bond[] };
export type BondsState = {
  live: boolean;
  bonds: Bond[];
  hidden: boolean;
  requests: Requests;
  loading: boolean;
  reload: () => void;
};

/** Bonds on `userId`'s profile, and my requests. */
export function useBonds(userId: string): BondsState {
  const live = liveBondsFor(userId);
  const d = useDemo();
  const [now] = useState(() => Date.now());
  const [server, setServer] = useState<{ key: string; hidden: boolean; bonds: Bond[]; requests: Requests } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const key = `${userId}:${tick}`;

  useEffect(() => {
    if (!live) return;
    let alive = true;
    Promise.all([loadBonds(userId), loadBondRequests().catch(() => ({ incoming: [], outgoing: [] }))])
      .then(([b, requests]) => alive && setServer({ key: `${userId}:${tick}`, ...b, requests }))
      .catch(() => alive && setServer((s) => (s ? { ...s, key: `${userId}:${tick}` } : { key: `${userId}:${tick}`, hidden: false, bonds: [], requests: { incoming: [], outgoing: [] } })));
    return () => {
      alive = false;
    };
  }, [live, userId, tick]);

  if (live) {
    // A reload keeps showing the last answer for the same person until the new one comes.
    const mine = server && server.key.startsWith(`${userId}:`) ? server : null;
    return { live, bonds: mine?.bonds ?? [], hidden: mine?.hidden ?? false, requests: mine?.requests ?? { incoming: [], outgoing: [] }, loading: mine?.key !== key, reload };
  }

  // Demo: the person's sample bonds, minus the ones I ended on this phone.
  const bonds = demoBondsOf(userId, now).filter((b) => !d.ended.has(b.id));
  const hidden = userId === 'me' ? d.hidden : false;
  return { live, bonds, hidden, requests: { incoming: [], outgoing: d.sent }, loading: false, reload };
}

/** The highest active bond, when the owner shows bonds (header badge and frame). */
export const shownTopBond = (s: BondsState, isMe: boolean) => (isMe || !s.hidden ? topBond(s.bonds) : null);

// --- Header pieces --------------------------------------------------------------------------------------

/** Lv2+: a small chip next to the name. */
export function BondBadge({ bond, onPress }: { bond: Bond | null; onPress: () => void }) {
  const styles = useStyles();
  if (!bond || !hasReward(bond.level, 'rozet')) return null;
  const k = BOND_KINDS[bond.kind];
  return (
    <Pressable onPress={onPress} accessibilityLabel={`${k.label} bağı, seviye ${bond.level}`}>
      <LinearGradient colors={bond.kind === 'cift' ? ['#FF6F91', '#C2185B'] : ['#22B8CF', '#3B5BDB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
        <Ionicons name={k.icon} size={11} color="#fff" />
        <Text style={styles.badgeText}>
          {k.label} Lv.{bond.level}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Lv6+: a ring around the profile photo. Without one, the photo as it is. */
export function BondFrame({ bond, size, children }: { bond: Bond | null; size: number; children: ReactNode }) {
  if (!bond || !hasReward(bond.level, 'cerceve')) return <>{children}</>;
  const pad = 4;
  return (
    <LinearGradient
      colors={bond.kind === 'cift' ? ['#FFC1D3', '#FF4F7B', '#B0174E'] : ['#B5F0FF', '#3BA7FF', '#3B3FD8']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size + pad * 2, height: size + pad * 2, borderRadius: (size + pad * 2) / 2, alignItems: 'center', justifyContent: 'center', margin: -pad }}
    >
      {children}
    </LinearGradient>
  );
}

// --- The tab -------------------------------------------------------------------------------------------

type Seg = 'cift' | 'diger';

export function BondsTab({ user, isMe, state, isBlocked, onMeetInvite }: { user: User; isMe: boolean; state: BondsState; isBlocked: boolean; onMeetInvite: () => void }) {
  const { colors, semantic, dark } = useTheme();
  const styles = useStyles();
  const { me, spendCoins, addCoins } = useApp();
  const [seg, setSeg] = useState<Seg>('cift');
  const [kindSheet, setKindSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const { live, bonds, hidden, requests, reload } = state;

  const shown = isMe || !hidden;
  const list = sortBonds(bonds).filter((b) => (seg === 'cift' ? b.kind === 'cift' : b.kind !== 'cift'));
  // Viewing someone else: what is already between us.
  const ours = isMe ? null : bonds.find((b) => b.partnerId === 'me');
  const myRequest = isMe ? null : requests.outgoing.find((b) => b.partnerId === user.id);
  const theirRequest = isMe ? null : requests.incoming.find((b) => b.partnerId === user.id);

  const act = async (run: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await run();
      if (done) showAlert(done);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /Bakiye/.test(e.message)) noCoins();
      else showAlert('Olmadı', message(e));
    } finally {
      setBusy(false);
      reload();
    }
  };

  const noCoins = () =>
    showAlert('Yetersiz jeton', 'Bağ isteği bir bağ hediyesiyle gider. Jeton yükleyip yeniden dene.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
    ]);

  const request = (kind: BondKind) => {
    const k = BOND_KINDS[kind];
    if (isBlocked) return showAlert('Engelli kullanıcı', 'Engellediğin biriyle bağ kuramazsın.');
    if (live) return act(() => liveRequestBond(user.id, kind), `${k.label} isteği gönderildi. ${user.name} kabul edince ${k.gift} ona geçer; 3 gün içinde yanıt gelmezse jetonların geri gelir.`);
    // Demo: the same limits the server checks, coins from this phone.
    if (ours || myRequest) return showAlert('Zaten var', `${user.name} ile zaten bir bağın ya da bekleyen isteğin var.`);
    const mine = [...demoBondsOf('me', now), ...state.requests.outgoing].filter((b) => !demo.ended.has(b.id) && b.kind === kind).length;
    if (mine >= k.max) return showAlert('Sınır doldu', k.max === 1 ? `Zaten bir ${k.label} bağın var.` : `En fazla ${k.max} ${k.label} bağın olabilir.`);
    if (!spendCoins(k.price, `Bağ isteği: ${k.label} (${k.gift}) → ${user.name}`)) return noCoins();
    setDemo({ sent: [...demo.sent, demoRequest(user.id, kind)] });
    showAlert('İstek gönderildi', `${user.name} kabul edince ${k.gift} ona geçer; 3 gün içinde yanıt gelmezse jetonların geri gelir.`);
  };

  const withdraw = (b: Bond) => {
    if (live) return act(() => liveWithdrawBond(b.id), 'İstek geri çekildi, jetonların iade edildi.');
    setDemo({ sent: demo.sent.filter((x) => x.id !== b.id) });
    addCoins(b.price, `Bağ isteği iadesi: ${BOND_KINDS[b.kind].label}`);
    showAlert('İstek geri çekildi', 'Jetonların iade edildi.');
  };

  const respond = (b: Bond, accept: boolean) => act(() => liveRespondBond(b.id, accept), accept ? `${BOND_KINDS[b.kind].label} bağınız kuruldu.` : 'İstek reddedildi, jetonlar gönderene döndü.');

  const end = (b: Bond) => {
    const partner = b.partnerId === 'me' ? me : userById(b.partnerId);
    showAlert('Bağı bitir', `${partner.name} ile ${BOND_KINDS[b.kind].label} bağın biter. Seviye ve ödüller sıfırlanır, jeton iadesi olmaz. Aynı kişiyle 7 gün yeniden bağ kurulamaz.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Bitir',
        style: 'destructive',
        onPress: () => {
          if (live) return void act(() => liveEndBond(b.id), 'Bağ bitti.');
          setDemo({ ended: new Set([...demo.ended, b.id]) });
        },
      },
    ]);
  };

  const togglePrivacy = () => {
    if (live) return void act(() => liveSetBondsHidden(!hidden));
    setDemo({ hidden: !demo.hidden });
  };

  const rules = () => showAlert('Bağlar nasıl işler?', [...BOND_RULES, '', 'Ödüller: ' + BOND_REWARDS.map((r) => `Lv.${r.level} ${r.label}`).join(' · ')].join('\n'));

  return (
    <View style={{ padding: 16, gap: 14 }}>
      <LinearGradient colors={dark ? ['#4A1F33', '#22172A', colors.card] : ['#FDE6EA', '#FFF4F6', colors.card]} style={styles.card}>
        <View style={styles.row}>
          <Pressable style={styles.iconBtn} onPress={rules} accessibilityLabel="Bağlar nasıl işler?">
            <Ionicons name="help" size={18} color={colors.primaryText} />
          </Pressable>
          <View style={styles.segment}>
            {(['cift', 'diger'] as const).map((k) => (
              <Pressable key={k} style={[styles.segmentItem, seg === k && styles.segmentActive]} onPress={() => setSeg(k)} accessibilityRole="tab" accessibilityState={{ selected: seg === k }}>
                <Text style={[styles.segmentText, seg === k && { color: '#fff' }]}>{k === 'cift' ? 'Çift' : 'Aile ve Dost'}</Text>
              </Pressable>
            ))}
          </View>
          {isMe ? (
            <Pressable style={styles.iconBtn} onPress={togglePrivacy} accessibilityLabel={hidden ? 'Bağlarımı göster' : 'Bağlarımı gizle'}>
              <Ionicons name={hidden ? 'eye-off' : 'eye'} size={18} color={colors.primaryText} />
            </Pressable>
          ) : (
            <View style={{ width: 34 }} />
          )}
        </View>
        {isMe && hidden && <Text style={[styles.meta, { marginTop: 8, textAlign: 'center', fontSize: 12 }]}>Bağların başkalarından gizli. Göz simgesiyle açabilirsin.</Text>}

        <View style={{ gap: 12, marginTop: 14 }}>
          {!shown ? (
            <View style={styles.emptyBox}>
              <Ionicons name="lock-closed" size={22} color={colors.textDim} />
              <Text style={styles.meta}>{user.name} bağlarını gizli tutuyor.</Text>
            </View>
          ) : list.length ? (
            list.map((b) => <BondRow key={b.id} owner={isMe ? me : user} bond={b} now={now} canEnd={isMe || b.partnerId === 'me'} onEnd={() => end(b)} />)
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.meta}>{seg === 'cift' ? 'Henüz Çift bağı yok.' : 'Henüz aile ya da dost bağı yok.'}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Requests: all of mine on my profile; on someone else's, the one between us. */}
      {(isMe ? requests.incoming : theirRequest ? [theirRequest] : []).map((b) => (
        <RequestRow key={b.id} bond={b} now={now}>
          <SmallButton title="Reddet" onPress={() => respond(b, false)} disabled={busy} />
          <SmallButton title="Kabul et" primary onPress={() => respond(b, true)} disabled={busy} />
        </RequestRow>
      ))}
      {(isMe ? requests.outgoing : myRequest ? [myRequest] : []).map((b) => (
        <RequestRow key={b.id} bond={b} now={now} mine>
          <SmallButton title="Geri çek" onPress={() => withdraw(b)} disabled={busy} />
        </RequestRow>
      ))}

      {!isMe && !ours && !myRequest && !theirRequest && (
        <Pressable onPress={() => setKindSheet(true)} disabled={busy} style={({ pressed }) => ({ opacity: pressed || busy ? 0.85 : 1 })} accessibilityRole="button">
          <LinearGradient colors={[semantic.socialFill, '#A82F42']} style={styles.cta}>
            <Ionicons name="link" size={18} color="#fff" />
            <Text style={styles.ctaText}>Bağ kur</Text>
          </LinearGradient>
        </Pressable>
      )}
      {isMe && (
        <>
          <Text style={[styles.meta, { textAlign: 'center' }]}>Bağ kurmak için birinin profilini aç, Bağlar sekmesinden “Bağ kur”a dokun.</Text>
          <Pressable onPress={onMeetInvite} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })} accessibilityRole="button">
            <LinearGradient colors={[semantic.socialFill, '#A82F42']} style={styles.cta}>
              <Ionicons name="home" size={18} color="#fff" />
              <Text style={styles.ctaText}>Buluşma Odasına Davet Et</Text>
            </LinearGradient>
          </Pressable>
        </>
      )}

      <ActionSheet
        visible={kindSheet}
        title={`${user.name} ile bağ kur`}
        onClose={() => setKindSheet(false)}
        options={BOND_ORDER.map((kind) => {
          const k = BOND_KINDS[kind];
          return { label: `${k.label} · ${k.gift} · ${k.price.toLocaleString('tr-TR')} jeton`, icon: k.icon, onPress: () => void request(kind) };
        })}
      />
    </View>
  );
}

function BondRow({ owner, bond, now, canEnd, onEnd }: { owner: User; bond: Bond; now: number; canEnd: boolean; onEnd: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { me } = useApp();
  const partner = bond.partnerId === 'me' ? me : userById(bond.partnerId);
  const k = BOND_KINDS[bond.kind];
  const art = BOND_ART[bond.kind];
  const from = BOND_LEVELS[bond.level - 1] ?? 0;
  const progress = bond.nextLevelAt ? Math.min(1, Math.max(0, (bond.score - from) / (bond.nextLevelAt - from))) : 1;
  const open = (id: string) => router.push(`/kullanici/${id}`);
  return (
    <View style={styles.bondRow}>
      <View style={styles.lv}>
        <Text style={styles.lvText}>Lv.{bond.level}</Text>
      </View>
      {canEnd && (
        <Pressable style={styles.endBtn} onPress={onEnd} hitSlop={8} accessibilityLabel="Bağı bitir">
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textDim} />
        </Pressable>
      )}
      <View style={styles.pair}>
        <Pressable style={styles.person} onPress={() => open(owner.id)}>
          <Avatar uri={owner.avatar} size={56} name={owner.name} />
          <Text style={styles.name} numberOfLines={1}>
            {owner.name}
          </Text>
        </Pressable>
        <View style={{ alignItems: 'center', gap: 4 }}>
          {art ? (
            <Image source={art} style={styles.kindArt} resizeMode="contain" accessibilityIgnoresInvertColors />
          ) : (
            <LinearGradient colors={bond.kind === 'cift' ? ['#FF8AA6', '#D81B60'] : ['#5ED3E6', '#3B5BDB']} style={styles.kindDot}>
              <Ionicons name={k.icon} size={20} color="#fff" />
            </LinearGradient>
          )}
          <Text style={styles.kindLabel}>{k.label}</Text>
          <Text style={[styles.meta, { fontSize: 11 }]}>{bondDays(bond.since, now)} gün</Text>
        </View>
        <Pressable style={styles.person} onPress={() => open(partner.id)}>
          <Avatar uri={partner.avatar} size={56} name={partner.name} />
          <Text style={styles.name} numberOfLines={1}>
            {partner.name}
          </Text>
        </Pressable>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={[styles.meta, { fontSize: 11, textAlign: 'center', marginTop: 4 }]}>
        {bond.nextLevelAt ? `${bond.score} / ${bond.nextLevelAt} puan · Lv.${bond.level + 1} için ${bond.nextLevelAt - bond.score} puan` : `${bond.score} puan · en yüksek seviye`}
      </Text>
    </View>
  );
}

function RequestRow({ bond, now, mine, children }: { bond: Bond; now: number; mine?: boolean; children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const partner = userById(bond.partnerId);
  const k = BOND_KINDS[bond.kind];
  const left = bond.expiresAt ? Math.max(0, Math.ceil((Date.parse(bond.expiresAt) - now) / 3_600_000)) : 0;
  return (
    <View style={styles.request}>
      <Pressable onPress={() => router.push(`/kullanici/${partner.id}`)}>
        <Avatar uri={partner.avatar} size={40} name={partner.name} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={2}>
          {mine ? `${partner.name} · ${k.label} isteğin` : `${partner.name} seninle ${k.label} bağı kurmak istiyor`}
        </Text>
        <Text style={[styles.meta, { fontSize: 12 }]} numberOfLines={2}>
          {k.gift} · {bond.price.toLocaleString('tr-TR')} jeton · {left > 24 ? `${Math.ceil(left / 24)} gün` : `${left} saat`} içinde {mine ? 'yanıt bekleniyor' : 'yanıtla'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>{children}</View>
      </View>
    </View>
  );
}

function SmallButton({ title, onPress, primary, disabled }: { title: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.small, primary && styles.smallPrimary, (pressed || disabled) && { opacity: 0.7 }]} accessibilityRole="button">
      <Text style={[styles.smallText, primary && { color: '#fff' }]}>{title}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, semantic, lift, ink, dark }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { borderRadius: 22, padding: 14, ...(dark ? { borderWidth: 1, borderColor: colors.border } : lift) },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : ink(0.06), alignItems: 'center', justifyContent: 'center' },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: dark ? 'rgba(0,0,0,0.3)' : ink(0.06), borderRadius: 999, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textDim, fontWeight: '800', fontSize: 14 },
  meta: { color: colors.textDim, fontSize: 13 },
  emptyBox: { alignItems: 'center', gap: 6, paddingVertical: 18 },
  bondRow: { backgroundColor: dark ? 'rgba(255,255,255,0.06)' : colors.card, borderRadius: 18, padding: 12, paddingTop: 24, ...lift },
  lv: { position: 'absolute', top: 8, left: 10, backgroundColor: semantic.socialFill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  lvText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  endBtn: { position: 'absolute', top: 6, right: 8, padding: 4, zIndex: 1 },
  pair: { flexDirection: 'row', alignItems: 'center' },
  person: { alignItems: 'center', gap: 4, flex: 1 },
  name: { color: colors.text, fontSize: 13, fontWeight: '600', maxWidth: 96 },
  kindDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  kindArt: { width: 44, height: 44 },
  kindLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : ink(0.08), marginTop: 12, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  request: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.card, borderRadius: 16, padding: 12, ...(dark ? { borderWidth: 1, borderColor: colors.border } : lift) },
  small: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : ink(0.06) },
  smallPrimary: { backgroundColor: colors.primary },
  smallText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 13 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
}));
