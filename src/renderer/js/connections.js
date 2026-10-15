// Opening/closing connections and loading their table lists.
import { api } from './api.js';
import { toast } from './lib/dom.js';
import { S, connById, live, resetLive, saveSession } from './state.js';
import { renderTree } from './sidebar.js';
import { paletteRefresh } from './palette/palette.js';

export async function loadConns() {
  S.conns = await api.listConnections();
  renderTree();
}

export async function connect(id, { expand = true } = {}) {
  const L = live(id);
  if (L.status === 'open' || L.status === 'connecting') { if (expand) { L.open = true; renderTree(); } return L.ready; }
  L.status = 'connecting'; L.error = null; L.open = expand || L.open;
  renderTree();
  L.ready = (async () => {
    try {
      const dbs = await api.openConnection(id);
      const c = connById(id);
      L.dbs = dbs.map((name) => ({ name, tables: null, loading: false, open: false }));
      L.status = 'open';
      const first = L.dbs.find((d) => d.name === c.database) || L.dbs[0];
      if (first) { first.open = true; await loadTables(id, first.name); }
      renderTree(); saveSession();
      indexAll(id); // background: fill ⌘K with every table of every database
    } catch (e) {
      L.status = 'err'; L.error = e.message; renderTree();
      toast(`${connById(id)?.name || 'Connexion'} : ${e.message}`);
      throw e;
    }
  })();
  return L.ready.catch(() => {});
}

export async function disconnect(id) {
  await api.closeConnection(id);
  resetLive(id);
  renderTree(); saveSession();
}

export async function loadTables(id, db, force) {
  const d = live(id).dbs.find((x) => x.name === db);
  if (!d || (d.tables && !force) || d.loading) return;
  d.loading = true; renderTree();
  try { d.tables = await api.tables(id, db); }
  catch (e) { d.tables = []; d.error = e.message; }
  d.loading = false; renderTree(); paletteRefresh();
}

async function indexAll(id) {
  const queue = live(id).dbs.filter((d) => !d.tables).slice(0, 60);
  const worker = async () => { while (queue.length) { const d = queue.shift(); await loadTables(id, d.name).catch(() => {}); } };
  await Promise.all([worker(), worker(), worker()]);
}
