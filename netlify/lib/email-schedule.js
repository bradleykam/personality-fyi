// Calendar weeks are Monday–Sunday in the recipient's IANA time zone.
const DAY=86400000;
function validZone(zone){try{if(!zone)return null;new Intl.DateTimeFormat('en',{timeZone:zone}).format();return zone;}catch{return null;}}
function zoneFor(user){return validZone(user.user_metadata?.timezone)||null;}
function parts(at,zone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(p=>[p.type,p.value]));}
function localEpoch(at,zone){const p=parts(at,zone);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}
function weekKey(at,zone='UTC'){const p=parts(at,zone),d=new Date(Date.UTC(+p.year,+p.month-1,+p.day));d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
function nextSaturday(now,zone,hour=9){
 if(!validZone(zone))return null;
 const p=parts(now,zone),d=new Date(Date.UTC(+p.year,+p.month-1,+p.day,hour));
 d.setUTCDate(d.getUTCDate()+(6-d.getUTCDay()+7)%7);
 let local=d.getTime(),at=local;
 for(let i=0;i<4;i++)at+=local-localEpoch(at,zone);
 if(at<=now){local+=7*DAY;at=local;for(let i=0;i<4;i++)at+=local-localEpoch(at,zone);}
 return at;
}
function reservations(user,events){
 const tokens=new Map();
 for(const e of events){const p=e.props||{};if(p.user_id!==user.id||!p.email_token||!['mail_queued','mail_accepted'].includes(e.event))continue;
 tokens.set(p.email_token,{token:p.email_token,at:Date.parse(p.scheduled_at||e.created_at),kind:p.email_kind||'other'});}
 for(const e of events){const p=e.props||{};if((e.event==='mail_send_failed'&&p.reason!=='network-outcome-unknown')||(e.event==='mail_webhook'&&['failed','canceled'].includes(p.kind))||e.event==='mail_schedule_canceled')tokens.delete(p.email_token);}
 return [...tokens.values()];
}
function canReserve(user,events,at,kind){
 const zone=zoneFor(user)||'Europe/London',week=weekKey(at,zone);
 const existing=reservations(user,events).filter(r=>weekKey(r.at,zone)===week);
 // Reserve one slot for the weekly email: no more than one additional email.
 return existing.length<2 && !existing.some(r=>kind==='weekly'?r.kind==='weekly':r.kind!=='weekly');
}
function scheduledChoice(user,events,now,selectEmail,samples){
 const choice=selectEmail(user,events,now,samples);if(!choice)return null;
 const age=now-Date.parse(user.created_at),md=user.user_metadata||{};
 const welcome=age<2*DAY&&!md.welcomed&&!reservations(user,events).length;
 const transactional=choice.campaign==='life-person-verified';
 if(welcome||transactional)return canReserve(user,events,now,'extra')?{...choice,emailKind:'extra'}:null;
 const known=zoneFor(user),zone=known||'Europe/London',at=nextSaturday(now,zone,known?9:11);
 // Queue during the preceding 24 hours; provider dispatches at exactly local 09:00.
 if(!at||at-now>DAY||!canReserve(user,events,at,'weekly'))return null;
 return {...choice,emailKind:'weekly',scheduledAt:new Date(at).toISOString(),timezone:zone};
}
module.exports={validZone,zoneFor,weekKey,nextSaturday,reservations,canReserve,scheduledChoice};
