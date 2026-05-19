/* Edge Function: rewrites <title>, <meta description>, <link canonical> in
 * the SPA shell based on the pretty-URL path, so crawlers see per-route SEO
 * metadata instead of all routes inheriting the home page's <head>.
 *
 * Configured in netlify.toml for these paths only:
 *   /career-planning, /compatibility, /ask-a-type, /take-the-test,
 *   /fictional-characters, /never-have-i-ever, /all-types
 */

const ROUTES = {
  '/career-planning': {
    title: 'Career Planning by Personality Type | Personality.fyi',
    desc:  'AI career advisor calibrated to your MBTI type. Get role recommendations, industry fit, and a path tailored to how you think.',
  },
  '/compatibility': {
    title: 'MBTI Compatibility | Personality.fyi',
    desc:  'Compatibility scores for every MBTI type pair. Romantic, friends, and colleagues calibrated separately.',
  },
  '/ask-a-type': {
    title: 'Ask a Type — MBTI Q&A | Personality.fyi',
    desc:  'Ask questions about any of the 16 MBTI types. AI advisor calibrated to each type\'s cognitive profile.',
  },
  '/take-the-test': {
    title: 'Free MBTI Test | Personality.fyi',
    desc:  'Free 32-item OEJTS personality test. Find your MBTI type in 60 seconds with per-axis confidence scores.',
  },
  '/fictional-characters': {
    title: 'Fictional Characters by MBTI Type | Personality.fyi',
    desc:  'Browse fictional characters grouped by MBTI personality type.',
  },
  '/never-have-i-ever': {
    title: 'Never Have I Ever — MBTI Edition | Personality.fyi',
    desc:  'See how each MBTI type answers life questions in this anonymous polling game.',
  },
  '/all-types': {
    title: 'All 16 MBTI Types | Personality.fyi',
    desc:  'Profiles, strengths, and shadow patterns for every MBTI personality type.',
  },
};

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async (request, context) => {
  const url = new URL(request.url);
  const route = ROUTES[url.pathname];
  if (!route) return;

  const response = await context.next();
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return response;

  let html = await response.text();

  // Build canonical URL for this route.
  const canonical = 'https://personality.fyi' + url.pathname;

  // Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${esc(route.title)}</title>`
  );

  // Replace meta description
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"[^>]*>/i,
    `<meta name="description" content="${esc(route.desc)}">`
  );

  // Replace canonical
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"[^>]*>/i,
    `<link rel="canonical" href="${canonical}">`
  );

  // Also update OG + Twitter title/desc/url for richer social previews
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"[^>]*>/i,
    `<meta property="og:title" content="${esc(route.title)}">`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"[^>]*>/i,
    `<meta property="og:description" content="${esc(route.desc)}">`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"[^>]*>/i,
    `<meta property="og:url" content="${canonical}">`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"[^>]*>/i,
    `<meta name="twitter:title" content="${esc(route.title)}">`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"[^>]*>/i,
    `<meta name="twitter:description" content="${esc(route.desc)}">`
  );

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
};

export const config = {
  path: [
    '/career-planning',
    '/compatibility',
    '/ask-a-type',
    '/take-the-test',
    '/fictional-characters',
    '/never-have-i-ever',
    '/all-types',
  ],
};
