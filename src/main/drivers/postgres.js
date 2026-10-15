'use strict';
const { serializeRows, orderClause, whereClause } = require('./common');

class PostgresDriver {
  constructor(cfg) {
    this.cfg = cfg;
    this.pools = new Map();
    this.pg = require('pg');
    // Return dates/bigints/numerics as text, the way a DB client should show them.
    const t = this.pg.types;
    [1082, 1114, 1184, 1083, 1266, 20, 1700].forEach((oid) => t.setTypeParser(oid, (v) => v));
  }
  pool(db) {
    db = db || this.cfg.database || 'postgres';
    if (!this.pools.has(db)) {
      const c = this.cfg;
      this.pools.set(db, new this.pg.Pool({
        host: c.host || 'localhost', port: Number(c.port) || 5432, user: c.user,
        password: c.password, database: db, max: 3, idleTimeoutMillis: 15000, connectionTimeoutMillis: 8000,
        ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
      }));
      this.pools.get(db).on('error', () => {}); // idle client dropped by server: don't crash
    }
    return this.pools.get(db);
  }
  q(id) { return '"' + String(id).replace(/"/g, '""') + '"'; }
  split(table) {
    const i = table.indexOf('.');
    return i < 0 ? ['public', table] : [table.slice(0, i), table.slice(i + 1)];
  }
  async test() { await this.pool().query('select 1'); }
  async listDatabases() {
    const r = await this.pool().query(
      'select datname from pg_database where not datistemplate and datallowconn order by datname');
    return r.rows.map((x) => x.datname);
  }
  async listTables(db) {
    const r = await this.pool(db).query(`
      select table_schema as schema, table_name as name, table_type as kind
      from information_schema.tables
      where table_schema not in ('pg_catalog','information_schema') and table_schema not like 'pg_toast%'
      order by table_schema = 'public' desc, table_schema, table_name`);
    return r.rows.map((x) => ({
      name: x.schema === 'public' ? x.name : `${x.schema}.${x.name}`,
      schema: x.schema, kind: x.kind === 'VIEW' ? 'view' : 'table',
    }));
  }
  async columns(db, table) {
    const [s, t] = this.split(table);
    const r = await this.pool(db).query(`
      select c.column_name as name, c.data_type as type, c.is_nullable = 'YES' as nullable,
             c.column_default as "default",
             exists (select 1 from information_schema.table_constraints tc
                     join information_schema.key_column_usage k
                       on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
                     where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = c.table_schema
                       and tc.table_name = c.table_name and k.column_name = c.column_name) as pk
      from information_schema.columns c
      where c.table_schema = $1 and c.table_name = $2 order by c.ordinal_position`, [s, t]);
    return r.rows;
  }
  async browse(db, table, o) {
    const [s, t] = this.split(table);
    const from = `${this.q(s)}.${this.q(t)}`;
    const where = whereClause(o);
    const p = this.pool(db);
    const [data, cnt] = await Promise.all([
      p.query({ text: `select * from ${from}${where}${orderClause((x) => this.q(x), o)} limit ${o.limit | 0} offset ${o.offset | 0}`, rowMode: 'array' }),
      p.query(`select count(*)::bigint as n from ${from}${where}`),
    ]);
    return { columns: data.fields.map((f) => f.name), rows: serializeRows(data.rows), total: Number(cnt.rows[0].n) };
  }
  async query(db, sql) {
    const res = await this.pool(db).query({ text: sql, rowMode: 'array' });
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return {
      columns: (last.fields || []).map((f) => f.name), rows: serializeRows(last.rows || []),
      affected: last.rowCount, command: last.command,
    };
  }
  async foreignKeys(db, table) {
    const [s, t] = this.split(table);
    const r = await this.pool(db).query(`
      select a.attname as col, nf.nspname as rschema, cf.relname as rtable, af.attname as rcol
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class cf on cf.oid = c.confrelid join pg_namespace nf on nf.oid = cf.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1 and n.nspname = $1 and cl.relname = $2`, [s, t]);
    return r.rows.map((x) => ({ column: x.col, db, table: x.rschema === 'public' ? x.rtable : `${x.rschema}.${x.rtable}`, refColumn: x.rcol }));
  }
  async lookup(db, table, col, value) {
    const [s, t] = this.split(table);
    const r = await this.pool(db).query({ text: `select * from ${this.q(s)}.${this.q(t)} where ${this.q(col)} = $1 limit 1`, values: [String(value)], rowMode: 'array' });
    return { columns: r.fields.map((f) => f.name), row: r.rows[0] ? serializeRows(r.rows)[0] : null };
  }
  async close() { await Promise.all([...this.pools.values()].map((p) => p.end().catch(() => {}))); }
}

module.exports = { PostgresDriver };
