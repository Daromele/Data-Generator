#!/usr/bin/env node
/* Morrow - the agent.
 *
 *   ANTHROPIC_API_KEY=... node agent.js ~/Projects ~/Design
 *
 * Claude does the understanding. This file gives it a memory it can read and
 * write, a sandboxed view of the folders you approve, and a room to talk in.
 * There is no keyword matching anywhere in here: what counts as a commitment,
 * an idea or a passing thought is the model's judgement, made against the
 * instructions in PERSONA and the memory it can see.
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const Anthropic = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');

const MODEL = 'claude-opus-5';
const PORT = process.env.MORROW_PORT ? Number(process.env.MORROW_PORT) : 4471;
const HOME = process.env.HOME || process.env.USERPROFILE || os.homedir();
const STORE = process.env.MORROW_STORE || path.join(HOME, '.morrow', 'memory.json');

const expand = p => String(p).replace(/^~(?=$|[\\/])/, HOME);
const uid = () => crypto.randomBytes(6).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);

/* ============================================================== memory ==== */

const EMPTY = { items: [], transcript: [], context: {}, observations: [] };

function load() {
  try {
    return Object.assign({}, EMPTY, JSON.parse(fs.readFileSync(STORE, 'utf8')));
  } catch (e) {
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

let memory = load();

function save() {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(memory, null, 2));
}

const daysUntil = date => {
  if (!date) return null;
  const a = new Date(date + 'T00:00:00');
  const b = new Date(today() + 'T00:00:00');
  return Math.round((a - b) / 86400000);
};

/* Everything the model may know without asking: counts, not contents. The
   point of Morrow is that most of what is stored stays out of sight, and that
   applies to its own context window too. */
function snapshot() {
  const live = memory.items.filter(i => i.status !== 'archived' && i.status !== 'done');
  const byKind = {};
  live.forEach(i => { byKind[i.kind] = (byKind[i.kind] || 0) + 1; });
  const real = live
    .filter(i => i.deadline && i.deadline.kind === 'real')
    .map(i => ({ id: i.id, text: i.text, date: i.deadline.date, in_days: daysUntil(i.deadline.date) }))
    .sort((a, b) => a.in_days - b.in_days)
    .slice(0, 8);
  return {
    today: today(),
    weekday: new Date().toLocaleDateString('en-GB', { weekday: 'long' }),
    stored_counts: byKind,
    real_deadlines: real,
    active_now: live.filter(i => i.status === 'active').map(i => ({ id: i.id, text: i.text })),
    current_context: memory.context || {},
    approved_folders: roots
  };
}

/* ============================================================ boundary ==== */

const roots = process.argv.slice(2).map(p => path.resolve(expand(p)));
for (const r of roots) {
  if (!fs.existsSync(r) || !fs.statSync(r).isDirectory()) {
    console.error('Not a folder: ' + r);
    process.exit(1);
  }
}

// Only paths inside an approved root are reachable. Symlinks are resolved as
// far as the path exists, so a link cannot walk out. The model cannot widen
// this: it is checked here, on every call, not described in the prompt.
function resolveInside(requested) {
  if (!roots.length) {
    const err = new Error('No folders approved. Start Morrow with folder paths to give it file access.');
    err.code = 'NO_ROOTS';
    throw err;
  }
  const abs = path.resolve(expand(requested));
  let probe = abs;
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  const finalPath = path.join(real, path.relative(probe, abs));
  const ok = roots.some(root => {
    const realRoot = fs.realpathSync(root);
    return finalPath === realRoot || finalPath.startsWith(realRoot + path.sep);
  });
  if (!ok) {
    const err = new Error('Outside the approved folders: ' + requested);
    err.code = 'OUT_OF_BOUNDS';
    throw err;
  }
  return finalPath;
}

const SKIP = new Set(['node_modules', '.git', '.cache', 'Library', '.Trash']);

async function walk(dir, out = [], depth = 0) {
  if (depth > 8 || out.length > 5000) return out;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { out.push({ path: full, dir: true }); await walk(full, out, depth + 1); }
    else if (e.isFile()) out.push({ path: full, dir: false });
  }
  return out;
}

/* ====================================================== the live channel === */

// One person, one conversation, on localhost. `channel` is the open SSE stream.
let channel = null;
let watcher = null;      // a test can listen in on what the browser would see
const emit = (event, data) => {
  if (watcher) watcher(event, data);
  if (channel) channel.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
};

const approvals = new Map();

// Human-in-the-loop, enforced in the tool rather than asked for in the prompt:
// run() does not return until the person answers, so the model cannot proceed
// on its own say-so.
function askApproval(op, preview) {
  const token = uid();
  emit('approval', { token, op, preview });
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      approvals.delete(token);
      resolve({ approved: false, reason: 'No answer, so nothing was changed.' });
    }, 10 * 60 * 1000);
    approvals.set(token, verdict => { clearTimeout(timer); approvals.delete(token); resolve(verdict); });
  });
}

/* ================================================================ tools === */

const announce = (name, detail) => emit('tool', { name, detail });

const remember = betaTool({
  name: 'remember',
  description:
    'Store one or more things the person said. Use this for anything worth keeping: ' +
    'commitments, possible actions, ideas, reflections, questions, decisions. ' +
    'Storing is not activating - nothing you store here appears in front of them ' +
    'until they ask or you surface it deliberately. Prefer storing too much over too little.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'text'],
          properties: {
            kind: {
              type: 'string',
              enum: ['commitment', 'action', 'idea', 'reflection', 'question', 'decision'],
              description: 'What this actually is. A commitment is owed to someone or something outside them.'
            },
            text: { type: 'string', description: 'The thought, in their words where possible.' },
            deadline_date: { type: 'string', description: 'YYYY-MM-DD, only if a date genuinely applies.' },
            deadline_kind: {
              type: 'string',
              enum: ['real', 'intention'],
              description: 'real = imposed from outside with consequences. intention = their own target. ' +
                'Never mark something real unless something external imposes it.'
            },
            mode: {
              type: 'string',
              enum: ['designing', 'brainstorming', 'writing', 'researching', 'organizing',
                'communicating', 'admin', 'resting'],
              description: 'The kind of headspace this needs.'
            },
            energy: { type: 'string', enum: ['high', 'medium', 'low'] },
            minutes: { type: 'number', description: 'Rough estimate. Infer it; never ask.' },
            stage: {
              type: 'string',
              enum: ['seed', 'explore', 'candidate', 'active', 'archive'],
              description: 'Ideas only. Default seed. Almost nothing should start above seed.'
            },
            needs_date: {
              type: 'boolean',
              description: 'True when this sounds like a real commitment but no date was given, ' +
                'so you intend to ask rather than invent one.'
            },
            tags: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  },
  run: async ({ items }) => {
    const stored = items.map(i => {
      const item = {
        id: uid(),
        kind: i.kind,
        text: i.text,
        createdAt: new Date().toISOString(),
        status: i.kind === 'idea' ? 'seed' : 'stored',
        stage: i.kind === 'idea' ? (i.stage || 'seed') : null,
        deadline: i.deadline_date ? { date: i.deadline_date, kind: i.deadline_kind || 'intention' } : null,
        needsDate: !!i.needs_date,
        mode: i.mode || null,
        energy: i.energy || 'medium',
        minutes: i.minutes || null,
        tags: i.tags || []
      };
      memory.items.push(item);
      return { id: item.id, kind: item.kind, text: item.text };
    });
    save();
    announce('remember', stored.length + ' kept');
    return JSON.stringify({ stored });
  }
});

const recall = betaTool({
  name: 'recall',
  description:
    'Search the memory. Use it before answering anything about what they have, what is due, ' +
    'what they might work on, or what they have thought about a subject. Returns compact records - ' +
    'read them, then decide what is worth showing. Showing everything you find is a failure.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', description: 'Free text matched against the stored thoughts and tags.' },
      kind: {
        type: 'array',
        items: { type: 'string', enum: ['commitment', 'action', 'idea', 'reflection', 'question', 'decision'] }
      },
      status: { type: 'array', items: { type: 'string', enum: ['stored', 'seed', 'active', 'archived', 'done'] } },
      stage: { type: 'array', items: { type: 'string', enum: ['seed', 'explore', 'candidate', 'active', 'archive'] } },
      mode: { type: 'string' },
      max_energy: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Exclude anything needing more than this.' },
      max_minutes: { type: 'number' },
      real_deadline_within_days: { type: 'number', description: 'Only items with a real deadline inside this window.' },
      needs_date: { type: 'boolean', description: 'Only commitments still missing a real date.' },
      older_than_days: { type: 'number' },
      limit: { type: 'number', description: 'Default 20.' }
    }
  },
  run: async (q) => {
    const rank = { low: 1, medium: 2, high: 3 };
    let out = memory.items.slice();

    if (q.kind && q.kind.length) out = out.filter(i => q.kind.includes(i.kind));
    if (q.status && q.status.length) out = out.filter(i => q.status.includes(i.status));
    if (q.stage && q.stage.length) out = out.filter(i => q.stage.includes(i.stage));
    if (q.mode) out = out.filter(i => i.mode === q.mode);
    if (q.max_energy) out = out.filter(i => (rank[i.energy] || 2) <= rank[q.max_energy]);
    if (q.max_minutes) out = out.filter(i => !i.minutes || i.minutes <= q.max_minutes);
    if (q.needs_date) out = out.filter(i => i.needsDate);
    if (typeof q.real_deadline_within_days === 'number') {
      out = out.filter(i => {
        if (!i.deadline || i.deadline.kind !== 'real') return false;
        const d = daysUntil(i.deadline.date);
        return d !== null && d <= q.real_deadline_within_days;
      });
    }
    if (q.older_than_days) {
      const cut = Date.now() - q.older_than_days * 86400000;
      out = out.filter(i => new Date(i.createdAt).getTime() < cut);
    }
    if (q.query) {
      const terms = q.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      out = out.map(i => {
        const hay = (i.text + ' ' + (i.tags || []).join(' ')).toLowerCase();
        return { i, n: terms.filter(t => hay.includes(t)).length };
      }).filter(x => x.n > 0).sort((a, b) => b.n - a.n).map(x => x.i);
    }

    const results = out.slice(0, q.limit || 20).map(i => ({
      id: i.id, kind: i.kind, text: i.text, status: i.status, stage: i.stage,
      mode: i.mode, energy: i.energy, minutes: i.minutes,
      deadline: i.deadline, needs_date: i.needsDate || undefined,
      age_days: Math.floor((Date.now() - new Date(i.createdAt).getTime()) / 86400000),
      in_days: i.deadline ? daysUntil(i.deadline.date) : undefined
    }));
    announce('recall', results.length + ' found');
    return JSON.stringify({ found: out.length, showing: results.length, results });
  }
});

const reviseItem = betaTool({
  name: 'revise_item',
  description:
    'Change something already stored: activate it, put it back, move an idea between stages, ' +
    'attach or correct a date, mark it done, or archive it. Archiving never deletes. ' +
    'Only set a real deadline when the person has confirmed the date.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['stored', 'seed', 'active', 'archived', 'done'] },
      stage: { type: 'string', enum: ['seed', 'explore', 'candidate', 'active', 'archive'] },
      kind: { type: 'string', enum: ['commitment', 'action', 'idea', 'reflection', 'question', 'decision'] },
      deadline_date: { type: 'string', description: 'YYYY-MM-DD, or "none" to remove it.' },
      deadline_kind: { type: 'string', enum: ['real', 'intention'] },
      text: { type: 'string' },
      minutes: { type: 'number' },
      energy: { type: 'string', enum: ['high', 'medium', 'low'] },
      mode: { type: 'string' }
    }
  },
  run: async (u) => {
    const item = memory.items.find(i => i.id === u.id);
    if (!item) return JSON.stringify({ error: 'No item with that id.' });
    if (u.status) item.status = u.status;
    if (u.stage) item.stage = u.stage;
    if (u.kind) item.kind = u.kind;
    if (u.text) item.text = u.text;
    if (u.minutes) item.minutes = u.minutes;
    if (u.energy) item.energy = u.energy;
    if (u.mode) item.mode = u.mode;
    if (u.deadline_date === 'none') { item.deadline = null; item.needsDate = false; }
    else if (u.deadline_date) {
      item.deadline = { date: u.deadline_date, kind: u.deadline_kind || item.deadline?.kind || 'intention' };
      item.needsDate = false;
    }
    save();
    announce('revise_item', item.kind);
    return JSON.stringify({ updated: { id: item.id, kind: item.kind, status: item.status, stage: item.stage, deadline: item.deadline } });
  }
});

const noteState = betaTool({
  name: 'note_state',
  description:
    'Record how they are right now - mood, energy, time available - when they tell you, ' +
    'directly or in passing. This is a moment, not a setting; it decays on its own.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      mode: { type: 'string', enum: ['designing', 'brainstorming', 'writing', 'researching',
        'organizing', 'communicating', 'admin', 'resting'] },
      energy: { type: 'string', enum: ['high', 'medium', 'low'] },
      minutes: { type: 'number' },
      note: { type: 'string', description: 'Anything worth remembering about their patterns.' }
    }
  },
  run: async (state) => {
    memory.context = Object.assign({}, memory.context, state, { at: new Date().toISOString() });
    memory.observations.push(Object.assign({ at: new Date().toISOString() }, state));
    if (memory.observations.length > 400) memory.observations.shift();
    save();
    emit('state', memory.context);
    announce('note_state', [state.mode, state.energy, state.minutes && state.minutes + ' min']
      .filter(Boolean).join(' · '));
    return JSON.stringify({ context: memory.context });
  }
});

/* --------------------------------------------------------------- files --- */

const findFiles = betaTool({
  name: 'find_files',
  description: 'Search the approved folders by filename or by what is inside text files. ' +
    'Reading and searching need no permission.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: { type: 'string' },
      in_contents: { type: 'boolean', description: 'Search inside text files rather than filenames.' },
      folder: { type: 'string', description: 'Restrict to one approved folder or subfolder.' },
      limit: { type: 'number' }
    }
  },
  run: async ({ query, in_contents, folder, limit }) => {
    const base = resolveInside(folder || roots[0]);
    const all = await walk(base);
    const q = String(query).toLowerCase();
    const cap = limit || 30;
    let results;
    if (in_contents) {
      results = [];
      for (const f of all.filter(x => !x.dir)) {
        if (results.length >= cap) break;
        let stat; try { stat = await fsp.stat(f.path); } catch { continue; }
        if (stat.size > 2000000) continue;
        let text; try { text = await fsp.readFile(f.path, 'utf8'); } catch { continue; }
        if (text.includes(String.fromCharCode(0))) continue;   // binary, skip
        const line = text.split('\n').find(l => l.toLowerCase().includes(q));
        if (line) results.push({ path: f.path, line: line.trim().slice(0, 200) });
      }
    } else {
      results = all.filter(f => path.basename(f.path).toLowerCase().includes(q))
        .slice(0, cap).map(f => ({ path: f.path, dir: f.dir }));
    }
    announce('find_files', results.length + ' matched');
    return JSON.stringify({ count: results.length, results });
  }
});

const readFile = betaTool({
  name: 'read_file',
  description: 'Read a text file inside an approved folder.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['file'],
    properties: { file: { type: 'string' } }
  },
  run: async ({ file }) => {
    const target = resolveInside(file);
    const text = await fsp.readFile(target, 'utf8');
    announce('read_file', path.basename(target));
    return JSON.stringify({
      path: target,
      truncated: text.length > 200000 || undefined,
      content: text.slice(0, 200000)
    });
  }
});

const changeFiles = betaTool({
  name: 'change_files',
  description:
    'Create a folder, copy, move, rename, or write a new file inside the approved folders. ' +
    'The person sees exactly what you propose and must approve it before anything happens - ' +
    'so describe the change plainly. Existing files are never overwritten, and nothing is ' +
    'ever deleted; move things aside instead.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['operations'],
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['op'],
          properties: {
            op: { type: 'string', enum: ['mkdir', 'copy', 'move', 'rename', 'write'] },
            from: { type: 'string' },
            to: { type: 'string' },
            file: { type: 'string' },
            name: { type: 'string' },
            dir: { type: 'string' },
            content: { type: 'string' }
          }
        }
      },
      why: { type: 'string', description: 'One line the person will read: what this is for.' }
    }
  },
  run: async ({ operations, why }) => {
    const planned = [];
    for (const o of operations) {
      try {
        if (o.op === 'mkdir') {
          const t = resolveInside(o.dir);
          mustNotExist(t);
          planned.push({ op: o.op, preview: 'Create folder ' + t, run: () => fsp.mkdir(t, { recursive: true }) });
        } else if (o.op === 'copy' || o.op === 'move') {
          const src = resolveInside(o.from), dst = resolveInside(o.to);
          await fsp.stat(src);
          mustNotExist(dst);
          planned.push({
            op: o.op,
            preview: (o.op === 'copy' ? 'Copy ' : 'Move ') + src + '  ->  ' + dst,
            run: () => o.op === 'copy'
              ? fsp.cp(src, dst, { recursive: true, errorOnExist: true, force: false })
              : fsp.rename(src, dst)
          });
        } else if (o.op === 'rename') {
          const src = resolveInside(o.file);
          if (/[\\/]/.test(String(o.name))) throw new Error('A new name cannot contain a path separator.');
          const dst = resolveInside(path.join(path.dirname(src), o.name));
          mustNotExist(dst);
          planned.push({ op: o.op, preview: 'Rename ' + path.basename(src) + ' -> ' + o.name + '  (in ' + path.dirname(src) + ')', run: () => fsp.rename(src, dst) });
        } else if (o.op === 'write') {
          const t = resolveInside(o.file);
          mustNotExist(t);
          planned.push({ op: o.op, preview: 'Create file ' + t + '  (' + Buffer.byteLength(o.content || '') + ' bytes)', run: () => fsp.writeFile(t, o.content || '', { flag: 'wx' }) });
        }
      } catch (e) {
        return JSON.stringify({ refused: e.message, code: e.code || 'ERROR' });
      }
    }

    const verdict = await askApproval(why || 'File changes', planned.map(p => p.preview));
    if (!verdict.approved) {
      announce('change_files', 'declined');
      return JSON.stringify({ done: false, reason: verdict.reason || 'They said no. Do not try again unless asked.' });
    }
    for (const p of planned) await p.run();
    announce('change_files', planned.length + ' applied');
    return JSON.stringify({ done: true, applied: planned.map(p => p.preview) });
  }
});

function mustNotExist(target) {
  if (fs.existsSync(target)) {
    const err = new Error('Already exists, and Morrow never overwrites: ' + target);
    err.code = 'WOULD_OVERWRITE';
    throw err;
  }
}

const TOOLS = [remember, recall, reviseItem, noteState, findFiles, readFile, changeFiles];

/* =============================================================== persona == */

const PERSONA = `You are Morrow, a personal assistant for someone whose mind does not get
on with planners, rigid schedules, invented deadlines or long lists.

Your promise: capture freely, display selectively, protect what truly matters.

WHO YOU ARE TALKING TO
They generate a lot of ideas - some bad, some good, occasionally something exceptional.
They work by mood, creative energy and available attention, not by schedule. Adding things
to a system is easy for them, which is exactly how every previous system became a bloated
pile they abandoned. They need to talk normally and have it handled, not maintain anything.

HOW YOU BEHAVE
- Store far more than you show. Use remember generously; it is invisible until you surface it.
- Never show a list of everything. At most three options at a time. If a recall returns
  twenty things, that is context for you, not output for them.
- Never invent urgency. No counters, no overdue tallies, no nagging, no cheerfulness about
  productivity. Never shame them for something undone - a missed intention is information,
  not a failure.
- An idea is an idea. It does not become a project because they said it out loud.
- Thinking aloud is not instruction. If they are rambling, listen: acknowledge briefly, keep
  storing, and only sort it into a digest when they have finished.
- Follow their energy unless a real commitment is genuinely at risk. When creative preference
  and a real deadline collide, say so plainly and propose a trade - a short block on the
  blocker, the rest of the session protected for what they actually want to do.
- Be candid when consequences are real. Warm, calm, and brief the rest of the time.
- It is a complete answer to say something does not need to become a task, or that resting
  is the right call.

THE TWO KINDS OF DATES - THE RULE YOU MUST NOT BEND
A REAL deadline is imposed from outside and has consequences: tax dates, bills, appointments,
flights, applications, legal and government dates, client work, a promise made to a person.
Protect these. They are the only thing allowed to create pressure.
An INTENTION is a target they set themselves ("I'd like to finish this next week"). Guidance
only. It never becomes overdue and you never nag about it. Help them renegotiate it freely.
If something sounds like a real commitment but no date was given, store it with needs_date
and ASK for the date in your reply. Never invent one, and never promote an intention to real.

TOOLS
Call remember for anything worth keeping - do it silently, as part of answering.
Call recall before you claim anything about what they have; never answer from memory alone.
Call note_state whenever they reveal mood, energy or available time, even in passing.
Call revise_item when something changes state. Archive, never delete.
File tools work only in folders they have approved. Reading and searching are free; anything
that creates, copies, moves or renames goes through change_files, which shows them the exact
change and waits for their approval. If they decline, drop it.

VOICE
Short. Plain. No corporate productivity language, no exclamation marks, no emoji, no bullet
lists unless they asked for one. Two or three sentences is usually the whole reply. When you
have captured a brain dump, give a brief digest of what you took and what you did NOT turn
into work - the reassurance matters more than the detail.`;

/* ================================================================= loop === */

const client = new Anthropic();

function history() {
  return memory.transcript.slice(-40);
}

async function respond(userText) {
  memory.transcript.push({ role: 'user', content: userText });

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    stream: true,
    system: [
      { type: 'text', text: PERSONA, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'What you already know right now:\n' + JSON.stringify(snapshot(), null, 1) }
    ],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    tools: TOOLS,
    messages: history()
  });

  let spoken = '';
  for await (const stream of runner) {
    stream.on('text', delta => { spoken += delta; emit('text', { delta }); });
    const message = await stream.finalMessage();
    if (message.stop_reason === 'pause_turn') {
      runner.pushMessages({ role: 'assistant', content: message.content });
    }
    if (message.stop_reason === 'refusal') {
      emit('text', { delta: "I can't help with that one." });
    }
  }

  memory.transcript.push({ role: 'assistant', content: spoken || '(no reply)' });
  if (memory.transcript.length > 200) memory.transcript = memory.transcript.slice(-200);
  save();
  // The one persistent line on screen tracks whatever just changed.
  emit('done', { text: spoken, deadlines: snapshot().real_deadlines });
}

/* =============================================================== server === */

const page = () => fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page());
  }

  if (url.pathname === '/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    res.write(': open\n\n');
    channel = res;
    emit('ready', { transcript: memory.transcript.slice(-40), context: memory.context || {},
      deadlines: snapshot().real_deadlines, folders: roots });
    req.on('close', () => { if (channel === res) channel = null; });
    return;
  }

  if (url.pathname === '/say' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    let text = '';
    try { text = JSON.parse(body).text || ''; } catch { return; }
    if (!text.trim()) return;
    try {
      await respond(text.trim());
    } catch (e) {
      console.error(e);
      emit('error', { message: e.message });
      emit('done', {});
    }
    return;
  }

  if (url.pathname === '/approve' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let decision = {};
    try { decision = JSON.parse(body); } catch {}
    const resolve = approvals.get(decision.token);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: !!resolve }));
    if (resolve) resolve({ approved: !!decision.approved });
    return;
  }

  res.writeHead(404).end('Not found');
});

/* Requiring this file gives you the parts without starting anything, so the
   tools and the boundary can be exercised directly. See test-morrow.js. */
module.exports = {
  TOOLS, resolveInside, approvals, snapshot, daysUntil, respond,
  onEmit: fn => { watcher = fn; },
  memory: () => memory,
  reset: () => { memory = JSON.parse(JSON.stringify(EMPTY)); },
  roots
};

if (require.main !== module) return;

server.listen(PORT, '127.0.0.1', () => {
  console.log('Morrow is listening on http://127.0.0.1:' + PORT);
  console.log('Memory: ' + STORE);
  console.log(roots.length
    ? 'Approved folders:\n  ' + roots.join('\n  ')
    : 'No folders approved - file tools are off. Pass folder paths to turn them on.');
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log('\nNo ANTHROPIC_API_KEY found. Set one, or run `ant auth login`.');
  }
});
