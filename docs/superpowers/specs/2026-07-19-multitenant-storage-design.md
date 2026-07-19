# Stockage par compte (multi-tenant) — Design

Date : 2026-07-19
Statut : validé (design), à implémenter
Périmètre de ce document : **Phase 1 uniquement** (stockage par compte + isolation
candidatures). La **Phase 2** (vitesse d'import Riot) est décrite en fin de document
pour le contexte mais fera l'objet de son propre spec + plan.

## 1. Objectif

Aujourd'hui, presque toutes les données du produit (fiches de scouting, roster,
pipeline CRM, structures, candidatures) vivent dans le `localStorage` du
navigateur, **non rattachées au compte connecté**. Conséquences :

- Même compte, autre appareil → aucune donnée retrouvée (pas de synchro).
- Deux comptes, même navigateur → ils voient les données l'un de l'autre.
- Les candidatures sont un **pot commun global** : tous les comptes voient la
  même liste.
- La déconnexion n'efface pas les données locales (fuite sur PC partagé).

Objectif : chaque **compte = une structure cliente** possède ses propres données,
stockées **côté serveur (Upstash)** et **isolées par compte**, synchronisées entre
appareils, invisibles des autres comptes. Le `localStorage` devient un simple cache
rapide ; la source de vérité est le serveur.

Modèle de tenance validé : **1 compte = 1 structure cliente** (SaaS). Les
`crmStructures` restent des sous-catégories optionnelles *à l'intérieur* d'un compte.

## 2. Périmètre des données

**Migrées côté serveur, par compte :**

| Domaine | Clé localStorage actuelle | Nouvelle clé Upstash |
|---|---|---|
| Fiches de scouting | `spes_history` | `vs_data:<compte>:fiches` |
| Rosters (+ roster actif) | `vs_rosters`, `vs_active_roster` | `vs_data:<compte>:rosters` |
| Pipeline CRM | `spes_crm_pipeline` | `vs_data:<compte>:crm` |
| Structures CRM | `spes_crm_structures` | `vs_data:<compte>:structures` |
| Candidatures | `vs_candidates` (global) | `vs_candidates:<compte>` |

Le roster actif (`vs_active_roster`) est embarqué dans le domaine `rosters` sous la
forme `{ list: [...], activeId: <id> }` (un seul domaine à synchroniser).

**Hors périmètre (restent en localStorage pour l'instant) :** Top 50 (`top50_data`,
génération jetable), données de scrim (`vs_scrim_*`, outil en pause), préférences
d'affichage (`vs-theme`, `spes_mode`, `ob_dismissed`), snapshots roster
(`vs_snaps:<compte>`, **déjà** côté serveur et isolés — inchangés).

## 3. Stockage + API serveur

### 3.1 Endpoint générique `/api/store` (nouveau)

Un **seul** nouvel endpoint authentifié (token de session requis, comme
`/api/snapshots`). Le compte est déduit du token (`payload.u`) — jamais passé par le
client, donc pas d'usurpation possible.

```
GET  /api/store?domains=fiches,rosters,crm,structures
     → 200 { fiches: <data|null>, rosters: <data|null>, crm: <data|null>, structures: <data|null> }
       (une lecture Upstash MGET des clés vs_data:<compte>:<domaine>)

PUT  /api/store
     body { domain: "fiches"|"rosters"|"crm"|"structures", data: <any> }
     → 200 { ok: true }
       (SET vs_data:<compte>:<domaine> = JSON.stringify(data))
```

- `domain` est validé contre une **liste blanche** `['fiches','rosters','crm','structures']`.
- Taille de `data` plafonnée (rejet si > ~1 Mo) pour éviter les abus.
- CORS + gestion `OPTIONS` alignés sur les autres endpoints.

### 3.2 Candidatures par compte

- `GET /api/candidates` : ne lit plus le pot commun `vs_candidates`, mais
  `vs_candidates:<compte>` (liste du compte connecté). Auth déjà en place.
- `POST /api/candidate` (ingestion depuis le Google Form d'une structure) : accepte
  un paramètre `to=<ingestKey>` (query ou body). La candidature est poussée dans
  `vs_candidates:<compte>` du compte correspondant. Sans `to` valide → 400.
- **Code d'ingestion** : chaque compte a un `ingestKey` stable, dérivé de façon
  déterministe et non devinable : `HMAC-SHA256(SESSION_SECRET, "ingest:"+username)`
  tronqué (ex. 16 hex). Résolution `ingestKey → username` via une clé de correspondance
  Upstash `vs_ingest:<ingestKey> = <username>`, écrite par `/api/session` (voir 4.4).
  Aucun nouveau secret à gérer.
- L'ancien pot commun `vs_candidates` (issu de l'ère « VisionScore scout », abandonnée)
  n'est plus servi aux comptes clients. Il reste en base tel quel (pas de suppression
  destructive) mais n'est plus lu par l'app.

## 4. Client : couche de synchro

### 4.1 Module `vsStore` (nouveau, dans app.html)

Petite couche qui encapsule la synchro, pour ne pas disperser la logique :

```
vsStore.loadAll()      // au démarrage (après auth) : GET /api/store → remplit le
                       //   cache mémoire + localStorage. Source de vérité = serveur.
vsStore.save(domain)   // débouncé ~1 s : PUT /api/store pour ce domaine.
                       //   Écrit AUSSI le localStorage (cache) immédiatement.
```

`save(domain)` est appelé partout où l'on écrit aujourd'hui ces domaines. Les
fonctions existantes (`crmSave`, `rsSaveAll`, sauvegarde des fiches…) continuent
d'écrire le `localStorage` (cache) **et** déclenchent en plus `vsStore.save(...)`.

### 4.2 Chargement à la connexion

1. Après validation du token, `vsStore.loadAll()` récupère les 4 domaines.
2. Pour chaque domaine : si le serveur renvoie des données → elles **écrasent** le
   cache local (le serveur gagne). Puis l'app lit le localStorage comme avant.
3. Les candidatures sont chargées via `/api/candidates` (déjà par compte).

### 4.3 Migration douce (comptes existants)

Au 1er `loadAll()` après déploiement, pour chaque domaine :

- Si **serveur vide** ET **localStorage non vide** → on **pousse le local vers le
  serveur** une fois (`vsStore.save(domain)`), puis on pose un drapeau
  `vs_migrated:<compte>` (localStorage) pour ne pas recommencer.
- Si serveur non vide → le serveur gagne (cas normal après migration).
- Si les deux sont vides → rien à faire.

Aucune perte de données pour les comptes actuellement en service.

> Les candidatures ne sont **pas** migrées depuis le pot commun (elles n'appartenaient
> à personne) : chaque compte repart d'une liste vide, alimentée par son propre form.

### 4.4 Réglage du code d'ingestion

`/api/session` (déjà appelé à chaque ouverture de l'app pour valider la session)
calcule `ingestKey = HMAC(SESSION_SECRET, "ingest:"+username)` tronqué, garantit la
correspondance `vs_ingest:<ingestKey> = <username>` en base (`SET` idempotent), et
renvoie `ingestKey` dans sa réponse. L'app affiche alors, dans l'onglet Candidatures,
le lien d'ingestion (`/api/candidate?to=<ingestKey>`) + la marche à suivre pour y
connecter un Google Form. Aucun appel supplémentaire.

### 4.5 Déconnexion

`vsLogout()` efface, en plus du token : `spes_history`, `vs_rosters`,
`vs_active_roster`, `spes_crm_pipeline`, `spes_crm_structures`, `vs_candidates*`,
`vs_migrated:<compte>`, et le cache mémoire. → ferme la fuite « PC partagé ».

## 5. Conflits & robustesse

- **Dernier-écrit-gagne par domaine.** Sauvegardes débouncées. Deux appareils
  éditant le même domaine *simultanément* : le dernier PUT gagne. Cas rarissime à
  cette échelle, accepté.
- **Réseau indisponible au save** : on retente une fois ; en cas d'échec persistant,
  le localStorage garde la modif (elle repartira au prochain `save` réussi ou au
  prochain login via la migration si le serveur était encore vide). Pas de perte
  silencieuse côté utilisateur ; un petit toast discret signale « synchro différée ».
- **Store Upstash indisponible au load** : on tombe sur le cache localStorage
  (mode dégradé, comme `/api/session` le fait déjà) plutôt que d'afficher une app vide.

## 6. Sécurité (rappel des points fermés par ce chantier)

- Isolation stricte par compte (clés préfixées `<compte>`, compte déduit du token
  serveur, jamais du client).
- Effacement des données locales à la déconnexion (fuite PC partagé).
- Les endpoints `/api/store` et `/api/candidates` exigent un token valide ;
  `/api/candidate` (public, ingestion) exige un `ingestKey` valide et ne peut écrire
  que dans le compte ciblé.

Hors périmètre (notés pour un chantier « sécurité » ultérieur) : rate-limit sur
`/api/login`, audit XSS des insertions `innerHTML`.

## 7. Critères de réussite (vérifiables)

1. Compte A crée un roster + une fiche + un prospect CRM → déconnexion → reconnexion
   sur un **autre navigateur** → il retrouve tout.
2. Compte B se connecte sur le **même navigateur** que A (après déconnexion de A) →
   il ne voit **rien** de A (ni roster, ni CRM, ni candidatures).
3. Une candidature postée via `/api/candidate?to=<ingestKey de A>` n'apparaît que
   dans le compte A.
4. Un compte existant (données déjà en local) retrouve ses données après le
   déploiement (migration douce).
5. Aucune régression visible de vitesse dans l'usage courant (saves débouncés,
   cache local en lecture).

---

## Annexe — Phase 2 (contexte, hors de ce spec)

**Vitesse d'import Riot.** Clé Riot **Personnelle** en prod (limite dure
**100 req / 2 min** ; Production en attente). Un import de 100 parties inédites ne
peut pas descendre sous ~2 min sous cette clé — limite Riot, pas le code. Le réglage
actuel (`fetchMatchesInBatches` : paquets de 5 toutes les 1,4 s ≈ 3,5 req/s) dépasse
le quota et provoque le `429` qui « fait buguer » les imports 50/100.

Leviers de la Phase 2 (spec dédié à venir) :

1. **Cache serveur des matchs** (Upstash, `vs_match:<matchId>` — données immuables) :
   ré-imports et joueurs partageant des games → quasi instantanés. Gros gain
   disponible **sans** attendre Production.
2. **Fiabilité 429** : back-off au lieu de planter → l'import finit toujours.
3. **Import rapide par défaut** (ex. 30 games) + « scan approfondi » 100/200 avec
   estimation de temps honnête.
4. À l'obtention de la **clé Production** : suppression des pauses → 100 games en
   quelques secondes.
