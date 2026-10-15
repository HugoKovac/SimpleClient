'use strict';
// SQLite through sql.js (WebAssembly): no native build. The file is loaded in memory
// and written back after every statement that may have modified it.
const fs = require('fs');
const path = require('path');
const { serializeRows, orderClause, whereClause } = require('./common');

let SQL; // sql.js module, initialised once per process

class SqliteDriver {
  constructor(cfg) { this.cfg = cfg; this.file = cfg.file; }
  async open() {
    if (this.db) return this.db;
    if (!SQL) {
      const init = require('sql.js');
      SQL = await init({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
    }
    if (!this.file) throw new Error('Aucun fichier SQLite');
    const exists = fs.existsSync(this.file);
    this.db = exists ? new SQL.Database(fs.readFileSync(this.file)) : new SQL.Database();
    return this.db;
  }
  persist() { fs.writeFileSync(this.file, Buffer.from(this.db.export())); }
  q(id) { return '"' + String(id).replace(/"/g, '""') + '"'; }
  exec1(sql, params) {
    const st = this.db.prepare(sql);
    try {
      if (params) st.bind(params);
      const cols = st.getColumnNames(); const rows = [];
      while (st.step()) rows.push(st.get());
      return { columns: cols, rows };
    } finally { st.free(); }
  }
  async test() { await this.open(); this.exec1('select 1'); }
  async listDatabases() { return ['main']; }
  async listTables() {
    await this.open();
    return this.exec1("select name, type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name")
      .rows.map(([name, type]) => ({ name, kind: type }));
  }
  async columns(_db, table) {
    await this.open();
    return this.exec1(`pragma table_info(${this.q(table)})`).rows.map(([, name, type, notnull, dflt, pk]) => ({
      name, type: type || 'any', nullable: !notnull, default: dflt, pk: !!pk,
    }));
  }
  async browse(_db, table, o) {
    await this.open();
    const where = whereClause(o);
    const d = this.exec1(`select * from ${this.q(table)}${where}${orderClause((x) => this.q(x), o)} limit ${o.limit | 0} offset ${o.offset | 0}`);
    const n = this.exec1(`select count(*) from ${this.q(table)}${where}`).rows[0][0];
    return { columns: d.columns, rows: serializeRows(d.rows), total: Number(n) };
  }
  async query(_db, sql) {
    await this.open();
    const res = this.db.exec(sql);
    const changed = this.db.getRowsModified();
    if (!/^\s*(select|pragma|explain|with\s[\s\S]*select)\b/i.test(sql) || changed) this.persist();
    const last = res[res.length - 1];
    if (!last) return { columns: [], rows: [], affected: changed, command: 'OK' };
    return { columns: last.columns, rows: serializeRows(last.values), affected: last.values.length, command: 'SELECT' };
  }
  async foreignKeys(db, table) {
    await this.open();
    const fks = this.exec1(`pragma foreign_key_list(${this.q(table)})`).rows; // id, seq, table, from, to, …
    const single = fks.filter((r) => fks.filter((x) => x[0] === r[0]).length === 1);
    return single.map(([, , rtable, from, to]) => {
      if (!to) { const pk = this.exec1(`pragma table_info(${this.q(rtable)})`).rows.find((c) => c[5]); to = pk ? pk[1] : 'rowid'; }
      return { column: from, db, table: rtable, refColumn: to };
    });
  }
  async lookup(_db, table, col, value) {
    await this.open();
    const r = this.exec1(`select * from ${this.q(table)} where ${this.q(col)} = ? limit 1`, [value]);
    return { columns: r.columns, row: r.rows[0] ? serializeRows(r.rows)[0] : null };
  }
  async close() { if (this.db) { this.db.close(); this.db = null; } }
}

module.exports = { SqliteDriver };
