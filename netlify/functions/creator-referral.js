// Records a follower referral against a creator slug.
// Body: { creatorSlug, sessionId, consented:bool, mbtiType?:string }
// De-dupes per (creator, session) so refresh/repeats don't double-count.
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

  const creatorSlug = String(body.creatorSlug || '').trim().toLowerCase();
  const sessionId = String(body.sessionId || '').trim();
  const consented = !!body.consented;
  const mbtiType = consented ? String(body.mbtiType || '').toUpperCase().slice(0, 4) : null;
  const followerEmailRaw = String(body.followerEmail || '').trim().toLowerCase();
  const followerEmail = (consented && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(followerEmailRaw)) ? followerEmailRaw : null;

  if (!creatorSlug || !sessionId) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'creatorSlug and sessionId required' }) };
  }
  if (consented && !/^(I|E)(N|S)(T|F)(J|P)$/.test(mbtiType)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid mbtiType' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: creator, error: cErr } = await supabase
    .from('creators').select('id').eq('slug', creatorSlug).single();
  if (cErr || !creator) {
    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Creator not found' }) };
  }

  // Dedup on (creator_id, session_id)
  const { data: existing } = await supabase
    .from('creator_referrals')
    .select('id')
    .eq('creator_id', creator.id)
    .eq('session_id', sessionId)
    .maybeSingle();
  if (existing) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, duplicate: true }) };
  }

  // Best-effort: silent-create a Supabase auth user from the email so they can later log in
  // via magic link and see their own result. We never send a welcome email here.
  let followerUserId = null;
  if (followerEmail) {
    try {
      // Look up by email if available; otherwise create.
      // listUsers does not filter by email server-side in older clients, so just attempt to create.
      const { data: created, error: cuErr } = await supabase.auth.admin.createUser({
        email: followerEmail,
        email_confirm: true,
        user_metadata: { source: 'creator_referral', creator_slug: creatorSlug, mbti_type: mbtiType }
      });
      if (created && created.user) followerUserId = created.user.id;
      else if (cuErr && /already/i.test(cuErr.message || '')) {
        // Already exists — leave followerUserId null; admin lookup by email isn't always supported.
      }
    } catch (_) { /* non-fatal */ }
  }

  const { error: iErr } = await supabase.from('creator_referrals').insert({
    creator_id: creator.id,
    session_id: sessionId,
    consented,
    mbti_type: mbtiType,
    follower_email: followerEmail,
    follower_user_id: followerUserId,
    completed_at: consented ? new Date().toISOString() : null
  });
  if (iErr) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: iErr.message }) };
  }
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
};
