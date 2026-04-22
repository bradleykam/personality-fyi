#!/usr/bin/env node
// Regenerates /blog/index.html and /blog/[type]-personality.html for all 16 types.
// Run: node tools/generate-blog.js (from repo root)
//
// Uses type data copied from index.html. When the underlying data changes,
// re-run this script and commit the regenerated HTML files.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'blog');

// ── Data ──────────────────────────────────────────────────────────

const TYPE_NAMES = {
  INTJ:'The Architect', INTP:'The Logician', ENTJ:'The Commander', ENTP:'The Debater',
  INFJ:'The Advocate', INFP:'The Mediator', ENFJ:'The Protagonist', ENFP:'The Campaigner',
  ISTJ:'The Logistician', ISFJ:'The Defender', ESTJ:'The Executive', ESFJ:'The Consul',
  ISTP:'The Virtuoso', ISFP:'The Adventurer', ESTP:'The Entrepreneur', ESFP:'The Entertainer'
};

const TYPE_DESCS = {
  INTJ: { cognitive: "Strategic, systems-level thinking. Builds mental models and long-range plans.", strengths: "Independent, decisive, high standards, visionary", shadow: "Can be dismissive of others' input, struggles with emotional expression, overconfident in their own analysis", drains: "Repetitive meetings, micromanagement, social performance, inefficiency" },
  INTP: { cognitive: "Analytical, framework-building. Needs to understand the underlying logic of everything.", strengths: "Precise, innovative, intellectually curious, objective", shadow: "Analysis paralysis, can seem cold or detached, struggles to ship", drains: "Administrative work, rigid deadlines, being told how to think" },
  ENTJ: { cognitive: "Executive, decisive. Organizes people and systems toward goals with urgency.", strengths: "Natural leader, strategic, direct, thrives under pressure", shadow: "Can steamroll others, impatient, struggles to slow down for the room", drains: "Inefficiency, indecision, lack of follow-through" },
  ENTP: { cognitive: "Generative, contrarian. Explores all angles by challenging assumptions.", strengths: "Quick thinker, persuasive, versatile, opens doors others miss", shadow: "Argues for sport, starts more than finishes, can exhaust people", drains: "Repetition, bureaucracy, being boxed in" },
  INFJ: { cognitive: "Visionary and empathic. Sees patterns in people and systems others miss.", strengths: "Deep insight, purposeful, quietly inspiring, long-range vision", shadow: "Can be perfectionistic and withdrawn, difficulty with conflict, burnout-prone", drains: "Values misalignment, conflict, shallow interactions" },
  INFP: { cognitive: "Values-driven, imaginative. Filters everything through personal meaning.", strengths: "Creative, empathic, authentic, fiercely principled", shadow: "Can be impractical, avoids conflict to a fault, prone to idealism", drains: "Cynicism, political environments, feeling unheard" },
  ENFJ: { cognitive: "People-focused, mission-driven. Reads the room and moves groups toward shared purpose.", strengths: "Warm, charismatic, organized around people, natural facilitator", shadow: "Over-extends, struggles to say no, can be manipulative under pressure", drains: "Isolation, working without purpose, values violations" },
  ENFP: { cognitive: "Possibility-seeking, energetic. Connects ideas and people in unexpected ways.", strengths: "Enthusiastic, creative, socially magnetic, opens new paths", shadow: "Scattered, overcommits, needs external validation", drains: "Routine, rigid process, being micromanaged" },
  ISTJ: { cognitive: "Detail-oriented, methodical. Builds reliable systems and follows through.", strengths: "Dependable, thorough, process-driven, consistent", shadow: "Resistant to change, can be inflexible, overly cautious", drains: "Ambiguity, last-minute changes, lack of clear expectations" },
  ISFJ: { cognitive: "Steady, observant, and caring. Remembers details about people and honors commitments.", strengths: "Loyal, warm, thorough, quietly strong", shadow: "Avoids conflict, struggles to set boundaries, can be underestimated", drains: "Conflict, lack of appreciation, cold environments" },
  ESTJ: { cognitive: "Structured, results-oriented. Enforces order and holds people accountable.", strengths: "Clear communicator, reliable, organized, decisive", shadow: "Can be rigid and blunt, struggles with ambiguity, dismisses feelings", drains: "Inefficiency, rule-breakers, lack of follow-through" },
  ESFJ: { cognitive: "Harmony-seeking, organized. Makes sure people feel included and cared for.", strengths: "Warm, organized, loyal, builds team cohesion", shadow: "Conflict-averse, approval-seeking, struggles with criticism", drains: "Conflict, cold environments, feeling unappreciated" },
  ISTP: { cognitive: "Hands-on, pragmatic. Understands how things work and fixes what is broken.", strengths: "Calm under pressure, resourceful, observant, efficient", shadow: "Emotionally unavailable, can be blunt, disengages when bored", drains: "Theory without application, over-communication, rigidity" },
  ISFP: { cognitive: "Present-focused, aesthetic. Experiences the world through sensation and personal values.", strengths: "Creative, gentle, open-minded, loyal in close relationships", shadow: "Avoids planning, difficulty with confrontation, can be hard to read", drains: "Conflict, performance pressure, rigid structure" },
  ESTP: { cognitive: "Action-oriented, observant. Reads situations in real time and acts decisively.", strengths: "Bold, energetic, pragmatic, thrives under pressure", shadow: "Can be insensitive, impulsive, loses interest after the rush", drains: "Long planning cycles, theory, slow environments" },
  ESFP: { cognitive: "Spontaneous, warm, people-energized. Brings life to any room.", strengths: "Fun, generous, observant of people, great in a crisis", shadow: "Avoids difficult conversations, easily bored, struggles with long-term planning", drains: "Isolation, repetition, rigid structure" }
};

const COMPAT = {
  INTJ: { INTJ:72, INTP:84, ENTJ:86, ENTP:80, INFJ:82, INFP:58, ENFJ:60, ENFP:72, ISTJ:74, ISFJ:48, ESTJ:68, ESFJ:38, ISTP:70, ISFP:36, ESTP:44, ESFP:38 },
  INTP: { INTJ:84, INTP:70, ENTJ:72, ENTP:86, INFJ:68, INFP:62, ENFJ:50, ENFP:66, ISTJ:65, ISFJ:42, ESTJ:56, ESFJ:34, ISTP:82, ISFP:42, ESTP:55, ESFP:38 },
  ENTJ: { INTJ:86, INTP:72, ENTJ:74, ENTP:82, INFJ:70, INFP:50, ENFJ:72, ENFP:62, ISTJ:80, ISFJ:50, ESTJ:84, ESFJ:48, ISTP:64, ISFP:38, ESTP:72, ESFP:42 },
  ENTP: { INTJ:80, INTP:86, ENTJ:82, ENTP:68, INFJ:72, INFP:64, ENFJ:62, ENFP:78, ISTJ:54, ISFJ:42, ESTJ:60, ESFJ:40, ISTP:70, ISFP:44, ESTP:68, ESFP:48 },
  INFJ: { INTJ:82, INTP:68, ENTJ:70, ENTP:72, INFJ:74, INFP:82, ENFJ:86, ENFP:88, ISTJ:56, ISFJ:68, ESTJ:48, ESFJ:60, ISTP:50, ISFP:64, ESTP:38, ESFP:46 },
  INFP: { INTJ:58, INTP:62, ENTJ:50, ENTP:64, INFJ:82, INFP:72, ENFJ:78, ENFP:86, ISTJ:44, ISFJ:70, ESTJ:38, ESFJ:62, ISTP:50, ISFP:80, ESTP:36, ESFP:58 },
  ENFJ: { INTJ:60, INTP:50, ENTJ:72, ENTP:62, INFJ:86, INFP:78, ENFJ:70, ENFP:86, ISTJ:62, ISFJ:80, ESTJ:68, ESFJ:84, ISTP:44, ISFP:68, ESTP:54, ESFP:74 },
  ENFP: { INTJ:72, INTP:66, ENTJ:62, ENTP:78, INFJ:88, INFP:86, ENFJ:86, ENFP:68, ISTJ:42, ISFJ:58, ESTJ:40, ESFJ:62, ISTP:48, ISFP:70, ESTP:52, ESFP:76 },
  ISTJ: { INTJ:74, INTP:65, ENTJ:80, ENTP:54, INFJ:56, INFP:44, ENFJ:62, ENFP:42, ISTJ:82, ISFJ:86, ESTJ:92, ESFJ:76, ISTP:78, ISFP:58, ESTP:74, ESFP:52 },
  ISFJ: { INTJ:48, INTP:42, ENTJ:50, ENTP:42, INFJ:68, INFP:70, ENFJ:80, ENFP:58, ISTJ:86, ISFJ:80, ESTJ:78, ESFJ:92, ISTP:56, ISFP:78, ESTP:48, ESFP:72 },
  ESTJ: { INTJ:68, INTP:56, ENTJ:84, ENTP:60, INFJ:48, INFP:38, ENFJ:68, ENFP:40, ISTJ:92, ISFJ:78, ESTJ:78, ESFJ:82, ISTP:72, ISFP:46, ESTP:82, ESFP:56 },
  ESFJ: { INTJ:38, INTP:34, ENTJ:48, ENTP:40, INFJ:60, INFP:62, ENFJ:84, ENFP:62, ISTJ:76, ISFJ:92, ESTJ:82, ESFJ:76, ISTP:42, ISFP:68, ESTP:62, ESFP:84 },
  ISTP: { INTJ:70, INTP:82, ENTJ:64, ENTP:70, INFJ:50, INFP:50, ENFJ:44, ENFP:48, ISTJ:78, ISFJ:56, ESTJ:72, ESFJ:42, ISTP:80, ISFP:74, ESTP:84, ESFP:56 },
  ISFP: { INTJ:36, INTP:42, ENTJ:38, ENTP:44, INFJ:64, INFP:80, ENFJ:68, ENFP:70, ISTJ:58, ISFJ:78, ESTJ:46, ESFJ:68, ISTP:74, ISFP:80, ESTP:62, ESFP:84 },
  ESTP: { INTJ:44, INTP:55, ENTJ:72, ENTP:68, INFJ:38, INFP:36, ENFJ:54, ENFP:52, ISTJ:74, ISFJ:48, ESTJ:82, ESFJ:62, ISTP:84, ISFP:62, ESTP:76, ESFP:80 },
  ESFP: { INTJ:38, INTP:38, ENTJ:42, ENTP:48, INFJ:46, INFP:58, ENFJ:74, ENFP:76, ISTJ:52, ISFJ:72, ESTJ:56, ESFJ:84, ISTP:56, ISFP:84, ESTP:80, ESFP:72 }
};

// Curated lists — widely-accepted typings and typical poor-fit careers.
const FAMOUS = {
  INTJ: ['Elon Musk', 'Mark Zuckerberg', 'Nikola Tesla', 'Friedrich Nietzsche', 'Jane Austen', 'Isaac Newton', 'Stephen Hawking'],
  INTP: ['Albert Einstein', 'Charles Darwin', 'Bill Gates', 'Larry Page', 'Marie Curie', 'Immanuel Kant'],
  ENTJ: ['Steve Jobs', 'Margaret Thatcher', 'Gordon Ramsay', 'Franklin D. Roosevelt', 'Sheryl Sandberg', 'Napoleon Bonaparte'],
  ENTP: ['Thomas Edison', 'Mark Twain', 'Richard Feynman', 'Leonardo da Vinci', 'Tom Hanks', 'Robert Downey Jr.'],
  INFJ: ['Martin Luther King Jr.', 'Nelson Mandela', 'Carl Jung', 'Taylor Swift', 'Lady Gaga', 'Fyodor Dostoevsky'],
  INFP: ['William Shakespeare', 'J.R.R. Tolkien', 'Vincent van Gogh', 'Princess Diana', 'Johnny Depp', 'Kurt Cobain'],
  ENFJ: ['Barack Obama', 'Oprah Winfrey', 'Morgan Freeman', 'Jennifer Lawrence', 'Dennis Rodman', 'Maya Angelou'],
  ENFP: ['Robin Williams', 'Robert Downey Jr.', 'Walt Disney', 'Will Smith', 'Ellen DeGeneres', 'Quentin Tarantino'],
  ISTJ: ['Warren Buffett', 'Angela Merkel', 'George Washington', 'Queen Elizabeth II', 'Anthony Hopkins', 'Jeff Bezos'],
  ISFJ: ['Mother Teresa', 'Kate Middleton', 'Rosa Parks', 'Beyoncé', 'Vin Diesel', 'Halle Berry'],
  ESTJ: ['Michelle Obama', 'Hillary Clinton', 'Judge Judy', 'Dwight D. Eisenhower', 'Sonia Sotomayor', 'Lyndon B. Johnson'],
  ESFJ: ['Taylor Swift', 'Jennifer Lopez', 'Bill Clinton', 'Anne Hathaway', 'Steve Harvey', 'Sarah Palin'],
  ISTP: ['Clint Eastwood', 'Bear Grylls', 'Michael Jordan', 'Scarlett Johansson', 'Tom Cruise', 'Miles Davis'],
  ISFP: ['Michael Jackson', 'Bob Dylan', 'Britney Spears', 'Frida Kahlo', 'Lana Del Rey', 'Audrey Hepburn'],
  ESTP: ['Donald Trump', 'Ernest Hemingway', 'Madonna', 'Jack Nicholson', 'Bruce Willis', 'Angelina Jolie'],
  ESFP: ['Elvis Presley', 'Marilyn Monroe', 'Miley Cyrus', 'Jamie Foxx', 'Will Smith', 'Adele']
};

// Top career suggestions per type (8-10 each with a one-line reason).
const BEST_CAREERS = {
  INTJ: [
    ['Software architect', 'Designs systems top-down; their long-range thinking scales naturally.'],
    ['Strategy consultant', 'Cuts to the core of messy problems and maps the path forward.'],
    ['Investment analyst', 'Patient research and contrarian conviction pay off compounded.'],
    ['Research scientist', 'Independent work, high-leverage ideas, minimal small-talk overhead.'],
    ['Product strategist', 'Sees 3 moves ahead and can sell the vision.'],
    ['Data scientist', 'Comfortable with ambiguity and abstraction; builds models that hold up.'],
    ['Management consultant', 'Systems thinking + executive-level communication.'],
    ['Engineering leader', 'Drives technical direction without needing constant consensus.'],
    ['Policy analyst', 'Structural critique backed by evidence, delivered bluntly.'],
    ['Venture investor (later-stage)', 'Rigorous diligence, long-range conviction, tolerant of solitude.']
  ],
  INTP: [
    ['Research engineer', 'Gets to dig into the "why" of systems without shipping pressure.'],
    ['Theoretical physicist', 'Pure abstraction rewarded; no social performance required.'],
    ['Software engineer', 'Logic puzzles all day, async work, minimal meetings.'],
    ['Economist', 'Model-building and contrarian frameworks — their natural habitat.'],
    ['Academic researcher', 'Freedom to follow an idea down whatever rabbit hole it opens.'],
    ['Data analyst', 'Finds signal in noise; their skepticism is an asset, not a flaw.'],
    ['Mathematician', 'Elegance over pragmatism — a rare job that rewards exactly that.'],
    ['Cryptographer', 'Deep, solo, pattern-heavy; no politics to navigate.'],
    ['Technical writer', 'Translating complex systems into clear prose comes naturally.'],
    ['Machine learning researcher', 'Loves building frameworks; tolerates incomplete data.']
  ],
  ENTJ: [
    ['CEO / founder', 'Built to command resources toward a big goal.'],
    ['Management consultant', 'Turns executive chaos into a crisp 3-year plan.'],
    ['Investment banker', 'Thrives on deal urgency, complex negotiation, and leaderboards.'],
    ['Corporate lawyer', 'Adversarial environment, structured argument, clear wins.'],
    ['Venture capital partner', 'Decisive capital allocation and founder evaluation.'],
    ['Political leader', 'Builds coalitions around a vision and keeps them on task.'],
    ['Military officer', 'Natural at command, logistics, and calm-under-pressure decisions.'],
    ['Operations executive', 'Makes large orgs run on time and on spec.'],
    ['Hedge fund manager', 'Big calls, big consequences, structured analysis.'],
    ['Enterprise sales director', 'Turning strategy into revenue through disciplined execution.']
  ],
  ENTP: [
    ['Startup founder', 'Loves ambiguity, builds something out of nothing, pivots freely.'],
    ['Trial attorney', 'Thinks on their feet and enjoys adversarial framing.'],
    ['Investigative journalist', 'Follows threads others miss and is willing to challenge power.'],
    ['Product manager', 'Sees the 5 things the roadmap is missing and talks teams into them.'],
    ['Venture investor (early stage)', 'Pattern-matches on messy bets others dismiss.'],
    ['Management consultant', 'Generates 10 angles, picks the right two.'],
    ['Creative director', 'Fearless with weird ideas and good at selling them.'],
    ['Tech evangelist', 'Persuasive, quick-witted, loves being on stage.'],
    ['Litigator', 'Debate for a living; reframing is a superpower.'],
    ['Growth marketer', 'Tests faster than anyone, kills dead ideas without ceremony.']
  ],
  INFJ: [
    ['Psychotherapist', 'Reads people accurately and cares about their growth.'],
    ['Novelist / screenwriter', 'Sees emotional patterns most people miss.'],
    ['Nonprofit leader', 'Mission drives everything; aligns people around it.'],
    ['Counselor', 'Deep listening, pattern recognition, calm presence.'],
    ['Professor (humanities)', 'Long-form ideas, mentorship, quiet impact.'],
    ['UX researcher', 'Builds empathy into product through honest qualitative work.'],
    ['Policy strategist', 'Thinks in systems and cares who the system fails.'],
    ['Human rights lawyer', 'Values-driven, detailed work with durable conviction.'],
    ['Organizational psychologist', 'Diagnosing why cultures break and how to fix them.'],
    ['Spiritual or wellness coach', 'Holding space and naming what is wrong aloud.']
  ],
  INFP: [
    ['Poet / novelist', 'Meaning-making is the whole job.'],
    ['Therapist', 'Presence, empathy, and a lack of judgment.'],
    ['UX designer', 'Thinks through the user\u2019s real emotional experience.'],
    ['Social worker', 'Care-driven work where values show up daily.'],
    ['Veterinarian', 'Animals as clients bypass the office politics that drain them.'],
    ['Teacher (K-12 or college)', 'Nurtures individuals and is energized by one-on-one mentoring.'],
    ['Librarian / archivist', 'Quiet, thoughtful, values-preserving.'],
    ['Musician or songwriter', 'Emotional truth is the product.'],
    ['Ghostwriter', 'Channeling someone else\u2019s voice is weirdly easy for them.'],
    ['Art therapist', 'Combines creativity, care, and meaning-making.']
  ],
  ENFJ: [
    ['Executive coach', 'Hears what someone won\u2019t say and helps them say it.'],
    ['Nonprofit founder', 'Builds movements and keeps people aligned to purpose.'],
    ['High-school teacher', 'Knows every student by name and notices who\u2019s struggling.'],
    ['Chief of staff', 'Makes the leader better without asking for credit.'],
    ['HR director', 'Diagnoses people problems and designs the fix.'],
    ['Politician', 'Coalition-builder by default; loves the speech.'],
    ['Therapist', 'Naturally attuned, actively helpful, not afraid of pain.'],
    ['Event director', 'Reads rooms and stitches people together.'],
    ['Community manager', 'Social energy meets follow-through.'],
    ['Sales leader', 'Reads the prospect, closes through genuine rapport.']
  ],
  ENFP: [
    ['Creative director', 'Endless ideas; builds teams that catch fire.'],
    ['Entrepreneur', 'Comfort with chaos and love of the new.'],
    ['Brand strategist', 'Storytelling for a living; sees cultural angles others miss.'],
    ['Teacher (early childhood or college)', 'Energizes a room and cares deeply about students.'],
    ['Journalist', 'Curious about people; writes with personality.'],
    ['UX researcher', 'Loves asking real humans why they did what they did.'],
    ['Talent agent', 'Connector par excellence, reads emotional rooms.'],
    ['Life coach', 'Idea-rich, optimism-heavy, reframes stuck clients.'],
    ['Actor / performer', 'Energy feeds them; audiences feel it back.'],
    ['Marketing lead at a startup', 'Scrappy, fast, empathetic to the customer.']
  ],
  ISTJ: [
    ['Accountant / auditor', 'Rules are the product; precision is the point.'],
    ['Civil engineer', 'Long-term infrastructure that has to work forever.'],
    ['Judge / magistrate', 'Rigorous application of codified norms.'],
    ['Financial analyst', 'Disciplined, model-driven, skeptical of hype.'],
    ['Military officer (logistics)', 'Process, preparation, dependable execution.'],
    ['Compliance officer', 'Loves the rules and catches others breaking them.'],
    ['Supply chain manager', 'Inventory, forecasting, and reliability are home turf.'],
    ['Database administrator', 'Uptime, integrity, procedure \u2014 all handled.'],
    ['Tax attorney', 'The tax code is a ruleset; they enjoy memorizing it.'],
    ['Operations manager', 'Keeps production humming and variance low.']
  ],
  ISFJ: [
    ['Nurse', 'Attentive care, hands-on help, remembers every patient.'],
    ['Pediatrician', 'Quietly warm, endlessly patient, notices small symptoms.'],
    ['Elementary school teacher', 'Creates the stable, caring classroom kids need.'],
    ['Paralegal', 'Meticulous, loyal, keeps the whole practice organized.'],
    ['Librarian', 'Helpful to everyone; keeps a system running smoothly.'],
    ['Occupational therapist', 'Patient, routine-based, person-centered work.'],
    ['Administrative director', 'Runs the operation that lets everyone else shine.'],
    ['Dental hygienist', 'Reliable, gentle, attentive to patients over time.'],
    ['HR generalist', 'Remembers birthdays, handles the hard conversations quietly.'],
    ['Veterinary technician', 'Care-focused work with animals and their people.']
  ],
  ESTJ: [
    ['Operations executive', 'Runs the machine; doesn\u2019t let things slip.'],
    ['General manager', 'P&L ownership, clear decisions, holds people to the plan.'],
    ['Military officer', 'Discipline, hierarchy, mission-first \u2014 their natural habitat.'],
    ['Judge', 'Rule-bound decisions delivered without softness.'],
    ['Hospital administrator', 'Logistics, compliance, and calm-under-pressure.'],
    ['Sales director', 'Quota-driven, process-heavy, results-focused.'],
    ['School principal', 'Runs a tight school with clear expectations.'],
    ['Corporate banker', 'Institutional, conservative, reliable.'],
    ['Police officer / detective', 'Values order; executes procedure.'],
    ['Construction project manager', 'Timeline, budget, accountability \u2014 all of it.']
  ],
  ESFJ: [
    ['Event planner', 'Details for people; makes everyone feel welcome.'],
    ['Hospitality manager', 'Natural host; reads guests and keeps staff happy.'],
    ['Nurse', 'Warm, present, highly reliable.'],
    ['Elementary teacher', 'Creates the warm, structured classroom kids need.'],
    ['HR manager', 'Mediator, organizer, keeper of the culture.'],
    ['Real estate agent', 'Relationship-heavy, service-oriented, closes through trust.'],
    ['Public relations director', 'Maintaining relationships and managing reputation.'],
    ['Wedding planner', 'Service + aesthetics + people orchestration.'],
    ['Customer success lead', 'Client retention through attention and follow-through.'],
    ['Office manager', 'Glue of the company; everyone relies on them.']
  ],
  ISTP: [
    ['Mechanical engineer', 'Hands-on, figures out how to make things actually work.'],
    ['Pilot', 'Calm under pressure, technical precision, real-world stakes.'],
    ['Surgeon', 'Decisive, hands-on, thrives in the moment.'],
    ['Firefighter / EMT', 'Adrenaline + technical skill + little office politics.'],
    ['Detective', 'Observant, patient, puts pieces together.'],
    ['Forensic analyst', 'Evidence-driven, technical, low on BS.'],
    ['Software engineer (systems / embedded)', 'Deep technical work, few meetings.'],
    ['Cybersecurity specialist', 'Pattern-matching + troubleshooting + real threats.'],
    ['Carpenter / master builder', 'Physical craft with high standards.'],
    ['Race car driver / stunt performer', 'Skill, risk, and flow state.']
  ],
  ISFP: [
    ['Graphic designer', 'Visual voice, craft-focused, autonomy-respecting.'],
    ['Photographer', 'Capturing moments; minimal corporate overhead.'],
    ['Musician', 'Emotional expression is the product.'],
    ['Veterinary technician', 'Hands-on care for animals; gentle presence.'],
    ['Chef', 'Craft, sensory work, daily physical rhythm.'],
    ['Interior designer', 'Aesthetic sensibility meets practical problem-solving.'],
    ['Florist', 'Quiet, creative, tactile.'],
    ['Physical therapist', 'Hands-on healing, one-on-one client connection.'],
    ['Tattoo artist', 'Personal art + trusted client relationship.'],
    ['Occupational therapist', 'Patient, adaptive, focuses on practical quality of life.']
  ],
  ESTP: [
    ['Sales rep (field / enterprise)', 'Reads rooms, closes through presence.'],
    ['Paramedic', 'Calm in crisis; thinks on their feet.'],
    ['Trader', 'Fast decisions, real stakes, no ambiguity.'],
    ['Detective', 'Shrewd reader of people and scenes.'],
    ['Athletic coach', 'Sees the game as it unfolds; motivates through direct feedback.'],
    ['Entrepreneur', 'Acts first, refines as they go.'],
    ['Real estate developer', 'Deal-maker with tolerance for risk.'],
    ['Pilot', 'Physical skill + fast decisions + concrete outcomes.'],
    ['Stockbroker', 'Action, competition, leaderboards.'],
    ['Marketing executive', 'Live events, personality-driven campaigns.']
  ],
  ESFP: [
    ['Performer (actor / musician)', 'Natural on stage; feeds off audience energy.'],
    ['Event host / MC', 'Reads the room, keeps the energy up.'],
    ['Hospitality director', 'Makes guests feel seen; great in-person brand.'],
    ['Tour guide', 'Storytelling + social energy + travel.'],
    ['Social media creator', 'Personality-driven content feels effortless.'],
    ['Sales (consumer / retail)', 'Builds rapport on instinct, closes through warmth.'],
    ['Flight attendant', 'Service, travel, personality.'],
    ['Personal trainer', 'Motivational, adaptive, people-focused.'],
    ['Elementary teacher', 'Fun, energetic, warm \u2014 kids adore them.'],
    ['Event planner', 'People-first logistics with flair.']
  ]
};

const WORST_CAREERS = {
  INTJ: [
    ['Customer-facing retail', 'Constant social performance drains them within a week.'],
    ['Cold-call sales', 'Repetitive small-talk with no system to optimize \u2014 their hell.'],
    ['Hospitality / front desk', 'Emotional labor on demand with no payoff.'],
    ['Event coordinator', 'Too many people to manage, too little depth.'],
    ['Social worker (caseload)', 'Emotional weight without systemic leverage wears them down.']
  ],
  INTP: [
    ['Sales (quota-driven)', 'Performance + persuasion with no room to think.'],
    ['Middle management', 'Reporting, meetings, politics \u2014 all the things they avoid.'],
    ['Kindergarten teacher', 'Constant attention demands, no cognitive leverage.'],
    ['Executive assistant', 'Scheduling, errands, and service work drain their focus.'],
    ['Event planner', 'Coordination-heavy, deadline-brutal, thanks-free.']
  ],
  ENTJ: [
    ['Assistant / support roles', 'They cannot tolerate operating below their analytical ceiling.'],
    ['Therapist', 'Clients want presence; ENTJs want to solve and move on.'],
    ['Early childhood teacher', 'Requires patience they don\u2019t often have.'],
    ['Bureaucratic civil service', 'Pace too slow; authority too diffuse.'],
    ['Artisan craft', 'Isolation + slow iteration = restless and miserable.']
  ],
  ENTP: [
    ['Accountant / tax preparer', 'Every day the same, no room to improvise.'],
    ['Operations analyst', 'The process is the job; they hate that.'],
    ['Quality assurance (repetitive)', 'Boredom kicks in fast; they start breaking things on purpose.'],
    ['Clergy (traditional)', 'Doctrine + authority + predictability = friction.'],
    ['Middle management in big corps', 'Too much bureaucracy, too little latitude.']
  ],
  INFJ: [
    ['High-volume sales', 'Transactional, performative, ethically questionable to them.'],
    ['Corporate litigation', 'Adversarial for sport; no redemption arc.'],
    ['Industrial engineering (remote-from-people)', 'They need to see impact on humans.'],
    ['Investment banking (deal desk)', 'Values misalignment + burnout culture.'],
    ['Drill sergeant', 'Unsubtle emotional tools; they recoil.']
  ],
  INFP: [
    ['Corporate sales director', 'Numbers over meaning; chronic cognitive dissonance.'],
    ['Trial attorney', 'Adversarial framing sickens them.'],
    ['Investment banker', 'Pure transactional logic; they feel hollow in a month.'],
    ['Political campaign manager', 'Spin for a living \u2014 violates their core.'],
    ['Debt collector', 'Inflicting distress on people; not survivable.']
  ],
  ENFJ: [
    ['Solo researcher', 'Too much isolation; energy flatlines.'],
    ['Forensic accountant', 'Numbers without people; they wilt.'],
    ['Long-haul trucker', 'Solo + no influence + no growth.'],
    ['QA engineer', 'Repetitive testing with no human narrative.'],
    ['Data entry clerk', 'No relationships, no purpose.']
  ],
  ENFP: [
    ['Accountant', 'Daily repetition kills them by month three.'],
    ['Factory line worker', 'Autonomy zero, novelty zero.'],
    ['Tax attorney', 'Minute detail + permanence + no creative outlet.'],
    ['Chief compliance officer', 'Rules-enforcement is the anti-ENFP.'],
    ['Logistics scheduler', 'Optimization without people; demoralizing.']
  ],
  ISTJ: [
    ['Improv comedian', 'No script, no rules \u2014 nightmare fuel.'],
    ['Creative director at a startup', 'Too much ambiguity, not enough process.'],
    ['Entrepreneur (early stage)', 'Requires tolerance for mess they don\u2019t have.'],
    ['Art therapist', 'Emotional fluidity is foreign territory.'],
    ['Lifestyle influencer', 'Performance + improvisation + no structure.']
  ],
  ISFJ: [
    ['High-conflict litigator', 'Adversarial work leaves them depleted.'],
    ['Investigative journalist (exposing people)', 'Conflict + confrontation feels wrong.'],
    ['Stand-up comedian', 'Public vulnerability on demand; no thanks.'],
    ['Hedge fund analyst', 'Ruthless dispassion required daily.'],
    ['Venture capital partner', 'Saying no constantly drains them.']
  ],
  ESTJ: [
    ['Poet / freelance artist', 'No structure, no KPIs, no reward schedule.'],
    ['Grief counselor', 'Sitting with pain is not their toolkit.'],
    ['UX researcher', 'Ambiguity tolerance required; they pick sides too fast.'],
    ['Therapist', 'Wants to advise, can\u2019t resist fixing.'],
    ['Philosopher', 'Abstraction without deliverables.']
  ],
  ESFJ: [
    ['Long-haul trucker', 'Isolation is their kryptonite.'],
    ['Forensic pathologist', 'No social texture; feels grim.'],
    ['Solo entrepreneur (pre-product-market-fit)', 'Alone with risk is not how they thrive.'],
    ['Research mathematician', 'No people, no emotional texture.'],
    ['Debt collector', 'Inflicting distress is toxic to them.']
  ],
  ESTJ: [
    ['Therapist', 'Wants to advise; struggles to listen without steering.'],
    ['Novelist', 'Indirect, slow, no clear win condition.'],
    ['Poet', 'Abstraction without deliverable bores them.'],
    ['Mediation specialist', 'Hates the patience required for "both sides".'],
    ['Occupational therapist', 'Emotional calibration is tiring for them.']
  ],
  ISTP: [
    ['HR generalist', 'People problems without clear mechanical fixes.'],
    ['Executive coach', 'Long conversations with no tangible output.'],
    ['Event planner', 'Too much coordination, emotional labor, small talk.'],
    ['Fundraiser', 'Asking for money from strangers in nice language.'],
    ['Kindergarten teacher', 'Attention-heavy; drains them fast.']
  ],
  ISFP: [
    ['Corporate lawyer', 'Combative, ethically murky, soul-deadening.'],
    ['Public speaker / trainer', 'Performing on demand for large audiences exhausts them.'],
    ['Call center sales', 'Transactional pressure + repetition.'],
    ['Logistics manager', 'Rigid schedules, no creative outlet.'],
    ['Compliance officer', 'Rule-enforcer role clashes with their authenticity.']
  ],
  ESTP: [
    ['Archivist', 'Slow, solitary, no immediate stakes.'],
    ['Editor (long-form)', 'Patience + solitude + no adrenaline.'],
    ['Philosopher', 'No real-world mechanism; too much theory.'],
    ['Research academic', 'Years per paper; they quit by year one.'],
    ['Proofreader', 'Repetitive, quiet, no competition.']
  ],
  ESFP: [
    ['Research mathematician', 'Solitary abstraction; their worst-case.'],
    ['Long-haul trucker', 'Alone for days \u2014 flatlines their energy.'],
    ['Forensic accountant', 'Silent, structured, no social texture.'],
    ['Archivist', 'Nobody to talk to, nothing in the moment.'],
    ['Compliance officer', 'Pure rule enforcement is the anti-ESFP.']
  ]
};

// ── Helpers ──────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function topCompat(type, n, best) {
  const scores = Object.entries(COMPAT[type]).filter(([t]) => t !== type);
  scores.sort((a, b) => best ? b[1] - a[1] : a[1] - b[1]);
  return scores.slice(0, n).map(([t, s]) => ({ type: t, score: s }));
}

// Canonical alphabetical slug for a pair of types (so INTJ-ENTJ and ENTJ-INTJ map to the same URL).
function pairSlug(t1, t2) {
  const sorted = [t1, t2].sort();
  return sorted[0].toLowerCase() + '-' + sorted[1].toLowerCase();
}

// Closest / most-commonly-confused sibling type for the "difference" FAQ item.
const CLOSEST_TYPE = {
  INTJ: 'ENTJ', INTP: 'INTJ', ENTJ: 'ESTJ', ENTP: 'ENFP',
  INFJ: 'INTJ', INFP: 'INFJ', ENFJ: 'ENFP', ENFP: 'ENTP',
  ISTJ: 'ISFJ', ISFJ: 'ESFJ', ESTJ: 'ISTJ', ESFJ: 'ESFP',
  ISTP: 'INTP', ISFP: 'INFP', ESTP: 'ESFP', ESFP: 'ENFP'
};

// Communication style sentence per type — concrete, not therapy-speak.
const COMMS_STYLE = {
  INTJ: 'Direct, blunt, efficient. Cuts past pleasantries. Speaks in conclusions, not processing out loud.',
  INTP: 'Thinks out loud in caveats. Distinguishes precisely. Gets frustrated when others argue a conclusion without the logic.',
  ENTJ: 'Command voice. States position first. Uses debate as information-gathering, not attack.',
  ENTP: 'Argues for sport. Reframes constantly. Often plays devil\u2019s advocate to stress-test ideas.',
  INFJ: 'Measured, indirect, layered. Names what\u2019s under the surface. Often speaks in metaphor.',
  INFP: 'Values-centered. Struggles to be direct in conflict. Emotional weight comes through in word choice.',
  ENFJ: 'Warm, affirming, and focused on how the room feels. Guides conversations toward shared meaning.',
  ENFP: 'Idea-dense, enthusiastic, jumps tangents. Uses emotional color. Leaves cold analytical framing for others.',
  ISTJ: 'Factual, specific, thorough. Prefers written or structured spoken communication. Not big on small talk.',
  ISFJ: 'Considerate, specific to the listener. Remembers what was said last time. Avoids confrontation unless values are crossed.',
  ESTJ: 'Direct, instruction-oriented. States expectations clearly. Communicates via deadlines and deliverables.',
  ESFJ: 'Warm, checks in often, keeps tone harmonious. Attuned to how others are receiving the message.',
  ISTP: 'Minimal words. Says what needs saying. Information-dense; no filler.',
  ISFP: 'Quiet, understated. Shows more than tells. Prefers action over long verbal processing.',
  ESTP: 'Fast, blunt, irreverent. Often uses humor to move a conversation. No patience for long theory.',
  ESFP: 'Expressive, playful, in-the-moment. Communicates through warmth and tone as much as words.'
};

function faqItems(type) {
  const name = TYPE_NAMES[type];
  const d = TYPE_DESCS[type];
  const bestCareers4 = BEST_CAREERS[type].slice(0, 4).map(c => c[0]).join(', ');
  const bestCareersAll = BEST_CAREERS[type].slice(0, 6).map(c => c[0]).join(', ');
  const worstCareers = WORST_CAREERS[type].slice(0, 3).map(c => c[0]).join(', ');
  const topMatches = topCompat(type, 3, true);
  const topFriction = topCompat(type, 3, false);
  const bestMatchType = topMatches[0].type;
  const bestMatchName = TYPE_NAMES[bestMatchType];
  const worstMatchType = topFriction[0].type;
  const sibling = CLOSEST_TYPE[type];
  const famous3 = FAMOUS[type].slice(0, 3).join(', ');

  return [
    {
      q: `What is the ${type} personality type?`,
      a: `${type} (${name}) is one of the 16 MBTI personality types. ${d.cognitive} At their best, ${type}s are ${d.strengths.toLowerCase()}. ${rarityAnswer(type)}`
    },
    {
      q: `What are the best careers for ${type}s?`,
      a: `The best careers for ${type}s are ${bestCareersAll}. ${type}s thrive when the work rewards ${d.strengths.toLowerCase()} and avoids ${d.drains.toLowerCase()}.`
    },
    {
      q: `What careers should ${type}s avoid?`,
      a: `${type}s should avoid roles like ${worstCareers}. These careers demand what ${type}s are typically drained by: ${d.drains.toLowerCase()} The mismatch usually shows up within a few months as chronic exhaustion or disengagement.`
    },
    {
      q: `Who is the best romantic match for ${type}?`,
      a: `${type}s tend to pair best with ${bestMatchType}s (${bestMatchName}). The pairing works because their cognitive rhythms either mirror or complement each other. Also strong: ${topMatches.slice(1).map(m => m.type).join(' and ')}.`
    },
    {
      q: `Who do ${type}s clash with most?`,
      a: `The most common ${type} clash is with ${worstMatchType}s, followed by ${topFriction.slice(1).map(m => m.type).join(' and ')}. The friction is usually values-based or energy-based \u2014 not insurmountable, but requires more deliberate work than natural pairings.`
    },
    {
      q: `Are ${type}s good leaders?`,
      a: leaderAnswer(type, d)
    },
    {
      q: `How do ${type}s communicate?`,
      a: `${COMMS_STYLE[type]} When stressed, this can shift: ${d.shadow.toLowerCase()}`
    },
    {
      q: `What are the weaknesses of the ${type} personality?`,
      a: `The characteristic ${type} blind spots: ${d.shadow.toLowerCase()} ${type}s are also typically drained by ${d.drains.toLowerCase()}, which compounds over time if they don\u2019t build recovery into their routine.`
    },
    {
      q: `What is the difference between ${type} and ${sibling}?`,
      a: diffAnswer(type, sibling)
    },
    {
      q: `What famous people are ${type}s?`,
      a: `Public figures commonly typed as ${type} include ${famous3}, among others. These are based on widely-cited community typings, not official assessments.`
    }
  ];
}

// Returns a concrete one-paragraph comparison of two sibling types (one letter differs).
function diffAnswer(t1, t2) {
  const n1 = TYPE_NAMES[t1], n2 = TYPE_NAMES[t2];
  const diffs = [];
  for (let i = 0; i < 4; i++) {
    if (t1[i] !== t2[i]) diffs.push(i);
  }
  const labels = {
    0: { 'I/E': 'energy direction', I: 'recharges alone', E: 'recharges with people' },
    1: { 'N/S': 'information processing', N: 'pattern-first / abstract', S: 'detail-first / concrete' },
    2: { 'T/F': 'decision criteria', T: 'logic-first', F: 'values-first' },
    3: { 'J/P': 'lifestyle structure', J: 'closure-seeking / planned', P: 'options-open / adaptive' }
  };
  const parts = diffs.map(i => {
    const c1 = t1[i], c2 = t2[i];
    const axis = ['I/E', 'N/S', 'T/F', 'J/P'][i];
    const domain = labels[i][axis];
    return `${axis} (${domain}) \u2014 ${t1}s are ${labels[i][c1]}, ${t2}s are ${labels[i][c2]}`;
  });
  return `${t1} (${n1}) and ${t2} (${n2}) differ on: ${parts.join('; ')}. In practice, this shows up in how they lead, communicate, and make decisions \u2014 the shared letters keep them similar on surface, but the flipped one changes their underlying wiring.`;
}

function leaderAnswer(type, d) {
  const naturals = new Set(['ENTJ', 'ENFJ', 'ESTJ', 'INTJ']);
  if (naturals.has(type)) {
    return `${type}s are natural leaders. They lead through ${type.startsWith('E') ? 'direct presence and coalition-building' : 'strategic vision and calm conviction'}. Watch their shadow: ${d.shadow.toLowerCase()}`;
  }
  return `${type}s can be effective leaders, but lead differently than stereotypical "executive" archetypes. They lead through their strengths: ${d.strengths.toLowerCase()}. They struggle with the parts of leadership that require: ${d.drains.toLowerCase()}`;
}

function rarityAnswer(type) {
  const rarities = {
    INFJ: 'INFJs are the rarest type, estimated at roughly 1-2% of the population.',
    ENTJ: 'ENTJs are uncommon, roughly 2-4% of the population.',
    INTJ: 'INTJs are rare, roughly 2-4% of the population \u2014 and rarer among women specifically.',
    ENFJ: 'ENFJs are roughly 2-3% of the population.',
    ENTP: 'ENTPs make up around 3-4% of the population.',
    INFP: 'INFPs are roughly 4-5% of the population.',
    INTP: 'INTPs are roughly 3-5% of the population.',
    ESTJ: 'ESTJs are common \u2014 around 8-12% of the population.',
    ISTJ: 'ISTJs are one of the most common types, around 11-14% of the population.',
    ISFJ: 'ISFJs are common, estimated 9-14% of the population.',
    ESFJ: 'ESFJs are common, around 9-13% of the population.',
    ENFP: 'ENFPs are moderately common, around 6-8% of the population.',
    ISTP: 'ISTPs are around 4-6% of the population.',
    ISFP: 'ISFPs are roughly 5-9% of the population.',
    ESTP: 'ESTPs are around 4-6% of the population.',
    ESFP: 'ESFPs are around 8-10% of the population.'
  };
  return rarities[type] || `${type}s are one of the 16 MBTI types.`;
}

function metaDesc(type) {
  const name = TYPE_NAMES[type];
  const d = TYPE_DESCS[type];
  return `${type} (${name}) personality: career fit, strengths, compatibility, and famous examples. ${d.cognitive}`.slice(0, 158);
}

function renderTypePage(type) {
  const name = TYPE_NAMES[type];
  const d = TYPE_DESCS[type];
  const slug = type.toLowerCase() + '-personality';
  const url = 'https://personality.fyi/blog/' + slug;
  const sibling = CLOSEST_TYPE[type];

  // Answer-first lead: one-line summary + bulleted trait list, THEN explanation.
  const leadBullets = [
    `<strong>Cognitive style:</strong> ${d.cognitive}`,
    `<strong>Strengths:</strong> ${d.strengths}.`,
    `<strong>Blind spots:</strong> ${d.shadow}.`,
    `<strong>Energized by:</strong> ${type.startsWith('E') ? 'People, stimulation, external momentum.' : 'Solitude, depth, selective social exposure.'}`,
    `<strong>Drained by:</strong> ${d.drains}.`,
    `<strong>Decision style:</strong> ${type[3] === 'J' ? 'Closure-seeking, planned, moves toward resolution.' : 'Options-open, adaptive, resists premature commitment.'}`
  ];

  const bestCareers = BEST_CAREERS[type];
  const worstCareers = WORST_CAREERS[type];
  const famous = FAMOUS[type];
  const bestMatches = topCompat(type, 3, true);
  const friction = topCompat(type, 3, false);
  const faqs = faqItems(type);

  // Answer-first lead for each section.
  const bestCareersLead = bestCareers.map(c => c[0]).join(', ');
  const worstCareersLead = worstCareers.map(c => c[0]).join(', ');
  const bestMatchesLead = bestMatches.map(m => `${m.type} (${m.score}/100)`).join(', ');
  const frictionLead = friction.map(m => `${m.type} (${m.score}/100)`).join(', ');

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };

  const today = new Date().toISOString().slice(0, 10);
  const typeSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: `${type} Personality Type \u2014 ${name}`,
    description: metaDesc(type),
    url: url,
    datePublished: today,
    dateModified: today,
    author: { '@type': 'Organization', name: 'personality.fyi' },
    publisher: { '@type': 'Organization', name: 'personality.fyi', url: 'https://personality.fyi' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url }
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' },
      { '@type': 'ListItem', position: 3, name: `${type} Personality` }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="kSGxUo6ERTtnEqasUWyRl-w1hHLS3P4lDoFjQuBmSJc" />
<title>${type} Personality: Careers, Strengths &amp; Compatibility | personality.fyi</title>
<meta name="description" content="${esc(metaDesc(type))}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${type} Personality Type \u2014 ${name}">
<meta property="og:description" content="${esc(metaDesc(type))}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Personality.fyi">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${type} Personality \u2014 ${name}">
<meta name="twitter:description" content="${esc(metaDesc(type))}">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
<script type="application/ld+json">${JSON.stringify(typeSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
</head>
<body>
<header class="blog-header">
  <a href="/" class="blog-brand">Personality<span>.fyi</span></a>
  <nav class="blog-nav">
    <a href="/blog">Learn</a>
    <a href="/?tab=alltypes">All Types</a>
    <a href="/">App</a>
  </nav>
</header>

<main class="blog-article">
  <div class="blog-breadcrumb"><a href="/blog">\u2190 All posts</a></div>
  <h1>${type} Personality Type \u2014 ${name}</h1>
  <div class="blog-meta">Published on Personality.fyi \u00B7 ${type} (${name})</div>

  <section>
    <h2>What is the ${type} personality type?</h2>
    <p><strong>${type} (${name}):</strong> ${d.cognitive}</p>
    <ul class="blog-bullets">
      ${leadBullets.map(t => '<li>' + t + '</li>').join('\n      ')}
    </ul>
    <p>At their best, ${type}s are ${d.strengths.toLowerCase()}. At their worst, the same wiring drives the patterns to watch: ${d.shadow.toLowerCase()}</p>
  </section>

  <section>
    <h2>Best Careers for ${type}s</h2>
    <p><strong>Top careers for ${type}s:</strong> ${bestCareersLead}.</p>
    <p>These roles reward ${d.strengths.toLowerCase()} and avoid work that drains them (${d.drains.toLowerCase()}). The fit shows up early: ${type}s in well-matched roles usually find flow within weeks, while misfit roles manifest as chronic fatigue by month three.</p>
    <ol class="blog-careers">
      ${bestCareers.map(c => `<li><strong>${c[0]}</strong> \u2014 ${c[1]}</li>`).join('\n      ')}
    </ol>
    <p>See also: <a href="/blog/best-personality-types-for-software-engineering">best types for software engineering</a>, <a href="/blog/best-personality-types-for-product-management">product management</a>, <a href="/blog/best-personality-types-for-management-consulting">consulting</a>.</p>
  </section>

  <section>
    <h2>Careers ${type}s Should Avoid</h2>
    <p><strong>Worst careers for ${type}s:</strong> ${worstCareersLead}.</p>
    <p>These roles demand exactly what ${type}s find exhausting. The mismatch usually shows up within a few months.</p>
    <ul class="blog-bullets">
      ${worstCareers.map(c => `<li><strong>${c[0]}</strong> \u2014 ${c[1]}</li>`).join('\n      ')}
    </ul>
  </section>

  <section>
    <h2>How ${type}s Communicate</h2>
    <p><strong>${type} communication style:</strong> ${COMMS_STYLE[type]}</p>
    <p>Under stress, this shifts: ${d.shadow.toLowerCase()} People working with ${type}s get the best out of them by matching their pace and avoiding friction triggers: ${d.drains.toLowerCase()}</p>
  </section>

  <section>
    <h2>${type} Compatibility</h2>
    <p><strong>Best matches for ${type}s:</strong> ${bestMatches.map(m => `<a href="/blog/${m.type.toLowerCase()}-personality">${m.type}</a> (${m.score}/100)`).join(', ')}. These pairings share or complement the ${type}'s cognitive rhythm.</p>
    <p><strong>Most friction:</strong> ${friction.map(m => `<a href="/blog/${m.type.toLowerCase()}-personality">${m.type}</a> (${m.score}/100)`).join(', ')}. The clash is usually values-based or energy-based \u2014 not a dealbreaker with self-awareness on both sides.</p>
    <p>Deep dive: <a href="/blog/${pairSlug(type, bestMatches[0].type)}-compatibility">${type} + ${bestMatches[0].type} compatibility</a> \u00B7 <a href="/blog/${pairSlug(type, friction[0].type)}-compatibility">${type} + ${friction[0].type} compatibility</a>.</p>
  </section>

  <section>
    <h2>${type} vs ${sibling}: How to Tell Them Apart</h2>
    <p><strong>Short answer:</strong> ${type} and ${sibling} share most letters but diverge on one. That single flip changes how they lead, decide, and recharge.</p>
    <p>${diffAnswer(type, sibling)}</p>
    <p>Full breakdown: <a href="/blog/${type.toLowerCase()}-vs-${sibling.toLowerCase()}">${type} vs ${sibling} comparison</a>.</p>
  </section>

  <section>
    <h2>Famous ${type}s</h2>
    <p><strong>Public figures commonly typed as ${type}:</strong> ${famous.join(', ')}.</p>
    <p>These typings come from widely-cited community analysis, not official assessments.</p>
  </section>

  <section>
    <h2>Frequently Asked Questions</h2>
    ${faqs.map(f => `<details class="blog-faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>

  <section class="blog-cta">
    <h2>Think you might be an ${type}?</h2>
    <p>Take the 60-second personality test to find out your type, then explore careers, compatibility, and get honest AI-powered analysis.</p>
    <a href="/" class="blog-cta-btn">Find your type \u2192</a>
  </section>
</main>

<footer class="blog-footer">
  <div><a href="/">Personality.fyi</a> \u00B7 <a href="/blog">Learn</a></div>
</footer>
</body>
</html>
`;
}

function renderIndex(types, compatPairs, careerSlugs, comparisonPairs) {
  compatPairs = compatPairs || [];
  careerSlugs = careerSlugs || [];
  comparisonPairs = comparisonPairs || [];

  const posts = types.map(t => {
    const slug = t.toLowerCase() + '-personality';
    const name = TYPE_NAMES[t];
    const excerpt = metaDesc(t);
    return { type: t, name, slug, excerpt };
  });

  // Every article gets a data-types attribute listing all relevant MBTI types
  // (comma-separated). Type pages have 1, compat/comparison have 2, career pages
  // have all best-fit types. Used for the Learn-page client-side filter.
  const postsHtml = posts.map(p => `
    <article class="blog-index-item" data-types="${p.type}" data-section="types">
      <h3><a href="/blog/${p.slug}">${p.type} Personality Type \u2014 ${p.name}</a></h3>
      <p class="blog-index-excerpt">${esc(p.excerpt)}</p>
    </article>
  `).join('\n');

  const compatHtml = compatPairs.map(pair => {
    const slug = pairSlug(pair[0], pair[1]) + '-compatibility';
    const score = COMPAT[pair[0]][pair[1]];
    const tags = [pair[0], pair[1]].join(',');
    return `<article class="blog-index-item" data-types="${tags}" data-section="compat">
      <h3><a href="/blog/${slug}">${pair[0]} and ${pair[1]} Compatibility</a></h3>
      <p class="blog-index-excerpt">${score}/100 \u2014 ${compatTier(score).label}.</p>
    </article>`;
  }).join('\n');

  const careerHtml = careerSlugs.map(slug => {
    const title = CAREER_PAGES[slug].title;
    const bestTypes = CAREER_PAGES[slug].best.map(b => b.type);
    const top = bestTypes.slice(0, 3).join(', ');
    const tags = bestTypes.join(',');
    return `<article class="blog-index-item" data-types="${tags}" data-section="career">
      <h3><a href="/blog/best-personality-types-for-${slug}">Best Personality Types for ${title}</a></h3>
      <p class="blog-index-excerpt">Top types for ${title.toLowerCase()}: ${top}.</p>
    </article>`;
  }).join('\n');

  const compareHtml = comparisonPairs.map(pair => {
    const slug = pair[0].toLowerCase() + '-vs-' + pair[1].toLowerCase();
    const tags = [pair[0], pair[1]].join(',');
    return `<article class="blog-index-item" data-types="${tags}" data-section="compare">
      <h3><a href="/blog/${slug}">${pair[0]} vs ${pair[1]}: Key Differences</a></h3>
      <p class="blog-index-excerpt">How to tell them apart and where they diverge.</p>
    </article>`;
  }).join('\n');

  const indexSchema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Personality.fyi Blog',
    url: 'https://personality.fyi/blog',
    description: 'Deep-dives on the 16 MBTI personality types \u2014 careers, compatibility, strengths, and more.'
  };
  const indexBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog' }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="kSGxUo6ERTtnEqasUWyRl-w1hHLS3P4lDoFjQuBmSJc" />
<title>Learn \u2014 MBTI Type Guides, Careers &amp; Compatibility | personality.fyi</title>
<meta name="description" content="Deep-dives on each of the 16 MBTI personality types. Careers, compatibility, strengths, shadow patterns, and famous examples.">
<link rel="canonical" href="https://personality.fyi/blog">
<meta property="og:type" content="website">
<meta property="og:title" content="Personality.fyi Blog">
<meta property="og:description" content="Deep-dives on each of the 16 MBTI personality types.">
<meta property="og:url" content="https://personality.fyi/blog">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${JSON.stringify(indexSchema)}</script>
<script type="application/ld+json">${JSON.stringify(indexBreadcrumb)}</script>
</head>
<body>
<header class="blog-header">
  <a href="/" class="blog-brand">Personality<span>.fyi</span></a>
  <nav class="blog-nav">
    <a href="/blog" class="active">Blog</a>
    <a href="/">App</a>
  </nav>
</header>

<main class="blog-article">
  <div class="learn-header">
    <h1 id="learn-h1">Learn</h1>
    <button id="learn-toggle" class="learn-toggle-btn" onclick="learnToggleGrid()">See all types</button>
  </div>
  <p class="blog-intro" id="learn-intro">Honest, specific guides to the 16 MBTI personality types, compatibility, and careers.</p>

  <div id="learn-grid-wrap" style="display:none" class="learn-grid-wrap">
    <div class="learn-grid-label">Filter by type</div>
    <div class="learn-grid" id="learn-grid"></div>
  </div>

  <div id="learn-reset" style="display:none" class="learn-reset">
    <button onclick="learnResetToMine()">\u2190 Back to my type</button>
  </div>

  <h2 class="blog-section-h" data-section-h="types">Type Guides</h2>
  <div class="blog-index-list" id="blog-list" data-section-list="types">
    ${postsHtml}
  </div>

  <h2 class="blog-section-h" data-section-h="compat" style="margin-top:3rem">Compatibility Guides</h2>
  <div class="blog-index-list" data-section-list="compat">
    ${compatHtml}
  </div>

  <h2 class="blog-section-h" data-section-h="career" style="margin-top:3rem">Career Guides</h2>
  <div class="blog-index-list" data-section-list="career">
    ${careerHtml}
  </div>

  <h2 class="blog-section-h" data-section-h="compare" style="margin-top:3rem">Type Comparisons</h2>
  <div class="blog-index-list" data-section-list="compare">
    ${compareHtml}
  </div>

  <div id="learn-empty" style="display:none" class="learn-empty">
    No articles yet for this type. Check back soon.
  </div>
</main>

<script>
// ── Learn page personalization + filtering ────────────────────────
// When logged in with a saved type, default to showing only that type's articles.
// The "See all types" button reveals a 16-type grid for filtering by any type.
(function() {
  var ALL_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'];
  var TYPE_NAMES = ${JSON.stringify(TYPE_NAMES)};

  var myType = null;
  var activeFilter = null; // null = show all; otherwise a 4-letter type code

  function getMyType() {
    try { return localStorage.getItem('typeread_selected_type'); } catch(e) { return null; }
  }

  function buildGrid() {
    var grid = document.getElementById('learn-grid');
    if (!grid || grid.children.length) return;
    ALL_TYPES.forEach(function(t) {
      var btn = document.createElement('button');
      btn.className = 'learn-grid-btn';
      if (t === myType) btn.classList.add('learn-grid-btn-mine');
      btn.dataset.type = t;
      btn.onclick = function() { applyFilter(t); };
      btn.innerHTML = '<span class="learn-grid-code">' + t + '</span>' +
        '<span class="learn-grid-name">' + (TYPE_NAMES[t] ? TYPE_NAMES[t].replace(/^The\\s+/, '') : '') + '</span>' +
        (t === myType ? '<span class="learn-grid-you">Your type</span>' : '');
      grid.appendChild(btn);
    });
  }

  function applyFilter(type) {
    activeFilter = type;
    var h1 = document.getElementById('learn-h1');
    var intro = document.getElementById('learn-intro');
    var reset = document.getElementById('learn-reset');
    var toggle = document.getElementById('learn-toggle');

    if (type) {
      h1.textContent = 'Learn about ' + type;
      intro.textContent = 'Articles relevant to ' + type + ' (' + (TYPE_NAMES[type] || '') + ').';
    } else {
      h1.textContent = 'Learn';
      intro.textContent = 'Honest, specific guides to the 16 MBTI personality types, compatibility, and careers.';
    }

    // Show "Back to my type" only when viewing a type other than the user's own
    if (myType && type && type !== myType) {
      reset.style.display = 'block';
    } else {
      reset.style.display = 'none';
    }

    // Filter articles
    var items = document.querySelectorAll('.blog-index-item');
    var sectionCounts = { types: 0, compat: 0, career: 0, compare: 0 };
    items.forEach(function(item) {
      var tags = (item.dataset.types || '').split(',');
      var section = item.dataset.section;
      var match = !type || tags.indexOf(type) !== -1;
      item.style.display = match ? '' : 'none';
      if (match) sectionCounts[section] = (sectionCounts[section] || 0) + 1;
    });

    // Hide empty section headings + lists
    ['types','compat','career','compare'].forEach(function(s) {
      var h = document.querySelector('[data-section-h="' + s + '"]');
      var list = document.querySelector('[data-section-list="' + s + '"]');
      var visible = sectionCounts[s] > 0;
      if (h) h.style.display = visible ? '' : 'none';
      if (list) list.style.display = visible ? '' : 'none';
    });

    // Empty-state check
    var totalVisible = Object.keys(sectionCounts).reduce(function(a, k) { return a + sectionCounts[k]; }, 0);
    document.getElementById('learn-empty').style.display = totalVisible === 0 ? 'block' : 'none';

    // Highlight active in grid
    document.querySelectorAll('.learn-grid-btn').forEach(function(b) {
      b.classList.toggle('learn-grid-btn-active', b.dataset.type === type);
    });

    // Update toggle button label
    if (type && type !== myType) {
      toggle.textContent = 'Change filter';
    } else if (myType) {
      toggle.textContent = 'See all types';
    } else {
      toggle.textContent = 'Filter by type';
    }
  }

  window.learnToggleGrid = function() {
    var wrap = document.getElementById('learn-grid-wrap');
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    buildGrid();
  };

  window.learnResetToMine = function() {
    if (!myType) return;
    applyFilter(myType);
    var wrap = document.getElementById('learn-grid-wrap');
    if (wrap) wrap.style.display = 'none';
  };

  // Initialize on page load
  myType = getMyType();
  if (myType) {
    applyFilter(myType);
  }
  // else: leave everything visible (logged-out default)
})();
</script>

<footer class="blog-footer">
  <div><a href="/">Personality.fyi</a> \u00B7 <a href="/blog">Learn</a></div>
</footer>
</body>
</html>
`;
}

function renderCss() {
  return `:root {
  --ink: #0e0e0e;
  --paper: #f5f2ed;
  --cream: #ede9e1;
  --accent: #c8411a;
  --accent-light: #f5e8e3;
  --muted: #7a7670;
  --border: #d4cfc7;
  --card: #ffffff;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'DM Mono', monospace;
  background: var(--paper);
  color: var(--ink);
  line-height: 1.7;
  font-size: 15px;
}
a { color: var(--accent); text-decoration: underline; }
a:hover { text-decoration: none; }

.blog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 2rem;
  border-bottom: 0.5px solid var(--border);
  max-width: 820px;
  margin: 0 auto;
}
.blog-brand {
  font-family: 'DM Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
}
.blog-brand span { color: var(--accent); }
.blog-nav a {
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
  margin-left: 1.25rem;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.blog-nav a:hover, .blog-nav a.active { color: var(--ink); }

.blog-article {
  max-width: 720px;
  margin: 2.5rem auto;
  padding: 0 2rem;
}
.blog-breadcrumb {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: .04em;
  text-transform: uppercase;
  margin-bottom: 1rem;
}
.blog-breadcrumb a { color: var(--muted); text-decoration: none; }
.blog-breadcrumb a:hover { color: var(--ink); }

h1 {
  font-family: 'DM Mono', monospace;
  font-size: 36px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 0.75rem;
}
.blog-meta {
  font-size: 13px;
  color: var(--muted);
  letter-spacing: .03em;
  margin-bottom: 2.5rem;
}
h2 {
  font-family: 'DM Mono', monospace;
  font-size: 22px;
  font-weight: 700;
  margin: 2.5rem 0 1rem;
  color: var(--ink);
}
section { margin-bottom: 1rem; }
p { margin-bottom: 1rem; }

.blog-bullets { margin: 0 0 1rem 1.25rem; }
.blog-bullets li { margin-bottom: 0.5rem; }

.blog-careers { margin: 0 0 1rem 1.5rem; }
.blog-careers li { margin-bottom: 0.75rem; padding-left: 0.25rem; }

.blog-faq {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
  background: var(--card);
}
.blog-faq summary {
  cursor: pointer;
  font-weight: 500;
  color: var(--ink);
  list-style: none;
}
.blog-faq summary::-webkit-details-marker { display: none; }
.blog-faq summary::after { content: ' +'; color: var(--muted); float: right; }
.blog-faq[open] summary::after { content: ' \u2212'; }
.blog-faq p { margin-top: 0.75rem; color: var(--ink); }

.blog-cta {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2rem;
  margin: 3rem 0 2rem;
  text-align: center;
}
.blog-cta h2 { margin-top: 0; }
.blog-cta-btn {
  display: inline-block;
  margin-top: 1rem;
  padding: 14px 28px;
  background: var(--ink);
  color: var(--paper);
  text-decoration: none;
  border-radius: 6px;
  font-family: 'DM Mono', monospace;
  font-size: 14px;
  font-weight: 500;
}
.blog-cta-btn:hover { background: var(--accent); color: var(--paper); text-decoration: none; }

.blog-intro {
  font-size: 16px;
  color: var(--muted);
  margin-bottom: 2rem;
  line-height: 1.7;
}
.blog-index-list { display: flex; flex-direction: column; gap: 1.5rem; }
.blog-index-item {
  border-bottom: 0.5px solid var(--border);
  padding-bottom: 1.5rem;
}
.blog-index-item:last-child { border-bottom: none; }
.blog-index-item h2 {
  font-size: 20px;
  margin: 0 0 0.5rem;
}
.blog-index-item h2 a { color: var(--ink); text-decoration: none; }
.blog-index-item h2 a:hover { color: var(--accent); }
.blog-index-excerpt { font-size: 14px; color: var(--muted); line-height: 1.6; }
.blog-index-featured {
  border: 2px solid var(--accent) !important;
  background: var(--card);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
}
.blog-index-featured h2 a { color: var(--accent); }

.blog-section-h {
  font-family: 'DM Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: .02em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
  margin: 2rem 0 1rem;
}

.blog-compare {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 14px;
}
.blog-compare th, .blog-compare td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
  line-height: 1.6;
}
.blog-compare thead th {
  background: var(--cream);
  font-size: 13px;
  letter-spacing: .02em;
  text-transform: uppercase;
  color: var(--ink);
}
.blog-compare tbody th {
  font-weight: 600;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: .03em;
  text-transform: uppercase;
  width: 22%;
}
.blog-compare td { color: var(--ink); }
@media (max-width: 640px) {
  .blog-compare th, .blog-compare td { padding: 8px 10px; font-size: 13px; }
}

/* ── Learn page: filter header, toggle, 16-type grid ── */
.learn-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
.learn-toggle-btn {
  font-family: 'DM Mono', monospace;
  font-size: 13px;
  letter-spacing: .03em;
  text-transform: uppercase;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.learn-toggle-btn:hover { color: var(--ink); border-color: var(--ink); }

.learn-grid-wrap {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1.25rem;
  margin: 1rem 0 2rem;
}
.learn-grid-label {
  font-size: 12px;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 0.75rem;
}
.learn-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
@media (max-width: 640px) {
  .learn-grid { grid-template-columns: repeat(2, 1fr); }
}
.learn-grid-btn {
  font-family: 'DM Mono', monospace;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--cream);
  cursor: pointer;
  transition: all .15s;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}
.learn-grid-btn:hover { border-color: var(--ink); background: var(--paper); }
.learn-grid-btn-active {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
.learn-grid-btn-active .learn-grid-name { color: #a8a4a0; }
.learn-grid-btn-mine {
  border: 2px solid var(--accent);
}
.learn-grid-code {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}
.learn-grid-btn-active .learn-grid-code { color: var(--paper); }
.learn-grid-name {
  font-size: 11px;
  color: var(--muted);
}
.learn-grid-you {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 9px;
  letter-spacing: .08em;
  text-transform: uppercase;
  background: var(--accent);
  color: var(--paper);
  padding: 1px 5px;
  border-radius: 8px;
  font-weight: 500;
}

.learn-reset {
  margin-bottom: 1.5rem;
}
.learn-reset button {
  font-family: 'DM Mono', monospace;
  font-size: 13px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.learn-reset button:hover { text-decoration: none; }

.learn-empty {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
  background: var(--card);
  border: 1px dashed var(--border);
  border-radius: 6px;
}

/* Article list: h3 styling (used to be h2) */
.blog-index-item h3 {
  font-family: 'DM Mono', monospace;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 0.5rem;
  line-height: 1.3;
}
.blog-index-item h3 a { color: var(--ink); text-decoration: none; }
.blog-index-item h3 a:hover { color: var(--accent); }

.blog-footer {
  max-width: 820px;
  margin: 4rem auto 2rem;
  padding: 2rem;
  border-top: 0.5px solid var(--border);
  font-size: 13px;
  color: var(--muted);
  letter-spacing: .03em;
}
.blog-footer a { color: var(--muted); text-decoration: none; }
.blog-footer a:hover { color: var(--ink); }

@media (max-width: 640px) {
  .blog-header { padding: 1rem; }
  .blog-article { padding: 0 1.25rem; margin: 1.5rem auto; }
  h1 { font-size: 28px; }
  h2 { font-size: 20px; }
}
`;
}

// ── New page types: Compatibility, Career, Comparison ────────────

// Shared HTML chrome for every secondary blog page.
function renderBlogShell(opts) {
  // opts: { title, description, canonicalUrl, h1, breadcrumb, schemas, body }
  const schemaTags = opts.schemas.map(s =>
    '<script type="application/ld+json">' + JSON.stringify(s) + '</script>'
  ).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="kSGxUo6ERTtnEqasUWyRl-w1hHLS3P4lDoFjQuBmSJc" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${opts.canonicalUrl}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(opts.h1)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${opts.canonicalUrl}">
<meta property="og:site_name" content="Personality.fyi">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(opts.h1)}">
<meta name="twitter:description" content="${esc(opts.description)}">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
${schemaTags}
</head>
<body>
<header class="blog-header">
  <a href="/" class="blog-brand">Personality<span>.fyi</span></a>
  <nav class="blog-nav">
    <a href="/blog">Learn</a>
    <a href="/?tab=alltypes">All Types</a>
    <a href="/">App</a>
  </nav>
</header>

<main class="blog-article">
  <div class="blog-breadcrumb"><a href="/blog">\u2190 All posts</a></div>
  <h1>${opts.h1}</h1>
  <div class="blog-meta">${opts.metaLine || 'Published on Personality.fyi'}</div>
  ${opts.body}
</main>

<footer class="blog-footer">
  <div><a href="/">Personality.fyi</a> \u00B7 <a href="/blog">Learn</a></div>
</footer>
</body>
</html>
`;
}

// ── Compatibility pages ──────────────────────────────────────────

function compatTier(score) {
  if (score >= 80) return { word: 'strong', label: 'a strong natural pairing' };
  if (score >= 65) return { word: 'good', label: 'a workable pairing' };
  if (score >= 50) return { word: 'mixed', label: 'a mixed-fit pairing' };
  return { word: 'friction', label: 'a high-friction pairing' };
}

function renderCompatPage(t1, t2) {
  const n1 = TYPE_NAMES[t1], n2 = TYPE_NAMES[t2];
  const d1 = TYPE_DESCS[t1], d2 = TYPE_DESCS[t2];
  const score = COMPAT[t1][t2];
  const tier = compatTier(score);
  const slug = pairSlug(t1, t2) + '-compatibility';
  const url = 'https://personality.fyi/blog/' + slug;
  const isStrong = score >= 70;
  const sameType = t1 === t2;

  const verdict = sameType
    ? `Two ${t1}s together score ${score}/100. Same-type pairings run smoothly at the surface \u2014 shared language, shared cognitive rhythm \u2014 but can amplify each other's blind spots instead of counterbalancing them.`
    : isStrong
    ? `${t1}s and ${t2}s are ${tier.label} (${score}/100). They complement each other's cognitive functions and rarely generate chronic friction.`
    : `${t1}s and ${t2}s are ${tier.label} (${score}/100). The clash is usually ${score < 50 ? 'values-based or energy-based' : 'style-based'} \u2014 workable with deliberate effort, exhausting without it.`;

  const strengths = sameType ? [
    `Instant rapport and shared cognitive language \u2014 neither has to translate.`,
    `Common values and priorities; fewer "why are you like this" moments.`,
    `When both are at their best, they reinforce each other's ${d1.strengths.toLowerCase().split(',')[0]}.`,
    `Low friction on day-to-day coordination and decision style.`
  ] : isStrong ? [
    `Shared or complementary cognitive rhythm \u2014 ${t1}s' ${d1.strengths.toLowerCase()} meshes with ${t2}s' ${d2.strengths.toLowerCase()}.`,
    `Lower coordination cost: both types generally read each other's signals without translation.`,
    `Each type's blind spots tend to be covered by the other's strengths, so joint decisions are usually stronger than either alone.`,
    `When conflict appears, it is typically situational rather than structural \u2014 easier to repair.`
  ] : [
    `Their differences force each other to grow \u2014 neither gets to stay in their comfort zone.`,
    `On a project where tasks split along the axis where they differ (e.g. planning vs execution), they can out-perform same-type pairs.`,
    `The friction tends to surface issues early rather than hide them.`,
    `With explicit norms (meeting cadence, decision ownership), the pair can be durable.`
  ];

  const frictions = sameType ? [
    `Shared blind spots amplify: ${d1.shadow.toLowerCase()} \u2014 neither will catch the other doing it.`,
    `Shared sensitivities to ${d1.drains.toLowerCase()} \u2014 when both are drained at the same time, no one holds the room.`,
    `Group dynamics get lopsided: two ${t1}s can drift into an echo chamber without realizing.`,
    `When things go sideways, both default to the same shadow behavior, compounding the problem.`
  ] : isStrong ? [
    `Overlap zones: when they're too similar, neither compensates for the other's blind spots.`,
    `Both may reinforce each other's patterns rather than challenge them \u2014 e.g. both avoiding a hard conversation.`,
    `In group settings, they can read as a closed unit and miss other perspectives.`,
    `Compatibility doesn't eliminate effort: good pairings still require communication when values diverge.`
  ] : [
    `Opposing energy: ${t1}s want ${d1.drains.toLowerCase().split(',')[0]} minimized; ${t2}s want ${d2.drains.toLowerCase().split(',')[0]} minimized \u2014 these often conflict.`,
    `Decision-making styles diverge: ${t1[2] === 'T' ? 'logic-first' : 'values-first'} vs ${t2[2] === 'T' ? 'logic-first' : 'values-first'}. Both feel unheard by default.`,
    `Lifestyle structure differs: ${t1[3] === 'J' ? 'closure-seeking' : 'options-open'} vs ${t2[3] === 'J' ? 'closure-seeking' : 'options-open'}. Daily planning becomes a negotiation.`,
    `Under stress, ${t1}s default to "${d1.shadow.toLowerCase().split(',')[0]}" while ${t2}s default to "${d2.shadow.toLowerCase().split(',')[0]}" \u2014 neither response lands well.`
  ];

  const workplace = sameType
    ? `<strong>As coworkers:</strong> Two ${t1}s can sprint together but risk tunnel vision. Bring in a contrasting type for any big decision. <strong>As manager/report:</strong> The manager understands the report intuitively \u2014 which is both a shortcut and a trap. Without deliberate feedback, same-type dynamics can drift into unspoken assumptions.`
    : isStrong
    ? `<strong>As coworkers:</strong> Split the work along their strengths and the output is typically better than sum-of-parts. <strong>As manager/report:</strong> Either direction works. The manager gets honest pushback; the report gets clear expectations.`
    : `<strong>As coworkers:</strong> Works best when roles are clearly separated and the axis they differ on doesn't force daily negotiation. <strong>As manager/report:</strong> The ${t1[0] === 'E' ? t1 : t2} generally leads more naturally. The report needs explicit norms about communication cadence.`;

  const romance = sameType
    ? `Romantically, two ${t1}s understand each other without translation, which is its own kind of intimacy. The risk is that nobody ever challenges the shared worldview \u2014 ${t1}s in long-term same-type relationships should actively seek outside perspective to avoid an echo chamber.`
    : isStrong
    ? `Romantically, this is a pairing that tends to deepen over time rather than flame out. The cognitive rhythm means fewer "lost in translation" moments, though neither type is exempt from the usual relationship maintenance.`
    : `Romantically, this pairing either forces real growth or quietly wears people down. The difference is whether both partners are willing to name the friction out loud. If they are, the relationship can thrive; if they aren't, it drifts.`;

  const tips = sameType ? [
    `Deliberately surround yourselves with other types \u2014 don't become a two-person echo chamber.`,
    `Watch for shared blind spots. Ask a trusted outsider to gut-check major decisions.`,
    `Don't mistake shared worldview for shared values \u2014 check in explicitly.`,
    `Play to your type's opposite-direction growth edge: force yourselves to practice what ${t1}s typically avoid.`
  ] : isStrong ? [
    `Don't confuse easy for effortless. Check in on the basics even when nothing is wrong.`,
    `Use your complementary strengths on high-stakes decisions \u2014 talk it through rather than assume alignment.`,
    `Watch for groupthink: your similarity can turn into an echo chamber.`,
    `Keep introducing new inputs \u2014 books, people, projects \u2014 so you each keep growing.`
  ] : [
    `Name the difference explicitly rather than pretending it's not there.`,
    `Split ownership cleanly on the axis where you disagree (e.g. one owns the plan, one owns the execution).`,
    `When you clash, assume style difference before assuming bad intent.`,
    `Agree on repair scripts in advance \u2014 what each of you needs after a tough conversation.`
  ];

  const faqs = [
    {
      q: `Are ${t1} and ${t2} compatible?`,
      a: isStrong
        ? `Yes. ${t1} and ${t2} score ${score}/100, which puts them in the top tier of MBTI pairings. The pairing works because ${t1}s' ${d1.strengths.toLowerCase().split(',')[0]} complements ${t2}s' ${d2.strengths.toLowerCase().split(',')[0]}.`
        : `It's complicated. ${t1} and ${t2} score ${score}/100. The relationship is workable with deliberate effort but not one of the naturally easy pairings. Both types need to name the friction rather than hope it resolves on its own.`
    },
    {
      q: `Do ${t1}s and ${t2}s make good couples?`,
      a: isStrong
        ? `Yes. This pairing is often listed among the strongest romantic matches in MBTI. They tend to deepen together over years rather than plateau.`
        : `They can, but it requires more explicit communication than naturally compatible pairs. The couples who thrive treat the differences as features, not flaws.`
    },
    {
      q: `Can ${t1} and ${t2} work together professionally?`,
      a: `${t1} and ${t2} can work well together when roles are clearly defined. ${isStrong ? 'Because their cognitive rhythm is aligned, coordination cost stays low.' : 'Because they differ on key dimensions, ambiguous roles create ongoing friction. Clear ownership helps.'}`
    },
    {
      q: `Where do ${t1}s and ${t2}s clash most?`,
      a: `The most common friction points: ${frictions.slice(0, 2).map(f => f.replace(/^([^:]+:\s*)?/, '')).join(' And: ').toLowerCase()}`
    }
  ];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' },
      { '@type': 'ListItem', position: 3, name: `${t1} and ${t2} Compatibility` }
    ]
  };
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
  const today2 = new Date().toISOString().slice(0, 10);
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: `${t1} and ${t2} Compatibility`,
    description: `${t1} and ${t2} compatibility: ${tier.label} (${score}/100). Strengths, friction points, workplace and romantic dynamics.`,
    url: url,
    datePublished: today2,
    dateModified: today2,
    author: { '@type': 'Organization', name: 'personality.fyi' },
    publisher: { '@type': 'Organization', name: 'personality.fyi', url: 'https://personality.fyi' }
  };

  const body = `
  <section>
    <h2>Verdict</h2>
    <p>${verdict}</p>
  </section>

  <section>
    <h2>Strengths of the ${t1} + ${t2} pairing</h2>
    <p><strong>Top strength:</strong> ${strengths[0]}</p>
    <ul class="blog-bullets">
      ${strengths.slice(1).map(s => '<li>' + s + '</li>').join('\n      ')}
    </ul>
  </section>

  <section>
    <h2>Friction points</h2>
    <p><strong>Primary friction:</strong> ${frictions[0]}</p>
    <ul class="blog-bullets">
      ${frictions.slice(1).map(s => '<li>' + s + '</li>').join('\n      ')}
    </ul>
  </section>

  <section>
    <h2>In the workplace</h2>
    <p>${workplace}</p>
  </section>

  <section>
    <h2>In relationships</h2>
    <p>${romance}</p>
  </section>

  <section>
    <h2>Tips for making it work</h2>
    <ul class="blog-bullets">
      ${tips.map(t => '<li>' + t + '</li>').join('\n      ')}
    </ul>
  </section>

  <section>
    <h2>Frequently Asked Questions</h2>
    ${faqs.map(f => `<details class="blog-faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>

  <section class="blog-cta">
    <h2>See each type in depth</h2>
    <p>Dive into the full profiles: <a href="/blog/${t1.toLowerCase()}-personality">${t1} \u2014 ${n1}</a> and <a href="/blog/${t2.toLowerCase()}-personality">${t2} \u2014 ${n2}</a>.</p>
    <a href="/?tab=compat" class="blog-cta-btn">Try the compatibility tool \u2192</a>
  </section>`;

  return renderBlogShell({
    title: `${t1} and ${t2} Compatibility: ${tier.label} (${score}/100) | personality.fyi`,
    description: `${t1} + ${t2} compatibility (${score}/100). Strengths, friction, workplace + romantic dynamics, and tips. Based on MBTI cognitive function analysis.`.slice(0, 158),
    canonicalUrl: url,
    h1: `${t1} and ${t2} Compatibility`,
    metaLine: `${t1} (${n1}) + ${t2} (${n2}) \u00B7 ${score}/100`,
    schemas: [breadcrumb, faqSchema, articleSchema],
    body: body
  });
}

// ── Career-by-type pages ─────────────────────────────────────────
const CAREER_PAGES = {
  'software-engineering': {
    title: 'Software Engineering',
    best: [
      { type: 'INTJ', why: 'Systems-first thinking and independent focus match the core demands of long-horizon engineering.' },
      { type: 'INTP', why: 'Loves the puzzle. Happy debugging edge cases for hours without needing external validation.' },
      { type: 'ISTJ', why: 'Methodical, detail-obsessed, and allergic to shortcuts \u2014 the reliability type.' },
      { type: 'ISTP', why: 'Hands-on troubleshooting and low ceremony. Thrives on systems + embedded work.' },
      { type: 'ENTP', why: 'Generative and fast. Best at greenfield projects and startup-level ambiguity.' }
    ],
    struggle: [
      { type: 'ESFP', why: 'Too much solitary abstraction, not enough real-time human feedback.' },
      { type: 'ENFJ', why: 'The people-energy deficit is noticeable within months. Better in technical leadership roles.' },
      { type: 'ESFJ', why: 'Repetitive solo work without social texture wears them down fast.' }
    ]
  },
  'product-management': {
    title: 'Product Management',
    best: [
      { type: 'ENTJ', why: 'Decisive, strategic, comfortable with ambiguity. Drives teams toward outcomes.' },
      { type: 'ENTP', why: 'Generative on roadmap ideas and persuasive in cross-functional conversations.' },
      { type: 'INTJ', why: 'Long-horizon product thinking \u2014 3 moves ahead of the current roadmap.' },
      { type: 'ENFJ', why: 'People-first PM style. Great at aligning engineering, design, and leadership.' },
      { type: 'ENFP', why: 'Customer-obsessed and high-energy. Strong at 0-to-1 discovery and early adoption.' }
    ],
    struggle: [
      { type: 'ISTP', why: 'Prefers doing over coordinating \u2014 the meeting volume alone drains them.' },
      { type: 'ISFP', why: 'Dislikes the political negotiation built into cross-functional PM work.' },
      { type: 'INTP', why: 'Too many stakeholder conversations, not enough depth \u2014 usually better in principal engineer roles.' }
    ]
  },
  'data-science': {
    title: 'Data Science',
    best: [
      { type: 'INTP', why: 'Model-building is native behavior. Comfortable with ambiguous problems and incomplete data.' },
      { type: 'INTJ', why: 'Pairs statistical rigor with strategic framing. Builds decisions, not just dashboards.' },
      { type: 'ISTJ', why: 'Disciplined, skeptical, detail-driven \u2014 the reliability backbone of any data team.' },
      { type: 'ISTP', why: 'Hands-on, pragmatic, enjoys debugging pipelines and squeezing signal from noise.' },
      { type: 'ENTP', why: 'Strong at experimental design and contrarian framing of business problems.' }
    ],
    struggle: [
      { type: 'ESFP', why: 'Too much quiet analysis, not enough live performance/interaction.' },
      { type: 'ENFJ', why: 'People-energy not rewarded here. Better in analytics-PM roles with stakeholder interface.' },
      { type: 'ESFJ', why: 'Work is too solitary; social muscles atrophy fast.' }
    ]
  },
  'management-consulting': {
    title: 'Management Consulting',
    best: [
      { type: 'ENTJ', why: 'Executive-level communication + structured argument. Natural partner track.' },
      { type: 'ENTP', why: 'Reframing, persuasion, generative analysis \u2014 what strategy work rewards.' },
      { type: 'INTJ', why: 'Strategy thinking at the partner level; needs to tolerate client-facing demands.' },
      { type: 'INTP', why: 'Frameworks and diagnostics are their sweet spot; weaker on presentation polish.' },
      { type: 'ESTJ', why: 'Runs the project, enforces the timeline, ships the deliverable.' }
    ],
    struggle: [
      { type: 'ISFP', why: 'The performative and political aspects conflict with their authenticity orientation.' },
      { type: 'ESFP', why: 'Long analytical cycles without real-time feedback drain them.' },
      { type: 'INFP', why: 'The values misalignment on some engagements is chronic cognitive dissonance.' }
    ]
  },
  'sales': {
    title: 'Sales',
    best: [
      { type: 'ESTP', why: 'Reads the room, closes through presence, thrives on leaderboards.' },
      { type: 'ENTJ', why: 'Enterprise/field sales leadership \u2014 strategic account management and command presence.' },
      { type: 'ENFJ', why: 'Relationship-first selling through genuine rapport \u2014 the high-touch B2B type.' },
      { type: 'ENFP', why: 'High-energy, storytelling, natural connector \u2014 great at startup sales and BD.' },
      { type: 'ESFJ', why: 'Warm, service-oriented, remembers every client detail \u2014 the retention expert.' }
    ],
    struggle: [
      { type: 'INTJ', why: 'Sales performance language grates; better in solutions architect / technical sales roles.' },
      { type: 'INTP', why: 'Quota pressure and repetitive persuasion kills their flow.' },
      { type: 'INFP', why: 'The transactional frame conflicts with their values if the product isn\u2019t mission-fit.' }
    ]
  },
  'marketing': {
    title: 'Marketing',
    best: [
      { type: 'ENFP', why: 'Storytelling + cultural instinct + energy \u2014 the brand marketer archetype.' },
      { type: 'ENTP', why: 'Positioning, reframing, and viral angles are their native moves.' },
      { type: 'ENTJ', why: 'Runs marketing like a revenue machine \u2014 strategy + ops + accountability.' },
      { type: 'INTJ', why: 'Performance marketing, strategic brand architecture \u2014 the serious end of the discipline.' },
      { type: 'ENFJ', why: 'Community marketing and narrative building around a mission.' }
    ],
    struggle: [
      { type: 'ISTJ', why: 'Creative ambiguity and trend-chasing conflict with their process orientation.' },
      { type: 'ISTP', why: 'Too much coordination + aesthetic work \u2014 better suited to growth engineering.' },
      { type: 'ISFJ', why: 'High-visibility brand work stresses them; better in ops-style marketing roles.' }
    ]
  },
  'nursing': {
    title: 'Nursing and Healthcare',
    best: [
      { type: 'ISFJ', why: 'Attentive care, steadiness, remembers every patient \u2014 the archetype.' },
      { type: 'ESFJ', why: 'Warm, service-oriented, organized \u2014 makes a ward run smoothly.' },
      { type: 'INFJ', why: 'Deep patient empathy; often gravitates to hospice, psych, or pediatric oncology.' },
      { type: 'ENFJ', why: 'Natural caregivers who also mentor other staff \u2014 lead nurse material.' },
      { type: 'ISTP', why: 'ER, trauma, and surgical nursing \u2014 calm in crisis, technical precision.' }
    ],
    struggle: [
      { type: 'INTJ', why: 'The repetitive interpersonal labor drains them; better in health-systems strategy.' },
      { type: 'ENTP', why: 'The process rigidity and hierarchy chafe; better suited to health-tech innovation.' }
    ]
  },
  'teaching': {
    title: 'Teaching',
    best: [
      { type: 'ENFJ', why: 'Natural in classrooms; remembers every student and moves a group together.' },
      { type: 'INFJ', why: 'Deep mentor-teacher \u2014 changes individual students\u2019 trajectories.' },
      { type: 'ISFJ', why: 'Steady, warm, consistent \u2014 the reliable K-8 teacher every school needs.' },
      { type: 'ENFP', view: 'High-energy, creative, connects learning to real life \u2014 beloved by students.' },
      { type: 'ESFJ', why: 'Warm structure, strong parent communication, keeps the classroom harmonious.' }
    ],
    struggle: [
      { type: 'INTJ', why: 'The emotional labor and patience required daily can be brutal; better in curriculum design.' },
      { type: 'INTP', why: 'Repetition and classroom management aren\u2019t their strengths; better in college teaching.' }
    ]
  },
  'entrepreneurship': {
    title: 'Entrepreneurship',
    best: [
      { type: 'ENTJ', why: 'Born executives. Good at fundraising, hiring, and holding a team to a vision.' },
      { type: 'ENTP', why: 'Generative on ideas, persuasive to investors, comfortable with ambiguity.' },
      { type: 'INTJ', why: 'Long-horizon conviction + systems thinking \u2014 the deep-tech founder archetype.' },
      { type: 'ESTP', why: 'Acts first, iterates fast \u2014 great at sales-led startups and hands-on businesses.' },
      { type: 'ENFP', why: 'Storytelling + recruitment energy \u2014 great at consumer and community-driven startups.' }
    ],
    struggle: [
      { type: 'ISFJ', why: 'Risk tolerance and ambiguity drain them; better as early employee #1-5.' },
      { type: 'ISTJ', why: 'Thrives on structure; founding requires tolerating its absence daily.' }
    ]
  },
  'law': {
    title: 'Law',
    best: [
      { type: 'ENTJ', why: 'Deal work, M&A, and trial leadership \u2014 command presence and strategic argument.' },
      { type: 'INTJ', why: 'Appellate, constitutional, and complex transactional work \u2014 the strategist lawyer.' },
      { type: 'ENTP', why: 'Litigation and negotiation \u2014 thinks on their feet and reframes narratives live.' },
      { type: 'INTP', why: 'IP, legal research, and appellate writing \u2014 loves the deep pattern work.' },
      { type: 'ESTJ', why: 'Prosecution, judicial, and large-firm management \u2014 rule-bound, process-driven.' },
      { type: 'ISTJ', why: 'Tax, compliance, and regulatory law \u2014 precision and rule-mastery.' }
    ],
    struggle: [
      { type: 'ESFP', why: 'The paperwork volume and adversarial structure clash with their in-the-moment style.' },
      { type: 'INFP', why: 'Adversarial work often grates on their values; better in public-interest or policy law.' }
    ]
  },
  'finance': { title: 'Finance', best: [
      { type: 'INTJ', why: 'Strategic long-term thinking; shines in corporate finance, FP&A, and portfolio strategy.' },
      { type: 'INTP', why: 'Quantitative modeling and valuation work \u2014 the analyst\'s analyst.' },
      { type: 'ISTJ', why: 'Controllership, treasury, and compliance-heavy roles \u2014 precision matters.' },
      { type: 'ENTJ', why: 'CFO and finance leadership \u2014 runs the function, owns the numbers, drives decisions.' },
      { type: 'ESTJ', why: 'Operational finance and FP&A management \u2014 process, deadlines, accountability.' }
    ], struggle: [
      { type: 'ESFP', why: 'Too much solo modeling without enough real-time human energy.' },
      { type: 'INFP', why: 'Values misalignment in some corporate finance work grinds them down.' }
    ] },
  'accounting': { title: 'Accounting', best: [
      { type: 'ISTJ', why: 'The archetype: detail-obsessed, rule-bound, consistent. Audit and tax are home turf.' },
      { type: 'INTJ', why: 'Strategic tax and high-complexity consulting engagements.' },
      { type: 'ESTJ', why: 'Controller and audit-partner track \u2014 runs the process, enforces standards.' },
      { type: 'ISFJ', why: 'Client-facing accounting where trust and thoroughness build long-term relationships.' },
      { type: 'INTP', why: 'Forensic accounting and technical research \u2014 pattern recognition in the data.' }
    ], struggle: [
      { type: 'ENFP', why: 'The repetition and narrow-focus work is the anti-ENFP work diet.' },
      { type: 'ESTP', why: 'Deadlines without adrenaline, meetings without stakes \u2014 bored in a quarter.' }
    ] },
  'investment-banking': { title: 'Investment Banking', best: [
      { type: 'ENTJ', why: 'Deal team lead, managing director track \u2014 command presence and client-facing strategy.' },
      { type: 'INTJ', why: 'Coverage and advisory work \u2014 strategic long-term client relationships.' },
      { type: 'ESTJ', why: 'Process-driven execution; keeps the deal on track through endless iterations.' },
      { type: 'INTP', why: 'Valuation and technical modeling \u2014 they find the numbers the deal turns on.' },
      { type: 'ENTP', why: 'Originator / rainmaker role \u2014 reading markets and pitching bold angles.' }
    ], struggle: [
      { type: 'INFP', why: 'The 80-hour weeks chasing deals you can\'t emotionally invest in corrode their meaning.' },
      { type: 'ISFP', why: 'Political environment and deal-grinding culture clash with their authenticity orientation.' }
    ] },
  'ux-design': { title: 'UX Design', best: [
      { type: 'INFJ', why: 'Deep empathy for users + pattern-seeking across research \u2014 the researcher-designer archetype.' },
      { type: 'INFP', why: 'Values-driven work that centers user experience. Advocates for the person using the product.' },
      { type: 'INTJ', why: 'Systems-level UX \u2014 information architecture, design systems, strategic UX leadership.' },
      { type: 'ENFP', why: 'Generative ideation, great at user interviews, brings warmth to usability testing.' },
      { type: 'ISFJ', why: 'Patient, detail-focused, delivers interfaces that genuinely care about users.' }
    ], struggle: [
      { type: 'ESTJ', why: 'UX ambiguity frustrates their need for defined outcomes; better in design ops leadership.' },
      { type: 'ESTP', why: 'The long research cycles don\'t match their in-the-moment energy.' }
    ] },
  'graphic-design': { title: 'Graphic Design', best: [
      { type: 'ISFP', why: 'Aesthetic sensibility + craft focus + quiet creative autonomy \u2014 the classic designer.' },
      { type: 'INFP', why: 'Emotive, story-driven visual work. Brand identity, editorial, illustration.' },
      { type: 'ENFP', why: 'Fast-moving creative studios \u2014 brings energy, ideas, and range.' },
      { type: 'INTJ', why: 'Design systems and strategic brand work \u2014 structure + aesthetic.' },
      { type: 'INFJ', why: 'Concept-driven visual identity and mission-led brand design.' }
    ], struggle: [
      { type: 'ESTJ', why: 'Creative ambiguity and feedback cycles chafe against their need for defined process.' },
      { type: 'ISTJ', why: 'Too much aesthetic judgment and not enough clear rules; better in production design.' }
    ] },
  'writing': { title: 'Writing', best: [
      { type: 'INFP', why: 'Meaning-making through language; fiction, essays, poetry \u2014 writing is their native medium.' },
      { type: 'INFJ', why: 'Long-form nonfiction with psychological depth. Ghostwriting, biography, essay.' },
      { type: 'INTJ', why: 'Structured nonfiction: business, strategy, systems writing. Publishing-track authors.' },
      { type: 'INTP', why: 'Technical writing, philosophy, and deep-dive analysis pieces.' },
      { type: 'ENFP', why: 'Magazine features, creative nonfiction, culture pieces \u2014 range + voice.' }
    ], struggle: [
      { type: 'ESTP', why: 'Solo, deadline-driven, no real-time feedback \u2014 kills their flow.' },
      { type: 'ESFJ', why: 'Writing isolation conflicts with their need for ongoing social feedback.' }
    ] },
  'journalism': { title: 'Journalism', best: [
      { type: 'ENTP', why: 'Investigative work \u2014 contrarian instincts, fast pattern-matching, willing to challenge power.' },
      { type: 'INFJ', why: 'Long-form feature writing; the human-story journalist.' },
      { type: 'INTJ', why: 'Data journalism and strategic beat reporting \u2014 connects dots across time.' },
      { type: 'ENFP', why: 'Culture, profile, and trend coverage; natural at interviews.' },
      { type: 'ENTJ', why: 'Editor-in-chief and bureau chief roles \u2014 runs the newsroom.' }
    ], struggle: [
      { type: 'ISFJ', why: 'The confrontation and deadline pressure of hard news can be wearing.' },
      { type: 'ISFP', why: 'Public-facing adversarial work rubs against their authenticity orientation.' }
    ] },
  'human-resources': { title: 'Human Resources', best: [
      { type: 'ENFJ', why: 'People development and culture work \u2014 the archetype HR leader.' },
      { type: 'ESFJ', why: 'Employee relations and benefits admin \u2014 warm, organized, attentive to individuals.' },
      { type: 'INFJ', why: 'Organizational development and coaching \u2014 diagnoses team dynamics accurately.' },
      { type: 'ISFJ', why: 'Employee support and compliance-focused HR \u2014 reliable and detail-oriented.' },
      { type: 'ENTJ', why: 'CHRO and HR-business-partner track \u2014 strategic people operations.' }
    ], struggle: [
      { type: 'INTP', why: 'Heavy interpersonal load with ambiguous outcomes drains their cognitive energy.' },
      { type: 'ESTP', why: 'The process-heavy compliance side bores them; better in talent acquisition.' }
    ] },
  'real-estate': { title: 'Real Estate', best: [
      { type: 'ESFJ', why: 'Residential sales \u2014 relationship-heavy, service-oriented, high-touch clients.' },
      { type: 'ESTP', why: 'Deal-making energy, fast decisions, comfortable with negotiation stakes.' },
      { type: 'ENTJ', why: 'Commercial development, fund management, brokerage leadership.' },
      { type: 'ENFJ', why: 'Client-relationship-led agent and team leader.' },
      { type: 'ENFP', why: 'Boutique residential and creative commercial agents \u2014 storytelling sells homes.' }
    ], struggle: [
      { type: 'INTP', why: 'The relationship maintenance and sales performance drain their cognitive focus.' },
      { type: 'INFP', why: 'High-pressure sales environments can clash with their values orientation.' }
    ] },
  'medicine': { title: 'Medicine', best: [
      { type: 'ISTJ', why: 'Internal medicine, primary care \u2014 systematic, thorough, reliable with patients over years.' },
      { type: 'INTJ', why: 'Specialist and research-track medicine \u2014 diagnostic complexity and long-range treatment.' },
      { type: 'ISFJ', why: 'Pediatrics, family medicine, and palliative care \u2014 warm, patient-centered, detail-driven.' },
      { type: 'INFJ', why: 'Psychiatry and narrative medicine \u2014 deep understanding of individual patients.' },
      { type: 'ISTP', why: 'Emergency medicine, surgery, trauma \u2014 calm under pressure, precise hands.' }
    ], struggle: [
      { type: 'ENFP', why: 'Rigid protocols drain their energy; often thrives in telehealth or specialty niches.' },
      { type: 'ESTP', why: 'Can thrive in ER/trauma, but standard clinical medicine can bore them.' }
    ] },
  'psychology': { title: 'Psychology and Therapy', best: [
      { type: 'INFJ', why: 'The archetype therapist. Deep attunement, pattern-seeking, caring without burning out fast.' },
      { type: 'INFP', why: 'Values-centered therapy and creative modalities (art therapy, trauma-informed work).' },
      { type: 'ENFJ', why: 'Group therapy and organizational psychology \u2014 coaching, leadership development.' },
      { type: 'INTJ', why: 'Research psychology and diagnostic-track clinical work.' },
      { type: 'ENFP', why: 'Youth psychology, coaching, and community-based therapy.' }
    ], struggle: [
      { type: 'ESTJ', why: 'Process-oriented mind struggles with unstructured emotional work.' },
      { type: 'ESTP', why: 'Long client arcs with no external stakes clash with their action orientation.' }
    ] },
  'social-work': { title: 'Social Work', best: [
      { type: 'INFJ', why: 'Mission-driven, deep empathy, pattern-seeing with at-risk populations.' },
      { type: 'INFP', why: 'Values-centered advocacy work; case management in nonprofits.' },
      { type: 'ENFJ', why: 'Program leadership and community organizing.' },
      { type: 'ISFJ', why: 'Patient, consistent, warm caseworkers who build trust with clients over years.' },
      { type: 'ENFP', why: 'Community outreach and youth-focused social work.' }
    ], struggle: [
      { type: 'INTP', why: 'High emotional load with ambiguous outcomes burns them out.' },
      { type: 'ESTP', why: 'Slow systemic change doesn\'t match their action-first style.' }
    ] },
  'architecture': { title: 'Architecture', best: [
      { type: 'INTJ', why: 'Strategic design, master planning, firm principal track.' },
      { type: 'ISFP', why: 'Residential and aesthetic-led architecture \u2014 craft + sensibility.' },
      { type: 'INTP', why: 'Computational design, structural research, theoretical work.' },
      { type: 'INFJ', why: 'Community and mission-led architecture \u2014 libraries, hospitals, schools.' },
      { type: 'ISTJ', why: 'Construction documentation and code-compliance-heavy work; detail-perfect.' }
    ], struggle: [
      { type: 'ESTP', why: 'Long project cycles without real-time stakes frustrate them.' },
      { type: 'ESFP', why: 'Too much solo technical work and not enough people energy.' }
    ] },
  'research-science': { title: 'Research Science', best: [
      { type: 'INTP', why: 'The classic researcher: deep, independent, hypothesis-driven, tolerant of ambiguity.' },
      { type: 'INTJ', why: 'Principal investigator track \u2014 strategic research programs, grant-winning visionaries.' },
      { type: 'ISTJ', why: 'Experimental rigor, lab management, detailed protocol work.' },
      { type: 'INFJ', why: 'Social sciences, qualitative research, research with strong ethical dimensions.' },
      { type: 'ENTP', why: 'Industrial R&D and commercial research \u2014 connects science to application.' }
    ], struggle: [
      { type: 'ESFP', why: 'Multi-year experiments with abstract outcomes clash with their in-the-moment style.' },
      { type: 'ESFJ', why: 'Solo work + uncertain outcomes drain their social energy.' }
    ] },
  'operations': { title: 'Operations and Supply Chain', best: [
      { type: 'ESTJ', why: 'Classic ops leader \u2014 process, accountability, on-time delivery.' },
      { type: 'ISTJ', why: 'Meticulous process ownership, compliance, supply chain precision.' },
      { type: 'ENTJ', why: 'VP Ops, COO track \u2014 strategic operations at scale.' },
      { type: 'INTJ', why: 'Ops strategy and supply chain optimization \u2014 systems thinking.' },
      { type: 'ISTP', why: 'Field ops, logistics, and hands-on problem-solving.' }
    ], struggle: [
      { type: 'ENFP', why: 'The repetition and process discipline drain their creative energy.' },
      { type: 'INFP', why: 'Operational tradeoffs (speed vs quality vs cost) can grate against their values.' }
    ] },
  'customer-success': { title: 'Customer Success', best: [
      { type: 'ENFJ', why: 'Relationship-led success management \u2014 builds trust, reads clients, renews.' },
      { type: 'ESFJ', why: 'Service-oriented and detail-attentive \u2014 the CSM who remembers everything.' },
      { type: 'ENFP', why: 'High-touch consultative CS \u2014 energetic, connector, champion internally for clients.' },
      { type: 'INFJ', why: 'Strategic CS and customer marketing \u2014 deep understanding of client goals.' },
      { type: 'ENTJ', why: 'VP Customer Success track \u2014 scaling the function, driving expansion.' }
    ], struggle: [
      { type: 'INTP', why: 'Constant customer-facing work without depth drains their cognitive focus.' },
      { type: 'ISTP', why: 'Relationship-management cadence feels like performance; better in solutions engineering.' }
    ] },
  'project-management': { title: 'Project Management', best: [
      { type: 'ESTJ', why: 'The archetype: deadline enforcement, process discipline, stakeholder wrangling.' },
      { type: 'ENTJ', why: 'Program management and PMO leadership \u2014 strategic delivery.' },
      { type: 'ISTJ', why: 'Detail-obsessed PM \u2014 risk registers, status reports, nothing falls through.' },
      { type: 'ENFJ', why: 'Stakeholder-heavy projects where relationships drive delivery.' },
      { type: 'ENTP', why: 'Agile product delivery and zero-to-one initiatives \u2014 reframes the plan as needed.' }
    ], struggle: [
      { type: 'INFP', why: 'The politics and constant stakeholder negotiation grind against their values.' },
      { type: 'INTP', why: 'Meeting-heavy PM work leaves no time for depth; better in technical PM roles.' }
    ] },
  'cybersecurity': { title: 'Cybersecurity', best: [
      { type: 'INTP', why: 'Pure researcher profile \u2014 malware analysis, cryptography, exploit research.' },
      { type: 'INTJ', why: 'Security architecture and CISO track \u2014 strategic long-horizon thinking.' },
      { type: 'ISTP', why: 'Red-team operations, penetration testing, incident response \u2014 hands-on, calm under pressure.' },
      { type: 'ISTJ', why: 'GRC (governance, risk, compliance), audit, and policy-driven security roles.' },
      { type: 'ENTJ', why: 'Executive security leadership \u2014 building programs, managing risk at org level.' }
    ], struggle: [
      { type: 'ESFP', why: 'Solo technical deep work with delayed payoff clashes with their energy style.' },
      { type: 'ENFP', why: 'Rigorous defensive mindset can feel constraining; better in security awareness roles.' }
    ] },
  'devops': { title: 'DevOps', best: [
      { type: 'ISTP', why: 'Pragmatic, hands-on, troubleshoot-first \u2014 the archetype SRE.' },
      { type: 'INTJ', why: 'Platform engineering and infrastructure architecture \u2014 systems-level thinking.' },
      { type: 'INTP', why: 'Automation engineering \u2014 finds the right abstraction and builds the tooling.' },
      { type: 'ISTJ', why: 'Reliability engineering and on-call discipline; processes and runbooks.' },
      { type: 'ENTJ', why: 'Engineering leadership over platform and infrastructure orgs.' }
    ], struggle: [
      { type: 'ESFP', why: 'Quiet alerts-driven work doesn\'t match their high-energy style.' },
      { type: 'ESFJ', why: 'Too little user-facing relationship work; better in developer experience.' }
    ] },
  'executive-leadership': { title: 'Executive Leadership', best: [
      { type: 'ENTJ', why: 'Born CEO profile \u2014 commander, decisive, comfortable with power and scrutiny.' },
      { type: 'INTJ', why: 'Vision-led founder/CEO \u2014 long-horizon, strategic, introverted leader archetype.' },
      { type: 'ESTJ', why: 'COO and operational CEO \u2014 runs the machine, holds people accountable.' },
      { type: 'ENFJ', why: 'Mission-driven CEO \u2014 builds culture, rallies teams, values alignment.' },
      { type: 'ENTP', why: 'Founder/CEO of fast-growing companies \u2014 reframes market, out-hustles incumbents.' }
    ], struggle: [
      { type: 'ISFP', why: 'Public-facing authority role conflicts with their authenticity orientation.' },
      { type: 'INFP', why: 'The political maneuvering required at the top can corrode their values over time.' }
    ] }
};

function renderCareerPage(slug) {
  const data = CAREER_PAGES[slug];
  const url = 'https://personality.fyi/blog/best-personality-types-for-' + slug;
  const topTypes = data.best.map(b => b.type).join(', ');
  const strugglingTypes = data.struggle.map(s => s.type).join(', ');

  const faqs = [
    {
      q: `What MBTI type is best for ${data.title.toLowerCase()}?`,
      a: `The best personality types for ${data.title.toLowerCase()} are ${topTypes}. ${data.best[0].why}`
    },
    {
      q: `Can other personality types succeed in ${data.title.toLowerCase()}?`,
      a: `Yes. Type is a strong signal for fit but not a cap on success. ${strugglingTypes} tend to struggle with the typical demands of ${data.title.toLowerCase()}, but adjacent specializations often work well for them.`
    },
    {
      q: `What traits matter most for ${data.title.toLowerCase()}?`,
      a: `Regardless of MBTI type, the traits that predict success in ${data.title.toLowerCase()} are: ${careerGeneralTraits(slug)}.`
    }
  ];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' },
      { '@type': 'ListItem', position: 3, name: `Best Types for ${data.title}` }
    ]
  };
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
  const today2 = new Date().toISOString().slice(0, 10);
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: `Best Personality Types for ${data.title}`,
    description: `The best MBTI types for ${data.title.toLowerCase()} and why. Ranked with specific reasoning for each type.`,
    url: url,
    datePublished: today2,
    dateModified: today2,
    author: { '@type': 'Organization', name: 'personality.fyi' },
    publisher: { '@type': 'Organization', name: 'personality.fyi', url: 'https://personality.fyi' }
  };

  const body = `
  <section>
    <h2>Best MBTI types for ${data.title.toLowerCase()}</h2>
    <p><strong>Answer:</strong> The personality types best suited for ${data.title.toLowerCase()} are <strong>${topTypes}</strong>. These types' cognitive wiring aligns with what the role actually rewards day-to-day.</p>
    <ol class="blog-careers">
      ${data.best.map(b => `<li><strong><a href="/blog/${b.type.toLowerCase()}-personality">${b.type}</a>:</strong> ${b.why || b.view || ''}</li>`).join('\n      ')}
    </ol>
  </section>

  <section>
    <h2>Types that struggle with ${data.title.toLowerCase()}</h2>
    <p><strong>Worst fit:</strong> ${strugglingTypes}.</p>
    <ul class="blog-bullets">
      ${data.struggle.map(s => `<li><strong><a href="/blog/${s.type.toLowerCase()}-personality">${s.type}</a>:</strong> ${s.why}</li>`).join('\n      ')}
    </ul>
  </section>

  <section>
    <h2>What makes someone succeed in ${data.title.toLowerCase()} \u2014 regardless of type</h2>
    <p>${careerGeneralTraits(slug)} Type tells you what wiring makes the job feel natural; these traits are what actually separate the top quartile of ${data.title.toLowerCase()} practitioners.</p>
  </section>

  <section>
    <h2>Frequently Asked Questions</h2>
    ${faqs.map(f => `<details class="blog-faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>

  <section class="blog-cta">
    <h2>Find your type</h2>
    <p>Take the 60-second test to find your MBTI type, then see which careers naturally fit and which will drain you.</p>
    <a href="/" class="blog-cta-btn">Find your type \u2192</a>
  </section>`;

  return renderBlogShell({
    title: `Best Personality Types for ${data.title} | personality.fyi`,
    description: `The best MBTI types for ${data.title.toLowerCase()}: ${topTypes}. Ranked with specific reasoning and what makes each type fit.`.slice(0, 158),
    canonicalUrl: url,
    h1: `Best Personality Types for ${data.title}`,
    metaLine: `Career fit guide \u00B7 Updated ${new Date().toISOString().slice(0, 10)}`,
    schemas: [breadcrumb, faqSchema, articleSchema],
    body: body
  });
}

function careerGeneralTraits(slug) {
  const map = {
    'software-engineering': 'deep focus, persistence through frustrating bugs, willingness to read documentation, tolerance for solo work, and taste for clean systems',
    'product-management': 'decisiveness under incomplete information, cross-functional empathy, pattern-matching on user behavior, and tolerance for meeting volume',
    'data-science': 'statistical rigor, stubborn curiosity, comfort with incomplete data, and skepticism of your own conclusions',
    'management-consulting': 'structured thinking, rapid context-switching, executive-level communication, and stamina for long hours under client pressure',
    'sales': 'resilience after rejection, genuine curiosity about people, comfort with quota pressure, and the ability to read rooms quickly',
    'marketing': 'narrative instinct, data literacy, cultural awareness, and willingness to kill bad ideas fast',
    'nursing': 'emotional stamina, physical stamina, attention to detail under fatigue, and the ability to compartmentalize without going numb',
    'teaching': 'patience on a six-hour window, attunement to individual kids, lesson-design creativity, and strong boundaries with administrative overhead',
    'entrepreneurship': 'high risk tolerance, resilience through setbacks, fundraising/selling fluency, and the ability to hire people better than you',
    'law': 'precision with language, argumentative stamina, deep reading endurance, and emotional control under adversarial pressure',
    'finance': 'quantitative fluency, comfort with ambiguity in valuation, intellectual honesty about your own mistakes, and stress tolerance under volatility',
    'accounting': 'meticulous attention to detail, comfort with repetition, strong ethics, and ability to explain complex rules to non-specialists',
    'investment-banking': 'stamina for 80-hour weeks, precision under pressure, calm client presence, and tolerance for hierarchy',
    'ux-design': 'genuine curiosity about people, comfort with ambiguous research, design-taste judgment, and an ability to translate findings into defensible decisions',
    'graphic-design': 'visual judgment, speed of iteration, ability to take direction without losing your voice, and craft discipline',
    'writing': 'daily practice, willingness to rewrite, taste shaped by reading widely, and the ability to sit with not-knowing for a long time',
    'journalism': 'persistence chasing sources, skepticism of official narratives, calm under deadline, and the ability to write clearly under pressure',
    'human-resources': 'genuine interest in people dynamics, legal literacy, emotional composure during difficult conversations, and strong boundaries',
    'real-estate': 'resilience after a dozen "no"s, local market knowledge, ethical discipline, and patience to build a referral pipeline over years',
    'medicine': 'emotional stamina, physical stamina, attention to detail under fatigue, and the ability to compartmentalize without going numb',
    'psychology': 'presence and genuine attentiveness, the capacity to hold others\' pain without absorbing it, strong boundaries, and ongoing supervision',
    'social-work': 'emotional resilience, systems-level thinking, calm under client crisis, and the ability to keep showing up for slow-moving cases',
    'architecture': 'visual-spatial reasoning, comfort with long project cycles, client-management patience, and rigor with building codes',
    'research-science': 'stubborn curiosity, disciplined experimental design, stamina for multi-year projects, and the ability to be wrong in public',
    'operations': 'systems thinking, cross-functional coordination, obsessive attention to metrics, and resilience under constant incidents',
    'customer-success': 'empathy that scales, analytical rigor on usage data, the ability to internally champion clients, and persistence on renewals',
    'project-management': 'calm under chaos, clear written communication, comfort chasing people for status, and willingness to make unpopular calls',
    'cybersecurity': 'adversarial mindset, patience for boring vigilance work, deep technical curiosity, and calm under incident response',
    'devops': 'systems thinking, stoicism through 3AM pages, discipline on documentation, and willingness to automate yourself out of every boring task',
    'executive-leadership': 'decisiveness under incomplete information, willingness to be disliked, ability to hire better than yourself, and tolerance for constant scrutiny'
  };
  return map[slug] || 'strong focus, craft discipline, and adaptability';
}

// ── Comparison pages (X vs Y) ────────────────────────────────────
const COMPARISON_PAIRS = [
  ['INTJ','ENTJ'], ['INTJ','INTP'], ['INFP','INFJ'], ['INFJ','INTJ'],
  ['ENFP','ENTP'], ['ENFJ','ESFJ'], ['ISTP','INTP'], ['ISFP','INFP'],
  ['ESTJ','ENTJ'], ['ESFP','ENFP'], ['ISTJ','ISFJ'], ['ESTP','ESFP'],
  ['ENTP','ENTJ'], ['ISFJ','INFJ'], ['ESFJ','ENFJ'], ['ISTP','ESTP']
];

function compareCell(t1, t2, dim) {
  // dim: 'lead', 'comm', 'decide', 'social', 'career', 'conflict', 'learn', 'stress'
  const d1 = TYPE_DESCS[t1], d2 = TYPE_DESCS[t2];
  switch (dim) {
    case 'lead':
      return [
        leaderStyleShort(t1),
        leaderStyleShort(t2)
      ];
    case 'comm':
      return [COMMS_STYLE[t1], COMMS_STYLE[t2]];
    case 'decide':
      return [
        t1[2] === 'T' ? 'Logic-first. Weighs evidence before feelings.' : 'Values-first. Weighs impact on people before abstract logic.',
        t2[2] === 'T' ? 'Logic-first. Weighs evidence before feelings.' : 'Values-first. Weighs impact on people before abstract logic.'
      ];
    case 'social':
      return [
        t1[0] === 'E' ? 'Energized by people. Recharges externally.' : 'Drained by crowds. Recharges alone.',
        t2[0] === 'E' ? 'Energized by people. Recharges externally.' : 'Drained by crowds. Recharges alone.'
      ];
    case 'career':
      return [
        BEST_CAREERS[t1].slice(0, 3).map(c => c[0]).join(', '),
        BEST_CAREERS[t2].slice(0, 3).map(c => c[0]).join(', ')
      ];
    case 'conflict':
      return [
        t1[2] === 'T' ? 'Direct, argument-first. Problem-solves before soothing.' : 'Harmony-first. Reluctant to be the aggressor.',
        t2[2] === 'T' ? 'Direct, argument-first. Problem-solves before soothing.' : 'Harmony-first. Reluctant to be the aggressor.'
      ];
    case 'learn':
      return [
        t1[1] === 'N' ? 'Concept-first. Learns the abstraction, then examples.' : 'Example-first. Learns the concrete cases, then the pattern.',
        t2[1] === 'N' ? 'Concept-first. Learns the abstraction, then examples.' : 'Example-first. Learns the concrete cases, then the pattern.'
      ];
    case 'stress':
      return [d1.shadow, d2.shadow];
  }
  return ['', ''];
}

function leaderStyleShort(type) {
  const map = {
    INTJ: 'Strategic, from behind the scenes. Quiet conviction.',
    INTP: 'Reluctant leader; leads through ideas, not authority.',
    ENTJ: 'Commander. Leads visibly, drives the agenda.',
    ENTP: 'Visionary. Leads through persuasion and momentum.',
    INFJ: 'Moral compass. Leads through inspiration and meaning.',
    INFP: 'Leads through values. Uncomfortable with pure authority.',
    ENFJ: 'Coalition-builder. Leads through warmth and purpose.',
    ENFP: 'Movement leader. Leads through energy and storytelling.',
    ISTJ: 'Process leader. Dependable, consistent, metric-driven.',
    ISFJ: 'Supportive leader. Leads through consistency and care.',
    ESTJ: 'Executive. Leads through structure and accountability.',
    ESFJ: 'Cultural leader. Builds cohesion and keeps morale high.',
    ISTP: 'Expert-craft leader. Leads by doing, not directing.',
    ISFP: 'Quiet leader. Leads through authenticity and example.',
    ESTP: 'Action leader. Leads in real-time, improvises fast.',
    ESFP: 'Charismatic leader. Rallies the room in the moment.'
  };
  return map[type];
}

function renderComparePage(t1, t2) {
  const n1 = TYPE_NAMES[t1], n2 = TYPE_NAMES[t2];
  const d1 = TYPE_DESCS[t1], d2 = TYPE_DESCS[t2];
  const slug = t1.toLowerCase() + '-vs-' + t2.toLowerCase();
  const url = 'https://personality.fyi/blog/' + slug;

  const flips = [];
  for (let i = 0; i < 4; i++) if (t1[i] !== t2[i]) flips.push(i);
  const axisNames = ['I/E', 'N/S', 'T/F', 'J/P'];
  const flipAxes = flips.map(i => axisNames[i]).join(', ');

  const coreDiff = flips.length === 1
    ? `The key difference between ${t1} and ${t2} is the ${axisNames[flips[0]]} axis. ${t1}s ${axisDesc(t1, flips[0])}; ${t2}s ${axisDesc(t2, flips[0])}.`
    : `${t1} and ${t2} differ on the ${flipAxes} ${flips.length > 1 ? 'axes' : 'axis'}. They share ${4 - flips.length} of 4 letters, but those differences drive most day-to-day contrasts.`;

  const dims = [
    { key: 'lead', label: 'Leadership style' },
    { key: 'comm', label: 'Communication' },
    { key: 'decide', label: 'Decision-making' },
    { key: 'social', label: 'Social energy' },
    { key: 'career', label: 'Typical careers' },
    { key: 'conflict', label: 'Conflict style' },
    { key: 'learn', label: 'Learning style' },
    { key: 'stress', label: 'Stress response' }
  ];

  const tableRows = dims.map(dim => {
    const [v1, v2] = compareCell(t1, t2, dim.key);
    return `<tr><th scope="row">${dim.label}</th><td>${esc(v1)}</td><td>${esc(v2)}</td></tr>`;
  }).join('\n      ');

  const tellApart = flips.length === 1
    ? `The single flip (${axisNames[flips[0]]}) is the decisive tell. Ask yourself: ${flipQuestion(flips[0])}`
    : `Look at which letters flip: ${flipAxes}. The clearest ones to self-diagnose are ${flips.slice(0, 2).map(i => axisNames[i]).join(' and ')}. ${flips.slice(0, 2).map(i => flipQuestion(i)).join(' ')}`;

  const faqs = [
    {
      q: `What is the difference between ${t1} and ${t2}?`,
      a: coreDiff
    },
    {
      q: `How do I know if I'm ${t1} or ${t2}?`,
      a: tellApart
    },
    {
      q: `Are ${t1} and ${t2} similar?`,
      a: flips.length <= 1
        ? `Yes, ${t1} and ${t2} are very similar \u2014 they share ${4 - flips.length} of 4 MBTI letters. The single difference on the ${flipAxes} axis explains most behavioral divergence.`
        : `Partially. ${t1} and ${t2} share ${4 - flips.length} of 4 letters but differ enough on ${flipAxes} that their daily patterns look distinct.`
    },
    {
      q: `Which is more common, ${t1} or ${t2}?`,
      a: `${rarityAnswer(t1)} By contrast, ${rarityAnswer(t2)}`
    }
  ];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' },
      { '@type': 'ListItem', position: 3, name: `${t1} vs ${t2}` }
    ]
  };
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
  const today2 = new Date().toISOString().slice(0, 10);
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: `${t1} vs ${t2}: Key Differences`,
    description: `${t1} vs ${t2} comparison: leadership, communication, careers, and stress response. How to tell which one you are.`,
    url: url,
    datePublished: today2,
    dateModified: today2,
    author: { '@type': 'Organization', name: 'personality.fyi' },
    publisher: { '@type': 'Organization', name: 'personality.fyi', url: 'https://personality.fyi' }
  };

  const body = `
  <section>
    <h2>The core difference</h2>
    <p><strong>${coreDiff}</strong></p>
    <p><a href="/blog/${t1.toLowerCase()}-personality">${t1} (${n1})</a> and <a href="/blog/${t2.toLowerCase()}-personality">${t2} (${n2})</a> share ${4 - flips.length} of 4 MBTI letters. The single-axis flip on ${flipAxes} produces a noticeably different daily rhythm.</p>
  </section>

  <section>
    <h2>${t1} vs ${t2}: side-by-side</h2>
    <table class="blog-compare">
      <thead>
        <tr><th></th><th>${t1}</th><th>${t2}</th></tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Where they overlap</h2>
    <p>${t1}s and ${t2}s share ${4 - flips.length} core preferences. Both tend to gravitate toward similar environments, similar work, and similar people. To outsiders they can look nearly identical \u2014 which is why they're commonly confused.</p>
  </section>

  <section>
    <h2>Where they diverge most</h2>
    <p><strong>Primary divergence:</strong> ${axisNames[flips[0]]}. ${t1}s ${axisDesc(t1, flips[0])}; ${t2}s ${axisDesc(t2, flips[0])}. This shows up in leadership style, conflict handling, and how they recover from stress.</p>
  </section>

  <section>
    <h2>How to tell which one you are</h2>
    <p>${tellApart}</p>
    <p>When in doubt, take the <a href="/">60-second test</a> \u2014 it looks at word patterns and preference signals rather than abstract self-description.</p>
  </section>

  <section>
    <h2>Frequently Asked Questions</h2>
    ${faqs.map(f => `<details class="blog-faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>

  <section class="blog-cta">
    <h2>Read each type in depth</h2>
    <p>Full profiles: <a href="/blog/${t1.toLowerCase()}-personality">${t1} \u2014 ${n1}</a> and <a href="/blog/${t2.toLowerCase()}-personality">${t2} \u2014 ${n2}</a>.</p>
    <a href="/" class="blog-cta-btn">Take the test \u2192</a>
  </section>`;

  return renderBlogShell({
    title: `${t1} vs ${t2}: Key Differences | personality.fyi`,
    description: `${t1} vs ${t2} comparison across leadership, communication, careers, conflict, and stress. How to tell which you are.`.slice(0, 158),
    canonicalUrl: url,
    h1: `${t1} vs ${t2}: Key Differences`,
    metaLine: `Comparison guide \u00B7 ${t1} (${n1}) vs ${t2} (${n2})`,
    schemas: [breadcrumb, faqSchema, articleSchema],
    body: body
  });
}

function axisDesc(type, axisIndex) {
  const c = type[axisIndex];
  const map = {
    I: 'recharge alone and think before speaking',
    E: 'recharge with people and think out loud',
    N: 'lead with pattern and abstraction',
    S: 'lead with detail and concrete evidence',
    T: 'decide by logic first',
    F: 'decide by values first',
    J: 'seek closure and plan ahead',
    P: 'keep options open and adapt on the fly'
  };
  return map[c];
}

function flipQuestion(axisIndex) {
  const map = {
    0: 'After a big group event, do you feel recharged (E) or drained (I)?',
    1: 'When you learn something, do you start with the abstract pattern (N) or the concrete examples (S)?',
    2: 'When you disagree with someone close to you, does the logic of their argument (T) or the feelings in the room (F) come up first for you?',
    3: 'Faced with a messy week, do you crave closure and a plan (J) or the freedom to stay adaptive (P)?'
  };
  return map[axisIndex];
}

// ── /type/[slug] standalone pages (600-900 words each, SEO-focused) ──

// Maps each type to 3 relevant career pages (use slugs from CAREER_PAGES).
function relevantCareers(type) {
  // Find career pages where this type appears in `best`
  const matches = [];
  for (const slug of Object.keys(CAREER_PAGES)) {
    const d = CAREER_PAGES[slug];
    if (d.best.some(b => b.type === type)) {
      matches.push({ slug, title: d.title, rank: d.best.findIndex(b => b.type === type) });
    }
  }
  matches.sort((a, b) => a.rank - b.rank);
  return matches.slice(0, 4);
}

function renderTypeSlugPage(type) {
  const name = TYPE_NAMES[type];
  const d = TYPE_DESCS[type];
  const url = 'https://personality.fyi/type/' + type.toLowerCase();
  const sibling = CLOSEST_TYPE[type];
  const bestMatches = topCompat(type, 3, true);
  const friction = topCompat(type, 3, false);
  const famous = FAMOUS[type];
  const bestCareersText = BEST_CAREERS[type].slice(0, 6).map(c => c[0]).join(', ');
  const careerPages = relevantCareers(type);

  const desc = `${type} (${name}) personality: traits, best careers, compatibility, and what makes ${type}s tick. Take the free 60-second test to confirm your type.`;

  const faqs = [
    {
      q: `What is ${type}?`,
      a: `${type} (${name}) is one of the 16 Myers\u2013Briggs personality types. ${d.cognitive} At their best, ${type}s are ${d.strengths.toLowerCase()}. ${rarityAnswer(type)}`
    },
    {
      q: `What careers suit ${type}?`,
      a: `${type}s do best in work that rewards ${d.strengths.toLowerCase()} and avoids ${d.drains.toLowerCase()}. Common strong-fit roles include ${bestCareersText}.`
    },
    {
      q: `What is ${type} compatibility?`,
      a: `${type}s tend to click best with ${bestMatches.map(m => m.type).join(', ')}. The most common friction pairings are with ${friction.map(m => m.type).join(', ')}. Compatibility in MBTI is about cognitive-function fit, not a prediction of relationship success on its own.`
    },
    {
      q: `Are ${type}s rare?`,
      a: rarityAnswer(type)
    },
    {
      q: `What does ${type} stand for?`,
      a: `The four letters describe four preferences: ${type[0]} = ${type[0] === 'I' ? 'Introverted' : 'Extraverted'} (where you get energy), ${type[1]} = ${type[1] === 'N' ? 'Intuitive (pattern-first)' : 'Sensing (detail-first)'}, ${type[2]} = ${type[2] === 'T' ? 'Thinking (logic-first)' : 'Feeling (values-first)'}, ${type[3]} = ${type[3] === 'J' ? 'Judging (closure-seeking)' : 'Perceiving (options-open)'}.`
    }
  ];

  const today = new Date().toISOString().slice(0, 10);
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${type}: The ${name.replace(/^The\s+/, '')}`,
    description: desc,
    url: url,
    datePublished: today,
    dateModified: today,
    author: { '@type': 'Organization', name: 'personality.fyi' },
    publisher: { '@type': 'Organization', name: 'personality.fyi', url: 'https://personality.fyi' }
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: `${type} Personality` }
    ]
  };

  const body = `
  <section>
    <h2>Overview</h2>
    <p><strong>${type} (${name})</strong> is one of the 16 Myers\u2013Briggs personality types. ${d.cognitive} At their best, ${type}s are ${d.strengths.toLowerCase()}. At their worst, they default to the ${type} shadow pattern: ${d.shadow.toLowerCase()}</p>
    <p>Understanding ${type} well means holding both sides at once \u2014 the strengths that make them valuable and the blind spots that show up when they\u2019re stressed, tired, or asked to operate outside their wiring. This guide covers both.</p>
  </section>

  <section>
    <h2>Core traits</h2>
    <ul class="blog-bullets">
      <li><strong>Cognitive style:</strong> ${d.cognitive}</li>
      <li><strong>Social energy:</strong> ${type.startsWith('E') ? 'Extraverted \u2014 energized by people and external stimulation.' : 'Introverted \u2014 recharges alone; selective about social exposure.'}</li>
      <li><strong>Information processing:</strong> ${type[1] === 'N' ? 'iNtuitive \u2014 leads with pattern and abstraction; reads implications.' : 'Sensing \u2014 leads with detail and concrete evidence; reads what\u2019s actually there.'}</li>
      <li><strong>Decision criteria:</strong> ${type[2] === 'T' ? 'Thinking \u2014 decides by logic first; evidence before empathy.' : 'Feeling \u2014 decides by values first; impact on people before abstract logic.'}</li>
      <li><strong>Lifestyle structure:</strong> ${type[3] === 'J' ? 'Judging \u2014 seeks closure; plans ahead; moves toward resolution.' : 'Perceiving \u2014 keeps options open; adapts on the fly; resists premature commitment.'}</li>
    </ul>
  </section>

  <section>
    <h2>Strengths and blind spots</h2>
    <p><strong>Strengths:</strong> ${d.strengths}. These show up most visibly in environments that reward ${type.startsWith('E') ? 'direct engagement' : 'depth and focus'} and ${type[3] === 'J' ? 'execution and follow-through' : 'flexibility and pattern-recognition'}.</p>
    <p><strong>Blind spots:</strong> ${d.shadow}. These tend to surface under stress, in environments that demand exactly what the ${type} finds draining. Self-aware ${type}s manage them with structure, external feedback, and recovery time.</p>
    <p><strong>Drained by:</strong> ${d.drains}. If a role or relationship forces a ${type} to live in these zones daily, the mismatch usually manifests as chronic fatigue rather than an obvious problem.</p>
  </section>

  <section>
    <h2>Best careers for ${type}</h2>
    <p>${type}s thrive in work that plays to their cognitive wiring. Strong-fit roles include <strong>${bestCareersText}</strong>.</p>
    <p>For deep-dives on specific careers where ${type}s show up as top-ranked fits:</p>
    <ul class="blog-bullets">
      ${careerPages.map(c => `<li><a href="/blog/best-personality-types-for-${c.slug}">Best personality types for ${c.title}</a></li>`).join('\n      ')}
    </ul>
    <p>See the <a href="/blog/${type.toLowerCase()}-personality">full ${type} career guide</a> for a ranked list of 10+ strong-fit roles with reasoning.</p>
  </section>

  <section>
    <h2>${type} compatibility overview</h2>
    <p><strong>Best matches:</strong> ${bestMatches.map(m => m.type).join(', ')}. These pairings share or complement the ${type}\u2019s cognitive rhythm and tend to deepen over time.</p>
    <p><strong>Friction pairings:</strong> ${friction.map(m => m.type).join(', ')}. These aren\u2019t dealbreakers, but they require more deliberate communication than naturally compatible pairings.</p>
    <p>Detailed compatibility breakdowns:</p>
    <ul class="blog-bullets">
      ${bestMatches.map(m => `<li><a href="/blog/${pairSlug(type, m.type)}-compatibility">${type} + ${m.type} compatibility</a> (${m.score}/100)</li>`).join('\n      ')}
      ${friction.slice(0, 1).map(m => `<li><a href="/blog/${pairSlug(type, m.type)}-compatibility">${type} + ${m.type} compatibility</a> (${m.score}/100 \u2014 friction)</li>`).join('\n      ')}
    </ul>
    <p>Also: <a href="/blog/${type.toLowerCase()}-vs-${sibling.toLowerCase()}">how ${type} differs from ${sibling}</a> \u2014 the types most commonly confused with ${type}.</p>
  </section>

  <section>
    <h2>Famous ${type}s</h2>
    <p>Public figures commonly typed as ${type} (based on widely-cited community typings, not official assessments): <strong>${famous.slice(0, 6).join(', ')}</strong>.</p>
  </section>

  <section class="blog-cta">
    <h2>Think you might be a ${type}?</h2>
    <p>Take the free 60-second personality test and find out. It analyzes your word choice and phrasing against patterns for each of the 16 types \u2014 no long surveys, no horoscope language.</p>
    <a href="/" class="blog-cta-btn">Take the test \u2192</a>
  </section>`;

  return renderBlogShell({
    title: `${type} Personality Type \u2014 Traits, Careers & Compatibility | personality.fyi`,
    description: desc,
    canonicalUrl: url,
    h1: `${type}: The ${name.replace(/^The\s+/, '')}`,
    metaLine: `${type} (${name}) \u00B7 Updated ${today}`,
    schemas: [breadcrumb, faqSchema, articleSchema],
    body: body
  });
}

// ── Hub pages: /blog/compatibility, /blog/careers, /blog/comparisons ──
// Single-section indexes. Each page lists only its vertical, with
// tight copy + canonical tag, for better topical authority.

function renderCompatibilityHub(compatPairs) {
  const url = 'https://personality.fyi/blog/compatibility';
  const items = compatPairs.map(pair => {
    const slug = pairSlug(pair[0], pair[1]) + '-compatibility';
    const score = COMPAT[pair[0]][pair[1]];
    return `<article class="blog-index-item" data-types="${pair[0]},${pair[1]}">
      <h3><a href="/blog/${slug}">${pair[0]} and ${pair[1]} Compatibility</a></h3>
      <p class="blog-index-excerpt">${score}/100 \u2014 ${compatTier(score).label}.</p>
    </article>`;
  }).join('\n');

  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' },
      { '@type': 'ListItem', position: 3, name: 'Compatibility' }
    ]
  };

  const body = `
  <p class="blog-intro">Every unordered pairing of the 16 MBTI types, with a compatibility score, the strengths and friction points of the pairing, and tips for making it work. ${compatPairs.length} guides total.</p>
  <div class="blog-index-list">${items}</div>`;

  return renderBlogShell({
    title: 'MBTI Compatibility: All 136 Type Pairings | personality.fyi',
    description: 'Every MBTI compatibility pairing analyzed in plain English. Scores, strengths, friction, communication tips. All 136 unique pairings.',
    canonicalUrl: url,
    h1: 'MBTI Compatibility',
    metaLine: compatPairs.length + ' pairings \u00B7 Indexed by Google',
    schemas: [breadcrumb],
    body: body
  });
}

function renderCareersHub(careerSlugs) {
  const url = 'https://personality.fyi/blog/careers';
  const items = careerSlugs.map(slug => {
    const title = CAREER_PAGES[slug].title;
    const top = CAREER_PAGES[slug].best.slice(0, 3).map(b => b.type).join(', ');
    const tags = CAREER_PAGES[slug].best.map(b => b.type).join(',');
    return `<article class="blog-index-item" data-types="${tags}">
      <h3><a href="/blog/best-personality-types-for-${slug}">Best Personality Types for ${title}</a></h3>
      <p class="blog-index-excerpt">Top types for ${title.toLowerCase()}: ${top}.</p>
    </article>`;
  }).join('\n');

  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' },
      { '@type': 'ListItem', position: 3, name: 'Careers' }
    ]
  };

  const body = `
  <p class="blog-intro">For each career below, we rank the MBTI types that naturally thrive in it and explain why. Then we flag types that typically struggle. ${careerSlugs.length} career guides.</p>
  <div class="blog-index-list">${items}</div>`;

  return renderBlogShell({
    title: 'Best MBTI Personality Types for Every Career | personality.fyi',
    description: 'Which MBTI types thrive in which careers, with specific reasoning. ' + careerSlugs.length + ' career guides from software engineering to medicine.',
    canonicalUrl: url,
    h1: 'MBTI Career Guides',
    metaLine: careerSlugs.length + ' careers covered',
    schemas: [breadcrumb],
    body: body
  });
}

function renderComparisonsHub(comparisonPairs) {
  const url = 'https://personality.fyi/blog/comparisons';
  const items = comparisonPairs.map(pair => {
    const slug = pair[0].toLowerCase() + '-vs-' + pair[1].toLowerCase();
    const tags = [pair[0], pair[1]].join(',');
    return `<article class="blog-index-item" data-types="${tags}">
      <h3><a href="/blog/${slug}">${pair[0]} vs ${pair[1]}: Key Differences</a></h3>
      <p class="blog-index-excerpt">How to tell them apart and where they diverge.</p>
    </article>`;
  }).join('\n');

  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://personality.fyi/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://personality.fyi/blog' },
      { '@type': 'ListItem', position: 3, name: 'Comparisons' }
    ]
  };

  const body = `
  <p class="blog-intro">Type pairs most commonly confused with each other, side-by-side on 8 dimensions: leadership, communication, decision-making, conflict, stress response, and more.</p>
  <div class="blog-index-list">${items}</div>`;

  return renderBlogShell({
    title: 'MBTI Type Comparisons: Side-by-Side Guides | personality.fyi',
    description: 'Commonly confused MBTI type pairs compared across leadership, communication, careers, conflict, and stress response. ' + comparisonPairs.length + ' comparison guides.',
    canonicalUrl: url,
    h1: 'MBTI Type Comparisons',
    metaLine: comparisonPairs.length + ' comparisons',
    schemas: [breadcrumb],
    body: body
  });
}

// ── Execute ──────────────────────────────────────────────────────

const types = Object.keys(TYPE_DESCS);
fs.mkdirSync(OUT_DIR, { recursive: true });

// Write CSS
fs.writeFileSync(path.join(OUT_DIR, 'blog.css'), renderCss());

// Write each type page
types.forEach(t => {
  const slug = t.toLowerCase() + '-personality';
  fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), renderTypePage(t));
  console.log('Wrote ' + slug + '.html');
});

// Full 136-pair compatibility coverage: every unordered pair of types, including
// same-type pairings (INTJ+INTJ, ENFP+ENFP, etc.). C(16,2) + 16 = 136.
const compatPairsSet = new Set();
const compatPairs = [];
for (let i = 0; i < types.length; i++) {
  for (let j = i; j < types.length; j++) {
    const pair = [types[i], types[j]];
    const key = pairSlug(pair[0], pair[1]);
    if (!compatPairsSet.has(key)) {
      compatPairsSet.add(key);
      compatPairs.push(pair);
    }
  }
}

compatPairs.forEach(pair => {
  const slug = pairSlug(pair[0], pair[1]) + '-compatibility';
  fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), renderCompatPage(pair[0], pair[1]));
});
console.log('Wrote ' + compatPairs.length + ' compatibility pages');

// Career-by-type pages
const careerSlugs = Object.keys(CAREER_PAGES);
careerSlugs.forEach(slug => {
  const fileSlug = 'best-personality-types-for-' + slug;
  fs.writeFileSync(path.join(OUT_DIR, fileSlug + '.html'), renderCareerPage(slug));
});
console.log('Wrote ' + careerSlugs.length + ' career pages');

// Comparison pages
COMPARISON_PAIRS.forEach(pair => {
  const slug = pair[0].toLowerCase() + '-vs-' + pair[1].toLowerCase();
  fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), renderComparePage(pair[0], pair[1]));
});
console.log('Wrote ' + COMPARISON_PAIRS.length + ' comparison pages');

// /type/[slug] standalone SEO pages (in /type/, not /blog/)
const TYPE_DIR = path.join(ROOT, 'type');
fs.mkdirSync(TYPE_DIR, { recursive: true });
types.forEach(t => {
  fs.writeFileSync(path.join(TYPE_DIR, t.toLowerCase() + '.html'), renderTypeSlugPage(t));
});
console.log('Wrote ' + types.length + ' /type/[slug] pages');

// Hub pages — vertical-specific indexes for better crawling
fs.writeFileSync(path.join(OUT_DIR, 'compatibility.html'), renderCompatibilityHub(compatPairs));
fs.writeFileSync(path.join(OUT_DIR, 'careers.html'), renderCareersHub(careerSlugs));
fs.writeFileSync(path.join(OUT_DIR, 'comparisons.html'), renderComparisonsHub(COMPARISON_PAIRS));
console.log('Wrote 3 hub pages');

// Write index (with all page types now available)
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), renderIndex(types, compatPairs, careerSlugs, COMPARISON_PAIRS));
console.log('Wrote blog/index.html');

// Generate sitemap.xml at site root covering all public URLs.
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: 'https://personality.fyi/', priority: '1.0', changefreq: 'weekly' },
  { loc: 'https://personality.fyi/blog', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://personality.fyi/blog/compatibility', priority: '0.8', changefreq: 'monthly' },
  { loc: 'https://personality.fyi/blog/careers', priority: '0.8', changefreq: 'monthly' },
  { loc: 'https://personality.fyi/blog/comparisons', priority: '0.8', changefreq: 'monthly' },
  { loc: 'https://personality.fyi/about', priority: '0.6', changefreq: 'yearly' },
  { loc: 'https://personality.fyi/privacy', priority: '0.3', changefreq: 'yearly' },
  { loc: 'https://personality.fyi/terms', priority: '0.3', changefreq: 'yearly' },
  { loc: 'https://personality.fyi/contact', priority: '0.5', changefreq: 'yearly' }
];
types.forEach(t => {
  urls.push({
    loc: 'https://personality.fyi/blog/' + t.toLowerCase() + '-personality',
    priority: '0.9', changefreq: 'monthly'
  });
  // /type/[slug] high-priority SEO landing pages
  urls.push({
    loc: 'https://personality.fyi/type/' + t.toLowerCase(),
    priority: '0.95', changefreq: 'monthly'
  });
});
compatPairs.forEach(pair => {
  urls.push({
    loc: 'https://personality.fyi/blog/' + pairSlug(pair[0], pair[1]) + '-compatibility',
    priority: '0.8', changefreq: 'monthly'
  });
});
careerSlugs.forEach(slug => {
  urls.push({
    loc: 'https://personality.fyi/blog/best-personality-types-for-' + slug,
    priority: '0.8', changefreq: 'monthly'
  });
});
COMPARISON_PAIRS.forEach(pair => {
  urls.push({
    loc: 'https://personality.fyi/blog/' + pair[0].toLowerCase() + '-vs-' + pair[1].toLowerCase(),
    priority: '0.8', changefreq: 'monthly'
  });
});

const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u =>
    '  <url>\n' +
    '    <loc>' + u.loc + '</loc>\n' +
    '    <lastmod>' + today + '</lastmod>\n' +
    '    <changefreq>' + u.changefreq + '</changefreq>\n' +
    '    <priority>' + u.priority + '</priority>\n' +
    '  </url>'
  ).join('\n') +
  '\n</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
console.log('Wrote sitemap.xml (' + urls.length + ' URLs)');

console.log('Done \u2014 ' + types.length + ' type pages + ' + compatPairs.length + ' compat + ' + careerSlugs.length + ' career + ' + COMPARISON_PAIRS.length + ' comparisons.');
