# SimpleClient

Client de base de données épuré pour macOS (Electron) — PostgreSQL, MySQL/MariaDB et SQLite.
Plusieurs connexions, plusieurs bases, plusieurs tables, et **⌘K** pour sauter n'importe où.

## Lancer

```bash
npm install
npm start
```

Aucune compilation native : les drivers sont `pg`, `mysql2` et `sql.js` (SQLite en WebAssembly).

```bash
npm run lint     # ESLint
npm test         # tests unitaires (node:test), sans Electron
npm run check    # les deux — lancé par la CI sur chaque push / PR
```

## Raccourcis

| | |
|---|---|
| ⌘K (ou ⌘P) | Aller à… — toutes les tables de toutes les bases de toutes les connexions ouvertes, recherche floue (`crm deals` filtre aussi par connexion/base) |
| ⌘T | Nouvelle requête SQL (sur la connexion/base de l'onglet actif) |
| ⌘↵ | Exécuter la requête (ou seulement la sélection) |
| Ctrl+Espace | Autocomplétion SQL (s'ouvre aussi en tapant) |
| ⌘W | Fermer l'onglet |
| ⌘1…9 · ⌘⇧[ ⌘⇧] | Changer d'onglet |
| ⌘R | Rafraîchir la table / relancer la requête |
| ⌘F | Filtrer la table (clause `WHERE`, ↵ pour appliquer, esc pour effacer) |
| ⌘N | Nouvelle connexion |
| Flèches · ↵ · ⌘C | Naviguer dans la grille, voir la valeur complète (JSON indenté), copier la cellule |

Clic sur un en-tête de colonne : tri asc → desc → aucun.

## Autocomplétion SQL

Dans l'éditeur de requêtes : les colonnes des tables de la requête courante (`from` / `join`, avec leurs alias),
`alias.` → colonnes de cette table, les tables après `from` / `join`, `schema.` → tables du schéma, et les mots-clés.
↑↓ pour choisir, ↵ ou ⇥ pour insérer, esc pour fermer. Les identifiants sont quotés si besoin (`"createdAt"`).
Aussi dans la barre `WHERE` d'une table (⌘F) : colonnes de la table et mots-clés.
 Onglet *Structure* : colonnes, types, nullabilité, défauts, clés primaires et étrangères.

## Panneau latéral

- **Clé étrangère** (valeur soulignée) : un clic ouvre l'entité référencée dans un panneau à droite. Les clés étrangères de cette entité sont elles-mêmes cliquables (← pour revenir). Le bouton *colonnes* choisit les champs affichés — mémorisé par table. Le bouton ↗ ouvre la table filtrée sur cette ligne.
- **JSON** (colonnes `json`/`jsonb` ou valeurs `{…}`/`[…]`) : un clic affiche le JSON parsé en arbre repliable, avec copie du JSON indenté. Marche aussi dans les résultats de requêtes.
- **Valeur** : une fois ouvert, le panneau suit la cellule sélectionnée (clic ou flèches) : clé étrangère, JSON ou valeur complète.
- *Ouvrir dans un onglet* ouvre la table avec le filtre `WHERE` pré-rempli.
- `esc` ferme le panneau, son bord gauche se redimensionne.

## Détails

- Connexions enregistrées dans `~/Library/Application Support/SimpleClient/connections.json`, mots de passe chiffrés avec le trousseau macOS (`safeStorage`).
- Les connexions et onglets ouverts sont restaurés au relancement.
- Postgres : une base = un pool, les schémas autres que `public` apparaissent en `schema.table`.
- Les tables de toutes les bases sont indexées en arrière-plan à la connexion, pour ⌘K.
- SQLite : le fichier est rechargé en mémoire et réécrit après chaque requête qui modifie la base.

## Releases (DMG)

Chaque tag `v*` poussé déclenche `.github/workflows/release.yml` : build sur macOS, puis
`SimpleClient-<version>-arm64.dmg` et `SimpleClient-<version>-x64.dmg` attachés à une GitHub Release.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

En local : `npm run dist` (sur un Mac).

### Mises à jour

L'app installée interroge la dernière release GitHub au démarrage puis toutes les 6 h. Si elle est plus récente,
une fenêtre propose de télécharger le DMG de la bonne architecture (dans `~/Téléchargements`, avec progression)
puis de l'ouvrir ; on glisse la nouvelle version dans *Applications*. « Ignorer cette version » ne la repropose plus.
Pas de mise à jour automatique en place : elle exigerait une app signée. En dev, le contrôle est désactivé —
`SIMPLECLIENT_CHECK_UPDATES=1 npm start` pour l'essayer.

L'app n'est pas signée (pas de certificat Apple Developer) : au premier lancement, clic droit → *Ouvrir*,
ou `xattr -dr com.apple.quarantine /Applications/SimpleClient.app`.

## Structure

```
src/main/                     processus principal (CommonJS)
  main.js                     point d'entrée : câble store, drivers, IPC, fenêtre
  ipc.js                      handlers IPC ({ ok, data, ms } | { ok: false, error })
  preload.js                  pont sécurisé `window.api`
  window.js, menu.js
  updates.js                  vérification / téléchargement des releases GitHub
  connections/store.js        connexions enregistrées (JSON) ; cipher.js : trousseau macOS
  connections/registry.js     un driver ouvert par connexion
  drivers/                    interface commune : postgres.js, mysql.js, sqlite.js, common.js
src/renderer/                 vanilla JS en modules ES, pas de build
  index.html, styles/*.css
  js/main.js                  démarrage + restauration de session
  js/state.js, connections.js, meta.js, sidebar.js, tabs.js, grid.js, shortcuts.js
  js/views/                   onglet table, onglet requête
  js/panel/                   panneau latéral, arbre JSON
  js/editor/                  autocomplétion : sql-context.js (analyse), suggest.js (classement), autocomplete.js (UI)
  js/palette/                 ⌘K
  js/modals/                  connexion, cellule, mise à jour
  js/lib/                     helpers purs (format, html) et DOM
test/                         node:test — analyse SQL, suggestions, store, driver SQLite, mises à jour
```
