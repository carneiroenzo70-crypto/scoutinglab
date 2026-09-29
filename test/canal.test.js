// Canal d'équipe (/api/canal) — publier la feuille de route dans le salon Discord du staff.
//
// Trois propriétés méritent un test, parce que les perdre ne se verrait pas à l'écran :
//   1. L'URL du webhook ne redescend JAMAIS au navigateur. Elle vaut droit d'écriture sur
//      le salon ; un GET bavard la mettrait dans l'onglet Réseau de n'importe qui.
//   2. Seul un webhook Discord est accepté. La route va chercher une URL fournie par le
//      client depuis le réseau de Vercel : sans filtre, c'est un proxy de requêtes
//      arbitraires (métadonnées d'instance, services internes) offert à tout compte.
//   3. Un message trop long est découpé. Discord refuse tout `content` de plus de 2000
//      caractères ; sans découpage le coach verrait « envoyé » et le salon, rien.
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { signToken } = require('../api/_auth');
const handler = require('../api/canal');
const { urlValide, decouper, LIMITE } = handler;

const WEBHOOK = 'https://discord.com/api/webhooks/1234567890123/' + 'a'.repeat(60);

function mockRes() {
  return {
    _status: 0, _json: null,
    setHeader() {}, status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; }, end() { return this; }
  };
}

/* Un seul faux `fetch` pour les deux mondes : Upstash (POST sur https://mock, commandes
   Redis en JSON) et Discord. `appels` garde la trace de tout ce qui est sorti — c'est ce
   qui permet d'affirmer qu'une URL refusée n'a été contactée par personne. */
function mock(store, discord) {
  const appels = [];
  discord = discord || {};
  global.fetch = async (url, opts) => {
    appels.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body });
    if (String(url) === 'https://mock') {
      const cmd = JSON.parse(opts.body);
      let result = null;
      if (cmd[0] === 'SET') { store[cmd[1]] = cmd[2]; result = 'OK'; }
      else if (cmd[0] === 'GET') { result = store[cmd[1]] != null ? store[cmd[1]] : null; }
      else if (cmd[0] === 'DEL') { delete store[cmd[1]]; result = 1; }
      return { ok: true, json: async () => ({ result }) };
    }
    const st = discord.status || 200;
    return { ok: st >= 200 && st < 300, status: st, json: async () => (discord.corps || { name: 'VisionScore' }) };
  };
  return appels;
}

const jeton = () => signToken({ u: 'enzo', org: 'skillcamp' }, 600);
const req = (method, body, token) => ({
  method,
  headers: { authorization: 'Bearer ' + (token === undefined ? jeton() : token) },
  query: {}, body
});

// ─────────────────────────── 1. Forme de l'URL (anti-SSRF) ───────────────────────────

test('urlValide accepte les deux domaines Discord réellement servis', () => {
  assert.ok(urlValide(WEBHOOK));
  assert.ok(urlValide('https://discordapp.com/api/webhooks/1234567890123/' + 'z'.repeat(68)));
});

test('urlValide refuse tout ce qui n\'est pas un webhook Discord', () => {
  const refus = [
    'http://discord.com/api/webhooks/1234567890123/' + 'a'.repeat(60), // en clair
    'https://169.254.169.254/latest/meta-data/',                       // métadonnées d'instance
    'http://localhost:3000/api/store',                                 // service local
    'https://interne.vercel.app/admin',
    'https://hooks.slack.com/services/T0/B0/xxxxxxxx',                 // autre produit
    'https://evil.com/https://discord.com/api/webhooks/1/aaa',         // Discord dans le chemin
    'https://discord.com.evil.com/api/webhooks/1234567890123/' + 'a'.repeat(60),
    'https://discord.com/api/webhooks/1234567890123/' + 'a'.repeat(60) + '?x=1', // requête ajoutée
    'https://discord.com/api/webhooks/abc/' + 'a'.repeat(60),          // id non numérique
    'https://discord.com/api/webhooks/1234567890123/court',            // jeton trop court
    'https://discord.com/api/channels/123/messages',                   // autre route Discord
    '', null, undefined, 42, {}
  ];
  for (const u of refus) assert.equal(urlValide(u), false, 'devrait être refusé : ' + String(u));
});

test('une URL refusée n\'est contactée par personne', async () => {
  const appels = mock({});
  const res = mockRes();
  await handler(req('PUT', { url: 'https://169.254.169.254/latest/meta-data/' }), res);
  assert.equal(res._status, 400);
  // Le point capital : aucune requête n'est partie vers l'hôte visé.
  assert.equal(appels.filter(a => a.url.includes('169.254')).length, 0);
});

// ─────────────────────────── 2. Le secret ne redescend pas ───────────────────────────

test('GET dit qu\'un canal existe mais ne livre JAMAIS l\'URL du webhook', async () => {
  const store = {
    'vs_canal:skillcamp': JSON.stringify({ url: WEBHOOK, nom: 'VisionScore', libelle: '#staff', par: 'enzo', le: '2026-09-29T10:00:00Z' })
  };
  mock(store);
  const res = mockRes();
  await handler(req('GET'), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.configure, true);
  assert.equal(res._json.libelle, '#staff');
  // Ni le champ, ni la valeur nulle part dans la réponse sérialisée.
  assert.equal(res._json.url, undefined);
  assert.ok(!JSON.stringify(res._json).includes('webhooks'), 'la réponse ne doit contenir aucune trace du webhook');
});

test('GET sans canal branché répond configure:false, sans erreur', async () => {
  mock({});
  const res = mockRes();
  await handler(req('GET'), res);
  assert.equal(res._status, 200);
  assert.deepStrictEqual(res._json, { configure: false });
});

test('sans jeton valide, rien n\'est lisible', async () => {
  mock({ 'vs_canal:skillcamp': JSON.stringify({ url: WEBHOOK }) });
  const res = mockRes();
  await handler(req('GET', null, 'jeton-bidon'), res);
  assert.equal(res._status, 401);
});

// ─────────────────────────── 3. Brancher ───────────────────────────

test('PUT vérifie le webhook auprès de Discord, puis l\'enregistre sur la STRUCTURE', async () => {
  const store = {};
  const appels = mock(store, { status: 200, corps: { name: 'VisionScore' } });
  const res = mockRes();
  await handler(req('PUT', { url: WEBHOOK, libelle: '#staff-coachs' }), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.libelle, '#staff-coachs');
  // Vérification réelle auprès de Discord avant écriture.
  assert.ok(appels.some(a => a.url === WEBHOOK && a.method === 'GET'));
  // Clé portée par l'organisation, pas par le compte : tout le staff partage le canal.
  assert.ok(store['vs_canal:skillcamp'], 'la clé doit être celle de la structure');
  assert.equal(JSON.parse(store['vs_canal:skillcamp']).url, WEBHOOK);
});

test('PUT refuse un webhook que Discord ne connaît plus, et n\'enregistre rien', async () => {
  const store = {};
  mock(store, { status: 404 });
  const res = mockRes();
  await handler(req('PUT', { url: WEBHOOK }), res);
  assert.equal(res._status, 400);
  assert.match(res._json.error, /supprim|incompl/i);
  assert.equal(store['vs_canal:skillcamp'], undefined);
});

test('DELETE oublie le canal', async () => {
  const store = { 'vs_canal:skillcamp': JSON.stringify({ url: WEBHOOK }) };
  mock(store);
  const res = mockRes();
  await handler(req('DELETE'), res);
  assert.equal(res._status, 200);
  assert.equal(store['vs_canal:skillcamp'], undefined);
});

// ─────────────────────────── 4. Découpage ───────────────────────────

test('un texte court part en un seul morceau', () => {
  assert.equal(decouper('FEUILLE DE ROUTE\n  14:00  Scrim').length, 1);
});

test('aucun morceau ne dépasse la limite de Discord, clôture comprise', () => {
  // Une feuille de route plausible : beaucoup de lignes courtes.
  const texte = Array.from({ length: 400 }, (_, i) => '  TOP — Joueur' + i + ' vs Adversaire' + i + ' : Pool Gnar (12g, 58%WR)').join('\n');
  const morceaux = decouper(texte);
  assert.ok(morceaux.length > 1, 'ce texte doit être découpé');
  for (const m of morceaux) {
    const envoye = '```\n' + m + '\n```';
    assert.ok(envoye.length <= LIMITE, 'morceau de ' + envoye.length + ' caractères > ' + LIMITE);
  }
});

test('le découpage tombe sur des fins de ligne — aucune ligne coupée en deux', () => {
  const lignes = Array.from({ length: 300 }, (_, i) => 'ligne-entiere-numero-' + i);
  const morceaux = decouper(lignes.join('\n'));
  const recomposees = morceaux.join('\n').split('\n');
  assert.deepStrictEqual(recomposees, lignes);
});

test('une ligne unique plus longue que le budget est tronquée, pas rejetée', () => {
  const morceaux = decouper('x'.repeat(5000));
  assert.equal(morceaux.length, 1);
  assert.ok(('```\n' + morceaux[0] + '\n```').length <= LIMITE);
  assert.ok(morceaux[0].endsWith('…'), 'la troncature doit se voir');
});

// ─────────────────────────── 5. Publier ───────────────────────────

test('POST publie la feuille, en bloc de code et sans mention', async () => {
  const store = { 'vs_canal:skillcamp': JSON.stringify({ url: WEBHOOK, libelle: '#staff' }) };
  const appels = mock(store);
  const res = mockRes();
  await handler(req('POST', { titre: 'Feuille de route — SK vs KC', texte: '  14:00  Scrim\n  20:00  Coup d\'envoi' }), res);
  assert.equal(res._status, 200);
  assert.equal(res._json.morceaux, 1);

  const envois = appels.filter(a => a.url === WEBHOOK && a.method === 'POST');
  assert.equal(envois.length, 1);
  const corps = JSON.parse(envois[0].body);
  assert.match(corps.content, /^\*\*Feuille de route — SK vs KC\*\*\n```\n/);
  assert.ok(corps.content.includes('20:00'));
  // Le déroulé est aligné à l'espace : il lui faut une police à pas fixe.
  assert.ok(corps.content.endsWith('\n```'));
  // Une feuille de route ne doit sonner chez personne.
  assert.deepStrictEqual(corps.allowed_mentions, { parse: [] });
});

test('une feuille longue part en plusieurs messages, tous numérotés', async () => {
  const store = { 'vs_canal:skillcamp': JSON.stringify({ url: WEBHOOK }) };
  const appels = mock(store);
  const res = mockRes();
  const texte = Array.from({ length: 400 }, (_, i) => '  ligne de feuille de route numero ' + i).join('\n');
  await handler(req('POST', { titre: 'T', texte }), res);
  assert.equal(res._status, 200);
  const envois = appels.filter(a => a.url === WEBHOOK && a.method === 'POST');
  assert.ok(envois.length > 1);
  assert.equal(res._json.morceaux, envois.length);
  envois.forEach((e, i) => {
    const c = JSON.parse(e.body).content;
    assert.ok(c.includes('(' + (i + 1) + '/' + envois.length + ')'), 'morceau ' + (i + 1) + ' doit porter son rang');
    assert.ok(c.length <= LIMITE);
  });
});

test('POST sans canal branché répond 409 et dit où le brancher', async () => {
  mock({});
  const res = mockRes();
  await handler(req('POST', { texte: 'x' }), res);
  assert.equal(res._status, 409);
  assert.match(res._json.error, /canal/i);
});

test('une URL enregistrée devenue invalide ne sert pas de contournement', async () => {
  // Scénario : une clé écrite avant un durcissement de la validation.
  const store = { 'vs_canal:skillcamp': JSON.stringify({ url: 'http://169.254.169.254/' }) };
  const appels = mock(store);
  const res = mockRes();
  await handler(req('POST', { texte: 'x' }), res);
  assert.equal(res._status, 409);
  assert.equal(appels.filter(a => a.url.includes('169.254')).length, 0);
});

test('POST refuse un texte vide, et une feuille démesurée', async () => {
  const store = { 'vs_canal:skillcamp': JSON.stringify({ url: WEBHOOK }) };
  mock(store);
  let res = mockRes();
  await handler(req('POST', { texte: '   ' }), res);
  assert.equal(res._status, 400);
  res = mockRes();
  await handler(req('POST', { texte: 'x'.repeat(40001) }), res);
  assert.equal(res._status, 413);
});

test('si Discord refuse en cours de route, on dit combien de morceaux sont passés', async () => {
  const store = { 'vs_canal:skillcamp': JSON.stringify({ url: WEBHOOK }) };
  mock(store, { status: 404 });
  const res = mockRes();
  await handler(req('POST', { texte: 'court' }), res);
  assert.equal(res._status, 409);
  assert.equal(res._json.envoyes, 0);
  assert.match(res._json.error, /webhook/i);
});
