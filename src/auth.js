'use strict';
// Konta: pierwsze uruchomienie zakłada admina, potem logowanie loginem i hasłem → token (Bearer).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Auth {
  constructor(file) {
    this.file = file;
    this.data = { users: [], tokens: [] };
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* pierwsze uruchomienie */ }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  needsSetup() { return this.data.users.length === 0; }

  static hash(password, salt) { return crypto.scryptSync(String(password), salt, 32).toString('hex'); }

  issue(login) {
    const token = crypto.randomBytes(32).toString('hex');
    this.data.tokens.push({ token, login, created: Date.now() });
    this.data.tokens = this.data.tokens.slice(-50);
    this.save();
    return token;
  }

  setup(login, password) {
    if (!this.needsSetup()) throw Object.assign(new Error('Konto administratora już istnieje'), { status: 409 });
    login = String(login || '').trim();
    if (!login || String(password || '').length < 4) throw Object.assign(new Error('Podaj login i hasło (min. 4 znaki)'), { status: 400 });
    const salt = crypto.randomBytes(16).toString('hex');
    this.data.users.push({ login, salt, hash: Auth.hash(password, salt), role: 'admin', created: Date.now() });
    return this.issue(login);
  }

  login(login, password) {
    const u = this.data.users.find((x) => x.login === String(login || '').trim());
    const ok = u && crypto.timingSafeEqual(Buffer.from(Auth.hash(password, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) throw Object.assign(new Error('Zły login lub hasło'), { status: 401 });
    return this.issue(u.login);
  }

  logout(token) {
    this.data.tokens = this.data.tokens.filter((t) => t.token !== token);
    this.save();
  }

  /** login użytkownika dla tokenu albo null */
  check(token) {
    if (!token) return null;
    const t = this.data.tokens.find((x) => x.token === token);
    return t ? t.login : null;
  }
}

function tokenFrom(req, url) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return url.searchParams.get('t') || '';
}

module.exports = { Auth, tokenFrom };
