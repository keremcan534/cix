import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { SignupHeader } from '@/components/signup-header';
import { GradientButton } from '@/components/ui';
import { INTERESTS, ME } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { contactRefusal, isContactBlocked, refusalTitle } from '@/lib/contact-filter';
import { IS_DEMO } from '@/lib/build';
import { liveMode, message, saveProfile } from '@/lib/live';
import { ageFromYear, birthDateOf, birthYearError, firstSignupProblem, signupStep, welcomeText } from '@/lib/signup';
import { GENDER_ART, interestParts } from '@/data/profile-art';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

export default function ProfileSetupScreen() {
  const { updateMe, login } = useApp();
  const { colors, gradient } = useTheme();
  const styles = useStyles();
  const [photo, setPhoto] = useState<string | null>(null);
  // After Google sign-in: the name Google gave, to keep or change.
  const { ad } = useLocalSearchParams<{ ad?: string }>();
  const [name, setName] = useState(typeof ad === 'string' ? ad.slice(0, 20) : '');
  const [gender, setGender] = useState<'Kadın' | 'Erkek' | null>(null);
  const [year, setYear] = useState('');
  const [city, setCity] = useState('İstanbul');
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Contact details in the name or city (lib/contact-filter): said under the fields, cleared when either changes.
  const [contactError, setContactError] = useState<string | null>(null);
  const editName = (t: string) => {
    setName(t);
    setContactError(null);
  };
  const editCity = (t: string) => {
    setCity(t);
    setContactError(null);
  };

  // Separate texts for a future or impossible year and for under 18; the age counts from 31 December (lib/signup).
  const ageError = birthYearError(year);
  const problem = firstSignupProblem({ name, gender, year });
  const valid = !problem;
  const live = liveMode();
  const { step, total } = signupStep('profil', live);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!res.canceled) setPhoto(res.assets[0].uri);
  };

  const toggleInterest = (i: string) =>
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : prev.length < 5 ? [...prev, i] : prev));

  const submit = async () => {
    if (busy) return;
    // Devam is never silent: the first missing or wrong field is named.
    if (problem) return showAlert('Profilini tamamla', problem);
    const refusal = contactRefusal(name.trim(), 'profile.name') ?? contactRefusal(city.trim(), 'profile.city');
    if (refusal) return setContactError(refusal);
    updateMe({
      name: name.trim(),
      gender: gender!,
      age: ageFromYear(Number(year)),
      // The same date the server keeps (set once), so the own profile shows the real birthday (sosyal-8).
      birthDate: birthDateOf(Number(year)),
      city: city.trim() || 'İstanbul',
      interests,
      bio: interests.length ? interests.join(' ') : 'Yeni buradayım 👋',
      verified: false,
      ...(photo ? { avatar: photo } : {}),
    });
    // Live mode: the account is opened on the server now, so other phones see this name, age and city. There is
    // no selfie check behind it yet, so sign-up ends here and nothing claims the person is verified (giris-6).
    if (live) {
      setBusy(true);
      try {
        await saveProfile({ ...ME }, Number(year));
      } catch (e) {
        // The server's contact note is the whole answer: the connection is fine, the text has to change.
        if (isContactBlocked(e)) setContactError(message(e));
        showAlert(refusalTitle(e, 'Hesap açılamadı'), isContactBlocked(e) ? message(e) : `${message(e)}\n\nİnternet bağlantını kontrol edip tekrar dene.`);
        return;
      } finally {
        setBusy(false);
      }
      login();
      showAlert('Hoş geldin! 🎉', welcomeText(true, IS_DEMO));
      return;
    }
    router.push('/giris/dogrulama');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoid style={{ flex: 1 }}>
        <SignupHeader step={step} total={total} title="Profilini oluştur" subtitle="Diğer kullanıcılar seni böyle görecek." />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} keyboardShouldPersistTaps="handled">
          <Pressable style={{ alignSelf: 'center' }} onPress={pickPhoto}>
            <LinearGradient colors={gradient} style={styles.photoRing}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}>
                  <Ionicons name="camera" size={34} color={colors.textDim} />
                </View>
              )}
            </LinearGradient>
            <View style={styles.photoPlus}>
              <Ionicons name="add" size={18} color="#fff" />
            </View>
          </Pressable>

          <Field label="Adın">
            <TextInput value={name} onChangeText={editName} placeholder="Örn. Elif" placeholderTextColor={colors.textDim} style={styles.input} maxLength={20} />
          </Field>

          <Field label="Cinsiyet">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['Kadın', 'Erkek'] as const).map((g) => (
                <Chip key={g} label={g} art={GENDER_ART[g]} active={gender === g} onPress={() => setGender(g)} grow />
              ))}
            </View>
          </Field>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Doğum yılı">
                <TextInput
                  value={year}
                  onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="2000"
                  placeholderTextColor={colors.textDim}
                  keyboardType="number-pad"
                  style={styles.input}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Şehir">
                <TextInput value={city} onChangeText={editCity} placeholderTextColor={colors.textDim} style={styles.input} />
              </Field>
            </View>
          </View>
          {ageError && <Text style={styles.error}>{ageError}</Text>}
          {contactError && (
            <Text style={styles.error} accessibilityRole="alert">
              {contactError}
            </Text>
          )}

          <Field label={`İlgi alanları (${interests.length}/5)`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INTERESTS.map((i) => (
                <InterestChip key={i} label={i} active={interests.includes(i)} onPress={() => toggleInterest(i)} />
              ))}
            </View>
          </Field>
        </ScrollView>
        <View style={{ padding: 20, paddingTop: 8 }}>
          <GradientButton title={busy ? 'Hesabın açılıyor…' : 'Devam'} onPress={submit} style={{ opacity: valid && !busy ? 1 : 0.4 }} />
        </View>
      </KeyboardAvoid>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, art, active, onPress, grow }: { label: string; art?: ArtName; active: boolean; onPress: () => void; grow?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.chip, art && styles.chipRow, grow && { flex: 1, alignItems: 'center', justifyContent: 'center' }, active && styles.chipActive]}>
      {art && <Art name={art} size={18} />}
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** An interest chip: its 3D picture and name, or the stored emoji label when there is no picture. */
function InterestChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { art, name } = interestParts(label);
  return <Chip label={art ? name : label} art={art} active={active} onPress={onPress} />;
}

const useStyles = makeStyles(({ colors, dark, lift }) => ({
  photoRing: { width: 116, height: 116, borderRadius: 58, padding: 3 },
  photo: { flex: 1, borderRadius: 56, borderWidth: 3, borderColor: colors.bg },
  photoEmpty: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  photoPlus: { position: 'absolute', right: 4, bottom: 4, backgroundColor: colors.primary, borderRadius: 14, padding: 4, borderWidth: 2, borderColor: colors.bg },
  label: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: colors.card, borderRadius: 14, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingVertical: 13, ...lift },
  error: { color: colors.red, fontSize: 13, marginTop: -12 },
  // Light: white chips carry a hairline-blue outline so they read on the paper background.
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1.5, borderColor: dark ? 'transparent' : colors.border },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipActive: { borderColor: colors.primaryText, backgroundColor: dark ? 'rgba(19,217,223,0.18)' : 'rgba(0,140,148,0.11)' },
  chipText: { color: colors.textDim, fontWeight: '600' },
}));
