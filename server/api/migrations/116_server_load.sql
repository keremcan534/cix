-- The machine's own load, one row a minute (server-load.mjs), for the finance panel's Sunucu kapasitesi page: what
-- Oracle measures (processor, memory, the traffic going out to the internet, which Oracle bills past 10 TB a month)
-- read from the machine itself, beside how many were in voice and how many were speaking. Kept 40 days.
CREATE TABLE server_load (
  at timestamptz PRIMARY KEY DEFAULT date_trunc('minute', now()),
  cpu real NOT NULL,          -- % of the whole machine (all cores) busy over the minute
  mem real NOT NULL,          -- % of memory in use
  tx_bytes bigint NOT NULL,   -- bytes sent out over the minute (all interfaces but loopback)
  rx_bytes bigint NOT NULL,
  voice int NOT NULL,         -- people in voice rooms and calls (LiveKit's count, else room_presence)
  speakers int NOT NULL,      -- mics published in voice rooms (voice_tracks)
  rooms int NOT NULL,         -- open voice rooms with someone in them
  cores int NOT NULL,
  mem_gb real NOT NULL
);
