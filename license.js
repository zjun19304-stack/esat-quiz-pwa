/* ════════════════════════════════════════════════════════
   ESAT License — Offline Activation Module
   - Verifies activation codes via ECDSA-P256 (Web Crypto)
   - Public key embedded (verify only); private key stays with seller
   - No network needed; activation state stored locally
   ════════════════════════════════════════════════════════ */
'use strict';

// Embedded public key (verify only). Do NOT remove.
const ESAT_LICENSE_PUBKEY = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEFd6QV1V4r7o7K7V+SbfN6C3yD7Dk\nNZnxaeLSWlg0djOb56NLssIG5+WSqGSEPoo5qx38AU+RzJfx4tWVmmTVGg==\n-----END PUBLIC KEY-----\n";
window.__ESAT_LICENSE_PUBKEY__ = ESAT_LICENSE_PUBKEY;

// NOTE: The decryption password is NOT stored here.
// It is delivered inside the activation code payload (`k` field), which is
// ECDSA-signed — tamper-proof, and unreadable without a valid code.

const ESAT_LICENSE_LS = 'esat_license_v1';
const ESAT_DEVICE_LS = 'esat_device_id';

const License = {
  PUBKEY: ESAT_LICENSE_PUBKEY,

  // ── base64url helpers ──
  /**
   * Remove everything that cannot legally appear in an activation code.
   *
   * Buyers copy codes out of WeChat / QQ / console windows / web pages, and
   * those copy paths frequently inject characters you cannot see:
   *   - U+200B zero-width space, U+FEFF BOM, U+00AD soft hyphen, bidi marks
   *   - full-width look-alikes produced by a Chinese IME (- _ . )
   * Any of them splits the code in half and makes base64 decoding fail,
   * so they are stripped before we try to locate the payload.
   */
  sanitize(input) {
    let s = String(input == null ? '' : input);
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '');
    s = s.replace(/[\uFF0D\u2010-\u2015\u2212\u30FC]/g, '-');
    s = s.replace(/\uFF3F/g, '_');
    s = s.replace(/[\uFF0E\u3002\uFF61]/g, '.');
    s = s.replace(/[^A-Za-z0-9._-]/g, '');
    return s;
  },

  /**
   * Parse a base64url segment into an activation payload (null when it is
   * not decodable, or decodes to something that is not a payload).
   */
  parsePayload(str) {
    if (!str || str.length % 4 === 1) return null;
    try {
      const o = JSON.parse(this.b64urlDecode(str));
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
      // Require an activation-shaped object so that random noise which merely
      // happens to be valid JSON never gets mistaken for a payload.
      if (typeof o.k !== 'string' && typeof o.exp !== 'number') return null;
      return o;
    } catch (e) { return null; }
  },

  /** True when `str` base64url-decodes into an activation payload. */
  isJsonB64(str) {
    return !!this.parsePayload(str);
  },

  /**
   * Pull the "payload.signature" token out of whatever the user pasted.
   *
   * The payload is base64url of a JSON object, so it ALWAYS begins with
   * "eyJ" — we anchor on that instead of a loose "long token dot long token"
   * regex, which used to swallow stray words (e.g. a trailing "ESAT") into
   * the payload and corrupt it.
   *
   * The signature is a 64-byte P1363 r||s pair, which is always exactly
   * 86 base64url characters, so we trim to that length; trailing junk is
   * discarded and a truncated signature is later reported as incomplete.
   */
  extractToken(input) {
    const SIG_LEN = 86;
    const s = this.sanitize(input);
    if (!s) return '';

    // Fast path: a clean payload.signature is already present.
    const fast = s.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{8,}/);
    if (fast) {
      const cut = fast[0].indexOf('.');
      const p = fast[0].slice(0, cut);
      const sig = fast[0].slice(cut + 1);
      if (this.isJsonB64(p)) return p + '.' + sig.slice(0, SIG_LEN);
    }

    // Slow path: junk may still sit inside the payload. Walk every "eyJ"
    // start and every '.' after it until the head decodes to JSON.
    for (let st = s.indexOf('eyJ'); st !== -1; st = s.indexOf('eyJ', st + 1)) {
      for (let dot = s.indexOf('.', st); dot !== -1; dot = s.indexOf('.', dot + 1)) {
        const p = s.slice(st, dot);
        const sig = s.slice(dot + 1);
        if (p.length < 40 || sig.length < 8) continue;
        if (this.isJsonB64(p)) return p + '.' + sig.slice(0, SIG_LEN);
      }
    }
    return s;
  },

  b64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return atob(str);
  },
  b64urlToBytes(str) {
    const bin = this.b64urlDecode(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  },
  strToBytes(str) {
    return new TextEncoder().encode(str);
  },
  bytesToB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  pemToBuf(pem) {
    const b64 = pem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  },

  /** Import (once) the seller's public key used for verification. */
  cryptoKey() {
    if (!this._pubKey) {
      this._pubKey = crypto.subtle.importKey(
        'spki', this.pemToBuf(this.PUBKEY),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    }
    return this._pubKey;
  },

  /** True when `sigB64` is a genuine signature over the exact string `payloadB64`. */
  async verifySig(payloadB64, sigB64) {
    try {
      const pubKey = await this.cryptoKey();
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, pubKey,
        this.b64urlToBytes(sigB64.slice(0, 86)), this.strToBytes(payloadB64));
    } catch (e) { return false; }
  },

  /**
   * Recover a payload that lost, gained or swapped a single character while
   * being copied (a hyphen injected at a line break, a character skipped by
   * the drag selection, a doubled keystroke...).
   *
   * Every candidate must both decode to a plausible payload AND carry a
   * valid signature over that exact string, so this can only ever restore a
   * code the seller really issued — it can never manufacture a valid one.
   *
   * Returns the repaired base64url payload, or null.
   */
  async repairPayload(payloadB64, sigB64) {
    if (payloadB64.length < 40 || payloadB64.length > 600) return null;
    const ok = async (cand) =>
      (this.parsePayload(cand) && await this.verifySig(cand, sigB64)) ? cand : null;

    // 1) one character too many
    for (let i = 0; i < payloadB64.length; i++) {
      const r = await ok(payloadB64.slice(0, i) + payloadB64.slice(i + 1));
      if (r) return r;
    }
    // 2) two adjacent characters swapped
    for (let i = 0; i + 1 < payloadB64.length; i++) {
      const r = await ok(payloadB64.slice(0, i) + payloadB64[i + 1] + payloadB64[i] + payloadB64.slice(i + 2));
      if (r) return r;
    }
    // 3) one character lost   /   4) one character mistyped
    const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i <= payloadB64.length; i++) {
      for (let j = 0; j < B.length; j++) {
        const r = await ok(payloadB64.slice(0, i) + B[j] + payloadB64.slice(i));
        if (r) return r;
      }
    }
    for (let i = 0; i < payloadB64.length; i++) {
      for (let j = 0; j < B.length; j++) {
        if (B[j] === payloadB64[i]) continue;
        const r = await ok(payloadB64.slice(0, i) + B[j] + payloadB64.slice(i + 1));
        if (r) return r;
      }
    }
    return null;
  },

  getDeviceId() {
    let id = localStorage.getItem(ESAT_DEVICE_LS);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
        : 'd-' + Date.now() + '-' + Math.random().toString(16).slice(2));
      localStorage.setItem(ESAT_DEVICE_LS, id);
    }
    return id;
  },

  /**
   * Verify an activation code offline (ECDSA-P256 / SHA-256).
   * Returns: { valid, payload, error }
   */
  async verify(code) {
    if (typeof code !== 'string' || !code.trim()) {
      return { valid: false, error: '请输入激活码' };
    }
    if (!window.crypto || !window.crypto.subtle) {
      return { valid: false, error: '当前环境不支持加密验证，请通过本地服务器（localhost）打开，不要直接双击文件。' };
    }
    const SIG_LEN = 86; // 64-byte ECDSA P-256 (r||s) in base64url
    const parts = this.extractToken(code).split('.');
    if (parts.length !== 2) {
      return { valid: false, error: '激活码格式错误：请重新完整复制一次，不要手动输入' };
    }
    const [payloadB64, sigB64] = parts;
    if (sigB64.length < SIG_LEN) {
      return {
        valid: false,
        error: '激活码不完整（少 ' + (SIG_LEN - sigB64.length) + ' 个字符），请重新复制完整的一串'
      };
    }

    let usedB64 = payloadB64;
    let payload = this.parsePayload(payloadB64);
    if (!payload) {
      // Copying a code out of a chat window or a console regularly drops or
      // duplicates exactly one character. Try to restore the original, but
      // only accept it when the seller's signature validates over the repair.
      const repaired = await this.repairPayload(payloadB64, sigB64);
      if (repaired) {
        usedB64 = repaired;
        payload = this.parsePayload(repaired);
      }
    }
    if (!payload) {
      // The payload head decoded to readable JSON, so the tail was cut off.
      let head = '';
      try { head = this.b64urlDecode(payloadB64.slice(0, 40)); } catch (e2) { head = ''; }
      if (head.indexOf('{"') === 0) {
        return { valid: false, error: '激活码中间少了字符，请重新完整复制一次（长按消息选「复制」，不要拖选）' };
      }
      return { valid: false, error: '激活码无法解析，请重新完整复制一次' };
    }

    if (!(await this.verifySig(usedB64, sigB64))) {
      return { valid: false, error: '激活码无效或已被篡改' };
    }

    if (payload.exp && Date.now() > payload.exp) {
      return { valid: false, error: '激活码已过期，请联系卖家获取更新' };
    }
    // The bank decryption password travels inside the signed payload.
    if (typeof payload.k !== 'string' || !payload.k) {
      return { valid: false, error: '激活码缺少授权信息，请联系卖家重新签发' };
    }
    return { valid: true, payload };
  },

  isActivated() {
    const rec = this.readRecord();
    // An activation is only real if it also carries a usable bank password.
    return !!(rec && typeof rec.payload.k === 'string' && rec.payload.k);
  },

  getActivePayload() {
    try {
      const raw = localStorage.getItem(ESAT_LICENSE_LS);
      return raw ? JSON.parse(raw).payload : null;
    } catch (e) { return null; }
  },

  /**
   * Return the bank decryption password held by the current activation.
   * Source of truth is the signed activation payload — never the code base.
   * Returns null when there is no valid, unexpired activation.
   */
  getKey() {
    const rec = this.readRecord();
    return rec && typeof rec.payload.k === 'string' ? rec.payload.k : null;
  },

  /** Read + validate the stored activation record (null if missing/expired). */
  readRecord() {
    try {
      const raw = localStorage.getItem(ESAT_LICENSE_LS);
      if (!raw) return null;
      const rec = JSON.parse(raw);
      if (!rec || !rec.payload) return null;
      if (rec.payload.exp && Date.now() > rec.payload.exp) return null;
      return rec;
    } catch (e) { return null; }
  },

  /** Activate with a code; stores local activation record. */
  async activate(code) {
    const res = await this.verify(code);
    if (!res.valid) return res;
    const rec = {
      codeHash: this.bytesToB64url(this.strToBytes(code)),
      payload: res.payload,
      deviceId: this.getDeviceId(),
      activatedAt: Date.now(),
    };
    localStorage.setItem(ESAT_LICENSE_LS, JSON.stringify(rec));
    return { valid: true, payload: res.payload };
  },

  clear() {
    localStorage.removeItem(ESAT_LICENSE_LS);
  }
};

window.License = License;
