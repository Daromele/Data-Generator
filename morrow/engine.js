/* Morrow — capture, classification, memory and recommendation engine.
   Pure functions + a small store. No network, no build step. */

const MORROW_VERSION = '0.1.0';

/* ---------------------------------------------------------------- memory */

const STORE_KEY = 'morrow.memory.v1';

const emptyMemory = () => ({
  version: MORROW_VERSION,
  items: [],          // everything captured, most of it never displayed
  messages: [],       // the one shared conversation (text + voice)
  context: {          // what Morrow currently believes about the user's state
    mode: null,       // designing | brainstorming | writing | ...
    energy: null,     // high | medium | low | resting
    minutes: null,    // available time
    updatedAt: null
  },
  observations: [],   // energy / pattern notes
  people: [],
  folders: []         // approved folders for the desktop companion
});

function loadMemory() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyMemory();
    return Object.assign(emptyMemory(), JSON.parse(raw));
  } catch (e) {
    return emptyMemory();
  }
}

function saveMemory(mem) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(mem)); } catch (e) {}
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ------------------------------------------------------------- date sense */

const MONTHS = ['january','february','march','april','may','june','july',
  'august','september','october','november','december'];
const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const iso = d => startOfDay(d).toISOString().slice(0, 10);
const daysUntil = dateStr => {
  if (!dateStr) return null;
  const ms = startOfDay(new Date(dateStr + 'T00:00:00')) - startOfDay(new Date());
  return Math.round(ms / 86400000);
};

// Finds a date mentioned in free text. Returns { date, phrase } or null.
function findDate(text, now = new Date()) {
  const t = text.toLowerCase();

  const isoMatch = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return { date: isoMatch[0], phrase: isoMatch[0] };

  const monthDay = t.match(new RegExp(
    `\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`));
  if (monthDay) {
    const m = MONTHS.indexOf(monthDay[1]);
    const day = parseInt(monthDay[2], 10);
    let year = monthDay[3] ? parseInt(monthDay[3], 10) : now.getFullYear();
    let d = new Date(year, m, day);
    if (!monthDay[3] && d < startOfDay(now)) d = new Date(year + 1, m, day);
    return { date: iso(d), phrase: monthDay[0] };
  }

  const dayMonth = t.match(new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})`));
  if (dayMonth) {
    const m = MONTHS.indexOf(dayMonth[2]);
    const day = parseInt(dayMonth[1], 10);
    let d = new Date(now.getFullYear(), m, day);
    if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, m, day);
    return { date: iso(d), phrase: dayMonth[0] };
  }

  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return { date: iso(d), phrase: 'tomorrow' };
  }
  if (/\btonight\b|\btoday\b/.test(t)) return { date: iso(now), phrase: 'today' };

  const inDays = t.match(/\bin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/);
  if (inDays) {
    const n = parseInt(inDays[1], 10);
    const unit = inDays[2];
    const d = new Date(now);
    if (unit.startsWith('day')) d.setDate(d.getDate() + n);
    else if (unit.startsWith('week')) d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return { date: iso(d), phrase: inDays[0] };
  }

  const weekday = t.match(new RegExp(`\\b(?:next\\s+|this\\s+|on\\s+)?(${DAYS.join('|')})\\b`));
  if (weekday) {
    const target = DAYS.indexOf(weekday[1]);
    const d = new Date(now);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0 || /next/.test(weekday[0])) delta = delta === 0 ? 7 : delta;
    d.setDate(d.getDate() + delta);
    return { date: iso(d), phrase: weekday[0].trim() };
  }

  const endOf = t.match(/\bend of (the )?(week|month)\b/);
  if (endOf) {
    const d = new Date(now);
    if (endOf[2] === 'week') d.setDate(d.getDate() + (7 - d.getDay()));
    else { d.setMonth(d.getMonth() + 1, 0); }
    return { date: iso(d), phrase: endOf[0] };
  }
  return null;
}

/* -------------------------------------------------------- classification */

const CUES = {
  realDeadline: [
    /\btax(es)?\b/, /\bdue\b/, /\bdeadline\b/, /\bappointment\b/, /\bflight\b/,
    /\bbill\b/, /\binvoice\b/, /\brent\b/, /\brenew(al)?\b/, /\bapplication\b/,
    /\bsubmit\b/, /\bfile (my|the) \w+/, /\bcourt\b/, /\bpassport\b/, /\bvisa\b/,
    /\binsurance\b/, /\bclient\b/, /\bpay (my|the|back)\b/, /\baccountant\b/,
    /\bregistration\b/, /\bmot\b/, /\bcontract\b/, /\bpermit\b/
  ],
  promise: [
    /\bi (promised|told|owe|committed|agreed)\b/, /\bpromised (to|him|her|them)\b/,
    /\bgot back to\b/, /\bsaid i(?:'| wo)?u?ld\b/, /\bthey(?:'re| are) waiting\b/
  ],
  intention: [
    /\bi(?:'| wan)?d? ?like to\b/, /\bi want to\b/, /\bi'd love to\b/,
    /\bwould be nice\b/, /\bhoping to\b/, /\baiming to\b/, /\bgoal is\b/,
    /\bi might\b/, /\bi may\b/, /\bthinking of\b/, /\bat some point\b/,
    /\bone day\b/, /\beventually\b/
  ],
  action: [
    /\bi (need|have) to\b/, /\bi should\b/, /\bi must\b/, /\bremind me\b/,
    /\bsort out\b/, /\bfix\b/, /\bcall\b/, /\bemail\b/, /\bbook\b/, /\border\b/,
    /\bsend\b/, /\bchase\b/, /\bfollow up\b/
  ],
  idea: [
    /\bidea\b/, /\bwhat if\b/, /\bimagine\b/, /\bconcept\b/, /\bwe could\b/,
    /\bi could (make|build|do|try|design|launch)\b/, /\bit would be cool\b/,
    /\bthinking about (making|building|starting)\b/, /\blaunch\b/, /\bbrand\b/,
    /\bproduct\b/, /\bcollection\b/, /\bseries\b/
  ],
  decision: [
    /\bi(?:'ve| have)? decided\b/, /\bi'm not going to\b/, /\bi'm going to stop\b/,
    /\bno longer\b/, /\bdropping\b/, /\bwe're going with\b/, /\bsettled on\b/
  ],
  reflection: [
    /\bi feel\b/, /\bi'm (exhausted|tired|drained|anxious|stuck|overwhelmed|excited)\b/,
    /\bi keep\b/, /\bi always\b/, /\bi never\b/, /\bi noticed\b/, /\bhonestly\b/,
    /\blately\b/, /\bi hate\b/, /\bi love\b/
  ]
};

const MODE_CUES = {
  designing: [/design/, /\blayout\b/, /\bmockup\b/, /\bvisual\b/, /\bcolou?r\b/, /\blogo\b/, /\bfigma\b/, /\bcard\b/],
  brainstorming: [/\bidea\b/, /\bbrainstorm\b/, /\bwhat if\b/, /\bconcept\b/, /\bname\b/, /\bexplore\b/],
  writing: [/\bwrite\b/, /\bcopy\b/, /\bdraft\b/, /\blisting\b/, /\bdescription\b/, /\bpost\b/, /\bblog\b/],
  researching: [/\bresearch\b/, /\blook (up|into)\b/, /\bcompare\b/, /\bfind out\b/, /\bread about\b/],
  organizing: [/\borganis|organiz/, /\btidy\b/, /\bfolder\b/, /\bfiles?\b/, /\brename\b/, /\bsort\b/, /\bbackup\b/],
  communicating: [/\bcall\b/, /\bemail\b/, /\bmessage\b/, /\breply\b/, /\bchase\b/, /\bring\b/, /\bmeet\b/],
  admin: [/\btax\b/, /\bbill\b/, /\binvoice\b/, /\bform\b/, /\bpay\b/, /\bpaperwork\b/, /\baccountant\b/, /\bbank\b/, /\bregister\b/]
};

const ENERGY_BY_MODE = {
  designing: 'high', brainstorming: 'medium', writing: 'high',
  researching: 'medium', organizing: 'low', communicating: 'medium',
  admin: 'low', resting: 'low'
};

function inferMode(text) {
  const t = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const [mode, cues] of Object.entries(MODE_CUES)) {
    const score = cues.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
    if (score > bestScore) { best = mode; bestScore = score; }
  }
  return best;
}

// Rough minutes estimate, so the user never has to enter one.
function inferMinutes(text, kind) {
  const t = text.toLowerCase();
  const explicit = t.match(/\b(\d{1,3})\s*(min|minute|minutes|hour|hours|hr|hrs)\b/);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    return /hour|hr/.test(explicit[2]) ? n * 60 : n;
  }
  if (/\bquick\b|\bjust\b|\bsend\b|\bcall\b|\breply\b|\bpay\b/.test(t)) return 10;
  if (kind === 'idea' || kind === 'question') return 15;
  if (/\bredesign\b|\brebuild\b|\bwrite\b|\bdesign\b/.test(t)) return 90;
  return 30;
}

// The user talks in run-on sentences; each clause is its own thought.
const CLAUSE_SPLIT = new RegExp(
  '(?<=[.!?])\\s+' +
  "|\\s*[,;]?\\s+(?:and|but|also|and also|then|and then|plus)\\s+(?=i\\b|i'|we\\b|maybe|it\\s|there\\s)" +
  "|\\s*[,;]\\s+(?=i\\b|i'|we\\b|maybe)" +
  '|\\n+', 'i');

function splitThoughts(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .split(CLAUSE_SPLIT)
    .map(s => (s || '').trim().replace(/^(?:and|but|also|then|plus)\s+/i, ''))
    .filter(s => s.length > 2);
}

function score(text, cues) {
  return cues.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

/* Classify a single thought. Returns a draft item — nothing is activated. */
function classifyThought(raw, now = new Date()) {
  const text = raw.trim();
  const t = text.toLowerCase();
  const when = findDate(t, now);

  const s = {
    realDeadline: score(t, CUES.realDeadline),
    promise: score(t, CUES.promise),
    intention: score(t, CUES.intention),
    action: score(t, CUES.action),
    idea: score(t, CUES.idea),
    decision: score(t, CUES.decision),
    reflection: score(t, CUES.reflection)
  };

  let kind, deadlineKind = null, needsConfirmation = false;

  if (/\?\s*$/.test(text) && s.decision === 0 && s.idea === 0) {
    kind = 'question';
  } else if (s.decision > 0) {
    kind = 'decision';
  } else if (s.realDeadline > 0 || s.promise > 0) {
    kind = 'commitment';
    // A real deadline is only real when something external imposes it.
    deadlineKind = when ? 'real' : null;
    needsConfirmation = !when;   // Morrow asks rather than inventing a date
  } else if (s.idea > s.action && s.idea > 0) {
    kind = 'idea';
  } else if (s.intention > 0 && s.idea === 0) {
    kind = 'action';
    deadlineKind = when ? 'intention' : null;
  } else if (s.action > 0) {
    kind = 'action';
    deadlineKind = when ? 'intention' : null;
  } else if (s.idea > 0) {
    kind = 'idea';
  } else if (s.reflection > 0) {
    kind = 'reflection';
  } else {
    kind = 'reflection';
  }

  const mode = inferMode(t);
  const item = {
    id: uid(),
    kind,
    text,
    createdAt: new Date().toISOString(),
    status: kind === 'idea' ? 'seed' : 'stored',   // stored != active, by default
    stage: kind === 'idea' ? 'seed' : null,
    deadline: when && deadlineKind ? { date: when.date, kind: deadlineKind, phrase: when.phrase } : null,
    needsConfirmation,
    mode,
    energy: mode ? ENERGY_BY_MODE[mode] : 'medium',
    minutes: inferMinutes(t, kind),
    assistable: /\bfind\b|\bfolder\b|\bfiles?\b|\brename\b|\bsort\b|\borganis|organiz|\bdraft\b|\blook up\b/.test(t),
    project: null,
    tags: keywords(text)
  };
  return item;
}

function classifyBrainDump(text, now = new Date()) {
  return splitThoughts(text).map(s => classifyThought(s, now));
}

const STOPWORDS = new Set(('a an the i im my me we you it its is are was were be been to of for on in at ' +
  'and or but so that this these those with about need needs want wants would could should like just ' +
  'really maybe think thing things do does did done get got make makes have has had am will can').split(' '));

function keywords(text) {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w)))].slice(0, 8);
}

function digest(items) {
  const counts = items.reduce((acc, i) => { acc[i.kind] = (acc[i.kind] || 0) + 1; return acc; }, {});
  const label = { commitment: ['commitment', 'commitments'], action: ['possible action', 'possible actions'],
    idea: ['idea', 'ideas'], reflection: ['reflection', 'reflections'],
    question: ['question', 'questions'], decision: ['decision', 'decisions'] };
  const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
  const num = n => (n <= 10 ? words[n] : n);
  const parts = Object.entries(counts).map(([k, n]) =>
    `${num(n)} ${label[k][n === 1 ? 0 : 1]}`);
  const total = items.length;
  const list = parts.length > 1
    ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
    : (parts[0] || 'nothing yet');
  return `I captured ${num(total)} thought${total === 1 ? '' : 's'}: ${list}. ` +
    `Nothing was added to active work without your approval.`;
}

/* ------------------------------------------------------------ recommender */

const ENERGY_RANK = { resting: 0, low: 1, medium: 2, high: 3 };

// Real deadlines are the only thing allowed to create pressure.
function deadlinePressure(item) {
  if (!item.deadline || item.deadline.kind !== 'real') return 0;
  const d = daysUntil(item.deadline.date);
  if (d === null) return 0;
  if (d < 0) return 100;
  if (d <= 1) return 90;
  if (d <= 3) return 70;
  if (d <= 7) return 45;
  if (d <= 14) return 25;
  if (d <= 30) return 10;
  return 3;
}

function fitScore(item, ctx) {
  if (item.status === 'archived' || item.status === 'done' || item.status === 'blocked') return -1;
  if (item.kind === 'reflection' || item.kind === 'decision') return -1;
  if (item.kind === 'idea' && item.stage === 'seed') return -1; // seeds stay quiet

  let s = deadlinePressure(item);

  if (ctx.mode && item.mode === ctx.mode) s += 30;
  else if (ctx.mode && item.mode) s -= 8;

  if (ctx.energy) {
    const have = ENERGY_RANK[ctx.energy] ?? 2;
    const need = ENERGY_RANK[item.energy] ?? 2;
    if (need <= have) s += 12 - (have - need) * 3;
    else s -= (need - have) * 22;      // never push uphill work at a tired person
  }

  if (ctx.minutes) {
    if (item.minutes <= ctx.minutes) s += 14;
    else s -= Math.min(40, (item.minutes - ctx.minutes) / 3);
  }

  if (item.status === 'active') s += 15;
  if (item.kind === 'commitment') s += 10;
  return s;
}

function recommend(mem, ctx = mem.context, limit = 3) {
  const scored = mem.items
    .map(i => ({ item: i, s: fitScore(i, ctx) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map(x => x.item);
}

// Real deadlines that deserve a mention right now, and nothing else.
function pressingDeadlines(mem, horizonDays = 14) {
  return mem.items
    .filter(i => i.deadline && i.deadline.kind === 'real' && i.status !== 'done')
    .map(i => ({ item: i, days: daysUntil(i.deadline.date) }))
    .filter(x => x.days !== null && x.days <= horizonDays)
    .sort((a, b) => a.days - b.days);
}

// "What am I forgetting?" — open loops, unconfirmed deadlines, stalled commitments.
function openLoops(mem) {
  const now = Date.now();
  const stale = i => (now - new Date(i.createdAt).getTime()) > 5 * 86400000;
  return [
    ...mem.items.filter(i => i.needsConfirmation && i.status !== 'done'),
    ...pressingDeadlines(mem, 30).map(x => x.item),
    ...mem.items.filter(i => i.kind === 'commitment' && i.status !== 'done' && stale(i)),
    ...mem.items.filter(i => i.kind === 'question' && i.status !== 'done')
  ].filter((i, n, arr) => arr.indexOf(i) === n).slice(0, 5);
}

/* Occasionally resurface a very small number of unusually relevant ideas. */
function resurfaceIdeas(mem, limit = 3) {
  const active = mem.items.filter(i => i.status === 'active' || i.kind === 'commitment');
  const activeTags = new Set(active.flatMap(i => i.tags || []));
  const ideas = mem.items.filter(i => i.kind === 'idea' && i.status !== 'archived' && i.stage !== 'active');
  return ideas
    .map(i => {
      const overlap = (i.tags || []).filter(t => activeTags.has(t)).length;
      const ageDays = (Date.now() - new Date(i.createdAt).getTime()) / 86400000;
      const recurrence = ideas.filter(o => o !== i &&
        (o.tags || []).some(t => (i.tags || []).includes(t))).length;
      return { item: i, s: overlap * 3 + recurrence * 2 + Math.min(ageDays / 7, 3) };
    })
    .filter(x => x.s >= 2)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.item);
}

function searchIdeas(mem, query) {
  const terms = keywords(query);
  if (!terms.length) return [];
  return mem.items
    .filter(i => i.kind === 'idea')
    .map(i => ({ item: i, s: terms.filter(t => (i.text + ' ' + (i.tags || []).join(' ')).toLowerCase().includes(t)).length }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map(x => x.item);
}

const IDEA_STAGES = ['seed', 'explore', 'candidate', 'active', 'archive'];

if (typeof module !== 'undefined') {
  module.exports = { classifyThought, classifyBrainDump, findDate, digest, recommend,
    pressingDeadlines, openLoops, resurfaceIdeas, searchIdeas, inferMode, daysUntil,
    emptyMemory, IDEA_STAGES, keywords };
}
