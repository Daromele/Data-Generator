# Morrow

A context-aware personal assistant that captures everything, hides the noise,
protects real commitments, preserves valuable ideas, follows your creative
energy, and surfaces only what is useful right now.

**Capture freely. Display selectively. Protect what truly matters.**

Morrow is an agent, not an app with a chat box bolted on. Claude does the
understanding; memory is a set of tools it reads and writes. There is no
keyword matching anywhere in the codebase — what counts as a real commitment,
an idea, or thinking aloud is judgement, made fresh each time against the
instructions in `PERSONA` and the memory it can see.

## Running it

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...        # or: ant auth login
node agent.js ~/Projects ~/Design/Assets   # folders are optional
```

Open http://127.0.0.1:4471. Talk or type — voice and text share one
conversation, one memory, one context.

Folder arguments are the only file access Morrow ever has. Pass none and the
file tools are simply off.

| Variable | Default |
| --- | --- |
| `ANTHROPIC_API_KEY` | required (or an `ant auth login` profile) |
| `MORROW_MODEL` | `claude-sonnet-5` |
| `MORROW_PORT` | `4471` |
| `MORROW_STORE` | `~/.morrow/memory.json` |

## What's here

| File | What it is |
| --- | --- |
| `agent.js` | The agent: memory, tools, the folder boundary, the model loop, and the server. |
| `index.html` | The interface. It decides nothing — it carries what you say to the agent and renders what streams back. |
| `test-morrow.js` | 28 checks: memory tools, the folder boundary, the approval gate, the server. |
| `test-loop.js` | 18 checks: the whole agent loop against a stub API — request shape, tool execution, results returned, text streamed. Spends no tokens. |

```bash
npm test          # both suites
```

## How it thinks

**Two kinds of dates, and only one may create pressure.** A date is *real*
only when something outside you imposes it — taxes, bills, appointments,
flights, applications, client work, a promise to a person. Those are protected
and get the single persistent line on screen. A date you set yourself is an
*intention*: guidance, never overdue, never nagged about. If something sounds
like a real commitment but carries no date, Morrow asks — it will not invent
one, and it will not promote an intention to real.

**It stores far more than it shows.** Capturing is invisible. A `recall` that
returns twenty things is context for the model, not output for you; showing
all twenty is treated as a failure. At most three options at a time.

**It follows your energy** unless a real commitment is genuinely at risk — and
when creative preference and a real deadline collide, it says so plainly and
proposes a trade rather than burying either one.

**Ideas stay ideas**: seed → explore → candidate → active bet → archive.
Nothing is ever deleted; archived means archived.

## The file tools

Reading and searching approved folders need no permission. Anything that
creates, copies, moves or renames goes through one gate:

- Only paths inside an approved folder resolve. Symlinks are resolved, so a
  link cannot walk out. This is enforced in code on every call — the model
  cannot widen it, and the prompt is not what keeps it closed.
- Every change is shown to you as an exact preview and **waits**. The tool
  call does not return until you answer, so the model cannot proceed on its
  own say-so. No answer within ten minutes means no.
- Existing files are never overwritten.
- There is no delete operation. Move things aside instead.

## Cost

Every message is a Claude Sonnet 5 call with adaptive thinking. The system
prompt is marked cacheable and Morrow sends counts rather than contents, so
the per-turn input stays small.

For deeper reasoning — better judgement on a messy brain dump, sharper calls
on what to surface — run it on Opus:

```bash
MORROW_MODEL=claude-opus-5 node agent.js ~/Projects
```

Opus costs roughly 2.5x Sonnet per token. Anything on the Opus or Fable tier
also gets server-side refusal fallbacks automatically; Sonnet does not take
that parameter, so it isn't sent.

## Where it stops

No calendar or email integration, no escalating reminders as a real deadline
approaches, no proactive check-ins, and no packaging as a desktop app — it
runs from a terminal.

It also cannot be a published artifact. Artifacts are sandboxed against
external network calls, so a page hosted there cannot reach a model or your
filesystem; a real agent has to run somewhere it can do both.
