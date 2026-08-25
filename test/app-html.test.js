/* Vérifications STATIQUES sur app.html.

   Il n'y a pas de runner côté client : ces deux défauts-ci sont passés en production
   parce que rien ne les regardait. Tous deux ont la même signature — ils ne lèvent
   AUCUNE erreur, ils rendent simplement l'interface inerte ou invisible. Ce sont
   exactement ceux qu'un test statique attrape pour presque rien. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');

/* Le code SEUL, commentaires retirés. Sans ça, la première version de ce fichier
   échouait sur le commentaire qui DÉCRIT le défaut : citer un motif fautif pour
   l'expliquer n'est pas le commettre, et un test qui interdit d'en parler pousse à
   supprimer l'explication plutôt que le défaut. */
const codeSeul = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ── 1. Les attributs onclick construits par concaténation ──────────────────────────
   La liste de champions du sélecteur de builds était entièrement morte : ses boutons
   portaient
       onclick="boChoisir(" + JSON.stringify(nom) + ")"
   et `JSON.stringify` rend des GUILLEMETS DOUBLES, à l'intérieur d'un attribut lui-même
   délimité par des guillemets doubles. Le navigateur fermait l'attribut au premier, et
   l'appel devenait du code invalide, silencieusement ignoré. La liste s'affichait
   parfaitement ; aucun nom ne répondait. */
test('aucun onclick construit ne reçoit de JSON.stringify', () => {
  const fautifs = [];
  /* On regarde chaque onclick="…" ouvert par concaténation, jusqu'à sa fermeture. */
  for (const m of codeSeul.matchAll(/onclick="[^"]*?'\s*\+[\s\S]{0,400}?'\)?"/g)) {
    if (/JSON\.stringify/.test(m[0])) fautifs.push(m[0].slice(0, 120));
  }
  assert.deepStrictEqual(fautifs, [],
    'JSON.stringify dans un attribut onclick produit des guillemets doubles qui ferment ' +
    'l\'attribut : le gestionnaire devient inerte. Passer par des attributs data- et un ' +
    'écouteur délégué.');
});

/* ── 2. Les jetons de couleur inventés ──────────────────────────────────────────────
   La même liste s'est aussi affichée TRANSPARENTE, par-dessus les curseurs : son fond
   employait `var(--vs-bg-2)`, un jeton absent de la feuille. Une couleur inconnue ne
   déclenche pas d'erreur — le navigateur ne peint rien. Trois noms inventés étaient en
   place (`--vs-bg-2`, `--vs-line`, `--vs-line-soft`), plus un orphelin préexistant sur
   le « + » d'un poste vide du roster (`--vs-forest-400`, alors que l'échelle s'arrête
   à 500). */
test('tout jeton --vs-* employé sans repli est défini', () => {
  const definis = new Set([...app.matchAll(/(--vs-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const employes = new Set();
  /* Seulement les emplois SANS valeur de repli : `var(--x, #fff)` est légitime. */
  for (const m of app.matchAll(/var\(\s*(--vs-[a-z0-9-]+)\s*([,)])/g)) {
    if (m[2] === ')') employes.add(m[1]);
  }
  const orphelins = [...employes].filter(j => !definis.has(j));
  assert.deepStrictEqual(orphelins, [],
    'jeton(s) de couleur employés sans être définis : le navigateur ne peint rien, ' +
    'sans la moindre erreur.');
  assert.ok(employes.size > 5, 'la détection doit trouver des emplois, sinon elle ne prouve rien');
});

/* ── 3. Le contre-test des deux précédents ─────────────────────────────────────────
   Une vérification qui ne trouve jamais rien ne prouve rien. On s'assure donc qu'elle
   attraperait bien le défaut qu'elle prétend surveiller. */
test('les deux détections attrapent effectivement le défaut qu\'elles visent', () => {
  const faux = '<button onclick="f(\' + JSON.stringify(x) + \')">';
  let vu = false;
  for (const m of faux.matchAll(/onclick="[^"]*?'\s*\+[\s\S]{0,400}?'\)?"/g)) {
    if (/JSON\.stringify/.test(m[0])) vu = true;
  }
  assert.ok(vu, 'la détection des onclick doit reconnaître le motif fautif');

  const cssFaux = ':root{--vs-ok:#000} .a{background:var(--vs-inexistant)}';
  const def = new Set([...cssFaux.matchAll(/(--vs-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const emp = [];
  for (const m of cssFaux.matchAll(/var\(\s*(--vs-[a-z0-9-]+)\s*([,)])/g)) {
    if (m[2] === ')') emp.push(m[1]);
  }
  assert.deepStrictEqual(emp.filter(j => !def.has(j)), ['--vs-inexistant'],
    'la détection des jetons doit reconnaître un nom absent');
});

/* ── 4. L'ORDRE des blocs de conseil, en EXÉCUTANT le rendu ────────────────────────
   Une page de runes se choisit AVANT le premier achat, et ne se rachète pas. Elle
   s'affichait pourtant sous les cinq builds — l'inverse de l'ordre où la décision se
   prend. Vérifier ça par une simple recherche de motif dans la source serait fragile
   (deux textes peuvent apparaître dans n'importe quel ordre dans le fichier sans rien
   dire du HTML produit). On EXTRAIT donc `boAfficher` et on l'exécute pour de vrai,
   avec les trois seuls helpers qu'elle emploie, puis on lit l'ordre dans sa sortie. */
function rendre(r) {
  const debut = app.indexOf('function boAfficher(r, ms){');
  assert.ok(debut > 0, 'boAfficher introuvable dans app.html');
  /* La fonction se ferme sur la première accolade en colonne 0 qui suit. `app.html` est
     enregistré en fins de ligne WINDOWS : chercher '\n}\n' n'y trouve jamais rien et
     rendait cette extraction silencieusement vide. */
  const ferme = /\r?\n\}\r?\n/g;
  ferme.lastIndex = debut;
  const m = ferme.exec(app);
  assert.ok(m, 'fin de boAfficher introuvable');
  const src = app.slice(debut, m.index + m[0].length);
  let sortie = '';
  const faux = {
    anEsc: s => String(s == null ? '' : s),
    boImgObjet: () => '',
    document: { getElementById: () => ({ set innerHTML(v) { sortie = v; } }) }
  };
  new Function('anEsc', 'boImgObjet', 'document',
    src + '\nboAfficher(arguments[3], 1);')(faux.anEsc, faux.boImgObjet, faux.document, r);
  return sortie;
}

/* Un résultat minimal mais COMPLET : uniquement les champs que boAfficher lit. */
const resultat = (sup = {}) => Object.assign({
  matchup: 'Aatrox, Amumu', evaluations: 3209, methode: 'méthode',
  base: { degats: 2000, survie: 3000 },
  partAttaques: 0.3, sansMitigation: [], sortsDegats: 4,
  champion: 'Smolder',
  profil: { nom: 'Smolder', partAttaques: 0.69, partAD: 0.61, ratioCrit: 3.5,
            raison: 'ses sorts portent 61 % de ratios AD' },
  runes: {
    evaluations: 27, legale: true, majeure: { nom: 'Comète', arbre: 'Sorcellerie' },
    principal: [{ nom: 'A' }], secondaire: { arbre: 'Précision', runes: [{ nom: 'B' }] },
    fragments: [{ nom: 'C' }], gainDegatsPct: 12, gainSurviePct: 3, apportMajeure: 400,
    methode: 'trois passes'
  },
  builds: [{
    objets: [3031], noms: ["Lame d'infini"], or: 3500, gainDegatsPct: 624,
    gainSurviePct: 84, degats: 15788, survie: 7047, apports: [], inutiles: []
  }]
}, sup);

test('la page de runes est rendue AVANT le premier build', () => {
  const html = rendre(resultat());
  const runes = html.indexOf('Page de runes conseillée');
  const build = html.indexOf('>#1<');
  assert.ok(runes > 0, 'le bloc de runes doit être rendu');
  assert.ok(build > 0, 'le premier build doit être rendu');
  const profil = html.indexOf('Ce que le moteur a déduit');
  assert.ok(profil > 0 && profil < runes,
    'l\'identité déduite du champion doit ouvrir les résultats : elle conditionne tout ' +
    'le reste du conseil, et remplace une question qu\'on posait au coach');
  assert.ok(runes < build,
    'la page de runes se choisit avant le premier achat : elle doit précéder les builds ' +
    '(runes à ' + runes + ', build #1 à ' + build + ')');
});

/* ── 5. L'aveu quand le modèle ne sait pas mitiger le kit ──────────────────────────
   SMOLDER : Q, W et E sont de type « mixte » — le modèle ignore quelle part passe par
   l'armure, retient les dégâts BRUTS, et la pénétration d'armure ne peut donc plus rien
   lui apporter. Trois sorts sur quatre : le classement d'objets perd son sens pour lui.
   Ce fait doit apparaître à l'écran, sinon le conseil se donne des airs de certitude. */
test('un champion dont la majorité du kit n\'est pas mitigée est signalé', () => {
  const html = rendre(resultat({
    sansMitigation: ['Q (mixte:physiques+magiques+bruts)', 'W (mixte)', 'E (mixte)'],
    sortsDegats: 4
  }));
  assert.match(html, /mal modélisé/,
    'trois sorts non mitigés sur quatre doivent déclencher l\'avertissement');
  assert.match(html, /pénétration d'armure ne leur sert à rien/,
    'la conséquence concrète doit être nommée, pas seulement le symptôme');

  /* Contre-test : un seul sort mixte sur quatre reste une approximation acceptable et
     ne doit PAS déclencher l'alarme, sinon elle se déclenche partout et ne veut rien dire. */
  const sain = rendre(resultat({ sansMitigation: ['Q (mixte)'], sortsDegats: 4 }));
  assert.doesNotMatch(sain, /mal modélisé/,
    'un sort mixte sur quatre ne doit pas déclencher l\'avertissement');
});
