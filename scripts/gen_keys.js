#!/usr/bin/env node
'use strict';
/*
 * gen_keys.js — Generate EC key pair for offline license activation.
 *  - Public key  -> ../license-public.js  (embedded in distributed zip, verification only)
 *  - Private key -> ./license-private.pem  (KEEP SECRET, NEVER shipped in zip)
 *
 * Uses prime256v1 (== Web Crypto "P-256") with ECDSA-SHA256.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');          // scripts/.. = project root
const privPath = path.join(__dirname, 'license-private.pem');

// If private key already exists, reuse it so previously issued codes stay valid.
let privateKey;
if (fs.existsSync(privPath)) {
  privateKey = fs.readFileSync(privPath, 'utf8');
  console.log('Reusing existing private key (previously issued codes remain valid).');
} else {
  const pair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  privateKey = pair.privateKey;
  fs.writeFileSync(privPath, privateKey);
  console.log('Generated NEW private key.');
}

// Derive public key from private key (always in sync)
const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });

const pubJs = `/* ESAT License — Public Key (verify only, embedded in distributed build)
 * Activation codes are verified against this key via Web Crypto ECDSA-P256.
 * Do NOT remove or the app will reject all codes.
 */
window.__ESAT_LICENSE_PUBKEY__ = ${JSON.stringify(publicKey)};
`;

fs.writeFileSync(path.join(root, 'license-public.js'), pubJs);

console.log('Keys ready:');
console.log('  ../license-public.js        (embedded in build, public)');
console.log('  ./license-private.pem       (KEEP SECRET, excluded from zip)');
