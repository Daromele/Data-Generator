# Morrow

A conversational assistant for a brain that doesn't get on with planners.

**Capture freely. Display selectively. Protect what truly matters.**

Morrow stores far more than it shows. Nothing you say becomes a task on its own,
nothing acquires an invented due date, and nothing ever turns red. The only thing
allowed to create pressure is a date somebody else imposed on you.

## Running it

```
open morrow/index.html        # that's the whole app
```

No build, no server, no account. Everything lives in `localStorage` on your machine.
Voice input uses the browser's Web Speech API (Chrome, Edge, Safari); the mic button
disables itself where that isn't available, and typing works everywhere. Text and
voice share one memory and one conversation.

## What it does

**Talk normally.** "I feel like designing today." "I have 20 minutes and no brainpower."
"What actually needs my attention?" "What am I forgetting?" "Capture this idea."
"Show me the best ideas I've had about the card business."

**Thinking out loud.** Say *let me think out loud* and Morrow stops interpreting.
It acknowledges and listens until you say you're done, then classifies the whole
dump at once and hands back a digest:

> I captured six thoughts: one idea, two commitments, one possible action, one
> reflection and one question. Nothing was added to active work without your approval.

**Two kinds of date, never confused.**

| | |
|---|---|
| **Real deadline** | Externally imposed — taxes, flights, bills, a promise to a person. Protected, surfaced when it matters, escalating as it nears. |
| **Personal intention** | "I'd like to redesign the site this month." Guidance only. It never goes overdue and never counts against you. |

If Morrow thinks it heard a commitment but no date, it asks rather than inventing one.

**Energy over schedule.** Tell it your mood, energy and available time; it scores
stored work by mode fit, energy required, duration and real-deadline pressure, and
offers at most three options. It won't push high-energy work at a tired person —
but when a real deadline is close it names the tension out loud instead of hiding it:

> Designing fits your energy today. The VAT return doesn't, but leaving it much
> longer makes the August 28 date risky. Fifteen minutes on the blocker, then the
> rest of the session is yours.

**Idea garden.** seed → explore → candidate → active bet → archive. Capture
everything, activate almost nothing. Seeds stay out of recommendations entirely.
Morrow quietly links ideas by shared subject and occasionally resurfaces two or
three that look unusually strong next to your current work. Nothing is ever deleted.

**No dashboard.** One conversation, a context strip while a mood is set, and a
single-line whisper when a real deadline is within a fortnight. No counters, no
badges, no inbox to process.

## Files

| | |
|---|---|
| `index.html` | The interface — one conversation and nothing else |
| `engine.js` | Classification, date sense, memory, recommendation. Pure functions, also runnable under node |
| `app.js` | Conversation routing, intents, thinking-aloud mode, voice |
| `companion.js` | Optional local file companion (node, no dependencies) |
| `test-engine.js` | `node test-engine.js` — checks on the classifier and recommender |

## The desktop companion

```
node morrow/companion.js ~/Projects ~/Design/Assets
```

It prints a token, listens on `127.0.0.1:4471` only, and can reach the folders you
named and nothing else. The boundary is enforced in the companion, not the UI:

- Symlinks are resolved before the boundary check, so a link can't walk out.
- Reading, listing and searching (by filename or content) need no repeated approval.
- Creating, copying, moving and renaming return a **preview and a token**; nothing
  happens until that token comes back to `/confirm`. Staged operations expire after
  ten minutes.
- It never overwrites an existing file — new paths only.
- There is no delete operation at all. Asking for one gets you a refusal.
- Nothing is uploaded anywhere. It has no outbound network code.

Endpoints: `roots`, `list`, `search`, `grep`, `read`, `mkdir`, `copy`, `move`,
`rename`, `write`, `confirm`, `cancel`. POST JSON with an `x-morrow-token` header.

```
curl -s localhost:4471/search -H 'x-morrow-token: <token>' \
     -H 'content-type: application/json' -d '{"query":"card"}'
```

## Not built yet

Calendar and email integration, proactive check-ins, escalating reminder
scheduling, cross-project reasoning, automatic document preparation, and the
secure link between the browser app and the companion (today you paste the token).
