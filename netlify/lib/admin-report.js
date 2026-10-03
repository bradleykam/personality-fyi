const {TYPES,DAY,MEASUREMENT_START,date,careerFilled,realUsers,trustedEvents,coverageStart}=require('./product-data');
const {emailReport}=require('./email-reporting');
const rate=(n,d)=>({n,d,pct:d?Math.round(n/d*1000)/10:null});
const day=x=>new Date(x).toISOString().slice(0,10);
function buildReport({users,events,now=Date.now(),days=30,billing={available:false,reason:'Not checked'}}) {
 const real=realUsers(users), ids=new Set(real.map(u=>u.id));
 const since=coverageStart(events),start=Math.max(now-days*DAY,since), observed=trustedEvents(events,users,now);
 const answers=observed.filter(e=>e.event==='server_ai_answer'), failures=observed.filter(e=>e.event==='server_ai_failure');
 const windowAnswers=answers.filter(e=>date(e.created_at)>=start), windowFailures=failures.filter(e=>date(e.created_at)>=start);
 const unique=rows=>new Set(rows.map(e=>e.props.user_id)).size;
 const byUser=new Map(real.map(u=>[u.id,answers.filter(e=>e.props.user_id===u.id)]));
 const typed=real.filter(u=>TYPES.has(u.user_metadata?.mbti_type));
 const people=real.filter(u=>u.user_metadata?.people?.some(p=>p&&p.n));
 const career=real.filter(u=>careerFilled(u.user_metadata||{}));
 const paidIds=new Set(billing.available?billing.userIds||[]:[]);
 const setup=[['No saved type',real.filter(u=>!TYPES.has(u.user_metadata?.mbti_type))],['Type, no relationship or career context',typed.filter(u=>!people.includes(u)&&!career.includes(u))],['Relationship context only',typed.filter(u=>people.includes(u)&&!career.includes(u))],['Career context only',typed.filter(u=>career.includes(u)&&!people.includes(u))],['Both contexts saved',typed.filter(u=>career.includes(u)&&people.includes(u))]].map(([label,rows])=>({label,accounts:rows.length}));
 const cohort=real.filter(u=>date(u.created_at)>=start&&date(u.created_at)<=now);
 const eligible=cohort.filter(u=>date(u.created_at)+7*DAY<=now);
 const activated=eligible.filter(u=>(byUser.get(u.id)||[]).some(e=>date(e.created_at)>=date(u.created_at)&&date(e.created_at)<date(u.created_at)+7*DAY));
 const repeatEligible=real.filter(u=>{const first=byUser.get(u.id)?.[0];return first&&date(first.created_at)>=start&&date(first.created_at)+7*DAY<=now;});
 const repeat=repeatEligible.filter(u=>{const a=byUser.get(u.id),first=date(a[0].created_at);return a.some(e=>day(e.created_at)>day(first)&&date(e.created_at)<first+7*DAY);});
 const surfaces=['You','Relationships','Career','Other'].map(label=>{const rows=windowAnswers.filter(e=>surface(e.props.surface)===label);return {label,answers:rows.length,accounts:unique(rows),repeatAccounts:new Set(rows.filter(e=>new Set(rows.filter(x=>x.props.user_id===e.props.user_id).map(x=>day(x.created_at))).size>=2).map(e=>e.props.user_id)).size};});
 const recentDays=Array.from({length:Math.min(days,30)},(_,i)=>{const at=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate())-(Math.min(days,30)-1-i)*DAY;const rows=answers.filter(e=>day(e.created_at)===day(at));return {day:day(at),accounts:at+DAY<=since?null:unique(rows),answers:at+DAY<=since?null:rows.length};});
 const failuresByStatus={};windowFailures.forEach(e=>{const k=String(e.props.status||'network');failuresByStatus[k]=(failuresByStatus[k]||0)+1;});
 const email=emailReport(real,events,now,days);
 // Only server-verified recipient actions qualify as email conversion. Browser visits/opens are diagnostic, not conversions.
 const messages=new Map();for(const e of events){const p=e.props||{};if(e.event==='mail_queued'&&ids.has(p.user_id)&&date(e.created_at)>=now-days*DAY&&date(e.created_at)<=now)messages.set(p.email_token,{campaign:p.campaign,user:p.user_id,at:date(e.created_at),actions:new Set()});}
 for(const e of observed){const p=e.props,m=messages.get(p.email_token);if(!m||p.user_id!==m.user||date(e.created_at)<m.at||!Number.isFinite(Number(p.email_touch_at))||Number(p.email_touch_at)>date(e.created_at)||date(e.created_at)-Number(p.email_touch_at)>30*60*1000||Number(p.email_touch_at)<m.at)continue;if(['server_ai_answer','account_type_saved','account_relationship_saved','account_career_saved'].includes(e.event))m.actions.add(e.event);}
 const emailRows=email.rows.map(r=>{const ms=[...messages.values()].filter(m=>m.campaign===r.campaign&&week(m.at)===r.week);return {...r,acted:undefined,returned:undefined,conversions:ms.filter(m=>m.actions.size).length,types:ms.filter(m=>m.actions.has('account_type_saved')).length,relationships:ms.filter(m=>m.actions.has('account_relationship_saved')).length,careers:ms.filter(m=>m.actions.has('account_career_saved')).length,answers:ms.filter(m=>m.actions.has('server_ai_answer')).length};});
 const trackingRuns=events.filter(e=>e.event==='lifecycle_run').sort((a,b)=>date(b.created_at)-date(a.created_at));
 return {asOf:new Date(now).toISOString(),days,coverage:{since:new Date(since).toISOString(),windowStart:new Date(start).toISOString(),historical:'Historical sessions, attempted questions, and feature opens are excluded from value and retention metrics. These metrics start with server-verified outcomes; they cannot be backfilled.',notes:['An AI answer generated is evidence of a response, not proof that it was valuable.','Account setup is a current snapshot, not an ordered conversion funnel.','Unconfirmed accounts, seed accounts, and internal accounts are excluded.','All dates use UTC. Recent seven-day cohorts remain pending until mature.']},snapshot:{accounts:real.length,withType:typed.length,withRelationships:people.length,withCareer:career.length,newAccounts:real.filter(u=>date(u.created_at)>=now-days*DAY).length,excluded:users.length-real.length,setup},value:{answers:windowAnswers.length,accounts:unique(windowAnswers),repeatAccounts:new Set(windowAnswers.filter(e=>new Set(windowAnswers.filter(x=>x.props.user_id===e.props.user_id).map(x=>day(x.created_at))).size>=2).map(e=>e.props.user_id)).size,failures:windowFailures.length,failuresByStatus,surfaces,daily:recentDays,firstWeek:rate(activated.length,eligible.length),firstWeekPending:cohort.length-eligible.length,repeatWeek:rate(repeat.length,repeatEligible.length)},billing:{...billing,userIds:undefined,paidAccounts:billing.available?paidIds.size:null,conversion:billing.available&&billing.unmatched===0?rate(paidIds.size,real.length):null},email:{...email,rows:emailRows,lastRun:trackingRuns[0]?.props||null,lastRunAt:trackingRuns[0]?.created_at||null},accounts:real.map(u=>({id:u.id,email:u.email,signup:u.created_at,type:TYPES.has(u.user_metadata?.mbti_type)?u.user_metadata.mbti_type:null,people:(u.user_metadata?.people||[]).filter(p=>p&&p.n).length,career:careerFilled(u.user_metadata||{}),answers:byUser.get(u.id).length,lastAnswer:byUser.get(u.id).slice(-1)[0]?.created_at||null,paid:billing.available?paidIds.has(u.id):null,nextAction:!TYPES.has(u.user_metadata?.mbti_type)?'Set type':!people.includes(u)&&!career.includes(u)?'Add life context':!(byUser.get(u.id).length)?'Ask a question':'Return for another useful answer'})).sort((a,b)=>date(b.signup)-date(a.signup))};
}
function surface(s){return /career|advisor/.test(s||'')?'Career':/compat|person|relationship/.test(s||'')?'Relationships':/profile|self|home/.test(s||'')?'You':'Other';}
function week(at){const d=new Date(at);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return day(d);}
async function billingSnapshot(users,credits){
 if(process.env.STRIPE_SECRET_KEY?.includes('_test_'))return {available:false,reason:'Stripe is configured with a test key; live subscriptions are unavailable'};
 if(!process.env.STRIPE_SECRET_KEY)return {available:false,reason:'Stripe is not configured'};
 try{const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY),real=realUsers(users),ids=new Set(real.map(u=>u.id)),byEmail=new Map(real.map(u=>[u.email.toLowerCase(),u.id])),byCustomer=new Map(credits.filter(c=>ids.has(c.user_id)).map(c=>[c.stripe_customer_id,c.user_id]));const paid=new Set();let unmatched=0,subscriptions=0;
 for await(const sub of stripe.subscriptions.list({status:'active',limit:100,expand:['data.latest_invoice','data.customer']})){
  if(!sub.livemode)continue;if(process.env.STRIPE_SUBSCRIPTION_PRICE_ID&&!sub.items.data.some(x=>x.price.id===process.env.STRIPE_SUBSCRIPTION_PRICE_ID))continue;const inv=sub.latest_invoice;if(!inv||typeof inv==='string')throw Error('Invoice evidence missing');if(inv.status!=='paid'||!inv.amount_paid)continue;
  const customer=typeof sub.customer==='object'?sub.customer:null;const id=ids.has(sub.metadata?.user_id)?sub.metadata.user_id:byCustomer.get(customer?.id||sub.customer)||byEmail.get((customer?.email||'').toLowerCase());
  // Internal subscribers do not count as product customers.
  if(!id&&users.some(u=>!ids.has(u.id)&&(u.id===sub.metadata?.user_id||(u.email||'').toLowerCase()===(customer?.email||'').toLowerCase())))continue;
  subscriptions++;if(id)paid.add(id);else unmatched++;
 }
 return {available:true,userIds:[...paid],subscriptions,unmatched,source:'Live Stripe active subscriptions with a paid, nonzero latest invoice. Trials, free subscriptions, and internal accounts excluded.',checkedAt:new Date().toISOString()};
 }catch(e){return {available:false,reason:'Stripe could not be verified. No paid count is shown.'};}
}
module.exports={buildReport,billingSnapshot,surface};
