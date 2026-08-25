/* Drives the real agent loop against a stub Anthropic endpoint.

   This proves the wiring end to end without spending anyone's tokens: that the
   request Morrow builds is well formed, that a tool_use reply actually reaches
   the tool and mutates memory, that the tool result goes back to the model, and
   that the final text streams out to the browser as it arrives.

   Run: node test-loop.js
*/

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'morrow-loop-'));
const PORT = 4487;

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log('  ok   ' + label); }
  catch (e) { failures++; console.log('  FAIL ' + label + '\n         ' + e.message); }
};

/* ------------------------------------------------------- the stub model -- */

const seen = [];          // every request body the agent sent

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const e of events) res.write('event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n');
  res.end();
}

const messageStart = {
  type: 'message_start',
  message: { id: 'msg_stub', type: 'message', role: 'assistant', model: 'claude-opus-5',
    content: [], stop_reason: null, stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 1 } }
};

// Turn one: the model decides to store two things.
const toolTurn = input => [
  messageStart,
  { type: 'content_block_start', index: 0,
    content_block: { type: 'tool_use', id: 'toolu_stub', name: 'remember', input: {} } },
  { type: 'content_block_delta', index: 0,
    delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null },
    usage: { output_tokens: 20 } },
  { type: 'message_stop' }
];

// Turn two: having seen the tool result, it answers in words.
const textTurn = chunks => [
  messageStart,
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ...chunks.map(t => ({ type: 'content_block_delta', index: 0,
    delta: { type: 'text_delta', text: t } })),
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 12 } },
  { type: 'message_stop' }
];

const stub = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const parsed = JSON.parse(body);
  seen.push(parsed);
  if (seen.length === 1) {
    return sse(res, toolTurn({
      items: [
        { kind: 'commitment', text: 'pay the accountant', deadline_date: '2026-09-30',
          deadline_kind: 'real', mode: 'admin', energy: 'low', minutes: 10 },
        { kind: 'idea', text: 'travel cards you can customise', mode: 'designing' }
      ]
    }));
  }
  return sse(res, textTurn(['Captured. ', 'The accountant one has a real date, ',
    'so I will keep an eye on it.']));
});

/* ------------------------------------------------------------------ run -- */

(async () => {
  await new Promise(r => stub.listen(PORT, '127.0.0.1', r));

  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:' + PORT;
  process.env.ANTHROPIC_API_KEY = 'stub-key-not-real';
  process.env.MORROW_STORE = path.join(work, 'memory.json');
  process.argv = [process.argv[0], 'agent.js'];

  const morrow = require('./agent.js');

  // Watch what the browser would have received.
  const events = [];
  morrow.onEmit((event, data) => events.push({ event, data }));

  console.log('the agent loop');
  await morrow.respond('I need to pay my accountant by September 30, and I had an ' +
    'idea for travel cards you can customise');

  check('it called the model twice - once to act, once to answer', () =>
    assert.equal(seen.length, 2));

  const first = seen[0];
  check('it asked for the right model', () => assert.equal(first.model, 'claude-opus-5'));
  check('it streams', () => assert.equal(first.stream, true));
  check('adaptive thinking is on', () => assert.deepEqual(first.thinking, { type: 'adaptive' }));
  check('the persona is sent and marked cacheable', () => {
    assert.match(first.system[0].text, /capture freely, display selectively/);
    assert.deepEqual(first.system[0].cache_control, { type: 'ephemeral' });
  });
  check('the deadline rule reaches the model', () =>
    assert.match(first.system[0].text, /Never invent one, and never promote an intention to real/));
  check('what it already knows is sent alongside', () => {
    const known = JSON.parse(first.system[1].text.replace(/^[^{]*/, ''));
    assert.ok(known.today);
    assert.ok(Array.isArray(known.real_deadlines));
  });
  check('every tool is offered', () => {
    const names = first.tools.map(t => t.name).sort();
    assert.deepEqual(names, ['change_files', 'find_files', 'note_state', 'read_file',
      'recall', 'remember', 'revise_item'].sort());
  });
  check('the tools carry real schemas', () => {
    const remember = first.tools.find(t => t.name === 'remember');
    assert.equal(remember.input_schema.type, 'object');
    assert.ok(remember.input_schema.properties.items);
  });

  check('the tool actually ran and memory changed', () => {
    const items = morrow.memory().items;
    assert.equal(items.length, 2);
    assert.equal(items[0].deadline.kind, 'real');
    assert.equal(items[1].stage, 'seed');
  });

  const second = seen[1];
  check('the tool result went back to the model', () => {
    const last = second.messages[second.messages.length - 1];
    assert.equal(last.role, 'user');
    const result = last.content.find(c => c.type === 'tool_result');
    assert.ok(result, 'expected a tool_result block');
    assert.match(JSON.stringify(result.content), /stored/);
  });
  check('the conversation carries forward', () =>
    assert.match(JSON.stringify(second.messages[0]), /pay my accountant/));

  const text = events.filter(e => e.event === 'text').map(e => e.data.delta);
  check('the reply streamed out in pieces', () => assert.ok(text.length >= 3));
  check('the reply reads as one sentence', () =>
    assert.match(text.join(''), /^Captured\. The accountant one has a real date/));
  check('the browser was told what Morrow was doing', () =>
    assert.ok(events.some(e => e.event === 'tool' && e.data.name === 'remember')));
  check('the turn was closed off', () =>
    assert.equal(events[events.length - 1].event, 'done'));
  check('the closing event refreshes the one line always on screen', () => {
    const done = events[events.length - 1].data;
    assert.ok(Array.isArray(done.deadlines));
    assert.equal(done.deadlines[0].text, 'pay the accountant');
    assert.equal(done.deadlines[0].date, '2026-09-30');
  });

  check('the exchange was written down', () => {
    const saved = JSON.parse(fs.readFileSync(process.env.MORROW_STORE, 'utf8'));
    assert.equal(saved.transcript.length, 2);
    assert.equal(saved.transcript[1].role, 'assistant');
  });

  stub.close();
  fs.rmSync(work, { recursive: true, force: true });
  console.log(failures ? '\n' + failures + ' failing check(s)' : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
