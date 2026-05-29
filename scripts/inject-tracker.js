#!/usr/bin/env node
/**
 * Copia las herramientas HTML al directorio public/tools/
 * e inyecta un script de telemetría que reporta eventos al portal padre.
 *
 * Uso:
 *   node scripts/inject-tracker.js [ruta-studio] [ruta-academia]
 *
 * Si no se pasan rutas, usa los valores por defecto.
 */

const fs = require('fs');
const path = require('path');

const TOOLS = [
  {
    name: 'studio',
    src: process.argv[2] || '/Users/yeiyies/Desktop/Sonitus/sonitus-studio.html',
    dest: path.join(__dirname, '../public/tools/sonitus-studio.html'),
  },
  {
    name: 'academia',
    src: process.argv[3] || '/Users/yeiyies/music-sight-reading/sonitus-academia.html',
    dest: path.join(__dirname, '../public/tools/sonitus-academia.html'),
  },
];

function tracker(toolName) {
  return `<script>
/* Sonitus Portal Tracker — inyectado automáticamente */
(function(){
  var T='${toolName}',_last=0;
  window.addEventListener('load',function(){
    if(window.parent!==window)
      window.parent.postMessage({type:'TOOL_LOADED',tool:T},'*');
  });
  document.addEventListener('click',function(e){
    if(window.parent===window)return;
    var now=Date.now();
    if(now-_last<3000)return;
    _last=now;
    var el=e.target;
    window.parent.postMessage({
      type:'TOOL_EVENT',tool:T,
      data:{type:'click',tag:el.tagName,txt:(el.innerText||el.textContent||'').trim().slice(0,80)}
    },'*');
  },true);
  window.addEventListener('beforeunload',function(){
    if(window.parent!==window)
      window.parent.postMessage({type:'TOOL_UNLOAD',tool:T},'*');
  });
})();
</script>`;
}

const outDir = path.join(__dirname, '../public/tools');
fs.mkdirSync(outDir, { recursive: true });

let allOk = true;
for (const t of TOOLS) {
  if (!fs.existsSync(t.src)) {
    console.error(`✗  No encontrado: ${t.src}`);
    allOk = false;
    continue;
  }
  const html = fs.readFileSync(t.src, 'utf8');
  const injected = html.replace('<head>', '<head>\n' + tracker(t.name) + '\n');
  fs.writeFileSync(t.dest, injected, 'utf8');
  const kb = Math.round(fs.statSync(t.dest).size / 1024);
  console.log(`✓  ${t.name.padEnd(10)} → ${t.dest}  (${kb} KB)`);
}

if (allOk) {
  console.log('\n✓ Herramientas listas en public/tools/');
} else {
  console.error('\n✗ Algunas herramientas no se encontraron.');
  console.error('  Ejecuta: node scripts/inject-tracker.js <ruta-studio> <ruta-academia>');
  process.exit(1);
}
