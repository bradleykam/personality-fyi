// Invitation verification loop. When an invited person finishes the test via
// a personal link carrying ?for=<personId> and consents to sharing, this
// updates the inviter's matching person record to the verified type, queues
// the "Sarah finished the test" notice (in-app banner + lifecycle email C),
// and logs an estimated_person_verified event.
//
// Body: { slug, forPerson, type, consented }
// Unauthenticated by design (the invitee has no account yet). Blast radius is
// bounded: it can only set a whitelisted 4-letter type on a person record the
// inviter created with an invitation attached, never create/delete anything.
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'not configured' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const slug = String(body.slug || '').trim().toLowerCase();
  const forPerson = String(body.forPerson || '').trim().slice(0, 40);
  const type = String(body.type || '').toUpperCase().slice(0, 4);
  const consented = !!body.consented;
  if (!slug || !forPerson) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'slug and forPerson required' }) };
  if (!consented) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, updated: false, reason: 'no consent' }) };
  if (!/^(I|E)(N|S)(T|F)(J|P)$/.test(type)) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'invalid type' }) };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: creator } = await sb.from('creators').select('user_id').eq('slug', slug).maybeSingle();
  if (!creator || !creator.user_id) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, updated: false, reason: 'unknown inviter' }) };

  const { data: ud, error: uErr } = await sb.auth.admin.getUserById(creator.user_id);
  if (uErr || !ud || !ud.user) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, updated: false, reason: 'inviter missing' }) };
  const user = ud.user;
  const md = user.user_metadata || {};
  const people = Array.isArray(md.people) ? md.people.slice() : [];
  const idx = people.findIndex((p) => p && p.id === forPerson);
  if (idx === -1) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, updated: false, reason: 'person not found' }) };

  const prev = people[idx];
  const from = prev.t ? ((prev.g || prev.st === 'estimated') ? '≈' + prev.t : prev.t) : 'unknown';
  const updated = Object.assign({}, prev, { t: type, st: 'verified', verified_at: new Date().toISOString() });
  delete updated.g;
  delete updated.conf;
  people[idx] = updated;

  const notices = Array.isArray(md.verified_updates) ? md.verified_updates.slice() : [];
  notices.push({ id: prev.id, n: prev.n, from, to: type, at: new Date().toISOString(), idx, emailed: false, seen: false });

  const { error: updErr } = await sb.auth.admin.updateUserById(user.id, {
    user_metadata: { ...md, people, verified_updates: notices.slice(-10) },
  });
  if (updErr) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: updErr.message }) };

  // Analytics: the inviter's estimated read became a verified result.
  try {
    await sb.from('funnel_events').insert({
      event: 'estimated_person_verified',
      anon_id: md.anon_id || 'server',
      props: { user_id: user.id, relationship: prev.r || null, from, to: type, day: new Date().toISOString().slice(0, 10), event_id: 'ver-' + prev.id + '-' + Date.now() },
      path: '/invite-verify',
    });
  } catch (_) {}

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, updated: true }) };
};
