// Aile in a live build, the rest (lib/live/family → server/api/family-more.mjs): Görevler (the daily tasks as the
// server counted them, the check-in, the weekly chests) and Uyum Köşesi (the family's pairs, İkili gifts to a
// member), plus the gift sheet the family chat uses. Everything shown is the server's answer: a task is done
// when the server saw it happen, a chest pays reward coins once per person and week, and the weekly bonus is an
// estimate (paying it is a management decision).
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { ProfileGiftSheet } from '@/components/profile-gift-sheet';
import { Text } from '@/components/text';
import { Avatar, Card, GradientButton, Header, StateIcon } from '@/components/ui';
import { BOND_KINDS, isBondKind } from '@/data/bonds';
import { CP_GIFT_IDS, KABILE_CHESTS, KABILE_ROUTES, KABILE_TASKS } from '@/data/kabile';
import { GIFTS, type Gift } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import type { GiftPlace } from '@/lib/api';
import { applyServerUser, liveGift, message, myServerId, once } from '@/lib/live';
import { useLiveCatalog, visibleGifts } from '@/lib/live/catalog-live';
import * as fam from '@/lib/live/family';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const openProfile = (id: string) => (id === myServerId() ? router.push('/(tabs)/profil') : router.push(`/kullanici/${id}`));

const TASK_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  'k-chat': 'chatbubbles-outline',
  'k-room': 'mic-outline',
  'k-newbie': 'gift-outline',
  'k-checkin': 'calendar-outline',
  'k-roomgift': 'sparkles-outline',
  'k-cp': 'heart-outline',
  'k-chatgift': 'mail-outline',
};
/** The chests' tint (the art comes later from the design list). */
const CHEST_TINT: Record<string, string> = { c1: '#B7791F', c2: '#16A34A', c3: '#2563EB', c4: '#DC2626' };

/** My family's overview, read again whenever the screen comes back (after the chat, a room, a gift). */
function useOverview() {
  const [ov, setOv] = useState<fam.FamilyOverview | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none' | 'error'>('loading');
  const load = useCallback(
    () =>
      fam.overview().then(
        (o) => (setOv(o), setState('ok')),
        (e: unknown) => setState((e as { status?: number })?.status === 403 ? 'none' : 'error'),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return { ov, state, load };
}

/** Not in a family, or the server didn't answer: what to do instead. */
function NoFamily({ title, state, onRetry }: { title: string; state: 'loading' | 'none' | 'error'; onRetry: () => void }) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.family} />
      <Header title={title} />
      <View style={styles.empty}>
        {state === 'loading' ? (
          <Text style={styles.dim}>Yükleniyor…</Text>
        ) : state === 'none' ? (
          <>
            <StateIcon name="lock-closed" />
            <Text style={[styles.title, { textAlign: 'center' }]}>{title} aile üyelerine açıktır</Text>
            <Text style={[styles.dim, { textAlign: 'center' }]}>Bir aileye katıldığında günlük yoklama, aile görevleri ve haftalık sandıklar burada açılır.</Text>
            <GradientButton title="Aile bul" onPress={() => router.replace(KABILE_ROUTES.profile)} />
          </>
        ) : (
          <>
            <Text style={[styles.dim, { textAlign: 'center' }]}>Yüklenemedi. İnternet bağlantını kontrol et.</Text>
            <GradientButton title="Tekrar dene" onPress={onRetry} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * A gift to someone of my family, from the family chat (place 'family': the chat shows it) or Uyum Köşesi. No
 * confirmation, as every gift: the server takes the coins at its price.
 */
export function useFamilyGift(list: Gift[], place: GiftPlace | undefined, onSent: () => void) {
  const { coins, svipLevel, spendBlock, recordGift, bump } = useApp();
  const gifts = visibleGifts(list, useLiveCatalog());
  const [to, setTo] = useState<{ id: string; name: string } | null>(null);
  const send = async (g: Gift): Promise<boolean> => {
    if (!to) return false;
    if ((g.minSvip ?? 0) > svipLevel) {
      showAlert('Üyelere özel hediye', `${g.name}, İnci ${g.minSvip} ve üstü için. Senin seviyen: İnci ${svipLevel}.`);
      return false;
    }
    const limited = spendBlock(g.price);
    if (limited && limited !== 'Yetersiz bakiye.') {
      showAlert('Hediye gönderilemedi', limited);
      return false;
    }
    try {
      await liveGift(to.id, g.id, 1, undefined, place);
    } catch (e) {
      showAlert('Hediye gönderilemedi', message(e), [
        { text: 'Tamam', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return false;
    }
    recordGift(to.id, g.id, 1);
    bump('giftsSent', 1);
    onSent();
    return true;
  };
  const sheet = to ? <ProfileGiftSheet visible name={to.name} gifts={gifts} coins={coins} svipLevel={svipLevel} onClose={() => setTo(null)} onSend={send} /> : null;
  return { giftTo: (p: { id: string; name: string }) => setTo(p), sheet };
}

/** Members to pick from for a gift (everyone but me). */
export function MemberPicker({ visible, title, members, onPick, onClose }: { visible: boolean; title: string; members: fam.FamilyPerson[]; onPick: (m: fam.FamilyPerson) => void; onClose: () => void }) {
  const me = myServerId();
  const others = members.filter((m) => m.id !== me);
  return (
    <ActionSheet
      visible={visible}
      title={others.length ? title : 'Ailede senden başka kimse yok'}
      options={others.map((m) => ({ label: m.name, icon: 'person-outline' as const, onPress: () => onPick(m) }))}
      onClose={onClose}
    />
  );
}

/** Görevler: today's tasks, the check-in, my week and the weekly chests. */
export function LiveFamilyTasks() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { ov, state, load } = useOverview();
  const [busy, setBusy] = useState(false);
  if (!ov) return <NoFamily title="Görevler" state={state === 'ok' ? 'loading' : state} onRetry={() => void load()} />;

  const mine = ov.me.gifts + ov.me.points;
  const checkIn = async () => {
    if (ov.checkedIn || busy) return;
    setBusy(true);
    try {
      await fam.checkIn();
      await load();
    } catch (e) {
      showAlert('Yoklama alınamadı', message(e));
    } finally {
      setBusy(false);
    }
  };
  const openRoom = () =>
    ov.room ? router.push(`/oda/${ov.room.id}`) : showAlert('Aile odası kapalı', 'Aile odası, aile liderinin açık odasıdır. Lider odasını açınca buradan girebilirsin.');
  const go = (id: string) => {
    switch (id) {
      case 'k-chat':
      case 'k-chatgift':
        return router.push(KABILE_ROUTES.sohbet);
      case 'k-room':
      case 'k-roomgift':
        return openRoom();
      case 'k-newbie':
        return router.push(KABILE_ROUTES.profile);
      case 'k-cp':
        return router.push(KABILE_ROUTES.iliski);
      case 'k-checkin':
        return void checkIn();
    }
  };
  const chest = async (c: fam.FamilyChest) => {
    const name = KABILE_CHESTS.find((x) => x.id === c.id)?.name ?? 'Sandık';
    if (c.claimed) return showAlert(`${name} alındı`, `Bu hafta ${c.coins} ödül jetonunu aldın. Yeni hafta Pazartesi 00:00'da başlar.`);
    if (!c.reached) return showAlert(name, `Ailenin bu haftaki gücü ${fmt(c.need)} olunca açılır. İçinde ${c.coins} ödül jetonu var.`);
    if (mine < 1) return showAlert('Önce katkı ver', 'Sandığı açmak için bu hafta bir görev yap ya da aileden birine hediye gönder.');
    if (busy) return;
    setBusy(true);
    try {
      const r = await once(`family:chest:${c.id}:${ov.week.start}`, (ref) => fam.openChest(c.id, ref));
      applyServerUser(r, `Aile sandığı: ${name}`);
      showAlert(`${name} açıldı`, `${r.coins} ödül jetonu hesabına eklendi. Ödül jetonu mağazada harcanır.`);
      await load();
    } catch (e) {
      showAlert('Sandık açılamadı', message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.family} />
      <Header
        title="Görevler"
        right={
          <Pressable style={[styles.pill, ov.checkedIn && { opacity: 0.6 }]} onPress={() => void checkIn()} accessibilityLabel="Aile yoklaması" accessibilityState={{ disabled: ov.checkedIn }}>
            <Text style={styles.pillText}>{ov.checkedIn ? 'Yoklama alındı' : 'Yoklama ver'}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <StateIcon name="shield-checkmark-outline" />
            <View style={{ flex: 1 }}>
              <Text style={styles.dim}>Ailenin bu haftaki gücü</Text>
              <Text style={styles.big}>{fmt(ov.week.power)}</Text>
            </View>
            <View style={styles.mineBox}>
              <Text style={styles.dim}>Katkım</Text>
              <Text style={styles.mineValue}>{fmt(mine)}</Text>
            </View>
          </View>
          <View style={styles.chests}>
            {ov.chests.map((c) => {
              const name = KABILE_CHESTS.find((x) => x.id === c.id)?.name ?? 'Sandık';
              return (
                <Pressable key={c.id} style={styles.chest} onPress={() => void chest(c)} accessibilityRole="button" accessibilityLabel={`${name}: ${c.coins} ödül jetonu, ${c.claimed ? 'alındı' : c.reached ? 'açılabilir' : 'kilitli'}`}>
                  <Ionicons name={c.claimed ? 'cube-outline' : 'cube'} size={30} color={CHEST_TINT[c.id] ?? colors.primary} />
                  <Text style={styles.chestNeed}>{fmt(c.need)}</Text>
                  <Text style={styles.chestReward}>{c.coins} ödül jetonu</Text>
                  <View style={[styles.alBtn, !c.reached && { backgroundColor: colors.cardAlt }, c.claimed && { backgroundColor: colors.border }]}>
                    {c.claimed || c.reached ? <Text style={styles.btnText}>{c.claimed ? 'Alındı' : 'Al'}</Text> : <Ionicons name="lock-closed" size={14} color={colors.textDim} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.dim}>
            Güç, üyelerin bu hafta gönderdiği hediyelerdir. Her sandık kişi başı haftada bir açılır; bu hafta görev yapmış ya da hediye göndermiş olmak gerekir. Ödül jetonu yalnızca mağazada harcanır.
          </Text>
        </Card>

        <Card style={{ gap: 4 }}>
          <Text style={styles.title}>Günlük görevler</Text>
          <Text style={styles.dim}>Her gün 00:00&apos;da yenilenir (Türkiye saati). Görevler katkı puanı verir, jeton vermez.</Text>
          {ov.tasks.map((t) => {
            const info = KABILE_TASKS.find((x) => x.id === t.id);
            const title = info?.title ?? t.id;
            const label = t.id === 'k-checkin' ? (t.done ? 'Tamam' : 'Yoklama ver') : t.kind === 'count' && t.done ? 'Tamam' : 'Git';
            return (
              <View key={t.id} style={styles.task}>
                <View style={styles.row}>
                  <View style={styles.taskIcon}>
                    <Ionicons name={TASK_ICON[t.id] ?? 'checkbox-outline'} size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.taskTitle}>{title}</Text>
                    {t.kind === 'count' ? (
                      <Text style={styles.reward}>
                        +{info?.power ?? 1} puan
                        {t.id !== 'k-checkin' && <Text style={styles.dim}>{`  ${fmt(Math.min(t.progress, t.goal))}/${t.goal}${t.id === 'k-room' ? ' dk' : ''}`}</Text>}
                      </Text>
                    ) : (
                      <Text style={styles.rateText}>
                        Her {fmt(t.per)} jeton için +{info?.power ?? 1} puan · bugün {fmt(t.progress)} jeton, {fmt(t.points)} puan
                      </Text>
                    )}
                  </View>
                  <Pressable
                    disabled={t.kind === 'count' && t.done}
                    onPress={() => go(t.id)}
                    style={[styles.taskBtn, t.kind === 'count' && t.done && { backgroundColor: colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}: ${label}`}>
                    <Text style={styles.btnText}>{label}</Text>
                  </Pressable>
                </View>
                <Text style={styles.doneText}>Bugün {t.doneBy} üye tamamladı</Text>
              </View>
            );
          })}
        </Card>

        <Card style={{ gap: 6 }}>
          <Text style={styles.title}>Haftalık aile bonusu (tahmini)</Text>
          <Text style={styles.big}>{fmt(ov.bonus.pool)} elmas</Text>
          <Text style={styles.dim}>
            Ailenin bu haftaki gücünün %{(ov.bonus.rate * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}&apos;i (aile seviyesine göre). Bu bir tahmindir; bonus ödemesi yönetim kararıyla yapılır.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const CP_GIFTS = CP_GIFT_IDS.map((id) => GIFTS.find((g) => g.id === id)).filter((g): g is Gift => !!g);

/** Uyum Köşesi: the family's bonds between members, and İkili gifts to one of them. */
export function LiveFamilyPairs() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { ov, state, load } = useOverview();
  const [members, setMembers] = useState<fam.FamilyMember[]>([]);
  const [picking, setPicking] = useState(false);
  useFocusEffect(
    useCallback(() => {
      fam.family().then(
        (d) => setMembers(d.members),
        () => undefined,
      );
    }, []),
  );
  const gift = useFamilyGift(CP_GIFTS, undefined, () => void load());
  if (!ov) return <NoFamily title="Uyum Köşesi" state={state === 'ok' ? 'loading' : state} onRetry={() => void load()} />;

  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.family} />
      <Header title="Uyum Köşesi" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Ailedeki ikililer</Text>
          <Text style={styles.dim}>İki aile üyesi arasındaki bağlar, puanlarına göre. Bağ kurmak için üyenin profiline git ve “Bağ kur”a dokun.</Text>
          {ov.pairs.length === 0 ? (
            <Text style={[styles.dim, { paddingVertical: 8 }]}>Ailede henüz ikili yok.</Text>
          ) : (
            ov.pairs.map((p, i) => (
              <View key={`${p.a?.id}-${p.b?.id}`} style={styles.pair}>
                <Text style={styles.rank}>{i + 1}</Text>
                <Pressable onPress={() => p.a && openProfile(p.a.id)}>
                  <Avatar uri={p.a?.avatarUrl ?? undefined} name={p.a?.name ?? ''} size={36} />
                </Pressable>
                <Ionicons name="heart" size={14} color={colors.primary} />
                <Pressable onPress={() => p.b && openProfile(p.b.id)}>
                  <Avatar uri={p.b?.avatarUrl ?? undefined} name={p.b?.name ?? ''} size={36} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {p.a?.name} · {p.b?.name}
                  </Text>
                  <Text style={styles.dim}>{isBondKind(p.kind) ? BOND_KINDS[p.kind].label : 'Bağ'}</Text>
                </View>
                <Text style={styles.score}>{fmt(p.score)}</Text>
              </View>
            ))
          )}
        </Card>
        <Card style={{ gap: 10 }}>
          <Text style={styles.title}>İkili hediyesi</Text>
          <Text style={styles.dim}>Aileden birine İkili hediyesi gönder: günlük “İkili hediyesi” görevine sayılır (her 350 jetona 2 puan).</Text>
          <GradientButton title="Üye seç ve gönder" icon="gift" onPress={() => setPicking(true)} />
        </Card>
      </ScrollView>
      <MemberPicker visible={picking} title="Kime göndereceksin?" members={members} onPick={(m) => gift.giftTo(m)} onClose={() => setPicking(false)} />
      {gift.sheet}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  empty: { paddingTop: 96, paddingHorizontal: 32, gap: 12, alignItems: 'center' },
  title: { color: colors.text, fontWeight: '800', fontSize: 17 },
  big: { color: colors.text, fontSize: 24, fontWeight: '900' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  mineBox: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  mineValue: { color: colors.text, fontWeight: '800', fontSize: 16 },
  chests: { flexDirection: 'row', gap: 8 },
  chest: { flex: 1, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 4, gap: 4 },
  chestNeed: { color: semantic.tonalText, fontSize: 12, fontWeight: '800' },
  chestReward: { color: colors.textDim, fontSize: 11, textAlign: 'center' },
  alBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, minWidth: 54, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  task: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12, gap: 6, marginTop: 6 },
  taskIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: dark ? 'rgba(19,217,223,0.2)' : 'rgba(0,140,148,0.12)', alignItems: 'center', justifyContent: 'center' },
  taskTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  reward: { color: semantic.tonalText, fontWeight: '700', fontSize: 13 },
  rateText: { color: semantic.tonalText, fontSize: 12, lineHeight: 17 },
  taskBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 74, alignItems: 'center' },
  doneText: { color: colors.textDim, fontSize: 12, backgroundColor: colors.cardAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  rank: { color: colors.textDim, fontWeight: '800', width: 18 },
  score: { color: semantic.tonalText, fontWeight: '800', fontSize: 13 },
}));
