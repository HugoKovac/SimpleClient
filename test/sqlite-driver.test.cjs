const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeDriver } = require('../src/main/drivers');

test('sqlite driver: schema, browse, foreign keys, persistence', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-')), 'db.sqlite');
  const d = makeDriver({ type: 'sqlite', file });
  await d.test();
  await d.query('main', `
    create table users (id integer primary key, name text, meta json);
    create table orders (id integer primary key, user_id integer references users(id), total real);
    insert into users values (1, 'Ada', '{"a":1}'), (2, 'Linus', null);
    insert into orders values (10, 1, 9.5), (11, 2, 3), (12, 1, 1);`);
  assert.deepEqual((await d.listTables()).map((t) => t.name), ['orders', 'users']);
  assert.deepEqual((await d.columns('main', 'users')).map((c) => [c.name, c.pk]), [['id', true], ['name', false], ['meta', false]]);

  const page = await d.browse('main', 'orders', { limit: 2, offset: 0, orderBy: 'total', dir: 'desc', where: 'user_id = 1' });
  assert.deepEqual(page, { columns: ['id', 'user_id', 'total'], rows: [[10, 1, 9.5], [12, 1, 1]], total: 2 });

  assert.deepEqual(await d.foreignKeys('main', 'orders'), [{ column: 'user_id', db: 'main', table: 'users', refColumn: 'id' }]);
  assert.deepEqual((await d.lookup('main', 'users', 'id', 2)).row, [2, 'Linus', null]);
  await d.close();

  // writes were persisted to the file
  const again = makeDriver({ type: 'sqlite', file });
  const r = await again.query('main', 'select count(*) as n from orders');
  assert.deepEqual(r.rows, [[3]]);
  await again.close();
});

test('makeDriver rejects unknown types', () => {
  assert.throws(() => makeDriver({ type: 'oracle' }), /inconnu/);
});
