// Etkinlik Merkezi: the application form (and the edit of one). The room's owner names the event, picks its type,
// its theme (a theme opens at a room level), a cover, when and how long, how many places, whether people reserve and
// who sees it; then sends it for review or keeps it as a draft. The server checks every rule again
// (server/api/events.mjs) and its Turkish reason is shown as it is.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { DURATIONS, THEME_LOOK, clock, dayLabel, firstStart, lookOf, whenText } from '@/lib/events';
import { putPhoto, type PickedImage } from '@/lib/live/profile';
import { pickRoomPicture } from '@/lib/room-picture';
import { makeStyles, useTheme } from '@/theme';

/** The cover's shape (16:9), cut on the phone before it is uploaded. */
const COVER = { width: 1280, height: 720 };
const CAPACITIES = [null, 20, 50, 100, 200, 500, 1000];
const STEP = 15 * 60_000;

type Props = {
  meta: api.EventMeta;
  /** The room a new application is for (the first of mine when not given). */
  room?: string;
  edit?: api.EventDetail;
  onClose: () => void;
  onSaved: (e: api.EventDetail) => void;
};

export function EventFormView({ meta, room: roomId, edit, onClose, onSaved }: Props) {
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const earliest = firstStart(meta.rules.minLeadMinutes).getTime();
  const [room, setRoom] = useState(edit?.room.id ?? roomId ?? meta.rooms[0]?.id ?? '');
  const level = meta.rooms.find((r) => r.id === room)?.level ?? 1;
  const [title, setTitle] = useState(edit?.title ?? '');
  const [category, setCategory] = useState(edit?.category.id ?? meta.categories[0]?.id ?? '');
  const [theme, setTheme] = useState<string | null>(edit?.theme ?? null);
  const [description, setDescription] = useState(edit?.description ?? '');
  const [rules, setRules] = useState(edit?.rules ?? '');
  const [cover, setCover] = useState<string | null>(edit?.coverUrl ?? null);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [start, setStart] = useState(() => Math.max(earliest, edit ? new Date(edit.startsAt).getTime() : earliest + 60 * 60_000));
  const [minutes, setMinutes] = useState(edit ? Math.round((new Date(edit.endsAt).getTime() - new Date(edit.startsAt).getTime()) / 60_000) : 60);
  const [capacity, setCapacity] = useState<number | null>(edit ? edit.capacity : 100);
  const [reservation, setReservation] = useState(edit?.reservation ?? true);
  const [visibility, setVisibility] = useState<'public' | 'room'>(edit?.visibility ?? 'public');
  const [busy, setBusy] = useState(false);

  // Left unchosen, the type's theme while the room has reached it, else the plain one (as the server does).
  const catTheme = meta.categories.find((c) => c.id === category)?.theme ?? 'sade';
  const autoTheme = (meta.themes.find((t) => t.id === catTheme)?.minLevel ?? 1) <= level ? catTheme : 'sade';
  const shownTheme = theme ?? autoTheme;
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(earliest + i * 86_400_000)), [earliest]);
  const durations = DURATIONS.filter((d) => d <= meta.rules.maxMinutes);
  const capacities = CAPACITIES.filter((c) => c === null || c <= meta.rules.maxCapacity);

  const setDay = (d: Date) => {
    const s = new Date(start);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.getHours(), s.getMinutes()).getTime();
    setStart(Math.max(earliest, next));
  };
  const shift = (by: number) => setStart((s) => Math.max(earliest, s + by));

  const pick = async () => {
    try {
      const img = await pickRoomPicture(COVER);
      if (img) {
        setPicked(img);
        setCover(img.uri);
      }
    } catch (e) {
      showAlert('Görsel seçilemedi', e instanceof Error ? e.message : undefined);
    }
  };

  const save = async (draft: boolean) => {
    if (busy) return;
    if (title.trim().length < 3) return showAlert('Etkinlik adı gerekli', 'En az 3 harf yaz.');
    if (!category) return showAlert('Etkinlik türü seç');
    if (start < Date.now() + meta.rules.minLeadMinutes * 60_000) return showAlert('Başlangıç zamanı', `Etkinlik en erken ${meta.rules.minLeadMinutes} dakika sonrası için planlanabilir.`);
    setBusy(true);
    try {
      const coverUrl = picked ? await putPhoto('eventcover', picked) : cover;
      const form: api.EventForm = {
        room,
        category,
        theme: theme ?? undefined,
        title: title.trim(),
        description: description.trim(),
        rules: rules.trim(),
        coverUrl,
        startsAt: new Date(start).toISOString(),
        minutes,
        capacity,
        reservation,
        visibility,
        draft,
      };
      const e = edit ? await api.editEvent(edit.id, form) : await api.applyEvent(form);
      onSaved(e);
    } catch (err) {
      showAlert('Kaydedilemedi', err instanceof Error ? err.message : 'Bir sorun oldu, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const chip = (key: string, label: string, on: boolean, onPress: () => void, lock?: string) => (
    <Pressable key={key} onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" aria-checked={on}>
      {lock && <Ionicons name="lock-closed" size={12} color={on ? semantic.actionInk : colors.textDim} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoid style={{ flex: 1 }}>
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <View style={styles.top}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat" style={styles.icon}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.heading}>{edit ? 'Etkinliği düzenle' : 'Etkinlik oluştur'}</Text>
            <View style={styles.icon} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 140 }} keyboardShouldPersistTaps="handled">
            {!edit && meta.rooms.length > 1 && (
              <Field label="Oda">
                <View style={styles.wrap}>{meta.rooms.map((r) => chip(r.id, `${r.title} · Lv.${r.level}`, r.id === room, () => setRoom(r.id)))}</View>
              </Field>
            )}
            <Field label="Etkinlik adı" hint={`${title.trim().length}/40`}>
              <TextInput value={title} onChangeText={setTitle} maxLength={40} placeholder="Örn. Akustik Cuma Gecesi" placeholderTextColor={colors.textDim} style={styles.input} />
            </Field>
            <Field label="Etkinlik türü">
              <View style={styles.wrap}>
                {meta.categories.map((c) =>
                  chip(c.id, c.name, c.id === category, () => {
                    setCategory(c.id);
                    setTheme(null);
                  }),
                )}
              </View>
            </Field>
            <Field label="Tema" hint="Odanın seviyesi yükseldikçe yeni temalar açılır">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                {meta.themes.map((t) => {
                  const look = THEME_LOOK[t.id] ?? lookOf(t.id);
                  const locked = t.minLevel > level;
                  const on = t.id === shownTheme;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => (locked ? showAlert(t.name, `Bu tema Oda Lv.${t.minLevel} ve üstünde açılır. Odan şu an Lv.${level}.`) : setTheme(t.id))}
                      style={[styles.theme, on && { borderColor: colors.primaryText }]}
                      accessibilityRole="radio"
                      aria-checked={on}
                      accessibilityLabel={`${t.name}${locked ? `, Oda Lv.${t.minLevel} ile açılır` : ''}`}
                    >
                      <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.themeArt, locked && { opacity: 0.45 }]}>
                        <Ionicons name={look.icon} size={26} color="#fff" />
                      </LinearGradient>
                      <Text style={styles.themeName} numberOfLines={1}>
                        {t.name}
                      </Text>
                      <View style={styles.lvRow}>
                        {locked && <Ionicons name="lock-closed" size={10} color={colors.textDim} />}
                        <Text style={styles.themeLv}>Oda Lv.{t.minLevel}</Text>
                      </View>
                      {on && (
                        <View style={styles.check}>
                          <Ionicons name="checkmark" size={12} color={semantic.actionInk} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.hint}>{lookOf(shownTheme).blurb}</Text>
            </Field>
            <Field label="Kapak görseli" hint="İsteğe bağlı · 16:9">
              <Pressable onPress={pick} style={styles.cover} accessibilityRole="button" accessibilityLabel="Kapak görseli seç">
                {cover ? (
                  <Image source={{ uri: cover }} style={StyleFill} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={lookOf(shownTheme).colors} style={[StyleFill, { alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
                    <Ionicons name="image-outline" size={30} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Görsel seç</Text>
                  </LinearGradient>
                )}
              </Pressable>
              {cover && (
                <Pressable
                  onPress={() => {
                    setCover(null);
                    setPicked(null);
                  }}
                  hitSlop={6}
                >
                  <Text style={styles.link}>Görseli kaldır</Text>
                </Pressable>
              )}
            </Field>
            <Field label="Açıklama" hint={`${description.length}/300`}>
              <TextInput value={description} onChangeText={setDescription} maxLength={300} multiline placeholder="Etkinlikte neler olacak?" placeholderTextColor={colors.textDim} style={[styles.input, styles.multi]} />
            </Field>
            <Field label="Etkinlik kuralları" hint={`${rules.length}/500`}>
              <TextInput value={rules} onChangeText={setRules} maxLength={500} multiline placeholder="Katılanların uyacağı kurallar" placeholderTextColor={colors.textDim} style={[styles.input, styles.multi]} />
            </Field>
            <Field label="Başlangıç" hint={whenText(new Date(start).toISOString())}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
                {days.map((d) => chip(String(d.getTime()), dayLabel(d), new Date(start).toDateString() === d.toDateString(), () => setDay(d)))}
              </ScrollView>
              <View style={styles.clockRow}>
                <Pressable onPress={() => shift(-STEP)} style={styles.step} accessibilityLabel="15 dakika önce" disabled={start - STEP < earliest}>
                  <Ionicons name="remove" size={20} color={start - STEP < earliest ? colors.border : colors.text} />
                </Pressable>
                <Text style={styles.clock}>{clock(new Date(start))}</Text>
                <Pressable onPress={() => shift(STEP)} style={styles.step} accessibilityLabel="15 dakika sonra">
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => shift(60 * 60_000)} style={styles.stepWide}>
                  <Text style={styles.chipText}>+1 saat</Text>
                </Pressable>
              </View>
            </Field>
            <Field label="Süre">
              <View style={styles.wrap}>{durations.map((d) => chip(String(d), d < 60 ? `${d} dk` : d % 60 ? `${Math.floor(d / 60)} sa ${d % 60} dk` : `${d / 60} saat`, d === minutes, () => setMinutes(d)))}</View>
            </Field>
            <Field label="Kontenjan">
              <View style={styles.wrap}>{capacities.map((c) => chip(String(c), c === null ? 'Sınırsız' : `${c} kişi`, c === capacity, () => setCapacity(c)))}</View>
            </Field>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Yer ayırtma</Text>
                <Text style={styles.hint}>{reservation ? 'Katılmak isteyenler önceden yer ayırtır.' : 'Herkes yer ayırtmadan katılabilir.'}</Text>
              </View>
              <Switch value={reservation} onValueChange={setReservation} trackColor={{ true: semantic.action, false: colors.border }} />
            </View>
            <Field label="Kimler görsün">
              <View style={styles.wrap}>
                {chip('public', 'Herkes (Etkinlik Alanı)', visibility === 'public', () => setVisibility('public'))}
                {chip('room', 'Yalnız odamdakiler', visibility === 'room', () => setVisibility('room'))}
              </View>
            </Field>
            <View style={styles.note}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primaryText} />
              <Text style={[styles.hint, { flex: 1 }]}>
                Başvurun yönetim tarafından incelenir; onaylanınca yayınlanır. Zamanı gelince odanı açıp etkinliği başlatman gerekir: başlangıçtan sonra {meta.rules.graceMinutes} dakika içinde başlatılmayan etkinlik sona erer.
              </Text>
            </View>
          </ScrollView>
          <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
            {(!edit || edit.state === 'draft') && <Button title="Taslak kaydet" variant="ghost" small onPress={() => save(true)} disabled={busy} style={{ flex: 1 }} />}
            <Button title={busy ? 'Gönderiliyor…' : 'İncelemeye gönder'} icon="send" onPress={() => save(false)} disabled={busy} style={{ flex: 2 }} />
          </View>
        </View>
      </KeyboardAvoid>
    </Modal>
  );
}

const StyleFill = { position: 'absolute' as const, left: 0, top: 0, right: 0, bottom: 0 };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? (
          <Text style={styles.hint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '800' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  label: { color: colors.text, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, flexShrink: 1 },
  input: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  multi: { minHeight: 84, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: semantic.action, borderColor: semantic.action },
  chipText: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  chipTextOn: { color: semantic.actionInk },
  theme: { width: 104, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.card, gap: 4 },
  themeArt: { height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  themeName: { color: colors.text, fontSize: 12.5, fontWeight: '800' },
  themeLv: { color: colors.textDim, fontSize: 11 },
  lvRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  check: { position: 'absolute', right: 10, top: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: semantic.action, alignItems: 'center', justifyContent: 'center' },
  cover: { height: 170, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card },
  link: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepWide: { height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  clock: { color: colors.text, fontSize: 28, fontWeight: '800', minWidth: 92, textAlign: 'center', fontVariant: ['tabular-nums'] },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  note: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.card },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
}));
