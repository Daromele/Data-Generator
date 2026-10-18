#!/usr/bin/env node
// Walkthrough video: three steps over the real screenshots, 1440x1080 H.264.
//
//   NODE_PATH=$(npm root -g) node make_video.js kit.json App.html SHOTS_DIR OUT.mp4
//
// Scenes: title -> step 1 (the entity screen) -> step 2 (the day-to-day
// screens) -> step 3 (the printed document) -> closing card. Each scene is a
// still rendered in a browser, then ffmpeg adds a slow zoom and crossfades
// (libx264, yuv420p, -crf 18, +faststart). Writes OUT.mp4 and OUT-still.jpg
// (the step-3 frame, for the deck). Needs ffmpeg on PATH.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const [kitPath, appPath, shots, outFile] = process.argv.slice(2);
if (!outFile) { console.error('usage: node make_video.js kit.json App.html SHOTS_DIR OUT.mp4'); process.exit(2); }
const kit = JSON.parse(fs.readFileSync(kitPath, 'utf8'));
const app = fs.readFileSync(appPath, 'utf8');
const fonts = (app.match(/<style id="binder-fonts">([\s\S]*?)<\/style>/) || [, ''])[1];
const T = {}; ((app.match(new RegExp(kit.theme + ":\\s*\\{([^}]*)\\}")) || [, ''])[1]).replace(/(\d+):\s*'(#[0-9a-f]{6})'/gi, (_, k, v) => (T[k] = v));
const img = n => 'data:image/png;base64,' + fs.readFileSync(path.join(shots, n + '.png')).toString('base64');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const first = (...names) => names.find(n => fs.existsSync(path.join(shots, n + '.png')));

const v = kit.video || {};
const scenes = [
  { kind: 'title', title: kit.product, sub: (kit.listing && kit.listing.promise) || '' },
  { kind: 'screen', n: 1, title: kit.steps[0], image: v.step1 || first('screen-' + kit.entity, 'screen-students', 'screen-dashboard') },
  { kind: 'screen', n: 2, title: kit.steps[1], image: v.step2 || first('screen-lesson_plans', 'screen-attendance', 'screen-dashboard') },
  { kind: 'screen', n: 2, title: kit.steps[1], image: v.step2b || first('screen-dashboard') },
  { kind: 'doc', n: 3, title: kit.steps[2], images: v.step3 || ['doc-transcript-page-1', 'doc-transcript-page-2'].filter(n => fs.existsSync(path.join(shots, n + '.png'))) },
  { kind: 'title', title: kit.product, sub: 'Works offline · Windows and Mac computers · Your records stay with you' },
];
const CSS = `${fonts}*{box-sizing:border-box;margin:0}body{width:1440px;height:1080px;overflow:hidden;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;
background:radial-gradient(1100px 700px at 50% 0%, ${T[700]} 0%, ${T[900]} 60%, #0f172a 100%);color:#fff;display:flex;flex-direction:column;align-items:center;text-align:center}
.t{margin:auto;padding:0 120px}.t h1{font:700 96px/1.1 Merriweather,serif}.t p{font-size:36px;color:${T[200]};margin-top:28px;line-height:1.35}
.cap{display:flex;align-items:center;gap:22px;margin:56px 0 40px}.num{width:78px;height:78px;border-radius:50%;background:${T[400]};color:${T[900]};font:800 40px/78px Inter,sans-serif}
.cap h2{font:700 58px/1.1 Merriweather,serif}
.frame{width:1240px;border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.5)}.frame img{display:block;width:100%}
.docs{display:flex;gap:40px}.paper{width:520px;border-radius:6px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}.paper img{display:block;width:100%}`;
const html = s => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${
  s.kind === 'title' ? `<div class="t"><h1>${esc(s.title)}</h1><p>${esc(s.sub)}</p></div>`
  : `<div class="cap"><div class="num">${s.n}</div><h2>${esc(s.title)}</h2></div>${
    s.kind === 'doc' ? `<div class="docs">${s.images.map(i => `<div class="paper"><img src="${img(i)}"></div>`).join('')}</div>`
    : `<div class="frame"><img src="${img(s.image)}"></div>`}`}</body></html>`;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'binder-video-'));
  const opts = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  const browser = await chromium.launch(opts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const stills = [];
  for (const [i, s] of scenes.entries()) {
    await page.setContent(html(s), { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
    const f = path.join(tmp, `s${i}.png`); await page.screenshot({ path: f }); stills.push(f);
  }
  await browser.close();
  fs.copyFileSync(stills[4], outFile.replace(/\.mp4$/, '-still.png'));

  const D = 4.2, X = 0.6, fps = 30;   // seconds per scene, crossfade
  const args = ['-y'];
  stills.forEach(f => args.push('-i', f));   // one frame each; zoompan stretches it to D seconds
  let fc = stills.map((_, i) => `[${i}:v]scale=2880:2160,zoompan=z='min(zoom+0.0006,1.06)':d=${Math.round(D * fps)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1440x1080:fps=${fps},format=yuv420p,setsar=1[v${i}]`).join(';');
  let last = 'v0', off = D - X;
  for (let i = 1; i < stills.length; i++) { fc += `;[${last}][v${i}]xfade=transition=fade:duration=${X}:offset=${off.toFixed(2)}[x${i}]`; last = `x${i}`; off += D - X; }
  args.push('-filter_complex', fc, '-map', `[${last}]`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', '-r', String(fps), outFile);
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB, ~${(stills.length * (D - X) + X).toFixed(0)} s)`);
})().catch(e => { console.error(e.stderr ? e.stderr.toString().slice(-800) : e); process.exit(1); });
