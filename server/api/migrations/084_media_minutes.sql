-- Voice and video time by kind and day (media-minutes.mjs), for the finance panel's cost estimate: finance-sync.mjs
-- sends each finished day as usage events, priced per person-minute on the panel's Tarifeler page. Seconds are added
-- when a session ends; nobody is in these rows (who was in which room stays in presence_log, as before).
--   room        a person's time in a voice room (oda-…), speaking or listening
--   speaker     a voice room's mic on: a published audio track (LiveKit's track webhooks). A muted mic stays
--               published (LiveKit sends no webhook for a mute), so this is time on a mic, muted or not
--   call_voice  a person's time in a 1v1 voice call or match (call-<id>)
--   call_video  the same for video
CREATE TABLE media_minutes (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('room', 'speaker', 'call_voice', 'call_video')),
  seconds bigint NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  PRIMARY KEY (day, kind)
);

-- Voice room mics on now; a row goes (into media_minutes) when its track, its person's connection or its room ends.
CREATE TABLE voice_tracks (
  track text PRIMARY KEY CHECK (char_length(track) <= 64),
  room text NOT NULL CHECK (char_length(room) <= 64),
  identity text NOT NULL CHECK (char_length(identity) <= 64),
  sid text NOT NULL DEFAULT '' CHECK (char_length(sid) <= 64),
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_tracks_room ON voice_tracks (room, identity);

-- The last day whose minutes the panel has (finance-sync.mjs); measuring starts today, so yesterday is the first
-- "done" day. usage_error: the panel's last refusal of a day (say the provider isn't defined there yet).
ALTER TABLE finance_sync ADD COLUMN usage_day date, ADD COLUMN usage_error text;
UPDATE finance_sync SET usage_day = (now() AT TIME ZONE 'Europe/Istanbul')::date - 1 WHERE id = 1;
