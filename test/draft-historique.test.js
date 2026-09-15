/* L'historique des drafts — vérifications sur les fonctions pures d'app.html.

   Deux exigences portent tout le reste :
   1. une game archivée par deux coachs de la même salle doit produire le MÊME
      enregistrement, octet pour octet — sinon la fusion du stockage partagé lève un
      conflit, ou pire, garde deux copies de la même draft ;
   2. la ligne de tableur doit rester alignée sur ses en-têtes quoi qu'il arrive
      (emplacement vide sur temps écoulé, game incomplète) — une colonne décalée dans
      un Google Sheet de suivi fausse silencieusement tous les filtres du staff. */

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
const colonnes = app.slice(app.indexOf('var DL_HISTO_COLONNES'), app.indexOf('function dlLignesTableur'));

const bac = vm.createContext({ VSDraft: D, Date, Math, JSON, String });
vm.runInContext([colonnes, source('dlHash'), source('dlSignatureGame'), source('dlEnregistrementGame'),
  source('dlLignesTableur'), source('dlHistoTrie'), source('dlDateHisto')].join('\n') +
  '\nthis.COLONNES = DL_HISTO_COLONNES;', bac);
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

test('chaque ligne de tableur a exactement autant de cellules que d\'en-têtes', () => {
  const r = bac.dlEnregistrementGame(draftTerminee({}, [0, 19]), 0, 'm1');
  const lignes = bac.dlLignesTableur([r], [{ id: 'm1', competition: 'LFL', opp: { name: 'Karmine Corp Blue' } }], (k) => 'nom:' + k);
  assert.strictEqual(lignes[0].length, bac.COLONNES.length,
    'une cellule en trop ou en moins décale toutes les colonnes du Google Sheet');
});

test('un emplacement perdu au chrono est écrit « (vide) », jamais sauté', () => {
  const r = bac.dlEnregistrementGame(draftTerminee({ firstSide: 'blue', notreCote: 'blue' }, [0]), 0, 'm1');
  const ligne = bac.dlLignesTableur([r], [], (k) => k);
  const i = bac.COLONNES.indexOf('Ban nous 1');
  assert.strictEqual(ligne[0][i], '(vide)', 'sauter la case décalerait les bans suivants d\'un rang');
  assert.strictEqual(ligne[0][i + 1], 'C2');
  assert.ok(/B nous \(vide\)/.test(ligne[0][bac.COLONNES.indexOf('Séquence complète')]));
});

test('le tableur écrit des NOMS de champions, et le contexte du match', () => {
  const r = bac.dlEnregistrementGame(draftTerminee({ notreCote: 'blue' }), 0, 'm1');
  const ligne = bac.dlLignesTableur([r], [{ id: 'm1', competition: 'LFL', opp: { name: 'Karmine Corp Blue' } }], (k) => 'Champion ' + k)[0];
  assert.strictEqual(ligne[bac.COLONNES.indexOf('Adversaire')], 'Karmine Corp Blue');
  assert.strictEqual(ligne[bac.COLONNES.indexOf('Compétition')], 'LFL');
  assert.strictEqual(ligne[bac.COLONNES.indexOf('Pick nous 1')], 'Champion C6');
  assert.strictEqual(ligne[bac.COLONNES.indexOf('Type')], 'Simulation',
    'une draft simulée ne doit jamais se confondre avec une draft officielle dans le suivi');
});

test('l\'historique se lit du plus récent au plus ancien', () => {
  const trie = bac.dlHistoTrie([
    { id: 'a', fini: '2026-09-10T18:00:00.000Z' }, { id: 'b', fini: '2026-09-12T18:00:00.000Z' },
    { id: 'c', fini: null }, { id: 'd', fini: null }
  ]);
  assert.deepStrictEqual(plat(trie).map((r) => r.id), ['b', 'a', 'd', 'c'],
    'à défaut d\'heure (serveur pas encore redéployé), l\'ordre d\'archivage fait foi');
});
