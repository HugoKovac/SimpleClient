'use strict';
const { serializeRows, orderClause, whereClause } = require('./common');

const SYSTEM_DBS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);

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
    const all = rows.map((r) => r.Database);
    return [...all.filter((d) => !SYSTEM_DBS.has(d)), ...all.filter((d) => SYSTEM_DBS.has(d))];
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
    const where = whereClause(o);
    return this.conn(db, async (c) => {
      const [rows, fields] = await c.query({ sql: `select * from ${from}${where}${orderClause((x) => this.q(x), o)} limit ${o.limit | 0} offset ${o.offset | 0}`, rowsAsArray: true });
      const [[cnt]] = await c.query(`select count(*) as n from ${from}${where}`);
      return { columns: fields.map((f) => f.name), rows: serializeRows(rows), total: Number(cnt.n) };
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
      return { columns: (fields || []).map((f) => f.name), rows: serializeRows(rows), affected: rows.length, command: 'SELECT' };
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
    return { columns: fields.map((f) => f.name), row: rows[0] ? serializeRows(rows)[0] : null };
  }
  async close() { if (this._pool) await this._pool.end().catch(() => {}); }
}

module.exports = { MysqlDriver };
