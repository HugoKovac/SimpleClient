import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionContext } from '../src/renderer/js/editor/sql-context.js';
import { resolveTable, sqlName, suggest, tablesNeeded } from '../src/renderer/js/editor/suggest.js';

const tables = [{ name: 'users' }, { name: 'orders' }, { name: 'stats.daily', kind: 'view' }];
const columns = new Map([
  ['users', [{ name: 'id', type: 'integer' }, { name: 'name', type: 'text' }, { name: 'createdAt', type: 'timestamp with time zone' }]],
  ['orders', [{ name: 'id', type: 'integer' }, { name: 'user_id', type: 'integer' }]],
]);
const run = (s, dialect = 'postgres') => {
  const ctx = completionContext(s.replace('|', ''), s.indexOf('|'));
  return suggest(ctx, { dialect, tables, columns });
};
const labels = (items) => items.map((i) => i.label);

test('columns of the referenced tables come first', () => {
  const items = run('select na| from users');
  assert.equal(items[0].label, 'name');
  assert.equal(items[0].kind, 'column');
});

test('alias.member lists that table columns in ordinal order', () => {
  assert.deepEqual(labels(run('select o.| from users u join orders o on true')), ['id', 'user_id']);
  assert.deepEqual(labels(run('select users.| from users')), ['id', 'name', 'createdAt']);
});

test('columns of several tables are labelled with their table', () => {
  const ids = run('select i| from users u, orders o').filter((i) => i.label === 'id');
  assert.deepEqual(ids.map((i) => i.detail).sort(), ['integer · orders', 'integer · users']);
});

test('tables after FROM, schema-qualified tables after schema.', () => {
  assert.deepEqual(labels(run('select * from us|')), ['users']);
  assert.deepEqual(labels(run('select * from stats.|')), ['daily']);
});

test('identifiers are quoted when needed', () => {
  assert.equal(run('select crea| from users')[0].insert, '"createdAt"');
  assert.equal(run('select crea| from users', 'mysql')[0].insert, 'createdAt');
  assert.equal(sqlName('order', 'mysql'), '`order`');
  assert.equal(sqlName('user_id', 'postgres'), 'user_id');
});

test('keywords follow the case of what is typed', () => {
  assert.ok(labels(run('select * from users WH|')).includes('WHERE'));
});

test('resolveTable / tablesNeeded', () => {
  assert.equal(resolveTable('public.users', tables), 'users');
  assert.equal(resolveTable('USERS', tables), 'users');
  assert.equal(resolveTable('nope', tables), null);
  const ctx = completionContext('select x from users u join orders o on true', 7);
  assert.deepEqual(tablesNeeded(ctx, tables), ['users', 'orders']);
});
