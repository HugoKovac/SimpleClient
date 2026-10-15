const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createConnectionStore } = require('../src/main/connections/store');
const { DriverRegistry } = require('../src/main/connections/registry');

const cipher = { encrypt: (s) => (s ? 'x:' + s : ''), decrypt: (s) => (s ? s.slice(2) : '') };
const tmpStore = () => createConnectionStore({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-')), 'c.json'), cipher });

test('store: passwords are encrypted, hidden from list, kept on edit', () => {
  const store = tmpStore();
  const saved = store.upsert({ name: 'local', type: 'postgres', password: 'secret' });
  assert.equal(saved.password, undefined);
  assert.equal(saved.hasPassword, true);
  assert.equal(store.resolve(saved.id).password, 'secret');
  store.upsert({ ...saved, name: 'renamed', password: '' });
  assert.equal(store.list()[0].name, 'renamed');
  assert.equal(store.resolve(saved.id).password, 'secret');
  assert.equal(store.forTest({ id: saved.id, password: '' }).password, 'secret');
  store.remove(saved.id);
  assert.deepEqual(store.list(), []);
  assert.equal(store.resolve(saved.id), null);
});

test('registry: one driver per connection, failures are retried', async () => {
  let made = 0, fail = true;
  const registry = new DriverRegistry((id) => (id === 'a' ? { id } : null), () => {
    made++;
    return { test: async () => { if (fail) throw new Error('down'); }, close: async () => {} };
  });
  await assert.rejects(registry.get('a'), /down/);
  fail = false;
  const [d1, d2] = await Promise.all([registry.get('a'), registry.get('a')]);
  assert.equal(d1, d2);
  assert.equal(made, 2);
  await assert.rejects(registry.get('missing'), /introuvable/);
  await registry.dropAll();
  assert.equal(registry.drivers.size, 0);
});
