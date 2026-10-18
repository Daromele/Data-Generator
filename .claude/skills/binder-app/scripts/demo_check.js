#!/usr/bin/env node
// Proves a demo made by make_demo.py is safe to publish: welcome shows, a refresh
// starts fresh, every export opens the upsell, print works watermarked, no sync,
// the demo bar shows, nothing downloads, no page errors.
//   NODE_PATH=$(npm root -g) node demo_check.js Demo.html
const fs=require('fs'),path=require('path');const {chromium}=require('playwright');let failed=0;(async()=>{const b=await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{});const c=await b.newContext({viewport:{width:1280,height:860}});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));let downloads=0;p.on('download',()=>downloads++);
const ok=(c,m)=>{console.log(c?'ok  ':'FAIL',m);if(!c)failed++;};
await p.goto('file://'+path.resolve(process.argv[2]));await p.waitForFunction(()=>window.app&&window.app.data);await p.waitForTimeout(900);
ok(await p.evaluate(()=>!document.getElementById('onboarding-backdrop').classList.contains('hidden')),'welcome shows');
await p.evaluate(()=>{window.app.closeOnboarding();window.app.data.students.push({id:'zz',name:'Visitor Kid'});window.app.saveData();});
await p.waitForTimeout(500);await p.reload();await p.waitForFunction(()=>window.app&&window.app.data);
ok(await p.evaluate(()=>!window.app.data.students.some(s=>s.id==='zz')),'refresh starts fresh');
for(const f of ['exportData','importData','exportCSV','chooseBackupFile']){await p.evaluate(f=>{window.app.closeOnboarding&&window.app.closeOnboarding();window.app[f]('students')},f);await p.waitForTimeout(150);const t=await p.evaluate(()=>{const bd=document.getElementById('confirm-backdrop');return !bd.classList.contains('hidden')&&document.getElementById('confirm-title').textContent});ok(t&&/full version/.test(t),f+' -> upsell ('+t+')');await p.evaluate(()=>window.app.closeConfirm&&window.app.closeConfirm());await p.waitForTimeout(500);}
const html=await p.evaluate(()=>{window.app.printDocument=h=>window.__d=h;window.app.generateTranscriptPrint('all','all');return window.__d||''});
ok(html.includes('FREE DEMO')&&html.includes('Official Academic Transcript'),'print works, watermarked');
await p.evaluate(()=>window.app.navigateTo('settings'));ok(!(await p.$('#sync-card')),'no sync card in demo');
ok(await p.evaluate(()=>[...document.querySelectorAll('[role=note]')].some(e=>/Free demo/.test(e.textContent)&&e.getBoundingClientRect().width>0)),'demo bar visible');
ok(downloads===0,'nothing downloaded');ok(errs.length===0,'no page errors '+errs.join('|'));
await b.close();console.log(failed?failed+' failed':'demo is safe to publish');process.exit(failed?1:0)})()
