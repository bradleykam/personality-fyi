#!/usr/bin/env node
/**
 * Type Records generator.
 * From NHIE aggregates (nhie_aggregate RPC), emits:
 *   - one ranking page per statement:  blog/most-likely-to-<slug>.html
 *   - one record page per type:        blog/<type>-record.html
 *   - one index page:                  blog/most-likely-to.html
 * and appends any new URLs to sitemap.xml.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Usage: node tools/records/generate-record-pages.js [--write]
 *        (default is dry run: prints the plan + one sample page to stdout)
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..', '..');
const BLOG = path.join(ROOT, 'blog');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const TODAY = '2026-07-01';

const TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const NICK = { INTJ:'Architect', INTP:'Logician', ENTJ:'Commander', ENTP:'Debater', INFJ:'Advocate', INFP:'Mediator', ENFJ:'Protagonist', ENFP:'Campaigner', ISTJ:'Logistician', ISFJ:'Defender', ESTJ:'Executive', ESFJ:'Consul', ISTP:'Virtuoso', ISFP:'Adventurer', ESTP:'Entrepreneur', ESFP:'Entertainer' };
const DESC = {
  INTJ: 'strategic, private, and allergic to doing anything without a reason',
  INTP: 'curious, skeptical, and more interested in the idea than the outcome',
  ENTJ: 'decisive, ambitious, and constitutionally incapable of leaving money on the table',
  ENTP: 'argumentative, novelty-seeking, and convinced the rules are suggestions',
  INFJ: 'reserved, principled, and quietly intense about the things that matter',
  INFP: 'idealistic, inward, and guided by personal values over convention',
  ENFJ: 'warm, persuasive, and instinctively in charge of everyone’s wellbeing',
  ENFP: 'enthusiastic, spontaneous, and unable to resist a new experience',
  ISTJ: 'dutiful, methodical, and suspicious of anything that hasn’t been proven',
  ISFJ: 'careful, loyal, and the last to take an unnecessary risk',
  ESTJ: 'organized, assertive, and comfortable taking charge of outcomes',
  ESFJ: 'sociable, responsible, and tuned to what the group is doing',
  ISTP: 'hands-on, unbothered, and drawn to anything with real physical stakes',
  ISFP: 'gentle, present, and quietly experience-driven',
  ESTP: 'bold, impulsive, and biologically incapable of watching from the sidelines',
  ESFP: 'fun-first, social, and always where the action is',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function pageTitle(phrase) {
  let t = `Which MBTI Type Is Most Likely to Have ${cap(phrase)}?`;
  if (t.length <= 60) return t;
  t = `Most Likely to Have ${cap(phrase)}: MBTI`;
  if (t.length <= 60) return t;
  let words = phrase.split(' ');
  while (words.length > 2 && (`Most Likely to Have ${cap(words.join(' '))}: MBTI`).length > 60) words.pop();
  return `Most Likely to Have ${cap(words.join(' '))}: MBTI`;
}

function shell({ slug, title, desc, h1, meta, bodyHtml, faq, breadcrumbName }) {
  const url = `https://personality.fyi/blog/${slug}`;
  const faqLd = faq ? `\n<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })}</script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="kSGxUo6ERTtnEqasUWyRl-w1hHLS3P4lDoFjQuBmSJc" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Personality.fyi">
<meta property="og:image" content="https://personality.fyi/og-image.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' }, { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' }, { '@type': 'ListItem', position: 3, name: breadcrumbName }] })}</script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: h1, description: desc, url: url, datePublished: TODAY, dateModified: TODAY, author: { '@type': 'Person', name: 'Brad Kam', url: 'https://personality.fyi/about/brad-kam', sameAs: ['https://www.linkedin.com/in/bradley-kam-444aa228/', 'https://x.com/findporpoise'] }, publisher: { '@type': 'Organization', name: 'personality.fyi', url: 'https://personality.fyi', logo: { '@type': 'ImageObject', url: 'https://personality.fyi/og-image.png', width: 1200, height: 630 } }, image: ['https://personality.fyi/og-image.png'] })}</script>${faqLd}
</head>
<body>
<header class="blog-header">
  <a href="/" class="blog-brand">Personality<span>.fyi</span></a>
  <nav class="blog-nav">
    <a href="/blog/">Learn</a>
    <a href="/all-types">All Types</a> <a href="/blog/careers">Careers</a> <a href="/blog/comparisons">Compatibility</a>
    <a href="/">App</a>
  </nav>
</header>

<main class="blog-article">
  <div class="blog-breadcrumb"><a href="/blog/most-likely-to">← All rankings</a></div>
  <h1>${esc(h1)}</h1>
  <div class="blog-meta">${meta} · Updated ${TODAY} · By <a href="/about/brad-kam" rel="author">Brad Kam</a></div>
${bodyHtml}
<section class="blog-hublink"><p style="font-size:13px;color:var(--muted,#7a7670);margin:0 0 4px">Part of the <a href="/blog/most-likely-to">MBTI most likely to rankings</a>.</p></section>
  <section class="blog-cta">
    <h2>Add your type to learn more about yourself</h2>
    <p>Add your type, or take the free 60-second test to find it.</p>
    <a href="/start" class="blog-cta-btn">Add your type →</a>
  </section>
</main>

<footer class="blog-footer">
  <div><a href="/">Personality.fyi</a> · <a href="/blog/">Learn</a></div>
</footer>
</body>
</html>
`;
}

const rankTable = (ranked) =>
  '<section><h2 id="all-16-types-ranked">All 16 types ranked</h2>' +
  '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
  '<thead><tr><th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--ink,#222)">#</th><th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--ink,#222)">Type</th><th style="text-align:right;padding:8px 10px;border-bottom:2px solid var(--ink,#222)">Have</th></tr></thead><tbody>' +
  ranked.map((r, i) =>
    `<tr><td style="padding:7px 10px;border-bottom:1px solid var(--border,#e4e2dc)">${i + 1}</td>` +
    `<td style="padding:7px 10px;border-bottom:1px solid var(--border,#e4e2dc)"><a href="/type/${r.type.toLowerCase()}"><strong>${r.type}</strong></a> <span style="color:var(--muted,#7a7670)">${NICK[r.type]}</span></td>` +
    `<td style="padding:7px 10px;border-bottom:1px solid var(--border,#e4e2dc);text-align:right;font-weight:700">${r.pct}%</td></tr>`
  ).join('') + '</tbody></table></section>';

(async () => {
  const write = process.argv.includes('--write');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: statements, error: sErr } = await sb.from('nhie_statements')
    .select('id, statement, display_order').eq('active', true)
    .order('display_order', { ascending: true });
  if (sErr) { console.error(sErr.message); process.exit(1); }

  // Batch the aggregate RPC (10 statements per call) — one call for all 93
  // returns ~3000 rows and PostgREST truncates at 1000, silently corrupting
  // the rankings.
  const agg = [];
  for (let i = 0; i < statements.length; i += 10) {
    const ids = statements.slice(i, i + 10).map(s => s.id);
    const { data, error: aErr } = await sb.rpc('nhie_aggregate', { p_statement_ids: ids });
    if (aErr) { console.error(aErr.message); process.exit(1); }
    agg.push(...(data || []));
  }
  console.log('aggregate rows:', agg.length);

  // statement_id -> type -> {have,total}
  const byStmt = {};
  agg.forEach(r => {
    const e = (byStmt[r.statement_id] = byStmt[r.statement_id] || {});
    const t = (e[r.user_type] = e[r.user_type] || { have: 0, total: 0 });
    const n = Number(r.vote_count) || 0;
    t.total += n;
    if (r.answer === 'i_have') t.have += n;
  });

  const pages = []; // { file, slug, html }
  const rankings = []; // for index + records

  for (const s of statements) {
    const phrase = s.statement.replace(/^Never have I ever /i, '');
    const slug = 'most-likely-to-have-' + slugify(phrase);
    const data = byStmt[s.id] || {};
    const ranked = TYPES.map(t => {
      const d = data[t] || { have: 0, total: 0 };
      return { type: t, pct: d.total ? Math.round(100 * d.have / d.total) : 0 };
    }).sort((a, b) => b.pct - a.pct);
    const top = ranked[0], second = ranked[1], third = ranked[2], last = ranked[ranked.length - 1];
    const totalVotes = TYPES.reduce((n, t) => n + ((data[t] || {}).total || 0), 0);
    const globalHave = totalVotes ? Math.round(100 * TYPES.reduce((n, t) => n + ((data[t] || {}).have || 0), 0) / totalVotes) : 0;

    const h1 = `Which Personality Type Is Most Likely to Have ${cap(phrase)}?`;
    const title = pageTitle(phrase);
    const desc = `${top.type} is the MBTI type most likely to have ${phrase} (${top.pct}%), ahead of ${second.type} (${second.pct}%). ${last.type} is least likely. All 16 types ranked.`;
    const body =
      `  <section><h2 id="quick-answer">Quick answer</h2><p><strong><a href="/type/${top.type.toLowerCase()}">${top.type}</a> (The ${NICK[top.type]})</strong> is the personality type most likely to have ${esc(phrase)}, at <strong>${top.pct}%</strong>, followed by <a href="/type/${second.type.toLowerCase()}">${second.type}</a> (${second.pct}%) and <a href="/type/${third.type.toLowerCase()}">${third.type}</a> (${third.pct}%). <a href="/type/${last.type.toLowerCase()}">${last.type}</a> is the least likely at ${last.pct}%. Across all types, ${globalHave}% have.</p></section>\n` +
      rankTable(ranked) + '\n' +
      `  <section><h2 id="why-${top.type.toLowerCase()}-leads">Why ${top.type} leads</h2><p>${top.type}s are ${DESC[top.type]}. ${second.type}s (${DESC[second.type]}) and ${third.type}s (${DESC[third.type]}) round out the top three. At the other end, ${last.type}s are ${DESC[last.type]}.</p><p>Data: personality.fyi’s <a href="/never-have-i-ever">Never Have I Ever</a> polls, where members answer anonymously and every result splits by MBTI type. <a href="/never-have-i-ever">Answer this one yourself →</a></p></section>`;
    const faq = [
      [`Which MBTI type is most likely to have ${phrase}?`, `${top.type} (The ${NICK[top.type]}), at ${top.pct}% in personality.fyi's polling data. ${second.type} (${second.pct}%) and ${third.type} (${third.pct}%) follow.`],
      [`Which MBTI type is least likely to have ${phrase}?`, `${last.type} (The ${NICK[last.type]}), at ${last.pct}%.`],
    ];
    pages.push({ file: path.join(BLOG, slug + '.html'), slug, html: shell({ slug, title, desc, h1, meta: 'Data ranking', bodyHtml: body, faq, breadcrumbName: h1 }) });
    rankings.push({ slug, phrase, ranked, top });
  }

  // Type record pages
  for (const t of TYPES) {
    const most = rankings.filter(r => r.ranked[0].pct > 0 && r.ranked[0].type === t)
      .map(r => ({ ...r, pct: r.ranked[0].pct }));
    const least = rankings.filter(r => r.ranked[r.ranked.length - 1].type === t)
      .map(r => ({ ...r, pct: r.ranked[r.ranked.length - 1].pct }));
    const slug = t.toLowerCase() + '-record';
    const h1 = `The ${t} Record: What ${t}s Have Actually Done`;
    const title = `The ${t} Record: What ${t}s Have Actually Done`;
    const desc = `Of all 16 MBTI types, ${t}s (The ${NICK[t]}) rank #1 on ${most.length} life experiences and last on ${least.length}. The full ${t} record, from polling data.`;
    const li = (r) => `<li style="margin-bottom:6px"><a href="/blog/${r.slug}">${esc(cap(r.phrase))}</a> — <strong>${r.pct}%</strong> of ${t}s have</li>`;
    const body =
      `  <section><p><a href="/type/${t.toLowerCase()}"><strong>${t}</strong></a> (The ${NICK[t]}): ${DESC[t]}. Here is where ${t}s top the charts and where they never go, from personality.fyi’s <a href="/never-have-i-ever">Never Have I Ever</a> polls across all 16 types.</p></section>\n` +
      (most.length ? `  <section><h2 id="most-likely-of-all-types">Most likely of all 16 types to have…</h2><ul class="blog-bullets">${most.map(li).join('')}</ul></section>\n` : '') +
      (least.length ? `  <section><h2 id="least-likely-of-all-types">Least likely of all 16 types to have…</h2><ul class="blog-bullets">${least.map(li).join('')}</ul></section>\n` : '') +
      `  <section><p>Full profile: <a href="/type/${t.toLowerCase()}">${t}, The ${NICK[t]} →</a></p></section>`;
    pages.push({ file: path.join(BLOG, slug + '.html'), slug, html: shell({ slug, title, desc, h1, meta: 'Type record', bodyHtml: body, breadcrumbName: h1 }) });
  }

  // Index page
  {
    const slug = 'most-likely-to';
    const h1 = 'MBTI “Most Likely To” Rankings';
    const title = 'MBTI Most Likely To Rankings: All 16 Types Compared';
    const desc = `${rankings.length} life experiences, every MBTI type ranked on each: skydiving, ghosting, crying in public, negotiating a salary, and more. Live polling data.`;
    const body =
      `  <section><p>Every ranking below comes from personality.fyi’s <a href="/never-have-i-ever">Never Have I Ever</a> polls, where members answer anonymously and every result splits by MBTI type. Pick an experience to see all 16 types ranked, or start with your type’s record.</p></section>\n` +
      `  <section><h2 id="type-records">The type records</h2><p>${TYPES.map(t => `<a href="/blog/${t.toLowerCase()}-record" style="display:inline-block;margin:0 10px 8px 0"><strong>${t}</strong></a>`).join('')}</p></section>\n` +
      `  <section><h2 id="all-rankings">All rankings</h2><ul class="blog-bullets">${rankings.map(r => `<li style="margin-bottom:6px"><a href="/blog/${r.slug}">Most likely to have ${esc(r.phrase)}</a> — ${r.top.type} (${r.ranked[0].pct}%)</li>`).join('')}</ul></section>`;
    pages.push({ file: path.join(BLOG, slug + '.html'), slug, html: shell({ slug, title, desc, h1, meta: 'Data rankings hub', bodyHtml: body, breadcrumbName: h1 }) });
  }

  // Slug collision + existing file check
  const seen = new Set();
  for (const p of pages) {
    if (seen.has(p.slug)) { console.error('SLUG COLLISION:', p.slug); process.exit(1); }
    seen.add(p.slug);
  }
  const clobbers = pages.filter(p => fs.existsSync(p.file) && !write);
  console.log('pages to write:', pages.length, '| already exist:', clobbers.length);

  if (!write) {
    console.log('\nsample slugs:', pages.slice(0, 5).map(p => p.slug).join(', '), '...');
    const sample = pages[0];
    console.log('\n===== SAMPLE PAGE (' + sample.slug + ') =====\n');
    console.log(sample.html.slice(0, 3000));
    console.log('\nDRY RUN. Re-run with --write to emit files + sitemap.');
    return;
  }

  for (const p of pages) fs.writeFileSync(p.file, p.html);
  console.log('wrote', pages.length, 'pages');

  // Sitemap: append any missing URLs before </urlset>
  let sm = fs.readFileSync(SITEMAP, 'utf8');
  let added = 0;
  const entries = pages
    .filter(p => !sm.includes(`https://personality.fyi/blog/${p.slug}</loc>`))
    .map(p => `  <url>\n    <loc>https://personality.fyi/blog/${p.slug}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`);
  added = entries.length;
  sm = sm.replace('</urlset>', entries.join('') + '</urlset>');
  fs.writeFileSync(SITEMAP, sm);
  console.log('sitemap entries added:', added);
})();
