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

test('suggested self and career questions submit immediately; career skips intake', () => {
  const source = html;
  for (const [name, inputId, sendId, sender] of [
    ['youAsk', 'home-chat-input', 'home-chat-send', 'homeChatSend'],
    ['careerSituation', 'advisor-input', 'advisor-send-btn', 'advisorSend']
  ]) {
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\n}', start) + 2;
    const input = {value: ''};
    const send = {disabled: false};
    let calls = 0;
    const ctx = {document: {getElementById: id => id === inputId ? input : id === sendId ? send : null}, trackEvent() {}, advisorIntake: {done: false}};
    ctx[sender] = () => { calls++; assert.equal(input.value, 'What should I do next?'); input.value = ''; };
    vm.runInNewContext(source.slice(start, end), ctx);
    ctx[name]('What should I do next?');
    assert.equal(calls, 1);
    assert.equal(input.value, '');
    if (name === 'careerSituation') assert.equal(ctx.advisorIntake.done, true);
    send.disabled = true;
    ctx[name]('What should I do next?');
    assert.equal(calls, 1);
  }
});

test('career editing updates the single job and industry while retaining other context', async () => {
  const ctx = {currentUser:{id:'u1',user_metadata:{career:{field:'Technology',role:'Designer',goal:'Lead a team'}}},careerSaving:false,crypto:{randomUUID:()=> 'career-1'},document:{getElementById:()=>({disabled:false})},trackEvent(){},careerResetChat(){},alert(){}};
  ctx.supabaseClient = {auth:{updateUser:async ({data})=>({data:{user:{...ctx.currentUser,user_metadata:{...ctx.currentUser.user_metadata,...data}}}})}};
  vm.runInNewContext(fn('careerList')+'\n'+fn('careerCtx')+'\n'+fn('careerPersist'),ctx);
  await ctx.careerPersist({field:'Healthcare',role:'Sales'},null);
  assert.equal(ctx.careerList().length,1);
  assert.equal(ctx.careerCtx().role,'Sales');
  assert.equal(ctx.careerCtx().field,'Healthcare');
  assert.equal(ctx.careerCtx().goal,'Lead a team');
  ctx.supabaseClient.auth.updateUser = async()=>({error:{message:'failed'}});
  await ctx.careerPersist({field:'Other',role:'Unsaved'},null);
  assert.equal(ctx.careerCtx().role,'Sales');
});

test('career history migrates to named threads without being rendered on entry', () => {
  const data = new Map([['pf_chat_career', JSON.stringify(['Is sales a fit?', '**Yes**, consider consultative sales.'])]]);
  const ctx = {currentUser:{id:'u1'},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},careerList:()=>[{id:'legacy',field:'Technology',role:'Sales'}],Date,JSON};
  vm.runInNewContext(fn('careerThreadsKey')+'\n'+fn('careerThreads'),ctx);
  const rows = ctx.careerThreads();
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,'Is sales a fit?');
  assert.equal(rows[0].history[1],'**Yes**, consider consultative sales.');
  assert.equal(ctx.careerThreads().length,1);
  assert.ok(!fn('advisorInit').includes('localStorage.getItem'));
  assert.ok(!fn('advisorInit').includes('Earlier conversation'));
});

test('career thread saving keeps distinct conversations and updates only the selected thread', () => {
  const data = new Map(); let n=0;
  const ctx={currentUser:{id:'u1'},careerActiveThread:null,careerThreadContext:null,advisorHistory:['First question','First answer'],careerList:()=>[],careerCtx:()=>({field:'Tech',role:'Sales'}),localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},crypto:{randomUUID:()=>String(++n)},youRenderThreads(){}};
  vm.runInNewContext(fn('careerThreadsKey')+'\n'+fn('careerThreads')+'\n'+fn('careerSaveThread'),ctx);
  ctx.careerSaveThread();
  ctx.careerActiveThread=null;ctx.advisorHistory=['Second question','Second answer'];ctx.careerSaveThread();
  assert.equal(ctx.careerThreads().length,2);
  ctx.advisorHistory.push('Follow up','Reply');ctx.careerSaveThread();
  assert.equal(ctx.careerThreads().length,2);
  assert.equal(ctx.careerThreads()[0].history.length,4);
});

test('career cards can save job and industry independently without clearing the other',async()=>{
 let saved;
 const nodes={'cc-role':{value:'Sales'}};
 const ctx={document:{getElementById:id=>nodes[id]||null},careerCtx:()=>({field:'Technology',role:'Designer'}),careerEditing:'legacy',careerPersist:async v=>{saved=v}};
 vm.runInNewContext(fn('careerCtxSave'),ctx);
 await ctx.careerCtxSave();assert.equal(saved.field,'Technology');assert.equal(saved.role,'Sales');
 delete nodes['cc-role'];nodes['cc-field']={value:'Healthcare'};
 await ctx.careerCtxSave();assert.equal(saved.field,'Healthcare');assert.equal(saved.role,'Designer');
});
