# Appli Finance — contrat d'architecture

Document de référence pour les 4 agents. **Chaque agent ne modifie QUE ses fichiers.**
Si un besoin sort de votre périmètre, notez-le dans votre rapport final au lieu de toucher le fichier d'un autre.

## Principe

Même philosophie que l'appli « Track Record » (Desktop\Trading\Track Record Logiciel) :
HTML/CSS/JS **vanilla**, aucune dépendance front, aucun build. Thème sombre bleu nuit, accent doré,
chiffres en police monospace. L'appli tourne :

- **PC** : dans Electron (`main.js`), données dans `Documents\Appli Finance\donnees-finances.json` (+ `.bak.json`).
- **Téléphone** : en **PWA** installable (manifest + service worker), données en `localStorage`.
- **Navigateur** : en ouvrant `index.html` directement (file://) → `localStorage`.
- **Plus tard** : synchro PC ↔ téléphone via un adaptateur cloud (Supabase). Le modèle de données est déjà prêt
  pour ça (ids uniques, `updatedAt`, tombstones de suppression).

Contraintes techniques :
- **Pas de modules ES** (`import`/`export`) : ils cassent en file://. Scripts classiques, tout passe par l'espace de noms global `window.FIN`.
- Chaque fichier JS est enveloppé dans une IIFE `(function(){ "use strict"; ... })();` et n'expose que ce que le contrat prévoit.
- Tout le texte de l'interface est **en français**. Montants en euros, format `fr-FR` (`12,50 €`).
- Doit fonctionner de **360 px** (téléphone) à grand écran. Cibles tactiles ≥ 40 px sur mobile.
- Aucune ressource externe (pas de CDN, pas de Google Fonts) : l'appli doit marcher hors ligne.

## Fichiers et propriétaires

| Fichier | Propriétaire |
|---|---|
| `index.html`, `css/base.css`, `js/util.js`, `CONTRAT.md` | Superviseur (Opus) — **ne pas modifier** |
| `js/store.js`, `tests/store.test.html` | **Agent 1 — Données** |
| `js/entry.js`, `css/entry.css` | **Agent 2 — Saisie** |
| `js/charts.js`, `js/views.js`, `css/views.css` | **Agent 3 — Visuels** |
| `js/app.js`, `css/shell.css`, `main.js`, `package.json`, `manifest.webmanifest`, `sw.js`, `icons/*`, `build/*`, `LISEZMOI.md`, `.gitignore` | **Agent 4 — Coque & plateformes** |

Ordre de chargement (déjà dans `index.html`) : `util.js` → `store.js` → `charts.js` → `views.js` → `entry.js` → `app.js`.

## Modèle de données (persisté tel quel en JSON)

```js
{
  version: 1,
  expenses: [{
    id: "e_lq3k9x_ab12",      // FIN.util.uid("e")
    date: "2026-10-24",       // clé de jour locale YYYY-MM-DD
    amount: 12.5,             // nombre > 0, en euros, arrondi au centime
    categoryId: "food",
    note: "Boulangerie",      // chaîne, peut être vide
    createdAt: 1761300000000, // ms
    updatedAt: 1761300000000  // ms — sert à la future synchro
  }],
  categories: [{
    id: "food", name: "Nourriture", icon: "🍽️", color: "#F2A65A",
    order: 0, archived: false, updatedAt: 0
  }],
  settings: { weekStart: 1, currency: "EUR", monthlyBudget: null, updatedAt: 0 },
  deleted: [{ id: "e_...", type: "expense", deletedAt: 1761300000000 }], // tombstones
  ui: { }   // libre, réservé à app.js (vue courante, zoom…) via store.getUI()/setUI()
}
```

Catégories par défaut (ids fixes) — définies dans `FIN.util.DEFAULT_CATEGORIES` :
food Nourriture · groceries Courses · fuel Essence · leisure Loisirs / Sorties · subs Abonnements ·
invest Investissement · gifts Cadeaux · home Logement · health Santé · transport Transport · other Autre.

## Utilitaires partagés — `FIN.util` (déjà écrit, `js/util.js`)

- `uid(prefix)` → id unique
- `MOIS`, `MOIS_COURT`, `JOURS` (index 0 = dimanche), `JOURS_COURT`
- `dayKey(date)` → `"YYYY-MM-DD"` ; `parseKey(key)` → `Date` à minuit local ; `todayKey()`
- `addDays(date, n)`, `startOfWeek(date, weekStart)`, `weekDays(date, weekStart)` → 7 `Date`
- `monthRange(year, month)` → `{ from: key, to: key, days: Date[] }`
- `monthGrid(year, month, weekStart)` → tableau de semaines (tableaux de 7 `Date`, débordement inclus)
- `isoWeek(date)` → numéro de semaine ISO
- `fmtEUR(n, {sign, decimals})` → `"12,50 €"` ; `fmtPct(x)` → `"34 %"` ; `parseAmount("12,5")` → `12.5` ou `null`
- `fmtDayLong(date)` → `"samedi 24 octobre 2026"` ; `fmtWeekLabel(date, weekStart)` ; `fmtMonthLabel(date)`
- `summarize(expenses, categories)` →
  `{ total, count, byCategory: [{ category, total, pct, count }] (trié décroissant, pct en 0..100), byDay: { "YYYY-MM-DD": total } }`
- `esc(str)` → échappement HTML
- `contrast(hex)` → `"#000"` ou `"#fff"` lisible sur cette couleur

## Bus d'événements — `FIN.bus` (dans `js/util.js`)

`FIN.bus.on(nom, fn)`, `FIN.bus.off(nom, fn)`, `FIN.bus.emit(nom, payload)`.

| Événement | Émis par | Payload | Écouté par |
|---|---|---|---|
| `data:change` | store | `{ reason }` | app (relance le rendu) |
| `nav:change` | app | `{ view, date }` | (info) |
| `goto` | views, entry | `{ view: "day"\|"week"\|"month", date: Date }` | app |
| `entry:open` | app, views | `{ date?: Date, expense?: objet }` (expense ⇒ mode édition) | entry |
| `categories:open` | app | — | entry |
| `toast` | tous | `{ text, undo?: fn }` | app (affiche le toast) |

## API de chaque module

### Agent 1 — `FIN.store` (`js/store.js`)
```
init(): Promise<void>                        // charge, migre, initialise les catégories par défaut
getExpenses({ from?, to?, categoryId? }) → Expense[]   // bornes incluses (clés YYYY-MM-DD), triées date desc puis createdAt desc
getExpense(id) → Expense | null
addExpense({ date, amount, categoryId, note }) → Expense      // valide, arrondit, émet data:change
updateExpense(id, patch) → Expense
deleteExpense(id) → Expense (l'objet supprimé, pour annuler)  // ajoute un tombstone
restoreExpense(expense) → Expense                              // annulation d'une suppression
getCategories({ includeArchived = false } = {}) → Category[]  // triées par order
getCategory(id) → Category | null   // renvoie aussi les archivées ; catégorie inconnue → null
addCategory({ name, icon, color }) → Category
updateCategory(id, patch) → Category
archiveCategory(id) / unarchiveCategory(id)   // jamais de suppression dure si des dépenses l'utilisent
reorderCategories(ids[])
getSettings() / setSettings(patch)
getUI() / setUI(patch)                         // état d'interface persisté (pas d'événement data:change)
exportJSON() → string ; importJSON(string, { mode: "replace" | "merge" }) → { added, updated }
exportCSV() → string   // séparateur ";", virgule décimale, BOM UTF-8 — ouvrable dans Excel FR
storageInfo() → { kind: "file" | "local", path?: string }
openDataFolder()       // Electron seulement (ipc "open-data-dir"), sinon no-op
```
Persistance via un **adaptateur** interchangeable (`FIN.store._adapter`) : `FileAdapter` (Electron, écriture atomique
tmp + rename, `.bak.json` une fois par session — même logique que Track Record), `LocalAdapter` (localStorage,
clé `appli-finance:v1`). Exposer `FIN.store.setAdapter(adapter)` pour brancher plus tard un `CloudAdapter`.
Sauvegarde **débouncée** (~250 ms) + flush sur `beforeunload`.
Détection Electron : `typeof process !== "undefined" && process.versions && process.versions.electron` ;
dossier de données via `require("electron").ipcRenderer.sendSync("get-data-dir")`.

### Agent 2 — `FIN.entry` (`js/entry.js`)
```
init()           // branche les écouteurs (entry:open, categories:open)
render(state)    // state = { view, date } ; dessine le formulaire + la liste du jour dans #view-day
open({ date?, expense? })   // ouvre la feuille de saisie (#sheet-entry) — utilisée sur mobile et depuis Semaine/Mois
```
Possède : `#entry-panel` (formulaire inline vue Jour), `#day-list`, `#sheet-entry`, `#modal-categories`.

### Agent 3 — `FIN.charts` + `FIN.views`
```
FIN.charts.donut(el, items, { centerLabel, centerValue, size })   // items = [{ label, value, color, icon }]
FIN.charts.bars(el, items, { highlightKey })                     // items = [{ key, label, value, color? }]
FIN.charts.legend(el, byCategory, { onClick })                    // liste catégorie / montant / % + barre
FIN.views.init()
FIN.views.render(state)   // state = { view, date, settings } — remplit #day-chart, #view-week, #view-month
```
Graphiques en **SVG pur** dessinés à la main (pas de librairie).

### Agent 4 — `FIN.app` (`js/app.js`)
```
FIN.app.state → { view, date }
FIN.app.go(view, date)
FIN.app.render()          // appelle FIN.views.render(state) et FIN.entry.render(state)
```
Possède : `header`, `#period-nav`, `#view-tabs`, `#tools`, `#bottom-nav`, `#fab-add`, `#toast`, `#banner`,
raccourcis clavier, zoom (Ctrl +/-/0 comme Track Record), enregistrement du service worker (seulement si
`location.protocol` est `http:` ou `https:`), boot : `await FIN.store.init(); FIN.entry.init(); FIN.views.init(); render()`.

## Extension v1.1 — Revenus et reste à vivre

Besoin : saisir le **salaire perçu** du mois et d'éventuelles **rentrées diverses** (prime, remboursement,
vente, aide…), et voir en permanence **combien il reste** sur l'argent rentré ce mois-ci (« reste à vivre »).

Modèle (ajouté au JSON persisté, même `version: 1`, champ absent ⇒ tableau vide) :
```js
incomes: [{
  id: "i_...",            // FIN.util.uid("i")
  date: "2026-10-01",     // jour de perception (YYYY-MM-DD)
  amount: 2100,           // > 0, arrondi au centime
  kind: "salary" | "other",
  label: "Salaire",       // texte libre ("Prime", "Vinted", "Remboursement CAF"…) ; défaut "Salaire" / "Autre rentrée"
  createdAt, updatedAt
}]
// tombstones : { id, type: "income", deletedAt }
```

Calcul (mois = mois de la date affichée `state.date`) :
`revenus = Σ incomes du mois` · `dépensé = Σ expenses du mois` · `reste à vivre = revenus − dépensé`.

### `FIN.store` — ajouts (Agent Données)
```
getIncomes({ from?, to?, kind? }) → Income[]   // bornes incluses, tri date desc puis createdAt desc
getIncome(id) → Income | null
addIncome({ date, amount, kind, label }) → Income   // valide comme addExpense, émet data:change
updateIncome(id, patch) → Income
deleteIncome(id) → Income ; restoreIncome(income) → Income   // tombstones type "income"
monthBalance(year, month) → { income, salary, other, spent, remaining, ratio }  // ratio = spent / income (null si income = 0)
```
`exportJSON`/`importJSON` (replace et merge) incluent `incomes` avec les mêmes règles que les dépenses.
`exportCSV` : ajoute une colonne `Type` en première position (`Dépense` / `Revenu`) ; pour un revenu, la colonne Catégorie
contient le libellé.

### `FIN.income` — nouveau module (Agent Revenus) : `js/income.js`, `css/income.css` (préfixe `in-`)
```
init()
render(state)        // state = { view, date } ; remplit #money-strip
open({ kind?, income? })   // ouvre #modal-income (ajout ou édition)
```
Événement bus ajouté : `income:open` `{ kind?, income? }` → écouté par income.

## Extension v1.2 — Synchro cloud + mises à jour proposées

**Anonymat obligatoire** : aucun prénom, nom, email ou chemin personnel (`C:\Users\…`) dans le code, les commentaires,
`package.json`, les fichiers publiés, l'appId (`com.applifinance.app`) ou les messages. Le dépôt GitHub sera public.

### Configuration publique — `js/config.js` (superviseur)
`window.FIN_CONFIG = { supabaseUrl, supabaseAnonKey, githubRepo }`. Vide ⇒ synchro désactivée proprement
(l'appli marche 100 % en local comme avant). `window.FIN_VERSION` (`js/version.js`) = version courante.

### Base Supabase (une seule table, accès REST direct par `fetch`, AUCUNE librairie)
```sql
create table public.items (
  user_id    uuid   not null default auth.uid() references auth.users on delete cascade,
  id         text   not null,                     -- id de l'objet ("e_…", "i_…", "food", "settings")
  type       text   not null check (type in ('expense','income','category','settings')),
  data       jsonb,                                -- objet complet ; null si supprimé
  deleted    boolean not null default false,
  updated_at bigint not null,                      -- ms client = updatedAt (ou deletedAt si supprimé)
  server_at  timestamptz not null default now(),  -- posé par trigger, sert de curseur de lecture
  primary key (user_id, id)
);
-- RLS : select / insert / update autorisés seulement si user_id = auth.uid() ; pas de delete.
-- Trigger BEFORE INSERT OR UPDATE : si UPDATE et new.updated_at < old.updated_at → return null (le plus récent gagne) ;
-- sinon new.server_at := clock_timestamp().  Index (user_id, server_at).
```
Endpoints : Auth `POST {url}/auth/v1/signup`, `POST {url}/auth/v1/token?grant_type=password`,
`POST {url}/auth/v1/token?grant_type=refresh_token`, `POST {url}/auth/v1/logout` ;
données `GET {url}/rest/v1/items?select=*&server_at=gt.{curseur}&order=server_at.asc&limit=1000`,
`POST {url}/rest/v1/items?on_conflict=user_id,id` avec `Prefer: resolution=merge-duplicates,return=minimal`.
En-têtes : `apikey: {anonKey}`, `Authorization: Bearer {access_token}`.

### `FIN.store` — ajouts (Agent Synchro)
```
syncRecords({ dirtyOnly }) → Record[]   // Record = { id, type, data, deleted, updated_at } ; tombstones inclus (deleted:true, data:null)
markSynced(records)                     // retire de la liste « à envoyer » les ids dont updated_at n'a pas bougé depuis
markAllDirty()                          // 1re connexion d'un appareil : tout renvoyer
applyRemote(records) → { applied }      // fusion « le plus récent updated_at gagne », tombstones respectés,
                                        // n'ajoute rien à la liste « à envoyer », émet UNE fois data:change { reason: "sync" }
getSyncState() / setSyncState(patch)    // { cursor, session, email, lastSyncAt } — persisté localement, JAMAIS exporté
```
Toute mutation locale (dépense, revenu, catégorie, réglages, suppression) ajoute l'id à la liste « à envoyer » (persistée).
`exportJSON` n'inclut ni la liste « à envoyer » ni l'état de synchro (jetons !). `settings` voyage sous l'id `"settings"`.

### `FIN.sync` — `js/sync.js` (Agent Synchro)
```
init()                       // reprend la session, lance une synchro, branche les déclencheurs
isConfigured() → bool
status() → { state: "off"|"signedout"|"idle"|"syncing"|"offline"|"error", email, lastSyncAt, error }
signUp(email, password) → Promise<{ needsConfirmation }>
signIn(email, password) → Promise<void>
signOut() → Promise<void>    // garde les données locales
syncNow() → Promise<void>
```
Déclencheurs : démarrage, connexion, 2 s après un `data:change` local (reason ≠ "sync"), toutes les 60 s quand
la page est visible, `online`, retour au premier plan. Rafraîchit le jeton avant expiration. Erreurs en français.
Émet `sync:status` (payload = status()) à chaque changement d'état.

### `FIN.account` — `js/account.js` + `FIN.update` — `js/update.js` + `css/sync.css` (Agent Interface, préfixe `sy-` / `up-`)
- `#sync-status` (petit indicateur ☁ à côté du titre : état + « il y a 2 min » ; clic → `account:open`).
- `#modal-account` (événement `account:open`) : non configuré → explication + lien vers GUIDE-SYNCHRO ;
  déconnecté → onglets Se connecter / Créer un compte (email + mot de passe, afficher/masquer) ;
  connecté → email, dernière synchro, « Synchroniser maintenant », « Se déconnecter », version de l'appli.
- `#update-banner` : bandeau fixe en haut « Nouvelle version X disponible » + bouton d'action.
  * **PWA** : `sw.js` (propriété de l'Agent Interface) ne fait plus `skipWaiting()` d'office ; il écoute le message
    `{ type: "SKIP_WAITING" }`. La page vérifie `registration.update()` au démarrage et au retour au premier plan ;
    nouveau worker « installed » + contrôleur existant ⇒ bandeau « Mettre à jour » ⇒ SKIP_WAITING ⇒ `controllerchange` ⇒ reload.
    `sw.js` contient une ligne `const VERSION = "x.y.z";` (réécrite par le script de version) et le cache s'appelle
    `"appli-finance-" + VERSION`. Répond au message `{ type: "GET_VERSION" }` (via MessageChannel).
  * **Electron** (IPC, `require("electron").ipcRenderer`) : main → renderer `update:available {version}`,
    `update:progress {percent}`, `update:downloaded {version}`, `update:error {message}` ;
    renderer → main `update:download`, `update:install`, `update:check`. Version portable : main envoie
    `update:available {version, portable: true}` ⇒ bouton « Télécharger » qui ouvre la page des versions GitHub.

### Plateforme (Agent Plateforme)
`main.js` + `package.json` (electron-updater, publication GitHub Releases), script `scripts/stamp-version.js`
(recopie la version de package.json dans `js/version.js` et `sw.js`), `publier.ps1` (tout en un), workflow
`.github/workflows/pages.yml` (version mobile sur GitHub Pages), `supabase/schema.sql`, `GUIDE-SYNCHRO.md`, `LISEZMOI.md`.

## Squelette DOM (`index.html`)

Les identifiants ci-dessous existent déjà ; chaque agent remplit **l'intérieur** des conteneurs qu'il possède.
Classe utilitaire `.is-active` sur la vue visible ; les autres vues ont l'attribut `hidden`.

## Style

Variables CSS dans `css/base.css` (`--ink`, `--panel`, `--rule`, `--fg`, `--fg-dim`, `--fg-faint`, `--accent`,
`--gain`, `--loss`, `--radius`, `--ui`, `--num`, `--gap`). Réutiliser les classes de base : `.btn`, `.btn-primary`,
`.btn-ghost`, `.panel`, `.panel-h`, `.panel-b`, `.eyebrow`, `.num`, `.field`, `.modal`, `.sheet`.
Préfixer les classes propres à un module : `en-` (saisie), `vw-` / `ch-` (visuels), `sh-` (coque).

## Objectif UX

« Compréhensible en un coup d'œil » : en ouvrant l'appli on voit immédiatement **combien on a dépensé**
(jour / semaine / mois) et **où part l'argent** (camembert + pourcentages par catégorie).
Ajouter une dépense doit prendre **moins de 5 secondes** : montant → catégorie (1 clic sur une pastille) → Entrée.
