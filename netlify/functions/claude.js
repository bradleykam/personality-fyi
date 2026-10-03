// Anthropic proxy. Login gated: every call must carry a valid Supabase session
// (Authorization: Bearer <access_token>). Anonymous requests are rejected before
// the Anthropic key is ever used. This closes the previously open proxy so tokens
// can only be spent by a signed-in user.
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Build-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  // Build-tool bypass: local content generators (tools/) send a shared secret
  // instead of a user session. Anything else must be a signed-in Supabase user.
  const buildSecret = event.headers['x-build-secret'] || event.headers['X-Build-Secret'] || '';
  const isBuildTool = !!process.env.CLAUDE_RUN_SECRET && buildSecret === process.env.CLAUDE_RUN_SECRET;

  // Require a signed-in Supabase user (unless build-tool bypass).
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!isBuildTool && !token) {
    return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Sign in required.' } }) };
  }
  if (!isBuildTool) {
    if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Auth not configured.' } }) };
    }
    try {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data || !data.user) {
        return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: { message: 'Invalid or expired session.' } }) };
      }
    } catch (e) {
      return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Auth check failed.' } }) };
    }
  }

  try {
    const body = JSON.parse(event.body);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { statusCode: response.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: { message: err.message } }) };
  }
};
