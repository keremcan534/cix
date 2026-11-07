-- Uğurlu hediye rewards are paid as coins (lucky.mjs) on their own channel 'ugurlu': spendable like any coin,
-- but what they pay for never counts for Cömertlik (wheel.mjs wealthPoints), so a reward spent again can't
-- raise a level twice. coin_lots_channel_check is the list 020 set; every channel it had stays.
ALTER TABLE coin_lots DROP CONSTRAINT coin_lots_channel_check;
ALTER TABLE coin_lots ADD CONSTRAINT coin_lots_channel_check CHECK (channel IN
  ('google', 'apple', 'test', 'bonus', 'legacy', 'jeton_noktasi', 'toptan', 'bozdurma', 'cevir', 'kampanya', 'odul', 'ugurlu'));
