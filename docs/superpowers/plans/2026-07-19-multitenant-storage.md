# Stockage par compte (multi-tenant) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque compte VisionScore possède ses propres données (fiches, roster, CRM, structures, candidatures) stockées côté serveur (Upstash) et isolées par compte, synchronisées entre appareils.

**Architecture:** Un endpoint générique `/api/store` (GET/PUT) lit/écrit des clés `vs_data:<compte>:<domaine>` — le compte est déduit du token serveur, jamais du client. Le `localStorage` devient un cache rapide ; le serveur est la source de vérité. Candidatures isolées par compte via un code d'ingestion stable. Migration douce des comptes existants au 1er login.

**Tech Stack:** Node serverless (Vercel), Upstash Redis REST, JS vanilla dans `app.html`. Tests API via le runner intégré `node --test` (zéro dépendance, en mockant `global.fetch`). Vérifications client via le browser pane (méthode établie du projet).

**Référence spec :** `docs/superpowers/specs/2026-07-19-multitenant-storage-design.md`

---

## File Structure

- `api/store.js` — **créer** : endpoint générique GET/PUT par compte.
- `api/_auth.js` — **modifier** : ajouter le helper `ingestKey(username)`.
- `api/session.js` — **modifier** : calculer + persister + renvoyer `ingestKey`.
- `api/candidates.js` — **modifier** : lire `vs_candidates:<compte>` au lieu du pot commun.
- `api/candidate.js` — **modifier** : router l'ingestion vers le bon compte via `to=<ingestKey>`.
- `app.html` — **modifier** : module `vsStore` (près des helpers auth, ~ligne 32), câblage des `save`, chargement au démarrage, effacement à la déconnexion, encart lien d'ingestion dans l'onglet Candidatures.
- `test/store.test.js`, `test/session.test.js`, `test/candidate.test.js` — **créer** : tests API.

---

## Task 1 : Endpoint `/api/store` (GET/PUT par compte)

**Files:**
- Create: `api/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `test/store.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { signToken } = require('../api/_auth');
const handler = require('../api/store');

function mockRes() {
  return {
    _status: 0, _json: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; }, end() { return this; }, send(t) { this._json = t; return this; }
  };
}
// Faux Upstash en mémoire, piloté via global.fetch (comme _auth.upstash)
function mockUpstash(store) {
  global.fetch = async (_url, opts) => {
    const cmd = JSON.parse(opts.body);
    let result = null;
    if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
    else if (cmd[0] === 'MGET') { result = cmd.slice(1).map(k => (store[k] != null ? store[k] : null)); }
    return { ok: true, json: async () => ({ result }) };
  };
}

test('PUT écrit une clé préfixée par le compte, GET la relit', async () => {
  const store = {};
  mockUpstash(store);
  const token = signToken({ u: 'acme' }, 3600);

  let res = mockRes();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + token }, body: { domain: 'crm', data: [{ id: 1 }] } }, res);
  assert.equal(res._status, 200);
  assert.ok(store['vs_data:acme:crm'], 'la clé doit contenir le compte');

  res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + token }, query: { domains: 'crm,fiches' } }, res);
  assert.equal(res._status, 200);
  assert.deepEqual(res._json.crm, [{ id: 1 }]);
  assert.equal(res._json.fiches, null);
});

test('deux comptes sont isolés', async () => {
  const store = {};
  mockUpstash(store);
  const tA = signToken({ u: 'a' }, 3600);
  const tB = signToken({ u: 'b' }, 3600);

  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + tA }, body: { domain: 'crm', data: ['secretA'] } }, mockRes());
  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + tB }, query: { domains: 'crm' } }, res);
  assert.equal(res._json.crm, null, 'B ne doit rien voir de A');
});

test('refuse sans token', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { domains: 'crm' } }, res);
  assert.equal(res._status, 401);
});

test('refuse un domaine inconnu en PUT', async () => {
  mockUpstash({});
  const token = signToken({ u: 'acme' }, 3600);
  const res = mockRes();
  await handler({ method: 'PUT', headers: { authorization: 'Bearer ' + token }, body: { domain: 'hack', data: 1 } }, res);
  assert.equal(res._status, 400);
});
```

- [ ] **Step 2 : Lancer le test → doit échouer**

Run: `node --test test/store.test.js`
Expected: FAIL (`Cannot find module '../api/store'`).

- [ ] **Step 3 : Implémenter `api/store.js`**

```js
// /api/store — stockage par compte des données de l'app (multi-tenant)
//   GET  ?domains=fiches,rosters,crm,structures  → { fiches:<data|null>, ... }
//   PUT  { domain, data }                         → { ok:true }
// Clé Upstash : vs_data:<compte>:<domaine>. Le compte vient du token (jamais du client).
const { verifyToken, getBearer, upstash } = require('./_auth');

const DOMAINS = ['fiches', 'rosters', 'crm', 'structures'];
const MAX_BYTES = 1024 * 1024; // 1 Mo / domaine

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) return res.status(401).json({ error: 'Non authentifié' });
  const u = payload.u;

  try {
    if (req.method === 'GET') {
      const raw = String(req.query.domains || '');
      const domains = raw.split(',').map(s => s.trim()).filter(d => DOMAINS.includes(d));
      const out = {};
      if (domains.length) {
        const keys = domains.map(d => 'vs_data:' + u + ':' + d);
        const r = await upstash(['MGET'].concat(keys));
        const arr = (r && r.result) || [];
        domains.forEach((d, i) => {
          try { out[d] = arr[i] != null ? JSON.parse(arr[i]) : null; } catch (_) { out[d] = null; }
        });
      }
      return res.status(200).json(out);
    }

    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
      const domain = body && body.domain;
      if (!DOMAINS.includes(domain)) return res.status(400).json({ error: 'domaine invalide' });
      const json = JSON.stringify(body.data === undefined ? null : body.data);
      if (json.length > MAX_BYTES) return res.status(413).json({ error: 'données trop volumineuses' });
      await upstash(['SET', 'vs_data:' + u + ':' + domain, json]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
```

- [ ] **Step 4 : Lancer le test → doit passer**

Run: `node --test test/store.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add api/store.js test/store.test.js
git commit -m "feat(api): endpoint /api/store — stockage par compte (GET/PUT)"
```

---

## Task 2 : `ingestKey` (helper `_auth` + `/api/session`)

**Files:**
- Modify: `api/_auth.js` (ajouter `ingestKey`, l'exporter)
- Modify: `api/session.js` (persister la correspondance + renvoyer `ingestKey`)
- Test: `test/session.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `test/session.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { signToken, ingestKey } = require('../api/_auth');
const handler = require('../api/session');

function mockRes() {
  return { _status: 0, _json: null, setHeader() {}, status(c){ this._status=c; return this; }, json(o){ this._json=o; return this; }, end(){ return this; } };
}

test('ingestKey est stable et non trivial', () => {
  const k1 = ingestKey('acme');
  const k2 = ingestKey('acme');
  assert.equal(k1, k2);
  assert.equal(k1.length, 16);
  assert.notEqual(ingestKey('acme'), ingestKey('other'));
});

test('/api/session renvoie ingestKey et écrit la correspondance', async () => {
  const store = {};
  global.fetch = async (_url, opts) => {
    const cmd = JSON.parse(opts.body);
    let result = null;
    if (cmd[0] === 'GET') result = store[cmd[1]] != null ? store[cmd[1]] : null;
    else if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
    return { ok: true, json: async () => ({ result }) };
  };
  store['vs_user:acme'] = JSON.stringify({ username: 'acme', label: 'Acme', plan: 'elite', active: true });
  const token = signToken({ u: 'acme', label: 'Acme', plan: 'elite' }, 3600);

  const res = mockRes();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + token } }, res);
  assert.equal(res._status, 200);
  assert.equal(res._json.ingestKey, ingestKey('acme'));
  assert.equal(store['vs_ingest:' + ingestKey('acme')], 'acme');
});
```

- [ ] **Step 2 : Lancer le test → doit échouer**

Run: `node --test test/session.test.js`
Expected: FAIL (`ingestKey` non exporté / absent de la réponse).

- [ ] **Step 3 : Ajouter `ingestKey` dans `api/_auth.js`**

Après la fonction `getBearer` (avant `upstash`), insérer :

```js
// ── Code d'ingestion candidatures : stable, non devinable, dérivé du secret ─
function ingestKey(username) {
  const SESSION_SECRET = process.env.SESSION_SECRET || '';
  return crypto.createHmac('sha256', SESSION_SECRET).update('ingest:' + username).digest('hex').slice(0, 16);
}
```

Puis remplacer la ligne d'export :

```js
module.exports = { hashPassword, verifyPassword, signToken, verifyToken, getBearer, upstash };
```

par :

```js
module.exports = { hashPassword, verifyPassword, signToken, verifyToken, getBearer, upstash, ingestKey };
```

- [ ] **Step 4 : Modifier `api/session.js`**

Remplacer l'import en tête :

```js
const { verifyToken, getBearer, upstash } = require('./_auth');
```

par :

```js
const { verifyToken, getBearer, upstash, ingestKey } = require('./_auth');
```

Puis, dans le bloc succès, remplacer :

```js
  if (!user) return res.status(403).json({ ok: false, error: 'Compte introuvable' });
  if (user.active === false) return res.status(403).json({ ok: false, error: 'Compte désactivé' });

  return res.status(200).json({ ok: true, plan: user.plan || payload.plan, label: user.label || payload.label });
```

par :

```js
  if (!user) return res.status(403).json({ ok: false, error: 'Compte introuvable' });
  if (user.active === false) return res.status(403).json({ ok: false, error: 'Compte désactivé' });

  // Garantit la correspondance code d'ingestion → compte (idempotent), pour le routage
  // des candidatures du formulaire propre à la structure.
  const ik = ingestKey(payload.u);
  try { await upstash(['SET', 'vs_ingest:' + ik, payload.u]); } catch (_) { /* non bloquant */ }

  return res.status(200).json({ ok: true, plan: user.plan || payload.plan, label: user.label || payload.label, ingestKey: ik });
```

- [ ] **Step 5 : Lancer le test → doit passer**

Run: `node --test test/session.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6 : Commit**

```bash
git add api/_auth.js api/session.js test/session.test.js
git commit -m "feat(api): ingestKey stable + /api/session le renvoie et le persiste"
```

---

## Task 3 : Candidatures par compte (`candidates.js` + `candidate.js`)

**Files:**
- Modify: `api/candidates.js` (lecture par compte)
- Modify: `api/candidate.js` (ingestion routée via `to`)
- Test: `test/candidate.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `test/candidate.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { signToken, ingestKey } = require('../api/_auth');
const ingest = require('../api/candidate');
const list = require('../api/candidates');

function mockRes() {
  return { _status: 0, _json: null, setHeader() {}, status(c){ this._status=c; return this; }, json(o){ this._json=o; return this; }, end(){ return this; }, send(t){ this._json=t; return this; } };
}
// Faux Upstash : supporte les URLs REST (candidate.js) ET le POST commande (candidates.js via _auth)
function mockUpstash(store) {
  global.fetch = async (url, opts) => {
    // Style commande POST (MGET/GET/SET/LPUSH/LRANGE array)
    if (opts && opts.body && opts.body[0] === '[') {
      const cmd = JSON.parse(opts.body);
      let result = null;
      if (cmd[0] === 'GET') result = store[cmd[1]] != null ? store[cmd[1]] : null;
      else if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
      else if (cmd[0] === 'LPUSH') { (store[cmd[1]] = store[cmd[1]] || []).unshift(cmd[2]); result = store[cmd[1]].length; }
      else if (cmd[0] === 'LRANGE') { result = (store[cmd[1]] || []).slice(); }
      return { ok: true, json: async () => ({ result }) };
    }
    // Style URL REST (utilisé par candidate.js / candidates.js legacy)
    const m = String(url).match(/\/(lpush|lrange)\/([^/]+)(?:\/(.*))?$/);
    if (m && m[1] === 'lpush') { const key = decodeURIComponent(m[2]); (store[key] = store[key] || []).unshift(decodeURIComponent(m[3])); return { ok: true, json: async () => ({ result: store[key].length }) }; }
    if (m && m[1] === 'lrange') { const key = decodeURIComponent(m[2]); return { ok: true, json: async () => ({ result: (store[key] || []).slice() }) }; }
    return { ok: true, json: async () => ({ result: null }) };
  };
}

test('une candidature routée par ingestKey n\'atterrit que dans le bon compte', async () => {
  const store = {};
  mockUpstash(store);
  store['vs_ingest:' + ingestKey('acme')] = 'acme';

  // Ingestion (form de la structure acme)
  const res = mockRes();
  await ingest({ method: 'POST', query: { to: ingestKey('acme') }, body: { pseudo: 'Zed', role: 'Mid' } }, res);
  assert.equal(res._status, 200);
  assert.ok(store['vs_candidates:acme'] && store['vs_candidates:acme'].length === 1);

  // Lecture par le compte acme
  const tA = signToken({ u: 'acme' }, 3600);
  const rA = mockRes();
  await list({ method: 'GET', headers: { authorization: 'Bearer ' + tA } }, rA);
  assert.equal(rA._json.length, 1);
  assert.equal(rA._json[0].pseudo, 'Zed');

  // Un autre compte ne voit rien
  const tB = signToken({ u: 'other' }, 3600);
  const rB = mockRes();
  await list({ method: 'GET', headers: { authorization: 'Bearer ' + tB } }, rB);
  assert.equal(rB._json.length, 0);
});

test('ingestion refusée sans code valide', async () => {
  mockUpstash({});
  const res = mockRes();
  await ingest({ method: 'POST', query: {}, body: { pseudo: 'Zed' } }, res);
  assert.equal(res._status, 400);
});
```

- [ ] **Step 2 : Lancer le test → doit échouer**

Run: `node --test test/candidate.test.js`
Expected: FAIL (candidate.js écrit encore dans le pot commun / n'exige pas `to`).

- [ ] **Step 3 : Modifier `api/candidates.js` (lecture par compte)**

Remplacer l'import et le bloc de lecture. En tête :

```js
const { verifyToken, getBearer } = require('./_auth');
```

devient :

```js
const { verifyToken, getBearer, upstash } = require('./_auth');
```

Puis remplacer le bloc de vérification + lecture :

```js
  // Protège la base CRM : token de session requis
  if (!verifyToken(getBearer(req))) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  const { UPSTASH_URL, UPSTASH_TOKEN } = process.env;
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: 'Upstash non configuré' });
  }

  try {
    const upRes = await fetch(
      `${UPSTASH_URL}/lrange/vs_candidates/0/-1`,
      { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
    );
    if (!upRes.ok) throw new Error('Upstash error ' + upRes.status);
    const data = await upRes.json();
    const candidates = (data.result || []).map(item => {
      try { return JSON.parse(decodeURIComponent(item)); } catch(_) {
        try { return JSON.parse(item); } catch(_) { return null; }
      }
    }).filter(Boolean);
    return res.status(200).json(candidates);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
```

par :

```js
  // Protège la base CRM : token requis. Chaque compte ne voit QUE ses candidatures.
  const payload = verifyToken(getBearer(req));
  if (!payload || !payload.u) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const r = await upstash(['LRANGE', 'vs_candidates:' + payload.u, '0', '-1']);
    const candidates = ((r && r.result) || []).map(item => {
      try { return JSON.parse(decodeURIComponent(item)); } catch (_) {
        try { return JSON.parse(item); } catch (_) { return null; }
      }
    }).filter(Boolean);
    return res.status(200).json(candidates);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
```

- [ ] **Step 4 : Modifier `api/candidate.js` (ingestion routée)**

En tête du fichier, ajouter l'import (le fichier n'importait rien) :

```js
// POST /api/candidate — reçoit une candidature depuis le Google Form d'une structure
const { upstash } = require('./_auth');
```

Juste après le parsing du body (`const { pseudo, tag, ... } = body || {}`), et **avant** la construction de `candidate`, insérer la résolution du compte destinataire :

```js
  // Routage : ?to=<ingestKey> identifie la structure destinataire (form propre à elle).
  const to = (req.query && req.query.to) || (body && body.to) || '';
  if (!to) return res.status(400).json({ error: 'Code destinataire manquant' });
  let account = null;
  try {
    const r = await upstash(['GET', 'vs_ingest:' + String(to)]);
    account = r && r.result ? r.result : null;
  } catch (e) { return res.status(500).json({ error: e.message }); }
  if (!account) return res.status(400).json({ error: 'Code destinataire inconnu' });
```

Enfin, remplacer l'écriture globale :

```js
    const upRes = await fetch(
      `${UPSTASH_URL}/lpush/vs_candidates/${encodeURIComponent(JSON.stringify(candidate))}`,
      { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
    );
```

par une écriture dans la liste du compte résolu :

```js
    await upstash(['LPUSH', 'vs_candidates:' + account, JSON.stringify(candidate)]);
```

> Note : supprimer aussi, dans `candidate.js`, la garde `if (!UPSTASH_URL || !UPSTASH_TOKEN)` devenue inutile si elle référence des variables non lues — la laisser ne casse rien ; la retirer seulement si elle empêche la compilation. `upstash()` gère déjà l'absence de config.

- [ ] **Step 5 : Lancer le test → doit passer**

Run: `node --test test/candidate.test.js`
Expected: PASS (2 tests).

- [ ] **Step 6 : Lancer TOUTE la suite API**

Run: `node --test test/`
Expected: PASS (tous les fichiers de test).

- [ ] **Step 7 : Commit**

```bash
git add api/candidates.js api/candidate.js test/candidate.test.js
git commit -m "feat(api): candidatures isolées par compte + ingestion routée par code"
```

---

## Task 4 : Module client `vsStore` (cache + synchro + migration)

**Files:**
- Modify: `app.html` (insérer le module après `vsLogout`, ~ligne 32)

- [ ] **Step 1 : Insérer le module `vsStore` dans `app.html`**

Juste après la fonction `vsLogout()` (ligne ~32), insérer :

```js
/* Nom de compte extrait du token (payload.u) — pour préfixer les drapeaux locaux. */
function vsAccount(){ try{ var s=vsToken().split('.')[0].replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; return (JSON.parse(atob(s)).u)||''; }catch(_){ return ''; } }
/* ══ vsStore — synchro des données par compte (cache localStorage + serveur) ══
   Domaines mappés vers leurs clés localStorage. Le PUT lit le cache local courant
   (les fonctions de save écrivent déjà le localStorage, puis appellent vsStore.save). */
const VS_STORE_DOMAINS = {
  fiches:     ['spes_history'],
  rosters:    ['vs_rosters', 'vs_active_roster'],
  crm:        ['spes_crm_pipeline'],
  structures: ['spes_crm_structures'],
};
const vsStore = (function () {
  const timers = {};
  function pack(domain) {
    const out = {};
    VS_STORE_DOMAINS[domain].forEach(k => {
      const raw = localStorage.getItem(k);
      try { out[k] = raw != null ? JSON.parse(raw) : null; } catch (_) { out[k] = null; }
    });
    return out;
  }
  function unpack(domain, data) {
    if (!data) return;
    VS_STORE_DOMAINS[domain].forEach(k => {
      if (data[k] == null) return;
      try { localStorage.setItem(k, JSON.stringify(data[k])); } catch (_) {}
    });
  }
  function isEmpty(domain) {
    return VS_STORE_DOMAINS[domain].every(k => {
      const v = localStorage.getItem(k);
      return v == null || v === '' || v === '[]' || v === '{}' || v === 'null';
    });
  }
  async function put(domain) {
    try {
      await fetch('/api/store', {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, vsAuthHeaders()),
        body: JSON.stringify({ domain, data: pack(domain) })
      });
    } catch (_) { /* réseau : le cache local garde la modif, repartira au prochain save */ }
  }
  function save(domain) {
    if (window.VS_DEMO || !VS_STORE_DOMAINS[domain]) return;
    clearTimeout(timers[domain]);
    timers[domain] = setTimeout(() => put(domain), 1000); // débounce ~1 s
  }
  async function loadAll() {
    if (window.VS_DEMO) return;
    const domains = Object.keys(VS_STORE_DOMAINS);
    let server = {};
    try {
      const r = await fetch('/api/store?domains=' + domains.join(','), { headers: vsAuthHeaders() });
      if (r.ok) server = await r.json();
    } catch (_) { return; /* Upstash indispo → on garde le cache local (mode dégradé) */ }
    const migratedFlag = 'vs_migrated:' + vsAccount();
    let migratedAny = false;
    domains.forEach(d => {
      if (server[d] != null) {
        unpack(d, server[d]);                    // le serveur gagne
      } else if (!isEmpty(d) && !localStorage.getItem(migratedFlag)) {
        put(d);                                   // migration douce : pousse le local
        migratedAny = true;
      }
    });
    if (migratedAny) { try { localStorage.setItem(migratedFlag, '1'); } catch (_) {} }
  }
  return { save, loadAll, _pack: pack, _isEmpty: isEmpty };
})();
```

- [ ] **Step 2 : Vérifier dans le browser pane (pack/isEmpty/save débouncé)**

Servir l'app (déjà sur `http://localhost:8777`). Dans le browser pane, seeder un faux token puis tester :

```js
// Faux token (le client ne vérifie que l'exp, pas la signature)
const fake = btoa(JSON.stringify({ u:'testco', exp: Math.floor(Date.now()/1000)+9999, plan:'elite' })).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') + '.sig';
localStorage.clear(); localStorage.setItem('vs_token', fake);
localStorage.setItem('spes_crm_pipeline', JSON.stringify([{id:1,playerName:'Zed'}]));
let puts=[]; window.fetch = async (u,opts)=>{ if(String(u).startsWith('/api/store')){ if(opts&&opts.method==='PUT'){ puts.push(JSON.parse(opts.body)); return {ok:true,json:async()=>({ok:true})}; } return {ok:true,json:async()=>({})}; } return {ok:true,json:async()=>({})}; };
vsStore.save('crm');
new Promise(res=>setTimeout(()=>res(JSON.stringify({ put_count:puts.length, domain:puts[0]&&puts[0].domain, data:puts[0]&&puts[0].data['spes_crm_pipeline'] })),1300));
```

Expected: `{"put_count":1,"domain":"crm","data":[{"id":1,"playerName":"Zed"}]}` (un seul PUT après débounce, payload = cache local).

- [ ] **Step 3 : Vérifier la migration (serveur vide → push local)**

```js
let puts=[]; window.fetch = async (u,opts)=>{ if(String(u).startsWith('/api/store')){ if(opts&&opts.method==='PUT'){ puts.push(JSON.parse(opts.body).domain); return {ok:true,json:async()=>({ok:true})}; } return {ok:true,json:async()=>({})}; /* GET renvoie tout vide */ } return {ok:true,json:async()=>({})}; };
localStorage.removeItem('vs_migrated:testco');
localStorage.setItem('vs_rosters', JSON.stringify([{id:9,name:'X'}]));
vsStore.loadAll().then(()=> new Promise(res=>setTimeout(()=>res(JSON.stringify({ pushed:[...new Set(puts)].sort() })),300)) );
```

Expected: `pushed` contient `"crm"` et `"rosters"` (les domaines non vides poussés), et **pas** `fiches`/`structures` (vides).

- [ ] **Step 4 : Commit**

```bash
git add app.html
git commit -m "feat(app): module vsStore — cache local + synchro serveur par domaine + migration"
```

---

## Task 5 : Câblage (save aux points d'écriture, load au démarrage, wipe au logout)

**Files:**
- Modify: `app.html` (rsSaveAll ~4448, crmSave ~9427, 3× spes_history ~10271/10351/10441, boot après crmLoad ~10225, vsLogout ~32)

- [ ] **Step 1 : Brancher `vsStore.save` sur les fonctions d'écriture**

`app.html:4448` — `rsSaveAll` : remplacer

```js
function rsSaveAll(list) { localStorage.setItem('vs_rosters', JSON.stringify(list)); if (typeof rsSyncTrack === 'function') rsSyncTrack(); }
```

par

```js
function rsSaveAll(list) { localStorage.setItem('vs_rosters', JSON.stringify(list)); if (typeof rsSyncTrack === 'function') rsSyncTrack(); if (typeof vsStore !== 'undefined') vsStore.save('rosters'); }
```

`app.html:~4437` — la fonction `rsSetActive` écrit `vs_active_roster`. Localiser :

```js
function rsSetActive(id) { localStorage.setItem('vs_active_roster', String(id)); }
```

et la remplacer par :

```js
function rsSetActive(id) { localStorage.setItem('vs_active_roster', String(id)); if (typeof vsStore !== 'undefined') vsStore.save('rosters'); }
```

`app.html:9427` — `crmSave` : remplacer le corps

```js
function crmSave() {
  try {
    localStorage.setItem('spes_crm_structures', JSON.stringify(crmStructures));
    localStorage.setItem('spes_crm_pipeline',   JSON.stringify(crmPipeline));
  } catch(e) {}
}
```

par

```js
function crmSave() {
  try {
    localStorage.setItem('spes_crm_structures', JSON.stringify(crmStructures));
    localStorage.setItem('spes_crm_pipeline',   JSON.stringify(crmPipeline));
  } catch(e) {}
  if (typeof vsStore !== 'undefined') { vsStore.save('structures'); vsStore.save('crm'); }
}
```

Pour les fiches — les 3 sites `localStorage.setItem('spes_history', …)` (lignes ~10271, ~10351, ~10441). Après **chacune** de ces lignes, ajouter :

```js
  if (typeof vsStore !== 'undefined') vsStore.save('fiches');
```

- [ ] **Step 2 : Charger au démarrage (après le paint depuis le cache)**

`app.html:10225` — la ligne `crmLoad();` s'exécute au parse (paint instantané depuis le cache). Juste **après** cette ligne, ajouter le chargement serveur qui rafraîchit ensuite :

```js
crmLoad();
/* Synchro serveur : le cache local a déjà peint ; on recharge depuis le serveur
   (source de vérité) puis on rafraîchit les vues concernées. */
document.addEventListener('DOMContentLoaded', function () {
  if (window.VS_DEMO) return;
  vsStore.loadAll().then(function () {
    if (typeof crmLoad === 'function') crmLoad();
    if (typeof renderRoster === 'function' && document.getElementById('an-view-roster') && document.getElementById('an-view-roster').style.display !== 'none') renderRoster();
    var cp = document.getElementById('panel-crm');
    if (cp && cp.classList.contains('active') && typeof crmRenderPipeline === 'function') crmRenderPipeline();
  });
});
```

- [ ] **Step 3 : Effacer le cache local à la déconnexion**

`app.html:32` — remplacer `vsLogout` :

```js
function vsLogout(){ try{ localStorage.removeItem('vs_token'); sessionStorage.removeItem('vs_token'); localStorage.removeItem('vs_user'); }catch(e){} location.replace('/'); }
```

par :

```js
function vsLogout(){ try{
  ['vs_token','vs_user','spes_history','vs_rosters','vs_active_roster','spes_crm_pipeline','spes_crm_structures'].forEach(function(k){ localStorage.removeItem(k); });
  Object.keys(localStorage).forEach(function(k){ if(k.indexOf('vs_candidates')===0 || k.indexOf('vs_migrated:')===0) localStorage.removeItem(k); });
  sessionStorage.removeItem('vs_token');
}catch(e){} location.replace('/'); }
```

- [ ] **Step 4 : Vérifier le câblage dans le browser pane**

Recharger l'app avec le faux token (cf Task 4 Step 2). Mocker `/api/store` pour capturer les PUT, puis déclencher une sauvegarde CRM réelle :

```js
let puts=[]; const realFetch=window.fetch; window.fetch=async(u,opts)=>{ if(String(u).startsWith('/api/store')&&opts&&opts.method==='PUT'){ puts.push(JSON.parse(opts.body).domain); return {ok:true,json:async()=>({ok:true})}; } if(String(u).startsWith('/api/store')) return {ok:true,json:async()=>({})}; return {ok:true,json:async()=>({})}; };
crmStructures=[{id:1,nom:'Test'}]; crmPipeline=[{id:2,playerName:'Faker',role:'Mid'}]; crmSave();
new Promise(res=>setTimeout(()=>res(JSON.stringify({ domains:[...new Set(puts)].sort() })),1300));
```

Expected: `{"domains":["crm","structures"]}`.

- [ ] **Step 5 : Vérifier le wipe au logout**

```js
localStorage.setItem('spes_crm_pipeline','[1]'); localStorage.setItem('vs_rosters','[1]'); localStorage.setItem('vs_candidates:testco','[1]');
// on neutralise la redirection pour le test
const _rep = location.replace; location.replace = ()=>{};
vsLogout();
const r = JSON.stringify({ pipeline:localStorage.getItem('spes_crm_pipeline'), rosters:localStorage.getItem('vs_rosters'), cand:localStorage.getItem('vs_candidates:testco'), token:localStorage.getItem('vs_token') });
location.replace=_rep; r;
```

Expected: toutes les valeurs à `null`.

- [ ] **Step 6 : Commit**

```bash
git add app.html
git commit -m "feat(app): câblage vsStore (save aux écritures, load au boot, wipe au logout)"
```

---

## Task 6 : Onglet Candidatures — lien d'ingestion + lecture par compte

**Files:**
- Modify: `app.html` (capter `ingestKey` depuis `/api/session`, ~ligne 40 ; afficher l'encart dans le rendu des candidatures)

- [ ] **Step 1 : Capter `ingestKey` renvoyé par `/api/session`**

`app.html:36-48` — dans `vsCheckSession`, après l'appel `fetch('/api/session', …)`, sur succès, mémoriser le code. Remplacer le corps du `try` :

```js
  try {
    var res = await fetch('/api/session', { headers: vsAuthHeaders() });
    if (res.status === 401 || res.status === 403) {
      var msg = 'Votre session a expiré.';
      try { var d = await res.json(); if (d && d.error) msg = d.error; } catch(e){}
      try { alert(msg); } catch(e){}
      vsLogout();
    }
  } catch(e) { /* réseau indispo → on ne déconnecte pas */ }
```

par :

```js
  try {
    var res = await fetch('/api/session', { headers: vsAuthHeaders() });
    if (res.status === 401 || res.status === 403) {
      var msg = 'Votre session a expiré.';
      try { var d = await res.json(); if (d && d.error) msg = d.error; } catch(e){}
      try { alert(msg); } catch(e){}
      vsLogout();
    } else if (res.ok) {
      try { var ok = await res.json(); if (ok && ok.ingestKey) { window.VS_INGEST_KEY = ok.ingestKey; if (typeof crmRenderIngestLink === 'function') crmRenderIngestLink(); } } catch(e){}
    }
  } catch(e) { /* réseau indispo → on ne déconnecte pas */ }
```

- [ ] **Step 2 : Ajouter la fonction `crmRenderIngestLink`**

Juste avant `function crmSyncCandidatures()` (`app.html:~9964`), insérer :

```js
// Encart « Recevoir des candidatures » : lien propre à la structure à brancher sur son Google Form.
function crmRenderIngestLink() {
  const host = document.getElementById('crm-ingest-slot');
  if (!host || !window.VS_INGEST_KEY) return;
  const url = location.origin + '/api/candidate?to=' + window.VS_INGEST_KEY;
  host.innerHTML =
    '<div class="card" style="padding:14px 18px;margin-bottom:14px">' +
      '<div class="h3" style="font-size:14px;margin-bottom:4px">Recevoir des candidatures</div>' +
      '<div class="faint" style="font-size:12px;margin-bottom:8px">Branche ce lien sur ton Google Form (via Apps Script) : chaque candidature n\'arrivera que dans <strong>ta</strong> session.</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<code style="flex:1;min-width:220px;overflow:auto;background:#04120F;border:1px solid var(--vs-forest-500);border-radius:8px;padding:8px 10px;font-size:11.5px;color:var(--vs-fg-2)">' + anEsc(url) + '</code>' +
        '<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard&&navigator.clipboard.writeText(\'' + url + '\');showToast&&showToast(\'Lien copié\',\'success\')">Copier</button>' +
      '</div>' +
    '</div>';
}
```

- [ ] **Step 3 : Ajouter le conteneur d'encart dans le HTML des candidatures**

`app.html` — dans le panneau CRM, repérer le conteneur qui reçoit le rendu des candidatures (le `id` ciblé par `crmSyncCandidatures`). Juste avant ce conteneur, ajouter une ancre :

```html
<div id="crm-ingest-slot"></div>
```

Puis, à la fin de `crmShowTab('candidatures')` (là où l'onglet devient visible), appeler `crmRenderIngestLink()`. Localiser dans `crmShowTab` la branche candidatures (`app.html:9458`) et y ajouter, après le `crmSyncCandidatures()` conditionnel :

```js
  if (tab === 'candidatures' && typeof crmRenderIngestLink === 'function') crmRenderIngestLink();
```

- [ ] **Step 4 : Vérifier dans le browser pane**

Recharger avec le faux token. Simuler la réponse `/api/session` puis le rendu :

```js
window.VS_INGEST_KEY = 'abcd1234ef567890';
// s'assurer que l'ancre existe (sinon la créer pour le test)
if(!document.getElementById('crm-ingest-slot')){ const d=document.createElement('div'); d.id='crm-ingest-slot'; document.body.appendChild(d); }
crmRenderIngestLink();
const code = document.querySelector('#crm-ingest-slot code');
JSON.stringify({ present: !!code, contient_key: code ? code.textContent.includes('abcd1234ef567890') : false, contient_route: code ? code.textContent.includes('/api/candidate?to=') : false });
```

Expected: `{"present":true,"contient_key":true,"contient_route":true}`.

- [ ] **Step 5 : Commit**

```bash
git add app.html
git commit -m "feat(app): encart lien d'ingestion candidatures (par structure)"
```

---

## Task 7 : Vérification end-to-end (critères de réussite du spec)

**Files:** aucun (déploiement + vérifs).

- [ ] **Step 1 : Suite API complète**

Run: `node --test test/`
Expected: PASS (tous les tests des tasks 1-3).

- [ ] **Step 2 : Déployer**

```bash
git push
git commit --allow-empty -m "chore: relance build Vercel (multi-tenant)"
git push
```

- [ ] **Step 3 : Vérifier en prod depuis le navigateur (isolation + persistance)**

Dans le browser pane, sur `https://visionscore.gg` (token d'un vrai compte de test), exécuter un scénario :

```js
// 1) écrire un prospect CRM → attendre le PUT → 2) vider le cache local → 3) recharger depuis le serveur
crmPipeline=[{id:Date.now(),playerName:'E2E_Test',role:'Mid',stage:'repere'}]; crmSave();
new Promise(res=>setTimeout(async()=>{
  ['spes_crm_pipeline'].forEach(k=>localStorage.removeItem(k));
  const r = await fetch('/api/store?domains=crm', { headers: vsAuthHeaders() });
  const j = await r.json();
  res(JSON.stringify({ server_a_le_prospect: JSON.stringify(j.crm).includes('E2E_Test') }));
}, 1500));
```

Expected: `{"server_a_le_prospect":true}` (la donnée est bien remontée au serveur, par compte).

- [ ] **Step 4 : Cocher les critères de réussite du spec**

Vérifier manuellement, avec deux comptes de test A et B :

1. A crée roster + fiche + prospect → reconnexion sur autre navigateur → tout est là.
2. B se connecte (même navigateur, après logout de A) → ne voit rien de A.
3. `POST /api/candidate?to=<ingestKey de A>` (ex. via `curl` ou un form) → n'apparaît que chez A.
4. Un compte existant retrouve ses données après déploiement (migration douce).

- [ ] **Step 5 : Mettre à jour la mémoire projet**

Consigner dans la mémoire (`account-billing-infra.md` ou une note dédiée) : données désormais par compte côté serveur (`vs_data:<compte>:*`, `vs_candidates:<compte>`), endpoint `/api/store`, code d'ingestion via `/api/session`, migration douce au 1er login, wipe au logout. Lien vers ce plan et le spec.

---

## Self-Review (rempli à la rédaction)

- **Couverture du spec :** §2 périmètre → Tasks 4-5 (domaines mappés). §3.1 `/api/store` → Task 1. §3.2 candidatures → Task 3. §4.1-4.2 vsStore/chargement → Tasks 4-5. §4.3 migration → Task 4 (loadAll) + vérif Task 4 Step 3. §4.4 ingestKey → Task 2 + Task 6. §4.5 logout → Task 5 Step 3. §5 robustesse → put() try/catch, loadAll mode dégradé. §6 sécurité → compte déduit du token (Tasks 1-3), wipe (Task 5). §7 critères → Task 7.
- **Placeholders :** aucun ; chaque étape porte le code réel.
- **Cohérence des types :** `vsStore.save(domain)`, `vsStore.loadAll()`, clés `vs_data:<u>:<domain>`, `vs_ingest:<key>`, `vs_candidates:<u>`, `window.VS_INGEST_KEY`, `crmRenderIngestLink()` — noms identiques d'une task à l'autre.
