// Renders the PWA icons from the SVG mark. Run with `npm run icons`.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const maskable = svg.replace('<rect width="64" height="64" rx="16" fill="#121611"/>', '<rect width="64" height="64" fill="#121611"/>').replace('r="19"', 'r="15"').replace(/<path d="M32 21[^>]*>/, '<g transform="translate(32 32) scale(.79) translate(-32 -32)">$&').replace('stroke-linecap="round"/>', 'stroke-linecap="round"/></g>');
const out = [
  ['public/pwa-192.png', svg, 192],
  ['public/pwa-512.png', svg, 512],
  ['public/apple-touch-icon.png', maskable, 180],
  ['public/pwa-512-maskable.png', maskable, 512],
];
for (const [file, src, size] of out) {
  writeFileSync(file, new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
console.log('icons written');
