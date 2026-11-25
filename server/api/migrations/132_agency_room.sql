-- An agency's own room (owners, 25 Nov 2026; agency-admin.mjs): staff link a room to an agency by the room's ID when
-- they found the agency or later. Odalar shows that room under the agency's name whoever owns it (room-social.mjs);
-- the owner doesn't change. One room belongs to one agency at most.
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id);
CREATE UNIQUE INDEX IF NOT EXISTS agencies_room_once ON agencies (room_id) WHERE room_id IS NOT NULL;
