/* ═══════════════════════════════════════════
   OSERO — Auth Module
   ═══════════════════════════════════════════ */

const Auth = {
  token: null,
  user: null,

  init() {
    const saved = localStorage.getItem('osero-token');
    if (saved) {
      this.token = saved;
      this.fetchMe();
    }
  },

  async fetchMe() {
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.user = await res.json();
        this.onAuthChange();
      } else {
        this.clearAuth();
      }
    } catch {
      this.clearAuth();
    }
  },

  async login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    if (!username || !password) {
      errorEl.textContent = 'Fill in all fields';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Login failed';
        return;
      }
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('osero-token', this.token);
      this.onAuthChange();
      UI.hideLogin();
    } catch (err) {
      errorEl.textContent = 'Network error';
    }
  },

  async register() {
    const username = document.getElementById('register-username').value.trim();
    const displayName = document.getElementById('register-display').value.trim();
    const password = document.getElementById('register-password').value;
    const password2 = document.getElementById('register-password2').value;
    const errorEl = document.getElementById('register-error');
    errorEl.textContent = '';

    if (!username || !password) {
      errorEl.textContent = 'Fill in all required fields';
      return;
    }
    if (password !== password2) {
      errorEl.textContent = 'Passwords do not match';
      return;
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName: displayName || username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Registration failed';
        return;
      }
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('osero-token', this.token);
      this.onAuthChange();
      UI.hideRegister();
    } catch (err) {
      errorEl.textContent = 'Network error';
    }
  },

  logout() {
    this.clearAuth();
    UI.onAuthChange();
  },

  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('osero-token');
    this.onAuthChange();
  },

  onAuthChange() {
    const loggedOut = document.getElementById('auth-logged-out');
    const loggedIn = document.getElementById('auth-logged-in');
    const menuAvatar = document.getElementById('menu-avatar');
    const menuGreeting = document.getElementById('menu-greeting');

    if (this.user) {
      loggedOut.style.display = 'none';
      loggedIn.style.display = 'flex';
      menuAvatar.textContent = this.user.avatar || '⚪';
      menuGreeting.textContent = this.user.displayName || this.user.username;
    } else {
      loggedOut.style.display = 'flex';
      loggedIn.style.display = 'none';
    }
  },

  isLoggedIn() {
    return !!this.token && !!this.user;
  },

  async saveGameResult(mode, playerColor, result, playerScore, opponentScore, difficulty, opponentName, durationSeconds) {
    if (!this.isLoggedIn()) return;
    try {
      await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ mode, playerColor, result, playerScore, opponentScore, difficulty, opponentName, durationSeconds })
      });
    } catch (err) {
      console.error('Failed to save game result:', err);
    }
  }
};
