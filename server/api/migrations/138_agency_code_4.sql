-- Ajans kodları 4 hane (owners, 27 Nov 2026): a new agency's and a new assistant's code has 4 characters
-- (agency-lib.mjs AGENCY_CODE_LEN); the codes given before keep their 8. A code of 4 to 10 is allowed.
ALTER TABLE agencies DROP CONSTRAINT IF EXISTS agencies_code_check;
ALTER TABLE agencies ADD CONSTRAINT agencies_code_check CHECK (code ~ '^[A-Z0-9]{4,10}$');
ALTER TABLE agency_assistants DROP CONSTRAINT IF EXISTS agency_assistants_code_check;
ALTER TABLE agency_assistants ADD CONSTRAINT agency_assistants_code_check CHECK (code ~ '^[A-Z0-9]{4,10}$');
