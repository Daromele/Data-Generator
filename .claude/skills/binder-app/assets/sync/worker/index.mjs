// Binder sync server (shared with the JPS Sync worker source -- keep them identical): a Cloudflare Worker that stores one encrypted blob per sync room.
// It never sees the sync code or the data, only a room id (a hash made on the device) and scrambled bytes.
// Each room is a Durable Object, so two phones saving at once can't overwrite each other: a save names the
// revision it was based on, and a stale one is turned away (409) with the current copy to merge into.
const MAX_BYTES = 5 * 1024 * 1024;           // one app's encrypted data
const ROOM = /^[a-f0-9]{64}$/, DEVICE = /^[a-f0-9]{16,64}$/;
const MAX_DEVICES = 5, ACTIVE_DAYS = 30;     // a code works on up to 5 devices that synced in the last 30 days
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type, x-device', 'access-control-max-age': '86400' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const m = new URL(req.url).pathname.match(/^\/v1\/rooms\/([^/]+)(\/devices(?:\/([^/]+))?)?$/);
    if (!m) return json({ error: 'not_found' }, 404);
    if (!ROOM.test(m[1]) || (m[3] && !DEVICE.test(m[3]))) return json({ error: 'bad_room' }, 400);
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return json({ error: 'method' }, 405);
    const dev = req.headers.get('x-device');
    if (dev && !DEVICE.test(dev)) return json({ error: 'bad_device' }, 400);
    if (req.method === 'PUT' && +(req.headers.get('content-length') || 0) > MAX_BYTES * 1.4) return json({ error: 'too_big', max: MAX_BYTES }, 413);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(req);
  },
};

// Durable Object storage holds at most 128 KiB per value, so the blob is kept in 100,000-character pieces.
const PIECE = 100000;
export class Room {
  constructor(state) { this.storage = state.storage; }
  async read() {
    const meta = await this.storage.get('meta');
    if (!meta) return null;
    const keys = Array.from({ length: meta.n }, (_, i) => 'c' + i), got = await this.storage.get(keys);
    return { rev: meta.rev, saved: meta.saved, blob: keys.map(k => got.get(k)).join('') };
  }
  // the devices using this code: random ids the devices make up, and when each last synced. No names, nothing else.
  async devices() {
    const all = (await this.storage.get('devices')) || {}, cut = Date.now() - ACTIVE_DAYS * 864e5;
    for (const [id, t] of Object.entries(all)) if (t < cut) delete all[id];
    return all;
  }
  async fetch(req) {
    const path = new URL(req.url).pathname, sub = path.match(/\/devices(?:\/([^/]+))?$/), dev = req.headers.get('x-device');
    let devices = await this.devices();
    if (dev) {
      if (!(dev in devices) && Object.keys(devices).length >= MAX_DEVICES) return json({ error: 'device_limit', max: MAX_DEVICES }, 403);
      if (!(dev in devices) || Date.now() - devices[dev] > 36e5) { devices[dev] = Date.now(); await this.storage.put('devices', devices); }   // at most one write an hour
    }
    if (sub) {
      if (req.method === 'GET') return json({ devices });
      if (req.method === 'DELETE' && sub[1]) { delete devices[sub[1]]; await this.storage.put('devices', devices); return json({ ok: true }); }
      return json({ error: 'method' }, 405);
    }
    if (req.method === 'GET') {
      const rec = await this.read();
      return rec ? json(rec) : json({ error: 'empty', rev: 0 }, 404);
    }
    if (req.method === 'DELETE') { await this.storage.deleteAll(); return json({ ok: true }); }
    let body; try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const { base, blob } = body || {};
    if (!Number.isInteger(base) || typeof blob !== 'string' || !blob) return json({ error: 'bad_body' }, 400);
    if (blob.length > MAX_BYTES * 1.4) return json({ error: 'too_big', max: MAX_BYTES }, 413);
    const meta = await this.storage.get('meta'), rev = meta ? meta.rev : 0;
    if (base !== rev) return json({ error: 'conflict', ...((await this.read()) || { rev: 0 }) }, 409);
    const n = Math.ceil(blob.length / PIECE), next = { meta: { rev: rev + 1, n, saved: new Date().toISOString() } };
    for (let i = 0; i < n; i++) next['c' + i] = blob.slice(i * PIECE, (i + 1) * PIECE);
    await this.storage.put(next);                                   // one write, all or nothing
    const stale = Array.from({ length: Math.max(0, (meta?.n || 0) - n) }, (_, i) => 'c' + (n + i));
    if (stale.length) await this.storage.delete(stale);
    return json({ rev: next.meta.rev, saved: next.meta.saved });
  }
}
