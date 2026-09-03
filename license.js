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
    const parts = code.trim().split('.');
    if (parts.length !== 2) {
      return { valid: false, error: '激活码格式错误' };
    }
    const [payloadB64, sigB64] = parts;

    let payload;
    try {
      payload = JSON.parse(this.b64urlDecode(payloadB64));
    } catch (e) {
      return { valid: false, error: '激活码无法解析' };
    }

    try {
      const pubKey = await crypto.subtle.importKey(
        'spki', this.pemToBuf(this.PUBKEY),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
      );
      const sig = this.b64urlToBytes(sigB64);
      const data = this.strToBytes(payloadB64);
      const ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, data
      );
      if (!ok) return { valid: false, error: '激活码无效或已被篡改' };
    } catch (e) {
      return { valid: false, error: '激活码校验失败' };
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
