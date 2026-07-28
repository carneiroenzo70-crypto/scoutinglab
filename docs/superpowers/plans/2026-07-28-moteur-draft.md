# Moteur de draft (machine à états) — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** implémenter les règles de la draft compétitive sous forme de **fonction pure**,
testable sans réseau, sans navigateur et sans serveur.

**Architecture :** un module autonome `draft-engine.js` à la racine, écrit en UMD pour être
`require`-able par Node (tests + futur serveur WebSocket) *et* chargeable par `app.html` via
une balise `<script>`. Aucune dépendance. L'état est du JSON pur ; `apply(state, op, now)`
renvoie un **nouvel** état sans muter l'entrée, et l'horloge est **injectée** (`now`) pour que
les tests de chrono soient déterministes.

**Pile technique :** JavaScript ES5 (même contrainte que `app.html`), runner de tests intégré
à Node, zéro dépendance.

**Spec de référence :** `docs/superpowers/specs/2026-07-28-salle-draft-collaborative-design.md` § 2 et § 4.2

---

## Pourquoi ce plan ne produit aucune interface

C'est délibéré. Les règles de draft sont l'endroit où une erreur coûte le plus cher — elle
serait invisible à l'œil et fausserait toute préparation de match. Les isoler dans une
fonction pure permet de les vérifier exhaustivement (les 20 actions, le fearless, le chrono)
sans monter un serveur ni cliquer dans une interface.

Ce module sera consommé **deux fois** : par le navigateur pour l'affichage, et par le serveur
WebSocket qui applique les opérations de façon autoritaire (un client ne doit jamais pouvoir
imposer un état). D'où le fichier partagé plutôt qu'un bloc dans `app.html` — deux copies
divergeraient, et la copie serveur est celle qui fait autorité.

---

## Décisions de conception à respecter

**Le côté ne détermine plus l'ordre de draft.** Depuis First Selection (2026), une équipe peut
être côté bleu et drafter en second. La séquence est donc exprimée en **`first` / `second`
drafteur**, et le côté (`blue` / `red`) n'est qu'un attribut d'affichage. `createState` prend
un seul `firstSide` et en déduit l'autre : un état incohérent (deux équipes du même côté)
est **impossible à représenter**.

**Fearless.** Un champion **piké** devient indisponible **aux deux équipes** pour tout le reste
du BO. Un champion **banni** redevient disponible à la game suivante. Activé automatiquement
en BO3/BO5, jamais en BO1.

**Chrono.** 30 s par action par défaut, bans comme picks. La réserve est un crédit par équipe :
l'échéance affichée vaut `30 s + réserve restante`, et tout dépassement des 30 s est déduit de
la réserve.

---

## Structure des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `draft-engine.js` | règles de draft, fonction pure, aucune dépendance | **créer** |
| `test/draft-engine.test.js` | vérification exhaustive des règles | **créer** |

Rien d'autre n'est touché. `app.html` et le serveur WebSocket consommeront ce module dans les
plans suivants.

---

### Task 1 : squelette du module, séquence officielle, création d'état

**Fichiers :**
- Créer : `draft-engine.js`
- Test : `test/draft-engine.test.js` (créer)

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `test/draft-engine.test.js` :

```js
const test = require('node:test');
const assert = require('node:assert');

const D = require('../draft-engine');

test('la sequence compte 20 actions : 10 bans et 10 picks', () => {
  assert.equal(D.SEQUENCE.length, 20);
  assert.equal(D.SEQUENCE.filter(s => s.type === 'ban').length, 10);
  assert.equal(D.SEQUENCE.filter(s => s.type === 'pick').length, 10);
});

test('la sequence respecte l\'ordre officiel', () => {
  const lettre = s => (s.type === 'ban' ? 'B' : 'P') + (s.by === 'first' ? '1' : '2');
  assert.deepEqual(D.SEQUENCE.map(lettre), [
    // 3 bans chacun, le 1er drafteur ouvre
    'B1', 'B2', 'B1', 'B2', 'B1', 'B2',
    // first pick au 1er, puis 2 au 2nd, 2 au 1er, 1 au 2nd
    'P1', 'P2', 'P2', 'P1', 'P1', 'P2',
    // 2 bans chacun, le 2nd drafteur ouvre cette phase
    'B2', 'B1', 'B2', 'B1',
    // 1 pick au 2nd, 2 au 1er, last pick au 2nd
    'P2', 'P1', 'P1', 'P2'
  ]);
});

test('le cote et l\'ordre de draft sont independants (First Selection)', () => {
  const bleuEnPremier = D.createState({ bo: 1, firstSide: 'blue' });
  assert.deepEqual(bleuEnPremier.sides, { first: 'blue', second: 'red' });

  // Depuis 2026 une equipe peut etre cote ROUGE et drafter en PREMIER.
  const rougeEnPremier = D.createState({ bo: 1, firstSide: 'red' });
  assert.deepEqual(rougeEnPremier.sides, { first: 'red', second: 'blue' });
});

test('le fearless est deduit du BO : jamais en BO1, toujours en BO3/BO5', () => {
  assert.equal(D.createState({ bo: 1 }).format.fearless, false);
  assert.equal(D.createState({ bo: 3 }).format.fearless, true);
  assert.equal(D.createState({ bo: 5 }).format.fearless, true);
});

test('un etat neuf est en lobby avec une game vide', () => {
  const s = D.createState({ bo: 3 });
  assert.equal(s.status, 'lobby');
  assert.equal(s.gameIndex, 0);
  assert.equal(s.games.length, 1);
  assert.deepEqual(s.games[0].actions, []);
  assert.deepEqual(s.usedChampions, []);
  assert.equal(s.format.turnSeconds, 30, '30 s par action en Tournament Draft');
  assert.equal(s.format.reserveSeconds, 0, 'reserve nulle par defaut, a confirmer par la ligue');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : ÉCHEC — `Cannot find module '../draft-engine'`.

- [ ] **Étape 3 : implémenter**

Créer `draft-engine.js` à la racine :

```js
/* Moteur de draft compétitive — fonction pure, aucune dépendance.
   Chargé DEUX FOIS : par app.html (affichage) et par le serveur WebSocket, qui
   applique les opérations de façon autoritaire. D'où le fichier partagé : deux
   copies divergeraient, et c'est la copie serveur qui fait foi.
   Écrit en ES5 pour rester cohérent avec app.html. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VSDraft = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* Séquence officielle du Tournament Draft, exprimée en 1er/2nd DRAFTEUR et non en
     bleu/rouge : depuis First Selection (2026) le côté de la carte et l'ordre de draft
     se choisissent séparément, un même côté peut donc drafter en premier ou en second. */
  var SEQUENCE = [
    { type: 'ban',  by: 'first'  }, { type: 'ban',  by: 'second' },
    { type: 'ban',  by: 'first'  }, { type: 'ban',  by: 'second' },
    { type: 'ban',  by: 'first'  }, { type: 'ban',  by: 'second' },
    { type: 'pick', by: 'first'  },
    { type: 'pick', by: 'second' }, { type: 'pick', by: 'second' },
    { type: 'pick', by: 'first'  }, { type: 'pick', by: 'first'  },
    { type: 'pick', by: 'second' },
    { type: 'ban',  by: 'second' }, { type: 'ban',  by: 'first'  },
    { type: 'ban',  by: 'second' }, { type: 'ban',  by: 'first'  },
    { type: 'pick', by: 'second' },
    { type: 'pick', by: 'first'  }, { type: 'pick', by: 'first'  },
    { type: 'pick', by: 'second' }
  ];

  function createGame() {
    return { actions: [], phaseStartedAt: null, phaseEndsAt: null, reserve: null, done: false };
  }

  function createState(opts) {
    opts = opts || {};
    var bo = (opts.bo === 3 || opts.bo === 5) ? opts.bo : 1;
    // Un seul côté est fourni : l'autre s'en déduit. Deux équipes du même côté
    // deviennent ainsi impossibles à représenter.
    var firstSide = opts.firstSide === 'red' ? 'red' : 'blue';
    return {
      format: {
        bo: bo,
        fearless: bo > 1,   // fearless en BO3/BO5, jamais en BO1
        turnSeconds: opts.turnSeconds != null ? opts.turnSeconds : 30,
        reserveSeconds: opts.reserveSeconds != null ? opts.reserveSeconds : 0
      },
      sides: { first: firstSide, second: firstSide === 'blue' ? 'red' : 'blue' },
      status: 'lobby',
      gameIndex: 0,
      games: [createGame()],
      usedChampions: []
    };
  }

  return { SEQUENCE: SEQUENCE, createGame: createGame, createState: createState };
});
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 5 tests passent.

- [ ] **Étape 5 : vérifier que le module sera bien servi en production**

`draft-engine.js` doit être téléversé sur Vercel (le navigateur devra le charger).

```bash
grep -n "draft-engine" .vercelignore || echo "OK : non exclu, le fichier sera servi"
```

Attendu : `OK : non exclu, le fichier sera servi`.

- [ ] **Étape 6 : commit**

```bash
git add draft-engine.js test/draft-engine.test.js
git commit -m "Moteur de draft : sequence officielle et creation d'etat"
```

---

### Task 2 : étape courante et démarrage

**Fichiers :**
- Modifier : `draft-engine.js`
- Test : `test/draft-engine.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/draft-engine.test.js` :

```js
const T0 = 1_700_000_000_000;   // horloge fixe : les tests du chrono doivent etre deterministes

test('aucune etape courante tant que la draft n\'a pas demarre', () => {
  assert.equal(D.currentStep(D.createState({ bo: 1 })), null);
});

test('demarrer place la draft sur le premier ban du 1er drafteur', () => {
  const r = D.apply(D.createState({ bo: 1 }), { type: 'start' }, T0);
  assert.equal(r.error, null);
  assert.equal(r.state.status, 'running');
  assert.deepEqual(D.currentStep(r.state), { index: 0, type: 'ban', by: 'first' });
});

test('demarrer deux fois est refuse', () => {
  const r1 = D.apply(D.createState({ bo: 1 }), { type: 'start' }, T0);
  const r2 = D.apply(r1.state, { type: 'start' }, T0);
  assert.ok(r2.error, 'un second demarrage doit etre refuse');
});

test('apply ne mute jamais l\'etat recu', () => {
  const avant = D.createState({ bo: 1 });
  const copie = JSON.parse(JSON.stringify(avant));
  D.apply(avant, { type: 'start' }, T0);
  assert.deepEqual(avant, copie, 'l\'etat d\'entree doit rester intact');
});

test('une operation inconnue est refusee sans rien changer', () => {
  const s = D.createState({ bo: 1 });
  const r = D.apply(s, { type: 'nimporte-quoi' }, T0);
  assert.ok(r.error);
  assert.equal(r.state.status, 'lobby');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : ÉCHEC — `D.currentStep is not a function`.

- [ ] **Étape 3 : implémenter**

Dans `draft-engine.js`, avant le `return`, ajouter :

```js
  function clone(state) { return JSON.parse(JSON.stringify(state)); }
  function ok(state) { return { state: state, error: null }; }
  function err(state, message) { return { state: state, error: message }; }

  /* L'étape attendue maintenant, ou null si la draft n'est pas en cours. */
  function currentStep(state) {
    if (!state || state.status !== 'running') return null;
    var g = state.games[state.gameIndex];
    if (!g || g.done) return null;
    var i = g.actions.length;
    if (i >= SEQUENCE.length) return null;
    return { index: i, type: SEQUENCE[i].type, by: SEQUENCE[i].by };
  }

  /* Arme le chrono de l'étape à venir. L'échéance vaut le temps de base PLUS la réserve
     restante de l'équipe concernée : c'est bien le délai maximum dont elle dispose. */
  function armerChrono(state, game, now) {
    var suivant = SEQUENCE[game.actions.length];
    game.phaseStartedAt = now;
    game.phaseEndsAt = now + state.format.turnSeconds * 1000 + game.reserve[suivant.by];
  }

  function apply(state, op, now) {
    var type = op && op.type;
    if (type === 'start') {
      if (state.status !== 'lobby') return err(state, 'La draft a déjà démarré');
      var s = clone(state);
      var g = s.games[s.gameIndex];
      s.status = 'running';
      g.reserve = { first: s.format.reserveSeconds * 1000, second: s.format.reserveSeconds * 1000 };
      armerChrono(s, g, now);
      return ok(s);
    }
    return err(state, 'Opération inconnue : ' + type);
  }
```

Puis remplacer la ligne `return { ... };` finale par :

```js
  return {
    SEQUENCE: SEQUENCE, createGame: createGame, createState: createState,
    currentStep: currentStep, apply: apply
  };
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 10 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add draft-engine.js test/draft-engine.test.js
git commit -m "Moteur de draft : etape courante et demarrage"
```

---

### Task 3 : sélection d'un champion et respect du tour

**Fichiers :**
- Modifier : `draft-engine.js`
- Test : `test/draft-engine.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/draft-engine.test.js` :

```js
// Raccourci : demarre une draft et enchaine des selections valides.
function draftDemarree(opts) {
  return D.apply(D.createState(opts || { bo: 1 }), { type: 'start' }, T0).state;
}

test('le drafteur dont c\'est le tour peut bannir', () => {
  const r = D.apply(draftDemarree(), { type: 'select', by: 'first', champion: 'Ambessa' }, T0 + 5000);
  assert.equal(r.error, null);
  assert.deepEqual(r.state.games[0].actions[0], { type: 'ban', by: 'first', champion: 'Ambessa' });
  assert.deepEqual(D.currentStep(r.state), { index: 1, type: 'ban', by: 'second' });
});

test('jouer hors de son tour est refuse', () => {
  const r = D.apply(draftDemarree(), { type: 'select', by: 'second', champion: 'Ambessa' }, T0 + 5000);
  assert.ok(r.error, 'le 2nd drafteur ne peut pas jouer le premier ban');
  assert.equal(r.state.games[0].actions.length, 0, 'rien ne doit etre enregistre');
});

test('selectionner sans champion est refuse', () => {
  const r = D.apply(draftDemarree(), { type: 'select', by: 'first' }, T0 + 5000);
  assert.ok(r.error);
});

test('selectionner avant le demarrage est refuse', () => {
  const r = D.apply(D.createState({ bo: 1 }), { type: 'select', by: 'first', champion: 'Ambessa' }, T0);
  assert.ok(r.error);
});

test('la draft complete enchaine bien les 20 actions', () => {
  let s = draftDemarree();
  for (let i = 0; i < 20; i++) {
    const step = D.currentStep(s);
    assert.ok(step, 'une etape doit exister a l\'index ' + i);
    const r = D.apply(s, { type: 'select', by: step.by, champion: 'Champion' + i }, T0 + i * 1000);
    assert.equal(r.error, null, 'action ' + i + ' : ' + r.error);
    s = r.state;
  }
  assert.equal(s.games[0].actions.length, 20);
  assert.equal(s.games[0].done, true);
  assert.equal(D.currentStep(s), null, 'plus aucune action attendue');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : ÉCHEC — l'opération `select` est refusée comme inconnue.

- [ ] **Étape 3 : implémenter**

Dans `draft-engine.js`, ajouter avant `function apply` :

```js
  /* Champions indisponibles à cet instant. Deux sources :
     — tout ce qui est déjà posé dans la game courante (bans ET picks) ;
     — en fearless, les champions PIKÉS dans les games précédentes du BO, pour les
       DEUX équipes. Les champions BANNIS, eux, redeviennent disponibles. */
  function unavailable(state) {
    var out = {};
    (state.usedChampions || []).forEach(function (c) { out[c] = true; });
    var g = state.games[state.gameIndex];
    if (g) g.actions.forEach(function (a) { if (a.champion) out[a.champion] = true; });
    return out;
  }

  /* Enregistre l'action courante puis arme l'étape suivante. `champion` vaut null
     quand le temps est écoulé : l'emplacement reste vide et la draft continue. */
  function avancer(s, now, champion) {
    var g = s.games[s.gameIndex];
    var step = SEQUENCE[g.actions.length];
    g.actions.push({ type: step.type, by: step.by, champion: champion || null });
    if (g.actions.length >= SEQUENCE.length) {
      g.done = true;
      g.phaseStartedAt = null;
      g.phaseEndsAt = null;
    } else {
      armerChrono(s, g, now);
    }
    return s;
  }
```

Puis, dans `apply`, insérer avant le `return err(state, 'Opération inconnue…')` :

```js
    if (type === 'select') {
      var step = currentStep(state);
      if (!step) return err(state, 'Aucune action attendue');
      if (op.by !== step.by) return err(state, "Ce n'est pas au " + (op.by === 'first' ? '1er' : '2nd') + ' drafteur de jouer');
      if (!op.champion) return err(state, 'Champion manquant');
      if (unavailable(state)[op.champion]) return err(state, op.champion + " n'est plus disponible");
      return ok(avancer(clone(state), now, op.champion));
    }
```

Enfin, exposer `unavailable` dans le `return` final :

```js
  return {
    SEQUENCE: SEQUENCE, createGame: createGame, createState: createState,
    currentStep: currentStep, unavailable: unavailable, apply: apply
  };
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 15 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add draft-engine.js test/draft-engine.test.js
git commit -m "Moteur de draft : selection avec respect du tour"
```

---

### Task 4 : un champion ne peut pas être pris deux fois dans une game

**Fichiers :**
- Test : `test/draft-engine.test.js` (le code de Task 3 couvre déjà la règle — cette tâche
  la verrouille par des tests et corrige si nécessaire)

- [ ] **Étape 1 : écrire les tests**

Ajouter à la fin de `test/draft-engine.test.js` :

```js
test('un champion deja banni ne peut pas etre rebanni dans la meme game', () => {
  let s = draftDemarree();
  s = D.apply(s, { type: 'select', by: 'first', champion: 'Ambessa' }, T0 + 1000).state;
  const r = D.apply(s, { type: 'select', by: 'second', champion: 'Ambessa' }, T0 + 2000);
  assert.ok(r.error, 'Ambessa est deja banni');
});

test('un champion deja banni ne peut pas etre pike dans la meme game', () => {
  let s = draftDemarree();
  // On consomme les 6 bans, en bannissant Ambessa au premier.
  const bans = ['Ambessa', 'B', 'C', 'D', 'E', 'F'];
  bans.forEach((c, i) => {
    const step = D.currentStep(s);
    s = D.apply(s, { type: 'select', by: step.by, champion: c }, T0 + i * 1000).state;
  });
  const step = D.currentStep(s);
  assert.equal(step.type, 'pick', 'on doit etre en phase de picks');
  const r = D.apply(s, { type: 'select', by: step.by, champion: 'Ambessa' }, T0 + 9000);
  assert.ok(r.error, 'un champion banni ne peut pas etre pike');
});

test('unavailable liste bans et picks de la game courante', () => {
  let s = draftDemarree();
  s = D.apply(s, { type: 'select', by: 'first', champion: 'Ambessa' }, T0 + 1000).state;
  const indispo = D.unavailable(s);
  assert.equal(indispo['Ambessa'], true);
  assert.equal(indispo['Vi'], undefined);
});
```

- [ ] **Étape 2 : lancer les tests**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 18 tests passent — la règle est déjà implémentée par `unavailable` en Task 3.
Si un test échoue, corriger `unavailable` dans `draft-engine.js` avant de continuer.

- [ ] **Étape 3 : commit**

```bash
git add test/draft-engine.test.js
git commit -m "Moteur de draft : verrouille l'unicite des champions dans une game"
```

---

### Task 5 : chronomètre et expiration

**Fichiers :**
- Modifier : `draft-engine.js`
- Test : `test/draft-engine.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/draft-engine.test.js` :

```js
test('le chrono est arme a 30 s par defaut', () => {
  const s = draftDemarree();
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 30_000);
});

test('le chrono est rearme a chaque action', () => {
  const s0 = draftDemarree();
  const s1 = D.apply(s0, { type: 'select', by: 'first', champion: 'Ambessa' }, T0 + 7000).state;
  assert.equal(s1.games[0].phaseStartedAt, T0 + 7000);
  assert.equal(s1.games[0].phaseEndsAt, T0 + 7000 + 30_000);
});

test('le temps ecoule laisse l\'emplacement vide et la draft continue', () => {
  const s = draftDemarree();
  const r = D.apply(s, { type: 'timeout' }, T0 + 30_001);
  assert.equal(r.error, null);
  assert.deepEqual(r.state.games[0].actions[0], { type: 'ban', by: 'first', champion: null });
  assert.deepEqual(D.currentStep(r.state), { index: 1, type: 'ban', by: 'second' });
});

test('on ne peut pas declencher l\'expiration avant l\'echeance', () => {
  const r = D.apply(draftDemarree(), { type: 'timeout' }, T0 + 10_000);
  assert.ok(r.error, 'le temps n\'est pas ecoule');
  assert.equal(r.state.games[0].actions.length, 0);
});

test('la duree du tour est configurable', () => {
  const s = D.apply(D.createState({ bo: 1, turnSeconds: 45 }), { type: 'start' }, T0).state;
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 45_000);
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : ÉCHEC — l'opération `timeout` est refusée comme inconnue.

- [ ] **Étape 3 : implémenter**

Dans `apply`, insérer avant le `return err(state, 'Opération inconnue…')` :

```js
    if (type === 'timeout') {
      var stepT = currentStep(state);
      if (!stepT) return err(state, 'Aucune action en cours');
      var gT = state.games[state.gameIndex];
      if (now < gT.phaseEndsAt) return err(state, "Le temps n'est pas écoulé");
      // Emplacement laissé vide, comme en vrai : la draft ne s'arrête pas.
      return ok(avancer(clone(state), now, null));
    }
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 23 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add draft-engine.js test/draft-engine.test.js
git commit -m "Moteur de draft : chronometre et expiration d'une action"
```

---

### Task 6 : réserve de temps

**Fichiers :**
- Modifier : `draft-engine.js`
- Test : `test/draft-engine.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/draft-engine.test.js` :

```js
test('sans reserve, l\'echeance vaut exactement le temps de base', () => {
  const s = draftDemarree({ bo: 1, reserveSeconds: 0 });
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 30_000);
});

test('l\'echeance inclut la reserve restante de l\'equipe qui joue', () => {
  const s = draftDemarree({ bo: 1, reserveSeconds: 20 });
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 50_000, '30 s + 20 s de reserve');
});

test('depasser le temps de base consomme la reserve, rester dessous ne la touche pas', () => {
  let s = draftDemarree({ bo: 1, reserveSeconds: 20 });
  // 1er drafteur : 38 s → 8 s prises sur sa reserve.
  s = D.apply(s, { type: 'select', by: 'first', champion: 'A' }, T0 + 38_000).state;
  assert.equal(s.games[0].reserve.first, 12_000);
  assert.equal(s.games[0].reserve.second, 20_000, 'la reserve de l\'adversaire est intacte');

  // 2nd drafteur : 10 s → rien de consomme.
  const t1 = s.games[0].phaseStartedAt;
  s = D.apply(s, { type: 'select', by: 'second', champion: 'B' }, t1 + 10_000).state;
  assert.equal(s.games[0].reserve.second, 20_000);
});

test('la reserve epuisee ne devient jamais negative', () => {
  let s = draftDemarree({ bo: 1, reserveSeconds: 5 });
  s = D.apply(s, { type: 'timeout' }, T0 + 35_001).state;
  assert.equal(s.games[0].reserve.first, 0);
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : ÉCHEC — la réserve n'est jamais décrémentée.

- [ ] **Étape 3 : implémenter**

Dans `draft-engine.js`, fonction `avancer`, insérer ce bloc **entre la ligne
`var step = SEQUENCE[g.actions.length];` et la ligne `g.actions.push(...)`** — il a besoin
de `step` et doit s'exécuter avant que l'action ne soit empilée :

```js
    // La réserve est un crédit : seul le dépassement du temps de base y est prélevé.
    var base = s.format.turnSeconds * 1000;
    var ecoule = now - g.phaseStartedAt;
    if (ecoule > base) {
      g.reserve[step.by] = Math.max(0, g.reserve[step.by] - (ecoule - base));
    }
```

La fonction doit donc ressembler à ceci une fois modifiée :

```js
  function avancer(s, now, champion) {
    var g = s.games[s.gameIndex];
    var step = SEQUENCE[g.actions.length];

    // La réserve est un crédit : seul le dépassement du temps de base y est prélevé.
    var base = s.format.turnSeconds * 1000;
    var ecoule = now - g.phaseStartedAt;
    if (ecoule > base) {
      g.reserve[step.by] = Math.max(0, g.reserve[step.by] - (ecoule - base));
    }

    g.actions.push({ type: step.type, by: step.by, champion: champion || null });
    /* …suite inchangée… */
  }
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 27 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add draft-engine.js test/draft-engine.test.js
git commit -m "Moteur de draft : reserve de temps par equipe"
```

---

### Task 7 : fin de game, game suivante et fearless

**Fichiers :**
- Modifier : `draft-engine.js`
- Test : `test/draft-engine.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/draft-engine.test.js` :

```js
// Joue une game complete en nommant les champions <prefixe>0..19.
function jouerGameComplete(s, prefixe) {
  for (let i = 0; i < 20; i++) {
    const step = D.currentStep(s);
    const r = D.apply(s, { type: 'select', by: step.by, champion: prefixe + i }, T0 + i * 1000);
    assert.equal(r.error, null, 'action ' + i + ' : ' + r.error);
    s = r.state;
  }
  return s;
}

test('en BO1, terminer la game termine la draft', () => {
  const s = jouerGameComplete(draftDemarree({ bo: 1 }), 'C');
  assert.equal(s.status, 'done');
  assert.equal(s.usedChampions.length, 0, 'pas de fearless en BO1');
});

test('en BO3, seuls les champions PIKES sont bloques pour la suite', () => {
  let s = jouerGameComplete(draftDemarree({ bo: 3 }), 'C');
  // La sequence : indices 0-5 et 12-15 sont des bans, le reste des picks.
  const bans = D.SEQUENCE.map((st, i) => st.type === 'ban' ? 'C' + i : null).filter(Boolean);
  const picks = D.SEQUENCE.map((st, i) => st.type === 'pick' ? 'C' + i : null).filter(Boolean);

  assert.equal(s.usedChampions.length, 10, 'les 10 champions pikes');
  picks.forEach(c => assert.ok(s.usedChampions.indexOf(c) >= 0, c + ' pike doit etre bloque'));
  bans.forEach(c => assert.equal(s.usedChampions.indexOf(c), -1, c + ' banni doit rester disponible'));
});

test('les champions pikes sont bloques pour les DEUX equipes', () => {
  let s = jouerGameComplete(draftDemarree({ bo: 3 }), 'C');
  s = D.apply(s, { type: 'nextGame' }, T0 + 60_000).state;

  // 'C6' est le first pick du 1er drafteur en game 1. Le 1er drafteur ouvre les bans
  // en game 2 : il ne doit pas pouvoir le reprendre non plus.
  const step = D.currentStep(s);
  const r = D.apply(s, { type: 'select', by: step.by, champion: 'C6' }, T0 + 61_000);
  assert.ok(r.error, 'un champion pike en game 1 est bloque pour tout le monde');
});

test('game suivante : nouvelle game vierge, chrono rearme, statut running', () => {
  let s = jouerGameComplete(draftDemarree({ bo: 3 }), 'C');
  const r = D.apply(s, { type: 'nextGame' }, T0 + 60_000);
  assert.equal(r.error, null);
  assert.equal(r.state.gameIndex, 1);
  assert.equal(r.state.games.length, 2);
  assert.deepEqual(r.state.games[1].actions, []);
  assert.equal(r.state.status, 'running');
  assert.equal(r.state.games[1].phaseEndsAt, T0 + 60_000 + 30_000);
});

test('passer a la game suivante avant la fin est refuse', () => {
  const r = D.apply(draftDemarree({ bo: 3 }), { type: 'nextGame' }, T0 + 1000);
  assert.ok(r.error);
});

test('un BO3 se termine apres la 3e game', () => {
  let s = draftDemarree({ bo: 3 });
  for (let g = 0; g < 3; g++) {
    s = jouerGameComplete(s, 'G' + g + '-');
    if (g < 2) s = D.apply(s, { type: 'nextGame' }, T0 + (g + 1) * 60_000).state;
  }
  assert.equal(s.status, 'done');
  assert.ok(D.apply(s, { type: 'nextGame' }, T0 + 300_000).error, 'plus de game apres la 3e');
  assert.equal(s.usedChampions.length, 30, '3 games x 10 picks');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : ÉCHEC — `usedChampions` reste vide et `nextGame` est refusé comme inconnu.

- [ ] **Étape 3 : implémenter**

Dans `draft-engine.js`, fonction `avancer`, dans la branche qui marque la game terminée,
ajouter l'accumulation fearless :

```js
    if (g.actions.length >= SEQUENCE.length) {
      g.done = true;
      g.phaseStartedAt = null;
      g.phaseEndsAt = null;
      // Fearless : seuls les champions PIKÉS sortent du pool, et pour les DEUX équipes.
      // Les champions bannis redeviennent disponibles à la game suivante.
      if (s.format.fearless) {
        g.actions.forEach(function (a) {
          if (a.type === 'pick' && a.champion) s.usedChampions.push(a.champion);
        });
      }
      if (s.gameIndex >= s.format.bo - 1) s.status = 'done';
    } else {
      armerChrono(s, g, now);
    }
```

Puis, dans `apply`, insérer avant le `return err(state, 'Opération inconnue…')` :

```js
    if (type === 'nextGame') {
      var gN = state.games[state.gameIndex];
      if (!gN.done) return err(state, "La game en cours n'est pas terminée");
      if (state.gameIndex >= state.format.bo - 1) return err(state, 'Le BO est terminé');
      var sN = clone(state);
      sN.gameIndex++;
      sN.games.push(createGame());
      var nouvelle = sN.games[sN.gameIndex];
      nouvelle.reserve = { first: sN.format.reserveSeconds * 1000, second: sN.format.reserveSeconds * 1000 };
      sN.status = 'running';
      armerChrono(sN, nouvelle, now);
      return ok(sN);
    }
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 33 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add draft-engine.js test/draft-engine.test.js
git commit -m "Moteur de draft : fin de game, game suivante et fearless"
```

---

### Task 8 : rejouer un BO1 et changer côté/priorité

**Fichiers :**
- Modifier : `draft-engine.js`
- Test : `test/draft-engine.test.js`

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/draft-engine.test.js` :

```js
test('rejouer remet un BO1 a zero et revient au lobby', () => {
  let s = jouerGameComplete(draftDemarree({ bo: 1 }), 'C');
  const r = D.apply(s, { type: 'replay' }, T0 + 60_000);
  assert.equal(r.error, null);
  assert.equal(r.state.status, 'lobby', 'retour au lobby pour pouvoir changer de cote');
  assert.equal(r.state.games.length, 1);
  assert.deepEqual(r.state.games[0].actions, []);
  assert.deepEqual(r.state.usedChampions, []);
});

test('rejouer est refuse en BO3 (le fearless perdrait son sens)', () => {
  const s = jouerGameComplete(draftDemarree({ bo: 3 }), 'C');
  assert.ok(D.apply(s, { type: 'replay' }, T0 + 60_000).error);
});

test('on peut inverser cote et priorite entre deux essais', () => {
  let s = draftDemarree({ bo: 1, firstSide: 'blue' });
  s = D.apply(s, { type: 'replay' }, T0 + 1000).state;
  const r = D.apply(s, { type: 'configure', firstSide: 'red' }, T0 + 2000);
  assert.equal(r.error, null);
  assert.deepEqual(r.state.sides, { first: 'red', second: 'blue' });
});

test('configurer une draft deja lancee est refuse', () => {
  const r = D.apply(draftDemarree({ bo: 1 }), { type: 'configure', firstSide: 'red' }, T0 + 1000);
  assert.ok(r.error, 'on ne change pas les regles en pleine draft');
});
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : ÉCHEC — `replay` et `configure` sont refusés comme inconnus.

- [ ] **Étape 3 : implémenter**

Dans `apply`, insérer avant le `return err(state, 'Opération inconnue…')` :

```js
    if (type === 'replay') {
      // Réservé au BO1 : en BO3/BO5 le pool consommé par le fearless se construit
      // d'une game à l'autre, le remettre à zéro n'aurait pas de sens.
      if (state.format.bo !== 1) return err(state, "Rejouer n'est possible qu'en BO1");
      var sR = clone(state);
      sR.games = [createGame()];
      sR.gameIndex = 0;
      sR.usedChampions = [];
      sR.status = 'lobby';   // retour au lobby : ils peuvent inverser côté et priorité
      return ok(sR);
    }

    if (type === 'configure') {
      if (state.status !== 'lobby') return err(state, 'On ne change pas les règles en pleine draft');
      var sC = clone(state);
      if (op.firstSide === 'blue' || op.firstSide === 'red') {
        sC.sides = { first: op.firstSide, second: op.firstSide === 'blue' ? 'red' : 'blue' };
      }
      if (op.turnSeconds != null) sC.format.turnSeconds = op.turnSeconds;
      if (op.reserveSeconds != null) sC.format.reserveSeconds = op.reserveSeconds;
      return ok(sC);
    }
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

```bash
node --test "test/draft-engine.test.js"
```

Attendu : 37 tests passent.

- [ ] **Étape 5 : commit**

```bash
git add draft-engine.js test/draft-engine.test.js
git commit -m "Moteur de draft : rejouer un BO1 et changer cote/priorite"
```

---

### Task 9 : vérification complète et déploiement

- [ ] **Étape 1 : lancer toute la suite**

```bash
node --test "test/*.test.js"
```

Attendu : tous les tests passent — 37 pour la couche `org` + 37 pour le moteur de draft.

- [ ] **Étape 2 : vérifier que le module se charge aussi dans un navigateur**

Le module doit fonctionner sous les deux formes (Node et balise `<script>`). Démarrer le
serveur local puis, dans la console d'une page servie depuis `http://localhost:8777` :

```js
const s = await fetch('/draft-engine.js').then(r => r.text());
new Function(s + '; window.__t = VSDraft;')();
JSON.stringify({ actions: __t.SEQUENCE.length, cote: __t.createState({ bo: 1, firstSide: 'red' }).sides })
```

Attendu : `{"actions":20,"cote":{"first":"red","second":"blue"}}` — et aucune erreur.

- [ ] **Étape 3 : se synchroniser avec le dépôt partagé**

Mateo pousse sur `origin/main` depuis sa propre machine.

```bash
git fetch --all && git log --oneline -1 && git log --oneline -1 origin/main
```

Si les deux diffèrent : `git pull --rebase origin main`, puis relancer les tests.

- [ ] **Étape 4 : pousser et vérifier le déploiement**

```bash
git push origin main
curl -s "https://api.github.com/repos/carneiroenzo70-crypto/scoutinglab/commits/$(git rev-parse --short HEAD)/status"
```

Attendu : `"state": "success"`.

- [ ] **Étape 5 : vérifier que le fichier est bien servi en production**

Depuis un onglet navigateur (⚠️ `curl` est bloqué par Vercel sur ce domaine) :

```js
fetch('https://visionscore.gg/draft-engine.js').then(r => ({ statut: r.status, type: r.headers.get('content-type') }))
```

Attendu : statut `200` et un type JavaScript. Si ce n'est pas le cas, les plans suivants ne
pourront pas charger le moteur côté navigateur.

---

## Ce que ce plan ne fait pas

- **Aucune interface.** Le moteur n'est encore branché nulle part — ni sur `app.html`, ni sur
  un serveur. C'est l'objet des plans suivants.
- **Aucun temps réel.** Pas de WebSocket, pas de salle, pas de présence ni de curseurs.
- **Aucune notion de profondeur de pool par rôle.** Le moteur expose `unavailable(state)` ;
  c'est l'interface qui croisera cette liste avec la table des rôles de `ssChampList()`, pour
  que le moteur reste indépendant des données de champions.
- **Aucune gestion du mode « scénario libre ».** Ce mode n'a ni tour ni chrono ; il sera traité
  avec la couche d'opérations collaborative.
