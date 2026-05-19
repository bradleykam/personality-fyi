#!/usr/bin/env node
/**
 * Generate themed compatibility paragraphs for every pair × mode.
 * 16 × 16 × 3 = 768 entries, saved to /data/compat-texts.json.
 *
 * Hits the public /.netlify/functions/claude proxy so no local API key needed.
 * Saves after every call so interruptions are safe.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'data', 'compat-texts.json');
const ENDPOINT = 'https://personality.fyi/.netlify/functions/claude';

const TYPES = [
  'INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP',
];
const TYPE_NAMES = {
  INTJ:'Architect', INTP:'Logician', ENTJ:'Commander', ENTP:'Debater',
  INFJ:'Advocate', INFP:'Mediator', ENFJ:'Protagonist', ENFP:'Campaigner',
  ISTJ:'Logistician', ISFJ:'Defender', ESTJ:'Executive', ESFJ:'Consul',
  ISTP:'Virtuoso', ISFP:'Adventurer', ESTP:'Entrepreneur', ESFP:'Entertainer',
};
const MODES = {
  romantic:   'in a romantic relationship (dating, living together, long-term partnership)',
  friends:    'as close friends (hanging out, traveling, group dynamics, supporting each other)',
  colleagues: 'working together as colleagues or coworkers (meetings, projects, decisions, collaboration)',
};

function loadExisting() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return {}; }
}
function save(obj) {
  fs.writeFileSync(OUT, JSON.stringify(obj, null, 0));
}

async function fetchOne(t1, t2, mode) {
  const ctx = MODES[mode];
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: `You are TypeRead. Describe the dynamic between two MBTI types ${ctx}. Be brutally honest, specific, and concrete — no hedging, no therapy language. Tailor every observation to the ${mode} context (not generic). Output MUST follow this exact format with these three labels on their own lines, each followed by one short paragraph (30-55 words):\n\nWHERE THEY CLICK:\n<paragraph>\n\nWHERE THEY CLASH:\n<paragraph>\n\nWHAT KILLS IT:\n<paragraph>\n\nNo preamble, no other sections.`,
    messages: [{
      role: 'user',
      content: `Describe the dynamic between a ${t1} (${TYPE_NAMES[t1]}) and a ${t2} (${TYPE_NAMES[t2]}) ${ctx}.`,
    }],
  };
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data.content || !data.content[0]) throw new Error('no content: ' + JSON.stringify(data).slice(0,200));
  return data.content[0].text.trim();
}

async function main() {
  const store = loadExisting();
  const tasks = [];
  for (const t1 of TYPES) for (const t2 of TYPES) for (const mode of Object.keys(MODES)) {
    const key = `${t1}_${t2}_${mode}`;
    if (!store[key]) tasks.push({ t1, t2, mode, key });
  }
  console.log(`To generate: ${tasks.length} (existing: ${Object.keys(store).length})`);

  const CONCURRENCY = 6;
  let idx = 0;
  let done = 0;
  let failed = 0;
  const t0 = Date.now();

  async function worker(id) {
    while (idx < tasks.length) {
      const task = tasks[idx++];
      let attempt = 0;
      while (attempt < 3) {
        try {
          const text = await fetchOne(task.t1, task.t2, task.mode);
          store[task.key] = text;
          done++;
          if (done % 10 === 0) save(store);
          const rate = done / ((Date.now() - t0) / 1000);
          const eta = Math.round((tasks.length - done) / rate);
          process.stdout.write(`\r[${done}/${tasks.length}] ${task.key} ok — ${rate.toFixed(2)}/s — ETA ${eta}s     `);
          break;
        } catch (err) {
          attempt++;
          if (attempt >= 3) { failed++; console.error(`\n${task.key} FAILED: ${err.message}`); break; }
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);
  save(store);
  console.log(`\nDone. total=${Object.keys(store).length} ok=${done} failed=${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
