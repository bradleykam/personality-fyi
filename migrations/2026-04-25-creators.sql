-- ════════════════════════════════════════════════════════════════════
-- Creator affiliate program
-- Run once in Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS creators (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  email text NOT NULL,
  website_url text,
  last_digest_sent_at timestamptz,
  first_digest_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creators_user ON creators(user_id);
CREATE INDEX IF NOT EXISTS idx_creators_slug ON creators(slug);

CREATE TABLE IF NOT EXISTS creator_referrals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES creators(id) ON DELETE CASCADE NOT NULL,
  session_id text NOT NULL,
  consented boolean DEFAULT false,
  mbti_type text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_session ON creator_referrals(creator_id, session_id);
CREATE INDEX IF NOT EXISTS idx_creator_ref_creator ON creator_referrals(creator_id);

-- Optional queue for digest emails when the SMTP/Resend provider isn't wired up yet.
CREATE TABLE IF NOT EXISTS creator_digests_pending (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES creators(id) ON DELETE CASCADE NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

-- ── Row Level Security ─────────────────────────────────────────────
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_digests_pending ENABLE ROW LEVEL SECURITY;

-- Creator can read & update their own creator row
DROP POLICY IF EXISTS "creators_select_own" ON creators;
CREATE POLICY "creators_select_own" ON creators FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "creators_insert_own" ON creators;
CREATE POLICY "creators_insert_own" ON creators FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "creators_update_own" ON creators;
CREATE POLICY "creators_update_own" ON creators FOR UPDATE USING (auth.uid() = user_id);

-- Public can resolve display_name + slug from anonymous landing pages.
-- Service role uses SUPABASE_SERVICE_ROLE_KEY in functions and bypasses RLS,
-- but we still expose a tiny SELECT for slug→display_name lookups.
DROP POLICY IF EXISTS "creators_select_public_meta" ON creators;
CREATE POLICY "creators_select_public_meta" ON creators FOR SELECT USING (true);
-- ^ acceptable because the table holds no PII beyond a user-supplied display name + slug.
--   Email is filtered by the column-level grant below if you'd rather keep it private.

REVOKE SELECT (email, user_id, last_digest_sent_at, first_digest_sent) ON creators FROM anon, authenticated;
GRANT SELECT (id, display_name, slug, website_url, created_at) ON creators TO anon, authenticated;

-- creator_referrals: writes from anyone (anon + authenticated). Reads only by the owning creator.
DROP POLICY IF EXISTS "creator_referrals_insert_anyone" ON creator_referrals;
CREATE POLICY "creator_referrals_insert_anyone" ON creator_referrals FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "creator_referrals_select_owner" ON creator_referrals;
CREATE POLICY "creator_referrals_select_owner" ON creator_referrals FOR SELECT USING (
  creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
);

-- creator_digests_pending: service-role only. No public access.
DROP POLICY IF EXISTS "creator_digests_pending_owner" ON creator_digests_pending;
CREATE POLICY "creator_digests_pending_owner" ON creator_digests_pending FOR SELECT USING (
  creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
);
