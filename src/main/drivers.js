// Driver layer: one uniform interface over Postgres, MySQL and SQLite.
// Each driver exposes:
//   listDatabases() -> [name]
//   listTables(db)  -> [{ name, schema, kind }]   (name is display name, unique within db)
//   columns(db, table) -> [{ name, type, nullable, default, pk }]
//   browse(db, table, { limit, offset, orderBy, dir, where }) -> { columns, rows, total }
//   query(db, sql) -> { columns, rows, affected, command, ms }
//   close()

const fs = require('fs');
const path = require('path');

function normRows(fields, rows) {
  const columns = fields.map((f) => f);
  return { columns, rows: rows.map((r) => (Array.isArray(r) ? r : columns.map((c) => r[c]))) };
}

function serialize(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v) ? String(v) : v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    const b = Buffer.from(v);
    return `\\x${b.subarray(0, 64).toString('hex')}${b.length > 64 ? '…' : ''}`;
  }
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}
const ser = (rows) => rows.map((r) => r.map(serialize));

// ---------------------------------------------------------------- Postgres
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
      "select datname from pg_database where not datistemplate and datallowconn order by datname");
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
    const where = o.where ? ` where ${o.where}` : '';
    const order = o.orderBy ? ` order by ${this.q(o.orderBy)} ${o.dir === 'desc' ? 'desc' : 'asc'}` : '';
    const p = this.pool(db);
    const [data, cnt] = await Promise.all([
      p.query({ text: `select * from ${from}${where}${order} limit ${o.limit | 0} offset ${o.offset | 0}`, rowMode: 'array' }),
      p.query(`select count(*)::bigint as n from ${from}${where}`),
    ]);
    return { columns: data.fields.map((f) => f.name), rows: ser(data.rows), total: Number(cnt.rows[0].n) };
  }
  async query(db, sql) {
    const res = await this.pool(db).query({ text: sql, rowMode: 'array' });
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    return {
      columns: (last.fields || []).map((f) => f.name), rows: ser(last.rows || []),
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
    return { columns: r.fields.map((f) => f.name), row: r.rows[0] ? ser(r.rows)[0] : null };
  }
  async close() { await Promise.all([...this.pools.values()].map((p) => p.end().catch(() => {}))); }
}

// ---------------------------------------------------------------- MySQL
class MysqlDriver {
  constructor(cfg) { this.cfg = cfg; this.mysql = require('mysql2/promise'); }
  get pool() {
    if (!this._pool) {
      const c = this.cfg;
      this._pool = this.mysql.createPool({
        host: c.host || 'localhost', port: Number(c.port) || 3306, user: c.user, password: c.password,
        database: c.database || undefined, connectionLimit: 3, connectTimeout: 8000,
        multipleStatements: true, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
        ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
      });
    }
    return this._pool;
  }
  q(id) { return '`' + String(id).replace(/`/g, '``') + '`'; }
  async test() { await this.pool.query('select 1'); }
  async listDatabases() {
    const [rows] = await this.pool.query('show databases');
    const sys = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);
    const all = rows.map((r) => r.Database);
    return [...all.filter((d) => !sys.has(d)), ...all.filter((d) => sys.has(d))];
  }
  async listTables(db) {
    const [rows] = await this.pool.query(
      'select table_name as name, table_type as kind from information_schema.tables where table_schema = ? order by table_name', [db]);
    return rows.map((r) => ({ name: r.name || r.NAME, kind: /VIEW/.test(r.kind || r.KIND) ? 'view' : 'table' }));
  }
  async columns(db, table) {
    const [rows] = await this.pool.query(
      `select column_name as name, column_type as type, is_nullable = 'YES' as nullable,
              column_default as \`default\`, column_key = 'PRI' as pk
       from information_schema.columns where table_schema = ? and table_name = ? order by ordinal_position`, [db, table]);
    return rows.map((r) => ({ ...r, nullable: !!r.nullable, pk: !!r.pk }));
  }
  async conn(db, fn) {
    const c = await this.pool.getConnection();
    try { if (db) await c.query(`use ${this.q(db)}`); return await fn(c); } finally { c.release(); }
  }
  async browse(db, table, o) {
    const from = `${this.q(db)}.${this.q(table)}`;
    const where = o.where ? ` where ${o.where}` : '';
    const order = o.orderBy ? ` order by ${this.q(o.orderBy)} ${o.dir === 'desc' ? 'desc' : 'asc'}` : '';
    return this.conn(db, async (c) => {
      const [rows, fields] = await c.query({ sql: `select * from ${from}${where}${order} limit ${o.limit | 0} offset ${o.offset | 0}`, rowsAsArray: true });
      const [[cnt]] = await c.query(`select count(*) as n from ${from}${where}`);
      return { columns: fields.map((f) => f.name), rows: ser(rows), total: Number(cnt.n) };
    });
  }
  async query(db, sql) {
    return this.conn(db, async (c) => {
      let [rows, fields] = await c.query({ sql, rowsAsArray: true });
      // multi-statement: keep the last result
      if (Array.isArray(fields) && fields.some((f) => f === undefined || Array.isArray(f))) {
        const i = rows.length - 1; rows = rows[i]; fields = fields[i];
      }
      if (!Array.isArray(rows)) return { columns: [], rows: [], affected: rows.affectedRows, command: 'OK' };
      return { columns: (fields || []).map((f) => f.name), rows: ser(rows), affected: rows.length, command: 'SELECT' };
    });
  }
  async foreignKeys(db, table) {
    const [rows] = await this.pool.query(
      `select column_name as col, referenced_table_schema as rdb, referenced_table_name as rtable, referenced_column_name as rcol
       from information_schema.key_column_usage
       where table_schema = ? and table_name = ? and referenced_table_name is not null`, [db, table]);
    return rows.map((x) => ({ column: x.col, db: x.rdb, table: x.rtable, refColumn: x.rcol }));
  }
  async lookup(db, table, col, value) {
    const [rows, fields] = await this.pool.query({ sql: `select * from ${this.q(db)}.${this.q(table)} where ${this.q(col)} = ? limit 1`, rowsAsArray: true }, [value]);
    return { columns: fields.map((f) => f.name), row: rows[0] ? ser(rows)[0] : null };
  }
  async close() { if (this._pool) await this._pool.end().catch(() => {}); }
}

// ---------------------------------------------------------------- SQLite (sql.js, no native build)
let SQL;
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
    const where = o.where ? ` where ${o.where}` : '';
    const order = o.orderBy ? ` order by ${this.q(o.orderBy)} ${o.dir === 'desc' ? 'desc' : 'asc'}` : '';
    const d = this.exec1(`select * from ${this.q(table)}${where}${order} limit ${o.limit | 0} offset ${o.offset | 0}`);
    const n = this.exec1(`select count(*) from ${this.q(table)}${where}`).rows[0][0];
    return { columns: d.columns, rows: ser(d.rows), total: Number(n) };
  }
  async query(_db, sql) {
    await this.open();
    const res = this.db.exec(sql);
    const changed = this.db.getRowsModified();
    if (!/^\s*(select|pragma|explain|with\s[\s\S]*select)\b/i.test(sql) || changed) this.persist();
    const last = res[res.length - 1];
    if (!last) return { columns: [], rows: [], affected: changed, command: 'OK' };
    return { columns: last.columns, rows: ser(last.values), affected: last.values.length, command: 'SELECT' };
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
    return { columns: r.columns, row: r.rows[0] ? ser(r.rows)[0] : null };
  }
  async close() { if (this.db) { this.db.close(); this.db = null; } }
}

function makeDriver(cfg) {
  if (cfg.type === 'postgres') return new PostgresDriver(cfg);
  if (cfg.type === 'mysql') return new MysqlDriver(cfg);
  if (cfg.type === 'sqlite') return new SqliteDriver(cfg);
  throw new Error('Type de connexion inconnu: ' + cfg.type);
}

module.exports = { makeDriver };
