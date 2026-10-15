# Tablette

Client de base de données épuré pour macOS (Electron) — PostgreSQL, MySQL/MariaDB et SQLite.
Plusieurs connexions, plusieurs bases, plusieurs tables, et **⌘K** pour sauter n'importe où.

## Lancer

```bash
npm install
npm start
```

Aucune compilation native : les drivers sont `pg`, `mysql2` et `sql.js` (SQLite en WebAssembly).

## Raccourcis

| | |
|---|---|
| ⌘K (ou ⌘P) | Aller à… — toutes les tables de toutes les bases de toutes les connexions ouvertes, recherche floue (`crm deals` filtre aussi par connexion/base) |
| ⌘T | Nouvelle requête SQL (sur la connexion/base de l'onglet actif) |
| ⌘↵ | Exécuter la requête (ou seulement la sélection) |
| ⌘W | Fermer l'onglet |
| ⌘1…9 · ⌘⇧[ ⌘⇧] | Changer d'onglet |
| ⌘R | Rafraîchir la table / relancer la requête |
| ⌘F | Filtrer la table (clause `WHERE`, ↵ pour appliquer, esc pour effacer) |
| ⌘N | Nouvelle connexion |
| Flèches · ↵ · ⌘C | Naviguer dans la grille, voir la valeur complète (JSON indenté), copier la cellule |

Clic sur un en-tête de colonne : tri asc → desc → aucun. Onglet *Structure* : colonnes, types, nullabilité, défauts, clés primaires et étrangères.

## Panneau latéral

- **Clé étrangère** (valeur soulignée) : un clic ouvre l'entité référencée dans un panneau à droite. Les clés étrangères de cette entité sont elles-mêmes cliquables (← pour revenir). Le bouton *colonnes* choisit les champs affichés — mémorisé par table. Le bouton ↗ ouvre la table filtrée sur cette ligne.
- **JSON** (colonnes `json`/`jsonb` ou valeurs `{…}`/`[…]`) : un clic affiche le JSON parsé en arbre repliable, avec copie du JSON indenté. Marche aussi dans les résultats de requêtes.
- `esc` ferme le panneau, son bord gauche se redimensionne.

## Détails

- Connexions enregistrées dans `~/Library/Application Support/tablette/connections.json`, mots de passe chiffrés avec le trousseau macOS (`safeStorage`).
- Les connexions et onglets ouverts sont restaurés au relancement.
- Postgres : une base = un pool, les schémas autres que `public` apparaissent en `schema.table`.
- Les tables de toutes les bases sont indexées en arrière-plan à la connexion, pour ⌘K.
- SQLite : le fichier est rechargé en mémoire et réécrit après chaque requête qui modifie la base.

## Releases (DMG)

Chaque tag `v*` poussé déclenche `.github/workflows/release.yml` : build sur macOS, puis
`Tablette-<version>-arm64.dmg` et `Tablette-<version>-x64.dmg` attachés à une GitHub Release.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

En local : `npm run dist` (sur un Mac).

L'app n'est pas signée (pas de certificat Apple Developer) : au premier lancement, clic droit → *Ouvrir*,
ou `xattr -dr com.apple.quarantine /Applications/Tablette.app`.

## Structure

```
src/main/main.js      fenêtre, IPC, connexions enregistrées
src/main/drivers.js   interface commune Postgres / MySQL / SQLite
src/main/preload.js   pont sécurisé vers le renderer
src/renderer/         index.html, styles.css, app.js (vanilla JS, pas de build)
```
