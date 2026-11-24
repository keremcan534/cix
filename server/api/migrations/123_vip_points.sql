-- VIP puanları (owners, 24 Nov 2026): VIP 1 at 25.000 points … VIP 10 at 20.000.000 (catalog.mjs SVIP_XP, 1 loaded
-- coin = 1 point). A VIP table the panel saved (level_settings 'vip') keeps its names, perks and level drop and takes
-- the new points; its rev grows so the phones read it again. A saved table of another shape is left as it is.
UPDATE level_settings s
   SET doc = jsonb_set(s.doc, '{levels}', (
         SELECT jsonb_agg(jsonb_set(l.value, '{points}', to_jsonb(v.points)) ORDER BY l.ord)
           FROM jsonb_array_elements(s.doc->'levels') WITH ORDINALITY AS l(value, ord)
           JOIN (VALUES (1, 25000), (2, 62500), (3, 125000), (4, 200000), (5, 375000), (6, 750000),
                        (7, 2000000), (8, 5000000), (9, 10500000), (10, 20000000)) AS v(lvl, points)
             ON (l.value->>'level')::int = v.lvl)),
       rev = nextval('level_settings_rev'),
       updated_at = now()
 WHERE s.system = 'vip'
   AND jsonb_typeof(s.doc->'levels') = 'array'
   AND jsonb_array_length(s.doc->'levels') = 10
   AND (SELECT count(*) FROM jsonb_array_elements(s.doc->'levels') l WHERE (l->>'level') ~ '^([1-9]|10)$') = 10;
