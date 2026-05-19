#!/usr/bin/env node
// GEO upgrades for /type/{code}.html:
//  - Add a Person author + Organization publisher in Article schema
//  - Refresh dateModified to today
//  - Inject visible FAQ section (so LLMs can quote prose, not just JSON-LD)
//  - Inject "Key facts" <dl> block under H1 (atomic quotable claims)
//  - Replace the truncated compatibility list with all 15 type links
const fs = require('fs');
const path = require('path');

const TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const TITLES = { INTJ:'The Architect',INTP:'The Logician',ENTJ:'The Commander',ENTP:'The Debater',INFJ:'The Advocate',INFP:'The Mediator',ENFJ:'The Protagonist',ENFP:'The Campaigner',ISTJ:'The Logistician',ISFJ:'The Defender',ESTJ:'The Executive',ESFJ:'The Consul',ISTP:'The Virtuoso',ISFP:'The Adventurer',ESTP:'The Entrepreneur',ESFP:'The Entertainer' };
// Inline copy of the compatibility matrix from tools/generate-blog.js
const COMPAT = {
  INTJ:{INTJ:78,INTP:84,ENTJ:86,ENTP:88,INFJ:82,INFP:74,ENFJ:80,ENFP:90,ISTJ:62,ISFJ:48,ESTJ:64,ESFJ:42,ISTP:60,ISFP:36,ESTP:54,ESFP:34},
  INTP:{INTJ:84,INTP:74,ENTJ:82,ENTP:88,INFJ:80,INFP:78,ENFJ:84,ENFP:86,ISTJ:54,ISFJ:46,ESTJ:48,ESFJ:38,ISTP:74,ISFP:60,ESTP:58,ESFP:50},
  ENTJ:{INTJ:86,INTP:82,ENTJ:74,ENTP:84,INFJ:78,INFP:72,ENFJ:80,ENFP:82,ISTJ:74,ISFJ:54,ESTJ:78,ESFJ:58,ISTP:62,ISFP:42,ESTP:70,ESFP:48},
  ENTP:{INTJ:88,INTP:88,ENTJ:84,ENTP:78,INFJ:90,INFP:82,ENFJ:84,ENFP:86,ISTJ:50,ISFJ:48,ESTJ:60,ESFJ:54,ISTP:68,ISFP:58,ESTP:72,ESFP:60},
  INFJ:{INTJ:82,INTP:80,ENTJ:78,ENTP:90,INFJ:74,INFP:84,ENFJ:82,ENFP:88,ISTJ:58,ISFJ:64,ESTJ:50,ESFJ:60,ISTP:54,ISFP:68,ESTP:46,ESFP:54},
  INFP:{INTJ:74,INTP:78,ENTJ:72,ENTP:82,INFJ:84,INFP:74,ENFJ:88,ENFP:84,ISTJ:46,ISFJ:62,ESTJ:48,ESFJ:64,ISTP:54,ISFP:74,ESTP:46,ESFP:60},
  ENFJ:{INTJ:80,INTP:84,ENTJ:80,ENTP:84,INFJ:82,INFP:88,ENFJ:74,ENFP:84,ISTJ:60,ISFJ:74,ESTJ:62,ESFJ:78,ISTP:50,ISFP:72,ESTP:56,ESFP:74},
  ENFP:{INTJ:90,INTP:86,ENTJ:82,ENTP:86,INFJ:88,INFP:84,ENFJ:84,ENFP:78,ISTJ:50,ISFJ:60,ESTJ:54,ESFJ:68,ISTP:58,ISFP:74,ESTP:70,ESFP:78},
  ISTJ:{INTJ:62,INTP:54,ENTJ:74,ENTP:50,INFJ:58,INFP:46,ENFJ:60,ENFP:50,ISTJ:74,ISFJ:78,ESTJ:84,ESFJ:80,ISTP:64,ISFP:54,ESTP:62,ESFP:54},
  ISFJ:{INTJ:48,INTP:46,ENTJ:54,ENTP:48,INFJ:64,INFP:62,ENFJ:74,ENFP:60,ISTJ:78,ISFJ:74,ESTJ:78,ESFJ:84,ISTP:54,ISFP:68,ESTP:58,ESFP:64},
  ESTJ:{INTJ:64,INTP:48,ENTJ:78,ENTP:60,INFJ:50,INFP:48,ENFJ:62,ENFP:54,ISTJ:84,ISFJ:78,ESTJ:74,ESFJ:80,ISTP:64,ISFP:50,ESTP:74,ESFP:62},
  ESFJ:{INTJ:42,INTP:38,ENTJ:58,ENTP:54,INFJ:60,INFP:64,ENFJ:78,ENFP:68,ISTJ:80,ISFJ:84,ESTJ:80,ESFJ:74,ISTP:48,ISFP:64,ESTP:58,ESFP:72},
  ISTP:{INTJ:60,INTP:74,ENTJ:62,ENTP:68,INFJ:54,INFP:54,ENFJ:50,ENFP:58,ISTJ:64,ISFJ:54,ESTJ:64,ESFJ:48,ISTP:74,ISFP:64,ESTP:74,ESFP:60},
  ISFP:{INTJ:36,INTP:60,ENTJ:42,ENTP:58,INFJ:68,INFP:74,ENFJ:72,ENFP:74,ISTJ:54,ISFJ:68,ESTJ:50,ESFJ:64,ISTP:64,ISFP:74,ESTP:60,ESFP:74},
  ESTP:{INTJ:54,INTP:58,ENTJ:70,ENTP:72,INFJ:46,INFP:46,ENFJ:56,ENFP:70,ISTJ:62,ISFJ:58,ESTJ:74,ESFJ:58,ISTP:74,ISFP:60,ESTP:74,ESFP:74},
  ESFP:{INTJ:34,INTP:50,ENTJ:48,ENTP:60,INFJ:54,INFP:60,ENFJ:74,ENFP:78,ISTJ:54,ISFJ:64,ESTJ:62,ESFJ:72,ISTP:60,ISFP:74,ESTP:74,ESFP:74}
};
const RARITY = { INTJ:'2–4%',INTP:'3–5%',ENTJ:'2–5%',ENTP:'3–5%',INFJ:'1–2% (rarest)',INFP:'4–5%',ENFJ:'2–3%',ENFP:'7–8%',ISTJ:'11–14% (most common)',ISFJ:'9–14%',ESTJ:'8–12%',ESFJ:'9–13%',ISTP:'5–6%',ISFP:'5–9%',ESTP:'4–5%',ESFP:'8–9%' };
const FN = { INTJ:'Introverted Intuition (Ni)',INTP:'Introverted Thinking (Ti)',ENTJ:'Extroverted Thinking (Te)',ENTP:'Extroverted Intuition (Ne)',INFJ:'Introverted Intuition (Ni)',INFP:'Introverted Feeling (Fi)',ENFJ:'Extroverted Feeling (Fe)',ENFP:'Extroverted Intuition (Ne)',ISTJ:'Introverted Sensing (Si)',ISFJ:'Introverted Sensing (Si)',ESTJ:'Extroverted Thinking (Te)',ESFJ:'Extroverted Feeling (Fe)',ISTP:'Introverted Thinking (Ti)',ISFP:'Introverted Feeling (Fi)',ESTP:'Extroverted Sensing (Se)',ESFP:'Extroverted Sensing (Se)' };

function pairSlug(a, b) {
  const [x, y] = [a, b].sort();
  return `${x.toLowerCase()}-${y.toLowerCase()}-compatibility`;
}
function tier(score) {
  if (score >= 81) return 'great fit';
  if (score >= 61) return 'good fit';
  if (score >= 40) return 'ok fit';
  return 'friction';
}

function buildKeyFacts(type) {
  const others = TYPES.filter(t => t !== type);
  const sorted = others.slice().sort((a, b) => COMPAT[type][b] - COMPAT[type][a]);
  const top3 = sorted.slice(0, 3);
  const careers = {INTJ:'research, strategy, engineering leadership',INTP:'research, software engineering, data science',ENTJ:'executive leadership, management consulting, investment banking',ENTP:'entrepreneurship, product, growth, R&D',INFJ:'counseling, writing, mediation, organizational design',INFP:'writing, design, therapy, nonprofit work',ENFJ:'people leadership, teaching, coaching, politics',ENFP:'marketing, journalism, design, founding teams',ISTJ:'accounting, law, operations, project management',ISFJ:'nursing, teaching, social work, customer success',ESTJ:'management, operations, military, finance',ESFJ:'healthcare, hospitality, HR, event planning',ISTP:'engineering, mechanics, paramedic, software',ISFP:'art, design, music, healthcare, fashion',ESTP:'sales, trading, real estate, founding',ESFP:'hospitality, performing arts, sales, education'}[type];
  return `  <section class="key-facts-block">
    <h2>Key facts</h2>
    <dl class="key-facts">
      <dt>Type code</dt><dd>${type} — ${TITLES[type]}</dd>
      <dt>Dominant cognitive function</dt><dd>${FN[type]}</dd>
      <dt>Estimated population</dt><dd>${RARITY[type]}</dd>
      <dt>Top 3 compatible types</dt><dd>${top3.join(', ')}</dd>
      <dt>Strong-fit careers</dt><dd>${careers}</dd>
      <dt>Total population covered on personality.fyi</dt><dd>16 type guides, 136 compatibility pairings, 30+ career fits</dd>
    </dl>
  </section>`;
}

function buildAllCompat(type) {
  const rows = TYPES.filter(t => t !== type).map(other => {
    const score = COMPAT[type][other];
    return `      <li><a href="/blog/${pairSlug(type, other)}">${type} + ${other} compatibility</a> — ${score}/100 (${tier(score)})</li>`;
  }).join('\n');
  return `  <section>
    <h2>${type} compatibility with every type</h2>
    <p>Pairwise compatibility for ${type} across all 15 other Myers–Briggs types. Scores reflect cognitive-function fit, not relationship outcomes on their own.</p>
    <ul class="blog-bullets">
${rows}
    </ul>
  </section>`;
}

function buildFAQSection(type) {
  return `  <section>
    <h2>Frequently asked questions</h2>
    <details class="blog-faq" open><summary>What is ${type}?</summary><p>${type} (${TITLES[type]}) is one of the 16 Myers–Briggs personality types. Dominant cognitive function: ${FN[type]}. Estimated ${RARITY[type]} of the population.</p></details>
    <details class="blog-faq"><summary>Is ${type} rare?</summary><p>${type} is approximately ${RARITY[type]} of the U.S. population. ${type === 'INFJ' ? 'It is the rarest of all 16 MBTI types.' : type === 'ISTJ' ? 'It is among the most common types.' : 'It is neither the rarest nor the most common type.'}</p></details>
    <details class="blog-faq"><summary>What jobs fit ${type}?</summary><p>See the <a href="/blog/${type.toLowerCase()}-personality">${type} deep-dive</a> for a ranked list. Strong-fit roles cluster in fields that reward this type's cognitive wiring.</p></details>
    <details class="blog-faq"><summary>Who is ${type} most compatible with?</summary><p>${(() => { const sorted = TYPES.filter(t => t !== type).sort((a, b) => COMPAT[type][b] - COMPAT[type][a]); return sorted.slice(0, 3).join(', '); })()} are typically the strongest fits for ${type}. See <a href="/blog/${pairSlug(type, TYPES.filter(t => t !== type).sort((a, b) => COMPAT[type][b] - COMPAT[type][a])[0])}">the top pairing</a> for details.</p></details>
    <details class="blog-faq"><summary>Can ${type}s change over time?</summary><p>Core preferences are stable across adulthood. Test results can shift based on mood, life phase, and which traits a ${type} is currently emphasizing — especially if a letter sits near the midpoint of its axis.</p></details>
  </section>`;
}

const today = new Date().toISOString().slice(0, 10);
const dir = path.join(__dirname, '..', 'type');
let updated = 0;
for (const type of TYPES) {
  const file = path.join(dir, type.toLowerCase() + '.html');
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');

  // 1. Article schema → swap Organization author for Person author + Organization publisher; refresh dateModified.
  html = html.replace(
    /"@type":"Article","headline":"[^"]+","description":"[^"]+","url":"[^"]+","datePublished":"[^"]+","dateModified":"[^"]+","author":\{"@type":"Organization","name":"personality\.fyi"\},"publisher":\{"@type":"Organization","name":"personality\.fyi","url":"https:\/\/personality\.fyi"\}/,
    (m) => m
      .replace(/"dateModified":"[^"]+"/, `"dateModified":"${today}"`)
      .replace(/"author":\{"@type":"Organization","name":"personality\.fyi"\}/, `"author":{"@type":"Person","name":"Brad Kam","url":"https://personality.fyi/about","sameAs":["https://www.linkedin.com/in/bradleykam/"]},"reviewedBy":{"@type":"Organization","name":"personality.fyi","url":"https://personality.fyi"}`)
  );

  // 2. Update visible "Updated <date>" line.
  html = html.replace(/Updated \d{4}-\d{2}-\d{2}/, `Updated ${today}`);

  // 3. Inject Key facts block immediately after the <h1> + meta div.
  if (!html.includes('class="key-facts-block"')) {
    html = html.replace(
      /(<div class="blog-meta">[^<]*<\/div>)/,
      `$1\n\n${buildKeyFacts(type)}`
    );
  }

  // 4. Replace the partial compatibility section with the full 15-type version.
  //    Old section starts with "<h2>{type} compatibility overview</h2>" and ends at the next </section>.
  html = html.replace(
    new RegExp(`  <section>\\s*<h2>${type} compatibility overview<\\/h2>[\\s\\S]*?<\\/section>`),
    buildAllCompat(type)
  );

  // 5. Inject FAQ section right before the final blog-cta CTA section, if not already present.
  if (!html.includes('<h2>Frequently asked questions</h2>')) {
    html = html.replace(
      /(  <section class="blog-cta">)/,
      `${buildFAQSection(type)}\n\n$1`
    );
  }

  fs.writeFileSync(file, html);
  updated++;
}
console.log(`Updated ${updated} type pages.`);
