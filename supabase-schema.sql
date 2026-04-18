-- TypeRead Employer Screening Schema
-- Run this in the Supabase SQL Editor (supabase.com/dashboard/project/dvilcfnfznoyodkxgzvp/sql)

-- 1. Create tables
CREATE TABLE employers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name text NOT NULL,
  email text NOT NULL,
  domain text NOT NULL,
  ideal_type text,
  greenhouse_api_key text,
  greenhouse_enabled boolean DEFAULT false,
  greenhouse_webhook_secret text,
  greenhouse_user_id text,
  send_rejection_suggestions boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE job_postings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid REFERENCES employers(id) ON DELETE CASCADE NOT NULL,
  job_title text NOT NULL,
  job_slug text NOT NULL,
  ideal_type text,
  assessment_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE assessments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employer_id uuid REFERENCES employers(id),
  job_posting_id uuid REFERENCES job_postings(id),
  candidate_email text NOT NULL,
  candidate_user_id uuid REFERENCES auth.users(id),
  mbti_type text,
  match_score integer,
  confidence_score integer,
  axis_ie text,
  axis_ns text,
  axis_tf text,
  axis_jp text,
  consent boolean DEFAULT false,
  greenhouse_candidate_id text,
  greenhouse_application_id text,
  pushed_to_greenhouse boolean DEFAULT false,
  pushed_at timestamptz,
  hired boolean DEFAULT false,
  completed_at timestamptz DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE employers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Employers: users can read/write their own record
CREATE POLICY "employers_select_own" ON employers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "employers_insert_own" ON employers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "employers_update_own" ON employers FOR UPDATE USING (auth.uid() = user_id);

-- Job postings: employers can CRUD their own postings
CREATE POLICY "job_postings_select_own" ON job_postings FOR SELECT
  USING (employer_id IN (SELECT id FROM employers WHERE user_id = auth.uid()));
CREATE POLICY "job_postings_insert_own" ON job_postings FOR INSERT
  WITH CHECK (employer_id IN (SELECT id FROM employers WHERE user_id = auth.uid()));
CREATE POLICY "job_postings_update_own" ON job_postings FOR UPDATE
  USING (employer_id IN (SELECT id FROM employers WHERE user_id = auth.uid()));
CREATE POLICY "job_postings_delete_own" ON job_postings FOR DELETE
  USING (employer_id IN (SELECT id FROM employers WHERE user_id = auth.uid()));

-- Assessments: employers can READ assessments for their job postings
-- (INSERTs are done by the service role key in the Netlify function, which bypasses RLS)
CREATE POLICY "assessments_select_employer" ON assessments FOR SELECT
  USING (employer_id IN (SELECT id FROM employers WHERE user_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════════
-- MIGRATION: If tables already exist, run these ALTER statements instead:
-- ════════════════════════════════════════════════════════════════════
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS ideal_type text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS greenhouse_api_key text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS greenhouse_enabled boolean DEFAULT false;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS greenhouse_webhook_secret text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS greenhouse_user_id text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS send_rejection_suggestions boolean DEFAULT true;
--
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS greenhouse_candidate_id text;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS greenhouse_application_id text;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pushed_to_greenhouse boolean DEFAULT false;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS hired boolean DEFAULT false;
--
-- ════════════════════════════════════════════════════════════════════
-- LEVER MIGRATION: Run these to add Lever ATS support:
-- ════════════════════════════════════════════════════════════════════
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS lever_api_key text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS lever_enabled boolean DEFAULT false;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS lever_webhook_token text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS lever_send_rejection_suggestions boolean DEFAULT true;
--
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS lever_candidate_id text;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS lever_opportunity_id text;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pushed_to_lever boolean DEFAULT false;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS lever_pushed_at timestamptz;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS lever_hired boolean DEFAULT false;
--
-- ════════════════════════════════════════════════════════════════════
-- WORKDAY MIGRATION: Run these to add Workday ATS support:
-- ════════════════════════════════════════════════════════════════════
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS workday_tenant_url text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS workday_tenant_name text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS workday_client_id text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS workday_client_secret text;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS workday_enabled boolean DEFAULT false;
-- ALTER TABLE employers ADD COLUMN IF NOT EXISTS workday_send_rejection_suggestions boolean DEFAULT true;
--
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS workday_candidate_id text;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pushed_to_workday boolean DEFAULT false;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS workday_pushed_at timestamptz;
-- ALTER TABLE assessments ADD COLUMN IF NOT EXISTS workday_hired boolean DEFAULT false;

-- ════════════════════════════════════════════════════════════════════
-- PAYWALL MIGRATION: Run these to add Stripe-based credit paywall:
-- ════════════════════════════════════════════════════════════════════
-- Credit units: 1 credit = 1 micro-cent of API cost ($0.00001).
-- Subscription = 300,000 credits ($3 API spend at 3:1 markup = $9/month).
-- Run this block in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  monthly_allocation bigint NOT NULL DEFAULT 0,
  last_allocation_date timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_credits_select_own" ON user_credits;
CREATE POLICY "user_credits_select_own" ON user_credits FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  type text NOT NULL CHECK (type IN ('allocation', 'usage', 'topup', 'rollover', 'refund')),
  description text,
  stripe_event_id text UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id, created_at DESC);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_transactions_select_own" ON credit_transactions;
CREATE POLICY "credit_transactions_select_own" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════
-- NEVER HAVE I EVER: Run to add the polling feature
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nhie_statements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  statement text NOT NULL,
  active boolean DEFAULT true,
  display_order integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nhie_votes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_id uuid REFERENCES nhie_statements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  answer text NOT NULL CHECK (answer IN ('i_have', 'i_never_have')),
  user_type text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(statement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_nhie_votes_statement ON nhie_votes(statement_id);
CREATE INDEX IF NOT EXISTS idx_nhie_votes_user ON nhie_votes(user_id);

ALTER TABLE nhie_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhie_votes ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read active statements
DROP POLICY IF EXISTS "nhie_statements_select_active" ON nhie_statements;
CREATE POLICY "nhie_statements_select_active" ON nhie_statements FOR SELECT USING (active = true);

-- Users may insert their own votes only. No updates, no deletes.
DROP POLICY IF EXISTS "nhie_votes_insert_own" ON nhie_votes;
CREATE POLICY "nhie_votes_insert_own" ON nhie_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users may read only their own vote rows (for "your answer" display).
-- Aggregated results are fetched server-side via the service role, never exposing individual votes.
DROP POLICY IF EXISTS "nhie_votes_select_own" ON nhie_votes;
CREATE POLICY "nhie_votes_select_own" ON nhie_votes FOR SELECT USING (auth.uid() = user_id);

-- SECURITY DEFINER aggregation function: callable by anyone, returns counts by type/answer.
-- Because it's SECURITY DEFINER it sees all rows, but only returns aggregates (no user_ids).
CREATE OR REPLACE FUNCTION nhie_aggregate(p_statement_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  statement_id uuid,
  user_type text,
  answer text,
  vote_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.statement_id, v.user_type, v.answer, count(*)::bigint AS vote_count
  FROM nhie_votes v
  WHERE p_statement_ids IS NULL OR v.statement_id = ANY(p_statement_ids)
  GROUP BY v.statement_id, v.user_type, v.answer;
$$;

GRANT EXECUTE ON FUNCTION nhie_aggregate(uuid[]) TO anon, authenticated;

-- ── Seed the 100 starter statements ────────────────────────────────
INSERT INTO nhie_statements (statement, display_order) VALUES
-- Adventure & Risk
('Never have I ever gone skydiving', 1),
-- #2 bungee jumped removed 2026-04-18 (duplicate of skydiving)
('Never have I ever traveled to another country alone', 3),
-- #4 hitchhiked removed 2026-04-18 (overlap with travel alone)
('Never have I ever swum in the ocean at night', 5),
('Never have I ever eaten something I couldn''t identify', 6),
('Never have I ever gone scuba diving', 7),
('Never have I ever driven over 120 mph', 8),
('Never have I ever snuck into somewhere I wasn''t supposed to be', 9),
-- #10 camping alone removed 2026-04-18 (overlap with travel alone)
-- Social & Relationships
('Never have I ever ghosted someone', 11),
('Never have I ever been ghosted', 12),
('Never have I ever said ''I love you'' first', 13),
('Never have I ever stayed friends with an ex', 14),
('Never have I ever gone on a date with someone I met online', 15),
('Never have I ever lied to get out of plans', 16),
('Never have I ever pretended to like someone''s cooking', 17),
('Never have I ever forgotten someone''s name right after they told me', 18),
-- #19 faked sick removed 2026-04-18 (overlap with #16 lied to get out of plans)
('Never have I ever had a friend breakup that hurt more than a romantic one', 20),
-- Emotions & Inner Life
('Never have I ever cried in public', 21),
-- #22 cried during movie removed 2026-04-18 (overlap with #21 cried in public)
('Never have I ever journaled regularly', 23),
('Never have I ever gone to therapy', 24),
('Never have I ever had a panic attack', 25),
('Never have I ever rehearsed a conversation in my head before having it', 26),
('Never have I ever written a letter I never sent', 27),
('Never have I ever had a dream that changed how I felt about someone', 28),
('Never have I ever overthought a text for more than 10 minutes', 29),
('Never have I ever pretended to be fine when I wasn''t', 30),
-- Career & Ambition
('Never have I ever quit a job without another one lined up', 31),
('Never have I ever started a business', 32),
('Never have I ever cried at work', 33),
('Never have I ever turned down a promotion', 34),
('Never have I ever lied on my resume', 35),
('Never have I ever stayed at a job I hated for more than a year', 36),
('Never have I ever worked a job I was overqualified for', 37),
-- #38 called in sick when not removed 2026-04-18 (overlap with #16)
('Never have I ever taken a pay cut to do something I loved', 39),
('Never have I ever been fired', 40),
-- Habits & Lifestyle
('Never have I ever pulled an all-nighter', 41),
('Never have I ever gone a full day without looking at my phone', 42),
('Never have I ever meditated', 43),
('Never have I ever read a self-help book', 44),
('Never have I ever made a pros and cons list for a personal decision', 45),
('Never have I ever planned a vacation day by day with an itinerary', 46),
('Never have I ever eaten an entire meal standing up', 47),
('Never have I ever fallen asleep in a meeting or class', 48),
('Never have I ever binged an entire TV series in one day', 49),
('Never have I ever forgotten to eat because I was so focused on something', 50),
-- Awkward & Embarrassing
('Never have I ever waved back at someone who wasn''t waving at me', 51),
('Never have I ever sent a text to the wrong person', 52),
('Never have I ever tripped in public and pretended nothing happened', 53),
-- #54 glass door removed 2026-04-18 (overlap with #53 tripped in public)
('Never have I ever called a teacher ''mom'' or ''dad''', 55),
('Never have I ever laughed at something I definitely shouldn''t have', 56),
('Never have I ever accidentally liked an old photo while stalking someone''s profile', 57),
('Never have I ever pretended to be on a phone call to avoid someone', 58),
('Never have I ever worn something inside out in public without realizing', 59),
('Never have I ever replied all to an email by accident', 60),
-- Beliefs & Values
('Never have I ever changed my political views significantly', 61),
('Never have I ever donated to a stranger''s GoFundMe', 62),
('Never have I ever volunteered regularly', 63),
('Never have I ever refused to eat a food for ethical reasons', 64),
('Never have I ever seriously considered moving to another country', 65),
('Never have I ever cut off a family member', 66),
('Never have I ever forgiven someone who never apologized', 67),
('Never have I ever stood up for a stranger', 68),
('Never have I ever broken a rule because I thought it was unjust', 69),
('Never have I ever kept a secret for more than 5 years', 70),
-- Money & Decisions
('Never have I ever made a major purchase on impulse', 71),
('Never have I ever regretted a tattoo', 72),
('Never have I ever lent money to a friend and never gotten it back', 73),
('Never have I ever gambled and won big', 74),
('Never have I ever invested in something I didn''t understand', 75),
('Never have I ever negotiated a salary', 76),
('Never have I ever returned something after using it', 77),
('Never have I ever bought something just because it was on sale', 78),
('Never have I ever split a check down to the cent', 79),
('Never have I ever tipped over 50%', 80),
-- Tech & Modern Life
('Never have I ever used AI to write an email', 81),
('Never have I ever deleted a social media account permanently', 82),
('Never have I ever gone viral online', 83),
('Never have I ever been in a long-distance relationship', 84),
('Never have I ever met an internet friend in real life', 85),
('Never have I ever taken a personality test more than 5 times', 86),
('Never have I ever doom-scrolled for over an hour', 87),
('Never have I ever unfollowed someone because they posted too much', 88),
('Never have I ever used a fake name online', 89),
('Never have I ever had a phone die at the worst possible time', 90),
-- Wild Cards
('Never have I ever been arrested', 91),
('Never have I ever broken a bone', 92),
('Never have I ever fainted', 93),
('Never have I ever seen a ghost (or thought I did)', 94),
('Never have I ever been on TV', 95),
('Never have I ever won a contest or competition', 96),
('Never have I ever met someone famous', 97),
('Never have I ever moved to a city where I knew no one', 98),
('Never have I ever said yes to something that terrified me', 99),
('Never have I ever completely reinvented myself', 100)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- CLAUDE INBOX: personal task queue (gated to a single email server-side)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS claude_inbox (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_claude_inbox_user_status ON claude_inbox(user_id, status, created_at DESC);

ALTER TABLE claude_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claude_inbox_select_own" ON claude_inbox;
CREATE POLICY "claude_inbox_select_own" ON claude_inbox FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "claude_inbox_insert_own" ON claude_inbox;
CREATE POLICY "claude_inbox_insert_own" ON claude_inbox FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "claude_inbox_update_own" ON claude_inbox;
CREATE POLICY "claude_inbox_update_own" ON claude_inbox FOR UPDATE USING (auth.uid() = user_id);
