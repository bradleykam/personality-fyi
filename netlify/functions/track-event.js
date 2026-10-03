// Lightweight funnel-event sink. Client posts { event, anonId, props, path }.
// Inserts into the `funnel_events` table if it exists; otherwise logs the event
// to the function log (greppable) so instrumentation works before the table is
// created. To enable querying, create the table once in the Supabase SQL editor:
//
//   create table if not exists funnel_events (
//     id bigint generated always as identity primary key,
//     event text, anon_id text, props jsonb, path text,
//     created_at timestamptz default now()
//   );
//
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(), body: '' };
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors(), body: '' }; }

  if (/^mail_/.test(String(b.event || ''))) return {statusCode:400, headers:cors(), body:'Reserved event'};
  const row = {
    event: String(b.event || '').slice(0, 64),
    anon_id: String(b.anonId || '').slice(0, 64),
    props: b.props && typeof b.props === 'object' ? b.props : {},
    path: String(b.path || '').slice(0, 200),
  };

  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await sb.from('funnel_events').insert(row);
      if (error) console.log('[FUNNEL]', JSON.stringify(row), '| (no table yet:', error.message + ')');
    } else {
      console.log('[FUNNEL]', JSON.stringify(row));
    }
  } catch (e) {
    console.log('[FUNNEL]', JSON.stringify(row), '| err:', e.message);
  }
  return { statusCode: 204, headers: cors(), body: '' };
};

function cors() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
