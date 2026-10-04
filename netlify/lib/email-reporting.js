const { randomUUID } = require('node:crypto');
const {canReserve,weekKey,zoneFor}=require('./email-schedule');
const { createClient } = require('@supabase/supabase-js');
const INTERNAL = new Set(['bradleykam@gmail.com', 'brad@real.photos', 'info@real.photos', 'brad@personality.fyi']);
function excluded(user) {
  const email = (user.email || '').toLowerCase();
  return !email || user.user_metadata?.seed === true || INTERNAL.has(email) || email.endsWith('@real.photos');
}
// Owner explicitly opted into lifecycle emails; reporting still excludes this account.
function emailExcluded(user) {
  if ((user.email || '').toLowerCase() === 'brad@real.photos' && user.user_metadata?.seed !== true) return false;
  return excluded(user);
}
function taggedLinks(content, campaign, token) {
  return String(content || '').replace(/https:\/\/personality\.fyi(?=\/|[?#\s<>"']|$)(?:[/?#][^\s<>"']*)?/g, raw => {
    const url = new URL(raw.replace(/&amp;/g, '&'));
    if (/unsubscribe|\/from\//.test(url.pathname)) return raw;
    url.searchParams.set('utm_source', 'personality');
    url.searchParams.set('utm_medium', 'email');
    url.searchParams.set('utm_campaign', campaign);
    url.searchParams.set('pf_email', token);
    return url.toString();
  });
}
async function record(sb, event, props, at) {
  const row = {event, anon_id: 'mail:' + (props.message_id || props.email_token), path: '/email', props};
  if (at) row.created_at = at;
  for (let i = 0; i < 3; i++) {
    const {error} = await sb.from('funnel_events').insert(row);
    if (!error) return;
    if (i === 2) throw error;
  }
}
async function sendTracked({to, subject, text, html, from, reply_to, campaign, userId, emailToken, scheduledAt, emailKind='extra', extra = {}}) {
  if (!process.env.RESEND_API_KEY) return {sent:false, reason:'no-resend-key'};
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // All product emails use the same recipient-level limit, including reservations.
  if(!userId)return {sent:false,reason:'recipient-account-required'};
  let recipientZone;
  try {
    const {data,error}=await sb.auth.admin.getUserById(userId);
    if(error||!data?.user)throw Error('account unavailable');
    recipientZone=zoneFor(data.user)||'Europe/London';
    const {allRows}=require('./product-data');
    const events=await allRows(sb,'funnel_events');
    if(!canReserve(data.user,events,Date.parse(scheduledAt)||Date.now(),emailKind))return {sent:false,reason:'weekly-email-limit'};
  }catch{return {sent:false,reason:'email-limit-unavailable'};}
  const token = emailToken || randomUUID();
  const props = {...extra,scheduled_at:scheduledAt||null,email_kind:emailKind,email_token:token, campaign, user_id:userId || null, event_id:'queued:' + token};
  // Check durable storage before sending. Never retry a successful send because logging failed.
  try { await record(sb, 'mail_queued', props); }
  catch { return {sent:false, reason:'email-reporting-unavailable'}; }
  let r;
  try {
    r = await fetch('https://api.resend.com/emails', {
      method:'POST', signal:AbortSignal.timeout(8000), headers:{'Content-Type':'application/json', Authorization:'Bearer ' + process.env.RESEND_API_KEY, 'Idempotency-Key':require('node:crypto').createHash('sha256').update(userId+':'+weekKey(Date.parse(scheduledAt)||Date.now(),recipientZone)+':'+emailKind).digest('hex')},
      body:JSON.stringify({from, to:[to], reply_to, subject, scheduled_at:scheduledAt,
        text:taggedLinks(text,campaign,token), html:html == null ? undefined : taggedLinks(html,campaign,token),
        tags:[{name:'pf_campaign',value:campaign},{name:'pf_token',value:token}]})
    });
  } catch { await record(sb,'mail_send_failed',{...props,reason:'network-outcome-unknown'}).catch(()=>{});return {sent:false, reason:'resend-network-error'}; }
  if (!r.ok) { await record(sb,'mail_send_failed',{...props,reason:'resend-' + r.status}).catch(()=>{});return {sent:false, reason:'resend-' + r.status}; }
  const data = await r.json();
  let tracked = true;
  try { await record(sb, 'mail_accepted', {...props, message_id:data.id, event_id:'accepted:' + token}); }
  catch { tracked = false; console.error('Email accepted but reporting write failed', data.id); }
  return {sent:true, id:data.id, tracked};
}
const ACTIONS = new Set(['ai_response_received','person_added','nhie_answered','result_saved']);
function emailReport(users, events, now = Date.now(), days) {
  const valid = new Set(users.filter(u=>!excluded(u)).map(u=>u.id));
  const blocked = new Set(users.filter(excluded).map(u=>u.id));
  const cutoff = days ? now - days*86400000 : 0;
  const sends = new Map(), byMessage = new Map();
  // Queued records preserve token/account attribution even if the acceptance write fails.
  for (const e of events) {
    const p=e.props||{};
    if (e.event!=='mail_queued' || !valid.has(p.user_id) || !p.email_token) continue;
    if (new Date(e.created_at).getTime()<cutoff) continue;
    sends.set(p.email_token,{token:p.email_token,user:p.user_id,campaign:p.campaign||'unknown',at:e.created_at,states:new Set(),landed:false,acted:false});
  }
  for (const e of events) {
    const p=e.props||{}, s=sends.get(p.email_token);
    if (!s || !/^mail_/.test(e.event)) continue;
    if (p.message_id) byMessage.set(p.message_id,s);
    if (e.event==='mail_accepted') s.states.add('accepted');
    if (e.event==='mail_send_failed') s.states.add(p.reason==='network-outcome-unknown'?'unknown':'failed');
  }
  let lastWebhook=null;
  const failures = new Map();
  for(const e of events){const p=e.props||{};if(e.event==='mail_send_failed'&&valid.has(p.user_id)&&Date.parse(e.created_at)>=cutoff)failures.set(p.email_token+':send', {at:e.created_at,kind:p.reason==='network-outcome-unknown'?'Unknown send outcome':'Send rejected',reason:p.reason,campaign:p.campaign});}
  for (const e of events) {
    const p=e.props||{};
    if (e.event!=='mail_webhook') continue;
    if (!lastWebhook || e.created_at>lastWebhook) lastWebhook=e.created_at;
    const s=byMessage.get(p.message_id)||sends.get(p.email_token);
    if (s) s.states.add(p.kind);
    if (['failed','bounced','suppressed'].includes(p.kind) && (s || valid.has(p.user_id)) && new Date(e.created_at).getTime()>=cutoff) failures.set(p.message_id + ':' + p.kind, {at:e.created_at,kind:p.kind,reason:p.reason||'Not supplied',campaign:s?.campaign||'Historical / untagged'});
  }
  for (const e of events) {
    const p=e.props||{}, s=sends.get(p.email_token), at=new Date(e.created_at).getTime();
    if (!s || blocked.has(p.user_id) || (p.user_id && p.user_id!==s.user) || at<new Date(s.at).getTime()) continue;
    if (e.event==='email_landing') s.landed=true;
    if (ACTIONS.has(e.event) && p.user_id===s.user && p.email_touch_at && at>=Number(p.email_touch_at) && at-Number(p.email_touch_at)<=30*60*1000) s.acted=true;
  }
  const groups={};
  for (const s of sends.values()) {
    const week=new Date(s.at);week.setUTCDate(week.getUTCDate()-((week.getUTCDay()+6)%7));
    const cohort=week.toISOString().slice(0,10), key=s.campaign+'|'+cohort;
    const g=groups[key]??={campaign:s.campaign,week:cohort,queued:0,accepted:0,delivered:0,bounced:0,opened:0,clicked:0,complained:0,failed:0,suppressed:0,returned:0,acted:0};
    g.queued++;
    for (const k of ['accepted','delivered','bounced','opened','clicked','complained','failed','suppressed']) if(s.states.has(k) || (k==='accepted' && ['sent','delivered','opened','clicked'].some(x=>s.states.has(x))))g[k]++;
    if(s.landed)g.returned++;
    if(s.acted)g.acted++;
  }
  return {rows:Object.values(groups).sort((a,b)=>b.week.localeCompare(a.week)||a.campaign.localeCompare(b.campaign)),lastWebhook,failures:Array.from(failures.values()).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,20),
    webhookConfigured:!!process.env.RESEND_WEBHOOK_SECRET,
    definitions:'Unique messages per outcome, grouped by campaign and send week. Seeds/internal accounts excluded. Returns are tagged browser visits; meaningful returns require a saved result/person, recorded NHIE answer, or successful AI response by the recipient within the 30-minute email visit. Opens/clicks can include automated scanners. Historical sends cannot be reconstructed from old counters.'};
}
module.exports={excluded,emailExcluded,taggedLinks,record,sendTracked,emailReport};
