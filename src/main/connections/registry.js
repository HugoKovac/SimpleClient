'use strict';
// Open drivers, one per saved connection. The connecting promise is cached so parallel
// calls share one driver; a failed connection is forgotten so the next call retries.

class DriverRegistry {
  /**
   * @param {(id: string) => object | null} resolveConfig full config of a saved connection
   * @param {(cfg: object) => object} makeDriver
   */
  constructor(resolveConfig, makeDriver) {
    this.resolveConfig = resolveConfig;
    this.makeDriver = makeDriver;
    this.drivers = new Map(); // connection id -> Promise<driver>
  }

  get(id) {
    if (this.drivers.has(id)) return this.drivers.get(id);
    const p = (async () => {
      const cfg = this.resolveConfig(id);
      if (!cfg) throw new Error('Connexion introuvable');
      const d = this.makeDriver(cfg);
      await d.test();
      return d;
    })();
    this.drivers.set(id, p);
    p.catch(() => { if (this.drivers.get(id) === p) this.drivers.delete(id); });
    return p;
  }

  async drop(id) {
    const p = this.drivers.get(id);
    this.drivers.delete(id);
    if (p) { try { await (await p).close(); } catch { /* already broken */ } }
  }

  dropAll() { return Promise.all([...this.drivers.keys()].map((id) => this.drop(id))); }
}

module.exports = { DriverRegistry };
