/* Le CRON de relevé quotidien — budget, mode léger, rotation.

   Le défaut de fond n'était pas un bug de code mais une arithmétique que personne
   n'avait posée : le cron émet une requête toutes les 220 ms, soit 4,5/s, donc 545 sur
   deux minutes — pour une clé PERSONNELLE plafonnée à 100 / 2 min. Il dépassait le quota
   d'un facteur cinq, en silence (`if (!r.ok) return null` traite un 429 comme une
   absence de données). Neuf appels par joueur : le budget partait en 11 joueurs.

   Ajouter les prospects du CRM par-dessus aurait donc cassé aussi le suivi des rosters.
   Ces vérifications tiennent le budget, le mode léger et la rotation. */
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';
process.env.CRON_SECRET = 'cron-test';
process.env.RIOT_API_KEY = 'riot-test';

const cron = require('../api/cron-snapshot');

function mockRes() {
  return {
    _status: 0, _json: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; }, end() { return this; }
  };
}

/* Faux Upstash + faux Riot sur le même global.fetch : on distingue par l'URL. */
function monter(store, options) {
  options = options || {};
  const compte = { riot: 0, parUrl: [] };
  global.fetch = async (url, opts) => {
    if (String(url).indexOf('mock') >= 0) {           // Upstash
      const cmd = JSON.parse(opts.body);
      let result = null;
      if (cmd[0] === 'SET') { store[cmd[1]] = String(cmd[2]); result = 'OK'; }
      else if (cmd[0] === 'GET') { result = store[cmd[1]] != null ? store[cmd[1]] : null; }
      else if (cmd[0] === 'SMEMBERS') { result = store.__users || []; }
      return { ok: true, json: async () => ({ result }) };
    }
    compte.riot++;                                     // Riot
    compte.parUrl.push(String(url));
    if (options.tout429) return { ok: false, status: 429, json: async () => ({}) };
    if (String(url).indexOf('/accounts/by-riot-id/') >= 0) {
      return { ok: true, status: 200, json: async () => ({ puuid: 'puuid-' + compte.riot }) };
    }
    if (String(url).indexOf('/league/v4/entries/') >= 0) {
      return { ok: true, status: 200, json: async () => ([{ queueType: 'RANKED_SOLO_5x5',
        tier: 'GOLD', leaguePoints: 42, wins: 60, losses: 40 }]) };
    }
    return { ok: true, status: 200, json: async () => ([]) };  // liste de matchs vide
  };
  return compte;
}
const appel = (secret) => ({ method: 'GET', headers: { authorization: 'Bearer ' + (secret || 'cron-test') }, query: {} });

/* Un vivier de 30 prospects. À 2 appels chacun, il en faudrait 60 : plus que ce que le
   budget laissera après les rosters. C'est exactement le cas qu'on veut voir passer. */
const vivier = (n) => ({
  rosterId: 'prospects', name: 'Vivier', leger: true,
  players: Array.from({ length: n }, (_, i) => ({ pseudo: 'P' + i, tag: 'EUW', server: 'euw1', role: 'Mid' }))
});

test('le cron refuse un secret invalide', async () => {
  const res = mockRes();
  await cron(appel('mauvais'), res);
  assert.equal(res._status, 401);
});

test('le relevé d\'un prospect coûte DEUX appels Riot, pas neuf', async () => {
  const store = { __users: ['acme'] };
  store['vs_track:acme'] = JSON.stringify([vivier(1)]);
  const c = monter(store);
  const res = mockRes();
  await cron(appel(), res);
  assert.equal(res._status, 200);
  assert.equal(c.riot, 2, 'compte + entrée de ligue, et rien d\'autre : ' + c.parUrl.join(' | '));
  assert.ok(c.parUrl.every(u => u.indexOf('/matches/') < 0),
    'aucun match ne doit être lu : le rang et le winrate sont déjà dans l\'entrée de ligue');
});

/* ⚠ LE TEST QUI PROTÈGE LE RESTE DU PRODUIT. Sans budget, 30 prospects émettraient
   60 appels qui s'ajouteraient à ceux des rosters, et le quota sauterait pour tout le
   monde — y compris pour le suivi payant. */
test('le budget d\'appels Riot est respecté, et le cron le DIT', async () => {
  const store = { __users: ['acme'] };
  store['vs_track:acme'] = JSON.stringify([vivier(30)]);
  process.env.CRON_BUDGET_RIOT = '10';
  const c = monter(store);
  const res = mockRes();
  await cron(appel(), res);
  delete process.env.CRON_BUDGET_RIOT;
  assert.ok(c.riot <= 10, 'budget de 10 dépassé : ' + c.riot + ' appels');
  assert.equal(res._json.budgetEpuise, true, 'un budget épuisé doit se voir dans le compte-rendu');
  assert.equal(res._json.budget, 10);
});

/* Sans rotation, les cinq premiers prospects mangeraient le budget tous les jours et les
   suivants ne seraient jamais relevés — le digest resterait vide pour eux à vie. */
test('la rotation reprend là où le budget s\'était épuisé', async () => {
  const store = { __users: ['acme'] };
  store['vs_track:acme'] = JSON.stringify([vivier(10)]);
  process.env.CRON_BUDGET_RIOT = '6';         // 3 prospects par passage

  let c = monter(store);
  await cron(appel(), mockRes());
  const jour1 = JSON.parse(store['vs_snaps:acme:prospects'])[0].players.map(p => p.pseudo);
  const curseur = store['vs_track_curseur:acme:prospects'];
  assert.equal(jour1.length, 3, 'trois prospects au premier passage');
  assert.equal(curseur, '3', 'le curseur doit mémoriser où on s\'est arrêté');

  c = monter(store);
  await cron(appel(), mockRes());
  delete process.env.CRON_BUDGET_RIOT;
  const jour2 = JSON.parse(store['vs_snaps:acme:prospects'])[0].players.map(p => p.pseudo);
  assert.ok(jour2.indexOf('P3') >= 0, 'le second passage doit reprendre à P3, obtenu ' + jour2.join(','));
  /* Et il COMPLÈTE le relevé du jour au lieu de l'écraser : sinon chaque passage
     effacerait le précédent et l'historique n'avancerait jamais. */
  assert.ok(jour2.length > 3, 'le relevé du jour doit être complété, pas remplacé : ' + jour2.join(','));
  assert.ok(jour2.indexOf('P0') >= 0, 'les prospects du premier passage doivent survivre');
});

/* Les 429 étaient invisibles : un quota explosé et un cron sans rien à faire rendaient
   exactement la même réponse. C'est ce silence qui a laissé le dépassement passer. */
test('les refus 429 sont comptés et remontés', async () => {
  const store = { __users: ['acme'] };
  store['vs_track:acme'] = JSON.stringify([vivier(3)]);
  monter(store, { tout429: true });
  const res = mockRes();
  await cron(appel(), res);
  assert.ok(res._json.refus429 > 0, 'un 429 ne doit plus se confondre avec une absence de données');
});

/* Le roster reste prioritaire : c'est le cœur payant, il ne doit pas être privé de
   budget par le vivier de scouting. */
test('les rosters passent AVANT le vivier', async () => {
  const store = { __users: ['acme'] };
  store['vs_track:acme'] = JSON.stringify([
    vivier(20),
    { rosterId: 7, name: 'Titulaires', players: [{ pseudo: 'Star', tag: 'EUW', server: 'euw1', role: 'Mid' }] }
  ]);
  process.env.CRON_BUDGET_RIOT = '12';
  const c = monter(store);
  await cron(appel(), mockRes());
  delete process.env.CRON_BUDGET_RIOT;
  assert.ok(store['vs_snaps:acme:7'], 'le roster doit avoir été relevé malgré un vivier plus long');
  assert.ok(c.parUrl[0].indexOf('Star') >= 0,
    'le premier appel doit concerner le roster, pas le vivier : ' + c.parUrl[0]);
});
