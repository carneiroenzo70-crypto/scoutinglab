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

/* ── 6. LE DIGEST « CE QUI A CHANGÉ » ──────────────────────────────────────────────
   La logique vit dans app.html, où il n'y a pas de runner. On l'EXTRAIT et on
   l'exécute, comme pour boAfficher : c'est la seule façon de vérifier une décision
   plutôt qu'un motif de texte.

   Ce qui est vérifié n'est pas « ça produit des signaux » — n'importe quel seuil en
   produit. C'est que le seuil est RELATIF AU JOUEUR : le même écart absolu doit être
   signalé chez un joueur régulier et ignoré chez un joueur instable. Sans ça, le digest
   ne vaut pas mieux qu'un tableur avec un ±10 %. */
function digestFns() {
  /* Une seule TRANCHE CONTIGUË, des constantes jusqu'à la fin de vsdSignaux. Découper
     variable par variable sur le premier « ; » suivi d'un saut de ligne échouait : deux
     constantes portent un commentaire APRÈS le point-virgule, et l'extraction avalait
     alors le bloc suivant en produisant du code invalide. Le défaut était dans le test,
     pas dans app.html — et un test qui échoue à extraire ne prouve rien du tout. */
  const debut = app.indexOf('var VSD_MESURES =');
  assert.ok(debut > 0, 'VSD_MESURES introuvable dans app.html');
  const i = app.indexOf('function vsdSignaux(', debut);
  assert.ok(i > debut, 'vsdSignaux introuvable dans app.html');
  const ferme = /\r?\n\}\r?\n/g;
  ferme.lastIndex = i;
  const m = ferme.exec(app);
  assert.ok(m, 'fin de vsdSignaux introuvable');
  const src = app.slice(debut, m.index + m[0].length);
  return new Function(src + '\nreturn { vsdSignaux: vsdSignaux, vsdEcartType: vsdEcartType };')();
}
const D = digestFns();

/* Fabrique d'historique : une valeur par jour, du plus ancien au plus récent. */
const histo = (pseudo, cle, valeurs, tiers) => valeurs.map((v, i) => ({
  date: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
  players: [Object.assign({ pseudo, role: 'Mid' }, { [cle]: v },
    tiers ? { tier: tiers[i] } : {})]
}));

test('un mouvement hors du bruit habituel du joueur est signalé', () => {
  /* Joueur RÉGULIER : CS/min qui varie de ±0,05, puis chute de 0,6. */
  const snaps = histo('Regulier', 'csMin', [8.00, 8.05, 7.95, 8.02, 7.98, 8.01, 7.40]);
  const r = D.vsdSignaux(snaps, { jours: 6 });
  assert.ok(r.assez, 'sept relevés doivent suffire : ' + (r.pourquoi || ''));
  const s = r.signaux.find(x => x.mesure === 'csMin');
  assert.ok(s, 'la chute de CS/min doit être signalée');
  assert.strictEqual(s.sens, -1, 'et signalée comme une baisse');
});

/* ⚠ LE TEST QUI JUSTIFIE TOUT LE RESTE. Même joueur, même écart final EXACTEMENT,
   mais un historique qui oscille déjà autant. Un seuil fixe signalerait les deux ;
   ici le second doit se taire, parce que ce mouvement-là ne dit rien de nouveau. */
test('le MÊME écart chez un joueur instable n\'est PAS signalé', () => {
  const regulier = D.vsdSignaux(histo('R', 'csMin', [8.00, 8.05, 7.95, 8.02, 7.98, 8.01, 7.40]), { jours: 6 });
  const instable = D.vsdSignaux(histo('I', 'csMin', [8.00, 7.30, 8.60, 7.20, 8.50, 7.35, 7.40]), { jours: 6 });
  const vuR = regulier.signaux.some(s => s.mesure === 'csMin');
  const vuI = instable.signaux.some(s => s.mesure === 'csMin');
  assert.ok(vuR, 'le joueur régulier doit être signalé');
  assert.ok(!vuI, 'le joueur instable ne doit PAS l\'être : ce mouvement est son ordinaire');
});

test('un historique parfaitement plat ne produit aucun signal', () => {
  /* Écart-type nul : le modèle ne sait pas juger, il se tait au lieu d\'inventer. */
  const r = D.vsdSignaux(histo('Plat', 'kda', [3, 3, 3, 3, 3, 3, 3]), { jours: 6 });
  assert.deepStrictEqual(r.signaux.filter(s => s.mesure === 'kda'), []);
});

test('trop peu de relevés : le digest le dit au lieu de produire du vide', () => {
  const r = D.vsdSignaux(histo('Neuf', 'kda', [3, 5]), { jours: 14 });
  assert.strictEqual(r.assez, false);
  assert.match(r.pourquoi, /relev/, 'la raison doit être écrite en clair');
  assert.deepStrictEqual(r.signaux, []);
});

test('un changement de palier est toujours signalé, et passe devant le reste', () => {
  const snaps = histo('Grimpe', 'csMin', [8.0, 8.05, 7.95, 8.02, 7.98, 8.01, 7.40],
    ['GOLD', 'GOLD', 'GOLD', 'GOLD', 'GOLD', 'GOLD', 'PLATINUM']);
  const r = D.vsdSignaux(snaps, { jours: 6 });
  const t = r.signaux.find(s => s.mesure === 'tier');
  assert.ok(t, 'le passage Or → Platine doit être signalé');
  assert.strictEqual(t.sens, 1, 'et reconnu comme une montée');
  assert.strictEqual(t.avantTexte, 'Or');
  assert.strictEqual(t.apresTexte, 'Platine');
  assert.strictEqual(r.signaux[0].mesure, 'tier', 'le palier doit être le premier signal');
});

test('la comparaison part du relevé le plus récent AVANT la fenêtre', () => {
  /* Historique long : comparer au plus ancien ferait passer une dérive de saison pour
     un mouvement de la semaine. On veut le bord de la fenêtre, pas le début des temps. */
  const snaps = histo('Long', 'kda', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const r = D.vsdSignaux(snaps, { jours: 3 });
  assert.ok(r.assez, r.pourquoi || '');
  assert.ok(r.jours <= 4, 'la période comparée doit rester proche de la fenêtre, obtenu ' + r.jours);
  assert.notStrictEqual(new Date(r.depuis).getTime(), new Date(snaps[0].date).getTime(),
    'le point de départ ne doit pas être le tout premier relevé');
});

test('l\'écart-type refuse de se prononcer sur moins de deux valeurs', () => {
  assert.strictEqual(D.vsdEcartType([]), null);
  assert.strictEqual(D.vsdEcartType([5]), null);
  assert.ok(Math.abs(D.vsdEcartType([2, 4, 4, 4, 5, 5, 7, 9]) - 2.138) < 0.01,
    'écart-type d\'échantillon standard');
});

/* ── 7. LA FUSION À TROIS SOURCES ─────────────────────────────────────────────────
   Le serveur détecte désormais le conflit (voir test/store.test.js). Mais détecter ne
   suffit pas : si le coach doit choisir « ma version » ou « la sienne », l'un des deux
   perd son travail — on aurait remplacé une perte silencieuse par une perte annoncée.

   Ce qui est vérifié ici n'est pas « ça fusionne », c'est que le CAS COURANT — deux
   coachs qui ajoutent chacun un prospect différent — se règle SANS PERTE et sans poser
   de question. Le reste du temps, on vérifie surtout que rien ne disparaît. */
function fusionFns() {
  const debut = app.indexOf('function vsMemeValeur(');
  assert.ok(debut > 0, 'vsMemeValeur introuvable dans app.html');
  const i = app.indexOf('function vsFusionDomaine(', debut);
  assert.ok(i > debut, 'vsFusionDomaine introuvable dans app.html');
  const ferme = /\r?\n\}\r?\n/g;
  ferme.lastIndex = i;
  const m = ferme.exec(app);
  assert.ok(m, 'fin de vsFusionDomaine introuvable');
  return new Function(app.slice(debut, m.index + m[0].length) +
    '\nreturn { vsFusionDomaine: vsFusionDomaine };')();
}
const F = fusionFns();
const crm = liste => ({ spes_crm_pipeline: liste });

/* ⚠ LE CAS QUI ARRIVE TOUS LES JOURS DANS UNE STRUCTURE. */
test('deux coachs qui ajoutent chacun un prospect gardent les deux', () => {
  const base = crm([{ id: 1, nom: 'Existant' }]);
  const mien = crm([{ id: 1, nom: 'Existant' }, { id: 2, nom: 'Ajouté par moi' }]);
  const autre = crm([{ id: 1, nom: 'Existant' }, { id: 3, nom: 'Ajouté par lui' }]);
  const r = F.vsFusionDomaine(base, mien, autre);
  const ids = r.data.spes_crm_pipeline.map(x => x.id).sort();
  assert.deepStrictEqual(ids, [1, 2, 3], 'les deux ajouts doivent survivre');
  assert.deepStrictEqual(r.conflits, [], 'et ce cas ne doit demander aucun arbitrage');
});

test('une suppression volontaire n\'est pas ressuscitée par la fusion', () => {
  const base = crm([{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }]);
  const mien = crm([{ id: 1, nom: 'A' }]);                       // j'ai supprimé le 2
  const autre = crm([{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }]); // l'autre n'y a pas touché
  const r = F.vsFusionDomaine(base, mien, autre);
  assert.deepStrictEqual(r.data.spes_crm_pipeline.map(x => x.id), [1]);
});

/* Entre supprimer le travail de quelqu'un et laisser une ligne en trop, la ligne en trop
   se corrige d'un clic — le travail perdu, non. La fusion penche donc vers la
   conservation, et le dit. */
test('supprimé d\'un côté mais MODIFIÉ de l\'autre : on garde, et on le signale', () => {
  const base = crm([{ id: 1, nom: 'A' }, { id: 2, nom: 'B' }]);
  const mien = crm([{ id: 1, nom: 'A' }]);                            // j'ai supprimé le 2
  const autre = crm([{ id: 1, nom: 'A' }, { id: 2, nom: 'B corrigé' }]); // l'autre l'a retravaillé
  const r = F.vsFusionDomaine(base, mien, autre);
  const deux = r.data.spes_crm_pipeline.find(x => x.id === 2);
  assert.ok(deux, 'le travail de l\'autre coach ne doit pas être détruit par ma suppression');
  assert.strictEqual(deux.nom, 'B corrigé');
  assert.ok(r.conflits.length, 'et ce choix doit remonter à l\'écran, pas rester dans le code');
});

test('le même élément modifié des deux côtés : le dernier garde la main, mais c\'est signalé', () => {
  const base = crm([{ id: 1, nom: 'Origine' }]);
  const mien = crm([{ id: 1, nom: 'Ma version' }]);
  const autre = crm([{ id: 1, nom: 'Sa version' }]);
  const r = F.vsFusionDomaine(base, mien, autre);
  assert.strictEqual(r.data.spes_crm_pipeline[0].nom, 'Ma version');
  assert.ok(r.conflits.length, 'le seul cas vraiment indécidable doit se voir');
});

test('ce que je n\'ai pas touché prend la valeur de l\'autre', () => {
  /* Sans la base, on ne saurait pas que c'est LUI qui a changé et pas moi. */
  const base = { vs_rosters: [{ id: 1 }], vs_active_roster: 1 };
  const mien = { vs_rosters: [{ id: 1 }], vs_active_roster: 1 };
  const autre = { vs_rosters: [{ id: 1 }], vs_active_roster: 7 };
  const r = F.vsFusionDomaine(base, mien, autre);
  assert.strictEqual(r.data.vs_active_roster, 7);
  assert.deepStrictEqual(r.conflits, []);
});

test('un élément ajouté par l\'autre depuis ma lecture arrive bien chez moi', () => {
  const base = crm([]);
  const mien = crm([]);
  const autre = crm([{ id: 9, nom: 'Nouveau' }]);
  const r = F.vsFusionDomaine(base, mien, autre);
  assert.deepStrictEqual(r.data.spes_crm_pipeline, [{ id: 9, nom: 'Nouveau' }]);
});

/* ── 8. LES SCRIPTS TIERS DOIVENT ÊTRE SCELLÉS ────────────────────────────────────
   Quatre bibliothèques (chart.js, jspdf, jspdf-autotable, pdf-lib) venaient de trois CDN
   et s'exécutaient SANS AUCUN CONTRÔLE dans une page où les coachs sont authentifiés :
   un seul CDN compromis, et du code arbitraire tournait avec accès au token de session.

   Ce test ne vérifie pas les empreintes ACTUELLES — elles ont été calculées sur les
   fichiers réellement servis et le navigateur les vérifie à chaque chargement. Il
   empêche la RÉGRESSION : que quelqu'un ajoute demain un cinquième script tiers sans
   protection, ou retire `crossorigin` (sans lequel le navigateur bloque un script tiers
   porteur d'une empreinte — les graphiques et l'export PDF tomberaient). */
test('tout script chargé depuis un domaine tiers porte une empreinte et crossorigin', () => {
  const fautifs = [];
  for (const m of app.matchAll(/<script\b[^>]*\bsrc\s*=\s*"(https?:\/\/[^"]+)"[^>]*>/g)) {
    const balise = m[0], url = m[1];
    const manque = [];
    if (!/\bintegrity\s*=\s*"sha(256|384|512)-/.test(balise)) manque.push('integrity');
    if (!/\bcrossorigin\s*=/.test(balise)) manque.push('crossorigin');
    if (manque.length) fautifs.push(url.split('/').pop() + ' → sans ' + manque.join(' ni '));
  }
  assert.deepStrictEqual(fautifs, [],
    'un script tiers sans empreinte s\'exécute avec les droits de la page : si le CDN est ' +
    'compromis, il lit le token de session. Calculer l\'empreinte :\n' +
    '  node -e "fetch(URL).then(r=>r.arrayBuffer()).then(b=>console.log(\'sha384-\'+' +
    'require(\'crypto\').createHash(\'sha384\').update(Buffer.from(b)).digest(\'base64\')))"');
});

test('la détection reconnaît bien un script tiers non protégé', () => {
  /* Une vérification qui ne trouve jamais rien ne prouve rien. */
  const cas = [
    ['<script src="https://cdn.exemple.com/x.js"></script>', true],
    ['<script defer src="https://cdn.exemple.com/x.js" integrity="sha384-AAA"></script>', true],
    ['<script defer src="https://cdn.exemple.com/x.js" integrity="sha384-AAA" crossorigin="anonymous"></script>', false],
    ['<script src="/draft-engine.js"></script>', false]   // même origine : rien à sceller
  ];
  cas.forEach(([balise, doitEtreFautif]) => {
    let fautif = false;
    for (const m of balise.matchAll(/<script\b[^>]*\bsrc\s*=\s*"(https?:\/\/[^"]+)"[^>]*>/g)) {
      if (!/\bintegrity\s*=\s*"sha(256|384|512)-/.test(m[0]) || !/\bcrossorigin\s*=/.test(m[0])) fautif = true;
    }
    assert.strictEqual(fautif, doitEtreFautif, 'mauvaise détection sur : ' + balise);
  });
});

/* Depuis le 26/08/2026 les quatre bibliothèques sont HÉBERGÉES PAR NOUS. Le SRI réglait
   la compromission d'un CDN, pas son indisponibilité : unpkg en panne, et l'export PDF
   mourait. La garantie est donc plus forte qu'une empreinte — il n'y a plus de tiers du
   tout dans la chaîne de chargement. Le test ci-dessus reste en place pour le jour où
   quelqu'un rebrancherait un CDN. */
test('aucun script n\'est chargé depuis un domaine externe', () => {
  const tiers = [...app.matchAll(/<script\b[^>]*\bsrc\s*=\s*"(https?:\/\/[^"]+)"[^>]*>/g)]
    .map(m => m[1]);
  assert.deepStrictEqual(tiers, [],
    'un script tiers réintroduit la panne d\'un CDN dans notre chaîne : les quatre ' +
    'bibliothèques vivent dans assets/vendor/. Si c\'est délibéré, il lui faut au moins ' +
    'integrity + crossorigin (test précédent).');
});

/* Une balise qui pointe vers un fichier absent ne lève rien au chargement du HTML : les
   graphiques et l'export PDF disparaissent simplement, sans message clair. C'est
   exactement ce qui arriverait en montant une version — le nom du fichier porte la
   version, donc il CHANGE à chaque mise à jour. */
test('chaque bibliothèque référencée existe bien sur le disque', () => {
  const refs = [...app.matchAll(/<script\b[^>]*\bsrc\s*=\s*"(\/assets\/vendor\/[^"]+)"/g)]
    .map(m => m[1]);
  assert.strictEqual(refs.length, 4, 'attendu 4 bibliothèques locales, trouvé ' + refs.length);
  const absents = refs.filter(r => !fs.existsSync(path.join(__dirname, '..', r)));
  assert.deepStrictEqual(absents, [], 'fichier(s) référencé(s) mais absent(s) du dépôt');
  /* La version dans le nom n'est pas cosmétique : vercel.json pose un cache immuable d'un
     an sur /assets/vendor/. Un nom sans version ferait servir l'ancien fichier pendant
     tout ce temps après une mise à jour. */
  refs.forEach(r => assert.match(r, /\d+\.\d+\.\d+/,
    r + ' doit porter son numéro de version : le cache immuable en dépend'));
});

/* Les quatre bibliotheques n'ont plus d'empreinte SRI : le navigateur ne verifie plus
   rien, puisqu'elles viennent de notre propre domaine. La verification passe donc de son
   cote au NOTRE. Ce test compare chaque fichier a l'empreinte relevee sur son CDN
   d'origine au moment ou il a ete recupere.

   Il attrape trois choses : une conversion de fins de ligne par git (voir .gitattributes),
   un telechargement partiel, et une modification volontaire du contenu. Sans lui, plus
   personne au monde ne verifierait ces 1,1 Mo de code executes dans une page authentifiee. */
const EMPREINTES_VENDOR = {
  'chart-4.4.0.umd.min.js':       'e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g',
  'jspdf-2.5.1.umd.min.js':       'JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
  'jspdf-autotable-3.6.0.min.js': 'nQIZ6tIcczKARkLebcfqb6P67Pcv2p+KIX3NH6oGaIBc64j2HxDKerK6Efn4aeiY',
  'pdf-lib-1.17.1.min.js':        'weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI'
};
test('les bibliotheques hebergees sont octet pour octet celles publiees en amont', () => {
  const crypto = require('node:crypto');
  const ecarts = [];
  Object.keys(EMPREINTES_VENDOR).forEach(nom => {
    const chemin = path.join(__dirname, '..', 'assets', 'vendor', nom);
    assert.ok(fs.existsSync(chemin), nom + ' absent de assets/vendor/');
    const h = crypto.createHash('sha384').update(fs.readFileSync(chemin)).digest('base64');
    if (h !== EMPREINTES_VENDOR[nom]) ecarts.push(nom + ' : attendu ' + EMPREINTES_VENDOR[nom] + ', obtenu ' + h);
  });
  assert.deepStrictEqual(ecarts, [],
    'fichier(s) modifie(s) depuis leur recuperation. Si la mise a jour est voulue, changer ' +
    'le NOM du fichier (la version y figure, le cache est immuable) et l\'empreinte ici.');
});

test('la verification d\'empreinte reconnait un fichier modifie', () => {
  /* Contre-test : une empreinte qui ne bouge jamais ne prouve rien. */
  const crypto = require('node:crypto');
  const vrai = fs.readFileSync(path.join(__dirname, '..', 'assets', 'vendor', 'chart-4.4.0.umd.min.js'));
  const trafique = Buffer.concat([vrai, Buffer.from('//x')]);
  const h = crypto.createHash('sha384').update(trafique).digest('base64');
  assert.notStrictEqual(h, EMPREINTES_VENDOR['chart-4.4.0.umd.min.js'],
    'trois octets ajoutes doivent suffire a faire changer l\'empreinte');
});

/* ── 9. vercel.json ne doit contenir QUE des clés que Vercel accepte ───────────────
   Le déploiement du 26/08/2026 a ÉCHOUÉ pour une clé `_pourquoi` que j'avais glissée
   dans une entrée `headers` en guise de commentaire — JSON n'en accepte pas, et Vercel
   refuse les propriétés inconnues. Le site est resté en ligne (Vercel garde le
   déploiement précédent), mais plus aucune mise à jour ne passait.

   Un fichier de configuration invalide bloque TOUT le produit : ça vaut trois lignes de
   vérification. Les explications vont dans CLAUDE.md et assets/vendor/LICENCES.md, pas
   dans le JSON. */
test('vercel.json n\'emploie que des clés reconnues', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const RACINE = ['version', 'cleanUrls', 'trailingSlash', 'crons', 'headers', 'redirects',
                  'rewrites', 'functions', 'buildCommand', 'outputDirectory', 'framework',
                  'installCommand', 'devCommand', 'regions', 'github', 'images'];
  const inconnues = Object.keys(conf).filter(k => RACINE.indexOf(k) < 0);
  assert.deepStrictEqual(inconnues, [], 'clé(s) inconnue(s) à la racine de vercel.json');

  (conf.headers || []).forEach((h, i) => {
    const permis = ['source', 'headers', 'has', 'missing'];
    const mauvaises = Object.keys(h).filter(k => permis.indexOf(k) < 0);
    assert.deepStrictEqual(mauvaises, [],
      'entrée headers[' + i + '] : ' + mauvaises.join(', ') + ' — Vercel refuse les ' +
      'propriétés inconnues et le déploiement échoue en entier. Pas de commentaire en JSON.');
    (h.headers || []).forEach(e => {
      assert.ok(e && typeof e.key === 'string' && typeof e.value === 'string',
        'chaque en-tête doit être { key, value } en chaînes');
    });
  });
  (conf.crons || []).forEach(c => {
    assert.ok(c.path && c.schedule, 'un cron doit porter path et schedule');
  });
});

test('le cache immuable couvre bien les bibliothèques hébergées', () => {
  /* Sans lui, on aurait échangé un risque de CDN contre 1,1 Mo rechargés à chaque visite. */
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const regle = (conf.headers || []).find(h => /assets\/vendor/.test(h.source || ''));
  assert.ok(regle, 'aucune règle de cache sur /assets/vendor/');
  const cc = (regle.headers || []).find(e => e.key.toLowerCase() === 'cache-control');
  assert.ok(cc && /immutable/.test(cc.value) && /max-age=\d{7,}/.test(cc.value),
    'le cache doit être immuable et long : la version est dans le nom du fichier');
});

/* ── 10. La limite de taille doit être la MÊME des deux côtés ──────────────────────
   Le client refuse désormais un domaine trop gros AVANT de l'envoyer, pour donner un
   message utile (quel domaine, de combien ça dépasse) au lieu du 413 nu du serveur. Deux
   constantes séparées qui doivent rester égales, c'est une divergence programmée : si
   quelqu'un relève MAX_BYTES côté serveur, le client continuerait de refuser tout seul et
   personne ne comprendrait pourquoi. */
test('la limite de taille du client est la même que celle du serveur', () => {
  const store = fs.readFileSync(path.join(__dirname, '..', 'api', 'store.js'), 'utf8');
  const serveur = store.match(/MAX_BYTES\s*=\s*([0-9*\s]+);/);
  const client = app.match(/VS_MAX_OCTETS\s*=\s*([0-9*\s]+);/);
  assert.ok(serveur, 'MAX_BYTES introuvable dans api/store.js');
  assert.ok(client, 'VS_MAX_OCTETS introuvable dans app.html');
  const ev = s => Function('return (' + s + ')')();
  assert.strictEqual(ev(client[1]), ev(serveur[1]),
    'client et serveur doivent plafonner au même nombre d\'octets');
});

/* ── 11. Aucune sortie silencieuse dans l'enregistrement ───────────────────────────
   C'est le défaut qu'on vient de corriger : seul le 409 était traité, et un 413, un 401,
   un 400 ou un 500 terminaient la fonction sans un mot. Le coach continuait de
   travailler, son travail ne quittait jamais son navigateur, et une purge du cache
   l'effaçait. Ce test garde la structure : la réponse non-ok doit mener à `echouer`, et
   le succès à `reussir`. */
test('le chemin d\'enregistrement traite les échecs au lieu de les avaler', () => {
  const debut = app.indexOf('async function put(domain, reessai)');
  assert.ok(debut > 0, 'put() introuvable dans app.html');
  const fin = app.indexOf('function save(domain)', debut);
  assert.ok(fin > debut, 'fin de put() introuvable');
  const src = app.slice(debut, fin);

  assert.ok(/echouer\(domain, r\.status/.test(src),
    'une réponse non-ok doit appeler echouer() : sans ça, un 413 ou un 401 disparaît');
  assert.ok(/reussir\(domain\)/.test(src),
    'un enregistrement réussi doit effacer l\'état d\'échec, sinon l\'alerte reste à vie');
  assert.ok(/catch \(_\) \{[\s\S]{0,400}echouer\(domain, 0/.test(src),
    'une coupure réseau doit être reprogrammée, pas simplement ignorée');
  /* Contre-test de portée : si l'extraction ratait, `src` serait vide et tout passerait. */
  assert.ok(src.length > 800, 'extraction de put() trop courte pour prouver quoi que ce soit');
});

/* ── 12. Leaguepedia se consulte TOUJOURS par le proxy ─────────────────────────────
   `api/lp.js` est un proxy avec cache Redis de 6 h, écrit précisément pour éviter le
   rate-limit de lol.fandom.com. Onze appels sur quatorze l'utilisaient ; trois partaient
   en direct depuis le navigateur — et ces trois-là (âge, recherche floue, tenures) sont
   déclenchés PAR JOUEUR, donc en rafale sur un roster ou une liste de prospects. C'est ce
   qui rendait l'avant-match « fragile » : le proxy existait et était contourné. */
test('aucun appel à Leaguepedia ne contourne le proxy /api/lp', () => {
  const lignes = app.split('\n');
  const directs = [];
  lignes.forEach((l, i) => {
    if (!/lol\.fandom\.com\/api\.php/.test(l)) return;
    /* L'URL est construite sur plusieurs lignes puis consommée juste après : on regarde
       la fenêtre qui suit pour voir par où elle part. */
    const fenetre = lignes.slice(i, i + 14).join(' ');
    /* Deux portes d'entrée légitimes, et deux seulement : `pmCargo` pour les requêtes
       Cargo, `pmWiki` pour les autres (résolution des fichiers, qui répond hors du champ
       `cargoquery`). Les deux passent par /api/lp — c'est ÇA qui compte ici. */
    if (!/pmCargo|pmWiki|\/api\/lp/.test(fenetre)) directs.push('ligne ' + (i + 1));
  });
  assert.deepStrictEqual(directs, [],
    'appel(s) direct(s) à lol.fandom.com : le navigateur se fait limiter et rien n\'est ' +
    'mis en cache. Passer par pmCargo(url), qui proxifie via /api/lp.');
});

test('la détection reconnaît un appel Leaguepedia non proxifié', () => {
  /* Contre-test : sans lui, la vérification pourrait ne plus rien couvrir. */
  const faux = ['const u = "https://lol.fandom.com/api.php?action=cargoquery";',
                'const r = await fetch(u);'].join('\n').split('\n');
  let vu = false;
  faux.forEach((l, i) => {
    if (!/lol\.fandom\.com\/api\.php/.test(l)) return;
    if (!/pmCargo|\/api\/lp/.test(faux.slice(i, i + 14).join(' '))) vu = true;
  });
  assert.ok(vu, 'la détection doit repérer un fetch direct');
});

/* Un échec de requête n'est pas une réponse. L'ancienne version enregistrait `null` dans
   le cache d'âge quoi qu'il arrive : un rate-limit de quelques secondes se figeait en
   « ce joueur n'a pas d'âge » pour toute la session, sans jamais réessayer. */
test('un échec réseau ne se mémorise pas comme une absence de donnée', () => {
  const d = app.indexOf('const ageCache');
  const i = app.indexOf('} catch(e) {', d);
  assert.ok(d > 0 && i > d, 'la fonction de recherche d\'âge est introuvable');
  const bloc = app.slice(i, i + 700);
  assert.ok(!/ageCache\[[^\]]*\]\s*=\s*null/.test(bloc),
    'le catch ne doit PAS mémoriser null : on n\'a pas pu demander, ce n\'est pas une réponse');
});

/* ── 13. Le plafond des 12 fonctions serverless ────────────────────────────────────
   Vercel Hobby plafonne à 12 Serverless Functions et chaque .js de api/ en consomme une
   (sauf les fichiers préfixés `_`). On était à 12/12 : le prochain endpoint ne cassait
   pas une fonctionnalité, il faisait ÉCHOUER LE BUILD ENTIER — c'est déjà arrivé.

   Personne ne surveillait ce compte. On le surveille maintenant, avec une marge : passer
   de 11 à 12 doit être une décision, pas une découverte au déploiement. */
test('api/ reste sous le plafond de 12 fonctions serverless', () => {
  const dir = path.join(__dirname, '..', 'api');
  const fonctions = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.ok(fonctions.length <= 12,
    'Vercel Hobby refuse au-delà de 12 et le build échoue en entier. ' +
    fonctions.length + ' trouvées : ' + fonctions.join(', ') +
    '. Fusionner deux handlers plutôt qu\'en ajouter un (voir api/snapshots.js, qui a ' +
    'absorbé roster-track avec une réécriture pour garder l\'ancienne URL vivante).');
  /* Le compte exact est affiché à chaque exécution : c'est ce qui manquait pour voir
     venir la saturation. */
  assert.ok(fonctions.length > 0, 'aucune fonction trouvée : le test ne surveille plus rien');
});

/* L'ancienne URL doit rester servie, sinon un onglet ouvert avant le déploiement pousse
   son suivi dans le vide — sans erreur visible, puisque l'appel est en best-effort. */
test('l\'ancienne URL /api/roster-track est toujours servie par une réécriture', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const r = (conf.rewrites || []).find(x => x.source === '/api/roster-track');
  assert.ok(r, 'réécriture manquante : les onglets déjà ouverts tomberaient sur un 404');
  assert.strictEqual(r.destination, '/api/snapshots');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'api', 'roster-track.js')),
    'le fichier doit avoir disparu, sinon la place n\'est pas rendue');
});

/* ── 14. Les builds joués en compétition ───────────────────────────────────────────
   L'optimiseur INVENTAIT des builds et se trompait : sur son objectif par défaut il
   donnait un build de tank à une ADC. Cette vue ne calcule rien — elle montre ce que les
   professionnels ont réellement emporté. Ce qui doit être vérifié n'est donc pas un
   modèle, c'est la FIDÉLITÉ de la lecture : ne rien perdre, ne rien inventer, et ne pas
   faire passer trois parties pour une tendance. */
function proFns() {
  const debut = app.indexOf('var VSP_SEUIL_PRIX');
  assert.ok(debut > 0, 'module des builds pro introuvable dans app.html');
  const i = app.indexOf('function vspAgreger(', debut);
  assert.ok(i > debut, 'vspAgreger introuvable');
  const ferme = /\r?\n\}\r?\n/g; ferme.lastIndex = i;
  const m = ferme.exec(app);
  assert.ok(m, 'fin de vspAgreger introuvable');
  return new Function(app.slice(debut, m.index + m[0].length) +
    '\nreturn { vspAgreger: vspAgreger, vspCle: vspCle };')();
}
const P = proFns();
const DICO = {
  parNomEn: { "infinity edge": '3031', "lord dominik's regards": '3036',
              "health potion": '2003', "blade of the ruined king": '3153' },
  fr: { '3031': "Lame d'infini", '3036': 'Salutations de Dominik', '2003': 'Potion de soin',
        '3153': 'Lame du roi déchu' },
  prix: { '3031': 3500, '3036': 3300, '2003': 50, '3153': 3200 }
};
const partie = (items, sup) => Object.assign({
  Link: 'Joueur', Team: 'T1', Items: items, KeystoneRune: 'Lethal Tempo',
  'DateTime UTC': '2026-08-20 12:00:00', OverviewPage: 'LCK/2026 Season', PlayerWin: 'Yes'
}, sup || {});

test('les consommables sont écartés du classement des objets', () => {
  /* La liste de Leaguepedia est l\'inventaire de FIN de partie : une Potion de soin y
     figure. La compter parmi « les objets les plus emportés » serait exact et inutile. */
  const a = P.vspAgreger([partie('Infinity Edge;Health Potion')], DICO);
  const noms = a.objets.map(o => o.nom);
  assert.ok(noms.indexOf("Lame d'infini") >= 0, 'l\'objet de build doit être compté');
  assert.strictEqual(noms.indexOf('Potion de soin'), -1, 'le consommable ne doit pas l\'être');
});

test('un objet porté deux fois ne compte qu\'une partie', () => {
  /* Sinon un objet empilable gonflerait son pourcentage au-delà de 100 %. */
  const a = P.vspAgreger([partie("Infinity Edge;Infinity Edge")], DICO);
  const ie = a.objets.find(o => o.id === '3031');
  assert.strictEqual(ie.n, 1);
  assert.strictEqual(ie.pct, 100);
});

test('un objet inconnu du dictionnaire est affiché, jamais supprimé', () => {
  /* Le masquer donnerait un build incomplet qui aurait l\'air complet. */
  const a = P.vspAgreger([partie('Infinity Edge;Objet Renommé Inconnu')], DICO);
  const jeu = a.jeux[0];
  assert.strictEqual(jeu.objets.length, 2, 'les deux objets doivent survivre à la lecture');
  const inconnu = jeu.objets.find(o => !o.reconnu);
  assert.ok(inconnu && inconnu.nom === 'Objet Renommé Inconnu', 'le nom brut est conservé');
  assert.ok(a.nonReconnus >= 1, 'et leur nombre est remonté pour être affiché');
});

test('la casse et les apostrophes ne font pas rater un objet', () => {
  /* Leaguepedia écrit « Blade of the Ruined King », Data Dragon « Blade of The Ruined
     King ». Une majuscule suffisait à perdre l\'objet. */
  const a = P.vspAgreger([partie('blade of the RUINED king')], DICO);
  assert.strictEqual(a.objets[0].id, '3153');
});

test('un échantillon mince est signalé au lieu d\'être présenté comme une tendance', () => {
  const mince = P.vspAgreger([partie('Infinity Edge'), partie('Infinity Edge')], DICO);
  assert.strictEqual(mince.parties, 2);
  assert.strictEqual(mince.assez, false, '2 parties ne font pas un consensus');
  const large = P.vspAgreger(Array.from({ length: 10 }, () => partie('Infinity Edge')), DICO);
  assert.strictEqual(large.assez, true, '10 parties suffisent à parler de tendance');
});

test('une partie sans inventaire relevé est ignorée, pas comptée à zéro', () => {
  /* La compter fausserait tous les pourcentages vers le bas. */
  const a = P.vspAgreger([partie('Infinity Edge'), partie(''), partie(null)], DICO);
  assert.strictEqual(a.parties, 1, 'seule la partie avec inventaire compte');
  assert.strictEqual(a.objets[0].pct, 100);
});

test('les dates et le taux de victoire sortent des données, pas d\'une estimation', () => {
  const a = P.vspAgreger([
    partie('Infinity Edge', { 'DateTime UTC': '2026-08-01 10:00:00', PlayerWin: 'Yes' }),
    partie('Infinity Edge', { 'DateTime UTC': '2026-08-26 10:00:00', PlayerWin: 'No' })
  ], DICO);
  assert.strictEqual(a.depuis, '2026-08-01');
  assert.strictEqual(a.jusqua, '2026-08-26');
  assert.strictEqual(a.victoires, 1);
});

/* ── La grille de draft ne doit plus renvoyer le coach en haut de liste ──────────────
   Troisième défaut de la même famille : aucune erreur, une interface qui « marche ».
   La grille des champions défile dans son propre conteneur (#dl-grid), et chaque action
   reconstruit tout le plateau — donc un conteneur NEUF, à scrollTop 0. Un coach descendu
   à la section ADC était renvoyé en haut à chaque pick, et devait redescendre pour le
   support. Mesuré : 652 px avant le clic, 0 après. */
test('la position de défilement de la grille de draft survit à une action', () => {
  const rendu = codeSeul.slice(codeSeul.indexOf('function dlRender(m)'));
  const avantReconstruction = rendu.slice(0, rendu.indexOf("getElementById('dl-board').innerHTML"));
  assert.ok(/_dlGridScroll\s*=\s*grilleAvant\.scrollTop/.test(avantReconstruction),
    'dlRender doit relever scrollTop de #dl-grid AVANT de reconstruire le plateau : ' +
    'après, l\'élément relevé est déjà le neuf, à 0.');
  const grille = codeSeul.slice(codeSeul.indexOf('async function dlRenderGrid()'));
  const corps = grille.slice(0, grille.indexOf('\nfunction ') > 0 ? grille.indexOf('\nfunction ') : undefined);
  assert.ok(/grid\.scrollTop\s*=\s*position/.test(corps),
    'dlRenderGrid doit rendre la position une fois la grille remplie.');
});

/* ── 15. La draft ne doit pas se re-rendre en boucle ───────────────────────────────
   Celui-ci FIGEAIT la page entière, onglet compris : plus aucun clic ne répondait et le
   navigateur affichait « Page ne répond pas ».

   dlRender charge les stats compét en arrière-plan, puis se re-rend pour les afficher.
   La relance était inconditionnelle, alors que `ssLoadCompetStats` sort SANS écrire
   `_ssCompetCache[mid]` dans deux cas ordinaires : un chargement est déjà en vol, ou le
   match n'a pas de roster côté stockage. La condition d'entrée restant vraie, le
   re-rendu relançait le chargement, qui re-rendait… un tour de boucle par aller-retour
   réseau. Mesuré avant correctif : 52 rendus en 5 secondes, en croissance.

   On EXTRAIT le bloc et on le FAIT TOURNER, plutôt que d'y chercher un motif de texte :
   ce qu'on veut prouver n'est pas qu'une ligne est présente, c'est que la boucle
   s'arrête. */
function blocStatsCompet() {
  const debut = app.indexOf('if ((m.oppRoster || []).length');
  assert.ok(debut > 0, 'bloc de chargement des stats compét introuvable dans dlRender');
  const marque = '.catch(function () {});';
  const fin = app.indexOf(marque, debut);
  assert.ok(fin > debut, 'fin du bloc introuvable');
  /* L'accolade qui referme le `if` vient APRÈS le .catch : l'omettre produit un source
     tronqué, que `new Function` refuse — l'extraction doit rester exécutable. */
  const accolade = app.indexOf('}', fin + marque.length);
  assert.ok(accolade > fin, 'accolade fermante du bloc introuvable');
  return app.slice(debut, accolade + 1);
}

/* Fait tourner le bloc et compte les rendus. `cacheRempli` dit si le chargement écrit
   bien le cache — c'est justement ce qui n'arrive PAS dans les deux cas ci-dessus.
   Le compteur est borné : sans borne, un test qui reproduit la boucle ne finirait pas. */
async function rendusProvoques(src, cacheRempli) {
  const BORNE = 60;
  let rendus = 0;
  const faux = { _ssCompetCache: {} };
  const match = { id: 'm1', oppRoster: [{ name: 'Canna' }] };
  const doc = { getElementById: () => ({}) };
  const charger = async (mid) => { if (cacheRempli) faux._ssCompetCache[mid] = {}; };
  const bloc = new Function('m', 'window', 'document', '_dlMatch', 'ssLoadCompetStats', 'dlRender', src);
  const rendre = (m) => { rendus++; if (rendus < BORNE) bloc(m, faux, doc, match, charger, rendre); };
  bloc(match, faux, doc, match, charger, rendre);
  await new Promise((r) => setTimeout(r, 80));
  return { rendus, borne: BORNE };
}

test('un chargement qui n\'aboutit pas ne relance pas la draft en boucle', async () => {
  const r = await rendusProvoques(blocStatsCompet(), false);
  assert.strictEqual(r.rendus, 0,
    'le cache n\'ayant pas été écrit, il n\'y a rien de neuf à afficher : re-rendre ' +
    'relancerait le chargement, qui re-rendrait — c\'est ce qui gelait la page.');
});

test('un chargement qui aboutit re-rend la draft UNE fois', async () => {
  const r = await rendusProvoques(blocStatsCompet(), true);
  assert.strictEqual(r.rendus, 1,
    'les stats sont arrivées : elles doivent s\'afficher, et une seule fois — sinon la ' +
    'garde aurait simplement supprimé la fonctionnalité au lieu de corriger la boucle.');
});

/* ── 16. Un poste déjà pourvu ne doit plus occuper le haut de la grille ────────────
   Une fois Rell posée, le coach n'a plus rien à chercher dans les 23 supports — ils
   restaient pourtant en plein milieu de la liste, entre le Mid et l'ADC.

   Le piège est le CAMP : la grille sert à piker pour celui dont c'est le tour, qui
   n'est pas toujours nous (mode solo, on joue les deux). Interroger notre camp au lieu
   du sien reléguerait nos postes pendant qu'on simule l'adversaire — sans la moindre
   erreur à l'écran, juste une grille rangée à l'envers. */
function postesFns(picks, champs, moiRole) {
  const debut = app.indexOf('function dlPostesPourvus(');
  assert.ok(debut > 0, 'dlPostesPourvus introuvable dans app.html');
  const fin = app.indexOf('function dlLigneConseil(', debut);
  assert.ok(fin > debut, 'fin du bloc des postes introuvable');
  return new Function('dlPicksDe', 'dlRoleNous', 'window', 'dlRoleChamp', 'SS_ROLES',
    app.slice(debut, fin) + '\nreturn { dlPostesPourvus: dlPostesPourvus, dlPostesLibres: dlPostesLibres };')(
    (r) => picks[r] || [], () => moiRole, { _ssChamps: champs },
    (c) => (c ? c.role : null), ['Top', 'Jgl', 'Mid', 'ADC', 'Sup']);
}
const CHAMPS = [{ key: 'Rell', role: 'Sup' }, { key: 'Jinx', role: 'ADC' }, { key: 'Azir', role: 'Mid' }];
const PICKS = { first: ['Rell', 'Jinx'], second: ['Azir'] };

test('les postes pourvus sont ceux du camp interrogé, pas toujours les nôtres', () => {
  const F = postesFns(PICKS, CHAMPS, 'first');
  assert.deepStrictEqual(F.dlPostesPourvus('first'), { Sup: 'Rell', ADC: 'Jinx' });
  assert.deepStrictEqual(F.dlPostesPourvus('second'), { Mid: 'Azir' },
    'interroger le camp adverse doit rendre SES postes, pas les nôtres');
  assert.deepStrictEqual(F.dlPostesLibres('first'), ['Top', 'Jgl', 'Mid']);
  assert.deepStrictEqual(F.dlPostesLibres('second'), ['Top', 'Jgl', 'ADC', 'Sup']);
});

test('le poste retenu garde le champion qui l\'occupe, pour pouvoir le nommer', () => {
  const F = postesFns(PICKS, CHAMPS, 'first');
  assert.strictEqual(F.dlPostesPourvus('first').Sup, 'Rell',
    '« déjà pourvu · Rell » vaut mieux que de laisser le coach deviner lequel');
});

test('sans argument, ce sont NOS postes qui sont lus (ce dont dépend le conseil)', () => {
  const F = postesFns(PICKS, CHAMPS, 'second');
  assert.deepStrictEqual(F.dlPostesLibres(), ['Top', 'Jgl', 'ADC', 'Sup'],
    'le conseil raisonne sur notre camp : dlRoleNous doit rester le défaut');
});

test('la grille relègue d\'après le camp qui PIKE, et seulement sur un pick', () => {
  const rendu = codeSeul.slice(codeSeul.indexOf('async function dlRenderGrid()'));
  const corps = rendu.slice(0, rendu.indexOf('\nfunction dlConfigure'));
  assert.match(corps, /dlPostesPourvus\(step\.by\)/,
    'la grille doit interroger le camp dont c\'est le tour, pas le nôtre');
  assert.match(corps, /step\.type === 'pick'[\s\S]{0,80}dlPostesPourvus/,
    'sur un BAN rien ne doit être relégué : on bannit dans tous les postes, y compris ' +
    'ceux qu\'on a déjà pourvus');
  /* RELÉGUÉES, pas retirées : le rôle affiché n'est qu'un rôle dominant, et un flex
     pick (Karma jouée mid, Pantheon support) doit rester cliquable. L'ordre se
     construit donc en CONCATÉNANT les pourvus après les libres — si quelqu'un
     remplaçait ça par un simple filtre, les champions disparaîtraient. */
  assert.match(corps, /ordreRoles\s*=\s*SS_ROLES\.filter[\s\S]{0,140}\.concat\(SS_ROLES\.filter/,
    'les postes pourvus doivent être replacés en fin de liste, jamais écartés');
});

/* ── 17. Le conseil de pick ne propose rien qu'il ne puisse chiffrer ───────────────
   Le panneau restait vide en fin de draft : il exigeait 3 picks relevés minimum, alors
   que la donnée existait à 1 ou 2. On affiche donc le COMPTE réel au lieu d'un seuil.

   Le risque, en desserrant, est de le remplir de bruit. Un garde-fou le tient : « ce
   qui manque à votre composition » (le type de dégâts, lu dans les fichiers du jeu)
   REHAUSSE un champion déjà mesuré, mais n'en propose jamais un seul — sinon le conseil
   remonterait n'importe quel champion magique que personne ne joue, au seul prétexte
   qu'il est magique. C'est exactement ce que ce test empêche de revenir. */
function jouerConseil({ libres, champs, priority, manque, partAD, notrePool, contres }) {
  /* On extrait aussi dlNotreJoueur / dlDansSonPool / dlJoueEnPro : ce sont elles qui
     portent la règle « quelqu'un le joue-t-il ? », donc les stuber reviendrait à tester
     le stub. Seul le CHARGEMENT (réseau) est neutralisé. */
  const debut = app.indexOf('function dlNotreJoueur(');
  assert.ok(debut > 0, 'dlNotreJoueur introuvable dans app.html');
  const fin = app.indexOf('function dlConseilHtml()', debut);
  assert.ok(fin > debut, 'fin de dlConseilPicks introuvable');
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const html = new Function(
    'window', '_dlState', 'VSDraft', 'dlPostesLibres', 'dlMetaContext', 'dlRoleChamp', 'dlNorm',
    'dlContre', 'dlMetaBestPartners', 'dlChampParNorm', 'dlManqueCompo', 'dlPartAD',
    'dlLigneConseil', 'SS_ROLE_LABEL', 'DL_CONTRE_MIN', 'DL_WR_MIN_GAMES', 'anEsc', 'dlChargerNotrePool',
    app.slice(debut, fin) + '\nreturn dlConseilPicks();')(
    { _ssChamps: champs, _dlMeta: { priority: priority, counter: {}, pairStats: {} },
      _dlNotrePool: notrePool || null },
    { gameIndex: 0 }, { unavailable: () => ({}) },
    () => libres, () => ({ mine: {}, theirs: {} }),
    (c) => c && c.role, norm,
    (meta, role, a) => (contres || {})[a] || null, () => [], () => null,
    () => manque, (k) => (k in partAD ? partAD[k] : null),
    (c, motifs) => '<li>' + c.nom + ' :: ' + motifs.join(' | ') + '</li>',
    { Top: 'Top', Jgl: 'Jungle', Mid: 'Mid', ADC: 'ADC', Sup: 'Support' }, 3, 3,
    (s) => String(s), () => {});
  return [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
}

const JGL = [{ key: 'LeeSin', name: 'Lee Sin', role: 'Jgl' }, { key: 'Amumu', name: 'Amumu', role: 'Jgl' },
             { key: 'Ivern', name: 'Ivern', role: 'Jgl' }];
const AD = { LeeSin: 1, Amumu: 0, Ivern: 0 };   // Amumu et Ivern : dégâts magiques

test('un champion que personne ne joue n\'est pas proposé, même s\'il comble le manque', () => {
  /* Ivern est magique et la compo réclame du magique — mais il n'a aucun pick relevé.
     Le proposer reviendrait à inventer un conseil à partir d'un seul type de dégâts. */
  const l = jouerConseil({
    libres: ['Jgl'], champs: JGL, priority: { Jgl: { leesin: { 1: 9 }, amumu: { 1: 3 } } },
    manque: { veut: 'magique', pc: 92 }, partAD: AD
  });
  assert.ok(!l.some((x) => /Ivern/.test(x)),
    'Ivern n\'est joué nulle part : il ne doit pas apparaître');
  assert.strictEqual(l.length, 2, 'seuls les deux champions réellement pikés sont proposés');
});

test('combler le manque de la compo fait remonter un champion DÉJÀ mesuré', () => {
  const l = jouerConseil({
    libres: ['Jgl'], champs: JGL, priority: { Jgl: { leesin: { 1: 9 }, amumu: { 1: 3 } } },
    manque: { veut: 'magique', pc: 92 }, partAD: AD
  });
  assert.match(l[0], /Amumu/,
    'piké 3× seulement, mais seul à combler 92 % de dégâts d\'un même type : il passe devant');
  assert.match(l[0], /piké 3×/, 'et son compte réel reste affiché');
  assert.match(l[0], /92 %/, 'ainsi que la raison, chiffrée');
  assert.match(l[1], /Lee Sin/);
});

test('sans manque de composition, c\'est le compte de picks qui classe', () => {
  const l = jouerConseil({
    libres: ['Jgl'], champs: JGL, priority: { Jgl: { leesin: { 1: 9 }, amumu: { 1: 3 } } },
    manque: null, partAD: AD
  });
  assert.match(l[0], /Lee Sin/, '9 picks passent devant 3 quand rien ne manque à la compo');
  assert.match(l[1], /Amumu/);
});

/* ── Retrouver NOS joueurs sans rien faire ressaisir au staff ──────────────────────
   Le pool de nos joueurs ne servait à rien tant qu'il dépendait d'un nom compétitif
   saisi poste par poste : un staff qui a inscrit son roster à la main n'en avait aucun,
   et le conseil ne parlait alors que du circuit.

   L'équipe est pourtant déjà connue (`myTeam`, choisie dans Seasons, et c'est une équipe
   du wiki). Elle suffit à retrouver les titulaires. */
function rosterCompetFns({ slots, myTeam, wiki }) {
  const debut = app.indexOf('async function dlNotreRosterCompet(');
  assert.ok(debut > 0, 'dlNotreRosterCompet introuvable dans app.html');
  const fin = app.indexOf('function dlChargerNotrePool(', debut);
  assert.ok(fin > debut, 'fin de dlNotreRosterCompet introuvable');
  const appels = { wiki: 0 };
  const f = new Function('rsActive', 'SS_ROLES', 'ssData', 'ssTeamRoster', 'ssDedupeRoster',
    app.slice(debut, fin) + '\nreturn dlNotreRosterCompet;')(
    () => (slots ? { slots } : null),
    ['Top', 'Jgl', 'Mid', 'ADC', 'Sup'],
    () => ({ myTeam: myTeam || {} }),
    async (nom) => { appels.wiki++; appels.nom = nom; return wiki; },
    (l) => l);
  return { f, appels };
}

test('le roster inscrit est utilisé tel quel quand il porte des noms compétitifs', async () => {
  const { f, appels } = rosterCompetFns({
    slots: { Mid: { pseudo: 'Veth', proName: 'Vetheo' }, Top: { pseudo: 'Cal' } },
    myTeam: { name: 'Karmine Corp' }, wiki: []
  });
  const r = await f();
  assert.deepStrictEqual(r, [{ role: 'Mid', nom: 'Vetheo', pseudo: 'Veth' }],
    'seul le poste portant un nom compétitif est interrogeable');
  assert.strictEqual(appels.wiki, 0, 'inutile d\'aller au wiki quand le roster suffit');
});

test('sans nom compétitif, l\'équipe définie suffit à retrouver les titulaires', async () => {
  /* Le cas du staff qui a saisi son roster à la main : « si je suis Skill Camp, prendre
     les joueurs Skill Camp ». */
  const { f, appels } = rosterCompetFns({
    slots: { Mid: { pseudo: 'Veth' } },
    myTeam: { name: 'Skill Camp' },
    wiki: [{ name: 'Joueur1', link: 'Joueur1 (X)', role: 'Mid' },
           { name: 'Joueur2', link: 'Joueur2', role: 'Jgl' },
           { name: 'Coach', link: 'Coach', role: 'Coach' }]
  });
  const r = await f();
  assert.strictEqual(appels.nom, 'Skill Camp', 'c\'est NOTRE équipe qui est interrogée');
  assert.deepStrictEqual(r, [
    { role: 'Mid', nom: 'Joueur1 (X)', pseudo: 'Joueur1' },
    { role: 'Jgl', nom: 'Joueur2', pseudo: 'Joueur2' }
  ], 'le lien wiki sert à interroger (il désambiguïse), le pseudo à afficher ; ' +
     'les non-joueurs sont écartés');
});

test('sans équipe ni nom compétitif, on ne devine pas', async () => {
  const { f, appels } = rosterCompetFns({ slots: { Mid: { pseudo: 'Veth' } }, myTeam: {}, wiki: [] });
  assert.deepStrictEqual(await f(), []);
  assert.strictEqual(appels.wiki, 0, 'sans nom d\'équipe, il n\'y a rien à demander');
});

/* ⚠ LA RÈGLE POSÉE PAR LE STAFF, mot pour mot : « ne pas proposer Katarina si personne
   ne la joue en pro, même si c'est un counter pick ». Un contre mesuré dit qu'un matchup
   est favorable — il ne dit pas que le champion est dans les mains de celui qui va le
   prendre. Sans cette barrière, le conseil envoie un joueur sur un champion qu'il n'a
   jamais posé en match officiel, sur la foi d'un pourcentage. */
test('un contre mesuré ne suffit PAS : si personne ne le joue, il n\'est pas proposé', () => {
  const champs = [{ key: 'Katarina', name: 'Katarina', role: 'Mid' },
                  { key: 'Azir', name: 'Azir', role: 'Mid' }];
  const l = jouerConseil({
    libres: ['Mid'], champs,
    priority: { Mid: { azir: { 1: 4 } } },        // Katarina : jamais pikée en compétition
    contres: { katarina: { wr: 62, games: 11 } }, // et pourtant, contre mesuré et solide
    manque: null, partAD: {}, notrePool: null
  });
  assert.ok(!l.some((x) => /Katarina/.test(x)),
    'Katarina contre leur mid à 62 %, mais personne ne la joue : elle ne doit pas sortir');
  assert.strictEqual(l.length, 1);
  assert.match(l[0], /Azir/);
});

test('le même contre devient une proposition dès que NOTRE joueur joue le champion', () => {
  /* Même situation, à une différence près : notre midlaner l'a posée 5 fois en match
     officiel. Le contre cesse d'être une idée de tableau blanc. */
  const champs = [{ key: 'Katarina', name: 'Katarina', role: 'Mid' },
                  { key: 'Azir', name: 'Azir', role: 'Mid' }];
  const l = jouerConseil({
    libres: ['Mid'], champs,
    priority: { Mid: { azir: { 1: 4 } } },
    contres: { katarina: { wr: 62, games: 11 } },
    manque: null, partAD: {},
    notrePool: { Mid: { pseudo: 'Vetheo', pool: [{ name: 'Katarina', games: 5, wr: 60 }] } }
  });
  assert.match(l[0], /Katarina/, 'le contre mesuré passe devant, maintenant qu\'il est jouable');
  assert.match(l[0], /Vetheo/, 'et le conseil dit QUI le joue');
  assert.match(l[0], /joué 5×/, 'avec son compte réel');
});

test('un champion du pool de notre joueur est proposé même absent du circuit', () => {
  /* L'autre moitié de la règle : « joué par le joueur OU le circuit ». Un champion de
     niche que notre joueur maîtrise reste une option légitime. */
  const champs = [{ key: 'Ivern', name: 'Ivern', role: 'Jgl' }];
  const l = jouerConseil({
    libres: ['Jgl'], champs, priority: { Jgl: {} },
    manque: null, partAD: {},
    notrePool: { Jgl: { pseudo: 'Yike', pool: [{ name: 'Ivern', games: 4, wr: 75 }] } }
  });
  assert.strictEqual(l.length, 1, 'son pool suffit à le légitimer');
  assert.match(l[0], /Yike/);
});

test('un champion joué en pro hors de CETTE game garde un chiffre', () => {
  /* Il est très piké en game 3 et jamais en game 1 : l\'ancien affichage ne lui trouvait
     aucun motif et il tombait dans un classement muet. On donne alors le total. */
  const l = jouerConseil({
    libres: ['Mid'], champs: [{ key: 'Azir', name: 'Azir', role: 'Mid' }],
    priority: { Mid: { azir: { 1: 0, 2: 0, 3: 7 } } },
    manque: null, partAD: {}, notrePool: null
  });
  assert.strictEqual(l.length, 1, 'joué 7× au haut niveau : il reste une option');
  assert.match(l[0], /piké 7× au haut niveau/);
});

test('un champion piké 1× ou 2× est proposé, avec son compte exact', () => {
  /* C'est le desserrage : sous l'ancien seuil de 3, ces deux-là disparaissaient et le
     panneau affichait « rien de mesuré » alors que la donnée existait. */
  const l = jouerConseil({
    libres: ['Jgl'], champs: JGL, priority: { Jgl: { leesin: { 1: 2 }, amumu: { 1: 1 } } },
    manque: null, partAD: AD
  });
  assert.strictEqual(l.length, 2, 'les deux doivent être proposés');
  assert.match(l[0], /piké 2×/);
  assert.match(l[1], /piké 1×/);
});

test('sans la garde, le bloc boucle bel et bien', async () => {
  /* Contre-test : une vérification qui passerait aussi sur le code fautif ne prouve rien.
     On retire la garde du source extrait et on montre que la boucle repart. */
  const src = blocStatsCompet();
  const sansGarde = src.replace(/if \(!\(window\._ssCompetCache \|\| \{\}\)\[m\.id\]\) return;/, '');
  assert.notStrictEqual(sansGarde, src, 'la garde doit être trouvable pour que ce test ait un sens');
  const r = await rendusProvoques(sansGarde, false);
  assert.strictEqual(r.rendus, r.borne,
    'sans la garde, les rendus ne s\'arrêtent que sur la borne du test — en production, ' +
    'rien ne les arrête.');
});

/* ── 18. Planning de la semaine ─────────────────────────────────────────────────────
   Ce que le staff attend le lundi matin. Trois pièges, tous silencieux :
   la semaine mal bornée (un match du dimanche soir tombe dehors), un message VIDE quand
   la semaine est creuse (le staff croit l'outil cassé), et des matchs sortis dans le
   désordre parce que le calendrier n'est trié nulle part en amont. */
function planningFns(matches, myTeam) {
  const debut = app.indexOf('function ssLundiDe(');
  assert.ok(debut > 0, 'ssLundiDe introuvable dans app.html');
  const fin = app.indexOf('function ssPlanningOuvrir(', debut);
  assert.ok(fin > debut, 'fin du bloc planning introuvable');
  const p2 = n => String(n).padStart(2, '0');
  return new Function('ssData', 'ssHM',
    app.slice(debut, fin) + '\nreturn { texte: ssPlanningSemaineTexte, lundi: ssLundiDe };')(
    () => ({ myTeam: myTeam || { name: 'Skill Camp' }, matches: matches || [] }),
    d => p2(d.getHours()) + ':' + p2(d.getMinutes()));
}
// Un mercredi, pour que « le lundi de la semaine » ait quelque chose à calculer.
const MERCREDI = new Date(2026, 8, 30, 12, 0, 0);
const jour = (n, h) => {
  const d = new Date(2026, 8, 28, h, 0, 0); // lundi 28/09/2026
  d.setDate(28 + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0') + 'T' + String(h).padStart(2, '0') + ':00';
};

test('la semaine va du lundi au dimanche, quel que soit le jour où on la demande', () => {
  const { lundi } = planningFns([]);
  for (let n = 0; n < 7; n++) {
    const l = lundi(new Date(2026, 8, 28 + n, 15, 0, 0));
    assert.strictEqual(l.getDate(), 28, 'jour +' + n + ' doit retomber sur le lundi 28');
    assert.strictEqual(l.getHours(), 0, 'la borne doit partir de minuit');
  }
  // Le lundi suivant ouvre bien une nouvelle semaine.
  assert.strictEqual(lundi(new Date(2026, 9, 5, 9, 0, 0)).getDate(), 5);
});

test('le dimanche soir est DANS la semaine, le lundi suivant n\'y est pas', () => {
  const { texte } = planningFns([
    { id: 'a', date: jour(6, 23), bo: 1, competition: 'LFL', opp: { name: 'DimancheSoir' } },
    { id: 'b', date: jour(7, 9), bo: 1, competition: 'LFL', opp: { name: 'LundiSuivant' } }
  ]);
  const t = texte(MERCREDI);
  assert.match(t, /DimancheSoir/);
  assert.doesNotMatch(t, /LundiSuivant/, 'le lundi suivant appartient à la semaine d\'après');
});

test('les matchs sortent dans l\'ordre du temps, groupés par jour', () => {
  // Fournis en désordre : rien ne trie le calendrier en amont.
  const { texte } = planningFns([
    { id: 'c', date: jour(5, 15), bo: 1, competition: 'LFL', opp: { name: 'Vitality' } },
    { id: 'b', date: jour(2, 21), bo: 1, competition: 'Coupe', opp: { name: 'BDS' } },
    { id: 'a', date: jour(2, 18), bo: 3, competition: 'LFL', opp: { name: 'Karmine Corp' } }
  ]);
  const t = texte(MERCREDI);
  assert.ok(t.indexOf('Karmine Corp') < t.indexOf('BDS'), 'même jour : 18h avant 21h');
  assert.ok(t.indexOf('BDS') < t.indexOf('Vitality'), 'mercredi avant samedi');
  // Un jour qui porte deux matchs n'est titré qu'une fois.
  assert.strictEqual((t.match(/Mercredi 30 septembre/g) || []).length, 1);
  assert.match(t, /18:00\s+vs Karmine Corp\s+·\s+LFL · BO3/);
});

test('une semaine creuse annonce le prochain match plutôt qu\'un message vide', () => {
  const { texte } = planningFns([{ id: 'x', date: jour(20, 18), bo: 3, competition: 'LFL', opp: { name: 'GentleMates' } }]);
  const t = texte(MERCREDI);
  assert.match(t, /Aucun match cette semaine/);
  assert.match(t, /Prochain match :.*GentleMates/);
});

test('un calendrier vide ne promet aucun « prochain match »', () => {
  const t = planningFns([]).texte(MERCREDI);
  assert.match(t, /Aucun match cette semaine/);
  assert.doesNotMatch(t, /Prochain match/, 'annoncer un match inexistant serait pire que rien');
});

test('une date illisible est ignorée, elle ne casse pas le planning', () => {
  const { texte } = planningFns([
    { id: 'k', date: 'pas-une-date', opp: { name: 'Fantome' } },
    { id: 'a', date: jour(2, 18), bo: 3, competition: 'LFL', opp: { name: 'Karmine Corp' } }
  ]);
  const t = texte(MERCREDI);
  assert.match(t, /Karmine Corp/);
  assert.doesNotMatch(t, /Fantome|Invalid/);
});

test('le planning porte le nom de notre équipe et reste lisible sans adversaire nommé', () => {
  const { texte } = planningFns([{ id: 'a', date: jour(2, 18), bo: 1, opp: {} }], { name: 'Karmine Corp' });
  const t = texte(MERCREDI);
  assert.match(t, /PLANNING DE LA SEMAINE — Karmine Corp/);
  assert.match(t, /vs Adversaire/, 'un adversaire non renseigné doit rester une ligne lisible');
});

/* ── 19. Démarrage guidé (Seasons) ───────────────────────────────────────────────
   Deux invariants, et le second est une consigne explicite d'Enzo :
   le bandeau doit disparaître une fois les trois étapes faites, mais « + Saison » et
   « + Split » ne doivent JAMAIS vivre dedans — ils s'utilisent en cours de saison,
   longtemps après. Un bandeau qui emporterait ces boutons en s'effaçant les rendrait
   inatteignables, et personne ne le verrait avant le premier split de mi-saison. */
function demarrageFn() {
  const debut = app.indexOf('function ssDemarrage(');
  assert.ok(debut > 0, 'ssDemarrage introuvable dans app.html');
  const fin = app.indexOf('function ssRenderCalendar(', debut);
  assert.ok(fin > debut, 'fin de ssDemarrage introuvable');
  return new Function(app.slice(debut, fin) + '\nreturn ssDemarrage;')();
}
const etatSeasons = (equipe, saisons, matchs) => ({
  myTeam: equipe ? { name: 'Skill Camp' } : {},
  seasons: saisons ? [{ id: 'sa1', name: 'S26' }] : [],
  matches: matchs ? [{ id: 'm1' }] : []
});

test('le démarrage guidé disparaît une fois les trois étapes faites', () => {
  const f = demarrageFn();
  assert.strictEqual(f(etatSeasons(true, true, true)), '', 'rien ne doit rester à l\'écran');
  assert.ok(f(etatSeasons(false, false, false)).length > 0);
  assert.ok(f(etatSeasons(true, true, false)).length > 0, 'une seule étape manquante suffit à l\'afficher');
});

test('un seul bouton est proposé, celui de l\'étape courante', () => {
  const f = demarrageFn();
  const boutons = h => (h.match(/<button/g) || []).length;
  assert.strictEqual(boutons(f(etatSeasons(false, false, false))), 1);
  assert.strictEqual(boutons(f(etatSeasons(true, false, false))), 1);
  assert.strictEqual(boutons(f(etatSeasons(true, true, false))), 1);
  // Proposer « + Match » avant qu'une saison existe mène à une impasse.
  assert.doesNotMatch(f(etatSeasons(false, false, false)), /ssOpenAddMatch/);
  assert.doesNotMatch(f(etatSeasons(true, false, false)), /ssOpenAddMatch/);
  assert.match(f(etatSeasons(true, true, false)), /ssOpenAddMatch/);
});

test('les étapes franchies sont marquées faites, dans l\'ordre', () => {
  const f = demarrageFn();
  const h = f(etatSeasons(true, false, false));
  assert.match(h, /ss-dem-e fait[\s\S]*Définis ton équipe/, 'l\'équipe définie doit être cochée');
  assert.match(h, /ss-dem-e courante[\s\S]*Crée ta saison/);
});

test('« + Saison » et « + Split » restent dans la barre d\'outils, jamais dans le bandeau', () => {
  const f = demarrageFn();
  /* Le bandeau peut proposer « + Saison » comme étape — c'est son rôle — mais il
     disparaît. La barre d'outils, elle, doit porter les deux en permanence. */
  assert.strictEqual(f(etatSeasons(true, true, true)), '');
  const debut = app.indexOf('var toolbar = ');
  assert.ok(debut > 0, 'barre d\'outils introuvable');
  const barre = app.slice(debut, app.indexOf('var matches =', debut));
  assert.match(barre, /ssNewSeason\(\)/, '« + Saison » doit vivre dans la barre d\'outils');
  assert.match(barre, /ssAddSplit\(\)/, '« + Split » doit vivre dans la barre d\'outils');
});

/* ── 20. Logos d'équipes : ne pas revenir à une adresse morte ──────────────────────
   Les logos passaient par `Special:FilePath`, que Fandom a fermé (403, vérifié le
   29/09/2026). Le défaut était MUET : `onerror` posait l'initiale de l'équipe à la
   place, l'interface restait lisible et rien ne disait qu'une source externe avait
   cessé de répondre. C'est le type de panne qu'aucun test d'exécution n'attrape — mais
   qu'un test statique empêche de réintroduire pour presque rien. */
test('aucun logo ne repasse par Special:FilePath, fermé par Fandom', () => {
  assert.doesNotMatch(codeSeul, /Special:FilePath/,
    'Fandom répond 403 sur cette route. Passer par l\'API du wiki (action=query, ' +
    'prop=imageinfo), qui rend l\'adresse CDN et suit les redirections de fichiers.');
});

test('la résolution des logos est groupée et mise en cache', () => {
  const debut = app.indexOf('function ssLogoResoudre(');
  assert.ok(debut > 0, 'ssLogoResoudre introuvable');
  const bloc = app.slice(debut, app.indexOf('function ssLogosPoser(', debut));
  // Un appel par équipe ferait une dizaine de requêtes par rendu de calendrier.
  assert.match(bloc, /titles=/, 'les noms doivent partir groupés dans un seul `titles=`');
  assert.match(bloc, /pmWiki\(/, 'passer par le proxy /api/lp, jamais en direct chez Fandom');
  assert.match(bloc, /slice\(0,\s*50\)/, 'l\'API plafonne à 50 titres par appel');
  // Sans mémorisation des introuvables, on redemanderait le même nom à chaque rendu.
  assert.match(bloc, /if \(!\(n in cache\)\) cache\[n\] = false;/,
    'un nom introuvable doit être mémorisé comme tel');
  // Garde d'ÉTAT : c'est elle qui empêche la boucle rendu → chargement → rendu.
  assert.match(bloc, /_ssLogosEnVol/, 'une garde d\'état est nécessaire');
});

test('les logos résolus sont posés dans le DOM, jamais par un re-rendu', () => {
  const debut = app.indexOf('function ssLogosPoser(');
  assert.ok(debut > 0, 'ssLogosPoser introuvable');
  const bloc = app.slice(debut, debut + 900);
  assert.doesNotMatch(bloc, /renderSeasons\(|ssRenderCalendar\(/,
    'poser un logo ne doit JAMAIS déclencher un rendu : le rendu relance le chargement, ' +
    'qui re-rendrait — c\'est la boucle qui avait figé la salle de draft.');
  assert.match(bloc, /insertBefore|appendChild/, 'l\'image s\'insère directement');
});

test('une panne réseau ne grave pas les logos comme introuvables', () => {
  /* pmWiki rend `null` quand le proxy n'a pas répondu — SANS lever d'exception. Confondre
     ce cas avec « le wiki dit que ce fichier n'existe pas » marquait tous les logos
     introuvables ; et comme le cache est écrit en localStorage, ils le restaient bien
     après le retour du réseau. Une coupure d'une minute coûtait les logos à vie. */
  const debut = app.indexOf('function ssLogoResoudre(');
  const bloc = app.slice(debut, app.indexOf('function ssLogosCharger(', debut));
  const sortie = bloc.indexOf('if (!j) return cache;');
  const marquage = bloc.indexOf('cache[n] = false');
  assert.ok(sortie > 0, 'une réponse absente doit sortir sans rien mémoriser');
  assert.ok(marquage > sortie,
    'le marquage « introuvable » doit venir APRÈS la sortie sur réponse absente, ' +
    'sinon une panne réseau est mémorisée comme une absence de fichier');
});

// ── 21. Draft en cours et avant-match : les règles de disposition validées ──
// Ces trois assertions verrouillent ce qui a été mesuré le 29/09/2026, pas un goût :
// une bande là où il y avait des cartes, et des classes mortes qui ne reviennent pas.

test('le plateau de draft affiche UNE bande, pas une ligne de badges', () => {
  const debut = app.indexOf('function dlBoardHtml(');
  assert.ok(debut > 0, 'dlBoardHtml introuvable');
  const bloc = app.slice(debut, app.indexOf('function dlSideHtml(', debut));
  assert.match(bloc, /class="dl-bar"/, 'le bandeau de draft est une bande .dl-bar');
  assert.doesNotMatch(bloc, /class="dl-top"|class="dl-turn|class="dl-acts"/,
    'les anciens badges empilés ne doivent pas revenir');
  // Le chrono reste identifiable : dlStartTimer écrit dedans toutes les secondes.
  assert.match(bloc, /id="dl-clock"/, 'le chrono garde son identifiant');
});

test('les deux camps forment une seule bande, sans carte par camp', () => {
  const regle = app.match(/\n\.dl-side\{[^}]*\}/);
  assert.ok(regle, 'la règle .dl-side est introuvable');
  assert.doesNotMatch(regle[0], /border-radius/,
    'un rayon sur .dl-side reconstituerait deux cartes dans la bande');
  assert.match(regle[0], /border-left:1px solid/,
    'les deux moitiés se séparent par un filet, pas par un écart');
});

test('aucune classe .dl-opt ne subsiste — ni en CSS, ni à l\'écran', () => {
  /* Le lobby les a remplacées par la bande .dl-setup. Une règle orpheline finit par
     être recopiée ailleurs et ramène les quatre cartes qu'on vient d'enlever. */
  assert.doesNotMatch(app, /\.dl-opt[-.\s{:]/,
    'du CSS mort .dl-opt* subsiste');
});

test('les cinq postes de l\'avant-match sont dans une bande, champs discrets', () => {
  const debut = app.indexOf('function ssPlanHtml(');
  const bloc = app.slice(debut, app.indexOf('// ── Stats compétitives', debut));
  assert.match(bloc, /class="ss-pl-band"/, 'les postes sont enveloppés dans une bande');
  assert.match(bloc, /class="ss-pl-duo"/,
    'Matchup et Consignes se lisent côte à côte pour un même poste');
  assert.match(app, /\.ss-pl-band \.ss-pl-mu[^\n]*border-color:transparent/,
    'les champs restent transparents tant qu\'on ne les touche pas');
});

// ── 22. Analytics : ce qui a été mesuré le 29/09/2026 sur la refonte ──
// Trois de ces assertions portent sur des DÉFAUTS constatés à l'écran, pas sur
// un goût : une description fausse, un formulaire à la place d'un tableau de
// bord, une mosaïque là où les chiffres doivent se comparer ligne à ligne.

test('aucune description d\'onglet ne décrit le studio vidéo', () => {
  /* AN_DESC.scrim racontait « code les actions en direct, dessine sur l'image,
     monte des playlists » sur un onglet qui affiche un tableau de stats depuis
     que le chantier vidéo est en pause. Une phrase fausse coûte plus cher
     qu'une phrase absente. */
  const debut = app.indexOf('const AN_DESC = {');
  assert.ok(debut > 0, 'AN_DESC introuvable');
  const bloc = app.slice(debut, app.indexOf('};', debut));
  assert.doesNotMatch(bloc, /playlists|dessine sur l'image|matrice/,
    'une description d\'onglet décrit encore le studio vidéo');
});

test('les descriptions d\'onglet Analytics tiennent sous 110 caractères', () => {
  const debut = app.indexOf('const AN_DESC = {');
  const bloc = app.slice(debut, app.indexOf('};', debut));
  const trop = [...bloc.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map(m => m[1])
    .filter(s => s.length > 110);
  assert.deepStrictEqual(trop, [],
    'une description dépasse 110 caractères (convention du 29/09)');
});

test('le titre d\'Analytics suit l\'onglet, et n\'annonce plus les .rofl', () => {
  assert.match(app, /const AN_TITRE = \{/, 'AN_TITRE doit exister');
  assert.match(app, /getElementById\('an-titre'\)/,
    'anSyncTabs doit réécrire le titre à chaque changement d\'onglet');
  const debut = app.indexOf('<div id="panel-analytics"');
  const tete = app.slice(debut, debut + 1600);
  assert.doesNotMatch(tete, /Replays \.rofl/,
    'la pastille annonçait une vue qui n\'est plus routée');
  assert.doesNotMatch(tete, /class="eyebrow">Analytics/,
    'le surtitre répétait la navigation ET la barre d\'onglets');
});

test('« Stats équipe » s\'ouvre sur une lecture, pas sur un formulaire', () => {
  const debut = app.indexOf('async function renderStatsBoard()');
  assert.ok(debut > 0, 'renderStatsBoard introuvable');
  const bloc = app.slice(debut, app.indexOf('function stbBaseMesures(', debut));
  assert.match(bloc, /stbKpisHtml\(/, 'une bande de chiffres ouvre la vue');
  assert.match(bloc, /stbHeroHtml\(/, 'un bloc dominant selon l\'état la suit');
  assert.match(bloc, /class="stb-band"/, 'les postes sont une bande, pas des cartes');
  // La saisie derrière un repli : c'est elle qui faisait 1 400 px de champs vides.
  const ligne = app.slice(app.indexOf('function stbRow('), app.indexOf('function stbSaveAll('));
  assert.match(ligne, /<details class="stb-p">/,
    'les 30 mesures coach doivent rester derrière un repli');
  assert.match(ligne, /class="stb-cnt/,
    'un repli fermé doit annoncer combien de mesures il contient');
});

test('c\'est la ligne du joueur entière qui ouvre ses mesures', () => {
  /* Le repli n'a d'abord réagi qu'au libellé « Stats avancées » : 160 px de
     cible au bas d'une ligne de 1 780 px. On clique sur le joueur, pas sur une
     étiquette — le <summary> doit donc porter toute la ligne d'identité. */
  const ligne = app.slice(app.indexOf('function stbRow('), app.indexOf('function stbSaveAll('));
  assert.match(ligne, /<details class="stb-p"><summary class="stb-id">/,
    'le <summary> doit être la ligne d\'identité elle-même');
  assert.match(ligne, /class="stb-chev"/, 'un chevron doit signaler que la ligne s\'ouvre');
  // Le nom du joueur est DANS le summary : c'est là qu'on clique.
  assert.match(ligne, /<summary class="stb-id">[\s\S]*stb-nm[\s\S]*<\/summary>/,
    'le nom du joueur doit être dans la zone cliquable');
});

test('enregistrer met à jour les compteurs sans re-rendre la vue', () => {
  /* Un re-rendu refermerait les lignes ouvertes et ferait perdre le focus de
     saisie — c'est la boucle qui avait figé la salle de draft. Mais sans mise à
     jour, « 0/6 » et « Mesures coach 0/30 » restaient faux après un
     enregistrement, jusqu'à ce qu'on quitte l'onglet. */
  const bloc = app.slice(app.indexOf('function stbMajApresSauvegarde()'),
                         app.indexOf('function stbParseTime('));
  assert.ok(bloc.length > 100, 'stbMajApresSauvegarde introuvable');
  assert.doesNotMatch(bloc, /renderStatsBoard\(/,
    'le rafraîchissement ne doit JAMAIS passer par un re-rendu complet');
  assert.match(bloc, /stbKpisHtml\([\s\S]*stbHeroHtml\(/,
    'la bande de chiffres et l\'état dominant doivent être refaits');
  const save = app.slice(app.indexOf('function stbSaveAll()'), app.indexOf('function stbMajApresSauvegarde()'));
  assert.match(save, /stbMajApresSauvegarde\(\)/, 'stbSaveAll doit l\'appeler');
});

test('le roster se lit en lignes comparables, pas en mosaïque', () => {
  assert.doesNotMatch(app, /rs-grid/, 'la mosaïque .rs-grid ne doit pas revenir');
  const bloc = app.slice(app.indexOf('function rsRenderRoleCard('), app.indexOf('function rsUiNew('));
  assert.match(bloc, /rs-ligne/, 'chaque poste est une ligne');
  /* Les colonnes de largeur FIXE sont ce qui rend deux lignes comparables :
     avec un flex libre, chaque ligne démarrait ses mesures à une abscisse
     différente selon la longueur du pseudo. */
  assert.match(app, /\.rs-ligne-mes\{[^}]*width:230px/,
    'la colonne de mesures doit garder une largeur fixe');
});

test('l\'avant-match n\'ouvre plus le calculateur retiré de la navigation', () => {
  assert.doesNotMatch(app, /ssTesterBuild/,
    'le calculateur Theorycraft est hors navigation : plus aucune porte vers lui');
  assert.doesNotMatch(app, /Tester au calculateur/, 'le bouton doit avoir disparu');
  // Le champ « champion prévu » survit, mais il part sur la feuille.
  assert.match(app, /Champion prévu : /,
    'le champion prévu doit figurer sur la feuille, sinon le champ n\'alimente rien');
});

// ── 23. Analyse vidéo de scrim : rebranchée, et sans promesse intenable ──

test('l\'analyse vidéo a sa vue, son onglet, et sa zone de dépôt rebranchée', () => {
  assert.match(app, /id="an-view-video"/, 'la vue vidéo doit exister');
  assert.match(app, /data-tab="video"/, 'l\'onglet doit exister');
  /* Le studio n'avait pas été supprimé : il était DÉBRANCHÉ. Plus personne
     n'appelait slUiInit(), donc la zone de dépôt était bien à l'écran mais ne
     réagissait à rien. C'est cet appel qui la fait exister. */
  const bloc = app.slice(app.indexOf('function anShowView('), app.indexOf('function anEnterHub('));
  assert.match(bloc, /slUiInit\(\)/, 'la zone de dépôt doit être rebranchée à l\'ouverture');
  assert.match(bloc, /'video'/, 'la vue vidéo doit être routée');
});

test('aucun chemin de dossier personnel n\'est servi aux clients', () => {
  /* Le panneau « Piloter un replay » affiche, quand l'agent local est absent —
     c'est-à-dire chez tout client — un « cd C:\Users\carne\vs-studio ». Tant
     que cet agent n'est pas distribuable, son panneau reste masqué. */
  const vue = app.slice(app.indexOf('id="an-view-video"'), app.indexOf('id="panel-scrimlab"'));
  assert.match(vue, /id="scrim-live-wrap" style="display:none"/,
    'le pilotage de replay doit rester masqué');
  const show = app.slice(app.indexOf('function anShowView('), app.indexOf('function anEnterHub('));
  assert.doesNotMatch(show, /vsliveInit\(\)/,
    'ne pas chercher l\'agent local tant que son panneau est masqué');
});

test('on ne promet nulle part de lire un .rofl comme une vidéo', () => {
  /* Fait vérifié : un .rofl ne contient aucune vidéo (99,5 % de keyframes
     chiffrées par Riot). Aucun outil ne le convertit en MP4. */
  const debut = app.indexOf('const AN_DESC = {');
  const bloc = app.slice(debut, app.indexOf('};', debut));
  assert.match(bloc, /rofl ne contient pas de vidéo/,
    'la description de l\'onglet doit lever l\'ambiguïté du .rofl');
});

test('sortir du studio ramène sur l\'onglet d\'où l\'on vient', () => {
  const ligne = app.slice(app.indexOf('function slBackToHub()'), app.indexOf('function slBackToHub()') + 130);
  assert.match(ligne, /anGoTab\('video'\)/,
    'switchPanel repasse par anEnterHub, qui forcerait « Stats équipe »');
});

test('aucun chemin de poste personnel n\'est écrit dans le fichier servi', () => {
  /* app.html est servi publiquement : ce qui y est écrit est lisible, même
     quand le bloc qui le contient n'est jamais rendu. */
  assert.doesNotMatch(app, /C:\\+Users\\+[A-Za-z0-9_.-]+/,
    'un chemin de dossier personnel est écrit dans app.html');
});

/* ── 24. Navigation, lien partagé, marque ─────────────────────────────────────
   Trois défauts muets de plus : aucune adresse par écran (le bouton Retour
   quittait l'application), un bouton « Partager » dont le lien n'était lu par
   RIEN depuis le premier dépôt, et des emojis en couleur dans l'UI produit. */

function extraireFonction(nom) {
  const debut = app.indexOf('function ' + nom + '(');
  assert.ok(debut >= 0, nom + ' introuvable');
  // Accolades équilibrées à partir de la première ouvrante.
  let i = app.indexOf('{', debut), prof = 0;
  for (; i < app.length; i++) {
    if (app[i] === '{') prof++;
    else if (app[i] === '}' && --prof === 0) break;
  }
  return app.slice(debut, i + 1);
}

test('les appels de démarrage ne sont plus enfermés dans loadFromURL', () => {
  const decl = extraireFonction('loadFromURL');
  const corps = decl.slice(decl.indexOf('{'));   // sans la déclaration elle-même
  assert.doesNotMatch(corps.replace(/\/\*[\s\S]*?\*\//g, ''), /loadFromURL\(\)|ouvrirVueDepuisURL\(\)/,
    'une fonction qui s\'appelle elle-même au lieu d\'être appelée au démarrage : le lien ne s\'ouvre jamais');
  const nav = app.slice(app.indexOf('NAVIGATION — routes d\'URL'));
  assert.match(nav, /loadFromURL\(\)/, 'le routeur doit lancer loadFromURL au démarrage');
  assert.match(nav, /ouvrirVueDepuisURL\(\)/, 'le routeur doit lancer ouvrirVueDepuisURL au démarrage');
});

test('le lien partagé est encodé, et relu même au format d\'avant', () => {
  assert.match(extraireFonction('shareByURL'), /'\?spes=' \+ encodeURIComponent\(b64\)/,
    'le base64 contient des « + » qu\'une URL lit comme des espaces');
  assert.match(extraireFonction('loadFromURL'), /\.replace\(\/ \/g, '\+'\)/,
    'les liens déjà envoyés portent des « + » bruts');
  assert.match(extraireFonction('loadFromURL'), /vsPartageAssaini\(JSON\.parse\(json\)\)/,
    'le contenu du lien doit passer par le filtre avant tout usage');
});

test('le filtre du lien partagé ne laisse passer que des données attendues', () => {
  const vm = require('node:vm');
  const ctx = { ROLE_WEIGHTS: { Top: {}, Jgl: {}, Mid: {}, ADC: {}, Sup: {} } };
  vm.createContext(ctx);
  vm.runInContext(extraireFonction('vsPartageAssaini') + '; this.f = vsPartageAssaini;', ctx);
  const f = ctx.f;
  const r = f({
    pseudo: '<img src=x onerror="alert(1)">Caliste', tag: '"><svg onload=x>', role: 'Mid<script>',
    rankIdx: 12, rankPrev: '3', age: '17',
    rawData: { kda: 4.7, cs: '6.4', piege: '<b>', 'a b': 1, constructor: 3 },
    champs: [{ name: 'Lee Sin', games: 5, wr: 60, kda: 4 }, { name: "Kai'Sa<img>", games: 2 }],
    adv: { visionScore: 38, html: '<i>' }
  });
  assert.doesNotMatch(r.pseudo + r.tag, /[<>"'&]/, 'aucun caractère HTML ne doit survivre');
  assert.strictEqual(r.role, null, 'un rôle inconnu est rejeté, pas nettoyé');
  assert.strictEqual(r.rankIdx, -1, 'un rang hors bornes est rejeté');
  assert.strictEqual(r.rankPrev, 3);
  assert.deepStrictEqual(Object.keys(r.rawData).sort(), ['constructor', 'cs', 'kda'].sort());
  assert.strictEqual(r.rawData.cs, 6.4, 'les nombres en texte sont convertis');
  assert.deepStrictEqual(r.champs.map(c => c.name), ['Lee Sin'], 'un nom de champion hors liste blanche est jeté');
  assert.deepStrictEqual(Object.keys(r.adv), ['visionScore']);
  assert.strictEqual(f({ pseudo: '<>' }), null, 'un pseudo vide après filtrage invalide le lien');
  assert.strictEqual(f([1, 2]), null);
  assert.strictEqual(f(null), null);
});

test('chaque écran a une adresse, et la navigation l\'écrit', () => {
  const nav = app.slice(app.indexOf('NAVIGATION — routes d\'URL'));
  for (const route of ['/seasons', '/analytics/stats', '/analytics/video', '/scouting', '/scouting/pipeline', '/scouting/comparer', '/scouting/top30', '/players']) {
    assert.ok(nav.includes("'" + route + "'"), 'route manquante : ' + route);
  }
  assert.match(nav, /history\.pushState/, 'une navigation doit créer une entrée d\'historique');
  assert.match(nav, /addEventListener\('popstate'/, 'le bouton Retour doit être écouté');
  for (const f of ['switchPanel', 'anShowView', 'crmShowTab']) {
    assert.ok(nav.includes("'" + f + "'"), f + ' doit noter l\'adresse après navigation');
  }
  // Le routeur enveloppe des fonctions déjà définies : il doit venir après tous les autres scripts.
  assert.ok(app.indexOf('NAVIGATION — routes d\'URL') > app.indexOf('FUSION SCOUTING + DOSSIER'),
    'le script de navigation doit venir après tous les autres');
});

test('la palette de commandes suit le motif combobox ARIA', () => {
  const nav = app.slice(app.indexOf('PALETTE DE COMMANDES'));
  assert.match(nav, /role="combobox"/);
  assert.match(nav, /aria-activedescendant/);
  assert.match(nav, /role="listbox"/);
  assert.match(nav, /role="option"/);
  assert.match(nav, /aria-modal="true"/);
  assert.match(app, /id="hd-cmdk"[^>]*onclick="vsCmdkOuvrir\(\)"/, 'la palette doit être atteignable à la souris');
});

test('les barres d\'onglets sœurs portent le même jeu d\'onglets', () => {
  const barre = id => { const i = app.indexOf(id); return app.slice(i, app.indexOf('</div>', i)); };
  const builds = app.slice(app.indexOf('<div id="panel-builds"'), app.indexOf('<div id="panel-builds"') + 1200);
  assert.match(builds, /anGoTab\('video'\)/, 'la barre de Builds des pros perdait l\'onglet Analyse vidéo');
  for (const id of ['id="top50-tabs"', 'id="analyse-tabs"']) {
    const b = barre(id);
    for (const o of ['Structures', 'Pipeline', 'Candidatures', 'Matching', 'Top 30', 'Comparer']) {
      assert.ok(b.includes('>' + o + '<'), id + ' : onglet manquant ' + o);
    }
  }
});

test('aucun emoji en couleur dans l\'interface produit', () => {
  /* Règle de marque : icônes SVG au trait, pas d'emojis. Les commentaires sont
     exclus (ils peuvent en citer), et le marqueur de donnée « ✅ » de ageStatus
     aussi : il est PERSISTÉ dans le Top 30 des structures, le changer casserait
     leurs données — et il n'est jamais affiché (l'âge l'est à sa place). */
  const code = codeSeul.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*)/.test(l) && !/ageStatus/.test(l)).join('\n')
    .replace(/dbgLog\([^\n]*/g, '');
  const trouves = code.match(/\p{Extended_Pictographic}️|[\u{1F300}-\u{1FAFF}]|[✅❌✨⭐➕]/gu) || [];
  assert.deepStrictEqual(trouves, [], 'emoji dans l\'UI : ' + trouves.join(' '));
});

test('le routeur ne réécrit pas l\'adresse avant de l\'avoir lue', () => {
  /* La fiche d'exemple du mode démo s'ouvrait AVANT le routeur et réécrivait
     l'adresse en #/scouting : un lien #/scouting/carte était effacé sans avoir
     été lu. Mesuré : un seul switchPanel(scout), jamais celui de la carte. */
  const nav = app.slice(app.indexOf('NAVIGATION — routes d\'URL'), app.indexOf('PALETTE DE COMMANDES'));
  const noter = nav.slice(nav.indexOf('function noter('), nav.indexOf('function appliquer('));
  assert.match(noter, /if \(!demarre\) return;/, 'noter() doit se taire tant que le démarrage n\'a pas lu l\'adresse');
  const dem = nav.slice(nav.indexOf('function demarrer('));
  assert.ok(dem.indexOf('demarre = true') < dem.indexOf('noter()'), 'demarre doit passer à vrai AVANT la première écriture');
});

/* ── 25. Studio vidéo ────────────────────────────────────────────────────────── */

test('le studio n\'a qu\'un seul chrono de jeu', () => {
  /* « Caler sur 0:00 » (SL.offset) pilotait le rail des repères ; le champ du
     panneau Riot pilotait le fil d'événements, la vue 2D et l'auto-codage. Deux
     réglages, et le drake apparaissait à deux endroits différents. */
  assert.match(extraireFonction('slParseOffset'), /slOffset\(\)/, 'slParseOffset doit lire SL.offset');
  assert.doesNotMatch(extraireFonction('slParseOffset'), /getElementById/, 'plus de lecture directe du champ');
  assert.match(app, /id="sl-riot-offset"[^>]*onchange="slOffsetDepuisChamp\(this\.value\)"/);
  assert.doesNotMatch(app, /id="sl-riot-offset"[^>]*value="00:00"/, 'un 00:00 par défaut ferait croire à un calage');
  assert.match(extraireFonction('slRenderChrono'), /sl-riot-offset/, 'le champ doit refléter le calage');
});

test('coder une action n\'empile pas une notification par touche', () => {
  const corps = extraireFonction('slCode');
  assert.doesNotMatch(corps, /showToast/, 'dix toasts par minute sur la vidéo en codage live');
  assert.match(corps, /classList\.add\('hit'\)/);
  assert.match(corps, /sl-live/, 'l\'annonce passe par la région live');
});

test('la timeline n\'affiche que les codes utilisés, sous une règle graduée', () => {
  const corps = extraireFonction('slRenderTimeline');
  assert.match(corps, /slRegleHtml\(dur\)/);
  assert.match(corps, /SL\.instances\.some/, 'une piste par code UTILISÉ');
  assert.match(corps, /slRenderClips\(\)/, 'la liste des clips suit chaque rendu');
});

test('la liste des clips existe et se filtre', () => {
  assert.match(app, /id="sl-clips"/);
  const f = extraireFonction('slClipsFiltres');
  assert.match(f, /f\.star/); assert.match(f, /f\.code/); assert.match(f, /normalize\('NFD'\)/);
  assert.match(app, /else if\(e\.key==='\['\)\{ e\.preventDefault\(\); slClipVoisin\(-1\); \}/);
});

test('le transport tient sur une ligne : la vitesse est une liste', () => {
  assert.match(app, /<select id="sl-speed" onchange="slSetSpeed\(parseFloat\(this\.value\)\)">/);
  assert.doesNotMatch(app, /class="chip sl-speed"/);
});

test('la barre de détail du clip n\'utilise plus de glyphes', () => {
  const debut = app.indexOf('id="sl-detail"');
  const bloc = app.slice(debut, app.indexOf('</div>\r\n        </div>', debut));
  assert.doesNotMatch(bloc, /[▶☆★✕]/);
  assert.doesNotMatch(extraireFonction('slRenderDetail'), /[☆★]/);
});

test('sur téléphone, .main peut rétrécir sous la largeur de son contenu', () => {
  /* Mesuré à 375 px : la page s'élargissait à 530 px, parce qu'un élément flex a
     pour largeur minimale celle de son contenu. */
  assert.match(app, /\.shell > \.main\{ min-width:0; \}/);
  assert.match(app, /\.vsd \.grid > \*, \.vsd-dims-grid > \*\{ min-width:0; \}/);
  // La bannière démo n'est plus stylée en inline (impossible à adapter au téléphone).
  assert.doesNotMatch(app, /bar\.style\.cssText='position:fixed;left:0;right:0;bottom:0/);
  assert.match(app, /#vs-demo-bar\{ position:fixed;/);
});

test('l\'en-tête n\'a plus de bascule Compét / Solo Q (elle ne changeait rien)', () => {
  assert.doesNotMatch(codeSeul, /hd-modesw|hd-modebtn/, 'ni balisage ni CSS résiduel');
  assert.doesNotMatch(codeSeul, /'act:mode'/, 'plus d\'entrée de palette non plus');
  // Les bascules qui AGISSENT restent : celle du roster.
  assert.match(app, /class="rs-modesw"/);
});

test('graphiques : aucun LP inventé, winrate borné, courbes sans rebond', () => {
  const lp = extraireFonction('buildChartLP');
  assert.doesNotMatch(lp.replace(/\/\*[\s\S]*?\*\//g, ''), /\+=\s*20|-=\s*18/, 'plus de +20 / −18 inventés');
  assert.match(app, /Bilan net cumulé/);
  assert.match(extraireFonction('vsChartTheme'), /cubicInterpolationMode = 'monotone'/,
    'une spline libre dépasse 100 % et invente des creux');
  assert.match(codeSeul, /min: ?0, max: ?100/);
});

test('les PDF ne vont rien chercher hors de nos fichiers', () => {
  const rapport = extraireFonction('generateOfficialReport');
  assert.doesNotMatch(rapport.replace(/\/\/.*$/gm, ''), /unpkg|jsdelivr|cdnjs/);
  assert.match(rapport, /\/assets\/vendor\/pdf-lib-1\.17\.1\.min\.js/);
});

test('un pseudo non latin ne casse plus les PDF', () => {
  // La police standard des PDF (WinAnsi) lève une erreur sur 페이커.
  assert.match(extraireFonction('vsPdfTexte'), /codePointAt/);
  assert.match(extraireFonction('vsJsPdfLigne'), /addImage/, 'hors latin, la ligne passe en image');
  for (const f of ['ssSheetPdf', 'exportComparaison']) {
    assert.match(extraireFonction(f), /vsJsPdfLigne\(/, f + ' doit écrire les noms via vsJsPdfLigne');
  }
});

test('feuille de route et comparaison : pied de page numéroté sur chaque page', () => {
  for (const f of ['ssSheetPdf', 'exportComparaison']) {
    const corps = extraireFonction(f);
    assert.match(corps, /getNumberOfPages\(\)/, f);
    assert.match(corps, /'Page ' \+ pg \+ ' \/ ' \+/, f);
  }
});

test('Ctrl+P sur une fiche lance le rapport officiel, pas l\'ancien export', () => {
  assert.match(codeSeul, /if \(fiche\) \{ e\.preventDefault\(\); generateOfficialReport\(\); \}/);
});

test('candidatures : le texte du formulaire public est échappé, jamais injecté', () => {
  const carte = extraireFonction('crmCandidateCardHtml');
  // Aucun champ du formulaire concaténé brut.
  for (const champ of ['pseudo', 'tag', 'role', 'age', 'pays', 'rank', 'experience', 'contact']) {
    assert.doesNotMatch(carte, new RegExp("'\\s*\\+\\s*c\\." + champ + "\\b"), 'c.' + champ + ' doit passer par e()');
  }
  // Les boutons ne reçoivent que l'index, jamais le texte du candidat.
  assert.doesNotMatch(carte, /crmVerifyRank\('/);
  assert.match(carte, /crmVerifierCandidat\(' \+ i \+ '\)/);
  assert.match(extraireFonction('crmVerifyRank'), /anEsc\(declaredRank/);
});

test('CRM : le mot « semi-pro » n\'est plus proposé comme niveau de structure', () => {
  const ligne = codeSeul.match(/const CRM_TIERS = \[[^\]]*\]/)[0];
  assert.doesNotMatch(ligne, /semi/i);
  assert.match(extraireFonction('crmLoad'), /'Semi-pro'.*'Autre'/, 'les structures existantes sont migrées');
});

test('CRM : le pipeline est l\'onglet d\'entrée, dans les trois barres sœurs', () => {
  assert.match(codeSeul, /'\/scouting': '\/scouting\/pipeline'/);
  for (const id of ['id="crm-tabs"', 'id="top50-tabs"', 'id="analyse-tabs"']) {
    const i = app.indexOf(id), barre = app.slice(i, app.indexOf('</div>', i));
    assert.ok(barre.indexOf('>Pipeline<') < barre.indexOf('>Candidatures<') && barre.indexOf('>Candidatures<') < barre.indexOf('>Structures<'), id + ' : même ordre partout');
  }
});

test('CRM : relances datées, relues dans les deux formats', () => {
  const f = extraireFonction('crmRelanceDate');
  assert.match(f, /\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)/, 'format du champ date');
  assert.match(f, /\(\\d\{1,2\}\)\\\/\(\\d\{1,2\}\)\\\/\(\\d\{2,4\}\)/, 'ancienne saisie JJ/MM/AAAA');
  assert.match(extraireFonction('crmRelanceEtat'), /'signe'.*'ecarte'/, 'un dossier clos n\'a plus de relance');
  assert.doesNotMatch(codeSeul, /function crmSetRelance/, 'plus de saisie libre par invite');
});

test('matching : plus de score composite qui mélangeait deux échelles', () => {
  const m = extraireFonction('crmRunMatching');
  assert.doesNotMatch(m, /scoreCompat|bonusAge|\* ?0\.55/);
  assert.match(m, /crmScoreNum\(p\)/, 'scores ramenés sur 100 des deux côtés');
  assert.match(m, /crm-match-rule/, 'la règle de tri est écrite à l\'écran');
});

test('fiche prospect : pas de radar fabriqué sans dimensions, pas de rang inventé au comparateur', () => {
  assert.match(extraireFonction('crmRenderFiche'), /aDims \?/);
  assert.doesNotMatch(extraireFonction('crmSendToCompare'), /'Diamond'/);
});

test('menu : Seasons · Analytics · Players · Scouting, et les anciens liens restent valides', () => {
  assert.match(app, /id="nav-scout"[^>]*>[\s\S]*?<\/svg> Players<\/button>/);
  assert.match(app, /id="nav-crm"[^>]*>[\s\S]*?<\/svg> Scouting<\/button>/);
  assert.doesNotMatch(codeSeul, />\s*CRM Agent\s*</, 'plus de « CRM Agent » affiché');
  for (const [ancien, neuf] of [['/crm/pipeline', '/scouting/pipeline'], ['/crm/comparer', '/scouting/comparer'], ['/scouting/carte', '/players/carte']]) {
    assert.ok(codeSeul.includes("'" + ancien + "': '" + neuf + "'"), 'alias manquant ' + ancien);
  }
});

test('brief d\'avant-match : pas de « point faible » ni de pourcentage sur deux games', () => {
  const b = extraireFonction('ssMatchupBrief');
  assert.doesNotMatch(b, /games >= 2\b/, 'l\'ancien seuil de 2 games');
  assert.doesNotMatch(b, /\|\| pool\[0\]/, 'plus de ban par défaut sur le premier champion venu');
  assert.match(b, /DL_WR_MIN_GAMES/);
  assert.match(b, /SS_BRIEF_MIN_FAIBLE/);
  assert.match(extraireFonction('ssChampStat'), /DL_WR_MIN_GAMES/);
  assert.doesNotMatch(codeSeul, /c\.games \+ 'g, ' \+ c\.wr \+ '%WR\)'/, 'pool affiché sans seuil');
});

test('l\'ancien export PDF, remplacé par le rapport officiel, a disparu', () => {
  assert.doesNotMatch(codeSeul, /function exportPDF\(/);
  assert.doesNotMatch(codeSeul, /exportPDF\(\)/);
});

test('le VisionScore s\'affiche sur 100 partout, et sa couleur ne dépend pas de l\'échelle', () => {
  // La couleur recevait des notes sur 100 avec des seuils sur 10 : tout sortait vert.
  const coul = extraireFonction('anScoreColor');
  assert.match(coul, /if \(s > 10\) s = s \/ 10;/);
  assert.match(extraireFonction('vsNote100'), /x <= 10 \? x \* 10 : x/);
  // Fiche, Top 30, historique, comparateur, rapport PDF.
  assert.match(codeSeul, /setTxt\('vsd-gauge-val', g100 !== null \? String\(g100\) : '—'\)/);
  assert.match(codeSeul, /const vs = isNaN\(vsNum\) \? '—' : String\(vsNote100\(vsNum\)\);/);
  assert.match(codeSeul, /h\.score !== null \? vsNote100\(h\.score\) : '—'/);
  assert.doesNotMatch(codeSeul, /s\.global\?\.toFixed\(2\)|parseFloat\(s\.global\)\.toFixed\(2\)/, 'plus de note globale sur 10 dans le comparateur');
  const rapport = extraireFonction('generateOfficialReport');
  assert.match(rapport, /put\(p1, '\/100'/, 'le « /10 » du modèle est remplacé');
  assert.doesNotMatch(rapport, /gScore\.toFixed\(2\)\+'\/10'/);
});

test('barèmes élite : le plancher Challenger vaut 7/10, et la note garde de la nuance en dessous', () => {
  /* Mesuré le 01/10/2026 : lus comme « mauvais/moyen/bon/élite », les centiles du haut
     du Challenger plaçaient p10 à 3/10 — un jungler à 6,4 CS/min (haut de tableau
     européen) sortait à 3,0. On exécute la vraie fonction. */
  const echelle = codeSeul.match(/const ELITE_ECHELLE = \{[^}]*\};/)[0];
  const scoreElite = new Function(echelle + '\n' + extraireFonction('scoreElite') + '\nreturn scoreElite;')();
  const jglCs = [6.49, 6.86, 7.23, 7.71];
  assert.strictEqual(scoreElite(6.49, jglCs), 7);
  assert.strictEqual(scoreElite(6.86, jglCs), 8);
  assert.strictEqual(scoreElite(7.23, jglCs), 9);
  assert.strictEqual(scoreElite(9, jglCs), 10);
  assert.ok(scoreElite(6.4, jglCs) > 6.5, 'le cas mesuré ne doit plus tomber à 3');
  assert.ok(Math.abs(scoreElite(6.49 * 0.75, jglCs) - 3) < 1e-9, '75 % du plancher → 3/10');
  assert.strictEqual(scoreElite(1, jglCs), 0);
  // Croissante, sans saut, y compris avec un plancher négatif (avantage de vision).
  for (const s of [jglCs, [-0.08, 0, 0.12, 0.33], [-49.34, -46.35, -42.38, -34.67]]) {
    let avant = -1;
    for (let i = 0; i <= 400; i++) {
      const v = s[0] - (s[3] - s[0]) * 2 + (s[3] - s[0]) * 3.5 * i / 400;
      const n = scoreElite(v, s);
      assert.ok(Number.isFinite(n) && n >= avant - 1e-9 && n >= 0 && n <= 10, 'non monotone ou hors bornes en ' + v);
      avant = n;
    }
  }
  // Les deux points d'entrée des barèmes élite passent par cette échelle.
  assert.match(extraireFonction('scoreStatCalibrated'), /if \(sElite\) return scoreElite\(v, sElite\);/);
  assert.match(extraireFonction('advScore'), /return scoreElite\(val, se\);/);
});
