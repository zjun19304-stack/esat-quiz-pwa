/* ════════════════════════════════════════════════════════
   ESAT PWA — Auth Module (Hardened)
   Login + Question Bank Decryption + Multi-student + Security
   ════════════════════════════════════════════════════════ */

'use strict';

const Auth = {
  SESSION_KEY: 'esat_auth_session',
  SESSION_MAX_AGE: 2 * 60 * 60 * 1000,  // 2 hours
  MAX_ATTEMPTS: 5,
  LOCK_TIME: 30000,                     // 30s initial lock
  LOCK_MAX_TIME: 5 * 60 * 1000,         // 5min max lock
  currentStudent: '',

  /**
   * Initialize: check if already logged in
   */
  init() {
    // Frame-busting: prevent clickjacking
    if (window.top !== window.self) {
      window.top.location = window.self.location;
      return;
    }

    const session = this.getSession();
    if (session) {
      if (Date.now() - session.time > this.SESSION_MAX_AGE) {
        this.clearSession();
        this.showLogin();
        return;
      }
      this.tryDecrypt(session.password).then(success => {
        if (success) {
          this.unlockApp();
        } else {
          this.clearSession();
          this.showLogin();
        }
      });
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
      loginScreen.classList.add('active');
      const input = document.getElementById('login-password');
      if (input) {
        input.focus();
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        newInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.handleLogin();
        });
      }
      const btn = document.getElementById('login-btn');
      if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => this.handleLogin());
      }
    }
  },

  hideLogin() {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) loginScreen.classList.remove('active');
  },

  /**
   * Handle login with cross-tab rate limiting
   */
  async handleLogin() {
    const input = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if (!input) return;

    const lockUntil = parseInt(localStorage.getItem('esat_lock_until') || '0');
    if (Date.now() < lockUntil) {
      const wait = Math.ceil((lockUntil - Date.now()) / 1000);
      if (errorEl) errorEl.textContent = `Too many attempts. Please wait ${wait}s.`;
      return;
    }

    const password = input.value.trim();
    if (!password) {
      if (errorEl) errorEl.textContent = 'Please enter password';
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verifying...';
    }

    const success = await this.tryDecrypt(password);

    if (success) {
      this.saveSession(password);
      this.hideLogin();
      this.unlockApp();
      this.setupAntiCopy();
      localStorage.removeItem('esat_lock_until');
      localStorage.removeItem('esat_attempts');
      sessionStorage.removeItem('esat_attempts');
    } else {
      const attempts = parseInt(sessionStorage.getItem('esat_attempts') || '0') + 1;
      sessionStorage.setItem('esat_attempts', attempts.toString());

      if (attempts >= this.MAX_ATTEMPTS) {
        const lockCount = parseInt(localStorage.getItem('esat_lock_count') || '0') + 1;
        localStorage.setItem('esat_lock_count', lockCount.toString());
        const lockTime = Math.min(this.LOCK_TIME * Math.pow(2, lockCount - 1), this.LOCK_MAX_TIME);
        localStorage.setItem('esat_lock_until', (Date.now() + lockTime).toString());
        sessionStorage.setItem('esat_attempts', '0');
        const waitSec = Math.ceil(lockTime / 1000);
        if (errorEl) errorEl.textContent = `Too many wrong attempts. Please wait ${waitSec}s.`;
      } else {
        const remaining = this.MAX_ATTEMPTS - attempts;
        if (errorEl) errorEl.textContent = `Wrong password. ${remaining} attempts left.`;
      }

      input.value = '';
      input.focus();
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enter';
    }
  },

  async sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Try to decrypt question bank with password
   */
  async tryDecrypt(password) {
    if (!window.__ESAT_ENC__ || !Array.isArray(window.__ESAT_ENC__)) {
      console.error('Encrypted question bank not loaded');
      return false;
    }

    const totalBlobs = window.__ESAT_ENC__.length;
    for (let i = 0; i < totalBlobs; i++) {
      try {
        const decrypted = await this.decryptData(window.__ESAT_ENC__[i], password);
        if (decrypted) {
          const data = JSON.parse(decrypted);
          if (data.topics && data.questions && data.student) {
            if (!Array.isArray(data.topics) || !Array.isArray(data.questions)) {
              continue;
            }
            window.TOPICS = data.topics;
            window.QUESTIONS = data.questions;
            this.currentStudent = data.student || 'Student';
            return true;
          }
        }
      } catch (e) {
        // Decryption failed
      }
    }
    return false;
  },

  /**
   * Decrypt data: XOR stream cipher with SHA-256 counter mode keystream
   */
  async decryptData(encryptedB64, password) {
    const keyData = new TextEncoder().encode(password);
    const keyHash = new Uint8Array(await crypto.subtle.digest('SHA-256', keyData));

    const encrypted = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
    const keystream = await this.generateKeystream(keyHash, encrypted.length);

    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keystream[i];
    }

    return new TextDecoder().decode(decrypted);
  },

  async generateKeystream(keyBytes, length) {
    const stream = new Uint8Array(length);
    let offset = 0;
    let counter = 0;

    while (offset < length) {
      const counterBuf = new Uint8Array(4);
      new DataView(counterBuf.buffer).setUint32(0, counter, false);

      const input = new Uint8Array(keyBytes.length + 4);
      input.set(keyBytes);
      input.set(counterBuf, keyBytes.length);

      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
      const chunkLen = Math.min(32, length - offset);
      stream.set(hash.subarray(0, chunkLen), offset);
      offset += chunkLen;
      counter++;
    }

    return stream;
  },

  unlockApp() {
    const app = document.getElementById('app');
    if (app) app.style.display = '';
    this.updateStudentDisplay();
    window.dispatchEvent(new CustomEvent('auth:ready'));
  },

  updateStudentDisplay() {
    const subtitle = document.querySelector('.app-header .subtitle');
    if (subtitle) {
      subtitle.textContent = `${this.currentStudent} - ESAT Practice`;
    }
    document.title = `ESAT - ${this.currentStudent}`;
  },

  getSession() {
    try {
      const s = sessionStorage.getItem(this.SESSION_KEY);
      if (!s) return null;
      const parsed = JSON.parse(s);
      if (Date.now() - parsed.time > this.SESSION_MAX_AGE) {
        sessionStorage.removeItem(this.SESSION_KEY);
        return null;
      }
      return parsed;
    } catch { return null; }
  },

  saveSession(password) {
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({
      password: password,
      student: this.currentStudent,
      time: Date.now(),
    }));
  },

  clearSession() {
    sessionStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem('esat_attempts');
    if (window.QUESTIONS) window.QUESTIONS = null;
    if (window.TOPICS) window.TOPICS = null;
  },

  logout() {
    this.clearSession();
    try {
      const s = (this.currentStudent || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      localStorage.removeItem(`esat_wrong_answers_${s}`);
      localStorage.removeItem(`esat_practice_history_${s}`);
      localStorage.removeItem(`esat_current_session_${s}`);
      localStorage.removeItem(`esat_settings_${s}`);
    } catch {}
    location.reload();
  },

  setupAntiCopy() {
    document.addEventListener('contextmenu', (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (['input', 'textarea'].includes(tag)) return;
      e.preventDefault();
    });

    document.addEventListener('selectstart', (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (['input', 'textarea'].includes(tag)) return;
      e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'F12') { e.preventDefault(); return; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'i' || e.key === 'j')) {
        e.preventDefault(); return;
      }
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault(); return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault(); return;
      }
    });

    let devtoolsOpen = false;
    const threshold = 160;
    const checkDevtools = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > threshold || heightDiff > threshold) {
        if (!devtoolsOpen) {
          devtoolsOpen = true;
          document.body.style.filter = 'blur(10px)';
        }
      } else {
        if (devtoolsOpen) {
          devtoolsOpen = false;
          document.body.style.filter = '';
        }
      }
    };
    setInterval(checkDevtools, 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        document.body.style.filter = 'blur(10px)';
      } else {
        if (!devtoolsOpen) {
          document.body.style.filter = '';
        }
      }
    });
  },
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
