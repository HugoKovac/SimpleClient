'use strict';
// Password encryption through the OS keychain (safeStorage), with a base64 fallback
// when no keychain is available. Values are prefixed so both can be read back.
const { safeStorage } = require('electron');

function encrypt(s) {
  if (!s) return '';
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(s).toString('base64');
  return 'raw:' + Buffer.from(s).toString('base64');
}

function decrypt(s) {
  if (!s) return '';
  try {
    if (s.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
    if (s.startsWith('raw:')) return Buffer.from(s.slice(4), 'base64').toString();
  } catch { /* unreadable: treat as no password */ }
  return '';
}

module.exports = { encrypt, decrypt };
