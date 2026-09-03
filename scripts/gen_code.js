#!/usr/bin/env node
'use strict';
/*
 * gen_code.js — Issue an ESAT offline activation code.
 * Uses the SECRET private key (scripts/license-private.pem).
 * The generated code is verified offline by license.js (public key only).
 *
 * Usage:
 *   node scripts/gen_code.js                            # default 365 days, tier "standard"
 *   node scripts/gen_code.js --days=180 --tier=pro --buyer=闲鱼买家A
 *
 * The code is also appended to codes_ledger.csv (nonce,buyer,issued_date,
 * tier,days,expire_date,code) for the seller's own traceability. NEVER ship
 * that CSV in the distribution zip.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const privPath = path.join(__dirname, 'license-private.pem');
if (!fs.existsSync(privPath)) {
  console.error('Private key not found:', privPath);
  console.error('Run: node scripts/gen_keys.js');
  process.exit(1);
}
const priv = fs.readFileSync(privPath, 'utf8');

// The bank decryption password is embedded in the SIGNED payload, so it can
// never be forged or read from the shipped code. It lives only in .sell_key.
const keyPath = path.join(__dirname, '.sell_key');
if (!fs.existsSync(keyPath)) {
  console.error('Sell key not found:', keyPath);
  console.error('Write the bank decryption password into scripts/.sell_key (no newline).');
  process.exit(1);
}
const sellKey = fs.readFileSync(keyPath, 'utf8').trim();
if (!sellKey) {
  console.error('scripts/.sell_key is empty.');
  process.exit(1);
}

let days = 365;
let tier = 'standard';
let buyer = '未填写';
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--days=')) days = parseInt(a.split('=')[1], 10) || days;
  if (a.startsWith('--tier=')) tier = a.split('=')[1] || tier;
  if (a.startsWith('--buyer=')) buyer = a.split('=').slice(1).join('=') || buyer;
}

const payload = {
  v: 2,                                   // v2 = carries the bank password
  iat: Date.now(),
  exp: Date.now() + days * 86400000,
  tier,
  k: sellKey,
  n: crypto.randomBytes(8).toString('base64url'),
};
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

/* Node's createSign() emits DER; the browser's Web Crypto (crypto.subtle.verify)
   only accepts raw P1363 (r||s). Convert, or every code fails verification. */
function derToP1363(der, coordLen = 32) {
  let off = 0;
  if (der[off++] !== 0x30) throw new Error('not a DER sequence');
  let len = der[off++];
  if (len & 0x80) {
    const nBytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < nBytes; i++) len = (len << 8) | der[off++];
  }
  const readInt = () => {
    if (der[off++] !== 0x02) throw new Error('not a DER integer');
    const l = der[off++];
    let v = der.subarray(off, off + l);
    off += l;
    while (v.length > coordLen && v[0] === 0x00) v = v.subarray(1);
    if (v.length > coordLen) throw new Error('coordinate too long');
    return v;
  };
  const r = readInt();
  const s = readInt();
  const out = Buffer.alloc(coordLen * 2);
  r.copy(out, coordLen - r.length);
  s.copy(out, coordLen * 2 - s.length);
  return out;
}

const derSig = crypto.createSign('SHA256').update(payloadB64).sign(priv);
const sig = derToP1363(derSig).toString('base64url');
const code = payloadB64 + '.' + sig;

console.log('\n=== ESAT Activation Code ===');
console.log(code);
console.log('===========================');
console.log(`Tier : ${tier}`);
console.log(`Valid: ${days} days (until ${new Date(payload.exp).toISOString().slice(0, 10)})`);
console.log('');
fs.writeFileSync(path.join(__dirname, 'last_code.txt'), code);

// Append to the seller's private ledger (NEVER ship this file in the zip).
const csvEsc = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const ledgerPath = path.join(__dirname, 'codes_ledger.csv');
const LEDGER_HEADER = 'nonce,buyer,issued_date,tier,days,expire_date,code\n';
if (!fs.existsSync(ledgerPath)) fs.writeFileSync(ledgerPath, LEDGER_HEADER);
const ledgerRow = [
  payload.n,
  buyer,
  new Date(payload.iat).toISOString().slice(0, 10),
  tier,
  days,
  new Date(payload.exp).toISOString().slice(0, 10),
  code,
].map(csvEsc).join(',') + '\n';
fs.appendFileSync(ledgerPath, ledgerRow);

console.log('Send ONLY this code to the buyer. Keep license-private.pem secret.');
console.log(`Ledger updated: ${path.basename(ledgerPath)} (nonce=${payload.n}, buyer=${buyer})`);
