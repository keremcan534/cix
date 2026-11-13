// Live mode: the personal profile part of "Profili düzenle" (boy, kilo, meslek, diller, burç, Kişilik Etiketleri,
// İlişki Durumu, Eğitim, Arkadaşlık Sloganı). Everything is optional and shown on the public profile; what is left
// empty doesn't show. The server keeps it (server/api/profiles.mjs) and checks it again; the rules are lib/profile-more.
import { Pressable, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { EDUCATION, PERSONALITY_TAGS, RELATIONSHIP, ZODIACS } from '@/data/profile';
import { EXTRA_LIMITS, LANGUAGE_OPTIONS, toggleIn, type ExtrasDraft, type ExtrasErrors } from '@/lib/profile-more';
import { makeStyles, useTheme } from '@/theme';

export function ProfileExtrasForm({ draft, errors, onChange }: { draft: ExtrasDraft; errors: ExtrasErrors; onChange: (d: ExtrasDraft) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const set = <K extends keyof ExtrasDraft>(k: K, v: ExtrasDraft[K]) => onChange({ ...draft, [k]: v });
  // A single choice: tapping the chosen one again clears it.
  const pick = (k: 'zodiac' | 'relationship' | 'education', v: string) => set(k, draft[k] === v ? '' : v);
  const digits = (t: string) => t.replace(/[^0-9]/g, '').slice(0, 3);

  return (
    <View>
      <Text style={styles.section}>Kişisel profil</Text>
      <Text style={styles.meta}>Hepsi isteğe bağlı ve profilinde görünür; boş bıraktığın görünmez.</Text>
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Boy (cm)</Text>
          <TextInput value={draft.height} onChangeText={(t) => set('height', digits(t))} keyboardType="number-pad" maxLength={3} style={styles.input} placeholder="170" placeholderTextColor={colors.textDim} accessibilityLabel="Boy, santimetre" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Kilo (kg)</Text>
          <TextInput value={draft.weight} onChangeText={(t) => set('weight', digits(t))} keyboardType="number-pad" maxLength={3} style={styles.input} placeholder="65" placeholderTextColor={colors.textDim} accessibilityLabel="Kilo, kilogram" />
        </View>
      </View>
      {(errors.height || errors.weight) && <Text style={styles.error}>{errors.height ?? errors.weight}</Text>}

      <Text style={styles.label}>Meslek</Text>
      <TextInput value={draft.job} onChangeText={(t) => set('job', t)} maxLength={EXTRA_LIMITS.job} style={styles.input} placeholder="Ne iş yapıyorsun?" placeholderTextColor={colors.textDim} />
      {errors.job && <Text style={styles.error}>{errors.job}</Text>}

      <Text style={styles.label}>{`Diller · ${draft.languages.length}/${EXTRA_LIMITS.languages}`}</Text>
      <Chips options={LANGUAGE_OPTIONS.map((l) => [l, l])} on={(v) => draft.languages.includes(v)} onPress={(v) => set('languages', toggleIn(draft.languages, v, EXTRA_LIMITS.languages))} />

      <Text style={styles.label}>Burç</Text>
      <Chips options={ZODIACS.map((z) => [z, z])} on={(v) => draft.zodiac === v} onPress={(v) => pick('zodiac', v)} />

      <Text style={styles.label}>{`Kişilik Etiketleri · ${draft.tags.length}/${EXTRA_LIMITS.tags}`}</Text>
      <Chips options={PERSONALITY_TAGS.map((t) => [t.label, `${t.emoji} ${t.label}`])} on={(v) => draft.tags.includes(v)} onPress={(v) => set('tags', toggleIn(draft.tags, v, EXTRA_LIMITS.tags))} />

      <Text style={styles.label}>İlişki Durumu</Text>
      <Chips options={RELATIONSHIP.map((r) => [r, r])} on={(v) => draft.relationship === v} onPress={(v) => pick('relationship', v)} />

      <Text style={styles.label}>Eğitim</Text>
      <Chips options={EDUCATION.map((x) => [x, x])} on={(v) => draft.education === v} onPress={(v) => pick('education', v)} />

      <Text style={styles.label}>{`Arkadaşlık Sloganı · ${draft.slogan.length}/${EXTRA_LIMITS.slogan}`}</Text>
      <TextInput
        value={draft.slogan}
        onChangeText={(t) => set('slogan', t)}
        maxLength={EXTRA_LIMITS.slogan}
        multiline
        style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]}
        placeholder="Seninle aynı frekanstakiler seni bulsun"
        placeholderTextColor={colors.textDim}
      />
      {errors.slogan && <Text style={styles.error}>{errors.slogan}</Text>}
    </View>
  );
}

function Chips({ options, on, onPress }: { options: [string, string][]; on: (v: string) => boolean; onPress: (v: string) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.chips}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onPress(v)} style={[styles.chip, on(v) && styles.chipOn]} accessibilityState={{ selected: on(v) }}>
          <Text style={{ color: colors.text, fontSize: 13 }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// The same look as the rest of the edit sheet (kullanici/[id] EditSheet).
const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  section: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 18 },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  pair: { flexDirection: 'row', gap: 10 },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  error: { color: semantic.danger, fontSize: 12, marginTop: 4, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  chipOn: { borderColor: dark ? semantic.action : semantic.actionText, backgroundColor: dark ? 'rgba(255,95,162,0.18)' : 'rgba(208,46,120,0.11)' },
}));
