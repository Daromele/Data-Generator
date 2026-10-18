/* The two storage layers every binder uses.
 *
 * `storage`     a non-throwing localStorage wrapper. Private windows and
 *               blocked site-data make localStorage THROW on access rather
 *               than return null, which crashes an app that assumes
 *               otherwise. This keeps an in-memory mirror so the session
 *               still works, and remembers that it is blocked.
 * `recordStore` IndexedDB for the records themselves, with a synchronous
 *               read cache so render code stays synchronous. localStorage
 *               caps near 5 MB and cannot be raised; photos blow past it.
 */

const storage = {
            memory: {},
            blocked: false,
            lastError: null,
            get(key) {
                if (this.blocked && Object.prototype.hasOwnProperty.call(this.memory, key)) return this.memory[key];
                try {
                    return localStorage.getItem(key);
                } catch (err) {
                    this.blocked = true;
                    this.lastError = err;
                    return Object.prototype.hasOwnProperty.call(this.memory, key) ? this.memory[key] : null;
                }
            },
            set(key, value) {
                const str = String(value);
                this.memory[key] = str;
                try {
                    localStorage.setItem(key, str);
                    return true;
                } catch (err) {
                    this.blocked = true;
                    this.lastError = err;
                    return false;
                }
            },
            remove(key) {
                delete this.memory[key];
                try { localStorage.removeItem(key); } catch (err) { this.blocked = true; this.lastError = err; }
            },
            // Every key this app owns, from real storage and the in-memory
            // fallback alike, so a backup can carry the owner's settings.
            keys() {
                const found = new Set(Object.keys(this.memory));
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k) found.add(k);
                    }
                } catch (err) { this.blocked = true; this.lastError = err; }
                return [...found];
            },
            // Bytes this app is holding in localStorage, so Settings can show
            // the owner where they stand against the browser's fixed limit.
            usage() {
                let bytes = 0;
                this.keys().forEach(k => {
                    const v = this.get(k);
                    if (v !== null && v !== undefined) bytes += k.length + String(v).length;
                });
                return bytes * 2; // stored as UTF-16
            },
            isQuotaError() {
                const err = this.lastError;
                return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
            }
        };

const recordStore = {
            DB: 'momBinderRecords',
            STORE: 'kv',
            available: typeof indexedDB !== 'undefined',
            cache: {},
            dbPromise: null,
            lastError: null,
            usingFallback: false,

            open() {
                if (!this.available) return Promise.reject(new Error('no-indexeddb'));
                if (!this.dbPromise) {
                    this.dbPromise = new Promise((resolve, reject) => {
                        const req = indexedDB.open(this.DB, 1);
                        req.onupgradeneeded = () => {
                            const db = req.result;
                            if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE);
                        };
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => reject(req.error);
                    }).catch(err => { this.dbPromise = null; throw err; });
                }
                return this.dbPromise;
            },

            async idbGet(key) {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(this.STORE, 'readonly');
                    const req = tx.objectStore(this.STORE).get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            },

            async idbSet(key, value) {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).put(value, key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error);
                    tx.onabort = () => reject(tx.error);
                });
            },

            async idbDelete(key) {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).delete(key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error);
                });
            },

            // Fills the synchronous cache, and adopts any records still sitting in
            // localStorage from a version before this store existed.
            async boot(keys) {
                let idbWorks = false;
                if (this.available) {
                    try { await this.open(); idbWorks = true; }
                    catch (err) { this.lastError = err; }
                }
                this.usingFallback = !idbWorks;

                for (const key of keys) {
                    let value = null;
                    if (idbWorks) {
                        try { value = await this.idbGet(key); } catch (err) { this.lastError = err; }
                    }
                    if (value === undefined || value === null) {
                        const legacy = storage.get(key);
                        if (legacy !== null && legacy !== undefined) {
                            value = legacy;
                            // Move it across, then reclaim the localStorage space.
                            if (idbWorks) {
                                try { await this.idbSet(key, legacy); storage.remove(key); }
                                catch (err) { this.lastError = err; }
                            }
                        }
                    }
                    if (value !== undefined && value !== null) this.cache[key] = value;
                }
                return !this.usingFallback;
            },

            get(key) {
                return Object.prototype.hasOwnProperty.call(this.cache, key) ? this.cache[key] : null;
            },

            // Records the value immediately so the app can carry on, and persists
            // it in the background. onFail runs if the browser refuses the write.
            set(key, value, onFail) {
                const str = String(value);
                this.cache[key] = str;
                if (this.usingFallback) {
                    const ok = storage.set(key, str);
                    if (!ok && onFail) onFail(storage.lastError);
                    return ok;
                }
                this.idbSet(key, str).catch(err => {
                    this.lastError = err;
                    if (onFail) onFail(err);
                });
                return true;
            },

            remove(key) {
                delete this.cache[key];
                if (this.usingFallback) { storage.remove(key); return; }
                this.idbDelete(key).catch(err => { this.lastError = err; });
            },

            bytes() {
                return Object.keys(this.cache).reduce((n, k) => n + this.cache[k].length * 2, 0);
            },

            isQuotaError() {
                const err = this.lastError;
                return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
            }
        };
