// Weekly per-type insight digest. Scheduled once a week (Tuesday 15:00 UTC,
// ~10am ET / 7am PT). For every user WITH a known MBTI type (and not
// owner/internal or in a blocked country), sends one email containing:
//   - a key insight about their type
//   - two roles their type commonly likes
//   - two links to "how your type gets along with X" compatibility posts
// Content rotates by a per-user week counter (user_metadata.weekly_digest_n)
// so nothing repeats until the pool is exhausted.
//
// Safety: dry-run by default. Set DIGEST_DRY_RUN=false to actually send.
// Test:   GET ?test=email  -> sends two sample weeks to that address.

const { createClient } = require('@supabase/supabase-js');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const SITE = 'https://personality.fyi';

// Rotating "featured read" included in every digest, picked by the user's week
// index so it changes weekly and doesn't repeat. Newest/most shareable first.
const FEATURED = [
  { url: '/blog/us-presidents-personality-types', title: 'The personality types of all 45 US presidents', blurb: 'One type is a third of them, and three have never made it.' },
  { url: '/blog/what-is-the-rarest-mbti-type', title: 'The rarest personality type', blurb: "INFJ overall, but for women it's actually INTJ." },
  { url: '/blog/mbti-vs-enneagram', title: 'Enneagram vs MBTI', blurb: 'The 9 types, how they map to MBTI, and why MBTI predicts more.' },
  { url: '/blog/intj-birth-month', title: 'Is there an INTJ birth month?', blurb: 'What the research actually says about birth month and type.' },
];
const REPLY_TO = 'brad@personality.fyi';

// Keep in sync with netlify/edge-functions/geo-gate.js
const BLOCKED_COUNTRIES = new Set([
  'CU', 'IR', 'KP', 'SY', 'IQ', 'RU', 'BY', 'VE', 'MV', 'LB', 'YE', 'SD', 'ZW',
]);
const SKIP_EMAILS = new Set(['bradleykam@gmail.com', 'brad@real.photos', 'info@real.photos', 'brad@personality.fyi']);
const SKIP_DOMAINS = ['real.photos'];

const CONTENT = {
"INTJ": {
"name": "Architect",
"insights": [
"You enjoy work where you own the strategy and get left alone to execute. Any job that's mostly meetings, status updates, and managing feelings will quietly make you resent it.",
"INTJs burn out in roles with no clear endpoint or metric. You need to see the system you're building and whether it's working. Vague, political environments drain you faster than hard problems do.",
"In relationships you show love through usefulness and long-term loyalty, not constant reassurance. Your partner has to learn that 'I fixed this for you' is your version of affection.",
"Your most common relationship friction: you treat a partner's bad day as a problem to solve when they just wanted to be heard. Pausing before you jump to solutions is your highest-leverage move.",
"You're happiest where competence is the currency. Jobs where promotion runs on visibility and self-promotion instead of results will slowly make you miserable.",
"You pair best with people who have their own inner world and don't need you 'on' all the time. Clingy or high-drama partners read as exhausting; independent ones read as oxygen."
],
"jobs": [
"Software architect",
"Strategy consultant",
"Investment analyst",
"Research scientist",
"Product strategist",
"Data scientist"
],
"compat": [
"ENTJ",
"INTP",
"INFJ",
"ISFP",
"ESFJ",
"ESFP",
"ENTP",
"INFP",
"ENFJ",
"ENFP",
"ISTJ",
"ISFJ",
"ESTJ",
"ISTP",
"ESTP"
]
},
"INTP": {
"name": "Logician",
"insights": [
"You enjoy work that's still an open problem. You disengage the moment a job turns into maintaining someone else's finished idea.",
"Deadlines and 'just ship it' culture are your enemy. You do your best work when trusted to go deep, and your worst when forced to commit before you understand the whole thing.",
"In relationships you're loyal but undemonstrative. You assume your partner knows how you feel because leaving would be illogical. They often don't. Saying it out loud matters more than you think.",
"Your blind spot with people: you debate to understand, not to win, but it lands as coldness. Naming that you're exploring, not attacking, defuses most of your conflicts.",
"You light up around other curious people and shut down in environments that reward confidence over correctness.",
"You fit best with someone who finds your tangents interesting rather than evasive, and who quietly handles the logistics you keep forgetting."
],
"jobs": [
"Research engineer",
"Theoretical physicist",
"Software engineer",
"Economist",
"Academic researcher",
"Data analyst"
],
"compat": [
"ENTP",
"INTJ",
"ISTP",
"ESFJ",
"ESFP",
"ISFJ",
"ENTJ",
"INFJ",
"INFP",
"ENFJ",
"ENFP",
"ISTJ",
"ESTJ",
"ISFP",
"ESTP"
]
},
"ENTJ": {
"name": "Commander",
"insights": [
"You enjoy work where you set direction and move fast. You get restless and combative in any role with responsibility but no authority.",
"What drains you isn't hard work, it's inefficiency you can't fix: slow decisions, unclear ownership, people who won't commit. A high-stakes problem energizes you; a pointless meeting enrages you.",
"In relationships you run your work playbook, and that's the trap. Your partner is not a project to optimize. Asking 'how was your day' without trying to fix it is a real skill for you.",
"You respect partners who push back. Someone who just defers loses your respect over time; someone who holds their ground keeps it.",
"You're built for roles with scoreboards. Ambiguous, consensus-driven cultures with no clear win condition frustrate you within months.",
"Your warmth is real but rationed. Partners need to know your bluntness isn't rejection, it's how you show you take them seriously."
],
"jobs": [
"CEO / founder",
"Management consultant",
"Investment banker",
"Corporate lawyer",
"Venture capital partner",
"Political leader"
],
"compat": [
"INTJ",
"ESTJ",
"ENTP",
"ISFP",
"ESFP",
"ESFJ",
"INTP",
"INFJ",
"INFP",
"ENFJ",
"ENFP",
"ISTJ",
"ISFJ",
"ISTP",
"ESTP"
]
},
"ENTP": {
"name": "Debater",
"insights": [
"You enjoy the messy early stage: new ideas, pitching, prototyping, arguing it into shape. You lose interest the moment it becomes repeatable process, which is when most jobs actually begin.",
"Bureaucracy and 'because that's the rule' are draining to you. You do your best work where you can challenge how things are done, and your worst where you're told to just comply.",
"In relationships your strength and your problem are the same: you love the debate. Your partner sometimes just wants agreement, and reading which moment is which is your growth edge.",
"You get bored without novelty, including in love. The fix isn't a new person, it's a partner who keeps surprising you and doesn't take your provocations personally.",
"You thrive with people who can spar back and wilt in cultures that punish dissent.",
"Follow-through is your relationship weak spot. The grand gesture is easy; the boring, consistent showing-up is what actually builds trust."
],
"jobs": [
"Startup founder",
"Trial attorney",
"Investigative journalist",
"Product manager",
"Venture investor (early stage)",
"Management consultant"
],
"compat": [
"INTP",
"ENTJ",
"INTJ",
"ESFJ",
"ISFJ",
"ISFP",
"INFJ",
"INFP",
"ENFJ",
"ENFP",
"ISTJ",
"ESTJ",
"ISTP",
"ESTP",
"ESFP"
]
},
"INFJ": {
"name": "Advocate",
"insights": [
"You enjoy work with meaning and one-on-one depth, and you quietly wither in roles that are transactional or values-misaligned, no matter how good the pay.",
"You can do people-heavy work, but it costs you more than most types. Build in real recovery time, or the empathy that makes you good at it becomes the thing that burns you out.",
"In relationships you give a lot and ask for little, until you suddenly don't. The 'door slam' isn't sudden; it's months of unspoken hurt you never voiced. Speaking up early prevents it.",
"You crave depth and read people fast, so surface-level partners feel lonely to you. You fit best with someone who wants to be genuinely known, not just kept company.",
"Cutthroat, conflict-heavy environments drain you disproportionately. You do your best work where the culture matches your values, not just your skills.",
"Your pattern: you understand everyone else and assume no one's trying to understand you. Letting a partner in, instead of always being the one who 'gets it,' is the work."
],
"jobs": [
"Psychotherapist",
"Novelist / screenwriter",
"Nonprofit leader",
"Counselor",
"Professor (humanities)",
"UX researcher"
],
"compat": [
"ENFP",
"ENFJ",
"INTJ",
"ESTP",
"ESFP",
"ESTJ",
"INTP",
"ENTJ",
"ENTP",
"INFP",
"ISTJ",
"ISFJ",
"ESFJ",
"ISTP",
"ISFP"
]
},
"INFP": {
"name": "Mediator",
"insights": [
"You enjoy work that expresses your values, and you can't fake enthusiasm for work that doesn't. A job that conflicts with what you believe will drain you no matter how prestigious it is.",
"You need autonomy and meaning over structure and status. Rigid hierarchies and pure-metrics cultures suffocate you; creative or cause-driven work brings you alive.",
"In relationships you love deeply and idealize easily, then feel let down when reality doesn't match the version in your head. Loving the actual person, flaws included, is your growth edge.",
"You avoid conflict to keep the peace, but unspoken resentment leaks out anyway. Your partner would rather hear the hard thing early than feel you quietly withdraw.",
"You're happiest working in your own way at your own depth, and most miserable performing an extraversion you don't feel.",
"You fit best with someone who protects your inner world rather than trampling it, and who can gently pull you out when you've retreated too far inward."
],
"jobs": [
"Poet / novelist",
"Therapist",
"UX designer",
"Social worker",
"Veterinarian",
"Teacher (K-12 or college)"
],
"compat": [
"ENFP",
"INFJ",
"ISFP",
"ESTP",
"ESTJ",
"ISTJ",
"INTJ",
"INTP",
"ENTJ",
"ENTP",
"ENFJ",
"ISFJ",
"ESFJ",
"ISTP",
"ESFP"
]
},
"ENFJ": {
"name": "Protagonist",
"insights": [
"You enjoy work that develops people and moves a group toward something. Purely transactional roles where you can't see the human impact drain you.",
"Your risk at work isn't laziness, it's over-giving. You'll absorb everyone's needs until there's nothing left for you. Roles with no boundaries burn you out fast.",
"In relationships you keep everyone happy, sometimes at the cost of needs you're bad at even naming. Stating what you want directly is harder for you than it should be.",
"You read rooms beautifully but can manage your partner instead of being real with them. Dropping the warmth-performance and being honest is where intimacy actually lives.",
"You thrive where appreciation is part of the culture and wither where good work goes unacknowledged.",
"You fit best with someone secure enough to receive your care without taking advantage of it, who reminds you that you're allowed to need things too."
],
"jobs": [
"Executive coach",
"Nonprofit founder",
"High-school teacher",
"Chief of staff",
"HR director",
"Politician"
],
"compat": [
"INFJ",
"ENFP",
"ESFJ",
"ISTP",
"INTP",
"ESTP",
"INTJ",
"ENTJ",
"ENTP",
"INFP",
"ISTJ",
"ISFJ",
"ESTJ",
"ISFP",
"ESFP"
]
},
"ENFP": {
"name": "Campaigner",
"insights": [
"You enjoy work full of variety, people, and possibility, and you die a little in jobs that are repetitive, isolated, or rule-bound. Novelty isn't a luxury for you, it's fuel.",
"You start things brilliantly and finish them with difficulty. The right job pairs your spark with structure (a deadline, a teammate, a system) so your ideas actually ship.",
"In relationships you bring energy and warmth but fear being tied down. The paradox: the security you resist is what lets you relax. The right partner gives you roots without a cage.",
"You feel conflict intensely and would rather flee it than sit in it. Staying in the hard conversation instead of changing the subject is your growth edge.",
"You light up around people and ideas and fade in solitary, monotonous roles. Energy is your real resource, so guard what drains it.",
"You fit best with someone who finds your enthusiasm contagious rather than exhausting, and who's steady enough to anchor you when you spin out."
],
"jobs": [
"Creative director",
"Entrepreneur",
"Brand strategist",
"Teacher (early childhood or college)",
"Journalist",
"UX researcher"
],
"compat": [
"INFJ",
"INFP",
"ENFJ",
"ESTJ",
"ISTJ",
"ISTP",
"INTJ",
"INTP",
"ENTJ",
"ENTP",
"ISFJ",
"ESFJ",
"ISFP",
"ESTP",
"ESFP"
]
},
"ISTJ": {
"name": "Logistician",
"insights": [
"You enjoy work with clear standards and visible results, and you're frustrated by vague expectations and change for its own sake. You want to know what 'done right' looks like.",
"You're the person organizations depend on and rarely celebrate. The risk: you'll carry a broken system for years out of duty. Knowing when reliability becomes self-sacrifice matters.",
"In relationships you show love through dependability, not words. You keep your promises and expect the same. A flaky partner reads as disrespectful to you, fast.",
"Your blind spot: you can mistake your way of doing things for the only right way. Letting a partner do it differently (and worse) without correcting them is real love for you.",
"You thrive with structure and earned trust, and you bristle in chaotic, move-fast cultures that treat process as optional.",
"You fit best with someone who values your steadiness and doesn't confuse it for boring. Your consistency is the foundation flashier types can't offer."
],
"jobs": [
"Accountant / auditor",
"Civil engineer",
"Judge / magistrate",
"Financial analyst",
"Military officer (logistics)",
"Compliance officer"
],
"compat": [
"ESTJ",
"ISFJ",
"ENTJ",
"ENFP",
"INFP",
"ESFP",
"INTJ",
"INTP",
"ENTP",
"INFJ",
"ENFJ",
"ESFJ",
"ISTP",
"ISFP",
"ESTP"
]
},
"ISFJ": {
"name": "Defender",
"insights": [
"You enjoy work where you care for people and the details are handled, and you're drained by cutthroat, self-promoting environments. You want to help, not compete.",
"Your strength (anticipating what everyone needs) becomes your trap. You'll over-function until you're depleted and no one notices, because you never said anything. Boundaries are your real growth area.",
"In relationships you give quietly and constantly and struggle to ask for anything back. Your partner has to check in actively, because you'll rarely volunteer that you're running on empty.",
"You avoid conflict and absorb hurt rather than voice it, which builds quiet resentment. Saying the small thing early saves the big rupture later.",
"You do your best work where loyalty is mutual and effort is seen. One-sided, thankless roles slowly hollow you out.",
"You fit best with someone who notices and returns your care, rather than someone who simply lets you do all the giving."
],
"jobs": [
"Nurse",
"Pediatrician",
"Elementary school teacher",
"Paralegal",
"Librarian",
"Occupational therapist"
],
"compat": [
"ESFJ",
"ISTJ",
"ENFJ",
"INTP",
"ENTP",
"INTJ",
"ENTJ",
"INFJ",
"INFP",
"ENFP",
"ESTJ",
"ISTP",
"ISFP",
"ESTP",
"ESFP"
]
},
"ESTJ": {
"name": "Executive",
"insights": [
"You enjoy work where you organize people and systems toward a clear goal, and you're frustrated by ambiguity, missed deadlines, and people who won't commit to a plan.",
"You're built to run things. The risk is enforcing order so hard you crush the people doing the work. Results-over-relationships cultures amplify your worst tendencies.",
"In relationships you show love by taking charge and getting things done, but your partner sometimes needs empathy, not a plan. 'That sounds hard' beats 'here's what you should do' more often than you'd expect.",
"Your bluntness is honesty to you and harshness to them. The directness that makes you effective at work needs a softer setting at home.",
"You thrive in structured, accountable cultures and chafe in loose, consensus-driven ones with no clear chain of command.",
"You fit best with someone who values your reliability and isn't steamrolled by your strong opinions."
],
"jobs": [
"Operations executive",
"General manager",
"Military officer",
"Judge",
"Hospital administrator",
"Sales director"
],
"compat": [
"ISTJ",
"ENTJ",
"ESFJ",
"INFP",
"ENFP",
"ISFP",
"INTJ",
"INTP",
"ENTP",
"INFJ",
"ENFJ",
"ISFJ",
"ISTP",
"ESTP",
"ESFP"
]
},
"ESFJ": {
"name": "Consul",
"insights": [
"You enjoy work that's social, supportive, and appreciated, and you're drained by isolation and by environments where people are cold or combative.",
"You're excellent at making people feel cared for, but you take work conflict personally in a way detached types don't. Criticism-heavy or competitive roles cost you more than they cost others.",
"In relationships you're warm and generous but can keep score quietly and feel unappreciated without saying so. Voicing your needs directly beats hoping they'll notice.",
"You care a lot what people think, including your partner, which can tip into people-pleasing. A relationship works best when you can be honest even at the risk of brief disapproval.",
"You thrive where harmony and appreciation are part of the culture and wilt where good work goes unthanked.",
"You fit best with someone who values your warmth and returns it, rather than someone who takes your caretaking for granted."
],
"jobs": [
"Event planner",
"Hospitality manager",
"Nurse",
"Elementary teacher",
"HR manager",
"Real estate agent"
],
"compat": [
"ISFJ",
"ENFJ",
"ESFP",
"INTP",
"INTJ",
"ENTP",
"ENTJ",
"INFJ",
"INFP",
"ENFP",
"ISTJ",
"ESTJ",
"ISTP",
"ISFP",
"ESTP"
]
},
"ISTP": {
"name": "Virtuoso",
"insights": [
"You enjoy hands-on work solving real, concrete problems, and you're bored senseless by abstract theory, endless meetings, and process for its own sake.",
"You need autonomy and variety. The fastest way to lose you is to micromanage you or trap you at a desk with no technical or physical problem to chew on.",
"In relationships you show care through action, not words, and you need a lot of space. A partner who reads your need for solitude as rejection will struggle; one who gives you room thrives.",
"Your blind spot: you go quiet and handle things internally, and your partner is left guessing. A little narration of what's going on inside you goes a long way.",
"You do your best work trusted to figure it out alone, and your worst forced into constant collaboration and emotional processing.",
"You fit best with someone independent who doesn't need constant reassurance and reads your calm as calm, not coldness."
],
"jobs": [
"Mechanical engineer",
"Pilot",
"Surgeon",
"Firefighter / EMT",
"Detective",
"Forensic analyst"
],
"compat": [
"ESTP",
"INTP",
"ISTJ",
"ESFJ",
"ENFJ",
"ENFP",
"INTJ",
"ENTJ",
"ENTP",
"INFJ",
"INFP",
"ISFJ",
"ESTJ",
"ISFP",
"ESFP"
]
},
"ISFP": {
"name": "Adventurer",
"insights": [
"You enjoy hands-on work that lets you express your taste or values, and you're stifled by rigid structure, heavy theory, and planning far ahead.",
"You live in the present and work best there. Jobs demanding long-range strategy drain you; ones with immediate, tangible, aesthetic output bring you alive.",
"In relationships you're gentle and deeply loyal but intensely private about what matters most. A partner has to earn their way into your inner world; pushing too hard makes you retreat.",
"You avoid conflict and dislike being boxed in, so you go quiet rather than fight. Telling a partner what you actually feel, instead of withdrawing, is your growth edge.",
"You thrive with freedom and creative latitude and wilt under micromanagement and rigid rules.",
"You fit best with someone who appreciates your quiet depth and doesn't mistake your need for space as disinterest."
],
"jobs": [
"Graphic designer",
"Photographer",
"Musician",
"Veterinary technician",
"Chef",
"Interior designer"
],
"compat": [
"ESFP",
"INFP",
"ISFJ",
"INTJ",
"ENTJ",
"INTP",
"ENTP",
"INFJ",
"ENFJ",
"ENFP",
"ISTJ",
"ESTJ",
"ESFJ",
"ISTP",
"ESTP"
]
},
"ESTP": {
"name": "Entrepreneur",
"insights": [
"You enjoy fast, high-stakes, hands-on work where you read the situation and act, and you're bored to death by theory, slow process, and long planning cycles.",
"You're at your best in motion and your worst stuck waiting for permission. Immediate-feedback roles energize you; bureaucratic ones make you reckless out of restlessness.",
"In relationships you bring excitement and presence but struggle with the slow, unglamorous parts. The thrill is easy; the daily consistency is what actually builds a partnership.",
"Your bluntness and risk-taking can read as not caring. Slowing down to show your partner they matter, beyond the fun, is your growth edge.",
"You thrive where you can act fast and see results, and you check out in slow, theoretical, rule-bound environments.",
"You fit best with someone who enjoys your spontaneity but is grounded enough to keep you from burning the candle at both ends."
],
"jobs": [
"Sales rep (field / enterprise)",
"Paramedic",
"Trader",
"Detective",
"Athletic coach",
"Entrepreneur"
],
"compat": [
"ISTP",
"ESTJ",
"ESFP",
"INFP",
"INFJ",
"INTJ",
"INTP",
"ENTJ",
"ENTP",
"ENFJ",
"ENFP",
"ISTJ",
"ISFJ",
"ESFJ",
"ISFP"
]
},
"ESFP": {
"name": "Entertainer",
"insights": [
"You enjoy work that's social, lively, and people-facing, and you wilt in isolated, repetitive, or heavily theoretical roles. You need interaction to do your best.",
"You're great in the moment and with people, but long-range planning and solitary deep work drain you. The right job leans on your spontaneity and warmth instead of fighting them.",
"In relationships you're fun, warm, and generous, but conflict and criticism hit you hard and you'll avoid both. Staying present in the hard conversation instead of lightening the mood is your growth edge.",
"You live in the now, which makes you a delight and sometimes a planner's nightmare. A partner who values your spontaneity but handles logistics is a great match.",
"You thrive where there's people and movement and fade where there's silence and routine.",
"You fit best with someone who soaks up your warmth and brings the steadiness you don't naturally supply."
],
"jobs": [
"Performer (actor / musician)",
"Event host / MC",
"Hospitality director",
"Tour guide",
"Social media creator",
"Sales (consumer / retail)"
],
"compat": [
"ESFJ",
"ISFP",
"ESTP",
"INTJ",
"INTP",
"ENTJ",
"ENTP",
"INFJ",
"INFP",
"ENFJ",
"ENFP",
"ISTJ",
"ISFJ",
"ESTJ",
"ISTP"
]
}
};

function shouldSkip(email) {
  if (!email) return true;
  const e = email.toLowerCase();
  if (SKIP_EMAILS.has(e)) return true;
  return SKIP_DOMAINS.includes((e.split('@')[1] || ''));
}

function compatUrl(a, b) {
  const slug = [a.toLowerCase(), b.toLowerCase()].sort().join('-') + '-compatibility';
  return SITE + '/blog/' + slug;
}

// Split a type's insight pool into work-themed and relationship-themed.
function splitInsights(arr) {
  const rel = [], work = [];
  arr.forEach((s) => {
    if (/relationship|partner|pair best|fit best| love |intimacy/i.test(' ' + s + ' ')) rel.push(s);
    else work.push(s);
  });
  return { work: work.length ? work : arr, rel: rel.length ? rel : arr };
}

// Infer a user's interest from behavior: 'professional', 'personal', or 'both'.
// feat = { career, compat } query counts (may be undefined).
function computeSegment(md, feat) {
  const landing = (((md.signup_attribution || {}).landing) || '').toLowerCase();
  const career = (feat && feat.career > 0) ||
    /career-planning|best-personality-type|best-mbti-type|careers/.test(landing);
  const personal = (feat && feat.compat > 0) ||
    /compatibility|-vs-|relationship|(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)-mbti/.test(landing);
  if (career && personal) return 'both';
  if (career) return 'professional';
  if (personal) return 'personal';
  return 'both'; // no signal yet: give them everything
}

const REVIEW_TO = 'bradleykam@gmail.com';

// Feature-driven weekly rotation: ONE idea + ONE action per email. No blog links.
const WEEKS = [
  { theme: 'Career advice',     kind: 'work', cta: { label: 'Try asking for career advice tailored to your type →', url: '/career-planning' } },
  { theme: 'Compatibility',     kind: 'rel',  cta: { label: 'See who you click with — and clash with →',        url: '/compatibility' } },
  { theme: 'Never Have I Ever', kind: 'rel',  cta: { label: 'Check out Never Have I Ever →',                        url: '/never-have-i-ever' } },
  { theme: 'Feedback',          kind: 'work', cta: { reply: true, label: 'Just hit reply and tell me — does this sound like you?' } },
];

// Monday-aligned global week number so all users share the same weekly theme.
function currentWeek() {
  const days = Math.floor(Date.now() / 86400000);
  return Math.floor((days + 3) / 7);
}

function pickInsight(code, week) {
  const sp = splitInsights(CONTENT[code].insights);
  const w = WEEKS[week % WEEKS.length];
  const pool = w.kind === 'rel' ? sp.rel : sp.work;
  return pool[Math.floor(week / WEEKS.length) % pool.length];
}

// New one-idea, one-action weekly email.
function buildEmail(code, week) {
  const name = CONTENT[code].name;
  const w = WEEKS[week % WEEKS.length];
  const insight = pickInsight(code, week);
  const action = w.cta.reply
    ? `<p style="margin:22px 0 0;font-size:15px;font-weight:600;color:#1a1a1a;background:#fff6e9;border:1px solid #f0d9b0;border-radius:8px;padding:12px 16px">${w.cta.label}</p>`
    : `<p style="margin:22px 0 0"><a href="${SITE}${w.cta.url}" style="display:inline-block;background:#0e0e0e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">${w.cta.label}</a></p>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
<p style="margin:0 0 14px">Hi — here's your weekly ${code} (${name}) note.</p>
<p style="margin:0;padding:14px 16px;background:#faf9f6;border-left:3px solid #0e0e0e;border-radius:4px">${insight}</p>
${action}
<p style="margin:22px 0 0">Reply anytime — I read every one.</p>
<p style="margin:8px 0 0">Brad</p>
</div>`;
  const actionText = w.cta.reply ? w.cta.label : `${w.cta.label}\n${SITE}${w.cta.url}`;
  const text = `Hi — here's your weekly ${code} (${name}) note.\n\n${insight}\n\n${actionText}\n\nReply anytime — I read every one.\nBrad`;
  return { subject: `Your weekly ${code} insight`, html, text };
}

// Typeless users get a generic insight + one question + the test CTA,
// rotating weekly in step with the themed weeks.
const GENERIC_INSIGHTS = [
  'The best predictor of loving a job is not salary or title. It is whether the day to day work fits how your mind naturally operates. That fit is exactly what personality type maps.',
  'The people you click with instantly usually share your way of processing the world, not your hobbies. That is why some strangers feel familiar in five minutes and some friends of years still feel like work.',
  'On our polls, the 16 personality types answer the same life questions in wildly different ways. Every ENTJ says they have negotiated a salary. Only a quarter of INFPs have.',
  'Most people read their type profile and say "that is me." The interesting part is the piece that does not fit. That is usually where you have grown.',
];

function buildNoTypeEmail(week) {
  const insight = GENERIC_INSIGHTS[week % GENERIC_INSIGHTS.length];
  const question = 'Want to know what type of people you connect with best?';
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
<p style="margin:0 0 14px">Hi — here's your weekly personality note.</p>
<p style="margin:0;padding:14px 16px;background:#faf9f6;border-left:3px solid #0e0e0e;border-radius:4px">${insight}</p>
<p style="margin:22px 0 0;font-size:15px;font-weight:600">${question}</p>
<p style="margin:12px 0 0"><a href="${SITE}/take-the-test" style="display:inline-block;background:#0e0e0e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">Take the free 60 second test →</a></p>
<p style="margin:22px 0 0">Reply anytime — I read every one.</p>
<p style="margin:8px 0 0">Brad</p>
</div>`;
  const text = `Hi — here's your weekly personality note.\n\n${insight}\n\n${question}\nTake the free 60 second test: ${SITE}/take-the-test\n\nReply anytime — I read every one.\nBrad`;
  return { subject: 'Your weekly personality insight', html, text };
}

// Compile all 16 types' upcoming email into ONE review email for Brad (24h ahead).
function buildReview(week) {
  const w = WEEKS[week % WEEKS.length];
  let blocks = '';
  for (const code of Object.keys(CONTENT)) {
    const e = buildEmail(code, week);
    blocks += `<div style="margin:26px 0 6px;border-top:3px solid #0e0e0e;padding-top:8px"><b style="font-size:17px">${code}</b> <span style="color:#888">— ${CONTENT[code].name}</span></div>`
      + `<div style="border:1px solid #e8e5df;border-radius:8px;padding:2px 16px;margin-top:6px">${e.html}</div>`;
  }
  const nt = buildNoTypeEmail(week);
  blocks += `<div style="margin:26px 0 6px;border-top:3px solid #0e0e0e;padding-top:8px"><b style="font-size:17px">NO TYPE</b> <span style="color:#888">— users who haven't taken the test</span></div>`
    + `<div style="border:1px solid #e8e5df;border-radius:8px;padding:2px 16px;margin-top:6px">${nt.html}</div>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;color:#1a1a1a">
<h2 style="margin:0 0 6px">Weekly digest — review (sends tomorrow)</h2>
<p style="font-size:14px;color:#555">This week's theme: <b>${w.theme}</b>. One idea + one action per email. Below is every type's email, exactly as it will send. Reply with edits and I'll hold the send.</p>
${blocks}
<p style="margin:30px 0 0;font-size:13px;color:#888">— reply to change anything before it goes out</p>
</div>`;
  return { subject: `[REVIEW] Weekly digest sends tomorrow — theme: ${w.theme}`, html, text: 'Weekly digest review — theme: ' + w.theme };
}

function buildDigest(code, n, segment) {
  const c = CONTENT[code];
  const name = c.name;
  const sp = splitInsights(c.insights);
  let pool, showJobs, showCompat;
  if (segment === 'professional') { pool = sp.work; showJobs = true; showCompat = false; }
  else if (segment === 'personal') { pool = sp.rel; showJobs = false; showCompat = true; }
  else { pool = c.insights; showJobs = true; showCompat = true; }

  const insight = pool[n % pool.length];
  const job1 = c.jobs[(2 * n) % c.jobs.length];
  const job2 = c.jobs[(2 * n + 1) % c.jobs.length];
  const p1 = c.compat[(2 * n) % c.compat.length];
  const p2 = c.compat[(2 * n + 1) % c.compat.length];
  const url1 = compatUrl(code, p1);
  const url2 = compatUrl(code, p2);
  const feat = FEATURED[n % FEATURED.length];

  const jobsHtml = showJobs ? `<p style="margin:0 0 14px">Two roles ${name}s tend to thrive in: <strong>${job1}</strong> and <strong>${job2}</strong>. <a href="${SITE}/career-planning" style="color:#2563eb">See if they fit you</a>.</p>\n` : '';
  const compatHtml = showCompat ? `<p style="margin:0 0 10px">How you get along with other types:</p>\n<ol style="margin:0 0 16px;padding-left:22px">\n  <li style="margin:0 0 10px"><a href="${url1}" style="color:#2563eb">How ${code}s and ${p1}s get along</a></li>\n  <li style="margin:0 0 10px"><a href="${url2}" style="color:#2563eb">How ${code}s and ${p2}s get along</a></li>\n</ol>\n` : '';

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;max-width:520px">
<p style="margin:0 0 14px">Here's your weekly ${code} (${name}) insight.</p>
<p style="margin:0 0 16px;padding:12px 16px;background:#faf9f6;border-left:3px solid #2563eb;border-radius:4px">${insight}</p>
${jobsHtml}${compatHtml}<p style="margin:0 0 6px;font-weight:700">Featured read</p>
<p style="margin:0 0 16px"><a href="${SITE}${feat.url}" style="color:#2563eb">${feat.title}</a> &mdash; ${feat.blurb}</p>
<p style="margin:0 0 14px">Reply anytime, I read every one.</p>
<p style="margin:0">Happy searching,<br>Brad</p>
</div>`;

  const jobsText = showJobs ? `Two roles ${name}s tend to thrive in: ${job1} and ${job2}. See if they fit you: ${SITE}/career-planning\n\n` : '';
  const compatText = showCompat ? `How you get along with other types:\n1. How ${code}s and ${p1}s get along: ${url1}\n2. How ${code}s and ${p2}s get along: ${url2}\n\n` : '';
  const text = `Here's your weekly ${code} (${name}) insight.\n\n${insight}\n\n${jobsText}${compatText}Featured read: ${feat.title} - ${feat.blurb}\n${SITE}${feat.url}\n\nReply anytime, I read every one.\n\nHappy searching,\nBrad`;

  return { subject: `Your weekly ${code} insight`, html, text };
}

async function sendViaResend(to, subject, text, html, campaign = 'weekly-digest', userId = null) {
  return require('../lib/email-reporting').sendTracked({
    to, subject, text, html, campaign, userId,
    from: process.env.RESEND_FROM || 'Brad Kam <brad@personality.fyi>',
    reply_to: REPLY_TO
  });
}

async function listAllUsers(supabase) {
  const all = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    all.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return all;
}

exports.handler = async (event) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase not configured' }) };
  }
  const q = (event && event.queryStringParameters) || {};
  const week = q.week ? Number(q.week) : currentWeek();

  // Manual: ?review=1[&week=N] -> send Brad the review email now.
  if (q.review) {
    const r = buildReview(week);
    const res = await sendViaResend(REVIEW_TO, r.subject, r.text, r.html);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ review: REVIEW_TO, week, result: res }, null, 2) };
  }

  // Manual: ?test=email -> send that real user the email they'd get this week.
  if (q.test) {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    let found;
    try { const all = await listAllUsers(sb); found = all.find((x) => (x.email || '').toLowerCase() === q.test.toLowerCase()); }
    catch (e) { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }; }
    if (!found) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'No account found for ' + q.test }) };
    const type = ((found.user_metadata || {}).mbti_type || '').toUpperCase();
    const d = CONTENT[type] ? buildEmail(type, week) : buildNoTypeEmail(week);
    const res = await sendViaResend(q.test, '[TEST] ' + d.subject, d.text, d.html);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ test: q.test, type, week, result: res }, null, 2) };
  }

  // Scheduled daily 15:00 UTC. Monday = 24h review to Brad; Tuesday = real send.
  const day = new Date().getUTCDay(); // Sun=0 .. Sat=6

  if (day === 1) {
    const r = buildReview(week);
    const res = await sendViaResend(REVIEW_TO, r.subject, r.text, r.html);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ mode: 'monday-review', week, sentTo: REVIEW_TO, result: res }, null, 2) };
  }
  if (day !== 2) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ mode: 'idle', day }, null, 2) };
  }

  // Tuesday: real send. Respects DIGEST_DRY_RUN ('true' = paused/preview-only).
  const dryRun = process.env.DIGEST_DRY_RUN !== 'false';
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let users;
  try { users = await listAllUsers(supabase); }
  catch (e) { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }; }

  const summary = { dryRun, week, scanned: users.length, eligible: 0, sent: 0, skipped: 0, noType: 0, blockedCountry: 0, alreadyThisWeek: 0, failed: 0 };
  const preview = [];
  for (const u of users) {
    const md = u.user_metadata || {};
    if (shouldSkip(u.email)) { summary.skipped++; continue; }
    if (md.digest_unsub === true) { summary.unsubscribed = (summary.unsubscribed || 0) + 1; continue; }
    const country = (md.signup_country || '').toUpperCase();
    if (country && BLOCKED_COUNTRIES.has(country)) { summary.blockedCountry++; continue; }
    const type = (md.mbti_type || '').toUpperCase();
    if (Number(md.weekly_digest_week) === week) { summary.alreadyThisWeek++; continue; } // idempotency
    summary.eligible++;
    const hasType = !!CONTENT[type];
    if (!hasType) summary.noType++; // typeless users get the generic insight + test CTA variant
    const { subject, html, text } = hasType ? buildEmail(type, week) : buildNoTypeEmail(week);
    if (dryRun) { preview.push({ to: u.email, type: hasType ? type : 'none', week, subject }); continue; }
    await new Promise((r) => setTimeout(r, 250)); // stay under Resend's 5 req/sec
    const res = await sendViaResend(u.email, subject, text, html, 'weekly-digest', u.id);
    if (res.sent) {
      await supabase.auth.admin.updateUserById(u.id, {
        user_metadata: { ...md, weekly_digest_week: week, weekly_digest_n: (Number(md.weekly_digest_n) || 0) + 1, weekly_digest_last: new Date().toISOString() },
      });
      summary.sent++;
    } else { summary.failed++; preview.push({ to: u.email, type, error: res.reason, detail: res.detail }); }
  }
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ summary, preview }, null, 2) };
};

// Daily 15:00 UTC. Monday sends Brad the 24h review; Tuesday sends the real digest.
exports.config = { schedule: '0 15 * * *' };
