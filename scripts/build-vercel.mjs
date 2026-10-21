// Produces a Vercel Build Output API bundle (.vercel/output): the static PWA
// from dist/ plus one Node function serving /api/*.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/static`, { recursive: true });
cpSync('dist', `${out}/static`, { recursive: true });

const fn = `${out}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ['server/vercel.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: `${fn}/index.mjs`,
  external: ['pg-native', '@electric-sql/pglite'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs24.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2));
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }));

writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api/(.*)$', dest: '/api' },
    { src: '^/(sw\\.js|workbox-.*\\.js|registerSW\\.js|manifest\\.webmanifest)$', headers: { 'cache-control': 'public, max-age=0, must-revalidate' }, continue: true },
    { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '^/(.*)$', dest: '/index.html' },
  ],
}, null, 2));
console.log('Vercel output ready in .vercel/output');
