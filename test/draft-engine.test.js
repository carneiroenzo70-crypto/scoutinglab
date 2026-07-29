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

test('le chrono est arme a 30 s par defaut', () => {
  const s = draftDemarree();
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 30000);
});

test('le chrono est rearme a chaque action', () => {
  const s0 = draftDemarree();
  const s1 = D.apply(s0, { type: 'select', by: 'first', champion: 'Ambessa' }, T0 + 7000).state;
  assert.equal(s1.games[0].phaseStartedAt, T0 + 7000);
  assert.equal(s1.games[0].phaseEndsAt, T0 + 7000 + 30000);
});

test('le temps ecoule laisse l\'emplacement vide et la draft continue', () => {
  const s = draftDemarree();
  const r = D.apply(s, { type: 'timeout' }, T0 + 30001);
  assert.equal(r.error, null);
  assert.deepEqual(r.state.games[0].actions[0], { type: 'ban', by: 'first', champion: null });
  assert.deepEqual(D.currentStep(r.state), { index: 1, type: 'ban', by: 'second' });
});

test('on ne peut pas declencher l\'expiration avant l\'echeance', () => {
  const r = D.apply(draftDemarree(), { type: 'timeout' }, T0 + 10000);
  assert.ok(r.error, 'le temps n\'est pas ecoule');
  assert.equal(r.state.games[0].actions.length, 0);
});

test('la duree du tour est configurable', () => {
  const s = D.apply(D.createState({ bo: 1, turnSeconds: 45 }), { type: 'start' }, T0).state;
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 45000);
});

test('sans reserve, l\'echeance vaut exactement le temps de base', () => {
  const s = draftDemarree({ bo: 1, reserveSeconds: 0 });
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 30000);
});

test('l\'echeance inclut la reserve restante de l\'equipe qui joue', () => {
  const s = draftDemarree({ bo: 1, reserveSeconds: 20 });
  assert.equal(s.games[0].phaseEndsAt - s.games[0].phaseStartedAt, 50000, '30 s + 20 s de reserve');
});

test('depasser le temps de base consomme la reserve, rester dessous ne la touche pas', () => {
  let s = draftDemarree({ bo: 1, reserveSeconds: 20 });
  s = D.apply(s, { type: 'select', by: 'first', champion: 'A' }, T0 + 38000).state;
  assert.equal(s.games[0].reserve.first, 12000);
  assert.equal(s.games[0].reserve.second, 20000, 'la reserve de l\'adversaire est intacte');
  const t1 = s.games[0].phaseStartedAt;
  s = D.apply(s, { type: 'select', by: 'second', champion: 'B' }, t1 + 10000).state;
  assert.equal(s.games[0].reserve.second, 20000);
});

test('la reserve epuisee ne devient jamais negative', () => {
  let s = draftDemarree({ bo: 1, reserveSeconds: 5 });
  s = D.apply(s, { type: 'timeout' }, T0 + 35001).state;
  assert.equal(s.games[0].reserve.first, 0);
});

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
  const bans = D.SEQUENCE.map((st, i) => st.type === 'ban' ? 'C' + i : null).filter(Boolean);
  const picks = D.SEQUENCE.map((st, i) => st.type === 'pick' ? 'C' + i : null).filter(Boolean);
  assert.equal(s.usedChampions.length, 10, 'les 10 champions pikes');
  picks.forEach(c => assert.ok(s.usedChampions.indexOf(c) >= 0, c + ' pike doit etre bloque'));
  bans.forEach(c => assert.equal(s.usedChampions.indexOf(c), -1, c + ' banni doit rester disponible'));
});

test('les champions pikes sont bloques pour les DEUX equipes', () => {
  let s = jouerGameComplete(draftDemarree({ bo: 3 }), 'C');
  s = D.apply(s, { type: 'nextGame' }, T0 + 60000).state;
  const step = D.currentStep(s);
  const r = D.apply(s, { type: 'select', by: step.by, champion: 'C6' }, T0 + 61000);
  assert.ok(r.error, 'un champion pike en game 1 est bloque pour tout le monde');
});

test('game suivante : nouvelle game vierge, chrono rearme, statut running', () => {
  let s = jouerGameComplete(draftDemarree({ bo: 3 }), 'C');
  const r = D.apply(s, { type: 'nextGame' }, T0 + 60000);
  assert.equal(r.error, null);
  assert.equal(r.state.gameIndex, 1);
  assert.equal(r.state.games.length, 2);
  assert.deepEqual(r.state.games[1].actions, []);
  assert.equal(r.state.status, 'running');
  assert.equal(r.state.games[1].phaseEndsAt, T0 + 60000 + 30000);
});

test('passer a la game suivante avant la fin est refuse', () => {
  const r = D.apply(draftDemarree({ bo: 3 }), { type: 'nextGame' }, T0 + 1000);
  assert.ok(r.error);
});

test('un BO3 se termine apres la 3e game', () => {
  let s = draftDemarree({ bo: 3 });
  for (let g = 0; g < 3; g++) {
    s = jouerGameComplete(s, 'G' + g + '-');
    if (g < 2) s = D.apply(s, { type: 'nextGame' }, T0 + (g + 1) * 60000).state;
  }
  assert.equal(s.status, 'done');
  assert.ok(D.apply(s, { type: 'nextGame' }, T0 + 300000).error, 'plus de game apres la 3e');
  assert.equal(s.usedChampions.length, 30, '3 games x 10 picks');
});

test('rejouer remet un BO1 a zero et revient au lobby', () => {
  let s = jouerGameComplete(draftDemarree({ bo: 1 }), 'C');
  const r = D.apply(s, { type: 'replay' }, T0 + 60000);
  assert.equal(r.error, null);
  assert.equal(r.state.status, 'lobby');
  assert.equal(r.state.games.length, 1);
  assert.deepEqual(r.state.games[0].actions, []);
  assert.deepEqual(r.state.usedChampions, []);
});

test('rejouer est refuse en BO3 (le fearless perdrait son sens)', () => {
  const s = jouerGameComplete(draftDemarree({ bo: 3 }), 'C');
  assert.ok(D.apply(s, { type: 'replay' }, T0 + 60000).error);
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
