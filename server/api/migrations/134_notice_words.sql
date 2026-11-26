-- "Alt ajans / Üst ajans" out of every screen (owners, 26 Nov 2026): the agencies' notices already written say
-- "referans ajans" and "referans veren ajans" too (new ones are written so in agency-ops / agency-perf / agency.mjs).
UPDATE agency_notices
   SET title = replace(replace(replace(replace(title, 'alt ajans', 'referans ajans'), 'Alt ajans', 'Referans ajans'), 'üst ajans', 'referans veren ajans'), 'Üst ajans', 'Referans veren ajans'),
       body = replace(replace(replace(replace(body, 'alt ajans', 'referans ajans'), 'Alt ajans', 'Referans ajans'), 'üst ajans', 'referans veren ajans'), 'Üst ajans', 'Referans veren ajans')
 WHERE title ~* '(alt|üst) ajans' OR body ~* '(alt|üst) ajans';
