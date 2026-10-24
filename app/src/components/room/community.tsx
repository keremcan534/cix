import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { roomStyles } from '@/components/room/parts';
import { Avatar, GradientButton } from '@/components/ui';
import { userById, type User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import type { Settings } from '@/store';
import { colors } from '@/theme';

export type Poll = { id: string; question: string; options: { text: string; votes: number }[]; myVote: number | null; endsIn: number; live: boolean; closed: boolean };
export type Goal = { id: string; title: string; kind: 'join' | 'like' | 'event'; target: number; progress: number; endsIn: number; paid: boolean };
export type RoomEvent = { id: string; title: string; desc: string; when: string; type: string; by: string; going: boolean; reminder: boolean; attendees: number; cancelled: boolean };
export type Question = { id: string; userId: string; text: string; picked: boolean };
export type ModLog = { id: string; time: string; actor: string; action: string; target: string; reason: string };

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={[roomStyles.sheet, { maxHeight: '80%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[roomStyles.sheetTitle, { flex: 1, marginBottom: 0 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Chips<T extends string | number>({ items, value, onChange }: { items: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <Pressable key={String(i.v)} onPress={() => onChange(i.v)} style={[styles.chip, value === i.v && { borderColor: colors.pink }]}>
          <Text style={styles.chipText}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// --- Poll ------------------------------------------------------------------------
export function PollCard({ poll, onVote, canManage, onClose }: { poll: Poll; onVote: (i: number) => void; canManage: boolean; onClose: () => void }) {
  const total = poll.options.reduce((s, o) => s + o.votes, 0) || 1;
  const showResults = poll.closed || poll.live || poll.myVote !== null;
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>📊 {poll.question}</Text>
        <Text style={styles.dim}>{poll.closed ? 'Kapandı' : `${poll.endsIn}s`}</Text>
        {canManage && !poll.closed && (
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ color: colors.red, fontSize: 12, fontWeight: '700' }}>Kapat</Text>
          </Pressable>
        )}
      </View>
      {poll.options.map((o, i) => (
        <Pressable key={o.text} disabled={poll.closed || poll.myVote !== null} onPress={() => onVote(i)} style={styles.option}>
          {showResults && <View style={[styles.optionFill, { width: `${(o.votes / total) * 100}%` }]} />}
          <Text style={{ color: '#fff', fontWeight: poll.myVote === i ? '800' : '500', flex: 1 }}>
            {poll.myVote === i ? '✓ ' : ''}
            {o.text}
          </Text>
          {showResults && <Text style={styles.dim}>{Math.round((o.votes / total) * 100)}%</Text>}
        </Pressable>
      ))}
      <Text style={styles.dim}>Kullanıcı başına 1 oy · {poll.live ? 'sonuçlar anlık' : 'sonuçlar oy verince/sonunda'} · nakit ödül yok</Text>
    </View>
  );
}

export function PollCreate({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (q: string, opts: string[], seconds: number, live: boolean) => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [seconds, setSeconds] = useState(60);
  const [live, setLive] = useState(true);
  const create = () => {
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    if (q.trim().length < 4 || clean.length < 2) return showAlert('Soru ve en az 2 seçenek gerekli');
    onCreate(q.trim(), clean, seconds, live);
    setQ('');
    setOpts(['', '']);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="📊 Anket oluştur">
      <TextInput value={q} onChangeText={setQ} placeholder="Soru" placeholderTextColor={colors.textDim} style={styles.input} />
      {opts.map((o, i) => (
        <TextInput key={i} value={o} onChangeText={(t) => setOpts((l) => l.map((x, j) => (j === i ? t : x)))} placeholder={`Seçenek ${i + 1}`} placeholderTextColor={colors.textDim} style={styles.input} />
      ))}
      {opts.length < 4 && (
        <Pressable onPress={() => setOpts((l) => [...l, ''])}>
          <Text style={{ color: colors.pink, fontWeight: '700' }}>+ Seçenek ekle</Text>
        </Pressable>
      )}
      <Text style={styles.label}>Süre</Text>
      <Chips
        items={[
          { v: 30, label: '30 sn' },
          { v: 60, label: '1 dk' },
          { v: 300, label: '5 dk' },
        ]}
        value={seconds}
        onChange={setSeconds}
      />
      <View style={styles.row}>
        <Text style={{ color: '#fff', flex: 1 }}>Sonuçları anlık göster</Text>
        <Switch value={live} onValueChange={setLive} />
      </View>
      <GradientButton title="Başlat" icon="stats-chart" onPress={create} />
    </Sheet>
  );
}

// --- Community goal ---------------------------------------------------------------
export function GoalCard({ goal }: { goal: Goal }) {
  const done = goal.progress >= goal.target;
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>
          🎯 {goal.title} {goal.paid ? '· 💰 ücretli hedef' : ''}
        </Text>
        <Text style={styles.dim}>{done ? '✅ Tamamlandı' : `${Math.ceil(goal.endsIn / 60)} dk kaldı`}</Text>
      </View>
      <View style={styles.track}>
        <View style={{ height: 6, backgroundColor: done ? colors.green : colors.pink, width: `${Math.min(100, (goal.progress / goal.target) * 100)}%` }} />
      </View>
      <Text style={styles.dim}>
        {goal.progress}/{goal.target}
      </Text>
    </View>
  );
}

export function GoalCreate({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (g: Omit<Goal, 'id' | 'progress'>) => void }) {
  const [kind, setKind] = useState<Goal['kind']>('join');
  const [target, setTarget] = useState(10);
  const titles: Record<Goal['kind'], string> = { join: 'Yeni katılımcı', like: 'Geçerli beğeni', event: 'Etkinliğe katılım' };
  return (
    <Sheet visible={visible} onClose={onClose} title="🎯 Topluluk hedefi">
      <Text style={styles.dim}>Hedefler ücretli hediye gerektirmez. Hediye temelli hedefler açıkça &quot;ücretli&quot; olarak işaretlenir.</Text>
      <Chips
        items={[
          { v: 'join', label: '👥 Yeni katılımcı' },
          { v: 'like', label: '❤️ Beğeni' },
          { v: 'event', label: '📅 Etkinlik katılımı' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Chips
        items={[
          { v: 5, label: '5' },
          { v: 10, label: '10' },
          { v: 25, label: '25' },
        ]}
        value={target}
        onChange={setTarget}
      />
      <GradientButton title="Hedefi başlat (10 dk)" icon="flag" onPress={() => onCreate({ title: `${target} ${titles[kind]}`, kind, target, endsIn: 600, paid: false })} />
    </Sheet>
  );
}

// --- Events calendar ------------------------------------------------------------------
export function EventsSheet({
  visible,
  onClose,
  events,
  canManage,
  onCreate,
  onToggleGoing,
  onToggleReminder,
  onCancel,
}: {
  visible: boolean;
  onClose: () => void;
  events: RoomEvent[];
  canManage: boolean;
  onCreate: (e: Pick<RoomEvent, 'title' | 'desc' | 'when' | 'type'>) => void;
  onToggleGoing: (id: string) => void;
  onToggleReminder: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [when, setWhen] = useState('Bugün 21:00');
  const [type, setType] = useState('Sohbet');
  return (
    <Sheet visible={visible} onClose={onClose} title="📅 Oda etkinlikleri">
      {events.length === 0 && <Text style={styles.dim}>Planlanmış etkinlik yok.</Text>}
      {events.map((e) => (
        <View key={e.id} style={[styles.card, e.cancelled && { opacity: 0.5 }]}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>
            {e.cancelled ? '❌ İPTAL · ' : ''}
            {e.title}
          </Text>
          <Text style={styles.dim}>
            {e.when} · {e.type} · {e.attendees + (e.going ? 1 : 0)} katılımcı · oluşturan {userById(e.by).name}
          </Text>
          {!!e.desc && <Text style={{ color: '#fff', fontSize: 13 }}>{e.desc}</Text>}
          {!e.cancelled && (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pressable onPress={() => onToggleGoing(e.id)} style={[styles.small, e.going && { backgroundColor: colors.green }]}>
                <Text style={styles.smallText}>{e.going ? '✓ Katılıyorum' : 'Katıl'}</Text>
              </Pressable>
              <Pressable onPress={() => onToggleReminder(e.id)} style={[styles.small, e.reminder && { backgroundColor: colors.primary }]}>
                <Text style={styles.smallText}>{e.reminder ? '🔔 Hatırlatılacak' : '🔕 Hatırlat'}</Text>
              </Pressable>
              {canManage && (
                <Pressable onPress={() => onCancel(e.id)} style={[styles.small, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.smallText, { color: colors.red }]}>İptal et</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      ))}
      {canManage && (
        <>
          <Text style={styles.label}>Yeni etkinlik</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Etkinlik adı" placeholderTextColor={colors.textDim} style={styles.input} />
          <TextInput value={desc} onChangeText={setDesc} placeholder="Açıklama" placeholderTextColor={colors.textDim} style={styles.input} />
          <Chips
            items={[
              { v: 'Bugün 21:00', label: 'Bugün 21:00' },
              { v: 'Yarın 20:00', label: 'Yarın 20:00' },
              { v: 'Cmt 22:00', label: 'Cmt 22:00' },
            ]}
            value={when}
            onChange={setWhen}
          />
          <Chips
            items={[
              { v: 'Sohbet', label: 'Sohbet' },
              { v: 'Müzik', label: 'Müzik' },
              { v: 'Oyun', label: 'Oyun' },
              { v: 'Soru-cevap', label: 'Soru-cevap' },
            ]}
            value={type}
            onChange={setType}
          />
          <GradientButton
            title="Etkinlik oluştur"
            icon="calendar"
            onPress={() => {
              if (title.trim().length < 3) return showAlert('Etkinlik adı gerekli');
              onCreate({ title: title.trim(), desc: desc.trim(), when, type });
              setTitle('');
              setDesc('');
            }}
          />
        </>
      )}
    </Sheet>
  );
}

// --- Q&A ----------------------------------------------------------------------------
export function QuestionsSheet({ visible, onClose, questions, canManage, onAsk, onPick }: { visible: boolean; onClose: () => void; questions: Question[]; canManage: boolean; onAsk: (t: string) => void; onPick: (id: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Sheet visible={visible} onClose={onClose} title="❓ Sorular">
      {questions.length === 0 && <Text style={styles.dim}>Henüz soru yok.</Text>}
      {questions.map((q) => (
        <View key={q.id} style={[styles.row, q.picked && styles.picked]}>
          <Avatar uri={userById(q.userId).avatar} size={30} />
          <Text style={{ color: '#fff', flex: 1 }}>
            <Text style={{ fontWeight: '700' }}>{q.userId === 'me' ? 'Sen' : userById(q.userId).name}: </Text>
            {q.text}
          </Text>
          {canManage && !q.picked && (
            <Pressable onPress={() => onPick(q.id)} style={styles.small}>
              <Text style={styles.smallText}>Seç</Text>
            </Pressable>
          )}
          {q.picked && <Text style={{ color: colors.gold, fontWeight: '800' }}>🎤</Text>}
        </View>
      ))}
      <TextInput value={text} onChangeText={setText} placeholder="Sorunu yaz" placeholderTextColor={colors.textDim} style={styles.input} />
      <GradientButton
        small
        title="Soru gönder"
        onPress={() => {
          if (text.trim().length < 3) return;
          onAsk(text.trim());
          setText('');
        }}
      />
    </Sheet>
  );
}

// --- Personal sound settings ------------------------------------------------------------
type SetFn = <K extends keyof Settings>(k: K, v: Settings[K]) => void;

function Volume({ settings, set, k, label }: { settings: Settings; set: SetFn; k: 'musicVolume' | 'voiceVolume'; label: string }) {
  return (
    <View style={styles.row}>
      <Text style={{ color: '#fff', flex: 1 }}>{label}</Text>
      {[0, 0.3, 0.7, 1].map((v) => (
        <Pressable key={v} onPress={() => set(k, v)} style={[styles.vol, settings[k] === v && { backgroundColor: colors.primary }]}>
          <Text style={styles.smallText}>{v === 0 ? 'Kapalı' : `%${v * 100}`}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SoundToggle({ settings, set, k, label }: { settings: Settings; set: SetFn; k: 'roomMuted' | 'giftSounds' | 'bigGiftsOnly' | 'reduceMotion' | 'effectsOff'; label: string }) {
  return (
    <View style={styles.row}>
      <Text style={{ color: '#fff', flex: 1 }}>{label}</Text>
      <Switch value={settings[k]} onValueChange={(v) => set(k, v)} />
    </View>
  );
}
export function SoundSheet({
  visible,
  onClose,
  settings,
  set,
  isOwner,
  roomFx,
  setRoomFx,
}: {
  visible: boolean;
  onClose: () => void;
  settings: Settings;
  set: SetFn;
  isOwner: boolean;
  roomFx: { giftEffects: boolean; joinSounds: boolean };
  setRoomFx: (p: Partial<{ giftEffects: boolean; joinSounds: boolean }>) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="🔊 Ses ve efekt ayarları">
      <Text style={styles.dim}>Bu ayarlar yalnızca senin deneyimini etkiler; hediye işlemlerini ve kayıtlarını değiştirmez.</Text>
      <SoundToggle settings={settings} set={set} k="roomMuted" label="Oda sesini kapat" />
      <Volume settings={settings} set={set} k="voiceVolume" label="Konuşma sesi" />
      <Volume settings={settings} set={set} k="musicVolume" label="Müzik sesi" />
      <SoundToggle settings={settings} set={set} k="giftSounds" label="Hediye sesleri" />
      <SoundToggle settings={settings} set={set} k="bigGiftsOnly" label="Sadece büyük hediyelerin efektini göster" />
      <SoundToggle settings={settings} set={set} k="reduceMotion" label="Animasyonları azalt" />
      <SoundToggle settings={settings} set={set} k="effectsOff" label="Hediye ve giriş efektlerini kapat" />
      <Text style={styles.dim}>Ses çıkış cihazı (hoparlör/kulaklık/Bluetooth) işletim sisteminden seçilir.</Text>
      {isOwner && (
        <>
          <Text style={styles.label}>Oda geneli (sahip)</Text>
          <View style={styles.row}>
            <Text style={{ color: '#fff', flex: 1 }}>Odada hediye efektleri</Text>
            <Switch value={roomFx.giftEffects} onValueChange={(v) => setRoomFx({ giftEffects: v })} />
          </View>
          <View style={styles.row}>
            <Text style={{ color: '#fff', flex: 1 }}>Giriş/çıkış sesleri</Text>
            <Switch value={roomFx.joinSounds} onValueChange={(v) => setRoomFx({ joinSounds: v })} />
          </View>
        </>
      )}
    </Sheet>
  );
}

// --- Moderation -------------------------------------------------------------------------
export function ModerationSheet({
  visible,
  onClose,
  log,
  slowMode,
  setSlowMode,
  words,
  setWords,
  bans,
}: {
  visible: boolean;
  onClose: () => void;
  log: ModLog[];
  slowMode: boolean;
  setSlowMode: (v: boolean) => void;
  words: string[];
  setWords: (w: string[]) => void;
  bans: { userId: string; until: string }[];
}) {
  const [word, setWord] = useState('');
  return (
    <Sheet visible={visible} onClose={onClose} title="🛡️ Moderasyon">
      <View style={styles.row}>
        <Text style={{ color: '#fff', flex: 1 }}>🐢 Yavaş mod (10 sn&apos;de 1 mesaj)</Text>
        <Switch value={slowMode} onValueChange={setSlowMode} />
      </View>
      <Text style={styles.label}>Kelime filtresi</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {words.map((w) => (
          <Pressable key={w} onPress={() => setWords(words.filter((x) => x !== w))} style={styles.chip}>
            <Text style={styles.chipText}>{w} ✕</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <TextInput value={word} onChangeText={setWord} placeholder="Yasaklı kelime ekle" placeholderTextColor={colors.textDim} style={[styles.input, { flex: 1 }]} />
        <Pressable
          style={styles.small}
          onPress={() => {
            if (!word.trim()) return;
            setWords([...words, word.trim().toLowerCase()]);
            setWord('');
          }}
        >
          <Text style={styles.smallText}>Ekle</Text>
        </Pressable>
      </View>
      <Text style={styles.label}>Giriş yasakları</Text>
      {bans.length === 0 ? (
        <Text style={styles.dim}>Aktif yasak yok.</Text>
      ) : (
        bans.map((b) => (
          <Text key={b.userId} style={{ color: '#fff' }}>
            ⛔ {userById(b.userId).name} · {b.until} süreyle
          </Text>
        ))
      )}
      <Text style={styles.label}>Raporlar</Text>
      <Text style={styles.dim}>• 2 açık rapor: spam (Onur), hakaret (anonim) — platform moderasyonuna iletildi</Text>
      <Text style={styles.label}>Moderasyon geçmişi (denetim kaydı)</Text>
      {log.length === 0 && <Text style={styles.dim}>Kayıt yok.</Text>}
      {log.map((l) => (
        <Text key={l.id} style={styles.dim}>
          {l.time} · {l.actor} → {l.action} · {l.target} {l.reason ? `(${l.reason})` : ''}
        </Text>
      ))}
    </Sheet>
  );
}

// --- Invite friends ---------------------------------------------------------------------
export function InviteSheet({ visible, onClose, friends, invited, onInvite }: { visible: boolean; onClose: () => void; friends: User[]; invited: Record<string, 'Davet edildi' | 'Katıldı'>; onInvite: (id: string) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="📨 Arkadaşlarını davet et">
      {friends.length === 0 && <Text style={styles.dim}>Takip ettiğin kimse yok. Keşfet&apos;ten takip etmeye başla.</Text>}
      {friends.map((u) => (
        <View key={u.id} style={styles.row}>
          <Avatar uri={u.avatar} size={36} online={u.online} />
          <Text style={{ color: '#fff', flex: 1 }}>
            {u.name} <Text style={styles.dim}>{u.online ? '· çevrimiçi' : '· çevrimdışı'}</Text>
          </Text>
          {invited[u.id] ? (
            <Text style={{ color: invited[u.id] === 'Katıldı' ? colors.green : colors.gold, fontWeight: '700', fontSize: 12 }}>{invited[u.id]}</Text>
          ) : (
            <Pressable onPress={() => onInvite(u.id)} style={styles.small}>
              <Text style={styles.smallText}>Davet et</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Text style={styles.dim}>Kimin sana davet gönderebileceğini Ayarlar &gt; Gizlilik&apos;ten sınırlayabilirsin.</Text>
    </Sheet>
  );
}

// --- Bulk gift results ----------------------------------------------------------------------
export function GiftResults({ visible, onClose, results }: { visible: boolean; onClose: () => void; results: { userId: string; ok: boolean }[] }) {
  const ok = results.filter((r) => r.ok).length;
  return (
    <Sheet visible={visible} onClose={onClose} title={`🎁 Gönderim sonucu (${ok}/${results.length})`}>
      {ok < results.length && <Text style={{ color: colors.gold }}>Bakiye yetmediği için bazı hediyeler gönderilmedi; sadece teslim edilenler ücretlendirildi.</Text>}
      {results.map((r) => (
        <View key={r.userId} style={styles.row}>
          <Avatar uri={userById(r.userId).avatar} size={30} />
          <Text style={{ color: '#fff', flex: 1 }}>{userById(r.userId).name}</Text>
          <Text style={{ color: r.ok ? colors.green : colors.red, fontWeight: '800' }}>{r.ok ? '✓ Teslim edildi' : '✗ Gönderilmedi'}</Text>
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, padding: 10, gap: 6, marginHorizontal: 12, marginTop: 6 },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden' },
  optionFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(139,92,246,0.45)' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  label: { color: colors.textDim, fontWeight: '700', fontSize: 13, marginTop: 4 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: 'transparent' },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  small: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  smallText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  vol: { backgroundColor: colors.cardAlt, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  picked: { backgroundColor: 'rgba(251,191,36,0.15)', borderRadius: 10, paddingHorizontal: 6 },
});
