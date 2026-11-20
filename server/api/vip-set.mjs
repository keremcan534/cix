// VIP seti (docs/VIP_SETI.md): the client's "vip 1-10lvl sistem" package (20 Nov 2026) as bag items. For each VIP level
// 1–10 its moving profile frame, its chat bubble and its entry effect go into the shop as the admins' own items (the
// same rows Yönetim › Mağaza makes, shop-items.mjs), off the shelf (owners' decision: not sold, a VIP reward only; for
// good), each with a Seviye ödülü (level-rewards.mjs) that puts it in Çantam of whoever has that VIP level, at their
// next economy read, with the SimilarClub Sistem note.
//
// The files are in vip-set/ (made by app/scripts/vip-set-assets.py: the frames' SVGAs turned into a still PNG and a
// moving WebP by tools/svga-to-webp.py, the entry effects' SVGAs into stacked MP4s by tools/svga-to-fx.py, the bubbles
// cut and made smaller, the entry effects' pictures as their shop icons) with manifest.json (each frame's photo hole,
// each bubble's corners and colours). At start (addVipSet) every piece not added yet is stored like an upload (the
// storage, under a fixed owner that is no account) and written in one transaction with its reward and its vip_set row
// (106). A piece added once is never added again, even when staff delete or change it in the panel later. Without the
// storage (a test server without S3) nothing is added and the next start tries again; VIP_SET=0 turns it off (the
// tests, but test/vip-set.test.mjs).
//
// Older APKs: they draw nothing for an admin's item (shop-items.mjs), so these show on the new app only; the reward
// still goes to their bag.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { db, env, tx } from './core.mjs';
import { mp4Duration } from './fx.mjs';
import { forgetLevelRewards } from './level-rewards.mjs';
import { storageOn, writeStored } from './media.mjs';
import { PLATE_DEFAULT, kickMeasure, plateOf, refreshShopItems } from './shop-items.mjs';

export const VIP_SET_DIR = path.join(import.meta.dirname, 'vip-set');
export const VIP_SET_LEVELS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
/** The storage folder's owner part (kind/<owner>/<name>): no account's id. */
const OWNER = '00000000-0000-4000-8000-0000000000a1';
/** Not sold (enabled false); the price staff see if they ever put one on the shelf. */
const PRICE = 1_000_000;
/** After the shop's own items of the kind, level by level. */
const SORT_FROM = 100_000;
const KINDS = Object.freeze({
  frame: { prefix: 'sf', name: (n) => `VIP ${n} Çerçevesi` },
  bubble: { prefix: 'sb', name: (n) => `VIP ${n} Balonu` },
  entry: { prefix: 'se', name: (n) => `VIP ${n} Girişi` },
});
/** The item's id: the admins' own form (s<kind letter> and a number), far past the numbers the panel gives. */
export const vipSetId = (kind, n) => `${KINDS[kind].prefix}${900_000 + n}`;
/** The entering person's name over the clip: high on it, above the emblem, on a soft dark band. */
const PLATE = Object.freeze({ ...PLATE_DEFAULT, y: 0.3, size: 0.04, back: { color: '#000000', alpha: 0.35 }, anim: 'fade' });

const manifest = () => JSON.parse(fs.readFileSync(path.join(VIP_SET_DIR, 'manifest.json'), 'utf8'));
const file = (name) => fs.readFileSync(path.join(VIP_SET_DIR, name));
const sha = (buf, n = 12) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, n);

/** Stores one file (its content's hash in its name, so a rerun writes the same key) and answers its address. */
async function put(kind, name, buf, type) {
  const ext = path.extname(name);
  return writeStored(`${kind}/${OWNER}/vip-${path.basename(name, ext)}-${sha(buf, 8)}${ext}`, buf, type);
}

/** The shop row's columns for one piece, its files stored. */
async function rowOf(kind, n, m) {
  if (kind === 'frame') {
    const still = file(`frame-${n}.png`);
    const motion = file(`frame-${n}.webp`);
    const f = m.frames[n];
    return {
      art_url: await put('shopframe', `frame-${n}.png`, still, 'image/png'),
      art_px: still.readUInt32BE(16),
      hole: f.hole,
      hole_x: f.at?.x ?? null,
      hole_y: f.at?.y ?? null,
      motion_url: await put('shopframe', `frame-${n}.webp`, motion, 'image/webp'),
      motion_px: 320,
      motion_bytes: motion.length,
    };
  }
  if (kind === 'bubble') {
    const pic = file(`bubble-${n}.png`);
    const b = m.bubbles[n];
    return {
      art_url: await put('shopframe', `bubble-${n}.png`, pic, 'image/png'),
      art_px: b.w,
      look: JSON.stringify({ colors: b.colors, text: '#FFFFFF', slice: { w: b.w, h: b.h, ...b.slice } }),
    };
  }
  const video = file(`entry-${n}.mp4`);
  const icon = file(`entry-icon-${n}.webp`);
  const ms = mp4Duration(video);
  if (!ms) throw new Error(`vip set: entry-${n}.mp4 unreadable`);
  return {
    video_url: await put('giftvideo', `entry-${n}.mp4`, video, 'video/mp4'),
    video_bytes: video.length,
    video_ms: ms,
    video_v: sha(video),
    plate: JSON.stringify(plateOf(PLATE)),
    icon_url: await put('shopframe', `entry-icon-${n}.webp`, icon, 'image/webp'),
    icon_px: 384,
  };
}

/** Adds one piece (its item, its reward and its vip_set row together); false when another start took it first. */
async function addOne(kind, n, m) {
  const slot = `${kind}-${n}`;
  const id = vipSetId(kind, n);
  const cols = { id, kind, name: KINDS[kind].name(n), price: PRICE, days: 0, min_vip: n, enabled: false, sort: SORT_FROM + n, ...(await rowOf(kind, n, m)) };
  return tx(async (c) => {
    const mine = await c.query('INSERT INTO vip_set (slot, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING slot', [slot, id]);
    if (!mine.rowCount) return false;
    const keys = Object.keys(cols);
    await c.query(`INSERT INTO shop_items (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(cols));
    const rule = await c.query(
      "INSERT INTO level_rewards (system, level, sku, days) VALUES ('vip', $1, $2, NULL) ON CONFLICT DO NOTHING RETURNING id",
      [n, id],
    );
    await c.query('UPDATE vip_set SET rule_id = $2 WHERE slot = $1', [slot, rule.rows[0]?.id ?? null]);
    await c.query("INSERT INTO audit_events (actor, action, target, detail) VALUES (NULL, 'vip_set.add', NULL, $1)", [
      JSON.stringify({ slot, item: id, kind, level: n, rule: rule.rows[0] ? Number(rule.rows[0].id) : null }),
    ]);
    return true;
  });
}

let running = null;
/**
 * Adds every piece of the set not added yet. Answers { added, skipped }: `skipped` when there is no storage. A piece
 * that fails (its name taken by an item staff made, the storage down) is logged and tried again at the next start.
 */
export function addVipSet() {
  running ??= (async () => {
    if (env.VIP_SET === '0' || !storageOn()) return { added: 0, skipped: true };
    const done = new Set((await db.query('SELECT slot FROM vip_set')).rows.map((r) => r.slot));
    const m = manifest();
    let added = 0;
    for (const n of VIP_SET_LEVELS) {
      for (const kind of Object.keys(KINDS)) {
        if (done.has(`${kind}-${n}`)) continue;
        try {
          if (await addOne(kind, n, m)) added++;
        } catch (e) {
          console.error('vip set', `${kind}-${n}`, String(e?.message ?? e).slice(0, 200));
        }
      }
    }
    if (added) {
      await refreshShopItems();
      forgetLevelRewards();
      // The frames' drawn part is measured in the background (tools/frame-reach.py), as for the panel's frames.
      kickMeasure();
      console.log(`vip set: ${added} pieces added`);
    }
    return { added, skipped: false };
  })().finally(() => {
    running = null;
  });
  return running;
}
