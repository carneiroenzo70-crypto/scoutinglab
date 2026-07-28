# Comptes coach (couche `org`) — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** permettre à plusieurs coachs d'une même structure d'avoir chacun leur compte,
tout en voyant et modifiant les mêmes données.

**Architecture :** un seul champ `org` ajouté à l'enregistrement utilisateur et au token de
session. Toutes les clés de données passent de `<compte>` à `<org>`. Un compte sans `org`
retombe sur son propre nom d'utilisateur — les comptes existants restent donc leur propre
organisation et **aucune migration de données n'est nécessaire**.

**Pile technique :** fonctions serverless Vercel, zéro dépendance npm (`crypto` natif +
`fetch`), Upstash Redis via REST, tests avec le runner intégré de Node.

**Spec de référence :** `docs/superpowers/specs/2026-07-28-salle-draft-collaborative-design.md` § 6

---

## Pourquoi le repli est critique

Les tokens de session sont signés et valables **jusqu'à 30 jours**. Ceux déjà émis ne
contiennent pas `org`. Si le serveur lisait `payload.org` sans repli, tous les utilisateurs
connectés perdraient l'accès à leurs données du jour au lendemain. Le repli
`payload.org || payload.u` n'est pas une commodité : c'est ce qui rend le déploiement sûr.

---

## Structure des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `api/_auth.js` | helpers `orgOfUser` / `orgOfToken` | modifier |
| `api/login.js` | met `org` dans le token émis | modifier |
| `api/session.js` | `ingestKey` calculé sur l'organisation | modifier |
| `api/store.js` | données scopées par organisation | modifier |
| `api/snapshots.js` | snapshots scopés par organisation | modifier |
| `api/roster-track.js` | registre de suivi scopé par organisation | modifier |
| `api/candidates.js` | candidatures scopées par organisation | modifier |
| `api/admin-users.js` | création/lecture de comptes avec `org` | modifier |
| `admin.html` | champ « Structure » + colonne dans la liste | modifier |
| `app.html` | `vsOrg()` + cache local estampillé par organisation | modifier |
| `test/org.test.js` | tests de la couche organisation | **créer** |
| `test/store.test.js` | tests de partage et de repli | modifier |

`api/cron-snapshot.js` **n'est pas modifié** : il lit les comptes depuis le set
`vs_track_users`, qui contiendra désormais des organisations écrites par `roster-track.js`.
La cohérence est automatique.

---

### Task 1 : helpers `orgOfUser` / `orgOfToken`

**Fichiers :**
- Modifier : `api/_auth.js`
- Test : `test/org.test.js` (créer)

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `test/org.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { orgOfUser, orgOfToken } = require('../api/_auth');

test('orgOfUser : repli sur le nom de compte quand org est absent', () => {
  assert.equal(orgOfUser({ username: 'galions' }), 'galions');
});

test('orgOfUser : renvoie org quand il est présent', () => {
  assert.equal(orgOfUser({ username: 'alan', org: 'galions' }), 'galions');
});

test('orgOfToken : repli sur u pour les tokens émis avant la migration', () => {
  assert.equal(orgOfToken({ u: 'galions' }), 'galions');
});

test('orgOfToken : renvoie org quand il est présent', () => {
  assert.equal(orgOfToken({ u: 'alan', org: 'galions' }), 'galions');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/org.test.js"
```

Attendu : ÉCHEC — `orgOfUser is not a function`.

- [ ] **Étape 3 : implémenter**

Dans `api/_auth.js`, juste après la fonction `ingestKey`, ajouter :

```js
// ── Organisation (structure cliente) d'un compte ───────────
// Plusieurs comptes coach peuvent partager la même organisation : ce sont eux qui
// voient et modifient les mêmes données. Le repli sur le nom de compte fait que les
// comptes créés AVANT l'ajout de `org` sont leur propre organisation — leurs clés de
// données ne changent donc pas et aucune migration n'est nécessaire.
// Le repli côté token est indispensable : les tokens déjà émis (valables 30 jours)
// ne contiennent pas `org`, et sans lui leurs porteurs perdraient l'accès à leurs données.
function orgOfUser(user) { return (user && user.org) || (user && user.username) || null; }
function orgOfToken(payload) { return (payload && payload.org) || (payload && payload.u) || null; }
```

Puis modifier la dernière ligne du fichier :

```js
module.exports = { hashPassword, verifyPassword, signToken, verifyToken, getBearer, upstash, ingestKey, orgOfUser, orgOfToken };
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/org.test.js"
```

Attendu : 4 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add api/_auth.js test/org.test.js
git commit -m "Ajoute les helpers d'organisation (org) avec repli sur le compte"
```

---

### Task 2 : le token de connexion porte l'organisation

**Fichiers :**
- Modifier : `api/login.js`
- Test : `test/org.test.js`

- [ ] **Étape 1 : écrire le test qui échoue**

Ajouter à la fin de `test/org.test.js` :

```js
const { hashPassword, signToken, verifyToken } = require('../api/_auth');
const loginHandler = require('../api/login');

function mockRes() {
  return {
    _status: 0, _json: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; }, end() { return this; }
  };
}

// Faux Upstash en mémoire, piloté via global.fetch (comme _auth.upstash).
function mockUpstash(store) {
  global.fetch = async (_url, opts) => {
    const cmd = JSON.parse(opts.body);
    const op = cmd[0], key = cmd[1], val = cmd[2];
    let result = null;
    if (op === 'GET') result = store[key] != null ? store[key] : null;
    else if (op === 'SET') { store[key] = val; result = 'OK'; }
    else if (op === 'DEL') { delete store[key]; result = 1; }
    else if (op === 'INCR') { store[key] = String((+store[key] || 0) + 1); result = +store[key]; }
    else if (op === 'EXPIRE') result = 1;
    else if (op === 'SADD') result = 1;
    else if (op === 'SMEMBERS') result = [];
    else if (op === 'MGET') result = cmd.slice(1).map(k => (store[k] != null ? store[k] : null));
    else if (op === 'LPUSH') { (store[key] = store[key] || []).unshift(val); result = store[key].length; }
    else if (op === 'LRANGE') result = store[key] || [];
    return { ok: true, json: async () => ({ result }) };
  };
}

test('le token de connexion porte l\'organisation du compte coach', async () => {
  const store = {};
  mockUpstash(store);
  const { salt, hash } = hashPassword('motdepasse123');
  store['vs_user:alan'] = JSON.stringify({
    username: 'alan', label: 'Alan', plan: 'elite', org: 'galions', salt, hash, active: true
  });

  const res = mockRes();
  await loginHandler(
    { method: 'POST', headers: {}, socket: {}, body: { username: 'alan', password: 'motdepasse123' } },
    res
  );

  assert.equal(res._status, 200);
  const payload = verifyToken(res._json.token);
  assert.equal(payload.u, 'alan', 'le compte reste celui du coach');
  assert.equal(payload.org, 'galions', 'l\'organisation doit être dans le token');
});

test('un compte sans org devient sa propre organisation dans le token', async () => {
  const store = {};
  mockUpstash(store);
  const { salt, hash } = hashPassword('motdepasse123');
  store['vs_user:acme'] = JSON.stringify({ username: 'acme', plan: 'elite', salt, hash, active: true });

  const res = mockRes();
  await loginHandler(
    { method: 'POST', headers: {}, socket: {}, body: { username: 'acme', password: 'motdepasse123' } },
    res
  );

  const payload = verifyToken(res._json.token);
  assert.equal(payload.org, 'acme');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/org.test.js"
```

Attendu : ÉCHEC — `payload.org` vaut `undefined`.

- [ ] **Étape 3 : implémenter**

Dans `api/login.js`, remplacer la première ligne d'import :

```js
const { verifyPassword, signToken, upstash, orgOfUser } = require('./_auth');
```

Puis remplacer les trois dernières lignes du handler :

```js
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24; // 30 jours ou 1 jour
  const plan = user.plan || 'elite';
  const org = orgOfUser(user);
  const token = signToken({ u: username, org, label: user.label || username, plan }, maxAge);
  return res.status(200).json({ token, username, org, label: user.label || username, plan, expiresIn: maxAge });
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/org.test.js"
```

Attendu : 6 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add api/login.js test/org.test.js
git commit -m "Le token de connexion porte desormais l'organisation du compte"
```

---

### Task 3 : `api/store.js` scopé par organisation

**Fichiers :**
- Modifier : `api/store.js:16-18`
- Test : `test/store.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/store.test.js` :

```js
test('deux comptes de la MÊME structure partagent les données', async () => {
  const store = {};
  mockUpstash(store);
  const tEnzo = signToken({ u: 'galions', org: 'galions' }, 3600);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tEnzo }, body: { domain: 'seasons', data: ['draft'] } }, mockRes());

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tAlan }, query: { domains: 'seasons' } }, res);
  assert.deepEqual(res._json.seasons, ['draft'], 'Alan doit voir les donnees de sa structure');
});

test('deux structures differentes restent isolees', async () => {
  const store = {};
  mockUpstash(store);
  const tGalions = signToken({ u: 'alan', org: 'galions' }, 3600);
  const tAutre = signToken({ u: 'bob', org: 'autre-club' }, 3600);

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tGalions }, body: { domain: 'seasons', data: ['secret'] } }, mockRes());

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tAutre }, query: { domains: 'seasons' } }, res);
  assert.equal(res._json.seasons, null, 'une autre structure ne doit rien voir');
});

test('un ancien token sans org reste rattache a son propre compte', async () => {
  const store = {};
  mockUpstash(store);
  const ancien = signToken({ u: 'acme' }, 3600);   // token emis avant la migration

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + ancien }, body: { domain: 'crm', data: [1] } }, mockRes());
  assert.ok(store['vs_data:acme:crm'], 'la cle doit rester vs_data:acme:crm');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/store.test.js"
```

Attendu : ÉCHEC sur « deux comptes de la MÊME structure partagent les données » —
Alan lit `vs_data:alan:seasons` au lieu de `vs_data:galions:seasons`.

- [ ] **Étape 3 : implémenter**

Dans `api/store.js`, remplacer la ligne d'import :

```js
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');
```

Puis remplacer la ligne `const u = payload.u;` par :

```js
  // Les données appartiennent à la STRUCTURE, pas au compte : tous les coachs
  // d'une même organisation voient et modifient le même jeu de données.
  const u = orgOfToken(payload);
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/store.test.js"
```

Attendu : 7 tests passent (4 existants + 3 nouveaux).

- [ ] **Étape 5 : commit**

```bash
git add api/store.js test/store.test.js
git commit -m "Les donnees de l'app sont scopees par structure, plus par compte"
```

---

### Task 4 : `snapshots.js` et `roster-track.js` scopés par organisation

**Fichiers :**
- Modifier : `api/snapshots.js:5,23`
- Modifier : `api/roster-track.js:3,14`
- Test : `test/org.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/org.test.js` :

```js
const snapshotsHandler = require('../api/snapshots');
const trackHandler = require('../api/roster-track');

test('les snapshots de roster sont partages au sein d\'une structure', async () => {
  const store = {};
  mockUpstash(store);
  const tEnzo = signToken({ u: 'galions', org: 'galions' }, 3600);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);

  await snapshotsHandler({
    method: 'POST', headers: { authorization: 'Bearer ' + tEnzo }, query: {},
    body: { rosterId: 'r1', snapshot: { date: '2026-07-28T10:00:00Z', players: [{ role: 'Top', pseudo: 'X' }] } }
  }, mockRes());

  assert.ok(store['vs_snaps:galions:r1'], 'la cle doit porter la structure');

  const res = mockRes();
  await snapshotsHandler({ method: 'GET', headers: { authorization: 'Bearer ' + tAlan }, query: { roster: 'r1' } }, res);
  assert.equal(res._json.length, 1, 'Alan doit voir le snapshot de sa structure');
});

test('roster-track enregistre le suivi sous la structure', async () => {
  const store = {};
  mockUpstash(store);
  const tAlan = signToken({ u: 'alan', org: 'galions' }, 3600);

  const res = mockRes();
  await trackHandler({
    method: 'POST', headers: { authorization: 'Bearer ' + tAlan },
    body: { rosters: [{ rosterId: 'r1', name: 'Titulaires', players: [{ pseudo: 'Canna', tag: 'EUW' }] }] }
  }, res);

  assert.equal(res._status, 200);
  assert.ok(store['vs_track:galions'], 'doit etre enregistre sous la structure, pas sous le coach');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/org.test.js"
```

Attendu : ÉCHEC — les clés créées sont `vs_snaps:galions:r1` absente et `vs_track:alan`.

- [ ] **Étape 3 : implémenter**

Dans `api/snapshots.js`, ligne d'import :

```js
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');
```

et remplacer `const u = payload.u;` par :

```js
  const u = orgOfToken(payload);   // les snapshots appartiennent à la structure
```

Dans `api/roster-track.js`, ligne d'import :

```js
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');
```

et remplacer `const u = payload.u;` par :

```js
  const u = orgOfToken(payload);   // le cron suit les rosters d'une structure
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/org.test.js"
```

Attendu : 8 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add api/snapshots.js api/roster-track.js test/org.test.js
git commit -m "Snapshots et suivi de roster scopes par structure"
```

---

### Task 5 : candidatures et lien d'ingestion par organisation

**Fichiers :**
- Modifier : `api/session.js:4,34-37`
- Modifier : `api/candidates.js:6,62`
- Test : `test/org.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/org.test.js` :

```js
const sessionHandler = require('../api/session');
const candidatesHandler = require('../api/candidates');

test('tous les coachs d\'une structure partagent le meme lien de candidatures', async () => {
  const store = {};
  mockUpstash(store);
  store['vs_user:alan'] = JSON.stringify({ username: 'alan', org: 'galions', plan: 'elite', label: 'Alan', active: true });
  store['vs_user:galions'] = JSON.stringify({ username: 'galions', plan: 'elite', label: 'Galions', active: true });

  const rAlan = mockRes();
  await sessionHandler({ method: 'GET', headers: { authorization: 'Bearer ' + signToken({ u: 'alan', org: 'galions' }, 3600) } }, rAlan);

  const rGal = mockRes();
  await sessionHandler({ method: 'GET', headers: { authorization: 'Bearer ' + signToken({ u: 'galions', org: 'galions' }, 3600) } }, rGal);

  assert.equal(rAlan._json.ingestKey, rGal._json.ingestKey, 'meme structure = meme lien');
  assert.equal(store['vs_ingest:' + rAlan._json.ingestKey], 'galions', 'la correspondance pointe vers la structure');
});

test('les candidatures listees sont celles de la structure', async () => {
  const store = {};
  mockUpstash(store);
  store['vs_candidates:galions'] = [JSON.stringify({ id: '1', pseudo: 'Zoelys' })];

  const res = mockRes();
  await candidatesHandler({
    method: 'GET', headers: { authorization: 'Bearer ' + signToken({ u: 'alan', org: 'galions' }, 3600) }, query: {}
  }, res);

  assert.equal(res._json.length, 1);
  assert.equal(res._json[0].pseudo, 'Zoelys', 'Alan doit voir les candidatures de sa structure');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/org.test.js"
```

Attendu : ÉCHEC — les deux `ingestKey` diffèrent, et la liste de candidatures est vide.

- [ ] **Étape 3 : implémenter**

Dans `api/session.js`, ligne d'import :

```js
const { verifyToken, getBearer, upstash, ingestKey, orgOfUser } = require('./_auth');
```

Puis remplacer le bloc de fin (à partir du commentaire « Garantit la correspondance ») :

```js
  // Garantit la correspondance code d'ingestion → STRUCTURE (idempotent). Le lien est
  // celui de la structure : tous ses coachs voient et partagent le même formulaire.
  const org = orgOfUser(user);
  const ik = ingestKey(org);
  try { await upstash(['SET', 'vs_ingest:' + ik, org]); } catch (_) { /* non bloquant */ }

  return res.status(200).json({ ok: true, plan: user.plan || payload.plan, label: user.label || payload.label, org, ingestKey: ik });
```

Dans `api/candidates.js`, ligne d'import :

```js
const { verifyToken, getBearer, upstash, orgOfToken } = require('./_auth');
```

Puis, dans la branche `GET`, remplacer la ligne du `LRANGE` :

```js
      const r = await upstash(['LRANGE', 'vs_candidates:' + orgOfToken(payload), '0', '-1']);
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/org.test.js"
```

Attendu : 10 tests passent.

- [ ] **Étape 5 : lancer TOUTE la suite (non-régression)**

```bash
node --test "test/*.test.js"
```

Attendu : tous les tests passent, y compris les 14 préexistants.

- [ ] **Étape 6 : commit**

```bash
git add api/session.js api/candidates.js test/org.test.js
git commit -m "Candidatures et lien d'ingestion rattaches a la structure"
```

---

### Task 6 : création de comptes coach via `admin-users`

**Fichiers :**
- Modifier : `api/admin-users.js:38,55-64`
- Test : `test/org.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/org.test.js` :

```js
const adminHandler = require('../api/admin-users');

test('creation d\'un compte coach rattache a une structure', async () => {
  process.env.ADMIN_SECRET = 'admin-secret';
  const store = {};
  mockUpstash(store);

  const res = mockRes();
  await adminHandler({
    method: 'POST', headers: { 'x-admin-secret': 'admin-secret' },
    body: { username: 'alan', password: 'motdepasse123', label: 'Alan', plan: 'elite', org: 'galions' }
  }, res);

  assert.equal(res._status, 200);
  const rec = JSON.parse(store['vs_user:alan']);
  assert.equal(rec.org, 'galions');
});

test('sans org, le compte est sa propre structure', async () => {
  process.env.ADMIN_SECRET = 'admin-secret';
  const store = {};
  mockUpstash(store);

  await adminHandler({
    method: 'POST', headers: { 'x-admin-secret': 'admin-secret' },
    body: { username: 'acme', password: 'motdepasse123', plan: 'pro' }
  }, mockRes());

  const rec = JSON.parse(store['vs_user:acme']);
  assert.equal(rec.org, 'acme');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/org.test.js"
```

Attendu : ÉCHEC — `rec.org` vaut `undefined`.

- [ ] **Étape 3 : implémenter**

Dans `api/admin-users.js`, branche `POST`, après la ligne qui valide le plan, ajouter la
lecture de `org` puis inclure le champ dans l'enregistrement :

```js
      // Rattachement à une structure. Vide → le compte est sa propre structure,
      // ce qui préserve le comportement de tous les comptes existants.
      const org = ((body && body.org) || '').trim().toLowerCase() || username;

      const { salt, hash } = hashPassword(password);
      const user = { username, label: label || username, plan, org, salt, hash, active: true, createdAt: new Date().toISOString() };
      await upstash(['SET', 'vs_user:' + username, JSON.stringify(user)]);
      await upstash(['SADD', 'vs_users', username]);
      return res.status(200).json({ success: true, username, label: user.label, plan: user.plan, org, active: true });
```

Dans la branche `GET`, exposer `org` dans la liste — remplacer le bloc `users.push({...})`
du cas nominal par :

```js
            users.push({
              username: rec.username || u,
              label: rec.label || u,
              plan: rec.plan || 'elite',
              org: rec.org || rec.username || u,
              active: rec.active !== false,           // active absent = actif
              createdAt: rec.createdAt || null,
              deactivatedAt: rec.deactivatedAt || null
            });
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/org.test.js"
```

Attendu : 12 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add api/admin-users.js test/org.test.js
git commit -m "admin-users : creation de comptes coach rattaches a une structure"
```

---

### Task 7 : champ « Structure » dans la page /admin

**Fichiers :**
- Modifier : `admin.html:83-86` (formulaire), `admin.html:145-147` (tableau), `admin.html:161-168` (envoi)

Aucun test automatisé (page HTML statique) — vérification manuelle à l'étape 4.

- [ ] **Étape 1 : ajouter le champ au formulaire**

Dans `admin.html`, après le `<div>` du champ « Offre », ajouter :

```html
        <div><label>Structure</label><input id="n-org" placeholder="vide = compte autonome"></div>
```

- [ ] **Étape 2 : envoyer `org` à l'API**

Remplacer la lecture des champs et l'appel `fetch` :

```js
  var username=document.getElementById('n-user').value.trim().toLowerCase();
  var label=document.getElementById('n-label').value.trim();
  var org=document.getElementById('n-org').value.trim().toLowerCase();
  var plan=document.getElementById('n-plan').value;
```

puis, dans le `fetch` de création :

```js
    var res=await fetch('/api/admin-users',{ method:'POST', headers:H(), body:JSON.stringify({username,label,password,plan,org}) });
```

et, dans le bloc de succès, vider aussi le nouveau champ :

```js
    if(res.ok){ setMsg('Compte « '+username+' » créé.',true); document.getElementById('n-user').value=''; document.getElementById('n-label').value=''; document.getElementById('n-pass').value=''; document.getElementById('n-org').value=''; loadUsers(); }
```

- [ ] **Étape 3 : afficher la structure dans la liste**

Dans la fonction de rendu du tableau, ajouter une cellule après celle de l'offre :

```js
      '<td class="muted" style="font-family:monospace">'+esc(u.org||u.username)+'</td>'+
```

Ajouter l'en-tête correspondant dans le `<thead>` du tableau, juste après la colonne
« Offre » :

```html
        <th>Structure</th>
```

- [ ] **Étape 4 : vérifier manuellement**

```bash
python -m http.server 8777
```

Ouvrir `http://localhost:8777/admin.html`. Attendu : le formulaire affiche un champ
« Structure », et le tableau une colonne « Structure ». La page ne peut pas lister de
comptes en local (pas d'API) — vérifier uniquement que la structure HTML est correcte et
qu'aucune erreur n'apparaît dans la console.

- [ ] **Étape 5 : commit**

```bash
git add admin.html
git commit -m "Page admin : champ et colonne Structure pour les comptes coach"
```

---

### Task 8 : cache local estampillé par structure

**Contexte :** `vsStore.loadAll()` purge le cache local si un **autre compte** se connecte sur
le même navigateur. Sans cette tâche, deux coachs de la même structure qui se relaient sur un
même poste videraient le cache l'un de l'autre à chaque bascule — alors qu'ils partagent
exactement les mêmes données. On estampille donc le cache avec la **structure**.

**Fichiers :**
- Modifier : `app.html:38` (ajout de `vsOrg`), `app.html:92` (usage dans `loadAll`)

- [ ] **Étape 1 : ajouter le helper `vsOrg`**

Dans `app.html`, juste après la fonction `vsAccount()`, ajouter :

```js
// Structure propriétaire des données. Repli sur le compte pour les tokens émis
// avant l'ajout de `org` — sinon leurs porteurs verraient un cache « étranger ».
function vsOrg(){ try{ var s=vsToken().split('.')[0].replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; var p=JSON.parse(atob(s)); return p.org||p.u||''; }catch(_){ return ''; } }
```

- [ ] **Étape 2 : estampiller le cache sur la structure**

Dans `vsStore.loadAll()`, remplacer :

```js
    const me = vsAccount();
```

par :

```js
    const me = vsOrg();   // le cache appartient à la structure, pas au coach
```

- [ ] **Étape 3 : vérifier dans le navigateur**

Démarrer le serveur local puis, dans la console de la page `app.html?demo=1` :

```js
JSON.stringify({ org: vsOrg(), compte: vsAccount() })
```

Attendu en mode démo (aucun token) : les deux valeurs sont des chaînes vides, et **aucune
erreur** n'apparaît dans la console.

- [ ] **Étape 4 : commit**

```bash
git add app.html
git commit -m "Le cache local est estampille par structure, plus par compte"
```

---

### Task 9 : vérification complète et déploiement

- [ ] **Étape 1 : lancer toute la suite de tests**

```bash
node --test "test/*.test.js"
```

Attendu : tous les tests passent (14 préexistants + 12 nouveaux + 3 ajoutés à `store.test.js`).

- [ ] **Étape 2 : se synchroniser avec le dépôt partagé**

Mateo pousse sur `origin/main` depuis sa propre machine — toujours vérifier avant de pousser.

```bash
git fetch --all && git log --oneline -1 && git log --oneline -1 origin/main
```

Si les deux diffèrent : `git pull --rebase origin main`, puis relancer les tests.

- [ ] **Étape 3 : pousser**

```bash
git push origin main
```

- [ ] **Étape 4 : vérifier le déploiement Vercel**

```bash
curl -s "https://api.github.com/repos/carneiroenzo70-crypto/scoutinglab/commits/$(git rev-parse --short HEAD)/status"
```

Attendu : `"state": "success"`.

- [ ] **Étape 5 : vérifier la non-régression en production**

Depuis un onglet navigateur (⚠️ `curl` est bloqué par Vercel sur ce domaine) :

```js
fetch('https://visionscore.gg/api/session', { headers: { Authorization: 'Bearer ' + localStorage.getItem('vs_token') } }).then(r => r.json())
```

Attendu : `ok: true`, et un champ `org` égal au nom du compte connecté (repli en action,
puisque aucun compte n'a encore de structure explicite). **C'est la vérification la plus
importante du plan** : elle prouve que les comptes existants n'ont rien perdu.

- [ ] **Étape 6 : créer un compte coach de test**

Sur `https://visionscore.gg/admin`, créer un compte avec un identifiant distinct et le champ
**Structure** renseigné avec le nom du compte principal existant. Se connecter avec ce
nouveau compte.

Attendu : le compte coach voit **les mêmes fiches, rosters, CRM et calendrier** que le compte
principal. Supprimer ce compte de test une fois la vérification faite.

---

## Ce que ce plan ne fait pas

- Aucune interface dans l'app pour qu'une structure crée elle-même ses comptes coach : la
  création reste manuelle via `/admin`, conformément au fonctionnement actuel.
- Aucun système de rôles ou de permissions : décidé avec Enzo, un compte coach voit
  exactement la même chose que le compte principal.
- Rien concernant la salle de draft : c'est l'objet des plans suivants.
