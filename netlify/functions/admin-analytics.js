// Admin analytics: acquisition → activation → retention.
// Locked to the admin email (same JWT gate as admin-data). Computes lifecycle
// states, the activation funnel, cohort retention, activated-vs-not retention,
// feature/attribution/people/why-return reports, and the north-star metrics,
// all from auth users (metadata) + funnel_events.
//
// GET-style params via POST body: { accessToken, days?: number, user?: id }
// `user` returns that user's event timeline (no AI text exists in events).
const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const ADMIN_EMAIL = 'brad@personality.fyi';
const HIDE_EMAILS = new Set(['bradleykam@gmail.com', 'brad@real.photos', 'info@real.photos', 'brad@personality.fyi']);
const HIDE_DOMAINS = ['real.photos'];
const DAY = 86400000;

function hidden(email) {
  if (!email) return true;
  const e = email.toLowerCase();
  if (HIDE_EMAILS.has(e)) return true;
  return HIDE_DOMAINS.includes(e.split('@')[1] || '');
}

const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);
const weekOf = (ts) => { // Monday-aligned ISO-ish week label
  const d = new Date(ts);
  const day = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d.getTime() - day * DAY);
  return mon.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / DAY);

const ENGAGE_EVENTS = new Set(['career_planning_started', 'person_flow_started', 'compatibility_viewed', 'ai_message_sent', 'ai_chat_started', 'nhie_started', 'nhie_answered', 'result_shared', 'person_invite_started', 'type_ribbing', 'type_guessed']);
const FEATURE_OF = (ev) => {
  if (/^person_|^roster_person/.test(ev)) return 'People';
  if (/^compatibility/.test(ev)) return 'Compatibility';
  if (['ai_message_sent', 'ai_chat_started', 'self_ai_clicked', 'type_ribbing'].includes(ev)) return 'AI chat';
  if (/^career/.test(ev)) return 'Career planning';
  if (/^nhie/.test(ev)) return 'Never Have I Ever';
  if (ev === 'result_shared') return 'Sharing';
  if (/invite/.test(ev)) return 'Invitations';
  if (ev === 'result_viewed' || ev === 'typicality') return 'Personality profile';
  return null;
};

function attributionBucket(md) {
  const a = md.signup_attribution || {};
  if (a.utm_source) return 'utm:' + a.utm_source;
  if (a.invite === 'friend-invite') return 'friend invitation';
  if ((a.landing || '').indexOf('creator=') !== -1) return 'creator referral';
  const h = (a.referrer_host || '').replace(/^www\./, '');
  if (!h || h === 'personality.fyi' || h === 'accounts.google.com') return 'direct / unattributed';
  if (/google|bing|duckduckgo|yahoo/.test(h)) return 'organic search';
  if (/instagram|facebook|tiktok|twitter|x\.com|reddit|youtube/.test(h)) return 'social';
  return h; // named referrer (e.g. cerritos.instructure.com, chatgpt.com)
}

// ── Pure compute (exported for testing) ─────────────────────────────
function computeAll(users, events, nowMs, windowDays, subMap) {
  subMap = subMap || {};
  const now = nowMs || Date.now();
  const winStart = windowDays ? now - windowDays * DAY : 0;
  const hiddenIds = new Set(users.filter(u => (hidden(u.email) || u.user_metadata?.seed === true)).map(u => u.id));
  const hiddenAnon = new Set(users.filter(u => (hidden(u.email) || u.user_metadata?.seed === true)).map(u => (u.user_metadata || {}).anon_id).filter(Boolean));
  events.forEach(e => { if (hiddenIds.has((e.props || {}).user_id) && e.anon_id) hiddenAnon.add(e.anon_id); });
  users = users.filter(u => !(hidden(u.email) || u.user_metadata?.seed === true));
  const ev = events.filter(e => !/^mail_/.test(e.event) && !hiddenIds.has((e.props || {}).user_id) && !hiddenAnon.has(e.anon_id) && new Date(e.created_at).getTime() <= now);

  // Index events by actor (user_id if present, else anon_id) and dedupe by event_id.
  const seenIds = new Set();
  const byActor = {}; // actor -> events[]
  const anonToUser = {};
  users.forEach((u) => { const md = u.user_metadata || {}; if (md.anon_id) anonToUser[md.anon_id] = u.id; });
  // Explicit authenticated events link additional browser identities to an account.
  const knownUsers = new Set(users.map(u => u.id));
  ev.forEach(e => { if (e.anon_id && knownUsers.has((e.props || {}).user_id)) anonToUser[e.anon_id] = e.props.user_id; });
  const allCleaned = [];
  for (const e of ev) {
    const p = e.props || {};
    if (p.event_id) { if (seenIds.has(p.event_id)) continue; seenIds.add(p.event_id); }
    const actor = p.user_id || anonToUser[e.anon_id] || ('anon:' + e.anon_id);
    allCleaned.push(Object.assign({ actor }, e));
    (byActor[actor] = byActor[actor] || []).push(e);
  }

  const cleaned = allCleaned.filter(e => new Date(e.created_at).getTime() >= winStart);

  const distinctActors = (name) => {
    const s = new Set();
    for (const e of cleaned) if (e.event === name) s.add(e.actor);
    return s;
  };

  // Per-user derived record.
  const recs = users.map((u) => {
    const md = u.user_metadata || {};
    const people = Array.isArray(md.people) ? md.people : [];
    const signup = u.created_at;
    const allUserEvents = byActor[u.id] || [];
    const uEvents = allUserEvents.filter(e => new Date(e.created_at).getTime() >= winStart);
    const evNames = new Set(uEvents.map((e) => e.event));
    // activity days: session_days + event days + signup day
    const days = new Set(Array.isArray(md.session_days) ? md.session_days : []);
    days.add(dayOf(signup));
    allUserEvents.forEach((e) => days.add(dayOf(e.created_at)));
    const resultViewed = !!md.first_result_viewed_at || allUserEvents.some(e => e.event === 'result_viewed');
    const engaged = [...evNames].some((n) => ENGAGE_EVENTS.has(n)) || people.length > 0 || evNames.has('person_added');
    const activated = people.length >= 1;
    const aiUsed = evNames.has('ai_message_sent');
    const deep = activated && (aiUsed || people.length >= 2 || evNames.has('person_invite_link_created') || evNames.has('compatibility_detail_viewed') || evNames.has('career_planning_started') || days.size >= 2);
    const retained = days.size >= 2;
    const state = !resultViewed ? 'lead' : (activated ? (deep ? 'deep_activated' : 'activated') : (engaged ? 'engaged' : 'result_viewed'));
    const firstPerson = md.first_person_added_at || (people[0] && people[0].ts ? new Date(people[0].ts).toISOString() : null);
    const estPeople = people.filter((p) => p.g || p.st === 'estimated').length;
    const verPeople = people.filter((p) => p.st === 'verified').length;
    const invPeople = people.filter((p) => p.inv).length;
    // Phase 1 activation paths (S58): measure, don't presume.
    const relAct = people.length >= 1 && (evNames.has('compatibility_detail_viewed') || evNames.has('person_profile_viewed') || evNames.has('ai_message_sent'));
    const careerEvts = uEvents.filter((e) => /^career/.test(e.event)).length;
    const careerAct = evNames.has('career_context_saved') || careerEvts >= 2;
    const aiAct = evNames.has('ai_message_sent') || evNames.has('self_ai_clicked') || evNames.has('type_ribbing');
    const selfAct = evNames.has('nhie_answered') || evNames.has('type_ribbing') || evNames.has('self_ai_clicked') || evNames.has('you_viewed');
    const aiConsumed = uEvents.filter((e) => e.event === 'ai_quota_consumed').length;
    const paid = (subMap[u.id] || 'none') === 'active';
    return {
      id: u.id, email: u.email, signup, md, people, uEvents,
      relAct, careerAct, aiAct, selfAct, aiConsumed, paid,
      days: [...days].sort(), resultViewed, engaged, activated, deep, retained: retained && activated ? true : retained,
      state, aiUsed, firstPerson, estPeople, verPeople, invPeople,
      attribution: attributionBucket(md),
      careerUsed: evNames.has('career_planning_started') || evNames.has('ai_message_sent') && false,
      sessionN: Number(md.session_n) || 0,
    };
  });

  const retainedAtDay = (r, n) => {
    const target = new Date(dayOf(r.signup)).getTime() + n * DAY;
    if (now < target + DAY) return null; // wait until the whole UTC target day closes
    return r.days.includes(dayOf(target));
  };
  const rate = (num, den) => ({ n: num, d: den, pct: den ? Math.round(1000 * num / den) / 10 : null });
  const retRow = (rs, windows) => {
    const out = {};
    for (const n of windows) {
      const elig = rs.filter((r) => retainedAtDay(r, n) !== null);
      out['d' + n] = rate(elig.filter((r) => retainedAtDay(r, n)).length, elig.length);
    }
    return out;
  };

  // Scorecards + funnel from events (distinct actors).
  const f = {
    landing: distinctActors('landing_view').size,
    testStarted: distinctActors('test_started').size,
    testCompleted: distinctActors('test_completed').size,
    emailSubmitted: distinctActors('email_submitted').size,
    resultViewedEv: distinctActors('result_viewed').size,
    personFlow: distinctActors('person_flow_started').size,
    personAdded: distinctActors('person_added').size,
    aiOrDetail: new Set([...distinctActors('ai_message_sent'), ...distinctActors('compatibility_detail_viewed')]).size,
    returnSession: distinctActors('return_session').size,
  };
  const secondAction = new Set();
  for (const e of cleaned) if (ENGAGE_EVENTS.has(e.event)) secondAction.add(e.actor);
  f.secondAction = secondAction.size;

  // One start cohort, in time order. Authentication is a branch (returning users
  // need no email step), so report it separately instead of forcing it into the funnel.
  const funnelStart = Math.max(winStart, Date.parse('2026-09-14T00:00:00Z'));
  const sequences = new Map();
  cleaned.filter(e => new Date(e.created_at).getTime() >= funnelStart)
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach(e => { if (!sequences.has(e.actor)) sequences.set(e.actor, []); sequences.get(e.actor).push(e); });
  const steps = [['Test started', 0], ['Test completed', 0], ['Result viewed', 0],
    ['Deliberate feature action', 0], ['Later session', 0]];
  sequences.forEach(seq => {
    let stage = 0, firstSession = null, startAt = null;
    seq.forEach(e => {
      const p = e.props || {};
      const matches = stage === 0 ? e.event === 'test_started' :
        stage === 1 ? e.event === 'test_completed' :
        stage === 2 ? e.event === 'result_viewed' :
        stage === 3 ? ENGAGE_EVENTS.has(e.event) :
        stage === 4 ? (p.session_id && firstSession && p.session_id !== firstSession && new Date(e.created_at) > startAt) : false;
      if (matches) {
        if (stage === 0) { firstSession = p.session_id; startAt = new Date(e.created_at); }
        steps[stage++][1]++;
      }
    });
  });
  const funnel = steps.map(([step, count], i) => ({ step, count,
    pctPrev: i ? rate(count, steps[i-1][1]).pct : (count ? 100 : null),
    pctOrig: rate(count, steps[0][1]).pct }));

  // Lifecycle counts
  const lifecycle = { lead: 0, result_viewed: 0, engaged: 0, activated: 0, deep_activated: 0, retained: 0 };
  recs.forEach((r) => { lifecycle[r.state] = (lifecycle[r.state] || 0) + 1; if (r.days.length >= 2) lifecycle.retained++; });

  // Scorecards
  const scorecards = {
    emailCaptures: recs.length,
    resultViewers: recs.filter((r) => r.resultViewed).length,
    engagedUsers: recs.filter((r) => r.engaged).length,
    activatedUsers: recs.filter((r) => r.activated).length,
    deepActivatedUsers: recs.filter((r) => r.deep).length,
    testStarts: f.testStarted,
    testCompletions: f.testCompleted,
    rates: {
      'Test start → completion': rate(steps[1][1], steps[0][1]),
      'Completion → result viewed': rate(steps[2][1], steps[1][1]),
      'Result viewed → engaged': rate(recs.filter((r) => r.resultViewed && r.engaged).length, recs.filter((r) => r.resultViewed).length),
      'Result viewed → activated': rate(recs.filter((r) => r.resultViewed && r.activated).length, recs.filter((r) => r.resultViewed).length),
      'Signup → activated': rate(recs.filter((r) => r.activated).length, recs.length),
    },
    retention: retRow(recs, [1, 7, 30]),
  };

  // Cohorts (signup + activation), weekly.
  const cohortBy = (keyFn, rows) => {
    const groups = {};
    rows.forEach((r) => { const k = keyFn(r); if (!k) return; (groups[k] = groups[k] || []).push(r); });
    return Object.keys(groups).sort().slice(-10).map((k) => {
      const g = groups[k];
      return Object.assign({ cohort: k, signups: g.length, activated: g.filter((x) => x.activated).length }, retRow(g, [1, 3, 7, 14, 30]));
    });
  };
  const cohorts = {
    bySignup: cohortBy((r) => weekOf(r.signup), recs),
    byActivation: cohortBy((r) => r.firstPerson ? weekOf(r.firstPerson) : null, recs.filter((r) => r.activated && r.firstPerson).map(r => ({ ...r, signup: r.firstPerson }))),
  };

  // Activated vs non-activated retention (S17)
  const seg = (label, rs) => Object.assign({ segment: label, users: rs.length }, retRow(rs, [1, 3, 7, 14, 30]));
  const segments = [
    seg('Email captured only', recs.filter((r) => !r.resultViewed)),
    seg('Result viewed, not activated', recs.filter((r) => r.resultViewed && !r.activated)),
    seg('Activated, 1 person', recs.filter((r) => r.people.length === 1)),
    seg('Activated, 2+ people', recs.filter((r) => r.people.length >= 2)),
    seg('Activated + AI interaction', recs.filter((r) => r.activated && r.aiUsed)),
    seg('Careers user, no people', recs.filter((r) => !r.activated && r.uEvents.some((e) => /^career/.test(e.event)))),
  ];

  // Feature report (S18)
  const featureRows = {};
  recs.forEach((r) => {
    const feats = new Set();
    r.uEvents.forEach((e) => { const ft = FEATURE_OF(e.event); if (ft) feats.add(ft); });
    if (r.people.length) feats.add('People');
    feats.forEach((ft) => (featureRows[ft] = featureRows[ft] || []).push(r));
  });
  const activeUsers = recs.filter((r) => r.uEvents.length > 0 || r.people.length > 0).length || 1;
  const features = Object.keys(featureRows).map((ft) => {
    const rs = featureRows[ft];
    const ret = retRow(rs, [1, 7, 30]);
    return { feature: ft, users: rs.length, pctActive: Math.round(1000 * rs.length / activeUsers) / 10, d1: ret.d1, d7: ret.d7, d30: ret.d30, avgSessions: Math.round(10 * rs.reduce((n, r) => n + r.sessionN, 0) / rs.length) / 10 };
  }).sort((a, b) => b.users - a.users);

  // People metrics (S19)
  const withPeople = recs.filter((r) => r.people.length);
  const allPeople = recs.flatMap((r) => r.people);
  const timeTo = (rs, fn) => {
    const vals = rs.map(fn).filter((v) => v != null && v >= 0);
    return vals.length ? Math.round(10 * vals.reduce((a, b) => a + b, 0) / vals.length) / 10 : null;
  };
  const people = {
    dist: { p0: recs.filter((r) => !r.people.length).length, p1: recs.filter((r) => r.people.length === 1).length, p2: recs.filter((r) => r.people.length === 2).length, p3plus: recs.filter((r) => r.people.length >= 3).length },
    avgPerActivated: withPeople.length ? Math.round(10 * allPeople.length / withPeople.length) / 10 : 0,
    typeStatus: { known: allPeople.filter((p) => p.t && !p.g && p.st !== 'verified').length, estimated: allPeople.filter((p) => p.g || p.st === 'estimated').length, verified: allPeople.filter((p) => p.st === 'verified').length, pending: allPeople.filter((p) => !p.t).length },
    invitesSent: recs.reduce((n, r) => n + r.invPeople, 0),
    avgHoursToFirstPerson: timeTo(withPeople, (r) => r.firstPerson ? Math.round(10 * (new Date(r.firstPerson) - new Date(r.signup)) / 3600000) / 10 : null),
    retentionByCount: [
      seg('0 people', recs.filter((r) => !r.people.length)),
      seg('1 person', recs.filter((r) => r.people.length === 1)),
      seg('2 people', recs.filter((r) => r.people.length === 2)),
      seg('3+ people', recs.filter((r) => r.people.length >= 3)),
    ],
  };

  // Why users return (S23): first feature opened in each return session,
  // with session duration (first→last event) and whether the user came back
  // again after that session.
  const bySession = {};
  cleaned.forEach((e) => { const sid = (e.props || {}).session_id; if (sid) (bySession[sid] = bySession[sid] || []).push(e); });
  const sessionMeta = {}; // sid -> {actor, start, end}
  Object.keys(bySession).forEach((sid) => {
    const list = bySession[sid];
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    sessionMeta[sid] = { actor: list[0].actor, start: new Date(list[0].created_at).getTime(), end: new Date(list[list.length - 1].created_at).getTime() };
  });
  const actorStarts = {};
  Object.values(sessionMeta).forEach((m) => (actorStarts[m.actor] = actorStarts[m.actor] || []).push(m.start));
  const whyReturn = {};
  Object.keys(bySession).forEach((sid) => {
    const list = bySession[sid];
    if (!list.some((e) => e.event === 'return_session')) return;
    const firstFeat = list.map((e) => FEATURE_OF(e.event)).find(Boolean) || 'Other';
    const m = sessionMeta[sid];
    const row = (whyReturn[firstFeat] = whyReturn[firstFeat] || { sessions: 0, totalMin: 0, subsequent: 0 });
    row.sessions++;
    row.totalMin += Math.max(0, (m.end - m.start) / 60000);
    if ((actorStarts[m.actor] || []).some((t2) => t2 > m.end + 60000)) row.subsequent++;
  });
  Object.keys(whyReturn).forEach((k) => {
    const r = whyReturn[k];
    r.avgMin = Math.round(10 * r.totalMin / r.sessions) / 10;
    r.subsequentPct = Math.round(100 * r.subsequent / r.sessions);
    delete r.totalMin; delete r.subsequent;
  });

  // Attribution (S21)
  const attrGroups = {};
  recs.forEach((r) => (attrGroups[r.attribution] = attrGroups[r.attribution] || []).push(r));
  const attribution = Object.keys(attrGroups).map((k) => {
    const g = attrGroups[k];
    const ret = retRow(g, [1, 7, 30]);
    return { source: k, emails: g.length, activated: g.filter((r) => r.activated).length, activationPct: Math.round(1000 * g.filter((r) => r.activated).length / g.length) / 10, d1: ret.d1, d7: ret.d7, d30: ret.d30 };
  }).sort((a, b) => b.emails - a.emails);

  // North star (S25)
  const thisMonday = weekOf(now);
  const weekDays = new Set();
  for (let i = 0; i < 7; i++) weekDays.add(dayOf(new Date(thisMonday).getTime() + i * DAY));
  const trailing28 = dayOf(now - 28 * DAY);
  const weeklyRetained = recs.filter((r) => {
    const recent = r.days.filter((d) => d >= trailing28);
    return recent.length >= 2 && recent.some((d) => weekDays.has(d));
  }).length;
  const weeklyActivated = recs.filter((r) => r.firstPerson && weekOf(r.firstPerson) === thisMonday).length;
  const activatedRecs = recs.filter((r) => r.activated);
  const northStar = {
    weeklyRetainedUsers: weeklyRetained,
    weeklyActivatedUsers: weeklyActivated,
    activatedD7: retRow(activatedRecs, [7]).d7,
  };

  // User table (S20 summary rows)
  const userRows = recs.sort((a, b) => (b.signup || '').localeCompare(a.signup || '')).map((r) => ({
    id: r.id, email: r.email, signup: (r.signup || '').slice(0, 10), type: r.md.mbti_type || null,
    state: r.state, people: r.people.length, sessions: r.sessionN, activeDays: r.days.length,
    lastActive: r.days[r.days.length - 1] || null, attribution: r.attribution,
    source: r.md.signup_source || 'modal', invites: r.invPeople,
  }));

  // Activation paths (S58/S63): which use case predicts retention and pay?
  const pathRow = (label, rs) => {
    const ret = retRow(rs, [1, 7, 30]);
    return { path: label, users: rs.length,
      d1: ret.d1, d7: ret.d7, d30: ret.d30,
      aiPerUser: rs.length ? Math.round(10 * rs.reduce((n, r) => n + r.aiConsumed, 0) / rs.length) / 10 : 0,
      paid: rs.filter((r) => r.paid).length };
  };
  const activationPaths = [
    pathRow('Relationship activated', recs.filter((r) => r.relAct)),
    pathRow('Career activated', recs.filter((r) => r.careerAct)),
    pathRow('AI activated', recs.filter((r) => r.aiAct)),
    pathRow('Self activated', recs.filter((r) => r.selfAct)),
    pathRow('AI activated (no people)', recs.filter((r) => r.aiAct && !r.people.length)),
    pathRow('Not activated (any path)', recs.filter((r) => !r.relAct && !r.careerAct && !r.aiAct && !r.selfAct)),
  ];

  // Relationship-type analytics (S59): six explicit types + legacy family.
  const relTypes = ['partner', 'friend', 'parent', 'sibling', 'coworker', 'boss', 'family'];
  const relTypeRows = relTypes.map((rt) => {
    const rs = recs.filter((r) => r.people.some((p) => p && p.r === rt));
    const ret = retRow(rs, [1, 7, 30]);
    return { rel: rt, users: rs.length, people: recs.reduce((n, r) => n + r.people.filter((p) => p && p.r === rt).length, 0),
      d1: ret.d1, d7: ret.d7, d30: ret.d30,
      aiPerUser: rs.length ? Math.round(10 * rs.reduce((n, r) => n + r.aiConsumed, 0) / rs.length) / 10 : 0 };
  }).filter((r) => r.people > 0 || ['partner','boss','coworker'].includes(r.rel));

  const aiUsage = {
    consumedTotal: cleaned.filter((e) => e.event === 'ai_quota_consumed').length,
    failed: cleaned.filter((e) => e.event === 'ai_request_failed').length,
    upgradeShown: cleaned.filter((e) => e.event === 'upgrade_shown').length,
    upgradeClicked: cleaned.filter((e) => e.event === 'upgrade_clicked').length,
    paidUsers: recs.filter((r) => r.paid).length,
  };

  return { definitions: { retention: 'Exact UTC day after signup; completed target days only', funnelSince: new Date(funnelStart).toISOString(), eventWindowDays: windowDays || null, cohorts: 'All account cohorts' }, scorecards, lifecycle, funnel, cohorts, segments, features, people, whyReturn, attribution, northStar, userRows, activationPaths, relTypeRows, aiUsage, eventCount: cleaned.length };
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

async function listEvents(sb) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from('funnel_events').select('event, anon_id, props, path, created_at').order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const accessToken = String(body.accessToken || '');
  if (!accessToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Not signed in' }) };
  const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { global: { headers: { Authorization: 'Bearer ' + accessToken } } });
  const { data: u, error: uErr } = await auth.auth.getUser();
  if (uErr || !u || !u.user || (u.user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Not authorized' }) };
  }
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const users = await listAllUsers(sb);
    const events = await listEvents(sb);
    const subMap = {};
    try {
      const { data: creds } = await sb.from('user_credits').select('user_id, subscription_status');
      (creds || []).forEach((c) => { subMap[c.user_id] = c.subscription_status; });
    } catch (_) {}
    // User timeline mode (S20): event history for one user, AI text never exists in events.
    if (body.user) {
      const usr = users.find((x) => x.id === body.user && !(hidden(x.email) || x.user_metadata?.seed === true));
      if (!usr) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'user not found' }) };
      const md = usr.user_metadata || {};
      const timeline = events
        .filter((e) => (e.props || {}).user_id === usr.id || (md.anon_id && e.anon_id === md.anon_id))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((e) => ({ at: e.created_at, event: e.event, rel: (e.props || {}).rel || (e.props || {}).relationship || null, type_status: (e.props || {}).type_status || null, surface: (e.props || {}).surface || null }));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ user: { email: usr.email, signup: usr.created_at, type: md.mbti_type, source: md.signup_source, unsub: md.digest_unsub === true, unsub_at: md.unsub_at || null, attribution: attributionBucket(md), people: (md.people || []).map((p) => ({ n: p.n, r: p.r, t: p.t, st: p.st || (p.g ? 'estimated' : 'known') })), sessions: md.session_n, days: md.session_days }, timeline }) };
    }
    const days = body.days ? Number(body.days) : null;
    const out = computeAll(users, events, Date.now(), days, subMap);
    out.email = require('../lib/email-reporting').emailReport(users, events, Date.now(), days);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};

exports.computeAll = computeAll;
