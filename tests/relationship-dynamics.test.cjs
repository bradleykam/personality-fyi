const test=require('node:test'),assert=require('node:assert/strict');
const {relationshipDynamics:describe}=require('../relationship-dynamics');
const types=['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
const rels=['parent','partner','friend','sibling','roommate','coworker','boss','family'];
test('every ordered pairing and relationship has complete descriptions',()=>{
 for(const a of types)for(const b of types)for(const r of rels){const s=describe(a,b,r,'Alex');assert.equal(s.length,3);for(const x of s){assert.ok(x.title&&x.text);assert.doesNotMatch(x.text,/undefined|NAME/);}}
});
test('parent summary describes both sides and changes when types or roles change',()=>{
 const parent=describe('INTJ','ENFJ','parent','Mom');assert.match(parent[0].text,/Your parent.*care/);assert.match(parent[0].text,/trust in your judgment/);
 assert.notDeepEqual(parent,describe('ENFJ','INTJ','parent','Mom'));
 assert.notDeepEqual(parent,describe('INTJ','ENFJ','boss','Alex'));
 for(const type of types.filter(t=>t!=='INTJ'))assert.notDeepEqual(parent,describe(type,'ENFJ','parent','Mom'));
 for(const type of types.filter(t=>t!=='ENFJ'))assert.notDeepEqual(parent,describe('INTJ',type,'parent','Mom'));
});
test('unknown types do not invent a dynamic',()=>{assert.equal(describe(null,'ENFJ','parent','Mom').length,1);assert.match(describe('INTJ',null,'parent','Mom')[0].text,/Add both/);});
test('summaries consolidate daily dynamics and put positives before friction',()=>{
 for(const r of rels){const sections=describe('INTJ','ENFP',r,'Alex');assert.deepEqual(sections.map(s=>s.title),['How you relate','What can work well','Where friction can build']);}
 const home=describe('INTJ','ENFP','roommate','Alex');assert.match(home[2].text,/visitors, background noise, interruptions/);assert.match(home[2].text,/substantial day-to-day strain/);assert.doesNotMatch(describe('INTJ','ENFP','coworker','Alex')[2].text,/Sharing a home/);
});
