const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(dir, x.name)) : [path.join(dir, x.name)]); }
const files = ['src', 'scripts', 'test'].flatMap(walk).filter(x => /\.(cjs|mjs|js)$/.test(x));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
for (const asset of ['park', 'redmills', 'pedro']) if (!fs.statSync(`assets/${asset}.jpg`).size) throw new Error(`Missing ${asset} artwork`);
console.log(`Syntax checked ${files.length} source / test files; all three artworks are present.`);
