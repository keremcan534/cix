// The agency panel's streamer earnings as a table to send (app/ajans/ofis, Yayıncılar): this week's and this
// month's diamonds and their USD value per streamer. Semicolons and decimal commas, as Excel opens a CSV in
// Turkish; a cell that would start a formula is written as text. Pure, so the unit tests run it under Node.

/** 5000 diamonds = 1 USD (the agency panel's rate, lib/agency-net usdOf). */
const usd = (d: number) => (d / 5000).toFixed(2).replace('.', ',');

/** A text cell: quoted when it holds a separator, a quote or a line break; a leading = + - @ is made text. */
export function csvCell(v: string | null | undefined): string {
  let s = v ?? '';
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type EarningsRow = { name: string; username: string | null; agencyName: string; joinedAt: string; week: number; month: number; diamonds30: number };

/** The table: a header line and one line per streamer, highest this month first. */
export function earningsCsv(rows: EarningsRow[]): string {
  const head = ['Yayıncı', 'Kullanıcı adı', 'Ajans', 'Katılım', 'Bu hafta (elmas)', 'Bu hafta (USD)', 'Bu ay (elmas)', 'Bu ay (USD)', 'Son 30 gün (elmas)'];
  const lines = [...rows]
    .sort((a, b) => b.month - a.month || b.week - a.week)
    .map((r) => [...[r.name, r.username, r.agencyName, r.joinedAt.slice(0, 10)].map(csvCell), r.week, usd(r.week), r.month, usd(r.month), r.diamonds30].join(';'));
  return [head.map(csvCell).join(';'), ...lines].join('\r\n');
}
