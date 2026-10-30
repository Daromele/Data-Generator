# Data safety

There is no server. If the browser loses the records, they are gone — no
restore, no support ticket, just a refund request and a one-star review. Every
rule here exists because of that.

Working code: `assets/storage-and-recordstore.js`, `assets/save-honesty.js`,
`assets/merge-restore.js`, `assets/auto-backup.js`.

## Two stores, two jobs

| | `storage` | `recordStore` |
|---|---|---|
| Backed by | localStorage | IndexedDB |
| Holds | settings, theme, PIN hash, snapshots | the records |
| Limit | ~5 MB per origin | hundreds of MB |
| API | synchronous | async, with a sync read cache |

**`storage` never throws.** It wraps every call in try/catch and keeps an
in-memory mirror, so a Safari private window or a full quota degrades to
"settings don't persist" instead of a blank screen. Private-mode localStorage
throwing on write is the single most common cause of an app that works for you
and is dead on arrival for a buyer.

**Records go in IndexedDB.** A buyer with photographed documents passes 5 MB in
a week. The store keeps a synchronous read cache so render code stays simple;
only writes await.

Request persistence at startup — `requestPersistentStorage()` — so the browser
is less willing to evict under pressure. It may be refused; that is fine, it is
a hint, not a guarantee.

## Honest saving

Never let a write fail quietly. `onStoreFailure()` must:

1. show a modal, not a toast — a toast is missed and the buyer keeps typing
2. say what failed and that recent changes are not saved
3. offer **Download a backup now** as the primary action
4. stay open until dismissed

A silent failure converts into hours of lost work. A loud one converts into one
annoyed buyer who still has their data.

## Snapshots

Three rolling snapshots of the whole document in localStorage
(`SNAPSHOT_KEYS = ['xxSnapshot1','xxSnapshot2','xxSnapshot3']`), written on a
schedule and before anything destructive (import, restore, bulk delete, clear).
`recoverFromSnapshot()` is exposed in Settings with timestamps.

Snapshots are the in-app undo for "I imported the wrong file". They are not a
backup — they live in the same browser as the data.

## Auto-backup to a real file

File System Access API: the buyer picks a file once, and every save writes to
it. The handle survives reloads via IndexedDB; `reconnectBackupFile()` re-asks
for permission when the browser drops it.

Chrome and Edge on desktop only. Everywhere else — Safari, Firefox, every
phone — the manual **Download backup** button is the path, and the UI must say
so rather than showing a dead feature. Getting this claim wrong in the listing
is a refund: the honest line is "auto-backup in Chrome and Edge on desktop;
one-click manual backup everywhere else".

`daysSinceBackup()` drives a nudge after `BACKUP_NUDGE_DAYS` (30). Make it
dismissible and don't repeat it the same day.

## The backup file

`backupPayload()` produces:

```js
{ app: 'emergency-vault', version: 2, exported: '2026-10-18T...',
  data: { ...sections }, settings: { ...prefixed keys minus secrets } }
```

**Settings belong in the backup.** A restore that returns the records but loses
the theme, the hidden modules, the column choices and the entity list feels
broken. `settingsPayload()` collects every `SETTINGS_PREFIX` key except
`SETTINGS_EXCLUDE` — the PIN hash, the backup bookkeeping and the snapshots,
none of which should travel between machines.

## Import: validate, then merge

`validateImport()` runs before anything is touched: is it JSON, is `app` ours,
is `version` known, is `data` an object of arrays. Reject with a specific
message. An unvalidated import that half-applies is worse than no import.

Then **merge, don't replace**. Two devices, two half-filled backups: replacing
destroys one of them.

- `recordFingerprint()` hashes the meaningful fields (ignoring `id`, `created`,
  `updated`) so the same record imported twice is recognised
- `freshId()` re-ids incoming records that collide
- `remapReferences()` fixes every `<entity>_select` / `_multi` pointer to the
  new ids — skip this and a merge silently reassigns records to the wrong person
- `dedupeRecords()` drops exact duplicates and reports the count

Always show the buyer what happened: "Added 23, skipped 4 duplicates, kept your
17 existing records." Silence here reads as data loss even when nothing was lost.

Offer **Replace instead** as a clearly-labelled secondary action, behind a
confirm, after a snapshot.

## Migration

`SCHEMA_VERSION` with a forward-only `migrate()`. Snapshot before migrating.
Never write a migration that drops a field; move it and leave the old key.

## PINs

A PIN is a privacy screen, not encryption. Store `sha256(pin)`, never the PIN,
never in the backup. Say plainly in the app and the listing that it stops a
shoulder-surfer and not someone with the file. Claiming encryption that doesn't
exist is the one claim here that turns a refund into a complaint.

## Credentials

Never ask the buyer to store a password, full card number or SSN. Ask *where
the password is kept*. Ask for the last four digits. Repeat it in the printed
footer — printed documents get left on kitchen tables.
