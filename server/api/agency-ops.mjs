// Agency state changes shared by the agency panel routes (agency.mjs) and the centre (agency-admin.mjs):
// approval, status, streamer links, parent changes (independence, change of parent, closing a sub-agency),
// transfers with their fee rule, and payouts. Each runs inside the caller's transaction, so a transfer either
// happens completely or not at all.
import { HttpError } from './core.mjs';
import { audit, d4, e4, fmt4, notice, periodOf, rateAt, settingsAt } from './agency-lib.mjs';
import { applyTier } from './agency-perf.mjs';
import { spendDiamonds } from './wallet.mjs';

export async function setStatus(c, a, to, actor, note = '') {
  await c.query('UPDATE agencies SET status = $2, closed_at = CASE WHEN $2 = \'closed\' THEN now() ELSE closed_at END WHERE id = $1', [a.id, to]);
  await c.query('INSERT INTO agency_status_history (agency_id, from_status, to_status, actor_id, note) VALUES ($1,$2,$3,$4,$5)', [a.id, a.status, to, actor, String(note).slice(0, 300)]);
  a.status = to;
}

/**
 * Approves an agency: its parent relation starts, a sub-agency gets the first tier's rate (within its parent's
 * rate minus the parent's floor), a BD who brought it becomes its responsible BD.
 */
export async function approveAgency(c, a, actor, note = '') {
  if (!['pending', 'draft'].includes(a.status)) throw new HttpError(409, 'Bu başvuru onay beklemiyor');
  const { values: s } = await settingsAt(c);
  if (a.parent_id) {
    const p = await c.query('SELECT status FROM agencies WHERE id = $1', [a.parent_id]);
    if (p.rows[0]?.status !== 'approved') throw new HttpError(409, 'Üst ajans aktif değil');
  }
  await c.query("UPDATE agencies SET approved_at = now(), pending_with = NULL WHERE id = $1", [a.id]);
  await setStatus(c, a, 'approved', actor, note);
  await c.query('INSERT INTO agency_parents (agency_id, parent_id, actor_id, reason) VALUES ($1,$2,$3,$4)', [a.id, a.parent_id, actor, 'Onay']);
  if (a.parent_id) await applyTier(c, a, s.tiers[0].key, new Date(), { source: 'approval', actor, reason: 'Alt ajans onayı: başlangıç kademesi' });
  if (a.acquired_by_bd) await c.query('INSERT INTO bd_assignments (bd_id, agency_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [a.acquired_by_bd, a.id, actor]);
  await notice(c, a.id, 'status', 'Ajansın onaylandı', 'Davet kodunla yayıncı ekleyebilirsin. Komisyon bugünden sonra kazanılan gelire uygulanır.');
  if (a.parent_id) await notice(c, a.parent_id, 'sub', `${a.name} alt ajansı onaylandı`, '');
  await audit(c, actor, 'agency.approve', 'agency', a.id, { after: { status: 'approved' }, reason: note });
}

/** Sends a draft or a parent-approved application on: auto-approval if the policy says so, else to the centre. */
export async function submitAgency(c, a, actor) {
  const { values: s } = await settingsAt(c);
  if (a.parent_id && s.subagency_policy.approval === 'auto') return approveAgency(c, a, actor, 'Otomatik onay (merkez politikası)');
  await c.query("UPDATE agencies SET pending_with = 'center' WHERE id = $1", [a.id]);
  if (a.status !== 'pending') await setStatus(c, a, 'pending', actor, 'Merkez onayına gönderildi');
  await audit(c, actor, 'agency.submit', 'agency', a.id, { after: { status: 'pending', pending_with: 'center' } });
}

/** Can `parent` found a sub-agency now? Throws the reason if not. */
export async function checkCanFoundSub(c, parent, s) {
  if (!s.subagency_policy.enabled) throw new HttpError(403, 'Alt ajans oluşturma şu an kapalı');
  if (parent.status !== 'approved') throw new HttpError(409, 'Ajans aktif değil');
  if (parent.level >= s.max_levels) throw new HttpError(403, `En fazla ${s.max_levels} ajans katmanı olabilir`);
  if (!parent.can_create_subs) throw new HttpError(403, 'Bu ajansın alt ajans kurma yetkisi yok');
  if (s.subagency_policy.min_active_streamers > 0) {
    const n = await c.query("SELECT count(*)::int AS n FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NULL AND contract = 'approved'", [parent.id]);
    if (n.rows[0].n < s.subagency_policy.min_active_streamers) throw new HttpError(403, `Alt ajans kurmak için en az ${s.subagency_policy.min_active_streamers} yayıncı gerekli`);
  }
}

/** Links a streamer to an agency. The partial unique index makes a second open link impossible. */
export async function linkStreamer(c, streamerId, agency, method, actor, transferId = null) {
  if (agency.status !== 'approved') throw new HttpError(409, 'Bu ajans şu an yayıncı kabul etmiyor');
  const owner = await c.query("SELECT 1 FROM agencies WHERE owner_id = $1 AND status IN ('draft','pending','approved','suspended')", [streamerId]);
  if (owner.rowCount && agency.owner_id !== streamerId) throw new HttpError(409, 'Ajans yöneticisi başka bir ajansa yayıncı olarak bağlanamaz');
  try {
    await c.query('SAVEPOINT link');
    const r = await c.query('INSERT INTO agency_streamers (streamer_id, agency_id, method, transfer_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [streamerId, agency.id, method, transferId, actor]);
    await c.query('RELEASE SAVEPOINT link');
    await c.query("UPDATE agency_requests SET status = 'cancelled', decided_at = now() WHERE user_id = $1 AND status = 'pending' AND agency_id <> $2", [streamerId, agency.id]);
    await audit(c, actor, 'streamer.link', 'streamer', streamerId, { after: { agency: agency.id, method } });
    return r.rows[0];
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT link');
    if (e.code === '23505') throw new HttpError(409, 'Bu yayıncı zaten bir ajansa bağlı');
    throw e;
  }
}

export async function unlinkStreamer(c, streamerId, reason, transferId = null) {
  const r = await c.query('UPDATE agency_streamers SET ended_at = now(), end_reason = $2, transfer_id = coalesce($3, transfer_id) WHERE streamer_id = $1 AND ended_at IS NULL RETURNING *', [streamerId, reason, transferId]);
  return r.rows[0] ?? null;
}

/**
 * Moves an agency under another parent (NULL = independent, a top agency). The old relation is closed, never
 * edited: commissions already computed keep their chain. Independent: the platform's top agency rate. Under a
 * new parent: its current tier's rate there.
 */
export async function moveParent(c, a, newParentId, actor, reason, transferId = null) {
  const { values: s } = await settingsAt(c);
  if (newParentId === a.id) throw new HttpError(400, 'Ajans kendi altına taşınamaz');
  if (newParentId) {
    const p = await c.query('SELECT * FROM agencies WHERE id = $1 FOR UPDATE', [newParentId]);
    if (!p.rowCount || p.rows[0].status !== 'approved') throw new HttpError(409, 'Hedef üst ajans aktif değil');
    if (p.rows[0].level + 1 > s.max_levels) throw new HttpError(403, `En fazla ${s.max_levels} ajans katmanı olabilir`);
    const subs = await c.query("SELECT 1 FROM agencies WHERE parent_id = $1 AND status IN ('draft','pending','approved','suspended')", [a.id]);
    if (subs.rowCount) throw new HttpError(409, 'Alt ajansları olan bir ajans başka bir ajansın altına taşınamaz');
  }
  const oldParent = a.parent_id;
  await c.query('UPDATE agency_parents SET valid_to = now() WHERE agency_id = $1 AND valid_to IS NULL', [a.id]);
  await c.query('INSERT INTO agency_parents (agency_id, parent_id, actor_id, reason) VALUES ($1,$2,$3,$4)', [a.id, newParentId, actor, String(reason).slice(0, 300)]);
  await c.query('UPDATE agencies SET parent_id = $2, level = $3, tier = CASE WHEN $2::uuid IS NULL THEN NULL ELSE tier END WHERE id = $1', [a.id, newParentId, newParentId ? 2 : 1]);
  const now = new Date();
  if (!newParentId) {
    const before = await rateAt(c, a.id, now);
    const r = await c.query("INSERT INTO agency_rates (agency_id, rate, parent_floor, tier, source, effective_from, reason, set_by) VALUES ($1,$2,0,NULL,'independence',$3,$4,$5) RETURNING id", [a.id, s.top_rate, now, String(reason).slice(0, 300), actor]);
    await c.query("INSERT INTO agency_tier_history (agency_id, from_tier, to_tier, from_rate, to_rate, effective_from, source, rate_id, actor_id, reason) VALUES ($1,$2,NULL,$3,$4,$5,'independence',$6,$7,$8)", [
      a.id,
      a.tier,
      before?.rate ?? null,
      s.top_rate,
      now,
      r.rows[0].id,
      actor,
      String(reason).slice(0, 300),
    ]);
    a.parent_id = null;
    a.level = 1;
    a.tier = null;
  } else {
    a.parent_id = newParentId;
    a.level = 2;
    const tier = s.tiers.some((t) => t.key === a.tier) ? a.tier : s.tiers[0].key;
    await applyTier(c, a, tier, now, { source: 'transfer', actor, reason: String(reason).slice(0, 300) });
  }
  if (oldParent) await notice(c, oldParent, 'sub', `${a.name} artık senin alt ajansın değil`, 'Bu ajansın bundan sonraki gelirinden pay almazsın (merkezin tanımladığı geçiş komisyonu hariç). Geçmiş kazançların değişmez.');
  if (newParentId) await notice(c, newParentId, 'sub', `${a.name} alt ajansın oldu`, '');
  await notice(c, a.id, 'parent', newParentId ? 'Üst ajansın değişti' : 'Bağımsız üst ajans oldun', 'Yeni oran bu andan sonra kazanılan gelire uygulanır.');
  await audit(c, actor, 'agency.parent', 'agency', a.id, { before: { parent: oldParent }, after: { parent: newParentId }, reason, transferId });
}

// --- Transfers ---------------------------------------------------------------------------------------------
/** Commission-base diamonds of the last 30 days: a streamer's income, or an agency's own streamers' income. */
async function last30(c, kind, id) {
  const r =
    kind === 'streamer'
      ? await c.query("SELECT coalesce(sum(diamonds), 0) AS n FROM income_events WHERE streamer_id = $1 AND occurred_at > now() - interval '30 days'", [id])
      : await c.query("SELECT coalesce(sum(base_diamonds), 0) AS n FROM agency_commissions WHERE agency_id = $1 AND occurred_at > now() - interval '30 days'", [id]);
  return Math.max(0, Number(r.rows[0].n));
}

/**
 * The transfer fee by the rule in force: free under the threshold (low performance), otherwise the last 30
 * days' base × the fee rate. Stored with the transfer so the decision shows exactly how it was computed.
 */
export async function feeRule(c, kind, subjectId, s) {
  const tp = s.transfer_policy;
  const base = await last30(c, kind, subjectId);
  const rate = kind === 'streamer' ? tp.fee_rate : tp.agency_fee_rate;
  const free = base < tp.free_below_diamonds || tp.fee_payer === 'none';
  const fee = free ? 0 : Math.floor(base * e4(rate)) / 1e4;
  return { base, rate, threshold: tp.free_below_diamonds, fee: d4(fee), payer: tp.fee_payer, account: tp.fee_account, rule: `Son 30 gün matrah × %${rate * 100}; ${tp.free_below_diamonds.toLocaleString('tr-TR')} elmasın altı ücretsiz` };
}

/** Writes the fee when a paid transfer completes: from the payer to the account in the rule. */
async function chargeFee(c, t) {
  const fee = Number(t.fee);
  if (t.mode !== 'paid' || !(fee > 0)) return;
  const { values: s } = await settingsAt(c);
  const period = periodOf(new Date(), s.commission_period);
  const payee = t.fee_account === 'from_agency' ? t.from_agency_id : null;
  if (t.fee_payer === 'streamer') {
    // The streamer pays from their unlocked diamonds (whole diamonds, rounded up); locked ones (wallet.mjs) can't.
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [t.streamer_id]);
    await spendDiamonds(c, t.streamer_id, Math.ceil(fee), 'Ajans transfer ücreti', `transfer:${t.id}`);
  } else if (t.fee_payer === 'to_agency') {
    await c.query("INSERT INTO agency_ledger (agency_id, kind, amount, transfer_id, ref, period, note) VALUES ($1,'transfer_fee',$2,$3,$4,$5,$6)", [t.to_agency_id, fmt4(-e4(fee)), t.id, `transfer:${t.id}:pay`, period, 'Transfer ücreti (ödenen)']);
  }
  if (payee) await c.query("INSERT INTO agency_ledger (agency_id, kind, amount, transfer_id, ref, period, note) VALUES ($1,'transfer_fee',$2,$3,$4,$5,$6)", [payee, fmt4(e4(fee)), t.id, `transfer:${t.id}:get`, period, 'Transfer ücreti (alınan)']);
}

/** Records an approval; when every party in `needs` has approved, the transfer happens in this transaction. */
export async function approveTransfer(c, t, party, actor, extra = {}) {
  if (t.status !== 'pending') throw new HttpError(409, 'Bu talep artık açık değil');
  if (!t.needs.includes(party)) throw new HttpError(403, 'Bu talep senin onayını beklemiyor');
  if (t.approvals[party]) throw new HttpError(409, 'Zaten onayladın');
  t.approvals[party] = { by: actor, at: new Date().toISOString(), ...extra };
  if (extra.mode) t.mode = extra.mode;
  if (extra.fee !== undefined) t.fee = extra.fee;
  if (extra.transition !== undefined) t.transition = extra.transition;
  await c.query('UPDATE agency_transfers SET approvals = $2, mode = $3, fee = $4, transition = $5 WHERE id = $1', [t.id, JSON.stringify(t.approvals), t.mode, t.fee, t.transition ? JSON.stringify(t.transition) : null]);
  await audit(c, actor, 'transfer.approve', 'transfer', t.id, { after: { party, ...extra } });
  if (t.needs.every((p) => t.approvals[p])) await completeTransfer(c, t, actor);
  return t;
}

export async function rejectTransfer(c, t, actor, note = '') {
  if (t.status !== 'pending') throw new HttpError(409, 'Bu talep artık açık değil');
  await c.query("UPDATE agency_transfers SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1", [t.id, actor, String(note).slice(0, 300)]);
  await audit(c, actor, 'transfer.reject', 'transfer', t.id, { reason: note });
  t.status = 'rejected';
}

async function completeTransfer(c, t, actor) {
  switch (t.kind) {
    case 'streamer_move': {
      const to = await c.query('SELECT * FROM agencies WHERE id = $1 FOR UPDATE', [t.to_agency_id]);
      await unlinkStreamer(c, t.streamer_id, 'transfer', t.id);
      await linkStreamer(c, t.streamer_id, to.rows[0], 'transfer', actor, t.id);
      break;
    }
    case 'streamer_leave':
      await unlinkStreamer(c, t.streamer_id, 'left', t.id);
      break;
    case 'independence':
    case 'change_parent': {
      const a = (await c.query('SELECT * FROM agencies WHERE id = $1 FOR UPDATE', [t.agency_id])).rows[0];
      await moveParent(c, a, t.kind === 'independence' ? null : t.to_agency_id, actor, t.reason, t.id);
      const tr = t.transition;
      if (t.kind === 'independence' && tr && tr.rate > 0) {
        const starts = new Date();
        const ends = tr.endsAt ? new Date(tr.endsAt) : new Date(starts.getTime() + tr.days * 86400e3);
        await c.query(
          'INSERT INTO agency_transitions (agency_id, old_parent_id, rate, starts_at, ends_at, scope, income_types, transfer_id, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [a.id, t.from_agency_id, tr.rate, starts, ends, tr.scope ?? 'existing', tr.incomeTypes ?? [], t.id, 'Bağımsızlaşma geçiş komisyonu', actor],
        );
      }
      break;
    }
    case 'sub_close': {
      const a = (await c.query('SELECT * FROM agencies WHERE id = $1 FOR UPDATE', [t.agency_id])).rows[0];
      const target = (await c.query('SELECT * FROM agencies WHERE id = $1 FOR UPDATE', [t.to_agency_id])).rows[0];
      const streamers = await c.query('SELECT streamer_id FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NULL', [a.id]);
      for (const row of streamers.rows) {
        await unlinkStreamer(c, row.streamer_id, 'agency_closed', t.id);
        await linkStreamer(c, row.streamer_id, target, 'transfer', actor, t.id);
      }
      await c.query('UPDATE agency_parents SET valid_to = now() WHERE agency_id = $1 AND valid_to IS NULL', [a.id]);
      await setStatus(c, a, 'closed', actor, t.reason);
      await notice(c, target.id, 'sub', `${a.name} kapandı`, `${streamers.rowCount} yayıncı sana taşındı.`);
      break;
    }
    default:
      throw new HttpError(400, 'Bilinmeyen transfer');
  }
  await chargeFee(c, t);
  await c.query("UPDATE agency_transfers SET status = 'completed', decided_by = $2, decided_at = now() WHERE id = $1", [t.id, actor]);
  t.status = 'completed';
  await audit(c, actor, 'transfer.complete', 'transfer', t.id, { after: { kind: t.kind, mode: t.mode, fee: Number(t.fee) } });
}

/** Opens a transfer request. needs = parties that must approve. */
export async function openTransfer(c, f) {
  try {
    await c.query('SAVEPOINT tr');
    const r = await c.query(
      `INSERT INTO agency_transfers (kind, streamer_id, agency_id, from_agency_id, to_agency_id, needs, mode, fee, fee_payer, fee_account, fee_rule, reason, ref, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [f.kind, f.streamerId ?? null, f.agencyId ?? null, f.fromId ?? null, f.toId ?? null, f.needs, f.mode ?? null, f.fee ?? 0, f.feeRule?.payer ?? null, f.feeRule?.account ?? null, f.feeRule ? JSON.stringify(f.feeRule) : null, f.reason, f.ref, f.actor],
    );
    await c.query('RELEASE SAVEPOINT tr');
    await audit(c, f.actor, 'transfer.open', 'transfer', r.rows[0].id, { after: { kind: f.kind, needs: f.needs }, reason: f.reason });
    return r.rows[0];
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT tr');
    if (e.code === '23505') {
      const same = await c.query('SELECT * FROM agency_transfers WHERE requested_by = $1 AND ref = $2', [f.actor, f.ref]);
      if (same.rowCount) return same.rows[0];
      throw new HttpError(409, 'Zaten açık bir transfer talebi var');
    }
    throw e;
  }
}

export const transferView = (t, names = {}) => ({
  id: Number(t.id),
  kind: t.kind,
  status: t.status,
  streamer: t.streamer_id ? { id: t.streamer_id, name: names[t.streamer_id] ?? null } : null,
  agency: t.agency_id ? { id: t.agency_id, name: names[t.agency_id] ?? null } : null,
  from: t.from_agency_id ? { id: t.from_agency_id, name: names[t.from_agency_id] ?? null } : null,
  to: t.to_agency_id ? { id: t.to_agency_id, name: names[t.to_agency_id] ?? null } : null,
  needs: t.needs,
  approvals: t.approvals,
  mode: t.mode,
  fee: d4(t.fee),
  feeRule: t.fee_rule,
  transition: t.transition,
  reason: t.reason,
  createdAt: t.created_at,
  decidedAt: t.decided_at,
  decisionNote: t.decision_note,
});

/** Names of the users and agencies a list of transfers mentions. */
export async function namesFor(c, rows) {
  const ids = [...new Set(rows.flatMap((t) => [t.streamer_id, t.agency_id, t.from_agency_id, t.to_agency_id]).filter(Boolean))];
  if (!ids.length) return {};
  const r = await c.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[]) UNION ALL SELECT id, name FROM agencies WHERE id = ANY($1::uuid[])', [ids]);
  return Object.fromEntries(r.rows.map((x) => [x.id, x.name]));
}

// --- Payouts -----------------------------------------------------------------------------------------------
export async function payoutStep(c, p, to, actor, note = '', extra = {}) {
  const sets = ['status = $2'];
  const vals = [p.id, to];
  if (to === 'ready') sets.push(`approved_by = $${vals.push(actor)}`, 'approved_at = now()');
  if (to === 'paid') sets.push(`paid_by = $${vals.push(actor)}`, 'paid_at = now()', `payment_ref = $${vals.push(extra.paymentRef)}`);
  if (note) sets.push(`note = $${vals.push(String(note).slice(0, 300))}`);
  try {
    await c.query('SAVEPOINT pay');
    await c.query(`UPDATE agency_payouts SET ${sets.join(', ')} WHERE id = $1`, vals);
    await c.query('RELEASE SAVEPOINT pay');
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT pay');
    if (e.code === '23505') throw new HttpError(409, 'Bu ödeme referansı başka bir ödemede kullanılmış');
    throw e;
  }
  // A refused or cancelled payout gives its earnings back to the agency's available balance.
  if (to === 'rejected' || to === 'cancelled') await c.query('UPDATE agency_ledger SET payout_id = NULL WHERE payout_id = $1', [p.id]);
  await c.query('INSERT INTO agency_payout_history (payout_id, from_status, to_status, actor_id, note) VALUES ($1,$2,$3,$4,$5)', [p.id, p.status, to, actor, String(note).slice(0, 300)]);
  await audit(c, actor, `payout.${to}`, 'payout', p.id, { before: { status: p.status }, after: { status: to, ...extra }, reason: note });
  p.status = to;
}
