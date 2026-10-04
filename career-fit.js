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
 if(!active.length)return 50;
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
 if(/product.*manag|product owner|customer success|account manag/i.test(role||'')){return rolePatterns(role).map(p=>({...p,note:'Illustrative work pattern based on the demands you described.',distance:questions.reduce((n,q,i)=>n+(answers[q.id]===0?0:Math.abs(answers[q.id]-p.a[i])),0)})).sort((a,b)=>a.distance-b.distance).slice(0,3);}
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
function suggestedQuestions(type,career){
 const a=career.demands,r=report(type,a),matches=roleMatches(career.role,a);
 if(!r)return [];
 if(!matches.length)return ['Which parts of my '+career.role+' role would I enjoy most?','What would a typical day in this role feel like for me?','Which job demands should I clarify to understand my fit?'];
 const engineering=/engineer|developer|programmer|software|technical/i.test(career.role||'');
 const managing=matches[0].name==='Engineering manager';
 const title=matches[0].name.toLowerCase();
 const labels=engineering?(managing?['Would I enjoy managing engineers?','Would I be happier staying technical?']:['Would I enjoy leading an engineering team?','Which engineering roles would suit me?']):['Would I enjoy working as a '+title+'?','What would a better-fitting '+career.role+' role look like?'];
 let third='What could make this job draining for me?';
 if(a.contact===-1&&type[0]==='I')third='How can I handle a meeting-heavy role?';
 else if(a.complexity===1&&type[1]==='N')third='How can I stay interested when the work is repetitive?';
 else if(a.pace===-1&&type[3]==='P')third='How can I keep up with rigid deadlines?';
 else if(a.trust===-1&&type[2]==='T')third='How can I build trust without constant small talk?';
 else if(a.contact===1&&type[0]==='E')third='How can I make solo work less isolating?';
 else if(!r.friction.length)third='What should I check before committing to this role?';
 labels.push(third);
 return labels;
}
function context(type,career){
 if(!career?.role)return '';
 const broad=categoryScore(type,career.role), vs=variants(type,career.role);
 const baseline='Estimated category preference fit: '+broad+'%. Role variants: '+vs.map(v=>v.name+' '+v.score+'%, best-aligned styles '+v.ideal.join('/')).join('; ')+'. Always include the relevant estimated fit percentage when discussing a role or comparing variants. Use these scores consistently; clarify assumptions if discussing a new variant. These are illustrative preference estimates, not success probabilities. ';
 if(!validAnswers(career.demands))return baseline;
 const r=report(type,career.demands);
 return baseline+'User-described role demands: '+questions.map(q=>q.title+' '+(career.demands[q.id]===-1?q.low:career.demands[q.id]===1?q.high:'Both about equally')).join('; ')+'. Preference-fit heuristic: '+(r.score===null?'no differentiated score':r.score+'/100')+'. Equally best-aligned styles: '+(r.ideal.join(', ')||'no single style')+'. Closest work-pattern role hypotheses: '+roleMatches(career.role,career.demands).map(x=>x.name+' ('+x.note+')').join('; ')+'. These describe the job, independently of the user’s personality. This is an equal-weight preference comparison, not ability, performance, or a validated career prediction. Explain specific role variants that better match these demands and the user; do not flatter the user or claim their type is automatically ideal.';
}
function rolePatterns(role){
 const r=role||'';
 const strategy=[-1,-1,1,1,-1,-1,-1,-1], delivery=[-1,1,-1,1,1,-1,-1,-1], rapport=[-1,1,-1,-1,1,1,-1,1];
 const row=(name,description,a)=>({name,description,a});
 if(/product.*manag|product owner/i.test(r))return [row('Technical / platform product manager','Complex systems, technical trade-offs, and long-term platform decisions.',strategy),row('Growth product manager','Rapid experiments, commercial trade-offs, and frequent cross-team influence.',[1,-1,-1,1,-1,-1,1,1]),row('Delivery-focused product manager','Coordinate stakeholders, clarify requirements, and deliver dependable releases.',delivery)];
 if(/customer success|account manag/i.test(r))return [row('Strategic / enterprise customer success','A few complex accounts, business cases, adoption strategy, and prepared executive conversations.',[-1,-1,0,1,-1,-1,-1,-1]),row('Relationship-led account management','Frequent check-ins, personal rapport, renewals, and stakeholder alignment.',rapport),row('Technical customer success','Deep product expertise, troubleshooting, and tailored implementation plans.',[-1,-1,1,1,1,-1,-1,-1])];
 if(/engineer|developer|programmer/i.test(r))return [row('Systems / platform engineer','Design complex systems through independent technical work.',strategy),row('Implementation engineer','Build reliable solutions using established methods.',[-1,1,1,1,1,-1,-1,-1]),row('Engineering manager','Coach people and coordinate long-term delivery.',[-1,1,-1,-1,0,1,-1,1])];
 if(/support/i.test(r))return [row('Technical troubleshooting','Investigate difficult issues through focused analysis.',[0,-1,1,1,1,-1,-1,-1]),row('Customer-facing support','Handle frequent conversations with empathy and quick practical responses.',[1,1,-1,-1,1,1,1,1])];
 if(/market/i.test(r))return [row('Market research / positioning','Analyze markets and develop a differentiated strategy.',strategy),row('Campaign / community marketing','Coordinate campaigns and engage audiences frequently.',[1,1,-1,-1,-1,1,-1,1])];
 if(/design/i.test(r))return [row('Systems / product design','Resolve complex interaction and system problems.',[-1,-1,1,1,-1,0,-1,-1]),row('User research / collaborative design','Understand people through interviews and iterative collaboration.',[0,-1,-1,-1,-1,1,1,1])];
 if(/data|research/i.test(r))return [row('Research / modeling','Explore novel questions through independent analysis.',[-1,-1,1,1,-1,-1,1,-1]),row('Applied analytics','Deliver accurate reporting and practical recommendations.',[-1,1,1,1,1,-1,-1,-1])];
 if(/operation/i.test(r))return [row('Operations strategy','Redesign systems and solve structural problems.',strategy),row('Delivery operations','Maintain processes and coordinate dependable execution.',delivery)];
 const bd=/sales|business development|partnership/i.test(r);
 return [row(bd?'Complex enterprise deals':'Strategy and complex problem solving','Long cycles, custom solutions, and prepared negotiation.',strategy),row(bd?'High-volume sales':'Fast-paced execution','Frequent contact, quick decisions, and adapting in the moment.',[1,1,-1,1,1,-1,1,1]),row(bd?'Relationship-led account growth':'Relationship-centered coordination','Personal rapport, frequent contact, and reliable follow-through.',rapport)];
}
function answersFor(p){return Object.fromEntries(questions.map((q,i)=>[q.id,p.a[i]]));}
function variants(type,role){return rolePatterns(role).map(p=>({...p,score:score(type,answersFor(p)),ideal:report(type,answersFor(p)).ideal})).sort((a,b)=>b.score-a.score);}
function categoryScore(type,role){if(!types.includes(type))return null;const rows=variants(type,role);return Math.round(rows.reduce((n,r)=>n+r.score,0)/rows.length);}
function provisional(type,role,answers){const rows=rolePatterns(role).map(p=>score(type,Object.assign(answersFor(p),answers||{})));return Math.round(rows.reduce((n,v)=>n+v,0)/rows.length);}
const api={questions,types,validAnswers,score,report,context,variants,roleMatches,suggestedQuestions,categoryScore,provisional};
if(typeof module!=='undefined')module.exports=api;else root.careerFit=api;
})(typeof window!=='undefined'?window:globalThis);
