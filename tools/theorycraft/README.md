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

# Objets
node 17_fetch_items.js       # les 3 sources (non versionnées, 15 Mo)
node 22_extraire_items.js    # → items.json
node 23_rapport_items.js 3153 Liandry   # rendu lisible, pour confronter à la boutique
node 24_test_items.js        # 30 vérifications contre deux sources indépendantes
node 25_couverture_items.js  # ce qui manque encore, objet par objet

# Modèle de dégâts, passifs et comparaison
node 27_test_modele.js       # 47 vérifications, toutes calculables au crayon
node 31_test_passifs.js      # 24 vérifications des passifs d'objet
node 29_sonde_statmap.js     # re-dérive la table mStat depuis les données
node 28_comparer.js Jinx 18 "3031,3006,3094,3072" "3153,3006,3085,3036" Rumble
```

```bash
node 32_audit_stats.js       # audit inverse : aucune stat de boutique non extraite
```

**190 vérifications** en tout : 63 runes, 30 objets, 63 modèle, 34 passifs.

## Audit inverse des stats

Vérifier que les stats extraites existent dans la description ne détecte pas l'**oubli**
— c'est ainsi que `mAbilityHasteMod` avait disparu de 65 objets sans la moindre erreur.
`32_audit_stats.js` fait l'inverse : il lit la ligne de boutique et exige que chaque
entrée ait sa contrepartie extraite.

**478 valeurs confrontées, 0 manquante, 0 écart** sur les 218 objets.

Les deux « anomalies » trouvées venaient de l'audit, pas de l'extraction : les
Chaussures de lanceur de sorts portent **réellement** 20 de pénétration plate ET 8 %
(deux stats distinctes que l'audit comparait l'une à l'autre), et le « +0 % de
critique » des Flèches des Yun Tal est exact — l'objet gagne son critique à l'usage.
Au passage : Data Dragon **omet purement** la pénétration magique des Chaussures de
sorcier, que le fichier de jeu donne à 12 — la valeur du wiki.

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
| évaluées avec une valeur | **65** |
| modélisées sans valeur chiffrable | 4 |
| refusées | **0** |
| **sans modèle** | **0** |

Les 4 sans valeur n'ont rien à calculer (détection de balises, durée de balises,
Saut Hextech, trois élixirs).

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

#### Clés hachées levées par recoupement externe

Trois runes bloquaient. Elles ont été résolues en confrontant les valeurs du fichier
de jeu au wiki officiel — la concordance numérique sert de preuve d'identification :

| Rune | Blocage | Résolution |
|---|---|---|
| **Polyvalence** (*Jack of All Trades*) | paliers adaptatifs hachés | `{1b48f5ea}=8` = bonus à 5 cumuls, `{55d14eea}=20` = total à 10 — le wiki donne 8/20 en puissance et 4,8/12 en AD, soit le rapport 0,6 attendu |
| **Grimoire déchaîné** (*Unsealed Spellbook*) | 7 clés sur 11 hachées | l'essentiel était lisible : `ShardRechargeMinutes` 4,5 min = les **270 s** du wiki |
| **Fontaine de vie** (*Font of Life*) | aucun montant de soin dans le fichier | valeurs du wiki (10 → 54,71) ; le rapport mêlée/distance 0,7 retombe **exactement** sur le `RangedMod` du fichier |

⚠️ **Le wiki n'est pas toujours à jour.** Sur le Toucher de feu mortel il annonce
« 4–12, +8 % AD bonus, +3 % AP » alors que le fichier de jeu **et** la description
française en jeu disent tous deux « 3–12, +7 %, +2,5 % ». Les deux sources internes
concordent contre lui : **le fichier de jeu fait foi**, le wiki ne sert qu'à lever une
ambiguïté, jamais à contredire une valeur mesurée.

Une seule valeur de tout le jeu de runes provient d'une saisie externe (les deux bornes
de Fontaine de vie). Elle est déclarée via `valeursExternes` avec sa source et sa date,
et `evaluerRune()` renvoie systématiquement le champ `source` — on ne mélange jamais
silencieusement une mesure et une saisie. **Cette valeur ne se mettra pas à jour toute
seule au prochain patch, contrairement à toutes les autres.**

## Objets (`items.json`)

Même bonne surprise que pour les runes : `game/items.cdtb.bin.json` porte le **même
arbre de formule typé** que les sorts. Les passifs ne sont donc pas de la prose à
recopier — ils se résolvent avec `03_resolveur.js`, à trois types de parts près.

| | |
|---|---|
| objets de la Faille, achetables | **218** |
| dont finis (≥ 1 800 po) | 105 |
| finis avec un passif résolu en formule | 59 |
| finis avec des valeurs nommées seulement | 43 |
| **finis annonçant un effet sans aucune valeur lisible** | **0** |

### Ce que le fichier de jeu apporte que Data Dragon n'a pas

Data Dragon publie des stats correctes mais **incomplètes** : ni l'accélération de
compétence (65 objets), ni la létalité (12), ni la pénétration. Or ce sont exactement
les stats qui décident un build. Le fichier de jeu les donne toutes.

### Pièges des objets

- **`maps['11']` ne suffit PAS à isoler la Faille.** Riot marque « carte 11 » les
  doublons d'Arena — Nécrophage, Épée du divin — qui parlent de « fin de manche » et
  n'existent pas en partie classée. Ils portent un identifiant à **six chiffres** bâti
  sur l'objet d'origine (323070 = la Larme 3070). Le seuil `id < 100000` les écarte.
  ⚠️ Le critère tentant `maps['35']` est **faux** : il exclurait 77 objets légitimes
  (bottes, objets de Doran, potions, balises).
- **Croissance par paliers.** `ByCharLevelBreakpointsCalculationPart` porte une valeur
  de départ *et* des seuils (« +30 par niveau à partir du 9 »). Ne garder que la valeur
  au niveau 1 sous-estimait d'un facteur 2 : le bouclier de l'Arc-bouclier immortel est
  400 au niveau 1 mais **700** au niveau 18.
- **Formules à deux branches.** Mêlée/distance n'est pas un simple facteur : c'est une
  `GameCalculationConditional` avec deux formules distinctes (Lame du roi déchu, 9 % des
  PV max en mêlée contre 6 % à distance). `resoudreConditionnel` rend les deux.
- **Champs de stats aux préfixes irréguliers.** Un filtre par préfixe qui oubliait
  `mAbilityHasteMod` vidait silencieusement l'accélération sur 65 objets — sans la
  moindre erreur. C'est le test contre la description en boutique qui l'a rattrapé.
- **Flottants sales** : le jeu stocke `0.30000001192092896` pour 30 %.

### Comment on vérifie (`24_test_items.js`)

Aucune valeur attendue ne vient de `items.json` — un test qui se compare à lui-même ne
prouve rien. Trois contrôles indépendants :

1. **407 valeurs confrontées à Data Dragon**, qui publie ses propres stats. Deux
   lectures du même objet doivent concorder. 0 écart.
2. **Accélération et létalité confrontées à la description française en boutique**,
   rendue indépendamment. Sans ce contrôle, la moitié de l'apport du fichier de jeu
   serait invérifiable.
3. **Périmètre** : aucune description ne doit contenir le mot « manche », vocabulaire
   qui n'existe qu'en Arena.

## Modèle de dégâts (`26_modele_degats.js`)

Les trois socles se rejoignent ici : les sorts donnent les ratios, les objets donnent
les stats, les runes lisent ces mêmes stats. Une rune ne se juge pas dans le vide —
Électrocution vaut 5 % de la puissance, elle ne dit donc la même chose qu'une fois le
build posé.

Quatre formules du jeu, **toutes vérifiées sur le wiki avant d'être codées** :

| Formule | Valeur |
|---|---|
| Croissance par niveau | `base + g × (n−1) × (0,7025 + 0,0175 × (n−1))` — quadratique, et vaut exactement 17 g au niveau 18 |
| Vitesse d'attaque | formule à part : `VAbase + (bonus + croissance) × ratio` |
| Réduction | `100 / (100 + R)`, et `2 − 100 / (100 − R)` si R < 0 |
| Pénétration | réduction plate → réduction % → pénétration % → létalité |

### Pièges du modèle

- **L'ordre des pénétrations n'est pas commutatif.** 100 d'armure avec 40 % de
  pénétration puis 18 de létalité donnent 42 ; dans l'autre sens, 49,2. Le second
  sous-estimerait les dégâts de tous les builds d'assassin.
- **La létalité vaut 1 pour 1 depuis la V14.1.** Les anciennes formules la faisaient
  dépendre du niveau : les reprendre serait un contresens.
- **Les pénétrations en pourcentage se multiplient, elles ne s'additionnent pas.**
  35 % + 30 % font 54,5 %, pas 65 % — additionner surestimerait de 10,5 points
  précisément les builds qu'on veut comparer.
- **Le multiplicateur de critique se lit par champion.** Il vaut 2 pour 89 des 90
  champions, mais **Ashe est à 1** : ses coups critiques n'infligent aucun dégât
  supplémentaire. Le coder en dur doublait ses dégâts d'attaque.
- **Les attaques de base ne sont pas un détail.** Sur Jinx, 3 secondes d'attaques
  pèsent plus que le combo complet. Un comparateur qui les ignore désigne le mauvais
  gagnant — le comparateur donne donc trois mesures (combo seul, combo + 3 s, dégâts
  par seconde soutenus), qui ne classent pas toujours pareil.
- **Le type de dégâts n'est PAS dans le fichier de jeu** (il vit dans les blocs
  d'application d'effet, absents des fichiers publics). Il est lu dans l'infobulle
  française de Data Dragon, qui le nomme. Le déduire du ratio serait faux : le E de
  Jinx est **magique** malgré son ratio de dégâts d'attaque. 353 sorts sur 359 typés ;
  un sort à deux types est marqué « mixte » et sa mitigation n'est pas appliquée.

## Passifs d'objet (`items_modeles.js` + `30_moteur_items.js`)

Même séparation que pour les runes : le **comportement** est encodé à la main, les
**nombres** restent lus dans `items.json`. Un patch qui fait passer la Dent de Nashor
de 15 à 20 se propage tout seul.

Ce que ça change : la Lame du roi déchu ajoute 83 dégâts subis par attaque sur une
cible à pleine vie, ce qui **renverse un verdict** — le build à pénétration passe de
+1,9 % à +23,8 % sur une fenêtre de 3 secondes.

| | |
|---|---|
| objets finis (≥ 1 800 po) | 105 |
| dont portant un passif chiffré | 102 |
| **appliqués aux dégâts** | **24** |
| écartés avec un motif | 7 |
| pas encore modélisés | 71 |

Les 71 restants ne sont pas approximés : `evaluerPassif` renvoie « non modélisé », et
le comparateur les nomme. **Un build est donc sous-estimé, jamais surestimé.**

### La table base / bonus / total était permutée

Deuxième table écrite de mémoire, deuxième table fausse. `MODES` valait
`{0:'base', 1:'bonus', 2:'total'}` — la bonne est `{0:'total', 1:'base', 2:'bonus'}`.

Conséquence : le Fléau de liche ressortait à « 75 % de l'AD **bonus** » quand le wiki
dit « 75 % de l'AD de **base** ». Sur un mage sans dégâts d'attaque bonus, la lame
enchantée tombait à **zéro** ; sur un combattant elle explosait. Même chose pour la
Force de la trinité (200 % de l'AD de base) et le Gantelet givrant (150 %).

Comme pour `STATS`, la correction vient des données : trois familles de noms tombent
sur trois index distincts — `TotalADRatio` en 0, `BaseADRatio` et `SpellbladeMultiplier`
en 1, `BonusADRatio` et `BonusHealthRatio` en 2. Recoupé sur le wiki, et verrouillé par
un test qui inclut une **contre-épreuve** : Terminus doit garder un ratio « bonus »,
sinon on pourrait tout basculer en « base » et croire le problème réglé.

### Cadence : amortir plutôt qu'exclure

Le Tueur de krakens frappe un coup sur trois. L'ajouter en entier le triplerait,
l'exclure l'effacerait : sur la durée, la seule valeur juste est **le tiers**, et la
cadence est affichée à côté du montant.

### Pièges des passifs

- **Le pourcentage et sa base ne sont pas dans le même calcul.** La Lame du roi déchu
  stocke « 0,09 » dans `MeleeItemCalcValue` et la multiplication par les PV de la cible
  dans un calcul séparé. Lire le premier seul donnait **0,06 point de dégât au lieu de
  145** — une erreur d'un facteur 2400, silencieuse et parfaitement plausible à l'œil.
  D'où le champ `surCible`, déclaré objet par objet.
- **PV actuels, pas PV max.** Le wiki dit « current health », et la description
  française dit « PV **actuels** de l'ennemi ». Contre une cible à 30 % de vie l'effet
  chute de 70 % : confondre les deux triple le résultat.
- **Trois déclencheurs, trois traitements.** Seuls les passifs « à chaque attaque »
  entrent dans les dégâts par seconde. Un passif énergisé se déclenche à intervalle,
  une lame enchantée dépend d'un sort lancé — les additionner à chaque coup les
  surestimerait. Le comparateur les range dans un bucket distinct.
- **Un « écarté » n'est pas un zéro.** L'Ouragan de Runaan ne change rien en cible
  unique, ce qui n'est pas la même chose que « ne fait rien » : le moteur renvoie
  `applique: false` avec un motif.

### Le garde-fou anti-fantôme

`SiphonDamage` est une clé du fichier de jeu qui ressemble à un effet vivant (40 → 103
selon le niveau) mais **n'existe dans aucun objet actuel** — je l'avais rapportée comme
réelle. Le test exige désormais que **tout passif modélisé porte un nom qui apparaît
dans la boutique**. `SiphonDamage` n'en a pas : il aurait été bloqué.

⚠ Le contrôle par les chiffres, lui, ne peut que **confirmer, jamais réfuter** : les
gabarits du client ne sont pas résolus et 9 passifs sur 15 n'impriment aucune valeur
(« inflige des dégâts physiques bonus », sans nombre). Les compter comme réussis serait
se mentir — ils sont donc comptés à part.

## À refaire à chaque patch

Relancer `02_fetch.js` puis `04_extraire.js` (champions), et `17_fetch_items.js` puis
`22_extraire_items.js` (objets). Les données de pro play
(`proplay.json`, via gol.gg) se rafraîchissent avec `01_cibles.js`.
⚠️ Leaguepedia bloque les requêtes depuis certains environnements — gol.gg a servi de
source de repli pour les taux de pick.
