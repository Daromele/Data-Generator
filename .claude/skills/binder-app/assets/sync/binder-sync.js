// JPS Sync: optional, end-to-end encrypted sync for single-file HTML apps.
// Paste or inline this file into an app, then:
//   const sync = JPSSync.create({ app: 'budget', server: CONFIG.syncServer, getData: () => state, setData: s => { state = s; save(); render(); } });
//   sync.start();            // resumes sync on this device if it was turned on before
//   sync.turnOn()            // makes a new sync code and uploads this device's data; returns the code
//   sync.join(code)          // links this device to an existing code and merges both sides
//   sync.changed()           // call after every save (commit) so the change goes up within a couple of seconds
//   sync.turnOff()           // stops syncing on this device; data stays here
// Options: merge(local, remote) for the app's own rules, canSync() to pause (sample mode), onStatus(status).
// The sync code never leaves the device. It is stretched into two things: an encryption key, and a room id
// (a hash) that is the only thing the server sees. Anyone without the code sees scrambled bytes only.
(function (root) {
  'use strict';
  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // no 0/O or 1/I, so codes survive being read aloud
  const ITERATIONS = 210000;
  const te = new TextEncoder(), td = new TextDecoder();
  const cryptoApi = root.crypto;

  const cleanCode = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .split('').filter(ch => ALPHABET.includes(ch)).join('');
  const formatCode = c => cleanCode(c).match(/.{1,4}/g)?.join('-') || '';
  function newCode() {                                   // 16 characters = 80 bits, e.g. K7QM-3XRA-9PLW-T4ZD
    const b = cryptoApi.getRandomValues(new Uint8Array(16));
    return formatCode(Array.from(b, x => ALPHABET[x & 31]).join(''));
  }
  const validCode = c => cleanCode(c).length === 16;

  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const hex = u8 => Array.from(u8, x => x.toString(16).padStart(2, '0')).join('');

  async function deriveKeys(app, code) {
    const base = await cryptoApi.subtle.importKey('raw', te.encode(cleanCode(code)), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await cryptoApi.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode('jps-sync:v1:' + app), iterations: ITERATIONS }, base, 512));
    const key = await cryptoApi.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const room = hex(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bits.slice(32))));
    return { key, room };
  }

  async function squeeze(u8, way) {                     // gzip when the browser can; budgets shrink a lot
    const s = new Blob([u8]).stream().pipeThrough(way === 'in' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  const canZip = typeof CompressionStream === 'function';
  async function seal(key, data) {
    let body = te.encode(JSON.stringify(data)), flag = 0;
    if (canZip) { body = await squeeze(body, 'in'); flag = 1; }
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, body));
    const out = new Uint8Array(13 + ct.length); out[0] = flag; out.set(iv, 1); out.set(ct, 13);
    return 'v1.' + b64(out);
  }
  async function open(key, blob) {
    if (!/^v1\./.test(blob)) throw new Error('format');
    const raw = unb64(blob.slice(3));
    let body = new Uint8Array(await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(1, 13) }, key, raw.slice(13)));
    if (raw[0] === 1) body = await squeeze(body, 'out');
    return JSON.parse(td.decode(body));
  }

  // The default merge. Lists of records with an `id` are combined record by record: the newer `updatedAt`
  // wins, and a deleted record should stay as { id, deleted: true, updatedAt } so the other device doesn't bring it back.
  // Anything else (settings, single values) comes from whichever whole copy was saved last (`updatedAt` at the top).
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const isRecords = a => Array.isArray(a) && a.length > 0 && a.every(r => isObj(r) && r.id != null);
  const stamp = r => (r && (r.updatedAt || r.createdAt)) || '';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function pick(a, b) {                                  // the same answer on both devices, even on a tie
    const sa = stamp(a), sb = stamp(b);
    if (sa !== sb) return sa > sb ? a : b;
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  }
  function mergeValue(a, b, preferA) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if ((isRecords(a) || (Array.isArray(a) && !a.length)) && (isRecords(b) || (Array.isArray(b) && !b.length)) && (a.length || b.length)) {
      const byId = new Map();
      for (const r of a) byId.set(String(r.id), r);
      for (const r of b) { const k = String(r.id), cur = byId.get(k); byId.set(k, cur ? mergeRecord(cur, r) : r); }
      // the synced copy's order first, then records only this device has, so both devices settle on one order
      const inB = new Set(b.map(r => String(r.id)));
      const order = [...b.map(r => String(r.id)), ...a.map(r => String(r.id)).filter(k => !inB.has(k))];
      return order.map(k => byId.get(k));
    }
    if (isObj(a) && isObj(b)) {
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = mergeValue(a[k], b[k], preferA);
      return out;
    }
    return preferA ? a : b;
  }
  function mergeRecord(a, b) {
    if (same(a, b)) return a;
    const win = pick(a, b), lose = win === a ? b : a, out = { ...win };
    for (const k of Object.keys(lose)) {                 // keep child lists from both sides (logs, tags, splits)
      if (isRecords(win[k]) || isRecords(lose[k])) out[k] = mergeValue(win[k], lose[k], true);
    }
    return out;
  }
  function merge(local, remote) {
    if (!isObj(local)) return remote;
    if (!isObj(remote)) return local;
    return mergeValue(local, remote, pick(local, remote) === local);
  }

  // ---- Units: sync for apps whose records carry no edit times (the Monthly Plan core and similar) ----
  // The app's whole state is cut into units: one per record in a list of {id} objects ("transactions:t1"),
  // one per key of a plain object ("months/2026-10", "settings/name"), and one per other top-level value.
  // track() compares the state before and after each save and stamps every unit that changed (and notes the
  // ones removed); merge() keeps, unit by unit, the copy stamped last. Stamps live in state.sync.
  const META = 'sync';
  const recList = v => Array.isArray(v) && v.length > 0 && v.every(r => isObj(r) && (typeof r.id === 'string' || typeof r.id === 'number'));
  function cut(doc, skip) {
    const out = new Map(), shape = {};
    for (const [k, v] of Object.entries(doc || {})) {
      if (k === META || skip.includes(k)) continue;
      if (Array.isArray(v) && !v.length) shape[k] = 'empty';
      else if (recList(v)) { shape[k] = 'list'; for (const r of v) out.set(k + ':' + r.id, r); }
      else if (isObj(v)) { shape[k] = 'map'; for (const [kk, vv] of Object.entries(v)) if (!skip.includes(k + '/' + kk)) out.set(k + '/' + kk, vv); }
      else { shape[k] = 'value'; out.set(k, v); }
    }
    return { units: out, shape };
  }
  const metaOf = d => ({ stamps: { ...((d && d[META] && d[META].stamps) || {}) }, deleted: { ...((d && d[META] && d[META].deleted) || {}) } });
  function track(before, after, { now = new Date().toISOString(), skip = [] } = {}) {
    const a = cut(before, skip).units, b = cut(after, skip).units, m = metaOf(after), pm = metaOf(before);
    for (const [k, t] of Object.entries(pm.stamps)) if (!m.stamps[k] || t > m.stamps[k]) m.stamps[k] = t;
    for (const [k, t] of Object.entries(pm.deleted)) if (!m.deleted[k] || t > m.deleted[k]) m.deleted[k] = t;
    for (const [k, v] of b) if (!a.has(k) || JSON.stringify(a.get(k)) !== JSON.stringify(v)) { m.stamps[k] = now; delete m.deleted[k]; }
    for (const k of a.keys()) if (!b.has(k)) { m.deleted[k] = now; delete m.stamps[k]; }
    after[META] = m; return after;
  }
  function mergeUnits(L, R, { skip = [] } = {}) {
    if (!isObj(R)) return L;
    if (!isObj(L)) return R;
    const l = cut(L, skip), r = cut(R, skip), ml = metaOf(L), mr = metaOf(R), out = { ...R }, meta = { stamps: {}, deleted: {} };
    for (const k of new Set([...Object.keys(ml.deleted), ...Object.keys(mr.deleted)])) meta.deleted[k] = [ml.deleted[k] || '', mr.deleted[k] || ''].sort()[1];
    const keep = new Map();
    for (const k of new Set([...l.units.keys(), ...r.units.keys()])) {
      const inL = l.units.has(k), inR = r.units.has(k), sl = ml.stamps[k] || '', sr = mr.stamps[k] || '';
      let useL = inL && (!inR || sl > sr || (sl === sr && JSON.stringify(l.units.get(k)) >= JSON.stringify(r.units.get(k))));
      const stamp = useL ? sl : sr;
      if ((meta.deleted[k] || '') >= stamp && meta.deleted[k]) continue;   // deleted on a device after its last edit
      if (stamp) meta.stamps[k] = stamp;
      keep.set(k, useL ? l.units.get(k) : r.units.get(k));
    }
    for (const k of Object.keys(meta.stamps)) delete meta.deleted[k];
    const shape = {}, rank = { list: 3, map: 3, value: 2, empty: 1 };
    for (const k of new Set([...Object.keys(l.shape), ...Object.keys(r.shape)])) shape[k] = (rank[l.shape[k]] || 0) >= (rank[r.shape[k]] || 0) ? l.shape[k] : r.shape[k];
    const keys = [...Object.keys(R), ...Object.keys(L).filter(k => !(k in R))];
    for (const k of keys) {
      if (k === META || skip.includes(k)) continue;
      const sh = shape[k];
      if (sh === 'list') {
        const ids = [...(Array.isArray(R[k]) ? R[k] : []), ...(Array.isArray(L[k]) ? L[k] : [])].map(x => x && x.id);
        out[k] = [...new Set(ids)].filter(id => keep.has(k + ':' + id)).map(id => keep.get(k + ':' + id));
      } else if (sh === 'map') {
        const o = {}, kept = [...keep.keys()].filter(u => u.startsWith(k + '/'));
        if (!kept.length && !(isObj(R[k]) || isObj(L[k]))) continue;
        for (const u of kept) o[u.slice(k.length + 1)] = keep.get(u);
        for (const sk of skip) if (sk.startsWith(k + '/')) { const kk = sk.slice(k.length + 1); if (isObj(L[k]) && kk in L[k]) o[kk] = L[k][kk]; }
        out[k] = o;
      } else if (sh === 'empty') out[k] = [];
      else if (keep.has(k)) out[k] = keep.get(k); else delete out[k];
    }
    for (const k of skip) if (!k.includes('/') && k in L) out[k] = L[k];
    out[META] = meta; return out;
  }

  // ---- Devices: each device has a random id and a name; the list travels inside the encrypted data ----
  function deviceName() {
    const ua = (root.navigator && root.navigator.userAgent) || '', touchMac = root.navigator && root.navigator.platform === 'MacIntel' && root.navigator.maxTouchPoints > 1;
    const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || touchMac ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet') : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux PC' : 'Device';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
    return browser ? kind + ' · ' + browser : kind;
  }
  const emptyReg = () => ({ devices: {}, removed: {} });
  function mergeReg(a, b) {
    a = a || emptyReg(); b = b || emptyReg();
    const out = { devices: {}, removed: { ...b.removed } };
    for (const [id, t] of Object.entries(a.removed || {})) if (!out.removed[id] || t > out.removed[id]) out.removed[id] = t;
    for (const src of [b.devices || {}, a.devices || {}]) for (const [id, d] of Object.entries(src)) { const cur = out.devices[id]; if (!cur || d.at > cur.at || (d.at === cur.at && d.name > cur.name)) out.devices[id] = d; }
    for (const [id, d] of Object.entries(out.devices)) { if (out.removed[id] >= d.at) delete out.devices[id]; else delete out.removed[id]; }
    return out;
  }
  const unwrap = o => isObj(o) && o.v === 2 ? { data: o.data, reg: o.reg || emptyReg(), closed: o.closed } : { data: o, reg: emptyReg() };
  const CLOSED = { moved: 'The sync code was changed on another device. Enter the new code here to keep syncing.', deleted: 'The synced copy was deleted on another device, so sync is off. Your data is still on this device.', removed: 'This device was removed from sync on another device. Your data is still here.' };

  function create(opts) {
    const { app, server, getData, setData } = opts;
    if (!app || !server || !getData || !setData) throw new Error('JPSSync.create needs app, server, getData and setData');
    const doMerge = opts.merge || merge;
    const store = opts.storage || (() => { try { return root.localStorage; } catch { return null; } })();
    const KEY = (opts.storageKey || app) + ':sync';
    const fetcher = opts.fetch || ((...a) => root.fetch(...a));
    const every = opts.pollMs ?? 60000;
    let saved = null; try { saved = JSON.parse(store?.getItem(KEY) || 'null'); } catch {}
    if (saved && !saved.reg) saved.reg = emptyReg();
    const DKEY = (opts.storageKey || app) + ':device';
    let me = null; try { me = JSON.parse(store?.getItem(DKEY) || 'null'); } catch {}
    if (!me || !/^[a-f0-9]{32}$/.test(me.id)) { me = { id: hex(cryptoApi.getRandomValues(new Uint8Array(16))), name: opts.deviceName || deviceName() }; try { store?.setItem(DKEY, JSON.stringify(me)); } catch {} }
    const now = () => new Date().toISOString();
    const selfIn = reg => { const d = reg.devices[me.id]; if (!d || d.name !== me.name) reg.devices[me.id] = { name: me.name, at: now() }; delete reg.removed[me.id]; return reg; };
    let keys = null, busy = null, again = false, timer = null, poll = null;
    let status = { state: saved ? 'idle' : 'off', at: saved?.at || null, message: '' };

    const remember = () => { try { saved ? store?.setItem(KEY, JSON.stringify(saved)) : store?.removeItem(KEY); } catch {} };
    const tell = (state, message = '') => { status = { state, at: state === 'synced' ? new Date().toISOString() : status.at, message }; if (saved && state === 'synced') { saved.at = status.at; remember(); } opts.onStatus?.(status); };
    const url = (k = keys, sub = '') => server.replace(/\/+$/, '') + '/v1/rooms/' + k.room + sub;
    async function ready() { if (!keys) keys = await deriveKeys(app, saved.code); return keys; }

    async function call(method, body, k = keys, sub = '') {
      const headers = { 'x-device': me.id }; if (body) headers['content-type'] = 'application/json';
      const res = await fetcher(url(k, sub), { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
      let data = null; try { data = await res.json(); } catch {}
      return { status: res.status, data: data || {} };
    }

    async function once() {
      await ready();
      for (let tries = 0; tries < 6; tries++) {
        let { status: st, data } = await call('GET');
        if (st === 403 && data.error === 'device_limit') { const e = new Error('limit'); e.limit = data.max || 5; throw e; }
        if (st !== 200 && st !== 404) throw new Error('server ' + st);
        const local = getData();
        let rev = st === 200 ? data.rev : 0, merged = local, remote = { reg: emptyReg() };
        if (st === 200) {
          try { remote = unwrap(await open(keys.key, data.blob)); } catch { const e = new Error('unreadable'); e.unreadable = true; throw e; }
          if (remote.closed) { const e = new Error('closed'); e.closed = remote.closed; throw e; }
          const r = remote.reg.removed[me.id], mine = saved.reg.devices[me.id];
          if (r && !saved.joining && (!mine || r >= mine.at)) { const e = new Error('closed'); e.closed = 'removed'; throw e; }
          merged = doMerge(local, remote.data);
        }
        const reg = selfIn(mergeReg(saved.reg, remote.reg));
        saved.reg = reg; remember();
        if (!same(merged, local)) {
          setData(merged);
          // the app may tidy what it receives (its own checks); upload the tidied copy so devices settle instead of undoing each other
          const after = getData(); if (!same(after, merged)) merged = after;
        }
        if (st === 200 && same(merged, remote.data) && same(reg, remote.reg)) { saved.rev = rev; remember(); return { found: true }; }
        const put = await call('PUT', { base: rev, blob: await seal(keys.key, { v: 2, data: merged, reg }) });
        if (put.status === 200) { saved.rev = put.data.rev; remember(); return { found: st === 200 }; }
        if (put.status === 403 && put.data.error === 'device_limit') { const e = new Error('limit'); e.limit = put.data.max || 5; throw e; }
        if (put.status === 413) { const e = new Error('too_big'); e.tooBig = true; throw e; }
        if (put.status !== 409) throw new Error('server ' + put.status);
        // someone else saved first: go round again and merge with theirs
      }
      throw new Error('busy');
    }

    async function syncNow() {
      if (!saved) return { off: true };
      if (opts.canSync && !opts.canSync()) return { paused: true };   // e.g. while the app shows sample data
      if (busy) { again = true; return busy; }
      tell('syncing');
      busy = (async () => {
        try {
          let r; do { again = false; r = await once(); } while (again);
          tell('synced'); return r;
        } catch (e) {
          if (e.closed) { stop(); saved = null; keys = null; remember(); tell('off', CLOSED[e.closed]); throw e; }
          if (e.limit) { tell('error', `This sync code is already used on ${e.limit} devices. Remove one under Settings on another device, then try again.`); throw e; }
          const offline = root.navigator && root.navigator.onLine === false;
          tell(offline ? 'offline' : 'error', e.unreadable ? 'The synced data can’t be opened with this code.' : e.tooBig ? 'Too much data to sync (over 5 MB).' : offline ? 'Offline. Changes will sync when you’re back online.' : 'Couldn’t reach the sync service. It will try again.');
          throw e;
        } finally { busy = null; }
      })();
      return busy;
    }
    const quiet = () => syncNow().catch(() => {});

    function listen() {
      stop();
      if (!every || !root.document) return;
      poll = setInterval(() => { if (root.document.visibilityState === 'visible') quiet(); }, every);
      root.addEventListener?.('online', quiet);
      root.addEventListener?.('focus', quiet);
      root.document.addEventListener?.('visibilitychange', onVis);
    }
    function onVis() { if (root.document.visibilityState === 'visible') quiet(); }
    function stop() {
      clearInterval(poll); clearTimeout(timer); poll = timer = null;
      root.removeEventListener?.('online', quiet); root.removeEventListener?.('focus', quiet);
      root.document?.removeEventListener?.('visibilitychange', onVis);
    }

    // replaces the synced copy with a note (encrypted like everything else) that tells other devices why sync stopped
    async function close(k, why) {
      for (let tries = 0; tries < 6; tries++) {
        const g = await call('GET', null, k), base = g.status === 200 ? g.data.rev : 0;
        const p = await call('PUT', { base, blob: await seal(k.key, { v: 2, closed: why }) }, k);
        if (p.status === 200) return;
        if (p.status !== 409) throw new Error('The sync service could not be reached. Try again.');
      }
      throw new Error('The sync service is busy. Try again.');
    }

    return {
      get status() { return status; },
      get code() { return saved ? formatCode(saved.code) : ''; },
      get on() { return !!saved; },
      start() { if (saved) { listen(); quiet(); } return !!saved; },
      async turnOn() { saved = { code: newCode(), rev: 0, reg: emptyReg() }; keys = null; remember(); await syncNow(); listen(); return formatCode(saved.code); },
      async join(code) {
        if (!validCode(code)) throw new Error('That code should be 16 letters and numbers, like K7QM-3XRA-9PLW-T4ZD.');
        const before = saved; saved = { code: cleanCode(code), rev: 0, reg: emptyReg(), joining: true }; keys = null;
        try { const r = await syncNow(); delete saved.joining; remember(); listen(); return r; }
        catch (e) { saved = before; keys = null; remember(); throw e; }
      },
      turnOff() { stop(); saved = null; keys = null; remember(); tell('off'); },
      get deviceId() { return me.id; },
      get deviceName() { return me.name; },
      // every device on this code: its name, when it last synced (from the server), and whether it is this one
      async devices() {
        if (!saved) return [];
        await ready(); let seen = {};
        try { const r = await call('GET', null, keys, '/devices'); if (r.status === 200) seen = r.data.devices || {}; } catch {}
        const reg = saved.reg, ids = new Set([...Object.keys(reg.devices), ...Object.keys(seen)]);
        return [...ids].filter(id => !reg.removed[id]).map(id => ({ id, name: reg.devices[id]?.name || 'Another device', lastSeen: seen[id] ? new Date(seen[id]).toISOString() : null, me: id === me.id }))
          .sort((a, b) => (b.me - a.me) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
      },
      async renameDevice(name) { name = String(name || '').trim().slice(0, 40); if (!name) return; me.name = name; try { store?.setItem(DKEY, JSON.stringify(me)); } catch {} if (saved) { selfIn(saved.reg); remember(); return syncNow(); } },
      // the other device stops syncing the next time it checks in (anyone with the code can link again: change the code to lock them out)
      async removeDevice(id) {
        if (!saved || id === me.id) return; await ready();
        saved.reg.removed[id] = now(); delete saved.reg.devices[id]; remember();
        try { await call('DELETE', null, keys, '/devices/' + id); } catch {}
        return syncNow();
      },
      // a new code for everyone: the data moves under it, and devices on the old code are told to enter the new one
      async changeCode() {
        if (!saved) throw new Error('Sync is off.');
        await syncNow();
        const old = await ready(), code = newCode(), fresh = await deriveKeys(app, code), reg = selfIn(mergeReg(saved.reg, emptyReg()));
        const put = await call('PUT', { base: 0, blob: await seal(fresh.key, { v: 2, data: getData(), reg }) }, fresh);
        if (put.status !== 200) throw new Error('The new code could not be set up. Try again.');
        await close(old, 'moved');
        saved = { code, rev: put.data.rev, reg, at: saved.at }; keys = fresh; remember(); tell('synced');
        return formatCode(code);
      },
      // wipe the synced copy from the server; every device stops syncing and keeps its own data
      async deleteRemote() {
        if (!saved) return; const k = await ready();
        await close(k, 'deleted'); stop(); saved = null; keys = null; remember(); tell('off');
      },
      changed() { if (!saved) return; clearTimeout(timer); timer = setTimeout(quiet, opts.debounceMs ?? 1500); },
      syncNow,
    };
  }

  const api = { create, merge, deviceName, units: { track, merge: mergeUnits }, newCode, formatCode, validCode, _internal: { deriveKeys, seal, open } };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.JPSSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
