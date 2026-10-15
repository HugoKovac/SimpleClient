'use strict';
// Driver layer: one uniform interface over Postgres, MySQL and SQLite.
// Each driver exposes:
//   test()
//   listDatabases() -> [name]
//   listTables(db)  -> [{ name, schema, kind }]   (name is display name, unique within db)
//   columns(db, table) -> [{ name, type, nullable, default, pk }]
//   foreignKeys(db, table) -> [{ column, db, table, refColumn }]   (single-column keys only)
//   lookup(db, table, col, value) -> { columns, row }
//   browse(db, table, { limit, offset, orderBy, dir, where }) -> { columns, rows, total }
//   query(db, sql) -> { columns, rows, affected, command }
//   close()

const { PostgresDriver } = require('./postgres');
const { MysqlDriver } = require('./mysql');
const { SqliteDriver } = require('./sqlite');

const DRIVERS = { postgres: PostgresDriver, mysql: MysqlDriver, sqlite: SqliteDriver };

function makeDriver(cfg) {
  const Driver = DRIVERS[cfg.type];
  if (!Driver) throw new Error('Type de connexion inconnu: ' + cfg.type);
  return new Driver(cfg);
}

module.exports = { makeDriver };
