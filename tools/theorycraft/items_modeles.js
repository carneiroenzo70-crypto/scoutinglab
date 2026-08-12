/* Modèles de comportement des passifs d'objet.

   Même séparation que `runes_modeles.js`, et pour la même raison : ici on décrit
   UNIQUEMENT le comportement (quand ça se déclenche, sur quoi porte le pourcentage,
   quel type de dégâts). Les NOMBRES restent lus dans `items.json`, extrait du fichier
   de jeu. Un patch qui fait passer la Dent de Nashor de 15 à 20 se propage donc tout
   seul ; seuls les remaniements de mécanique demandent une reprise.

   Ce fichier n'invente RIEN : chaque entrée pointe une clé existante du fichier de
   jeu. Un objet sans entrée ici n'est pas appliqué aux dégâts — il est compté comme
   non modélisé, pas approximé. C'est la leçon de `SiphonDamage`, une clé résiduelle
   du fichier que j'avais prise pour un effet vivant : ne servir que ce qu'on a
   délibérément vérifié.

   Champs :
     nom          libellé du passif tel qu'il apparaît en jeu
     effet        'degats' | 'soin' | 'bouclier' | 'stat' | 'multiplicateur'
     statsAccordees      [{ stat, calcul }] ou [{ stat, valeur, base }] — s'AJOUTE au profil
     multiplicateursStat [{ stat, portee, valeur }] — MULTIPLIE une stat du profil
     phase        'avant' | 'apres' — de part et d'autre des stats accordées
     typeDegats   'physique' | 'magique' | 'brut'
     declencheur  { type: 'coupAImpact' }        à chaque attaque de base
                  { type: 'apresCompetence', recharge: 'clé' }   lame enchantée
                  { type: 'competence' }         à chaque compétence blessante
                  { type: 'periodique', ... }    brûlure
     calcul       nom du calcul résolu dans items.json (prioritaire)
     valeur       à défaut, clé de `valeurs` (nombre simple)
     surCible     true = le pourcentage porte sur la CIBLE, pas sur le porteur
     distance     { facteur: 'clé' } ou { calcul: 'autreCalcul' } — version à distance
     plafond      { cle: 'clé', contre: 'monstres' }
     note         ce que le modèle NE couvre pas, dit explicitement                    */

module.exports = {

  /* ── Coups à l'impact : s'ajoutent à CHAQUE attaque de base ─────────────────── */

  3153: { // Lame du roi déchu — Fil de brume
    nom: 'Fil de brume', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'coupAImpact' },
    calcul: 'MeleeItemCalcValue', distance: { calcul: 'RangedItemCalcValue' },
    /* ⚠ Le pourcentage porte sur les PV ACTUELS de la CIBLE (wiki : « current
       health »), pas sur les PV max du porteur. Le confondre change tout : contre
       une cible à 30 % de vie, l'effet est trois fois plus faible. */
    surCible: 'pvActuels',
    plafond: { cle: 'MonsterDamageCap', contre: 'monstres' },
    note: 'le ralentissement cumulable (Ombres griffues) n\'est pas modélisé'
  },

  3115: { // Dent de Nashor — Morsure d'Icathia
    nom: 'Morsure d\'Icathia', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'coupAImpact' }, calcul: 'TotalOnHitDamage'
  },

  3091: { // Au bout du rouleau — Conflit
    nom: 'Conflit', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'coupAImpact' }, calcul: 'OnHitDamage'
  },

  3302: { // Terminus — Ombre
    nom: 'Ombre', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'coupAImpact' }, calcul: 'OnHitDamage',
    note: 'Juxtaposition (alternance lumière/ténèbres, résistances et pénétration ' +
          'cumulables) n\'est pas modélisée'
  },

  3124: { // Lame enragée de Guinsoo — Courroux
    nom: 'Courroux', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'coupAImpact' }, valeur: 'OnHitDamage',
    note: 'Frappe furieuse (cumuls de vitesse d\'attaque, puis coups dédoublés) ' +
          'n\'est pas modélisée — l\'objet est donc sous-estimé'
  },

  3748: { // Hydre titanesque — Fendoir
    nom: 'Fendoir', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'coupAImpact' }, calcul: 'OnHitDamageCalc',
    /* Le facteur « à distance » est porté par le calcul lui-même (mRangedMultiplier),
       déjà résolu à l'extraction : moitié de l'effet. Vérifié sur le wiki :
       1 % en mêlée, 0,5 % à distance. */
    note: 'les dégâts de cône (3 % des PV max) ne touchent que des cibles ' +
          'supplémentaires : hors du calcul en cible unique'
  },

  6698: { // Hydre profane — Fendoir
    nom: 'Fendoir', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'coupAImpact' }, calcul: 'CleaveDamage',
    note: 'Balayage hérétique (l\'actif) n\'est pas modélisé'
  },

  3181: { // Brise-coques — Pilote
    nom: 'Pilote', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'toutesNAttaques', n: 5 }, calcul: 'MaxStackDamage',
    distance: { calculValeur: 'RangedSkipperADRatio' },
    note: 'les dégâts contre les structures sont ignorés'
  },

  3074: { // Hydre vorace — Fendoir
    nom: 'Fendoir', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'coupAImpact' },
    calcul: 'MeleeItemCalcValue', distance: { calcul: 'RangedItemCalcValue' },
    note: 'Croissant vorace (l\'actif) n\'est pas modélisé'
  },

  6631: { // Estropieur — Fendoir
    nom: 'Fendoir', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'coupAImpact' },
    calcul: 'MeleeItemCalcValue', distance: { calcul: 'RangedItemCalcValue' },
    note: 'Onde de choc entravante (l\'actif) n\'est pas modélisée'
  },

  6672: { // Tueur de krakens — Trempe
    nom: 'Trempe', effet: 'degats', typeDegats: 'brut',
    /* Un coup sur trois seulement : compté comme tel dans les dégâts par seconde,
       et surtout PAS ajouté à chaque attaque. */
    declencheur: { type: 'toutesNAttaques', n: 3 }, calcul: 'DamageAmount',
    distance: { facteur: 'RangedDamageMultiplier' },
    note: 'l\'amplification selon les PV manquants de la cible n\'est pas appliquée : ' +
          'valeur de plancher, cible à pleine vie'
  },

  /* ── Lame enchantée : la prochaine attaque APRÈS une compétence ─────────────── */

  3078: { // Force de la trinité — Lame enchantée
    nom: 'Lame enchantée', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'apresCompetence', recharge: 'SpellbladeCooldown' },
    calcul: 'SpellbladeDamage'
  },

  2510: { // Aube et crépuscule — Lame enchantée
    nom: 'Lame enchantée', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'apresCompetence', recharge: 'SpellbladeCooldown' },
    calcul: 'SpellbladeDamage',
    note: 'le soin associé (SpellbladeHealing) n\'est pas compté dans les dégâts'
  },

  3508: { // Faux spectrale — Lame enchantée
    nom: 'Lame enchantée', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'apresCompetence', recharge: 'SpellbladeCooldown' },
    calcul: 'SpellbladeDamage',
    note: 'le rendu de mana n\'est pas modélisé'
  },

  3100: { // Fléau de liche — Lame enchantée
    nom: 'Lame enchantée', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'apresCompetence', recharge: 'SpellbladeCooldown' },
    calcul: 'SpellbladeDamage'
  },

  6662: { // Gantelet givrant — Lame enchantée
    nom: 'Lame enchantée', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'apresCompetence', recharge: 'SpellbladeCooldown' },
    calcul: 'SpellbladeDamage',
    note: 'le champ de ralentissement n\'est pas modélisé'
  },

  /* ── Attaques énergisées : à intervalle, pas à chaque coup ──────────────────── */

  3094: { // Canon ultrarapide — Sniper
    nom: 'Sniper', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'energise' }, valeur: 'BonusDamage',
    note: 'l\'énergie se charge en se déplaçant et en attaquant : le rythme réel ' +
          'dépend du déplacement, non modélisé'
  },

  3087: { // Poignard de Statikk — Étincelle électrique
    nom: 'Étincelle électrique', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'energise' }, valeur: 'ChainDamage',
    note: 'la chaîne touche plusieurs cibles : ici seule la première est comptée'
  },

  /* ── Brûlures et effets périodiques ─────────────────────────────────────────── */

  6653: { // Tourment de Liandry — Souffrance
    nom: 'Souffrance', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'periodique', duree: 'BurnDuration' },
    valeur: 'BurnPercentHealthDamage', surCible: 'pvMax',
    parSeconde: true,
    plafond: { cle: 'MonsterDamageCap', contre: 'monstres' },
    note: 'l\'amplification progressive (jusqu\'à +6 % en combat prolongé) n\'est ' +
          'pas appliquée ici'
  },

  2503: { // Torche noire — Flamme funèbre
    nom: 'Flamme funèbre', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'periodique', duree: 'BurnDuration' },
    calcul: 'BurnDamagePerSecondCalc', parSeconde: true,
    note: 'Feu noir (+4 % de puissance par champion brûlé) n\'est pas modélisé'
  },

  /* ── Dégâts liés aux compétences ────────────────────────────────────────────── */

  6655: { // Écho de Luden — Écho
    nom: 'Écho', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'competence', recharge: 'Cooldown' },
    calcul: 'SingleTargetMax',
    note: 'valeur en cible unique (les 6 échos concentrés) ; en combat groupé ' +
          'ils se répartissent'
  },

  /* ── Objets à passif défensif ou utilitaire, sans dégâts à ajouter ──────────── */

  3097: { // Lame tempête — Éclair
    nom: 'Éclair', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'energise' }, calcul: 'TotalProcDamage'
  },

  /* ── Passifs qui ACCORDENT DES STATS ────────────────────────────────────────
     Catégorie à part, et la plus lourde de conséquences : ils ne s'ajoutent pas aux
     dégâts, ils modifient le PROFIL — donc tous les ratios de sorts, toutes les
     attaques, tout ce qui suit. Le Manamune sur Ryze, c'est plus de 30 dégâts
     d'attaque invisibles si on ne les compte pas.
     `statsAccordees` est lu par `profil()` avant tout autre calcul. */

  3004: { // Manamune — Effroi
    nom: 'Effroi', effet: 'stat',
    statsAccordees: [{ stat: 'ad', calcul: 'BonusADFromMana' }],
    note: 'Flux de mana (jusqu\'à +360 de mana accumulé, puis transformation en ' +
          'Muramana) n\'est pas modélisé — valeur de départ uniquement'
  },

  3053: { // Gage de Sterak — Griffes qui happent
    nom: 'Griffes qui happent', effet: 'stat',
    statsAccordees: [{ stat: 'ad', calcul: 'BonusAD' }],
    note: 'le bouclier Lien vital (60 % des PV bonus) n\'est pas compté dans les dégâts'
  },

  2501: { // Armure sanguine — Tyrannie
    /* Pas de `mItemCalculations` pour ce passif : le fichier ne porte que le
       pourcentage brut. On déclare donc explicitement la BASE sur laquelle il
       s'applique — « 2,5 % de vos PV bonus », d'après la description en jeu. */
    nom: 'Tyrannie', effet: 'stat',
    statsAccordees: [{ stat: 'ad', valeur: 'HPToADPercentage', base: 'pvBonus' }],
    note: 'Représailles (jusqu\'à +12 % de dégâts d\'attaque selon les PV manquants) ' +
          'n\'est pas appliqué : cible et porteur sont supposés à pleine vie, donc 0'
  },

  /* ── Passifs qui MULTIPLIENT une stat ───────────────────────────────────────
     Troisième catégorie, distincte des deux précédentes, et purement arithmétique :
     ils ne s'ajoutent ni aux dégâts ni au profil sous forme de montant fixe — ils
     appliquent un POURCENTAGE à une stat déjà constituée.

     L'ordre est donc capital, et c'est ce qui justifie le champ `phase` :
       'avant' — la base ne dépend que des objets (les PV d'objets de Warmog, les
                 résistances bonus de Jak'Sho) : on multiplie AVANT les passifs qui
                 accordent des stats, puisque ceux-ci lisent le résultat (l'Armure
                 sanguine convertit les PV bonus — Warmog compris — en dégâts).
       'apres' — la base est la stat TOTALE (la Coiffe de Rabadon) : elle doit
                 englober tout ce que les autres passifs ont accordé, donc en dernier.
     Se tromper de phase, c'est perdre ou compter deux fois un pourcentage entier. */

  3089: { // Coiffe de Rabadon — Opus magique
    nom: 'Opus magique', effet: 'multiplicateur', phase: 'apres',
    /* « Vous augmentez votre puissance totale de 30 % » — totale, pas bonus : la
       puissance de base des champions étant nulle, la distinction n'a d'effet que si
       un autre passif en accorde, mais la coder juste coûte le même prix.
       Objet PRÉSENT dans les builds de référence et jusqu'ici non appliqué : la
       puissance de ces builds était sous-estimée de 30 %. */
    multiplicateursStat: [{ stat: 'ap', portee: 'total', valeur: 'APAmp' }]
  },

  6665: { // Jak'Sho, le Protéiforme — Vigueur de Néantin
    nom: 'Vigueur de Néantin', effet: 'multiplicateur', phase: 'avant',
    /* « armure et résistance magique BONUS » : la base du champion n'est pas
       multipliée. Le lire « total » gonflerait l'effet de moitié au niveau 18. */
    multiplicateursStat: [
      { stat: 'armure', portee: 'bonus', valeur: 'BonusResistPercentage' },
      { stat: 'rm',     portee: 'bonus', valeur: 'BonusResistPercentage' }
    ],
    condition: { apresSecondes: 5, libelle: 'après 5 s de combat contre des champions' },
    note: 'ne s\'applique qu\'après 5 s de combat : compté seulement sur les fenêtres ' +
          'd\'au moins 5 s, et sans effet sur les dégâts infligés (stats défensives)'
  },

  3083: { // Armure de Warmog — Vitalité de Warmog
    nom: 'Vitalité de Warmog', effet: 'multiplicateur', phase: 'avant',
    /* « 12 % de vos PV d'OBJETS » — ni les PV de base, ni ceux des runes. D'où la
       portée `objets`, distincte de `bonus` : sur un champion niveau 18 l'écart
       entre les deux se compte en centaines de PV. */
    multiplicateursStat: [{ stat: 'pv', portee: 'objets', valeur: 'HPAmp' }],
    note: 'Cœur de Warmog (régénération hors combat) n\'entre pas dans un calcul de combat'
  },

  /* ── Boucliers ──────────────────────────────────────────────────────────────── */

  3156: { // Gueule de Malmortius — Lien vital
    nom: 'Lien vital', effet: 'bouclier',
    declencheur: { type: 'seuilPV', seuil: 'LowHealthThreshold', recharge: 'Cooldown' },
    calcul: 'MeleeItemCalcValue', distance: { calcul: 'RangedItemCalcValue' }
  },

  6673: { // Arc-bouclier immortel
    nom: 'Lien vital', effet: 'bouclier',
    declencheur: { type: 'seuilPV', seuil: 'HealthThreshold', recharge: 'Cooldown' },
    calcul: 'ShieldAmount'
  },

  /* ── Amplification : ne s'ajoute pas aux dégâts, elle les multiplie ──────────
     Les ranger avec les passifs de dégâts serait une faute de raisonnement : on ne
     peut pas additionner « +3 % de dégâts » à un montant. Ils sont donc déclarés
     comme non appliqués, en attendant une passe dédiée à l'amplification. */
  4633: { nonApplique: 'amplification des dégâts (jusqu\'à +8 % en combat prolongé) : ' +
                       'multiplie les dégâts au lieu de s\'y ajouter — non appliquée' },
  3161: { nonApplique: 'amplification des dégâts de compétence par cumuls : ' +
                       'multiplie au lieu de s\'ajouter — non appliquée' },
  8020: { nonApplique: 'amplification subie PAR LA CIBLE (+12 % de dégâts magiques) : ' +
                       'appartient à la cible, pas au porteur' },

  3033: { nonApplique: 'Hémorragie : réduit les soins de la cible, aucun dégât' },
  3165: { nonApplique: 'Hémorragie : réduit les soins de la cible, aucun dégât' },
  3071: { nonApplique: 'réduction d\'armure cumulable — effet réel, mais qui agit ' +
                       'sur la mitigation, pas comme dégâts ajoutés' },
  3085: { nonApplique: 'les projectiles touchent des cibles SUPPLÉMENTAIRES : ' +
                       'aucun gain en cible unique' }
};
