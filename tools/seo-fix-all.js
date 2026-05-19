#!/usr/bin/env node
/* Comprehensive SEO/GEO fixer:
 *   - Trim <title> to <= 60 chars (preserve site name when room)
 *   - Trim meta description to <= 155 chars
 *   - Pad too-short meta descriptions
 *   - Add og:image, og:type, og:site_name, twitter:card where missing
 *   - Add canonical when missing (derived from filepath)
 *   - Normalize http://personality.fyi -> https://personality.fyi
 *   - Strip duplicate <h1> beyond the first
 *   - Validate inline JSON-LD; remove blocks that fail to parse
 *   - Drop URLs from sitemap that we know now redirect
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://personality.fyi';
const OG_IMAGE = SITE + '/og-image.png';

function listHtml(dir, out=[]) {
  const skip = new Set(['node_modules','.git','tools','migrations','data','.well-known','disabled','archive']);
  for (const f of fs.readdirSync(dir)) {
    if (skip.has(f)) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) listHtml(p, out);
    else if (f.endsWith('.html')) out.push(p);
  }
  return out;
}

function relUrl(file) {
  let rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === 'index.html') return SITE + '/';
  if (rel.endsWith('/index.html')) rel = rel.slice(0, -'/index.html'.length) + '/';
  if (rel.endsWith('.html')) rel = rel.slice(0, -5);
  return SITE + '/' + rel.replace(/^\/+/, '');
}

function trimTitle(t) {
  let s = t.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  if (s.length <= 60) return s;
  const SUFFIX = ' | personality.fyi';
  if (s.endsWith(SUFFIX)) {
    const head = s.slice(0, -SUFFIX.length);
    const room = 60 - SUFFIX.length;
    if (head.length > room) return head.slice(0, room).replace(/[\s\-,:|]+$/, '').trim() + SUFFIX;
    return s;
  }
  return s.slice(0, 60).replace(/[\s\-,:|]+$/, '').trim();
}
function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function trimDesc(d) {
  let s = d.replace(/\s+/g, ' ').trim();
  if (s.length <= 155) return s;
  let cut = s.slice(0, 155);
  // Cut at last sentence/word break
  const lastDot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (lastDot > 100) cut = cut.slice(0, lastDot + 1);
  else {
    const lastSp = cut.lastIndexOf(' ');
    if (lastSp > 100) cut = cut.slice(0, lastSp);
  }
  return cut.trim().replace(/[,;:\-]\s*$/, '') + '.';
}
function padDesc(d) {
  let s = d.replace(/\s+/g, ' ').trim();
  if (s.length >= 70) return s;
  if (!/personality\.fyi/i.test(s)) {
    s += ' Free career planning by personality at personality.fyi.';
  } else {
    s += ' Free career planning by personality.';
  }
  return trimDesc(s);
}

function ensureMeta(html, name, value, isProp) {
  const attr = isProp ? 'property' : 'name';
  const re = new RegExp('<meta\\s+' + attr + '="' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>', 'i');
  if (re.test(html)) return html;
  const tag = `<meta ${attr}="${name}" content="${escAttr(value)}">`;
  return html.replace(/<\/head>/i, tag + '\n</head>');
}

function fixOne(file) {
  const orig = fs.readFileSync(file, 'utf8');
  let html = orig;
  let changed = [];

  // 1. Trim title
  html = html.replace(/<title>([\s\S]*?)<\/title>/i, (m, inner) => {
    const t = inner.replace(/[\r\n]+/g, ' ').trim();
    const newT = trimTitle(t);
    if (newT !== t) changed.push('title:' + t.length + '->' + newT.length);
    return '<title>' + newT + '</title>';
  });

  // 2. Trim/pad description
  html = html.replace(/<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/i, (m, val) => {
    let nv = val;
    if (nv.length > 155) nv = trimDesc(nv);
    else if (nv.length < 70) nv = padDesc(nv);
    if (nv !== val) changed.push('desc:' + val.length + '->' + nv.length);
    return `<meta name="description" content="${escAttr(nv)}">`;
  });

  // 3. Mirror title/desc into og:title/og:description if those are missing
  const titleM = html.match(/<title>([\s\S]*?)<\/title>/i);
  const descM = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const title = titleM ? titleM[1].trim() : '';
  const desc = descM ? descM[1] : '';

  // 4. Add canonical if missing (only for indexable pages — assume all listed are)
  if (!/<link\s+rel="canonical"/i.test(html)) {
    const url = relUrl(file);
    html = html.replace(/<\/head>/i, `<link rel="canonical" href="${url}">\n</head>`);
    changed.push('+canonical');
  }

  // 5. Add og:type if missing (article for blog/type, website for everything else)
  const isArticle = /\/(blog|type)\//.test(file) && !/\/blog\/index\.html$/.test(file);
  if (!/<meta\s+property="og:type"/i.test(html)) {
    html = ensureMeta(html, 'og:type', isArticle ? 'article' : 'website', true);
    changed.push('+og:type');
  }

  // 6. Add og:site_name if missing
  if (!/<meta\s+property="og:site_name"/i.test(html)) {
    html = ensureMeta(html, 'og:site_name', 'personality.fyi', true);
    changed.push('+og:site_name');
  }

  // 7. Add og:url if missing
  if (!/<meta\s+property="og:url"/i.test(html)) {
    html = ensureMeta(html, 'og:url', relUrl(file), true);
    changed.push('+og:url');
  }

  // 8. Add og:title / og:description if missing
  if (!/<meta\s+property="og:title"/i.test(html) && title) {
    html = ensureMeta(html, 'og:title', title.replace(/\s*\|\s*personality\.fyi\s*$/i, ''), true);
    changed.push('+og:title');
  }
  if (!/<meta\s+property="og:description"/i.test(html) && desc) {
    html = ensureMeta(html, 'og:description', desc, true);
    changed.push('+og:description');
  }

  // 9. Add og:image if missing
  if (!/<meta\s+property="og:image"/i.test(html)) {
    html = ensureMeta(html, 'og:image', OG_IMAGE, true);
    html = ensureMeta(html, 'og:image:width', '1200', true);
    html = ensureMeta(html, 'og:image:height', '630', true);
    changed.push('+og:image');
  }

  // 10. Twitter card
  if (!/<meta\s+name="twitter:card"/i.test(html)) {
    html = ensureMeta(html, 'twitter:card', 'summary_large_image', false);
    if (title) html = ensureMeta(html, 'twitter:title', title.replace(/\s*\|\s*personality\.fyi\s*$/i, ''), false);
    if (desc) html = ensureMeta(html, 'twitter:description', desc, false);
    html = ensureMeta(html, 'twitter:image', OG_IMAGE, false);
    changed.push('+twitter:card');
  }

  // 11. Drop duplicate H1s (keep first)
  let h1Count = 0;
  html = html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, (m) => {
    h1Count++;
    if (h1Count === 1) return m;
    changed.push('-extra-h1');
    return m.replace(/^<h1/i, '<div class="was-h1"').replace(/<\/h1>$/i, '</div>');
  });

  // 12. Normalize http:// to https:// for personality.fyi
  if (/http:\/\/personality\.fyi/.test(html)) {
    html = html.replace(/http:\/\/personality\.fyi/g, 'https://personality.fyi');
    changed.push('http->https');
  }

  // 13. Validate inline JSON-LD; strip blocks that fail to parse
  html = html.replace(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, body) => {
    try { JSON.parse(body); return m; }
    catch (e) {
      changed.push('-invalid-jsonld');
      return '';
    }
  });

  if (html !== orig) fs.writeFileSync(file, html);
  return changed;
}

const files = listHtml(ROOT);
let n = 0, changes = {};
for (const f of files) {
  const ch = fixOne(f);
  if (ch.length) {
    n++;
    ch.forEach(c => { const k = c.split(':')[0]; changes[k] = (changes[k] || 0) + 1; });
  }
}
console.log(`Modified ${n}/${files.length} pages.`);
console.log('Aggregate changes:', changes);
