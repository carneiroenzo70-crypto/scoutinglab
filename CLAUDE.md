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
Plafond dur. Un import de 100 parties inédites ne peut PAS être rapide tant que Riot
n'accorde pas une clé Production (demande en cours). Le `429` qui « fait buguer » les
imports vient de là, pas du code.

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

### Données par compte (multi-tenant, livré 19/07/2026)
**1 compte = 1 structure cliente.** Chaque compte ne voit QUE ses données.

- Clés Upstash : `vs_data:<compte>:{fiches|rosters|crm|structures}`, `vs_candidates:<compte>`,
  `vs_snaps:<compte>:<rosterId>`. **Le compte vient toujours du token côté serveur, jamais du client.**
- Endpoint unique `api/store.js` : `GET ?domains=…` + `PUT {domain,data}`.
- Client : module **`vsStore`** dans `app.html` (près de `vsLogout`) — le `localStorage`
  n'est qu'un **cache**, le serveur est la source de vérité. `vsStore.save(domain)` est
  débouncé ~1 s ; `loadAll()` tourne au boot. Migration douce au 1er login.
- Garde-fou : le cache local est estampillé `vs_cache_owner` et **purgé** si un autre
  compte se connecte sur le même navigateur (sinon fuite de données entre comptes).
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

**Chantier suivant identifié** : vitesse d'import Riot (cache serveur des matchs
`vs_match:<id>` — données immuables — + back-off propre sur 429). Diagnostic en annexe de
`docs/superpowers/specs/2026-07-19-multitenant-storage-design.md`.

---

## Conventions

- Zéro dépendance npm côté API (crypto natif + `fetch`). Ne pas introduire de framework.
- Commentaires et libellés UI **en français**.
- Suivre les patterns existants (`rankIcon()`, `anScoreColor()`, `anEsc()`, tokens `--vs-*`)
  plutôt que réinventer.
- `app.html` est énorme : lire la zone concernée avant d'éditer, et viser des ancres de
  remplacement **uniques** (plusieurs fonctions se ressemblent).
- Ne jamais commiter `commercial/` (documents internes) ni les sources gitignorées.
