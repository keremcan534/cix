-- Asistanlık onayı (owners, 26 Nov 2026): the owner names an assistant with a share; the assistant accepts before it
-- starts (until then no share is written and the code doesn't work). accepted_at null and ended_at null: waiting.
-- Assignments made before this were accepted when they were made.
ALTER TABLE agency_assistants ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
UPDATE agency_assistants SET accepted_at = assigned_at WHERE accepted_at IS NULL;
