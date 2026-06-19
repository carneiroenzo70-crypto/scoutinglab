# Phase 2A — Collecte automatique quotidienne (cron)

Date : 2026-06-17
Statut : validé (architecture + cron) par Enzo, à implémenter

## Objectif

Collecter automatiquement, chaque jour, les stats Solo Q des joueurs des rosters
suivis, et stocker un historique côté serveur → la vue Évolution se remplit toute
seule (plus besoin de cliquer « Instantané »).

## Décisions d'architecture (validées)

- **Le score SPES reste calculé côté client.** Le serveur ne stocke que des
  **stats brutes** ; le navigateur calcule le score à l'affichage (source unique
  du scoring). Format snapshot unifié (manuel + auto) :
  ```
  Snapshot = { date, players: [ { role, pseudo, tier, lp, wr, kda, cs, vision } ] }
  ```
- **Stockage serveur** (Upstash), par compte (`u` du token) :
  - `vs_track:<u>`  → JSON `[ { rosterId, name, players:[{pseudo,tag,server,role}] } ]`
  - `vs_snaps:<u>:<rosterId>` → JSON liste de Snapshots (cap 90)
  - `vs_track_users` → SET des comptes ayant des rosters suivis (pour le cron)

## Endpoints (api/)

- **`/api/roster-track`** (POST, auth) : body `{ rosters:[{rosterId,name,players}] }`
  → écrit `vs_track:<u>` + `SADD vs_track_users <u>`. Appelé par le client quand
  un roster change.
- **`/api/snapshots`** (auth) :
  - GET `?roster=<id>` → renvoie `vs_snaps:<u>:<id>` (liste).
  - POST `{ rosterId, snapshot }` → append (cap 90). Utilisé par la capture
    manuelle (📸) pour écrire côté serveur.
- **`/api/cron-snapshot`** (GET, protégé) : déclenché par le cron Vercel.
  Auth par en-tête `Authorization: Bearer <CRON_SECRET>` (env). Parcourt
  `vs_track_users` → pour chaque user, lit `vs_track:<u>`, pour chaque joueur
  appelle Riot (compte→league→derniers matchs) **throttlé** (~150-200ms entre
  appels), construit un Snapshot brut par roster et l'append dans
  `vs_snaps:<u>:<rosterId>` (1 point/jour ; dédoublonnage par date du jour).

## Cron Vercel

`vercel.json` → `"crons": [{ "path": "/api/cron-snapshot", "schedule": "0 6 * * *" }]`
(quotidien 06:00 UTC ; compatible plan Hobby = 1/jour). Vercel ajoute
automatiquement l'en-tête d'autorisation cron ; on vérifie en plus `CRON_SECRET`.

## Refactor client (snapshots bruts)

- `rsResolveScore` expose aussi les **stats brutes** (tier, lp, wr, kda, cs, vision)
  en plus du score.
- `rsSnapCapture` (manuel) stocke le **format brut** et POST aussi vers
  `/api/snapshots` (en plus du localStorage, pour fusion).
- Nouveau `rsScoreFromRaw(raw, role)` : recompose le score via `calcProspectScore`.
- L'évolution lit les snapshots **serveur** (`GET /api/snapshots`) si dispo, sinon
  localStorage ; calcule score (par joueur + équipe) à partir du brut au rendu.
- Sync : à l'ouverture/modif d'un roster, le client POST `/api/roster-track`.

## Variables d'environnement à ajouter (côté Vercel, par l'utilisateur)

- `CRON_SECRET` : secret partagé pour protéger `/api/cron-snapshot`.
  (`RIOT_API_KEY` et `UPSTASH_*` déjà configurés.)

## Limites / sécurité

- Clé Riot personnelle → cron throttlé, volume modeste (quelques rosters) OK ;
  la clé de prod (attendue) augmentera la marge.
- Le cron ne traite que les joueurs avec un Riot ID (pseudo#tag) renseigné.
- Vérification bout-en-bout en PROD (backend non émulable en preview) : test des
  endpoints via curl avec un token de session, et déclenchement manuel du cron.

## Vérif (réaliste)

- Logique client (rsScoreFromRaw, format brut) : testable en preview.
- Endpoints + cron : testés en prod après déploiement (curl + token), puis 1er
  run réel.
