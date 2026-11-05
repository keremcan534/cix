// Yönetim › Yaptırımlar › Yaptırım uygula: a bottom sheet over the panel. Category, type and length (only what
// this staff member may give: meta.perms and meta.limits), or "Kademeye göre uygula" so the server picks the
// step from the person's history. Room mutes take a room id, a global text / voice mute may cover DMs / calls, a
// device ban takes the devices (all by default). The user-facing reason, an internal note and evidence go with
// it. Bans are asked once more; the server's refusal is shown in the sheet as it comes.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ChoiceChips, ListGroup, ListSwitch } from '@/components/list';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { fmtDate } from '@/lib/admin-format';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import * as admin from '@/lib/live/admin';
import {
  DEVICE_PLATFORM,
  RISK_LABEL,
  applyBody,
  applyError,
  applyResult,
  durationOptions,
  fmtLength,
  isBan,
  isRoomType,
  maxMinutesFor,
  fmtMinutes,
  needsConfirm,
  typeAllowed,
  type ApplyForm,
  type SanctionDevice,
  type SanctionMeta,
  type SanctionType,
} from '@/lib/sanction-format';
import { makeStyles, space } from '@/theme';

import { Notice, Overlay, StatusPill, useAdmin } from './parts';
import { CheckRow, DurationPicker, Field } from './sanction-parts';

export type ApplyTarget = { id: string; name: string; devices: SanctionDevice[]; reportId?: number; onDone: () => void };

export function ApplySheet({ target, meta }: { target: ApplyTarget; meta: SanctionMeta }) {
  const ctx = useAdmin();
  const s = useStyles();
  const types = meta.types.filter((t) => typeAllowed(t.type, meta.perms));
  const [f, setF] = useState<ApplyForm>({
    usePolicy: false,
    type: types[0]?.type ?? 'mute_global_text',
    reason: '',
    minutes: undefined,
    description: '',
    note: '',
    roomId: '',
    includeDm: false,
    includeCalls: false,
    deviceIds: target.devices.map((d) => d.id),
    evidence: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The duration picker keeps its own custom amount; a new type starts it fresh.
  const [pickerKey, setPickerKey] = useState(0);
  const set = (p: Partial<ApplyForm>) => {
    setF((x) => ({ ...x, ...p }));
    setError(null);
  };
  const close = () => ctx.present(null);

  const reason = meta.reasons.find((r) => r.code === f.reason);
  const steps = meta.policies.filter((p) => p.reason === f.reason).sort((a, b) => a.step - b.step);
  const options = durationOptions(f.type, meta);
  const typeLabel = meta.types.find((t) => t.type === f.type)?.label ?? f.type;
  const cap = maxMinutesFor(f.type, meta);
  const problem = applyError(f, meta);

  const send = () => {
    setBusy(true);
    setError(null);
    admin
      .applySanction(applyBody(target.id, f, target.reportId))
      .then((rows) => {
        ctx.toast(applyResult(rows));
        ctx.changed();
        target.onDone();
        close();
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setBusy(false));
  };

  const submit = () => {
    if (problem) {
      setError(problem);
      return;
    }
    if (!needsConfirm(f)) return send();
    const what = f.usePolicy
      ? `${target.name} için “${reason?.title}” kategorisinin sıradaki kademesi uygulanacak. Kademe ban ise oturumları kapanır; ağır kademeler onaya düşer.`
      : f.type === 'device_ban'
        ? `${f.deviceIds.length} cihaz ${fmtLength(f.type, f.minutes ?? null).toLocaleLowerCase('tr-TR')} engellenecek. Bu cihazlarda açık tüm oturumlar kapanır ve cihazdan hiçbir hesapla giriş yapılamaz.`
        : `${target.name} ${fmtLength(f.type, f.minutes ?? null).toLocaleLowerCase('tr-TR')} banlanacak. Tüm oturumları kapanır, açık odası kapanır ve sesli odalardan çıkarılır.`;
    showAlert(f.usePolicy ? 'Kademeye göre uygula' : typeLabel, what, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Uygula', style: 'destructive', onPress: send },
    ]);
  };

  if (!types.length)
    return (
      <Overlay onClose={close} label="Yaptırım uygula">
        <Text style={s.title}>Yaptırım uygula</Text>
        <Notice tone="neutral" icon="lock-closed-outline" text="Yaptırım uygulama yetkin yok. Yetki için platform yöneticisine başvur." />
        <Button title="Kapat" variant="ghost" onPress={close} />
      </Overlay>
    );

  return (
    <Overlay onClose={close} label={`${target.name} için yaptırım`}>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.md }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 2 }}>
          <Text style={s.title}>Yaptırım uygula</Text>
          <Text style={s.sub}>{target.name}</Text>
        </View>

        <View style={s.block}>
          <Text style={s.blockTitle}>İhlal kategorisi</Text>
          <ChoiceChips value={f.reason} options={meta.reasons.map((r): [string, string] => [r.code, r.title])} onChange={(reason) => set({ reason })} />
        </View>

        <ListGroup footer={f.usePolicy ? undefined : 'Açıksa sunucu, kişinin bu kategorideki geçmişine bakıp sıradaki kademeyi uygular.'}>
          <ListSwitch icon="git-branch-outline" title="Kademeye göre uygula" subtitle="Tür ve süreyi ceza kademesi belirler" value={f.usePolicy} onChange={(usePolicy) => set({ usePolicy })} />
        </ListGroup>

        {f.usePolicy ? (
          <View style={s.block}>
            <Text style={s.blockTitle}>Kademeler</Text>
            {!f.reason ? (
              <Text style={s.hint}>Önce kategoriyi seç.</Text>
            ) : !steps.length ? (
              <Notice tone="money" icon="alert-circle-outline" text="Bu kategori için ceza kademesi tanımlı değil. Türü ve süreyi elle seç." />
            ) : (
              <>
                {steps.map((p) => (
                  <View key={p.step} style={s.step}>
                    <Text style={s.stepNo}>{p.step}</Text>
                    <Text style={s.stepText}>
                      {meta.types.find((t) => t.type === p.type)?.label ?? p.type} · {fmtLength(p.type, p.minutes)}
                    </Text>
                    {p.requiresApproval && <StatusPill text="Onaylı" tone="money" />}
                  </View>
                ))}
                <Text style={s.hint}>Son {steps[0].windowDays} gündeki ihlaller sayılır. Oda susturması bu yoldan genel susturma olarak uygulanır.</Text>
              </>
            )}
          </View>
        ) : (
          <>
            <View style={s.block}>
              <Text style={s.blockTitle}>Yaptırım türü</Text>
              <ChoiceChips
                value={f.type}
                options={types.map((t): [SanctionType, string] => [t.type, t.label])}
                onChange={(type) => {
                  set({ type, minutes: undefined });
                  setPickerKey((k) => k + 1);
                }}
              />
              {f.type === 'mute_all' && <Text style={s.hint}>Oda yazısı, mikrofon, DM ve aramaların hepsini kapsar.</Text>}
              {f.type === 'account_ban' && <Text style={s.hint}>Hesap hiçbir cihazdan kullanılamaz; açık oturumlar hemen kapanır.</Text>}
            </View>

            {isRoomType(f.type) && (
              <Field
                label="Oda kimliği"
                value={f.roomId}
                onChange={(roomId) => set({ roomId })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                hint="Susturma yalnızca bu odada geçerli olur."
                max={36}
                mono
              />
            )}

            {(f.type === 'mute_global_text' || f.type === 'mute_global_voice') && (
              <ListGroup>
                {f.type === 'mute_global_text' ? (
                  <ListSwitch icon="chatbubbles-outline" title="DM’leri de kapsa" subtitle="Özel mesaj da gönderemez" value={f.includeDm} onChange={(includeDm) => set({ includeDm })} />
                ) : (
                  <ListSwitch icon="call-outline" title="Aramaları da kapsa" subtitle="Sesli görüşme de yapamaz" value={f.includeCalls} onChange={(includeCalls) => set({ includeCalls })} />
                )}
              </ListGroup>
            )}

            {f.type === 'device_ban' && (
              <View style={s.block}>
                <Text style={s.blockTitle}>Cihazlar</Text>
                {target.devices.length === 0 ? (
                  <Notice tone="money" icon="phone-portrait-outline" text="Bu kişinin kayıtlı cihazı yok. Cihaz banı yerine hesap banı uygula." />
                ) : (
                  target.devices.map((d) => {
                    const on = f.deviceIds.includes(d.id);
                    return (
                      <CheckRow
                        key={d.id}
                        on={on}
                        title={`${DEVICE_PLATFORM[d.platform] ?? d.platform}${d.model ? ` · ${d.model}` : ''}`}
                        sub={`#${d.id} · ${d.accounts} hesap · son ${fmtDate(d.lastSeenAt)}`}
                        right={d.banned ? <StatusPill text="Banlı" tone="danger" /> : <StatusPill text={RISK_LABEL[d.risk]?.[0] ?? d.risk} tone={RISK_LABEL[d.risk]?.[1] ?? 'neutral'} />}
                        onPress={() => set({ deviceIds: on ? f.deviceIds.filter((x) => x !== d.id) : [...f.deviceIds, d.id] })}
                      />
                    );
                  })
                )}
                {target.devices.some((d) => d.accounts > 1) && <Text style={s.hint}>Birden çok hesabın kullandığı cihaz engellenirse o hesaplar da bu cihazdan giremez.</Text>}
              </View>
            )}

            <View style={s.block}>
              <Text style={s.blockTitle}>Süre</Text>
              <DurationPicker key={`${f.type}-${pickerKey}`} type={f.type} options={options} value={f.minutes} onChange={(minutes) => set({ minutes })} meta={meta} />
              {isBan(f.type) && cap > 0 && cap < 5_256_000 && <Text style={s.hint}>Yetkinle en çok {fmtMinutes(cap)} verebilirsin.</Text>}
            </View>
          </>
        )}

        <Field
          label="Kullanıcıya gösterilecek gerekçe"
          value={f.description}
          onChange={(description) => set({ description })}
          placeholder={reason?.publicText ?? 'Örn. Odada tekrarlanan hakaret'}
          hint={reason ? 'Boş bırakırsan kategorinin metni gösterilir (iç not yazmak şartıyla).' : undefined}
          max={300}
          multiline
        />
        <Field label="İç not" value={f.note} onChange={(note) => set({ note })} placeholder="Yalnızca yetkililer görür" max={2000} multiline />
        <Field
          label="Kanıt (isteğe bağlı)"
          value={f.evidence}
          onChange={(evidence) => set({ evidence })}
          placeholder="Bağlantı veya kısa açıklama"
          hint="Her satır ayrı kanıt olarak kaydedilir; bağlantılar link olarak işaretlenir."
          max={4000}
          multiline
        />

        {!!error && <Notice tone="danger" icon="alert-circle-outline" text={error} />}

        <View style={s.buttons}>
          <Button title="Vazgeç" variant="ghost" onPress={close} style={{ flex: 1 }} />
          <Button
            title={busy ? 'Gönderiliyor…' : 'Uygula'}
            icon={isBan(f.type) && !f.usePolicy ? 'ban-outline' : 'shield-checkmark-outline'}
            variant={isBan(f.type) || f.usePolicy ? 'danger' : 'tonal'}
            onPress={submit}
            disabled={busy || !!problem}
            style={{ flex: 1 }}
          />
        </View>
        {!!problem && !error && <Text style={[s.hint, { textAlign: 'center' }]}>{problem}</Text>}
      </ScrollView>
    </Overlay>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 14 },
  block: { gap: space.sm },
  blockTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
  stepNo: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '800', color: colors.text, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  stepText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
}));
