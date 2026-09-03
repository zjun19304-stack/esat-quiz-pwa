#!/usr/bin/env node
'use strict';
/*
 * package_dist.js — Build the offline distribution zip for buyers.
 * Copies the app (excluding dev/source/secret files) into a temp dir,
 * then zips it with `tar -a` (bsdtar, zip format). Output: esat-quiz-pwa-dist.zip
 *
 *   node scripts/package_dist.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');           // project root (esat-quiz-pwa)
const tmp = path.join(require('os').tmpdir(), 'esat-dist-' + Date.now());
const out = path.join(root, 'esat-quiz-pwa-dist.zip');

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'scripts', '.dist_tmp', '.github']);
const EXCLUDE_FILES = new Set([
  'questions.js',          // plaintext source — MUST NOT ship
  'questions.js.bak',      // plaintext backup — MUST NOT ship
  'questions.enc.js.bak',
  '_dump.json',            // plaintext question dump — MUST NOT ship
  '_dump2.json',           // full plaintext dump — MUST NOT ship
  '_test-enc.js',
  'package_dist.js',
  'last_code.txt',         // contains a real activation code
  'codes_ledger.csv',      // seller's buyer/code ledger — MUST NOT ship
  '.sell_key',
  'license-private.pem',
  '.gitignore',
  '.nojekyll',
  'license-public.js',     // redundant: public key is already embedded in license.js
]);

// rmSync is intercepted by a safe-delete shim in this environment; swallow errors.
function safeRm(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); }
  catch (e) { console.warn('  (cleanup skipped:', e.message + ')'); }
}

function copyTree(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const name = entry.name;
    if (EXCLUDE_DIRS.has(name) || EXCLUDE_FILES.has(name)) continue;
    if (name.endsWith('.zip')) continue;   // never re-package a prior dist zip
    if (name.includes('.bak')) continue;   // any *.bak / *.bak2 backup — MUST NOT ship
    // plaintext question snapshots produced by ad-hoc analysis scripts
    // (_dump.json, _align.json, _diff.json, _p4.json, ...) — MUST NOT ship
    if (name.startsWith('_') && name.endsWith('.json')) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

safeRm(tmp);
fs.mkdirSync(tmp, { recursive: true });
copyTree(root, tmp);
console.log('Staged distribution files.');

if (fs.existsSync(out)) fs.unlinkSync(out);

// Build a REAL .zip. GNU tar mislabels .zip as a tar archive (which Windows
// Explorer cannot open), so we use Python's zipfile for a genuine container.
const py = [
  'import os, zipfile',
  `root = ${JSON.stringify(tmp)}`,
  `out  = ${JSON.stringify(out)}`,
  "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:",
  '    for dp, _, fns in os.walk(root):',
  '        for fn in fns:',
  '            fp = os.path.join(dp, fn)',
  "            z.write(fp, os.path.relpath(fp, root))",
].join('\n');
try {
  const pyPath = path.join(require('os').tmpdir(), 'esat_zip_' + Date.now() + '.py');
  fs.writeFileSync(pyPath, py);
  execSync(`python "${pyPath}"`, { stdio: 'inherit' });
  try { fs.unlinkSync(pyPath); } catch (_) {}
} catch (e) {
  console.error('zip packaging failed:', e.message);
  process.exit(1);
}
if (!fs.existsSync(out)) {
  console.error('zip was not created');
  process.exit(1);
}
console.log(`\nCreated: ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
safeRm(tmp);

console.log('\nDistribute esat-quiz-pwa-dist.zip.');
console.log('Buyers MUST open via 启动.bat (local server / localhost), NOT file://.');
