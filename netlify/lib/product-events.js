const {randomUUID}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
function touch(headers={}) {
 const token=headers['x-pf-email-token'], at=Number(headers['x-pf-email-at']);
 if(!/^[a-f0-9-]{36}$/i.test(token||'')||!Number.isFinite(at)||Date.now()-at>1800000||at>Date.now())return {};
 return {email_token:token,email_touch_at:at};
}
async function write(event,userId,props={}) {
 const sb=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
 const {error}=await sb.from('funnel_events').insert({event,anon_id:'account:'+userId,path:'/server',props:{...props,user_id:userId,server_verified:true,instrumentation_version:3,event_id:randomUUID()}});
 if(error)throw error;
}
module.exports={touch,write};
