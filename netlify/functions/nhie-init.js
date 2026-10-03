// Returns everything the Never Have I Ever page needs in one call:
//   - active statements with answers, ranked by answer count
//   - the current user's own votes (if any)
//   - aggregated results per statement + per type (for statements the user has answered)
//
// Body: { userId?: string }   // optional; if omitted, returns statements only
// Returns: { statements: [...], yourVotes: { [id]: 'i_have'|'i_never_have' }, results: { [id]: { byType: {...}, total } } }
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const userId = body.userId || null;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch active statements
    const { data: statements, error: sErr } = await supabase
      .from('nhie_statements')
      .select('id, statement, display_order')
      .eq('active', true)
      .order('display_order', { ascending: true });
    if (sErr) throw sErr;

    // 2. Fetch the user's own votes (if logged in)
    let yourVotes = {};
    let answeredIds = [];
    if (userId) {
      const { data: votes, error: vErr } = await supabase
        .from('nhie_votes')
        .select('statement_id, answer')
        .eq('user_id', userId);
      if (vErr) throw vErr;
      (votes || []).forEach(v => {
        yourVotes[v.statement_id] = v.answer;
        answeredIds.push(v.statement_id);
      });
    }

    // Count both answers across all types. Small batches stay below the
    // API row cap (20 statements × 16 types × 2 answers = 640 rows).
    const aggregates = [];
    const active = statements || [];
    for (let i = 0; i < active.length; i += 20) {
      const { data: agg, error: aErr } = await supabase
        .rpc('nhie_aggregate', { p_statement_ids: active.slice(i, i + 20).map(s => s.id) });
      if (aErr) throw aErr;
      aggregates.push(...(agg || []));
    }
    const allResults = buildResults(aggregates);
    const ranked = active.map(s => ({ ...s, answer_count: allResults[s.id]?.total || 0 }))
      .filter(s => s.answer_count > 0)
      .sort((a, b) => b.answer_count - a.answer_count || a.display_order - b.display_order || a.id.localeCompare(b.id));
    // Publish counts for everyone; preserve the existing result-reveal rule.
    const results = {};
    answeredIds.forEach(id => { if (allResults[id]) results[id] = allResults[id]; });

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statements: ranked, yourVotes, results })
    };
  } catch (err) {
    console.error('nhie-init error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

function buildResults(rows) {
  const map = {};
  rows.forEach(r => {
    if (!map[r.statement_id]) map[r.statement_id] = { byType: {}, total: 0, totalHave: 0 };
    const entry = map[r.statement_id];
    if (!entry.byType[r.user_type]) entry.byType[r.user_type] = { have: 0, neverHave: 0, total: 0 };
    const n = Number(r.vote_count) || 0;
    if (r.answer === 'i_have') entry.byType[r.user_type].have += n;
    else entry.byType[r.user_type].neverHave += n;
    entry.byType[r.user_type].total += n;
    entry.total += n;
    if (r.answer === 'i_have') entry.totalHave += n;
  });
  // Compute percentages
  Object.keys(map).forEach(id => {
    const entry = map[id];
    Object.keys(entry.byType).forEach(t => {
      const b = entry.byType[t];
      b.havePct = b.total > 0 ? Math.round((b.have / b.total) * 100) : 0;
    });
    entry.globalHavePct = entry.total > 0 ? Math.round((entry.totalHave / entry.total) * 100) : 0;
  });
  return map;
}
