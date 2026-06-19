# Rubrique « Roster » — Design (Phase 1)

Date : 2026-06-17
Statut : validé (design), à implémenter
Périmètre de ce document : **Phase 1 uniquement**. Phases 1b et 2 listées pour le contexte.

## 1. Objectif

Transformer l'Upgrade Finder (jugé inutile en l'état) en une vraie rubrique
**« Roster »** : un espace où une structure gère son équipe, voit son niveau
agrégé (score SPES), repère où elle peut s'améliorer, et simule des
remplacements — le tout piloté par le score SPES.

À terme cette rubrique absorbe aussi l'outil « Comparer » (Phase 1b).

## 2. Modèle de données

Nouveau stockage `localStorage['vs_rosters']` = tableau de rosters :

```
Roster = {
  id: number,            // Date.now()
  name: string,          // "Mon équipe", "Académie"…
  slots: {               // un slot par poste
    Top:  Slot|null, Jgl: Slot|null, Mid: Slot|null, ADC: Slot|null, Sup: Slot|null
  }
}
Slot = {
  pseudo: string,        // pseudo Solo Q (sans tag)
  tag: string,           // ex "EUW"
  server: string,        // ex "euw1"
  proName: string|'',    // nom pro optionnel (stats compétition Leaguepedia)
  ficheId: number|null,  // id spes_history si scouté (sinon null)
}
```

`localStorage['vs_active_roster']` = id du roster actuellement affiché.

Note : l'ancien `vs_roster` (map role→key des titulaires) est remplacé par ce
modèle ; migration légère au premier chargement (si `vs_roster` existe et
`vs_rosters` non, on crée un roster « Mon équipe » à partir des clés).

## 3. Résolution du score d'un joueur

`async resolvePlayerScore(slot, role)` :
1. Si `slot.ficheId` pointe vers une fiche `spes_history` → on prend son `score`
   (score SPES complet, déjà calculé par `globalScore`).
2. Sinon : fetch Solo Q via le proxy Riot (`pmFetchPlayer`/équivalent) →
   `calcProspectScore(tierIdx, lp, wr, kda, csMin, vis, role, kp, dmg, 0)`.
3. Résultat mis en cache mémoire (`_rosterScoreCache[pseudo|role]`) pour éviter
   de refetch à chaque rendu. Pas de persistance des stats en Phase 1.

Affichage : badge de source (Scout = fiche complète, SoloQ = auto, CRM, Top 50).

## 4. Vivier de candidats

Étendre `anGatherCandidates()` pour fusionner **3 sources** (au lieu de 2) :
- `spes_history` → source « Scout » (existant)
- `spes_crm_pipeline` (hors « écarté ») → source « CRM » (existant)
- **`top50Data`** → source « Top 50 » (nouveau) : `{pseudo, role, score, age}`

Dédoublonnage par `pseudo|role` ; priorité au score le plus riche
(fiche Scout > CRM > Top 50).

## 5. Interface (dans le hub Analytics)

L'onglet **« Upgrade » est renommé « Roster »** et héberge le nouvel outil.
L'onglet « Comparer » reste **inchangé** en Phase 1 (il sera fusionné en 1b ;
on évite ainsi toute régression du radar existant).
Gating plan : « Roster » reste **Pro+** (rang 2), comme l'était « Upgrade ».

Contenu de la vue « Roster » :
1. **Sélecteur de roster** : liste déroulante des rosters sauvegardés +
   boutons « Nouveau », « Renommer », « Supprimer ».
2. **Score d'équipe** : moyenne des 5 scores résolus, + détail par poste,
   + **maillon faible** (poste au score le plus bas) mis en évidence.
3. **5 lignes de poste** : chaque ligne montre le titulaire assigné
   (pseudo, score, badge source) avec un bouton pour le définir/changer
   (choix depuis le vivier OU saisie d'un pseudo#TAG libre + nom pro optionnel).
4. **Suggestions d'upgrade** par poste : les candidats du vivier qui dépassent
   le titulaire, triés, avec l'écart `▲ +X.X` (logique de l'ancien Upgrade Finder).
5. **Simulation « what-if »** : cliquer sur un candidat affiche en direct le
   nouveau score d'équipe et l'écart ; boutons « Valider » (applique au slot) /
   « Annuler » (revient au titulaire).

## 6. Score d'équipe

`scoreÉquipe = moyenne(scores résolus des 5 slots remplis)`.
Vue par poste + repérage du poste le plus faible.
**Pas d'indice de synergie inventé** : la synergie réelle ne se mesure pas dans
des stats Solo Q ; on s'en tient à l'agrégat honnête des niveaux individuels.

## 7. Hors périmètre Phase 1

- **Phase 1b** : comparaison roster vs roster (radar inclus, fusion de Comparer) ;
  snapshots manuels des stats Solo Q + graphe d'évolution (jour/semaine).
- **Phase 2** : collecte automatique quotidienne (serveur planifié + stockage) ;
  stats compétition détaillées par joueur dans la vue roster.

## 8. Limites connues (assumées)

- Stats compétition vides pour les joueurs absents de Leaguepedia (cas fréquent
  des semi-pros) — affichées seulement quand le nom pro renvoie des données.
- Le score auto Solo Q dépend de la disponibilité de l'API Riot (proxy).
- Pas de mesure de synergie d'équipe (cf. §6).

## 9. Fonctions impactées (repères d'implémentation)

- `anGatherCandidates()` → ajouter la source Top 50.
- Nouveau : store `vs_rosters` (CRUD) + migration `vs_roster`.
- Nouveau : `resolvePlayerScore`, `computeTeamScore`, rendu de la vue Roster,
  preview what-if.
- Hub Analytics : renommer l'onglet/vue `upgrade` → `roster` (id, libellé,
  `AN_DESC`, `anTabRank`, `anShowView`, `anDecorateTabs`, gating Pro+).
- Réutilise : `calcProspectScore`, scoring Riot, `pmFetchPlayer`,
  `anScoreColor`, `anSourceBadge`.
