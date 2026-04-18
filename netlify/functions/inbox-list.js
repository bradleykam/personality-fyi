// Returns the user's inbox items (pending and optionally done).
// Gated by email allowlist.
//
// Body: { userId, includeDone?: bool }
// Returns: { items: [{id, body, status, created_at, completed_at}] }
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED_EMAILS = new Set(['bradleykam@gmail.com']);

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  try {
    const { userId, includeDone } = JSON.parse(event.body || '{}');
    if (!userId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(userId);
    if (uErr || !userData?.user || !ALLOWED_EMAILS.has(userData.user.email)) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    let q = supabase
      .from('claude_inbox')
      .select('id, body, status, created_at, completed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!includeDone) q = q.eq('status', 'pending');

    const { data, error } = await q;
    if (error) throw error;

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: data || [] })
    };
  } catch (err) {
    console.error('inbox-list error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
