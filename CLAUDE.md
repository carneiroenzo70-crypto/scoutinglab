# VisionScore — contexte projet

Plateforme SaaS B2B de **suivi d'équipe & scouting League of Legends** pour structures esport
(scouting noté « VisionScore™ », CRM de recrutement, roster, avant-match).
Fondateurs : **Enzo** (produit/commercial) et **Mateo** (design/front). Prod : **visionscore.gg**.

---

## ⚠️ Les 5 pièges qui font perdre des heures

### 1. `index.html` est GÉNÉRÉ — ne jamais l'éditer à la main
La vitrine est assemblée par `node _assemble_index.js` à partir de `_landing_markup.html`
+ `_design_ref.html`. **Ces 3 fichiers sont gitignorés** (ils seraient servis publiquement
par Vercel sinon) → ils ne sont donc **pas dans le dépôt cloné**.

- Tu n'as que `index.html` (généré) ? → **N'y touche pas.** Toute modif sera écrasée
  au prochain rebuild. Demande les fichiers sources à Enzo d'abord.
- Tu as les sources ? → édite `_landing_markup.html` / `_assemble_index.js`, puis
  **relance `node _assemble_index.js`**, et commit **seulement `index.html`**.

`app.html` en revanche **EST** la source (fichier unique, versionné) → édition directe OK.

### 2. Limite de 12 Serverless Functions (Vercel Hobby)
Chaque `.js` dans `api/` = 1 fonction. **On est actuellement à 12/12.** Ajouter un
endpoint fait **échouer le build** (déjà arrivé). Solutions : fusionner dans un handler
existant en branchant sur `req.method` (c'est ce qu'on a fait pour
`candidates.js` = GET liste + POST ingestion). Les fichiers préfixés `_` (ex. `_auth.js`)
ne comptent pas.

### 3. Déploiement : `main` → prod automatique
Push sur `main` = mise en ligne sur visionscore.gg. **Le webhook Vercel est capricieux** :
s'il ne se déclenche pas, pousser un commit vide (`git commit --allow-empty -m "relance"`).
Les branches non-`main` donnent un déploiement *preview* (protégé par auth Vercel).

### 4. `curl` est bloqué sur visionscore.gg (403, challenge Vercel)
Pour vérifier un déploiement, exécuter un `fetch()` **depuis le navigateur** :
`fetch('https://visionscore.gg/app?nc='+Date.now()).then(r=>r.text())`.
Vérifier le statut d'un build via l'API GitHub :
`https://api.github.com/repos/carneiroenzo70-crypto/scoutinglab/commits/<sha>/status`.

### 5. Clé API Riot = clé **Personnelle** (100 req / 2 min)
Plafond dur. Un import de 100 parties **inédites** ne peut PAS être rapide tant que Riot
n'accorde pas une clé Production (demande en cours).

**Cache des matchs (2026-07-19)** : `api/riot.js` met en cache Upstash les ressources
**immuables** (`/lol/match/v5/matches/<id>` et `/timeline` → clé `vs_match:<id>[:tl]`,
TTL 30 j). Un match servi depuis le cache **ne consomme aucun quota Riot** → les
ré-imports sont quasi instantanés (mesuré : 20 matchs en 6 ms contre 4 236 ms).
⚠️ **Ne jamais cacher** les données mouvantes (liste d'IDs `/ids`, entrées de ligue,
compte) — le proxy les marque `X-VS-Cache: bypass`.
Sur `429`, le proxy relaie le `Retry-After` réel de Riot et le client attend ce
délai-là ; `fetchMatchesInBatches` saute sa pause quand tout le lot vient du cache
(compteur `_vsCacheHits`).

---

## Architecture

```
app.html          SPA monofichier (~15 000 lignes, plusieurs <script> inline) — LE produit
index.html        vitrine GÉNÉRÉE (cf. piège n°1)
admin.html        /admin — gestion des comptes (protégé par ADMIN_SECRET)
presentation.html /presentation — one-pager commercial
api/*.js          fonctions serverless Vercel (zéro dépendance npm)
api/_auth.js      auth maison : scrypt + token HMAC + helper Upstash + ingestKey
test/*.test.js    tests API (runner intégré Node, aucune dépendance)
docs/superpowers/ specs & plans des chantiers
```

**Stockage** : Upstash Redis (REST). Auth maison (pas de lib) : mots de passe **scrypt**,
tokens **HMAC-SHA256** signés avec expiration. Env Vercel : `SESSION_SECRET`, `ADMIN_SECRET`,
`UPSTASH_URL`, `UPSTASH_TOKEN`, `RIOT_API_KEY`.

### Données par structure (multi-tenant, livré 19/07/2026 · couche `org` 28/07/2026)
**Les données appartiennent à une STRUCTURE, pas à un compte.** Plusieurs comptes coach
peuvent être rattachés à la même structure et voient alors exactement les mêmes données
(pas de système de rôles : un coach a les mêmes droits que le compte principal).

- Chaque utilisateur porte un champ **`org`**. **Repli capital** : `org` absent → le compte
  est sa propre structure (`orgOfUser` / `orgOfToken` dans `api/_auth.js`). C'est ce qui a
  permis d'introduire la couche sans aucune migration de données — et c'est indispensable
  côté token, car les tokens déjà émis (30 j) ne contiennent pas `org`.
- Créer un compte coach : `POST /api/admin-users` avec `org` = identifiant de la structure
  (champ « Structure » sur `/admin`). Vide → compte autonome.
- Clés Upstash : `vs_data:<org>:{fiches|rosters|crm|structures|seasons}`, `vs_candidates:<org>`,
  `vs_snaps:<org>:<rosterId>`, `vs_track:<org>`. **L'org vient toujours du token côté serveur,
  jamais du client.**
- `api/session.js` refuse (401) un token dont l'`org` ne correspond plus à celle du compte,
  pour éviter de lire une structure et d'afficher le lien d'ingestion d'une autre.
- ✅ **Écriture concurrente (corrigé le 26/08/2026)** — c'était la « limite connue » la plus
  coûteuse : le PUT écrivait le domaine **en bloc, dernier écrivain gagne**, et deux coachs
  d'une même structure se détruisaient mutuellement du travail **sans le moindre signal**.
  Chaque domaine porte maintenant une **version** dans une clé voisine `vs_data:<org>:<dom>:v` :
  - `GET` rend les données **et** `__versions` dans le **même MGET** (deux appels séparés
    laisseraient une écriture s'intercaler et fabriqueraient un faux conflit) ;
  - `PUT {domain, data, version}` compare-et-écrit **atomiquement** (script Lua `EVAL`),
    avec un repli non atomique annoncé dans la réponse (`atomique:false`) si l'exécution de
    script n'était pas disponible — un repli silencieux ferait croire à une garantie
    qu'on n'a pas ;
  - version périmée → **409** `{conflit, version, data}`, l'état courant étant joint pour
    que le client fusionne sans avoir à relire.
  - **Transition** : un PUT **sans** `version` (onglet ouvert avant le déploiement) écrit
    encore à l'aveugle et incrémente le compteur. À retirer quand plus aucun ancien onglet
    ne tourne.
  Côté client, `vsStore` garde `bases[domaine]` (l'état de la dernière synchro) et fusionne
  à **trois sources** sur 409 (`vsFusionDomaine`), **par élément** grâce aux `id` : deux
  coachs qui ajoutent chacun un prospect gardent les deux, sans question posée. Les cas
  indécidables remontent en toast au lieu de rester dans le code.
- Endpoint unique `api/store.js` : `GET ?domains=…` + `PUT {domain,data,version}`.
- Client : module **`vsStore`** dans `app.html` (près de `vsLogout`) — le `localStorage`
  n'est qu'un **cache**, le serveur est la source de vérité. `vsStore.save(domain)` est
  débouncé ~1 s ; `loadAll()` tourne au boot. Migration douce au 1er login.
- Garde-fou : le cache local est estampillé `vs_cache_owner` (par **structure**) et **purgé**
  si une autre structure se connecte sur le même navigateur (sinon fuite de données entre
  clients). Deux coachs d'une même structure ne se purgent pas — ils partagent ces données.
- **Si tu ajoutes un nouveau type de données persistantes** : l'ajouter à `VS_STORE_DOMAINS`
  ET appeler `vsStore.save('<domaine>')` après chaque écriture localStorage, sinon la donnée
  ne suivra pas le compte d'un appareil à l'autre.

Spec détaillée : `docs/superpowers/specs/2026-07-19-multitenant-storage-design.md`.

---

## Tests & vérification

- **API** : `node --test "test/*.test.js"` (⚠️ `node --test test/` échoue sur Windows,
  utiliser le glob). Les tests simulent Upstash en remplaçant `global.fetch` — aucun réseau.
- **Client** : pas de runner JS ; on vérifie par **assertions DOM dans le navigateur**
  (serveur local `python -m http.server 8777`, puis assertions via la console/outil navigateur).
  Note : `requestAnimationFrame` ne se déclenche pas dans ce contexte → utiliser `setTimeout`.
- Toujours vérifier un déploiement en ligne après push (cf. piège n°4).

---

## Règles produit & marque (non négociables)

- ❌ **Jamais le mot « semi-pro »** dans le marketing/la vitrine (positionnement : structures
  esport professionnelles). Le terme existe dans le moteur de scoring interne — ne pas
  l'exposer à l'écran ni dans une capture.
- ❌ **Jamais de faux témoignages, faux logos clients, fausses métriques.** Aucune preuve
  sociale inventée.
- ❌ **Jamais demander un mot de passe Riot** dans le produit (CGU Riot, phishing, RGPD).
  Seule voie légitime : RSO/OAuth.
- ❌ L'image 3D du jeu ne peut jamais être affichée dans une page web (contrainte Riot).
- ✅ Design : charte sombre « forêt/émeraude », police d'affichage **Aquavit**, tokens CSS
  `--vs-*`. Icônes SVG au trait, **pas d'emojis** dans l'UI produit.

---

## État des modules

| Module | État |
|---|---|
| Scouting (fiche joueur), Top 50, Comparer, Roster | ✅ en service |
| CRM pipeline / structures | ✅ en service |
| Candidatures | ✅ par compte — chaque structure branche son Google Form sur `/api/candidates?to=<ingestKey>` (code visible dans l'onglet) |
| Avant-match | 🟠 marche, mais fragile (rate-limit Leaguepedia) |
| Analyse vidéo / scrim | 🔴 **en pause** — non vendable en l'état, Enzo explore la question avec Riot. Ne pas relancer ce chantier sans demande explicite. |
| Stripe / paiement | ⚪ scaffold dormant (facturation manuelle) — cf. `docs/STRIPE_SETUP.md` |

**Vitesse d'import (fait le 19/07/2026)** : cache serveur des matchs + back-off honnête
sur 429 — voir piège n°5. **Reste** : quand Riot accordera la clé **Production**, retirer
la pause de 1400 ms dans `fetchMatchesInBatches` (`app.html`) → les imports de 100/200
parties passeront de ~2 min à quelques secondes.

---

## Conventions

- Zéro dépendance npm côté API (crypto natif + `fetch`). Ne pas introduire de framework.
- Commentaires et libellés UI **en français**.
- Suivre les patterns existants (`rankIcon()`, `anScoreColor()`, `anEsc()`, tokens `--vs-*`)
  plutôt que réinventer.
- `app.html` est énorme : lire la zone concernée avant d'éditer, et viser des ancres de
  remplacement **uniques** (plusieurs fonctions se ressemblent).
- Ne jamais commiter `commercial/` (documents internes) ni les sources gitignorées.
