#!/usr/bin/env node
// Listing photos: 1500x1200 JPGs built from the real app's screenshots.
//
//   NODE_PATH=$(npm root -g) node make_photos.js kit.json App.html SHOTS_DIR OUT_DIR
//
// SHOTS_DIR comes from capture_screens.js. kit.json lists the slides (see
// apps/homeschool-hub/kit.json); kinds: hero, screen, doc, steps, themes, list.
// Fonts are lifted from the app's own inlined <style id="binder-fonts">, and the
// colours from its THEMES[kit.theme] -- a product never gets its own palette.
//
// House rules (references/packaging.md §3): centred titles; headline <= ~30
// characters and one short sub for phone legibility; everything that must be
// read in search sits inside the centre 1200px (Etsy crops thumbnails square);
// pills on one row with a light grey fill. The script measures the hero's text
// and fails if it leaves that band.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [kitPath, appPath, shots, out] = process.argv.slice(2);
if (!out) { console.error('usage: node make_photos.js kit.json App.html SHOTS_DIR OUT_DIR'); process.exit(2); }
const kit = JSON.parse(fs.readFileSync(kitPath, 'utf8'));
const app = fs.readFileSync(appPath, 'utf8');
fs.mkdirSync(out, { recursive: true });

const fonts = (app.match(/<style id="binder-fonts">([\s\S]*?)<\/style>/) || [, ''])[1];
const themeBlock = (app.match(new RegExp(kit.theme + ":\\s*\\{([^}]*)\\}")) || [, ''])[1];
const T = {}; themeBlock.replace(/(\d+):\s*'(#[0-9a-f]{6})'/gi, (_, k, v) => (T[k] = v));
if (!T[600]) { console.error('theme ' + kit.theme + ' not found in the app'); process.exit(1); }

const img = name => {
  const f = path.join(shots, name + '.png');
  if (!fs.existsSync(f)) throw new Error('missing screenshot ' + f);
  return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICONS = [   // 24px line icons, stroke 1.8, round caps
  '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
  '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  '<path d="M4 4v6h6"/><path d="M20 12a8 8 0 1 0-2.3 5.7"/>',
  '<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9"/><path d="M12 12v7M9 15l3-3 3 3"/>',
];
const icon = (i, color = '#fff') => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[i % ICONS.length]}</svg>`;

const CSS = `${fonts}
*{box-sizing:border-box;margin:0}
body{width:1500px;height:1200px;overflow:hidden;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.s{position:relative;width:1500px;height:1200px;display:flex;flex-direction:column;align-items:center;padding:86px 90px 0;text-align:center}
.s.mid{justify-content:center;padding-top:0}
.dark{background:radial-gradient(1200px 700px at 50% 0%, ${T[700]} 0%, ${T[900]} 55%, #0f172a 100%);color:#fff}
.light{background:linear-gradient(180deg, ${T[50]} 0%, #ffffff 70%);color:#0f172a}
h1{font-family:Merriweather,serif;font-weight:700;font-size:84px;line-height:1.08;letter-spacing:-.01em;max-width:1200px}
.sub{font-size:36px;line-height:1.3;margin-top:22px;max-width:1150px;font-weight:500}
.dark .sub{color:${T[200]}} .light .sub{color:#475569}
.pills{display:flex;gap:16px;margin-top:34px;flex-wrap:nowrap}
.pill{background:#f1f5f9;color:#334155;border-radius:999px;padding:14px 28px;font-weight:700;font-size:26px;white-space:nowrap}
.frame{border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.08);background:#fff}
.frame img{display:block;width:100%}
.bar{height:34px;background:#e2e8f0;display:flex;align-items:center;gap:8px;padding:0 14px}
.bar i{width:12px;height:12px;border-radius:50%;background:#cbd5e1;display:block}
.paper{background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.35);border-radius:6px;overflow:hidden}
.paper img{display:block;width:100%}
.grid4{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:70px;width:1280px}
.card{display:flex;gap:26px;align-items:center;text-align:left;padding:44px 36px;border-radius:20px;background:${T[600]}17;border:2px solid ${T[600]}47}
.card .ic{flex:none;width:88px;height:88px;border-radius:18px;background:${T[600]};display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px ${T[600]}55}
.card b{display:block;font-size:38px;color:#0f172a;margin-bottom:6px}.card span{font-size:27px;line-height:1.3;color:#475569}
.steps{display:flex;gap:30px;margin-top:70px}
.step{width:410px;padding:60px 30px;border-radius:24px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.18)}
.num{width:96px;height:96px;margin:0 auto 26px;border-radius:50%;background:${T[400]};color:${T[900]};font:800 48px/96px Inter,sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.35)}
.step b{font-size:44px;line-height:1.2;display:block}
.themes{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:60px;width:1340px}
.themes .frame{border-radius:12px}
`;

function slide(s, i) {
  const dark = s.kind === 'hero' || s.kind === 'steps' || (s.kind !== 'list' && s.kind !== 'themes' && i % 2 === 1);
  const head = `<h1 id="h">${esc(s.headline)}</h1>${s.sub ? `<p class="sub" id="sub">${esc(s.sub)}</p>` : ''}`;
  const browser = (name, w, extra = '') => `<div class="frame" style="width:${w}px;${extra}"><div class="bar"><i></i><i></i><i></i></div><img src="${img(name)}"></div>`;
  let body = '';
  if (s.kind === 'hero') {
    body = `${head}<div class="pills">${(s.pills || []).map(p => `<span class="pill">${esc(p)}</span>`).join('')}</div>
      <div style="position:relative;width:1320px;margin-top:54px">${browser(s.images[0], 1100, 'margin-left:0')}
      <div class="paper" style="position:absolute;right:0;top:70px;width:380px;transform:rotate(2deg)"><img src="${img(s.images[1])}"></div></div>`;
  } else if (s.kind === 'screen') {
    body = `${head}<div style="margin-top:56px">${browser(s.images[0], 1220)}</div>`;
  } else if (s.kind === 'doc') {
    const n = s.images.length, w = n === 2 ? 520 : 400;
    body = `${head}<div style="display:flex;gap:40px;margin-top:64px;align-items:flex-start">${s.images.map((m, k) => `<div class="paper" style="width:${w}px;transform:rotate(${(k - (n - 1) / 2) * 2}deg)"><img src="${img(m)}"></div>`).join('')}</div>`;
  } else if (s.kind === 'steps') {
    body = `${head}<div class="steps">${kit.steps.map((t, k) => `<div class="step"><div class="num">${k + 1}</div><b>${esc(t)}</b></div>`).join('')}</div>`;
  } else if (s.kind === 'themes') {
    body = `${head}<div class="themes">${s.images.map(m => browser(m, 425)).join('')}</div>`;
  } else if (s.kind === 'list') {
    body = `${head}<div class="grid4">${s.items.map(([t, d], k) => `<div class="card"><div class="ic">${icon(k)}</div><div><b>${esc(t)}</b><span>${esc(d)}</span></div></div>`).join('')}</div>`;
  }
  const mid = ['steps', 'list', 'themes'].includes(s.kind) ? ' mid' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="s ${dark ? 'dark' : 'light'}${mid}">${body}</div></body></html>`;
}

(async () => {
  const opts = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  const browser = await chromium.launch(opts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  let bad = 0;
  for (const [i, s] of kit.slides.entries()) {
    if (s.headline.length > 32) console.warn(`  slide ${i + 1}: headline is ${s.headline.length} chars; aim for <= 30`);
    await page.setContent(slide(s, i), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (i === 0) {   // Etsy's square search crop keeps x 150..1350
      const r = await page.evaluate(() => ['h', 'sub'].map(id => document.getElementById(id)).filter(Boolean).map(e => e.getBoundingClientRect()).map(b => [b.left, b.right]));
      const box = await page.evaluate(() => [...document.querySelectorAll('h1,.sub')].map(e => { const rg = document.createRange(); rg.selectNodeContents(e); const b = rg.getBoundingClientRect(); return [b.left, b.right]; }));
      for (const [l, rr] of box) if (l < 150 || rr > 1350) { console.error(`  hero text spans ${l | 0}-${rr | 0}px: outside the square crop`); bad++; }
    }
    const over = await page.evaluate(() => document.body.scrollHeight - 1200);
    if (over > 0) console.warn(`  slide ${i + 1}: content runs ${over}px past the bottom (cropped)`);
    const name = `${String(i + 1).padStart(2, '0')}_${s.kind}.jpg`;
    await page.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 92 });
    console.log('  ' + name);
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
