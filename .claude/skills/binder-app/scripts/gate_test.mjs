// The access gate, run against the generated hosting/functions in memory:
// locked without the code, wrong code refused, right code opens (any case, spaces fine) and is
// remembered, one product's code does not open another, icons and manifest stay open.
//   node gate_test.mjs REPO_ROOT
import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2] || '.'), H = path.join(root, 'hosting');
const { onRequest } = await import(pathToFileURL(path.join(H, 'functions/_middleware.js')));
const APPS = (await import(pathToFileURL(path.join(H, 'functions/_apps.js')))).default;
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const call = (p, init = {}) => onRequest({ request: new Request('https://example.pages.dev' + p, init), next: async () => new Response('APP') });
const cf = path.join(H, 'ACCESS_CODES.txt');
const codes = existsSync(cf) ? Object.fromEntries(readFileSync(cf, 'utf8').trim().split('\n').map(l => l.split(': '))) : {};
const slugs = Object.keys(APPS); ok(slugs.length > 0, slugs.length + ' binder(s) gated');
for (const slug of slugs) {
  let r = await call('/' + slug + '/'); ok(r.status === 401 && /access code/i.test(await r.text()), slug + ': locked without a code');
  r = await call('/' + slug); ok(r.status === 301, slug + ': a missing slash is added');
  r = await call('/' + slug + '/icons/icon-192.png'); ok(await r.text() === 'APP', slug + ': icons stay open');
  r = await call('/' + slug + '/manifest.webmanifest'); ok(await r.text() === 'APP', slug + ': the manifest stays open');
  r = await call('/' + slug + '/sw.js'); ok(r.status === 401, slug + ': the app files are locked too');
  const post = code => call('/' + slug + '/', { method: 'POST', body: new URLSearchParams({ code }) });
  r = await post('AAAA-BBBB-CCCC-DDDD'); ok(r.status === 401 && /doesn’t match/.test(await r.text()), slug + ': a wrong code is refused');
  if (!codes[slug]) { console.log('skip  ' + slug + ': no plain code in ACCESS_CODES.txt'); continue; }
  r = await post(codes[slug].toLowerCase().replace(/-/g, ' ')); const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  ok(r.status === 303 && cookie, slug + ': the right code opens it (any case, spaces fine)');
  r = await call('/' + slug + '/', { headers: { cookie } }); ok(await r.text() === 'APP', slug + ': and is remembered on this device');
  r = await call('/not-' + slug + '/', { headers: { cookie } }); ok(await r.text() === 'APP', slug + ': unknown paths are left alone');
}
console.log(fails ? `${fails} failed` : 'all gate checks passed'); process.exit(fails ? 1 : 0);
