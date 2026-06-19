# Rubrique « Roster » — Plan d'implémentation (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer l'Upgrade Finder en une rubrique « Roster » : rosters nommés sauvegardés, score d'équipe SPES, suggestions d'upgrade par poste (vivier Scout+CRM+Top 50) et simulation what-if.

**Architecture:** Tout se passe dans le fichier unique `C:\Users\carne\scoutinglab\app.html`. On réutilise le scoring existant (`globalScore` pour les fiches, `calcProspectScore` pour le Solo Q), le vivier (`anGatherCandidates`), le fetch Riot proxifié (`riotFetch`), et le hub Analytics (onglets `.an-tab`). Stockage navigateur (`localStorage`).

**Tech Stack:** HTML/JS vanilla monofichier, localStorage, proxy Vercel `/api/riot` + `/api/lp`, déploiement git push → Vercel.

**Méthode de vérification (pas de framework de tests) :** chaque tâche se vérifie via `preview_eval` dans le serveur de preview (`preview_start name=visionscore`, token client factice comme établi en session), en appelant les fonctions et en assertant le retour / l'état localStorage / le DOM. Puis commit. Déploiement (`git push`) seulement en fin de plan, après validation bout-en-bout.

**Pré-requis preview (rappel) :** pour charger `/app.html` sans redirection login, poser un token client :
```js
var b64 = btoa(JSON.stringify({exp:9999999999, plan:'elite'})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
localStorage.setItem('vs_token', b64 + '.sig'); location.href='/app.html';
```

---

## Structure des fichiers

- **Modifié :** `app.html` uniquement. Aucun nouveau fichier (le codebase est monofichier ; on suit ce pattern).
- Zones touchées dans `app.html` :
  - Bloc Upgrade Finder (`anGatherCandidates`, ~ligne 3047) → étendre + nouvelles fonctions roster juste après.
  - Hub Analytics (`AN_DESC`, `anTabRank`, `anShowView`, `anDecorateTabs`, ~lignes 3061-3108) → renommer `upgrade`→`roster`.
  - HTML du hub (`.an-tab data-tab="upgrade"` et `#an-view-upgrade`) → renommer en `roster`.
  - `renderUpgradeFinder` (~ligne 3109) → remplacé par `renderRoster`.

---

## Task 1 : Élargir le vivier au Top 50

**Files:** Modify `app.html` — fonction `anGatherCandidates` (~ligne 3047).

- [ ] **Step 1 : Ajouter la source Top 50**

Dans `anGatherCandidates`, après la boucle `pipe.forEach(...)` et avant la construction de `map`, insérer :

```js
// Source Top 50 (scan des meilleurs joueurs classés)
let top = [];
try { top = (typeof top50Data !== 'undefined' && Array.isArray(top50Data)) ? top50Data : []; } catch (_) {}
top.forEach(p => {
  if (!p || !p.role || !p.name) return;
  const sc = parseFloat(p.score);
  out.push({
    key: 'top50:' + (p.puuid || p.name) + '|' + p.role,
    pseudo: p.name + (p.tag ? '#' + p.tag : ''),
    role: p.role,
    score: isNaN(sc) ? null : sc,
    potentiel: null,
    age: p.age || '',
    source: 'Top50',
    meta: 'Top 50'
  });
});
```

- [ ] **Step 2 : Étendre la priorité de dédoublonnage**

Remplacer la ligne de dédoublonnage (`out.forEach(c => { ... better ... })`) par une version qui ordonne Scout > CRM > Top50 :

```js
const srcRank = { Scout: 3, CRM: 2, Top50: 1 };
const map = {};
out.forEach(c => {
  const k = (c.pseudo || '').toLowerCase().split('#')[0] + '|' + c.role;
  const ex = map[k];
  if (!ex) { map[k] = c; return; }
  const better = (c.score != null && ex.score == null)
    || (c.score != null && ex.score != null && (srcRank[c.source] || 0) > (srcRank[ex.source] || 0));
  if (better) map[k] = c;
});
```

- [ ] **Step 3 : Vérifier dans le preview**

```js
// stub Top 50 + une fiche scout du même joueur (doit prévaloir)
window.top50Data = [{name:'TestADC', tag:'EUW', role:'ADC', score:'7.2', age:'19'}];
localStorage.setItem('spes_history', JSON.stringify([{id:1, pseudo:'AutreMid', role:'Mid', rank:'9', score:9.0, rawData:{}}]));
localStorage.setItem('spes_crm_pipeline', '[]');
var cands = anGatherCandidates();
// attendu : 2 candidats, l'un source 'Top50' (TestADC), l'autre 'Scout' (AutreMid)
return cands.map(c => c.source + ':' + c.pseudo + ':' + c.score);
```
Attendu : contient `Top50:TestADC#EUW:7.2` et `Scout:AutreMid:9`.

- [ ] **Step 4 : Commit**

```bash
git add app.html
git commit -m "feat(roster): le vivier inclut désormais le Top 50"
```

---

## Task 2 : Store des rosters nommés (`vs_rosters`) + migration

**Files:** Modify `app.html` — insérer juste après `anGatherCandidates` (~ligne 3058).

- [ ] **Step 1 : Écrire les fonctions du store**

```js
/* ─── Store des rosters nommés (Phase 1 Roster) ─── */
const RS_ROLES = ['Top', 'Jgl', 'Mid', 'ADC', 'Sup'];
function rsAll() { try { return JSON.parse(localStorage.getItem('vs_rosters') || '[]'); } catch (_) { return []; } }
function rsSaveAll(list) { localStorage.setItem('vs_rosters', JSON.stringify(list)); }
function rsActiveId() { return parseInt(localStorage.getItem('vs_active_roster') || '0') || null; }
function rsSetActive(id) { localStorage.setItem('vs_active_roster', String(id)); }
function rsGet(id) { return rsAll().find(r => r.id === id) || null; }
function rsActive() { return rsGet(rsActiveId()) || rsAll()[0] || null; }
function rsCreate(name) {
  const list = rsAll();
  const r = { id: Date.now(), name: name || ('Roster ' + (list.length + 1)), slots: { Top:null, Jgl:null, Mid:null, ADC:null, Sup:null } };
  list.unshift(r); rsSaveAll(list); rsSetActive(r.id); return r;
}
function rsRename(id, name) { const list = rsAll(); const r = list.find(x => x.id === id); if (r) { r.name = name; rsSaveAll(list); } }
function rsDelete(id) { const list = rsAll().filter(x => x.id !== id); rsSaveAll(list); if (rsActiveId() === id) rsSetActive(list[0] ? list[0].id : 0); }
function rsSetSlot(id, role, slot) { const list = rsAll(); const r = list.find(x => x.id === id); if (r) { r.slots[role] = slot; rsSaveAll(list); } }

/* Migration unique de l'ancien vs_roster (map role→key) vers vs_rosters */
function rsMigrate() {
  if (rsAll().length) return;
  let old; try { old = JSON.parse(localStorage.getItem('vs_roster') || '{}'); } catch (_) { old = {}; }
  if (!old || !Object.keys(old).length) return;
  const cands = anGatherCandidates();
  const slots = { Top:null, Jgl:null, Mid:null, ADC:null, Sup:null };
  Object.keys(old).forEach(role => {
    const c = cands.find(x => x.key === old[role]);
    if (c) { const [pseudo, tag] = (c.pseudo || '').split('#'); slots[role] = { pseudo, tag: tag || 'EUW', server: 'euw1', proName: '', ficheId: (c.key.startsWith('scout:') ? +c.key.split(':')[1] : null) }; }
  });
  const r = { id: Date.now(), name: 'Mon équipe', slots };
  rsSaveAll([r]); rsSetActive(r.id);
}
```

- [ ] **Step 2 : Vérifier le store dans le preview**

```js
localStorage.removeItem('vs_rosters'); localStorage.removeItem('vs_active_roster');
var r = rsCreate('Mon équipe');
rsSetSlot(r.id, 'Mid', {pseudo:'Faker', tag:'KR1', server:'kr', proName:'Faker', ficheId:null});
var back = rsActive();
return { name: back.name, mid: back.slots.Mid.pseudo, count: rsAll().length, active: rsActiveId() === r.id };
```
Attendu : `{name:'Mon équipe', mid:'Faker', count:1, active:true}`.

- [ ] **Step 3 : Commit**

```bash
git add app.html
git commit -m "feat(roster): store des rosters nommés + migration vs_roster"
```

---

## Task 3 : Résolution du score d'un joueur (fiche ou Solo Q)

**Files:** Modify `app.html` — insérer après le store (Task 2).

Contexte : `calcProspectScore(tierIdx, lp, wr, kda, csMin, visionAvg, role, killPart, dmgShare, objScore)` existe (~ligne 10884). `riotFetch(url)` proxifie Riot. `PLATFORM_TO_REGIONAL` mappe serveur→région. Le mapping rang→idx : Iron..Challenger = 0..9.

- [ ] **Step 1 : Écrire le résolveur**

```js
const TIER_IDX = { IRON:0, BRONZE:1, SILVER:2, GOLD:3, PLATINUM:4, EMERALD:5, DIAMOND:6, MASTER:7, GRANDMASTER:8, CHALLENGER:9 };
const _rsScoreCache = {};   // clé pseudo|tag|role → {score, source, rank, wr}

async function rsResolveScore(slot, role) {
  if (!slot || !slot.pseudo) return null;
  // 1) Fiche SPES complète si scouté
  if (slot.ficheId != null) {
    let hist = []; try { hist = JSON.parse(localStorage.getItem('spes_history') || '[]'); } catch (_) {}
    const f = hist.find(h => h.id === slot.ficheId);
    if (f && f.score != null) return { score: +f.score, source: 'Scout', rank: '', wr: null };
  }
  // 2) Score auto Solo Q (cache mémoire)
  const ck = (slot.pseudo + '|' + (slot.tag || '') + '|' + role).toLowerCase();
  if (_rsScoreCache[ck]) return _rsScoreCache[ck];
  try {
    const server = slot.server || 'euw1';
    const regional = (typeof PLATFORM_TO_REGIONAL !== 'undefined' && PLATFORM_TO_REGIONAL[server]) || 'europe';
    const acc = await riotFetch('https://' + regional + '.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' + encodeURIComponent(slot.pseudo) + '/' + encodeURIComponent(slot.tag || 'EUW'));
    if (!acc || !acc.puuid) return null;
    const leagueRaw = await riotFetch('https://' + server + '.api.riotgames.com/lol/league/v4/entries/by-puuid/' + acc.puuid);
    const league = Array.isArray(leagueRaw) ? leagueRaw : (leagueRaw && leagueRaw.entries) || [];
    const soloQ = league.find(e => e.queueType === 'RANKED_SOLO_5x5');
    const tierIdx = soloQ ? (TIER_IDX[soloQ.tier] ?? 6) : 6;
    const lp = soloQ ? (soloQ.leaguePoints || 0) : 0;
    const ids = await riotFetch('https://' + regional + '.api.riotgames.com/lol/match/v5/matches/by-puuid/' + acc.puuid + '/ids?queue=420&count=15&type=ranked');
    const matches = (ids && ids.length) ? await fetchMatchesInBatches(regional, ids, undefined, () => {}) : [];
    let n=0,w=0,kS=0,dS=0,aS=0,csT=0,durT=0,visT=0,dmgT=0,teamDmg=0,kp=0,teamK=0;
    matches.forEach(m => {
      const info = m && m.info; if (!info) return;
      const p = (info.participants || []).find(x => x.puuid === acc.puuid); if (!p) return;
      const dur = (info.gameDuration || 0) / 60; if (dur < 5) return;
      const team = (info.participants || []).filter(x => x.teamId === p.teamId);
      const tk = team.reduce((s,x) => s + (x.kills||0), 0);
      const td = team.reduce((s,x) => s + (x.totalDamageDealtToChampions||0), 0);
      n++; if (p.win) w++; kS+=p.kills||0; dS+=p.deaths||0; aS+=p.assists||0;
      csT += (p.totalMinionsKilled||0) + (p.neutralMinionsKilled||0); durT += dur;
      visT += (p.visionScore||0)/dur;
      dmgT += td ? (p.totalDamageDealtToChampions||0)/td*100 : 0;
      kp += tk ? ((p.kills||0)+(p.assists||0))/tk*100 : 0;
    });
    if (!n) return null;
    const wr = Math.round(w/n*100);
    const kda = dS ? (kS+aS)/dS : (kS+aS);
    const csMin = durT ? csT/durT : 0;
    const visMin = visT/n;
    const dmgShare = dmgT/n;
    const killPart = kp/n;
    const roleKey = role; // calcProspectScore attend Top/Jgl/Mid/ADC/Sup
    const score = parseFloat(calcProspectScore(tierIdx, lp, wr, kda, csMin, visMin, roleKey, killPart, dmgShare, 0));
    const res = { score, source: 'SoloQ', rank: soloQ ? (soloQ.tier + ' ' + soloQ.rank) : 'Unranked', wr };
    _rsScoreCache[ck] = res;
    return res;
  } catch (_) { return null; }
}
```

- [ ] **Step 2 : Vérifier sur un joueur réel dans le preview**

```js
// nécessite l'API Riot live (proxy). Utiliser un compte connu.
return await rsResolveScore({pseudo:'Agurin', tag:'EUW', server:'euw1', ficheId:null}, 'Jgl');
```
Attendu : objet `{score: <~8-9 si Challenger>, source:'SoloQ', rank:'...', wr:<n>}`. Si l'API renvoie une erreur d'auth en preview, vérifier plutôt la branche fiche (Step 3).

- [ ] **Step 3 : Vérifier la branche fiche (sans réseau)**

```js
localStorage.setItem('spes_history', JSON.stringify([{id:42, pseudo:'X', role:'Mid', score:9.1}]));
return await rsResolveScore({pseudo:'X', tag:'EUW', server:'euw1', ficheId:42}, 'Mid');
```
Attendu : `{score:9.1, source:'Scout', ...}`.

- [ ] **Step 4 : Commit**

```bash
git add app.html
git commit -m "feat(roster): résolution du score joueur (fiche SPES ou auto Solo Q)"
```

---

## Task 4 : Score d'équipe (moyenne + maillon faible)

**Files:** Modify `app.html` — insérer après le résolveur (Task 3).

- [ ] **Step 1 : Écrire le calcul d'équipe**

```js
async function rsTeamScore(roster) {
  if (!roster) return { team: null, perRole: {}, weakest: null };
  const perRole = {};
  for (const role of RS_ROLES) {
    const slot = roster.slots[role];
    perRole[role] = slot ? await rsResolveScore(slot, role) : null;
  }
  const vals = RS_ROLES.map(r => perRole[r] && perRole[r].score).filter(v => typeof v === 'number');
  const team = vals.length ? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : null;
  let weakest = null, min = Infinity;
  RS_ROLES.forEach(r => { const s = perRole[r] && perRole[r].score; if (typeof s === 'number' && s < min) { min = s; weakest = r; } });
  return { team, perRole, weakest };
}
```

- [ ] **Step 2 : Vérifier (branche fiche, sans réseau)**

```js
localStorage.setItem('spes_history', JSON.stringify([
  {id:1,pseudo:'T',role:'Top',score:8}, {id:2,pseudo:'J',role:'Jgl',score:6},
  {id:3,pseudo:'M',role:'Mid',score:9}, {id:4,pseudo:'A',role:'ADC',score:7}, {id:5,pseudo:'S',role:'Sup',score:7}
]));
var ros = { id:1, name:'t', slots:{
  Top:{pseudo:'T',ficheId:1}, Jgl:{pseudo:'J',ficheId:2}, Mid:{pseudo:'M',ficheId:3},
  ADC:{pseudo:'A',ficheId:4}, Sup:{pseudo:'S',ficheId:5} } };
return await rsTeamScore(ros);
```
Attendu : `team: 7.4`, `weakest: 'Jgl'`.

- [ ] **Step 3 : Commit**

```bash
git add app.html
git commit -m "feat(roster): score d'équipe agrégé + maillon faible"
```

---

## Task 5 : Renommer l'onglet `upgrade` → `roster` dans le hub Analytics

**Files:** Modify `app.html` — `AN_DESC`/`anTabRank`/`anShowView`/`anDecorateTabs` (~3061-3108), HTML du hub (`data-tab="upgrade"`, `#an-view-upgrade`), `anGoTab`.

- [ ] **Step 1 : Localiser les occurrences**

```
Grep "upgrade" dans app.html — repérer : data-tab="upgrade", id="an-view-upgrade",
AN_DESC.upgrade, anTabRank ('upgrade'), anShowView liste ['perf','upgrade','timeline'],
anDecorateTabs (t==='upgrade'), anGoTab, et l'appel renderUpgradeFinder.
```

- [ ] **Step 2 : Renommer dans le JS**

- `AN_DESC` : remplacer la clé `upgrade` par `roster` avec le libellé :
  `roster: 'Votre roster : score d\'équipe, maillon faible, et qui dans votre vivier peut l\'améliorer poste par poste.'`
- `anTabRank` : `(tab === 'perf' || tab === 'roster' || tab === 'timeline') ? 2 : 1`
- `anShowView` : liste `['perf', 'roster', 'timeline']` et `if (view === 'roster') renderRoster();`
- `anDecorateTabs` : condition `(t === 'perf' || t === 'roster')`
- `anGoTab` : inchangé (générique), mais s'assurer qu'aucune branche ne cible `'upgrade'`.

- [ ] **Step 3 : Renommer dans le HTML du hub**

- `<button class="an-tab" data-tab="upgrade" ...>Upgrade Finder</button>` → `data-tab="roster"` libellé `Roster`.
- `<div id="an-view-upgrade" ...>` → `id="an-view-roster"`.
- Le bouton « Recalculer les scores » et le conteneur `#an-upgrade` : conserver `#an-upgrade` comme conteneur de rendu (renderRoster y écrira), OU renommer en `#an-roster` et adapter renderRoster (Task 6). Choix : **renommer en `#an-roster`**.

- [ ] **Step 4 : Vérifier le hub dans le preview**

```js
// après navigation /app.html
anShowView('roster');
return {
  view: document.getElementById('an-view-roster') ? 'ok' : 'manquant',
  tabActive: document.querySelector('.an-tab[data-tab="roster"]') ? 'ok' : 'manquant',
  desc: document.getElementById('an-desc') && document.getElementById('an-desc').textContent.slice(0,20)
};
```
Attendu : `view:'ok'`, `tabActive:'ok'`, desc commence par « Votre roster ».

- [ ] **Step 5 : Commit**

```bash
git add app.html
git commit -m "refactor(roster): onglet Analytics 'Upgrade' renommé 'Roster'"
```

---

## Task 6 : Rendu de la vue Roster (sélecteur, score équipe, lignes, upgrades, what-if)

**Files:** Modify `app.html` — remplacer `renderUpgradeFinder` par `renderRoster` + handlers, conteneur `#an-roster`.

- [ ] **Step 1 : Écrire `renderRoster` (sélecteur + score équipe + lignes)**

```js
let _rsWhatIf = null; // { role, slot } prévisualisation en cours

async function renderRoster() {
  const box = document.getElementById('an-roster'); if (!box) return;
  rsMigrate();
  let roster = rsActive();
  if (!roster) roster = rsCreate('Mon équipe');
  const list = rsAll();

  // En-tête : sélecteur de roster + actions
  let html = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">';
  html += '<select onchange="rsSetActive(+this.value);renderRoster()" style="background:var(--surf2);border:1px solid var(--border2);color:var(--text);border-radius:7px;padding:6px 10px;font-size:.82rem">';
  list.forEach(r => { html += '<option value="' + r.id + '"' + (r.id === roster.id ? ' selected' : '') + '>' + anEsc(r.name) + '</option>'; });
  html += '</select>';
  html += '<button onclick="rsUiNew()" style="background:var(--surf2);border:1px solid var(--border2);color:var(--text);border-radius:7px;padding:6px 10px;font-size:.78rem;cursor:pointer">+ Nouveau</button>';
  html += '<button onclick="rsUiRename()" style="background:var(--surf2);border:1px solid var(--border2);color:var(--text);border-radius:7px;padding:6px 10px;font-size:.78rem;cursor:pointer">Renommer</button>';
  html += '<button onclick="rsUiDelete()" style="background:var(--surf2);border:1px solid var(--border2);color:var(--red,#E8194B);border-radius:7px;padding:6px 10px;font-size:.78rem;cursor:pointer">Supprimer</button>';
  html += '</div>';

  box.innerHTML = html + '<div id="rs-body" style="color:var(--sub);font-size:.85rem">Calcul du roster…</div>';

  const ts = await rsTeamScore(roster);
  const cands = anGatherCandidates();

  let body = '';
  // Bandeau score d'équipe
  body += '<div style="display:flex;align-items:center;gap:14px;background:var(--surf2);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:16px">';
  body += '<div style="width:54px;height:54px;border-radius:50%;background:' + (ts.team!=null?anScoreColor(ts.team):'var(--surf3)') + ';display:flex;align-items:center;justify-content:center;color:#0B0E18;font-weight:800;font-size:1.1rem">' + (ts.team!=null?ts.team.toFixed(1):'—') + '</div>';
  body += '<div><div style="color:var(--text);font-weight:700">Score d\'équipe</div><div style="color:var(--sub);font-size:.78rem">' + (ts.weakest ? 'Maillon faible : <span style="color:var(--amber,#E8A317)">' + ts.weakest + '</span>' : 'Roster incomplet') + '</div></div>';
  body += '</div>';

  // Lignes par poste
  for (const role of RS_ROLES) {
    const slot = roster.slots[role];
    const pr = ts.perRole[role];
    body += rsRenderRoleRow(roster, role, slot, pr, cands, ts.team);
  }

  const bodyEl = document.getElementById('rs-body');
  if (bodyEl) bodyEl.innerHTML = body;
}
```

- [ ] **Step 2 : Écrire `rsRenderRoleRow` (titulaire + upgrades + what-if)**

```js
function rsRenderRoleRow(roster, role, slot, pr, cands, teamScore) {
  const score = pr && pr.score;
  let h = '<div style="margin-bottom:18px">';
  h += '<div style="font-weight:700;color:var(--text);font-size:.9rem;margin-bottom:6px">' + role + '</div>';

  // Titulaire
  h += '<div style="display:flex;align-items:center;gap:12px;background:var(--surf2);border:1px solid var(--lime-bd,rgba(28,196,122,.3));border-radius:var(--r);padding:10px 14px;margin-bottom:6px">';
  h += '<div style="width:32px;height:32px;border-radius:50%;background:' + (typeof score==='number'?anScoreColor(score):'var(--surf3)') + ';display:flex;align-items:center;justify-content:center;color:#0B0E18;font-weight:800;font-size:.8rem">' + (typeof score==='number'?score.toFixed(1):'—') + '</div>';
  h += '<div style="flex:1;min-width:0"><div style="color:var(--text);font-weight:600;font-size:.86rem">' + (slot ? anEsc(slot.pseudo) + (slot.tag?'<span style="color:var(--sub2);font-size:.7rem">#'+anEsc(slot.tag)+'</span>':'') : '<span style="color:var(--sub2)">— aucun titulaire —</span>') + (pr&&pr.source?anSourceBadge(pr.source):'') + '</div><div style="color:var(--sub);font-size:.72rem">' + (pr&&pr.rank?anEsc(pr.rank):'') + (pr&&pr.wr!=null?' · '+pr.wr+'% WR':'') + '</div></div>';
  h += '<button onclick="rsUiPick(\'' + role + '\')" style="background:var(--surf3);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:5px 9px;font-size:.74rem;cursor:pointer">Changer</button>';
  h += '</div>';

  // Suggestions d'upgrade (candidats du vivier mieux notés)
  const better = cands.filter(c => c.role === role && c.score != null && (score == null || c.score > score + 0.05))
    .filter(c => !slot || c.pseudo.toLowerCase().split('#')[0] !== (slot.pseudo||'').toLowerCase())
    .sort((a,b) => b.score - a.score).slice(0, 4);
  better.forEach(c => {
    const delta = (score != null) ? (c.score - score) : null;
    h += '<div style="display:flex;align-items:center;gap:12px;background:var(--surf2);border:1px solid rgba(28,196,122,.18);border-radius:var(--r);padding:8px 14px;margin-bottom:4px;margin-left:18px">';
    h += '<div style="width:26px;height:26px;border-radius:50%;background:' + anScoreColor(c.score) + ';display:flex;align-items:center;justify-content:center;color:#0B0E18;font-weight:800;font-size:.7rem">' + c.score.toFixed(1) + '</div>';
    h += '<div style="flex:1;min-width:0"><span style="color:var(--text);font-size:.82rem">' + anEsc(c.pseudo) + '</span>' + anSourceBadge(c.source) + '</div>';
    if (delta != null) h += '<div style="color:var(--lime);font-weight:800;font-size:.78rem">▲ +' + delta.toFixed(1) + '</div>';
    h += '<button onclick="rsSimSwap(\'' + role + '\',\'' + encodeURIComponent(c.pseudo) + '\')" style="background:var(--surf3);border:1px solid var(--border2);color:var(--text);border-radius:6px;padding:4px 8px;font-size:.72rem;cursor:pointer">Simuler</button>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}
```

- [ ] **Step 3 : Écrire les handlers UI (new/rename/delete/pick/simulate)**

```js
function rsUiNew() { const n = prompt('Nom du nouveau roster :', 'Nouveau roster'); if (n) { rsCreate(n.trim()); renderRoster(); } }
function rsUiRename() { const r = rsActive(); if (!r) return; const n = prompt('Renommer le roster :', r.name); if (n) { rsRename(r.id, n.trim()); renderRoster(); } }
function rsUiDelete() { const r = rsActive(); if (!r) return; if (confirm('Supprimer le roster « ' + r.name + ' » ?')) { rsDelete(r.id); renderRoster(); } }

function rsUiPick(role) {
  const pseudo = prompt('Pseudo Solo Q pour le poste ' + role + ' (format Pseudo#TAG) :', '');
  if (!pseudo) return;
  const [p, tag] = pseudo.split('#');
  const r = rsActive(); if (!r) return;
  // recherche d'une fiche scout correspondante pour lier le score complet
  let hist = []; try { hist = JSON.parse(localStorage.getItem('spes_history') || '[]'); } catch (_) {}
  const f = hist.find(h => (h.pseudo||'').toLowerCase() === (p||'').toLowerCase() && h.role === role);
  rsSetSlot(r.id, role, { pseudo: p.trim(), tag: (tag||'EUW').trim(), server: 'euw1', proName: '', ficheId: f ? f.id : null });
  renderRoster();
}

async function rsSimSwap(role, pseudoEnc) {
  const pseudo = decodeURIComponent(pseudoEnc);
  const [p, tag] = pseudo.split('#');
  const r = rsActive(); if (!r) return;
  // Clone du roster avec le remplacement
  const clone = JSON.parse(JSON.stringify(r));
  let hist = []; try { hist = JSON.parse(localStorage.getItem('spes_history') || '[]'); } catch (_) {}
  const f = hist.find(h => (h.pseudo||'').toLowerCase() === (p||'').toLowerCase() && h.role === role);
  clone.slots[role] = { pseudo: p.trim(), tag: (tag||'EUW').trim(), server: 'euw1', proName: '', ficheId: f ? f.id : null };
  const before = await rsTeamScore(r);
  const after = await rsTeamScore(clone);
  const d = (before.team != null && after.team != null) ? (after.team - before.team) : null;
  const msg = 'Avec ' + p + ' au poste ' + role + ' :\\nScore d\'équipe ' + (before.team!=null?before.team.toFixed(1):'—') + ' → ' + (after.team!=null?after.team.toFixed(1):'—') + (d!=null?' (' + (d>=0?'+':'') + d.toFixed(2) + ')':'') + '\\n\\nAppliquer ce changement ?';
  if (confirm(msg)) { rsSetSlot(r.id, role, clone.slots[role]); renderRoster(); }
}
```

- [ ] **Step 4 : Supprimer l'ancien `renderUpgradeFinder`**

Supprimer la fonction `renderUpgradeFinder` (et son bouton « Recalculer » s'il y était). Conserver `recomputeAllScores` mais déplacer son bouton dans la vue Roster : ajouter dans `renderRoster` (Step 1), après les boutons du sélecteur :
```js
html += '<button onclick="recomputeAllScores()" title="Recalcule les fiches sauvegardées" style="margin-left:auto;background:var(--surf2);border:1px solid var(--border2);color:var(--text);border-radius:7px;padding:6px 10px;font-size:.78rem;cursor:pointer">↻ Recalculer</button>';
```
Vérifier qu'aucun autre appelant de `renderUpgradeFinder` ne subsiste (Grep) → remplacer par `renderRoster`.

- [ ] **Step 5 : Vérifier bout-en-bout dans le preview (branche fiche)**

```js
localStorage.setItem('spes_history', JSON.stringify([
  {id:1,pseudo:'TopA',role:'Top',score:8.2,rank:'9'}, {id:2,pseudo:'JglA',role:'Jgl',score:6.1,rank:'7'},
  {id:3,pseudo:'JglB',role:'Jgl',score:7.9,rank:'9'}
]));
localStorage.removeItem('vs_rosters'); localStorage.removeItem('vs_active_roster'); localStorage.removeItem('vs_roster');
var r = rsCreate('Test');
rsSetSlot(r.id,'Top',{pseudo:'TopA',tag:'EUW',server:'euw1',proName:'',ficheId:1});
rsSetSlot(r.id,'Jgl',{pseudo:'JglA',tag:'EUW',server:'euw1',proName:'',ficheId:2});
await renderRoster();
var body = document.getElementById('rs-body').innerHTML;
return { hasTeamScore: body.includes('Score d\'équipe'), suggestsJglB: body.includes('JglB'), weakestJgl: body.includes('Maillon faible') };
```
Attendu : `hasTeamScore:true`, `suggestsJglB:true` (JglB 7.9 > titulaire JglA 6.1), `weakestJgl:true`.

- [ ] **Step 6 : Vérifier l'absence d'erreur console**

`preview_console_logs level=error` → aucun log.

- [ ] **Step 7 : Commit**

```bash
git add app.html
git commit -m "feat(roster): vue Roster complète (score équipe, upgrades, what-if)"
```

---

## Task 7 : Validation finale + déploiement

- [ ] **Step 1 : Parcours manuel dans le preview**

Naviguer Analytics → Roster : créer un roster, désigner des titulaires via « Changer », observer le score d'équipe et le maillon faible, cliquer « Simuler » sur une suggestion, valider, vérifier la mise à jour. Confirmer qu'« Upgrade Finder » n'apparaît plus et que « Comparer » fonctionne toujours.

- [ ] **Step 2 : Déployer**

```bash
git push origin main
```
Puis attendre la propagation Vercel :
```bash
for i in $(seq 1 40); do curl -s "https://visionscore.gg/app" | grep -q "renderRoster" && echo "DEPLOY OK" && break; sleep 10; done
```

- [ ] **Step 3 : Mettre à jour la mémoire projet**

Ajouter dans `project_visionscore.md` : rubrique Roster Phase 1 livrée (store vs_rosters, score d'équipe, upgrades, what-if, vivier+Top50), Comparer/Timeline inchangés, Phase 1b (comparaison roster-vs-roster + snapshots) et Phase 2 (auto) en attente.

---

## Self-review (couverture de la spec)

- §2 Modèle de données → Task 2 (store vs_rosters, slots) ✅
- §3 Résolution score (fiche/SoloQ + cache) → Task 3 ✅
- §4 Vivier + Top 50 → Task 1 ✅
- §5 UI (sélecteur, score équipe, lignes, upgrades, what-if) → Tasks 5 & 6 ✅
- §5 onglet Upgrade→Roster, Comparer inchangé, gating Pro+ → Task 5 ✅
- §6 score d'équipe (moyenne + maillon faible, pas de synergie) → Task 4 ✅
- §7 hors-périmètre (comparaison/snapshots/auto) → non inclus, conforme ✅
- Cohérence des noms : `rsResolveScore`, `rsTeamScore`, `rsRenderRoleRow`, `renderRoster`, `rsSetSlot`, `anGatherCandidates`, `#an-roster`, `an-view-roster` — utilisés de façon cohérente entre tâches ✅
- Placeholders : aucun TODO/TBD ; code fourni pour chaque étape de code ✅
