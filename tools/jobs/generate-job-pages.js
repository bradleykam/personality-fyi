#!/usr/bin/env node
/* Generate /blog/best-personality-types-for-{slug}.html for every job in job-list.txt.
 * Skips jobs whose page already exists. Calls Claude via the Netlify proxy.
 * Saves cumulative cost; halts at SPEND_CAP_USD.
 *
 * Each job page:
 *   - 200-word intro (Q1: "best personality types for X")
 *   - All-16-types ranked breakdown (table)
 *   - 16 FAQ items: "Are <TYPE>s good at <job>?" — ordered best-fit first
 *   - FAQPage + Article schema
 *   - CTA to Career Planning
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BLOG = path.join(ROOT, 'blog');
const LIST = path.join(__dirname, 'job-list.txt');
const PROGRESS = path.join(__dirname, 'progress.json');
const ENDPOINT = 'https://personality.fyi/.netlify/functions/claude';
const MODEL = 'claude-sonnet-4-20250514';
// Sonnet pricing — input $3/M, output $15/M
const COST_IN = 3 / 1e6;
const COST_OUT = 15 / 1e6;
const SPEND_CAP_USD = 80;
const TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];

function loadJobs() {
  return fs.readFileSync(LIST, 'utf8').split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const [slug, name] = l.split('|').map(s => s.trim()); return { slug, name }; });
}
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { spendUsd: 0, generated: [] }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 0)); }

function pagePath(slug) { return path.join(BLOG, `best-personality-types-for-${slug}.html`); }
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function escText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// One Claude call per job; expects the model to return JSON we can parse.
async function generateJob(name) {
  const system = `You are TypeRead, a Myers-Briggs career analyst. Output ONLY valid JSON, no preamble. Be specific, honest, and concrete. No therapy hedging like "may", "might", "can sometimes". Make declarative claims. The reader is looking for career fit.`;
  const user = `Job: ${name}

Return a JSON object with this exact shape (no extra keys):

{
  "intro": "<200-word intro answering 'what are the best personality types for ${name}'. Concrete and direct. Mention the top 3 fits and worst 2 fits inline by type code.>",
  "ranking": [
    {"type":"<MBTI 4-letter>","fit":"<great|good|ok|poor>","note":"<one sentence explaining why this type fits/doesn't fit ${name}>"},
    ...all 16 types, ordered best-fit first then worst-fit last...
  ],
  "faqs": [
    {"q":"Are <TYPE>s good at ${name}?","a":"<2-3 sentences. Concrete. Name what they bring or where they hit friction.>"},
    ...one per type, in the SAME order as the ranking above (so best-fit FAQ is first)...
  ],
  "meta_title": "<title under 58 chars including ' | personality.fyi' suffix>",
  "meta_description": "<one sentence under 155 chars summarizing the page>"
}

Hard rules:
- All 16 MBTI types must appear once in 'ranking' and once in 'faqs', sorted identically (best-fit first).
- 'fit' values: 'great' for top 3-4, 'good' for next 4-5, 'ok' for middle, 'poor' for bottom 2-3.
- Don't say "every type can do this job"; differentiate sharply.
- Use real role context (what the job actually does day-to-day).
- Reference cognitive functions where it adds clarity (Te, Ti, Ni, Ne, etc.).`;

  const body = {
    model: MODEL,
    max_tokens: 4500,
    system,
    messages: [{ role: 'user', content: user }]
  };
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('application/json')) {
    const t = await res.text();
    throw new Error(`non-json (${res.status}): ${t.slice(0, 120)}`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  if (!data.content || !data.content[0]) throw new Error('no content: ' + JSON.stringify(data).slice(0, 300));
  const text = data.content[0].text.trim();
  const jsonStart = text.indexOf('{');
  const parsed = JSON.parse(text.slice(jsonStart));
  // Validate shape
  if (!parsed.intro || !Array.isArray(parsed.ranking) || parsed.ranking.length !== 16) {
    throw new Error('bad shape: ranking length ' + (parsed.ranking ? parsed.ranking.length : '?'));
  }
  if (!Array.isArray(parsed.faqs) || parsed.faqs.length !== 16) {
    throw new Error('bad shape: faqs length ' + (parsed.faqs ? parsed.faqs.length : '?'));
  }
  const seen = new Set(parsed.ranking.map(r => r.type));
  if (seen.size !== 16) throw new Error('ranking missing types: ' + [...seen].join(','));
  const usage = data.usage || {};
  const cost = (usage.input_tokens || 0) * COST_IN + (usage.output_tokens || 0) * COST_OUT;
  return { ...parsed, _cost: cost, _usage: usage };
}

function buildHtml(slug, name, payload) {
  const today = new Date().toISOString().slice(0, 10);
  const url = `https://personality.fyi/blog/best-personality-types-for-${slug}`;
  const ranking = payload.ranking;
  const faqs = payload.faqs;

  const fitClass = { great: 'great fit', good: 'good fit', ok: 'ok fit', poor: 'poor fit' };
  const tableRows = ranking.map((r, i) => `      <tr><td><strong>${i+1}.</strong></td><td><a href="/blog/${r.type.toLowerCase()}-personality"><strong>${r.type}</strong></a></td><td>${escText(fitClass[r.fit] || r.fit)}</td><td>${escText(r.note)}</td></tr>`).join('\n');

  const faqHtml = faqs.map(f => `    <details class="blog-faq" ${f === faqs[0] ? 'open' : ''}><summary>${escText(f.q)}</summary><p>${escText(f.a)}</p></details>`).join('\n');

  const faqJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a }
    }))
  });
  const articleJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": `Best Personality Types for ${name}`,
    "description": payload.meta_description,
    "url": url,
    "datePublished": today,
    "dateModified": today,
    "image": ["https://personality.fyi/og-image.png"],
    "author": { "@type": "Person", "name": "Brad Kam", "url": "https://personality.fyi/about", "sameAs": ["https://www.linkedin.com/in/bradleykam/"] },
    "publisher": { "@type": "Organization", "name": "personality.fyi", "url": "https://personality.fyi" },
    "mainEntityOfPage": { "@type": "WebPage", "@id": url }
  });
  const breadcrumbJson = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://personality.fyi/" },
      { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://personality.fyi/blog" },
      { "@type": "ListItem", "position": 3, "name": `Best Types for ${name}` }
    ]
  });

  const titleSafe = escAttr(payload.meta_title);
  const descSafe = escAttr(payload.meta_description);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="kSGxUo6ERTtnEqasUWyRl-w1hHLS3P4lDoFjQuBmSJc" />
<title>${titleSafe}</title>
<meta name="description" content="${descSafe}">
<meta name="keywords" content="best personality types for ${name.toLowerCase()}, MBTI ${name.toLowerCase()}, ${name.toLowerCase()} careers by personality, free career planning ${name.toLowerCase()}, personality fit for ${name.toLowerCase()}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="personality.fyi">
<meta property="og:title" content="Best Personality Types for ${escAttr(name)}">
<meta property="og:description" content="${descSafe}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://personality.fyi/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Best Personality Types for ${escAttr(name)}">
<meta name="twitter:description" content="${descSafe}">
<meta name="twitter:image" content="https://personality.fyi/og-image.png">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${breadcrumbJson}</script>
<script type="application/ld+json">${faqJson}</script>
<script type="application/ld+json">${articleJson}</script>
<style>
table.fit-table { width: 100%; border-collapse: collapse; margin: 1.25rem 0 2rem; font-size: 14px; }
table.fit-table th, table.fit-table td { padding: 8px 10px; text-align: left; border-bottom: 0.5px solid var(--border); vertical-align: top; }
table.fit-table thead th { font-family: 'DM Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--ink); opacity: .6; }
table.fit-table td:first-child, table.fit-table th:first-child { width: 36px; }
table.fit-table td:nth-child(2), table.fit-table th:nth-child(2) { width: 70px; }
table.fit-table td:nth-child(3), table.fit-table th:nth-child(3) { width: 90px; font-family: 'DM Mono', monospace; font-size: 12px; text-transform: uppercase; }
</style>
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
  <div class="blog-breadcrumb"><a href="/blog">\u2190 All posts</a></div>
  <h1>Best Personality Types for ${escText(name)}</h1>
  <div class="blog-meta">Career fit by personality \u00B7 Updated ${today}</div>

  <section>
    <p>${escText(payload.intro)}</p>
  </section>

  <section>
    <h2>All 16 types ranked for ${escText(name)}</h2>
    <table class="fit-table">
      <thead><tr><th>#</th><th>Type</th><th>Fit</th><th>Why</th></tr></thead>
      <tbody>
${tableRows}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Frequently asked questions</h2>
${faqHtml}
  </section>

  <section class="blog-cta">
    <h2>Find your fit</h2>
    <p>Personality.fyi's free Career Planning tool calibrates role recommendations to how you actually think and work \u2014 not just to industry buckets. Tell it your background and it returns specific roles plus live job listings.</p>
    <a href="/?tab=advisor" class="blog-cta-btn">Try Career Planning \u2192</a>
  </section>
</main>

<footer class="blog-footer">
  <div><a href="/">Personality.fyi</a> \u00B7 <a href="/blog">Learn</a> \u00B7 <a href="/about">About</a> \u00B7 <a href="/methodology">Methodology</a></div>
</footer>
</body>
</html>
`;
}

async function main() {
  const jobs = loadJobs();
  console.log(`Total jobs in list: ${jobs.length}`);
  const progress = loadProgress();
  console.log(`Already generated: ${progress.generated.length}, spent so far: $${progress.spendUsd.toFixed(4)}`);

  const todo = jobs.filter(j => !fs.existsSync(pagePath(j.slug)));
  console.log(`To generate this run: ${todo.length}`);
  const CONCURRENCY = 2;
  let idx = 0, done = 0, failed = 0;
  const t0 = Date.now();

  async function worker() {
    while (idx < todo.length) {
      if (progress.spendUsd >= SPEND_CAP_USD) { console.log('\nSpend cap hit, stopping.'); return; }
      const job = todo[idx++];
      let attempt = 0;
      while (attempt < 5) {
        try {
          const payload = await generateJob(job.name);
          const html = buildHtml(job.slug, job.name, payload);
          fs.writeFileSync(pagePath(job.slug), html);
          progress.spendUsd += payload._cost;
          progress.generated.push(job.slug);
          saveProgress(progress);
          done++;
          const rate = done / ((Date.now() - t0) / 1000);
          const eta = Math.round((todo.length - done) / Math.max(rate, 0.01));
          process.stdout.write(`\r[${done}/${todo.length}] ${job.slug.padEnd(40).slice(0,40)} cost=$${payload._cost.toFixed(4)} total=$${progress.spendUsd.toFixed(2)} ETA=${eta}s    `);
          break;
        } catch (e) {
          attempt++;
          const wait = Math.min(30000, 3000 * Math.pow(2, attempt - 1));
          if (attempt >= 5) { failed++; console.error(`\n${job.slug} FAILED: ${e.message}`); break; }
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`\n\nDone. ok=${done} failed=${failed} total spend=$${progress.spendUsd.toFixed(2)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
