/* Corrections déclarées, sort par sort — les 11 lacunes de l'audit de couverture.

   Même principe que `items_modeles.js` : ce fichier n'invente aucun NOMBRE. Il déclare
   seulement ce que l'extraction automatique ne peut pas deviner :
     — le GENRE d'un calcul dont le nom ne contient pas « damage » (Vayne : `ADRatioBonus`) ;
     — le TYPE de dégâts quand l'infobulle française ne le nomme pas ;
     — les sorts dont les nombres vivent dans les DataValues et non dans un calcul.

   Chaque entrée porte sa `source`. Deux sources seulement, dans cet ordre :
     1. l'infobulle FRANÇAISE de Riot, quand elle nomme le type noir sur blanc ;
     2. le wiki officiel, quand elle ne le nomme pas — et alors la valeur reste celle
        du FICHIER, jamais celle du wiki.

   ⚠ Piège rencontré en vérifiant Rek'Sai : le wiki mêle à ses tableaux des lignes
   d'HISTORIQUE DE PATCH. « Base damage reduced to 50/75/100/125/150 » y voisine avec la
   valeur courante ; le fichier donne 30/55/80/105/130, avec le même pas de 25 et le même
   ratio de 0,8 puissance. C'est le fichier qui fait foi — le wiki n'a servi qu'à établir
   le TYPE (magique), qu'il n'y a aucune raison de retrouver dans un historique. */

module.exports = {

  /* ── Genre mal deviné : le calcul existe et se résout, mais son nom ne dit pas
        « dégâts », donc l'heuristique le rangeait en « autre ». ───────────────── */

  Vayne: {
    Q: {
      genres: { ADRatioBonus: 'degats' },
      type: 'physique',
      source: 'infobulle FR : « Sa prochaine attaque inflige … pts de dégâts physiques supplémentaires »'
    },
    /* ⚠ Le W est déclaré ICI et non plus bas, avec les autres pourcentages de PV de
       l'élargissement. Une SECONDE clé `Vayne:` dans ce littéral aurait écrasé la
       première sans le moindre avertissement, et la correction du Q aurait disparu —
       exactement le genre de panne muette que ce fichier existe pour éviter. */
    W: {
      ajouter: {
        DegatsTroisiemeCoup: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'TotalDamage' }]
        }
      },
      type: 'brut',
      source: 'wiki officiel — Carreaux d\'argent : 6/7/8/9/10 % des PV max, dégâts BRUTS ' +
              '(identique au fichier)',
      note: 'un coup sur trois ; le plancher de 50/65/80/95/110 n\'est pas appliqué'
    }
  },

  /* ── Type absent de l'infobulle : vérifié sur le wiki officiel, valeurs du fichier ── */

  Ashe: {
    Q: { type: 'physique',
         source: 'wiki officiel — Concentration du ranger, « Sub-type(s): Physical damage »' }
  },

  Jayce: {
    R: { type: 'magique',
         source: 'wiki officiel — Marteau Mercury : « bonus magic damage » sur la prochaine attaque',
         note: 'la forme Canon applique une RÉDUCTION de résistances, pas des dégâts : ' +
               'le calcul `Damage` extrait est celui de la forme Marteau' }
  },

  RekSai: {
    W: { type: 'magique',
         source: 'wiki officiel — Jaillissement inflige des dégâts magiques',
         note: 'le wiki affiche 50/75/100/125/150 dans une ligne d\'HISTORIQUE de patch ; ' +
               'le fichier donne 30/55/80/105/130, même pas et même ratio. Le fichier prime.' }
  },

  Yunara: {
    R: { type: 'magique',
         source: 'wiki officiel — l\'ultime ne blesse pas lui-même ; il renforce le W, ' +
                 'dont les 160 + 120 % AD bonus + 75 % AP correspondent au calcul extrait',
         note: 'les dégâts portés par ce calcul sont ceux du W renforcé pendant l\'ultime' }
  },

  /* ── Sorts dont les nombres sont dans les DataValues, sans calcul associé ─────
        Les trois travaillent en pourcentage des PV de la CIBLE : la mécanique est la
        même que celle de la Lame du roi déchu, déjà modélisée côté objets. Confondre
        PV actuels et PV max change le résultat du simple au triple. ─────────────── */

  DrMundo: {
    Q: {
      ajouter: {
        CurrentHealthDamage: {
          genre: 'degats',
          termes: [{ stat: 'PVactuelsCible', mode: 'total', dv: 'currenthealthdamage' }]
        }
      },
      type: 'magique',
      source: 'infobulle FR : « … % des PV ACTUELS en dégâts magiques »',
      note: 'le plancher (`minimumdamage`) et le plafond contre monstres ne sont pas appliqués'
    }
  },

  Kalista: {
    W: {
      ajouter: {
        MaxHealthDamage: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', dv: 'maxhealthdamage' }]
        }
      },
      type: 'magique',
      source: 'infobulle FR : « Kalista inflige … % des PV MAX en dégâts magiques »',
      note: 'exige que le pactisant attaque la même cible ; recharge de 4 s par cible'
    }
  },

  Camille: {
    R: {
      ajouter: {
        AttaqueRenforcee: {
          genre: 'degats',
          /* La DataValue est exprimée en POINTS de pourcentage (2, 4, 6…) : d'où le
             centième. Le wiki confirme 4/6/8 % aux trois rangs de l'ultime. */
          termes: [{ stat: 'PVactuelsCible', mode: 'total', dv: 'rpercentcurrenthpdamage', echelle: 0.01 }]
        }
      },
      type: 'magique',
      source: 'wiki officiel — « Bonus Magic Damage: 4 / 6 / 8 % of target\'s current health »',
      note: 'bonus porté par CHAQUE attaque de Camille sur la cible emprisonnée, ' +
            'pas un montant unique à l\'activation'
    }
  },

  /* ── Ce qui n'est pas un sort ────────────────────────────────────────────────
        Les deux « sorts » d'Aphelios sont des enveloppes d'infobulle
        (`ClientTooltipWrapper`) : leur texte se réduit à un gabarit non résolu et leurs
        calculs agrègent des valeurs de plusieurs armes, chacune avec son propre type.
        Leur attribuer un type unique serait une invention pure. On les marque comme
        non exploitables — un refus explicite vaut mieux qu'un chiffre plausible. */

  Aphelios: {
    Q: { nonExploitable: 'enveloppe d\'infobulle (ClientTooltipWrapper) : agrège plusieurs armes' },
    E: { nonExploitable: 'enveloppe d\'infobulle (ClientTooltipWrapper) : agrège plusieurs armes' }
  },

  /* ═══ ÉLARGISSEMENT DU PANEL — 90 → 173 champions ═══════════════════════════════
     Les 83 champions ajoutés ont ouvert 15 lacunes. Même méthode qu'au-dessus : les
     VALEURS restent celles du fichier, le wiki ne sert qu'à établir le type et à
     recouper le rang. Le recoupement a d'ailleurs confirmé l'indexation : Garen Q
     porte `BaseDamage [0,30,60,90,120,…]`, index 0 = rang 0 factice, et le wiki donne
     bien 30/60/90/120/150. ────────────────────────────────────────────────────── */

  /* ── Type absent de l'infobulle ─────────────────────────────────────────────── */

  Akshan: {
    W: { type: 'physique',
         source: 'wiki officiel — Combat déloyal (passif) : second tir, dégâts physiques',
         note: 'le calcul `SecondAutoDamage` est rangé dans le bloc du W, mais il ' +
               'appartient au PASSIF ; le W lui-même n\'inflige rien' }
  },

  Elise: {
    R: { type: 'magique',
         source: 'wiki officiel — les araignéides infligent des dégâts magiques' }
  },

  Gangplank: {
    Q: { type: 'physique',
         source: 'wiki officiel — Pourparlers : « physical damage », 10/40/70/100/130 + 100 % AD' },
    /* Le baril inflige les dégâts de l'ATTAQUE (en ignorant 40 % d'armure) plus un
       bonus fixe contre les champions. Seul le bonus est ici : la part « dégâts de
       l'attaque » dépend de l'attaque qui déclenche l'explosion, et la pénétration
       d'armure de 40 % ne s'applique qu'à elle. Servir le total demanderait de choisir
       une attaque — c'est le calculateur d'attaque qui la fournit, pas ce fichier. */
    E: {
      ajouter: {
        BonusDegatsChampions: {
          genre: 'degats',
          termes: [{ stat: 'flat', mode: 'flat', dv: 'bonusdamagetochampions' }]
        }
      },
      type: 'physique',
      source: 'wiki officiel — Baril de poudre : « 75 / 95 / 115 / 135 / 155 » dégâts ' +
              'physiques bonus contre les champions (identique au fichier)',
      note: 'la part « dégâts de l\'attaque », et la pénétration de 40 % d\'armure qui ' +
            'ne concerne qu\'elle, ne sont pas comptées ici'
    }
  },

  Heimerdinger: {
    Q: { type: 'magique',
         source: 'wiki officiel — tourelle H-28G : dégâts magiques ; le fichier donne ' +
                 '7 + 0,35 AP par tir et 40 + 0,55 AP pour le rayon, valeurs du wiki' }
  },

  Nidalee: {
    R: { type: 'magique',
         source: 'wiki officiel — forme Cougar : Curée, Bond et Griffure infligent des ' +
                 'dégâts magiques' }
  },

  /* ── Pourcentages des PV de la CIBLE ────────────────────────────────────────────
        Ces quatre sorts multiplient les PV adverses par un facteur qui n'est PAS
        constant. Le facteur existe déjà dans le fichier, sous forme de calcul marqué
        « pourcentage » — on le réutilise tel quel (`calc:`) plutôt que d'en recopier
        les nombres, pour ne pas diverger au prochain équilibrage. ───────────────── */

  Evelynn: {
    E: {
      ajouter: {
        DegatsTotal: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'basedamage' },
            { stat: 'PVmaxCible', mode: 'total', calc: 'PercentHealthBaseTOOLTIP' }
          ]
        },
        DegatsRenforce: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'empowereddamage' },
            { stat: 'PVmaxCible', mode: 'total', calc: 'PercentHealthEmpoweredTOOLTIP' }
          ]
        }
      },
      source: 'wiki officiel — Coup de fouet : 60/90/120/150/180 + 3 % des PV max ' +
              '(+ 1,5 % par 100 AP) ; renforcé 80/120/160/200/240 + 4 % (+ 2,5 % par 100 AP)',
      note: 'le plancher de 25 dégâts et le plafond de 450 contre monstres ne sont pas appliqués'
    }
  },

  Illaoi: {
    W: {
      ajouter: {
        DegatsSupplementaires: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'HealthPercentTotal' }]
        }
      },
      source: 'wiki officiel — Dure leçon : 3/3,5/4/4,5/5 % des PV max ' +
              '(+ 3,5 % par 100 AD bonus), identique au fichier',
      note: 'le minimum de 20/30/40/50/60 et le plafond de 300 hors champions ne sont ' +
            'pas appliqués ; le bond lui-même porte l\'attaque, comptée à part'
    }
  },

  /* ── Pourcentages des PV MANQUANTS ──────────────────────────────────────────────
        À pleine vie ces sorts valent ZÉRO, et c'est l'hypothèse par défaut du
        calculateur. Le zéro est exact : une exécution ne rapporte rien tant que la
        cible n'a rien perdu. Il faut régler les PV actuels de la cible pour voir le
        chiffre monter — c'est justement ce que ces sorts ont à dire. ─────────────── */

  Garen: {
    R: {
      ajouter: {
        DegatsExecution: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'basedamage' },
            { stat: 'PVmanquantsCible', mode: 'total', dv: 'executedamage' }
          ]
        }
      },
      source: 'wiki officiel — Justice démacienne : 125/200/275 + 25/30/35 % des PV ' +
              'manquants, dégâts bruts (identique au fichier)'
    }
  },

  Ekko: {
    W: {
      ajouter: {
        DegatsPassifPVmanquants: {
          genre: 'degats',
          termes: [{ stat: 'PVmanquantsCible', mode: 'total', calc: 'MissingHealthPercent' }]
        }
      },
      source: 'wiki officiel — Convergence parallèle (passif) : 3 % (+ 3 % par 100 AP) ' +
              'des PV manquants, dégâts magiques',
      note: 'ne se déclenche que sous 30 % des PV de la cible, et sur une ATTAQUE ; ' +
            'le bouclier de 100/120/140/160/180 (+ 150 % AP) est l\'actif du sort'
    }
  },

  /* ── Genre mal deviné : « DPS » n'est pas « damage » ─────────────────────────── */

  Karthus: {
    E: {
      genres: { TotalDPS: 'degats' },
      source: 'wiki officiel — Profanation : 30/50/70/90/110 (+ 20 % AP) dégâts ' +
              'magiques PAR SECONDE (identique au fichier)',
      note: 'valeur PAR SECONDE, pas par lancer : le halo est un effet permanent tant ' +
            'qu\'il est actif et que le mana tient'
    }
  },

  /* ── Sorts qui n'infligent AUCUN dégât, mais dont l'infobulle en parle ─────────
        Quatre faux positifs de la détection par mots-clés. Les déclarer coûte quatre
        lignes ; ne pas les déclarer laisse un chiffre d'incomplétude qu'on ne peut pas
        faire baisser, et un tel chiffre finit toujours par être ignoré en bloc. */

  Fiora: {
    R: { sansDegats: 'les dégâts annoncés sont ceux du PASSIF (Danse de la duelliste) ; ' +
                     'l\'ultime révèle les points faibles et soigne (HealPerSecondCalc)' }
  },

  Morgana: {
    E: { sansDegats: 'bouclier : l\'infobulle chiffre ce qu\'il BLOQUE, pas ce qu\'il inflige' }
  },

  Nilah: {
    W: { sansDegats: 'défensif : esquive et 25 % de réduction des dégâts magiques subis' }
  },

  Sona: {
    W: { sansDegats: 'soin et bouclier ; le Diminuendo RÉDUIT les dégâts infligés par la cible' }
  },

  /* ═══ LES DOUZE POURCENTAGES DE PV RÉVÉLÉS PAR LE RECLASSEMENT ═══════════════════
     Ces sorts n'étaient PAS absents du modèle : ils y entraient avec une valeur fausse.
     Leur calcul porte `mDisplayAsPercent` — c'est un RATIO — et un nom contenant
     « damage », si bien que l'heuristique les servait comme des POINTS de dégâts :
     0,05 point là où le jeu inflige 5 % de 3 000 PV, soit 150. Trois mille fois moins,
     sans alerte, sur douze sorts.

     Depuis, un calcul marqué « pourcentage » n'entre plus jamais seul dans un total.
     Il reste disponible comme FACTEUR, et c'est ce que font les entrées ci-dessous :
     elles multiplient le ratio du fichier par les PV de la cible. Aucun nombre n'est
     recopié — le fichier reste la seule source des valeurs.

     Tous ces sorts portent en outre un plancher (et parfois un plafond hors champions)
     que le modèle n'applique pas ; contre un champion, c'est le pourcentage qui prime
     presque toujours. ──────────────────────────────────────────────────────────── */

  KSante: {
    W: {
      ajouter: {
        DegatsTotal: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'basedamage' },
            { stat: 'PVmaxCible', mode: 'total', calc: 'TotalMaxHealthDamage' }
          ]
        }
      },
      source: 'fichier de jeu — `BaseDamage` + `TotalMaxHealthDamage` (8 % des PV max ' +
              '+ 0,02 % par point d\'armure ET de RM bonus), infobulle FR : « dégâts physiques »',
      note: 'les dégâts bruts bonus du Grand jeu (10 à 80 % selon la charge) ne sont pas comptés'
    }
  },

  Vi: {
    W: {
      ajouter: {
        DegatsTroisiemeCoup: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'TotalDamageTooltip' }]
        }
      },
      source: 'fichier de jeu — `TotalDamageTooltip` (3/4/5/6/7 % des PV max + ratio AD bonus)',
      note: 'un coup sur trois sur la même cible ; le plafond de 300 hors champions n\'est pas appliqué'
    }
  },

  Trundle: {
    R: {
      ajouter: {
        DegatsPVmax: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'TotalPercentHPDamage' }]
        }
      },
      source: 'fichier de jeu — `TotalPercentHPDamage` (20/25/30 % des PV max + 0,02 % par AP)',
      note: 'moitié à l\'impact, moitié sur la durée du drain ; le vol d\'armure et de RM ' +
            'est un effet distinct, non compté ici'
    }
  },

  Kled: {
    W: {
      ajouter: {
        DegatsQuatriemeCoup: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'baseflatdamage' },
            { stat: 'PVmaxCible', mode: 'total', calc: 'PercentDamage' }
          ]
        }
      },
      source: 'fichier de jeu — `BaseFlatDamage` + `PercentDamage` (4/4,5/5/5,5/6 % des ' +
              'PV max + ratios AD bonus et PV bonus)',
      note: 'quatrième coup seulement ; plafond de 200 hors champions non appliqué'
    },
    /* Deux montants selon la distance parcourue par la charge. On les expose tous les
       deux plutôt que d'en choisir un : servir le maximum flatterait l'objet, servir
       le minimum le condamnerait, et la distance n'est pas connue du calculateur. */
    R: {
      ajouter: {
        DegatsChargeMinimum: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'MinimumDamageTooltip' }]
        },
        DegatsChargeMaximum: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'MaximumChargeDamage' }]
        }
      },
      source: 'fichier de jeu — `MinimumDamageTooltip` et `MaximumChargeDamage`, même ' +
              'base `PercentHPBase` avec des multiplicateurs de 0,01 et 0,03',
      note: 'le montant réel dépend de la distance parcourue : les deux bornes sont données'
    }
  },

  KogMaw: {
    W: {
      ajouter: {
        DegatsAImpact: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'TotalHealthDamage' }]
        }
      },
      source: 'fichier de jeu — `TotalHealthDamage` (pourcentage des PV max + ratio AP)',
      note: 'effet À L\'IMPACT : s\'ajoute à CHAQUE attaque pendant la durée du sort'
    }
  },

  Nasus: {
    R: {
      ajouter: {
        DegatsParSeconde: {
          genre: 'degats',
          termes: [{ stat: 'PVmaxCible', mode: 'total', calc: 'DamageCalc' }]
        }
      },
      source: 'fichier de jeu — `DamageCalc` (2/3/4 % des PV max + 0,01 % par AP)',
      note: 'valeur PAR SECONDE, sur 15 secondes, aux ennemis proches'
    }
  },

  Sett: {
    Q: {
      ajouter: {
        DegatsSupplementaires: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'basedamage' },
            { stat: 'PVmaxCible', mode: 'total', calc: 'MaxHealthDamageCalc' }
          ]
        }
      },
      source: 'fichier de jeu — `BaseDamage` + `MaxHealthDamageCalc` (1 % des PV max ' +
              '+ ratio AD total croissant par rang)',
      note: 'porté par les DEUX prochaines attaques'
    }
  },

  TahmKench: {
    R: {
      ajouter: {
        DegatsDevoration: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'basedamage' },
            { stat: 'PVmaxCible', mode: 'total', calc: 'PercentHPDamage' }
          ]
        }
      },
      source: 'wiki officiel — Dévorer : 100/250/400 (+ 15 % (+ 7 % par 100 AP) des PV max), ' +
              'dégâts magiques (identique au fichier)',
      note: 'exige 3 cumuls de Goût acquis sur un champion ennemi'
    }
  },

  Zac: {
    W: {
      ajouter: {
        DegatsTotal: {
          genre: 'degats',
          termes: [
            { stat: 'flat', mode: 'flat', dv: 'basedamage' },
            { stat: 'PVmaxCible', mode: 'total', calc: 'DisplayPercentDamage' }
          ]
        }
      },
      source: 'fichier de jeu — `BaseDamage` + `DisplayPercentDamage` (4/5/6/7/8 % des ' +
              'PV max + 3 % par 100 AP)'
    }
  },

  /* ── Un pourcentage qui ne porte pas sur les PV ─────────────────────────────────
        Le W de Mel renvoie les projectiles : ses dégâts valent un POURCENTAGE DES
        DÉGÂTS D'ORIGINE. Le montant dépend donc entièrement du sort renvoyé, que le
        calculateur ne connaît pas. Le multiplier par les PV de la cible, comme les
        douze au-dessus, serait un contresens — le ratio ne parle pas de PV. */

  Mel: {
    W: { nonExploitable: 'renvoi de projectile : les dégâts sont un pourcentage de ceux ' +
                         'du sort renvoyé, inconnu du calculateur' }
  }
};
