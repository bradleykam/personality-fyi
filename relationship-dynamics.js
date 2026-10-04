/* Relationship descriptions use both people’s preferences and the direction of
   the relationship. They describe possibilities, never diagnoses or facts about a person. */
(function(root){
const decisions = {
 parent: {
 TF:'Your parent may express care by checking how you feel, offering guidance, and staying involved. You may experience care more readily as trust in your judgment and room to solve things yourself. Their concern can land as interference; your self-sufficiency can look like shutting them out.',
 FT:'Your parent may express care through practical solutions, high standards, and preparation. You may first want them to understand what an experience means to you. Advice can sound like a judgment when you wanted empathy, while your emotional response may leave them unsure what would actually help.',
 TT:'You and your parent may connect through solving problems, sharing useful knowledge, and respecting competence. Disagreements can become arguments about who is right, especially when an old parent-child authority pattern meets your wish to make your own decisions. Practical support may carry affection neither of you says aloud.',
 FF:'You and your parent may both experience closeness through understanding and emotional support. That can make the relationship reassuring, but disagreement may feel like disloyalty rather than a separate opinion. Your parent’s wish to protect you and your need for a life of your own can coexist even when either person feels hurt.'
 },
 partner:{
 TF:'Your partner may look for emotional acknowledgment as a sign that you are on the same team; you may show commitment by solving the problem. You can offer steadiness while they notice the emotional cost of a decision. The recurring misunderstanding is that a solution can feel dismissive, while a request for reassurance can sound like a rejection of your help.',
 FT:'You may look for emotional acknowledgment before discussing a solution, while your partner may show commitment by taking action. Their practical response can feel distant to you; your wish to talk through feelings can look to them like prolonging a problem. Both may be trying to protect the relationship in different ways.',
 TT:'You may appreciate each other’s directness, independence, and ability to solve problems together. The relationship can feel like a capable partnership. Conflict becomes harder when both defend the strongest argument and neither names the hurt underneath it; being logically understood is not always the same as feeling loved.',
 FF:'You may build intimacy through emotional responsiveness and a sense of shared values. Both can be sensitive to how a disagreement affects the bond. That makes warmth a strength, but can also lead to softened requests, avoided conflict, or each person expecting the other to recognize an unspoken need.'
 },
 friend:{
 TF:'Your friend may experience friendship through being heard and emotionally supported; you may offer perspective, solutions, and honest feedback. This can be a useful balance. Misunderstandings arise when they want company in a feeling and you offer a fix, or when you want a candid opinion and receive reassurance.',
 FT:'You may value a friend who understands how an experience feels, while they may show loyalty through practical help and candid advice. Their directness can be grounding or unexpectedly sharp. Your attention to emotional nuance may deepen the friendship, but they may not always recognize the response you are asking for.',
 TT:'You may enjoy exchanging ideas, solving problems, and speaking frankly without much ceremony. Respect can grow through intellectual honesty. The blind spot is assuming that because neither asks for reassurance, neither needs it; a debate can become personal before either person notices.',
 FF:'You may connect through personal stories, encouragement, and a sense of being understood. The friendship can become a strong source of belonging. Different values or uneven emotional availability may be harder to discuss precisely because both care about preserving that closeness.'
 },
 sibling:{
 TF:'Your sibling may seek closeness through emotional involvement, while you may prefer practical support and respect for independence. Family history can turn that difference into familiar labels: the “sensitive one” and the “detached one.” Those labels can obscure how both of you have changed.',
 FT:'You may seek emotional recognition from your sibling, while they may show loyalty by helping or telling you what they think is true. Old family comparisons can make a blunt remark feel larger than the present conversation. They may think they are being useful while you hear a familiar dismissal.',
 TT:'You and your sibling may connect through shared interests, teasing, or practical help. Disputes can become contests over whose account is correct, especially when old family roles are involved. Independence can make the bond low-pressure, but may also leave affection largely implied.',
 FF:'You and your sibling may be especially aware of belonging, fairness, and emotional shifts within the family. That can create mutual support, but old comparisons or perceived favoritism may carry lasting weight. Agreement is not always closeness, and disagreement need not mean taking sides.'
 },
 roommate:{
 TF:'You may treat a household issue as a practical agreement to settle; your roommate may also read the conversation as a signal of whether home feels friendly. Your directness can make responsibilities clear but sound colder than intended. Their softer approach can preserve comfort yet leave you uncertain about the actual request.',
 FT:'You may care about the emotional atmosphere at home, while your roommate may focus on whether the practical agreement is clear. A blunt reminder about dishes or noise can feel personal to you even if they mean it literally. An indirect request from you may go unnoticed rather than be deliberately ignored.',
 TT:'You may both prefer clear agreements about chores, money, and shared space. That can make living together straightforward. Friction is likely when each believes their own standard is the reasonable one; a household can function efficiently while tension still goes unspoken.',
 FF:'You may both want home to feel considerate and welcoming. Small acts of care can make sharing space enjoyable. The difficulty is that neither may want to be the person who raises a complaint, allowing minor irritations about cleaning, guests, or noise to accumulate.'
 },
 coworker:{
 TF:'You may evaluate a proposal mainly through its logic and results, while your colleague may also focus on how people will receive it. Together, you can catch both technical weaknesses and problems with team support. Friction appears when you hear their concerns as a distraction and they hear your critique as disregard for people.',
 FT:'You may bring attention to people, values, and team support, while your colleague may emphasize consistency and results. Together, you can make decisions that are both workable and acceptable to the team. Misunderstandings arise when their direct critique feels personal or your concern about impact sounds to them like avoiding a hard choice.',
 TT:'You may work well through direct analysis, clear standards, and a shared focus on results. Disagreement can improve the work when neither treats it as a personal challenge. The blind spot is overlooking how a technically sound decision affects colleagues who were not part of the debate.',
 FF:'You may collaborate through encouragement, shared purpose, and attention to how decisions affect people. This can build trust quickly. Difficult feedback or competing priorities may stay unresolved if keeping the interaction comfortable takes precedence over making a clear decision.'
 },
 boss:{
 TF:'Your boss may assess good work partly through trust, collaboration, and the effect on the team; you may expect the quality of your reasoning and results to speak for itself. They can help your ideas gain support, but requests for more discussion may feel like interference. Your independence may be read as disengagement rather than ownership.',
 FT:'Your boss may communicate through targets, critique, and practical decisions, while you may look for acknowledgment and a sense that your contribution matters. Clear direction can be useful, but sparse praise or blunt feedback can leave you uncertain about where you stand even when they consider your work strong.',
 TT:'You and your boss may connect through competence, clear arguments, and delivery. That can support substantial autonomy. The tension is that disagreement happens within a power difference: what feels like an open technical debate to you may feel like a challenge to a decision they are responsible for.',
 FF:'You and your boss may value trust, purpose, and a supportive team. That can make the working relationship encouraging. Because your boss also controls priorities and evaluates your work, warmth can blur expectations; disappointment may feel personal when the underlying issue is an unclear work agreement.'
 },
 family:{
 TF:'Your relative may express connection through emotional involvement, while you may show care through practical help and respect for independence. Family expectations can make those differences feel like a test of loyalty. Concern can feel intrusive to you, while a brief response can seem distancing to them.',
 FT:'You may seek emotional understanding from this relative, while they may show care through advice or practical support. A family disagreement can then carry two meanings: the issue itself and whether each person feels accepted. A solution alone may not answer the second question.',
 TT:'You may connect through shared interests, useful advice, and practical support. Family disagreements can become arguments over what is reasonable while the wish to feel respected stays unstated. Similar decision styles do not erase different histories or obligations.',
 FF:'You may connect through a strong sense of care and family belonging. That can make support feel natural, while differing values or expectations may feel unusually personal. Either person can want closeness without agreeing about what family members owe one another.'
 }
};
const settings = {
 parent:['contact and involvement','your parent’s wish to stay connected','your need for space','family plans and expectations'],
 partner:['time together','your partner’s wish to reconnect','your need to decompress','shared plans and household decisions'],
 friend:['keeping in touch','your friend’s wish for frequent contact','your need for downtime','social plans'],
 sibling:['family contact','your sibling’s wish to stay involved','your need for space','family commitments'],
 roommate:['life at home','your roommate’s wish for company or guests','your need for quiet','chores, guests, and shared routines'],
 coworker:['collaboration','your colleague’s wish to talk an idea through','your need for focused work','deadlines and handoffs'],
 boss:['communication at work','your boss’s wish for visible discussion and updates','your need for uninterrupted work','priorities and delivery dates'],
 family:['family contact','your relative’s wish to stay involved','your need for space','family commitments']
};
function relationshipDynamics(mine,theirs,rel,name){
 const valid=t=>/^[IE][NS][TF][JP]$/.test(t||'');
 rel=decisions[rel]?rel:'family';
 if(!valid(mine)||!valid(theirs)) return [{title:'Your relationship',text:'Add both personality types to see how your preferences may interact in this relationship. Your shared history and actual behavior will matter too.'}];
 const d=settings[rel], tf=mine[2]+theirs[2];
 let rhythm;
 if(mine[0]==='I'&&theirs[0]==='E') rhythm='In '+d[0]+', '+d[1]+' may run ahead of '+d[2]+'. Less conversation can mean recovery to you but distance to them.';
 else if(mine[0]==='E'&&theirs[0]==='I') rhythm='You may reach for conversation to feel connected or make progress, while '+(name||'the other person')+' may need quiet before responding. In '+d[0]+', a pause can feel like withdrawal to you even when it is simply their way of processing.';
 else if(mine[0]==='I') rhythm='Both of you may be comfortable with space and fewer conversations. In '+d[0]+', that can feel easy and unpressured, but it also makes it possible for a concern to remain private on both sides.';
 else rhythm='Both of you may prefer working things out through conversation. In '+d[0]+', that can create energy and frequent connection, though talking at the same time is not necessarily the same as hearing one another.';
 let outlook;
 if(mine[1]===theirs[1]) outlook=mine[1]==='N'?'You may connect over possibilities and what events mean, sometimes getting ahead of the practical details.':'Concrete experiences and practical details may give you common ground, though you can still draw different conclusions from them.';
 else outlook=mine[1]==='N'?'You may start with the larger pattern or future possibility, while they may want concrete examples and what is happening now. Each can feel the other has missed the point even when they are looking at different parts of it.':'You may start with what happened and what is practical, while they may move toward the larger pattern or future possibility. Their interpretation can feel speculative to you; your detail can feel too narrow to them.';
 let plans;
 if(mine[3]===theirs[3]) plans=mine[3]==='J'?'With '+d[3]+', both may want clarity and follow-through. That creates dependability when you agree, but a standoff when each already has a different plan.':'With '+d[3]+', both may appreciate flexibility. The easygoing atmosphere can become uncertainty when nobody makes the final commitment.';
 else plans=mine[3]==='J'?'With '+d[3]+', you may want an agreement settled while they prefer room to adapt. You can experience changes as unreliability; they can experience your need for closure as pressure.':'With '+d[3]+', they may want an agreement settled while you prefer room to adapt. You can experience their certainty as pressure; they can experience your flexibility as a lack of commitment.';
 const strengths={
 parent:'Practical help and emotional recognition can give your parent-child relationship more than one way to express care.',
 partner:'You can build a partnership that makes room for both practical needs and emotional connection.',
 friend:'Shared interests can give the friendship a place to feel easy, without requiring identical social habits.',
 sibling:'Your shared history can make small gestures meaningful and give you a sense of being known over time.',
 roommate:'When your expectations are explicit, shared space can offer both companionship and room to do your own thing.',
 coworker:'Different perspectives can improve a decision when both have room to contribute.',
 boss:'Clear expectations and mutual respect can turn different working styles into useful guidance and autonomy.',
 family:'Shared experiences can support belonging while leaving space for different ways of living.'
 };
 const common=mine[1]===theirs[1]?(mine[1]==='N'?'You may enjoy exploring ideas, possibilities, and the meaning behind experiences.':'You may connect through practical activities, concrete experiences, and useful help.'):'One of you may notice possibilities while the other tests what is practical. Together, that can make ideas more usable.';
 const balance=tf==='TF'?'You may bring clarity and problem solving; they may notice feelings and social needs that would otherwise be missed.':tf==='FT'?'You may notice feelings and social needs; they may contribute clarity and practical problem solving.':tf==='TT'?'Direct discussion and practical problem solving can give you common ground.':'Emotional responsiveness and encouragement can help both of you feel supported.';
 const home=(rel==='roommate'||rel==='partner')&&mine[0]!==theirs[0]? ' Sharing a home makes differences in stimulation harder to step away from: visitors, background noise, interruptions, and time alone need explicit agreements. A very large difference in social needs can create substantial day-to-day strain; shared interests do not cancel it out.':'';
 return [{title:'How you relate',text:decisions[rel][tf]+' '+outlook},{title:'What can work well',text:strengths[rel]+' '+common+' '+balance},{title:'Where friction can build',text:rhythm+' '+plans+home}];
}
if(typeof module!=='undefined')module.exports={relationshipDynamics};
root.relationshipDynamics=relationshipDynamics;
})(typeof window!=='undefined'?window:globalThis);
