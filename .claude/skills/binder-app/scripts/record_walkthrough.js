#!/usr/bin/env node
// A listing video of the REAL app being used: a visible cursor moves to real
// buttons and clicks them, screens change because the app navigated, the
// picker rolls and the timer counts down because the app's own code ran.
// Nothing is a still screenshot with a fake click on top.
//
//   NODE_PATH=$(npm root -g) node record_walkthrough.js walkthrough.json [--format etsy|social] [--frames N]
//
// How: the app runs in an iframe on a branded "stage" page (title, captions,
// end card). Time is a fake clock (Playwright clock API) advanced one frame at
// a time, so every interval, countdown and roll plays at true speed in the
// video however slowly frames are captured. Each frame is a JPEG piped to ffmpeg.
//
// walkthrough.json:
// { "app": "../../../binders/App.html", "product": "App Name", "brand": {ink,bold,pop,paper,calm},
//   "setup": "js run inside the app once loaded (demo name, hide banners...)",
//   "etsy":   { "out": "App_Etsy_Video.mp4", "viewport": [1440, 900] },          // <= 15 s for Etsy
//   "social": { "out": "App_Social.mp4", "viewport": [1180, 1400], "bpm": 104, "music": 0.5 },
//   "intro": { "eyebrow": "...", "headline": "Line one<br>line two", "dur": 1.6 },
//   "pace": 2,  "length": 15,   // optional: faster cursor; Etsy cut held to exactly 15 s
//   {"scrollDoc": [600, 1.0]}  // step action: scroll the print preview 600 px over 1 s
//   "outro": { "headline": "App Name", "sub": "...", "cta": "Instant download on Etsy", "dur": 2.2 },
//   "steps": [ { "caption": "Take attendance in *seconds*",            // *word* = highlighted
//                "do": [ { "click": "css or text=... inside the app" }, { "wait": 0.8 },
//                        { "select": ["select css", "value"] }, { "eval": "js inside the app" },
//                        { "hover": "css" }, { "scroll": ["#main-content", 400] } ] } ] }
// A click moves the cursor over ~0.55 s, presses, then waits "after" seconds (default 0.6).
const fs = require('fs'), path = require('path'), { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: node record_walkthrough.js walkthrough.json [--format etsy|social]'); process.exit(2); }
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FORMAT = arg('--format') || 'etsy';
const MAX_FRAMES = +(arg('--frames') || 0);
const C = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const B = path.dirname(path.resolve(cfgPath));
const F = C[FORMAT] || {};
const FPS = 30, DT = 1000 / FPS;
const [SW, SH] = FORMAT === 'social' ? [1080, 1920] : [1440, 1080];
const [VW, VH] = F.viewport || (FORMAT === 'social' ? [1180, 1400] : [1440, 900]);
const brand = Object.assign({ ink: '#141A1F', bold: '#182635', pop: '#E3A73B', paper: '#F6F7F5', calm: '#1F7A5C' }, C.brand || {});
const ff = (() => { try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim(); } catch (e) { return 'ffmpeg'; } })();

// Where the app sits on the stage.
const social = FORMAT === 'social';
const scale = social ? Math.min(1000 / VW, 1180 / VH) : Math.min(1328 / VW, 830 / VH);
const AW = Math.round(VW * scale), AH = Math.round(VH * scale);
const AX = Math.round((SW - AW) / 2), AY = social ? 560 : 212;
const hi = t => String(t || '').replace(/\*([^*]+)\*/g, '<b>$1</b>');

const stageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
${fs.existsSync(path.join(B, '.fonts.css')) ? fs.readFileSync(path.join(B, '.fonts.css'), 'utf8') : ''}
*{box-sizing:border-box;margin:0}html,body{width:${SW}px;height:${SH}px;overflow:hidden}
body{background:radial-gradient(120% 80% at 50% 0%, ${brand.bold} 0%, ${brand.ink} 100%);font-family:"DM Sans",system-ui,sans-serif;color:#fff}
#app{position:absolute;left:${AX}px;top:${AY}px;width:${VW}px;height:${VH}px;border:0;transform-origin:0 0;transform:scale(${scale});border-radius:${Math.round(14 / scale)}px;box-shadow:0 30px 80px rgba(0,0,0,.45);background:#fff}
#cap{position:absolute;left:60px;right:60px;top:${social ? 250 : 46}px;text-align:center;transition:none}
#eb{font:700 ${social ? 26 : 18}px "DM Sans",sans-serif;letter-spacing:.18em;text-transform:uppercase;color:${brand.pop};margin-bottom:${social ? 18 : 10}px;min-height:1em}
#ct{font:800 ${social ? 74 : 56}px/1.08 Manrope,"DM Sans",sans-serif;letter-spacing:-.02em}
#ct{text-wrap:balance}#ct b{color:${brand.ink};background:${brand.pop};padding:0 .18em;border-radius:.16em;font-weight:800;white-space:nowrap}
#cur{position:absolute;left:0;top:0;width:${social ? 54 : 40}px;height:${social ? 54 : 40}px;pointer-events:none;z-index:20;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))}
#ring{position:absolute;width:70px;height:70px;margin:-35px 0 0 -35px;border-radius:50%;border:4px solid ${brand.pop};opacity:0;pointer-events:none;z-index:19}
.card{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px;z-index:30;background:radial-gradient(120% 80% at 50% 0%, ${brand.bold} 0%, ${brand.ink} 100%);opacity:0}
.card .e{font:700 ${social ? 28 : 20}px "DM Sans";letter-spacing:.18em;text-transform:uppercase;color:${brand.pop};margin-bottom:22px}
.card h1{text-wrap:balance;font:800 ${social ? 104 : 84}px/1.04 Manrope,sans-serif;letter-spacing:-.03em}
.card p{font:500 ${social ? 36 : 28}px/1.35 "DM Sans";color:rgba(255,255,255,.78);margin-top:22px}
.pills{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:30px}.pills span{font:700 ${social ? 26 : 20}px "DM Sans";padding:10px 20px;border-radius:99px;background:rgba(255,255,255,.12)}
.cta{margin-top:40px;font:800 ${social ? 34 : 28}px "DM Sans";color:${brand.ink};background:${brand.pop};padding:16px 34px;border-radius:99px}
.by{margin-top:22px;font:700 ${social ? 22 : 16}px "DM Sans";letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.6)}
</style></head><body>
<div id="cap"><div id="eb"></div><div id="ct"></div></div>
<iframe id="app" src="${path.resolve(B, C.app)}"></iframe>
<svg id="cur" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.5-6.8L5 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>
<div id="ring"></div>
<div class="card" id="intro"><div class="e">${C.intro?.eyebrow || ''}</div><h1>${C.intro?.headline || C.product}</h1>${C.intro?.pills ? `<div class="pills">${C.intro.pills.map(p => `<span>${p}</span>`).join('')}</div>` : ''}</div>
<div class="card" id="outro"><h1>${C.outro?.headline || C.product}</h1><p>${C.outro?.sub || ''}</p><div class="cta">${C.outro?.cta || 'Instant download on Etsy'}</div><div class="by">JPS Digital Pages</div></div>
</body></html>`;

(async () => {
  const stagePath = path.join(path.dirname(path.resolve(B, C.app)), `.walkthrough-stage-${FORMAT}.html`);
  fs.writeFileSync(stagePath, stageHtml);
  const opts = fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
  const browser = await chromium.launch(opts);
  const ctx = await browser.newContext({ viewport: { width: SW, height: SH }, deviceScaleFactor: 1 });
  await ctx.clock.install({ time: new Date() });
  await ctx.addInitScript(() => { try { Object.keys(localStorage); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + stagePath);
  await page.clock.runFor(1500);
  const app = page.frames().find(f => f.url().endsWith(path.basename(C.app)));
  if (!app) throw new Error('app frame not found');
  const P = (await app.content()).match(/SETTINGS_PREFIX = '(\w+)'/)?.[1] || 'dw';
  await app.evaluate(P => { try { localStorage.setItem(P + 'WelcomeSeen', 'true'); } catch (e) {} }, P);
  await app.evaluate(() => location.reload()).catch(() => {});
  await page.clock.runFor(1500);
  const appF = page.frames().find(f => f.url().endsWith(path.basename(C.app)));
  await appF.waitForFunction(() => window.app && window.app.data, null, { timeout: 20000 });
  await appF.evaluate(src => { try { window.app.closeOnboarding && window.app.closeOnboarding(); } catch (e) {} (0, eval)(src); },
    `const st=document.createElement('style');st.textContent='[id*=toast]{display:none!important}';document.head.append(st);` + (C.setup || ''));

  // ---- frame pump --------------------------------------------------------
  const out = path.resolve(B, F.out || `${C.product.replace(/\W+/g, '_')}_${FORMAT}.mp4`);
  const tmp = out.replace(/\.mp4$/, '.silent.mp4');
  const enc = spawn(ff, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', social ? tmp : out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let frames = 0; const events = [];
  let cur = { x: SW * 0.62, y: SH * 0.7 }, ringT = -1;
  const t = () => frames / FPS;
  const frame = async () => {
    if (MAX_FRAMES && frames >= MAX_FRAMES) return;
    const ring = ringT < 0 ? null : (frames - ringT) / (FPS * 0.35);
    await page.evaluate(([x, y, r]) => {
      const c = document.getElementById('cur'); c.style.transform = `translate(${x - 6}px,${y - 4}px)`;
      const g = document.getElementById('ring'); g.style.left = x + 'px'; g.style.top = y + 'px';
      if (r === null || r > 1) g.style.opacity = 0; else { g.style.opacity = 1 - r; g.style.transform = `scale(${0.4 + r})`; }
    }, [cur.x, cur.y, ring]);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 88 });
    if (!enc.stdin.write(jpg)) await new Promise(r => enc.stdin.once('drain', r));
    frames++;
    await page.clock.runFor(DT);
  };
  const hold = async s => { for (let i = 0; i < Math.round(s * FPS); i++) await frame(); };
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const card = async (id, op) => page.evaluate(([id, op]) => { document.getElementById(id).style.opacity = op; }, [id, op]);
  // Captions shrink until they clear the app by 28 px: never overlap, never clip.
  const caption = async (text, eyebrow) => page.evaluate(([h, e, limit]) => {
    const ct = document.getElementById('ct'), cap = document.getElementById('cap');
    ct.innerHTML = h; document.getElementById('eb').textContent = e || '';
    ct.style.fontSize = '';
    let size = parseFloat(getComputedStyle(ct).fontSize);
    while (cap.getBoundingClientRect().bottom > limit && size > 24) { size -= 2; ct.style.fontSize = size + 'px'; }
  }, [hi(text), eyebrow || '', AY - 28]);

  // Stage coordinates of an element inside the app.
  const where = async sel => {
    const loc = appF.locator(sel).first();
    if (!(await loc.count())) { await page.screenshot({ path: path.join(B, '.walkthrough-missing.png') }); throw new Error(`not on screen: ${sel} (see .walkthrough-missing.png)`); }
    await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    const r = await loc.evaluate(el => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    return { x: AX + r.x * scale, y: AY + r.y * scale };
  };
  const PACE = C.pace || 1;   // 2 = cursor moves twice as fast (more clicks fit in 15 s)
  const moveTo = async (p, secs = 0.55 / PACE) => {
    const a = { ...cur }, n = Math.max(1, Math.round(secs * FPS));
    for (let i = 1; i <= n; i++) { const k = ease(i / n); cur = { x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k }; await frame(); }
  };
  const click = async (sel, after = 0.6) => {
    const p = await where(sel);
    await moveTo(p);
    await hold(0.08 / PACE);
    events.push({ t: t(), kind: 'click' });
    ringT = frames;
    await page.mouse.click(p.x, p.y);
    await hold(after);
  };

  // ---- intro -------------------------------------------------------------
  await card('intro', 1); await card('outro', 0);
  events.push({ t: 0, kind: 'whoosh' });
  await hold((C.intro?.dur || 1.6) - 0.3);
  for (let i = 1; i <= 9; i++) { await card('intro', 1 - i / 9); await frame(); }

  // ---- steps -------------------------------------------------------------
  for (const step of C.steps) {
    await caption(step.caption, step.eyebrow);
    events.push({ t: t(), kind: 'pop' });
    for (const a of step.do || []) {
      if (a.click) await click(a.click, a.after ?? 0.6);
      else if (a.hover) await moveTo(await where(a.hover), a.secs || 0.55);
      else if (a.wait) await hold(a.wait);
      else if (a.select) { const p = await where(a.select[0]); await moveTo(p); events.push({ t: t(), kind: 'click' }); ringT = frames; await appF.locator(a.select[0]).first().selectOption(a.select[1]); await hold(a.after ?? 0.6); }
      else if (a.eval) { await appF.evaluate(src => (0, eval)(src), a.eval); await hold(a.after ?? 0.2); }
      else if (a.scrollDoc) { const [dy, secs = 0.8] = [].concat(a.scrollDoc); const n = Math.round(secs * FPS); for (let i = 0; i < n; i++) { await appF.evaluate(d => { const f = document.querySelector('#pv iframe'); if (f && f.contentWindow) f.contentWindow.scrollBy(0, d); }, dy / n); await frame(); } await hold(a.after ?? 0.2); }
      else if (a.scroll) { const [sel, dy] = a.scroll; const n = Math.round(0.6 * FPS); for (let i = 0; i < n; i++) { await appF.evaluate(([s, d]) => { const el = document.querySelector(s); if (el) el.scrollBy(0, d); }, [sel, dy / n]); await frame(); } }
    }
  }

  // ---- outro -------------------------------------------------------------
  events.push({ t: t(), kind: 'ding' });
  for (let i = 1; i <= 9; i++) { await card('outro', i / 9); await frame(); }
  // "length": the outro holds until the video is exactly that long (Etsy: use all 15 s, never more)
  if (C.length && FORMAT === 'etsy') { const left = C.length - frames / FPS; if (left < 1.2) console.warn(`steps run long: only ${left.toFixed(2)} s left for the outro`); await hold(Math.max(0, left)); }
  else await hold((C.outro?.dur || 2.2) - 0.3);

  enc.stdin.end(); await new Promise(r => enc.on('close', r));
  const dur = frames / FPS;
  if (social) {
    const evf = path.join(B, '.walk-audio.json'), wav = path.join(B, '.walk-audio.wav');
    fs.writeFileSync(evf, JSON.stringify({ dur, bpm: F.bpm || 104, music: F.music ?? 0.5, events }));
    execFileSync('python3', [path.join(__dirname, 'make_audio.py'), evf, wav], { stdio: 'inherit' });
    execFileSync(ff, ['-y', '-loglevel', 'error', '-i', tmp, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
    for (const f of [tmp, evf, wav]) fs.unlinkSync(f);
  }
  fs.unlinkSync(stagePath);
  await browser.close();
  console.log(`wrote ${out} · ${frames} frames · ${dur.toFixed(2)} s · ${events.filter(e => e.kind === 'click').length} clicks${FORMAT === 'etsy' && dur > 15 ? ' · WARNING: Etsy videos must be 15 s or less' : ''}`);
})().catch(e => { console.error(e); process.exit(1); });
