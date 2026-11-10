// Yönetim › Destek (admins and moderators): the support ticket queue (server/api/support.mjs). Bekleyen holds tickets
// waiting for staff, the longest waiting first; Yanıtlandı those waiting for the person; Kapalı the solved ones. A
// ticket opens over the panel with its photos and thread; a reply goes to the person as "Destek" (never this staff
// member's name), and they are told in Similar Ekibi and by a push. The status can be set by hand too.
import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { ago, fmtDate } from '@/lib/admin-format';
import * as api from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import * as admin from '@/lib/live/admin';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { Filters, ItemCard, Line, LoadState, Notice, Overlay, Quote, SectionScroll, StatusPill, useAdmin, useLoad, type Tone } from './parts';

const FILTERS: [api.StaffQueue, string][] = [
  ['waiting', 'Bekleyen'],
  ['answered', 'Yanıtlandı'],
  ['closed', 'Kapalı'],
];
const STATUS: Record<api.ServerTicketStatus, [string, Tone]> = {
  open: ['Açık', 'money'],
  reopened: ['Yeniden açıldı', 'money'],
  answered: ['Yanıtlandı', 'action'],
  closed: ['Çözüldü', 'success'],
};
const titleOf = (t: api.StaffTicket) => `#${t.number} · ${t.feedback ? 'Geri bildirim' : t.category}`;

export function SupportSection() {
  const ctx = useAdmin();
  const [filter, setFilter] = useState<api.StaffQueue>('waiting');
  const load = useLoad(() => api.staffTickets(filter), [filter]);
  const done = () => {
    load.reload();
    ctx.changed();
  };
  return (
    <SectionScroll load={load}>
      <Filters value={filter} options={FILTERS} onChange={setFilter} />
      <LoadState
        load={load}
        empty={(d) =>
          d.tickets.length
            ? null
            : filter === 'waiting'
              ? { icon: 'chatbubbles-outline', title: 'Bekleyen talep yok', text: 'Biri Destek’ten talep açınca veya talebine yazınca burada görünür.' }
              : { icon: 'file-tray-outline', title: 'Bu listede talep yok' }
        }
      >
        {(d) => (
          <>
            {filter === 'waiting' && (
              <Notice text="Yanıtın kişiye “Destek” adıyla gider, adın görünmez; kişiye Similar Ekibi’nde ve bildirimle haber verilir. Talepleri yalnızca kişi ve yetkililer görür, bu yüzden telefon veya IBAN gibi bilgiler burada yazılabilir." />
            )}
            {d.tickets.map((t) => (
              <TicketRow key={t.id} t={t} onOpen={() => ctx.present(<TicketSheet id={t.id} onClose={() => ctx.present(null)} onChanged={done} />)} />
            ))}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

function TicketRow({ t, onOpen }: { t: api.StaffTicket; onOpen: () => void }) {
  const [label, tone] = STATUS[t.status];
  const last = t.last;
  return (
    <ItemCard title={titleOf(t)} sub={`${t.user.name} · ${ago(t.updatedAt)}`} pill={<StatusPill text={label} tone={tone} />}>
      <Line label="Açıldı" value={fmtDate(t.createdAt)} />
      {!!t.lines && <Line label="Yazışma" value={`${t.lines} mesaj${t.photos.length ? ` · ${t.photos.length} fotoğraf` : ''}`} />}
      <Quote text={last ? `${last.from === 'support' ? 'Destek' : t.user.name}: ${last.text}` : t.text} />
      <Button title="Aç" icon="open-outline" variant="tonal" small style={{ alignSelf: 'flex-start' }} onPress={onOpen} />
    </ItemCard>
  );
}

/** One ticket over the panel: the person, the photos, the thread, a reply and the status. */
function TicketSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const ctx = useAdmin();
  const isAdmin = admin.useIsAdmin();
  const { colors } = useTheme();
  const s = useStyles();
  const load = useLoad(() => api.staffTicket(id), [id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = (job: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    job()
      .then(() => {
        ctx.toast(ok);
        setText('');
        load.reload();
        onChanged();
      })
      .catch((e: unknown) => showAlert('İşlem yapılamadı', message(e)))
      .finally(() => setBusy(false));
  };
  const reply = (close: boolean) => {
    if (!text.trim()) return showAlert('Yanıt boş', 'Kişiye gidecek yanıtı yaz.');
    run(() => api.staffReply(id, text.trim(), close), close ? 'Yanıt gönderildi, talep kapandı' : 'Yanıt gönderildi');
  };
  return (
    <Overlay onClose={onClose} label="Destek talebi">
      <LoadState load={load}>
        {(t) => (
          <ScrollView contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text style={s.title}>{titleOf(t)}</Text>
              <StatusPill text={STATUS[t.status][0]} tone={STATUS[t.status][1]} />
            </View>
            <Line label="Kişi" value={t.user.username ? `${t.user.name} (@${t.user.username})` : t.user.name} onPress={
                isAdmin
                  ? () => {
                      // The account sheet sits under this one: this closes first.
                      onClose();
                      ctx.openAccount(t.user.id, t.user.name);
                    }
                  : undefined
              }
            />
            <Line label="Hesap kimliği" value={t.user.id} mono />
            <Line label="Açıldı" value={`${fmtDate(t.createdAt)} · ${ago(t.createdAt)}`} />
            {t.closedAt && <Line label="Kapandı" value={`${fmtDate(t.closedAt)}${t.closedBy ? ` · ${t.closedBy}` : ''}`} />}
            <Quote text={t.text} />
            {!!t.photos.length && (
              <View style={s.photos}>
                {t.photos.map((uri, i) => (
                  <Image key={uri} source={{ uri }} style={s.photo} resizeMode="cover" accessibilityLabel={`Kanıt ${i + 1}`} />
                ))}
              </View>
            )}
            {t.messages.map((m) => (
              <View key={m.id} style={[s.line, m.from === 'support' && s.lineStaff]}>
                <Text style={s.lineText}>{m.text}</Text>
                <Text style={s.lineMeta}>
                  {m.from === 'support' ? `Destek${m.by ? ` · ${m.by.name}` : ''}` : t.user.name} · {fmtDate(m.createdAt)}
                </Text>
              </View>
            ))}
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              placeholder="Yanıtını yaz…"
              placeholderTextColor={colors.textDim}
              style={s.input}
              accessibilityLabel="Yanıt"
            />
            <View style={s.actions}>
              <Button title="Yanıtla" icon="send" variant="tonal" small disabled={busy} onPress={() => reply(false)} />
              {t.status !== 'closed' && <Button title="Yanıtla ve kapat" icon="checkmark-done" variant="tonal" small disabled={busy} onPress={() => reply(true)} />}
              {t.status === 'closed' ? (
                <Button title="Yeniden aç" icon="refresh" variant="ghost" small disabled={busy} onPress={() => run(() => api.staffTicketStatus(id, 'open'), 'Talep yeniden açıldı')} />
              ) : (
                <Button title="Yanıtsız kapat" icon="close-circle-outline" variant="ghost" small disabled={busy} onPress={() => run(() => api.staffTicketStatus(id, 'closed'), 'Talep kapandı')} />
              )}
            </View>
          </ScrollView>
        )}
      </LoadState>
    </Overlay>
  );
}

const useStyles = makeStyles(({ colors, semantic }) => ({
  title: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 96, height: 120, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  line: { backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, gap: 4, maxWidth: '92%' },
  lineStaff: { alignSelf: 'flex-end', backgroundColor: semantic.tonal },
  lineText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  lineMeta: { color: colors.textDim, fontSize: 12 },
  input: { color: colors.text, fontSize: 15, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: 88, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
}));
