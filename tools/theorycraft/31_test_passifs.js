/* Vérifie les passifs d'objet.

   Deux exigences, apprises à mes dépens :
     — aucun attendu ne vient de `items_modeles.js`. Les pourcentages sont recalculés
       depuis `items.json` et les stats de la cible, ou repris du wiki en clair.
     — chaque valeur modélisée doit se retrouver dans la description FRANÇAISE de la
       boutique. C'est le contrôle qui aurait bloqué `SiphonDamage`, une clé résiduelle
       du fichier de jeu que j'avais prise pour un effet vivant.
       ⚠ Certains objets affichent « 0 » dans leur description (gabarits non résolus
       côté client) : ils sont comptés à part, pas silencieusement validés. */
const M = require('./26_modele_degats');
const I = require('./30_moteur_items');
const items = require('./items.json');
const fr = require('./items_fr.json');

let ok = 0, ko = 0;
function verifie(libelle, obtenu, attendu, tol = 0.05) {
  const bon = obtenu != null && Math.abs(obtenu - attendu) <= tol;
  console.log((bon ? '  OK   ' : '  ÉCHEC') + '  ' + libelle.padEnd(58) +
    'obtenu ' + (obtenu == null ? 'null' : Math.round(obtenu * 100) / 100) +
    '   attendu ' + Math.round(attendu * 100) / 100);
  bon ? ok++ : ko++;
}
function vrai(libelle, cond, detail = '') {
  console.log((cond ? '  OK   ' : '  ÉCHEC') + '  ' + libelle + (detail ? '  ' + detail : ''));
  cond ? ok++ : ko++;
}

const descFr = {};
fr.forEach(x => { descFr[x.id] = (x.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); });
const cible = M.cibleChampion('Rumble', 18, []);
const jinx = M.profil('Jinx', 18, []);      // à distance
const rumble = M.profil('Rumble', 18, []);  // mêlée

/* Profil de référence pour le balayage de tous les passifs : il faut un champion en
   MÊLÉE et AVEC DU MANA. Rumble n'a pas de mana (il fonctionne à la chaleur) : le
   Manamune y est légitimement inapplicable, et le balayage le comptait à tort comme un
   échec. On choisit le champion dans les données plutôt que de le coder en dur. */
const idRef = Object.keys(M.champions).find(id => {
  const b = M.champions[id].base;
  return b.mana != null && b.portee <= 300;
});
const ref = M.profil(idRef, 18, []);

console.log('── Pourcentage porté par la CIBLE (le piège du facteur 2400)');
/* La Lame du roi déchu stocke « 0,09 » dans un calcul et la multiplication par les PV
   de la cible dans un AUTRE. Lire le premier seul donnait 0,06 au lieu de 145. */
const botrk = items.find(x => x.id === 3153);
const pcMelee = botrk.valeurs.MeleeValue, pcDist = botrk.valeurs.RangedValue;
verifie('mêlée : ' + (pcMelee * 100).toFixed(0) + ' % des PV actuels de la cible',
  I.evaluerPassif(3153, rumble, cible).brut, pcMelee * cible.pvMax);
verifie('à distance : ' + (pcDist * 100).toFixed(0) + ' %',
  I.evaluerPassif(3153, jinx, cible).brut, pcDist * cible.pvMax);
vrai('le résultat n\'est pas la fraction brute (0,09) mais un vrai montant',
     I.evaluerPassif(3153, rumble, cible).brut > 100);
// PV ACTUELS, pas PV max : contre une cible entamée, l'effet chute
const entamee = Object.assign({}, cible, { pvActuels: cible.pvMax * 0.3 });
verifie('cible à 30 % de vie : l\'effet chute de 70 %',
  I.evaluerPassif(3153, rumble, entamee).brut, pcMelee * cible.pvMax * 0.3);
vrai('  (ce serait faux avec les PV MAX — le wiki dit « current health »)',
     I.evaluerPassif(3153, rumble, entamee).brut <
     I.evaluerPassif(3153, rumble, cible).brut * 0.5);
// Sans cible, refus explicite plutôt qu'un 0,09 trompeur
const sansCible = I.evaluerPassif(3153, rumble, null);
vrai('sans cible : refus explicite, pas la fraction brute',
     sansCible.ok === false, sansCible.raison);

console.log('\n── Version « à distance » portée par le calcul (mRangedMultiplier)');
/* Vérifié sur le wiki : Hydre titanesque 1 % des PV max en mêlée, 0,5 % à distance. */
const hydreM = I.evaluerPassif(3748, rumble, cible).brut;
const hydreD = I.evaluerPassif(3748, jinx, cible).brut;
verifie('mêlée : 1 % des PV max du PORTEUR', hydreM, rumble.pvMax * 0.01);
verifie('à distance : la moitié (0,5 %)', hydreD, jinx.pvMax * 0.005);
vrai('  le facteur n\'est pas ignoré (il l\'était : les deux Hydres étaient surestimées)',
     Math.abs(hydreD / jinx.pvMax - 0.005) < 0.0005);

console.log('\n── Passifs à valeur fixe et à ratio');
const nashor = items.find(x => x.id === 3115);
const pAP = M.profil('Rumble', 18, [], { ap: 200 });
verifie('Dent de Nashor : ' + nashor.valeurs.NashorsBaseValue + ' + ' +
        (nashor.valeurs.NashorsAPValue * 100) + ' % puissance, avec 200 AP',
  I.evaluerPassif(3115, pAP, cible).brut,
  nashor.valeurs.NashorsBaseValue + nashor.valeurs.NashorsAPValue * 200);
verifie('Au bout du rouleau : valeur fixe',
  I.evaluerPassif(3091, jinx, cible).brut, items.find(x => x.id === 3091).calculs.OnHitDamage.termes[0].valeur);

console.log('\n── Base, bonus ou total : la table qui était permutée');
/* Le Fléau de liche ressortait à « 75 % de l'AD BONUS » alors que le wiki dit « 75 %
   de l'AD de BASE ». Sur un mage sans dégâts d'attaque bonus la lame enchantée tombait
   à zéro ; sur un combattant elle explosait. Trois objets, trois valeurs du wiki. */
const modeDe = (id, calcul, stat) => {
  const t = (items.find(x => x.id === id).calculs[calcul].termes || [])
    .find(x => x.stat === stat);
  return t ? { mode: t.mode, valeur: t.valeur } : null;
};
const lich = modeDe(3100, 'SpellbladeDamage', 'AD');
verifie('Fléau de liche : 75 % de l\'AD (wiki)', lich.valeur, 0.75);
vrai('  et c\'est bien l\'AD de BASE, pas le bonus', lich.mode === 'base', lich.mode);
const trin = modeDe(3078, 'SpellbladeDamage', 'AD');
verifie('Force de la trinité : 200 % de l\'AD (wiki)', trin.valeur, 2);
vrai('  sur l\'AD de base', trin.mode === 'base', trin.mode);
const lichAP = modeDe(3100, 'SpellbladeDamage', 'AP');
verifie('Fléau de liche : 45 % de puissance (wiki)', lichAP.valeur, 0.45);
vrai('  et la puissance est bien en « total »', lichAP.mode === 'total', lichAP.mode);
/* Contre-épreuve : un ratio explicitement « bonus » doit rester bonus. Sans elle, on
   pourrait tout basculer en « base » et croire le problème réglé. */
const term = modeDe(3302, 'OnHitDamage', 'AD');
vrai('Terminus : son ratio d\'AD reste « bonus » (contre-épreuve)',
     term.mode === 'bonus', term.mode);

console.log('\n── Cumul des coups à l\'impact sur un build entier');
const build = M.profil('Jinx', 18, [3153, 3115, 3091]);
const oh = I.coupsAImpact(build, cible, { mitiger: M.mitiger });
vrai('trois objets à coup à l\'impact reconnus', oh.lignes.length === 3,
     oh.lignes.map(l => l.objet).join(', '));
vrai('aucun refus', oh.refus.length === 0, oh.refus.join(' | '));
// La somme mitigée doit valoir la somme des lignes, pas davantage
const somme = oh.lignes.reduce((s, l) => s + l.subis, 0);
verifie('la somme mitigée est cohérente', oh.subis, somme, 0.05);
/* Contrôle de bon sens : les dégâts magiques passent mieux que les physiques sur cette
   cible (54 de RM contre 116 d'armure). La Dent de Nashor doit donc perdre moins. */
const nash = oh.lignes.find(l => /Nashor/.test(l.objet));
const bot = oh.lignes.find(l => /roi déchu/.test(l.objet));
vrai('le magique est moins réduit que le physique sur cette cible',
     nash.subis / nash.brut > bot.subis / bot.brut,
     Math.round(nash.subis / nash.brut * 100) + ' % contre ' +
     Math.round(bot.subis / bot.brut * 100) + ' %');

console.log('\n── Passifs qui ACCORDENT des stats (ils changent tout le reste)');
/* Ceux-là ne s'ajoutent pas aux dégâts : ils modifient le profil, donc tous les ratios
   de sorts et toutes les attaques qui suivent. Deux valeurs confirmées sur le wiki. */
// Gage de Sterak : « bonus attack damage equal to 50% base AD »
const sterak = M.profil('Aatrox', 18, [3053]);
const nu = M.profil('Aatrox', 18, [], { sansPassifs: true });
verifie('Gage de Sterak : 50 % de l\'AD de base en AD bonus (wiki)',
        sterak.adBonus, nu.adBase * 0.5, 0.5);
vrai('  le gain est tracé, pas fondu dans le total',
     (sterak.statsAccordees || []).some(x => /Sterak/.test(x.objet)));
// Manamune : « bonus attack damage equal to 2% maximum mana »
const mana = M.profil('Ryze', 18, [3004]);
const manaStat = items.find(x => x.id === 3004).stats.ad.valeur;
verifie('Manamune : 2 % du mana max, en plus de sa stat propre (wiki)',
        mana.adBonus, manaStat + mana.mana * 0.02, 0.5);
/* Le mana manquait totalement au modèle. Ryze — 1er pick Mid — fait reposer ses quatre
   sorts dessus : ils étaient refusés en silence. */
vrai('le mana est désormais dans le profil', mana.mana > 1000, Math.round(mana.mana) + '');
const calculQ = Object.keys(M.champions.Ryze.sorts.Q.calculs)
  .find(n => M.champions.Ryze.sorts.Q.calculs[n].genre === 'degats');
const q = M.evaluerCalcul('Ryze', 'Q', calculQ, 5, mana, cible);
vrai('  et le Q de Ryze se calcule enfin', q.ok && q.brut > 0, q.ok ? q.brut + ' brut' : q.raison);
/* Un champion à énergie ne doit PAS se voir attribuer du mana : compter zéro ferait
   croire que le Manamune ne donne rien, au lieu de dire qu'il est inapplicable. */
vrai('un champion à énergie n\'a pas de mana', M.profil('Rumble', 18, []).mana === null);

console.log('\n── Cadence : amortir plutôt qu\'exclure ou compter en entier');
/* Le Tueur de krakens frappe un coup sur trois. L'ajouter en entier le triplerait,
   l'exclure l'effacerait : sur la durée, la seule valeur juste est le tiers. */
const kraken = M.profil('Jinx', 18, [6672]);
const ohK = I.coupsAImpact(kraken, cible, { mitiger: M.mitiger });
const lK = ohK.lignes.find(l => /krakens/i.test(l.objet));
vrai('le Tueur de krakens est bien compté', !!lK, lK ? lK.cadence : '');
if (lK) {
  const seul = I.evaluerPassif(6672, kraken, cible);
  verifie('  et vaut le tiers de son montant par attaque', lK.subis, seul.brut / 3, 0.5);
  vrai('  sa cadence est affichée, pas cachée', /sur 3/.test(lK.cadence), lK.cadence);
}

console.log('\n── Refus et écarts assumés');
const inconnu = I.evaluerPassif(999999, jinx, cible);
vrai('objet inconnu refusé', inconnu.ok === false, inconnu.raison);
/* Un objet volontairement écarté doit le dire, pas renvoyer zéro : l'Ouragan de Runaan
   ne change rien en cible unique, ce n'est pas la même chose que « ne fait rien ». */
const runaan = I.evaluerPassif(3085, jinx, cible);
vrai('objet écarté avec un motif, jamais un zéro muet',
     runaan.ok === true && runaan.applique === false && !!runaan.raison, runaan.raison);
// Un objet à passif non encore modélisé doit être signalé comme tel
const nonMod = items.find(o => o.fini && o.prix >= 1800 && !I.MODELES[o.id] &&
                               Object.keys(o.calculs).length);
if (nonMod) {
  const e = I.evaluerPassif(nonMod.id, jinx, cible);
  vrai('objet non modélisé signalé, pas ignoré', e.ok === false && e.raison === 'non modélisé',
       nonMod.nom);
}

console.log('\n── Chaque valeur modélisée existe-t-elle dans la description en jeu ?');
/* Le contrôle qui aurait bloqué SiphonDamage. On cherche le nombre annoncé par le
   modèle dans le texte de la boutique. */
/* On isole la PHRASE du passif — repérée par son nom en jeu — au lieu de fouiller la
   description entière. Sans ça, la Lame du roi déchu passait pour vérifiée grâce au
   « 30 % » d'un tout autre passif (le ralentissement). */
function phraseDuPassif(id, nomPassif) {
  const t = descFr[id] || '';
  if (!nomPassif) return null;
  const i = t.indexOf(nomPassif);
  if (i < 0) return null;
  return t.slice(i + nomPassif.length, i + nomPassif.length + 220);
}

/* ⚠ Ce contrôle ne peut que CONFIRMER, jamais réfuter : les gabarits du client ne sont
   pas résolus, beaucoup de phrases n'impriment aucun chiffre. En faire un test strict
   reviendrait à échouer sur des objets parfaitement corrects.

   Le garde-fou strict est ailleurs, et il est plus fort : tout passif modélisé doit
   porter un NOM qui existe dans la boutique. C'est exactement ce qui aurait bloqué
   `SiphonDamage` — une clé résiduelle du fichier de jeu, sans nom affiché nulle part. */
let confirmes = 0, fantomes = [], sansNombre = [], echecs = [];
Object.keys(I.MODELES).map(Number).forEach(id => {
  const m = I.MODELES[id];
  if (m.nonApplique) return;
  const o = items.find(x => x.id === id);
  const e = I.evaluerPassif(id, ref, cible);
  if (!e.ok) { echecs.push(o.nom + ' : ' + e.raison); return; }

  const phrase = phraseDuPassif(id, m.nom);
  if (phrase == null) { fantomes.push(o.nom + ' → « ' + m.nom +' »'); return; }

  const candidats = Object.values(o.valeurs)
    .concat(e.detail.map(d => d.valeur).filter(v => v != null));
  // La boutique affiche « 9 % » quand le fichier stocke 0,09 : on essaie les deux formes.
  const present = candidats.some(v => {
    if (v == null || v === 0) return false;
    const pct = String(Math.round(Math.abs(v) * 100));
    const ent = String(Math.round(Math.abs(v)));
    return new RegExp('\\b' + pct + '\\s*%').test(phrase) ||
           (ent.length > 1 && new RegExp('\\b' + ent + '\\b').test(phrase));
  });
  present ? confirmes++ : sansNombre.push(o.nom);
});
vrai('aucun passif modélisé n\'est un fantôme (nom absent de la boutique)',
     fantomes.length === 0, fantomes.join(' | '));
vrai('aucun passif modélisé n\'échoue à l\'évaluation', echecs.length === 0,
     echecs.join(' | '));
console.log('       ' + confirmes + ' confirmés chiffre en main ; ' + sansNombre.length +
            ' dont la boutique n\'imprime pas la valeur (gabarit non résolu) :');
console.log('       ' + sansNombre.join(', '));

console.log('\n── Ce que la description confirme sans donner de chiffre');
/* Faute de nombre, le texte valide quand même le point le plus risqué du modèle :
   sur quoi porte le pourcentage. Il dit « PV actuels de l'ennemi » — pas « PV max »,
   pas « vos PV ». C'est la confirmation interne de ce que dit le wiki. */
const phraseBotrk = phraseDuPassif(3153, 'Fil de brume') || '';
vrai('la Lame du roi déchu annonce « PV actuels de l\'ennemi »',
     /PV actuels de l'ennemi/i.test(phraseBotrk));
vrai('  et non les PV max', !/PV max/i.test(phraseBotrk));
const phraseHydre = phraseDuPassif(3748, 'Fendoir') || '';
vrai('l\'Hydre titanesque annonce toucher aussi les ennemis derrière la cible',
     /derrière la cible/i.test(phraseHydre),
     '→ justifie d\'exclure les dégâts de cône du calcul en cible unique');

console.log('\n── Couverture, sans arrondi flatteur');
const c = I.couverture();
console.log('   objets finis (≥ 1800 po)        : ' + c.finis.length);
console.log('   dont portant un passif chiffré  : ' + c.avecPassif.length);
console.log('   appliqués aux dégâts            : ' + c.modelises.length);
console.log('   écartés avec un motif           : ' + c.ecartes.length);
console.log('   PAS ENCORE MODÉLISÉS            : ' + c.sansModele.length);
vrai('la couverture est comptée, pas devinée',
     c.modelises.length + c.ecartes.length + c.sansModele.length === c.avecPassif.length);

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══');
process.exit(ko ? 1 : 0);
