/* Transparent preference-fit heuristic, not a validated employment assessment. */
(function(root){
const questions=[
 {id:'cycle',axis:'JP',title:'How does this job create results?',low:'Patient progress on long-cycle outcomes',high:'Quick wins and frequent changes of direction',left:'Long-cycle execution',right:'Rapid adaptation'},
 {id:'complexity',axis:'NS',title:'How standard are the problems or deals?',low:'Mostly complex, unfamiliar, or custom',high:'Mostly repeatable, with proven playbooks',left:'Novel problem solving',right:'Reliable repeatable delivery'},
 {id:'contact',axis:'EI',title:'How much interaction does success require?',low:'Constant outreach, meetings, or persuasion',high:'Long stretches of independent focus',left:'High-contact work',right:'Independent depth'},
 {id:'trust',axis:'FT',title:'What most often earns trust in this role?',low:'Personal rapport, empathy, and ongoing contact',high:'Expertise, evidence, and a strong business case',left:'Personal relationship building',right:'Evidence-led credibility'},
 {id:'thinking',axis:'NS',title:'What kind of thinking is most useful?',low:'Spotting patterns and long-term possibilities',high:'Getting concrete details right in the present',left:'Strategic pattern recognition',right:'Practical detail accuracy'},
 {id:'decisions',axis:'TF',title:'When priorities conflict, what does the job reward?',low:'Objective trade-offs, negotiation, and hard calls',high:'Alignment, support, and protecting relationships',left:'Analytical negotiation',right:'Human alignment'},
 {id:'pace',axis:'JP',title:'How is work best organized?',low:'Preparation, milestones, and dependable follow-through',high:'Improvisation and seizing emerging opportunities',left:'Structured follow-through',right:'Flexible improvisation'},
 {id:'influence',axis:'IE',title:'How do you usually need to influence people?',low:'Prepared, in-depth conversations with a few people',high:'Thinking aloud, networking, and energizing many people',left:'Focused influence',right:'Broad social influence'}
];
const types='INTJ INTP ENTJ ENTP INFJ INFP ENFJ ENFP ISTJ ISFJ ESTJ ESFJ ISTP ISFP ESTP ESFP'.split(' ');
function validAnswers(a){return a&&questions.every(q=>[-1,0,1].includes(a[q.id]));}
function score(type,answers){
 if(!types.includes(type)||!validAnswers(answers))return null;
 const active=questions.filter(q=>answers[q.id]!==0);
 if(!active.length)return null;
 let sum=0;for(const q of active){const preferred=answers[q.id]===-1?q.axis[0]:q.axis[1];sum+=type.includes(preferred)?1:0;}
 return Math.round(sum/active.length*100);
}
function report(type,answers){
 if(!validAnswers(answers))return null;
 const ranked=types.map(t=>({type:t,score:score(t,answers)})).sort((a,b)=>(b.score??-1)-(a.score??-1));
 const best=ranked[0].score,ideal=best===null?[]:ranked.filter(x=>x.score===best).map(x=>x.type);
 const fit=[],friction=[],mixed=[];
 for(const q of questions){const a=answers[q.id];if(a===0){mixed.push(q.title);continue;}const preferred=a===-1?q.axis[0]:q.axis[1],label=a===-1?q.left:q.right; (type&&type.includes(preferred)?fit:friction).push(label);}
 return {score:score(type,answers),ideal,fit,friction,mixed,answered:questions.length,decisive:questions.length-mixed.length};
}
// Role hypotheses compare the described work, independently of the user's type.
function roleMatches(role,answers){
 if(!validAnswers(answers)||questions.filter(q=>answers[q.id]!==0).length<3)return [];
 const engineering=/engineer|developer|programmer|software|technical/i.test(role||'');
 const sales=/sales|business development|account|partnership/i.test(role||'');
 const patterns=[
 {name:engineering?'Engineering manager':sales?'Sales / account team manager':'People manager',description:'Coordinate people around long-term delivery, maintain dependable processes, and influence through focused conversations.',a:[-1,1,-1,0,0,0,-1,-1],note:'If you own coaching, performance, and team development, this is management. Frequent meetings alone do not establish that.'},
 {name:engineering?'Technical program / delivery lead':sales?'Revenue operations / sales program lead':'Program / operations lead',description:'Coordinate people, schedules, and repeatable delivery across teams without necessarily having direct reports.',a:[-1,1,-1,1,0,-1,-1,-1],note:'If you own delivery and dependencies rather than people, this is the closer interpretation.'},
 {name:engineering?'Systems architect / staff engineer':sales?'Enterprise solutions / strategic business development':'Strategy / systems specialist',description:'Solve unfamiliar problems, plan over long horizons, and influence a few consequential decisions through expertise.',a:[-1,-1,1,1,-1,-1,-1,-1],note:'Fits work centered on technical or strategic decisions with substantial independent depth.'},
 {name:engineering?'Software / implementation engineer':sales?'Sales operations analyst':'Implementation / analytical specialist',description:'Use independent focus and proven methods to deliver accurate, dependable work.',a:[-1,1,1,1,1,-1,-1,-1],note:'Fits hands-on delivery more than ongoing people coordination.'},
 {name:engineering?'Solutions engineer / technical consultant':sales?'Consultative / relationship-led sales':'Client-facing consultant',description:'Understand needs, build trust, and adapt solutions through frequent client interaction.',a:[0,-1,-1,-1,0,1,1,1],note:'Fits work organized around customer discovery and influence.'}
 ];
 const active=questions.filter(q=>answers[q.id]!==0);
 return patterns.map(p=>{let distance=0;active.forEach(q=>{const i=questions.indexOf(q);distance+=Math.abs(answers[q.id]-p.a[i]);});return {...p,distance};}).sort((a,b)=>a.distance-b.distance).slice(0,3);
}
function context(type,career){
 if(!validAnswers(career?.demands))return '';
 const r=report(type,career.demands);
 return 'User-described role demands: '+questions.map(q=>q.title+' '+(career.demands[q.id]===-1?q.low:career.demands[q.id]===1?q.high:'Both about equally')).join('; ')+'. Preference-fit heuristic: '+(r.score===null?'no differentiated score':r.score+'/100')+'. Equally best-aligned styles: '+(r.ideal.join(', ')||'no single style')+'. Closest work-pattern role hypotheses: '+roleMatches(career.role,career.demands).map(x=>x.name+' ('+x.note+')').join('; ')+'. These describe the job, independently of the user’s personality. This is an equal-weight preference comparison, not ability, performance, or a validated career prediction. Explain specific role variants that better match these demands and the user; do not flatter the user or claim their type is automatically ideal.';
}
function variants(type,role){
 const bd=/sales|business development|account executive|partnership/i.test(role||'');
 const rows=[
 {name:bd?'Complex enterprise deals':'Strategy and complex problem solving',description:'Long cycles, custom solutions, prepared negotiation, and a small number of consequential decisions.',a:[-1,-1,1,1,-1,-1,-1,-1]},
 {name:bd?'High-volume prospecting and sales':'Fast-paced persuasion and execution',description:'Frequent contact, quick decisions, clear targets, and adapting in the moment.',a:[1,1,-1,1,1,-1,1,1]},
 {name:bd?'Relationship-led account growth':'Relationship-centered coordination',description:'Ongoing personal rapport, frequent contact, human alignment, and reliable follow-through.',a:[-1,1,-1,-1,1,1,-1,1]}
 ];
 return rows.map(v=>({name:v.name,description:v.description,score:score(type,Object.fromEntries(questions.map((q,i)=>[q.id,v.a[i]])))})).sort((a,b)=>b.score-a.score);
}
const api={questions,types,validAnswers,score,report,context,variants,roleMatches};
if(typeof module!=='undefined')module.exports=api;else root.careerFit=api;
})(typeof window!=='undefined'?window:globalThis);
