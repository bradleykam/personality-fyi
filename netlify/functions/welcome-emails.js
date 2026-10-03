// Welcome-email sweep. Runs on a schedule. For every real signup that:
//   - is not an internal/Brad account
//   - is at least MIN_AGE_MINUTES old (so we don't nudge someone mid-test)
//   - has not already been welcomed (user_metadata.welcomed !== true)
// sends ONE welcome email via Resend, then marks user_metadata.welcomed = true.
//
// Two variants:
//   - has mbti_type  -> personalized welcome + profile links
//   - no mbti_type   -> "finish your test" nudge (re-engagement)
//
// Safety: if WELCOME_DRY_RUN === 'true', it renders and RETURNS what it would
// send (per recipient) but does NOT send or mark anyone. Flip to 'false' to go live.
//
// Trigger: scheduled (every 15 min) or manual GET/POST. Idempotent.

const { createClient } = require('@supabase/supabase-js');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

const MIN_AGE_MINUTES = 60;
const REPLY_TO = 'brad@personality.fyi';

// US sanctions / restricted countries — must stay in sync with the BLOCKED
// set in netlify/edge-functions/geo-gate.js. Any user whose signup_country
// is on this list is never emailed (belt-and-suspenders: the edge gate
// already blocks signup from these countries).
const BLOCKED_COUNTRIES = new Set([
  'CU', 'IR', 'KP', 'SY', 'IQ', 'RU', 'BY', 'VE', 'MV', 'LB', 'YE', 'SD', 'ZW',
]);

// Accounts we never email (owner + internal corp addresses).
const SKIP_EMAILS = new Set([
  'bradleykam@gmail.com',
  'brad@real.photos',
  'info@real.photos',
  'brad@personality.fyi',
]);
const SKIP_DOMAINS = ['real.photos'];

const TYPE_NAMES = {
  INTJ: 'Architect', INTP: 'Logician', ENTJ: 'Commander', ENTP: 'Debater',
  INFJ: 'Advocate', INFP: 'Mediator', ENFJ: 'Protagonist', ENFP: 'Campaigner',
  ISTJ: 'Logistician', ISFJ: 'Defender', ESTJ: 'Executive', ESFJ: 'Consul',
  ISTP: 'Virtuoso', ISFP: 'Adventurer', ESTP: 'Entrepreneur', ESFP: 'Entertainer',
};

function shouldSkip(email) {
  if (!email) return true;
  const e = email.toLowerCase();
  if (SKIP_EMAILS.has(e)) return true;
  const domain = e.split('@')[1] || '';
  return SKIP_DOMAINS.includes(domain);
}

const SITE = 'https://personality.fyi';

const INTRO = [
  "Hi, I'm Brad, founder of Personality.fyi.",
  "I've been running startups for the last 15 years and I've interviewed over 1,000 people applying for jobs, each one took a personality test.",
  "Those tests were highly predictive of who would be the best fit for which jobs and even which employees would get along with one another.",
  "That's why I made personality.fyi, so everyone can find the right jobs and the right people for them.",
];

// Render a welcome email from a lead-in line and a list of action items.
// items: [{ label, url, bold }]. The action phrase itself is the link.
// shareLink (optional): the recipient's personal /from/<slug> invite link,
// rendered as a separated final CTA at the bottom.
function renderEmail(leadIn, items, shareLink) {
  const introHtml = INTRO.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('\n');
  const listHtml = items.map((it) => {
    const a = `<a href="${it.url}" style="color:#2563eb">${it.label}</a>`;
    return `  <li style="margin:0 0 10px${it.bold ? ';font-weight:700' : ''}">${a}</li>`;
  }).join('\n');

  let shareHtml = '';
  let shareText = '';
  if (shareLink) {
    shareHtml = `
<div style="margin-top:26px;padding-top:18px;border-top:1px solid #e4e2dc">
<p style="margin:0 0 8px;font-weight:700">Want to know a friend's type?</p>
<p style="margin:0 0 12px;color:#555">Send them your personal link. When they take the test, you'll see their result and how the two of you get along.</p>
<p style="margin:0;font-family:monospace;font-size:13px;background:#faf9f6;border:1px solid #eceae4;border-radius:6px;padding:10px 12px;word-break:break-all">${shareLink}</p>
</div>`;
    shareText = `

----------

Want to know a friend's type?
Send them your personal link. When they take the test, you'll see their result and how the two of you get along:
${shareLink}`;
  }

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
${introHtml}
<p style="margin:0 0 12px">${leadIn}</p>
<ol style="margin:0 0 16px;padding-left:22px">
${listHtml}
</ol>
<p style="margin:0 0 14px">Please reply with any questions or comments.</p>
<p style="margin:0">Happy searching,<br>Brad</p>${shareHtml}
</div>`;

  const introText = INTRO.join('\n\n');
  const listText = items.map((it, i) => `${i + 1}. ${it.label}: ${it.url}`).join('\n');
  const text = `${introText}

${leadIn}

${listText}

Please reply with any questions or comments.

Happy searching,
Brad${shareText}`;
  return { subject: 'Welcome to Personality.fyi', html, text };
}

// shareLink: only passed for the has-type variant (the recipient's invite link).
function buildWelcome(user, shareLink) {
  const md = user.user_metadata || {};
  const type = (md.mbti_type || '').toUpperCase();
  const hasType = !!(type && TYPE_NAMES[type]);

  if (hasType) {
    return renderEmail("Now that we know your personality type, here's where to start:", [
      { label: 'See the detailed results of your test', url: SITE + '/your-type', bold: true },
      { label: 'Find jobs or careers that would match', url: SITE + '/career-planning' },
      { label: "Find the types you'd be compatible with", url: SITE + '/compatibility' },
      { label: 'Learn about the activities certain types like', url: SITE + '/never-have-i-ever' },
    ], shareLink);
  }

  return renderEmail("Here's how to get started:", [
    { label: 'Take the test to find out what type you are', url: SITE + '/take-the-test' },
    { label: 'Already know your type? Enter it here', url: SITE + '/your-type' },
  ]);
}

// Get-or-create the user's personal invite slug (reuses the `creators` table,
// same scheme as the friend-invite endpoint). Returns the full /from link.
async function getInviteLink(supabase, user) {
  try {
    const { data: existing } = await supabase.from('creators').select('slug').eq('user_id', user.id).maybeSingle();
    if (existing && existing.slug) return SITE + '/from/' + existing.slug;
    const md = user.user_metadata || {};
    const raw = md.full_name || md.name || (user.email || '').split('@')[0] || 'friend';
    let base = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
    if (base.length < 3) base = 'friend';
    let slug = base;
    for (let i = 0; i < 6; i++) {
      const { data: clash } = await supabase.from('creators').select('id').eq('slug', slug).maybeSingle();
      if (!clash) break;
      slug = base + '-' + Math.random().toString(36).slice(2, 6);
    }
    const displayName = String(md.full_name || md.name || (user.email || '').split('@')[0] || 'A friend').slice(0, 80);
    const { data: row, error } = await supabase.from('creators')
      .insert({ user_id: user.id, display_name: displayName, slug, email: user.email })
      .select().single();
    if (error || !row) return null;
    return SITE + '/from/' + row.slug;
  } catch (_) { return null; }
}

async function sendViaResend(to, subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no-resend-key' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Brad Kam <brad@personality.fyi>',
      to: [to],
      reply_to: REPLY_TO,
      subject,
      text,
      html,
    }),
  });
  if (!r.ok) return { sent: false, reason: 'resend-' + r.status, detail: await r.text() };
  return { sent: true };
}

async function listAllUsers(supabase) {
  const all = [];
  let page = 1;
  // perPage max 1000; loop in case it grows.
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    all.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return all;
}

exports.handler = async (event) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }

  // Test hook: ?test=email -> looks up that REAL user and sends exactly the
  // welcome they would actually receive (validates type-selection end to end,
  // not just template rendering). Does not mark them welcomed.
  const testTo = event && event.queryStringParameters && event.queryStringParameters.test;
  if (testTo) {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    let found;
    try {
      const all = await listAllUsers(sb);
      found = all.find((x) => (x.email || '').toLowerCase() === testTo.toLowerCase());
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
    if (!found) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'No account found for ' + testTo }) };
    }
    const realType = (found.user_metadata || {}).mbti_type || null;
    const hasType = !!(realType && TYPE_NAMES[String(realType).toUpperCase()]);
    const variant = realType ? 'has-type:' + realType : 'no-type';
    const shareLink = hasType ? await getInviteLink(sb, found) : null;
    const { subject, html, text } = buildWelcome(found, shareLink);
    const res = await sendViaResend(testTo, '[TEST] ' + subject, text, html);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ test: testTo, lookedUpType: realType, variantSent: variant, result: res }, null, 2) };
  }

  const dryRun = process.env.WELCOME_DRY_RUN === 'true';
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let users;
  try {
    users = await listAllUsers(supabase);
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }

  const now = Date.now();
  const summary = { dryRun, scanned: users.length, eligible: 0, sent: 0, skipped: 0, tooNew: 0, alreadyWelcomed: 0, failed: 0 };
  const preview = [];

  for (const u of users) {
    const md = u.user_metadata || {};
    if (shouldSkip(u.email)) { summary.skipped++; continue; }
    const country = (md.signup_country || '').toUpperCase();
    if (country && BLOCKED_COUNTRIES.has(country)) { summary.blockedCountry = (summary.blockedCountry || 0) + 1; continue; }
    if (md.digest_unsub === true) { summary.unsubscribed = (summary.unsubscribed || 0) + 1; continue; }
    if (md.welcomed === true) { summary.alreadyWelcomed++; continue; }
    const ageMin = (now - new Date(u.created_at).getTime()) / 60000;
    if (ageMin < MIN_AGE_MINUTES) { summary.tooNew++; continue; }

    summary.eligible++;
    const hasType = !!(md.mbti_type && TYPE_NAMES[String(md.mbti_type).toUpperCase()]);
    const shareLink = (hasType && !dryRun) ? await getInviteLink(supabase, u) : null;
    const { subject, html, text } = buildWelcome(u, shareLink);
    const variant = (md.mbti_type ? 'personalized:' + md.mbti_type : 'finish-test');

    if (dryRun) {
      preview.push({ to: u.email, variant, subject, text });
      continue;
    }

    await new Promise((r) => setTimeout(r, 250)); // stay under Resend's 5 req/sec
    const res = await sendViaResend(u.email, subject, text, html);
    if (res.sent) {
      await supabase.auth.admin.updateUserById(u.id, {
        user_metadata: { ...md, welcomed: true, welcomed_at: new Date().toISOString() },
      });
      summary.sent++;
    } else {
      summary.failed++;
      preview.push({ to: u.email, variant, error: res.reason, detail: res.detail });
    }
  }

  // ── Lifecycle hook B: incomplete activation ───────────────────────
  // Result viewed, zero people, ~24 hours old, welcomed, not yet nudged.
  // One email, once, deep-linking straight into Add Someone.
  summary.activationNudged = 0;
  for (const u of users) {
    const md = u.user_metadata || {};
    if (shouldSkip(u.email)) continue;
    if (md.digest_unsub === true) continue; // honors communication preferences
    const country = (md.signup_country || '').toUpperCase();
    if (country && BLOCKED_COUNTRIES.has(country)) continue;
    if (md.welcomed !== true) continue;
    if (md.activation_nudge_at) continue;
    const type = String(md.mbti_type || '').toUpperCase();
    if (!TYPE_NAMES[type]) continue; // needs a viewed result
    const people = Array.isArray(md.people) ? md.people : [];
    if (people.length > 0) continue; // already activated
    const ageH = (now - new Date(u.created_at).getTime()) / 3600000;
    if (ageH < 24 || ageH > 24 * 7) continue; // ~24h window, never for old accounts
    if (dryRun) { preview.push({ to: u.email, variant: 'activation-nudge:' + type, subject: 'Your ' + type + ' result is saved' }); continue; }
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
<p style="margin:0 0 14px">Your <b>${type}</b> result is saved. Now compare yourself with someone you actually know.</p>
<p style="margin:0 0 18px;color:#555">Add one person — a partner, friend, parent, sibling, or coworker — and see how the two of you think, communicate, and get along.</p>
<p style="margin:0"><a href="https://personality.fyi/add-someone" style="display:inline-block;background:#0e0e0e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">Add someone →</a></p>
<p style="margin:22px 0 0">Brad</p>
<p style="margin:14px 0 0;font-size:12px;color:#999">Reply "unsubscribe" and these stop.</p>
</div>`;
    const text = `Your ${type} result is saved. Now compare yourself with someone you actually know.\n\nAdd one person and see how the two of you think, communicate, and get along:\nhttps://personality.fyi/add-someone\n\nBrad\n\nReply "unsubscribe" and these stop.`;
    await new Promise((r) => setTimeout(r, 250));
    const res = await sendViaResend(u.email, 'Your ' + type + ' result is saved — now use it', text, html);
    if (res.sent) {
      await supabase.auth.admin.updateUserById(u.id, { user_metadata: { ...md, activation_nudge_at: new Date().toISOString() } });
      summary.activationNudged++;
    }
  }

  // ── Lifecycle hook C: an invited person finished the test ────────
  // Highest value reengagement event: the estimate became a verified type.
  summary.verifiedNotices = 0;
  for (const u of users) {
    const md = u.user_metadata || {};
    if (shouldSkip(u.email)) continue;
    if (md.digest_unsub === true) continue;
    const notices = Array.isArray(md.verified_updates) ? md.verified_updates : [];
    const toSend = notices.filter((v) => v && !v.emailed);
    if (!toSend.length) continue;
    if (dryRun) { preview.push({ to: u.email, variant: 'verified:' + toSend.map((v) => v.n).join(',') }); continue; }
    for (const v of toSend) {
      const link = 'https://personality.fyi/person?i=' + (v.idx != null ? v.idx : 0);
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
<p style="margin:0 0 14px"><b>${v.n} finished the test.</b></p>
<p style="margin:0 0 18px">Their verified type is <b>${v.to}</b>${v.from && v.from !== 'unknown' ? ' (your read was ' + v.from + ')' : ''}. Your compatibility analysis is updated.</p>
<p style="margin:0"><a href="${link}" style="display:inline-block;background:#0e0e0e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">See how you two match →</a></p>
<p style="margin:22px 0 0">Brad</p>
<p style="margin:14px 0 0;font-size:12px;color:#999">Reply "unsubscribe" and these stop.</p>
</div>`;
      const text = `${v.n} finished the test.\n\nTheir verified type is ${v.to}${v.from && v.from !== 'unknown' ? ' (your read was ' + v.from + ')' : ''}. Your compatibility analysis is updated:\n${link}\n\nBrad\n\nReply "unsubscribe" and these stop.`;
      await new Promise((r) => setTimeout(r, 250));
      const res = await sendViaResend(u.email, v.n + ' finished the test', text, html);
      if (res.sent) summary.verifiedNotices++;
    }
    const marked = notices.map((v) => Object.assign({}, v, { emailed: true }));
    await supabase.auth.admin.updateUserById(u.id, { user_metadata: { ...md, verified_updates: marked } });
  }

  // ── Lifecycle hook D: estimated-type reminder ─────────────────────
  // One email per user ever: an estimated person, never invited, 3+ days old.
  summary.estimateReminders = 0;
  for (const u of users) {
    const md = u.user_metadata || {};
    if (shouldSkip(u.email)) continue;
    if (md.digest_unsub === true) continue;
    if (md.est_reminder_at) continue;
    const people = Array.isArray(md.people) ? md.people : [];
    const idx = people.findIndex((p) => p && (p.g || p.st === 'estimated') && !p.inv && p.ts && (now - p.ts) > 72 * 3600000);
    if (idx === -1) continue;
    const p0 = people[idx];
    if (dryRun) { preview.push({ to: u.email, variant: 'est-reminder:' + p0.n }); continue; }
    const link = 'https://personality.fyi/person?i=' + idx;
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
<p style="margin:0 0 14px">Want to see how accurate your read on <b>${p0.n}</b> was?</p>
<p style="margin:0 0 18px;color:#555">You estimated ≈${p0.t}. Send them the 60 second test and find out for real.</p>
<p style="margin:0"><a href="${link}" style="display:inline-block;background:#0e0e0e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">Send ${p0.n} the test →</a></p>
<p style="margin:22px 0 0">Brad</p>
<p style="margin:14px 0 0;font-size:12px;color:#999">Reply "unsubscribe" and these stop.</p>
</div>`;
    const text = `Want to see how accurate your read on ${p0.n} was?\n\nYou estimated ~${p0.t}. Send them the 60 second test and find out for real:\n${link}\n\nBrad\n\nReply "unsubscribe" and these stop.`;
    await new Promise((r) => setTimeout(r, 250));
    const res = await sendViaResend(u.email, 'How accurate was your read on ' + p0.n + '?', text, html);
    if (res.sent) {
      const people2 = people.map((p, i) => i === idx ? Object.assign({}, p, { d_nudge: 1 }) : p);
      await supabase.auth.admin.updateUserById(u.id, { user_metadata: { ...md, people: people2, est_reminder_at: new Date().toISOString() } });
      summary.estimateReminders++;
    }
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ summary, preview }, null, 2) };
};

// Scheduled — every 15 minutes.
exports.config = { schedule: '*/15 * * * *' };
