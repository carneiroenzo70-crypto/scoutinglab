/* Le moteur de méta de la salle de draft — vérifications sur les fonctions PURES
   extraites d'app.html.

   Pourquoi un test ici : le défaut qui a motivé ce fichier ne levait aucune erreur
   et ne vidait aucun écran. La requête méta triait sur `OverviewPage DESC`, donc
   par ordre ALPHABÉTIQUE — pour la LEC, dont les splits s'appellent Winter /
   Spring / Summer, « Winter » passait en tête et les 300 lignes remontées étaient
   celles de JANVIER. L'interface affichait des pourcentages parfaitement crédibles,
   calculés sur la méta d'il y a huit mois. Exactement le genre de faute qu'aucun
   test d'interface n'attrape et qu'un coach ne peut pas soupçonner. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');

/* Extraction par comptage d'accolades : app.html n'est pas un module, on ne peut
   pas l'importer. On isole les fonctions nommées dont on a besoin, rien de plus —
   charger le fichier entier exigerait un DOM. */
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

const bac = vm.createContext({ window: {}, Date, Math, JSON, String, Number, parseInt, encodeURIComponent, console });
vm.runInContext(
  'const SS_ROLES = ' + JSON.stringify(['Top', 'Jgl', 'Mid', 'ADC', 'Sup']) + ';\n' +
  'const DL_META_MIN_ROLE = 8;\n' +
  'const PM_POOL_FRAIS = 90;\n' +
  [source('dlNorm'), source('dlMetaParseSide'), source('dlMetaAgreger'), source('dlMetaRolePro'),
   source('pmBorneFraiche'), source('pmAggCompet')].join('\n'),
  bac);

/* ── 1. La régression qui a tout déclenché ────────────────────────────────────── */

test('la requête méta est triée par DATE, jamais par OverviewPage', () => {
  const src = source('dlMetaBuild');
  assert.ok(/order_by[^;]*DateTime_UTC DESC/.test(src),
    'le tri doit porter sur DateTime_UTC : trier sur OverviewPage revient à trier par ordre ' +
    'alphabétique de nom de split, ce qui remonte Winter avant Summer.');
  assert.ok(!/order_by=OverviewPage/.test(src),
    'tri alphabétique sur OverviewPage : c\'est le défaut d\'origine, il remonte le split le plus ANCIEN.');
});

test('la requête méta borne la période côté serveur', () => {
  const src = source('dlMetaBuild');
  assert.ok(/DateTime_UTC >= /.test(src),
    'sans borne basse, 300 lignes couvrent trois jours pour une ligue active et un an pour ' +
    'une ligue en pause — deux échantillons qu\'on ne peut pas additionner.');
});

test('aucune année n\'est écrite en dur dans les sources de méta', () => {
  const i = app.indexOf('const DL_META_SOURCES');
  const bloc = app.slice(i, app.indexOf('];', i));
  assert.ok(!/20\d\d/.test(bloc),
    'une année en dur (« LCK/2026% ») cesse silencieusement de remonter quoi que ce soit au ' +
    '1er janvier : la méta deviendrait vide sans la moindre erreur.');
});

/* ── 2. L'agrégation ──────────────────────────────────────────────────────────── */

const ligne = (p1, p2, winner, game) => ({
  title: {
    Team1PicksByRoleOrder: p1.join(','), Team2PicksByRoleOrder: p2.join(','),
    Winner: String(winner), N_GameInMatch: String(game), 'DateTime UTC': '2026-09-01 12:00:00'
  }
});

const BLEU = ['Aatrox', 'Vi', 'Ahri', 'Jinx', 'Nautilus'];
const ROUGE = ['K\'Sante', 'Sejuani', 'Azir', 'Caitlyn', 'Lulu'];

test('le contre est compté dans les DEUX sens et sur le bon poste', () => {
  const agg = bac.dlMetaAgreger([ligne(BLEU, ROUGE, 1, 1), ligne(BLEU, ROUGE, 2, 1), ligne(BLEU, ROUGE, 1, 1)]);
  const ahriVsAzir = agg.counter.Mid.ahri.azir;
  const azirVsAhri = agg.counter.Mid.azir.ahri;
  assert.strictEqual(ahriVsAzir.games, 3);
  assert.strictEqual(ahriVsAzir.wins, 2);
  assert.strictEqual(azirVsAhri.games, 3);
  assert.strictEqual(azirVsAhri.wins, 1, 'les victoires des deux camps doivent totaliser les games');
  assert.strictEqual(agg.counter.Top.ahri, undefined, 'un mid ne doit pas polluer le poste Top');
});

test('la priorité est ventilée par numéro de game du BO', () => {
  const agg = bac.dlMetaAgreger([ligne(BLEU, ROUGE, 1, 1), ligne(BLEU, ROUGE, 1, 3), ligne(BLEU, ROUGE, 1, 3)]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(agg.priority.Jgl.vi)), { 1: 1, 2: 0, 3: 2 });
});

test('la synergie ADC↔Support ne retient que la paire du MÊME camp', () => {
  const agg = bac.dlMetaAgreger([ligne(BLEU, ROUGE, 1, 1), ligne(BLEU, ROUGE, 1, 1)]);
  assert.strictEqual(agg.pairStats['jinx|nautilus'].wins, 2);
  assert.strictEqual(agg.pairStats['caitlyn|lulu'].wins, 0);
  assert.strictEqual(agg.pairStats['jinx|lulu'], undefined,
    'une paire croisée entre les deux équipes n\'a jamais joué ensemble');
});

test('une ligne au format inattendu est ignorée, jamais complétée', () => {
  const tronquee = { title: { Team1PicksByRoleOrder: 'Aatrox,Vi', Team2PicksByRoleOrder: ROUGE.join(','), Winner: '1', N_GameInMatch: '1' } };
  const agg = bac.dlMetaAgreger([tronquee, ligne(BLEU, ROUGE, 1, 1)]);
  assert.strictEqual(agg.games, 1, 'seule la ligne complète compte');
});

/* ── 3. Le rôle déduit de la compétition ──────────────────────────────────────── */

test('un échantillon trop mince ne redéfinit pas le rôle', () => {
  const agg = bac.dlMetaAgreger([ligne(BLEU, ROUGE, 1, 1)]);
  assert.strictEqual(bac.dlMetaRolePro(agg, 'Ahri'), null,
    'une seule game ne suffit pas à déclarer qu\'un champion a changé de poste');
});

test('un rôle dominant net sur assez de games est retenu', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(ligne(BLEU, ROUGE, 1, 1));
  assert.strictEqual(bac.dlMetaRolePro(bac.dlMetaAgreger(rows), 'Ahri'), 'Mid');
});

test('un flex sans poste dominant reste non tranché', () => {
  const botAhri = ['Aatrox', 'Vi', 'Azir', 'Ahri', 'Nautilus'];
  const rows = [];
  for (let i = 0; i < 6; i++) { rows.push(ligne(BLEU, ROUGE, 1, 1)); rows.push(ligne(botAhri, ROUGE, 1, 1)); }
  assert.strictEqual(bac.dlMetaRolePro(bac.dlMetaAgreger(rows), 'Ahri'), null,
    'moitié Mid, moitié ADC : trancher reviendrait à inventer une intention');
});

/* ── 4. La fraîcheur du pool adverse ──────────────────────────────────────────── */

const jourIl_y_a = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const partie = (champ, date, win) => ({ champ, date, win, k: 3, d: 2, a: 5, cs: 200, vision: 20, gold: 10000, dmg: 15000, event: 'LFL' });

test('le pool récent exclut ce qui sort de la fenêtre, le pool complet le garde', () => {
  const agg = bac.pmAggCompet([
    partie('Ahri', jourIl_y_a(5), true), partie('Ahri', jourIl_y_a(9), true),
    partie('Sylas', jourIl_y_a(200), true), partie('Sylas', jourIl_y_a(210), false), partie('Sylas', jourIl_y_a(220), true)
  ]);
  assert.deepStrictEqual(Array.from(agg.champPoolRecent).map(c => c.name), ['Ahri']);
  assert.strictEqual(agg.gamesRecent, 2);
  assert.strictEqual(agg.champPool[0].name, 'Sylas',
    'le pool complet reste trié par volume — c\'est le pool RÉCENT qui porte l\'actualité');
  assert.strictEqual(agg.derniere, jourIl_y_a(5), 'la date de dernière game rend la fraîcheur vérifiable');
});

test('un joueur sans game récente garde un pool complet exploitable', () => {
  const agg = bac.pmAggCompet([partie('Renekton', jourIl_y_a(300), true), partie('Renekton', jourIl_y_a(310), false)]);
  assert.strictEqual(agg.champPoolRecent.length, 0);
  assert.strictEqual(agg.champPool.length, 1,
    'un revenant ne doit pas disparaître du scouting : on montre ses archives, en le disant');
});

/* ── 5. La lecture de composition ─────────────────────────────────────────────
   Ces fonctions décident ce que le coach lit pendant les 30 secondes qu'il a pour
   bannir. Un seuil qui glisse, et l'outil se met à commenter du bruit avec
   l'aplomb d'une mesure. */

vm.runInContext([source('dlAlertesCompo'), source('dlContre')].join('\n') + '\nconst DL_CONTRE_MIN = 3;', bac);

const lecture = (o) => Object.assign(
  { picks: 5, partPhysique: null, sansType: [], cac: 0, distance: 0, porteeLues: 5, classes: {}, moteur: true }, o);

test('aucune alerte avant trois picks : en dessous ce serait du bruit', () => {
  const l = lecture({ picks: 2, partPhysique: 1, cac: 2, classes: {} });
  assert.strictEqual(bac.dlAlertesCompo(l, true).length, 0,
    'deux picks ne décrivent pas une composition');
});

test('un profil monotype est signalé, dans les deux sens', () => {
  const phys = bac.dlAlertesCompo(lecture({ picks: 4, partPhysique: 0.8, classes: { Tank: 1 } }), true);
  assert.ok(phys.some(a => /physiques/.test(a.texte)), 'profil très physique non signalé');
  const magi = bac.dlAlertesCompo(lecture({ picks: 4, partPhysique: 0.2, classes: { Tank: 1 } }), true);
  assert.ok(magi.some(a => /magiques/.test(a.texte)), 'profil très magique non signalé');
});

test('un profil équilibré ne déclenche rien', () => {
  const a = bac.dlAlertesCompo(lecture({ picks: 5, partPhysique: 0.55, cac: 2, classes: { Tank: 1, Combattant: 1 } }), true);
  assert.deepStrictEqual(Array.from(a), [], '55 % n\'est pas un déséquilibre');
});

test('la même lecture change de TON selon le camp', () => {
  const l = lecture({ picks: 4, partPhysique: 0.85, classes: { Tank: 1 } });
  assert.strictEqual(bac.dlAlertesCompo(l, true)[0].ton, 'risque');
  assert.strictEqual(bac.dlAlertesCompo(l, false)[0].ton, 'occasion',
    'chez l\'adversaire, un profil monotype est une occasion, pas un risque');
});

test('l\'absence de ligne avant n\'est signalée qu\'à partir de quatre picks', () => {
  const trois = bac.dlAlertesCompo(lecture({ picks: 3, partPhysique: 0.5, classes: { Mage: 2 } }), true);
  assert.ok(!trois.some(a => /ligne avant/.test(a.texte)), 'il reste deux picks pour en trouver une');
  const quatre = bac.dlAlertesCompo(lecture({ picks: 4, partPhysique: 0.5, classes: { Mage: 3 } }), true);
  assert.ok(quatre.some(a => /ligne avant/.test(a.texte)));
});

test('un combattant compte comme ligne avant, au même titre qu\'un tank', () => {
  const a = bac.dlAlertesCompo(lecture({ picks: 4, partPhysique: 0.5, classes: { Combattant: 1, Mage: 2 } }), true);
  assert.ok(!a.some(x => /ligne avant/.test(x.texte)));
});

test('un contre sous le seuil d\'échantillon ne rend rien', () => {
  const meta = { counter: { Mid: { sylas: { azir: { games: 2, wins: 2 } } } } };
  assert.strictEqual(bac.dlContre(meta, 'Mid', 'sylas', 'azir'), null,
    '100 % sur deux games mettrait un champion en tête d\'une liste de conseils');
});

test('un contre mesuré rend son winrate ET son échantillon', () => {
  const meta = { counter: { Mid: { sylas: { azir: { games: 11, wins: 8 } } } } };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(bac.dlContre(meta, 'Mid', 'sylas', 'azir'))), { games: 11, wr: 73 });
});

test('dlContre ne suppose jamais que la case existe', () => {
  const meta = { counter: { Mid: {} } };
  assert.strictEqual(bac.dlContre(meta, 'Mid', 'inconnu', 'azir'), null);
  assert.strictEqual(bac.dlContre(null, 'Mid', 'a', 'b'), null);
  assert.strictEqual(bac.dlContre(meta, 'Jgl', 'a', 'b'), null, 'un poste absent ne doit pas lever');
});
