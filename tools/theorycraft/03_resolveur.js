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

// Correspondance mStat → caractéristique. Vérifiée empiriquement (cf. 04_statmap.js) :
// on la confirme en recoupant avec le nom du DataValue employé (« TotalADRatio »…).
const STATS = {
  0: 'AP', 1: 'Armure', 2: 'AD', 3: 'DureeWindup', 4: 'Portee', 5: 'VitesseAttaque',
  6: 'Accel', 7: 'Crit', 8: 'DegatsCrit', 9: 'PV', 10: 'PVactuels', 11: 'PVmanquants',
  12: 'Mana', 13: 'ManaActuelle', 14: 'ManaManquante', 15: 'RM', 16: 'VitesseDeplacement'
};
const MODES = { 0: 'base', 1: 'bonus', 2: 'total' };

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
      if (!coef || coef.n == null) return null;
      const stat = STATS[p.mStat || 0] || ('stat' + p.mStat);
      const mode = MODES[p.mStatFormula || 0] || 'base';
      return { termes: [{ stat, mode, valeur: coef.n }] };
    }

    case 'ByCharLevelInterpolationCalculationPart':
      // valeur qui évolue du niveau 1 au 18 : on garde les deux bornes
      return { termes: [{ stat: 'flat', mode: 'parNiveau', valeur: p.mStartValue || 0,
                          jusqua: p.mEndValue || 0 }] };

    case 'ByCharLevelBreakpointsCalculationPart':
      return { termes: [{ stat: 'flat', mode: 'parNiveau', valeur: p.mLevel1Value || 0,
                          jusqua: null, paliers: true }] };

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

    case 'BuffCounterByNamedDataValueCalculationPart':
    case 'BuffCounterByCoefficientCalculationPart':
      alertes.add('cumul de buff (' + t + ') — non modélisé');
      return null;

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
    parRang[r] = ok ? termes : null;
  });
  return parRang;
}

module.exports = { creerContexte, resoudreCalcul, evalPart, STATS, MODES, RANGS, rangsDe };
