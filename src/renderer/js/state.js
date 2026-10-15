// Single in-memory state of the renderer, plus session persistence.
import * as storage from './lib/storage.js';

export const S = {
  conns: [],          // saved connection configs (no passwords)
  live: {},           // id -> { status: off|connecting|open|err, error, open, ready, dbs: [{ name, tables, loading, open }] }
  tabs: [],
  active: null,       // id of the active tab
  recent: storage.load('recent') || [], // [{ connId, db, table }]
  meta: {},           // `${connId}|${db}|${table}` -> Promise<{ cols, fks }>
};

export const connById = (id) => S.conns.find((c) => c.id === id);
export const live = (id) => (S.live[id] ||= { status: 'off', open: false, dbs: [] });
export const resetLive = (id) => (S.live[id] = { status: 'off', open: false, dbs: [] });
export const activeTab = () => S.tabs.find((t) => t.id === S.active);
export const openConnIds = () => Object.keys(S.live).filter((id) => S.live[id].status === 'open');

export function addRecent(connId, db, table) {
  S.recent = [{ connId, db, table }, ...S.recent.filter((r) => !(r.connId === connId && r.db === db && r.table === table))].slice(0, 8);
  storage.save('recent', S.recent);
}

export function saveSession() {
  storage.save('session', {
    open: openConnIds(),
    tabs: S.tabs.map((t) => ({ kind: t.kind, connId: t.connId, db: t.db, table: t.table, sql: t.kind === 'query' ? t.textarea?.value ?? t.sql : undefined })),
    active: S.tabs.findIndex((t) => t.id === S.active),
  });
}

export const loadSession = () => storage.load('session');
