// Adds a task to the Claude inbox queue.
// Gated by a hardcoded email allowlist server-side so only the admin can use this.
//
// Body: { userId, body }
// Returns: { id } on success, 403 if user is not in the allowlist.
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Only these emails may read/write the Claude inbox.
const ALLOWED_EMAILS = new Set(['bradleykam@gmail.com']);

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  try {
    const { userId, body } = JSON.parse(event.body || '{}');
    if (!userId || !body || typeof body !== 'string') {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId or body' }) };
    }
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 5000) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'body empty or too long' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Verify the userId belongs to an allowlisted email
    const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(userId);
    if (uErr || !userData?.user || !ALLOWED_EMAILS.has(userData.user.email)) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const { data, error } = await supabase
      .from('claude_inbox')
      .insert({ user_id: userId, body: trimmed })
      .select('id, created_at')
      .single();
    if (error) throw error;

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data.id, created_at: data.created_at })
    };
  } catch (err) {
    console.error('inbox-add error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
