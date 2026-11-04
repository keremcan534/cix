-- The conversation list reads a person's messages by sender and by recipient; without these it scanned the
-- whole table.
CREATE INDEX messages_sender ON messages (sender, id DESC);
CREATE INDEX messages_recipient ON messages (recipient, id DESC);

-- A report counted once only while it is open: after staff handle it, the same person can report the same
-- thing again (a new offence), and it lands in the queue instead of being dropped.
ALTER TABLE reports DROP CONSTRAINT reports_reporter_target_type_target_id_key;
CREATE UNIQUE INDEX reports_open_once ON reports (reporter, target_type, target_id) WHERE status = 'open';
