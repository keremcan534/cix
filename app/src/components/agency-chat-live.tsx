// Ajans sohbet grubu in live mode (lib/live/agency-chat): the agency's own chat, read again every few seconds
// while open, and its members with who is online, in which room and when they were last seen. Only the agency's
// streamers, its owner and its staff get in (the server decides); everyone else sees the closed note.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmojiText } from '@/components/ReactionArt';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Avatar, GradientButton, Header, StateIcon } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { message, myServerId } from '@/lib/live';
import * as ac from '@/lib/live/agency-chat';
import { makeStyles, useTheme } from '@/theme';

const CHAT_MS = 4000;
const MEMBERS_MS = 20_000;

const openProfile = (id: string) => (id === myServerId() ? router.push('/(tabs)/profil') : router.push(`/kullanici/${id}`));

export function LiveAgencyChat() {
  const styles = useStyles();
  const { colors, semantic } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const [groups, setGroups] = useState<ac.AgencyGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(typeof params.id === 'string' ? params.id : undefined);
  const [tab, setTab] = useState<'chat' | 'members'>('chat');
  const [msgs, setMsgs] = useState<ac.AgencyChatMessage[] | null>(null);
  const [members, setMembers] = useState<ac.AgencyChatMember[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [tries, setTries] = useState(0);
  const list = useRef<FlatList<ac.AgencyChatMessage>>(null);
  const last = useRef<string | undefined>(undefined);
  const me = myServerId();

  useEffect(() => {
    let on = true;
    ac.groups().then(
      (g) => on && (setGroups(g), setFailed(false)),
      () => on && setFailed(true),
    );
    return () => {
      on = false;
    };
  }, [tries]);

  const group = groups?.find((g) => g.id === picked) ?? groups?.[0] ?? null;
  const gid = group?.id;

  // Another group: its own lines and people, from the start.
  const [shownGid, setShownGid] = useState(gid);
  if (shownGid !== gid) {
    setShownGid(gid);
    setMsgs(null);
    setMembers(null);
    setClosed(false);
  }

  useEffect(() => {
    if (!gid) return;
    let on = true;
    last.current = undefined;
    const pull = () =>
      ac.chat(gid, last.current).then(
        (m) => {
          if (!on) return;
          if (m.length) last.current = m[m.length - 1].id;
          setMsgs((cur) => [...(cur ?? []), ...m.filter((x) => !(cur ?? []).some((c) => c.id === x.id))]);
        },
        // Out of the agency while the chat was open.
        (e) => on && e?.status === 403 && setClosed(true),
      );
    void pull();
    const t = setInterval(pull, CHAT_MS);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [gid]);

  // Who is here: read on opening (the header's count) and kept fresh while the list is on screen.
  useEffect(() => {
    if (!gid) return;
    let on = true;
    const pull = () =>
      ac.members(gid).then(
        (m) => on && setMembers(m),
        () => undefined,
      );
    void pull();
    const t = tab === 'members' ? setInterval(pull, MEMBERS_MS) : null;
    return () => {
      on = false;
      if (t) clearInterval(t);
    };
  }, [gid, tab]);

  const sorted = useMemo(() => (members ? [...members].sort(ac.byPresence) : []), [members]);
  const onlineCount = sorted.filter((m) => m.online === true || m.room).length;

  const send = async () => {
    const t = draft.trim();
    if (!t || sending || !gid) return;
    setSending(true);
    try {
      const m = await ac.say(gid, t);
      setDraft('');
      setMsgs((cur) => (cur?.some((c) => c.id === m.id) ? cur : [...(cur ?? []), m]));
    } catch (e) {
      showAlert('Gönderilemedi', message(e));
    } finally {
      setSending(false);
    }
  };

  const note = (icon: 'lock-closed' | 'cloud-offline', text: string, button: string, onPress: () => void) => (
    <View style={styles.note}>
      <StateIcon name={icon} />
      <Text style={styles.noteText}>{text}</Text>
      <GradientButton title={button} onPress={onPress} style={{ alignSelf: 'stretch' }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header title={group ? `${group.name} · Grup` : 'Ajans sohbet grubu'} />
      {failed && !groups ? (
        note('cloud-offline', 'Ajans grubu şu an açılamadı. Bağlantını kontrol edip yeniden dene.', 'Yeniden dene', () => setTries((n) => n + 1))
      ) : !groups ? (
        <Text style={[styles.dim, styles.center]}>Yükleniyor…</Text>
      ) : !group || closed ? (
        note('lock-closed', 'Ajans grubuna yalnızca ajansın yayıncıları, sahibi ve yetkilileri girebilir.', 'Ajans sayfasına git', () => router.replace('/ajans'))
      ) : (
        <>
          {groups.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.groups}>
              {groups.map((g) => (
                <Pressable key={g.id} onPress={() => setPicked(g.id)} style={[styles.groupChip, g.id === group.id && { backgroundColor: colors.primary }]} accessibilityRole="tab" aria-selected={g.id === group.id}>
                  <Text style={[styles.name, g.id === group.id && { color: '#fff' }]} numberOfLines={1}>
                    {g.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={styles.tabs}>
            {(
              [
                ['chat', 'Sohbet'],
                ['members', members ? `Üyeler · ${members.length}` : 'Üyeler'],
              ] as const
            ).map(([k, label]) => (
              <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && { backgroundColor: colors.primary }]} accessibilityRole="tab" aria-selected={tab === k}>
                <Text style={[styles.tabText, tab === k && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {tab === 'members' ? (
            <FlatList
              data={sorted}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 32 }}
              ListHeaderComponent={
                members ? (
                  <Text style={[styles.dim, { marginBottom: 4 }]}>
                    {onlineCount} kişi çevrim içi · {members.length} üye
                  </Text>
                ) : undefined
              }
              ListEmptyComponent={<Text style={[styles.dim, styles.center]}>{members ? 'Bu grupta henüz kimse yok.' : 'Yükleniyor…'}</Text>}
              renderItem={({ item: m }) => {
                const on = m.online === true || !!m.room;
                return (
                  // The row opens the profile and "Git" the room: two buttons side by side, never one inside the other.
                  <View style={styles.member}>
                    <Pressable style={styles.memberMain} onPress={() => openProfile(m.id)} accessibilityRole="button" accessibilityLabel={`${m.name}, ${ac.ROLE_LABEL[m.role]}, ${ac.memberStatus(m)}`}>
                    <Avatar uri={m.avatarUrl ?? undefined} name={m.name} size={44} online={on} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.name, { flexShrink: 1 }]} numberOfLines={1}>
                          {m.name}
                          {m.id === me ? ' (sen)' : ''}
                        </Text>
                        {m.role !== 'streamer' && <Text style={styles.role}>{ac.ROLE_LABEL[m.role]}</Text>}
                      </View>
                      <Text style={[styles.dim, on && { color: semantic.success }]} numberOfLines={1}>
                        {ac.memberStatus(m)}
                      </Text>
                    </View>
                    </Pressable>
                    {m.room && m.id !== me && (
                      <Pressable style={[styles.pill, { backgroundColor: colors.primary }]} onPress={() => router.push(`/oda/${m.room!.id}`)} accessibilityRole="button" accessibilityLabel={`${m.name} odasına git`}>
                        <Text style={styles.pillText}>Git</Text>
                      </Pressable>
                    )}
                  </View>
                );
              }}
            />
          ) : (
            <KeyboardAvoid style={{ flex: 1 }}>
              <FlatList
                ref={list}
                data={msgs ?? []}
                keyExtractor={(m) => m.id}
                contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
                onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
                ListEmptyComponent={<Text style={[styles.dim, styles.center]}>{msgs ? 'Henüz mesaj yok. İlk merhabayı sen yaz.' : 'Yükleniyor…'}</Text>}
                renderItem={({ item: m }) => {
                  const mine = m.author.id === me;
                  return (
                    <View style={[styles.msgRow, mine && { flexDirection: 'row-reverse' }]}>
                      {!mine && (
                        <Pressable onPress={() => openProfile(m.author.id)} accessibilityLabel={`${m.author.name} profili`}>
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
                <TextInput value={draft} onChangeText={setDraft} placeholder="Ajansına yaz" placeholderTextColor={colors.textDim} style={[styles.input, { flex: 1 }]} maxLength={500} onSubmitEditing={send} returnKeyType="send" />
                <Pressable onPress={send} disabled={sending} style={[styles.send, { backgroundColor: draft.trim() ? colors.primary : colors.cardAlt }]} accessibilityLabel="Gönder">
                  <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
              </View>
            </KeyboardAvoid>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  name: { color: colors.text, fontWeight: '600', fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  center: { textAlign: 'center', marginTop: 24 },
  note: { padding: 24, alignItems: 'center', gap: 12 },
  noteText: { color: colors.text, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  groups: { gap: 8, paddingHorizontal: 12, paddingTop: 4 },
  groupChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, maxWidth: 220 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: colors.card },
  tabText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 10 },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  role: { color: colors.gold, fontSize: 11, fontWeight: '800', backgroundColor: 'rgba(246,189,96,0.18)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  author: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  msgText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
}));
