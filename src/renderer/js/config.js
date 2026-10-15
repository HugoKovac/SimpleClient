// App-wide constants. The main process passes the platform in the page URL.
export const PLATFORM = new URLSearchParams(location.search).get('platform') || 'darwin';
export const MAC = PLATFORM === 'darwin';
/** Label of the main modifier key, e.g. `${MOD}K`. */
export const MOD = MAC ? '⌘' : 'Ctrl+';
export const PAGE = 100;
export const MAX_QUERY_ROWS = 2000;
export const COLORS = ['', '#0f766e', '#2563eb', '#ca8a04', '#c2410c', '#be185d', '#7c3aed'];
export const TYPES = {
  postgres: { label: 'PostgreSQL', port: 5432, user: 'postgres' },
  mysql: { label: 'MySQL', port: 3306, user: 'root' },
  sqlite: { label: 'SQLite' },
};
export const SYSTEM_DBS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);

/** Is the platform's main modifier (⌘ on macOS, Ctrl elsewhere) held? */
export const modKey = (e) => (MAC ? e.metaKey : e.ctrlKey);
