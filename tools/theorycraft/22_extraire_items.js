/* Extrait les objets → items.json.

   Trois sources, chacune pour ce qu'elle sait faire :
     — items.bin.json (script du jeu) : les STATS et les PASSIFS chiffrés. C'est la
       seule source qui donne l'accélération de compétence et la létalité, que Data
       Dragon omet purement et simplement.
     — item.json de Data Dragon : la CARTE (le fichier de jeu mélange Faille, Arena
       et TFT), le prix cumulé et l'arbre de construction.
     — items.json du client en fr_fr : le libellé français.

   Périmètre : achetable sur la Faille (carte 11). Proposer un objet d'Arena dans un
   build de partie classée serait une faute grossière. */
const fs = require('fs');
const path = require('path');
const bin = require('./items.bin.json');
const dd = require('./items_dd.json').data;
const fr = require('./items_fr.json');
const { creerContexteObjet, resoudreCalcul, resoudreConditionnel } = require('./03_resolveur');

const nomFr = {};
fr.forEach(x => { nomFr[x.id] = x.name; });

/* Les stats vivent dans des champs plats aux noms internes. On les traduit une par
   une — aucune déduction : un champ non listé ici est signalé, jamais deviné.
   `pct: true` = valeur stockée en fraction (0,25 = 25 %), comme pour les runes où la
   confusion coûtait un facteur 100. */
const STATS_PLATES = {
  mFlatPhysicalDamageMod:        { cle: 'ad',            libelle: 'Dégâts d\'attaque' },
  mFlatMagicDamageMod:           { cle: 'ap',            libelle: 'Puissance' },
  mFlatHPPoolMod:                { cle: 'pv',            libelle: 'Points de vie' },
  flatMPPoolMod:                 { cle: 'mana',          libelle: 'Mana' },
  mFlatArmorMod:                 { cle: 'armure',        libelle: 'Armure' },
  mFlatSpellBlockMod:            { cle: 'rm',            libelle: 'Résistance magique' },
  mAbilityHasteMod:              { cle: 'accel',         libelle: 'Accélération de compétence' },
  PhysicalLethality:             { cle: 'letalite',      libelle: 'Létalité' },
  mFlatMagicPenetrationMod:      { cle: 'penMagiquePlat', libelle: 'Pénétration magique' },
  mFlatMovementSpeedMod:         { cle: 'vdPlate',       libelle: 'Vitesse de déplacement' },
  mFlatCritChanceMod:            { cle: 'crit',          libelle: 'Chances de coup critique', pct: true },
  mFlatCritDamageMod:            { cle: 'degatsCrit',    libelle: 'Dégâts de coup critique', pct: true },
  mPercentAttackSpeedMod:        { cle: 'vitesseAttaque', libelle: 'Vitesse d\'attaque', pct: true },
  mPercentMovementSpeedMod:      { cle: 'vd',            libelle: 'Vitesse de déplacement', pct: true },
  mPercentLifeStealMod:          { cle: 'volVie',        libelle: 'Vol de vie', pct: true },
  PercentOmnivampMod:            { cle: 'omnivamp',      libelle: 'Omnivampirisme', pct: true },
  mPercentHealingAmountMod:      { cle: 'soinsEtBoucliers', libelle: 'Soins et boucliers', pct: true },
  mPercentArmorPenetrationMod:   { cle: 'penArmure',     libelle: 'Pénétration d\'armure', pct: true },
  mPercentMagicPenetrationMod:   { cle: 'penMagique',    libelle: 'Pénétration magique', pct: true },
  mPercentTenacityItemMod:       { cle: 'tenacite',      libelle: 'Ténacité', pct: true },
  mPercentSlowResistMod:         { cle: 'resistRalent',  libelle: 'Résistance aux ralentissements', pct: true },
  mFlatHPRegenMod:               { cle: 'regenPV',       libelle: 'Régénération de vie' },
  mPercentBaseHPRegenMod:        { cle: 'regenPVpct',    libelle: 'Régénération de vie (%)', pct: true },
  flatMPRegenMod:                { cle: 'regenMana',     libelle: 'Régénération de mana' },
  percentBaseMPRegenMod:         { cle: 'regenManapct',  libelle: 'Régénération de mana (%)', pct: true },
  mFlatAttackRangeMod:           { cle: 'portee',        libelle: 'Portée d\'attaque' },
  mFlatArmorPenetrationMod:      { cle: 'penArmurePlate', libelle: 'Pénétration d\'armure' }
};

// Index du fichier de jeu par identifiant numérique
const parId = {};
Object.keys(bin).forEach(k => {
  const e = bin[k];
  if (e && e.__type === 'ItemData' && e.itemID != null) parId[e.itemID] = e;
});

/* Faille de l'invocateur uniquement, et réellement achetable.

   ⚠ `maps['11']` NE SUFFIT PAS : Riot marque aussi « carte 11 » les doublons d'Arena
   (Nécrophage, Épée du divin…), qui parlent de « fin de manche » et n'existent pas en
   partie classée. Ces doublons portent un identifiant à SIX chiffres bâti sur l'objet
   d'origine — 323070 pour la Larme 3070, 663064 pour 3064. Aucun objet de la Faille
   n'a jamais dépassé quatre chiffres, d'où le seuil.
   Le critère `maps['35']`, lui, était à écarter : il excluait 77 objets parfaitement
   légitimes (bottes, objets de Doran, potions, balises). */
const idsSR = Object.keys(dd).filter(i => {
  const d = dd[i];
  return d.maps && d.maps['11'] && d.gold && d.gold.purchasable && d.inStore !== false
         && Number(i) < 100000;
}).map(Number);

const alertesGlobales = {};
const sortie = [];

idsSR.forEach(id => {
  const b = parId[id];
  const d = dd[String(id)];
  if (!b) { (alertesGlobales['absent du fichier de jeu'] =
             alertesGlobales['absent du fichier de jeu'] || []).push(id); return; }

  // Statistiques
  const stats = {};
  const champsInconnus = [];
  Object.keys(b).forEach(champ => {
    /* Le filtre doit couvrir TOUS les préfixes employés par Riot. Il en manquait un
       — `mAbilityHasteMod` — et l'accélération de compétence, précisément la stat que
       Data Dragon n'expose pas, ressortait donc vide sur les 227 objets concernés. */
    if (!/^(m?(Flat|Percent|AbilityHaste)|PhysicalLethality|PercentOmnivamp|flatMP|percentBase)/.test(champ)) return;
    const t = STATS_PLATES[champ];
    if (!t) { champsInconnus.push(champ); return; }
    let v = b[champ];
    if (typeof v !== 'number' || !v) return;
    // arrondi : les flottants du jeu traînent des 0,30000001192092896
    stats[t.cle] = { valeur: Math.round(v * (t.pct ? 1000 : 100)) / (t.pct ? 1000 : 100),
                     libelle: t.libelle, pourcent: !!t.pct };
  });
  champsInconnus.forEach(c =>
    (alertesGlobales['champ de stat non traduit: ' + c] =
     alertesGlobales['champ de stat non traduit: ' + c] || []).push(id));

  // Passifs chiffrés
  const ctx = creerContexteObjet(b);
  const alertes = new Set();
  const calculs = {};
  Object.keys(ctx.calc).forEach(nom => {
    const cond = resoudreConditionnel(nom, ctx, alertes, 1);
    if (cond) {
      const dft = cond.defaut && cond.defaut[1];
      const alt = cond.siCondition && cond.siCondition[1];
      if (dft || alt) calculs[nom] = { conditionnel: true, condition: cond.condition,
                                       defaut: dft, siCondition: alt };
      return;
    }
    const r = resoudreCalcul(nom, ctx, alertes, 1);
    if (r && r[1] && r[1].length) calculs[nom] = { termes: r[1] };
  });

  // Valeurs nommées brutes : indispensables aux passifs que la formule ne couvre pas
  const valeurs = {};
  (b.mDataValues || []).forEach(v => {
    if (v && v.mName) valeurs[v.mName] = Math.round((v.mValue || 0) * 100000) / 100000;
  });

  sortie.push({
    id,
    nom: nomFr[id] || d.name || b.mDeathRecapName || String(id),
    nomInterne: b.mDeathRecapName || null,
    prix: d.gold.total, prixRecette: d.gold.base,
    rarete: b.epicness != null ? b.epicness : null,
    fini: !d.into || !d.into.length,
    composeDe: (d.from || []).map(Number),
    seConstruitEn: (d.into || []).map(Number),
    categories: b.mCategories || [],
    championRequis: b.mRequiredChampion || null,
    niveauRequis: b.mRequiredLevel || null,
    stats,
    valeurs,
    calculs,
    alertes: [...alertes]
  });
});

sortie.sort((a, b) => a.prix - b.prix || a.id - b.id);
fs.writeFileSync(path.join(__dirname, 'items.json'), JSON.stringify(sortie, null, 1));

console.log('Objets retenus (Faille, achetables) : ' + sortie.length);
console.log('  avec au moins une stat  : ' + sortie.filter(x => Object.keys(x.stats).length).length);
console.log('  avec un passif chiffré  : ' + sortie.filter(x => Object.keys(x.calculs).length).length);
console.log('  finis (légendaires)     : ' + sortie.filter(x => x.fini && x.prix >= 2000).length);
console.log('  portant une alerte      : ' + sortie.filter(x => x.alertes.length).length);

const cles = Object.keys(alertesGlobales);
if (cles.length) {
  console.log('\nÀ vérifier :');
  cles.forEach(k => console.log('  ' + k + '  (' + alertesGlobales[k].length + ' objets)'));
}
