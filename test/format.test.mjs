import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellHtml, looksJson, quoteIdent, shortType, sqlLiteral } from '../src/renderer/js/lib/format.js';
import { esc, highlight } from '../src/renderer/js/lib/html.js';
import { fuzzy } from '../src/renderer/js/palette/fuzzy.js';

test('esc / highlight', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(highlight('a<b', [0, 2]), '<b>a</b>&lt;<b>b</b>');
});

test('cellHtml', () => {
  assert.deepEqual(cellHtml(null), { cls: 'null', html: 'NULL' });
  assert.deepEqual(cellHtml('42'), { cls: 'num', html: '42' });
  assert.equal(cellHtml('a\nb').html, 'a↵ b');
});

test('sqlLiteral / quoteIdent', () => {
  assert.equal(sqlLiteral(null), 'null');
  assert.equal(sqlLiteral('12.5'), '12.5');
  assert.equal(sqlLiteral("l'eau"), "'l''eau'");
  assert.equal(quoteIdent('postgres', 'a"b'), '"a""b"');
  assert.equal(quoteIdent('mysql', 'a`b'), '`a``b`');
});

test('looksJson / shortType', () => {
  assert.ok(looksJson('{"a":1}'));
  assert.ok(!looksJson('{a'));
  assert.equal(shortType('timestamp with time zone'), 'timestamptz');
});

test('fuzzy prefers prefixes and word starts', () => {
  assert.equal(fuzzy('xyz', 'users'), null);
  assert.ok(fuzzy('us', 'users').score > fuzzy('us', 'bonus').score);
  assert.ok(fuzzy('ui', 'user_id').score > fuzzy('ui', 'build').score);
});
