#!/usr/bin/env node
// Generate the high-traffic missing /blog/{a}-vs-{b}.html comparison pages.
const fs = require('fs');
const path = require('path');

const TITLES = { INTJ:'The Architect',INTP:'The Logician',ENTJ:'The Commander',ENTP:'The Debater',INFJ:'The Advocate',INFP:'The Mediator',ENFJ:'The Protagonist',ENFP:'The Campaigner',ISTJ:'The Logistician',ISFJ:'The Defender',ESTJ:'The Executive',ESFJ:'The Consul',ISTP:'The Virtuoso',ISFP:'The Adventurer',ESTP:'The Entrepreneur',ESFP:'The Entertainer' };
const RARITY = { INTJ:'roughly 2-4%',INTP:'roughly 3-5%',ENTJ:'roughly 2-5%',ENTP:'roughly 3-5%',INFJ:'roughly 1-2% (rarest)',INFP:'roughly 4-5%',ENFJ:'roughly 2-3%',ENFP:'roughly 7-8%',ISTJ:'roughly 11-14% (most common)',ISFJ:'roughly 9-14%',ESTJ:'roughly 8-12%',ESFJ:'roughly 9-13%',ISTP:'roughly 5-6%',ISFP:'roughly 5-9%',ESTP:'roughly 4-5%',ESFP:'roughly 8-9%' };

function diffAxis(a, b) {
  const map = ['I/E', 'N/S', 'T/F', 'J/P'];
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return map[i];
  return null;
}
function axisInsight(axis, a, b) {
  const M = {
    'I/E': {
      I: 'recharges alone and processes internally before speaking',
      E: 'recharges with people and thinks out loud'
    },
    'N/S': {
      N: 'leads with patterns and abstractions',
      S: 'leads with concrete details and lived experience'
    },
    'T/F': {
      T: 'decides by logic first, evidence before empathy',
      F: 'decides by values first, impact on people before efficiency'
    },
    'J/P': {
      J: 'seeks closure, plans ahead, moves toward resolution',
      P: 'keeps options open, prefers exploration over commitment'
    }
  };
  return `${a}s ${M[axis][a[axis === 'I/E' ? 0 : axis === 'N/S' ? 1 : axis === 'T/F' ? 2 : 3]]}; ${b}s ${M[axis][b[axis === 'I/E' ? 0 : axis === 'N/S' ? 1 : axis === 'T/F' ? 2 : 3]]}.`;
}

function buildPage(a, b) {
  const slug = `${a.toLowerCase()}-vs-${b.toLowerCase()}`;
  const axis = diffAxis(a, b);
  const today = new Date().toISOString().slice(0, 10);
  const insight = axis ? axisInsight(axis, a, b) : `${a} and ${b} share all four preferences but diverge in cognitive function order.`;
  const overlap = a.split('').filter((l, i) => l === b[i]).length;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="kSGxUo6ERTtnEqasUWyRl-w1hHLS3P4lDoFjQuBmSJc" />
<title>${a} vs ${b}: Key Differences | personality.fyi</title>
<meta name="description" content="${a} vs ${b} comparison across leadership, communication, careers, conflict, and stress. How to tell which you are.">
<link rel="canonical" href="https://personality.fyi/blog/${slug}">
<meta property="og:type" content="article">
<meta property="og:title" content="${a} vs ${b}: Key Differences">
<meta property="og:description" content="${a} vs ${b}: leadership, communication, careers, and stress response.">
<meta property="og:url" content="https://personality.fyi/blog/${slug}">
<meta property="og:site_name" content="Personality.fyi">
<meta name="twitter:card" content="summary">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://personality.fyi/"},{"@type":"ListItem","position":2,"name":"Blog","item":"https://personality.fyi/blog"},{"@type":"ListItem","position":3,"name":"${a} vs ${b}"}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is the difference between ${a} and ${b}?","acceptedAnswer":{"@type":"Answer","text":"${insight}"}},{"@type":"Question","name":"How do I know if I'm ${a} or ${b}?","acceptedAnswer":{"@type":"Answer","text":"The decisive tell is the ${axis || 'cognitive function'} difference. ${insight}"}},{"@type":"Question","name":"Are ${a} and ${b} similar?","acceptedAnswer":{"@type":"Answer","text":"${a} and ${b} share ${overlap} of 4 MBTI letters. ${overlap >= 3 ? 'They are commonly confused, especially under stress.' : overlap === 2 ? 'They share two preferences but diverge enough that day-to-day behavior reads quite different.' : 'They share little surface behavior, though both are valid Myers-Briggs types.'}"}},{"@type":"Question","name":"Which is more common, ${a} or ${b}?","acceptedAnswer":{"@type":"Answer","text":"${a}s are ${RARITY[a]} of the population. ${b}s are ${RARITY[b]}."}}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"${a} vs ${b}: Key Differences","description":"${a} vs ${b}: leadership, communication, careers, conflict, stress.","url":"https://personality.fyi/blog/${slug}","datePublished":"${today}","dateModified":"${today}","author":{"@type":"Person","name":"Brad Kam","url":"https://personality.fyi/about","sameAs":["https://www.linkedin.com/in/bradleykam/"]},"publisher":{"@type":"Organization","name":"personality.fyi","url":"https://personality.fyi"},"mainEntityOfPage":{"@type":"WebPage","@id":"https://personality.fyi/blog/${slug}"}}</script>
</head>
<body>
<header class="blog-header">
  <a href="/" class="blog-brand">Personality<span>.fyi</span></a>
  <nav class="blog-nav">
    <a href="/blog">Learn</a>
    <a href="/?tab=alltypes">All Types</a>
    <a href="/">App</a>
  </nav>
</header>

<main class="blog-article">
  <div class="blog-breadcrumb"><a href="/blog">← All posts</a></div>
  <h1>${a} vs ${b}: Key Differences</h1>
  <div class="blog-meta">Comparison guide · ${a} (${TITLES[a]}) vs ${b} (${TITLES[b]}) · Updated ${today}</div>

  <section>
    <h2>The core difference</h2>
    <p><strong>${insight}</strong></p>
    <p><a href="/blog/${a.toLowerCase()}-personality">${a} (${TITLES[a]})</a> and <a href="/blog/${b.toLowerCase()}-personality">${b} (${TITLES[b]})</a> share ${overlap} of 4 MBTI letters. ${overlap >= 3 ? 'They are commonly mistaken for each other.' : overlap === 2 ? 'They share two preferences but diverge enough that day-to-day behavior reads differently.' : 'They share little surface behavior; the cognitive function stacks barely overlap.'}</p>
  </section>

  <section>
    <h2>${a} vs ${b}: at a glance</h2>
    <ul class="blog-bullets">
      <li><strong>Energy / I-E:</strong> ${a[0] === 'I' ? `${a} introverts and recharges alone` : `${a} extroverts and recharges with people`}; ${b[0] === 'I' ? `${b} introverts and recharges alone` : `${b} extroverts and recharges with people`}.</li>
      <li><strong>Information / N-S:</strong> ${a[1] === 'N' ? `${a} leads with abstraction and patterns` : `${a} leads with concrete detail`}; ${b[1] === 'N' ? `${b} leads with abstraction and patterns` : `${b} leads with concrete detail`}.</li>
      <li><strong>Decisions / T-F:</strong> ${a[2] === 'T' ? `${a} decides on logic first` : `${a} decides on values first`}; ${b[2] === 'T' ? `${b} decides on logic first` : `${b} decides on values first`}.</li>
      <li><strong>Lifestyle / J-P:</strong> ${a[3] === 'J' ? `${a} closes loops and plans ahead` : `${a} keeps options open`}; ${b[3] === 'J' ? `${b} closes loops and plans ahead` : `${b} keeps options open`}.</li>
      <li><strong>Population:</strong> ${a} is ${RARITY[a]}; ${b} is ${RARITY[b]}.</li>
    </ul>
  </section>

  <section>
    <h2>Where they overlap</h2>
    <p>${a} and ${b} share ${overlap} core preferences. ${overlap >= 3 ? 'They tend to gravitate toward similar environments, similar work, and similar people. To outsiders they can look nearly identical — which is why they are commonly confused.' : overlap === 2 ? 'They share enough wiring to recognize each other, but enough divergence that their daily rhythms feel different.' : 'They have little day-to-day overlap, though both can be useful, healthy types.'}</p>
  </section>

  <section>
    <h2>Where they diverge most</h2>
    <p><strong>Primary divergence:</strong> ${axis || 'cognitive function ordering'}. ${insight} This shows up in leadership style, how they handle conflict, and how they recover from stress.</p>
  </section>

  <section>
    <h2>How to tell which one you are</h2>
    <p>The decisive tell is the ${axis || 'cognitive function stack'} flip. ${axis === 'I/E' ? 'Ask yourself: After a big group event, do you feel recharged (E) or drained (I)?' : axis === 'N/S' ? 'Ask yourself: When you read a new idea, do you reach for the abstract pattern first (N) or the concrete example first (S)?' : axis === 'T/F' ? 'Ask yourself: When you hit a hard call, do you anchor on what is logically correct (T) or on impact on the people involved (F)?' : axis === 'J/P' ? 'Ask yourself: Do you find unfinished decisions energizing (P) or exhausting (J)?' : 'Take the test — function-stack differences are subtle and easier to surface from your writing patterns than from intuition.'}</p>
    <p>When in doubt, take the <a href="/">60-second test</a> — it scores word patterns and preference signals rather than abstract self-description.</p>
  </section>

  <section>
    <h2>Frequently Asked Questions</h2>
    <details class="blog-faq" open><summary>What is the difference between ${a} and ${b}?</summary><p>${insight}</p></details>
    <details class="blog-faq"><summary>How do I know if I'm ${a} or ${b}?</summary><p>The decisive tell is the ${axis || 'cognitive function stack'} difference. ${insight}</p></details>
    <details class="blog-faq"><summary>Are ${a} and ${b} similar?</summary><p>${a} and ${b} share ${overlap} of 4 MBTI letters. ${overlap >= 3 ? 'They are commonly confused, especially under stress.' : 'They share enough wiring to recognize each other but diverge in daily rhythm.'}</p></details>
    <details class="blog-faq"><summary>Which is more common, ${a} or ${b}?</summary><p>${a}s are ${RARITY[a]} of the population. ${b}s are ${RARITY[b]}.</p></details>
  </section>

  <section class="blog-cta">
    <h2>Read each type in depth</h2>
    <p>Full profiles: <a href="/blog/${a.toLowerCase()}-personality">${a} — ${TITLES[a]}</a> and <a href="/blog/${b.toLowerCase()}-personality">${b} — ${TITLES[b]}</a>.</p>
    <a href="/" class="blog-cta-btn">Take the test →</a>
  </section>
</main>

<footer class="blog-footer">
  <div><a href="/">Personality.fyi</a> · <a href="/blog">Learn</a></div>
</footer>
</body>
</html>
`;
}

// Highest-traffic missing comparison pairs (one-axis-flip pairs people commonly confuse).
const PAIRS = [
  ['INTJ','INFJ'],['INTJ','ISTJ'],['INTJ','ENTP'],
  ['INTP','ENTP'],['INTP','INFP'],['INTP','ISTP'],
  ['ENTJ','ESTJ'],['ENTJ','ENFJ'],
  ['ENTP','INTP'],
  ['INFJ','INFP'],['INFJ','ENFJ'],
  ['INFP','ENFP'],['INFP','ISFP'],
  ['ENFJ','ENFP'],['ENFJ','ESFJ'],
  ['ENFP','ENTP'],
  ['ISTJ','ESTJ'],['ISTJ','ISTP'],['ISTJ','ISFJ'],
  ['ISFJ','ESFJ'],['ISFJ','ISFP'],
  ['ESTJ','ESFJ'],['ESTJ','ESTP'],
  ['ESFJ','ESFP'],
  ['ISTP','ISFP'],['ISTP','ESTP'],
  ['ISFP','ESFP'],
  ['ESTP','ESFP']
];

const dir = path.join(__dirname, '..', 'blog');
let written = 0, skipped = 0;
for (const [a, b] of PAIRS) {
  const slug = `${a.toLowerCase()}-vs-${b.toLowerCase()}`;
  const file = path.join(dir, slug + '.html');
  if (fs.existsSync(file)) { skipped++; continue; }
  fs.writeFileSync(file, buildPage(a, b));
  written++;
  console.log('wrote', slug);
}
console.log(`Wrote ${written} new vs-pages, skipped ${skipped} that existed.`);
