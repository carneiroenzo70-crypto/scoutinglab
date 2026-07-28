# Salle de draft collaborative — design

**Date** : 2026-07-28
**Demandeur** : Alan, assistant-coach Galions (LFL / EMEA Masters), après le premier rendez-vous
**Besoin exprimé** : « une draft qui puisse se partager, tous les coachs dessus en même temps,
car ils ne sont pas en gaming house — pour créer les scénarios de chez eux, en live »

---

## 1. Objectif

Permettre à plusieurs coachs d'une même structure, chacun chez soi, de travailler
simultanément sur la draft d'un match de Seasons — soit en **simulation chronométrée**
respectant les règles de compétition, soit en **construction libre de scénarios**.

Ce que ça remplace : aujourd'hui la draft est mono-utilisateur. `vsStore.save()` envoie
**tout le domaine `seasons` en bloc**, en dernier-écrivain-gagne. À deux coachs, l'un
écrase silencieusement l'autre, et rien ne se rafraîchit après le chargement initial.

**Différenciateur produit** : `draftlol` existe et est gratuit. Ce qui justifie d'utiliser
VisionScore à la place, c'est que la draft est **branchée sur les données de scouting** :
pool réel de l'adversaire, win-rates par champion, bans préparés dans les scénarios.

---

## 2. Règles de draft (vérifiées)

### 2.1 Séquence

Exprimée en **premier / second drafteur**, jamais en bleu / rouge (cf. § 2.2).

| Phase | Ordre | Total |
|---|---|---|
| Bans 1 | 1er, 2nd, 1er, 2nd, 1er, 2nd | 6 |
| Picks 1 | **1er** (first pick), 2nd, 2nd, 1er, 1er, 2nd | 6 |
| Bans 2 | 2nd, 1er, 2nd, 1er | 4 |
| Picks 2 | 2nd, 1er, 1er, **2nd** (last pick) | 4 |

20 actions au total. Source : [LoL Wiki — Team drafting](https://wiki.leagueoflegends.com/en-us/Team_drafting).

### 2.2 First Selection (saison 2026)

**« Blue side = first pick » n'est plus vrai.** L'équipe prioritaire choisit *soit* le côté
de la carte, *soit* l'ordre de draft ; l'adversaire prend l'autre. Les quatre combinaisons
sont donc possibles : bleu+1er, bleu+2nd, rouge+1er, rouge+2nd.

Conséquence de conception : `side` (bleu/rouge) et `priority` (1er/2nd) sont **deux attributs
indépendants**. La machine à états raisonne sur `priority` ; `side` ne sert qu'à l'affichage
et au positionnement à l'écran.

Sources : [Right of First Selection](https://lol.fandom.com/wiki/Right_of_First_Selection),
[Esports.gg](https://esports.gg/news/league-of-legends/first-selection-explained/).

À confirmer auprès d'Alan : la LFL applique-t-elle First Selection ? (le réglage existe de
toute façon, ça ne bloque rien).

### 2.3 Chronomètre

**30 secondes par action**, identique pour les bans et les picks, en Tournament Draft.

⚠️ Piège à ne pas reproduire : les valeurs 35 s (bans) / 27 s (picks) qu'on trouve
facilement sont celles de la **file classée**, pas du mode tournoi.

**Réserve de temps** : non confirmée dans les sources publiques (elle figure dans les
rulebooks de ligue, non accessibles). → **paramétrable au lancement, 0 par défaut**.
Alan donnera la vraie valeur LFL.

Comportement à l'expiration : l'action passe, l'emplacement reste vide, la draft continue.

### 2.4 Fearless (BO3 / BO5)

Règle retenue, confirmée par Enzo pour la LFL :

- un champion **pické** devient indisponible **pour les deux équipes**, sur **tout le BO** ;
- un champion **banni** redevient disponible à la game suivante.

Un seul pool global de champions consommés, alimenté uniquement par les picks.

En BO5 game 5, 40 champions sont sortis — environ 8 par rôle, souvent la moitié du pool
méta réel. D'où l'indicateur de profondeur **par rôle** (§ 5.4), pas en total brut.

### 2.5 BO1

Pas de fearless. Bouton **« Rejouer »** qui réinitialise la draft instantanément, pour
enchaîner les simulations. Une draft terminée peut être conservée en scénario.

---

## 3. Périmètre

### Inclus

- Salle de draft rattachée à un match de Seasons, rejoignable par lien.
- Mode **live** : séquence officielle, chronométrée, tour par tour.
- Mode **scénario libre** : édition simultanée sans chrono ni tour de jeu.
- Présence : qui est connecté, sur quel côté, quel emplacement chacun a sélectionné.
- Fearless automatique en BO3/BO5, rejouabilité en BO1.
- Panneau de scouting adverse pendant la draft.
- Comptes coach rattachés à une structure (§ 6).

### Exclus (YAGNI)

- **Curseurs souris temps réel** : impossibles sans transport temps réel externe (Vercel
  n'héberge pas de WebSocket). Écartés aussi parce qu'ils feraient transiter les scénarios
  de draft — la donnée la plus confidentielle d'une équipe — par un tiers. « Emplacement
  sélectionné par chacun » couvre le besoin réel : ce que le coach est en train de décider,
  pas où est sa souris.
- Chat / commentaires : les coachs sont sur Discord en parallèle.
- Système de rôles et permissions : décidé avec Enzo, un compte coach voit la même chose
  que le compte principal.
- Voix, vidéo.

---

## 4. Architecture technique

### 4.1 Contraintes fermes

| Contrainte | Conséquence |
|---|---|
| **12/12 fonctions Vercel** (Hobby) | Aucun nouvel endpoint. La salle est servie par `api/store.js`, branché sur un paramètre. |
| **Pas de WebSocket sur Vercel** | Le serveur ne peut jamais pousser. Polling côté client obligatoire. |
| **Zéro dépendance npm côté API** | `crypto` natif + `fetch` uniquement. |
| **Upstash Redis REST** | Pas de `SUBSCRIBE` bloquant exploitable. Confirme le polling. |

### 4.2 Deux propriétés qui simplifient beaucoup

**Le mode live est tour par tour** → à un instant donné, un seul côté a le droit d'agir.
Les conflits d'écriture sont impossibles *par les règles du jeu*. Le moteur d'opérations
granulaires n'est nécessaire que pour le mode scénario libre.

**Le chrono n'a pas besoin d'être synchronisé en continu** → le serveur renvoie une échéance
absolue (`phaseEndsAt`), chaque navigateur décompte localement. Aucune dérive, aucun
aller-retour permanent.

### 4.3 État de la salle

Clé Upstash : `vs_draftroom:<roomId>`, **TTL 12 h** (nettoyage automatique).
`roomId` = jeton aléatoire non devinable.

```
{
  roomId, org, matchId, createdBy, createdAt,
  mode: 'live' | 'libre',
  format: { bo: 1|3|5, fearless: bool, firstSelection: bool,
            turnSeconds: 30, reserveSeconds: 0 },
  seats: { first: {account,name}|null, second: {...}|null,
           sides: { first: 'blue'|'red', second: 'blue'|'red' } },
  observers: [...],
  presence: { <account>: { name, lastSeen, selectedSlot } },
  gameIndex: 0,
  usedChampions: [...],        // fearless : picks des games précédentes, global
  games: [ { actions: [...], phase: int, phaseEndsAt: ts,
             reserve: { first: int, second: int }, done: bool } ],
  rev: int                      // incrémenté à chaque mutation
}
```

### 4.4 Synchronisation

Un seul verbe côté client : `POST /api/store?room=<id>` avec une **opération**, et
`GET /api/store?room=<id>` pour lire l'état.

Le serveur **applique l'opération sur l'état stocké** (jamais un remplacement de bloc envoyé
par le client) puis incrémente `rev`. C'est ce qui garantit qu'aucune écriture n'est perdue
en mode libre, où deux coachs éditent réellement en même temps.

Opérations : `join`, `takeSeat`, `setFormat`, `start`, `pick`, `ban`, `undo` (libre seulement),
`nextGame`, `replay`, `heartbeat`, `selectSlot`, `saveAsScenario`.

Cadence de polling :

| Situation | Intervalle |
|---|---|
| Draft live en cours | 1 s |
| Mode scénario libre | 3 s |
| Salle ouverte mais inactive | 10 s |
| Onglet en arrière-plan | suspendu |

Le `GET` renvoie l'état complet (quelques Ko) — pas de requête de version séparée, donc
**une seule commande Redis par sondage**.

⚠️ **Coût à surveiller** : une draft live à 3 coachs ≈ 1 800 sondages. Si la consommation
Upstash devient un sujet, la première mesure est d'allonger l'intervalle en mode libre,
puis de ne renvoyer l'état complet qu'au changement de `rev`.

### 4.5 Résolution de conflit

- **Mode live** : le serveur rejette toute action dont l'auteur n'est pas le côté au tour,
  ou dont la phase ne correspond plus. Le client réaffiche l'état serveur. Aucun conflit
  possible par construction.
- **Mode libre** : dernier écrivain gagne **par emplacement** (et non sur tout le bloc).
  Deux coachs sur deux emplacements différents ne s'écrasent jamais.

### 4.6 Sécurité

- Rejoindre une salle exige **un compte de la structure propriétaire** (`org`). Un lien qui
  fuite ne donne rien à un extérieur — indispensable vu la confidentialité d'une draft.
- `org` est déduit du token côté serveur, **jamais du client** (règle déjà en vigueur).
- TTL 12 h : aucune salle ne traîne indéfiniment.

---

## 5. Écrans

### 5.1 Lancement

Depuis un match de Seasons, bouton **« Lancer la draft »**. Ouvre la salle et affiche le
lien à coller dans Discord. Réglages au lancement : mode, réserve de temps, First Selection.

### 5.2 Salon d'attente

Chaque arrivant prend une place : **1er drafteur**, **2nd drafteur**, ou **observateur**.
Chaque drafteur choisit son côté (bleu/rouge) — indépendant de la priorité (§ 2.2).
Le démarrage n'est possible que si les deux places de drafteur sont prises.

### 5.3 Draft live

- Les deux colonnes (bans + picks) par côté, positionnées selon `side`.
- Chrono visible, celui du côté au tour mis en avant ; réserve affichée si > 0.
- Seul le côté au tour peut cliquer ; les autres voient l'action apparaître (≤ 1 s).
- Grille de champions avec filtre par rôle et recherche (réutilise `ssChampList()`).
- Champions consommés par le fearless : grisés et non cliquables.
- Bandeau de présence : qui est là, sur quelle place, quel emplacement il a sélectionné.

### 5.4 Profondeur de pool (fearless)

Indicateur **par rôle** du nombre de champions encore disponibles. C'est l'information qui a
du sens en BO5 : « il te reste 6 supports jouables », pas « il reste 130 champions ».

Définition du dénominateur : les champions **rattachés à ce rôle** par la table de rôles déjà
utilisée par `ssChampList()` (dérivée des taux de sélection réels par rôle, pas de l'étiquette
générique de Data Dragon). Un champion joué sur deux rôles compte dans les deux. On ne cherche
pas à recalculer un « méta » maison : la table existante suffit et reste cohérente avec la
grille de champions affichée juste à côté.

### 5.5 Panneau de scouting

Pendant la draft : roster adverse réel, pool de champions par joueur et win-rates (données
déjà récupérées par le module Seasons). Les champions qui sont une menace connue sont
signalés dans la grille. Les bans préparés dans un scénario sont suggérés en phase de ban.

### 5.6 Mode scénario libre

Sans chrono ni tour : chacun pose et retire des champions n'importe où. C'est l'outil actuel
rendu collaboratif. Les scénarios restent attachés au match.

---

## 6. Comptes coach

Décision : **un compte par coach**, avec **les mêmes droits que le compte principal**
(pas de système de rôles).

Mise en œuvre — un seul champ ajouté :

- `vs_user:<username>` gagne un champ **`org`**.
- Toutes les clés de données passent de `<compte>` à `<org>` :
  `vs_data:<org>:<domaine>`, `vs_candidates:<org>`, `vs_snaps:<org>:<rosterId>`, `vs_ingest`.
- Le token porte `org`.
- `POST /api/admin-users` accepte `org` pour créer un compte coach rattaché à une structure.

**Migration : aucune.** Un compte sans `org` retombe sur son propre `username`
(`org = user.org || user.username`), donc toutes les clés existantes restent identiques.
Le repli est **indispensable** côté serveur : les tokens déjà émis (valables 30 jours) ne
contiennent pas `org`.

---

## 7. Tests & vérification

- **API** : `node --test "test/*.test.js"`. Nouveaux tests — machine à états (séquence des
  20 actions, refus d'une action hors tour, expiration du chrono), fearless (un champion
  piké devient indisponible aux deux équipes, un champion banni non), isolation `org`
  (une salle d'une structure est inaccessible à une autre), repli `org` absent.
- **Client** : assertions DOM dans le navigateur (`python -m http.server 8777`, `?demo=1`),
  avec `pmCargo` / `riotFetch` simulés. Vérifier la collaboration en **deux onglets**.
- Vérification en ligne après déploiement (`fetch('https://visionscore.gg/app?nc=…')`).

---

## 8. Livraison par étapes

Découpage volontaire pour que chaque étape soit utilisable seule.

| Étape | Contenu | Utilisable seule ? |
|---|---|---|
| 1 | Couche `org` + comptes coach | oui — plusieurs coachs partagent déjà les données |
| 2 | Salle + présence + mode scénario libre collaboratif | oui — répond au besoin littéral d'Alan |
| 3 | Mode live : machine à états, chrono, First Selection | oui — la simulation de draft |
| 4 | Fearless BO3/BO5 + profondeur de pool par rôle | oui |
| 5 | Panneau de scouting intégré | oui — le différenciateur |

---

## 9. Points ouverts

À confirmer auprès d'Alan en septembre (aucun ne bloque le développement, tous sont
paramétrables) :

1. La LFL applique-t-elle **First Selection** ?
2. Quelle est la **réserve de temps** exacte en LFL ?
3. Le **fearless** retenu (§ 2.4) correspond-il bien à celui appliqué en playoffs ?
