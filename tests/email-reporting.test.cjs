const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const {emailReport,taggedLinks}=require('../netlify/lib/email-reporting');
const at='2026-10-03T12:00:00Z',time=Date.parse(at);
const row=(event,props,offset=0)=>({event,props,created_at:new Date(time+offset).toISOString()});
test('email cohorts exclude seeds, deduplicate outcomes, and require a timely recipient action',()=>{
 const users=[{id:'real',email:'real@example.com'},{id:'seed',email:'seed@example.com',user_metadata:{seed:true}}];
 const events=[row('mail_queued',{user_id:'real',email_token:'t',campaign:'weekly'}),row('mail_queued',{user_id:'seed',email_token:'s',campaign:'weekly'}),row('mail_accepted',{email_token:'t',message_id:'m'}),row('mail_webhook',{message_id:'m',kind:'delivered'}),row('mail_webhook',{message_id:'m',kind:'delivered'}),row('mail_webhook',{message_id:'m',kind:'opened'}),row('mail_webhook',{message_id:'m',kind:'opened'}),row('email_landing',{email_token:'t'},1000),row('ai_response_received',{email_token:'t',user_id:'real',email_touch_at:time+1000},2000)];
 let r=emailReport(users,events,time+3000).rows[0];assert.equal(r.queued,1);assert.equal(r.delivered,1);assert.equal(r.opened,1);assert.equal(r.returned,1);assert.equal(r.acted,1);
 events[events.length-1].props.user_id='seed';assert.equal(emailReport(users,events,time+3000).rows[0].acted,0);
 events[events.length-1].props.user_id='real';events[events.length-1].created_at=new Date(time+3600000).toISOString();assert.equal(emailReport(users,events,time+3600001).rows[0].acted,0);
});
test('tagging preserves destinations, fragments, and unsubscribe/referral links',()=>{
 const input='https://personality.fyi/person?i=2#profile';const url=new URL(taggedLinks(input,'weekly','token'));assert.equal(url.searchParams.get('i'),'2');assert.equal(url.hash,'#profile');assert.equal(url.searchParams.get('utm_medium'),'email');assert.equal(url.searchParams.get('pf_email'),'token');
 for(const s of ['https://personality.fyi/unsubscribe?t=x','https://personality.fyi/from/friend','https://outside.example/path','https://personality.fyi.evil.example/path'])assert.equal(taggedLinks(s,'x','t'),s);
});
test('webhook rejects invalid signatures and retries storage failures',async()=>{
 let stored=0,fail=false;
 const c={exports:{},process:{env:{RESEND_WEBHOOK_SECRET:'configured',SUPABASE_URL:'mock',SUPABASE_SERVICE_ROLE_KEY:'mock'}},Buffer,
 require(name){if(name==='svix')return {Webhook:class{verify(raw){if(raw==='bad')throw Error('signature');return JSON.parse(raw);}}};if(name==='@supabase/supabase-js')return {createClient:()=>({})};return {record:async()=>{if(fail)throw Error('offline');stored++;}};}};
 vm.runInNewContext(fs.readFileSync('netlify/functions/resend-webhook.js','utf8'),c);
 assert.equal((await c.exports.handler({httpMethod:'POST',headers:{},body:'bad'})).statusCode,400);assert.equal(stored,0);
 const request={httpMethod:'POST',headers:{'svix-id':'id'},body:JSON.stringify({type:'email.delivered',data:{email_id:'m'},created_at:at})};assert.equal((await c.exports.handler(request)).statusCode,200);assert.equal(stored,1);fail=true;assert.equal((await c.exports.handler(request)).statusCode,500);
});
test('mail events cannot create apparent product retention',()=>{
 const {computeAll}=require('../netlify/functions/admin-analytics');const user={id:'real',email:'real@example.com',created_at:at,user_metadata:{}};
 const result=computeAll([user],[row('mail_webhook',{user_id:'real'},86400000)],time+3*86400000);
 assert.equal(result.eventCount,0);
});
