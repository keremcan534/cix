// The agency entry when the app talks to our server (ajans/index.tsx shows it when apiEnabled()): the agencies I
// run or work for, the centre's entry for platform staff, my membership as a streamer (move with a reason; leave
// only where the centre allows it), invites and my join requests, joining by code (at once), and applying to found
// an agency. The streamer rules (server agency-ops.mjs): only women's accounts stream; after the first days a
// streamer with no agency stays with the centre and joins only by a transfer the centre approves. Every decision
// is the server's (server/api/agency.mjs); without a server connection the labelled example data is shown.
// An agency owner lands on their own agency's panel (ajans/ofis); everything else here is its "Diğer" tab.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NetState, Panel, Pill, Section, Tabs, ns, statusTone, useAsk } from '@/components/agency-net';
import { SCENES } from '@/components/fx/scenes';
import { Backdrop, DepthCard } from '@/components/fx/surface';
import { ListGroup, ListRow } from '@/components/list';
import { Text, TextInput } from '@/components/text';
import { Button, Header } from '@/components/ui';
import { demoMe } from '@/data/agency-net-demo';
import { LEVEL_TEXT, PARTY_TEXT, STATUS_TEXT, TRANSFER_STATUS, TRANSFER_TEXT, VIEWER_TEXT, agencyNet, errorText, fmtDate, runAction, unavailable, useNet, type Me, type Transfer } from '@/lib/agency-net';
import { showAlert } from '@/lib/alert';
import { updateProfile } from '@/lib/api';
import { CONTACT_TITLE, contactRefusal } from '@/lib/contact-filter';
import { useApp } from '@/store';
import { colors, fonts, semantic, space } from '@/theme';

const METHOD_TEXT: Record<string, string> = { code: 'Davet kodu', link: 'Davet bağlantısı', invite: 'Davet', application: 'Başvuru', admin: 'Merkez ataması' };
/** The agency's group chat (app/ajans/sohbet): its streamers, its owner and its staff. */
export const openChat = (id: string) => router.push({ pathname: '/ajans/sohbet', params: { id } } as unknown as Href);
export const openOffice = (id: string) => router.push({ pathname: '/ajans/ofis', params: { id } } as unknown as Href);

export function NetworkHub() {
  const { me } = useApp();
  const q = useNet<Me>(me.name, agencyNet.me, demoMe);
  const ask = useAsk();
  // The agency I own opens first: its panel, with this screen's other sections as a tab there.
  const ownId = q.data?.agencies.find((a) => a.viewer === 'owner')?.id;
  useEffect(() => {
    if (ownId) router.replace({ pathname: '/ajans/ofis', params: { id: ownId, hub: '1' } } as unknown as Href);
  }, [ownId]);
  if (ownId) return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop scene={SCENES.family} />
      <Header title="Ajans" right={<Pressable onPress={q.reload} hitSlop={10} accessibilityLabel="Yenile"><Ionicons name="refresh" size={22} color="#fff" /></Pressable>} />
      <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
        <NetState q={q}>{(d) => <HubBody d={d} demo={q.demo} reload={q.reload} askFor={ask[1]} />}</NetState>
      </ScrollView>
      {ask[0]}
    </SafeAreaView>
  );
}

/** This screen's sections (Ajans Merkezi, my agencies, membership, invites, joining) as the owner's "Diğer" tab. */
export function HubSections() {
  const { me } = useApp();
  const q = useNet<Me>(me.name, agencyNet.me, demoMe);
  const ask = useAsk();
  return (
    <>
      <NetState q={q}>{(d) => <HubBody d={d} demo={q.demo} reload={q.reload} askFor={ask[1]} />}</NetState>
      {ask[0]}
    </>
  );
}

function HubBody({ d, demo, reload, askFor }: { d: Me; demo: boolean; reload: () => void; askFor: ReturnType<typeof useAsk>[1] }) {
  const invites = d.requests.filter((r) => r.kind === 'invite');
  const mine = d.requests.filter((r) => r.kind === 'join');
  return (
    <View style={{ gap: space.xl }}>
      {d.platform.length > 0 && (
        <Pressable onPress={() => router.push('/ajans/merkez' as Href)} accessibilityRole="button">
          <DepthCard style={st.center} tint={['#123B4A', '#0E2236']}>
            <View style={st.centerIcon}>
              <Ionicons name="git-network-outline" size={22} color={semantic.action} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ns.title}>Ajans Merkezi</Text>
              <Text style={ns.dim}>Organizasyon ağacı, onaylar, performans, kurallar ve denetim</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
          </DepthCard>
        </Pressable>
      )}

      {d.agencies.length > 0 && (
        <Section title="Ajanslarım">
          {d.agencies.map((a) => (
            <Pressable key={a.id} onPress={() => openOffice(a.id)} accessibilityRole="button" accessibilityLabel={`${a.name} panelini aç`}>
              <DepthCard style={st.agency}>
                <View style={st.monogram}>
                  <Text style={st.monoText}>{a.name.slice(0, 1).toLocaleUpperCase('tr-TR')}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={ns.title} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <View style={st.pills}>
                    <Pill text={LEVEL_TEXT(a.level)} tone="action" />
                    <Pill text={STATUS_TEXT[a.status]} tone={statusTone(a.status)} />
                    {!!a.tierName && a.level > 1 && <Pill text={a.tierName} tone="money" />}
                  </View>
                  <Text style={ns.dim}>
                    Kod {a.code}
                    {a.viewer ? ` · ${VIEWER_TEXT[a.viewer]}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
              </DepthCard>
            </Pressable>
          ))}
          {/* The agency's own group chat (server/api/agency-chat.mjs): its owner and staff are in it, with its streamers. */}
          {d.agencies
            .filter((a) => a.status === 'approved' && (a.viewer === 'owner' || a.viewer === 'staff'))
            .map((a) => (
              <Button key={`chat-${a.id}`} title={d.agencies.length > 1 ? `${a.name} · Sohbet grubu` : 'Ajans sohbet grubu'} icon="chatbubbles" variant="tonal" onPress={() => openChat(a.id)} />
            ))}
        </Section>
      )}

      {d.membership ? <Membership d={d} demo={demo} reload={reload} askFor={askFor} /> : null}

      {invites.length > 0 && (
        <ListGroup label="Davetler">
          {invites.map((r) => (
            <ListRow
              key={r.id}
              icon="mail-unread-outline"
              tone="social"
              title={`${r.agency.name} seni davet ediyor`}
              subtitle={[r.note, `Kod ${r.agency.code} · ${fmtDate(r.createdAt)}`].filter(Boolean).join('\n')}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Button title="Reddet" variant="ghost" small onPress={() => runAction(demo, () => agencyNet.respond(r.id, false), 'Davet reddedildi.', reload)} />
                  <Button title="Kabul" variant="tonal" small onPress={() => runAction(demo, () => agencyNet.respond(r.id, true), `${r.agency.name} ajansına katıldın.`, reload)} />
                </View>
              }
            />
          ))}
        </ListGroup>
      )}

      {mine.length > 0 && (
        <ListGroup label="Katılma isteklerim" footer="Ajans onaylayınca bildirim gelir. Bir yayıncı aynı anda tek ajansa bağlı olabilir.">
          {mine.map((r) => (
            <ListRow
              key={r.id}
              icon="hourglass-outline"
              tone="money"
              title={r.agency.name}
              subtitle={`${METHOD_TEXT[r.method] ?? r.method} · ${fmtDate(r.createdAt)} · Onay bekliyor`}
              right={<Button title="Geri çek" variant="ghost" small onPress={() => runAction(demo, () => agencyNet.cancelRequest(r.id), 'İstek geri çekildi.', reload)} />}
            />
          ))}
        </ListGroup>
      )}

      {!d.membership && <JoinOrApply d={d} demo={demo} reload={reload} askFor={askFor} />}
    </View>
  );
}

function Membership({ d, demo, reload, askFor }: { d: Me; demo: boolean; reload: () => void; askFor: ReturnType<typeof useAsk>[1] }) {
  const m = d.membership!;
  const move = async () => {
    const r = await askFor({ title: 'Başka ajansa geç', message: 'Yeni ajansın kodunu yaz. Mevcut ajansın, yeni ajans ve gerekirse merkez onaylar; ücret kuralı sunucuda belirlenir. Geçmiş kazançların değişmez.', field: { label: 'Yeni ajans kodu', placeholder: 'Örn. MVD4K2' }, confirm: 'Talep gönder', place: 'agency.transfer' });
    if (r) await runAction(demo, () => agencyNet.transfer(r.field.toUpperCase(), r.reason), 'Transfer talebin gönderildi.', reload);
  };
  // Older servers send no rules: leaving stays offered there.
  const canLeave = d.streamer?.canLeave ?? true;
  const leave = async () => {
    const r = await askFor({ title: 'Ajanstan ayrıl', message: 'Ayrılma talebin ajansına ve gerekirse merkeze iletilir. Bu sürede kazandığın komisyon kayıtları silinmez.', confirm: 'Ayrılma talebi', danger: true, place: 'agency.transfer' });
    if (r) await runAction(demo, () => agencyNet.transfer(null, r.reason), 'Ayrılma talebin gönderildi.', reload);
  };
  return (
    <Section title="Üyeliğim">
      <Panel>
        <View style={ns.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={ns.title}>{m.agency.name}</Text>
            <Text style={ns.dim}>
              {LEVEL_TEXT(m.agency.level)}
              {m.agency.parentName ? ` · Üst ajans: ${m.agency.parentName}` : ''}
            </Text>
          </View>
          <Pill text="Üye" tone="success" icon="checkmark-circle" />
        </View>
        <Text style={ns.dim}>
          {fmtDate(m.joinedAt)} tarihinden beri · {METHOD_TEXT[m.method] ?? m.method}
        </Text>
        <Text style={st.note}>Ajans komisyonu senin elmasından kesilmez; platform tarafından ayrıca ödenir.</Text>
        <Button title="Ajans sohbet grubu" icon="chatbubbles" variant="tonal" onPress={() => openChat(m.agency.id)} />
        {d.transfer ? (
          <TransferCard t={d.transfer} />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Ajans değiştir" variant="tonal" small icon="swap-horizontal" onPress={move} style={{ flex: 1 }} />
            {canLeave && <Button title="Ayrıl" variant="danger" small icon="exit-outline" onPress={leave} style={{ flex: 1 }} />}
          </View>
        )}
        {!canLeave && !d.transfer && <Text style={st.note}>Ajanstan ayrılmak için başka bir ajansa transfer talebi oluşturman gerekir.</Text>}
      </Panel>
    </Section>
  );
}

export function TransferCard({ t }: { t: Transfer }) {
  return (
    <View style={st.transfer}>
      <View style={ns.rowBetween}>
        <Text style={[ns.title, { fontSize: 15 }]}>{TRANSFER_TEXT[t.kind]}</Text>
        <Pill text={TRANSFER_STATUS[t.status]} tone={statusTone(t.status)} />
      </View>
      {!!(t.streamer?.name ?? t.agency?.name) && <Text style={[ns.title, { fontSize: 14 }]}>{t.streamer?.name ?? t.agency?.name}</Text>}
      <Text style={ns.dim}>
        {t.from?.name ?? (t.kind === 'streamer_move' ? 'Merkez hesabı' : '—')}
        {t.to ? ` → ${t.to.name ?? '—'}` : t.kind === 'independence' ? ' → bağımsız üst ajans' : t.kind === 'streamer_leave' ? ' → ajanssız' : ''}
      </Text>
      <View style={st.pills}>
        {t.needs.map((p) => (
          <Pill key={p} text={`${PARTY_TEXT[p] ?? p}${t.approvals[p] ? ' onayladı' : ' bekleniyor'}`} tone={t.approvals[p] ? 'success' : 'money'} icon={t.approvals[p] ? 'checkmark' : 'time-outline'} />
        ))}
      </View>
      {t.fee > 0 && <Text style={ns.dim}>Transfer ücreti: {t.fee.toLocaleString('tr-TR')} elmas</Text>}
      {!!t.feeRule && <Text style={st.note}>{t.feeRule.rule}</Text>}
      {!!t.reason && <Text style={ns.dim}>Gerekçe: {t.reason}</Text>}
    </View>
  );
}

function JoinOrApply({ d, demo, reload, askFor }: { d: Me; demo: boolean; reload: () => void; askFor: ReturnType<typeof useAsk>[1] }) {
  const [mode, setMode] = useState<'join' | 'apply'>(d.agencies.length > 0 ? 'apply' : 'join');
  return (
    <View style={{ gap: space.md }}>
      <Tabs
        value={mode}
        onChange={setMode}
        options={[
          { key: 'join', label: 'Ajansa katıl' },
          { key: 'apply', label: 'Ajans kur' },
        ]}
      />
      {mode === 'apply' ? <Apply demo={demo} reload={reload} /> : <StreamerJoin d={d} demo={demo} reload={reload} askFor={askFor} />}
    </View>
  );
}

/** What the join tab offers by the streamer rules: pick a gender, the women-only note, a transfer from the centre, or the code. */
function StreamerJoin({ d, demo, reload, askFor }: { d: Me; demo: boolean; reload: () => void; askFor: ReturnType<typeof useAsk>[1] }) {
  const s = d.streamer;
  if (s && !s.eligible && !s.gender) return <PickGender demo={demo} reload={reload} />;
  if (s && !s.eligible)
    return (
      <Panel>
        <Text style={ns.title}>Ajanslar kadın yayıncılar için</Text>
        <Text style={ns.dim}>Ajanslarda yalnız kadın hesaplar yayıncı olabilir. Erkek hesaplar katkısını Aile üyesi olarak verir.</Text>
        <Button title="Aileye git" variant="tonal" icon="people-outline" onPress={() => router.push('/aile' as Href)} />
      </Panel>
    );
  if (s?.held) {
    if (d.transfer) return <TransferCard t={d.transfer} />;
    const request = async () => {
      const r = await askFor({
        title: 'Ajansa geçiş talebi',
        message: 'Geçmek istediğin ajansın kodunu yaz. Önce ajans, sonra merkez onaylar; onaylanınca üyeliğin başlar.',
        field: { label: 'Ajans kodu', placeholder: 'Örn. MVD4K2' },
        confirm: 'Talep gönder',
        place: 'agency.transfer',
      });
      if (r) await runAction(demo, () => agencyNet.transfer(r.field.toUpperCase(), r.reason), 'Transfer talebin gönderildi.', reload);
    };
    return (
      <Panel>
        <View style={ns.rowBetween}>
          <Text style={[ns.title, { flex: 1 }]}>Merkez hesabındasın</Text>
          <Pill text="Transferle geçiş" tone="money" icon="swap-horizontal" />
        </View>
        <Text style={ns.dim}>
          Kayıttan sonraki {s.pickDays} gün içinde bir ajansa katılmadığın için merkez hesabına bağlısın. Bir ajansa ancak transfer talebiyle geçebilirsin; talebi ajans ve merkez onaylar.
        </Text>
        <Button title="Transfer talebi oluştur" icon="swap-horizontal" onPress={request} />
      </Panel>
    );
  }
  return <Join demo={demo} reload={reload} pickUntil={s?.pickUntil ?? null} />;
}

/** The gender is chosen once (the server refuses a change); only women's accounts can join an agency. */
function PickGender({ demo, reload }: { demo: boolean; reload: () => void }) {
  const pick = (g: 'Kadın' | 'Erkek') =>
    showAlert('Cinsiyetin: ' + g, 'Cinsiyet bir kez seçilir ve sonradan değiştirilemez. Emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Onayla', onPress: () => void runAction(demo, () => updateProfile({ gender: g }), undefined, reload) },
    ]);
  return (
    <Panel>
      <Text style={ns.title}>Önce cinsiyetini seç</Text>
      <Text style={ns.dim}>Ajanslarda yalnız kadın hesaplar yayıncı olabilir. Cinsiyet bir kez seçilir.</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Kadın" variant="tonal" onPress={() => pick('Kadın')} style={{ flex: 1 }} />
        <Button title="Erkek" variant="tonal" onPress={() => pick('Erkek')} style={{ flex: 1 }} />
      </View>
    </Panel>
  );
}

function Join({ demo, reload, pickUntil }: { demo: boolean; reload: () => void; pickUntil: string | null }) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; code: string; level: number; parentName: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const look = async () => {
    if (demo) return showAlert('Örnek veri', 'Sunucuya bağlanılamadığı için ajans aranamıyor.');
    setBusy(true);
    try {
      setFound(await agencyNet.lookup(code.trim().toUpperCase()));
    } catch (e) {
      setFound(null);
      showAlert(unavailable(e) ? 'Sunucuya ulaşılamadı' : 'Bulunamadı', unavailable(e) ? 'Bağlantını kontrol edip tekrar dene.' : errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <Text style={ns.title}>Davet koduyla katıl</Text>
      <Text style={ns.dim}>Ajansının verdiği kodu yaz; onaylayınca hemen ajansa katılırsın. Aynı anda tek ajansa bağlı olabilirsin, ayrılmak için transfer talebi gerekir.</Text>
      {!!pickUntil && <Text style={st.note}>{fmtDate(pickUntil)} tarihine kadar kodla doğrudan katılabilirsin; sonra yalnız merkezin onayladığı transferle.</Text>}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setFound(null);
          }}
          placeholder="Ajans kodu"
          placeholderTextColor={colors.textDim}
          autoCapitalize="characters"
          maxLength={12}
          style={[ns.input, { flex: 1 }]}
        />
        <Button title={busy ? 'Aranıyor' : 'Ara'} variant="tonal" onPress={look} disabled={busy || code.trim().length < 4} />
      </View>
      {found && (
        <View style={st.found}>
          <Ionicons name="business-outline" size={20} color={semantic.action} />
          <View style={{ flex: 1 }}>
            <Text style={[ns.title, { fontSize: 15 }]}>{found.name}</Text>
            <Text style={ns.dim}>
              {LEVEL_TEXT(found.level)}
              {found.parentName ? ` · ${found.parentName}` : ''}
            </Text>
          </View>
        </View>
      )}
      <Button
        title="Ajansa katıl"
        disabled={!found}
        onPress={() => {
          if (!found) return;
          showAlert('Ajansa katıl', `${found.name} ajansına katılacaksın. Sonradan ayrılmak için transfer talebi gerekir.`, [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Katıl',
              onPress: () => {
                let done = `${found.name} ajansına katıldın.`;
                void runAction(
                  demo,
                  async () => {
                    const r = await agencyNet.join(found.code, 'code');
                    // A second account on the same phone goes to the first account's agency (server rule).
                    if (r.sameDevice && r.membership) done = `Bu telefondaki ilk hesabın ${r.membership.agency.name} ajansında; bu hesap da oraya bağlandı.`;
                    else if (r.request) done = 'İsteğin ajansa iletildi.';
                  },
                  undefined,
                  () => {
                    showAlert('Tamam', done);
                    reload();
                  },
                );
              },
            },
          ]);
        }}
      />
    </Panel>
  );
}

function Apply({ demo, reload }: { demo: boolean; reload: () => void }) {
  const [f, setF] = useState({ name: '', parentCode: '', region: '', contactName: '', contactPhone: '', expected: '', description: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const send = () => {
    // The name and region are shown to others; the contact fields and the description go to reviewers only.
    const refusal = contactRefusal(f.name.trim(), 'agency.name') ?? contactRefusal(f.region.trim(), 'agency.region');
    if (refusal) return showAlert(CONTACT_TITLE, refusal);
    void runAction(
      demo,
      () =>
        agencyNet.apply({
          name: f.name.trim(),
          parentCode: f.parentCode.trim().toUpperCase() || undefined,
          country: 'Türkiye',
          region: f.region.trim() || undefined,
          contactName: f.contactName.trim() || undefined,
          contactPhone: f.contactPhone.trim() || undefined,
          expectedStreamers: Number.parseInt(f.expected, 10) || undefined,
          description: f.description.trim() || undefined,
        }),
      f.parentCode ? 'Alt ajans başvurun üst ajansa ve merkeze iletildi.' : 'Başvurun merkeze iletildi. Sonuç bildirim olarak gelecek.',
      reload,
    );
  };
  return (
    <Panel>
      <Text style={ns.title}>Ajans başvurusu</Text>
      <Text style={ns.dim}>Bir üst ajansın altında kurmak için onun kodunu yaz; boş bırakırsan doğrudan merkeze bağlı üst ajans başvurusu olur. Onay politikası merkez kurallarındadır.</Text>
      <Field label="Ajans adı" value={f.name} onChange={set('name')} placeholder="En az 2 karakter" />
      <Field label="Üst ajans kodu (isteğe bağlı)" value={f.parentCode} onChange={(v) => set('parentCode')(v.toUpperCase())} placeholder="Örn. MVD4K2" />
      <Field label="Bölge" value={f.region} onChange={set('region')} placeholder="Şehir" />
      <Field label="Yetkili" value={f.contactName} onChange={set('contactName')} placeholder="Ad soyad" />
      <Field label="Telefon" value={f.contactPhone} onChange={set('contactPhone')} placeholder="+90" keyboard="phone-pad" />
      <Field label="Beklenen yayıncı sayısı" value={f.expected} onChange={set('expected')} placeholder="0" keyboard="number-pad" />
      <Field label="Açıklama" value={f.description} onChange={set('description')} placeholder="Ajansını kısaca anlat" multiline />
      <Button title="Başvuruyu gönder" disabled={f.name.trim().length < 2} onPress={send} />
    </Panel>
  );
}

export function Field({ label, value, onChange, placeholder, keyboard, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: 'default' | 'number-pad' | 'phone-pad' | 'decimal-pad'; multiline?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textDim} keyboardType={keyboard ?? 'default'} multiline={multiline} style={[ns.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]} />
    </View>
  );
}

const st = StyleSheet.create({
  body: { padding: space.lg, paddingBottom: 48 },
  center: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  centerIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(19,217,223,0.14)' },
  agency: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  monogram: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(19,217,223,0.14)', borderWidth: 1, borderColor: 'rgba(19,217,223,0.3)' },
  monoText: { color: semantic.action, fontSize: 20, fontFamily: fonts.display },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  transfer: { gap: 8, padding: space.md, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  found: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 14, backgroundColor: 'rgba(19,217,223,0.08)', borderWidth: 1, borderColor: 'rgba(19,217,223,0.25)' },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
});
