// Yönetim › Yaptırımlar › Ceza kademeleri and Yetkiler. Kademeler: per violation category, the steps a repeat
// offence climbs (type, length, whether it starts by itself or waits for approval) and how many days back
// earlier violations count (POST /api/admin/sanction-policies, sanction.policy). Yetkiler: one staff member's
// sanction permissions; those that come with the role stay on, extra ones are granted or taken back
// (GET/POST /api/admin/sanction-permissions, sanction.permissions).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips, ListGroup, ListSwitch } from '@/components/list';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { permSource } from '@/lib/admin-format';
import { message } from '@/lib/live';
import * as admin from '@/lib/live/admin';
import { durationOptions, fmtLength, groupPolicies, heavyStep, isMute, normalizeStep, policyError, roleLabel, type PolicyGroup, type SanctionMeta, type SanctionType } from '@/lib/sanction-format';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { ItemCard, LoadState, Notice, Overlay, SectionScroll, StatusPill, useAdmin, useLoad } from './parts';
import { DurationPicker, Field, run } from './sanction-parts';
import { SearchBox, SearchResults, useUserSearch } from './sanction-search';

const typeLabel = (meta: SanctionMeta, t: SanctionType) => meta.types.find((x) => x.type === t)?.label ?? t;

// --- Policies ------------------------------------------------------------------------------------------------
export function PoliciesView({ meta, nav, onSaved }: { meta: SanctionMeta; nav: ReactNode; onSaved: () => void }) {
  const ctx = useAdmin();
  const s = useStyles();
  const groups = groupPolicies(meta.policies, meta.reasons);
  return (
    <SectionScroll load={{ refreshing: false, refresh: onSaved }}>
      {nav}
      <Notice text="Aynı kategoride tekrar eden ihlalde sıradaki kademe uygulanır. Ömür boyu ban ve cihaz banı kademeleri her zaman ikinci bir yetkilinin onayını bekler; otomatik başlama yalnızca susturmalarda olur." />
      {groups.map((g) => (
        <ItemCard
          key={g.reason.code}
          title={g.reason.title}
          sub={g.steps.length ? `${g.steps.length} kademe · son ${g.windowDays} gün sayılır` : 'Kademe tanımlı değil'}
          actions={<Button title="Düzenle" icon="create-outline" variant="tonal" small onPress={() => ctx.present(<PolicyEditor group={g} meta={meta} onSaved={onSaved} />)} />}
        >
          {g.steps.length > 0 && (
            <View style={{ gap: 6 }}>
              {g.steps.map((p) => (
                <View key={p.step} style={s.stepRow}>
                  <Text style={s.stepNo}>{p.step}</Text>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.stepTitle}>{typeLabel(meta, p.type)}</Text>
                    <Text style={s.hint}>{fmtLength(p.type, p.minutes)}</Text>
                  </View>
                  {p.requiresApproval ? <StatusPill text="Onaylı" tone="money" /> : p.auto ? <StatusPill text="Otomatik" tone="action" /> : <StatusPill text="Elle" />}
                </View>
              ))}
            </View>
          )}
        </ItemCard>
      ))}
    </SectionScroll>
  );
}

type Draft = { type: SanctionType; minutes: number | null | undefined; auto: boolean; requiresApproval: boolean; key: number };

function PolicyEditor({ group, meta, onSaved }: { group: PolicyGroup; meta: SanctionMeta; onSaved: () => void }) {
  const ctx = useAdmin();
  const { colors } = useTheme();
  const s = useStyles();
  const [steps, setSteps] = useState<Draft[]>(() => group.steps.map((p, i) => ({ type: p.type, minutes: p.minutes, auto: p.auto, requiresApproval: p.requiresApproval, key: i })));
  const [nextKey, setNextKey] = useState(group.steps.length);
  const [windowDays, setWindowDays] = useState(String(group.windowDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Every length is offered here: a step's permission is checked when it is applied, not when it is written.
  const all = { ...meta, perms: Object.keys(meta.allPerms) };
  const close = () => ctx.present(null);
  const edit = (k: number, p: Partial<Draft>) => {
    setSteps((xs) => xs.map((x) => (x.key === k ? { ...x, ...p } : x)));
    setError(null);
  };
  const unset = steps.findIndex((x) => x.minutes === undefined);
  const problem =
    unset >= 0
      ? `Kademe ${unset + 1}: süreyi seç`
      : policyError(
          steps.map((x) => normalizeStep({ ...x, minutes: x.minutes ?? null })),
          windowDays,
        );

  const save = () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const body = steps.map((x) => {
      const n = normalizeStep({ ...x, minutes: x.minutes ?? null });
      return { type: n.type, minutes: n.minutes, auto: n.auto, requiresApproval: n.requiresApproval };
    });
    admin
      .savePolicy(group.reason.code, body, Number(windowDays) || 90)
      .then(() => {
        ctx.toast(`“${group.reason.title}” kademeleri kaydedildi`);
        onSaved();
        close();
      })
      .catch((e: unknown) => setError(message(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Overlay onClose={close} label={`${group.reason.title} kademeleri`}>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.md }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 2 }}>
          <Text style={s.sheetTitle}>{group.reason.title}</Text>
          <Text style={s.hint}>Ceza kademeleri · ilk ihlalde 1. kademe, sonra sırayla; son kademe tekrar eder.</Text>
        </View>
        <Field
          label="Değerlendirme süresi (gün)"
          value={windowDays}
          onChange={(v) => {
            setWindowDays(v.replace(/[^\d]/g, ''));
            setError(null);
          }}
          keyboard="numeric"
          max={4}
          hint="Bu kadar gün içindeki önceki ihlaller sayılır (itirazla kaldırılanlar sayılmaz)."
        />
        {steps.map((x, i) => {
          const heavy = x.minutes !== undefined && heavyStep(x.type, x.minutes);
          return (
            <View key={x.key} style={s.stepCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Text style={s.stepNo}>{i + 1}</Text>
                <Text style={[s.stepTitle, { flex: 1 }]}>{i + 1}. kademe</Text>
                <Pressable onPress={() => setSteps((xs) => xs.filter((y) => y.key !== x.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${i + 1}. kademeyi sil`} style={s.iconBtn}>
                  <Ionicons name="trash-outline" size={17} color={colors.textDim} />
                </Pressable>
              </View>
              <ChoiceChips
                value={x.type}
                options={meta.types.map((t): [SanctionType, string] => [t.type, t.label])}
                onChange={(type) => edit(x.key, { type, minutes: undefined, auto: isMute(type) && x.auto })}
              />
              <DurationPicker key={x.type} type={x.type} options={durationOptions(x.type, all)} value={x.minutes} onChange={(minutes) => edit(x.key, { minutes })} />
              <ListGroup>
                <ListSwitch
                  icon="flash-outline"
                  title="Kendiliğinden başlasın"
                  subtitle={isMute(x.type) ? 'Otomatik sistem (şikâyet sayısı) de uygulayabilir' : 'Yalnızca susturmalar kendiliğinden başlar'}
                  value={x.auto && isMute(x.type) && !x.requiresApproval && !heavy}
                  disabled={!isMute(x.type) || x.requiresApproval || heavy}
                  onChange={(auto) => edit(x.key, { auto })}
                />
                <ListSwitch
                  icon="people-outline"
                  title="Onay gereksin"
                  subtitle={heavy ? 'Ömür boyu ban ve cihaz banı her zaman onay bekler' : 'İkinci bir yetkili onaylayınca başlar'}
                  value={x.requiresApproval || heavy}
                  disabled={heavy}
                  onChange={(requiresApproval) => edit(x.key, { requiresApproval, auto: requiresApproval ? false : x.auto })}
                />
              </ListGroup>
            </View>
          );
        })}
        {steps.length === 0 && <Notice tone="neutral" text="Kademe yok: bu kategoride “Kademeye göre uygula” kullanılamaz, yaptırım elle seçilir." />}
        {steps.length < 10 && (
          <Button
            title="Kademe ekle"
            icon="add-circle-outline"
            variant="ghost"
            onPress={() => {
              const last = steps.at(-1);
              setSteps((xs) => [...xs, { type: last?.type ?? 'mute_global_text', minutes: undefined, auto: false, requiresApproval: false, key: nextKey }]);
              setNextKey((k) => k + 1);
            }}
          />
        )}
        {!!error && <Notice tone="danger" icon="alert-circle-outline" text={error} />}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Vazgeç" variant="ghost" onPress={close} style={{ flex: 1 }} />
          <Button title={busy ? 'Kaydediliyor…' : 'Kaydet'} variant="tonal" onPress={save} disabled={busy || !!problem} style={{ flex: 1 }} />
        </View>
        {!!problem && !error && <Text style={[s.hint, { textAlign: 'center' }]}>{problem}</Text>}
      </ScrollView>
    </Overlay>
  );
}

// --- Permissions ---------------------------------------------------------------------------------------------
export function PermissionsView({ meta, nav }: { meta: SanctionMeta; nav: ReactNode }) {
  const search = useUserSearch();
  const [user, setUser] = useState<admin.SanctionSearchUser | null>(null);
  if (user) return <UserPerms user={user} meta={meta} nav={nav} onBack={() => setUser(null)} />;
  return (
    <SectionScroll load={search.load}>
      {nav}
      <SearchBox search={search} title="Yetkisini düzenleyeceğin kişi" hint="Yetkiler kişiye özeldir. Rolden gelen yetkiler kapatılamaz; ek yetki verilip geri alınabilir." />
      <SearchResults search={search} onPick={setUser} />
    </SectionScroll>
  );
}

function UserPerms({ user, meta, nav, onBack }: { user: admin.SanctionSearchUser; meta: SanctionMeta; nav: ReactNode; onBack: () => void }) {
  const ctx = useAdmin();
  const s = useStyles();
  const load = useLoad(() => admin.sanctionPerms(user.id), [user.id]);
  const [busy, setBusy] = useState(false);
  return (
    <SectionScroll load={load}>
      {nav}
      <View style={s.who}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.stepTitle}>{user.name}</Text>
          <Text style={s.hint}>{roleLabel(load.data?.role ?? user.role)}</Text>
        </View>
        <Button title="Başka kişi" icon="swap-horizontal-outline" variant="ghost" small onPress={onBack} />
      </View>
      <LoadState load={load}>
        {(d) => (
          <>
            {d.role !== 'admin' && d.role !== 'moderator' && (
              <Notice tone="money" icon="alert-circle-outline" text="Bu kişi yetkili rolünde değil. Verdiğin yaptırım yetkileri yine de geçerli olur; yalnızca güvendiğin kişilere ver." />
            )}
            {d.role === 'admin' && <Notice tone="neutral" text="Yönetici rolü tüm yaptırım yetkilerine sahiptir." />}
            <ListGroup label="Yaptırım yetkileri" footer="Değişiklik hemen geçerli olur ve işlem kaydına yazılır.">
              {Object.entries(meta.allPerms).map(([p, desc]) => {
                const on = d.permissions.includes(p);
                const fromRole = on && !d.granted.includes(p);
                return (
                  <ListSwitch
                    key={p}
                    icon={fromRole ? 'lock-closed-outline' : on ? 'checkmark-circle-outline' : 'ellipse-outline'}
                    tone={on ? 'success' : 'neutral'}
                    title={desc}
                    subtitle={permSource(on, fromRole)}
                    value={on}
                    disabled={fromRole || busy}
                    onChange={(grant) =>
                      run(
                        ctx,
                        () => admin.setSanctionPerm(user.id, p, grant),
                        () => (grant ? `${user.name}: yetki verildi` : `${user.name}: yetki alındı`),
                        load.reload,
                        setBusy,
                      )
                    }
                  />
                );
              })}
            </ListGroup>
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

const useStyles = makeStyles(({ colors, surface, lift }) => ({
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  stepNo: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '800', color: colors.text, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  stepTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  stepCard: { gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: surface.rim },
  iconBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: surface.pressed },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: surface.rim,
    ...lift,
  },
}));
