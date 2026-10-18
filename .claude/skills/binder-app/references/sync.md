# Sync between devices (add-on)

**Off by default.** A binder is an offline product and the listing says so. Sync
is added when the user asks for it on a specific product, it is off until the
buyer turns it on, and the app is fully usable without it forever.

Code: `assets/sync/binder-sync.js` (client, copy unchanged),
`assets/sync/worker/` (the Cloudflare Worker that stores the blob).

## Why a vault wants it

Binder apps are filled in over months and the records matter. Two real cases:

- **Two devices, one person.** Laptop and desktop. Today the only path is
  export, carry, import — and the merge-on-import machinery exists precisely
  because people got this wrong.
- **Two people, one binder.** The Emergency Vault and the Home Management
  Binder are household documents. A couple keeping one copy each, diverging
  silently, is the worst outcome the product can produce.

Note the difference from an active daily app: a binder syncs *rarely and in
bursts*. Someone enters fifteen records on a Sunday and nothing for a month.
Correctness per burst matters far more than latency.

## What the buyer sees

Settings › **Sync across devices**, placed above "Keep your progress safe":

- **Turn on sync** → shows a private code, `XXXX-XXXX-XXXX-XXXX`
- **Already syncing?** → enter the code; the two copies are **combined, never
  replaced**
- Once on: the code with **Copy**; a status line with **Sync now**; **Devices**
  (this one with Rename, others with Remove, each with a last-synced time);
  **Change sync code**; **Delete synced data**; **Turn off on this device**
- Every action keeps the local data.

Sync is off in demo mode and demo data is never sent.

The code is the only key. If the buyer loses it, nobody can recover the synced
copy — say this where they first see the code, not in a FAQ.

## How it works

- **Server**: a Cloudflare Worker, one Durable Object per room, one encrypted
  blob up to **5 MB**. It never sees the code or the data — only a room id and
  ciphertext.
- **Encryption**: the code goes through PBKDF2 (210k iterations) into an
  AES-GCM key plus a room id.
- **Device limit**: 5 per code; a device idle 30 days stops counting; a 6th is
  refused with a clear message.
- **Timing**: a save uploads 1.5 s later; other devices poll every 60 s while
  visible, and immediately on focus or reconnect. Two simultaneous saves →
  409 → merge and retry.
- **Merging**: `BinderSync.units` stamps each unit (a record, a map key, a
  top-level value) with when it last changed. Newest stamp wins per unit;
  deletions travel as tombstones. Records need no `updatedAt` of their own.

**The binder apps share the existing JPS worker:**

```js
const SYNC_SERVER = 'https://jps-sync.darowan-rph.workers.dev';
```

That is safe because the room id is derived on the device from the `app` key,
so two products cannot land in the same room however many share the server.
The salt string inside `binder-sync.js` is left exactly as shipped, so the file
stays byte-identical to its upstream copy and upstream fixes apply cleanly —
do not "rebrand" it; changing the salt forks the crypto and strands anyone
already synced.

What a shared worker does mean:

- **Give every binder a distinct, permanent `app` key** (`emergency-vault`,
  `home-management`, `homeschool-hub`). Never change one after release — it
  changes the room and every linked device loses sight of the others.
- **One free tier covers both shops.** Cloudflare Workers allows roughly 100k
  requests a day; each open app polls once a minute. That is a few dozen
  concurrent users across everything. If the binders take off, the two shops
  are now sharing one ceiling — watch it, and the paid plan is about $5/month.
- **An outage hits both shops at once.** Worth knowing before a listing says
  sync is a feature.

The worker source is kept in `assets/sync/worker/` so the binder side can read
and redeploy it, but it is **the same deployment** — treat a change to it as a
change to a live JPS service, not a binder-local edit.

## Binder-specific rules

### Attachments do not sync

This is the big one. Binder apps store scanned documents as base64 in
IndexedDB, up to `SAMPLE_MAX_BYTES` (4 MB) each — one passport scan can exceed
the entire 5 MB room.

So `syncOut()` **strips attachment payloads and syncs only the metadata** (file
name, type, size, which record it belongs to). Each device keeps its own files.
A record whose scan lives on the other machine shows a quiet "Scan is on your
other device" rather than an empty attachment that looks like data loss.

Say it in three places: the sync card, the quick start guide, and the listing.
A buyer who believes their scans are synced and then wipes a laptop has lost
documents, and that is the one failure this product line cannot absorb.

### Never sync the PIN or the backup bookkeeping

The skip list starts from `SETTINGS_EXCLUDE` — the PIN hash, the last-backup
timestamps, the backup-file handle flags, the snapshots — and adds the
per-device presentation settings: theme, hidden modules, column choices, the
table/card view toggle.

A PIN is a per-device privacy screen. Syncing its hash spreads one person's
lock screen onto their spouse's laptop.

Snapshots must not sync either: they are a *local* undo for "I imported the
wrong file", and a remote snapshot arriving mid-session defeats the point.

### Two merge engines, and they must not meet

The engine now has two merges, for two different problems:

| | `merge-restore.js` | `BinderSync.units` |
|---|---|---|
| Input | a backup file, possibly from another machine, with no shared clock | two live copies that share a sync history |
| Matching | content **fingerprint** | record **id** plus a change stamp |
| Collisions | re-ids the incoming record (`freshId`) and runs `remapReferences()` | never re-ids |

**Sync must never re-id a record.** Ids are the merge key; changing one makes
the same record appear twice forever, and every `<entity>_select` pointer at it
breaks. Keep `freshId()`/`remapReferences()` on the file-import path only.

Conversely, a restored backup file is still an import: it goes through
`validateImport()` and the fingerprint merge even when sync is on, and the
result is then stamped as this device's change so it propagates.

### Migration under sync

`SCHEMA_VERSION` bumps are hazardous once two devices share data: an old device
will happily push a v1 document over a v2 one. Guard it — refuse to apply an
incoming payload whose version is below the local one, and tell the buyer to
update the other device. Snapshot before applying any incoming migration.

### Entity references survive a merge

The entity layer is what makes a wrong merge expensive: records point at
members/students/accounts by id. Because unit merging is id-stable this works
naturally — but if two devices each create "Emma" offline, there are now two
Emmas. Offer a **merge duplicates** action on the entity list rather than
trying to guess; guessing reassigns someone's medical records to the wrong
child.

## Wiring it in

1. Inline `assets/sync/binder-sync.js` in a `<script>` before the app script.
   Copy it unchanged.
2. Create the controller once, and `start()` after load:

   ```js
   const skip = [...SETTINGS_EXCLUDE.map(k => 'settings/' + k),
                 'settings/theme', 'settings/hiddenModules', 'settings/columns'];

   this.sync = BinderSync.create({
     app: 'emergency-vault',          // unique per product; never change after release
     server: SYNC_SERVER,
     getData: () => this.syncOut(),   // strips attachment payloads
     setData: p => this.syncIn(p),
     merge: (l, r) => BinderSync.units.merge(l, r, { skip }),
     canSync: () => !this.demoMode && !this.storageProblem,
     onStatus: s => this.renderSyncStatus(s),
   });
   ```

3. In `saveData()`: call `syncNote()` **first** — it runs
   `units.track(prev, state)` and re-clones `prev` — then `sync.changed()`
   after the write.
4. In `syncIn(p)`: keep this device's theme and hidden modules; run validation;
   then run `units.track(p, next)` so anything validation tidied counts as this
   device's change. **Skipping that step makes two devices undo each other's
   tidying forever — a screen that re-renders every 1.5 s.** Save without
   re-tracking, and skip `render()` while a modal or an unsaved editor is open.
5. **Turning on** stamps everything first with `units.track({}, state)`, so work
   done before sync existed beats a new device's empty defaults.
6. Leaving demo mode calls `changed()`.

## The build guard

`scripts/build.py` refuses to emit a file that reaches the network, and that
includes `fetch()` targets, not just tags. Sync is therefore an **explicit
declaration**, not an exemption: put the host in `SYNC_HOST` in the build
script for that product. A sync host that appears without being declared still
fails the build — which is the behaviour you want, because that is what an
accidentally-reintroduced CDN looks like.

## Phones and hosting

A downloaded file on a phone can't be used at all (iOS Safari won't open it),
so hosting a copy on Cloudflare Pages is the only way a phone participates.
For this product line that is usually **not worth it**: binders are desktop
tools for filling in and printing, and a hosted copy raises a support surface
and an access-gate problem. Treat hosting as a separate decision from sync, and
default to no.

If it is wanted: Cloudflare Pages, free, deployed from GitHub Actions. Never
share a live address without an access gate.

## Testing

Two browser contexts, the worker code running in memory, no network:

1. A writes, B receives it.
2. A and B both write offline, then both reconnect: both records survive.
3. A deletes while B edits the same record: the tombstone and the edit resolve
   the same way on both sides.
4. A record with an attachment syncs its metadata and no payload; the blob stays
   under 5 MB.
5. The PIN hash, theme and snapshots do not appear in the payload.
6. An incoming payload at a lower `SCHEMA_VERSION` is refused.
7. Demo mode sends nothing.

Test 5 is a privacy test, not a correctness test. Run it on every release.
