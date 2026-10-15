'use strict';
// Saved connections, persisted as JSON. Passwords never leave the main process in clear
// except through `withSecret`, which is only used to open a driver.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * @param {{ file: string, cipher: { encrypt(s: string): string, decrypt(s: string): string } }} opts
 */
function createConnectionStore({ file, cipher }) {
  const load = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  };
  const save = (list) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list, null, 2));
  };
  const toPublic = ({ password, ...c }) => ({ ...c, hasPassword: !!password });
  const withSecret = (c) => ({ ...c, password: cipher.decrypt(c.password) });

  return {
    list: () => load().map(toPublic),
    /** Full config (decrypted password) of a saved connection, or null. */
    resolve(id) {
      const c = load().find((x) => x.id === id);
      return c ? withSecret(c) : null;
    },
    /** Insert or update. An empty password on edit keeps the stored one. */
    upsert(c) {
      const list = load();
      const i = list.findIndex((x) => x.id === c.id);
      const prev = i >= 0 ? list[i] : null;
      const rec = {
        id: c.id || crypto.randomUUID(), name: c.name, type: c.type, color: c.color || '',
        host: c.host || '', port: c.port || '', user: c.user || '', database: c.database || '',
        ssl: !!c.ssl, file: c.file || '',
        password: c.password ? cipher.encrypt(c.password) : (prev ? prev.password : ''),
      };
      if (i >= 0) list[i] = rec; else list.push(rec);
      save(list);
      return toPublic(rec);
    },
    remove(id) { save(load().filter((x) => x.id !== id)); },
    /** Config to test: falls back to the stored password when the form left it empty. */
    forTest(c) {
      if (c.password || !c.id) return c;
      const prev = load().find((x) => x.id === c.id);
      return prev ? { ...c, password: cipher.decrypt(prev.password) } : c;
    },
  };
}

module.exports = { createConnectionStore };
