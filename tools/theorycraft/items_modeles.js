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

  3068: { // Égide solaire — Immolation
    /* 20 + 1,5 % des PV bonus, une fois par seconde. Le fichier porte trois calculs
       identiques (`DamagePerTick`, `DPS`, un hachage) et deux clés explicitement
       marquées TOOLTIPONLY qui donnent les mêmes 20 et 1,5 : concordance interne
       complète, on prend le calcul et non l'infobulle. */
    nom: 'Immolation', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'periodique', duree: 'AuraDuration' },
    calcul: 'DamagePerTick', parSeconde: true,
    note: 'aura de zone : contre plusieurs ennemis, le total réel est un multiple ' +
          'de ce chiffre ; les modificateurs sbires (×0,5) et monstres (×0,8) ne ' +
          's\'appliquent pas à un champion'
  },

  2502: { // Désespoir infini — Affliction
    /* « Toutes les 4 sec de combat » : ce n'est ni un coup à l'impact ni du continu,
       d'où un déclencheur à intervalle propre. 3 % des PV bonus, ce que confirme
       `BonusHealthDrainPercentage` = 0,03. */
    nom: 'Affliction', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'intervalle', recharge: 'Cooldown' },
    calcul: 'DrainCalc',
    note: 'le soin associé (250 % des dégâts) n\'est pas compté dans les dégâts'
  },

  3084: { // Cœuracier — Consommation colossale
    /* 70 + 6 % des PV MAX — la description l'écrit noir sur blanc, et le calcul le
       confirme au chiffre près. Une fois par cible toutes les 30 s : hors de question
       de l'ajouter à chaque attaque. */
    nom: 'Consommation colossale', effet: 'degats', typeDegats: 'physique',
    declencheur: { type: 'intervalle', recharge: 'PerTargetCooldown' },
    calcul: 'DamageProcCalc',
    note: 'les PV max gagnés au passage (10 % des dégâts) ne sont pas modélisés ; ' +
          'la proximité requise (6 relevés, 700 unités) est supposée acquise'
  },

  /* ── Actifs ─────────────────────────────────────────────────────────────────
     Ils ne se déclenchent pas seuls : c'est le joueur qui les lance, avec une longue
     recharge. Comptés à part des dégâts automatiques, jamais fondus dedans. */

  3152: { // Ceinture-roquette Hextech — Supersonique
    nom: 'Supersonique', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'actif', recharge: 'Cooldown' }, calcul: 'FireboltDamage'
  },

  3146: { // Pistolame Hextech — Orbe de foudre
    nom: 'Orbe de foudre', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'actif', recharge: 'Cooldown' }, calcul: 'ActiveDamage',
    note: 'le ralentissement (25 % pendant 1,5 s) n\'est pas modélisé'
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

  3003: { // Bâton de l'archange — Effroi
    /* « Vous gagnez de la puissance équivalente à 1 % de votre mana BONUS » : le
       fichier ne porte que le pourcentage, la base vient de la description. Compter
       le mana total au lieu du mana bonus donnerait +10 de puissance imaginaires
       à Ryze au niveau 18. */
    nom: 'Effroi', effet: 'stat',
    statsAccordees: [{ stat: 'ap', valeur: 'APFromMana', base: 'manaBonus' }],
    note: 'Flux de mana (jusqu\'à +360 de mana accumulé, puis Sablier de Seraph) ' +
          'n\'est pas modélisé — valeur de départ uniquement'
  },

  3119: { // Approche de l'hiver — Effroi
    /* La boutique n'imprime pas la valeur (gabarit non résolu). Le fichier, lui, est
       sans ambiguïté : `BonusHPFromMana` = 15 % du mana TOTAL en PV bonus. */
    nom: 'Effroi', effet: 'stat', ordre: -1,
    statsAccordees: [{ stat: 'pv', calcul: 'BonusHPFromMana' }],
    note: 'Flux de mana (jusqu\'à +360 de mana, puis Fimbulvetr) n\'est pas modélisé'
  },

  2501: { // Armure sanguine — Tyrannie
    /* `ordre: 1` — ce passif LIT les PV bonus, il doit donc passer après ceux qui en
       accordent (l'Approche de l'hiver en donne 15 % du mana). Sans cet ordre, les
       PV gagnés par un autre objet ne se convertiraient jamais en dégâts. */
    ordre: 1,
    /* Pas de `mItemCalculations` pour ce passif : le fichier ne porte que le
       pourcentage brut. On déclare donc explicitement la BASE sur laquelle il
       s'applique — « 2,5 % de vos PV bonus », d'après la description en jeu. */
    nom: 'Tyrannie', effet: 'stat',
    statsAccordees: [{ stat: 'ad', valeur: 'HPToADPercentage', base: 'pvBonus' }],
    note: 'Représailles (jusqu\'à +12 % de dégâts d\'attaque selon les PV manquants) ' +
          'n\'est pas appliqué : cible et porteur sont supposés à pleine vie, donc 0'
  },

  /* ── Accélération d'ULTIME ───────────────────────────────────────────────────
     Une stat à part entière, et qui n'existait nulle part dans le modèle : trois objets
     finis la portent, dans `valeurs.UltimateHaste`, et Data Dragon ne la publie pas.
     Elle ne réduit QUE la recharge de l'ultime — la verser dans l'accélération générale
     accélérerait aussi Q, W et E, soit quatre fois son effet réel.

     C'est aussi le premier cas de `statsAccordees` sans base : la clé porte un montant
     plat (30), pas une proportion d'une stat du porteur. */

  2512: { // Chasseur de monstres — Veille de nuit
    nom: 'Veille de nuit', effet: 'stat',
    statsAccordees: [{ stat: 'accelUltime', valeur: 'UltimateHaste' }],
    note: 'Barrage d\'ouverture (3 attaques renforcées après l\'ultime) n\'est pas modélisé'
  },

  3073: { // Hexplaque expérimentale — Charge Hextech
    nom: 'Charge Hextech', effet: 'stat',
    statsAccordees: [{ stat: 'accelUltime', valeur: 'UltimateHaste' }],
    note: 'Surcharge (vitesse d\'attaque et de déplacement après l\'ultime) n\'est pas modélisée'
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

  2504: { // Rookern kaénique — Fléau des mages
    nom: 'Fléau des mages', effet: 'bouclier',
    declencheur: { type: 'horsCombat', duree: 'OutOfCombatDuration' },
    calcul: 'ShieldCalc',
    /* Bouclier ANTI-MAGIE uniquement : il n'absorbe rien de physique. Le compter comme
       un bouclier ordinaire doublerait sa valeur face à un adversaire à dégâts mixtes. */
    contre: 'magique',
    note: 'exige 15 s sans subir de dégâts magiques'
  },

  3072: { // Soif-de-sang — Bouclier d'ichor
    nom: 'Bouclier d\'ichor', effet: 'bouclier',
    declencheur: { type: 'volVieExcedentaire', seuil: 'Threshold' },
    calcul: 'OvershieldCalc',
    note: 'plafond du bouclier ; il se remplit du vol de vie excédentaire au-delà de ' +
          '70 % des PV, un rythme que le modèle ne connaît pas'
  },

  6692: { // Éclipse — Lune ascendante
    /* Aucun `mItemCalculations` : les nombres vivent dans les DataValues, comme pour
       trois sorts de champion. On déclare donc les termes, sans en inventer aucun —
       150 de base + 40 % de l'AD bonus, moitié à distance (`RangedShieldMult`). */
    nom: 'Lune ascendante', effet: 'bouclier',
    declencheur: { type: 'deuxFrappes', fenetre: 'WindowDuration', recharge: 'Cooldown' },
    termesDeclares: [
      { stat: 'flat', mode: 'flat', cle: 'MeleeBaseShield' },
      { stat: 'AD', mode: 'bonus', cle: 'MeleeBonusADShieldRatio' }
    ],
    distance: { facteur: 'RangedShieldMult' },
    note: 'la part en pourcentage des PV max (MeleePercMaxHP) concerne les dégâts de ' +
          'Lune ascendante, pas le bouclier'
  },

  6664: { // Rayonnement du vide — Immolation
    /* Même famille que l'Égide solaire, chiffres différents : 15 + 1 % des PV bonus.
       Les deux clés TOOLTIPONLY (10 et 1,75) NE correspondent PAS au calcul (15 et 1) :
       on sert le calcul, qui est ce que le jeu applique, et on le dit ici plutôt que
       de choisir en silence le chiffre le plus flatteur. */
    nom: 'Immolation', effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'periodique', duree: 'AuraDuration' },
    calcul: 'DamagePerTick', parSeconde: true,
    note: 'aura de zone ; Désolation (dégâts à l\'élimination) n\'est pas modélisée. ' +
          'Les clés TOOLTIPONLY du fichier (10 + 1,75 %) contredisent son propre ' +
          'calcul (15 + 1 %) : c\'est le calcul qui est servi'
  },

  /* ── AMPLIFICATIONS : elles ne s'ajoutent pas aux dégâts, elles les multiplient ──

     Longtemps écartées faute de savoir où les brancher. Deux points ont dû être
     vérifiés sur le wiki officiel avant d'écrire une ligne, et aucun des deux n'était
     devinable :

     1. Les modificateurs de dégâts INFLIGÉS se cumulent ADDITIVEMENT — « Modifiers to
        damage dealt now stack additively instead of multiplicatively ». C'est l'inverse
        exact des pénétrations en pourcentage. Deux amplifications de 10 % donnent donc
        +20 %, pas +21 %. Supposer la symétrie avec les pénétrations aurait été le
        raisonnement naturel, et il aurait été faux.
     2. Tueur de géants n'est PLUS limité aux dégâts physiques depuis la V13.10 :
        « deal increased damage », tous types confondus.

     Champs : `portee` (à quelle SOURCE de dégâts ça s'applique), `types` (à quels types
     de dégâts), et la façon dont le pourcentage se constitue (`montee`, `cumuls`,
     `selonPVbonusCible`, `seuilPVCible`). */

  4633: { // Créateur de failles — Corruption du Néant + Infusion du Néant
    nom: 'Corruption du Néant', effet: 'amplification',
    /* « Pour chaque seconde passée en combat, vous infligez 2 % de dégâts bonus
       (jusqu'à 8 %) » — tous types, toutes sources. Le plafond est atteint en 4 s
       (`SecondsInCombat`), ce que confirme le rapport 0,08 / 0,02. */
    amplification: {
      portee: 'tous',
      montee: { parSeconde: 'EternityDamageIncreasePerSecond',
                plafond: 'EternityDamageIncreaseMax' }
    },
    /* Second passif, indépendant : « Vous gagnez de la puissance équivalente à 2 % de
       vos PV bonus ». Sans plafond d'après le wiki — la clé `MaxAPMultiplier` (0,05)
       du fichier n'est corroborée nulle part, elle n'est donc PAS appliquée. */
    statsAccordees: [{ stat: 'ap', calcul: '{1247259a}' }],
    note: 'l\'omnivampirisme au plafond n\'est pas modélisé ; la clé MaxAPMultiplier ' +
          'du fichier n\'est expliquée ni par la boutique ni par le wiki : non appliquée'
  },

  3161: { // Lance de Shojin — Détermination inflexible
    nom: 'Détermination inflexible', effet: 'amplification',
    /* 3 % par cumul, 4 cumuls, sur les dégâts de COMPÉTENCE. Le wiki y ajoute les
       dégâts de familier et de proc — d'où la portée `competences`, qui couvre aussi
       les passifs d'objet.
       ⚠ Désaccord assumé : le résumé du wiki dit « pas de distinction à distance »,
       mais le fichier porte DEUX calculs vivants et cohérents entre eux
       (MeleeItemCalcValue = 3, RangedItemCalcValue = 1,5) plus RangedMod = 0,5.
       Le fichier de jeu prime ; la moitié est donc appliquée aux champions à distance. */
    amplification: {
      portee: 'competences', unite: 'pourcent', cumuls: 'StackCount',
      calcul: 'MeleeItemCalcValue', distance: { calcul: 'RangedItemCalcValue' }
    },
    note: 'cumuls supposés au maximum (4) : valeur de combat engagé, pas d\'ouverture'
  },

  8020: { // Masque abyssal — Anéantissement
    nom: 'Anéantissement', effet: 'amplification',
    amplification: { portee: 'tous', types: ['magique'], valeur: 'DamageAmp' },
    note: 'c\'est un affaiblissement porté PAR LA CIBLE : il profite aussi aux alliés ' +
          'proches, ce que ce calcul en cible unique ne compte pas'
  },

  3036: { // Salutations de Dominik — Tueur de géants
    nom: 'Tueur de géants', effet: 'amplification',
    /* « jusqu'à 15 % selon les PV BONUS de la cible, maximum à 1500 ». Dépend donc de
       l'adversaire, pas du porteur : contre une cible sans PV bonus, l'effet est nul.
       Tous types de dégâts depuis la V13.10 (vérifié) — le lire « physique » aurait
       sous-estimé les builds hybrides. */
    amplification: {
      portee: 'tous',
      selonPVbonusCible: { max: 'MaxBonusDamagePercent', plafondPV: 'MaxBonusHealth' }
    }
  },

  4645: { // Flamme-ombre — Floraicendre
    nom: 'Floraicendre', effet: 'amplification',
    /* +20 % sur les dégâts magiques et bruts, uniquement sous 40 % des PV de la cible.
       La cible étant supposée à pleine vie par défaut, l'amplification vaut alors
       zéro et le dit : c'est un plancher assumé, jamais une moyenne inventée. */
    amplification: {
      portee: 'tous', types: ['magique', 'brut'],
      valeur: 'SpellItemDamageAmp', seuilPVCible: 'HealthThreshold'
    }
  },

  /* Amplifications réelles mais non déterminables ici : elles dépendent d'un état que
     le modèle ne connaît pas (position, contrôle appliqué, élimination récente).
     Les servir à leur valeur maximale gonflerait les builds qui les portent. */
  2523: { nonApplique: 'jusqu\'à +10 % selon la DISTANCE à la cible : dépend du ' +
                       'placement, que le modèle ne connaît pas' },
  4628: { nonApplique: '+10 % après avoir touché à 600 unités au moins : dépend du ' +
                       'placement et d\'une recharge de 30 s' },
  4005: { nonApplique: '+7 % de vulnérabilité après avoir immobilisé la cible : ' +
                       'dépend du kit du champion, hors du modèle d\'objets' },
  6697: { nonApplique: 'AD gagnés à l\'élimination d\'un champion : dépend du déroulé ' +
                       'de la partie (SpellMaxAmp vaut 0 dans le fichier)' },

  /* ── RÉDUCTION DES RÉSISTANCES DE LA CIBLE ──────────────────────────────────
     Cinquième catégorie. Elle n'ajoute aucun dégât et n'amplifie rien : elle abaisse
     l'armure ou la résistance magique de l'adversaire, donc TOUT ce qui le frappe
     ensuite — y compris les dégâts des alliés.

     ⚠ Réduction ≠ pénétration, et l'ordre n'est pas commutatif : la réduction
     s'applique AVANT la pénétration (cf. `resistEffective`). Confondre les deux
     donnerait un chiffre faux dès qu'un build porte les deux, ce qui est le cas
     courant (Couperet noir + Salutations de Dominik). */

  3071: { // Couperet noir — Découpage
    nom: 'Découpage', effet: 'reduction',
    /* 6 % par cumul, 5 cumuls = 30 % d'armure en moins. Vérifié sur le wiki.
       ⚠ Le `RangedMod: 0.5` du fichier ne porte PAS sur le découpage : il modifie la
       vitesse de déplacement de Ferveur, comme le montre `MSBonusSplit` (20 avec un
       facteurDistance de 0,5). Le lire comme un demi-découpage à distance aurait été
       l'erreur symétrique de celle évitée sur la Lance de Shojin — où, elle, la
       version à distance existe bel et bien sous forme de second calcul. */
    reduction: { resistance: 'armure', mode: 'pourcent',
                 valeur: 'ShredPerStack', cumuls: 'MaxStacks', declenchePar: 'physique' },
    note: 'cumuls supposés au maximum ; le wiki précise que la première instance de ' +
          'dégâts n\'en profite pas encore, ce détail n\'est pas modélisé'
  },

  8010: { // Malédiction du sanguinaire — Vile décomposition
    nom: 'Vile décomposition', effet: 'reduction',
    reduction: { resistance: 'rm', mode: 'pourcent',
                 valeur: 'ShredPerStack', cumuls: 'MaxStacks', declenchePar: 'magique' },
    note: 'cumuls supposés au maximum (4 × 7,5 % = 30 %)'
  },

  3118: { // Malfaisance — Brouillard de haine
    nom: 'Brouillard de haine', effet: 'reduction',
    /* Réduction PLATE de 10, et non un pourcentage : le calcul du fichier donne 10 sec
       et le wiki confirme « reduces their magic resistance by 10 ». La lire en
       pourcentage aurait donné 10 % — trois fois moins sur une cible à 100 de RM. */
    reduction: { resistance: 'rm', mode: 'plat', calcul: 'MagicResistanceShred',
                 condition: { apresUltime: true, libelle: 'après avoir touché avec l\'ultime' } },
    /* Mépris : +20 d'accélération d'ULTIME, inconditionnelle. Un objet peut donc porter
       à la fois une réduction de résistance et un gain de stat — les deux catégories
       sont lues indépendamment. */
    statsAccordees: [{ stat: 'accelUltime', valeur: 'UltimateHaste' }],
    note: 'les dégâts de zone du sol brûlé ne sont pas comptés en cible unique'
  },

  /* Boucliers réels mais non chiffrables ici. */
  3190: { nonApplique: 'Dévotion : le bouclier (290 à 360 PV) est posé sur les ALLIÉS ' +
                       'proches, pas sur le porteur — hors d\'un calcul en cible unique' },
  3102: { nonApplique: 'bouclier ANTISORTS : il bloque une compétence entière, sa valeur ' +
                       'dépend donc du sort bloqué et non d\'un montant' },
  3814: { nonApplique: 'bouclier antisorts : même raison que le Voile de la banshee' },
  6695: { nonApplique: 'Briseur de boucliers : réduit les boucliers REÇUS PAR LA CIBLE ; ' +
                       'utile contre une composition à boucliers, sans effet sur le porteur' },

  3033: { nonApplique: 'Hémorragie : réduit les soins de la cible, aucun dégât' },
  3165: { nonApplique: 'Hémorragie : réduit les soins de la cible, aucun dégât' },
  3085: { nonApplique: 'les projectiles touchent des cibles SUPPLÉMENTAIRES : ' +
                       'aucun gain en cible unique' }
};
