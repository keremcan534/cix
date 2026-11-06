// Canlı ayarlar: the one sheet every change goes through. It asks the server for a dryRun preview (before →
// after and the Turkish impact sentences), takes a reason (a chip or 3–300 characters of free text), saves with
// 'Uygula', and for a big change shows a second step, 'Emin misin? Bu para akışını değiştirir', with the numbers.
// A 409 stale reloads the screen behind and the sheet says so ('Ayarlar bu arada değişti', where the person is
// looking, not only in the banner at the top); a 409 confirm_needed opens the second step. Every save
// sends the version it was based on and this app's version.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { ApiError, rollbackLive, setLiveSettings, type LiveKey, type LivePreviewLine, type LiveSaved, type LiveValue } from '@/lib/api';
import { message } from '@/lib/live';
import { impactText, REASON_MAX, reasonChips, reasonError, valueText, type Names, type ReasonChip } from '@/lib/live-settings-format';
import { APP_VERSION } from '@/lib/reporting';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { Notice, Overlay, useAdmin } from './parts';

export type LiveChanges = Partial<Record<LiveKey, LiveValue>>;
/** A save (its values built at each request, so a campaign 'Şimdi' starts when it is saved) or a rollback. */
export type LiveJob = { kind: 'save'; title: string; build: () => LiveChanges } | { kind: 'rollback'; title: string; batch: string };

// The server's preview lines carry these too (live-settings.mjs); the app's api types leave them out.
type Line = LivePreviewLine & { reset?: boolean; changedSince?: boolean };
type Preview = { lines: Line[]; needsConfirm: boolean };

/** dryRun needs a reason as well; nothing is saved with it. */
const PREVIEW_REASON = 'Önizleme';

export function LiveChangeSheet({
  job,
  baseV,
  names,
  suggest,
  onSaved,
  onStale,
}: {
  job: LiveJob;
  baseV: number;
  names: Names;
  /** The reason chip shown first (e.g. 'Kampanya' for a campaign). It is not picked: the admin chooses the reason. */
  suggest?: ReasonChip;
  onSaved: (r: LiveSaved) => void;
  onStale: () => void;
}) {
  const ctx = useAdmin();
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Empty until the admin taps a chip or writes one, so Uygula never records a reason nobody chose.
  const [reason, setReason] = useState<string>('');
  const [step, setStep] = useState<'edit' | 'confirm' | 'stale'>('edit');
  const [busy, setBusy] = useState(false);
  const jobRef = useRef(job);
  const close = () => ctx.present(null);

  const send = (dryRun: boolean, confirm: boolean, why: string) => {
    const j = jobRef.current;
    const base = { reason: why, baseV, appVersion: APP_VERSION, ...(confirm ? { confirm: true } : {}) };
    if (j.kind === 'rollback') return dryRun ? rollbackLive({ ...base, batch: j.batch, dryRun: true }) : rollbackLive({ ...base, batch: j.batch });
    return dryRun ? setLiveSettings({ ...base, changes: j.build(), dryRun: true }) : setLiveSettings({ ...base, changes: j.build() });
  };

  /** True when the refusal was handled here (stale, confirm needed). */
  const handled = (e: unknown) => {
    if (!(e instanceof ApiError) || e.status !== 409) return false;
    if (e.data.code === 'stale') {
      setStep('stale');
      onStale();
      return true;
    }
    if (e.data.code === 'confirm_needed' && Array.isArray(e.data.preview)) {
      setPreview({ lines: e.data.preview, needsConfirm: true });
      setStep('confirm');
      return true;
    }
    return false;
  };

  useEffect(() => {
    let live = true;
    (send(true, false, PREVIEW_REASON) as Promise<{ preview: Line[]; needsConfirm: boolean }>)
      .then((r) => live && setPreview({ lines: r.preview, needsConfirm: r.needsConfirm }))
      .catch((e: unknown) => live && !handled(e) && setProblem(message(e)));
    return () => {
      live = false;
    };
    // Once, when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reasonProblem = reasonError(reason);
  // The server's rule decides (live-registry big()); going back to the default is never big.
  const big = !!preview && (preview.needsConfirm || preview.lines.some((l) => l.big));

  const save = (confirm: boolean) => {
    if (reasonProblem || !preview) return;
    setBusy(true);
    setProblem(null);
    (send(false, confirm, reason.trim()) as Promise<LiveSaved>)
      .then((r) => {
        ctx.toast(`${job.kind === 'rollback' ? 'Geri alındı' : 'Uygulandı'}: ${r.preview.map((l) => l.label).join(', ')}`);
        close();
        onSaved(r);
      })
      .catch((e: unknown) => {
        if (!handled(e)) setProblem(message(e));
      })
      .finally(() => setBusy(false));
  };
  const apply = () => (big ? setStep('confirm') : save(false));

  const lineView = (l: Line, strong: boolean) => (
    <View key={l.key} style={[s.line, strong && l.big && s.lineBig]}>
      <View style={s.lineHead}>
        <Text style={s.lineLabel}>{l.label}</Text>
        {l.big && <Ionicons name="alert-circle" size={16} color={semantic.danger} accessibilityLabel="İkinci onay gerekir" />}
      </View>
      <Text style={s.before}>{valueText(l.key, l.before, { names })}</Text>
      <View style={s.arrowRow}>
        <Ionicons name="arrow-down" size={14} color={colors.textDim} />
        <Text style={s.after}>{l.reset ? `${valueText(l.key, l.after, { names })} (varsayılan)` : valueText(l.key, l.after, { names })}</Text>
      </View>
      <Text style={s.impact}>{impactText(l.impact)}</Text>
    </View>
  );

  return (
    <Overlay onClose={busy ? () => {} : close} label={job.title}>
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: space.md + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {step === 'stale' ? (
          <>
            <View style={s.confirmHead}>
              <Ionicons name="refresh-outline" size={22} color={semantic.moneyText} />
              <Text style={s.title}>Ayarlar bu arada değişti</Text>
            </View>
            <Text style={s.text}>Sen bakarken başka bir kayıt yapıldı; bu değişiklik kaydedilmedi. Güncel hâli yüklendi; değişikliğini güncel değerlere göre yeniden yap.</Text>
            <View style={s.buttons}>
              <Button title="Tamam" variant="tonal" onPress={close} style={{ flex: 1 }} />
            </View>
          </>
        ) : step === 'confirm' && preview ? (
          <>
            <View style={s.confirmHead}>
              <Ionicons name="warning" size={22} color={semantic.danger} />
              <Text style={s.title}>Emin misin? Bu para akışını değiştirir</Text>
            </View>
            <Text style={s.text}>Aşağıdaki değişiklik büyük. Rakamları bir kez daha oku; kaydedince her yöneticiye bildirim gider ve “Geçmiş”ten geri alabilirsin.</Text>
            {preview.lines.filter((l) => l.big).map((l) => lineView(l, true))}
            {preview.lines.some((l) => !l.big) && <Text style={s.text}>{`Aynı kayıtta: ${preview.lines.filter((l) => !l.big).map((l) => l.label).join(', ')}.`}</Text>}
            <Text style={s.reasonEcho}>{`Neden: ${reason.trim()}`}</Text>
            {!!problem && <Notice tone="danger" icon="alert-circle-outline" text={problem} />}
            <View style={s.buttons}>
              <Button title="Geri" variant="ghost" onPress={() => setStep('edit')} disabled={busy} style={{ flex: 1 }} />
              <Button title={busy ? 'Uygulanıyor…' : 'Evet, uygula'} variant="danger" onPress={() => save(true)} disabled={busy || !!reasonProblem} style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <>
            <Text style={s.title}>{job.title}</Text>
            {!preview && !problem && (
              <View style={s.loading}>
                <ActivityIndicator color={colors.primaryText} />
                <Text style={s.text}>Önizleme hazırlanıyor…</Text>
              </View>
            )}
            {preview?.lines.map((l) => lineView(l, false))}
            {!!problem && <Notice tone="danger" icon="alert-circle-outline" text={problem} />}
            {!!preview && (
              <>
                <Text style={s.label}>Neden</Text>
                <View style={s.chips}>
                  {reasonChips(suggest).map((c) => {
                    const on = reason.trim() === c;
                    return (
                      <Pressable key={c} onPress={() => setReason(c)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[s.chip, on && s.chipOn]}>
                        <Text style={[s.chipText, on && s.chipTextOn]}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Ya da kısaca yaz (en az 3 karakter)"
                  placeholderTextColor={colors.textDim}
                  style={s.input}
                  maxLength={REASON_MAX}
                  multiline
                  accessibilityLabel="Neden"
                />
                <Text style={s.hint}>{`Kullanıcıların kişisel bilgilerini (isim, telefon, IBAN) yazma. ${reason.trim().length}/${REASON_MAX}`}</Text>
                {big && <Notice tone="danger" icon="alert-circle-outline" text="Bu değişiklik büyük: Uygula'dan sonra bir kez daha onay istenir." />}
              </>
            )}
            <View style={s.buttons}>
              <Button title="Vazgeç" variant="ghost" onPress={close} disabled={busy} style={{ flex: 1 }} />
              <Button title={busy ? 'Uygulanıyor…' : 'Uygula'} variant="tonal" onPress={apply} disabled={busy || !preview || !!reasonProblem} style={{ flex: 1 }} />
            </View>
            {!!preview && !!reasonProblem && <Text style={[s.hint, { textAlign: 'center' }]}>{reason.length > 0 ? reasonProblem : 'Uygulamak için bir neden seç ya da yaz.'}</Text>}
          </>
        )}
      </ScrollView>
    </Overlay>
  );
}

const useStyles = makeStyles(({ colors, semantic, surface, dark }) => ({
  body: { gap: space.md },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  text: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  line: { gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: surface.rim },
  lineBig: { borderColor: `${semantic.danger}88`, backgroundColor: `${semantic.danger}12` },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineLabel: { color: colors.text, fontSize: 14, fontWeight: '800', flex: 1 },
  before: { color: colors.textDim, fontSize: 14, lineHeight: 19, textDecorationLine: 'line-through' },
  arrowRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  after: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20, flex: 1, fontVariant: ['tabular-nums'] },
  impact: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 2 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: dark ? 'rgba(19,217,223,0.16)' : 'rgba(0,140,148,0.10)', borderColor: dark ? 'rgba(19,217,223,0.55)' : 'rgba(0,117,123,0.45)' },
  chipText: { color: colors.textDim, fontWeight: '600', fontSize: 14 },
  chipTextOn: { color: colors.text },
  input: {
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  reasonEcho: { color: colors.text, fontSize: 13, lineHeight: 19, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
}));
