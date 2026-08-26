/* Assemble le moteur pour le NAVIGATEUR → assets/theorycraft.js

   Le point capital : ce script ne RÉÉCRIT rien. Il emballe les modules Node tels quels
   dans un `require` minuscule, et y joint les données. Porter le modèle à la main aurait
   créé une seconde implémentation — et deux implémentations divergent toujours, en
   silence, au premier patch. Ici, `node 50_bundle_navigateur.js` suffit à remettre le
   produit en phase avec les 546 vérifications du moteur.

   Sortie : un seul fichier statique, chargé À LA DEMANDE par app.html (~1,6 Mo brut,
   nettement moins une fois compressé par Vercel). Il n'entre pas dans `api/` : la limite
   des 12 fonctions serverless n'est pas touchée. */

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const SORTIE = path.join(RACINE, 'assets', 'theorycraft.js');

/* Les données. Elles remplacent les `require('./x.json')` des modules. */
const DONNEES = {
  './champions.json': 'champions.json',
  './items.json': 'items.json',
  './runes.json': 'runes.json',
  './groupes_objets.json': 'groupes_objets.json',
  './cibles.json': 'cibles.json'
};

/* Les modules, dans l'ordre où ils se référencent. Le shim gère les cycles par
   chargement paresseux, mais un ordre correct évite d'en dépendre. */
const MODULES = [
  '03_resolveur.js',
  'items_modeles.js',
  'runes_modeles.js',
  'sorts_modeles.js',
  '14_moteur_runes.js',
  '26_modele_degats.js',
  '30_moteur_items.js',
  '34_modele_survie.js',
  '36_runes_profil.js',
  '38_runes_combat.js',
  '40_legalite.js',
  '44_optimiseur.js'
];

/* `champFull.json` pèse 2,3 Mo et ne sert QU'À L'EXTRACTION (infobulles, nombre de
   rangs). Aucun module du moteur ne le lit à l'exécution — on vérifie plutôt que de
   le supposer, sinon le bundle embarquerait trois fois son poids utile. */
MODULES.forEach(f => {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const requis = [...src.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)].map(m => m[1]);
  requis.forEach(r => {
    const cle = r.endsWith('.json') ? r : r + (r.endsWith('.js') ? '' : '.js');
    const connu = DONNEES[r] || MODULES.includes(cle.replace('./', ''));
    if (!connu) throw new Error(f + ' réclame ' + r + ', absent du bundle');
  });
});

const source = MODULES.map(f => {
  const code = fs.readFileSync(path.join(__dirname, f), 'utf8');
  return '  d[' + JSON.stringify('./' + f.replace(/\.js$/, '')) + '] = function (module, exports, require) {\n'
       + code.replace(/^/gm, '    ') + '\n  };\n'
       // Un module peut être demandé avec ou sans son extension .js
       + '  d[' + JSON.stringify('./' + f) + '] = d[' + JSON.stringify('./' + f.replace(/\.js$/, '')) + '];\n';
}).join('\n');

const donnees = Object.entries(DONNEES).map(([cle, fichier]) =>
  '  j[' + JSON.stringify(cle) + '] = ' +
  fs.readFileSync(path.join(__dirname, fichier), 'utf8').trim() + ';'
).join('\n');

const bundle = `/* VisionScore — moteur de theorycraft, version navigateur.
   GÉNÉRÉ par tools/theorycraft/50_bundle_navigateur.js — ne pas éditer à la main.
   Toute correction se fait dans les modules source, puis on relance le script :
   c'est ce qui garantit que le produit et les 546 vérifications parlent du même code.
   Données Data Dragon ${require('./champFull.json').version}. */
(function (racine) {
  'use strict';
  var j = {};   // données JSON
${donnees}

  var d = {};   // fabriques de modules
  var cache = {};
  function require(nom) {
    if (j[nom]) return j[nom];
    var cle = d[nom] ? nom : (d[nom + '.js'] ? nom + '.js' : nom);
    if (cache[cle]) return cache[cle].exports;
    if (!d[cle]) throw new Error('module absent du bundle : ' + nom);
    var m = { exports: {} };
    cache[cle] = m;                    // avant l'exécution : autorise les cycles
    d[cle](m, m.exports, require);
    return m.exports;
  }

${source}

  /* Surface publique : uniquement ce dont l'interface a besoin. */
  var degats = require('./26_modele_degats');
  var objets = require('./30_moteur_items');
  var survie = require('./34_modele_survie');
  var runesProfil = require('./36_runes_profil');
  var runesCombat = require('./38_runes_combat');
  var legalite = require('./40_legalite');
  var optimiseur = require('./44_optimiseur');

  racine.vsTheorycraft = {
    version: ${JSON.stringify(require('./champFull.json').version)},
    champions: j['./champions.json'],
    objets: j['./items.json'],
    runes: j['./runes.json'],
    groupes: j['./groupes_objets.json'],
    cibles: j['./cibles.json'],

    profil: degats.profil,
    ficheBuild: survie.ficheBuild,
    gainSurvie: survie.gainSurvie,
    boucliers: survie.boucliers,
    soinsDuChampion: survie.soinsDuChampion,
    evaluerCalcul: degats.evaluerCalcul,
    degatsSurFenetre: degats.degatsSurFenetre,
    cibleChampion: degats.cibleChampion,
    mitiger: degats.mitiger,
    evaluerPassif: objets.evaluerPassif,
    coupsAImpact: objets.coupsAImpact,
    amplification: objets.amplification,
    reductionResistances: objets.reductionResistances,
    modelesObjets: objets.MODELES,
    runesSurFenetre: runesCombat.surFenetre,
    statsDeRunes: runesProfil.statsDeRunes,
    buildLegal: legalite.buildLegal,
    conflits: legalite.conflits,
    pageLegale: legalite.pageLegale,
    /* Optimiseur : la seule partie du moteur qui RÉPOND à « lequel prendre ? » plutôt
       qu'à « combien vaut celui-ci ? ». */
    profilChampion: optimiseur.profilChampion,
    valeurLigne: optimiseur.valeurLigne,
    matchupDepuisCompo: optimiseur.matchupDepuisCompo,
    chercherBuilds: optimiseur.chercherBuilds,
    comparerBuilds: optimiseur.comparerBuilds,
    valeurBuild: optimiseur.valeurBuild,
    chercherRunes: optimiseur.chercherRunes,
    ordreAchat: optimiseur.ordreAchat
  };
})(typeof window !== 'undefined' ? window : this);
`;

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, bundle);
const ko = n => Math.round(n / 1024) + ' Ko';
console.log('assets/theorycraft.js écrit — ' + ko(Buffer.byteLength(bundle)));
console.log('  modules embarqués : ' + MODULES.length);
console.log('  champions : ' + Object.keys(require('./champions.json')).length +
            ' · objets : ' + require('./items.json').length +
            ' · runes : ' + require('./runes.json').filter(r => r.active).length + ' actives');
