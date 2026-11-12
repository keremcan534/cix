-- Etkinlik Merkezi, Aşama 4 (events.mjs, event-rules.mjs): reminders before an event, each person's choice to have
-- them, and an event shared in a direct message.
--
-- People with a confirmed place are reminded 1 hour and 15 minutes before and when it starts (Canlı ayarlar ›
-- Etkinlikler turns each off for everyone: event_reminders_off). One row per reminder sent: the key holds the
-- event's start, so a restart or two sweeps at once can't send the same one twice, and an event moved to another
-- time is reminded again for its new time.
CREATE TABLE IF NOT EXISTS event_reminders_sent (
  event_id  bigint NOT NULL REFERENCES events(id),
  user_id   uuid NOT NULL REFERENCES users(id),
  kind      text NOT NULL CHECK (kind IN ('hour', 'quarter', 'start')),
  starts_at timestamptz NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id, kind, starts_at)
);
CREATE INDEX IF NOT EXISTS event_reminders_sent_user ON event_reminders_sent (user_id, sent_at DESC);

-- One place's reminders (the event's detail screen): false, none for this event.
ALTER TABLE event_reservations ADD COLUMN IF NOT EXISTS remind boolean NOT NULL DEFAULT true;

-- Someone who turned every event reminder off (Ayarlar › Bildirimler › Etkinlik hatırlatmaları).
CREATE TABLE IF NOT EXISTS event_reminder_optout (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- An event sent to a friend ("Arkadaşına gönder"): new apps draw the message as the event's card, older ones show
-- its text.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS event_id bigint REFERENCES events(id);
