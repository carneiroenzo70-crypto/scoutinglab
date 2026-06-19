# Phase 2B — Stats compétition détaillées (+ chantier 4 avant-match)

Date : 2026-06-17
Statut : en cadrage
Couvre aussi le **chantier 4** (avant-match : résumé d'équipe soloq + pro plus détaillé).

## Objectif

Enrichir les stats de **compétition** par joueur (via Leaguepedia `/api/lp`),
et les présenter de façon beaucoup plus détaillée dans le **dossier d'avant-match**
(qui est déjà la vue « résumé d'équipe » avec une section Solo Q et une section
Compétition par joueur).

## Données (Leaguepedia, table ScoreboardPlayers)

Champs déjà utilisés : Champion, Kills, Deaths, Assists, PlayerWin, TeamVs,
OverviewPage, DateTime_UTC.
Champs à AJOUTER (à confirmer par sonde) : **CS**, **VisionScore**, **Gold**,
**DamageToChampions**.

Agrégats par joueur (sur N dernières parties de compétition) :
- **WR**, **KDA** (moyens),
- **CS / partie** (pas de CS/min fiable : la durée n'est pas dans ScoreboardPlayers),
- **VisionScore / partie**,
- **Dégâts / partie**, **Gold / partie** (si dispo),
- **Champion pool** (top champions joués + WR),
- **Découpage par tournoi/split** : grouper par `OverviewPage.split('/')[0]`
  → pour chaque compétition : nb parties, WR, champs principaux.

## Affichage (dossier d'avant-match, par joueur)

Section **Compétition** enrichie : ligne de stats clés (WR · KDA · CS/g ·
Vision/g · Dégâts/g), pool de champions avec WR, et un petit tableau
« par compétition » (LEC, LFL… : parties, WR, champ phare).
La section **Solo Q** existante reste (et peut être harmonisée visuellement).

## Périmètre / limites

- CS/min indisponible (durée absente de ScoreboardPlayers) → on affiche CS/partie.
- Joueurs absents de Leaguepedia (semi-pros) → section compétition vide (déjà géré).
- Mapping pseudo soloq → nom pro inchangé (champ « nom pro » manuel existant).
- Réutilise le proxy caché `/api/lp` (cache Redis 6h) → pas de souci de rate-limit.

## Fonctions impactées

- `pmFetchCompet` / `pmFetchCompetBatch` : ajouter CS, VisionScore, Gold,
  DamageToChampions aux champs récupérés + calculer les agrégats et le découpage
  par tournoi.
- `pmCard` (section Compétition) : afficher les stats détaillées + tableau par
  compétition.
- Réutilise : `pmCargo`, `anEsc`, `pmChampPills`.
