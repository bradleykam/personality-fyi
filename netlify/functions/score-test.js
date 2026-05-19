/* POST /api/v1/test/score
 *
 * Request body:  { "answers": [1..5, 1..5, ...] }   // length 32
 *
 * Response:
 *   {
 *     "type": "INTJ",
 *     "confidence": { "I": 74, "N": 88, "T": 61, "J": 92 },
 *     "scores":     { "I": 7, "E": 2, ... }
 *   }
 *
 * Pure arithmetic — no LLM, no filesystem I/O. Items inlined below.
 */

// OEJTS items. Source of truth duplicated here so the function works
// without depending on bundled static files.
const ITEMS = [
  {agreePole:'J', disagreePole:'P'}, // I make lists rather than relying on memory.
  {agreePole:'T', disagreePole:'F'}, // I am skeptical by default rather than wanting to believe.
  {agreePole:'E', disagreePole:'I'}, // I get bored by time alone rather than needing it.
  {agreePole:'S', disagreePole:'N'}, // I accept things as they are rather than feeling unsatisfied with how they are.
  {agreePole:'J', disagreePole:'P'}, // I keep my room clean rather than putting stuff wherever.
  {agreePole:'F', disagreePole:'T'}, // I think "robotic" is an insult rather than striving for a mechanical mind.
  {agreePole:'E', disagreePole:'I'}, // I am energetic rather than mellow.
  {agreePole:'S', disagreePole:'N'}, // I prefer a multiple-choice test over an essay test.
  {agreePole:'P', disagreePole:'J'}, // I am chaotic rather than organized.
  {agreePole:'F', disagreePole:'T'}, // I am easily hurt rather than thick-skinned.
  {agreePole:'E', disagreePole:'I'}, // I work best in groups rather than alone.
  {agreePole:'S', disagreePole:'N'}, // I am focused on the present more than the future.
  {agreePole:'J', disagreePole:'P'}, // I plan far ahead rather than at the last minute.
  {agreePole:'T', disagreePole:'F'}, // I want people's respect more than their love.
  {agreePole:'I', disagreePole:'E'}, // Parties wear me out rather than fire me up.
  {agreePole:'S', disagreePole:'N'}, // I prefer to fit in rather than stand out.
  {agreePole:'P', disagreePole:'J'}, // I keep options open rather than committing.
  {agreePole:'T', disagreePole:'F'}, // I want to be good at fixing things more than fixing people.
  {agreePole:'E', disagreePole:'I'}, // I talk more than I listen.
  {agreePole:'S', disagreePole:'N'}, // I describe events by what happened rather than what they meant.
  {agreePole:'J', disagreePole:'P'}, // I get work done right away rather than procrastinating.
  {agreePole:'F', disagreePole:'T'}, // I follow my heart more than my head.
  {agreePole:'I', disagreePole:'E'}, // I prefer staying home over going out on the town.
  {agreePole:'N', disagreePole:'S'}, // I want the big picture more than the details.
  {agreePole:'P', disagreePole:'J'}, // I improvise rather than prepare.
  {agreePole:'T', disagreePole:'F'}, // I base morality on justice more than compassion.
  {agreePole:'I', disagreePole:'E'}, // I find it difficult to yell loudly...
  {agreePole:'N', disagreePole:'S'}, // I am theoretical more than empirical.
  {agreePole:'J', disagreePole:'P'}, // I work hard more than I play hard.
  {agreePole:'T', disagreePole:'F'}, // I am uncomfortable with emotions more than I value them.
  {agreePole:'E', disagreePole:'I'}, // I like performing in front of people rather than avoiding it.
  {agreePole:'S', disagreePole:'N'}, // I want to know who/what/when more than why.
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const answers = body.answers;
  if (!Array.isArray(answers) || answers.length !== ITEMS.length) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'answers must be an array of length ' + ITEMS.length }) };
  }

  const scores = { I:0,E:0,N:0,S:0,T:0,F:0,J:0,P:0 };
  for (let i = 0; i < ITEMS.length; i++) {
    const a = Number(answers[i]);
    if (!Number.isInteger(a) || a < 1 || a > 5) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `answers[${i}] must be an integer 1..5` }) };
    }
    const q = ITEMS[i];
    if (a === 1) scores[q.disagreePole] += 2;
    else if (a === 2) scores[q.disagreePole] += 1;
    else if (a === 4) scores[q.agreePole]    += 1;
    else if (a === 5) scores[q.agreePole]    += 2;
  }

  const axes = [['I','E'],['N','S'],['T','F'],['J','P']];
  const defaults = ['I','N','T','J'];
  let type = '';
  const confidence = {};
  axes.forEach(([a,b], idx) => {
    let winner;
    if (scores[a] > scores[b]) winner = a;
    else if (scores[b] > scores[a]) winner = b;
    else winner = defaults[idx];
    type += winner;
    const diff = scores[winner] - scores[winner === a ? b : a];
    confidence[winner] = Math.max(1, Math.min(99, Math.round(diff / 16 * 100)));
  });

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ type, confidence, scores }) };
};
