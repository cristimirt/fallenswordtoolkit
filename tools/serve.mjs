// `npm run dev`: builds the dev bundle, serves dist/ on http://127.0.0.1:8787/ (PORT=1234 for another port) and builds again
// whenever a file in src/ changes. In the game's tab: localStorage.setItem('FST_dev_base', '8787') makes the loader use it
// (remove the key to go back to the published version). Reload the game page after a change.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.map': 'application/json' };
const port = +process.env.PORT || 8787;

function rebuild() {
  try {
    execFileSync(process.execPath, [path.join(root, 'tools', 'build.mjs'), '--dev'], { stdio: 'inherit' });
    console.log('built at ' + new Date().toLocaleTimeString());
  } catch (e) {
    console.error('the build failed (the last good one is still served)');
  }
}
rebuild();

let timer = 0;
fs.watch(path.join(root, 'src'), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); });
fs.watch(path.join(root, 'loader'), () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); });

http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...h, 'Access-Control-Allow-Headers': '*' }); res.end(); return; }
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, h); res.end('not found'); return; }
  res.writeHead(200, { ...h, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('serving ' + dist + ' on http://127.0.0.1:' + port + '/\nIn the game: localStorage.setItem("FST_dev_base", "' + port + '")'));
