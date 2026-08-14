/* Vérifie les stats extraites du fichier de jeu contre DEUX sources indépendantes :

     1. Data Dragon, qui publie ses propres `stats` — deux lectures du même objet
        doivent concorder. C'est le contrôle systématique, sur les 254 objets.
     2. La description française affichée en boutique, pour les stats que Data Dragon
        n'expose PAS du tout (accélération de compétence, létalité). Sans ce second
        contrôle, la moitié de l'intérêt du fichier de jeu serait invérifiable.

   Un test qui ne compare qu'à soi-même ne prouve rien : c'est pour ça qu'aucune
   valeur attendue ici ne vient de items.json. */
const items = require('./items.json');
const dd = require('./items_dd.json').data;
const fr = require('./items_fr.json');

let ok = 0, ko = 0;
function verifie(libelle, obtenu, attendu, tol = 0.001) {
  const bon = obtenu != null && Math.abs(obtenu - attendu) <= tol;
  console.log((bon ? '  OK   ' : '  ÉCHEC') + '  ' + libelle.padEnd(56) +
    'obtenu ' + obtenu + '   attendu ' + attendu);
  bon ? ok++ : ko++;
}
function vrai(libelle, condition, detail = '') {
  console.log((condition ? '  OK   ' : '  ÉCHEC') + '  ' + libelle + (detail ? '  ' + detail : ''));
  condition ? ok++ : ko++;
}

const parId = {};
items.forEach(o => { parId[o.id] = o; });
const descFr = {};
fr.forEach(x => { descFr[x.id] = x.description || ''; });

console.log('── Concordance avec Data Dragon (source indépendante, 254 objets)');
/* Correspondance des noms Data Dragon → nos clés. Data Dragon exprime les
   pourcentages en fraction, comme le fichier de jeu : rien à convertir. */
const PONT = {
  FlatPhysicalDamageMod: 'ad', FlatMagicDamageMod: 'ap', FlatHPPoolMod: 'pv',
  FlatMPPoolMod: 'mana', FlatArmorMod: 'armure', FlatSpellBlockMod: 'rm',
  FlatCritChanceMod: 'crit', PercentAttackSpeedMod: 'vitesseAttaque',
  PercentMovementSpeedMod: 'vd', FlatMovementSpeedMod: 'vdPlate',
  PercentLifeStealMod: 'volVie', FlatHPRegenMod: 'regenPV'
};
let compares = 0, ecarts = [];
items.forEach(o => {
  const s = (dd[String(o.id)] || {}).stats || {};
  Object.entries(PONT).forEach(([kd, kn]) => {
    if (s[kd] == null || !s[kd]) return;
    compares++;
    const mien = o.stats[kn] ? o.stats[kn].valeur : 0;
    if (Math.abs(mien - s[kd]) > 0.002) ecarts.push(o.nom + ' · ' + kn + ' : ' + mien + ' vs ' + s[kd]);
  });
});
vrai(compares + ' valeurs comparées, ' + ecarts.length + ' écart(s)', ecarts.length === 0);
ecarts.slice(0, 12).forEach(e => console.log('       ' + e));

console.log('\n── Stats absentes de Data Dragon, contrôlées sur la description en jeu');
/* Data Dragon n'expose ni l'accélération de compétence ni la létalité. On les
   confronte donc au texte affiché en boutique, qui est rendu indépendamment. */
function texteContient(id, motif) {
  return motif.test(descFr[id].replace(/<[^>]+>/g, ' '));
}
let hasteTestes = 0, hasteFaux = [];
items.forEach(o => {
  if (!o.stats.accel) return;
  hasteTestes++;
  const v = o.stats.accel.valeur;
  if (!texteContient(o.id, new RegExp('\\+?\\s*' + v + '\\s*(d\'|de |)acc', 'i'))) hasteFaux.push(o.nom + ' (' + v + ')');
});
vrai(hasteTestes + ' objets avec accélération, ' + hasteFaux.length + ' non retrouvé(s) dans le texte',
     hasteFaux.length === 0);
hasteFaux.slice(0, 10).forEach(e => console.log('       ' + e));

let lethTestes = 0, lethFaux = [];
items.forEach(o => {
  if (!o.stats.letalite) return;
  lethTestes++;
  // La boutique écrit « 10 létalité », sans le « + » qu'elle met devant les autres stats
  if (!texteContient(o.id, new RegExp('\\+?\\s*' + o.stats.letalite.valeur + '\\s*(de |)létalité', 'i')))
    lethFaux.push(o.nom + ' (' + o.stats.letalite.valeur + ')');
});
vrai(lethTestes + ' objets avec létalité, ' + lethFaux.length + ' non retrouvé(s) dans le texte',
     lethFaux.length === 0);
lethFaux.slice(0, 10).forEach(e => console.log('       ' + e));

console.log('\n── Objets connus, valeur par valeur');
const ie = parId[3031];                                   // Lame d'infini
verifie('Lame d\'infini : dégâts d\'attaque', ie.stats.ad.valeur, 75);
verifie('Lame d\'infini : critique', ie.stats.crit.valeur, 0.25);
verifie('Lame d\'infini : dégâts de critique', ie.stats.degatsCrit.valeur, 0.30);
verifie('Lame d\'infini : prix', ie.prix, 3450, 100);

const botrk = parId[3153];                                // Lame du roi déchu
verifie('Lame du roi déchu : vol de vie', botrk.stats.volVie.valeur, 0.10);
verifie('Lame du roi déchu : % PV max en mêlée', botrk.valeurs.MeleeValue, 0.09);
verifie('Lame du roi déchu : % PV max à distance', botrk.valeurs.RangedValue, 0.06);
verifie('Lame du roi déchu : plafond sur monstres', botrk.valeurs.MonsterDamageCap, 100);

const liandry = parId[6653];                              // Tourment de Liandry
verifie('Liandry : brûlure en % des PV max', liandry.valeurs.BurnPercentHealthDamage, 0.02);
verifie('Liandry : amplification par seconde', liandry.valeurs.DamageIncreasePerSecond, 0.02);
verifie('Liandry : amplification maximale', liandry.valeurs.DamageIncreaseMax, 0.06);

console.log('\n── Croissance par paliers (le piège de la valeur au niveau 1)');
/* Garder seulement la valeur de départ sous-estimait d'un facteur 2 en fin de partie. */
const sb = parId[6673].calculs.ShieldAmount.termes[0];    // Arc-bouclier immortel
verifie('Arc-bouclier : bouclier au niveau 1', sb.valeur, 400);
verifie('Arc-bouclier : bouclier au niveau 18', sb.jusqua, 700);
vrai('Arc-bouclier : les paliers sont conservés, pas seulement les bornes',
     Array.isArray(sb.paliers) && sb.paliers.length > 0,
     JSON.stringify(sb.paliers));

console.log('\n── Formules à deux branches (mêlée / à distance)');
const cr = parId[3153].calculs['{79b6144b}'];
vrai('Lame du roi déchu : la formule porte bien ses deux branches',
     cr && cr.conditionnel === true && cr.condition === 'IsRangedCastRequirement');
verifie('  branche par défaut (mêlée)', cr.defaut[0].valeur, 0.09);
verifie('  branche à distance', cr.siCondition[0].valeur, 0.06);

console.log('\n── Périmètre : rien qui ne soit de la Faille');
const horsSR = items.filter(o => {
  const m = (dd[String(o.id)] || {}).maps || {};
  return !m['11'];
});
vrai('aucun objet hors Faille dans la sortie', horsSR.length === 0,
     horsSR.slice(0, 5).map(x => x.nom).join(', '));
const nonAchetable = items.filter(o => !(dd[String(o.id)] || {}).gold.purchasable);
vrai('aucun objet non achetable', nonAchetable.length === 0);
// Repères connus d'objets d'Arena / de modes éphémères
[223124, 228020, 447118, 667112, 663060].forEach(id =>
  vrai('objet hors Faille absent (' + id + ')', !parId[id]));
/* Contrôle de fond : les objets d'Arena se trahissent par le vocabulaire de leur
   description — on y gagne « jusqu'à la fin de la manche », notion qui n'existe pas
   en partie classée. Aucun ne doit subsister. */
const manche = items.filter(o => /\bmanche\b/i.test((descFr[o.id] || '').replace(/<[^>]+>/g, ' ')));
vrai('aucune description ne parle de « manche » (vocabulaire d\'Arena)', manche.length === 0,
     manche.slice(0, 5).map(x => x.nom).join(', '));

console.log('\n── Cohérence interne');
const sansNom = items.filter(o => !o.nom || /^\d+$/.test(o.nom));
vrai('tous les objets ont un nom français', sansNom.length === 0,
     sansNom.slice(0, 5).map(x => x.id).join(', '));
const prixIncoherent = items.filter(o => o.composeDe.length &&
  o.prix < o.composeDe.reduce((s, i) => s + ((dd[String(i)] || { gold: {} }).gold.total || 0), 0) * 0.5);
vrai('le prix total dépasse toujours la moitié des composants', prixIncoherent.length === 0);

/* ── L'empreinte des noms de DataValues ──────────────────────────────────────────
   Quand l'outil d'extraction ne retrouve pas le nom d'une DataValue, le fichier la
   référence par son empreinte FNV-1a 32 bits, calculée sur le nom en MINUSCULES.

   Ce n'est pas une convention supposée : l'Éclipse liste ses DataValues en clair et
   les réclame sous quatre empreintes. Les quatre concordent, dans le même objet. Une
   collision fortuite sur 32 bits a une chance sur quatre milliards ; quatre d'affilée,
   aucune. Ce test fige l'algorithme — variante, casse ou graine comprises — parce
   qu'une empreinte qui dérive ne casse rien bruyamment : elle fait simplement
   redisparaître les valeurs, comme avant.

   Le contre-test compte autant que le test : la MAJUSCULE ne doit PAS donner la même
   empreinte, sinon on ne prouverait rien sur la casse. */
console.log('\n── Empreinte FNV-1a des noms de DataValues');
const { empreinteFNV } = require('./03_resolveur');
[['rangedshieldmult', '{51df2a01}'],
 ['melebonusadshieldratio_faux', null],
 ['meleebonusadshieldratio', '{e367e801}'],
 ['rangedpercmaxhpmult', '{4b5548be}'],
 ['meleepercmaxhp', '{b1f09313}']].forEach(([nom, attendu]) => {
  if (!attendu) return;
  vrai('« ' + nom +' » → ' + attendu, empreinteFNV(nom) === attendu, empreinteFNV(nom));
});
vrai('  la casse compte : la majuscule donne une AUTRE empreinte',
     empreinteFNV('MeleePercMaxHP') !== '{b1f09313}');

console.log('\n═══ ' + ok + ' réussis, ' + ko + ' échoués ═══');
process.exit(ko ? 1 : 0);
