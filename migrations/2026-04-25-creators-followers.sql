-- Add follower email + user link to creator_referrals.
ALTER TABLE creator_referrals ADD COLUMN IF NOT EXISTS follower_email text;
ALTER TABLE creator_referrals ADD COLUMN IF NOT EXISTS follower_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_creator_referrals_email ON creator_referrals(follower_email);
CREATE INDEX IF NOT EXISTS idx_creator_referrals_user ON creator_referrals(follower_user_id);

-- Tighten access on the new columns: creators see aggregate types only — never email/user_id.
REVOKE SELECT (follower_email, follower_user_id) ON creator_referrals FROM anon, authenticated;
