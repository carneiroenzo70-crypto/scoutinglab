/* L'historique des drafts — vérifications sur les fonctions pures d'app.html.

   Deux exigences portent tout le reste :
   1. une game archivée par deux coachs de la même salle doit produire le MÊME
      enregistrement, octet pour octet — sinon la fusion du stockage partagé lève un
      conflit, ou pire, garde deux copies de la même draft ;
   2. la feuille exportée doit attribuer chaque ban et chaque pick au BON camp — une
      inversion ne lève aucune erreur et produit une feuille parfaitement crédible, dans
      laquelle le staff lirait ses propres bans comme étant ceux de l'adversaire. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../draft-engine');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8').split('\r\n').join('\n');

function source(nom) {
  const debut = app.indexOf('function ' + nom + '(');
  assert.notStrictEqual(debut, -1, 'fonction introuvable dans app.html : ' + nom);
  let i = app.indexOf('{', debut), p = 0;
  for (let j = i; j < app.length; j++) {
    if (app[j] === '{') p++;
    else if (app[j] === '}') { p--; if (p === 0) return app.slice(debut, j + 1); }
  }
  throw new Error('accolades non refermées pour ' + nom);
}
const bac = vm.createContext({ VSDraft: D, Date, Math, JSON, String });
vm.runInContext([source('dlHash'), source('dlSignatureGame'), source('dlEnregistrementGame'),
  source('dlHistoTrie'), source('dlDateHisto')].join('\n'), bac);
const plat = (x) => JSON.parse(JSON.stringify(x));

// Joue une game complète ; `vides` = index d'actions laissées au temps écoulé.
function jouerGame(state, t0, prefixe, vides) {
  let s = state, t = t0;
  for (let i = 0; i < 20; i++) {
    const st = D.currentStep(s);
    if (vides && vides.indexOf(i) >= 0) {
      const g = s.games[s.gameIndex];
      s = D.apply(s, { type: 'timeout' }, g.phaseEndsAt).state;
      t = g.phaseEndsAt;
    } else {
      s = D.apply(s, { type: 'select', by: st.by, champion: prefixe + i }, ++t).state;
    }
  }
  return s;
}
function draftTerminee(opts, vides) {
  let s = D.createState(Object.assign({ bo: 1 }, opts));
  s = D.apply(s, { type: 'start' }, 1000).state;
  return jouerGame(s, 1000, 'C', vides);
}

test('le moteur horodate la fin de game, et seulement la fin', () => {
  let s = D.apply(D.createState({ bo: 1 }), { type: 'start' }, 1000).state;
  assert.strictEqual(s.games[0].finishedAt, null);
  s = jouerGame(s, 1000, 'C');
  assert.strictEqual(s.games[0].finishedAt, 1020, 'l\'heure de la 20e action, fournie par le moteur');
});

test('une game non terminée ne produit aucun enregistrement', () => {
  const s = D.apply(D.createState({ bo: 1 }), { type: 'start' }, 1000).state;
  assert.strictEqual(bac.dlEnregistrementGame(s, 0, 'm1'), null);
});

test('deux coachs archivent le MÊME enregistrement de la même game', () => {
  const s = draftTerminee({ notreCote: 'red' });
  // Chaque navigateur reçoit sa propre copie désérialisée de l'état du serveur.
  const coachA = bac.dlEnregistrementGame(JSON.parse(JSON.stringify(s)), 0, 'm1');
  const coachB = bac.dlEnregistrementGame(JSON.parse(JSON.stringify(s)), 0, 'm1');
  assert.deepStrictEqual(plat(coachA), plat(coachB),
    'un champ dépendant du navigateur (horloge, ordre) ferait lever un conflit à la fusion');
});

test('la même séquence rejouée plus tard reste une entrée distincte', () => {
  const a = bac.dlEnregistrementGame(draftTerminee({}), 0, 'm1');
  let s = D.createState({ bo: 1 });
  s = D.apply(s, { type: 'start' }, 5000).state;
  const b = bac.dlEnregistrementGame(jouerGame(s, 5000, 'C'), 0, 'm1');
  assert.notStrictEqual(a.id, b.id, 'deux entraînements identiques à deux heures différentes');
});

test('les bans et picks sont lus depuis NOTRE camp, pas depuis le bleu', () => {
  // Bleu drafte en premier, nous sommes rouge : nos actions sont celles du 2nd drafteur.
  const s = draftTerminee({ firstSide: 'blue', notreCote: 'red' });
  const r = bac.dlEnregistrementGame(s, 0, 'm1');
  assert.strictEqual(r.nousDrafteur, 'second');
  assert.deepStrictEqual(plat(r.nousBans), ['C1', 'C3', 'C5', 'C12', 'C14']);
  assert.deepStrictEqual(plat(r.nousPicks), ['C7', 'C8', 'C11', 'C16', 'C19']);
  assert.deepStrictEqual(plat(r.euxPicks), ['C6', 'C9', 'C10', 'C17', 'C18']);
  assert.strictEqual(r.sequence[0].qui, 'eux', 'le 1er ban est celui du bleu, donc de l\'adversaire');
});

test('les games d\'un même BO partagent la série', () => {
  let s = D.apply(D.createState({ bo: 3 }), { type: 'start' }, 1000).state;
  s = jouerGame(s, 1000, 'A');
  s = D.apply(s, { type: 'nextGame' }, 3000).state;
  s = jouerGame(s, 3000, 'B');
  const g1 = bac.dlEnregistrementGame(s, 0, 'm1'), g2 = bac.dlEnregistrementGame(s, 1, 'm1');
  assert.strictEqual(g1.serie, g2.serie);
  assert.notStrictEqual(g1.id, g2.id);
  assert.strictEqual(g2.game, 2);
  assert.strictEqual(g2.fearless, true);
});

/* ── La feuille PRÉSENTÉE (fichier à ouvrir dans Google Sheets) ────────────────────
   Ce que ce bloc doit garantir avant tout : que la colonne BLEUE contienne bien ce qui
   a été joué CÔTÉ BLEU. Se tromper de camp ne lève aucune erreur et produit une feuille
   parfaitement crédible — un staff y lirait ses propres bans comme étant ceux de
   l'adversaire, et préparerait le match suivant à l'envers. */
const feuille = app.slice(app.indexOf('var DL_FEUILLE'), app.indexOf('function dlFeuilleLignes'));
const bacF = vm.createContext({ Date, Math, JSON, String, anEsc: (s) => String(s == null ? '' : s) });
vm.runInContext([feuille, source('dlDateHisto'), source('dlFeuilleLignes'),
  source('dlFeuilleHtml')].join('\n'), bacF);

const MATCHS = [{ id: 'm1', competition: 'LFL', opp: { name: 'Karmine Corp Blue' } }];
const lignesDe = (r) => bacF.dlFeuilleLignes([r], MATCHS, (k) => k, 'VisionScore');

test('la colonne bleue montre le camp BLEU, même quand nous sommes rouges', () => {
  // Bleu drafte en premier, nous sommes rouge : la colonne bleue est donc l'adversaire.
  const r = bac.dlEnregistrementGame(draftTerminee({ firstSide: 'blue', notreCote: 'red' }), 0, 'm1');
  const L = lignesDe(r);
  const bans = L.filter((l) => l.t === 'duo').slice(0, 5);
  const picks = L.filter((l) => l.t === 'duo').slice(5, 10);
  assert.deepStrictEqual(plat(bans.map((l) => l.c[1])), plat(r.euxBans), 'colonne bleue = bans de l\'adversaire');
  assert.deepStrictEqual(plat(bans.map((l) => l.c[2])), plat(r.nousBans), 'colonne rouge = nos bans');
  assert.deepStrictEqual(plat(picks.map((l) => l.c[1])), plat(r.euxPicks));
  assert.deepStrictEqual(plat(picks.map((l) => l.c[2])), plat(r.nousPicks));

  const camps = L.find((l) => l.t === 'camps');
  assert.match(camps.c[1], /Karmine Corp Blue/, 'l\'en-tête bleu doit nommer l\'adversaire');
  assert.match(camps.c[2], /nous/, 'l\'en-tête rouge doit nous désigner');
});

test('l\'ordre de draft est rendu par camp, pas déduit de la couleur', () => {
  /* Depuis First Selection 2026, côté et ordre sont indépendants : « bleu = 1er » est
     faux. On vérifie donc les deux combinaisons. */
  const rougeDabord = bac.dlEnregistrementGame(draftTerminee({ firstSide: 'red', notreCote: 'blue' }), 0, 'm1');
  const c1 = lignesDe(rougeDabord).find((l) => l.t === 'camps');
  assert.match(c1.c[1], /2nd drafteur/, 'bleu joue second quand rouge ouvre');
  assert.match(c1.c[2], /1er drafteur/);

  const bleuDabord = bac.dlEnregistrementGame(draftTerminee({ firstSide: 'blue', notreCote: 'blue' }), 0, 'm1');
  const c2 = lignesDe(bleuDabord).find((l) => l.t === 'camps');
  assert.match(c2.c[1], /1er drafteur/);
  assert.match(c2.c[2], /2nd drafteur/);
});

test('l\'ordre chronologique n\'attribue chaque action qu\'à UN camp', () => {
  const r = bac.dlEnregistrementGame(draftTerminee({ firstSide: 'blue', notreCote: 'red' }), 0, 'm1');
  const seq = lignesDe(r).filter((l) => l.t === 'seq');
  assert.strictEqual(seq.length, 20, 'les 20 actions doivent figurer');
  seq.forEach((l) => {
    assert.ok(!(l.c[1] && l.c[2]), 'une action appartient à un seul camp : ' + JSON.stringify(l.c));
    assert.ok(l.c[1] || l.c[2], 'et elle doit apparaître quelque part : ' + JSON.stringify(l.c));
  });
  // jouerGame numérote les champions à partir de C0 : la 1re action est donc « C0 ».
  assert.strictEqual(seq[0].c[1], 'C0', 'le 1er ban est celui du bleu, qui ouvre');
  assert.strictEqual(seq[0].c[2], '', 'et le rouge n\'a rien posé à ce tour');
});

test('une case sans action ne reçoit pas de couleur de fond', () => {
  /* Dans l\'ordre chronologique une colonne sur deux est vide : la colorer dessinerait
     une bande continue là où il ne s\'est rien passé. */
  const r = bac.dlEnregistrementGame(draftTerminee({}), 0, 'm1');
  const html = bacF.dlFeuilleHtml(lignesDe(r));
  assert.doesNotMatch(html, /<td style="background:#[0-9A-F]{6}[^"]*"><\/td>/i,
    'aucune cellule vide ne doit porter de fond coloré');
  assert.match(html, /background:#D6E4FF/, 'le bleu doit bien être employé');
  assert.match(html, /background:#FFDAD6/, 'le rouge aussi');
});

test('un emplacement perdu au chrono reste « (vide) » dans la feuille', () => {
  const r = bac.dlEnregistrementGame(draftTerminee({ firstSide: 'blue', notreCote: 'blue' }, [0]), 0, 'm1');
  const premierBan = lignesDe(r).filter((l) => l.t === 'duo')[0];
  assert.strictEqual(premierBan.c[1], '(vide)', 'le ban perdu au chrono doit se voir, pas disparaître');
});

test('le fichier porte le match, la game et l\'ordre des actions', () => {
  const r = bac.dlEnregistrementGame(draftTerminee({ notreCote: 'blue' }), 0, 'm1');
  const html = bacF.dlFeuilleHtml(lignesDe(r));
  assert.match(html, /VisionScore {2}vs {2}Karmine Corp Blue/, 'le titre du match doit y être');
  assert.match(html, /Ordre de la draft/);
  assert.match(html, /Game 1 \/ BO1/);
});

test('l\'historique se lit du plus récent au plus ancien', () => {
  const trie = bac.dlHistoTrie([
    { id: 'a', fini: '2026-09-10T18:00:00.000Z' }, { id: 'b', fini: '2026-09-12T18:00:00.000Z' },
    { id: 'c', fini: null }, { id: 'd', fini: null }
  ]);
  assert.deepStrictEqual(plat(trie).map((r) => r.id), ['b', 'a', 'd', 'c'],
    'à défaut d\'heure (serveur pas encore redéployé), l\'ordre d\'archivage fait foi');
});
