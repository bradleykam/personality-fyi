// Receives Resend webhook events (email.clicked, email.opened) and records them
// on the matching user so the admin dashboard can show engagement.
// Stored in user_metadata: email_clicks, email_opens, last_click_link, last_click_at.
//
// Set this URL in Resend → Webhooks, subscribed to email.clicked (and optionally
// email.opened). Click data is non-sensitive, so signature verification is
// optional; if RESEND_WEBHOOK_SECRET is set we could verify, but counts being
// forged would only inflate a number, not leak anything.
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') return { statusCode: 200, body: 'ok' }; // Resend test ping
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 200, body: 'not configured' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 200, body: 'bad json' }; }

  const type = body.type || '';
  const data = body.data || {};
  const to = Array.isArray(data.to) ? data.to[0] : (data.to || data.email || '');
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient || (type !== 'email.clicked' && type !== 'email.opened')) {
    return { statusCode: 200, body: 'ignored' };
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Find the user by email (small user base; list and match).
  let user = null;
  try {
    let page = 1;
    for (;;) {
      const { data: d, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      user = d.users.find((u) => (u.email || '').toLowerCase() === recipient);
      if (user || d.users.length < 1000) break;
      page++;
    }
  } catch (_) { /* ignore */ }
  if (!user) return { statusCode: 200, body: 'no user' };

  const md = user.user_metadata || {};
  const patch = { ...md };
  if (type === 'email.clicked') {
    patch.email_clicks = (Number(md.email_clicks) || 0) + 1;
    patch.last_click_at = new Date().toISOString();
    if (data.click && data.click.link) patch.last_click_link = String(data.click.link).slice(0, 300);
  } else if (type === 'email.opened') {
    patch.email_opens = (Number(md.email_opens) || 0) + 1;
  }
  try { await sb.auth.admin.updateUserById(user.id, { user_metadata: patch }); }
  catch (_) { /* ignore */ }

  return { statusCode: 200, body: 'ok' };
};
