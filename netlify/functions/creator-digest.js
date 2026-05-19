// Daily digest sweep. Queues an email per creator that's:
//   - just crossed 25 consenting referrals (first digest)
//   - or last received a digest >30 days ago AND has >=25 consenting referrals
// Writes the email body into creator_digests_pending. If RESEND_API_KEY is set,
// also sends via Resend immediately and marks status='sent'. Otherwise leaves status='queued'.
//
// Trigger: GET / POST. Idempotent — re-running same day is a no-op.

const { createClient } = require('@supabase/supabase-js');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

async function sendViaResend(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no-resend-key' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'personality.fyi <hello@personality.fyi>',
      to: [to],
      subject,
      text
    })
  });
  if (!r.ok) return { sent: false, reason: 'resend-' + r.status };
  return { sent: true };
}

function buildDigest(creator, counts, total) {
  const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const breakdown = ordered.map(([t, n]) => {
    const pct = total > 0 ? Math.round((n / total) * 100) : 0;
    return `  ${t}  ${String(n).padStart(4)}  (${pct}%)`;
  }).join('\n');
  const subject = `Your personality.fyi audience breakdown — ${total} responses`;
  const body = `Hi ${creator.display_name},

Here's your audience breakdown from personality.fyi:

${breakdown}

Total consenting responses: ${total}
Link: https://personality.fyi/from/${creator.slug}

Share this link to collect more responses. We'll send you an updated breakdown every 30 days.

— The personality.fyi team
`;
  return { subject, body };
}

exports.handler = async (event) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: creators, error: cErr } = await supabase
    .from('creators').select('id, display_name, slug, email, last_digest_sent_at, first_digest_sent');
  if (cErr) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: cErr.message }) };

  const now = Date.now();
  const summary = { processed: 0, queued: 0, sent: 0, skipped: 0 };

  for (const c of creators || []) {
    summary.processed++;
    const { data: refs, error: rErr } = await supabase
      .from('creator_referrals').select('mbti_type').eq('creator_id', c.id).eq('consented', true).not('mbti_type', 'is', null);
    if (rErr) continue;
    const total = refs.length;
    if (total < 25) { summary.skipped++; continue; }
    const lastMs = c.last_digest_sent_at ? new Date(c.last_digest_sent_at).getTime() : 0;
    const daysSince = (now - lastMs) / (1000 * 60 * 60 * 24);
    const isFirst = !c.first_digest_sent;
    if (!isFirst && daysSince < 30) { summary.skipped++; continue; }

    const counts = {};
    for (const r of refs) counts[r.mbti_type] = (counts[r.mbti_type] || 0) + 1;
    const { subject, body } = buildDigest(c, counts, total);

    const { data: queued, error: qErr } = await supabase.from('creator_digests_pending')
      .insert({ creator_id: c.id, subject, body, status: 'queued' }).select().single();
    if (qErr) continue;
    summary.queued++;

    const send = await sendViaResend(c.email, subject, body);
    if (send.sent) {
      await supabase.from('creator_digests_pending').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', queued.id);
      await supabase.from('creators').update({ last_digest_sent_at: new Date().toISOString(), first_digest_sent: true }).eq('id', c.id);
      summary.sent++;
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify(summary) };
};

// Netlify scheduled function — runs daily.
exports.config = { schedule: '@daily' };
