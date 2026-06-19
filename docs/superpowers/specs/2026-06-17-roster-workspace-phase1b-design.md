# Rubrique « Roster » — Design (Phase 1b)

Date : 2026-06-17
Statut : validé (design), à implémenter
Pré-requis : Phase 1 livrée (store `vs_rosters`, `rsResolveScore`, `rsTeamScore`, `renderRoster`).

## Objectif

Compléter la rubrique Roster avec : (A) la **comparaison roster-vs-roster** et
(B) le **suivi des stats dans le temps** via snapshots manuels.

## A. Comparaison roster-vs-roster

- Dans la vue Roster, un **mode « Comparer »** (bouton/bascule) affiche deux
  sélecteurs de rosters sauvegardés (A et B).
- Affichage :
  - **Face-à-face par poste** : score A vs score B pour chaque rôle, le meneur
    surligné (vert), l'écart indiqué.
  - **Score d'équipe** des deux rosters côte à côte.
  - **Radar à 5 axes** = les 5 rôles (Top/Jgl/Mid/ADC/Sup), deux séries (A, B).
    Réutilise Chart.js (déjà chargé pour les autres radars).
- Réutilise `rsTeamScore(roster)` (déjà : `{team, perRole, weakest}`).
- L'onglet « Comparer » existant (radar de fiches individuelles) reste en place
  pour l'instant (capacité distincte) ; retrait/fusion éventuels plus tard.

## B. Suivi dans le temps (snapshots manuels)

- **Stockage** : `localStorage['vs_roster_snapshots']` =
  `{ [rosterId]: [ Snapshot ] }`, trié par date croissante.
  ```
  Snapshot = {
    date: ISOstring,
    teamScore: number|null,
    players: [ { role, pseudo, score, rank, lp, wr } ]   // un par slot rempli
  }
  ```
- **Capture** : bouton « 📸 Enregistrer un instantané » dans la vue Roster →
  calcule `rsTeamScore` (qui résout chaque joueur) et enregistre un Snapshot
  daté. Cap à 60 snapshots/roster (au-delà, on retire les plus anciens).
- **Pré-requis** : `rsResolveScore` doit aussi renvoyer `lp` (actuellement il
  renvoie `{score, source, rank, wr}` ; on ajoute `lp` et on garde `rank` =
  tier+division). Joueurs « fiche seule » (Scout, sans Solo Q live) : `rank/lp/wr`
  restent vides, seul `score` est tracé.
- **Affichage évolution** (dans la vue Roster, section « Évolution ») :
  - **Courbe 1** : score d'équipe SPES dans le temps (ligne unique).
  - **Courbe 2** : par joueur, avec **sélecteur de métrique** (Score SPES / WR /
    LP) — une ligne par titulaire. Réutilise le motif du graphe de forme .rofl
    (`AN_METRIC` / `anDrawFormChart`) : palette fixe, Chart.js line.
  - Axe X = dates des snapshots (groupées par jour ; libellé court JJ/MM).

## Hors périmètre (Phase 2)

- Collecte **automatique** quotidienne (cron serveur + stockage backend).
- Stats **compétition détaillées** par joueur intégrées au roster/suivi.

## Limites connues

- Snapshots = photo de l'instant du clic ; pas d'historique rétroactif.
- Joueurs non-Solo Q (fiche seule) : pas de rang/LP/WR à tracer (score seul).
- Stockage localStorage (navigateur/poste) ; pas de synchro multi-appareils
  (viendra avec la Phase 2 backend).

## Fonctions impactées

- `rsResolveScore` → ajouter `lp` (et conserver `rank`) au retour.
- Nouveau : store snapshots (`rsSnapsAll/rsSnapsGet/rsSnapAdd`), capture,
  rendu des 2 graphes, rendu du mode comparaison + radar.
- `renderRoster` → ajouter les bascules « Comparer » et « Évolution » + bouton
  « Enregistrer un instantané ».
- Réutilise : `rsTeamScore`, `rsAll/rsActive`, `anScoreColor`, Chart.js.
