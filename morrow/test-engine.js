/* Plain-node checks for the classification and recommendation engine.
   Run: node test-engine.js  */

const e = require('./engine.js');

let failures = 0;
function check(label, cond, extra) {
  if (cond) { console.log('  ok   ' + label); return; }
  failures++;
  console.log('  FAIL ' + label + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
}

console.log('brain dump splitting and classification');
const dump = e.classifyBrainDump(
  "I've got an idea for customizable travel cards, I need to pay my accountant by June 30, " +
  "and I might redesign the website but I'm exhausted. " +
  "I promised Sam I'd send the quote tomorrow. Should the cards be linen or matte?"
);
const kinds = dump.map(i => i.kind);
check('splits run-on speech into separate thoughts', dump.length === 6, kinds);
check('finds the idea', kinds.includes('idea'));
check('finds two commitments', kinds.filter(k => k === 'commitment').length === 2, kinds);
check('"I might redesign" is a possible action, not a commitment',
  dump.find(i => /redesign/.test(i.text)).kind === 'action');
check('"I\'m exhausted" is a reflection',
  dump.find(i => /exhausted/.test(i.text)).kind === 'reflection');
check('nothing is activated on capture', dump.every(i => i.status !== 'active'));

console.log('deadline model');
const tax = dump.find(i => /accountant/.test(i.text));
check('an externally imposed date is a real deadline', tax.deadline.kind === 'real', tax.deadline);
const soft = e.classifyThought("I'd like to finish the website redesign in 2 weeks");
check('a self-set target is an intention, never a real deadline',
  soft.deadline && soft.deadline.kind === 'intention', soft.deadline);
const vague = e.classifyThought('I need to pay my accountant');
check('a commitment with no date asks instead of inventing one',
  vague.needsConfirmation === true && vague.deadline === null);

console.log('date parsing');
const now = new Date('2026-08-24T09:00:00Z');
check('"June 30" rolls to next year when past', e.findDate('taxes due june 30', now).date === '2027-06-30');
check('"tomorrow"', e.findDate('call the bank tomorrow', now).date === '2026-08-25');
check('"in 3 days"', e.findDate('flight in 3 days', now).date === '2026-08-27');
check('ISO dates', e.findDate('due 2026-09-01', now).date === '2026-09-01');
check('no date is not a date', e.findDate('sometime soon', now) === null);

console.log('digest');
const d = e.digest(dump);
check('digest counts and reassures', /I captured six thoughts/.test(d) && /without your approval/.test(d), d);

console.log('recommendation follows energy and mode');
const mem = e.emptyMemory();
const soon = new Date(); soon.setDate(soon.getDate() + 2);
mem.items = [
  { id: 'a', kind: 'action', text: 'design the card backs', status: 'stored', mode: 'designing',
    energy: 'high', minutes: 60, createdAt: new Date().toISOString(), tags: ['card', 'design'] },
  { id: 'b', kind: 'action', text: 'file the receipts', status: 'stored', mode: 'organizing',
    energy: 'low', minutes: 15, createdAt: new Date().toISOString(), tags: ['receipts'] },
  { id: 'c', kind: 'commitment', text: 'send tax documents', status: 'stored', mode: 'admin',
    energy: 'low', minutes: 30, createdAt: new Date().toISOString(),
    deadline: { date: soon.toISOString().slice(0, 10), kind: 'real' }, tags: ['tax'] },
  { id: 'seed', kind: 'idea', text: 'travel card subscription', status: 'seed', stage: 'seed',
    energy: 'medium', minutes: 15, createdAt: new Date().toISOString(), tags: ['card', 'travel'] }
];
const creative = e.recommend(mem, { mode: 'designing', energy: 'high', minutes: 90 });
check('creative energy surfaces the matching design work', creative.some(i => i.id === 'a'), creative.map(i => i.id));
// A real deadline inside three days outranks mood - Morrow then names the clash
// out loud rather than silently burying the creative option.
check('a near real deadline leads, with the creative option still offered',
  creative[0].id === 'c' && creative.slice(1).some(i => i.id === 'a'), creative.map(i => i.id));
const tired = e.recommend(mem, { mode: null, energy: 'low', minutes: 20 });
check('low energy never surfaces high-energy work', !tired.some(i => i.id === 'a'), tired.map(i => i.id));
check('idea seeds stay out of recommendations',
  !creative.concat(tired).some(i => i.id === 'seed'));
check('an approaching real deadline still shows up', tired.some(i => i.id === 'c'), tired.map(i => i.id));

console.log('anti-clutter');
check('never more than three options', e.recommend(mem, { energy: 'high' }).length <= 3);
check('only real deadlines are pressing', e.pressingDeadlines(mem, 14).every(p => p.item.deadline.kind === 'real'));

console.log('idea garden');
mem.items.push({ id: 'i2', kind: 'idea', text: 'a card that folds into a map', status: 'seed',
  stage: 'seed', createdAt: new Date(Date.now() - 40 * 86400000).toISOString(), tags: ['card', 'map'] });
mem.items.find(i => i.id === 'a').status = 'active';
const resurfaced = e.resurfaceIdeas(mem, 3);
check('resurfaces at most three ideas', resurfaced.length <= 3);
check('resurfaced ideas relate to current work',
  resurfaced.every(i => i.tags.some(t => ['card', 'design', 'travel'].includes(t))));
check('search finds ideas by subject', e.searchIdeas(mem, 'travel cards').length > 0);

console.log('open loops');
mem.items.push(Object.assign(e.classifyThought('I need to renew the insurance'), { id: 'loop' }));
check('unconfirmed commitments count as open loops',
  e.openLoops(mem).some(i => i.id === 'loop'));

console.log(failures ? '\n' + failures + ' failing check(s)' : '\nall checks passed');
process.exit(failures ? 1 : 0);
