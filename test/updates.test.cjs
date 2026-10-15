const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compareVersions, createUpdater, findUpdate, freePath, pickAsset, repoSlug } = require('../src/main/updates');

const release = (tag, extra = {}) => ({
  tag_name: tag, body: 'notes', html_url: `https://github.com/o/r/releases/tag/${tag}`, published_at: '2026-10-01T00:00:00Z',
  assets: [
    { name: `SimpleClient-${tag.slice(1)}-arm64.dmg`, browser_download_url: 'https://example.test/arm64.dmg', size: 10 },
    { name: `SimpleClient-${tag.slice(1)}-x64.dmg`, browser_download_url: 'https://example.test/x64.dmg', size: 11 },
  ],
  ...extra,
});
const fakeFetch = (status, json) => async () => ({ status, ok: status < 400, json: async () => json });

test('compareVersions', () => {
  assert.equal(compareVersions('v0.2.0', '0.1.9'), 1);
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('v1.0.0-beta', '1.0.1'), -1);
});

test('repoSlug / pickAsset', () => {
  assert.equal(repoSlug({ repository: { url: 'https://github.com/HugoKovac/SimpleClient.git' } }), 'HugoKovac/SimpleClient');
  assert.equal(repoSlug({ repository: 'git@github.com:a/b.git' }), 'a/b');
  assert.equal(pickAsset(release('v1.0.0').assets, 'x64').size, 11);
  assert.equal(pickAsset([], 'arm64'), null);
});

test('findUpdate: newer release with the asset of this CPU', async () => {
  const u = await findUpdate({ repo: 'o/r', currentVersion: '0.1.0', arch: 'arm64', platform: 'darwin', fetch: fakeFetch(200, release('v0.2.0')) });
  assert.equal(u.version, '0.2.0');
  assert.equal(u.asset.url, 'https://example.test/arm64.dmg');
});

test('findUpdate: null when up to date, prerelease or no release', async () => {
  const base = { repo: 'o/r', currentVersion: '0.2.0', arch: 'arm64', platform: 'darwin' };
  assert.equal(await findUpdate({ ...base, fetch: fakeFetch(200, release('v0.2.0')) }), null);
  assert.equal(await findUpdate({ ...base, fetch: fakeFetch(200, release('v0.3.0', { prerelease: true })) }), null);
  assert.equal(await findUpdate({ ...base, fetch: fakeFetch(404, {}) }), null);
  await assert.rejects(findUpdate({ ...base, fetch: fakeFetch(500, {}) }), /HTTP 500/);
});

test('findUpdate: no installer outside macOS', async () => {
  const u = await findUpdate({ repo: 'o/r', currentVersion: '0.1.0', arch: 'x64', platform: 'linux', fetch: fakeFetch(200, release('v0.2.0')) });
  assert.equal(u.asset, null);
});

test('freePath does not overwrite an existing download', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
  fs.writeFileSync(path.join(dir, 'a.dmg'), '');
  assert.equal(freePath(dir, 'a.dmg'), path.join(dir, 'a (1).dmg'));
  assert.equal(freePath(dir, 'b.dmg'), path.join(dir, 'b.dmg'));
});

test('createUpdater: check, download with progress, install', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
  const payload = Buffer.alloc(300_000, 7);
  const fetch = async (url) => {
    if (url.includes('api.github.com')) return { status: 200, ok: true, json: async () => release('v9.0.0') };
    return { status: 200, ok: true, headers: new Headers({ 'content-length': String(payload.length) }), body: new Blob([payload]).stream() };
  };
  const opened = [];
  const u = createUpdater({
    repo: 'o/r', currentVersion: '1.0.0', arch: 'x64', platform: 'darwin', enabled: true, fetch,
    downloadsDir: () => dir, openPath: async (p) => { opened.push(p); return ''; }, openExternal: async () => {},
  });
  const info = await u.check();
  assert.deepEqual([info.version, info.current, info.downloadable], ['9.0.0', '1.0.0', true]);
  const progress = [];
  const file = await u.download((p) => progress.push(p));
  assert.equal(path.basename(file), 'SimpleClient-9.0.0-x64.dmg');
  assert.equal(fs.statSync(file).size, payload.length);
  assert.deepEqual(progress.at(-1), { received: payload.length, total: payload.length });
  await u.install();
  assert.deepEqual(opened, [file]);
});

test('createUpdater: disabled in development', async () => {
  const u = createUpdater({ repo: 'o/r', currentVersion: '1.0.0', enabled: false, fetch: () => assert.fail('no network') });
  assert.equal(await u.check(), null);
});
