# Morrow

A context-aware personal assistant that captures everything, hides the noise,
protects real commitments, preserves valuable ideas, follows your creative
energy, and surfaces only what is useful right now.

**Capture freely. Display selectively. Protect what truly matters.**

## What's here

| File | What it is |
| --- | --- |
| `index.html` | The whole app. One self-contained file — no build, no dependencies, no network calls. Open it in a browser or publish it as an artifact. |
| `companion.js` | Optional desktop companion: a localhost service giving Morrow file access to folders you explicitly approve, and nothing else. |
| `test-engine.js` | `node test-engine.js` — checks classification, the deadline model, recommendations and the idea garden. Runs the engine extracted from `index.html`, so there is only ever one copy of the logic. |

## Using it

Open `index.html`. Talk or type — voice and text share one memory, one context
and one transcript. Everything is stored in your browser's local storage;
nothing is sent anywhere.

Things worth saying:

- *"I feel like designing today."* / *"I have 20 minutes and no brainpower."*
- *"What makes sense right now?"* — at most three options, never a list.
- *"What actually needs my attention?"* — only real, external dates.
- *"What am I forgetting?"* — open loops, including dates Morrow still needs from you.
- *"Let me think out loud."* — Morrow listens and acknowledges, and only sorts
  what you said once you say you're done.
- *"Capture this idea."* — saved as a seed. It doesn't have to become anything.
- *"Show me the best ideas I've had about the card business."*

## How it decides things

**Two kinds of dates, and only one of them is allowed to create pressure.** A
date is *real* when something outside you imposes it — taxes, a flight, a bill,
an appointment, a promise to another person. Those get protected, get the one
persistent line on screen, and are the only thing coloured. A date you set for
yourself is an *intention*: guidance, never an overdue counter. If something
sounds like a real commitment but carries no date, Morrow asks instead of
inventing one.

**Nothing you say becomes active work on its own.** A brain dump is split into
separate thoughts and sorted into commitments, possible actions, ideas,
reflections, questions and decisions. You get a digest — *"I captured six
thoughts: one idea, two commitments…"* — and everything sits stored until you
choose otherwise.

**Work is chosen by readiness, not by schedule.** Each stored thing carries
inferred attributes you never have to maintain: a work mode, an energy level, a
rough duration, a real deadline if any, whether Morrow can help with it. Low
energy never surfaces uphill work. When creative preference and a real deadline
disagree, Morrow names the tension out loud and proposes a trade rather than
burying either one.

**Ideas grow through stages, quietly**: seed → explore → candidate → active bet
→ archive. Seeds never appear in recommendations. Occasionally — not often —
Morrow resurfaces two or three older ideas that look unusually strong next to
what you're currently working on.

**No dashboard, no counters, no badges.** At most three options at a time, an
approaching real deadline, whatever you explicitly asked for, and a small
curated set of ideas when they're worth it. Nothing is ever deleted; archive
means archived.

## The desktop companion

```
node companion.js ~/Projects ~/Design/Assets
```

It prints a token and listens on `127.0.0.1:4471` only. The boundary is
enforced in the service, not the interface:

- Only paths inside an approved folder are reachable; symlinks are resolved, so
  a link can't walk out.
- Reading, listing and searching (by filename or file contents) need no
  repeated approval.
- Creating, copying, moving and renaming return a **preview and a token**;
  nothing happens until that token comes back to `/confirm`. Staged operations
  expire after ten minutes.
- Existing files are never overwritten.
- There is no delete operation at all.
- Nothing leaves the machine.

| Endpoint | Effect |
| --- | --- |
| `POST /roots`, `/list`, `/search`, `/grep`, `/read` | Immediate |
| `POST /mkdir`, `/copy`, `/move`, `/rename`, `/write` | Returns a preview + token |
| `POST /confirm`, `/cancel` | Runs or discards a staged operation |

Every request needs the `x-morrow-token` header.

## Where it stops

This first version is deliberately local and self-contained. Not here yet:
calendar and email integration, escalating reminders as a real deadline
approaches, proactive check-ins, cross-project reasoning, and a wired-up link
between the conversation and the companion (the companion runs and enforces its
own rules; the app does not yet call it).
