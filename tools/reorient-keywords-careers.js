#!/usr/bin/env node
// Re-anchor SEO/GEO meta on every /type/{code}.html and /blog/{type}-personality.html
// to lead with the career-planning angle (the platform's primary use case).
const fs = require('fs');
const path = require('path');

const TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const TITLES = { INTJ:'The Architect',INTP:'The Logician',ENTJ:'The Commander',ENTP:'The Debater',INFJ:'The Advocate',INFP:'The Mediator',ENFJ:'The Protagonist',ENFP:'The Campaigner',ISTJ:'The Logistician',ISFJ:'The Defender',ESTJ:'The Executive',ESFJ:'The Consul',ISTP:'The Virtuoso',ISFP:'The Adventurer',ESTP:'The Entrepreneur',ESFP:'The Entertainer' };

function shortDesc(t) {
  return `Free career planning for ${t} (${TITLES[t]}): top-fit careers, skills to learn, live job listings, plus friendship and romantic compatibility. Take the free 60-second test.`;
}
function longDesc(t) {
  return `${t} (${TITLES[t]}) free career planning guide: best careers, skills to develop, common career pivots, and live job listings calibrated to ${t} cognitive wiring. Also covers friendship and romantic compatibility, traits, and the free 60-second personality test.`;
}
function keywords(t) {
  return `${t} careers, free career planning ${t}, best careers for ${t}, jobs for ${t}, ${t} career change, ${t} career advice, MBTI ${t} careers, what should ${t} do for work, ${t} compatibility, ${t} friendships, ${t} romantic compatibility, ${t} dating, ${t} relationships, AI career advisor`;
}

function patch(file, t, isBlog) {
  let html = fs.readFileSync(file, 'utf8');
  const titleNew = isBlog
    ? `${t} Free Career Planning, Best Jobs &amp; Compatibility (${TITLES[t]}) | personality.fyi`
    : `${t} Free Career Planning, Careers &amp; Compatibility | personality.fyi`;
  const descNew = isBlog ? longDesc(t) : shortDesc(t);

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${titleNew}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${descNew}">`
  );
  // Inject keywords meta if missing.
  if (!/<meta name="keywords"/.test(html)) {
    html = html.replace(
      /(<meta name="description"[^>]*>)/,
      `$1\n<meta name="keywords" content="${keywords(t)}">`
    );
  } else {
    html = html.replace(
      /<meta name="keywords" content="[^"]*">/,
      `<meta name="keywords" content="${keywords(t)}">`
    );
  }
  // Refresh og:title and og:description
  html = html.replace(
    /<meta property="og:title" content="[^"]*">/,
    `<meta property="og:title" content="${isBlog ? `${t} Free Career Planning, Best Jobs & Compatibility (${TITLES[t]})` : `${t} Free Career Planning, Careers & Compatibility`}">`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${descNew}">`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*">/,
    `<meta name="twitter:title" content="${isBlog ? `${t} Free Career Planning — ${TITLES[t]}` : `${t} Free Career Planning, Careers & Compatibility`}">`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${descNew}">`
  );

  fs.writeFileSync(file, html);
}

const tDir = path.join(__dirname, '..', 'type');
const bDir = path.join(__dirname, '..', 'blog');
let n = 0;
for (const t of TYPES) {
  const tf = path.join(tDir, t.toLowerCase() + '.html');
  if (fs.existsSync(tf)) { patch(tf, t, false); n++; }
  const bf = path.join(bDir, t.toLowerCase() + '-personality.html');
  if (fs.existsSync(bf)) { patch(bf, t, true); n++; }
}
console.log(`Reoriented keywords on ${n} pages.`);
