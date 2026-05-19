#!/usr/bin/env node
/* Strip seniority modifiers from job titles in jobs_tech.json + ROLE_DESCS in index.html.
 * Preserve managerial-vs-IC distinctions (Director, VP, Head of, Manager, Chief, etc.).
 * Dedup entries that collapse to the same (title, company).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Words that DON'T meaningfully change the personality fit — strip them.
const DROP_PREFIX = [
  'senior', 'sr.?', 'staff', 'principal', 'junior', 'jr.?', 'lead', 'leading',
  'associate', 'entry[- ]?level', 'apprentice', 'intermediate', 'experienced'
];
// Trailing seniority levels: I, II, III, IV, V, 2, 3, 4, 5, with optional period
const TRAIL_LEVEL = /\s*(?:[\u2013-]\s*)?(?:level\s+)?(?:i{1,3}|iv|v|2|3|4|5)\.?$/i;
// Parenthetical seniority
const PAREN_SENIORITY = /\s*\((?:senior|sr\.?|staff|principal|junior|jr\.?|lead|associate|entry[- ]?level|i{1,3}|iv|v|2|3|4|5|level\s+\w+)\)\s*/gi;

const PREFIX_RE = new RegExp('^\\s*(?:' + DROP_PREFIX.join('|') + ')\\s+', 'i');

function cleanTitle(raw) {
  if (!raw) return raw;
  let s = String(raw).trim();
  // Strip parenthetical seniority anywhere in the string
  s = s.replace(PAREN_SENIORITY, ' ');
  // Strip trailing level (II, III, etc.)
  s = s.replace(TRAIL_LEVEL, '');
  // Iteratively strip leading seniority words ("Senior Lead Engineer" → "Engineer")
  let prev;
  do { prev = s; s = s.replace(PREFIX_RE, ''); } while (s !== prev);
  // Collapse whitespace, trim trailing punctuation
  s = s.replace(/\s+/g, ' ').replace(/[\s,;\-\u2013]+$/, '').trim();
  return s;
}

// --- 1. jobs_tech.json -----------------------------------------------
const jobsPath = path.join(ROOT, 'jobs_tech.json');
const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
console.log('jobs_tech: starting with', jobs.length, 'entries');

const seen = new Set();
const cleaned = [];
let titleChanged = 0;
for (const j of jobs) {
  const orig = j.t || '';
  const newT = cleanTitle(orig) || orig;
  if (newT !== orig) titleChanged++;
  const dedupKey = (newT.toLowerCase() + '||' + (j.c || '').toLowerCase());
  if (seen.has(dedupKey)) continue; // drop duplicate
  seen.add(dedupKey);
  cleaned.push({ ...j, t: newT });
}
console.log('jobs_tech: cleaned', cleaned.length, 'unique entries (titles renamed:', titleChanged + ', removed dupes:', jobs.length - cleaned.length + ')');
fs.writeFileSync(jobsPath, JSON.stringify(cleaned));

// --- 2. ROLE_DESCS in index.html ------------------------------------
const idxPath = path.join(ROOT, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');
const block = html.match(/var ROLE_DESCS = \{([\s\S]*?)\n\};/);
if (!block) {
  console.warn('ROLE_DESCS block not found, skipping');
  process.exit(0);
}

// Parse rows; rebuild after dropping seniority duplicates.
const rowRe = /^\s*'([^']+)':\s*('([^']*)'|"([^"]*)"),?\s*$/gm;
const rows = [];
let m;
while ((m = rowRe.exec(block[1])) !== null) rows.push({ key: m[1], desc: m[3] || m[4] });

const kept = new Map(); // canonical-title -> desc
for (const r of rows) {
  const canon = cleanTitle(r.key).toLowerCase();
  if (!kept.has(canon)) kept.set(canon, r.desc);
}
// Output: ordered alphabetically for stability
const newBlock = Array.from(kept.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([k, v]) => `  '${k}': '${v.replace(/'/g, "\\'")}'`).join(',\n');

const newSrc = 'var ROLE_DESCS = {\n' + newBlock + '\n};';
html = html.replace(/var ROLE_DESCS = \{[\s\S]*?\n\};/, newSrc);
fs.writeFileSync(idxPath, html);
console.log('ROLE_DESCS:', rows.length, '->', kept.size, 'entries');
