'use strict';
// Update check against the GitHub releases of the repo (see .github/workflows/release.yml).
// The app is not signed, so no Squirrel auto-update: the DMG matching the CPU is downloaded
// to ~/Downloads and opened, the user drags the new app over the old one.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

/** "owner/repo" from package.json's repository URL. */
function repoSlug(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
  const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  return m ? m[1] : null;
}

/** Compares "1.2.3" style versions (a leading "v" and pre-release suffixes are ignored). */
function compareVersions(a, b) {
  const parts = (v) => String(v).replace(/^v/, '').split(/[-+]/)[0].split('.').map((x) => parseInt(x, 10) || 0);
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** DMG asset built for this CPU (`SimpleClient-<version>-<arch>.dmg`). */
function pickAsset(assets, arch) {
  return (assets || []).find((a) => a.name.endsWith(`-${arch}.dmg`)) || null;
}

/**
 * @param {{ repo: string, currentVersion: string, arch: string, platform: string, fetch: typeof fetch }} opts
 * @returns {Promise<null | { version: string, notes: string, page: string, publishedAt: string, asset: { name: string, url: string, size: number } | null }>}
 *   null when up to date or when the repo has no release yet
 */
async function findUpdate({ repo, currentVersion, arch, platform, fetch }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SimpleClient' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  const rel = await res.json();
  if (rel.draft || rel.prerelease || compareVersions(rel.tag_name, currentVersion) <= 0) return null;
  const a = platform === 'darwin' ? pickAsset(rel.assets, arch) : null;
  return {
    version: rel.tag_name.replace(/^v/, ''),
    notes: rel.body || '',
    page: rel.html_url,
    publishedAt: rel.published_at,
    asset: a && { name: a.name, url: a.browser_download_url, size: a.size },
  };
}

/** Streams `url` to `file`, reporting progress. Writes to a .part file first. */
async function download({ url, file, fetch, onProgress }) {
  const res = await fetch(url, { headers: { 'User-Agent': 'SimpleClient' } });
  if (!res.ok || !res.body) throw new Error(`Téléchargement: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0, last = 0;
  const part = file + '.part';
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    received += chunk.length;
    const now = Date.now();
    if (now - last > 100) { last = now; onProgress?.({ received, total }); }
  });
  await pipeline(body, fs.createWriteStream(part));
  fs.renameSync(part, file);
  onProgress?.({ received, total: total || received });
  return file;
}

/** Free name in `dir` (`x.dmg`, `x (1).dmg`, …) so an older download isn't overwritten. */
function freePath(dir, name) {
  const ext = path.extname(name), base = name.slice(0, -ext.length || undefined);
  let p = path.join(dir, name);
  for (let i = 1; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

/**
 * Stateful updater used by the IPC layer. Electron APIs are injected so this stays testable.
 * @param {{ repo: string | null, currentVersion: string, arch: string, platform: string, enabled: boolean,
 *           fetch: typeof fetch, downloadsDir: () => string, openPath: (p: string) => Promise<string>,
 *           openExternal: (url: string) => Promise<void> }} deps
 */
function createUpdater(deps) {
  let latest = null; // last update found
  let file = null;   // downloaded installer
  let pending = null;

  return {
    /** Public info about an available update, or null. */
    async check() {
      if (!deps.enabled || !deps.repo) return null;
      latest = await findUpdate(deps);
      if (!latest) return null;
      const { version, notes, page, publishedAt, asset } = latest;
      return { version, current: deps.currentVersion, notes, page, publishedAt, size: asset?.size || 0, downloadable: !!asset };
    },
    /** Downloads the installer of the last update found. Concurrent calls share one download. */
    download(onProgress) {
      if (!latest?.asset) throw new Error('Aucune mise à jour à télécharger');
      pending ||= download({ url: latest.asset.url, file: freePath(deps.downloadsDir(), latest.asset.name), fetch: deps.fetch, onProgress })
        .then((f) => (file = f))
        .finally(() => { pending = null; });
      return pending;
    },
    /** Opens the downloaded DMG (Finder mounts it). */
    async install() {
      if (!file) throw new Error('Mise à jour non téléchargée');
      const err = await deps.openPath(file);
      if (err) throw new Error(err);
      return file;
    },
    openPage() { return latest ? deps.openExternal(latest.page) : undefined; },
  };
}

module.exports = { repoSlug, compareVersions, pickAsset, findUpdate, download, freePath, createUpdater };
