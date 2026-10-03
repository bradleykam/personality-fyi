const test=require('node:test');const assert=require('node:assert/strict');
const {computeAll}=require('../netlify/functions/admin-analytics');
const {listRows}=require('../netlify/functions/admin-data');
const user=(id,signup,days=[],extra={})=>({id,email:id+'@example.com',created_at:signup,user_metadata:{session_days:days,...extra}});
const ev=(event,time,actor='u1',sid='s1',anon='a1')=>({event,created_at:time,anon_id:anon,props:{user_id:actor,session_id:sid}});
test('D7 is exact day and eligibility waits for the whole UTC day',()=>{
  const u=user('u1','2026-09-15T23:00:00Z',['2026-09-23']);
  let r=computeAll([u],[],Date.parse('2026-09-22T23:59:59Z'));
  assert.equal(r.scorecards.retention.d7.d,0);
  r=computeAll([u],[],Date.parse('2026-09-23T00:00:00Z'));
  assert.deepEqual(r.scorecards.retention.d7,{n:0,d:1,pct:0});
  u.user_metadata.session_days.push('2026-09-22');
  assert.equal(computeAll([u],[],Date.parse('2026-09-24')).scorecards.retention.d7.n,1);
});
test('period filter does not erase older retention evidence',()=>{
  const u=user('u1','2026-09-15');
  const events=[ev('landing_view','2026-09-22')];
  const r=computeAll([u],events,Date.parse('2026-10-02'),7);
  assert.equal(r.scorecards.retention.d7.n,1);assert.equal(r.eventCount,0);
});
test('funnel requires same actors in order and excludes internal browser history',()=>{
  const users=[user('u1','2026-09-15'),{...user('admin','2026-09-15'),email:'brad@personality.fyi'}];
  const events=[ev('test_started','2026-09-16T00:00:00Z'),ev('test_completed','2026-09-16T00:01:00Z'),ev('result_viewed','2026-09-16T00:02:00Z'),ev('career_planning_started','2026-09-16T00:03:00Z'),ev('landing_view','2026-09-17','u1','s2'),
    ev('test_completed','2026-09-16',null,'s3','unrelated'),ev('test_started','2026-09-16',null,'s4','internal'),ev('landing_view','2026-09-17','admin','s5','internal')];
  const r=computeAll(users,events,Date.parse('2026-10-02'));
  assert.deepEqual(r.funnel.map(s=>s.count),[1,1,1,1,1]);
  assert.equal(r.eventCount,6);assert.equal(r.scorecards.emailCaptures,1);
});
test('saved manual type and metered AI alone do not prove result viewing or AI activation',()=>{
  const r=computeAll([user('u1','2026-09-15',[],{mbti_type:'INTJ'})],[ev('ai_quota_consumed','2026-09-16')],Date.parse('2026-10-02'));
  assert.equal(r.scorecards.resultViewers,0);
  assert.equal(r.activationPaths.find(r=>r.path==='AI activated').users,0);
  assert.equal(r.aiUsage.consumedTotal,1);
});
test('activation retention uses activation date',()=>{
  const u=user('u1','2026-09-01',['2026-09-16'],{people:[{n:'Friend'}],first_person_added_at:'2026-09-15'});
  const r=computeAll([u],[],Date.parse('2026-10-02'));
  assert.equal(r.cohorts.byActivation[0].d1.n,1);
  assert.equal(r.cohorts.bySignup[0].d1.n,0);
});
test('account aggregates read beyond the 1000-row API limit',async()=>{
  const rows=Array.from({length:1450},(_,id)=>({id}));
  const q={select(){return q},order(){return q},async range(a,b){return {data:rows.slice(a,b+1)}}};
  assert.equal((await listRows({from:()=>q},'table','id','id')).length,1450);
});
