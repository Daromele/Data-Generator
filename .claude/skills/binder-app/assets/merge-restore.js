/* Restoring a backup without destroying what is already there.
 *
 * A restore that can only replace loses work the moment someone uses two
 * devices. These fingerprint records by content, merge two sets, remap the
 * ids other records point at, and drop exact duplicates. validateImport
 * refuses a file that is not this app's backup BEFORE anything is lost.
 */

            // ---- Restore: merge or replace -----------------------------------
            // Two backups from two devices should combine into one binder, not
            // stack a second copy of every shared record. Identity is the record's
            // own content: everything except its id, normalised so key order and
            // stray whitespace cannot make two identical records look different.
recordFingerprint(item) {
                const norm = (v) => {
                    if (v === null || v === undefined || v === '') return '';
                    if (Array.isArray(v)) return v.map(norm).sort().join('\u0001');
                    if (typeof v === 'object') return JSON.stringify(v);
                    return String(v).trim().toLowerCase();
                };
                return Object.keys(item)
                    .filter(k => k !== 'id')
                    .sort()
                    .map(k => k + '\u0000' + norm(item[k]))
                    .filter(pair => !pair.endsWith('\u0000'))
                    .join('\u0002');
            }

            // Sections whose ids are referenced by other records, and the fields
            // that point at them. Merging renumbers colliding ids, so every
            // reference has to follow its record to its new id.
referenceMap() {
                return { members: ['member_select', 'member_multi'], trips: ['trip_select'] };
            }

dataSections() {
                return Object.keys(SECTIONS).filter(k => k !== 'dashboard' && !SECTIONS[k].custom);
            }

            // Returns the merged data plus a per-section tally of what was added
            // and what was recognised as an exact duplicate and left out.
mergeRecords(current, incoming) {
                const merged = {};
                const stats = { added: 0, duplicates: 0, renumbered: 0, sections: {} };
                const sections = this.dataSections();
                const refs = this.referenceMap();
                const idMap = {}; // section -> { incomingId: finalId }

                sections.forEach(k => { merged[k] = (current[k] || []).map(i => Object.assign({}, i)); });

                // Pass one: settle the identity of every referenced entity first, so
                // the records that point at them can be remapped before comparison.
                const order = [...Object.keys(refs).filter(k => sections.includes(k)),
                               ...sections.filter(k => !refs[k])];

                order.forEach(key => {
                    const existing = merged[key];
                    const byPrint = new Map();
                    existing.forEach(i => byPrint.set(this.recordFingerprint(i), i.id));
                    const usedIds = new Set(existing.map(i => i.id));
                    const map = idMap[key] = {};
                    let added = 0, dupes = 0;

                    (incoming[key] || []).forEach(raw => {
                        const item = Object.assign({}, raw);
                        const incomingId = item.id;

                        // Remap this record's references before fingerprinting it, or a
                        // record identical in every human sense looks different purely
                        // because the other file numbered its room differently.
                        this.remapReferences(item, key, idMap);

                        const print = this.recordFingerprint(item);
                        if (byPrint.has(print)) {
                            dupes++;
                            if (incomingId) map[incomingId] = byPrint.get(print);
                            return;
                        }

                        if (!item.id || usedIds.has(item.id)) {
                            item.id = this.freshId(key, usedIds);
                            stats.renumbered++;
                        }
                        if (incomingId) map[incomingId] = item.id;
                        usedIds.add(item.id);
                        byPrint.set(print, item.id);
                        existing.push(item);
                        added++;
                    });

                    stats.added += added;
                    stats.duplicates += dupes;
                    if (added || dupes) stats.sections[key] = { added, duplicates: dupes };
                });

                return { merged, stats };
            }

            // Rewrites this record's pointers to whatever id its referenced
            // records ended up with in the merged binder.
remapReferences(item, sectionKey, idMap) {
                const config = SECTIONS[sectionKey];
                if (!config || !Array.isArray(config.fields)) return;
                const refs = this.referenceMap();
                config.fields.forEach(f => {
                    const target = Object.keys(refs).find(sec => refs[sec].includes(f.type));
                    if (!target) return;
                    const map = idMap[target];
                    if (!map) return;
                    const val = item[f.name];
                    if (val === null || val === undefined || val === '') return;
                    if (Array.isArray(val)) item[f.name] = val.map(v => map[v] || v);
                    else item[f.name] = map[val] || val;
                });
            }

freshId(sectionKey, usedIds) {
                const prefix = sectionKey === 'members' ? 'pm' : '';
                let id;
                do { id = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
                while (usedIds.has(id));
                return id;
            }

            // A single file can carry its own duplicates -- most often because it
            // was itself built by merging. Replace should not import those either.
dedupeRecords(records) {
                let removed = 0;
                this.dataSections().forEach(key => {
                    if (!Array.isArray(records[key])) return;
                    const seen = new Set();
                    records[key] = records[key].filter(item => {
                        const print = this.recordFingerprint(item);
                        if (seen.has(print)) { removed++; return false; }
                        seen.add(print);
                        return true;
                    });
                });
                return removed;
            }

            // A wrong file used to overwrite a year of records permanently.
validateImport(records) {
                if (!records || typeof records !== 'object' || Array.isArray(records)) {
                    return "That file does not look like a binder backup.";
                }
                const known = Object.keys(SECTIONS).filter(k => k !== 'dashboard' && !SECTIONS[k].custom);
                const matching = known.filter(k => Array.isArray(records[k]));
                if (matching.length === 0) {
                    return "No binder records found in that file.";
                }
                const badShape = matching.some(k => records[k].some(item => item === null || typeof item !== 'object' || Array.isArray(item)));
                if (badShape) return "That backup contains damaged records and was not imported.";
                return null;
            }

            // Theme, visible modules, owner names, date and
            // currency format, per-section view -- the setup work the owner did once
            // and should never have to redo after a restore.
settingsPayload() {
                const out = {};
                storage.keys().forEach(k => {
                    if (!k.startsWith(SETTINGS_PREFIX)) return;
                    if (SETTINGS_EXCLUDE.includes(k)) return;
                    const v = storage.get(k);
                    if (v !== null && v !== undefined) out[k] = String(v);
                });
                return out;
            }

            // Applied only when the owner asks for it, and never for the excluded
            // keys even if an older or hand-edited file happens to carry them.
applySettings(settings) {
                if (!settings || typeof settings !== 'object') return 0;
                let applied = 0;
                Object.keys(settings).forEach(k => {
                    if (!k.startsWith(SETTINGS_PREFIX)) return;
                    if (SETTINGS_EXCLUDE.includes(k)) return;
                    const v = settings[k];
                    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return;
                    if (storage.set(k, String(v))) applied++;
                });
                return applied;
            }

async backupPayload() {
                const payload = {
                    __schema: SCHEMA_VERSION,
                    __app: APP_VERSION,
                    savedAt: new Date().toISOString(),
                    records: this.data,
                    settings: this.settingsPayload()
                };
                if (this.includeSamplesInBackup() && sampleStore.available) {
                    const files = await sampleStore.all();
                    if (files && files.length) payload.samples = files;
                }
                return JSON.stringify(payload, null, 2);
            }
