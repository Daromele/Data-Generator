/* Morrow — conversation layer. Text and voice share one memory and context. */

const mem = loadMemory();
const $ = sel => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let pending = null;   // { kind:'confirm-deadline'|'approve-activation'|'file-op', ... }
let speak = false;

/* ------------------------------------------------------------------ view */

function render() {
  renderStream();
  renderContextStrip();
  renderWhisper();
  saveMemory(mem);
}

function renderStream() {
  const stream = $('#stream');
  stream.innerHTML = '';
  for (const m of mem.messages.slice(-60)) {
    const row = el('div', 'msg ' + m.role);
    const bubble = el('div', 'bubble');
    bubble.innerHTML = m.html || escapeHtml(m.text).replace(/\n/g, '<br>');
    row.appendChild(bubble);
    stream.appendChild(row);
  }
  stream.scrollTop = stream.scrollHeight;
}

function renderContextStrip() {
  const c = mem.context;
  const strip = $('#context');
  strip.innerHTML = '';
  const bits = [];
  if (c.mode) bits.push(c.mode);
  if (c.energy) bits.push(c.energy + ' energy');
  if (c.minutes) bits.push(c.minutes + ' min');
  if (!bits.length) { strip.classList.add('empty'); return; }
  strip.classList.remove('empty');
  bits.forEach(b => strip.appendChild(el('span', 'chip', b)));
  const clear = el('button', 'chip clear', 'clear');
  clear.onclick = () => { mem.context = { mode: null, energy: null, minutes: null, updatedAt: null }; render(); };
  strip.appendChild(clear);
}

// The only thing allowed to sit permanently on screen: an approaching real deadline.
function renderWhisper() {
  const w = $('#whisper');
  const next = pressingDeadlines(mem, 14)[0];
  if (!next) { w.textContent = ''; w.hidden = true; return; }
  const d = next.days;
  const when = d < 0 ? `${-d} day${d === -1 ? '' : 's'} ago` :
    d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
  w.hidden = false;
  w.textContent = `${shorten(next.item.text)} — ${when}`;
}

const shorten = (t, n = 64) => t.length > n ? t.slice(0, n - 1).trim() + '…' : t;
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function say(text, html) {
  mem.messages.push({ role: 'morrow', text, html, at: new Date().toISOString() });
  render();
  if (speak && window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98; u.pitch = 1;
    speechSynthesis.speak(u);
  }
}

function heard(text) {
  mem.messages.push({ role: 'user', text, at: new Date().toISOString() });
  render();
}

/* --------------------------------------------------------------- intents */

const INTENTS = [
  { name: 'now', re: /(what (makes sense|should i do|can i do|fits)|what now|what's next|whats next|now mode)/i },
  { name: 'attention', re: /(what actually needs|needs my attention|what's urgent|whats urgent)/i },
  { name: 'forgetting', re: /(what am i forgetting|open loops|anything hanging|loose ends)/i },
  { name: 'thinkAloud', re: /(let me think out loud|brain ?dump|thinking out loud|can i ramble)/i },
  { name: 'capture', re: /^(capture|save|remember)( this)?( idea| thought)?[:,]?\s*/i },
  { name: 'ideas', re: /(show me( the)?( best)? ideas|ideas (i|I)('ve| have) had|idea garden|best ideas)/i },
  { name: 'mode', re: /(i feel like|i'm in the mood for|i want to spend today|today i want to)\s+(\w+)/i },
  { name: 'energy', re: /(no brainpower|no brain|exhausted|wiped|drained|low energy|knackered|tired|fried|resting|full of energy|feeling sharp|wired)/i },
  { name: 'time', re: /\b(\d{1,3})\s*(min|minute|minutes|hour|hours|hrs?)\b/i },
  { name: 'help', re: /^(help|what can you do)\b/i }
];

const MODE_WORDS = {
  design: 'designing', designing: 'designing', draw: 'designing', visual: 'designing',
  brainstorm: 'brainstorming', brainstorming: 'brainstorming', ideating: 'brainstorming',
  write: 'writing', writing: 'writing', research: 'researching', researching: 'researching',
  organise: 'organizing', organize: 'organizing', organizing: 'organizing', tidying: 'organizing',
  admin: 'admin', paperwork: 'admin', calls: 'communicating', talking: 'communicating',
  communicating: 'communicating', resting: 'resting', rest: 'resting', nothing: 'resting'
};

function detectIntents(text) {
  return INTENTS.filter(i => i.re.test(text)).map(i => i.name);
}

function updateContextFrom(text) {
  const t = text.toLowerCase();
  let touched = false;

  const modeMatch = t.match(/(?:i feel like|mood for|i want to)\s+([a-z]+)/);
  if (modeMatch && MODE_WORDS[modeMatch[1]]) { mem.context.mode = MODE_WORDS[modeMatch[1]]; touched = true; }
  else {
    for (const [w, m] of Object.entries(MODE_WORDS)) {
      if (new RegExp(`\\bfeel like ${w}`).test(t)) { mem.context.mode = m; touched = true; }
    }
  }

  if (/no brainpower|no brain|exhausted|wiped|drained|low energy|knackered|fried|tired/.test(t)) {
    mem.context.energy = 'low'; touched = true;
  } else if (/resting|need a break|done for (the day|today)/.test(t)) {
    mem.context.energy = 'resting'; touched = true;
  } else if (/full of energy|feeling sharp|wired|buzzing|fresh/.test(t)) {
    mem.context.energy = 'high'; touched = true;
  }

  const time = t.match(/\b(\d{1,3})\s*(min|minute|minutes|hour|hours|hrs?)\b/);
  if (time) {
    const n = parseInt(time[1], 10);
    mem.context.minutes = /hour|hr/.test(time[2]) ? n * 60 : n;
    touched = true;
  }
  if (touched) {
    mem.context.updatedAt = new Date().toISOString();
    mem.observations.push({ at: mem.context.updatedAt, mode: mem.context.mode, energy: mem.context.energy });
    if (mem.observations.length > 200) mem.observations.shift();
  }
  return touched;
}

/* ------------------------------------------------------------- responses */

function describeItem(i) {
  const bits = [];
  if (i.minutes) bits.push(`${i.minutes} min`);
  if (i.mode) bits.push(i.mode);
  if (i.deadline && i.deadline.kind === 'real') {
    const d = daysUntil(i.deadline.date);
    bits.push(d <= 0 ? 'due now' : `due in ${d} day${d === 1 ? '' : 's'}`);
  }
  return bits.join(' · ');
}

function optionsHtml(items, heading) {
  let html = heading ? `<p>${escapeHtml(heading)}</p>` : '';
  html += '<div class="options">';
  for (const i of items) {
    html += `<div class="option" data-id="${i.id}">
      <div class="option-text">${escapeHtml(shorten(i.text, 90))}</div>
      <div class="option-meta">${escapeHtml(describeItem(i))}</div>
      <div class="option-actions">
        <button data-act="start" data-id="${i.id}">start this</button>
        <button data-act="later" data-id="${i.id}">not now</button>
      </div>
    </div>`;
  }
  return html + '</div>';
}

function respondNow() {
  const ctx = mem.context;
  const picks = recommend(mem, ctx, 3);
  const pressing = pressingDeadlines(mem, 7);

  if (!picks.length && !pressing.length) {
    return say(ctx.energy === 'low' || ctx.energy === 'resting'
      ? "Nothing needs you right now. Resting is a legitimate answer today."
      : "Nothing stored is a good fit for this moment. We can leave it there, or you can talk and I'll listen.");
  }

  // Creative preference vs. a real deadline — name the tension, don't manufacture it.
  const clash = pressing.find(p => p.days <= 7 && ctx.mode && p.item.mode !== ctx.mode);
  if (clash && picks.length) {
    const d = clash.days;
    const line = `${ctx.mode ? capitalize(ctx.mode) : 'This'} fits your energy today. ` +
      `${shorten(clash.item.text, 50)} doesn't, but leaving it much longer makes ` +
      `${d <= 0 ? 'it late' : `the ${humanDate(clash.item.deadline.date)} date risky`}. ` +
      `Fifteen minutes on the blocker, then the rest of the session is yours.`;
    return say(line, `<p>${escapeHtml(line)}</p>` + optionsHtml(picks.slice(0, 2)));
  }

  const lead = summaryLead(ctx, picks.length);
  const held = blockedByEnergy(ctx);
  const line = held ? lead + ' ' + held : lead;
  say(line, `<p>${escapeHtml(lead)}</p>` + optionsHtml(picks) +
    (held ? `<p class="aside">${escapeHtml(held)}</p>` : ''));
}

function summaryLead(ctx, n) {
  const parts = [];
  if (ctx.mode && (ctx.energy === 'low' || ctx.energy === 'resting')) {
    parts.push(`${capitalize(ctx.mode)} mood, not much fuel`);
  } else if (ctx.energy === 'low') parts.push("You're running low");
  else if (ctx.mode) parts.push(`You're in a ${ctx.mode} mood`);
  if (ctx.minutes) parts.push(`${parts.length ? 'and ' : 'With '}${ctx.minutes} minutes`);
  const prefix = parts.length ? parts.join(', ') + '. ' : '';
  return `${prefix}${n === 1 ? 'One thing fits' : `${n} things fit`} right now.`;
}

// When the mood has work waiting but the energy for it isn't there, say so
// plainly rather than pretending the work doesn't exist.
function blockedByEnergy(ctx) {
  if (!ctx.mode || !(ctx.energy === 'low' || ctx.energy === 'resting')) return null;
  const held = mem.items.filter(i =>
    i.mode === ctx.mode && i.energy === 'high' &&
    i.status !== 'done' && i.status !== 'archived');
  if (!held.length) return null;
  return `There's ${ctx.mode} work waiting, but it wants more than you've got today. ` +
    `It'll keep.`;
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const NUM = ['no', 'One', 'Two', 'Three', 'Four', 'Five'];
const countWord = n => NUM[n] || String(n);
const humanDate = d => new Date(d + 'T00:00:00')
  .toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

function respondAttention() {
  const pressing = pressingDeadlines(mem, 21);
  if (!pressing.length) return say("Nothing external is pressing. Everything else can wait for the right mood.");
  const lines = pressing.slice(0, 3).map(p => {
    const d = p.days;
    return `${shorten(p.item.text, 60)} — ${d < 0 ? `${-d} days late` : d === 0 ? 'today' : `${d} days away`}`;
  });
  const text = `Only real dates count here. ${lines.join('. ')}.`;
  say(text, `<p>${escapeHtml('Only real dates count here.')}</p>` + optionsHtml(pressing.slice(0, 3).map(p => p.item)));
}

function respondForgetting() {
  const loops = openLoops(mem);
  if (!loops.length) return say("Nothing is hanging that I can see. No hidden pile.");
  const needs = loops.filter(i => i.needsConfirmation);
  const text = `${countWord(loops.length)} open loop${loops.length === 1 ? '' : 's'}` +
    (needs.length ? `, and ${needs.length} still need${needs.length === 1 ? 's' : ''} a real date from you.` : '.');
  say(text, `<p>${escapeHtml(text)}</p>` + optionsHtml(loops.slice(0, 3)));
}

function respondIdeas(query) {
  const found = query ? searchIdeas(mem, query) : resurfaceIdeas(mem, 3);
  if (!found.length) {
    return say(query
      ? "Nothing captured on that yet."
      : "No idea is asking for attention right now. They're safe where they are.");
  }
  const text = query
    ? `${countWord(found.length)} idea${found.length === 1 ? '' : 's'} on that.`
    : `${countWord(found.length)} older idea${found.length === 1 ? '' : 's'} still look${found.length === 1 ? 's' : ''} unusually strong next to what you're working on. Want to revisit one?`;
  let html = `<p>${escapeHtml(text)}</p><div class="options">`;
  for (const i of found) {
    html += `<div class="option">
      <div class="option-text">${escapeHtml(shorten(i.text, 90))}</div>
      <div class="option-meta">${escapeHtml(i.stage || 'seed')} · captured ${timeAgo(i.createdAt)}</div>
      <div class="option-actions">
        <button data-act="promote" data-id="${i.id}">explore</button>
        <button data-act="bet" data-id="${i.id}">active bet</button>
        <button data-act="archive" data-id="${i.id}">archive</button>
      </div></div>`;
  }
  say(text, html + '</div>');
}

function timeAgo(isoStr) {
  const d = Math.floor((Date.now() - new Date(isoStr)) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
}

/* -------------------------------------------------------------- captures */

function captureDump(text, { announce = true } = {}) {
  const items = classifyBrainDump(text);
  if (!items.length) return [];
  mem.items.push(...items);

  const unconfirmed = items.find(i => i.needsConfirmation);
  let line = digest(items);

  if (unconfirmed) {
    pending = { kind: 'confirm-deadline', id: unconfirmed.id };
    line += ` One thing sounds like a real commitment — does "${shorten(unconfirmed.text, 50)}" have an actual date, or is it open?`;
  } else if (mem.context.energy === 'low' || mem.context.energy === 'resting') {
    line += " Since you're running low, none of it became active work.";
  }
  if (announce) say(line);
  return items;
}

function handleConfirmDeadline(text) {
  const item = mem.items.find(i => i.id === pending.id);
  pending = null;
  if (!item) return;
  const when = findDate(text);
  if (when) {
    item.deadline = { date: when.date, kind: 'real', phrase: when.phrase };
    item.needsConfirmation = false;
    say(`Locked in: ${when.date}. I'll protect that one and tell you before it gets tight.`);
  } else if (/no|open|not really|no date|whenever|flexible/i.test(text)) {
    item.needsConfirmation = false;
    item.deadline = null;
    say("Then it stays a commitment without a date. No countdown, no nagging.");
  } else {
    captureDump(text);
  }
  render();
}

/* ---------------------------------------------------------------- routing */

function handle(text) {
  const raw = text.trim();
  if (!raw) return;
  heard(raw);

  if (pending && pending.kind === 'confirm-deadline') return handleConfirmDeadline(raw);

  const intents = detectIntents(raw);
  const contextChanged = updateContextFrom(raw);

  if (intents.includes('help')) {
    return say("Talk to me the way you'd talk to a person. Tell me what you're in the mood for, dump everything on your mind, ask what makes sense right now, or ask what you're forgetting. I keep everything and show almost none of it.");
  }

  if (intents.includes('thinkAloud')) {
    thinkAloud.start();
    return say("Go ahead. I'm listening, not filing. Tell me when you're done.");
  }

  if (thinkAloud.active) return thinkAloud.collect(raw);

  if (intents.includes('capture')) {
    const body = raw.replace(INTENTS.find(i => i.name === 'capture').re, '');
    const items = captureDump(body || raw, { announce: false });
    const idea = items.find(i => i.kind === 'idea') || items[0];
    if (idea && idea.kind !== 'idea') { idea.kind = 'idea'; idea.stage = 'seed'; idea.status = 'seed'; }
    return say("Saved as a seed. It doesn't have to become anything.");
  }

  if (intents.includes('ideas')) {
    const about = raw.match(/about (.+)$/i);
    return respondIdeas(about ? about[1] : null);
  }
  if (intents.includes('forgetting')) return respondForgetting();
  if (intents.includes('attention')) return respondAttention();
  if (intents.includes('now')) return respondNow();

  // A statement of mood/energy/time on its own is a request for a recommendation.
  if (contextChanged && raw.split(/\s+/).length < 16) {
    render();
    return respondNow();
  }

  // Everything else is material: capture it, classify it, show a digest.
  captureDump(raw);
}

/* Thinking-aloud mode: listen first, classify only after the user finishes. */
const thinkAloud = {
  active: false,
  buffer: [],
  start() { this.active = true; this.buffer = []; },
  collect(text) {
    if (/\b(that's it|thats it|i'm done|im done|done|finished|that's everything|thats everything)\b/i.test(text)
        && text.split(/\s+/).length < 8) {
      return this.finish();
    }
    this.buffer.push(text);
    const acks = ['Mm.', 'Go on.', 'With you.', 'Noted.', 'Keep going.'];
    say(acks[this.buffer.length % acks.length]);
  },
  finish() {
    this.active = false;
    const text = this.buffer.join('. ');
    this.buffer = [];
    if (!text) return say("Nothing to sort. That's fine too.");
    captureDump(text);
  }
};

/* ------------------------------------------------------------ item actions */

function onOptionClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const item = mem.items.find(i => i.id === btn.dataset.id);
  if (!item) return;
  switch (btn.dataset.act) {
    case 'start':
      item.status = 'active';
      say(`Going. I'll keep everything else out of the way.`);
      break;
    case 'later':
      item.status = 'stored';
      item.snoozedAt = new Date().toISOString();
      say("Left where it was. No penalty.");
      break;
    case 'promote':
      item.stage = item.stage === 'seed' ? 'explore' : 'candidate';
      say(`Moved to ${item.stage}. Worth a short session, nothing more.`);
      break;
    case 'bet':
      item.stage = 'active'; item.status = 'active';
      say("That's an active bet now. One of very few.");
      break;
    case 'archive':
      item.status = 'archived'; item.stage = 'archive';
      say("Archived, not deleted. It's still there if it comes back around.");
      break;
  }
  render();
}

/* ------------------------------------------------------------------ voice */

function setupVoice() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('#mic');
  if (!Rec) { micBtn.disabled = true; micBtn.title = 'Voice input not supported in this browser'; return; }
  const rec = new Rec();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = navigator.language || 'en-GB';
  let listening = false;

  rec.onresult = ev => {
    const said = Array.from(ev.results).map(r => r[0].transcript).join(' ').trim();
    if (said) handle(said);
  };
  rec.onend = () => { listening = false; micBtn.classList.remove('on'); };
  rec.onerror = () => { listening = false; micBtn.classList.remove('on'); };

  micBtn.onclick = () => {
    if (listening) { rec.stop(); return; }
    listening = true; micBtn.classList.add('on');
    speak = true;                    // voice in, voice out — same memory either way
    try { rec.start(); } catch (e) { listening = false; micBtn.classList.remove('on'); }
  };
}

/* ------------------------------------------------------------------- boot */

// Mood and energy describe a moment, not a setting. Anything older than a few
// hours is forgotten rather than held against the user.
function expireContext() {
  const at = mem.context.updatedAt;
  if (!at) return;
  if (Date.now() - new Date(at).getTime() > 6 * 3600 * 1000) {
    mem.context = { mode: null, energy: null, minutes: null, updatedAt: null };
  }
}

function boot() {
  expireContext();
  const form = $('#composer');
  const input = $('#input');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    input.style.height = 'auto';
    handle(v);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  });
  $('#stream').addEventListener('click', onOptionClick);
  $('#speak').addEventListener('click', e => {
    speak = !speak;
    e.currentTarget.classList.toggle('on', speak);
    if (!speak && window.speechSynthesis) speechSynthesis.cancel();
  });
  setupVoice();

  if (!mem.messages.length) {
    say("I'm here. Tell me what's on your mind, or what you're in the mood for. I'll keep everything and show you almost none of it.");
  } else {
    render();
    const resurfaced = resurfaceIdeas(mem, 3);
    const pressing = pressingDeadlines(mem, 3);
    if (pressing.length) respondAttention();
    else if (resurfaced.length && Math.random() < 0.3) respondIdeas(null);
  }
}

document.addEventListener('DOMContentLoaded', boot);
