# Socle de données du calculateur d'itémisation

Extrait les **vrais** chiffres des sorts depuis les fichiers de données du jeu, pour
alimenter le calculateur « build A vs build B ».

## Pourquoi ce détour

Ni Data Dragon ni l'API publique de Riot ne donnent les ratios de sorts :

| Source | Contenu | Verdict |
|---|---|---|
| Data Dragon `spells[].vars` | vide sur **173/173** champions | inutilisable |
| Data Dragon `tooltip` | placeholders `{{ }}` non résolus (692/692) | inutilisable |
| Data Dragon `attackdamageperlevel` | **0 partout** | cassé |
| CDragon `champions/<id>.json` `coefficients` | à zéro | inutilisable |
| **CDragon `characters/<id>.bin.json`** | formules complètes | ✅ **la source** |

Le `.bin.json` est le fichier de script du jeu : chaque sort y porte ses `DataValues`
(valeurs par rang) et ses `mSpellCalculations` (arbre de formule typé). Il fournit aussi
`damagePerLevelModifiable`, qui **répare** le champ cassé de Data Dragon.

## Chaîne

```bash
# Champions
node 01_cibles.js     # top 20 pro play par rôle → identifiants Data Dragon
node 02_fetch.js      # télécharge les .bin.json dans ./bin (cache, non versionné)
node 04_extraire.js   # résout les formules → champions.json
node 05_rapport.js Ahri Ryze   # rendu lisible, pour confronter au jeu
node 06_diag.js       # pourquoi tel sort n'a pas de calcul de dégâts
node 07_bilan.js      # couverture globale

# Runes
node 09_runes.js          # perks.bin.json + libellés fr → runes.json
node 11_rapport_runes.js  # rendu lisible des pierres de fondation
node 12_diag_hash.js      # part de clés non résolues par CommunityDragon
```

`03_resolveur.js` est le cœur : il aplatit l'arbre de formule en une somme de termes
`{ stat, mode, valeur }`. **Il ne devine jamais** — une part de type inconnu est
signalée, pas approximée. Un calculateur qui invente un ratio est pire qu'un
calculateur absent.

## État (patch 16.16.1, relevé pro play saison S16)

- 90 champions (top 20 × 5 rôles, doublons retirés)
- 359 sorts analysés — **91 %** avec formule, **86 %** avec dégâts ou soin
- 4 % portent une alerte ; aucun champion sans données

Les sorts sans calcul de dégâts sont presque tous **réellement utilitaires** (le W de
Shen bloque les attaques, le R d'Aatrox donne de l'AD, le W de Braum accorde de
l'armure) — vérifié par `06_diag.js`.

## Pièges rencontrés (ne pas les réintroduire)

- **Casse incohérente** des `DataValues` : une formule lit `rAPCoefficient` quand la
  définition s'appelle parfois autrement. L'indexation est en minuscules — une
  comparaison stricte perdait des sorts entiers (l'ultime d'Ahri).
- **Rangs d'ultime** : les fichiers stockent 7 entrées extrapolées. Sans borner à
  `maxrank` (lu dans Data Dragon), on affichait 5 rangs d'ultime au lieu de 3.
- **Sorts éclatés** : les dégâts vivent souvent dans un sous-bloc (missile, zone). Les
  blocs d'une même compétence sont fusionnés avant résolution.
- **Ressource** : Ryze — 1er pick Mid — scale sur la mana max
  (`AbilityResourceByCoefficientCalculationPart`). Sans ce type il ressortait vide.
- Senna n'a pas de croissance d'AD : **ce n'est pas une lacune**, elle n'en a pas en
  jeu (son AD vient de ses âmes).

## Runes (`runes.json`)

Bien plus simple que les sorts : le jeu stocke déjà des couples nom → nombre, il n'y a
rien à résoudre.

```
Électrocution : DamageBase 70, DamageMax 240, BonusADRatio 10%, APRatio 5%, Cooldown 20
```

Source : `game/perks.cdtb.bin.json` (chiffres) + `perks.json` / `perkstyles.json` du
client en `fr_fr` (libellés et arbres).

- **69 runes jouables**, toutes chiffrées — 17 pierres de fondation, 45 mineures,
  7 fragments.
- Le fichier contient aussi **37 runes retirées du jeu** (Kleptomancie, Prédateur,
  Corps céleste…). Seule l'appartenance à un arbre actuel fait foi : `active: false`
  = ne jamais proposer.
- Les valeurs **ARAM / URF / Nexus Blitz** sont écartées, on ne garde que la Faille.
- **11 % des clés** ne sont pas résolues par CommunityDragon et restent des hash
  (`{0bb7b933}`). Quatre runes en deviennent inexploitables — Polyvalence, Grimoire
  déchaîné, Remise immédiate, Manteau nuageux — mais **toutes utilitaires** : aucune
  valeur de dégâts n'est perdue.

### Moteur d'évaluation (`14_moteur_runes.js` + `runes_modeles.js`)

Les **69 runes jouables sont modélisées**, y compris les utilitaires :

| | |
|---|---|
| évaluées avec une valeur | **62** |
| modélisées sans valeur chiffrable | 5 |
| refusées explicitement | 2 |
| **sans modèle** | **0** |

Séparation volontaire : `runes_modeles.js` ne décrit que le **comportement**
(déclencheur, forme du calcul) ; les **nombres** restent lus dans `runes.json`. Un
patch qui fait passer Électrocution de 70 à 65 se propage donc sans toucher au code —
seuls les remaniements de mécanique demandent une reprise.

```bash
node 15_test_runes.js        # 55 vérifications contre les valeurs annoncées
node 16_couverture_runes.js  # état de la modélisation, rune par rune
```

Les tests confrontent le moteur aux fourchettes officielles : au niveau 1 une rune doit
rendre sa borne basse, au niveau 18 sa borne haute. Simple, et difficile à truquer.

#### Pièges des runes (coûteux, tous vérifiés par un test)

- **Échelle des pourcentages incohérente.** Coup de grâce stocke `0.08` pour « 8 % »,
  mais le fragment de vitesse d'attaque stocke `10` pour « 10 % » — et Transcendance
  `0.05` pour « +5 accélération ». Confondre les deux fait une erreur d'un **facteur
  100** sur la moitié des runes. La liste des runes en fraction est centralisée dans
  `ECHELLE_FRACTION` (moteur), vérifiée description par description.
- **Ratios « pour 100 points ».** Optimisation glaciale gagne « +6 % tous les 100 pts
  de puissance » : le coefficient porte sur `AP/100`, pas sur `AP`.
- **Zéro trompeur.** Fontaine de vie ne porte **aucun** montant de soin dans le fichier
  de jeu. Sans garde-fou elle ressortait à 0 — ce qui se lit « soigne zéro » au lieu de
  « on ne sait pas ». Une rune sans `montant` renvoie `null`.
- **Force adaptative** = X en puissance **ou 0,6 X** en dégâts d'attaque. Le fragment
  5008 le prouve (`StatGain2` = 9 puissance, `StatGain1` = 5,4).
- **Le texte peut mentir.** Livraison de biscuits annonce « 2 % des PV max » en
  français, le fichier de jeu dit 1,5 %. On retient le fichier.
- **Versions à distance** : parfois un simple facteur (Poigne × 0,4), parfois une
  fourchette entièrement différente (Tempo mortel 9-30 en mêlée, 6-24 à distance),
  parfois une valeur fixe distincte (Démolition 85 vs 50).

## À refaire à chaque patch

Relancer `02_fetch.js` puis `04_extraire.js`. Les données de pro play
(`proplay.json`, via gol.gg) se rafraîchissent avec `01_cibles.js`.
⚠️ Leaguepedia bloque les requêtes depuis certains environnements — gol.gg a servi de
source de repli pour les taux de pick.
