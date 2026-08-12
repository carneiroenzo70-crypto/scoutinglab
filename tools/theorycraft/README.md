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
node 01_cibles.js     # top 20 pro play par rôle → identifiants Data Dragon
node 02_fetch.js      # télécharge les .bin.json dans ./bin (cache, non versionné)
node 04_extraire.js   # résout les formules → champions.json
node 05_rapport.js Ahri Ryze   # rendu lisible, pour confronter au jeu
node 06_diag.js       # pourquoi tel sort n'a pas de calcul de dégâts
node 07_bilan.js      # couverture globale
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

## À refaire à chaque patch

Relancer `02_fetch.js` puis `04_extraire.js`. Les données de pro play
(`proplay.json`, via gol.gg) se rafraîchissent avec `01_cibles.js`.
⚠️ Leaguepedia bloque les requêtes depuis certains environnements — gol.gg a servi de
source de repli pour les taux de pick.
