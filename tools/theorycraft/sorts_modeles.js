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
  }
};
