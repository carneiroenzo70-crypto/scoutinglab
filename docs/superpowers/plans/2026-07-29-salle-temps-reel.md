# Salle de draft temps réel — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** plusieurs coachs, chacun chez soi, sur la **même draft en direct** — picks et
bans instantanés, présence, et curseurs nominatifs.

**Architecture :** un **Durable Object Cloudflare** par salle. Il détient l'état vivant,
applique les opérations de façon **autoritaire** via `draft-engine.js` (le même fichier que le
navigateur — un client ne peut donc jamais imposer un état truqué), et diffuse aux
participants. L'état est persisté dans le stockage du Durable Object.

**Pile technique :** Cloudflare Workers + Durable Objects, WebSocket Hibernation API,
WebCrypto pour vérifier le token VisionScore. Aucune dépendance au-delà de `wrangler`.

**Spec de référence :** `docs/superpowers/specs/2026-07-28-salle-draft-collaborative-design.md`

---

## Pourquoi Cloudflare et pas un serveur à nous

Vérifié le 29/07/2026 : **plus aucun hébergeur ne propose de serveur permanent gratuit.**
Fly.io a supprimé son offre gratuite, Koyeb l'a fermée aux nouveaux comptes, et Render
s'endort avec ~1 min de réveil — rédhibitoire pour une draft chronométrée.

Les Durable Objects règlent précisément ce problème : la documentation Cloudflare indique que
**« Hibernated WebSocket connections stay connected »**. Une salle inactive ne coûte rien et
ne déconnecte personne ; il n'y a pas de démarrage à froid perceptible.

⚠️ **À assumer** : les drafts transitent par Cloudflare. Nous écrivons le code, Cloudflare
l'exécute — même rapport qu'avec Vercel et Upstash, qui hébergent déjà l'app et toutes les
données clients. Ce n'est pas comparable à un service temps réel managé type Ably, où le
routage est un produit fermé. Mais ce n'est plus de l'auto-hébergement.

---

## Deux propriétés qui simplifient l'implémentation

**Le mode live est tour par tour.** À un instant donné un seul côté peut agir : les conflits
d'écriture sont impossibles *par les règles du jeu*. Le serveur n'a qu'à rejeter ce qui vient
du mauvais camp — ce que `draft-engine.js` fait déjà.

**Le chrono n'est pas diffusé.** Le moteur produit une **échéance absolue** ; chaque navigateur
décompte localement. Aucun message périodique, aucune dérive.

---

## Structure des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `ws-server/package.json` | dépendance `wrangler` uniquement | **créer** |
| `ws-server/wrangler.toml` | configuration Worker + Durable Object | **créer** |
| `ws-server/src/auth.js` | vérification du token VisionScore en WebCrypto | **créer** |
| `ws-server/src/index.js` | Worker (routage) + classe `DraftRoom` | **créer** |
| `test/ws-auth.test.js` | tests de la vérification de token | **créer** |
| `.vercelignore` | exclut `ws-server/` du déploiement Vercel | modifier |
| `app.html` | connexion WebSocket, état distant, curseurs | modifier |
| `draft-engine.js` | **inchangé** — importé tel quel par le Worker | — |

Le dossier `ws-server/` a son propre `package.json` : la règle « zéro dépendance » des
fonctions Vercel (`api/`) reste intacte.

---

### Task 1 : squelette du service et isolation vis-à-vis de Vercel

**Fichiers :**
- Créer : `ws-server/package.json`, `ws-server/wrangler.toml`, `ws-server/src/index.js`
- Modifier : `.vercelignore`

- [ ] **Étape 1 : exclure le service de Vercel**

Sans ça, Vercel téléverserait un dossier Node inutile et pourrait tenter de le construire.
Dans `.vercelignore`, après la ligne `test/`, ajouter :

```
# Serveur temps réel (déployé sur Cloudflare, pas sur Vercel)
ws-server/
```

- [ ] **Étape 2 : créer le paquet**

`ws-server/package.json` :

```json
{
  "name": "visionscore-draft-room",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4"
  }
}
```

- [ ] **Étape 3 : configurer le Worker**

`ws-server/wrangler.toml` :

```toml
name = "visionscore-draft"
main = "src/index.js"
compatibility_date = "2026-07-01"

# Une salle de draft = un Durable Object. Les connexions WebSocket restent
# ouvertes pendant l'hibernation : aucune salle inactive ne coûte de temps de
# calcul, et personne n'est déconnecté.
[[durable_objects.bindings]]
name = "DRAFT_ROOMS"
class_name = "DraftRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["DraftRoom"]
```

- [ ] **Étape 4 : Worker minimal**

`ws-server/src/index.js` :

```js
/* Serveur temps réel des salles de draft.
   Un Durable Object = une salle. Il fait autorité : les opérations sont appliquées
   ici avec draft-engine.js (le MÊME fichier que le navigateur), pour qu'un client
   ne puisse jamais imposer un état truqué. */

export class DraftRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    return new Response('salle de draft', { status: 200 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    return new Response('introuvable', { status: 404 });
  }
};
```

- [ ] **Étape 5 : installer et démarrer en local**

```bash
cd ws-server && npm install
npx wrangler dev --port 8788
```

Dans un autre terminal :

```bash
curl -s http://127.0.0.1:8788/health
```

Attendu : `ok`. Arrêter ensuite le serveur (Ctrl+C).

- [ ] **Étape 6 : commit**

```bash
git add ws-server .vercelignore
git commit -m "Serveur temps reel : squelette Cloudflare Worker + Durable Object"
```

⚠️ Vérifier que `ws-server/node_modules` n'est PAS commité :

```bash
git status --short | grep node_modules && echo "PROBLEME : ajouter node_modules a .gitignore" || echo "OK"
```

Si des `node_modules` apparaissent, ajouter `node_modules/` à `.gitignore` avant de committer.

---

### Task 2 : vérification du token VisionScore (WebCrypto)

Le Worker ne peut pas utiliser le module `crypto` de Node : il faut refaire la vérification
HMAC en WebCrypto. C'est la pièce **de sécurité** du service — elle décide qui entre.

**Fichiers :**
- Créer : `ws-server/src/auth.js`
- Test : `test/ws-auth.test.js` (créer)

- [ ] **Étape 1 : écrire les tests qui échouent**

Node 24 expose la même WebCrypto que les Workers : le module se teste donc directement.

`test/ws-auth.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

const SECRET = 'test-secret';

// Fabrique un token au format exact de api/_auth.js : base64url(JSON).base64url(HMAC)
function signToken(payload, maxAgeSec) {
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + maxAgeSec });
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}

test('un token valide est accepte et rend compte et structure', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  const p = await verifyToken(signToken({ u: 'alan', org: 'galions' }, 3600), SECRET);
  assert.equal(p.u, 'alan');
  assert.equal(p.org, 'galions');
});

test('une signature falsifiee est refusee', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  const t = signToken({ u: 'alan', org: 'galions' }, 3600);
  const falsifie = t.slice(0, -4) + 'aaaa';
  assert.equal(await verifyToken(falsifie, SECRET), null);
});

test('un token signe avec un autre secret est refuse', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  const t = signToken({ u: 'alan' }, 3600);
  assert.equal(await verifyToken(t, 'mauvais-secret'), null);
});

test('un token expire est refuse', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  assert.equal(await verifyToken(signToken({ u: 'alan' }, -10), SECRET), null);
});

test('un token malforme est refuse sans lever d\'exception', async () => {
  const { verifyToken } = await import('../ws-server/src/auth.js');
  assert.equal(await verifyToken('nimporte-quoi', SECRET), null);
  assert.equal(await verifyToken('', SECRET), null);
  assert.equal(await verifyToken(null, SECRET), null);
});

test('orgOfToken applique le meme repli que l\'API', async () => {
  const { orgOfToken } = await import('../ws-server/src/auth.js');
  assert.equal(orgOfToken({ u: 'acme' }), 'acme');
  assert.equal(orgOfToken({ u: 'alan', org: 'galions' }), 'galions');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/ws-auth.test.js"
```

Attendu : ÉCHEC — le module `ws-server/src/auth.js` n'existe pas.

- [ ] **Étape 3 : implémenter**

`ws-server/src/auth.js` :

```js
/* Vérification du token de session VisionScore.
   Le Worker n'a pas le module `crypto` de Node : on refait la vérification HMAC en
   WebCrypto. Le format est celui de api/_auth.js : base64url(JSON).base64url(HMAC-SHA256).
   Aucun second système d'authentification — c'est le même secret et le même token. */

function base64urlEnBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const comble = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const brut = atob(comble);
  const out = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) out[i] = brut.charCodeAt(i);
  return out;
}

export async function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== 'string' || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;

    const cle = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valide = await crypto.subtle.verify(
      'HMAC', cle, base64urlEnBytes(sig), new TextEncoder().encode(data)
    );
    if (!valide) return null;

    const body = JSON.parse(new TextDecoder().decode(base64urlEnBytes(data)));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch (_) {
    return null;   // token malformé : refus, jamais d'exception
  }
}

/* Même repli que côté API : les tokens émis avant l'ajout de `org` n'en ont pas,
   et leur porteur est alors sa propre structure. */
export function orgOfToken(payload) {
  return (payload && payload.org) || (payload && payload.u) || null;
}
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/ws-auth.test.js"
```

Attendu : 6 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add ws-server/src/auth.js test/ws-auth.test.js
git commit -m "Serveur temps reel : verification du token VisionScore en WebCrypto"
```

---

### Task 3 : la salle — connexion, présence, diffusion

**Fichiers :**
- Modifier : `ws-server/src/index.js`

Pas de test automatisé ici (comportement WebSocket) — vérification manuelle à l'étape 3,
puis vérification end-to-end en Task 8.

- [ ] **Étape 1 : implémenter**

Remplacer entièrement `ws-server/src/index.js` :

```js
/* Serveur temps réel des salles de draft.
   Un Durable Object = une salle. Il fait autorité : les opérations sont appliquées ici
   avec draft-engine.js (le MÊME fichier que le navigateur), pour qu'un client ne puisse
   jamais imposer un état truqué. */
import VSDraft from '../../draft-engine.js';
import { verifyToken, orgOfToken } from './auth.js';

export class DraftRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  // Chaque connexion porte son identité, attachée à la socket : elle survit à
  // l'hibernation, contrairement à une variable d'instance.
  infos(ws) {
    try { return JSON.parse(this.state.getTags(ws)[0] || '{}'); } catch (_) { return {}; }
  }

  async lireEtat() { return (await this.state.storage.get('etat')) || null; }
  async ecrireEtat(e) { await this.state.storage.put('etat', e); }

  async fetch(request) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const bo = parseInt(url.searchParams.get('bo') || '1', 10);

    const payload = await verifyToken(token, this.env.SESSION_SECRET);
    if (!payload) return new Response('non authentifié', { status: 401 });
    const org = orgOfToken(payload);

    // La salle appartient à la structure qui l'a créée. Un lien qui fuite ne donne
    // donc rien à quelqu'un d'une autre structure.
    const proprietaire = await this.state.storage.get('org');
    if (!proprietaire) await this.state.storage.put('org', org);
    else if (proprietaire !== org) return new Response('salle d\'une autre structure', { status: 403 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('websocket attendu', { status: 426 });
    }

    let etat = await this.lireEtat();
    if (!etat) {
      etat = VSDraft.createState({ bo: (bo === 3 || bo === 5) ? bo : 1, firstSide: 'blue' });
      await this.ecrireEtat(etat);
    }

    const paire = new WebSocketPair();
    const [client, serveur] = Object.values(paire);

    // acceptWebSocket (et non accept) : c'est l'API d'hibernation. Sans elle, la salle
    // serait facturée tant qu'une socket est ouverte, même inactive.
    this.state.acceptWebSocket(serveur, [JSON.stringify({ u: payload.u, org })]);

    serveur.send(JSON.stringify({ type: 'state', state: etat }));
    this.diffuserPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  diffuser(message, sauf) {
    const brut = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      if (ws === sauf) continue;
      try { ws.send(brut); } catch (_) { /* socket morte : le runtime la nettoiera */ }
    }
  }

  diffuserPresence() {
    const gens = this.state.getWebSockets().map(ws => this.infos(ws).u).filter(Boolean);
    this.diffuser({ type: 'presence', users: [...new Set(gens)] });
  }

  async webSocketMessage(ws, brut) {
    let msg;
    try { msg = JSON.parse(brut); } catch (_) { return; }
    if (msg.type !== 'op') return;

    const etat = await this.lireEtat();
    if (!etat) return;

    // L'autorité est ici : le client propose, le serveur dispose.
    const r = VSDraft.apply(etat, msg.op, Date.now());
    if (r.error) { ws.send(JSON.stringify({ type: 'error', message: r.error })); return; }

    await this.ecrireEtat(r.state);
    this.diffuser({ type: 'state', state: r.state });
    ws.send(JSON.stringify({ type: 'state', state: r.state }));
  }

  async webSocketClose(ws) { this.diffuserPresence(); }
  async webSocketError(ws) { this.diffuserPresence(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');

    const m = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{6,64})$/);
    if (!m) return new Response('introuvable', { status: 404 });

    const id = env.DRAFT_ROOMS.idFromName(m[1]);
    return env.DRAFT_ROOMS.get(id).fetch(request);
  }
};
```

- [ ] **Étape 2 : configurer le secret en local**

Créer `ws-server/.dev.vars` (⚠️ **ne jamais committer**) :

```
SESSION_SECRET=test-secret
```

Vérifier qu'il est ignoré par git :

```bash
grep -q "^\.dev\.vars$\|^ws-server/\.dev\.vars$" .gitignore || printf '\n# Secrets locaux du serveur temps reel\nws-server/.dev.vars\n' >> .gitignore
git check-ignore ws-server/.dev.vars && echo "OK : ignore par git"
```

Attendu : `OK : ignoré par git`.

- [ ] **Étape 3 : vérifier la connexion**

Démarrer `npx wrangler dev --port 8788` dans `ws-server/`, puis dans un autre terminal :

```bash
node -e "
const crypto = require('node:crypto');
const body = { u:'alan', org:'galions', exp: Math.floor(Date.now()/1000)+3600 };
const data = Buffer.from(JSON.stringify(body)).toString('base64url');
const sig = crypto.createHmac('sha256','test-secret').update(data).digest('base64url');
const ws = new WebSocket('ws://127.0.0.1:8788/room/salle-test-01?token=' + data + '.' + sig + '&bo=3');
ws.onmessage = e => { const m = JSON.parse(e.data); console.log('recu :', m.type, m.type==='state' ? ('bo='+m.state.format.bo+' fearless='+m.state.format.fearless) : JSON.stringify(m.users||'')); if (m.type==='state') { ws.send(JSON.stringify({type:'op', op:{type:'start'}})); setTimeout(()=>process.exit(0), 800); } };
ws.onerror = e => { console.log('ERREUR de connexion'); process.exit(1); };
"
```

Attendu : `recu : state bo=3 fearless=true` puis un second `state`. Un token invalide
(modifier une lettre) doit provoquer `ERREUR de connexion`.

- [ ] **Étape 4 : commit**

```bash
git add ws-server/src/index.js .gitignore
git commit -m "Serveur temps reel : salle autoritaire avec presence et diffusion"
```

---

### Task 4 : curseurs

**Fichiers :**
- Modifier : `ws-server/src/index.js`

- [ ] **Étape 1 : implémenter**

Dans `webSocketMessage`, avant le traitement des opérations, insérer :

```js
    // Les curseurs sont éphémères : relayés tels quels, jamais persistés. Ils
    // n'ont aucun intérêt une fois la session terminée.
    if (msg.type === 'cursor') {
      this.diffuser({ type: 'cursor', from: this.infos(ws).u, x: msg.x, y: msg.y }, ws);
      return;
    }
```

- [ ] **Étape 2 : vérifier**

Relancer `wrangler dev`, ouvrir deux connexions et vérifier qu'un `cursor` émis par l'une
arrive à l'autre et **pas** à l'émettrice :

```bash
node -e "
const crypto = require('node:crypto');
function tok(u){ const b={u,org:'galions',exp:Math.floor(Date.now()/1000)+3600}; const d=Buffer.from(JSON.stringify(b)).toString('base64url'); return d+'.'+crypto.createHmac('sha256','test-secret').update(d).digest('base64url'); }
const url = u => 'ws://127.0.0.1:8788/room/salle-curseur-01?token=' + tok(u);
const a = new WebSocket(url('alan')), b = new WebSocket(url('mateo'));
let recuParB = 0, recuParA = 0;
b.onmessage = e => { if (JSON.parse(e.data).type === 'cursor') recuParB++; };
a.onmessage = e => { if (JSON.parse(e.data).type === 'cursor') recuParA++; };
setTimeout(() => a.send(JSON.stringify({ type:'cursor', x: 120, y: 80 })), 900);
setTimeout(() => { console.log('recu par mateo :', recuParB, '| renvoye a alan :', recuParA); process.exit(recuParB === 1 && recuParA === 0 ? 0 : 1); }, 2000);
"
```

Attendu : `recu par mateo : 1 | renvoye a alan : 0`.

- [ ] **Étape 3 : commit**

```bash
git add ws-server/src/index.js
git commit -m "Serveur temps reel : relais des curseurs, jamais persistes"
```

---

### Task 5 : client — connexion et état distant

**Fichiers :**
- Modifier : `app.html`

- [ ] **Étape 1 : implémenter**

Dans `app.html`, juste après la ligne `var _dlState = null, _dlMatch = null, _dlTimer = null, _dlQ = '';`,
ajouter :

```js
/* ── Connexion temps réel à la salle. Le serveur fait autorité : on lui ENVOIE des
   opérations et on applique l'état qu'il renvoie. En local, `dlSelect` continue de
   fonctionner sans salle (simulation solo). ── */
var _dlWS = null, _dlRoom = null, _dlPeers = [], _dlCursors = {};
var VS_WS_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'ws://127.0.0.1:8788' : 'wss://visionscore-draft.visionscore.workers.dev';

function dlRoomId(m) { return 'vs-' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '') + '-01'; }

function dlConnect(m) {
  dlDisconnect();
  var t = (typeof vsToken === 'function') ? vsToken() : '';
  if (!t) { showToast('Connecte-toi pour ouvrir une salle partagée.', 'warning'); return; }
  _dlRoom = dlRoomId(m);
  var url = VS_WS_BASE + '/room/' + _dlRoom + '?token=' + encodeURIComponent(t) + '&bo=' + (m.bo || 1);
  try { _dlWS = new WebSocket(url); } catch (_) { showToast('Salle injoignable.', 'error'); return; }

  _dlWS.onmessage = function (e) {
    var msg; try { msg = JSON.parse(e.data); } catch (_) { return; }
    if (msg.type === 'state') {
      msg.state._matchId = m.id;
      _dlState = msg.state;
      dlRender(m);
    } else if (msg.type === 'presence') {
      _dlPeers = msg.users || [];
      dlRenderPresence();
    } else if (msg.type === 'cursor') {
      dlShowCursor(msg.from, msg.x, msg.y);
    } else if (msg.type === 'error') {
      showToast(msg.message, 'warning');
    }
  };
  _dlWS.onclose = function () { _dlWS = null; dlRenderPresence(); };
  _dlWS.onerror = function () { showToast('Connexion à la salle perdue.', 'warning'); };
}

function dlDisconnect() {
  if (_dlWS) { try { _dlWS.close(); } catch (_) {} _dlWS = null; }
  _dlPeers = []; _dlCursors = {};
  document.querySelectorAll('.dl-cursor').forEach(function (n) { n.remove(); });
}

function dlPartage() { return !!(_dlWS && _dlWS.readyState === 1); }

/* Toute mutation passe par ici : en salle on propose au serveur, en solo on applique
   localement. Une seule porte d'entrée, donc aucun risque de divergence. */
function dlEnvoyer(op) {
  if (dlPartage()) { _dlWS.send(JSON.stringify({ type: 'op', op: op })); return true; }
  var r = VSDraft.apply(_dlState, op, Date.now());
  if (r.error) { showToast(r.error, 'warning'); return false; }
  r.state._matchId = _dlState._matchId; _dlState = r.state;
  dlRender(_dlMatch);
  return true;
}

function dlRenderPresence() {
  var el = document.getElementById('dl-presence'); if (!el) return;
  el.innerHTML = dlPartage()
    ? '<span class="dl-live">En salle</span>' + _dlPeers.map(function (u) {
        return '<span class="dl-peer">' + anEsc(u) + '</span>'; }).join('')
    : '<span class="dl-solo">Solo</span>';
}
```

Puis remplacer le corps des cinq fonctions de mutation pour qu'elles passent toutes par
`dlEnvoyer`. Remplacer `dlConfigure`, `dlSelect`, `dlNextGame` et `dlReplay` par :

```js
function dlConfigure(side) { dlEnvoyer({ type: 'configure', firstSide: side }); }

function dlSelect(champKey) {
  var step = VSDraft.currentStep(_dlState); if (!step) return;
  dlEnvoyer({ type: 'select', by: step.by, champion: champKey });
}

function dlNextGame() { dlEnvoyer({ type: 'nextGame' }); }
function dlReplay() { dlEnvoyer({ type: 'replay' }); }
```

Et dans `dlStart`, remplacer les trois lignes qui appliquent `configure` puis `start` par :

```js
  var t = parseInt((document.getElementById('dl-turn') || {}).value, 10);
  var rs = parseInt((document.getElementById('dl-res') || {}).value, 10);
  dlEnvoyer({ type: 'configure', turnSeconds: isNaN(t) ? 30 : t, reserveSeconds: isNaN(rs) ? 0 : rs });
  dlEnvoyer({ type: 'start' });
```

Enfin, dans `dlStartTimer`, remplacer le bloc d'expiration par une version qui n'agit que
si l'on est seul — sinon deux navigateurs enverraient deux `timeout` pour la même action :

```js
    if (reste <= 0) {
      // En salle, seul le premier participant connecté déclenche l'expiration :
      // le serveur rejetterait les doublons, mais autant ne pas les émettre.
      if (dlPartage() && _dlPeers[0] !== (typeof vsAccount === 'function' ? vsAccount() : '')) return;
      dlEnvoyer({ type: 'timeout' });
    }
```

- [ ] **Étape 2 : ajouter les boutons et l'indicateur**

⚠️ La salle doit pouvoir s'ouvrir **avant** de lancer la draft — sinon un seul coach
configurerait le côté et la priorité, et les autres arriveraient devant le fait accompli.
Le bloc va donc dans les DEUX écrans.

Créer d'abord le fragment commun, juste après `dlRenderPresence` :

```js
function dlBarreSalleHtml() {
  return '<span id="dl-presence" class="dl-presence"></span>'
    + (dlPartage()
      ? '<button class="btn btn-ghost btn-sm" onclick="dlDisconnect();dlRender(_dlMatch)">Quitter la salle</button>'
      : '<button class="btn btn-cta btn-sm" onclick="dlConnect(_dlMatch)">Ouvrir la salle partagée</button>');
}
```

Dans `dlBoardHtml`, dans le bloc `dl-acts`, avant le bouton « Quitter » :

```js
  h += dlBarreSalleHtml();
```

Dans `dlLobbyHtml`, à l'intérieur du `<div class="dl-lobby-row">`, après le bouton
« Lancer la draft » :

```js
      + '<span class="dl-lobby-salle">' + dlBarreSalleHtml() + '</span>'
```

Et dans `dlRender`, à la toute fin, appeler `dlRenderPresence();`.

- [ ] **Étape 3 : vérifier**

Démarrer `wrangler dev` et le serveur statique, ouvrir **deux onglets** sur
`http://localhost:3000/app.html`, se connecter, ouvrir la salle sur le même match dans les
deux, puis bannir un champion dans l'un.

Attendu : le ban apparaît dans l'autre onglet en moins d'une seconde, et l'indicateur
affiche « En salle » avec les deux comptes.

- [ ] **Étape 4 : commit**

```bash
git add app.html
git commit -m "Draft live : connexion a la salle partagee, le serveur fait autorite"
```

---

### Task 6 : curseurs côté client

**Fichiers :**
- Modifier : `app.html`

- [ ] **Étape 1 : implémenter**

Après `dlRenderPresence`, ajouter :

```js
/* Curseurs des autres coachs. Position exprimée en pourcentage du plateau : chacun
   ayant une fenêtre de taille différente, des pixels bruts pointeraient à côté.
   Débit limité à ~20 messages/s — au-delà, l'œil ne voit plus la différence. */
var _dlLastCursor = 0;
function dlBindCursor() {
  var zone = document.getElementById('ss-live'); if (!zone || zone._dlBound) return;
  zone._dlBound = true;
  zone.addEventListener('mousemove', function (e) {
    if (!dlPartage()) return;
    var t = Date.now(); if (t - _dlLastCursor < 50) return;
    _dlLastCursor = t;
    var r = zone.getBoundingClientRect();
    _dlWS.send(JSON.stringify({
      type: 'cursor',
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height
    }));
  });
}

var DL_COULEURS = ['#2DD4A7', '#4A9EFF', '#E6B23E', '#C084FC', '#FF7A5A'];
function dlCouleur(nom) {
  var h = 0; for (var i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 997;
  return DL_COULEURS[h % DL_COULEURS.length];
}

function dlShowCursor(nom, x, y) {
  if (!nom) return;
  var zone = document.getElementById('ss-live'); if (!zone) return;
  var el = _dlCursors[nom];
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.className = 'dl-cursor';
    el.innerHTML = '<svg width="14" height="18" viewBox="0 0 14 18"><path d="M1 1l11 7-5 1.4L5.6 15z" fill="' + dlCouleur(nom) + '" stroke="rgba(0,0,0,.4)"/></svg>'
      + '<span style="background:' + dlCouleur(nom) + '">' + anEsc(nom) + '</span>';
    zone.appendChild(el);
    _dlCursors[nom] = el;
  }
  var r = zone.getBoundingClientRect();
  el.style.transform = 'translate(' + (x * r.width) + 'px,' + (y * r.height) + 'px)';
  clearTimeout(el._t);
  // Un curseur immobile depuis 10 s appartient sans doute à quelqu'un qui a fermé
  // l'onglet : on le retire plutôt que de laisser un fantôme.
  el._t = setTimeout(function () { el.remove(); delete _dlCursors[nom]; }, 10000);
}
```

Appeler `dlBindCursor();` à la fin de `dlRender`, juste après `dlRenderPresence();`.

- [ ] **Étape 2 : ajouter le style**

Dans le bloc CSS de la draft live (après `.dl-sc-prep-l img`), ajouter :

```css
.dl-cursor{ position:absolute; top:0; left:0; pointer-events:none; z-index:40; transition:transform .08s linear; display:flex; align-items:flex-start; gap:3px; }
.dl-cursor span{ font-size:9.5px; font-weight:800; color:#04211C; padding:1px 5px; border-radius:5px; white-space:nowrap; }
.dl-presence{ display:inline-flex; align-items:center; gap:5px; margin-right:6px; }
.dl-live{ font-size:10px; font-weight:800; letter-spacing:.05em; padding:3px 9px; border-radius:999px; background:var(--vs-emerald-500); color:#04211C; }
.dl-solo{ font-size:10px; font-weight:700; padding:3px 9px; border-radius:999px; border:1px solid var(--vs-forest-500); color:var(--vs-fg-3); }
.dl-peer{ font-size:10px; padding:3px 8px; border-radius:999px; border:1px solid var(--vs-forest-500); color:var(--vs-fg-2); }
.dl-lobby-salle{ display:inline-flex; align-items:center; gap:6px; margin-left:auto; }
```

⚠️ `#ss-live` doit devenir un repère de positionnement, sinon les curseurs se placeraient
par rapport à la page entière. Ajouter :

```css
#ss-live{ position:relative; }
```

- [ ] **Étape 3 : vérifier**

Deux onglets dans la même salle : bouger la souris dans l'un doit faire bouger une flèche
nominative dans l'autre, de façon fluide. Le curseur doit disparaître à la fermeture de
l'onglet.

- [ ] **Étape 4 : commit**

```bash
git add app.html
git commit -m "Draft live : curseurs nominatifs des autres coachs"
```

---

### Task 7 : déploiement du service

Cette tâche exige un **compte Cloudflare** — elle ne peut pas être faite par un agent.
À exécuter par Enzo.

- [ ] **Étape 1 : se connecter à Cloudflare**

```bash
cd ws-server && npx wrangler login
```

- [ ] **Étape 2 : poser le secret**

Il doit être **identique** à celui de Vercel, sinon aucun token ne sera reconnu.

```bash
npx wrangler secret put SESSION_SECRET
```

Coller la valeur de `SESSION_SECRET` telle qu'elle est dans Vercel.

- [ ] **Étape 3 : déployer**

```bash
npx wrangler deploy
```

Noter l'URL affichée (de la forme `https://visionscore-draft.<compte>.workers.dev`).

- [ ] **Étape 4 : vérifier**

```bash
curl -s https://visionscore-draft.<compte>.workers.dev/health
```

Attendu : `ok`.

- [ ] **Étape 5 : aligner l'URL côté client**

Dans `app.html`, remplacer la valeur de repli de `VS_WS_BASE` par l'URL réelle, en `wss://`.

```bash
git add app.html
git commit -m "Draft live : pointe vers le service temps reel deploye"
```

---

### Task 8 : vérification end-to-end et mise en production

- [ ] **Étape 1 : lancer toute la suite**

```bash
node --test "test/*.test.js"
```

Attendu : 74 tests existants + 6 nouveaux = 80, tous au vert.

- [ ] **Étape 2 : se synchroniser avec le dépôt partagé**

```bash
git fetch --all && git log --oneline -1 && git log --oneline -1 origin/main
```

Si divergence : `git pull --rebase origin main`, puis relancer les tests.

- [ ] **Étape 3 : pousser et vérifier le déploiement**

```bash
git push origin main
curl -s "https://api.github.com/repos/carneiroenzo70-crypto/scoutinglab/commits/$(git rev-parse --short HEAD)/status"
```

Attendu : `"state": "success"`.

- [ ] **Étape 4 : vérification à deux comptes en production**

Enzo et Mateo ouvrent `https://visionscore.gg/app`, vont sur le **même match** de Seasons,
onglet « Draft live », et cliquent « Ouvrir la salle partagée ».

Attendu :
1. L'indicateur passe à « En salle » et affiche les deux comptes.
2. Un ban posé par l'un apparaît chez l'autre en moins d'une seconde.
3. Les curseurs de chacun sont visibles et nominatifs.
4. Le chrono affiche la même valeur des deux côtés (à la seconde près).
5. Le camp qui n'a pas la main ne peut pas cliquer un champion.

- [ ] **Étape 5 : vérifier l'isolation entre structures**

Depuis un compte d'une **autre** structure, tenter d'ouvrir la même salle.

Attendu : refus (le service répond 403, la connexion échoue). **C'est la vérification de
sécurité la plus importante du plan** — une salle ne doit jamais être accessible hors de sa
structure.

---

## Ce que ce plan ne fait pas

- **Aucun mode « scénario libre » collaboratif.** Seule la draft live est partagée ; la
  préparation de scénarios reste locale et souffre encore du dernier-écrivain-gagne
  (cf. limite connue dans `CLAUDE.md`).
- **Aucune reconnexion automatique.** Si la connexion tombe, il faut rouvrir la salle. À
  ajouter si ça se produit en usage réel.
- **Pas de repli HTTP** (prévu § 4.4 de la spec). En cas de service injoignable, l'écran
  retombe en **mode solo** : la draft reste utilisable, mais sans partage. C'est une
  dégradation acceptable pour une simulation d'entraînement ; un vrai repli synchronisé
  n'aurait de sens que si le service s'avérait instable en usage réel.
- **Une seule salle par match** (`vs-<matchId>-01`). Suffisant tant qu'un staff ne prépare
  pas deux drafts du même match en parallèle.
