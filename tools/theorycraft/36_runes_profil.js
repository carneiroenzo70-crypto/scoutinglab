/* Pont RUNES → PROFIL.

   Le chaînon qui manquait. Le moteur de runes savait chiffrer les 69 runes modélisées,
   le modèle savait chiffrer un build d'objets — mais rien ne faisait entrer les runes
   dans les STATS du champion. Or c'est tout l'objectif : proposer un build ET des runes,
   et prouver pourquoi le couple est meilleur. Un fragment de force adaptative ou une
   Transcendance changent les dégâts de chaque sort ; les ignorer, c'est comparer des
   builds sur un profil qui n'existe dans aucune partie.

   ── Deux règles, tenues strictement ────────────────────────────────────────────

   1. LISTE BLANCHE. N'entre dans le profil qu'une rune dont le gain est PERMANENT et
      INCONDITIONNEL. Le Manteau nuageux affiche 45 % de vitesse de déplacement : c'est
      une bouffée de quelques secondes après un sort d'invocateur, pas une stat. La
      verser au profil ferait passer un champion pour deux fois plus mobile qu'il n'est.
      Toute rune hors liste est refusée AVEC SON MOTIF, jamais ignorée en silence.

   2. UNITÉS. Le moteur de runes renvoie des valeurs telles qu'AFFICHÉES en jeu (10 pour
      « 10 % de vitesse d'attaque »), alors que le profil compte les pourcentages en
      FRACTIONS (0,10). Sans conversion, un fragment de vitesse d'attaque en aurait
      apporté mille pour cent. Chaque entrée porte donc son unité, et la conversion est
      testée poste par poste.                                                        */

const R = require('./14_moteur_runes');

/* `stat` : la clé du profil. `unite` : 'fraction' pour un pourcentage affiché en
   centièmes, 'brut' pour une valeur déjà à l'échelle. `pourquoi` : la justification
   d'appartenance à la liste blanche — écrite pour être relue au prochain patch. */
const PERMANENTES = {
  // ── Fragments (les trois choisis par tout le monde, à chaque partie)
  5001: { stat: 'pv', unite: 'brut', pourquoi: 'fragment : PV croissants avec le niveau' },
  5011: { stat: 'pv', unite: 'brut', pourquoi: 'fragment : PV fixes' },
  5005: { stat: 'vitesseAttaque', unite: 'fraction', pourquoi: 'fragment : vitesse d\'attaque' },
  5007: { stat: 'accel', unite: 'brut', pourquoi: 'fragment : accélération de compétence' },
  5008: { stat: 'adaptatif', unite: 'brut', pourquoi: 'fragment : force adaptative' },
  5010: { stat: 'vd', unite: 'fraction', pourquoi: 'fragment : vitesse de déplacement' },
  5013: { stat: 'tenacite', unite: 'fraction', pourquoi: 'fragment : ténacité et résistance aux ralentissements' },

  // ── Runes majeures dont le gain est acquis une fois pour toutes
  8210: { stat: 'accel', unite: 'brut', pourquoi: 'Transcendance : accélération permanente' },
  8316: { stat: 'accel', unite: 'brut', pourquoi: 'Polyvalence : accélération permanente' },
  8226: { stat: 'mana', unite: 'brut', pourquoi: 'Ruban de mana : mana maximum, acquis définitivement' },
  8242: { stat: 'resistances', unite: 'brut', pourquoi: 'Inébranlable : armure et RM' },
  8429: { stat: 'resistances', unite: 'brut', pourquoi: 'Conditionnement : armure et RM, définitif une fois débloqué' },
  8451: { stat: 'pv', unite: 'brut', pourquoi: 'Surcroissance : PV acquis définitivement' },
  8453: { stat: 'soinsEtBoucliers', unite: 'fraction', pourquoi: 'Revitalisation : efficacité permanente' },
  8304: { stat: 'vdPlate', unite: 'brut', pourquoi: 'Chaussures magiques : vitesse de déplacement permanente' },

  // ── Runes « Légende » : cumuls acquis, jamais reperdus
  9103: { stat: 'volVie', unite: 'fraction', pourquoi: 'Légende : cumuls acquis définitivement' },
  9104: { stat: 'vitesseAttaque', unite: 'fraction', pourquoi: 'Légende : cumuls acquis définitivement' },
  9105: { stat: 'accel', unite: 'brut', pourquoi: 'Légende : cumuls acquis définitivement' },
  8106: { stat: 'accelUltime', unite: 'brut', pourquoi: 'Chasseur ultime : cumuls acquis définitivement' }
};

/* Runes dont le gain de stat est RÉEL mais temporaire ou conditionné. Elles sont
   nommées ici pour que leur absence soit un choix documenté et non un oubli — c'est la
   même exigence que pour les objets `nonApplique`. */
const HORS_PROFIL = {
  8275: 'Manteau nuageux : bouffée de vitesse de quelques secondes après un sort d\'invocateur',
  8232: 'Marche sur l\'eau : seulement dans la rivière',
  8233: 'Concentration absolue : dépend des PV actuels',
  8236: 'Tempête menaçante : monte avec la durée de partie et se perd hors combat',
  8234: 'Célérité : amplifie la vitesse BONUS, ce n\'est pas un gain plat',
  8230: 'Assaut du maraudeur : bouffée temporaire'
};

/* Force adaptative : 1 point donne 1 puissance OU 0,6 dégât d'attaque, selon la plus
   haute des deux stats BONUS du champion. À égalité — le cas de toute partie avant le
   premier objet — c'est le type adaptatif du champion qui tranche, lu dans le fichier
   de jeu (`mAdaptiveForceToAbilityPowerWeight`) et non deviné à la couleur des sorts. */
function versAdaptatif(points, profil, adaptatifAP) {
  const ap = profil.ap || 0, ad = profil.adBonus || 0;
  const versAP = ap > ad ? true : ad > ap ? false : !!adaptatifAP;
  return versAP ? { stat: 'ap', valeur: points, libelle: 'puissance' }
                : { stat: 'ad', valeur: points * 0.6, libelle: 'dégâts d\'attaque' };
}

/* Stats apportées par une page de runes, dans le contexte d'un profil donné.
   `profil` sert à deux choses : arbitrer la force adaptative, et fournir le contexte
   (niveau, stats) dont plusieurs runes dépendent pour leur propre valeur. */
function statsDeRunes(ids, profil, adaptatifAP, ctx = {}) {
  const gains = {}; const detail = []; const refus = [];
  const contexte = Object.assign({
    niveau: profil.niveau || 18,
    adBase: profil.adBase || 0, adBonus: profil.adBonus || 0,
    ap: profil.ap || 0, pvMax: profil.pvMax || 0, pvBonus: profil.pvBonus || 0,
    /* Le drapeau « à distance » manquait ici aussi : plusieurs runes ont une version
       réduite pour les champions à distance, et le moteur ne pouvait pas l'appliquer
       faute de savoir à qui il avait affaire. */
    distance: profil.distance
  }, ctx);

  (ids || []).forEach(id => {
    if (HORS_PROFIL[id]) { refus.push(HORS_PROFIL[id]); return; }
    const regle = PERMANENTES[id];
    const e = R.evaluerRune(id, contexte);
    if (!regle) {
      /* Pas une rune de stat : ce n'est pas un refus, c'est simplement une rune qui
         agit ailleurs (dégâts, soin, utilitaire). On ne la signale pas comme un défaut. */
      return;
    }
    if (!e.ok) { refus.push((e.nom || id) + ' : ' + e.raison); return; }
    if (e.valeur == null) { refus.push((e.nom || id) + ' : aucune valeur chiffrée'); return; }

    const v = regle.unite === 'fraction' ? e.valeur / 100 : e.valeur;

    if (regle.stat === 'adaptatif') {
      const a = versAdaptatif(v, profil, adaptatifAP);
      gains[a.stat] = (gains[a.stat] || 0) + a.valeur;
      detail.push({ rune: e.nom, stat: a.stat, valeur: Math.round(a.valeur * 100) / 100,
                    note: v + ' de force adaptative → ' + a.libelle });
      return;
    }
    if (regle.stat === 'resistances') {          // une seule valeur, deux stats
      ['armure', 'rm'].forEach(s => { gains[s] = (gains[s] || 0) + v; });
      detail.push({ rune: e.nom, stat: 'armure et rm', valeur: v });
      return;
    }
    gains[regle.stat] = (gains[regle.stat] || 0) + v;
    detail.push({ rune: e.nom, stat: regle.stat, valeur: Math.round(v * 10000) / 10000 });
  });

  return { gains, detail, refus };
}

/* ── AMPLIFICATIONS DE RUNES ────────────────────────────────────────────────────
   Elles rejoignent le MÊME seau additif que celles des objets — c'est la règle vérifiée
   sur le wiki : « Modifiers to damage dealt now stack additively ». Coup de grâce (8 %)
   et une Lance de Shojin à 4 cumuls (12 %) donnent +20 %, pas +21 %.

   Cinq runes, et pas une seule qui s'applique inconditionnellement. Chacune est traitée
   comme la Flamme-ombre l'a été côté objets : condition remplie → le pourcentage ;
   condition non remplie → ZÉRO, dit comme tel ; condition invérifiable → REFUS avec son
   motif. Jamais la valeur maximale « en attendant ».

   `portee` reprend le vocabulaire des objets, avec une valeur de plus : 'ultime', qui
   n'existe que pour les runes et impose de connaître la touche lancée. */
const AMPLIS = {
  8014: { // Coup de grâce
    portee: 'tous', valeur: 'BonusPercentDamage',
    seuilCible: { cle: 'EnemyHealthPercentageThreshold', sens: 'sous' },
    quoi: 'cible sous 40 % de ses PV'
  },
  8017: { // Abattage
    /* ⚠ Le fichier porte AUSSI `MinBonusDamagePercent`, `MaxBonusDamagePercent` et
       `MinHealthDifference` : des résidus d'une version antérieure de la rune, qui
       comparait les PV max des deux champions. La description actuelle ne parle que
       d'un seuil de 60 % et de 8 %. On sert donc `BonusPercentDamage` — même leçon que
       `SiphonDamage` : une clé présente dans le fichier n'est pas une clé vivante. */
    portee: 'tous', valeur: 'BonusPercentDamage',
    seuilCible: { cle: 'EnemyHealthPercentageThreshold', sens: 'au-dessus' },
    quoi: 'cible au-dessus de 60 % de ses PV'
  },
  8299: { // Baroud d'honneur
    /* De 5 % à 11 % selon les PV MANQUANTS DU PORTEUR : 5 % dès qu'on passe sous 60 %,
       maximum à 30 %. Servir le maximum d'emblée — ce que fait le moteur de runes, qui
       affiche une valeur d'étalage — offrirait 11 % permanents à qui la prend. */
    portee: 'tous', interpolePorteur: {
      min: 'MinBonusDamagePercent', max: 'MaxBonusDamagePercent',
      debut: 'HealthThresholdStart', fin: 'HealthThresholdEnd'
    },
    quoi: 'porteur sous 60 % de ses PV'
  },
  8369: { // Premier coup
    portee: 'tous', valeur: 'DamageAmp', exigeOuverture: true,
    quoi: 'première frappe du combat, 3 s'
  },
  8005: { // Attaque soutenue — le second effet, longtemps ignoré
    /* La rune n'inflige pas que ses 160 points : elle augmente AUSSI de 8 % tous les
       dégâts que vous infligez, jusqu'à la fin du combat (`AmpPotencyMaxSelf`).
       Le modèle ne voyait que la première moitié.
       Sa condition — 3 attaques consécutives — n'a pas besoin d'être supposée : elle se
       calcule, fenêtre de combat × vitesse d'attaque ≥ 3 frappes. */
    portee: 'tous', valeur: 'AmpPotencyMaxSelf',
    exigeAttaques: 'HitsRequired',
    quoi: '3 attaques de base consécutives'
  },

  8224: { // Arcaniste axiomatique
    portee: 'ultime', valeur: 'DamageAmp',
    quoi: 'dégâts d\'ultime uniquement',
    note: 'les dégâts de ZONE de l\'ultime ne sont amplifiés que de 8 % (AOEAmp) : ' +
          'le modèle sert la valeur en cible unique'
  }
};

const PORTEES_RUNES = {
  tous: () => true,
  /* 'ultime' n'a de sens que si l'on sait quelle touche a été lancée. Sans cette
     information, la rune est refusée : l'appliquer à tout multiplierait par près de
     deux le champ d'une rune qui ne touche qu'un sort sur quatre. */
  ultime: (source, ctx) => source === 'competence' && ctx.touche === 'R'
};

function amplificationDeRunes(p, cible, type, source, ctx = {}) {
  let total = 0; const detail = []; const refus = [];
  (p.runes || []).forEach(id => {
    const a = AMPLIS[id];
    if (!a) return;
    const r = R.parId[id];
    const v = (r && r.valeurs) || {};

    if (a.portee === 'ultime') {
      if (!ctx.touche) { refus.push(r.nom + ' : n\'amplifie que l\'ultime, touche non fournie'); return; }
      if (!PORTEES_RUNES.ultime(source, ctx)) return;      // hors champ, silencieux
    }

    let pct;
    if (a.interpolePorteur) {
      const f = ctx.partPvPorteur != null ? ctx.partPvPorteur : 1;   // pleine vie par défaut
      const debut = v[a.interpolePorteur.debut], fin = v[a.interpolePorteur.fin];
      const min = v[a.interpolePorteur.min], max = v[a.interpolePorteur.max];
      if ([debut, fin, min, max].some(x => x == null)) { refus.push(r.nom + ' : clés absentes'); return; }
      if (f > debut) return;                                // au-dessus du seuil : rien
      pct = f <= fin ? max : min + (max - min) * (debut - f) / (debut - fin);
    } else {
      if (a.exigeOuverture && !ctx.ouvertureCombat) {
        refus.push(r.nom + ' : ' + a.quoi + ' — non déclarée'); return;
      }
      /* Condition CALCULÉE plutôt que supposée : la fenêtre de combat et la vitesse
         d'attaque disent si les 3 frappes ont eu le temps de tomber. Sur une fenêtre
         trop courte, la rune ne s'applique pas — et le dit. */
      if (a.exigeAttaques) {
        const n = v[a.exigeAttaques];
        const fenetre = ctx.fenetre != null ? ctx.fenetre : p.fenetre;
        if (fenetre == null || !p.vitesseAttaque) {
          refus.push(r.nom + ' : ' + a.quoi + ' — durée de combat ou vitesse d\'attaque inconnue'); return;
        }
        if (fenetre * p.vitesseAttaque < n) {
          refus.push(r.nom + ' : ' + a.quoi + ' — la fenêtre de ' + fenetre +
                     ' s n\'en permet que ' + Math.floor(fenetre * p.vitesseAttaque));
          return;
        }
      }
      if (a.seuilCible) {
        if (!cible || cible.pvMax == null) { refus.push(r.nom + ' : PV de la cible inconnus'); return; }
        const f = (cible.pvActuels != null ? cible.pvActuels : cible.pvMax) / cible.pvMax;
        const seuil = v[a.seuilCible.cle];
        const remplie = a.seuilCible.sens === 'sous' ? f < seuil : f > seuil;
        if (!remplie) return;                               // condition non remplie : zéro
      }
      pct = v[a.valeur];
      if (pct == null) { refus.push(r.nom + ' : valeur absente ' + a.valeur); return; }
    }

    total += pct;
    detail.push({ rune: r.nom, pourcent: Math.round(pct * 10000) / 10000, condition: a.quoi });
  });
  return { total, detail, refus };
}

module.exports = { statsDeRunes, versAdaptatif, amplificationDeRunes,
                   PERMANENTES, HORS_PROFIL, AMPLIS };
