#!/usr/bin/env node
// Consistency audit for the 60-question personality test.
// Mirrors the scoring + adaptive-skip logic in index.html / assess.html.
// Run: node tools/consistency-audit.js
const fs = require('fs');
const path = require('path');

// ── Extract TEST_QS from index.html so the audit always reflects live content ──
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = src.match(/const TEST_QS = \[([\s\S]*?)\n\];/);
if (!m) { console.error('TEST_QS not found'); process.exit(1); }
const TEST_QS = [];
const rx = /\{q:"[^"]*"\s*,\s*ax:"(\w+)"\s*,\s*yes:"(\w)"\s*,\s*no:"(\w)"\s*\}/g;
let mm;
while ((mm = rx.exec(m[1])) !== null) TEST_QS.push({ ax: mm[1], yes: mm[2], no: mm[3] });
console.log('Loaded', TEST_QS.length, 'questions');

function countByAxis(qs) {
  const a = {};
  qs.forEach(q => { a[q.ax] = (a[q.ax] || 0) + 1; });
  return a;
}
console.log('Axis breakdown:', countByAxis(TEST_QS));

// ── Scoring engine (pure function) ──
// opts.noAdaptive disables early-exit skipping (forces answering all 60 questions).
// This lets us measure the scoring engine in isolation vs. the live adaptive flow.
function runTest(answerFn, opts = {}) {
  // answerFn(q, idx) -> 'yes' | 'no' | 'between' | 'unsure'
  const scores = { I:0, E:0, N:0, S:0, T:0, F:0, J:0, P:0 };
  const answeredByAxis = { I_E:0, N_S:0, T_F:0, J_P:0 };
  const skippedAxis = { I_E:false, N_S:false, T_F:false, J_P:false };
  const consecUnsure = { I_E:0, N_S:0, T_F:0, J_P:0 };
  let answered = 0;

  function remainingForAxis(i, ax) {
    let c = 0;
    for (let j = i; j < TEST_QS.length; j++) if (TEST_QS[j].ax === ax) c++;
    return c;
  }
  function axisDecided(i, ax) {
    if (opts.noAdaptive) return false;
    if (skippedAxis[ax]) return true;
    const [a, b] = ax.split('_');
    const rem = remainingForAxis(i, ax);
    const maxRem = rem * 2;
    const diff = Math.abs(scores[a] - scores[b]);
    if (diff > maxRem) return true;
    if (answeredByAxis[ax] >= 10 && diff >= 16) return true;
    return false;
  }

  for (let i = 0; i < TEST_QS.length; i++) {
    const q = TEST_QS[i];
    if (axisDecided(i, q.ax)) continue;

    const choice = answerFn(q, i);
    if (choice === 'yes') scores[q.yes] += 2;
    else if (choice === 'no') scores[q.no] += 2;

    if (choice === 'unsure') consecUnsure[q.ax] = (consecUnsure[q.ax] || 0) + 1;
    else consecUnsure[q.ax] = 0;

    answeredByAxis[q.ax]++;
    answered++;
  }

  // Compute type + percentages
  const axes = [['I','E'],['N','S'],['T','F'],['J','P']];
  const defaults = ['I','N','T','J'];
  let type = '';
  const pct = {};
  axes.forEach(([a, b], idx) => {
    let winner;
    if (scores[a] > scores[b]) winner = a;
    else if (scores[b] > scores[a]) winner = b;
    else winner = defaults[idx];
    type += winner;
    const diff = scores[winner] - scores[winner === a ? b : a];
    let p = Math.round(diff / 30 * 100);
    p = Math.max(1, Math.min(99, p));
    pct[winner] = p;
  });

  return { type, pct, answered, answeredByAxis };
}

// ── Helpers: build an answer function for a target type ──
function strongTypeAnswers(targetType) {
  // For each question, answer Yes if q.yes matches the target's letter on that axis, else No
  const wantLetter = {
    I_E: targetType[0], N_S: targetType[1], T_F: targetType[2], J_P: targetType[3]
  };
  return (q) => (q.yes === wantLetter[q.ax]) ? 'yes' : 'no';
}

// ── Test A: Pure type for all 16. Run 3x under two modes:
//   (1) noAdaptive — forces all 60 Qs answered. Expect confidence >= 85%.
//   (2) adaptive  — lives flow; adaptive skip caps confidence at diff/30*100 at the
//       threshold (answeredByAxis=10, diff>=16 → skip → ~67% conf). Documented, not a pass/fail.
const ALL_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const testA = { pass: true, details: [] };
for (const target of ALL_TYPES) {
  const runsFull    = [1,2,3].map(() => runTest(strongTypeAnswers(target), { noAdaptive: true }));
  const runsAdapt   = [1,2,3].map(() => runTest(strongTypeAnswers(target)));
  const typesFull = runsFull.map(r => r.type);
  const allSameFull = typesFull.every(t => t === target);
  const minConfFull = Math.min(...runsFull.map(r => Math.min(...Object.values(r.pct))));
  const okFull = allSameFull && minConfFull >= 85;
  const typesAdapt = runsAdapt.map(r => r.type);
  const allSameAdapt = typesAdapt.every(t => t === target);
  if (!okFull || !allSameAdapt) testA.pass = false;
  testA.details.push({
    target,
    typesFull, minConfFull, okFull, pctFull: runsFull[0].pct, answeredFull: runsFull[0].answered,
    typesAdapt, pctAdapt: runsAdapt[0].pct, answeredAdapt: runsAdapt[0].answered
  });
}

// ── Test B: All In Between. Expect tie-break defaults I, N, T, J. ──
const testB = runTest(() => 'between');

// ── Test C: First 12 I/E questions strongly I; rest Not Sure. Expect I/E skipped, type starts with I. ──
let ieAnsweredC = 0;
const testCRun = runTest((q) => {
  if (q.ax === 'I_E' && ieAnsweredC < 12) { ieAnsweredC++; return 'yes'; } // 'yes' on I_E means I (since q.yes === 'I')
  return 'unsure';
});
// At answered >= 10 with diff = 20 (strong), adaptive skip should kick in
const testC = {
  type: testCRun.type,
  pct: testCRun.pct,
  answered: testCRun.answered,
  answeredByAxis: testCRun.answeredByAxis,
  pass: testCRun.type[0] === 'I' && testCRun.answeredByAxis.I_E <= 12
};

// ── Test D: Regression — take 5 patterns from the 24-Q era, pad with Not Sure on 25-60. ──
// We represent an old pattern as a dict of axis->letter (what side each of the 6 old Qs favored).
// Then the first 24 questions (which are the original 24 in the live TEST_QS) get yes/no based on match;
// questions 25-60 are unsure.
const OLD_PATTERNS = [
  { name: 'Clear INTJ', want: { I_E:'I', N_S:'N', T_F:'T', J_P:'J' } },
  { name: 'Clear ENFP', want: { I_E:'E', N_S:'N', T_F:'F', J_P:'P' } },
  { name: 'Clear ISFJ', want: { I_E:'I', N_S:'S', T_F:'F', J_P:'J' } },
  { name: 'Clear ESTP', want: { I_E:'E', N_S:'S', T_F:'T', J_P:'P' } },
  { name: 'Clear INFP', want: { I_E:'I', N_S:'N', T_F:'F', J_P:'P' } }
];
const testD = [];
for (const patt of OLD_PATTERNS) {
  const r = runTest((q, i) => {
    if (i >= 24) return 'unsure';       // questions 25-60 (by source order in TEST_QS)
    return q.yes === patt.want[q.ax] ? 'yes' : 'no';
  });
  const expected = Object.values(patt.want).join('');
  testD.push({ name: patt.name, expected, got: r.type, match: r.type === expected, pct: r.pct });
}

// ── Print report ──
const lines = [];
lines.push('# Consistency audit — 60-question personality test');
lines.push('');
lines.push('Generated: ' + new Date().toISOString());
lines.push('Questions loaded: ' + TEST_QS.length);
lines.push('Axis breakdown: ' + JSON.stringify(countByAxis(TEST_QS)));
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Test A — Pure type (all 16 types, strong answers, 3x each)');
lines.push('');
lines.push('**A.1 — Scoring engine isolated (adaptive skip OFF, all 60 Qs answered).**');
lines.push('Expected: same type code all 3 runs; minimum per-axis confidence >= 85%.');
lines.push('');
lines.push('| Target | Got (3 runs) | Min axis conf | Spectrum (run 1) | Qs | Pass |');
lines.push('|---|---|---|---|---|---|');
testA.details.forEach(d => {
  const spec = Object.entries(d.pctFull).map(([k,v])=>k+'('+v+'%)').join(' ');
  lines.push('| ' + d.target + ' | ' + d.typesFull.join(', ') + ' | ' + d.minConfFull + '% | ' + spec + ' | ' + d.answeredFull + ' | ' + (d.okFull ? '✅' : '❌') + ' |');
});
lines.push('');
lines.push('**A.1 overall:** ' + (testA.details.every(d => d.okFull) ? '✅ PASS' : '❌ FAIL'));
lines.push('');
lines.push('**A.2 — Live adaptive flow (adaptive skip ON).**');
lines.push('Type should match all 3 runs. Per-axis confidence is expected to be ~67-80% because adaptive skip cuts off each axis once diff >= 16 is reached, capping the measurable lead. This is expected behavior, not a defect.');
lines.push('');
lines.push('| Target | Got (3 runs) | Spectrum (run 1) | Qs answered |');
lines.push('|---|---|---|---|');
testA.details.forEach(d => {
  const spec = Object.entries(d.pctAdapt).map(([k,v])=>k+'('+v+'%)').join(' ');
  lines.push('| ' + d.target + ' | ' + d.typesAdapt.join(', ') + ' | ' + spec + ' | ' + d.answeredAdapt + ' |');
});
lines.push('');
lines.push('**A.2 overall:** ' + (testA.details.every(d => d.typesAdapt.every(t => t === d.target)) ? '✅ PASS (type consistency)' : '❌ FAIL'));
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Test B — All "In Between"');
lines.push('');
lines.push('Expected: tie-break defaults to I, N, T, J. Confidence per axis should be the clamped minimum (1%).');
lines.push('');
lines.push('- Type: **' + testB.type + '**');
lines.push('- Percentages: ' + Object.entries(testB.pct).map(([k,v])=>k+'('+v+'%)').join(' '));
lines.push('- Pass: ' + (testB.type === 'INTJ' ? '✅' : '❌ expected INTJ'));
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Test C — Adaptive skip (12 strong-I, rest Not Sure)');
lines.push('');
lines.push('Expected: after 12 strong-I answers, I/E axis is resolved; remaining I/E questions skipped; first letter of result = I.');
lines.push('');
lines.push('- Type: **' + testC.type + '**');
lines.push('- Questions answered by axis: ' + JSON.stringify(testC.answeredByAxis));
lines.push('- I/E questions answered: ' + testC.answeredByAxis.I_E + ' (expected <= 12 — adaptive skip should cap at threshold crossing)');
lines.push('- Spectrum: ' + Object.entries(testC.pct).map(([k,v])=>k+'('+v+'%)').join(' '));
lines.push('- Pass: ' + (testC.pass ? '✅' : '❌'));
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Test D — Regression (5 old 24-Q patterns, new Qs = Not Sure)');
lines.push('');
lines.push('Expected: type code matches the original 24-Q result. Percentages will be lower because only 6 Qs per axis were answered (max diff 12 out of 30 = 40% confidence).');
lines.push('');
lines.push('| Pattern | Expected | Got | Match | Spectrum |');
lines.push('|---|---|---|---|---|');
testD.forEach(d => {
  const spec = Object.entries(d.pct).map(([k,v])=>k+'('+v+'%)').join(' ');
  lines.push('| ' + d.name + ' | ' + d.expected + ' | ' + d.got + ' | ' + (d.match ? '✅' : '❌') + ' | ' + spec + ' |');
});
lines.push('');
lines.push('**Overall:** ' + (testD.every(x => x.match) ? '✅ PASS' : '❌ FAIL'));
lines.push('');

const out = lines.join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'consistency_audit.md'), out);
console.log('Wrote consistency_audit.md (' + out.length + ' bytes)');
console.log('');
console.log('Summary:');
console.log('  Test A:', testA.pass ? 'PASS' : 'FAIL');
console.log('  Test B:', testB.type === 'INTJ' ? 'PASS' : 'FAIL — got ' + testB.type);
console.log('  Test C:', testC.pass ? 'PASS' : 'FAIL');
console.log('  Test D:', testD.every(x => x.match) ? 'PASS' : 'FAIL');
