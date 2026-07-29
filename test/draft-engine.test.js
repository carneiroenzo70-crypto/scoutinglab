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
    'B1', 'B2', 'B1', 'B2', 'B1', 'B2',
    'P1', 'P2', 'P2', 'P1', 'P1', 'P2',
    'B2', 'B1', 'B2', 'B1',
    'P2', 'P1', 'P1', 'P2'
  ]);
});

test('le cote et l\'ordre de draft sont independants (First Selection)', () => {
  const bleuEnPremier = D.createState({ bo: 1, firstSide: 'blue' });
  assert.deepEqual(bleuEnPremier.sides, { first: 'blue', second: 'red' });
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
  assert.equal(s.format.turnSeconds, 30);
  assert.equal(s.format.reserveSeconds, 0);
});

const T0 = 1700000000000;   // horloge fixe : les tests du chrono doivent etre deterministes

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
