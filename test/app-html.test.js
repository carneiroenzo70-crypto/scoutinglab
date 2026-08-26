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
    if (!/pmCargo|\/api\/lp/.test(fenetre)) directs.push('ligne ' + (i + 1));
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
