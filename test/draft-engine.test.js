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

test('un champion deja banni ne peut pas etre rebanni dans la meme game', () => {
  let s = draftDemarree();
  s = D.apply(s, { type: 'select', by: 'first', champion: 'Ambessa' }, T0 + 1000).state;
  const r = D.apply(s, { type: 'select', by: 'second', champion: 'Ambessa' }, T0 + 2000);
  assert.ok(r.error, 'Ambessa est deja banni');
});

test('un champion deja banni ne peut pas etre pike dans la meme game', () => {
  let s = draftDemarree();
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
