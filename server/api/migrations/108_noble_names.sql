-- Rütbe's new tier names (21 Nov 2026, the owners' sample screens): Şövalye, Vikont, Kont, Markiz, Dük instead of
-- Çavuş, Yüzbaşı, Binbaşı, Albay, Paşa. A Seviye ayarları document saved in the panel keeps its names; here a tier
-- still named as the app named it before takes the new name (one staff renamed themselves keeps theirs). The rev moves,
-- so phones read the catalog again. Only the noble row, only these five names.
UPDATE level_settings
   SET doc = jsonb_set(
         doc,
         '{levels}',
         (SELECT jsonb_agg(
                   CASE l->>'name'
                     WHEN 'Çavuş' THEN jsonb_set(l, '{name}', '"Şövalye"')
                     WHEN 'Yüzbaşı' THEN jsonb_set(l, '{name}', '"Vikont"')
                     WHEN 'Binbaşı' THEN jsonb_set(l, '{name}', '"Kont"')
                     WHEN 'Albay' THEN jsonb_set(l, '{name}', '"Markiz"')
                     WHEN 'Paşa' THEN jsonb_set(l, '{name}', '"Dük"')
                     ELSE l
                   END
                   ORDER BY ord)
            FROM jsonb_array_elements(doc->'levels') WITH ORDINALITY AS t(l, ord))),
       rev = nextval('level_settings_rev'),
       updated_at = now()
 WHERE system = 'noble'
   AND jsonb_typeof(doc->'levels') = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(doc->'levels') l WHERE l->>'name' IN ('Çavuş', 'Yüzbaşı', 'Binbaşı', 'Albay', 'Paşa'));
