// Creates a creator record and flips auth.users metadata.is_creator = true.
// Body: { displayName, slug, email, websiteUrl?, accessToken } where accessToken is the user's Supabase JWT.
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

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
  const displayName = String(body.displayName || '').trim().slice(0, 80);
  const slug = String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const websiteUrl = body.websiteUrl ? String(body.websiteUrl).trim().slice(0, 300) : null;

  if (!accessToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Not signed in' }) };
  if (!displayName || !slug || !email) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'displayName, slug, and email required' }) };
  }
  if (slug.length < 3) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Slug must be at least 3 chars' }) };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid email' }) };

  // Resolve user from JWT.
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: 'Bearer ' + accessToken } }
  });
  const { data: u, error: uErr } = await auth.auth.getUser();
  if (uErr || !u || !u.user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid session' }) };

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Slug collision check.
  const { data: clash } = await admin.from('creators').select('id, user_id').eq('slug', slug).maybeSingle();
  if (clash && clash.user_id !== u.user.id) {
    return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: 'Slug already taken' }) };
  }

  let row;
  if (clash && clash.user_id === u.user.id) {
    // Update existing record
    const { data, error } = await admin.from('creators')
      .update({ display_name: displayName, email, website_url: websiteUrl })
      .eq('id', clash.id).select().single();
    if (error) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };
    row = data;
  } else {
    const { data, error } = await admin.from('creators')
      .insert({ user_id: u.user.id, display_name: displayName, slug, email, website_url: websiteUrl })
      .select().single();
    if (error) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };
    row = data;
  }

  // Flip is_creator on user metadata via admin API.
  try {
    await admin.auth.admin.updateUserById(u.user.id, { user_metadata: { ...(u.user.user_metadata || {}), is_creator: true } });
  } catch (e) { /* non-fatal */ }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, slug: row.slug, link: 'https://personality.fyi/from/' + row.slug }) };
};
