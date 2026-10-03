const test=require('node:test'),assert=require('node:assert/strict');
const {buildReport}=require('../netlify/lib/admin-report');
const {selectEmail,buildEmail,lifestyleSamples}=require('../netlify/lib/lifecycle-email');
const {DAY,MEASUREMENT_START}=require('../netlify/lib/product-data');
const start=Date.parse(MEASUREMENT_START),now=start+40*DAY;
const user=(id,md={},age=30)=>({id,email:id+'@example.com',email_confirmed_at:new Date(now-age*DAY).toISOString(),created_at:new Date(now-age*DAY).toISOString(),user_metadata:md});
const event=(name,id,at,extra={})=>({id:Math.random(),event:name,created_at:new Date(at).toISOString(),props:{user_id:id,server_verified:true,event_id:Math.random(),...extra}});
const sent=(id,campaign,at,n)=>event('mail_accepted',id,at,{campaign,email_token:'token'+n});
test('snapshot excludes seeds, internal and unconfirmed; setup groups partition all real accounts',()=>{
 const users=[user('a'),user('b',{mbti_type:'ENTP'}),user('c',{mbti_type:'INTJ',people:[{n:'A'}],career:{role:'Sales'}}),user('s',{seed:true}),{...user('x'),email:'brad@personality.fyi'},{...user('pending'),email_confirmed_at:null}];
 const r=buildReport({users,events:[],now});assert.equal(r.snapshot.accounts,3);assert.equal(r.snapshot.setup.reduce((n,x)=>n+x.accounts,0),3);assert.equal(r.snapshot.withRelationships,1);assert.equal(r.snapshot.withCareer,1);assert.equal(r.billing.paidAccounts,null);
});
test('verified answers deduplicate; mail, client attempts and failures never inflate value',()=>{
 const u=user('a'),a=event('server_ai_answer','a',now-2*DAY,{request_id:'same',surface:'compatibility'});
 const r=buildReport({users:[u],now,events:[a,a,event('ai_message_sent','a',now),event('mail_webhook','a',now),event('server_ai_failure','a',now),event('server_ai_answer','a',now-DAY,{surface:'career'}),event('server_ai_answer','a',now,{server_verified:false})]});
 assert.equal(r.value.answers,2);assert.equal(r.value.accounts,1);assert.equal(r.value.repeatAccounts,1);assert.equal(r.value.failures,1);assert.equal(r.value.surfaces.find(x=>x.label==='Relationships').answers,1);
});
test('first-week conversion uses mature signup cohorts and counts answers inside that window only',()=>{
 const a=user('a',{},10),b=user('b',{},3),c=user('c',{},10);
 const events=[event('server_ai_answer','a',now-9*DAY),event('server_ai_answer','a',now-8*DAY),event('server_ai_answer','b',now-2*DAY),event('server_ai_answer','c',now-DAY)];
 const r=buildReport({users:[a,b,c],events,now});assert.deepEqual(r.value.firstWeek,{n:1,d:2,pct:50});assert.equal(r.value.firstWeekPending,1);assert.deepEqual(r.value.repeatWeek,{n:1,d:1,pct:100});
});
test('email actions require recipient match, valid visit time, and server verification',()=>{
 const u=user('a'),token='t',base=[event('mail_queued','a',now-DAY,{email_token:token,campaign:'life-set-type'}),event('mail_accepted','a',now-DAY,{email_token:token,message_id:'m'})];
 const action=event('account_type_saved','a',now-DAY+1000,{email_token:token,email_touch_at:now-DAY});
 assert.equal(buildReport({users:[u],events:[...base,action],now}).email.rows[0].types,1);
 for(const patch of [{user_id:'wrong'},{email_touch_at:undefined},{server_verified:false},{email_touch_at:now+DAY}])assert.equal(buildReport({users:[u],events:[...base,{...action,props:{...action.props,...patch}}],now}).email.rows[0].types,0);
});
test('no type always leads to type setup; subscriptions and editorial do not displace it',()=>{
 const u=user('a',{welcomed:true});const choice=selectEmail(u,[],now);assert.equal(choice.campaign,'life-set-type');assert.match(buildEmail(u,choice).text,/Choose your type/);assert.match(buildEmail(u,choice).text,/take-the-test/);
});
test('existing context routes to substantive followups',()=>{
 assert.equal(selectEmail(user('a',{mbti_type:'ENTP',people:[{n:'Friend'}]}),[],now).campaign,'life-relationship-question');
 assert.equal(selectEmail(user('b',{mbti_type:'INTJ',career:{role:'Engineer'}}),[],now).campaign,'life-career-question');
 const u=user('c',{mbti_type:'INTJ'});assert.equal(selectEmail(u,[],now).campaign,'life-add-relationship');assert.equal(selectEmail(u,[sent('c','life-add-relationship',now-4*DAY,1)],now).campaign,'life-add-career');
});
test('editorial never goes to active accounts or before substantive attempts',()=>{
 const u=user('a',{mbti_type:'ENTP',welcomed:true,last_seen_at:new Date(now-6*DAY).toISOString()});
 const events=[sent('a','life-add-relationship',now-21*DAY,1),sent('a','life-add-career',now-14*DAY,2),sent('a','life-add-relationship',now-8*DAY,3)];
 assert.doesNotMatch(selectEmail(u,events,now).campaign,/article|lifestyle/);
 u.user_metadata.last_seen_at=new Date(now-8*DAY).toISOString();assert.equal(selectEmail(u,events,now).campaign,'life-article');
 assert.equal(selectEmail(u,events,now,{ENTP:{statement:'X',have:5,total:8}}).campaign,'life-lifestyle');
});
test('cooldowns, unsubscribe, seeds and ambiguous sends prevent sending',()=>{
 for(const md of [{seed:true},{digest_unsub:true},{signup_country:'KP'}])assert.equal(selectEmail(user('a',md),[],now),null);
 assert.equal(selectEmail(user('a'),[sent('a','life-set-type',now-DAY,1)],now),null);
 assert.equal(selectEmail(user('a'),[event('mail_queued','a',now-5*DAY,{email_token:'pending'})],now),null);
});
test('no more than two messages per rolling week and pause after four unanswered touches',()=>{
 const u=user('a',{mbti_type:'ENTP',welcomed:true});
 assert.equal(selectEmail(u,[sent('a','life-add-career',now-3.1*DAY,1),sent('a','life-add-relationship',now-6.5*DAY,2)],now),null);
 assert.equal(selectEmail(u,[1,2,3,4].map((x,i)=>sent('a','life-add-career',now-(4+i*4)*DAY,x)),now),null);
});
test('lifestyle samples exclude seeds and duplicate voters and never manufacture type results',()=>{
 const users=[1,2,3,4,5].map(i=>user('u'+i));users.push(user('seed',{seed:true}));const votes=users.map(u=>({user_id:u.id,user_type:'ENTP',statement_id:1,answer:'i_have'}));votes.push(votes[0]);const r=lifestyleSamples(users,votes,[{id:1,statement:'Never have I ever quit a job'}]);assert.equal(r.ENTP.total,5);assert.equal(r.ENTP.have,5);assert.equal(r.INFJ,undefined);
});
const fs=require('node:fs'),vm=require('node:vm');
test('AI outcomes use authenticated identity and nonempty provider responses, never client success claims',async()=>{
 let written=[],status=200,content=[{type:'text',text:'An answer'}],storageFail=false,calls=0;
 const c={exports:{},console:{error(){}},process:{env:{SUPABASE_URL:'mock',SUPABASE_ANON_KEY:'mock',CLAUDE_RUN_SECRET:'build'}},fetch:async()=>{calls++;return {ok:status===200,status,json:async()=>({id:'provider-request',content})}},require(name){if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async token=>token==='valid'?{data:{user:{id:'verified'}}}:{error:Error('invalid')}}})};if(name==='../lib/product-events')return {touch:()=>({}),write:async(...a)=>{if(storageFail)throw Error('offline');written.push(a)}};return require(name)}};
 vm.runInNewContext(fs.readFileSync('netlify/functions/claude.js','utf8'),c);
 const request={httpMethod:'POST',headers:{authorization:'Bearer valid','x-pf-surface':'career','x-pf-answer':'1'},body:'{}'};
 assert.equal((await c.exports.handler({...request,headers:{}})).statusCode,401);assert.equal(calls,0);
 await c.exports.handler(request);assert.equal(written[0][0],'server_ai_answer');assert.equal(written[0][1],'verified');
 await c.exports.handler({...request,headers:{authorization:'Bearer valid'}});assert.equal(written.at(-1)[0],'server_ai_response');
 content=[];await c.exports.handler(request);assert.equal(written.at(-1)[0],'server_ai_failure');
 status=429;await c.exports.handler(request);assert.equal(written.at(-1)[0],'server_ai_failure');
 status=200;content=[{type:'text',text:'Valid'}];storageFail=true;assert.equal((await c.exports.handler(request)).statusCode,200);
 const before=written.length;await c.exports.handler({...request,headers:{'x-build-secret':'build'}});assert.equal(written.length,before);
});
test('tracking endpoint rejects forged server events and forged account identities',async()=>{
 const rows=[];const c={exports:{},console,process:{env:{}},require(name){if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'actual',user_metadata:{}}}})},from:()=>({insert:async row=>{rows.push(row);return {}}})})};return require(name.replace('../lib/','../netlify/lib/'))}};
 vm.runInNewContext(fs.readFileSync('netlify/functions/track-event.js','utf8'),c);
 const req={httpMethod:'POST',headers:{authorization:'Bearer valid'},body:JSON.stringify({event:'server_ai_answer',props:{user_id:'victim',server_verified:true}})};
 assert.equal((await c.exports.handler(req)).statusCode,400);assert.equal(rows.length,0);
 req.body=JSON.stringify({event:'visit',props:{user_id:'victim',server_verified:true}});assert.equal((await c.exports.handler(req)).statusCode,204);assert.equal(rows[0].props.user_id,'actual');assert.equal(rows[0].props.server_verified,undefined);
});
test('production measurement marker excludes pre-release outcomes and immature cohorts',()=>{
 const marker=event('lifecycle_measurement_start',null,now-2*DAY),u=user('a',{},10);
 const r=buildReport({users:[u],events:[marker,event('server_ai_answer','a',now-3*DAY)],now});assert.equal(r.value.answers,0);assert.equal(r.value.firstWeek.d,0);assert.equal(r.coverage.since,marker.created_at);
});
test('rejected sends appear as failures while delivery evidence recovers missing acceptance',()=>{
 const u=user('a'),events=[event('mail_queued','a',now-DAY,{email_token:'t',campaign:'life-set-type'}),event('mail_send_failed','a',now-DAY,{email_token:'t',reason:'resend-429'})];
 let r=buildReport({users:[u],events,now});assert.equal(r.email.rows[0].failed,1);assert.equal(r.email.rows[0].accepted,0);assert.equal(r.email.failures.length,1);
 events.pop();events.push(event('mail_webhook','a',now-DAY,{email_token:'t',kind:'delivered'}));r=buildReport({users:[u],events,now});assert.equal(r.email.rows[0].accepted,1);assert.equal(r.email.rows[0].delivered,1);
});
test('tagged provider suppressions block recipients even when webhooks lack a user ID',()=>{
 const u=user('a',{mbti_type:'ENTP'}),base=[event('mail_queued','a',now-10*DAY,{email_token:'t',campaign:'life-add-career'}),event('mail_accepted','a',now-10*DAY,{email_token:'t',campaign:'life-add-career'})];
 for(const kind of ['complained','suppressed','bounced'])assert.equal(selectEmail(u,[...base,event('mail_webhook',null,now-9*DAY,{email_token:'t',kind})],now),null);
});
