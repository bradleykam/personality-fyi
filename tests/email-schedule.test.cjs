const test=require('node:test'),assert=require('node:assert/strict');
const {nextSaturday,canReserve,scheduledChoice,weekKey}=require('../netlify/lib/email-schedule');
const now=Date.parse('2026-10-09T16:00:00Z');
const user={id:'u',created_at:'2026-09-01T00:00:00Z',user_metadata:{timezone:'America/Los_Angeles',welcomed:true}};
const select=()=>({campaign:'life-add-career',token:'t'});
const email=(at,kind='extra',token=at)=>({event:'mail_accepted',created_at:at,props:{user_id:'u',email_token:token,email_kind:kind}});
test('Saturday delivery is 9am local including DST and fractional offsets',()=>{
 assert.equal(new Date(nextSaturday(now,'America/Los_Angeles')).toISOString(),'2026-10-10T16:00:00.000Z');
 assert.equal(new Date(nextSaturday(Date.parse('2026-11-06T00:00:00Z'),'America/Los_Angeles')).toISOString(),'2026-11-07T17:00:00.000Z');
 assert.equal(new Date(nextSaturday(now,'Asia/Kathmandu')).toISOString(),'2026-10-10T03:15:00.000Z');
 assert.equal(new Date(nextSaturday(now,'Pacific/Auckland')).toISOString(),'2026-10-09T20:00:00.000Z');
});
test('unknown zone falls back to 11am UK, with British summer time respected',()=>{
 const u={...user,user_metadata:{welcomed:true}};
 assert.equal(scheduledChoice(u,[],now,select).scheduledAt,'2026-10-10T10:00:00.000Z');
 assert.equal(new Date(nextSaturday(Date.parse('2026-11-06T12:00:00Z'),'Europe/London',11)).toISOString(),'2026-11-07T11:00:00.000Z');
});
test('regular mail queues only in the preceding 24h and once per local week',()=>{
 assert.equal(scheduledChoice(user,[],now-2*86400000,select),null);
 const choice=scheduledChoice(user,[],now,select);assert.equal(choice.emailKind,'weekly');
 assert.equal(scheduledChoice(user,[email('2026-10-10T16:00:00Z','weekly')],now,select),null);
});
test('one weekly plus one extra max, with queued reservations and failed sends handled',()=>{
 const at=Date.parse('2026-10-10T16:00:00Z'),first=email('2026-10-06T12:00:00Z');
 assert.equal(canReserve(user,[first],at,'weekly'),true);
 assert.equal(canReserve(user,[first],at,'extra'),false);
 const pending={event:'mail_queued',created_at:'2026-10-09T16:00:00Z',props:{user_id:'u',email_token:'p',email_kind:'weekly',scheduled_at:'2026-10-10T16:00:00Z'}};
 assert.equal(canReserve(user,[first,pending],at,'weekly'),false);
 assert.equal(canReserve(user,[first,pending,{event:'mail_send_failed',props:{email_token:'p',reason:'network-outcome-unknown'}}],at,'weekly'),false);
 assert.equal(canReserve(user,[first,pending,{event:'mail_send_failed',props:{email_token:'p',reason:'resend-422'}}],at,'weekly'),true);
});
test('new signup welcome can go outside Saturday and shares the extra slot',()=>{
 const u={...user,created_at:new Date(now-7200000).toISOString(),user_metadata:{timezone:'America/Los_Angeles'}};
 assert.equal(scheduledChoice(u,[],now,select).emailKind,'extra');
 assert.equal(weekKey(Date.parse('2026-10-12T01:00:00Z'),'America/Los_Angeles'),'2026-10-05');
});
