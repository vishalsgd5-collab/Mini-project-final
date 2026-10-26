// Rebuild listening samples from the exact catalog used by AURA and Guardian.
// Run from any directory: node scripts/generate-beep-options.cjs
const fs = require('node:fs');
const path = require('node:path');
require('../extension/sound-catalog.js');
const root = path.resolve(__dirname, '..', 'docs');
fs.mkdirSync(path.join(root, 'beep-samples'), { recursive: true });
const cards = globalThis.AuraSoundCatalog.sounds.map((sound, index) => {
  const name = `${index + 1}-${sound.id}.wav`;
  const bytes = Buffer.from(globalThis.AuraSoundCatalog.buildWav(sound.id));
  fs.writeFileSync(path.join(root, 'beep-samples', name), bytes);
  const source = `data:audio/wav;base64,${bytes.toString('base64')}`;
  return `<article><h2>${index + 1}. ${sound.name}</h2><p>${sound.detail}</p><audio controls preload="none" src="${source}"></audio><a download="${name}" href="${source}">Download WAV</a></article>`;
}).join('\n');
fs.writeFileSync(path.join(root, 'beep-options.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AURA · Eight beep choices</title>
<style>*{box-sizing:border-box}body{background:#08110d;color:#f3eee4;font:16px/1.6 system-ui,sans-serif;margin:0;padding:30px 20px}main{max-width:960px;margin:auto}h1,h2{color:#d4b37a}h1{font-size:32px}h2{font-size:19px}p{color:#c5d5cc}a{color:#e8d0a0}header{margin-bottom:28px}.open{display:inline-block;background:#d4b37a;color:#08110d;padding:10px 18px;border-radius:8px;font-weight:bold;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}article{background:#12241c;border:1px solid #334739;border-radius:14px;padding:20px}audio{width:100%;margin:12px 0}label{display:block;margin-top:20px}input{vertical-align:middle;accent-color:#d4b37a;max-width:100%}button{margin:12px 0;padding:10px;background:#183028;color:#f3eee4;border:1px solid #d4b37a;border-radius:8px;cursor:pointer}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style></head>
<body><main><header><p>AURA · alert sound library</p><h1>Eight sounds. Your choice.</h1><p>Listen below, then open the complete app → Settings → Beep sound. Use Preview to compare and Use sound to save your favourite. The app and Guardian use the same sound catalog.</p><a class="open" href="./index.html#/app/settings">Open complete AURA app</a><p>Demo login: <strong>demo@aura.health</strong> / <strong>aura1234</strong></p><p>Start at a low Windows or headphone volume. These are alert tones, not music. This listening page does not save the app preference.</p><label for="volume">Preview volume: <output id="level">25%</output> <input type="range" min="5" max="100" step="5" value="25" id="volume"></label><button type="button" id="stop">Stop all previews</button></header><section class="grid">${cards}</section><p>The independent no-face/away alarm keeps its fixed tone and manual Stop alarm control.</p></main>
<script>const players=[...document.querySelectorAll('audio')],slider=document.getElementById('volume');function update(){const v=Number(slider.value)/100;players.forEach(p=>p.volume=v);document.getElementById('level').value=slider.value+'%'}slider.addEventListener('input',update);players.forEach(p=>p.addEventListener('play',()=>players.forEach(other=>{if(other!==p){other.pause();other.currentTime=0}})));document.getElementById('stop').onclick=()=>players.forEach(p=>{p.pause();p.currentTime=0});update();</script></body></html>`);
console.log(`Generated ${globalThis.AuraSoundCatalog.sounds.length} listening samples and docs/beep-options.html`);
