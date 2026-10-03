// Admin dashboard data. Returns aggregated metrics for qualified (real,
// non-internal) users. Locked to brad@personality.fyi: the caller's Supabase
// JWT is verified server-side and the email is checked before any data is
// returned. The service-role key never leaves the server.
//
// Body: { accessToken }  — the signed-in admin's Supabase JWT.
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const ADMIN_EMAIL = 'brad@personality.fyi';
// Internal / test accounts hidden from the dashboard.
const HIDE_EMAILS = new Set(['bradleykam@gmail.com', 'brad@real.photos', 'info@real.photos', 'brad@personality.fyi']);
const HIDE_DOMAINS = ['real.photos'];

function hidden(email) {
  if (!email) return true;
  const e = email.toLowerCase();
  if (HIDE_EMAILS.has(e)) return true;
  return HIDE_DOMAINS.includes((e.split('@')[1] || ''));
}

async function listAllUsers(sb) {
  const all = [];
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    all.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return all;
}

async function listRows(sb, table, columns, order) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).order(order).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
exports.listRows = listRows;

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

  // Verify the caller and gate on the admin email.
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
  });
  const { data: u, error: uErr } = await auth.auth.getUser();
  if (uErr || !u || !u.user) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid session' }) };
  if ((u.user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Not authorized' }) };
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let users;
  try { users = await listAllUsers(sb); } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }

  // PostgREST caps a response at 1,000 rows; paginate every aggregate source.
  let txns, votes, credits, creators, refs;
  try {
    [txns, votes, credits, creators, refs] = await Promise.all([
      listRows(sb, 'credit_transactions', 'user_id, type, description', 'id'),
      listRows(sb, 'nhie_votes', 'user_id', 'id'),
      listRows(sb, 'user_credits', 'user_id, subscription_status', 'user_id'),
      listRows(sb, 'creators', 'id, user_id', 'id'),
      listRows(sb, 'creator_referrals', 'creator_id', 'id')
    ]);
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Could not load complete account metrics' }) };
  }

  const featureByUser = {}; // user_id -> { career, people, chat, total }
  for (const t of (txns || [])) {
    if (t.type !== 'usage') continue;
    const f = featureByUser[t.user_id] || { career: 0, people: 0, chat: 0, total: 0 };
    f.total++;
    const d = (t.description || '').toLowerCase();
    if (d.includes('career')) f.career++;
    else if (d.includes('compat') || d.includes('guess')) f.people++; // People Match: comparisons + AI type guesses
    else f.chat++; // profile chat, roast/flatter, ask, plus legacy untagged 'AI interaction'
    featureByUser[t.user_id] = f;
  }
  const nhieByUser = {};
  for (const v of (votes || [])) nhieByUser[v.user_id] = (nhieByUser[v.user_id] || 0) + 1;
  const subByUser = {};
  for (const c of (credits || [])) subByUser[c.user_id] = c.subscription_status || null;
  const creatorIdByUser = {};
  for (const c of (creators || [])) creatorIdByUser[c.user_id] = c.id;
  const refsByCreator = {};
  for (const r of (refs || [])) refsByCreator[r.creator_id] = (refsByCreator[r.creator_id] || 0) + 1;

  const rows = [];
  const dau = {}; // 'YYYY-MM-DD' -> distinct active users that day
  const DAY = 86400000;
  const todayUtc = new Date().toISOString().slice(0, 10);
  const cutoff7 = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  let active7 = 0;
  for (const usr of users) {
    if (hidden(usr.email) || usr.user_metadata?.seed === true) continue;
    const md = usr.user_metadata || {};
    const days = Array.isArray(md.session_days) ? md.session_days : [];
    for (const d of days) dau[d] = (dau[d] || 0) + 1;
    if (days.some((d) => d >= cutoff7)) active7++;
    const f = featureByUser[usr.id] || { career: 0, people: 0, chat: 0, total: 0 };
    const cid = creatorIdByUser[usr.id];
    const hasType = !!md.mbti_type;
    const tookTest = hasType && !!md.mbti_percentages; // test saves axis %, manual entry does not
    rows.push({
      id: usr.id,
      email: usr.email,
      signedUp: (usr.created_at || '').slice(0, 10),
      lastSeen: (usr.last_sign_in_at || '').slice(0, 10),
      type: md.mbti_type || null,
      via: hasType ? (tookTest ? 'test' : 'entered') : null,
      subscription: subByUser[usr.id] || null,
      career: f.career,
      people: f.people,
      chatAi: f.chat,
      aiTotal: f.total,
      nhieVotes: nhieByUser[usr.id] || 0,
      sessions: Number(md.session_n) || 0,
      emailsReceived: (md.welcomed ? 1 : 0) + (Number(md.weekly_digest_n) || 0),
      emailClicks: Number(md.email_clicks) || 0,
      referrals: cid ? (refsByCreator[cid] || 0) : 0,
      country: (md.signup_country || '').toUpperCase(),
      unsub: md.digest_unsub === true,
    });
  }
  rows.sort((a, b) => (b.signedUp || '').localeCompare(a.signedUp || ''));

  const summary = {
    qualifiedUsers: rows.length,
    tookTest: rows.filter((r) => r.via === 'test').length,
    enteredType: rows.filter((r) => r.via === 'entered').length,
    paid: rows.filter((r) => r.subscription === 'active').length,
    usedAI: rows.filter((r) => r.aiTotal > 0).length,
    withReferrals: rows.filter((r) => r.referrals > 0).length,
    activeToday: dau[todayUtc] || 0,
    active7d: active7,
  };

  // Last 14 days of DAU, oldest first, zero-filled.
  const dauSeries = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    dauSeries.push({ date: d, count: dau[d] || 0 });
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ summary, users: rows, dauSeries }) };
};
