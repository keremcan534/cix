import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { Button, Card, Header, VerifiedBadge } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { liveMode, message } from '@/lib/live';
import { loadVerify, refreshVerify, startVerify, withdrawVerify } from '@/lib/live/verify';
import { KIND_TEXT, VERIFY_KINDS, canStart, canWithdraw, statusText, type VerifyKind, type VerifyState } from '@/lib/verify-core';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

/**
 * Kimlik Doğrulamam (server/api/verify.mjs, docs/YUZ_DOGRULAMA.md): the ID check for money out and the optional face
 * check for the blue badge. Each opens only after its own consent (the server's text, box unticked); the provider's
 * page opens in the browser and sends the person back here (similarclub://kimlik-dogrulama), and the screen asks the
 * server again whenever it comes back to the front.
 */
export default function VerifyScreen() {
  const live = liveMode();
  const { updateMe } = useApp();
  const { colors, semantic } = useTheme();
  const styles = useStyles();
  const params = useLocalSearchParams<{ status?: string }>();
  const [state, setState] = useState<VerifyState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<VerifyKind | null>(null);
  const [asking, setAsking] = useState<VerifyKind | null>(null);
  const [ticked, setTicked] = useState(false);
  // The kind whose page was opened: asked again when the app comes back.
  const opened = useRef<VerifyKind | null>(null);

  const show = useCallback(
    (s: VerifyState | null) => {
      setState(s);
      // My own badge on the Ben tab and my profile follows the server's answer.
      if (s) updateMe({ verified: s.verified });
    },
    [updateMe],
  );

  const load = useCallback(async () => {
    try {
      show(await loadVerify());
      setError(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoaded(true);
    }
  }, [show]);

  const back = useCallback(
    async (kind: VerifyKind) => {
      try {
        show(await refreshVerify(kind));
      } catch {
        // The next visit asks again; what was shown stays.
      }
    },
    [show],
  );

  useEffect(() => {
    if (!live) return;
    let alive = true;
    loadVerify()
      .then((s) => {
        if (!alive) return;
        show(s);
        setError(null);
        // Back through the provider's link (?verificationSessionId=…&status=…), or a check left open (the webhook may
        // be late): ask the provider now.
        for (const k of VERIFY_KINDS) if (params.status || s?.[k]?.status === 'pending') back(k);
      })
      .catch((e) => alive && setError(message(e)))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [live, show, back, params.status]);

  useEffect(() => {
    if (!live) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !opened.current) return;
      const k = opened.current;
      opened.current = null;
      back(k);
    });
    return () => sub.remove();
  }, [live, back]);

  const begin = async (kind: VerifyKind, version: string) => {
    setBusy(kind);
    try {
      const r = await startVerify(kind, version);
      if (r.consentChanged) {
        await load();
        setTicked(false);
        showAlert('Metin güncellendi', 'Aydınlatma metni değişti. Yeni metni okuyup onaylaman gerekiyor.');
        return;
      }
      setAsking(null);
      setTicked(false);
      if (!r.url) {
        await load();
        return;
      }
      opened.current = kind;
      await Linking.openURL(r.url);
    } catch (e) {
      showAlert('Doğrulama açılamadı', message(e));
    } finally {
      setBusy(null);
    }
  };

  const withdraw = (kind: VerifyKind) =>
    showAlert(
      'Rızanı geri al',
      kind === 'id'
        ? 'Kimlik doğrulaman ve sağlayıcıdaki kopyası silinir. Para çekmek için kimlik şartı varsa yeniden doğrulaman gerekir.'
        : 'Yüz doğrulaman ve sağlayıcıdaki kopyası silinir; mavi rozetin kalkar.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Geri al ve sil',
          style: 'destructive',
          onPress: () => {
            setBusy(kind);
            withdrawVerify(kind)
              .then((s) => {
                show(s);
                showAlert('Silindi', 'Doğrulama kaydın ve sağlayıcıdaki kopyası silindi.');
              })
              .catch((e) => showAlert('Silinemedi', message(e)))
              .finally(() => setBusy(null));
          },
        },
      ],
    );

  if (!live)
    return (
      <SafeAreaView style={styles.safe}>
        <Header title="Kimlik Doğrulamam" />
        <View style={{ padding: 16 }}>
          <Card style={{ gap: 8 }}>
            <Ionicons name="shield-checkmark-outline" size={26} color={colors.textDim} />
            <Text style={styles.dim}>Bu demo sürümünde doğrulama yok. Yayındaki uygulamada kimliğini ve profil fotoğrafını buradan doğrularsın.</Text>
          </Card>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <Header title="Kimlik Doğrulamam" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {!loaded && <ActivityIndicator color={colors.primaryText} style={{ marginTop: 30 }} />}
        {loaded && error && (
          <Card style={{ gap: 10 }}>
            <Text style={styles.dim}>{error}</Text>
            <Button small variant="tonal" title="Tekrar dene" icon="refresh" onPress={load} />
          </Card>
        )}
        {loaded && !error && !state && (
          <Card>
            <Text style={styles.dim}>Doğrulama bu sunucuda henüz açılmadı.</Text>
          </Card>
        )}
        {state &&
          VERIFY_KINDS.map((kind) => {
            const done = kind === 'id' ? state.idVerified : state.verified;
            const consent = state.consent[kind];
            const text = statusText(kind, state[kind], done);
            return (
              <Card key={kind} style={{ gap: 10 }}>
                <View style={styles.row}>
                  {kind === 'face' && done ? (
                    <VerifiedBadge size={22} />
                  ) : (
                    <Ionicons name={done ? 'checkmark-circle' : kind === 'id' ? 'card-outline' : 'happy-outline'} size={22} color={done ? colors.green : semantic.tonalText} />
                  )}
                  <Text style={styles.title}>{KIND_TEXT[kind].title}</Text>
                </View>
                <Text style={styles.dim}>{KIND_TEXT[kind].why}</Text>
                {kind === 'id' && state.payoutNeedsId && !done && <Text style={styles.note}>Para çekmek için bu doğrulama şart.</Text>}
                {!!text && <Text style={styles.body}>{text}</Text>}
                {!state.on[kind] && !done && <Text style={styles.dim}>Doğrulama şu an kapalı; açılınca buradan yapabilirsin.</Text>}

                {asking === kind && consent ? (
                  <View style={styles.consent}>
                    <Text style={styles.consentTitle}>{consent.title}</Text>
                    {consent.lines.map((l) => (
                      <View key={l} style={styles.bullet}>
                        <Text style={styles.dim}>•</Text>
                        <Text style={[styles.dim, { flex: 1 }]}>{l}</Text>
                      </View>
                    ))}
                    <Pressable
                      style={styles.tick}
                      onPress={() => setTicked((t) => !t)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: ticked }}
                      accessibilityLabel={consent.accept}
                    >
                      <Ionicons name={ticked ? 'checkbox' : 'square-outline'} size={22} color={ticked ? colors.green : colors.textDim} />
                      <Text style={[styles.body, { flex: 1 }]}>{consent.accept}</Text>
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Button small variant="ghost" title="Vazgeç" onPress={() => (setAsking(null), setTicked(false))} style={{ flex: 1 }} />
                      <Button small title={busy === kind ? 'Açılıyor…' : 'Devam et'} icon="camera" disabled={!ticked || busy !== null} onPress={() => begin(kind, consent.version)} style={{ flex: 2 }} />
                    </View>
                  </View>
                ) : (
                  canStart(kind, state) &&
                  !!consent && (
                    <Button
                      small
                      title={state[kind]?.status === 'pending' ? 'Doğrulamaya devam et' : 'Doğrula'}
                      icon="shield-checkmark"
                      disabled={busy !== null}
                      onPress={() => (setAsking(kind), setTicked(false))}
                    />
                  )
                )}
                {canWithdraw(kind, state) && asking !== kind && (
                  <Pressable onPress={() => withdraw(kind)} disabled={busy !== null} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                    <Text style={styles.link}>Rızamı geri al ve sil</Text>
                  </Pressable>
                )}
              </Card>
            );
          })}
        {state && <Text style={styles.small}>Doğrulamayı bizim adımıza Didit yapar. Fotoğrafların ve yüz verin bizde tutulmaz; ayrıntı Gizlilik Politikası’nda.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  note: { color: colors.primaryText, fontSize: 13, fontWeight: '600' },
  small: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
  link: { color: colors.textDim, fontSize: 13, textDecorationLine: 'underline' },
  consent: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  consentTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  bullet: { flexDirection: 'row', gap: 6 },
  tick: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
}));
