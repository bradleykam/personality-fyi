-- ═════════════════════════════════════════════════════════════════════
-- NHIE question bank v2 — drop low-signal items, add differentiating ones.
-- Low-signal = most types answer yes-or-no at roughly the same rate.
-- Replacements are written to produce a clear skew on one or more axes.
-- Run in Supabase SQL editor.
-- ═════════════════════════════════════════════════════════════════════

-- 1) Deactivate the generic ones (universal or circumstantial, not type-driven).
--    Keep them in the table for historical votes; just stop serving them.
UPDATE nhie_statements SET active = false WHERE display_order IN (
  5,   -- swum in the ocean at night (weak)
  6,   -- eaten something I couldn''t identify (circumstantial)
  9,   -- snuck into somewhere (nearly universal)
  14,  -- stayed friends with an ex (circumstantial)
  15,  -- date with someone met online (generational, not type)
  16,  -- lied to get out of plans (universal)
  18,  -- forgotten someone''s name (universal)
  20,  -- friend breakup hurt more than romantic (circumstantial)
  35,  -- lied on resume (rare across all types)
  37,  -- worked a job I was overqualified for (universal)
  40,  -- been fired (circumstantial)
  47,  -- eaten an entire meal standing up (universal)
  52,  -- sent text to wrong person (universal)
  55,  -- called teacher ''mom'' (universal childhood moment)
  56,  -- laughed at something I shouldn''t have (universal)
  57,  -- accidentally liked old photo (universal)
  59,  -- worn something inside out (universal)
  60,  -- replied all by accident (universal)
  73,  -- lent money never got back (universal-ish)
  74,  -- gambled and won big (rare across types)
  77,  -- returned something after using (weak)
  78,  -- bought something on sale (universal)
  83,  -- gone viral online (rare)
  84,  -- long-distance relationship (circumstantial)
  87,  -- doom-scrolled over hour (universal)
  88,  -- unfollowed someone for posting too much (universal)
  90,  -- phone died at worst time (universal)
  91,  -- been arrested (rare across types)
  92,  -- broken a bone (rare, no type signal)
  93,  -- fainted (rare, no type signal)
  95,  -- been on TV (rare)
  96,  -- won a contest (too broad)
  97   -- met someone famous (circumstantial)
);

-- 2) Insert 30 stronger, differentiating statements.
--    Each one is written so 2-4 specific types will clearly skew one way.
INSERT INTO nhie_statements (statement, display_order) VALUES

-- ── J/P axis (planning, closure, structure) ──────────────────────────
('Never have I ever made a spreadsheet to help with a personal decision', 101),
-- ^^ strong TJ; xNTJ and xSTJ lean yes, xNxP lean no

('Never have I ever made a 5-year plan and actually stuck to it', 102),
-- ^^ strong NTJ/STJ yes, xNxP/xSxP no

('Never have I ever had a plan A, B, and C for a single social outing', 103),
-- ^^ strong xNJ yes, xxxP no

('Never have I ever started a project, abandoned it, and bought supplies for a new one', 104),
-- ^^ strong ENP/ENFP/ENTP yes, xxxJ no

('Never have I ever re-planned a trip while already on it', 105),
-- ^^ strong xxxP yes, xxxJ no (strong signal)

('Never have I ever finished a book the same day I started it', 106),
-- ^^ Introverts + NF/NT yes, xSxP split

-- ── T/F axis (logic vs values in decisions) ──────────────────────────
('Never have I ever ended a friendship because the other person''s values changed', 107),
-- ^^ strong xxTJ yes, xxFx lean no

('Never have I ever cried over a fictional character dying', 108),
-- ^^ strong xNFx yes, xxTJ lean no

('Never have I ever argued a position I didn''t actually believe, just for fun', 109),
-- ^^ strong ENTP / xNTP yes, xxFJ lean no

('Never have I ever felt guilty saying no to a reasonable request', 110),
-- ^^ strong xSFJ / xNFJ yes, xxTx lean no

('Never have I ever told someone a hard truth they weren''t ready to hear', 111),
-- ^^ strong xNTJ / xxTJ yes, xxFx lean no

('Never have I ever changed a deeply-held opinion because of a single well-made argument', 112),
-- ^^ strong xNTP / INTP yes, xSFJ lean no

-- ── I/E axis (energy, social default) ────────────────────────────────
('Never have I ever pretended to be on a phone call to skip a conversation at a party', 113),
-- ^^ strong I yes, E no (extends #58 with more specificity)

('Never have I ever felt physically drained after a social event I actually enjoyed', 114),
-- ^^ strong I yes, E lean no

('Never have I ever struck up a conversation with a stranger in line for fun', 115),
-- ^^ strong E yes, I lean no

('Never have I ever left a group chat because it was too active', 116),
-- ^^ strong I yes, E lean no

('Never have I ever organized an event with 10+ people from scratch', 117),
-- ^^ strong xxxJ / EJ yes, xxxP / I lean no

-- ── N/S axis (abstract vs concrete) ──────────────────────────────────
('Never have I ever spent an hour reading about something I will never use', 118),
-- ^^ strong xNxP / NT yes, xSxJ lean no

('Never have I ever zoned out mid-conversation thinking about an unrelated idea', 119),
-- ^^ strong xNxP yes, xSxJ lean no

('Never have I ever re-read a book or watched a movie just to catch things I missed', 120),
-- ^^ strong xNxx yes, xSxx lean no

('Never have I ever picked a hotel or restaurant based almost entirely on the vibe', 121),
-- ^^ strong xSFP yes, xxTJ lean no

('Never have I ever ignored a how-to guide and figured something out by poking at it', 122),
-- ^^ strong xxTP / ISTP / INTP yes, xxxJ lean no

-- ── Mixed / shadow / specific type bait ──────────────────────────────
('Never have I ever built something from scratch just for the satisfaction of building it', 123),
-- ^^ strong INTJ / ISTP / NT makers yes

('Never have I ever had someone call me their therapist', 124),
-- ^^ strong INFJ / ENFJ / xNFx yes

('Never have I ever been told I''m ''intimidating'' when I thought I was being normal', 125),
-- ^^ strong INTJ / ENTJ / ISTJ yes

('Never have I ever felt a room''s mood shift the moment someone walked in', 126),
-- ^^ strong INFJ / xNFx yes, xxTx lean no

('Never have I ever cut someone off mid-sentence because I already knew where it was going', 127),
-- ^^ strong ENTJ / ENTP yes, xxFJ no

('Never have I ever walked out of a job on principle', 128),
-- ^^ strong INFP / ENFP / INTJ yes, xSFJ no

('Never have I ever stayed in a conversation I wanted to leave just to avoid being rude', 129),
-- ^^ strong xSFJ / ISFJ / ESFJ yes, xxTx no

('Never have I ever written something creative (story, poem, song) that nobody else has read', 130)
-- ^^ strong INFP / INFJ / NF yes, xSTx lean no

ON CONFLICT DO NOTHING;
