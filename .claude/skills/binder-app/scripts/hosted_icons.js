// Draws each binder's home-screen icons: its line icon in white on its theme colour. (called by build_hosted.py)
const fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const [apps,out]=[JSON.parse(process.argv[2]),process.argv[3]];
(async()=>{const b=await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium')?{executablePath:'/opt/pw-browsers/chromium'}:{}),p=await b.newPage();
for(const [slug,a] of Object.entries(apps)){const dir=path.join(out,slug);fs.mkdirSync(dir,{recursive:true});
 for(const [name,size,scale] of [['icon-192.png',192,.62],['icon-512.png',512,.62],['maskable-512.png',512,.46],['apple-touch-icon.png',180,.58]]){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><rect width="24" height="24" fill="${a.tint}"/><g transform="translate(12 12) scale(${scale}) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${a.icon}</g></svg>`;
  await p.setViewportSize({width:size,height:size});await p.setContent(`<style>html,body{margin:0}</style>${svg}`);await p.screenshot({path:path.join(dir,name)});}}
await b.close();})().catch(e=>{console.error(e);process.exit(1);});
