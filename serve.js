#!/usr/bin/env node
'use strict';
/*
 * serve.js — Zero-dependency static server for offline ESAT distribution.
 * Run from the unzipped folder. Opens on http://localhost:8000
 * (localhost is required for Service Worker + activation-code crypto to work).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const PORT = 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(root, p));
  if (!fp.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`ESAT running at http://localhost:${PORT}`);
  console.log('Open that address in your browser. Press Ctrl+C to stop.');
});
