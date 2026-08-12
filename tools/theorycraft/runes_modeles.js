/* Comportement des runes — encodé à la main À PARTIR DES DESCRIPTIONS OFFICIELLES
   (perks_fr.json), jamais de mémoire.

   Les VALEURS ne sont pas ici : elles sont lues dans runes.json à l'évaluation. Ce
   fichier ne décrit que la FORME du calcul et la condition de déclenchement. C'est
   ce qui permet à un changement d'équilibrage de se propager sans toucher au code.

   Conventions :
     effet        degats | soin | bouclier | stat | amplification | utilitaire
     montant.niveau        [cléMin, cléMax]  → interpolation linéaire niveau 1→18
     montant.ratios        [[clé, stat, mode, diviseur?], …]
     montant.pourcentStat  [clé, stat, mode]  → la clé EST un pourcentage de la stat
     montant.parCumul      [cléMin, cléMax, cléMaxCumuls]
     distance.facteurCle   clé du multiplicateur appliqué aux champions à distance
     distance.remplace     [cléMin, cléMax] entièrement différentes à distance

   Une rune non modélisable porte `nonModelise` avec la raison. On préfère refuser
   que produire un chiffre faux. */

module.exports = {

  // ───────────────────────────── DOMINATION ─────────────────────────────

  8112: { // Électrocution
    effet: 'degats', typeDegats: 'adaptatif', cooldown: 'Cooldown',
    declencheur: { type: 'frappes', n: 3, distinctes: true, fenetre: 3,
                   sources: ['attaque', 'competence'] },
    montant: { niveau: ['DamageBase', 'DamageMax'],
               ratios: [['BonusADRatio', 'AD', 'bonus'], ['APRatio', 'AP']] }
  },

  8128: { // Moisson noire
    effet: 'degats', typeDegats: 'adaptatif', cooldown: 'Cooldown',
    declencheur: { type: 'seuilPvCible', seuilCle: 'HarvestThreshold',
                   note: 'cible sous 50% de PV ; le délai retombe à 1 s à chaque élimination' },
    montant: { fixe: 'BaseDamage', parAme: 'DamagePerSoulEssence',
               ratios: [['ADRatio', 'AD', 'bonus'], ['APRatio', 'AP']] },
    notes: 'Cumul permanent : passer `ames` dans le contexte.'
  },

  9923: { // Déluge de lames
    effet: 'degats', typeDegats: 'brut', cooldown: 'Cooldown',
    declencheur: { type: 'attaque', n: 'NumHits', fenetre: 'Duration',
                   note: 'les 3 attaques suivant la première attaque sur un champion' },
    montant: { niveau: ['BonusDamageMin', 'BonusDamageMax'],
               ratios: [['BonusADRatio', 'AD', 'bonus'], ['APRatio', 'AP']] },
    notes: 'Accorde aussi +90% de vitesse d\'attaque (60% à distance) — cf. ASBoost.'
  },

  // ───────────────────────────── INSPIRATION ─────────────────────────────

  8351: { // Optimisation glaciale
    effet: 'utilitaire', unite: '% de ralentissement',
    declencheur: { type: 'immobilisation' }, cooldown: 'Cooldown',
    // « 20% (+90% tous les 100% d'efficacité soins/boucliers) (+6% tous les 100 pts
    //   de puissance) (+7% tous les 100 pts d'AD bonus) »
    montant: { fixe: 'SlowZoneSlowBase',
               ratios: [['SlowZoneSlowAPRatio', 'AP', 'total', 100],
                        ['SlowZoneSlowbADRatio', 'AD', 'bonus', 100],
                        ['SlowZoneSlowHealShieldRatio', 'SB', 'total', 100]] },
    notes: 'Réduit aussi les dégâts des ennemis touchés de 15% (DmgReduction).'
  },

  /* Grimoire déchaîné — « Unsealed Spellbook ». Ses clés hachées portent des détails
     secondaires (délais de 5 s et 10 s à la sélection et à l'usage) ; l'essentiel est
     lisible et concorde avec le wiki : 270 s de délai initial = ShardRechargeMinutes
     (4,5 min), −25 s par sort unique, premier échange à 6 minutes. */
  8360: {
    effet: 'utilitaire', unite: 's de délai entre deux échanges',
    declencheur: { type: 'minuteDeJeu', note: 'premier échange à 6 min, hors combat' },
    montant: { fixe: 'ShardRechargeMinutes' },
    notes: 'Valeur en MINUTES (4,5 = 270 s). Chaque sort d\'invocateur inédit choisi '
         + 'retire définitivement 25 s (ShardRechargeReductionSeconds). Il faut passer '
         + 'par 3 sorts différents avant d\'en reprendre un. Aucun effet sur les dégâts.'
  },

  8369: { // Premier coup
    effet: 'amplification', unite: '% de dégâts en plus',
    declencheur: { type: 'ouvertureCombat', fenetre: 'GraceWindow',
                   note: 'première frappe dans les 0,25 s suivant le début du combat' },
    montant: { fixe: 'DamageAmp' },
    notes: 'Dure 3 s. Rapporte aussi 10 PO puis 50% des dégâts bonus en or (35% à distance).'
  },

  // ───────────────────────────── PRÉCISION ─────────────────────────────

  8005: { // Attaque soutenue
    effet: 'degats', typeDegats: 'adaptatif', cooldown: 'Cooldown',
    declencheur: { type: 'frappes', n: 3, consecutives: true, sources: ['attaque'],
                   note: '3 attaques de base consécutives sur le même champion' },
    montant: { niveau: ['MinDamage', 'MaxDamage'] },
    notes: 'Amplifie ensuite de 8% tous vos dégâts (BonusPercentDamage) jusqu\'à la '
         + 'sortie de combat — cette part se cumule au reste du build.'
  },

  8008: { // Tempo mortel
    effet: 'degats', typeDegats: 'adaptatif',
    declencheur: { type: 'cumulsMax', cumulsCle: 'MaxStacks',
                   note: 'seulement au maximum d\'effets cumulés (6)' },
    montant: { niveau: ['TTMinNoteDamageMelee', 'TTMaxNoteDamageMelee'],
               multiplieParStat: ['VA'] },
    distance: { remplace: ['TTMinNoteDamageRanged', 'TTMaxNoteDamageRanged'] },
    notes: 'Dégâts augmentés de 1% par 1% de vitesse d\'attaque bonus : passer '
         + '`vitesseAttaqueBonus` (0.4 = +40%).'
  },

  8010: { // Conquérant
    effet: 'stat', unite: 'force adaptative',
    declencheur: { type: 'frappes', sources: ['attaque', 'competence'],
                   note: '2 cumuls par frappe ; 1 seul par attaque pour les champions à distance' },
    montant: { parCumul: ['MinAdaptivePerStack', 'MaxAdaptivePerStack', 'MaxStacks'] },
    notes: 'Au maximum d\'effets, rend 8% des dégâts infligés en PV (5% à distance).'
  },

  8021: { // Jeu de jambes
    effet: 'soin',
    declencheur: { type: 'energie', note: 'attaque énergisée, à 100 effets Énergie' },
    montant: { niveau: ['HealBase', 'HealMax'],
               ratios: [['HealBonusADRatio', 'AD', 'bonus'], ['HealAPRatio', 'AP']] },
    distance: { facteurCle: 'RangedHealMod' },
    notes: 'Accorde aussi +20% de vitesse de déplacement pendant 1 s (75% à distance).'
  },

  // ───────────────────────────── SORCELLERIE ─────────────────────────────

  8214: { // Invocation d'Aery
    declencheur: { type: 'frappeOuSoutien',
                   note: 'blesser un ennemi (dégâts) ou renforcer un allié (bouclier)' },
    variantes: {
      degats: { effet: 'degats', typeDegats: 'adaptatif',
                montant: { niveau: ['DamageBase', 'DamageMax'],
                           ratios: [['DamageADRatio', 'AD', 'bonus'], ['DamageAPRatio', 'AP']] } },
      bouclier: { effet: 'bouclier',
                  montant: { niveau: ['ShieldBase', 'ShieldMax'],
                             ratios: [['ShieldRatioAD', 'AD', 'bonus'], ['ShieldRatio', 'AP']] } }
    },
    notes: 'Aery doit être revenue avant de repartir : pas de délai fixe, mais un aller-retour.'
  },

  8229: { // Comète arcanique
    effet: 'degats', typeDegats: 'adaptatif', cooldown: 'RechargeTime',
    declencheur: { type: 'competence', note: 'blesser un champion avec une compétence' },
    montant: { niveau: ['DamageBase', 'DamageMax'],
               ratios: [['ADRatio', 'AD', 'bonus'], ['APRatio', 'AP']] },
    notes: 'Délai réduit jusqu\'à 8 s. Dégâts amplifiés jusqu\'à +100% selon la distance '
         + '(MaxDamageAmp, plafond à 750 unités) — non appliqué ici, il dépend du placement.'
  },

  8230: { // Assaut du maraudeur
    effet: 'utilitaire', unite: '% de vitesse de déplacement', cooldown: 'MaxCooldown',
    declencheur: { type: 'degatsInfliges', seuilCle: 'DamageThreshold', fenetre: 'Window',
                   note: '25% des PV max d\'un champion en moins de 3 s' },
    montant: { fixe: 'HasteMax' },
    distance: { facteurCle: 'RangedEffectiveness' },
    notes: 'Accorde aussi 50% de résistance aux ralentissements pendant 4 s.'
  },

  8992: { // Toucher de feu mortel
    effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'competence', note: 'brûlure appliquée par une compétence' },
    // La borne haute (12) n'a pas de nom résolu par CommunityDragon.
    montant: { niveau: ['Level1DamageTOOLTIP', '{2156e250}'],
               ratios: [['ADRatio', 'AD', 'bonus'], ['APRatio', 'AP']] },
    notes: 'Valeur PAR SECONDE. Après 3 s de brûlure, +75% (DamageMultiplier). '
         + 'Durée 4 s en cible unique. ⚠ la borne haute vient d\'une clé non résolue '
         + '({2156e250}) : à revérifier si CommunityDragon la nomme un jour.'
  },

  // ───────────────────────────── VOLONTÉ ─────────────────────────────

  8437: { // Poigne de l'immortel
    effet: 'degats', typeDegats: 'magique',
    declencheur: { type: 'periodique', intervalleCle: 'TriggerTime', sources: ['attaque'],
                   note: 'toutes les 4 s en combat, sur la prochaine attaque de base' },
    montant: { pourcentStat: ['PercentHealthDamage', 'PV', 'total'] },
    distance: { facteurCle: 'RangedPenaltyMod' },
    notes: 'Rend en plus 1,3% des PV max et accorde +5 PV définitifs (2 à distance).'
  },

  8439: { // Après-coup
    effet: 'degats', typeDegats: 'magique', cooldown: 'Cooldown',
    declencheur: { type: 'immobilisation', note: 'explosion 2,5 s après l\'immobilisation' },
    montant: { niveau: ['StartingBaseDamage', 'MaxBaseDamage'],
               ratios: [['HealthRatio', 'PV', 'bonus']] },
    notes: 'Accorde d\'abord 45 + 75% des résistances bonus, plafonné à 80-150 selon le niveau.'
  },

  8465: { // Gardien
    effet: 'bouclier', cooldown: 'Cooldown',
    declencheur: { type: 'protectionAllie', seuilCle: 'ThresholdMin',
                   note: 'allié à moins de 350 unités subissant plus que des dégâts mineurs' },
    montant: { niveau: ['ShieldBase', 'ShieldMax'],
               ratios: [['APRatio', 'AP'], ['HPRatio', 'PV', 'bonus']] },
    notes: 'Délai réduit de 75 s à 40 s avec le niveau.'
  },

  /* ═════════════════════════════ FRAGMENTS ═════════════════════════════
     Toujours actifs, aucun déclencheur. La « force adaptative » vaut X en
     puissance OU 0,6 X en dégâts d'attaque : le fragment 5008 le prouve
     (StatGain2 = 9 puissance, StatGain1 = 5,4 = 0,6 x 9). */

  5005: { effet: 'stat', unite: '% de vitesse d\'attaque', declencheur: { type: 'permanent' },
          montant: { fixe: 'StatGain' } },
  5007: { effet: 'stat', unite: 'accélération de compétence', declencheur: { type: 'permanent' },
          montant: { fixe: 'HasteGain' } },
  5008: { effet: 'stat', unite: 'force adaptative', declencheur: { type: 'permanent' },
          montant: { fixe: 'StatGain2' },
          notes: '9 puissance OU 5,4 dégâts d\'attaque (StatGain1).' },
  5010: { effet: 'stat', unite: '% de vitesse de déplacement', declencheur: { type: 'permanent' },
          montant: { fixe: 'StatGain1' } },
  5001: { effet: 'stat', unite: 'PV', declencheur: { type: 'permanent' },
          montant: { niveau: ['StatGainMin', 'StatGainMax'] } },
  5011: { effet: 'stat', unite: 'PV', declencheur: { type: 'permanent' },
          montant: { fixe: 'StatGain' } },
  5013: { effet: 'stat', unite: '% de ténacité', declencheur: { type: 'permanent' },
          montant: { fixe: 'StatGain' } },

  /* ═════════════════════════════ MINEURES ═════════════════════════════ */

  // ── Domination
  8126: { effet: 'degats', typeDegats: 'brut', cooldown: 'Cooldown',
          declencheur: { type: 'cibleImmobilisee', note: 'dégâts survenant après la restriction' },
          montant: { niveau: ['DamageIncMin', 'DamageIncMax'] } },
  8139: { effet: 'soin', cooldown: 'Cooldown',
          declencheur: { type: 'frappes', sources: ['attaque', 'competence'] },
          montant: { niveau: ['HealAmount', 'HealAmountMax'],
                     ratios: [['ADRatio', 'AD', 'bonus'], ['APRatio', 'AP']] } },
  8143: { effet: 'degats', typeDegats: 'brut', cooldown: 'Cooldown',
          declencheur: { type: 'apresDeplacement', fenetre: 'ArmedDuration',
                         note: 'ruée, bond, saut, téléportation ou sortie de furtivité' },
          montant: { niveau: ['MinDamageTooltip', 'MaxDamageTooltip'] } },
  8137: { effet: 'utilitaire', declencheur: { type: 'permanent' },
          notes: 'Détection de balises. Aucun effet sur les dégâts.' },
  8140: { effet: 'stat', unite: 'accélération de relique', declencheur: { type: 'cumulsEliminations' },
          montant: { fixe: 'TrinketAH' },
          notes: 'Par souvenir, jusqu\'à 18 (MaxStacks). Valeur affichée = 1 souvenir.' },
  8141: { effet: 'utilitaire', declencheur: { type: 'permanent' },
          notes: 'Durée des balises en jungle ennemie. Aucun effet sur les dégâts.' },
  8105: { effet: 'stat', unite: 'vitesse de déplacement hors combat',
          declencheur: { type: 'cumulsEliminations' }, montant: { fixe: 'OOCMS' },
          notes: 'Par effet Chasseur de primes cumulé.' },
  8106: { effet: 'stat', unite: 'accélération d\'ultime',
          declencheur: { type: 'cumulsEliminations' }, montant: { fixe: 'StartingUltAH' },
          notes: 'Base 6, puis +5 par effet Chasseur de primes (AdditionalUltAH).' },
  8135: { effet: 'utilitaire', unite: 'PO', declencheur: { type: 'cumulsEliminations' },
          montant: { fixe: 'BaseGoldAmount' },
          notes: '+20 PO par cumul, plafonné à 130. Aucun effet sur les dégâts.' },

  // ── Inspiration
  8304: { effet: 'stat', unite: 'vitesse de déplacement', declencheur: { type: 'minuteDeJeu' },
          montant: { fixe: 'AdditionalMovementSpeed' },
          notes: 'Bottes offertes à 12 min ; interdiction d\'en acheter avant.' },
  8306: { effet: 'utilitaire', declencheur: { type: 'sortInvocateur' },
          notes: 'Remplace Saut éclair en récupération. Aucun effet sur les dégâts.' },
  8321: { effet: 'utilitaire', unite: '% des PO remboursées', declencheur: { type: 'achatObjet' },
          montant: { fixe: 'PercentRefund' },
          notes: 'Sur les objets légendaires. Plusieurs clés non résolues, mais le '
               + 'remboursement lui-même est lisible.' },
  8313: { effet: 'utilitaire', declencheur: { type: 'niveauAtteint' },
          notes: 'Trois élixirs aux niveaux 3, 6 et 9. Non chiffrable ici.' },
  8345: { effet: 'soin', declencheur: { type: 'consommable' },
          montant: { fixe: 'FlatHeal', pourcentStat: ['HealthHealPercent', 'PV', 'total'] },
          notes: '⚠ le texte français annonce 2% des PV max, le fichier de jeu dit 1,5% '
               + '(HealthHealPercent). On retient le fichier. Soins majorés selon les PV manquants.' },
  8352: { effet: 'utilitaire', unite: '% de la potion rendu aussitôt', cooldown: 'Cooldown',
          declencheur: { type: 'consommable' }, montant: { fixe: 'RestorationPercentage' } },
  /* Polyvalence — « Jack of All Trades » en anglais. Ses deux clés hachées ont été
     identifiées en confrontant leurs valeurs au wiki officiel : {1b48f5ea}=8 est le
     bonus à 5 cumuls, {55d14eea}=20 le total à 10 cumuls. Le wiki donne aussi les
     contreparties en AD (4,8 et 12), soit exactement 60% — la règle adaptative tient. */
  8316: { effet: 'stat', unite: 'accélération de compétence',
          declencheur: { type: 'statsObjets',
                         note: '1 cumul par type de statistique distinct apporté par vos objets' },
          montant: { fixe: 'HastePerStack' },
          notes: 'Par cumul. Paliers adaptatifs : +8 puissance (4,8 AD) à 5 cumuls, '
               + '+20 puissance (12 AD) au total à 10 cumuls — clés {1b48f5ea} et '
               + '{55d14eea}, identifiées par recoupement avec le wiki officiel.' },
  8347: { effet: 'stat', unite: 'accélération de sort d\'invocateur',
          declencheur: { type: 'permanent' }, montant: { fixe: 'SummonerHaste' },
          notes: 'Et +10 accélération d\'objet (ItemHaste).' },
  8410: { effet: 'utilitaire', unite: '% de vitesse de déplacement',
          declencheur: { type: 'cibleImmobilisee' },
          montant: { fixe: 'MovementSpeedPercentBonus' },
          notes: 'Moitié moins vers les cibles immobilisées par un allié.' },

  // ── Précision
  8009: { effet: 'utilitaire', unite: 'mana rendue', cooldown: 'CooldownDuration',
          declencheur: { type: 'frappes', sources: ['attaque', 'competence'] },
          montant: { niveau: ['MinFlatRestore', 'MaxFlatRestore'] },
          notes: '80% d\'efficacité à distance. 6 d\'énergie pour les champions à énergie.' },
  9101: { effet: 'soin', declencheur: { type: 'elimination', note: 'tuer une cible, sbires compris' },
          montant: { niveau: ['TooltipMinHeal', 'TooltipMaxHeal'] } },
  9111: { effet: 'soin', declencheur: { type: 'participationElimination' },
          montant: { pourcentStat: ['TriumphMaxHealthRestored', 'PV', 'total'] },
          notes: 'Et 5% des PV MANQUANTS (MissingHealthRestored) + 20 PO. Seule la part '
               + 'sur les PV max est calculée ici, l\'autre dépend de l\'état courant.' },
  9103: { effet: 'stat', unite: '% de vol de vie', declencheur: { type: 'cumulsLegende' },
          montant: { fixe: 'LifeStealPerStack' },
          notes: 'Par cumul, max 15 (soit 6,75%). +85 PV max au maximum de cumuls.' },
  9104: { effet: 'stat', unite: '% de vitesse d\'attaque', declencheur: { type: 'cumulsLegende' },
          montant: { fixe: 'AttackSpeedBase' },
          notes: 'Base 3%, puis +1,5% par cumul (max 10) → 18% au plein.' },
  9105: { effet: 'stat', unite: 'accélération de compétence', declencheur: { type: 'cumulsLegende' },
          montant: { fixe: 'HastePerStack' },
          notes: 'Par cumul, max 10 (soit 15).' },
  8014: { effet: 'amplification', unite: '% de dégâts en plus',
          declencheur: { type: 'seuilPvCible', seuilCle: 'EnemyHealthPercentageThreshold',
                         sens: 'sous', note: 'cible sous 40% de PV' },
          montant: { fixe: 'BonusPercentDamage' } },
  8017: { effet: 'amplification', unite: '% de dégâts en plus',
          declencheur: { type: 'seuilPvCible', seuilCle: 'EnemyHealthPercentageThreshold',
                         sens: 'au-dessus', note: 'cible au-dessus de 60% de PV' },
          montant: { fixe: 'BonusPercentDamage' } },
  8299: { effet: 'amplification', unite: '% de dégâts en plus',
          declencheur: { type: 'seuilPvPorteur', note: 'sous 60% de vos PV, maximum atteint à 30%' },
          montant: { fixe: 'MaxBonusDamagePercent' },
          notes: 'De 5% (MinBonusDamagePercent) à 11% selon VOS PV manquants. '
               + 'La valeur donnée est le maximum.' },

  // ── Sorcellerie
  8224: { effet: 'amplification', unite: '% de dégâts d\'ultime en plus',
          declencheur: { type: 'ultime' }, montant: { fixe: 'DamageAmp' },
          notes: '8% seulement pour les dégâts de zone (AOEAmp). Réduit aussi le délai '
               + 'de l\'ultime de 7% par participation à une élimination.' },
  8226: { effet: 'stat', unite: 'mana max', cooldown: 'Cooldown',
          declencheur: { type: 'competence' }, montant: { fixe: 'ManaIncrease' },
          notes: 'Par frappe, jusqu\'à +250 (MaxManaIncrease).' },
  8275: { effet: 'utilitaire', unite: '% de vitesse de déplacement',
          declencheur: { type: 'sortInvocateur' }, montant: { fixe: 'HighCDMSBoost' },
          notes: 'De 15% à 45% selon le délai du sort d\'invocateur utilisé. '
               + 'La valeur donnée est le maximum.' },
  8233: { effet: 'stat', unite: 'force adaptative (puissance)',
          declencheur: { type: 'seuilPvPorteur', seuilCle: 'HealthPercent',
                         note: 'au-dessus de 70% de vos PV' },
          montant: { niveau: ['MinAdaptive', 'MaxAdaptive'] },
          notes: '3 → 30 puissance, ou 1,8 → 18 dégâts d\'attaque (60%).' },
  8234: { effet: 'stat', unite: '% de vitesse de déplacement', declencheur: { type: 'permanent' },
          montant: { fixe: 'PercentMS' },
          notes: 'Et tous vos autres bonus de vitesse sont 7% plus efficaces.' },
  8232: { effet: 'stat', unite: 'force adaptative (puissance)',
          declencheur: { type: 'zone', note: 'dans la rivière' },
          montant: { niveau: ['MinAdaptive', 'MaxAdaptive'] },
          notes: 'Et +10 vitesse de déplacement.' },
  8236: { effet: 'stat', unite: 'force adaptative (puissance)',
          declencheur: { type: 'minuteDeJeu', intervalleCle: 'UpdateAfterMinutes' },
          montant: { fixe: 'AdaptiveAP' },
          notes: 'Progression triangulaire : à n intervalles de 10 min, le total vaut '
               + 'AdaptiveAP x n(n+1)/2 → 8, 24, 48, 80, 120, 168… La valeur donnée est '
               + 'celle du premier palier.' },
  8210: { effet: 'stat', unite: 'accélération de compétence',
          declencheur: { type: 'niveauAtteint', note: '+5 au niveau 5, +5 de plus au niveau 8' },
          montant: { fixe: 'HasteBonus1' },
          notes: 'Valeur d\'un palier ; 10 au total à partir du niveau 8. Au niveau 11, '
               + 'une participation à une élimination rend 20% du délai restant.' },
  8237: { effet: 'degats', typeDegats: 'magique', cooldown: 'BurnlockoutDuration',
          declencheur: { type: 'competence', note: 'dégâts appliqués 1 s après la frappe' },
          montant: { niveau: ['Damage', 'DamageMax'] } },

  // ── Volonté
  8401: { effet: 'degats', typeDegats: 'adaptatif',
          declencheur: { type: 'apresBouclier', fenetre: 'ProcDuration',
                         note: 'prochaine attaque de base après avoir reçu un bouclier' },
          // Ces deux clés sont stockées en points de pourcentage (2,5 et 15), d'où /100.
          montant: { niveau: ['ProcBaseMin', 'ProcBaseMax'],
                     ratios: [['BonusHealthRatio', 'PV', 'bonus', 100]] },
          notes: 'Et +15% des PV du bouclier reçu (ShieldRatio) — dépend du bouclier, non calculé ici.' },
  8446: { effet: 'degats', typeDegats: 'physique', cooldown: 'CooldownSeconds',
          declencheur: { type: 'tourelle', note: 'troisième attaque contre une tourelle' },
          montant: { fixe: 'BaseDamageMelee',
                     pourcentStat: ['HPRatioMelee', 'PV', 'total'] },
          distance: { remplaceFixe: 'BaseDamageRanged', pourcentStatCle: 'HPRatioRanged' },
          notes: 'À distance : 50 + 20% des PV max (HPRatioRanged). Ne touche que les tourelles.' },
  /* Fontaine de vie — seul cas de tout le jeu de runes où le montant n'existe dans
     AUCUNE clé du fichier. Valeurs relevées sur le wiki officiel ; le rapport
     7/10 = 38,29/54,71 = 0,7 tombe exactement sur le RangedMod du fichier de jeu, ce
     qui fait concorder les deux sources et donne confiance dans la saisie. */
  8463: { effet: 'soin', cooldown: 'Cooldown',
          declencheur: { type: 'cibleImmobilisee',
                         note: 'soigne vous-même et l\'allié le plus blessé à moins de 1000 unités' },
          valeursExternes: {
            source: 'wiki officiel League of Legends, relevé le 12/08/2026',
            valeurs: { SoinMin: 10, SoinMax: 54.71 }
          },
          montant: { niveau: ['SoinMin', 'SoinMax'] },
          distance: { facteurCle: 'RangedMod' },
          notes: 'Le fichier de jeu ne porte pas le montant du soin — seules ces deux '
               + 'bornes viennent d\'une source externe. À revérifier à chaque patch : '
               + 'elles ne se mettront pas à jour toutes seules, contrairement au reste.' },
  8429: { effet: 'stat', unite: 'armure et résistance magique',
          declencheur: { type: 'minuteDeJeu', note: 'à partir de 12 minutes' },
          montant: { fixe: 'ArmorBase' },
          notes: 'Et +3% de vos résistances totales (ExtraResist).' },
  8444: { effet: 'soin', unite: '% des PV manquants',
          declencheur: { type: 'degatsSubis', note: 'régénération étalée sur 10 s' },
          montant: { fixe: 'RegenPercentMax' } },
  8473: { effet: 'utilitaire', unite: 'dégâts bloqués', cooldown: 'Cooldown',
          declencheur: { type: 'degatsSubis', note: 'les 3 frappes suivantes' },
          montant: { niveau: ['BlockBase', 'BlockMax'] } },
  8242: { effet: 'stat', unite: 'armure et résistance magique',
          declencheur: { type: 'immobiliseSubie' }, montant: { fixe: 'ResistMin' } },
  8451: { effet: 'stat', unite: 'PV', declencheur: { type: 'sbiresMorts' },
          montant: { fixe: 'FlatHealthPerTier' },
          notes: 'Par tranche de 8 sbires/monstres. Puis +3,5% de PV max à 120 unités absorbées.' },
  8453: { effet: 'stat', unite: '% d\'efficacité des soins et boucliers',
          declencheur: { type: 'permanent' }, montant: { fixe: 'HealShieldPower' },
          notes: 'Et +10% sur les cibles sous 40% de PV.' }
};
