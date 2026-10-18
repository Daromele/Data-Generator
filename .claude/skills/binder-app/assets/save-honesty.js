/* Telling the owner the truth when a write fails.
 *
 * A binder that reports "Saved" while the write failed is the worst defect
 * in this product class: the owner keeps typing for weeks, then loses the
 * lot. onStoreFailure raises a dialog, offers an immediate backup, and a
 * snapshot is taken before anything destructive.
 */

loadData() {
                const stored = recordStore.get(STORAGE_KEY);
                if (!stored) return this.migrate(this.getDemoData());
                try {
                    const parsed = JSON.parse(stored);
                    // v2 wraps records in an envelope; v1 stored the bare object.
                    const records = (parsed && parsed.__schema) ? parsed.records : parsed;
                    return this.migrate(records || {});
                } catch (err) {
                    console.error('Binder data unreadable', err);
                    const recovered = this.recoverFromSnapshot();
                    if (recovered) return this.migrate(recovered);
                    return this.migrate(this.getDemoData());
                }
            }

            // Brings older files forward: v1 referenced members by name string,
            // which orphaned every record as soon as a room was renamed.
migrate(records) {
                const data = records || {};
                Object.keys(SECTIONS).forEach(key => {
                    if (key === 'dashboard' || SECTIONS[key].custom) return;
                    if (!Array.isArray(data[key])) data[key] = [];
                });

                const byName = {};
                data.members.forEach(room => {
                    if (!room.id) room.id = 'pm' + Math.random().toString(36).slice(2, 9);
                    if (room.name) byName[String(room.name).trim().toLowerCase()] = room.id;
                });

                const toId = (val) => {
                    if (!val) return val;
                    if (data.members.some(room => room.id === val)) return val;
                    return byName[String(val).trim().toLowerCase()] || val;
                };

                Object.keys(data).forEach(key => {
                    if (!Array.isArray(data[key]) || key === 'members') return;
                    data[key].forEach(item => {
                        if (item.member !== undefined && item.member !== null && item.member !== '') {
                            if (Array.isArray(item.member)) item.member = item.member.map(toId);
                            else item.member = toId(item.member);
                        }
                    });
                });

                return data;
            }

saveData(options = {}) {
                Object.keys(SECTIONS).forEach(key => {
                    if (key === 'dashboard' || SECTIONS[key].custom) return;
                    if (!this.data[key]) this.data[key] = [];
                    this.data[key].forEach(item => {
                        SECTIONS[key].fields.forEach(f => {
                            if (f.type === 'number' && item[f.name] !== undefined && item[f.name] !== null && item[f.name] !== '') {
                                item[f.name] = parseFloat(item[f.name]);
                            }
                        });
                    });
                });

                const payload = JSON.stringify({
                    __schema: SCHEMA_VERSION,
                    __app: APP_VERSION,
                    savedAt: new Date().toISOString(),
                    records: this.data
                });

                if (!options.skipSnapshot) this.writeSnapshot();

                // The write is accepted into the synchronous cache immediately and
                // persisted in the background; onFail fires only if the browser
                // actually refuses it, which with IndexedDB means the disk-backed
                // quota is genuinely exhausted rather than a 5 MB ceiling.
                const accepted = recordStore.set(STORAGE_KEY, payload, (err) => this.onStoreFailure(err));
                this.scheduleBackupWrite();
                if (accepted) {
                    this.saveFailed = false;
                    return true;
                }

                // Storage is full: drop the snapshots and try once more.
                if (recordStore.isQuotaError() || storage.isQuotaError()) {
                    SNAPSHOT_KEYS.forEach(k => recordStore.remove(k));
                    if (recordStore.set(STORAGE_KEY, payload, (err) => this.onStoreFailure(err))) {
                        this.saveFailed = false;
                        this.showToast('Storage was full. Older auto-snapshots were cleared to save your work.', 'info');
                        return true;
                    }
                }

                this.saveFailed = true;
                this.onStoreFailure(recordStore.lastError || storage.lastError);
                return false;
            }

            // One honest dialog, shown once, that says what actually went wrong and
            // what the owner can do about it -- a full disk and a blocked private
            // window need different answers.
onStoreFailure(err) {
                this.saveFailed = true;
                if (this.storageWarningShown) return;
                this.storageWarningShown = true;

                const quota = recordStore.isQuotaError() || storage.isQuotaError();
                const blocked = recordStore.usingFallback && storage.blocked;

                let message;
                if (blocked) {
                    message = 'This browser is blocking local storage, which happens in private or incognito windows and when site data is switched off. The binder still works for this session, but nothing will be there when you close the tab. Download a backup before you finish, and link a backup file so future changes are written straight to disk.';
                } else if (quota) {
                    message = 'Your device is out of space for browser storage. Download a backup now so nothing is lost, then free up disk space -- or clear other sites\u2019 data from your browser settings. Linking a backup file keeps your records safe on disk regardless.';
                } else {
                    message = 'The browser refused to write your records. Download a backup now so nothing is lost, then try reopening the binder. Linking a backup file writes changes straight to a file on disk, which does not depend on browser storage at all.';
                }

                this.openConfirm(
                    'This browser will not save your records',
                    message,
                    'Download Backup Now',
                    'bg-rose-600 hover:bg-rose-700 text-white',
                    () => this.exportData()
                );
            }

            // Rolling snapshots: three generations, so a bad import or a
            // mistaken wipe is always recoverable.
writeSnapshot() {
                const current = recordStore.get(STORAGE_KEY);
                if (!current) return;
                try {
                    for (let i = SNAPSHOT_KEYS.length - 1; i > 0; i--) {
                        const prev = recordStore.get(SNAPSHOT_KEYS[i - 1]);
                        if (prev) recordStore.set(SNAPSHOT_KEYS[i], prev);
                    }
                    recordStore.set(SNAPSHOT_KEYS[0], current);
                } catch (err) { /* snapshots are best effort, never block a save */ }
            }

recoverFromSnapshot() {
                for (const key of SNAPSHOT_KEYS) {
                    const snap = recordStore.get(key);
                    if (!snap) continue;
                    try {
                        const parsed = JSON.parse(snap);
                        const records = (parsed && parsed.__schema) ? parsed.records : parsed;
                        if (records && typeof records === 'object') {
                            setTimeout(() => this.showToast('Recovered your records from an auto-snapshot.', 'info'), 800);
                            return records;
                        }
                    } catch (err) { /* try the next generation */ }
                }
                return null;
            }

restoreSnapshot() {
                const recovered = this.recoverFromSnapshot();
                if (!recovered) return this.showToast('No auto-snapshot available yet.', 'error');
                this.openConfirm('Restore last auto-snapshot?', 'This replaces your current records with the most recent automatic snapshot.', 'Restore', 'bg-primary-600 hover:bg-primary-700 text-white', () => {
                    this.data = this.migrate(recovered);
                    this.saveData({ skipSnapshot: true });
                    this.showToast('Snapshot restored.', 'success');
                    this.renderSettings();
                });
            }
