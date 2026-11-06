-- Contact filter, automatic mute (sanctions.mjs contactStrike): AUTO_MUTE_REFUSALS refusals (default 5) inside
-- AUTO_MUTE_WINDOW minutes (default 60) start a text mute covering DMs for AUTO_MUTE_MINUTES (default 60). It is
-- an ordinary sanction (user_sanctions, source 'auto', created by the system) with this reason, so the person
-- sees why and for how long, can appeal it, and staff can lift it like any other. Its note says how many tries,
-- never what was written. Only the system gives this reason (sanctions.mjs SYSTEM_REASONS): staff and room staff
-- can't pick it, so "Otomatik: …" is never shown for a mute a person gave. Safe to run again.
INSERT INTO sanction_reasons (code, title, public_text, sort) VALUES
  ('contact_sharing', 'İletişim bilgisi paylaşma', 'Otomatik: iletişim bilgisi paylaşma denemesi', 16)
ON CONFLICT (code) DO NOTHING;
