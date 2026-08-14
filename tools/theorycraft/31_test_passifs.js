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

/* Bâton de l'archange : « 1 % de votre mana BONUS ». La distinction est tout sauf
   théorique — au niveau 18 le mana total de Ryze dépasse le bonus de plus de 1000. */
const arch = M.profil('Ryze', 18, [3003]);
const apArch = items.find(x => x.id === 3003).stats.ap.valeur;
verifie('Bâton de l\'archange : 1 % du mana BONUS en puissance',
        arch.ap, apArch + arch.manaBonus * 0.01, 0.01);
vrai('  et non 1 % du mana total', arch.mana > arch.manaBonus + 900,
     Math.round(arch.mana) + ' total contre ' + Math.round(arch.manaBonus) + ' bonus');

/* La chaîne mana → PV → AD, et la seule chose qui puisse la prouver : l'Approche de
   l'hiver donne 15 % du mana en PV, l'Armure sanguine convertit ensuite 2,5 % des PV
   bonus en AD. Sur un profil figé, la seconde ne verrait jamais les PV de la première. */
const chaine = M.profil('Sion', 18, [3119, 2501], { fenetre: 10 });
const pvChaine = items.find(x => x.id === 3119).stats.pv.valeur
               + items.find(x => x.id === 2501).stats.pv.valeur;
verifie('Approche de l\'hiver : 15 % du mana max en PV bonus',
        chaine.pvBonus, pvChaine + chaine.mana * 0.15, 0.5);
verifie('  et l\'Armure sanguine convertit CES PV-là aussi',
        chaine.adBonus, items.find(x => x.id === 2501).stats.ad.valeur + chaine.pvBonus * 0.025, 0.05);
vrai('  sans la chaîne, 6,7 dégâts d\'attaque seraient perdus',
     chaine.adBonus > 30 + pvChaine * 0.025 + 1,
     'écart de ' + Math.round((chaine.adBonus - 30 - pvChaine * 0.025) * 10) / 10 + ' AD');

console.log('\n── Passifs qui MULTIPLIENT une stat (l\'ordre décide du résultat)');
/* Coiffe de Rabadon : « Vous augmentez votre puissance totale de 30 % ». Objet présent
   dans les builds de référence et jusque-là non appliqué — la puissance de ces builds
   était sous-estimée de 30 %, silencieusement. */
const apRab = items.find(x => x.id === 3089).stats.ap.valeur;
const rab = M.profil('Ryze', 18, [3089]);
verifie('Coiffe de Rabadon : +30 % de la puissance totale', rab.ap, apRab * 1.3, 0.01);
const apZho = items.find(x => x.id === 3157).stats.ap.valeur;
verifie('  et elle amplifie AUSSI la puissance des autres objets',
        M.profil('Ryze', 18, [3089, 3157]).ap, (apRab + apZho) * 1.3, 0.01);
vrai('  le multiplicateur est tracé avec son socle',
     (rab.multiplicateurs || []).some(x => x.socle === apRab && x.pourcent === 0.3));

/* La preuve que l'ORDRE des trois passes est le bon, et le seul test qui puisse
   l'établir : Warmog ajoute 12 % des PV d'objets, l'Armure sanguine convertit ensuite
   2,5 % des PV bonus en dégâts d'attaque. Si le multiplicateur passait APRÈS la
   conversion, les PV de Warmog n'entreraient jamais dans les dégâts. */
const pvW = items.find(x => x.id === 3083).stats.pv.valeur;
const bm = items.find(x => x.id === 2501);
const duo = M.profil('Sion', 18, [3083, 2501], { fenetre: 10 });
const pvObjets = pvW + bm.stats.pv.valeur;
verifie('Armure de Warmog : +12 % des PV d\'objets', duo.pvBonus, pvObjets * 1.12, 0.5);
verifie('Armure sanguine : 2,5 % des PV bonus en AD — Warmog compris',
        duo.adBonus, bm.stats.ad.valeur + pvObjets * 1.12 * 0.025, 0.5);
/* Contre-test : si l'ordre était inversé, l'AD ne compterait que 1550 PV et non 1736.
   L'écart tient en 4,7 dégâts d'attaque — assez petit pour passer inaperçu à l'œil,
   assez grand pour fausser une comparaison de builds. */
vrai('  l\'ordre inverse donnerait un chiffre plus bas',
     duo.adBonus > bm.stats.ad.valeur + pvObjets * 0.025 + 0.5,
     'écart de ' + Math.round((duo.adBonus - bm.stats.ad.valeur - pvObjets * 0.025) * 10) / 10 + ' AD');

/* Jak'Sho porte sur les résistances BONUS, pas totales, et ne s'arme qu'après 5 s de
   combat. Une condition de temps non vérifiable doit se refuser, jamais se supposer. */
const armJak = items.find(x => x.id === 6665).stats.armure.valeur;
const jak = M.profil('Sion', 18, [6665], { fenetre: 10 });
const jakNu = M.profil('Sion', 18, [], { sansPassifs: true });
verifie('Jak\'Sho : +30 % des résistances BONUS après 5 s', jak.armureBonus, armJak * 1.3, 0.01);
verifie('  la base du champion n\'est pas amplifiée', jak.armure - jak.armureBonus, jakNu.armure, 0.01);
vrai('  sous 5 s de combat, le passif est refusé avec son motif',
     /5 s de combat/.test((M.profil('Sion', 18, [6665], { fenetre: 3 }).statsRefusees || []).join(' ')));
vrai('  sans durée de combat fournie, il est refusé plutôt que supposé',
     /non fournie/.test((M.profil('Sion', 18, [6665]).statsRefusees || []).join(' ')));

console.log('\n── Passifs à intervalle et actifs : comptés à part, jamais par attaque');
/* Ils ne doivent SURTOUT pas se retrouver dans les dégâts par attaque : l'Égide
   solaire brûle une fois par seconde, le Cœuracier une fois par cible toutes les
   30 s. Les fondre dans le coup à l'impact multiplierait leur valeur par la vitesse
   d'attaque. */
const tank = M.profil('Sion', 18, [3068, 2502, 3084], { fenetre: 10 });
const solaire = I.evaluerPassif(3068, tank, cible, { fenetre: 10 });
verifie('Égide solaire : 20 + 1,5 % des PV bonus, par seconde',
        solaire.brut, 20 + tank.pvBonus * 0.015, 0.05);
vrai('  et c\'est bien un débit, pas un montant', solaire.parSeconde === true);
verifie('Désespoir infini : 3 % des PV bonus toutes les 4 s',
        I.evaluerPassif(2502, tank, cible).brut, tank.pvBonus * 0.03, 0.05);
verifie('Cœuracier : 70 + 6 % des PV MAX (et non bonus)',
        I.evaluerPassif(3084, tank, cible).brut, 70 + tank.pvMax * 0.06, 0.05);
const ohTank = I.coupsAImpact(tank, cible, { mitiger: M.mitiger });
vrai('  aucun des trois n\'entre dans les dégâts par attaque',
     ohTank.lignes.length === 0, ohTank.lignes.map(l => l.objet).join(', '));

/* Actifs : longue recharge, déclenchés par le joueur. Leurs chiffres sont vérifiables
   au sou près, c'est ce qui les rend modélisables malgré une boutique muette. */
const mage = M.profil('Ryze', 18, [3152, 3146, 3089]);
verifie('Ceinture-roquette : 100 + 10 % de la puissance',
        I.evaluerPassif(3152, mage, cible).brut, 100 + mage.ap * 0.1, 0.05);
verifie('Pistolame : 253 au niveau 18 + 30 % de la puissance',
        I.evaluerPassif(3146, mage, cible).brut, 253 + mage.ap * 0.3, 0.05);
vrai('  la puissance servie inclut bien la Coiffe de Rabadon', mage.ap > 300,
     Math.round(mage.ap) + ' de puissance');

console.log('\n── Amplifications : additives entre elles, et pas sur n\'importe quoi');
/* Une cible bien équipée, seule façon d'éprouver le Tueur de géants — il dépend des
   PV BONUS de l'adversaire, pas de ceux du porteur. */
const gros = M.cibleChampion('Sion', 18, [3083, 3068]);
const ampP = M.profil('Ryze', 18, [4633, 3161, 8020, 3036], { fenetre: 10 });

/* LE point vérifié sur le wiki avant d'écrire une ligne : « Modifiers to damage dealt
   now stack additively instead of multiplicatively ». Raisonner par symétrie avec les
   pénétrations en pourcentage, qui se multiplient, aurait donné 1,08 × 1,06 × 1,12 ×
   1,15 = +47,4 % au lieu de +41 % — un écart plausible, donc invisible. */
const ampMag = I.amplification(ampP, gros, 'magique', 'competence');
verifie('quatre amplifications se cumulent ADDITIVEMENT', ampMag.total, 0.08 + 0.06 + 0.12 + 0.15, 0.001);
vrai('  et non multiplicativement',
     Math.abs(ampMag.facteur - 1.08 * 1.06 * 1.12 * 1.15) > 0.05,
     'additif ' + Math.round(ampMag.facteur * 1000) / 1000 +
     ' contre multiplicatif ' + Math.round(1.08 * 1.06 * 1.12 * 1.15 * 1000) / 1000);

/* Chaque amplification a son champ d'application. Les confondre reviendrait à offrir
   à chaque objet une portée qu'il n'a pas. */
verifie('le Masque abyssal ne touche que le magique',
        I.amplification(ampP, gros, 'physique', 'competence').total, 0.08 + 0.06 + 0.15, 0.001);
verifie('la Lance de Shojin ne touche pas les attaques de base',
        I.amplification(ampP, gros, 'physique', 'attaque').total, 0.08 + 0.15, 0.001);
vrai('  mais bien les passifs d\'objet (procs)',
     I.amplification(ampP, gros, 'physique', 'objet').total > 0.22,
     '+' + Math.round(I.amplification(ampP, gros, 'physique', 'objet').total * 1000) / 10 + ' %');

/* Shojin : le fichier porte deux calculs vivants et concordants (3 en mêlée, 1,5 à
   distance) là où le résumé du wiki n'en voit qu'un. Le fichier prime — et la moitié
   se voit. */
verifie('Lance de Shojin : 3 % × 4 cumuls en mêlée',
        I.amplification(M.profil('Sion', 18, [3161], { fenetre: 10 }), gros, 'physique', 'competence').total,
        0.12, 0.001);
verifie('  et la moitié à distance', I.amplification(M.profil('Jhin', 18, [3161], { fenetre: 10 }),
        gros, 'physique', 'competence').total, 0.06, 0.001);

/* Tueur de géants : proportionnel aux PV bonus de la CIBLE, plafonné à 1500. Contre
   une cible sans PV bonus, l'amplification doit être nulle — c'est ce qui distingue
   une amplification conditionnelle d'un bonus permanent déguisé. */
const maigre = M.cibleChampion('Ryze', 18, []);
verifie('Tueur de géants : nul contre une cible sans PV bonus',
        I.amplification(M.profil('Jhin', 18, [3036], { fenetre: 10 }), maigre, 'physique', 'attaque').total,
        0, 0.001);
vrai('  et au maximum au-delà de 1500 PV bonus', gros.pvBonus > 1500 &&
     Math.abs(I.amplification(M.profil('Jhin', 18, [3036], { fenetre: 10 }), gros, 'physique', 'attaque').total - 0.15) < 0.001,
     Math.round(gros.pvBonus) + ' PV bonus');

/* Flamme-ombre : +20 % sous 40 % des PV de la cible. Par défaut la cible est à pleine
   vie, donc zéro — un plancher assumé plutôt qu'une moyenne inventée. */
const flamme = M.profil('Ryze', 18, [4645], { fenetre: 10 });
verifie('Flamme-ombre : nulle contre une cible à pleine vie',
        I.amplification(flamme, gros, 'magique', 'competence').total, 0, 0.001);
verifie('  et +20 % sous le seuil de 40 %',
        I.amplification(flamme, { ...gros, pvActuels: gros.pvMax * 0.3 }, 'magique', 'competence').total,
        0.2, 0.001);
verifie('  mais jamais sur des dégâts physiques',
        I.amplification(flamme, { ...gros, pvActuels: gros.pvMax * 0.3 }, 'physique', 'competence').total,
        0, 0.001);

/* Créateur de failles : 2 % par seconde, plafond 8 %. Sans durée de combat, il doit se
   REFUSER — le servir au plafond offrirait +8 % permanents à tout build qui le porte. */
verifie('Créateur de failles : 2 %/s, plafonné à 8 %',
        I.amplification(M.profil('Ryze', 18, [4633], { fenetre: 10 }), gros, 'magique', 'competence').total,
        0.08, 0.001);
verifie('  et seulement 4 % après 2 s de combat',
        I.amplification(M.profil('Ryze', 18, [4633], { fenetre: 2 }), gros, 'magique', 'competence').total,
        0.04, 0.001);
vrai('  sans durée de combat, il est refusé plutôt que servi au plafond',
     /durée non fournie/.test(I.amplification(M.profil('Ryze', 18, [4633]), gros, 'magique', 'competence').refus.join(' ')));

/* Bout en bout : l'amplification doit vraiment atteindre les dégâts d'un sort, et
   s'appliquer AVANT la mitigation. */
const nomQR = Object.keys(M.champions.Ryze.sorts.Q.calculs)
  .find(n => M.champions.Ryze.sorts.Q.calculs[n].genre === 'degats');
const qAmp = M.evaluerCalcul('Ryze', 'Q', nomQR, 5, M.profil('Ryze', 18, [4633], { fenetre: 10 }), gros);
const qNu = M.evaluerCalcul('Ryze', 'Q', nomQR, 5, M.profil('Ryze', 18, [4633], { fenetre: 10, sansPassifs: true }), gros);
vrai('l\'amplification atteint bien les dégâts d\'un sort', qAmp.subis > qNu.subis,
     qNu.subis + ' → ' + qAmp.subis + ' subis');
vrai('  et elle est tracée dans le résultat', qAmp.amplification &&
     qAmp.amplification.detail.some(d => /failles/.test(d.objet)));

console.log('\n── Réduction des résistances : ni pénétration, ni amplification');
/* Cinquième catégorie. Le Couperet noir était jusqu'ici écarté au motif qu'il « agit
   sur la mitigation, pas comme dégâts ajoutés » — c'était vrai, et c'était justement
   une raison de le brancher, pas de l'ignorer : `resistEffective` sait traiter une
   réduction depuis le début. */
const tanky = M.cibleChampion('Sion', 18, [3068, 3143]);
const cleaver = M.profil('Jhin', 18, [3071], { fenetre: 10 });
const redC = I.reductionResistances(cleaver);
verifie('Couperet noir : 6 % × 5 cumuls = 30 % d\'armure en moins', redC.armurePct, 0.3, 0.0001);
/* Le fichier porte un `RangedMod: 0.5` qui NE concerne pas le découpage : il modifie la
   vitesse de déplacement de Ferveur (`MSBonusSplit`, facteurDistance 0,5). Jhin est à
   distance — si on l'avait appliqué au découpage, on lirait 15 %. */
vrai('  et il n\'est PAS réduit de moitié à distance', cleaver.distance === true && redC.armurePct === 0.3);
verifie('Malédiction du sanguinaire : 7,5 % × 4 cumuls de RM',
        I.reductionResistances(M.profil('Ryze', 18, [8010], { fenetre: 10 })).rmPct, 0.3, 0.0001);

/* Malfaisance réduit la RM d'un montant PLAT de 10 — pas de 10 %. Le wiki tranche
   (« reduces their magic resistance by 10 ») et le calcul du fichier donne bien 10.
   Sur une cible à 100 de RM, la lire en pourcentage la diviserait par dix. */
const malf = M.profil('Ryze', 18, [3118], { fenetre: 10 });
verifie('Malfaisance : réduction PLATE de 10 de résistance magique',
        I.reductionResistances(malf, { ultimeLance: true }).rmPlate, 10, 0.0001);
vrai('  et zéro tant que l\'ultime n\'est pas déclaré touché',
     /ultime/.test(I.reductionResistances(malf).refus.join(' ')));

/* LA raison pour laquelle réduction et pénétration ne sont pas interchangeables : la
   séquence officielle place la réduction PLATE en premier et la pénétration plate en
   DERNIER, plancher à zéro. Sur une cible peu résistante, l'écart est net. */
verifie('la réduction plate s\'applique avant la pénétration en %',
        M.resistEffective(30, { reducPlate: 10, penPct: 0.3 }), 14, 0.001);
verifie('  la prendre pour de la pénétration plate donnerait autre chose',
        M.resistEffective(30, { penPct: 0.3, penPlate: 10 }), 11, 0.001);

/* Bout en bout : la réduction doit vraiment atteindre les dégâts, et se composer avec
   la pénétration du même build.

   ⚠ Cet exemple utilisait d'abord Couperet noir + Salutations de Dominik. Le contrôle
   de légalité a montré que ce build est IMPOSSIBLE : les deux objets appartiennent au
   groupe `LastWhisper` (« Fatality » dans la boutique), limité à un seul. Et ce n'est
   pas un hasard de paire — TOUS les objets à pénétration d'armure en pourcentage sont
   dans ce groupe, Couperet compris. Réduction en % et pénétration en % ne peuvent donc
   jamais coexister via l'équipement.
   La composition réelle à vérifier est donc réduction + LÉTALITÉ, qui est aussi le cas
   le plus non-commutatif : la létalité s'applique en dernier, avec plancher à zéro. */
const brut = 1000;
const avecC = M.mitiger(brut, 'physique', tanky, M.profil('Jhin', 18, [3071, 3142], { fenetre: 10 }), 'attaque');
const sansC = M.mitiger(brut, 'physique', tanky, M.profil('Jhin', 18, [3142], { fenetre: 10 }), 'attaque');
vrai('le Couperet noir augmente les dégâts réellement subis',
     avecC.subis > sansC.subis,
     Math.round(sansC.subis) + ' → ' + Math.round(avecC.subis) + ' sur ' + brut + ' bruts');
const letalite = M.profil('Jhin', 18, [3142], { fenetre: 10 }).letalite;
verifie('  et la résistance effective suit la séquence officielle',
        avecC.resistEff,
        M.resistEffective(tanky.armure, { reducPct: 0.3, penPlate: letalite }), 0.01);
vrai('  ce build-ci est bien achetable, contrairement au précédent',
     require('./40_legalite').buildLegal([3071, 3142]).legal &&
     !require('./40_legalite').buildLegal([3071, 3036]).legal);

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
let confirmes = 0, fantomes = [], sansNombre = [], echecs = [], sansMotif = [];
Object.keys(I.MODELES).map(Number).forEach(id => {
  const m = I.MODELES[id];
  if (m.nonApplique) return;
  const o = items.find(x => x.id === id);
  /* Fenêtre de 10 s : sans elle, les passifs conditionnels dans le temps (Jak'Sho
     s'arme après 5 s de combat) se refusent à juste titre, et ce contrôle-ci les
     compterait comme des échecs de modélisation. */
  const e = I.evaluerPassif(id, ref, cible, { fenetre: 10 });
  if (!e.ok) { echecs.push(o.nom + ' : ' + e.raison); return; }
  /* Non-application DELIBEREE : les amplifications conditionnees a une hypothese
     (distance a la cible, immobilisation infligee) refusent tant que l'appelant ne
     fournit pas le fait manquant. Ce n'est pas une panne de modelisation — mais pour
     que cette porte ne devienne pas une echappatoire, on exige que le refus porte un
     MOTIF. Un `applique: false` muet serait pire qu'un echec : invisible. */
  if (e.applique === false) {
    if (!e.raison) sansMotif.push(o.nom);
    return;
  }

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
vrai('  et toute non-application délibérée porte son motif', sansMotif.length === 0,
     sansMotif.join(' | '));

/* Les amplifications SOUS HYPOTHÈSE refusent sans hypothèse et servent avec : il faut
   vérifier les DEUX moitiés, sinon « refuse toujours » passerait le contrôle ci-dessus
   sans rien faire du tout. */
const ampliCible = M.cibleChampion('Sion', 18, []);
const pAmpli = M.profil('Caitlyn', 18, [2523, 4005], { fenetre: 10 });
const sansHyp = I.amplification(pAmpli, ampliCible, 'physique', 'attaque', { fenetre: 10 });
verifie('sans hypothèse, aucune amplification conditionnelle n\'est servie', sansHyp.total, 0);
vrai('  et le refus NOMME la donnée qui la débloquerait',
     sansHyp.refus.length > 0 && sansHyp.refus.every(r => r.indexOf('hypotheses.') >= 0),
     sansHyp.refus[0] || '');

const avecHyp = I.amplification(pAmpli, ampliCible, 'physique', 'attaque',
  { fenetre: 10, hypotheses: { distanceCible: 500, immobilisations: 1 } });
/* Grossissement au MAXIMUM de portée (500 unités) : 10 %. Commande : 7 %. Les
   amplifications se cumulent ADDITIVEMENT — 17 %, et non 1,10 × 1,07 = 17,7 %. */
verifie('à 500 unités et avec une immobilisation : +17 % (additif)', avecHyp.total, 0.17, 0.001);
/* Contre-test : la même paire à bout portant. Grossissement est PROPORTIONNEL à la
   distance — le servir au plafond quelle que soit la position aurait donné 17 % ici
   aussi, et c'est exactement l'erreur que l'hypothèse évite. */
const bout = I.amplification(pAmpli, ampliCible, 'physique', 'attaque',
  { fenetre: 10, hypotheses: { distanceCible: 100, immobilisations: 1 } });
verifie('  à 100 unités, Grossissement ne vaut plus que 2 % : total +9 %', bout.total, 0.09, 0.001);
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

/* ── Les variantes « à distance », déclarées puis recoupées ───────────────────────
   Le facteur qui réduit un passif sur un champion à distance était DÉCLARÉ à la main,
   par lecture de la boutique. Le fichier le porte aussi, sur le calcul lui-même
   (`mRangedMultiplier`) — mais il le référençait souvent par une empreinte hachée, que
   le résolveur refusait de traduire ; les deux sources ne pouvaient donc pas se
   confronter. Depuis que les empreintes se résolvent, elles le peuvent : ce test-ci
   exige qu'elles disent le MÊME nombre.

   Ce n'est pas une redondance : deux chemins sans rapport (le texte de la boutique et
   la formule du moteur de jeu) qui tombent sur la même valeur, c'est une preuve ; et
   le jour où Riot change l'un des deux, le désaccord se voit ici au lieu de passer. */
console.log('\n── Facteurs « à distance » : déclaration contre fichier');
let recoupes = 0;
Object.entries(I.MODELES).forEach(([id, m]) => {
  if (!m || !m.distance || !m.distance.facteur || !m.calcul) return;
  const o = I.parId[id]; if (!o) return;
  const declare = (o.valeurs || {})[m.distance.facteur];
  const c0 = (o.calculs[m.calcul] || {}).termes || [];
  const fichier = c0.length ? c0[0].facteurDistance : null;
  if (declare == null || fichier == null) return;
  recoupes++;
  verifie(o.nom + ' : le facteur déclaré (' + m.distance.facteur + ') est celui du fichier',
          fichier, declare, 1e-6);
});
vrai('  au moins un facteur « à distance » a pu être recoupé', recoupes >= 1);

/* Contre-test de l'empreinte elle-même. Si `empreinteFNV` dérivait, les DataValues
   hachées redeviendraient introuvables sans que rien d'autre ne le signale — les
   objets concernés retomberaient simplement sur « valeur absente ». */
const eclipse = I.parId[6692];
vrai('l\'Éclipse résout ses quatre DataValues référencées par empreinte',
     ['{d02ea590}', 'MaxHealthDamageCalc'].every(k => (eclipse.calculs[k] || {}).termes),
     '→ RangedShieldMult, MeleeBonusADShieldRatio, RangedPercMaxHPMult, MeleePercMaxHP');
vrai('  et plus aucun objet ne se plaint d\'une DataValue absente',
     !require('./items.json').some(o => o.alertes.some(a => /DataValue absent/.test(a))));

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
