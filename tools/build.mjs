// Builds the site that GitHub Pages serves:
//   dist/manifest.json                      what is current: the build number and the bundle
//   dist/resources/prod/<build>/main.min.js the bundled toolkit (immutable: a new build gets a new folder)
//   dist/fs_toolkit.user.js                 the loader people install in Tampermonkey (rarely changes)
//   dist/index.html                         the install page
// Usage: node tools/build.mjs [--dev] [--check]   (BUILD_NUMBER comes from the CI run number)
// --dev: not minified, written over the old files instead of deleting dist/ first (the dev server may be serving it).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageHtml } from './page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const check = args.has('--check');
const buildNo = process.env.BUILD_NUMBER || 'dev';
const dist = path.join(root, 'dist');
const p = (...a) => path.join(root, ...a);
const fail = (msg) => { console.error('build failed: ' + msg); process.exit(1); };

const pkg = JSON.parse(fs.readFileSync(p('package.json'), 'utf8'));
const loaderText = fs.readFileSync(p('loader/fs_toolkit.user.js'), 'utf8');
const meta = (key) => (new RegExp('^// @' + key + '\\s+(.+)$', 'm').exec(loaderText) || [])[1] || '';
if (!meta('version') || !meta('name')) fail('loader/fs_toolkit.user.js has no @name / @version');

// 1. the bundle
const outDir = path.join(dist, 'resources', 'prod', buildNo);
const res = await build({
  entryPoints: [p('src/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !dev,
  sourcemap: check ? false : 'external',
  legalComments: 'none',
  define: { __FST_VERSION__: JSON.stringify(pkg.version) },
  write: false,
  outfile: path.join(outDir, 'main.min.js'),
  logLevel: 'warning',
});
if (check) { console.log('bundle ok (' + res.outputFiles[0].text.length + ' bytes)'); process.exit(0); }

// 2. write the site
if (!dev) fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const o of res.outputFiles) {
  fs.mkdirSync(path.dirname(o.path), { recursive: true });
  fs.writeFileSync(o.path, o.contents);
  console.log('wrote', path.relative(root, o.path).replace(/\\/g, '/'), o.contents.length + ' bytes');
}
fs.writeFileSync(path.join(dist, 'fs_toolkit.user.js'), loaderText);
fs.writeFileSync(path.join(dist, 'index.html'), pageHtml({ name: meta('name'), version: pkg.version, loaderVersion: meta('version'), loaderFile: 'fs_toolkit.user.js', build: buildNo }));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
const manifest = { build: buildNo, main: 'resources/prod/' + buildNo + '/main.min.js', built: new Date().toISOString() };
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log('manifest:', JSON.stringify(manifest));
