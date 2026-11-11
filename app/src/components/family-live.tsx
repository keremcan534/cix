// Aile in a live build (lib/live/family → server/api/families.mjs, family-more.mjs): the family list, founding one,
// joining or asking to join, my family (members, requests, roles, announcement, join mode, the leader's tag and
// theme, this week, the family room, highlights, level perks, rules) and the family chat (with gifts to members).
// Görevler and Uyum Köşesi are in family-center-live. Everything shown is the server's answer; nothing is kept on
// the phone. The demo build keeps app/aile's sample families.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { MemberPicker, useFamilyGift } from '@/components/family-center-live';
import { EmojiText } from '@/components/ReactionArt';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop } from '@/components/fx/surface';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { useReport } from '@/components/report-sheet';
import { Text, TextInput } from '@/components/text';
import { Avatar, Card, GradientButton, Header } from '@/components/ui';
import { CHAT_GIFT_IDS, KABILE_CREATE_COST, KABILE_ROUTES, KABILE_THEMES } from '@/data/kabile';
import { GIFTS } from '@/data/mock';
import { FAMILY_PERKS } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { applyServerUser, message, myServerId, once } from '@/lib/live';
import * as fam from '@/lib/live/family';
import { SCRIM, makeStyles, useTheme } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
const themeOf = (id: string) => KABILE_THEMES.find((t) => t.id === id) ?? KABILE_THEMES[0];
const CHAT_GIFTS = GIFTS.filter((g) => CHAT_GIFT_IDS.includes(g.id));
const RULES = [
  'Bir kişi aynı anda yalnızca bir ailede olabilir.',
  'Ailenin gücü üyelerin gönderdiği hediyelerden gelir; satın alınamaz.',
  'Günlük görevler katkı puanı verir, jeton vermez.',
  'Haftalık sandıklar ödül jetonu verir; her sandık kişi başı haftada bir açılır.',
  'Aile sohbetinde telefon, adres ya da sosyal medya hesabı paylaşılmaz.',
  'Hafta Pazartesi 00:00’da (Türkiye saati) yenilenir.',
];
const openProfile = (id: string) => (id === myServerId() ? router.push('/(tabs)/profil') : router.push(`/kullanici/${id}`));

/** Aileler: my family when I have one, else the list (with founding and a family's preview). */
export function LiveFamilies() {
  const [detail, setDetail] = useState<fam.FamilyDetail | null>(null);
  const [failed, setFailed] = useState(false);
  // /aile?id=… (someone's family from their profile) opens that family's preview, unless it is mine.
  const { id: asked } = useLocalSearchParams<{ id?: string }>();
  const [preview, setPreview] = useState<string | null>(asked ?? null);
  const load = useCallback(
    () =>
      fam.family().then(
        (d) => (setFailed(false), setDetail(d)),
        () => setFailed(true),
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const back = useCallback(() => setPreview(null), []);
  const retry = () => (setFailed(false), void load());
  // From my family: the week's families (the ranking), then back.
  const [ranking, setRanking] = useState(false);

  if (preview && preview !== detail?.family?.id) return <FamilyView id={preview} onBack={back} onJoined={() => (setPreview(null), void load())} />;
  if (detail?.family && ranking) return <FamilyList loading={false} failed={false} onRetry={retry} onOpen={setPreview} onCreated={load} mine={detail.family.id} onBack={() => setRanking(false)} />;
  if (detail?.family) return <MyFamily detail={detail} onChange={setDetail} reload={() => (setPreview(null), void load())} onRanking={() => setRanking(true)} />;
  return <FamilyList loading={!detail && !failed} failed={failed} onRetry={retry} onOpen={setPreview} onCreated={load} />;
}

/**
 * Aileler: the week's families (the ranking), searching, founding one and my invites. `mine`: opened from my own
 * family (no founding, no invites; my family's row stands out and goes back).
 */
function FamilyList({
  loading,
  failed,
  onRetry,
  onOpen,
  onCreated,
  mine,
  onBack,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onCreated: () => void;
  mine?: string;
  onBack?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  // Invites from families' leaders or helpers: accepting joins at once.
  const [invs, setInvs] = useState<fam.FamilyInvite[]>([]);
  useEffect(() => {
    if (mine) return;
    fam.invites().then(
      (l) => setInvs(l),
      () => undefined,
    );
  }, [mine]);
  const answerInvite = async (i: fam.FamilyInvite, accept: boolean) => {
    try {
      const r = await fam.answerInvite(i.family.id, accept);
      setInvs((l) => l.filter((x) => x.family.id !== i.family.id));
      if (r.joined) onCreated();
    } catch (e) {
      showAlert(accept ? 'Katılamadın' : 'Olmadı', message(e));
    }
  };
  const [q, setQ] = useState('');
  const [list, setList] = useState<fam.LiveFamily[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    const t = setTimeout(() => fam.families(q).then((r) => on && setList(r.families), () => on && setList([])), q ? 350 : 0);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [q]);

  const found = async () => {
    const n = name.trim();
    if (n.length < 2) return showAlert('Aile adı en az 2 karakter olmalı');
    setBusy(true);
    try {
      const r = await once(`family:create:${n}`, (ref) => fam.create(n, ref));
      applyServerUser(r, `Aile kurma: ${n}`);
      onCreated();
    } catch (e) {
      showAlert('Aile kurulamadı', message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.family} />
      <Header title={mine ? 'Aile sıralaması' : 'Aileler'} onBack={onBack} />
      <KeyboardAvoid style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          {invs.length > 0 && (
            <Card style={{ gap: 6 }}>
              <Text style={styles.title}>Davetlerin · {invs.length}</Text>
              {invs.map((i) => (
                <View key={i.family.id} style={styles.row}>
                  <Avatar uri={i.family.leader.avatarUrl ?? undefined} name={i.family.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {i.family.name}
                    </Text>
                    <Text style={styles.dim} numberOfLines={1}>
                      Lv.{i.family.level} · {i.family.members}/{i.family.capacity} üye · {i.by.name} davet etti
                    </Text>
                  </View>
                  <Pressable style={[styles.pill, { backgroundColor: colors.cardAlt }]} onPress={() => void answerInvite(i, false)} accessibilityLabel={`${i.family.name} davetini reddet`}>
                    <Text style={styles.name}>Reddet</Text>
                  </Pressable>
                  <Pressable style={[styles.pill, { backgroundColor: colors.primary }]} onPress={() => void answerInvite(i, true)} accessibilityLabel={`${i.family.name} davetini kabul et`}>
                    <Text style={styles.pillText}>Katıl</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
          {mine ? null : creating ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.title}>Aile kur · {fmt(KABILE_CREATE_COST)} jeton</Text>
              <TextInput value={name} onChangeText={setName} placeholder="Aile adı" placeholderTextColor={colors.textDim} style={styles.input} maxLength={24} />
              <Text style={styles.dim}>Kuran kişi aile lideri olur: yardımcı atar, istekleri onaylar ve duyuruyu yazar.</Text>
              <GradientButton title={busy ? 'Kuruluyor…' : 'Kur'} onPress={busy ? undefined : found} />
            </Card>
          ) : (
            <GradientButton title="Kendi aileni kur" icon="add" onPress={() => setCreating(true)} />
          )}
          {failed && (
            <Pressable onPress={onRetry} style={styles.notice}>
              <Text style={styles.dim}>Ailen yüklenemedi. Tekrar denemek için dokun.</Text>
            </Pressable>
          )}
          <TextInput value={q} onChangeText={setQ} placeholder="Aile ara" placeholderTextColor={colors.textDim} style={styles.input} maxLength={24} />
          <Text style={[styles.title, { marginTop: 4 }]}>Bu haftanın aileleri</Text>
          {loading || list === null ? (
            <Text style={styles.dim}>Yükleniyor…</Text>
          ) : list.length === 0 ? (
            <Text style={styles.dim}>{q ? 'Bu isimde aile yok.' : 'Henüz aile yok. İlkini sen kur.'}</Text>
          ) : (
            list.map((f, i) => (
              <Pressable key={f.id} onPress={() => (f.id === mine ? onBack?.() : onOpen(f.id))} accessibilityRole="button" accessibilityLabel={`${i + 1}. ${f.name} ailesi${f.id === mine ? ', senin ailen' : ''}`}>
                <Card style={[styles.row, f.id === mine && { borderWidth: 1.5, borderColor: colors.primary }]}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Avatar uri={f.leader.avatarUrl ?? undefined} name={f.name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <Text style={styles.dim} numberOfLines={1}>
                      Lv.{f.level} · {f.members}/{f.capacity} üye · bu hafta {fmt(f.weekly)} güç
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </Card>
              </Pressable>
            ))
          )}
          <Text style={[styles.dim, { textAlign: 'center' }]}>Bir kişi aynı anda yalnızca bir ailede olabilir. Güç, üyelerin gönderdiği hediyelerden gelir.</Text>
        </ScrollView>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

/** Another family: who is in it, and join (open) / ask to join (approve) / take my request back. */
function FamilyView({ id, onBack, onJoined }: { id: string; onBack: () => void; onJoined: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const report = useReport();
  const [d, setD] = useState<fam.FamilyDetail | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fam.family(id).then(setD, (e) => (showAlert('Aile açılamadı', message(e)), onBack()));
  }, [id, onBack]);
  const f = d?.family;

  const act = async () => {
    if (!f || !d) return;
    setBusy(true);
    try {
      const r = await fam.join(f.id, !d.requested);
      if (r.joined) return onJoined();
      setD({ ...d, requested: !!r.requested });
      if (r.requested) showAlert('İstek gönderildi', 'Aile lideri ya da yardımcısı onaylayınca aileye katılırsın.');
    } catch (e) {
      showAlert('Olmadı', message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.family} />
      <Header
        title={f?.name ?? 'Aile'}
        onBack={onBack}
        right={
          f ? (
            <Pressable hitSlop={10} onPress={() => report.start({ type: 'family', id: f.id, name: f.name }, () => undefined)} accessibilityLabel="Aileyi şikâyet et">
              <Ionicons name="flag-outline" size={21} color={colors.text} />
            </Pressable>
          ) : undefined
        }
      />
      {report.sheet}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!f || !d ? (
          <Text style={styles.dim}>Yükleniyor…</Text>
        ) : (
          <>
            <Summary f={f} />
            {!!f.announcement && (
              <Card>
                <Text style={styles.label}>Duyuru</Text>
                <Text style={styles.body}>{f.announcement}</Text>
              </Card>
            )}
            <GradientButton
              title={busy ? 'Bekle…' : d.requested ? 'İsteği geri al' : f.joinMode === 'open' ? 'Aileye katıl' : 'Katılma isteği gönder'}
              onPress={busy ? undefined : act}
            />
            <Members members={d.members} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({ f }: { f: fam.LiveFamily }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const full = f.members / Math.max(1, f.capacity);
  return (
    <Card style={{ gap: 10, padding: 0, overflow: 'hidden' }}>
      {/* The family's theme (the leader picks it, by family level): a dark band in both schemes, white text. */}
      <LinearGradient colors={themeOf(f.theme).colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <Avatar uri={f.leader.avatarUrl ?? undefined} name={f.name} size={56} />
        <View style={{ flex: 1 }}>
          <View style={[styles.row, { gap: 6, paddingVertical: 0 }]}>
            <Text style={[styles.big, styles.onBand, { flexShrink: 1 }]} numberOfLines={1}>
              {f.name}
            </Text>
            {!!f.tag && <Text style={styles.tag}>{f.tag}</Text>}
          </View>
          <Text style={styles.bandDim}>Lider: {f.leader.name}</Text>
        </View>
        <Text style={[styles.lv, { color: colors.gold }]}>Lv.{f.level}</Text>
      </LinearGradient>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
      <View style={styles.stats}>
        <Stat label="Üye" value={`${f.members}/${f.capacity}`} />
        <Stat label="Bu hafta" value={fmt(f.weekly)} />
        <Stat label="Toplam güç" value={fmt(f.power)} />
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(Math.min(1, full) * 100)}%` }]} />
      </View>
      <Text style={styles.dim}>{f.joinMode === 'open' ? 'Herkes katılabilir' : 'Katılmak için onay gerekir'}</Text>
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.dim}>{label}</Text>
    </View>
  );
}

function Tile({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.tile} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.name} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.dim} numberOfLines={1}>
        {sub}
      </Text>
    </Pressable>
  );
}

/** A member online now: where they are, and a way to join them in their room. */
function OnlineRow({ m }: { m: NonNullable<fam.FamilyOverview['online']>[number] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const room = m.room;
  return (
    <View style={styles.row}>
      <Pressable onPress={() => openProfile(m.id)} accessibilityLabel={`${m.name} profili`}>
        <Avatar uri={m.avatarUrl ?? undefined} name={m.name} size={36} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {m.name}
        </Text>
        <Text style={[styles.dim, room && { color: colors.gold }]} numberOfLines={1}>
          {room ? `${room.title || 'Bir oda'} odasında` : 'Çevrim içi'}
        </Text>
      </View>
      {room && (
        <Pressable style={[styles.pill, { backgroundColor: colors.primary }]} onPress={() => router.push(`/oda/${room.id}`)} accessibilityRole="button" accessibilityLabel={`${m.name} odasına git`}>
          <Text style={styles.pillText}>Git</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Üye davet et: the people I follow and who follow me (not in my family yet); one tap sends an invite. */
function InviteSheet({ members, onClose }: { members: fam.FamilyMember[]; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [people, setPeople] = useState<api.UserCard[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let on = true;
    const inFamily = new Set(members.map((m) => m.id));
    Promise.all([api.followList('following').catch(() => []), api.followList('followers').catch(() => [])]).then(([a, b]) => {
      if (!on) return;
      const seen = new Set<string>();
      setPeople([...a, ...b].filter((u) => !inFamily.has(u.id) && !seen.has(u.id) && (seen.add(u.id), true)));
    });
    return () => {
      on = false;
    };
  }, [members]);
  const send = async (u: api.UserCard) => {
    try {
      await fam.invite(u.id);
      setSent((s) => new Set(s).add(u.id));
    } catch (e) {
      showAlert('Davet gönderilemedi', message(e));
    }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={styles.sheet}>
        <View style={styles.row}>
          <Text style={[styles.title, { flex: 1 }]}>Üye davet et</Text>
          <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.dim}>Takip ettiklerin ve seni takip edenler. Daveti kabul eden aileye katılır; başka bir ailedeyse davet gitmez.</Text>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 2, paddingVertical: 6 }}>
          {people === null ? (
            <Text style={styles.dim}>Yükleniyor…</Text>
          ) : people.length === 0 ? (
            <Text style={styles.dim}>Davet edebileceğin kimse yok. Önce birini takip et; takip ettiklerin burada görünür.</Text>
          ) : (
            people.map((u) => (
              <View key={u.id} style={styles.row}>
                <Avatar uri={u.avatarUrl ?? undefined} name={u.name} size={36} />
                <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                  {u.name}
                </Text>
                <Pressable
                  disabled={sent.has(u.id)}
                  style={[styles.pill, { backgroundColor: sent.has(u.id) ? colors.cardAlt : colors.primary }]}
                  onPress={() => void send(u)}
                  accessibilityRole="button"
                  accessibilityLabel={sent.has(u.id) ? `${u.name} davet edildi` : `${u.name} kişisini davet et`}
                >
                  <Text style={sent.has(u.id) ? styles.name : styles.pillText}>{sent.has(u.id) ? 'Davet edildi' : 'Davet et'}</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Members({ members, myRole, onMenu }: { members: fam.FamilyMember[]; myRole?: fam.FamilyRole | null; onMenu?: (m: fam.FamilyMember) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const me = myServerId();
  return (
    <Card style={{ gap: 4 }}>
      <Text style={styles.title}>Üyeler · {members.length}</Text>
      {members.map((m) => {
        const manage = !!onMenu && m.id !== me && (myRole === 'owner' || fam.mayKick(myRole ?? null, m.role));
        return (
          <Pressable key={m.id} style={styles.row} onPress={() => openProfile(m.id)} onLongPress={manage ? () => onMenu?.(m) : undefined} accessibilityLabel={`${m.name}, ${fam.ROLE_NAME[m.role]}`}>
            <Avatar uri={m.avatarUrl ?? undefined} name={m.name} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {m.id === me ? `${m.name} (sen)` : m.name}
              </Text>
              <Text style={styles.dim}>Bu hafta {fmt(m.weekly)} güç</Text>
            </View>
            {m.role !== 'member' && <Text style={styles.role}>{fam.ROLE_NAME[m.role]}</Text>}
            {manage && (
              <Pressable hitSlop={10} onPress={() => onMenu?.(m)} accessibilityLabel={`${m.name} için seçenekler`}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textDim} />
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </Card>
  );
}

function MyFamily({ detail, onChange, reload, onRanking }: { detail: fam.FamilyDetail; onChange: (d: fam.FamilyDetail) => void; reload: () => void; onRanking: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const f = detail.family!;
  const role = detail.myRole;
  const manager = role === 'owner' || role === 'helper';
  const [menu, setMenu] = useState<fam.FamilyMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(f.announcement);
  // An older server sends no tag: an empty one then.
  const [tag, setTag] = useState(f.tag ?? '');
  // This week, the family room, highlights (family-more.mjs), read again whenever the screen comes back.
  const [ov, setOv] = useState<fam.FamilyOverview | null>(null);
  useFocusEffect(
    useCallback(() => {
      fam.overview().then(
        (o) => setOv(o),
        () => undefined,
      );
    }, []),
  );

  const run = async (what: string, p: Promise<{ members: fam.FamilyMember[] }>) => {
    try {
      const r = await p;
      onChange({ ...detail, members: r.members, family: { ...f, members: r.members.length } });
      reload();
    } catch (e) {
      showAlert(what, message(e));
    }
  };
  const answer = async (id: string, accept: boolean) => {
    onChange({ ...detail, requests: detail.requests.filter((r) => r.id !== id) });
    await run(accept ? 'Kabul edilemedi' : 'Reddedilemedi', fam.answer(id, accept));
  };
  const saveNote = async () => {
    try {
      const r = await fam.settings({ announcement: note });
      onChange({ ...detail, family: r.family });
      setEditing(false);
    } catch (e) {
      showAlert('Duyuru kaydedilemedi', message(e));
    }
  };
  const toggleMode = async () => {
    try {
      const r = await fam.settings({ joinMode: f.joinMode === 'open' ? 'approve' : 'open' });
      onChange({ ...detail, family: r.family });
    } catch (e) {
      showAlert('Değiştirilemedi', message(e));
    }
  };
  const saveLook = async (s: { tag?: string; theme?: string }, what: string) => {
    try {
      const r = await fam.settings(s);
      onChange({ ...detail, family: r.family });
      setTag(r.family.tag ?? '');
    } catch (e) {
      showAlert(what, message(e));
    }
  };
  const pickTheme = (t: (typeof KABILE_THEMES)[number]) =>
    f.level < t.minLevel ? showAlert(t.name, `Bu tema Lv.${t.minLevel} ailede açılır.`) : void saveLook({ theme: t.id }, 'Tema değiştirilemedi');
  const openRoom = () =>
    ov?.room
      ? router.push(`/oda/${ov.room.id}`)
      : showAlert(
          'Aile odası kapalı',
          role === 'owner' ? 'Bir oda açtığında o oda aile odası olur; üyeler buradan girer.' : 'Aile odası, aile liderinin açık odasıdır. Lider odasını açınca buradan girebilirsin.',
        );
  const doneToday = ov ? ov.tasks.filter((t) => t.points > 0).length : 0;
  const leave = () =>
    showAlert('Aileden ayrıl', role === 'owner' ? 'Ayrılırsan liderlik bir yardımcıya (yoksa en eski üyeye) geçer.' : `${f.name} ailesinden ayrılmak istiyor musun?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Ayrıl',
        style: 'destructive',
        onPress: () => void fam.leave().then(reload, (e) => showAlert('Ayrılamadın', message(e))),
      },
    ]);

  const options: SheetOption[] = menu
    ? [
        { label: 'Profili gör', icon: 'person-outline', onPress: () => openProfile(menu.id) },
        ...(role === 'owner' && menu.role === 'member' ? [{ label: 'Yardımcı yap', icon: 'shield-outline' as const, onPress: () => run('Olmadı', fam.setRole(menu.id, 'helper')) }] : []),
        ...(role === 'owner' && menu.role === 'helper' ? [{ label: 'Üye yap', icon: 'person-remove-outline' as const, onPress: () => run('Olmadı', fam.setRole(menu.id, 'member')) }] : []),
        ...(role === 'owner'
          ? [
              {
                label: 'Liderliği devret',
                icon: 'ribbon-outline' as const,
                onPress: () =>
                  showAlert('Liderliği devret', `${menu.name} aile lideri olur, sen yardımcı olursun.`, [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Devret', onPress: () => void run('Devredilemedi', fam.setRole(menu.id, 'owner')) },
                  ]),
              },
            ]
          : []),
        ...(fam.mayKick(role, menu.role) ? [{ label: 'Aileden çıkar', icon: 'close-circle-outline' as const, destructive: true, onPress: () => run('Çıkarılamadı', fam.kick(menu.id)) }] : []),
      ]
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <Backdrop scene={SCENES.family} />
      <Header
        title="Ailem"
        right={
          <Pressable hitSlop={10} onPress={() => void Share.share({ message: `${f.name} ailesine katıl! Similar Club'da Aileler bölümünde "${f.name}" ara.` })} accessibilityLabel="Paylaş">
            <Ionicons name="share-social-outline" size={22} color={colors.text} />
          </Pressable>
        }
      />
      <KeyboardAvoid style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Summary f={f} />
          <GradientButton title="Aile sohbeti" icon="chatbubbles" onPress={() => router.push(KABILE_ROUTES.sohbet)} />
          <View style={styles.tiles}>
            <Tile icon="checkbox-outline" title="Görevler" sub={ov ? `Bugün ${doneToday}/${ov.tasks.length}` : ''} onPress={() => router.push(KABILE_ROUTES.merkez)} />
            <Tile icon="mic-outline" title="Aile odası" sub={ov ? (ov.room ? `${ov.room.listeners} kişi içeride` : 'Kapalı') : ''} onPress={openRoom} />
            <Tile icon="heart-outline" title="Uyum Köşesi" sub={ov ? `${ov.pairs.length} ikili` : ''} onPress={() => router.push(KABILE_ROUTES.iliski)} />
          </View>
          {ov && (
            <Card style={{ gap: 10 }}>
              <View style={styles.row}>
                <Text style={[styles.title, { flex: 1 }]}>Bu hafta</Text>
                <Pressable onPress={onRanking} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Bu hafta ${ov.rank}. sıradasınız. Aile sıralamasını gör`}>
                  <Text style={styles.rankChip}>Sıra #{ov.rank} ›</Text>
                </Pressable>
              </View>
              <View style={styles.stats}>
                <Stat label="Haftalık güç" value={fmt(ov.week.power)} />
                <Stat label="Aktif üye" value={`${ov.active}/${f.members}`} />
                <Stat label="Katkım" value={fmt(ov.me.gifts + ov.me.points)} />
              </View>
              <Text style={styles.dim}>
                Tahmini haftalık aile bonusu: {fmt(ov.bonus.pool)} elmas. Bu bir tahmindir; bonus ödemesi yönetim kararıyla yapılır.
              </Text>
              {ov.highlights.length > 0 && (
                <>
                  <Text style={styles.label}>Öne çıkanlar</Text>
                  {ov.highlights.map((h, i) => (
                    <Pressable key={h.id} style={styles.row} onPress={() => openProfile(h.id)} accessibilityLabel={`${i + 1}. ${h.name}, ${fmt(h.contribution)} katkı`}>
                      <Text style={styles.rank}>{i + 1}</Text>
                      <Avatar uri={h.avatarUrl ?? undefined} name={h.name} size={32} />
                      <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                        {h.name}
                      </Text>
                      <Text style={styles.dim}>{fmt(h.contribution)} katkı</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </Card>
          )}
          <Card style={{ gap: 8 }}>
            <View style={styles.row}>
              <Text style={[styles.label, { flex: 1 }]}>Duyuru</Text>
              {manager && !editing && (
                <Pressable hitSlop={10} onPress={() => (setNote(f.announcement), setEditing(true))} accessibilityLabel="Duyuruyu düzenle">
                  <Ionicons name="create-outline" size={18} color={colors.textDim} />
                </Pressable>
              )}
            </View>
            {editing ? (
              <>
                <TextInput value={note} onChangeText={setNote} multiline maxLength={200} style={[styles.input, { minHeight: 80 }]} placeholder="Ailene bir not yaz" placeholderTextColor={colors.textDim} />
                <View style={styles.row}>
                  <Pressable style={[styles.pill, { backgroundColor: colors.cardAlt }]} onPress={() => setEditing(false)}>
                    <Text style={styles.name}>Vazgeç</Text>
                  </Pressable>
                  <Pressable style={[styles.pill, { backgroundColor: colors.primary }]} onPress={saveNote}>
                    <Text style={styles.pillText}>Kaydet</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.body}>{f.announcement || (manager ? 'Henüz duyuru yok. Ailene bir not yaz.' : 'Henüz duyuru yok.')}</Text>
            )}
          </Card>
          {role === 'owner' && (
            <Pressable onPress={toggleMode} accessibilityRole="switch" accessibilityState={{ checked: f.joinMode === 'approve' }}>
              <Card style={styles.row}>
                <Ionicons name={f.joinMode === 'approve' ? 'lock-closed-outline' : 'lock-open-outline'} size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>Katılım</Text>
                  <Text style={styles.dim}>{f.joinMode === 'approve' ? 'Onayla katılım: istekleri sen onaylarsın' : 'Açık: herkes hemen katılır'}</Text>
                </View>
                <Text style={[styles.dim, { color: colors.primary }]}>Değiştir</Text>
              </Card>
            </Pressable>
          )}
          {role === 'owner' && (
            <Card style={{ gap: 10 }}>
              <Text style={styles.title}>Aile görünümü</Text>
              <Text style={styles.label}>Etiket</Text>
              <View style={styles.row}>
                <TextInput value={tag} onChangeText={setTag} maxLength={8} autoCapitalize="characters" placeholder="Örn. YILDIZ" placeholderTextColor={colors.textDim} style={[styles.input, { flex: 1 }]} />
                <Pressable style={[styles.pill, { backgroundColor: colors.primary }]} onPress={() => void saveLook({ tag: tag.trim() }, 'Etiket kaydedilemedi')} accessibilityLabel="Etiketi kaydet">
                  <Text style={styles.pillText}>Kaydet</Text>
                </Pressable>
              </View>
              <Text style={styles.dim}>Adının yanında görünür. En fazla 8 harf ya da rakam.</Text>
              <Text style={styles.label}>Tema</Text>
              <View style={styles.themes}>
                {KABILE_THEMES.map((t) => {
                  const locked = f.level < t.minLevel;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => pickTheme(t)}
                      style={[styles.theme, f.theme === t.id && { borderColor: colors.primary }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: f.theme === t.id, disabled: locked }}
                      accessibilityLabel={`${t.name}${locked ? `, Lv.${t.minLevel} ailede açılır` : ''}`}>
                      <LinearGradient colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch}>
                        {locked && <Ionicons name="lock-closed" size={14} color="#fff" />}
                      </LinearGradient>
                      <Text style={styles.themeName} numberOfLines={1}>
                        {t.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}
          {manager && detail.requests.length > 0 && (
            <Card style={{ gap: 4 }}>
              <Text style={styles.title}>Katılma istekleri · {detail.requests.length}</Text>
              {detail.requests.map((r) => (
                <View key={r.id} style={styles.row}>
                  <Pressable onPress={() => openProfile(r.id)} style={[styles.row, { flex: 1 }]}>
                    <Avatar uri={r.avatarUrl ?? undefined} name={r.name} size={36} />
                    <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                  </Pressable>
                  <Pressable style={[styles.pill, { backgroundColor: colors.cardAlt }]} onPress={() => answer(r.id, false)} accessibilityLabel={`${r.name} isteğini reddet`}>
                    <Text style={styles.name}>Reddet</Text>
                  </Pressable>
                  <Pressable style={[styles.pill, { backgroundColor: colors.primary }]} onPress={() => answer(r.id, true)} accessibilityLabel={`${r.name} isteğini kabul et`}>
                    <Text style={styles.pillText}>Kabul</Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
          {!!ov?.online?.length && (
            <Card style={{ gap: 4 }}>
              <Text style={styles.title}>Birlikte oynuyor · {ov.online.length}</Text>
              {ov.online.map((m) => (
                <OnlineRow key={m.id} m={m} />
              ))}
            </Card>
          )}
          {manager && <GradientButton title="Üye davet et" icon="person-add" onPress={() => setInviting(true)} />}
          <Members members={detail.members} myRole={role} onMenu={manager ? setMenu : undefined} />
          <Card style={{ gap: 6 }}>
            <Text style={styles.title}>Seviye ayrıcalıkları</Text>
            {FAMILY_PERKS.map((p) => {
              const here = f.level >= p.from && f.level <= p.to;
              return (
                <View key={p.from} style={[styles.perk, here && { borderColor: colors.primary }]}>
                  <Text style={[styles.perkLv, here && { color: colors.primary }]}>
                    Lv.{p.from}–{p.to}
                  </Text>
                  <Text style={[styles.dim, { flex: 1 }, here && { color: colors.text }]}>{p.text}</Text>
                </View>
              );
            })}
          </Card>
          <Card style={{ gap: 6 }}>
            <Text style={styles.title}>Aile kuralları</Text>
            {RULES.map((r) => (
              <View key={r} style={[styles.row, { alignItems: 'flex-start', paddingVertical: 2, gap: 8 }]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.textDim} style={{ marginTop: 1 }} />
                <Text style={[styles.dim, { flex: 1 }]}>{r}</Text>
              </View>
            ))}
          </Card>
          <Pressable onPress={leave} style={styles.leave} accessibilityRole="button">
            <Text style={styles.leaveText}>Aileden ayrıl</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoid>
      <ActionSheet visible={!!menu} title={menu?.name} options={options} onClose={() => setMenu(null)} />
      {inviting && <InviteSheet members={detail.members} onClose={() => setInviting(false)} />}
    </SafeAreaView>
  );
}

/** Aile sohbeti: the family's chat, read again every few seconds while open, with gifts to members (the chat shows them). */
export function LiveFamilyChat() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [msgs, setMsgs] = useState<fam.FamilyMessage[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<fam.FamilyMember[]>([]);
  const [picking, setPicking] = useState(false);
  // Bumped after a gift: the chat is read again at once (the server wrote the gift's line).
  const [nudge, setNudge] = useState(0);
  const list = useRef<FlatList<fam.FamilyMessage>>(null);
  const last = useRef<string | undefined>(undefined);
  const me = myServerId();
  const gift = useFamilyGift(CHAT_GIFTS, 'family', () => setNudge((n) => n + 1));
  useEffect(() => {
    fam.family().then(
      (d) => setMembers(d.members),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    let on = true;
    const pull = () =>
      fam.chat(last.current).then(
        (m) => {
          if (!on) return;
          if (m.length) last.current = m[m.length - 1].id;
          setMsgs((cur) => [...(cur ?? []), ...m.filter((x) => !(cur ?? []).some((c) => c.id === x.id))]);
        },
        (e) => on && e?.status === 403 && setClosed(true),
      );
    void pull();
    const t = setInterval(pull, 4000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [nudge]);

  const send = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const m = await fam.say(t);
      setDraft('');
      setMsgs((cur) => (cur?.some((c) => c.id === m.id) ? cur : [...(cur ?? []), m]));
    } catch (e) {
      showAlert('Gönderilemedi', message(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title="Aile sohbeti" />
      {!closed && (
        <View style={styles.quick}>
          {(
            [
              ['checkbox-outline', 'Görevler', KABILE_ROUTES.merkez],
              ['heart-outline', 'Uyum Köşesi', KABILE_ROUTES.iliski],
              ['people-outline', 'Ailem', KABILE_ROUTES.profile],
            ] as const
          ).map(([icon, label, href]) => (
            <Pressable key={label} style={styles.quickChip} onPress={() => router.push(href)} accessibilityRole="link" accessibilityLabel={label}>
              <Ionicons name={icon} size={15} color={colors.primary} />
              <Text style={styles.name}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {closed ? (
        <View style={{ padding: 24, gap: 12 }}>
          <Text style={styles.dim}>Aile sohbetini okumak için bir ailede olmalısın.</Text>
          <GradientButton title="Ailelere git" onPress={() => router.replace(KABILE_ROUTES.profile)} />
        </View>
      ) : (
        <KeyboardAvoid style={{ flex: 1 }}>
          <FlatList
            ref={list}
            data={msgs ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Text style={[styles.dim, { textAlign: 'center', marginTop: 24 }]}>{msgs ? 'Henüz mesaj yok. İlk merhabayı sen yaz.' : 'Yükleniyor…'}</Text>}
            renderItem={({ item: m }) => {
              const mine = m.author.id === me;
              return (
                <View style={[styles.msgRow, mine && { flexDirection: 'row-reverse' }]}>
                  {!mine && (
                    <Pressable onPress={() => openProfile(m.author.id)}>
                      <Avatar uri={m.author.avatarUrl ?? undefined} name={m.author.name} size={32} />
                    </Pressable>
                  )}
                  <View style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.card }]}>
                    {!mine && <Text style={styles.author}>{m.author.name}</Text>}
                    <EmojiText text={m.text} style={[styles.msgText, mine && { color: '#fff' }]} />
                  </View>
                </View>
              );
            }}
          />
          <View style={styles.composer}>
            <Pressable onPress={() => setPicking(true)} style={[styles.send, { backgroundColor: colors.cardAlt }]} accessibilityLabel="Aileden birine hediye gönder">
              <Ionicons name="gift-outline" size={20} color={colors.text} />
            </Pressable>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Ailene yaz" placeholderTextColor={colors.textDim} style={[styles.input, { flex: 1 }]} maxLength={500} onSubmitEditing={send} returnKeyType="send" />
            <Pressable onPress={send} style={[styles.send, { backgroundColor: draft.trim() ? colors.primary : colors.cardAlt }]} accessibilityLabel="Gönder">
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoid>
      )}
      <MemberPicker visible={picking} title="Kime hediye göndereceksin?" members={members} onPick={(m) => gift.giftTo(m)} onClose={() => setPicking(false)} />
      {gift.sheet}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, semantic, edge }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontWeight: '700', fontSize: 16 },
  big: { color: colors.text, fontWeight: '800', fontSize: 20 },
  name: { color: colors.text, fontWeight: '600', fontSize: 14 },
  label: { color: colors.textDim, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rank: { color: colors.textDim, fontWeight: '800', width: 18 },
  lv: { fontWeight: '900', fontSize: 16 },
  role: { color: colors.gold, fontSize: 11, fontWeight: '800', backgroundColor: 'rgba(246,189,96,0.18)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
  notice: { backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, gap: 2 },
  statValue: { color: colors.text, fontWeight: '800', fontSize: 16 },
  bar: { width: '100%', height: 6, backgroundColor: colors.cardAlt, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: semantic.money },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  leave: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  leaveText: { color: semantic.danger, fontWeight: '700' },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  author: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  msgText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  scrim: { flex: 1, backgroundColor: SCRIM },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, gap: 8, ...edge.sheet },
  quick: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card },
  onBand: { color: '#fff' },
  bandDim: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18 },
  tag: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 4 },
  rankChip: { color: colors.gold, fontWeight: '800', fontSize: 13 },
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  theme: { width: '31%', borderRadius: 12, borderWidth: 2, borderColor: 'transparent', padding: 4, gap: 4 },
  swatch: { height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  themeName: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  perkLv: { color: colors.textDim, fontWeight: '800', fontSize: 12, width: 52 },
}));
