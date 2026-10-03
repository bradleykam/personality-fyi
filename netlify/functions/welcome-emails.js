// One lifecycle decision per account. Netlify invokes this scheduled function only on production.
const {createClient}=require('@supabase/supabase-js');
const {allUsers,allRows}=require('../lib/product-data');
const {selectEmail,buildEmail,lifestyleSamples}=require('../lib/lifecycle-email');
const {sendTracked,record}=require('../lib/email-reporting');
exports.handler=async event=>{
 const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY),now=Date.now();
 const dryRun=process.env.WELCOME_DRY_RUN==='true';
 try{
  const [users,events]=await Promise.all([allUsers(sb),allRows(sb,'funnel_events','*','id',new Date(now).toISOString())]);
  let samples={};
  // Fetch lifestyle samples only if a recipient could be eligible for the secondary content.
  if(users.some(u=>selectEmail(u,events,now)?.campaign==='life-article')){
   const [votes,statements]=await Promise.all([allRows(sb,'nhie_votes'),allRows(sb,'nhie_statements')]);samples=lifestyleSamples(users,votes,statements);
  }
  const eligible=users.map(user=>({user,choice:selectEmail(user,events,now,samples)})).filter(x=>x.choice);
  const summary={dryRun,eligible:eligible.length,attempted:0,accepted:0,failed:0,deferred:0,campaigns:{}};
  // Small bounded batches keep the scheduler under its runtime limit; later sweeps handle the rest.
  for(const {user,choice} of eligible){
   summary.campaigns[choice.campaign]=(summary.campaigns[choice.campaign]||0)+1;
   if(dryRun)continue;
   if(summary.attempted>=8||Date.now()-now>18000){summary.deferred++;continue;}
   summary.attempted++;
   const message=buildEmail(user,choice);
   const result=await sendTracked({to:user.email,...message,campaign:choice.campaign,userId:user.id,emailToken:choice.token,extra:{goal:choice.goal,notice_key:choice.noticeKey||null},from:process.env.RESEND_FROM||'Brad Kam <brad@personality.fyi>',reply_to:'brad@personality.fyi'});
   if(result.sent){summary.accepted++;const {error}=await sb.auth.admin.updateUserById(user.id,{user_metadata:{welcomed:true,welcomed_at:user.user_metadata?.welcomed_at||new Date().toISOString(),lifecycle_last_at:new Date().toISOString()}});if(error)console.error('Lifecycle metadata write failed; accepted event remains authoritative');}
   else {summary.failed++;if(/resend-(429|401|403)|network|reporting/.test(result.reason))break;}
   await new Promise(r=>setTimeout(r,550));
  }
  await record(sb,'lifecycle_run',{...summary,event_id:require('node:crypto').randomUUID()});
  return {statusCode:200,body:JSON.stringify(summary)};
 }catch(e){console.error('Lifecycle sweep failed',e.message);await record(sb,'lifecycle_run',{dryRun,error:'Lifecycle data or delivery unavailable; stopped without further sends',event_id:require('node:crypto').randomUUID()}).catch(()=>{});return {statusCode:500,body:JSON.stringify({error:'Lifecycle data unavailable; no further sends attempted'})};}
};
exports.config={schedule:'*/15 * * * *'};
