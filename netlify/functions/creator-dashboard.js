// Returns the signed-in user's creator record + their referrals.
// Headers: Authorization: Bearer <supabase access token>
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  const auth = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!auth) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Missing auth' }) };

  const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: 'Bearer ' + auth } }
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u || !u.user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid session' }) };

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: creator, error: cErr } = await admin.from('creators')
    .select('id, slug, display_name, email, website_url, last_digest_sent_at, first_digest_sent, created_at')
    .eq('user_id', u.user.id).maybeSingle();
  if (cErr) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: cErr.message }) };
  if (!creator) return { statusCode: 200, headers: CORS, body: JSON.stringify({ creator: null }) };

  const { data: refs, error: rErr } = await admin.from('creator_referrals')
    .select('id, mbti_type, consented, completed_at, created_at, follower_email')
    .eq('creator_id', creator.id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (rErr) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: rErr.message }) };

  const counts = {};
  let totalConsented = 0, totalAnon = 0;
  (refs || []).forEach(r => {
    if (r.consented && r.mbti_type) {
      counts[r.mbti_type] = (counts[r.mbti_type] || 0) + 1;
      totalConsented++;
    } else if (!r.consented) totalAnon++;
  });
  const breakdown = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count, pct: Math.round(count / Math.max(totalConsented, 1) * 100) }));

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      creator: {
        slug: creator.slug,
        displayName: creator.display_name,
        email: creator.email,
        websiteUrl: creator.website_url,
        link: 'https://personality.fyi/from/' + creator.slug,
        createdAt: creator.created_at,
        lastDigestSentAt: creator.last_digest_sent_at,
        firstDigestSent: !!creator.first_digest_sent
      },
      stats: { totalConsented, totalAnon, total: (refs || []).length },
      breakdown,
      recent: (refs || []).slice(0, 50).map(r => ({
        id: r.id,
        type: r.consented ? r.mbti_type : null,
        consented: !!r.consented,
        followerEmail: r.consented ? (r.follower_email || null) : null,
        completedAt: r.completed_at,
        createdAt: r.created_at
      }))
    })
  };
};
