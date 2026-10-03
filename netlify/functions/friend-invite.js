// Get-or-create a personal invite link for the signed-in user (no form).
// Body: { accessToken }  — the user's Supabase JWT.
// Returns: { slug, link } where link is https://personality.fyi/from/<slug>.
//
// Reuses the `creators` table: a "creator" here is just a person who invites
// friends. If the user already has a row, returns it; otherwise auto-generates
// a slug from their name/email plus a short random suffix.
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function baseSlug(user) {
  const md = user.user_metadata || {};
  const raw = md.full_name || md.name || (user.email || '').split('@')[0] || 'friend';
  const s = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  return s.length >= 3 ? s : 'friend';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const accessToken = String(body.accessToken || '');
  if (!accessToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Not signed in' }) };

  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
  });
  const { data: u, error: uErr } = await auth.auth.getUser();
  if (uErr || !u || !u.user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid session' }) };
  const user = u.user;

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Already have an invite link?
  const { data: existing } = await admin.from('creators').select('slug').eq('user_id', user.id).maybeSingle();
  if (existing && existing.slug) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ slug: existing.slug, link: 'https://personality.fyi/from/' + existing.slug }) };
  }

  // Generate a unique slug.
  const base = baseSlug(user);
  let slug = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: clash } = await admin.from('creators').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = base + '-' + Math.random().toString(36).slice(2, 6);
  }

  const md = user.user_metadata || {};
  const displayName = String(md.full_name || md.name || (user.email || '').split('@')[0] || 'A friend').slice(0, 80);

  const { data: row, error } = await admin.from('creators')
    .insert({ user_id: user.id, display_name: displayName, slug, email: user.email })
    .select().single();
  if (error) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ slug: row.slug, link: 'https://personality.fyi/from/' + row.slug }) };
};
