import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionContext, tableRefs, tokenize } from '../src/renderer/js/editor/sql-context.js';

/** Context at the `|` marker. */
const at = (s) => completionContext(s.replace('|', ''), s.indexOf('|'));
const refs = (sql) => tableRefs(tokenize(sql));

test('tokenize skips strings and comments, unquotes identifiers', () => {
  const t = tokenize(`select "a""b", 'x;y' -- c\n/* d */ from t`);
  assert.deepEqual(t.map((x) => [x.type, x.value]), [
    ['word', 'select'], ['ident', 'a"b'], ['punct', ','], ['string', 'x;y'], ['comment', '-- c'], ['comment', '/* d */'], ['word', 'from'], ['word', 't'],
  ]);
});

test('tableRefs: aliases, AS, comma lists, joins, schemas', () => {
  assert.deepEqual(refs('select * from users u join public.orders as o on o.user_id = u.id, items where 1'), [
    { table: 'users', alias: 'u' }, { table: 'public.orders', alias: 'o' },
  ]);
  assert.deepEqual(refs('select * from a, b x, c where true'), [
    { table: 'a', alias: null }, { table: 'b', alias: 'x' }, { table: 'c', alias: null },
  ]);
  assert.deepEqual(refs('update "My Table" set x = 1'), [{ table: 'My Table', alias: null }]);
  assert.deepEqual(refs('insert into t (a) values (1)'), [{ table: 't', alias: null }]);
  assert.deepEqual(refs('select * from (select 1) s'), []);
});

test('column mode uses the tables of the current statement only', () => {
  const c = at('select 1 from a; select na| from users u; select 2 from b');
  assert.equal(c.mode, 'column');
  assert.equal(c.prefix, 'na');
  assert.deepEqual(c.refs, [{ table: 'users', alias: 'u' }]);
});

test('member mode after alias.', () => {
  const c = at('select u.| from users u');
  assert.equal(c.mode, 'member');
  assert.equal(c.qualifier, 'u');
  assert.equal(c.prefix, '');
  assert.equal(at('select * from public.us|').qualifier, 'public');
});

test('table mode after FROM / JOIN / comma in FROM', () => {
  assert.equal(at('select * from us|').mode, 'table');
  assert.equal(at('select * from a join or|').mode, 'table');
  assert.equal(at('select * from a, or|').mode, 'table');
  assert.equal(at('select a, b|').mode, 'column');
});

test('alias position after a table name', () => {
  assert.equal(at('select * from users wh|').mode, 'alias');
});

test('replaces the whole word under the cursor', () => {
  const c = at('select na|me from t');
  assert.equal(c.start, 7);
  assert.equal(c.end, 11);
});

test('no completion inside strings, comments or numbers', () => {
  assert.equal(at("select 'ab|c' from t"), null);
  assert.equal(at('select 1 -- na|'), null);
  assert.equal(at('select 12|'), null);
});

test('inside a quoted identifier', () => {
  const c = at('select "Crea| from t');
  assert.equal(c.quoted, true);
  assert.equal(c.prefix, 'Crea');
});

test('prefix: a WHERE-only field is completed against its table', () => {
  const prefix = 'select * from "users" where ';
  const c = completionContext('id = 1 and na', 13, { prefix });
  assert.equal(c.mode, 'column');
  assert.deepEqual([c.start, c.end, c.prefix], [11, 13, 'na']);
  assert.deepEqual(c.refs, [{ table: 'users', alias: null }]);
  assert.equal(completionContext("name = 'a|", 9, { prefix }), null);
});
