-- Bağlar and blocks (social.mjs POST /api/block, bonds.mjs endBondOnBlock): blocking someone ends an active bond with
-- them (status 'ended', end_reason 'block', ended_by the blocker). Nobody is told (a block is never told to the other person, and the
-- blocker's own notice would name them), and no wait applies before a new bond once they unblock each other. Before,
-- the bond went on: the nightly drop and the "it ends soon" warning named the blocked person in the blocker's
-- SimilarClub Sistem chat and urged a gift the block refuses. The bonds of pairs already in a block end now, as quietly.
ALTER TABLE bonds DROP CONSTRAINT IF EXISTS bonds_end_reason_check;
ALTER TABLE bonds ADD CONSTRAINT bonds_end_reason_check CHECK (end_reason IN ('idle', 'gone', 'refund', 'block'));
UPDATE bonds x SET status = 'ended', ended_at = now(), end_reason = 'block', told_status = 'ended',
       ended_by = (SELECT k.blocker FROM blocks k WHERE (k.blocker = x.a AND k.blocked = x.b) OR (k.blocker = x.b AND k.blocked = x.a)
                    ORDER BY k.created_at LIMIT 1)
 WHERE x.status = 'active'
   AND EXISTS (SELECT 1 FROM blocks k WHERE (k.blocker = x.a AND k.blocked = x.b) OR (k.blocker = x.b AND k.blocked = x.a));
