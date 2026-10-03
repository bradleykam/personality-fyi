const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
function fn(name) {
  const start = html.search(new RegExp('(?:async )?function '+name+'\\('));
  assert.ok(start >= 0, name);
  const end = html.indexOf('\n}', start) + 2;
  return html.slice(start, end);
}
function setup() {
  const map = new Map();
  const nodes = new Map();
  const events = [], bubbles = [], calls = [];
  const c = { console, Promise, Date, JSON, Math, URLSearchParams,
    localStorage: { getItem:k=>map.get(k)||null, setItem:(k,v)=>map.set(k,v), removeItem:k=>map.delete(k) },
    sessionStorage: { getItem:()=>null,setItem:()=>{} },
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { style:{}, value:'', classList:{remove(){}}, remove(){}, children:[] }); return nodes.get(id); } },
    crypto:{randomUUID:()=> 'result-1'}, location:{pathname:'/'},
    window:{location:{search:''}}, currentUser:null, supabaseClient:null,
    resultClaimPromise:null,revealedResultId:null, testStarted:false,
    testScores:{I:16,E:0,N:16,S:0,T:16,F:0,J:16,P:0},
    trackEvent:(...x)=>events.push(x), testAddBubble:(...x)=>bubbles.push(x),
    testSetButtons:x=>{c.buttons=x;},
    appNav:()=>{}, refreshHomePage:()=>{},updateTopbarAuth:()=>{},
    testGoJobs:()=>{}, shareTypeResult:()=>{},obpStart:()=>{},
    openAuthModal:()=>{c.opened=true;}, authSendCode:async()=>{calls.push('otp');},
    fetch:async()=>{calls.push('fetch'); throw Error('Unexpected network request');},
    setTimeout:f=>{c.timer=Promise.resolve().then(f);}, clearTimeout:()=>{},
    _pendingAiLogin:null,resendTimer:null,
  };
  vm.createContext(c);
  const descStart=html.indexOf('const TYPE_DESCS =');
  vm.runInContext(html.slice(descStart,html.indexOf('\n};',descStart)+3),c);
  vm.runInContext("const TYPE_NAMES = {INTJ:'The Architect'};",c);
  for (const name of ['testFinish','submitOrganicEmailGate','startResultSignIn','readPendingTestResult','claimPendingTestResult','saveAndRevealTestResult','renderTestResult','validateEmail','formatSpectrumPercentages','closeAuthModal']) vm.runInContext(fn(name),c);
  return {c,map,nodes,events,bubbles,calls};
}
const pending = {id:'r1',type:'INTJ',pct:{I:99,N:99,T:99,J:99},authRequested:true};
test('finishing anonymously scores and caches before any login or AI request',async()=>{
  const {c,map,calls,events}=setup();
  await c.testFinish(); await c.timer;
  assert.equal(JSON.parse(map.get('typeread_pending_result')).type,'INTJ');
  assert.deepEqual(calls,[]);
  assert.ok(events.some(e=>e[0]==='test_completed'));
  assert.ok(!events.some(e=>e[0]==='result_viewed'));
});
test('email gate initiates a single explicit sign-in; cancellation retains result',async()=>{
  const {c,map,calls,events}=setup();
  map.set('typeread_pending_result',JSON.stringify(pending));
  c.document.getElementById('organic-gate-email').value='person@example.com';
  await c.submitOrganicEmailGate();
  assert.deepEqual(calls,['otp']);assert.equal(c.opened,true);
  c.closeAuthModal();
  assert.ok(map.has('typeread_pending_result'));
  assert.ok(!events.some(e=>['signup_complete','result_viewed'].includes(e[0])));
});
test('successful auth saves automatically once, including percentages, and reveals',async()=>{
  const {c,map,events}=setup();map.set('typeread_pending_result',JSON.stringify(pending));
  c.currentUser={id:'u1',user_metadata:{mbti_type:'ENFP'}};
  let saves=0;
  c.supabaseClient={auth:{updateUser:async({data})=>{saves++;return {data:{user:{id:'u1',user_metadata:data}}};}}};
  await Promise.all([c.claimPendingTestResult(),c.claimPendingTestResult()]);
  assert.equal(saves,1);assert.equal(map.has('typeread_pending_result'),false);
  assert.equal(map.get('typeread_selected_type'),'INTJ');
  assert.equal(JSON.parse(map.get('typeread_type_percentages')).I,99);
  assert.equal(events.filter(e=>e[0]==='result_viewed').length,1);
  assert.equal(events.filter(e=>e[0]==='result_saved').length,1);
  await c.claimPendingTestResult(); assert.equal(saves,1);
});
test('failed persistence keeps result and offers retry without counting a save',async()=>{
  const {c,map,events}=setup();map.set('typeread_pending_result',JSON.stringify(pending));
  c.currentUser={id:'u1',user_metadata:{}};
  c.supabaseClient={auth:{updateUser:async()=>({error:{message:'offline'}})}};
  await c.claimPendingTestResult();
  assert.ok(map.has('typeread_pending_result'));
  assert.equal(c.buttons[0].label,'Retry saving');
  assert.equal(events.filter(e=>e[0]==='result_saved').length,0);
  c.supabaseClient.auth.updateUser=async({data})=>({data:{user:{id:'u1',user_metadata:data}}});
  await c.buttons[0].action();
  assert.equal(map.has('typeread_pending_result'),false);
  assert.equal(events.filter(e=>e[0]==='result_viewed').length,1);
});
test('OTP provider errors are shown, including resend, without a false success',async()=>{
  const {c}=setup();
  for (const name of ['authSendCode','authResendCode']) vm.runInContext(fn(name),c);
  c.pfAnonId=()=> 'anon';c.pfAttr=()=>({});c.clearCodeBoxes=()=>{};
  c.document.getElementById('auth-email').value='person@example.com';
  c.supabaseClient={auth:{signInWithOtp:async()=>({error:{message:'rate limited'}})}};
  await c.authSendCode();
  assert.equal(c.document.getElementById('auth-send-btn').disabled,false);
  assert.equal(c.document.getElementById('auth-email-error').className,'auth-error show');
  await c.authResendCode();
  assert.equal(c.document.getElementById('auth-code-error').className,'auth-error show');
});
test('all inline application scripts parse',()=>{
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[0].includes('application/ld+json')) continue;
    new vm.Script(match[1]);
  }
});
