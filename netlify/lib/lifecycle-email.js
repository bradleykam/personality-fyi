const {createHash}=require('node:crypto');
const {excluded,emailExcluded}=require('./email-reporting');
const {TYPES,DAY,date,careerFilled}=require('./product-data');
const BLOCKED=new Set(['CU','IR','KP','SY','IQ','RU','BY','VE','MV','LB','YE','SD','ZW']);
const SITE='https://personality.fyi';
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function historyFor(user,events){
 const deliveredTokens=new Set(events.filter(e=>e.event==='mail_webhook'&&['sent','delivered','opened','clicked'].includes(e.props?.kind)).map(e=>e.props.email_token).filter(Boolean));
 const accepted=new Map();
 events.forEach(e=>{const p=e.props||{};if(p.user_id!==user.id)return;if(e.event==='mail_accepted'||(e.event==='mail_queued'&&deliveredTokens.has(p.email_token))){if(!accepted.has(p.email_token))accepted.set(p.email_token,e);}});
 return [...accepted.values()].sort((a,b)=>date(a.created_at)-date(b.created_at));
}
function lastActivity(user,events,now){
 const md=user.user_metadata||{};
 // Be conservative: a known sign-in or recorded visit postpones re-engagement too.
 const stamps=[user.created_at,user.last_sign_in_at,md.last_seen_at,...(md.session_days||[]).map(d=>d+'T23:59:59Z')].map(date);
 events.forEach(e=>{if(e.props?.user_id===user.id&&!/^(mail_|lifecycle_)/.test(e.event))stamps.push(date(e.created_at));});
 return Math.max(...stamps.filter(x=>x>0&&x<=now),date(user.created_at));
}
function selectEmail(user,events,now=Date.now(),nhie={}) {
 const md=user.user_metadata||{};
 if(emailExcluded(user)||!user.email_confirmed_at||md.digest_unsub===true||BLOCKED.has(String(md.signup_country||'').toUpperCase()))return null;
 const sent=historyFor(user,events);
 const acceptedTokens=new Set(sent.map(e=>e.props.email_token));
 const ownTokens=new Set(events.filter(e=>e.props?.user_id===user.id&&/^mail_/.test(e.event)).map(e=>e.props.email_token).filter(Boolean));
 const userMail=events.filter(e=>(e.props?.user_id===user.id||ownTokens.has(e.props?.email_token))&&/^mail_/.test(e.event));
 if(userMail.some(e=>e.event==='mail_send_failed'&&now-date(e.created_at)<6*3600000))return null;
 // Uncertain sends stay blocked until provider evidence arrives; never create a second delivery by guessing.
 const rejected=new Set(userMail.filter(e=>(e.event==='mail_send_failed'&&e.props.reason!=='network-outcome-unknown')||(e.event==='mail_webhook'&&e.props.kind==='failed')).map(e=>e.props.email_token));
 if(userMail.some(e=>e.event==='mail_queued'&&!acceptedTokens.has(e.props.email_token)&&!rejected.has(e.props.email_token)))return null;
 const latest=sent.at(-1),lastSent=Math.max(date(latest?.created_at),date(md.weekly_digest_last),date(md.welcomed_at),date(md.activation_nudge_at),date(md.est_reminder_at),date(md.lifecycle_last_at));
 if(now-date(user.created_at)<3600000||now-lastSent<3*DAY)return null;
 if(sent.filter(e=>now-date(e.created_at)<7*DAY).length>=2)return null;
 if(userMail.some(e=>e.event==='mail_webhook'&&['complained','suppressed','bounced'].includes(e.props.kind)))return null;
 const inactive=now-lastActivity(user,events,now);
 const first=!md.welcomed&&!sent.length;
 if(!first&&inactive<DAY)return null;
 const type=TYPES.has(String(md.mbti_type||'').toUpperCase())?String(md.mbti_type).toUpperCase():null;
 const people=(md.people||[]).filter(p=>p?.n),career=careerFilled(md),own=sent.filter(e=>(e.props.campaign||'').startsWith('life-'));
 const n=own.length;
 const pick=(campaign,goal,details={})=>({campaign,goal,type,...details,round:n,token:token(user.id,campaign,n),inactiveDays:Math.floor(inactive/DAY)});
 if(!type){if(own.filter(e=>e.props.campaign==='life-set-type').length>=3)return null;return pick('life-set-type','account_type_saved');}
 // A verified relationship update is substantive and takes priority over routine nudges.
 const notice=(md.verified_updates||[]).find(v=>v&&!v.emailed&&!sent.some(e=>e.props.notice_key===String(v.idx)+':'+String(v.to)));
 if(notice)return pick('life-person-verified','server_ai_answer',{personIndex:notice.idx||0,noticeKey:String(notice.idx)+':'+String(notice.to)});
 const recent=events.filter(e=>e.props?.user_id===user.id&&/ai_message_sent|server_ai_answer/.test(e.event)).sort((a,b)=>date(b.created_at)-date(a.created_at));
 const preferred=recent.find(e=>/career|compat|person|relationship/.test(e.props?.surface||''))?.props.surface||'';
 let campaign,goal,personIndex=0;
 const stageCount=c=>own.filter(e=>e.props.campaign===c).length;
 if(people.length||career){
  const chooseCareer=career&&(!people.length||/career/.test(preferred)||(!preferred&&n%2===1));
  if(chooseCareer){campaign=n%2?'life-career-next':'life-career-question';goal='server_ai_answer';}
  else {campaign=n%2?'life-add-relationship':'life-relationship-question';goal=campaign==='life-add-relationship'?'account_relationship_saved':'server_ai_answer';personIndex=(md.people||[]).findIndex(p=>p?.n);}
 }else{campaign=stageCount('life-add-relationship')<=stageCount('life-add-career')?'life-add-relationship':'life-add-career';goal=campaign==='life-add-career'?'account_career_saved':'account_relationship_saved';}
 const sinceActivity=own.filter(e=>date(e.created_at)>lastActivity(user,events,now));
 if(sinceActivity.length>=4)return null;
 // At most one editorial email per four lifecycle touches; never before two substantive attempts.
 // Inactive recipients only, with a real, non-seed sample when showing lifestyle answers.
 if(inactive>=7*DAY && n>=2 && n%4===3){
  const editorial=own.filter(e=>/life-(article|lifestyle)/.test(e.props.campaign));
  if(!editorial.length||now-date(editorial.at(-1).created_at)>=14*DAY){
   if((!editorial.length || editorial.at(-1).props.campaign==='life-article') && nhie[type])return pick('life-lifestyle','server_ai_answer',{sample:nhie[type]});
   return pick('life-article','server_ai_answer');
  }
 }
 // Avoid repeating a dormant reminder indefinitely. Four substantive tries, then pause until activity changes.
 return pick(campaign,goal,{personIndex});
}
function token(user,campaign,n){const h=createHash('sha256').update('lifecycle-v1:'+user+':'+campaign+':'+n).digest('hex').slice(0,32);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function buildEmail(user,choice) {
 const md=user.user_metadata||{},type=choice.type,p=(md.people||[])[choice.personIndex],name=p?.n||'someone you know',c=md.career||{};
 let subject,body,label,path,secondary='';
 switch(choice.campaign){
 case 'life-set-type':subject='Start with your personality type';body='Save your type to get advice about your work and the people in your life. Already know it? Choose it directly. Otherwise, take the short test.';label='Choose your type';path='/your-type';secondary=`Or take the test: ${SITE}/take-the-test`;break;
 case 'life-add-relationship':subject=md.people?.length?'Understand another person in your life':'Put your '+type+' profile to use';body=md.people?.length?'Add a colleague, friend, or family member. Then bring a real question: how to give feedback, navigate a disagreement, or communicate more clearly.':'Add someone you know, then ask about a real situation between you. Your personality profile becomes more useful when it has context.';label='Add a relationship';path='/add-someone';break;
 case 'life-add-career':subject='How does your work fit your '+type+' personality?';body='Enter your field and job to explore where your work fits you and where friction comes from. Start with the situation you want to improve.';label='Add your career context';path='/career-planning';break;
 case 'life-relationship-question':case 'life-person-verified':subject=choice.campaign==='life-person-verified'?'A relationship profile has been updated':'A better conversation with '+name;body=choice.campaign==='life-person-verified'?'Someone you invited has completed the test. Open the updated relationship and ask about a situation you want to understand.':'What is one conversation with '+name+' you want to handle better? Bring the situation or a message you are unsure how to respond to. Your saved relationship gives the answer context.';label='Ask about this relationship';path='/person?i='+choice.personIndex;break;
 case 'life-career-question':subject='Bring one work question';body='Use your saved career context'+(c.role?' as '+c.role:'')+' to work through one real decision: a role change, a difficult conversation, or what to focus on next.';label='Ask a career question';path='/career-planning';break;
 case 'life-career-next':subject='Explore your next work decision';body='Compare a role you are considering with your current work, or add a goal and ask what to do next. A specific situation makes your personality profile more useful.';label='Explore your next step';path='/career-planning';break;
 case 'life-article':subject='A fresh look at your '+type+' profile';body='Revisit how your '+type+' preferences show up at work and in relationships. Pick one idea that matches a real situation, then bring that question back to your profile.';label='Read about '+type;path='/blog/'+type.toLowerCase()+'-personality';break;
 case 'life-lifestyle':{const a=choice.sample;subject='How other '+type+'s answered';body='“'+a.statement+'” — '+a.have+' of '+a.total+' real '+type+' respondents answered “I have.” This is a small, self-selected sample, not a claim about every '+type+'. Compare your answer and explore a question it raises about your life.';label='Explore lifestyle questions';path='/never-have-i-ever';break;}
 default:throw Error('Unknown lifecycle campaign');
 }
 const url=SITE+path;
 const text=body+'\n\n'+label+': '+url+(secondary?'\n\n'+secondary:'')+'\n\nBrad\nReply “unsubscribe” to stop these emails.';
 const html='<div style="font-family:Arial,sans-serif;max-width:520px;font-size:16px;line-height:1.6;color:#1a1a1a"><p>'+escape(body)+'</p><p><a style="display:inline-block;padding:12px 18px;background:#111;color:white;text-decoration:none;border-radius:6px" href="'+escape(url)+'">'+escape(label)+' →</a></p>'+(secondary?'<p><a href="'+SITE+'/take-the-test">Take the short test instead</a></p>':'')+'<p>Brad</p><p style="font-size:12px;color:#777">Reply “unsubscribe” to stop these emails.</p></div>';
 return {subject,text,html};
}
function lifestyleSamples(users,votes,statements){
 const valid=new Set(users.filter(u=>!excluded(u)&&u.email_confirmed_at).map(u=>u.id)),stat=new Map(statements.map(s=>[s.id,s.statement])),groups={},seen=new Set();
 for(const v of votes){if(!valid.has(v.user_id)||!TYPES.has(v.user_type)||!stat.has(v.statement_id)||!['i_have','i_never_have'].includes(v.answer))continue;const key=v.user_id+':'+v.statement_id;if(seen.has(key))continue;seen.add(key);const k=v.user_type+':'+v.statement_id,g=groups[k]??={type:v.user_type,statement:stat.get(v.statement_id),have:0,total:0};g.total++;if(v.answer==='i_have')g.have++;}
 const out={};Object.values(groups).filter(g=>g.total>=5).sort((a,b)=>b.total-a.total).forEach(g=>{out[g.type]??=g;});return out;
}
module.exports={selectEmail,buildEmail,lastActivity,historyFor,lifestyleSamples};
