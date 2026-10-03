const {excluded} = require('./email-reporting');
const TYPES = new Set('INTJ INTP ENTJ ENTP INFJ INFP ENFJ ENFP ISTJ ISFJ ESTJ ESFJ ISTP ISFP ESTP ESFP'.split(' '));
const DAY = 86400000;
const MEASUREMENT_START = '2026-10-03T21:00:00Z';
const date = x => {const n=Date.parse(x);return Number.isFinite(n)?n:0;};
const careerFilled = md => ['role','field','goal','concern'].some(k=>typeof md.career?.[k]==='string' && md.career[k].trim());
async function allUsers(sb) {
 const all=[];for(let page=1;;page++){const {data,error}=await sb.auth.admin.listUsers({page,perPage:1000});if(error)throw error;all.push(...data.users);if(data.users.length<1000)return all;}
}
async function allRows(sb,table,columns='*',order='id',until) {
 const rows=[];for(let offset=0;;offset+=1000){let q=sb.from(table).select(columns).order(order,{ascending:true});if(until)q=q.lte('created_at',until);const {data,error}=await q.range(offset,offset+999);if(error)throw error;rows.push(...data);if(data.length<1000)return rows;}
}
function realUsers(users){return users.filter(u=>!excluded(u) && u.email_confirmed_at);}
function coverageStart(events){return events.filter(e=>e.event==='lifecycle_measurement_start'&&e.props?.server_verified===true).map(e=>date(e.created_at)).filter(Boolean).sort((a,b)=>a-b)[0]||date(MEASUREMENT_START);}
function trustedEvents(events, users, now=Date.now()) {
 const ids=new Set(realUsers(users).map(u=>u.id)), seen=new Set();
 return events.filter(e=>{const p=e.props||{},key=p.request_id||p.event_id||e.id;if(!ids.has(p.user_id)||!p.server_verified||date(e.created_at)>now||date(e.created_at)<coverageStart(events))return false;const k=e.event+':'+key;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>date(a.created_at)-date(b.created_at));
}
module.exports={TYPES,DAY,MEASUREMENT_START,date,careerFilled,allUsers,allRows,realUsers,trustedEvents,coverageStart};
