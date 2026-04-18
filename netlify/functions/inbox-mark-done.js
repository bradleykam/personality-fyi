// Marks an inbox item as done. Gated by email allowlist.
// Body: { userId, id }
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
    const { userId, id } = JSON.parse(event.body || '{}');
    if (!userId || !id) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId or id' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: uErr } = await supabase.auth.admin.getUserById(userId);
    if (uErr || !userData?.user || !ALLOWED_EMAILS.has(userData.user.email)) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    const { error } = await supabase
      .from('claude_inbox')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId); // belt-and-suspenders: can only update your own
    if (error) throw error;

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('inbox-mark-done error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
