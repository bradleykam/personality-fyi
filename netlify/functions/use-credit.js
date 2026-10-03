// Unified monthly AI allowance (Phase 1, S52-53).
//
// One pool for every AI surface. A question is consumed ONLY when a request
// successfully produced a usable response (the client calls mode 'consume'
// after a 200 from the AI proxy). 'check' is read-only and free.
//
// Body: { userId, mode: 'check' | 'consume', description? }
// Legacy bodies ({ userId, cost }) are treated as 'check' so stale cached
// clients keep working through the transition without double-charging.
//
// Storage: user_metadata.ai_month ('YYYY-MM') + ai_used (count), reset lazily
// when the month rolls over. subscription_status still lives in user_credits.
// Limits are env-configurable: AI_FREE_MONTHLY (default 15) and
// AI_SUB_MONTHLY (default 300).
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function monthKey(d) { return d.toISOString().slice(0, 7); }
function resetsOn(d) {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return n.toISOString().slice(0, 10);
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const userId = body.userId;
    if (!userId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId' }) };
    const mode = body.mode === 'consume' ? 'consume' : 'check';

    const FREE = Number(process.env.AI_FREE_MONTHLY) || 15;
    const SUB = Number(process.env.AI_SUB_MONTHLY) || 300;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: ud, error: uErr } = await supabase.auth.admin.getUserById(userId);
    if (uErr || !ud || !ud.user) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'user not found' }) };
    const md = ud.user.user_metadata || {};

    const { data: cred } = await supabase.from('user_credits')
      .select('subscription_status').eq('user_id', userId).maybeSingle();
    if (!cred) {
      const { error: seedErr } = await supabase.from('user_credits')
        .insert({ user_id: userId, balance: 0, subscription_status: 'none' });
      if (seedErr && seedErr.code !== '23505') { /* non-fatal */ }
    }
    const subStatus = (cred && cred.subscription_status) || 'none';
    const limit = subStatus === 'active' ? SUB : FREE;

    const now = new Date();
    const mk = monthKey(now);
    let used = (md.ai_month === mk) ? (Number(md.ai_used) || 0) : 0;
    let remaining = Math.max(0, limit - used);

    const payload = () => ({
      remaining, limit, used, month: mk, resetsOn: resetsOn(now),
      subscription_status: subStatus,
      // Legacy display compatibility: stale clients show balance/2000.
      balance: remaining * 2000,
    });

    if (mode === 'check') {
      if (remaining <= 0) {
        return { statusCode: 402, headers: CORS, body: JSON.stringify(Object.assign({ error: 'ai_limit_reached' }, payload())) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify(payload()) };
    }

    // consume: one successful AI response.
    if (remaining <= 0) {
      return { statusCode: 402, headers: CORS, body: JSON.stringify(Object.assign({ error: 'ai_limit_reached' }, payload())) };
    }
    used += 1;
    remaining = Math.max(0, limit - used);
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...md, ai_month: mk, ai_used: used },
    });
    // Ledger row keeps the admin per-feature AI columns working unchanged.
    supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: -2000,
      type: 'usage',
      description: String(body.description || 'ai'),
    }).then(({ error }) => { if (error) console.error('credit_transactions insert error:', error); });

    return { statusCode: 200, headers: CORS, body: JSON.stringify(payload()) };
  } catch (err) {
    console.error('use-credit error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
