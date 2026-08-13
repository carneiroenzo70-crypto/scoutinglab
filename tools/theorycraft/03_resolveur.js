/* Résolveur des formules de sorts du fichier de jeu.
   Une formule Riot est un arbre de « parts » typées. On l'aplatit en une somme de
   termes : { stat, mode, valeurs[par rang] }, où stat vaut 'flat' (dégâts de base)
   ou une caractéristique (AD, AP, PV…), et mode indique base/bonus/total.

   On ne devine rien : une part de type inconnu est signalée, jamais approximée —
   un calculateur qui invente un ratio est pire qu'un calculateur absent. */

/* Index dans les tableaux `values` : l'index 0 est un rang 0 factice, les rangs réels
   commencent à 1. Le nombre de rangs dépend du sort — 5 pour Q/W/E, 3 pour un ultime.
   Les fichiers stockent 7 entrées et extrapolent au-delà du rang maximum : lire 5 rangs
   sur un ultime produirait deux valeurs qui n'existent pas en jeu. */
const RANGS = [1, 2, 3, 4, 5];
const rangsDe = n => [1, 2, 3, 4, 5].slice(0, n || 5);

/* Correspondance mStat → caractéristique.

   ⚠ Cette table a été FAUSSE sur six index. Écrite de mémoire, elle ne cassait rien :
   elle donnait des chiffres faux (mStat 9 lu « PV » alors qu'il vaut « bonus de dégâts
   critiques » — sur Ashe, Caitlyn, Lucian, Miss Fortune) ou faisait refuser des sorts
   en silence (mStat 12 lu « Mana » alors qu'il vaut « PV max » — l'Hydre titanesque).

   Elle est maintenant dérivée des DONNÉES, par `29_sonde_statmap.js` : les noms de
   DataValues sont auto-documentés, et regrouper les noms observés par index donne la
   correspondance sans rien deviner. La preuve de chaque entrée est en commentaire.

   RÈGLE : un index sans preuve reste NON MAPPÉ. Le résolveur le signale et refuse le
   calcul. Mieux vaut un sort absent qu'un sort faux. */
const STATS = {
  0:  'AP',                  // APRatio(95), ShieldAPRatio, HealAPRatio, NashorsAPValue
  1:  'Armure',              // BonusArmorDamageRatio, MeleeOnHitARRatio, BraumArmorPercent
  2:  'AD',                  // ADRatio(34), BonusADRatio, SpellbladeMultiplier, SheenMult
  4:  'VitesseAttaque',      // ASCoeff, HealthPerAS, AStoADChampion
  6:  'RM',                  // MRRatio, BonusMRRatio, PassiveResistPercent
  7:  'VitesseDeplacement',  // MSAdaptiveRatio, DashSpeedRatio, DashSpeedMod
  8:  'Crit',                // CritRatio, CritChanceMultiplier, CritChanceAmp
  9:  'DegatsCrit',          // CritDamage, TotalDamageCrit, HeadShotBonusDamage
  12: 'PV',                  // BonusHealthRatio, ShieldHealthRatio, MaxStackDamageHPRatio
  13: 'PVactuelsCible',      // Lame du roi déchu : % des PV ACTUELS de la cible (wiki : « current health »)
  18: 'VolVie',              // Omnivamp_LifeStealScaling
  /* Létalité. N'apparaît que sur des objets à létalité (Arc axiomatique, Glaive
     d'ombre, Briseur de bastion, Rancune de Serylda) et toujours dans un passif que
     la boutique dit dépendre d'elle. Preuve décisive : le wiki décrit le passif RETIRÉ
     de Serylda comme « 25 % + 0,11 % PAR POINT DE LÉTALITÉ » — exactement la forme de
     `PenCalc`, encore présent dans le fichier. */
  29: 'Letalite',
  /* Portée d'attaque. Sert à distinguer mêlée et distance : le Gage de Sterak borne
     0,01 × portée entre 2 et 3 (125 → 2 en mêlée, 550 → 3 à distance). */
  31: 'Portee',
  34: 'Accel'                // ASPerHS (vitesse d'attaque par point d'accélération)
  /* Non mappés, faute de preuve — chacun n'apparaît qu'une ou deux fois, sans nom de
     DataValue pour les identifier : 3, 5, 10 (Jhin), 11, 14, 15, 16 (Olaf), 19, 20,
     21, 30. Le résolveur les signale plutôt que de les supposer. */
};
/* Base, bonus ou total ? Cette table-ci était PERMUTÉE — la même erreur que STATS, et
   au moins aussi coûteuse : le Fléau de liche ressortait à « 75 % de l'AD bonus » quand
   le wiki dit « 75 % de l'AD de BASE ». Sur un mage sans dégâts d'attaque bonus, la
   lame enchantée tombait à zéro ; sur un combattant elle explosait.

   Dérivée des noms de DataValues (cf. 29_sonde_statmap.js), qui tranchent sans
   ambiguïté — trois familles de noms, trois index distincts :
     0 → TotalADRatio, APRatio          (total)
     1 → BaseADRatio, SpellbladeMultiplier, SheenMult, HealBaseADRatio   (base)
     2 → BonusADRatio, BonusHealthRatio, BonusResist, MeleeBonusADRatio  (bonus)
   Recoupé sur le wiki : la Force de la trinité inflige « 200 % de l'AD de base ». */
const MODES = { 0: 'total', 1: 'base', 2: 'bonus' };

/* Les noms de DataValues ne sont pas cohérents en casse dans les fichiers de Riot :
   une formule référence « rAPCoefficient » quand la définition s'appelle parfois
   « rAPcoefficient », « BaseApRatio » vs « BaseAPRatio »… Une comparaison stricte
   perdait des sorts entiers (l'ultime d'Ahri). On indexe donc en minuscules. */
function creerContexte(spell) {
  const dv = {};
  (spell.DataValues || []).forEach(v => {
    if (v && v.name) dv[String(v.name).toLowerCase()] = v.values || [];
  });
  const eff = (spell.mEffectAmount || []).map(e => (e && e.value) || []);
  return { dv, eff, calc: spell.mSpellCalculations || {} };
}
const lireDV = (ctx, nom) => ctx.dv[String(nom).toLowerCase()];

/* Valeur d'une croissance par paliers au niveau demandé.
   Chaque niveau franchi ajoute le gain du palier en vigueur à ce niveau-là
   (« +7 par niveau à partir du 10 » = rien avant le 10, puis 7 par niveau du 10 au 18). */
function valeurParPaliers(base, paliers, niveau) {
  let v = base;
  for (let n = 2; n <= Math.max(1, Math.min(18, niveau)); n++) {
    let gain = 0;
    for (const p of paliers) if (n >= p.niveau) gain = p.parNiveau;
    v += gain;
  }
  return Math.round(v * 1000) / 1000;
}

// Évalue une part pour un rang donné. Renvoie {n} (nombre) ou {termes:[…]}.
function evalPart(p, ctx, rang, prof, alertes) {
  if (!p || prof > 12) return null;
  const t = p.__type;

  switch (t) {
    case 'NumberCalculationPart':
      return { n: p.mNumber || 0 };

    case 'NamedDataValueCalculationPart': {
      const a = lireDV(ctx, p.mDataValue);
      if (!a) { alertes.add('DataValue absent: ' + p.mDataValue); return null; }
      return { n: a[rang] != null ? a[rang] : a[a.length - 1] };
    }

    case 'EffectValueCalculationPart': {
      const a = ctx.eff[(p.mEffectIndex || 1) - 1];
      if (!a) { alertes.add('EffectValue absent: ' + p.mEffectIndex); return null; }
      return { n: a[rang] != null ? a[rang] : a[a.length - 1] };
    }

    case 'ProductOfSubPartsCalculationPart': {
      const a = evalPart(p.mPart1, ctx, rang, prof + 1, alertes);
      const b = evalPart(p.mPart2, ctx, rang, prof + 1, alertes);
      if (!a || !b) return null;
      if (a.n != null && b.n != null) return { n: a.n * b.n };
      // produit d'un scalaire par des termes : on met à l'échelle
      const [sc, tr] = a.n != null ? [a.n, b] : [b.n, a];
      if (sc == null || !tr.termes) return null;
      return { termes: tr.termes.map(x => ({ ...x, valeur: x.valeur * sc })) };
    }

    case 'SumOfSubPartsCalculationPart': {
      const parts = (p.mSubparts || []).map(x => evalPart(x, ctx, rang, prof + 1, alertes));
      if (parts.some(x => !x)) return null;
      let n = 0; const termes = [];
      parts.forEach(x => { if (x.n != null) n += x.n; else termes.push(...x.termes); });
      if (n) termes.push({ stat: 'flat', mode: 'flat', valeur: n });
      return { termes };
    }

    case 'StatBySubPartCalculationPart':
    case 'StatByCoefficientCalculationPart':
    case 'StatByNamedDataValueCalculationPart': {
      let coef = null;
      if (t === 'StatByCoefficientCalculationPart') coef = { n: p.mCoefficient || 0 };
      else if (t === 'StatByNamedDataValueCalculationPart') {
        const a = lireDV(ctx, p.mDataValue);
        if (!a) { alertes.add('DataValue absent: ' + p.mDataValue); return null; }
        coef = { n: a[rang] != null ? a[rang] : a[a.length - 1] };
      } else coef = evalPart(p.mSubpart, ctx, rang, prof + 1, alertes);
      if (!coef) return null;

      /* Index non prouvé = refus. Le mapper au hasard produirait un chiffre plausible
         et faux — c'est exactement ce qui est arrivé avec mStat 9. */
      const stat = STATS[p.mStat || 0];
      if (!stat) { alertes.add('mStat non identifié : ' + p.mStat); return null; }
      const mode = MODES[p.mStatFormula || 0] || 'base';

      /* Coefficient SCALAIRE : le cas courant, « 0,8 × puissance ». */
      if (coef.n != null) return { termes: [{ stat, mode, valeur: coef.n }] };

      /* Coefficient qui porte lui-même des STATS : la formule n'est plus linéaire.
         Le W de Twisted Fate en est l'exemple type —
             chance de critique × (0,575 × (base + AD + AP))
         — et il y en a d'autres. Ce cas retournait `null` SANS ALERTE : les six
         calculs de la Carte bleue disparaissaient donc en silence, et le sort passait
         pour « sans dégâts » alors que son infobulle en annonce.

         On le représente par un terme PRODUIT : la stat multiplie la somme de
         sous-termes, que `valeurTerme` évalue récursivement. Linéariser aurait été
         faux ; refuser aurait perdu le sort. */
      if (coef.termes && coef.termes.length)
        return { termes: [{ stat, mode, valeur: 1, facteurTermes: coef.termes }] };

      alertes.add('coefficient non évaluable pour ' + stat);
      return null;
    }

    case 'ByCharLevelInterpolationCalculationPart':
      // valeur qui évolue du niveau 1 au 18 : on garde les deux bornes
      return { termes: [{ stat: 'flat', mode: 'parNiveau', valeur: p.mStartValue || 0,
                          jusqua: p.mEndValue || 0 }] };

    /* Croissance par paliers : une valeur de départ, puis un gain par niveau qui
       change à certains seuils (« +7 par niveau à partir du 10 »). Ne garder que la
       valeur au niveau 1 revenait à sous-estimer d'un facteur 2 à 3 en fin de partie —
       le bouclier de l'Arc-bouclier immortel, par exemple. */
    case 'ByCharLevelBreakpointsCalculationPart': {
      const paliers = (p.mBreakpoints || []).map(b => ({
        niveau: b.mLevel || 1,
        parNiveau: b.mBonusPerLevelAtAndAfter != null ? b.mBonusPerLevelAtAndAfter : 0
      })).sort((a, b) => a.niveau - b.niveau);
      return { termes: [{ stat: 'flat', mode: 'parNiveau', valeur: p.mLevel1Value || 0,
                          jusqua: valeurParPaliers(p.mLevel1Value || 0, paliers, 18),
                          paliers }] };
    }

    /* Scaling sur la ressource (mana max). Indispensable pour Ryze, 1er pick Mid,
       dont les quatre sorts en dépendent — sans ce type il ressortait vide. */
    case 'AbilityResourceByCoefficientCalculationPart': {
      const c = p.mCoefficient != null ? p.mCoefficient
              : (p.mDataValue ? (lireDV(ctx, p.mDataValue) || [])[rang] : null);
      if (c == null) { alertes.add('ressource sans coefficient'); return null; }
      // index 0 = mana ; les autres ressources (énergie, fureur) restent signalées
      if ((p.mAbilityResourceIndex || 0) !== 0) {
        alertes.add('ressource non-mana (index ' + p.mAbilityResourceIndex + ')');
        return null;
      }
      return { termes: [{ stat: 'Mana', mode: 'total', valeur: c }] };
    }

    /* Valeur bornée (min/max). On résout l'intérieur et on signale la borne : mieux
       vaut une valeur juste hors bornes extrêmes qu'un sort absent du calculateur. */
    case 'ClampSubPartsCalculationPart': {
      const inner = evalPart(p.mSubpart || (p.mSubparts || [])[0], ctx, rang, prof + 1, alertes);
      if (!inner) return null;
      alertes.add('valeur bornée (min/max non appliqué)');
      return inner;
    }

    /* Valeur proportionnelle au nombre de cumuls d'un effet (Sceptre de Mejai,
       Lame noire…). Le nom du buff est souvent haché : on garde le terme « par
       cumul » et c'est l'appelant qui fournira le nombre de cumuls. */
    case 'BuffCounterByCoefficientCalculationPart':
    case 'BuffCounterByNamedDataValueCalculationPart': {
      let c;
      if (t === 'BuffCounterByCoefficientCalculationPart') c = p.mCoefficient || 0;
      else {
        const a = lireDV(ctx, p.mDataValue);
        if (!a) { alertes.add('DataValue absent: ' + p.mDataValue); return null; }
        c = a[rang] != null ? a[rang] : a[a.length - 1];
      }
      return { termes: [{ stat: 'Cumuls', mode: 'total', valeur: c, buff: p.mBuffName || null }] };
    }

    /* Valeur proportionnelle au nombre d'objets d'une rareté donnée déjà possédés
       (« +X par objet légendaire »). epicness 5 = légendaire. */
    case 'ByItemEpicnessCountCalculationPart':
      return { termes: [{ stat: 'NbObjets', mode: 'total',
                          valeur: p.Coefficient != null ? p.Coefficient : 1,
                          rarete: p.epicness != null ? p.epicness : 5 }] };

    /* Renvoi vers un AUTRE calcul du même objet, désigné par son nom. Riot s'en sert
       pour ne pas dupliquer une formule (Terminus réutilise son `OnHitDamage`).
       Le nom du type est haché ; c'est son unique champ, `mSpellCalculationKey`, qui
       l'identifie sans ambiguïté. */
    case '{f3cbe7b2}': {
      const vise = ctx.calc[p.mSpellCalculationKey];
      if (!vise) { alertes.add('renvoi vers un calcul absent : ' + p.mSpellCalculationKey); return null; }
      const termes = [];
      let ok = true;
      (vise.mFormulaParts || []).forEach(sp => {
        const v = evalPart(sp, ctx, rang, prof + 1, alertes);
        if (!v) { ok = false; return; }
        if (v.n != null) termes.push({ stat: 'flat', mode: 'flat', valeur: v.n });
        else termes.push(...v.termes);
      });
      return ok ? { termes } : null;
    }

    default:
      alertes.add('type inconnu: ' + t);
      return null;
  }
}

// Résout une GameCalculation nommée en une liste de termes par rang.
function resoudreCalcul(nom, ctx, alertes, nbRangs = 5, prof = 0) {
  const c = ctx.calc[nom];
  if (!c || prof > 5) return null;
  const RANGS = rangsDe(nbRangs);

  /* Formule à deux branches selon une condition de jeu — presque toujours
     mêlée/distance sur les objets (Lame du roi déchu, Lame noire). On renvoie ici
     la branche par défaut ; `resoudreConditionnel` donne les deux, pour qui veut
     distinguer. Rendre la branche par défaut à un champion à distance serait un
     contresens silencieux, d'où l'alerte. */
  if (c.__type === 'GameCalculationConditional') {
    alertes.add('formule conditionnelle (' +
      ((c.mConditionalCalculationRequirements || {}).__type || 'condition inconnue') + ')');
    return resoudreCalcul(c.mDefaultGameCalculation, ctx, alertes, nbRangs, prof + 1);
  }

  if (c.__type === 'GameCalculationModified') {
    const base = resoudreCalcul(c.mModifiedGameCalculation, ctx, alertes, nbRangs, prof + 1);
    if (!base) return null;
    const parRang = {};
    RANGS.forEach(r => {
      const m = evalPart(c.mMultiplier, ctx, r, 0, alertes);
      if (!m || m.n == null || !base[r]) { parRang[r] = null; return; }
      parRang[r] = base[r].map(x => ({ ...x, valeur: x.valeur * m.n }));
    });
    return parRang;
  }

  /* Multiplicateur « à distance » porté par le calcul lui-même (et non par une branche
     conditionnelle). L'Hydre titanesque et l'Hydre profane l'utilisent : un champion à
     distance n'obtient que la moitié de l'effet. L'ignorer surestimait ces objets sur
     tous les champions à distance. */
  let facteurDistance = null;
  if (c.mRangedMultiplier) {
    const m = evalPart(c.mRangedMultiplier, ctx, 1, 0, alertes);
    if (m && m.n != null) facteurDistance = m.n;
  }

  const parRang = {};
  RANGS.forEach(r => {
    const termes = [];
    let ok = true;
    (c.mFormulaParts || []).forEach(p => {
      const v = evalPart(p, ctx, r, 0, alertes);
      if (!v) { ok = false; return; }
      if (v.n != null) termes.push({ stat: 'flat', mode: 'flat', valeur: v.n });
      else termes.push(...v.termes);
    });
    if (ok && facteurDistance != null) termes.forEach(t => { t.facteurDistance = facteurDistance; });
    parRang[r] = ok ? termes : null;
  });
  return parRang;
}

/* Les deux branches d'une formule conditionnelle, quand la distinction compte.
   Renvoie null si la formule n'est pas conditionnelle — au caller de retomber sur
   `resoudreCalcul`. */
function resoudreConditionnel(nom, ctx, alertes, nbRangs = 5) {
  const c = ctx.calc[nom];
  if (!c || c.__type !== 'GameCalculationConditional') return null;
  const muet = new Set();   // l'alerte du cas conditionnel n'a pas lieu d'être ici
  return {
    condition: (c.mConditionalCalculationRequirements || {}).__type || null,
    defaut: resoudreCalcul(c.mDefaultGameCalculation, ctx, muet, nbRangs, 1),
    siCondition: resoudreCalcul(c.mConditionalGameCalculation, ctx, muet, nbRangs, 1)
  };
}

/* Contexte pour un OBJET. Même arbre de formules que les sorts, mais deux formes
   diffèrent : les DataValues d'objet portent une valeur unique (`mName`/`mValue`)
   là où un sort porte un tableau par rang, et `mEffectAmount` est une simple liste
   de nombres. On normalise vers la forme « tableau » attendue par le résolveur —
   un objet n'a qu'un seul « rang ». */
function creerContexteObjet(item) {
  const dv = {};
  (item.mDataValues || []).forEach(v => {
    if (v && v.mName) dv[String(v.mName).toLowerCase()] = [v.mValue || 0];
  });
  const eff = (item.mEffectAmount || []).map(v => [typeof v === 'number' ? v : 0]);
  return { dv, eff, calc: item.mItemCalculations || {} };
}

module.exports = { creerContexte, creerContexteObjet, resoudreCalcul, resoudreConditionnel,
                   valeurParPaliers,
                   evalPart, STATS, MODES, RANGS, rangsDe };
