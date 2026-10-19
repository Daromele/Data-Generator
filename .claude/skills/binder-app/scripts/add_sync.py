#!/usr/bin/env python3
"""ADD-ON: wires sync between devices into a binder built on the shared engine.

    python3 add_sync.py App.html --app homeschool-hub [--out App.html]
                        [--server https://jps-sync.darowan-rph.workers.dev]

Only when the user asks for sync on a specific product. The app stays fully
usable without it: sync is off until the buyer turns it on in Settings.

What it adds (references/sync.md has the why):
  - assets/sync/binder-sync.js, inlined unchanged, before the app script
  - saveData(): syncNote() first, sync.changed() after the write
  - storage.set on a synced setting schedules a save, so settings travel too
  - syncOut()/syncIn(): records as per-record units, dw* settings as per-key
    units; PIN, theme, hidden modules, banners and backup bookkeeping stay on
    each device; attachment files never leave the device (records only hold
    their ids)
  - a "Sync across devices" card in Settings, above Automatic Backup: turn on,
    link with a code, copy, sync now, devices (rename/remove), change code,
    delete synced data, turn off
  - start() after the constructor

`--app` is the room salt. It must be unique per product and NEVER change after
release, or every buyer who synced is stranded. Fails loudly when an engine
anchor has moved; then wire that hook by hand from the list above.
"""
import argparse, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument('html')
ap.add_argument('--app', required=True, help='permanent per-product sync key, e.g. homeschool-hub')
ap.add_argument('--out')
ap.add_argument('--server', default='https://jps-sync.darowan-rph.workers.dev')
a = ap.parse_args()
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{2,40}', a.app):
    sys.exit('--app must be lowercase letters, digits and dashes')

src = pathlib.Path(a.html)
out = pathlib.Path(a.out or a.html)
s = src.read_text(encoding='utf-8')
if 'JPSSync.create' in s or 'BinderSync.create' in s:
    sys.exit('This file already has sync.')
client = (HERE.parent / 'assets/sync/binder-sync.js').read_text(encoding='utf-8')


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit(f'Anchor found {n}x, expected {count} (engine changed?): {old[:90]!r}')
    s = s.replace(old, new)


# 1. the client, before the app script
rep('    <!-- Scripts -->\n    <script>\n',
    '    <!-- Optional sync between devices: off until the buyer turns it on -->\n'
    '    <script>/* Binder sync client (assets/sync/binder-sync.js, unchanged) */\n'
    + client.replace('</script', '<\\/script') + '\nwindow.BinderSync = window.JPSSync;\n    </script>\n'
    '    <!-- Scripts -->\n    <script>\n')

# 2. constants beside the other storage constants
_pm = re.search(r"        const SETTINGS_PREFIX = '(\w+)';\n", s)
if not _pm:
    sys.exit("Anchor not found: const SETTINGS_PREFIX = '..';")
rep(_pm.group(0), _pm.group(0) +
    f"        const SYNC_APP = '{a.app}';            // room salt: never change after release\n"
    f"        const SYNC_SERVER = '{a.server}';\n")

# 3. saveData: note the change first, send it after the write
rep('            saveData(options = {}) {\n',
    '            saveData(options = {}) {\n'
    '                this.syncNote();\n')
rep('                this.scheduleBackupWrite();\n                if (accepted) {\n',
    '                this.scheduleBackupWrite();\n'
    '                if (this.sync) this.sync.changed();\n'
    '                if (accepted) {\n')

# 4. start after the constructor has built everything
rep('                setTimeout(() => this.applySidebarState(), 0);\n                this.initBackupLink();\n            }\n',
    '                setTimeout(() => this.applySidebarState(), 0);\n                this.initBackupLink();\n'
    '                this.initSync();\n            }\n')

# 5. the Settings card, above Automatic Backup; and the manual-backup text stops saying "no cloud"
m = re.search(r'( *)<div class="bg-white dark:bg-darkCard rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">\s*'
              r'<div class="px-6 py-5[^"]*">\s*<h3[^>]*><i class="ph ph-arrows-clockwise text-primary-500"></i> Automatic Backup', s)
if not m:
    sys.exit('Anchor not found: the Automatic Backup card in renderSettings')
s = s[:m.start()] + m.group(1) + '${this.syncCardHtml()}\n\n' + s[m.start():]
rep('Because this app runs offline and does not sync to the cloud, you are responsible',
    'Your records live on this device${this.sync && this.sync.on ? \' (and, encrypted, on your linked devices)\' : \'\'}, so you are responsible')

# 6. the methods, before renderSettings
METHODS = r'''
            // ---- Optional sync between devices -----------------------------
            // A private code, stretched on this device into an encryption key
            // and a room id; the server only ever holds scrambled bytes. The
            // whole planner is cut into units -- one per record, one per
            // synced setting -- and the newest edit of each unit wins.
            syncSkipList() {
                // Never leaves this device: the PIN (a lock on THIS browser),
                // the look, what is hidden, banners, and backup bookkeeping.
                const P = SETTINGS_PREFIX;
                const skip = [P + 'PIN', P + 'PINHash', ...SETTINGS_EXCLUDE,
                    ...['DarkMode', 'ColorTheme', 'HiddenSections', 'SidebarCollapsed',
                        'BannerEasyMode', 'BannerInsights', 'WelcomeSeen', 'BackupSamples'].map(k => P + k)];
                return skip.map(k => 'settings/' + k);
            }

            syncedSetting(k) {
                return k && k.startsWith(SETTINGS_PREFIX) && !k.startsWith(SETTINGS_PREFIX + 'ViewMode_') &&
                    !this.syncSkipList().includes('settings/' + k);
            }

            // The document that syncs. Attachments are stored in their own
            // IndexedDB store; records carry only their ids and names, so the
            // files themselves stay on the device they were added on.
            syncDoc() {
                const settings = {};
                Object.entries(this.settingsPayload()).forEach(([k, v]) => { if (this.syncedSetting(k)) settings[k] = v; });
                const doc = JSON.parse(JSON.stringify(this.data));
                doc.settings = settings;
                return doc;
            }

            syncOut() { return this.syncDoc(); }

            syncNote() {
                if (!this.sync || this.syncApplying) return;
                const now = this.syncDoc();
                if (this.syncPrev) {
                    BinderSync.units.track(this.syncPrev, now, { skip: this.syncSkipList() });
                    this.data.sync = now.sync;
                }
                this.syncPrev = now;
            }

            syncIn(p) {
                if (!p || typeof p !== 'object') return;
                const settings = p.settings || {};
                const records = Object.assign({}, p);
                delete records.settings;
                let next;
                try { next = this.migrate(JSON.parse(JSON.stringify(records))); }
                catch (err) { console.warn('Sync: data from another device was not accepted', err); return; }
                // Whatever migrate() tidied counts as this device's change, or two
                // devices undo each other's tidying forever.
                const nextDoc = Object.assign({}, next, { settings });
                BinderSync.units.track(p, nextDoc, { skip: this.syncSkipList() });
                next.sync = nextDoc.sync;

                this.syncApplying = true;
                try {
                    Object.keys(settings).forEach(k => { if (this.syncedSetting(k)) storage.set(k, String(settings[k])); });
                    this.data = next;
                    this.saveData({ skipSnapshot: false });
                    this.reloadSettingsFromStorage();
                } finally { this.syncApplying = false; }
                this.syncPrev = this.syncDoc();
                this.syncRefresh();
            }

            // Re-render in place, but never under an open form or a focused field.
            syncRefresh() {
                const busy = [...document.querySelectorAll('[role="dialog"], #onboarding-backdrop, #modal-backdrop')]
                    .some(el => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
                const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
                    this.currentSection !== 'settings';
                if (busy || typing) return;
                const key = this.currentSection;
                if (key === 'dashboard') this.renderDashboard();
                else if (key === 'settings') this.renderSettings();
                else if (key === 'compliance') this.renderCompliance();
                else if (SECTIONS[key]) this.renderGenericSection(key);
                this.renderNav();
            }

            initSync() {
                if (typeof BinderSync === 'undefined') return;
                this.syncPrev = null;
                this.sync = BinderSync.create({
                    app: SYNC_APP,
                    server: SYNC_SERVER,
                    getData: () => this.syncOut(),
                    setData: p => this.syncIn(p),
                    merge: (l, r) => BinderSync.units.merge(l, r, { skip: this.syncSkipList() }),
                    canSync: () => !this.saveFailed,
                    onStatus: st => {
                        const el = document.getElementById('sync-state');
                        if (el) el.textContent = this.syncStateText();
                        if (st.state === 'off' && st.message) this.showToast(st.message, 'info');
                        if (st.state === 'off' && this.currentSection === 'settings') this.renderSettings();
                        if (st.state === 'synced') this.syncDevices();
                    }
                });
                // A synced setting changed outside saveData (profile, compliance,
                // currency...): fold it into the next save so it travels too.
                const set = storage.set.bind(storage);
                storage.set = (k, v) => {
                    const ok = set(k, v);
                    if (this.sync && this.sync.on && !this.syncApplying && this.syncedSetting(k)) {
                        clearTimeout(this.syncSettingTimer);
                        this.syncSettingTimer = setTimeout(() => this.saveData({ skipSnapshot: true }), 800);
                    }
                    return ok;
                };
                this.syncPrev = this.syncDoc();
                this.sync.start();
            }

            syncStateText() {
                const st = this.sync.status;
                const at = st.at ? new Date(st.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
                if (st.state === 'syncing') return 'Syncing…';
                if (st.state === 'synced') return 'Synced' + (at ? ' ' + at : '');
                return st.message || (at ? 'Last synced ' + at : 'Waiting to sync');
            }

            syncCardHtml() {
                if (!this.sync) return '';
                const btn = 'px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white rounded-xl text-sm transition-colors shadow-sm font-bold flex items-center justify-center gap-2';
                const danger = 'px-4 py-3 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-slate-300 dark:border-slate-600 text-rose-600 dark:text-rose-400 rounded-xl text-sm transition-colors shadow-sm font-bold';
                const head = `
                            <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                                <h3 class="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-lg serif-font"><i class="ph ph-devices text-primary-500"></i> Sync Across Devices <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Optional</span></h3>
                            </div>`;
                const card = body => `<div class="bg-white dark:bg-darkCard rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm" id="sync-card">${head}<div class="p-6 space-y-5">${body}</div></div>`;
                if (!this.sync.on) return card(`
                                <p class="text-sm text-slate-500 leading-relaxed">Keep this planner the same on your computer, phone and tablet. Everything is encrypted on this device with a private code only you have &mdash; nobody else can read it, including us. Attached files stay on the device they were added on.</p>
                                <div class="flex flex-col sm:flex-row gap-3">
                                    <button data-sync="on" class="flex-1 px-5 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm transition-colors shadow-md font-bold flex items-center justify-center gap-2"><i class="ph ph-cloud-arrow-up text-lg"></i> Turn On Sync</button>
                                </div>
                                <form id="sync-join-form" class="space-y-2">
                                    <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">Already syncing on another device? Enter its code</label>
                                    <div class="flex flex-col sm:flex-row gap-3">
                                        <input name="code" autocomplete="off" spellcheck="false" placeholder="K7QM-3XRA-9PLW-T4ZD" class="flex-1 w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white number-font">
                                        <button class="${btn}"><i class="ph ph-link text-lg"></i> Link This Device</button>
                                    </div>
                                    <p class="text-xs text-slate-400">Find the code in Settings on the other device. Both copies are combined; nothing is replaced.</p>
                                </form>`);
                return card(`
                                <p class="text-sm text-slate-500 leading-relaxed">On. Your changes are sent as soon as you save. Other devices pick them up within a minute, straight away when you switch back to the planner, or with Sync Now.</p>
                                <div class="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div class="min-w-0"><div class="number-font text-lg font-bold text-slate-900 dark:text-white tracking-wider">${escapeHtml(this.sync.code)}</div><div class="text-xs text-slate-500">Enter this code on your other devices. Keep it private: anyone with it can see and change your records.</div></div>
                                    <button data-sync="copy" class="${btn}"><i class="ph ph-copy text-lg"></i> Copy</button>
                                </div>
                                <div class="flex items-center justify-between gap-3"><div class="text-sm"><span class="font-bold text-slate-700 dark:text-slate-200">Status</span> <span id="sync-state" class="text-slate-500">${escapeHtml(this.syncStateText())}</span></div><button data-sync="now" class="${btn}"><i class="ph ph-arrows-clockwise text-lg"></i> Sync Now</button></div>
                                <div><div class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Devices</div><div id="sync-devices" class="space-y-2"><p class="text-sm text-slate-400">Loading&hellip;</p></div>
                                <p class="text-xs text-slate-400 mt-2">Up to 5 devices can use one code. A device that hasn't synced for 30 days stops counting.</p></div>
                                <div class="flex flex-col sm:flex-row gap-3">
                                    <button data-sync="change" class="${btn}">Change Sync Code</button>
                                    <button data-sync="delete" class="${danger}">Delete Synced Copy</button>
                                    <button data-sync="off" class="${danger}">Turn Off Here</button>
                                </div>`);
            }

            async syncDevices() {
                const el = document.getElementById('sync-devices');
                if (!el || !this.sync || !this.sync.on) return;
                let list = [];
                try { list = await this.sync.devices(); } catch (err) { /* offline */ }
                if (document.getElementById('sync-devices') !== el) return;
                const ago = t => { if (!t) return 'Not synced yet'; const m = Math.round((Date.now() - new Date(t)) / 6e4); return m < 2 ? 'Synced just now' : m < 60 ? `Synced ${m} min ago` : m < 1440 ? `Synced ${Math.round(m / 60)} h ago` : `Synced ${Math.round(m / 1440)} days ago`; };
                const small = 'px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold';
                el.innerHTML = list.map(d => `<div class="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700"><div class="min-w-0"><div class="text-sm font-bold text-slate-800 dark:text-white">${escapeHtml(d.name)}</div><div class="text-xs text-slate-500">${d.me ? 'This device' : ago(d.lastSeen)}</div></div>${d.me ? `<button data-sync="rename" class="${small}">Rename</button>` : `<button data-sync="remove" data-id="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}" class="${small}">Remove</button>`}</div>`).join('')
                    || '<p class="text-sm text-slate-400">Couldn’t load the list. Check your connection.</p>';
            }

            async syncAction(action, b) {
                const s = this.sync;
                const done = () => { if (this.currentSection === 'settings') this.renderSettings(); };
                try {
                    if (action === 'on') {
                        // Stamp everything first, so work done before sync existed
                        // beats a new device's empty defaults.
                        const doc = this.syncDoc();
                        BinderSync.units.track({}, doc, { skip: this.syncSkipList() });
                        this.data.sync = doc.sync; this.syncPrev = null;
                        this.saveData({ skipSnapshot: true });
                        await s.turnOn(); done();
                        this.showToast('Sync is on. Enter the code on your other devices.');
                    } else if (action === 'now') { await s.syncNow(); done(); }
                    else if (action === 'copy') {
                        try { await navigator.clipboard.writeText(s.code); this.showToast('Sync code copied'); }
                        catch (err) { this.showToast(s.code, 'info'); }
                    } else if (action === 'rename') {
                        const n = prompt('Name this device', s.deviceName);
                        if (n && n.trim()) { await s.renameDevice(n); this.syncDevices(); }
                    } else if (action === 'remove') {
                        this.openConfirm(`Remove “${b.dataset.name}”?`, 'It stops syncing the next time it opens and keeps its own copy. Anyone who still has the code can link again: change the code to stop that.', 'Remove', 'bg-rose-600 hover:bg-rose-700 text-white',
                            async () => { await s.removeDevice(b.dataset.id); this.syncDevices(); this.showToast('Device removed'); });
                    } else if (action === 'change') {
                        this.openConfirm('Change the sync code?', 'Your records move to a new code. Every other device stops syncing until you enter the new code on it.', 'Change Code', 'bg-primary-600 hover:bg-primary-700 text-white',
                            async () => { await s.changeCode(); done(); this.showToast('New code ready. Enter it on your other devices.'); });
                    } else if (action === 'delete') {
                        this.openConfirm('Delete the synced copy?', 'It is removed from the sync service and sync turns off on every device. Each device keeps its own records.', 'Delete Synced Copy', 'bg-rose-600 hover:bg-rose-700 text-white',
                            async () => { await s.deleteRemote(); done(); this.showToast('Synced copy deleted. Your records are still here.'); });
                    } else if (action === 'off') {
                        this.openConfirm('Turn off sync on this device?', 'Your records stay here, and your other devices keep syncing with each other.', 'Turn Off', 'bg-rose-600 hover:bg-rose-700 text-white',
                            () => { s.turnOff(); done(); this.showToast('Sync is off on this device'); });
                    }
                } catch (err) { done(); this.showToast(s.status.message || err.message || 'Sync could not finish. Try again.', 'error'); }
            }

            renderSettings() {'''
rep('            renderSettings() {', METHODS.lstrip('\n'))

# 8. one delegated listener for the card's buttons and form
rep('            window.app = new ProductivityApp();',
    '''            window.app = new ProductivityApp();
            document.addEventListener('click', e => {
                const b = e.target.closest && e.target.closest('[data-sync]');
                if (!b || !window.app.sync) return;
                e.preventDefault();
                window.app.syncAction(b.dataset.sync, b);
            });
            document.addEventListener('submit', async e => {
                if (e.target.id !== 'sync-join-form' || !window.app.sync) return;
                e.preventDefault();
                const app = window.app, code = new FormData(e.target).get('code');
                try {
                    const r = await app.sync.join(code);
                    app.syncPrev = app.syncDoc();
                    app.renderSettings();
                    app.showToast(r.found ? 'Linked. Your records are combined.' : 'Linked, but nothing was saved under that code yet, so this copy was uploaded. Check the code if you expected records.', r.found ? 'success' : 'info');
                } catch (err) {
                    app.renderSettings();
                    app.showToast(/16 letters/.test(err.message) ? err.message : (app.sync.status.message || 'This device could not be linked. Try again.'), 'error');
                }
            });
            new MutationObserver(() => { if (document.getElementById('sync-devices') && !document.getElementById('sync-devices').dataset.filled) { document.getElementById('sync-devices').dataset.filled = '1'; window.app.syncDevices(); } })
                .observe(document.getElementById('main-content') || document.body, { childList: true, subtree: true });''')

out.write_text(s, encoding='utf-8')
print(f'wrote {out} ({len(s) // 1024} KB) with sync -> {a.server} as app "{a.app}".')
print('Next: declare SYNC_HOST in build.py, run scripts/sync_flow.mjs, re-run the audit.')
