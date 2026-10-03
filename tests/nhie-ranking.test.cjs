const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('ranks answered questions by all votes, excludes zero, and keeps breakdowns gated', async () => {
  const statements = Array.from({length: 23}, (_, i) => ({id: String(i), display_order: i, statement: 'Question '+i}));
  const batches = [];
  const client = {
    from(table) { return {select() { return {eq() {
      return table === 'nhie_statements' ? {order: async()=>({data:statements})} : Promise.resolve({data:[{statement_id:'1',answer:'i_have'}]});
    }}; }}; },
    async rpc(name, {p_statement_ids: ids}) {
      batches.push(ids);
      return {data: ids.flatMap(id => id === '0' ? [] : [
        {statement_id:id,user_type:'INFJ',answer:'i_have',vote_count:id === '22' ? '10':'1'},
        {statement_id:id,user_type:'INTJ',answer:'i_never_have',vote_count:'2'}])};
    }
  };
  const c={exports:{},require:()=>({createClient:()=>client}),process:{env:{SUPABASE_URL:'mock',SUPABASE_SERVICE_ROLE_KEY:'mock'}},console};
  vm.runInNewContext(fs.readFileSync('netlify/functions/nhie-init.js','utf8'),c);
  const response=await c.exports.handler({httpMethod:'POST',body:JSON.stringify({userId:'demo'})});
  assert.equal(response.statusCode,200);
  const data=JSON.parse(response.body);
  assert.equal(data.statements.length,22);
  assert.equal(data.statements[0].id,'22');
  assert.equal(data.statements[0].answer_count,12);
  assert.equal(data.statements[1].id,'1');
  assert.deepEqual(Object.keys(data.results),['1']);
  assert.deepEqual(batches.map(b=>b.length),[20,3]);
  assert.ok(data.statements.every(s=>s.answer_count>0));
});
