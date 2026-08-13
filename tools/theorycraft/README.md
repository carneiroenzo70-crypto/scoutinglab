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
node 32_audit_stats.js       # audit inverse des objets : aucune stat de boutique oubliée
node 33_audit_runes.js       # audit inverse des runes : 98 % des nombres couverts
```

**212 vérifications** en tout : 79 runes, 30 objets, 63 modèle, 40 passifs.

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

#### Audit inverse des runes (`33_audit_runes.js`)

Contrairement aux objets, les descriptions de runes sont **entièrement rendues**,
chiffres compris. Le contrôle est donc bien plus fort : chaque nombre annoncé doit se
retrouver, soit dans les valeurs extraites, soit dans ce que le moteur calcule.

**289 nombres confrontés, 98 % couverts.** Les 4 résiduels sont structurels (« 1 sec »,
seuils de cumuls). Cet audit a trouvé trois défauts réels :

- **Tempête menaçante suivait une progression TRIANGULAIRE**, pas linéaire. Le fichier
  de jeu ne porte que le premier palier (8) ; la description donne toute la suite —
  8, 24, 48, 80, 120, 168, soit `AdaptiveAP × n(n+1)/2`. S'en tenir au fichier
  **sous-estimait la rune d'un facteur 21** sur une partie de 60 minutes.
- **Vitesse d'approche** : le fichier ne porte QUE la valeur majorée (15 %, contre une
  cible que *vous* avez immobilisée). Le cas courant vaut 7,5 %. Servir 15 revenait à
  annoncer systématiquement le meilleur cas.
- **Présence d'esprit** : le modificateur « 80 % à distance » est absent du fichier —
  la rune était surestimée d'un quart sur tout champion à distance.

Le moteur expose désormais `valeurAD` : la force adaptative vaut X en puissance **ou
0,6 X en dégâts d'attaque**, et les descriptions donnent toujours les deux. N'en servir
qu'une laissait croire l'autre absente.

⚠ Cet audit ne peut confirmer que ce que le texte imprime. Le Grimoire déchaîné porte
un gabarit non résolu (`@f3@`) : il est compté à part, jamais validé par complaisance.

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
| **appliqués aux dégâts** | **26** |
| écartés avec un motif | 7 |
| pas encore modélisés | 69 |

Les 69 restants ne sont pas approximés : `evaluerPassif` renvoie « non modélisé », et
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

### Les passifs qui ACCORDENT des stats

Catégorie à part, et la plus lourde de conséquences : ils ne s'ajoutent pas aux dégâts,
ils modifient le **profil** — donc tous les ratios de sorts et toutes les attaques qui
suivent. `statsAccordees` est appliqué par `profil()` avant tout autre calcul.

| Objet | Effet | Vérifié |
|---|---|---|
| Gage de Sterak | +50 % de l'AD **de base** en AD bonus | wiki |
| Manamune | +2 % du **mana maximum** en AD bonus | wiki |
| Armure sanguine | +2,5 % des **PV bonus** en AD bonus | description en jeu |
| Bâton de l'archange | +1 % du **mana bonus** en puissance | description en jeu |
| Approche de l'hiver | +15 % du **mana maximum** en PV bonus | fichier de jeu |

⚠ **Les chaînes de dépendance existent**, contrairement à ce que je croyais d'abord :
l'Approche de l'hiver convertit le mana en PV, l'Armure sanguine convertit ensuite les
PV bonus en dégâts d'attaque. Sur un profil figé, la seconde ne verrait jamais les
267 PV de la première — 6,7 dégâts d'attaque perdus. Les stats accordées sont donc
appliquées **incrémentalement** sur une copie du profil, dans l'ordre déclaré par le
champ `ordre` : chaque passif voit le résultat de ceux qui le précèdent.

L'Armure sanguine est le premier cas où le fichier ne porte **qu'un pourcentage nu**,
sans `mItemCalculations` : la base est alors déclarée explicitement dans le modèle
(`base: 'pvBonus'`), d'après la description en jeu. Un pourcentage sans base déclarée
est refusé — on ne devine pas sur quoi porte un pourcentage.

### Les passifs qui MULTIPLIENT une stat

Troisième catégorie, purement arithmétique, et longtemps manquante : ils appliquent un
pourcentage à une stat **déjà constituée**. La Coiffe de Rabadon figurait dans les
builds de référence sans être appliquée : la puissance de ces builds était sous-estimée
de 30 % — 295 au lieu de 384 sur le Rumble d'exemple, soit 60 dégâts de moins par Q.

| Objet | Effet | Portée |
|---|---|---|
| Coiffe de Rabadon | ×1,30 | puissance **totale** |
| Jak'Sho | ×1,30 | armure et RM **bonus**, après 5 s de combat |
| Armure de Warmog | ×1,12 | PV **d'objets** (ni base, ni runes) |

**L'ordre des passes décide du résultat**, d'où le champ `phase` :

1. multiplicateurs `avant` — leur base ne dépend que des objets ;
2. stats accordées — additives, et certaines **lisent** le résultat de la passe 1 ;
3. multiplicateurs `apres` — leur base est la stat **totale**, donc en dernier.

Warmog + Armure sanguine le prouvent : les 186 PV de Warmog doivent entrer dans la
conversion PV → AD (73,4 AD contre 68,7 dans l'ordre inverse). Inverser 2 et 3 ferait
au contraire perdre à Rabadon toute puissance accordée par un autre passif.

Jak'Sho est conditionné dans le temps : sans durée de combat fournie, il est **refusé
avec son motif**, jamais supposé actif.

### Le mana manquait entièrement au modèle

Découvert en modélisant le Manamune : **le profil ne portait aucun mana**, alors que
Ryze — 1er pick Mid — fait reposer ses quatre sorts dessus. Ses calculs étaient
**refusés en silence**.

Les clés sont hachées dans `primaryAbilityResource` ; elles ont été identifiées par
**concordance numérique** avec Data Dragon (`{726ee5cd}` = 300 = `mp` de Ryze,
`{6216bf7b}` = 70 = `mpperlevel`) — la même méthode que pour les runes.
**79 champions, 0 écart** entre le fichier de jeu et Data Dragon. Les 11 sans mana sont
exactement les champions à énergie, fureur ou chaleur : `arType` les distingue, et leur
attribuer du mana fausserait tout ce qui scale dessus.

### Les amplifications se cumulent ADDITIVEMENT

Quatrième et dernière catégorie de passifs : elles ne produisent ni dégâts ni stat,
elles multiplient ce que les autres calculent. Deux points ont dû être vérifiés sur le
wiki officiel avant d'écrire une ligne, et **aucun des deux n'était devinable**.

**1. Elles s'additionnent entre elles.** « *Modifiers to damage dealt now stack
additively instead of multiplicatively* » — l'inverse exact des pénétrations en
pourcentage, qui se multiplient. Sur un build à quatre amplifications, raisonner par
symétrie avec les pénétrations aurait donné **+47,4 % au lieu de +41 %** : un écart
assez petit pour ne jamais se voir, assez grand pour désigner le mauvais build.

**2. Tueur de géants n'est plus limité aux dégâts physiques** depuis la V13.10 :
« *deal increased damage* », tous types. Le coder « physique » aurait sous-estimé tous
les builds hybrides.

| Objet | Amplification | Portée | Condition |
|---|---|---|---|
| Créateur de failles | 2 %/s, plafond 8 % | tous dégâts | durée de combat |
| Lance de Shojin | 3 % × 4 cumuls (1,5 % à distance) | compétences et procs | — |
| Masque abyssal | 12 % | dégâts **magiques** | — |
| Salutations de Dominik | jusqu'à 15 % | tous dégâts | PV **bonus de la cible** |
| Flamme-ombre | 20 % | magique et brut | cible sous 40 % PV |

Une amplification ne porte pas sur n'importe quoi : `portee` filtre la **source** des
dégâts (compétence, attaque de base, proc d'objet), `types` filtre le **type**. C'est
pourquoi `mitiger()` reçoit désormais la source — sans elle, la Lance de Shojin
amplifierait les attaques de base, qu'elle ne touche pas.

⚠ **Une condition invérifiable est un refus, jamais une valeur maximale.** Sans durée
de combat, le Créateur de failles se refuse au lieu d'offrir +8 % permanents ; contre
une cible à pleine vie, la Flamme-ombre vaut zéro. Quatre amplifications réelles sont
écartées pour cette raison (Lunettes Hextech et Concentration lointaine : position ;
Mandat impérial : contrôle appliqué ; Orgueil : élimination récente).

### Audit avant câblage : le modèle chiffrait des builds impossibles

Vérification demandée avant de brancher tout ceci dans le produit. Les données sont à
jour (**16.16.1**, la version courante) et les **69 runes actives sont toutes
modélisées**. Mais l'audit a trouvé un manque de nature différente des précédents : le
modèle savait **chiffrer** n'importe quelle combinaison, pas dire si elle est
**achetable**. Un chiffre juste sur un build impossible ne vaut rien.

Les règles de légalité existent dans le fichier et n'étaient pas extraites :
`mItemGroups` + `mMaxGroupOwnable`. **21 groupes contraignants** — bottes, objets à
Larme, Hydres, Immolations, Lien vital, Mercure, pénétration magique…

Quatre groupes portent un nom haché. Ils sont nommés **par leur appartenance**, ce que la
donnée permet de vérifier : `{8b55a7b3}` est la Lame enchantée parce que ses **sept
membres portent tous un calcul `SpellbladeDamage`** — pas parce que le nom y ressemble.

⚠ Le fichier appelle `LastWhisper` le groupe que la boutique nomme aujourd'hui
**« Fatality »**. Un premier résumé du wiki affirmait que le Couperet noir n'en faisait
pas partie et pouvait se cumuler avec les Salutations de Dominik ; les **trois fiches**
concernées (Couperet noir, Dominik, Serylda) annoncent pourtant toutes « Limited to 1
Fatality item ». Nom interne ancien, contrainte bien réelle.

**Et cette contrainte invalidait un de mes propres exemples.** Le test qui démontre la
composition réduction + pénétration utilisait Couperet noir + Salutations de Dominik. Ce
build est impossible — et pas par malchance de paire : **tous** les objets à pénétration
d'armure en pourcentage sont dans ce groupe, Couperet compris. Réduction en % et
pénétration en % ne peuvent donc jamais coexister via l'équipement. Le test utilise
désormais Couperet + létalité, qui est légal *et* plus non-commutatif.

`40_legalite.js` valide un build (emplacements, doublons, groupes, objets réservés) et
une page de runes (1 majeure, 3+2 mineures, emplacements distincts, 3 fragments, un par
rangée) — la structure venant du fichier, pas d'une convention supposée. Un refus nomme
toujours le groupe et les objets fautifs, et `conflits()` propose quoi garder.

`42_audit_couverture.js` décrit l'état complet, **sans arrondi flatteur**, à relancer
après chaque patch. Au jour de l'audit : 48 passifs d'objet appliqués sur 102, 69/69
runes modélisées, et **96,9 % des sorts exploitables** — les 11 lacunes restantes sont
nommées une par une.

### Une rune ne vaut rien hors du temps

Quatorze runes de dégâts et sept de soin étaient modélisées et chiffrées depuis
longtemps — mais évaluées **une par une, hors du temps**. Or l'Électrocution inflige 240
toutes les 20 s et la Brûlure 40 toutes les 10 : comparées à l'unité, la première paraît
six fois meilleure ; sur 20 s l'écart tombe à 4, sur 60 s à 3,4. Sans cadence, on ne
pouvait ni les additionner aux dégâts d'un build, ni les comparer entre elles.

`38_runes_combat.js` les rapporte à une fenêtre de combat, avec la même liste blanche
qu'ailleurs : n'entre que la rune dont le **rythme est déterminé par le fichier** — une
recharge (Électrocution, Comète, Brûlure, Attaque soutenue, Goût du sang), un intervalle
(Poigne de l'immortel), ou un débit continu (Toucher de feu mortel). Les seize autres
dépendent d'une immobilisation, d'une élimination, d'un bouclier posé : **refusées avec
leur motif**.

⚠ **Les recharges de runes ne sont pas réduites par l'accélération de compétence.** Leur
appliquer `rechargeReelle` aurait gonflé toutes les runes de dégâts sur les builds à
forte accélération — exactement ceux qu'on veut comparer.

**Le type des dégâts adaptatifs suit le champion** : magique du côté puissance, physique
du côté dégâts d'attaque, avec le même départage que la force adaptative. Ce n'est pas
une étiquette : contre la cible de référence, 60 % des dégâts passent en magique contre
39 % en physique.

Deux trouvailles au passage :

- **La pénalité « à distance » n'était appliquée nulle part.** Le moteur de runes savait
  la traiter depuis le premier jour — personne ne lui disait de quel champion il
  s'agissait. `ctx.distance` n'était passé ni ici ni dans le pont vers le profil : toutes
  les runes concernées servaient leur valeur de mêlée. La Poigne de l'immortel en donnait
  **deux fois et demie trop** sur une ADC.
- **L'Attaque soutenue n'était modélisée qu'à moitié.** Elle n'inflige pas que ses 160
  points : elle amplifie aussi de 8 % tous les dégâts infligés (`AmpPotencyMaxSelf`).
  Sa condition — 3 attaques consécutives — n'a pas besoin d'être supposée, elle se
  **calcule** : fenêtre de combat × vitesse d'attaque. Sur 20 s elle s'applique ; sur
  2 s le refus précise combien de frappes la fenêtre permet.

### Trois stats qui ne multipliaient rien

Trois manques du même genre, chacun rendant inerte une partie de l'équipement déjà
extraite.

**L'accélération d'ULTIME n'était appliquée nulle part.** Trois objets finis la portent
(`valeurs.UltimateHaste` : 30, 30, 20) et Data Dragon ne la publie pas — la Malfaisance
perdait donc tout son intérêt et l'Hexplaque expérimentale n'apportait rien au modèle.
Elle ne réduit **que** la recharge du R : la verser dans l'accélération générale
l'aurait appliquée aux quatre sorts, soit quatre fois son effet réel. Le R de Syndra
passe de 80 s à 59,3 s avec la Malfaisance ; son Q ne bouge pas, et le test le vérifie.

**La régénération n'existait pas dans le modèle** — 12 objets à « % de régénération de
vie » et 15 à « % de régénération de mana » multipliaient une base absente. Elle est
désormais extraite du fichier de jeu, **par seconde**, avec deux confirmations
indépendantes de l'unité :

- champions : le fichier compte par seconde, Data Dragon par 5 secondes ; le facteur 5
  est exact sur les **87 champions** où les deux existent — c'est ce qui identifie les
  clés hachées du mana (`{c4ab3550}`, `{3a509002}`) ;
- objets : le Bouclier de Doran est extrait à 0,8 et sa boutique annonce « 4 PV toutes
  les 5 sec » ; la Corne du gardien à 4 pour « 20 PV toutes les 5 sec ».

Trois champions (Maokai, Rakan, Milio) n'ont pas la clé — leur valeur vient d'un gabarit
non exposé. Data Dragon comble le trou, et le repli est **marqué** dans `sourceRegen`
plutôt que fondu dans la masse.

**Les coûts des sorts, extraits depuis le début, ne servaient à rien.** `autonomieMana()`
en tire un axe réel : coût d'un cycle Q-W-E-R, nombre de cycles que la réserve permet, et
secondes nécessaires à la régénération pour en reconstituer un. Un mage sans mana
n'inflige rien, quel que soit son ratio. ⚠ `null` — et non « 0 cycle » — sur un champion
à énergie, à fureur ou à chaleur : la question ne se pose pas dans les mêmes termes.

### Un bouclier n'est pas un soin

Dernière limite annoncée par l'audit, et ce n'était pas du vocabulaire : les deux
partageaient l'étiquette `soin`, alors que le wiki officiel est explicite —
« *resistances will still mitigate the damage **before** being absorbed by shielding* ».

Un soin rend exactement ce qu'il annonce. Un **bouclier absorbe après les résistances**,
donc il vaut sa valeur **multipliée par le facteur de PV effectifs**. Le bouclier du E de
Lulu, 372 points affichés, absorbe **946** de dégâts physiques sur un profil à 154
d'armure — deux fois et demie ce que la lecture naïve donnait. Et l'écart grandit avec la
résistance, donc précisément sur les champions qui posent des boucliers.

Le genre est désormais séparé à l'extraction : **40 boucliers, 35 soins** là où il y avait
75 entrées indistinctes. `soinsDuChampion()` rend les deux listes séparément, et chaque
bouclier porte ce qu'il absorbe réellement contre le physique, le magique et un mélange.

Quatre boucliers d'objet rejoignent le modèle. L'un impose une nuance qui vaut d'être
dite : le **Rookern kaénique** n'arrête que la magie — le compter comme un bouclier
ordinaire doublerait sa valeur face à un adversaire à dégâts mixtes, d'où le champ
`contre`. Les boucliers sont comptés **à part** des PV effectifs : ils sont conditionnels
et temporaires, les fondre dans le chiffre principal ferait passer un build pour
durablement plus résistant qu'il n'est.

Éclipse n'a **aucun** `mItemCalculations` — ses nombres vivent dans les DataValues, comme
pour trois sorts de champion. D'où une forme de **termes déclarés** : la formule est
écrite dans le modèle, les valeurs restent lues dans le fichier.

Trois boucliers restent écartés, chacun avec son motif : le Médaillon de l'Iron Solari
protège un **allié** et non le porteur ; le Voile de la banshee et le Manteau de la nuit
bloquent une **compétence entière**, dont la valeur dépend du sort bloqué et non d'un
montant.

### Les runes n'entraient pas dans les stats du build

Le chaînon manquant, et il touchait l'objectif même du projet : le moteur de runes
savait chiffrer les 69 runes modélisées, le modèle savait chiffrer un build d'objets,
mais **rien ne faisait entrer les runes dans les statistiques du champion**. On comparait
donc des builds sur un profil qui n'existe dans aucune partie.

`36_runes_profil.js` fait ce pont, sous deux règles tenues strictement.

**Liste blanche.** N'entre au profil qu'un gain **permanent et inconditionnel**. Le
Manteau nuageux affiche 45 % de vitesse de déplacement : c'est une bouffée de quelques
secondes après un sort d'invocateur. La verser au profil ferait passer un champion pour
deux fois plus mobile qu'il n'est. Six runes sont écartées **avec leur motif** ; une rune
de dégâts, elle, n'est ni appliquée ni signalée comme un défaut — elle agit ailleurs.

**Unités.** Le moteur de runes rend les valeurs telles qu'affichées en jeu (`10` pour
« 10 % de vitesse d'attaque ») ; le profil compte les pourcentages en fractions. Sans
conversion, un fragment de vitesse d'attaque en aurait apporté mille pour cent.

**Force adaptative** — 1 point donne 1 puissance ou 0,6 dégât d'attaque, selon la plus
haute des deux stats bonus. À égalité — le cas de tout niveau 1 — c'est le type adaptatif
du champion qui tranche. Il est **lu dans le fichier de jeu**
(`mAdaptiveForceToAbilityPowerWeight`, qui vaut 1 sur 37 champions du panel et est absent
sur les 53 autres) et non déduit de la couleur des sorts, qui se serait trompée sur Jinx
comme sur Kayle.

**Amplifications de runes** — elles tombent dans le **même seau additif** que celles des
objets. Coup de grâce (8 %) avec une Lance de Shojin à 4 cumuls (6 % à distance) donnent
+14 %, pas +14,48 %.

| Rune | Amplification | Condition |
|---|---|---|
| Coup de grâce | 8 % | cible **sous 40 %** de ses PV |
| Abattage | 8 % | cible **au-dessus de 60 %** |
| Baroud d'honneur | 5 % → 11 % | **porteur** sous 60 %, maximum à 30 % |
| Premier coup | 7 % | ouverture de combat (0,25 s) |
| Arcaniste axiomatique | 12 % | **dégâts d'ultime uniquement** |

Aucune ne s'applique inconditionnellement, et chacune est traitée comme la Flamme-ombre
côté objets : condition remplie → le pourcentage ; non remplie → **zéro** ; invérifiable
→ **refus avec son motif**. Coup de grâce et Abattage sont exclusifs par construction —
la meilleure preuve que la condition est réellement évaluée.

Trois pièges méritent d'être notés :

- **Arcaniste axiomatique n'amplifie que l'ultime.** L'étendre à tout aurait multiplié
  par près de quatre le champ d'une rune qui ne touche qu'un sort. `mitiger()` reçoit
  donc la **touche** lancée, en plus du type et de la source.
- **Baroud d'honneur** : le moteur de runes affiche 11 %, une valeur d'étalage. La servir
  telle quelle offrirait le maximum en permanence. La rampe est calculée depuis les PV du
  porteur, et vaut **zéro** à pleine vie.
- **Abattage porte des clés résiduelles** d'une version antérieure de la rune
  (`MaxBonusDamagePercent` = 15 %, `MinHealthDifference`). Les servir aurait donné 15 %
  au lieu de 8 % : la leçon de `SiphonDamage`, transposée aux runes.

**Ordre** — les runes s'appliquent avant les passifs qui les lisent : Rabadon amplifie la
force adaptative, Jak'Sho les résistances d'Inébranlable, l'Armure sanguine les PV de
Surcroissance.

Deux bugs trouvés en câblant :

- **Les stats dérivées s'incrémentaient.** `+13 %` ajouté à une vitesse d'attaque de
  1,106 aurait donné 14,1 attaques par seconde. La vitesse d'attaque et la vitesse de
  déplacement ont leurs formules propres : elles sont désormais **recalculées** en fin de
  profil à partir d'un bonus brut conservé à part. Contre-épreuve : Jhin a un ratio de
  vitesse d'attaque **nul** (son passif la convertit en dégâts) — sa vitesse ne doit pas
  bouger d'un iota, et un modèle qui additionne échoue sur lui.
- **Un gain sur une stat absente du build était perdu.** `appliquerGain` n'incrémentait
  que les stats déjà présentes : sur un build sans objet de ténacité, le fragment de
  ténacité n'existait tout simplement pas. Exactement la même fuite que celle décrite
  ci-dessous, à un autre étage.

### Le modèle ne parlait que de dégâts — par omission, pas par choix

Reproche d'Enzo, et il était fondé : tout convergeait vers « combien ce build
inflige-t-il ? », alors que sur la plupart des postes ce n'est pas le critère principal.
Un support choisit sur la ténacité, les soins et la vitesse de déplacement ; un tank sur
les PV effectifs face au profil de dégâts d'en face.

La cause était mécanique : **dix familles de statistiques étaient extraites des objets,
vérifiées, testées… puis abandonnées** dans `profil()`, qui ne recopiait qu'une liste
fixe de champs. Vitesse de déplacement, vol de vie, omnivampirisme, soins et boucliers,
ténacité, résistance aux ralentissements, quatre régénérations. Un objet défensif
n'avait aucun moyen de se distinguer d'un autre.

`profil()` recopie désormais **toute** stat extraite qui n'a pas de champ dédié, et
`34_modele_survie.js` apporte les axes manquants.

**PV effectifs** — le seul terrain commun entre un objet de PV et un objet de
résistance. Dérivés de `multiplicateur()` plutôt que réécrits : une formule utilisée
deux fois ne peut pas diverger d'elle-même, et le cas des résistances négatives reste
traité. ⚠ Le mixte est la moyenne **harmonique** des deux (c'est la moyenne des dégâts
*reçus* qui compte) : la moyenne arithmétique donnerait 10 080 là où la survie réelle
vaut 8 972, et l'écart grandit avec la différence armure/RM — donc précisément sur les
tanks.

**Ténacité** — j'ai d'abord additionné : Sandales de Mercure (30 %) + Gage de Sterak
(20 %) donnaient 50 % au lieu de 44 %. Une réduction qui s'additionne finit par
atteindre 100 %, ce qu'aucune réduction du jeu ne fait. Elles rejoignent les
pénétrations dans `MULTIPLICATIVES`. ⚠ La ténacité ne touche **pas** les projections,
la somnolence, la myopie, la stase ni la suppression : la fiche les nomme.

**Vitesse de déplacement** — plafond progressif officiel, trois régimes dont les bornes
se raccordent exactement (415 × 0,8 + 83 = 415 ; 490 × 0,8 + 83 = 490 × 0,5 + 230). Au
delà de 490, un point brut n'en vaut plus qu'un demi : sans ce plafond, un quatrième
objet de vitesse paraîtrait rapporter autant que le premier.

**Soins et drain** — trois canaux qu'il ne faut pas confondre : le vol de vie ne porte
que sur les attaques de base, l'omnivampirisme sur tout, l'efficacité des soins et
boucliers amplifie ce que le champion *produit*. Les additionner donnerait 150/s là où
le vrai chiffre est 90. Au passage, les calculs de genre « soin », extraits pour les
90 champions depuis le début, servent enfin.

`ficheBuild()` renvoie les cinq axes côte à côte — offensif, défensif, utilitaire,
soutien, passifs — sans en privilégier un. Le meilleur build en dégâts n'est presque
jamais le meilleur build.

### Réduire une résistance n'est pas la pénétrer

Cinquième catégorie. Le Couperet noir était écarté au motif qu'il « agit sur la
mitigation, pas comme des dégâts ajoutés » — c'était exact, et c'était précisément une
raison de le **brancher**, pas de l'ignorer : `resistEffective` sait traiter une
réduction depuis le premier jour, personne ne lui en fournissait.

| Objet | Réduction | Sur |
|---|---|---|
| Couperet noir | 6 % × 5 cumuls = 30 % | armure |
| Malédiction du sanguinaire | 7,5 % × 4 cumuls = 30 % | résistance magique |
| Malfaisance | **10 points**, pas 10 % | résistance magique |

La séquence officielle place la réduction **avant** la pénétration :
réduction plate → réduction en % → pénétration en % → pénétration plate.
Deux pourcentages consécutifs commutent, donc confondre réduction et pénétration *en
pourcentage* ne se voit pas. Ce qui se voit, c'est le cas **plat** : sur une cible à
30 de RM, une réduction plate de 10 suivie de 30 % de pénétration laisse **14** ;
la même valeur prise pour de la pénétration plate laisse **11**.

Deux pièges de lecture évités ici, symétriques l'un de l'autre :

- Malfaisance retire **10 points** de RM, pas 10 % — le wiki tranche (« reduces their
  magic resistance by 10 ») et le calcul du fichier donne bien 10.
- Le `RangedMod: 0.5` du Couperet noir **ne concerne pas** le découpage : il modifie la
  vitesse de déplacement de Ferveur, comme le montre `MSBonusSplit` (20, facteur
  distance 0,5). L'appliquer aurait donné 15 % au lieu de 30 % sur un champion à
  distance. C'est l'erreur inverse de celle évitée sur la Lance de Shojin, où la
  version à distance existe bel et bien — sous forme d'un second calcul.

### Cinq cadences, et pourquoi elles ne se mélangent pas

Un passif de dégâts ne vaut quelque chose que rapporté à SA cadence. Les confondre est
le plus court chemin vers un chiffre faux d'un ordre de grandeur.

| Déclencheur | Sens | Exemples |
|---|---|---|
| `coupAImpact` | à chaque attaque de base | Dent de Nashor, Lame du roi déchu |
| `toutesNAttaques` | un coup sur *n*, **amorti** sur la durée | Tueur de krakens (1/3) |
| `apresCompetence` | lame enchantée, avec sa propre recharge | Force de la trinité |
| `periodique` | un débit par seconde | Égide solaire (20 + 1,5 % PV bonus) |
| `intervalle` | une fois par recharge | Désespoir infini (4 s), Cœuracier (30 s) |
| `actif` | lancé par le joueur, longue recharge | Ceinture-roquette, Pistolame |

Seules les deux premières entrent dans les dégâts **par attaque** ; un test le vérifie
explicitement. Verser l'Égide solaire dans le coup à l'impact la multiplierait par la
vitesse d'attaque — sur un tank à 1 attaque/s, l'erreur passerait inaperçue ; sur une
ADC à 2,5, elle serait de 150 %.

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
