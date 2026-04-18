// Submits a Never Have I Ever vote and returns the updated aggregated result for that statement.
//
// Body: { userId, userType, statementId, answer: 'i_have'|'i_never_have' }
// Returns: { result: { byType, total, globalHavePct } }
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const VALID_TYPES = new Set([
  'INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'
]);

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, userType, statementId, answer } = body;
    if (!userId || !userType || !statementId || !answer) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId, userType, statementId, or answer' }) };
    }
    if (answer !== 'i_have' && answer !== 'i_never_have') {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid answer' }) };
    }
    if (!VALID_TYPES.has(userType)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid userType' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Insert vote with a single retry on transient errors.
    // 23505 = unique_violation (user already voted) — that's fine, their prior vote stands.
    let inserted = false;
    let lastInsertErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: insertErr } = await supabase
        .from('nhie_votes')
        .insert({
          statement_id: statementId,
          user_id: userId,
          answer: answer,
          user_type: userType
        });
      if (!insertErr || insertErr.code === '23505') {
        inserted = true;
        break;
      }
      lastInsertErr = insertErr;
      console.warn('nhie-vote insert attempt', attempt + 1, 'failed:', insertErr.message, insertErr.code);
      // brief backoff before retry
      await new Promise(r => setTimeout(r, 250));
    }
    if (!inserted) {
      console.error('nhie-vote insert failed after retries:', lastInsertErr);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: (lastInsertErr && lastInsertErr.message) || 'insert_failed' }) };
    }

    // Fetch updated aggregate for this statement — best effort. If the aggregation
    // errors or times out, the vote is still saved and we return success; the client
    // re-fetches on next page load.
    let result = null;
    try {
      const { data: agg, error: aErr } = await supabase
        .rpc('nhie_aggregate', { p_statement_ids: [statementId] });
      if (aErr) throw aErr;
      result = buildOne(agg || []);
    } catch (aggErr) {
      console.warn('nhie-vote aggregate failed (vote still saved):', aggErr.message);
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ result, saved: true })
    };
  } catch (err) {
    console.error('nhie-vote error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

function buildOne(rows) {
  const entry = { byType: {}, total: 0, totalHave: 0 };
  rows.forEach(r => {
    if (!entry.byType[r.user_type]) entry.byType[r.user_type] = { have: 0, neverHave: 0, total: 0 };
    const n = Number(r.vote_count) || 0;
    if (r.answer === 'i_have') entry.byType[r.user_type].have += n;
    else entry.byType[r.user_type].neverHave += n;
    entry.byType[r.user_type].total += n;
    entry.total += n;
    if (r.answer === 'i_have') entry.totalHave += n;
  });
  Object.keys(entry.byType).forEach(t => {
    const b = entry.byType[t];
    b.havePct = b.total > 0 ? Math.round((b.have / b.total) * 100) : 0;
  });
  entry.globalHavePct = entry.total > 0 ? Math.round((entry.totalHave / entry.total) * 100) : 0;
  return entry;
}
