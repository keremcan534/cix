// Ajans asistanı (güncelleme 4, item 17; server/api/agency-assistants.mjs, docs/AJANS_ASISTANI.md): the owner's
// "Asistanlar" tab in the agency panel (ajans/ofis) and the assistant's own card on the agency screen (the hub).
// The owner names an assistant among the agency's own people, sets the share (whole percent of the owner's own
// commission from the streamers the assistant brought), changes it once a calendar week (it starts next Monday
// 00:00, Türkiye) and can end it. Every number and every rule is the server's; these screens only show and send.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { Empty, NetState, Panel, Line, Pill, Section, ns } from '@/components/agency-net';
import { DepthCard } from '@/components/fx/surface';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ListGroup, ListRow } from '@/components/list';
import { Text, TextInput } from '@/components/text';
import { Avatar, Button } from '@/components/ui';
import { assistantExample, shareIn } from '@/lib/agency-assistant';
import { agencyNet, errorText, fmtD, fmtDate, fmtDateTime, runAction, useNet, type Assistant, type AssistantCandidate, type AssistantList, type MyAssistant } from '@/lib/agency-net';
import { showAlert } from '@/lib/alert';
import { SCRIM, colors, edge, fonts, radius, semantic, space } from '@/theme';

/** Shown without a server connection (labelled as example data; actions are disabled there). */
const demoAssistants = (): AssistantList => {
  const now = Date.now();
  const monday = new Date(now + 4 * 86400e3).toISOString();
  return {
    max: 1,
    open: 1,
    canAdd: false,
    weekStart: new Date(now - 3 * 86400e3).toISOString(),
    nextWeek: monday,
    assistants: [
      {
        id: 1,
        agency: { id: 'demo-top', name: 'Örnek Ajans' },
        user: { id: 'u-demo-1', name: 'Ela Yıldız', avatarUrl: null },
        code: 'ELA7K2PQ',
        assignedAt: new Date(now - 40 * 86400e3).toISOString(),
        endedAt: null,
        active: true,
        member: true,
        share: { pct: 50, since: new Date(now - 40 * 86400e3).toISOString() },
        upcoming: null,
        canChange: true,
        nextChangeFrom: monday,
        invited: { total: 8, now: 7 },
        week: { streamerIncome: 12400, share: 1240 },
        month: { share: 4310 },
        total: { share: 9820, wallet: 9820 },
      },
    ],
  };
};

// --- The owner's tab ------------------------------------------------------------------------------------------
export function AssistantsTab({ agencyId, rate, demo, name }: { agencyId: string; rate: number; demo: boolean; name: string }) {
  const q = useNet(name, () => agencyNet.assistants(agencyId), demoAssistants, [agencyId]);
  const [sheet, setSheet] = useState<{ kind: 'add' } | { kind: 'share'; a: Assistant } | { kind: 'rules' } | null>(null);
  const isDemo = demo || q.demo;
  const remove = (a: Assistant) =>
    showAlert('Asistanlıktan çıkar', `${a.user.name} artık asistan olmayacak. Bundan sonraki kazançlardan pay yazılmaz; getirdiği yayıncılar ajansında kalır. Aynı hafta yeniden ekleyemezsin.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkar', style: 'destructive', onPress: () => void runAction(isDemo, () => agencyNet.removeAssistant(agencyId, a.id), 'Asistanlık sona erdi.', q.reload) },
    ]);
  return (
    <NetState q={q}>
      {(d) => (
        <View style={{ gap: space.xl }}>
          <Section
            title="Asistanlar"
            right={
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button title="Kurallar" variant="ghost" small icon="help-circle-outline" onPress={() => setSheet({ kind: 'rules' })} />
                {d.canAdd && <Button title="Ekle" variant="tonal" small icon="person-add-outline" onPress={() => setSheet({ kind: 'add' })} />}
              </View>
            }
          >
            <View style={st.notice}>
              <Ionicons name="notifications-outline" size={15} color={semantic.money} />
              <Text style={st.noticeText}>{d.max > 0 ? `Şu an en fazla ${d.max} asistan ekleyebilirsin.` : 'Şu an asistan eklenemiyor.'}</Text>
            </View>
            {d.assistants.length === 0 ? (
              <Panel>
                <Empty icon="people-circle-outline" text="Henüz asistanın yok. Ajansının yayıncılarından ya da ekibinden birini asistan yapabilirsin." />
                {d.canAdd && <Button title="Asistan ekle" icon="person-add-outline" onPress={() => setSheet({ kind: 'add' })} />}
              </Panel>
            ) : (
              d.assistants.map((a) => <AssistantCard key={a.id} a={a} onShare={() => setSheet({ kind: 'share', a })} onRemove={() => remove(a)} />)
            )}
            <Text style={st.foot}>Pay her takvim haftasında bir kez değişir; yeni pay sonraki pazartesi 00:00’da (Türkiye saati) başlar. Geçmiş kazançlar değişmez.</Text>
          </Section>
          {sheet?.kind === 'add' && <AddSheet agencyId={agencyId} rate={rate} demo={isDemo} onClose={() => setSheet(null)} onDone={q.reload} />}
          {sheet?.kind === 'share' && <ShareSheet agencyId={agencyId} rate={rate} a={sheet.a} demo={isDemo} onClose={() => setSheet(null)} onDone={q.reload} />}
          {sheet?.kind === 'rules' && <RulesSheet max={d.max} rate={rate} onClose={() => setSheet(null)} />}
        </View>
      )}
    </NetState>
  );
}

function AssistantCard({ a, onShare, onRemove }: { a: Assistant; onShare: () => void; onRemove: () => void }) {
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar uri={a.user.avatarUrl ?? undefined} name={a.user.name} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={ns.title} numberOfLines={1}>
            {a.user.name}
          </Text>
          <Pill text={a.member ? 'Asistan' : 'Ajanstan ayrıldı'} tone={a.member ? 'success' : 'danger'} icon={a.member ? 'ribbon-outline' : 'alert-circle-outline'} />
        </View>
      </View>
      <View style={{ gap: 2 }}>
        <Line label="Asistan oldu" value={fmtDateTime(a.assignedAt)} />
        <Line label="Davet kodu" value={a.code} />
        <Line label="Getirdiği yayıncı" value={a.invited.now === a.invited.total ? `${a.invited.total}` : `${a.invited.total} (ajansta ${a.invited.now})`} />
        <Line label="Yayıncı payı" value={`%${a.share.pct}`} strong />
        {a.upcoming && <Line label={`${fmtDate(a.upcoming.from)} itibarıyla`} value={`%${a.upcoming.pct}`} />}
        <Line label="Bu hafta getirdiklerinin kazancı" value={`${fmtD(a.week.streamerIncome)} elmas`} />
        <Line label="Bu hafta asistana geçen" value={`${fmtD(a.week.share)} elmas`} />
        <Line label="Toplam asistana geçen" value={`${fmtD(a.total.share)} elmas`} />
      </View>
      {!a.member && <Text style={st.warn}>Ajanstan ayrıldığı için pay almıyor. Çıkarıp yerine başka birini ekleyebilirsin.</Text>}
      {!a.canChange && <Text style={st.foot}>Bu hafta pay değiştirildi. Sonraki değişikliği {fmtDate(a.nextChangeFrom)} pazartesiden itibaren yapabilirsin.</Text>}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Asistanlıktan çıkar" variant="ghost" small onPress={onRemove} style={{ flex: 1 }} />
        <Button title="Payı düzenle" variant="tonal" small icon="create-outline" disabled={!a.canChange} onPress={onShare} style={{ flex: 1 }} />
      </View>
    </Panel>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoid style={st.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
        <DepthCard style={st.sheet}>
          <View style={ns.rowBetween}>
            <Text style={st.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kapat">
              <Ionicons name="close" size={22} color={colors.textDim} />
            </Pressable>
          </View>
          {children}
        </DepthCard>
      </KeyboardAvoid>
    </Modal>
  );
}

function PctField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={st.pctRow}>
      <Text style={[st.msg, { flex: 1 }]}>Getirdiği yayıncıların kazancından aldığın ajans komisyonunun yüzde kaçı asistana geçsin?</Text>
      <TextInput value={value} onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" maxLength={3} style={st.pctInput} accessibilityLabel="Yayıncı payı (yüzde)" />
      <Text style={st.pctSign}>%</Text>
    </View>
  );
}

function AddSheet({ agencyId, rate, demo, onClose, onDone }: { agencyId: string; rate: number; demo: boolean; onClose: () => void; onDone: () => void }) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<{ q: string; users: AssistantCandidate[]; error: string | null } | null>(null);
  const [pick, setPick] = useState<AssistantCandidate | null>(null);
  const [pct, setPct] = useState('50');
  const [busy, setBusy] = useState(false);
  const q = term.trim();
  // The agency's own people (its streamers and its team); searched by name once the typing pauses.
  useEffect(() => {
    if (demo) return;
    let alive = true;
    const t = setTimeout(() => {
      agencyNet
        .assistantCandidates(agencyId, q)
        .then((users) => alive && setFound({ q, users, error: null }))
        .catch((e) => alive && setFound({ q, users: [], error: errorText(e) }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [agencyId, q, demo]);
  const value = shareIn(pct);
  const save = async () => {
    if (!pick || value === null || busy) return;
    setBusy(true);
    const done = await runAction(demo, () => agencyNet.addAssistant(agencyId, pick.id, value), `${pick.name} artık asistanın.`, onDone);
    setBusy(false);
    if (done) onClose();
  };
  const users = found?.q === q ? found.users : [];
  return (
    <Sheet title="Asistan ekle" onClose={onClose}>
      <Text style={st.msg}>Ajansının yayıncılarından ya da ekibinden birini seç.</Text>
      <TextInput value={term} onChangeText={(t) => (setTerm(t), setPick(null))} placeholder="Ada göre ara" placeholderTextColor={colors.textDim} autoCapitalize="none" autoCorrect={false} maxLength={40} style={ns.input} accessibilityLabel="Ada göre ara" />
      <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.xs }}>
        {demo ? (
          <Text style={st.hint}>Sunucuya bağlanılamadığı için liste gösterilemiyor.</Text>
        ) : found?.q !== q ? (
          <ActivityIndicator color={colors.textDim} style={{ paddingVertical: space.md }} />
        ) : found?.error ? (
          <Text style={[st.hint, { color: semantic.danger }]}>{found.error}</Text>
        ) : users.length === 0 ? (
          <Text style={st.hint}>{q ? 'Bu adla ajansında kimse yok.' : 'Asistan yapılabilecek kimse yok.'}</Text>
        ) : (
          users.map((u) => {
            const on = pick?.id === u.id;
            return (
              <Pressable key={u.id} onPress={() => setPick(on ? null : u)} style={[st.row, on && st.rowOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={u.name}>
                <Avatar uri={u.avatarUrl ?? undefined} name={u.name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.name} numberOfLines={1}>
                    {u.name}
                  </Text>
                  <Text style={st.sub}>{u.role === 'staff' ? 'Ekipte' : 'Yayıncı'}</Text>
                </View>
                {on && <Ionicons name="checkmark-circle" size={22} color={semantic.actionText} />}
              </Pressable>
            );
          })
        )}
      </ScrollView>
      <PctField value={pct} onChange={setPct} />
      {value === null ? <Text style={[st.foot, { color: semantic.danger }]}>0 ile 100 arasında bir sayı yaz.</Text> : <Text style={st.foot}>{assistantExample(rate, value)}</Text>}
      <Text style={st.rule}>İlk pay hemen başlar. Sonra her takvim haftasında bir kez değiştirebilirsin.</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Vazgeç" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Asistan yap" disabled={!pick || value === null || busy} onPress={save} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

function ShareSheet({ agencyId, rate, a, demo, onClose, onDone }: { agencyId: string; rate: number; a: Assistant; demo: boolean; onClose: () => void; onDone: () => void }) {
  const [pct, setPct] = useState(String(a.upcoming?.pct ?? a.share.pct));
  const [busy, setBusy] = useState(false);
  const value = shareIn(pct);
  const save = async () => {
    if (value === null || busy) return;
    setBusy(true);
    const done = await runAction(demo, () => agencyNet.setAssistantShare(agencyId, a.id, value), `Yeni pay %${value}; ${fmtDate(a.nextChangeFrom)} pazartesi 00:00’dan geçerli.`, onDone);
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Sheet title={`${a.user.name} · pay`} onClose={onClose}>
      <Text style={st.msg}>Asistanın getirdiği yayıncılar kazandıkça, onlardan aldığın ajans komisyonunun bu yüzdesi asistanın hesabına elmas olarak geçer.</Text>
      <PctField value={pct} onChange={setPct} />
      <Text style={st.rule}>* Pay her takvim haftasında bir kez değiştirilebilir ve {fmtDate(a.nextChangeFrom)} pazartesi 00:00’da (Türkiye saati) geçerli olur. Şimdiki pay o zamana kadar sürer.</Text>
      {value === null ? <Text style={[st.foot, { color: semantic.danger }]}>0 ile 100 arasında bir sayı yaz.</Text> : <Text style={st.foot}>{assistantExample(rate, value)}</Text>}
      <Button title="Kaydet" disabled={value === null || busy} onPress={save} />
    </Sheet>
  );
}

function RulesSheet({ max, rate, onClose }: { max: number; rate: number; onClose: () => void }) {
  const rules = [
    'Asistan, ajansına yeni yayıncı getirmene yardım eden kişidir. Ajansının yayıncılarından ya da ekibinden birini asistan yapabilirsin.',
    `Aynı anda en fazla ${max} asistanın olabilir. Bu sınırı merkez belirler; daha fazlası gerekirse merkeze başvur.`,
    'Asistanın getirdiği yayıncılar: asistanın kendi davet koduyla ajansına katılanlar ve asistanın uygulamadan gönderdiği daveti kabul edenler.',
    'Bu yayıncılar kazandıkça, onlardan aldığın ajans komisyonunun belirlediğin yüzdesi asistanın hesabına elmas olarak geçer. Yayıncının kendi kazancından bir şey kesilmez.',
    'Pay %0 ile %100 arasıdır. Her takvim haftasında bir kez değiştirilebilir; yeni pay sonraki pazartesi 00:00’da (Türkiye saati) başlar. Geçmiş kazançlar değişmez.',
    'Asistanlıktan çıkarırsan ya da asistan ajanstan ayrılırsa o andan sonra pay yazılmaz. Getirdiği yayıncılar ajansında kalır, komisyonun tamamı sana yazılır. Çıkardığın kişiyi aynı hafta yeniden ekleyemezsin.',
    'Bir hediye iade edilirse asistanın o hediyeden aldığı pay da geri alınır.',
    'Küsuratlar birikir, tam elmas olunca asistanın hesabına geçer. Bu elmaslar hediye elmasları gibi bir süre kilitli kalır.',
    'Destekçilerin jeton yüklemelerinden ajansa komisyon yazılmaz; bu yüzden asistan payı yalnız yayıncı kazancından hesaplanır.',
  ];
  return (
    <Sheet title="Asistan kuralları" onClose={onClose}>
      <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: space.md }}>
        {rules.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
            <Text style={st.ruleNo}>{i + 1}.</Text>
            <Text style={[st.msg, { flex: 1 }]}>{r}</Text>
          </View>
        ))}
        <Text style={st.foot}>{assistantExample(rate, 80)}</Text>
      </ScrollView>
    </Sheet>
  );
}

// --- The assistant's own card (the agency screen) -------------------------------------------------------------
export function MyAssistantCard({ a }: { a: MyAssistant }) {
  const share = () => Share.share({ message: `${a.agency.name} ajansına katılmak için davet kodum: ${a.code}` }).catch(() => {});
  const live = a.active && a.member;
  return (
    <Section title="Ajans asistanlığım">
      <Panel>
        <View style={ns.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={ns.title}>{a.agency.name}</Text>
            <Text style={ns.dim}>{a.active ? `${fmtDate(a.assignedAt)} tarihinden beri asistansın` : `Asistanlığın ${fmtDate(a.endedAt)} tarihinde sona erdi`}</Text>
          </View>
          <Pill text={live ? 'Asistan' : a.active ? 'Ajanstan ayrıldın' : 'Sona erdi'} tone={live ? 'success' : 'neutral'} icon={live ? 'ribbon-outline' : undefined} />
        </View>
        <View style={{ gap: 2 }}>
          <Line label="Payın" value={`%${a.share.pct}`} strong />
          {a.upcoming && <Line label={`${fmtDate(a.upcoming.from)} itibarıyla`} value={`%${a.upcoming.pct}`} />}
          {a.active && <Line label="Davet kodun" value={a.code} strong />}
          <Line label="Getirdiğin yayıncı" value={`${a.invited.total}`} />
          <Line label="Bu hafta getirdiklerinin kazancı" value={`${fmtD(a.week.streamerIncome)} elmas`} />
          <Line label="Bu hafta payın" value={`${fmtD(a.week.share)} elmas`} />
          <Line label="Bu ay payın" value={`${fmtD(a.month.share)} elmas`} />
          <Line label="Hesabına geçen toplam" value={`${fmtD(a.total.wallet)} elmas`} strong />
        </View>
        <Text style={st.foot}>
          {live
            ? `Getirdiğin yayıncılar kazandıkça ajansın onlardan aldığı komisyonun %${a.share.pct}’i sana elmas olarak geçer. Yayıncının kendi kazancından kesilmez. Küsuratlar birikir, tam elmas olunca hesabına eklenir.`
            : 'Bundan sonraki kazançlardan pay yazılmaz; hesabına geçen elmaslar sende kalır.'}
        </Text>
        {a.active && <Button title="Davet kodunu paylaş" variant="tonal" small icon="share-outline" onPress={share} />}
      </Panel>
      {a.rows.length > 0 && (
        <ListGroup label="Son asistan payları" footer="Gelir ekranında “Ajans asistanı payı” olarak görünür.">
          {a.rows.map((r) => (
            <ListRow
              key={r.id}
              icon={r.reversal ? 'return-down-back-outline' : 'ribbon-outline'}
              tone={r.reversal ? 'danger' : 'money'}
              title={r.reversal ? 'Ajans asistanı payı geri alındı' : 'Ajans asistanı payı'}
              subtitle={`${r.streamer ? `${r.streamer} · ` : ''}%${r.pct} · ${fmtDateTime(r.at)}`}
              right={<Text style={[st.amount, r.amount < 0 && { color: semantic.danger }]}>{`${r.amount > 0 ? '+' : ''}${fmtD(r.amount)}`}</Text>}
            />
          ))}
        </ListGroup>
      )}
    </Section>
  );
}

const st = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: 'rgba(246,189,96,0.10)', borderWidth: 1, borderColor: 'rgba(246,189,96,0.28)' },
  noticeText: { color: colors.text, fontSize: 13, flex: 1 },
  foot: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  warn: { color: semantic.danger, fontSize: 12.5, lineHeight: 18 },
  rule: { color: semantic.actionText, fontSize: 12.5, lineHeight: 18 },
  ruleNo: { color: colors.textDim, fontSize: 14, lineHeight: 20, fontWeight: '700', minWidth: 18 },
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: SCRIM },
  sheet: { margin: space.md, padding: space.xl, gap: space.lg, borderRadius: radius.xl, ...edge.card },
  title: { color: '#fff', fontSize: 19, fontFamily: fonts.display, flex: 1 },
  msg: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.textDim, fontSize: 13, lineHeight: 19, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  rowOn: { borderColor: semantic.actionText, backgroundColor: 'rgba(255,255,255,0.05)' },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sub: { color: colors.textDim, fontSize: 12 },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pctInput: { width: 76, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: radius.md, paddingVertical: 10, color: '#fff', fontSize: 24, fontFamily: fonts.displayBold },
  pctSign: { color: '#fff', fontSize: 22, fontFamily: fonts.displayBold },
  amount: { color: '#fff', fontSize: 15, fontFamily: fonts.displayBold, fontVariant: ['tabular-nums'] },
});
