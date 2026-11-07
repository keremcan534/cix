// Yönetim › Uğurlu hediyeler: the packages, odds and limits the server draws with (server/api/lucky.mjs), today's and
// all-time totals, the last sends and the big wins. Every change asks first and goes up with the settings version it
// was read at: when someone else saved in between, the server refuses (409) and the section reads the new settings.
// Changes count only for new sends; each send keeps the odds it was drawn with.
import { useState } from 'react';

import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { ago, fmtDate } from '@/lib/admin-format';
import { showAlert } from '@/lib/alert';
import { ApiError, type ServerLuckyAdmin, type ServerLuckyAdminSend, type ServerLuckyConfig, type ServerLuckyGift } from '@/lib/api';
import { message } from '@/lib/live';
import { loadLuckyAdmin, saveLuckyAdmin } from '@/lib/live/lucky';
import { ODDS_TOTAL, maxMult, newGiftDraft, oddsLabel, validate, type LuckyGift } from '@/lib/lucky';
import { makeStyles, space } from '@/theme';

import { LuckyEditor } from './lucky-editor';
import { Filters, ItemCard, Line, LoadState, Notice, SectionScroll, StatusPill, useAdmin, useLoad } from './parts';

type Part = 'paket' | 'limit' | 'gecmis' | 'kazanan';
const fmt = (n: number) => n.toLocaleString('tr-TR');
const LIMITS = [1_000_000, 5_000_000, 20_000_000, 100_000_000];
const ANNOUNCE = [20, 50, 100, 500];
const plain = (g: ServerLuckyGift | LuckyGift): LuckyGift => ({ id: g.id, name: g.name.trim(), emoji: g.emoji.trim(), price: g.price, enabled: g.enabled, tiers: g.tiers });
const back = (g: LuckyGift) => (g.tiers.reduce((n, t) => n + t.mult * t.weight, 0) / ODDS_TOTAL).toFixed(2);

export function LuckySection() {
  const ctx = useAdmin();
  const load = useLoad(loadLuckyAdmin);
  const [part, setPart] = useState<Part>('paket');
  const [editing, setEditing] = useState<LuckyGift | null>(null);
  const [busy, setBusy] = useState(false);
  const s = useStyles();

  /** Asks, then saves `next` over the settings read at `d.version`. */
  const save = (d: ServerLuckyAdmin, next: ServerLuckyConfig, q: { title: string; message: string; confirm: string; destructive?: boolean }, done: string, after?: () => void) =>
    showAlert(q.title, q.message, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: q.confirm,
        style: q.destructive ? 'destructive' : 'default',
        onPress: () => {
          setBusy(true);
          saveLuckyAdmin({ ...next, gifts: next.gifts.map(plain) }, d.version)
            .then(() => {
              ctx.toast(done);
              after?.();
              load.reload();
            })
            .catch((e: unknown) => {
              // Someone else saved in between: read the new settings; the change is made again on top of them.
              if (e instanceof ApiError && e.status === 409) load.reload();
              showAlert('Kaydedilemedi', message(e));
            })
            .finally(() => setBusy(false));
        },
      },
    ]);

  const saveGift = (d: ServerLuckyAdmin, g: LuckyGift) => {
    const bad = validate(g);
    if (bad) return showAlert('Kaydedilemedi', bad);
    if (g.price < 5) return showAlert('Kaydedilemedi', 'Fiyat en az 5 jeton olmalı.');
    if (!g.name.trim() || !g.emoji.trim()) return showAlert('Kaydedilemedi', 'Paketin adı ve simgesi olmalı.');
    const exists = d.config.gifts.some((x) => x.id === g.id);
    const gifts = exists ? d.config.gifts.map((x) => (x.id === g.id ? g : x)) : [...d.config.gifts, g];
    const top = maxMult(g);
    save(
      d,
      { ...d.config, gifts },
      {
        title: exists ? 'Paketi kaydet' : 'Yeni paket',
        message: `${g.emoji} ${g.name}: ${fmt(g.price)} jeton, en yüksek ×${fmt(top)} (${oddsLabel(g.tiers.find((t) => t.mult === top)?.weight ?? 0)}), beklenen geri dönüş ×${back(g)}. ${g.enabled ? 'Açık' : 'Kapalı'}. Yeni oranlar yalnızca bundan sonraki gönderimlere uygulanır.`,
        confirm: 'Kaydet',
      },
      `${g.name} kaydedildi`,
      () => setEditing(null),
    );
  };

  return (
    <SectionScroll load={load}>
      <LoadState load={load}>
        {(d) => (
          <>
            <Notice
              text={`Ayar sürümü v${d.version}${d.updatedAt ? ` · son değişiklik ${fmtDate(d.updatedAt)}` : ' · hazır paketler'}. Ödüller oyun jetonu olarak ödenir; alıcıya fiyatın %20’si elmas yazılır.`}
            />
            <ItemCard title="Bugün" sub="İstanbul saatiyle gece yarısından beri">
              <Line label="Gönderim" value={fmt(d.stats.today.sends)} />
              <Line label="Harcanan jeton" value={fmt(d.stats.today.spent)} />
              <Line label="Ödenen oyun jetonu" value={`${fmt(d.stats.today.paid)} / ${fmt(d.config.dailyPayoutLimit)}`} />
              <Line label="Alıcılara elmas" value={fmt(d.stats.today.shared)} />
            </ItemCard>
            <ItemCard title="Toplam">
              <Line label="Gönderim" value={fmt(d.stats.total.sends)} />
              <Line label="Harcanan jeton" value={fmt(d.stats.total.spent)} />
              <Line label="Ödenen oyun jetonu" value={fmt(d.stats.total.paid)} />
              <Line label="Alıcılara elmas" value={fmt(d.stats.total.shared)} />
            </ItemCard>
            <Filters
              value={part}
              options={[
                ['paket', 'Paketler'],
                ['limit', 'Limitler'],
                ['gecmis', `Son gönderimler · ${d.recent.length}`],
                ['kazanan', `Büyük kazançlar · ${d.winners.length}`],
              ]}
              onChange={(p) => {
                setEditing(null);
                setPart(p);
              }}
            />

            {part === 'paket' && editing && <LuckyEditor key={editing.id} draft={editing} onChange={setEditing} busy={busy} onSave={(g) => saveGift(d, g)} onCancel={() => setEditing(null)} />}
            {part === 'paket' &&
              !editing &&
              d.config.gifts.map((x) => {
                const g = plain(x);
                const top = maxMult(g);
                const last = d.config.gifts.filter((y) => y.enabled).length === 1 && g.enabled;
                return (
                  <ItemCard
                    key={g.id}
                    title={`${g.emoji} ${g.name}`}
                    sub={`${fmt(g.price)} jeton · en yüksek ×${fmt(top)} = ${fmt(g.price * top)} oyun jetonu`}
                    pill={<StatusPill text={g.enabled ? 'Açık' : 'Kapalı'} tone={g.enabled ? 'success' : 'neutral'} />}
                    actions={
                      <>
                        <Button title="Düzenle" variant="tonal" small onPress={() => setEditing({ ...g, tiers: g.tiers.map((t) => ({ ...t })) })} />
                        <Button
                          title={g.enabled ? 'Kapat' : 'Aç'}
                          variant={g.enabled ? 'danger' : 'tonal'}
                          small
                          disabled={busy || last}
                          onPress={() =>
                            save(
                              d,
                              { ...d.config, gifts: d.config.gifts.map((y) => (y.id === g.id ? { ...y, enabled: !g.enabled } : y)) },
                              {
                                title: g.enabled ? 'Paketi kapat' : 'Paketi aç',
                                message: g.enabled ? `${g.name} hediye panelinden kalkar; yeni gönderim alınmaz. Geçmiş kayıtlar kalır.` : `${g.name} hediye panelinde yeniden görünür.`,
                                confirm: g.enabled ? 'Kapat' : 'Aç',
                                destructive: g.enabled,
                              },
                              `${g.name} ${g.enabled ? 'kapatıldı' : 'açıldı'}`,
                            )
                          }
                        />
                      </>
                    }
                  >
                    <Line label="Ödül yok" value={oddsLabel(g.tiers.find((t) => t.mult === 0)?.weight ?? 0)} />
                    <Line label="Beklenen geri dönüş" value={`×${back(g)}`} />
                    <Line label="Olasılıklar" value={g.tiers.filter((t) => t.mult && t.weight).map((t) => `×${fmt(t.mult)} ${oddsLabel(t.weight)}`).join(' · ')} />
                  </ItemCard>
                );
              })}
            {part === 'paket' && !editing && (
              <Button title="Yeni Uğurlu paketi" icon="add" variant="tonal" disabled={d.config.gifts.length >= 20} onPress={() => setEditing(newGiftDraft())} />
            )}

            {part === 'limit' && (
              <>
                <Text style={s.label}>Günlük toplam ödül limiti (oyun jetonu)</Text>
                <Text style={s.hint}>Bir paketin en yüksek ödülü bugünkü kalan limite sığmıyorsa o paket yarına kadar gönderim almaz.</Text>
                <Filters
                  value={String(d.config.dailyPayoutLimit)}
                  options={(LIMITS.includes(d.config.dailyPayoutLimit) ? LIMITS : [...LIMITS, d.config.dailyPayoutLimit].sort((a, b) => a - b)).map((n) => [String(n), fmt(n)] as [string, string])}
                  onChange={(v) =>
                    save(d, { ...d.config, dailyPayoutLimit: Number(v) }, { title: 'Günlük limit', message: `Günlük toplam ödül limiti ${fmt(Number(v))} oyun jetonu olsun mu?`, confirm: 'Kaydet' }, 'Günlük limit kaydedildi')
                  }
                />
                <Text style={s.label}>Odada duyurulan en düşük çarpan</Text>
                <Filters
                  value={String(d.config.announceFrom)}
                  options={(ANNOUNCE.includes(d.config.announceFrom) ? ANNOUNCE : [...ANNOUNCE, d.config.announceFrom].sort((a, b) => a - b)).map((n) => [String(n), `×${n}`] as [string, string])}
                  onChange={(v) =>
                    save(d, { ...d.config, announceFrom: Number(v) }, { title: 'Duyuru', message: `×${v} ve üstü kazançlar odada duyurulsun mu?`, confirm: 'Kaydet' }, 'Duyuru ayarı kaydedildi')
                  }
                />
                <Text style={s.hint}>Kullanıcı başına gönderim sınırı yok; Cömertlik Lv.2 ve 18 yaş şartı sunucuda denetlenir. PK’da hediyenin %20’si puan sayılır, ödül sayılmaz.</Text>
              </>
            )}

            {(part === 'gecmis' || part === 'kazanan') &&
              ((part === 'gecmis' ? d.recent : d.winners).length === 0 ? (
                <Text style={s.hint}>Henüz kayıt yok.</Text>
              ) : (
                (part === 'gecmis' ? d.recent : d.winners).map((x) => <SendCard key={x.id} x={x} gifts={d.config.gifts} />)
              ))}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

function SendCard({ x, gifts }: { x: ServerLuckyAdminSend; gifts: ServerLuckyGift[] }) {
  const { openAccount } = useAdmin();
  const g = gifts.find((y) => y.id === x.giftId);
  const wins = x.draws.filter((m) => m > 0).length;
  return (
    <ItemCard
      title={`${g?.emoji ?? '🎁'} ${g?.name ?? x.giftId} ×${fmt(x.count)}${x.to.length > 1 ? ` · ${x.to.length} kişi` : ''}`}
      sub={`${x.sender.name} · ${ago(x.at)}`}
      pill={x.best ? <StatusPill text={`×${fmt(x.best)}`} tone={x.payout ? 'money' : 'neutral'} /> : <StatusPill text="Ödül yok" />}
    >
      <Line label="Gönderen" value={x.sender.name} onPress={() => openAccount(x.sender.id, x.sender.name)} />
      <Line label="Harcanan" value={`${fmt(x.cost)} jeton`} />
      <Line label="Alıcılara elmas" value={fmt(x.shared)} />
      <Line label="Ödül" value={x.payout ? `${fmt(x.payout)} oyun jetonu · ${wins}/${x.draws.length} çekiliş` : `0 · ${x.draws.length} çekiliş`} />
      <Line label="Ayar sürümü" value={`v${x.configVersion}`} />
      <Line label="Zaman" value={fmtDate(x.at)} />
    </ItemCard>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: space.sm },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
}));
