-- Güncelleme 5, madde 1 (pk.mjs): a room's PK starts with any number of people on the mics, and whoever takes a mic
-- while it runs joins it (Normal PK: one more competitor; Takım PK: the team with fewer people). left_out: in Takım
-- PK, the people on a mic at the start whom the starter left out of both teams (not picked in a manual split, or past
-- the teams' size); they stay out of that PK. Safe to run again.
ALTER TABLE room_pks ADD COLUMN IF NOT EXISTS left_out uuid[] NOT NULL DEFAULT '{}';
