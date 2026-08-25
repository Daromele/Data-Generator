/* Checks for everything in Morrow that is not the model's judgement:
   the memory tools, the folder boundary, the approval gate, and the server.

   What Claude decides - whether something is a commitment or an idea, what is
   worth showing - is deliberately not asserted here. It is judgement, not
   logic, and pinning it to fixtures is how this ended up as keyword matching
   the first time. It is steered by PERSONA in agent.js and checked by using it.

   Run: node test-morrow.js
*/

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'morrow-test-'));
const approved = path.join(work, 'approved');
const outside = path.join(work, 'outside');
fs.mkdirSync(path.join(approved, 'sub'), { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.writeFileSync(path.join(approved, 'notes.txt'), 'travel card concepts\nlinen stock samples\n');
fs.writeFileSync(path.join(outside, 'secret.txt'), 'private\n');

process.env.MORROW_STORE = path.join(work, 'memory.json');
process.argv = [process.argv[0], 'agent.js', approved];

const morrow = require('./agent.js');
const tool = name => morrow.TOOLS.find(t => t.name === name);
const call = async (name, input) => JSON.parse(await tool(name).run(input, {}));

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log('  ok   ' + label); }
  catch (e) { failures++; console.log('  FAIL ' + label + '\n         ' + e.message); }
};
const checkAsync = async (label, fn) => {
  try { await fn(); console.log('  ok   ' + label); }
  catch (e) { failures++; console.log('  FAIL ' + label + '\n         ' + e.message); }
};

(async () => {

console.log('memory tools');

const stored = await call('remember', {
  items: [
    { kind: 'commitment', text: 'pay the accountant', deadline_date: '2026-09-01',
      deadline_kind: 'real', mode: 'admin', energy: 'low', minutes: 10, tags: ['tax'] },
    { kind: 'idea', text: 'customizable travel cards', mode: 'designing', tags: ['cards'] },
    { kind: 'action', text: 'redesign the website', deadline_date: '2026-09-20',
      deadline_kind: 'intention', mode: 'designing', energy: 'high', minutes: 90 },
    { kind: 'commitment', text: 'send Sam the quote', needs_date: true },
    { kind: 'reflection', text: 'exhausted this week' }
  ]
});
check('remember stores everything it is given', () => assert.equal(stored.stored.length, 5));
check('nothing arrives active', () =>
  assert.ok(morrow.memory().items.every(i => i.status !== 'active')));
check('an idea lands as a seed', () => {
  const idea = morrow.memory().items.find(i => i.kind === 'idea');
  assert.equal(idea.stage, 'seed');
});
check('memory survives a restart', () =>
  assert.equal(JSON.parse(fs.readFileSync(process.env.MORROW_STORE, 'utf8')).items.length, 5));

const real = await call('recall', { real_deadline_within_days: 3650 });
check('only real deadlines answer a deadline query', () =>
  assert.ok(real.results.every(r => r.deadline.kind === 'real') && real.results.length === 1));

const pending = await call('recall', { needs_date: true });
check('commitments missing a date are findable', () =>
  assert.equal(pending.results[0].text, 'send Sam the quote'));

const gentle = await call('recall', { max_energy: 'low', max_minutes: 20 });
check('a query for low energy never returns uphill work', () =>
  assert.ok(!gentle.results.some(r => r.energy === 'high')));

const found = await call('recall', { query: 'travel cards' });
check('search finds by subject', () => assert.ok(found.results.length >= 1));

const capped = await call('recall', { limit: 2 });
check('recall respects its limit', () => assert.equal(capped.results.length, 2));

const ideaId = morrow.memory().items.find(i => i.kind === 'idea').id;
await call('revise_item', { id: ideaId, stage: 'candidate' });
check('an idea can be moved along', () =>
  assert.equal(morrow.memory().items.find(i => i.id === ideaId).stage, 'candidate'));

await call('revise_item', { id: ideaId, status: 'archived' });
check('archiving keeps the record', () => {
  const i = morrow.memory().items.find(x => x.id === ideaId);
  assert.equal(i.status, 'archived');
  assert.ok(i.text);
});

const quoteId = morrow.memory().items.find(i => i.needsDate).id;
await call('revise_item', { id: quoteId, deadline_date: '2026-08-30', deadline_kind: 'real' });
check('confirming a date clears the open question', () => {
  const i = morrow.memory().items.find(x => x.id === quoteId);
  assert.equal(i.deadline.kind, 'real');
  assert.equal(i.needsDate, false);
});

await call('note_state', { mode: 'designing', energy: 'low', minutes: 20 });
check('state is recorded as a moment', () => {
  assert.equal(morrow.memory().context.mode, 'designing');
  assert.ok(morrow.memory().context.at);
});

check('the snapshot carries counts and dates, not contents', () => {
  const s = morrow.snapshot();
  assert.ok(s.stored_counts.commitment >= 1);
  assert.ok(s.real_deadlines.every(d => d.date && typeof d.in_days === 'number'));
  assert.ok(!s.real_deadlines.some(d => d.tags));
});

console.log('the folder boundary');

check('an approved path resolves', () =>
  assert.ok(morrow.resolveInside(path.join(approved, 'notes.txt')).startsWith(fs.realpathSync(approved))));
check('a path outside is refused', () =>
  assert.throws(() => morrow.resolveInside(path.join(outside, 'secret.txt')), /Outside the approved/));
check('traversal out is refused', () =>
  assert.throws(() => morrow.resolveInside(path.join(approved, '..', 'outside', 'secret.txt')), /Outside the approved/));
check('a symlink cannot walk out', () => {
  fs.symlinkSync(outside, path.join(approved, 'escape'));
  assert.throws(() => morrow.resolveInside(path.join(approved, 'escape', 'secret.txt')), /Outside the approved/);
});

await checkAsync('finding files by name works without approval', async () => {
  const r = await call('find_files', { query: 'notes' });
  assert.equal(r.count, 1);
});
await checkAsync('finding files by content works without approval', async () => {
  const r = await call('find_files', { query: 'linen', in_contents: true });
  assert.equal(r.results[0].line, 'linen stock samples');
});
await checkAsync('reading works without approval', async () => {
  const r = await call('read_file', { file: path.join(approved, 'notes.txt') });
  assert.match(r.content, /travel card/);
});
await checkAsync('reading outside the boundary is refused', async () => {
  await assert.rejects(() => tool('read_file').run({ file: path.join(outside, 'secret.txt') }, {}),
    /Outside the approved/);
});

console.log('the approval gate');

await checkAsync('a change waits for the person, then applies', async () => {
  const target = path.join(approved, 'Cards');
  const run = tool('change_files').run({ operations: [{ op: 'mkdir', dir: target }], why: 'Start a folder' }, {});
  await new Promise(r => setTimeout(r, 30));
  assert.equal(fs.existsSync(target), false, 'nothing should happen before approval');
  assert.equal(morrow.approvals.size, 1, 'an approval should be waiting');
  morrow.approvals.values().next().value({ approved: true });
  const result = JSON.parse(await run);
  assert.equal(result.done, true);
  assert.ok(fs.existsSync(target));
});

await checkAsync('a refusal leaves the disk untouched', async () => {
  const target = path.join(approved, 'Nope');
  const run = tool('change_files').run({ operations: [{ op: 'mkdir', dir: target }] }, {});
  await new Promise(r => setTimeout(r, 30));
  morrow.approvals.values().next().value({ approved: false });
  const result = JSON.parse(await run);
  assert.equal(result.done, false);
  assert.equal(fs.existsSync(target), false);
});

await checkAsync('an existing file is never overwritten', async () => {
  const r = await call('change_files', {
    operations: [{ op: 'write', file: path.join(approved, 'notes.txt'), content: 'x' }]
  });
  assert.match(r.refused, /never overwrites/);
});

await checkAsync('a change outside the boundary is refused before it is even offered', async () => {
  const r = await call('change_files', {
    operations: [{ op: 'mkdir', dir: path.join(outside, 'newdir') }]
  });
  assert.equal(r.code, 'OUT_OF_BOUNDS');
  assert.equal(morrow.approvals.size, 0, 'it must not reach the person as a choice');
});

check('there is no way to delete anything', () =>
  assert.ok(!morrow.TOOLS.some(t => /delete|remove|unlink|trash/i.test(t.name))));

console.log('the server');

await checkAsync('serves the page and opens a stream', async () => {
  const child = spawn(process.execPath, [path.join(__dirname, 'agent.js'), approved], {
    env: Object.assign({}, process.env, { MORROW_PORT: '4479', ANTHROPIC_API_KEY: 'test-only' }),
    stdio: 'ignore'
  });
  try {
    await new Promise(r => setTimeout(r, 700));
    const page = await get('http://127.0.0.1:4479/');
    assert.match(page, /<title>Morrow<\/title>/);
    const ready = await firstEvent('http://127.0.0.1:4479/stream');
    assert.match(ready, /event: ready/);
  } finally {
    child.kill();
  }
});

fs.rmSync(work, { recursive: true, force: true });
console.log(failures ? '\n' + failures + ' failing check(s)' : '\nall checks passed');
process.exit(failures ? 1 : 0);

})();

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function firstEvent(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', d => {
        body += d;
        if (body.includes('event: ')) { req.destroy(); resolve(body); }
      });
    });
    req.on('error', e => { if (!/socket hang up|aborted/i.test(e.message)) reject(e); });
    setTimeout(() => { req.destroy(); reject(new Error('no event within 3s')); }, 3000);
  });
}
