/* LÉGALITÉ d'un build et d'une page de runes.

   Audit avant câblage : le modèle savait CHIFFRER n'importe quelle combinaison, mais pas
   dire si elle est ACHETABLE. Un recommandeur pouvait donc proposer deux paires de
   bottes, trois Hydres, ou le Couperet noir avec les Salutations de Dominik — des builds
   que le jeu refuse. Un chiffre juste sur un build impossible ne vaut rien.

   ── Objets ─────────────────────────────────────────────────────────────────────
   Les règles ne sont pas devinées : elles viennent de `mItemGroups` et de
   `mMaxGroupOwnable`, dans le fichier de jeu. 21 groupes contraignants comptant au
   moins deux objets de la Faille.

   Quatre groupes portent un nom haché. Ils sont nommés ici PAR LEUR APPARTENANCE, ce que
   la donnée permet de vérifier — pas par ressemblance :
     {8b55a7b3} : ses 7 membres portent tous un calcul `SpellbladeDamage` → Lame enchantée
     {3fcdbdac} : Barrière verdoyante, Voile de la banshee, Manteau de la nuit → bouclier antisorts
     {87f1e822} : Armure roncière, Cotte épineuse → épines
     {3aa8b165} : les six familiers de soutien

   ⚠ Le fichier appelle `LastWhisper` le groupe que la boutique et le wiki nomment
   aujourd'hui « Fatality ». Vérifié sur les trois fiches (Couperet noir, Salutations de
   Dominik, Rancune de Serylda) : toutes trois annoncent « Limited to 1 Fatality item ».
   Nom interne ancien, contrainte bien réelle — et elle interdit un build que mes propres
   exemples utilisaient.

   ── Runes ──────────────────────────────────────────────────────────────────────
   Structure vérifiée sur les 69 runes actives : 5 arbres, une majeure en emplacement 0
   (sauf Inspiration, qui a aussi les fragments), trois emplacements mineurs 1-3, et
   trois rangées de fragments 4-6.                                                    */

const items = require('./items.json');
const groupes = require('./groupes_objets.json');
const runes = require('./runes.json');

const parId = {};
items.forEach(o => { parId[o.id] = o; });
const runeParId = {};
(Array.isArray(runes) ? runes : Object.values(runes)).forEach(r => { runeParId[r.id] = r; });

/* Libellés lisibles des groupes hachés. Le nom interne reste la clé — c'est lui qui fait
   foi ; ceci n'est qu'un affichage. */
const NOMS_GROUPES = {
  '{8b55a7b3}': 'Lame enchantée',
  '{3fcdbdac}': 'bouclier antisorts',
  '{87f1e822}': 'épines',
  '{3aa8b165}': 'familiers de soutien',
  LastWhisper: 'Fatality (pénétration d\'armure)',
  Boots: 'bottes',
  TearItems: 'objets à Larme',
  LifelineItems: 'Lien vital',
  ImmolateItems: 'Immolation',
  LegendaryClearingItems: 'Hydres',
  VoidPen: 'pénétration magique',
  Quicksilver: 'Mercure',
  DoransItems: 'objets de Doran',
  GoldItems: 'objets à or',
  GuardianItems: 'objets du gardien',
  EternityItems: 'Éternité',
  StopwatchGroup: 'Protège-bras',
  Glory: 'Gloire',
  Potion: 'potions'
};
const libelle = g => NOMS_GROUPES[g] || g;

/* Un build est-il achetable ? Renvoie la liste des infractions, jamais un simple
   booléen : « ce build est illégal » sans dire pourquoi n'aide personne à le corriger. */
const EMPLACEMENTS = 6;

function buildLegal(ids, options = {}) {
  const infractions = [];
  const inconnus = (ids || []).filter(i => !parId[i]);
  if (inconnus.length) infractions.push({ regle: 'objet inconnu ou hors Faille', objets: inconnus });

  const connus = (ids || []).filter(i => parId[i]);

  /* 1. Six emplacements. Une balise occupe le septième (l'emplacement à bibelot), donc
        on ne la compte pas — mais aucun autre objet n'y a droit. */
  const max = options.emplacements || EMPLACEMENTS;
  if (connus.length > max)
    infractions.push({ regle: 'emplacements', detail: connus.length + ' objets pour ' + max + ' emplacements' });

  /* 2. Pas de doublon. Le jeu l'exprime par un groupe propre à chaque objet ; on le dit
        directement, c'est plus clair et strictement équivalent. */
  const vus = new Set(); const doublons = new Set();
  connus.forEach(i => { if (vus.has(i)) doublons.add(i); vus.add(i); });
  doublons.forEach(i => infractions.push({ regle: 'doublon', objet: parId[i].nom }));

  /* 3. Groupes limités — la vraie contrainte, et celle qu'on ne peut pas deviner. */
  const compte = {};
  [...vus].forEach(i => (parId[i].groupes || []).forEach(g => {
    (compte[g] = compte[g] || []).push(i);
  }));
  Object.entries(compte).forEach(([g, membres]) => {
    const regle = groupes[g];
    if (!regle || membres.length <= regle.max) return;
    infractions.push({
      regle: 'groupe limité à ' + regle.max,
      groupe: libelle(g), groupeInterne: g,
      objets: membres.map(i => parId[i].nom)
    });
  });

  /* 4. Objet réservé à un champion (le Hexcore de Viktor, la Lance de Kalista). */
  if (options.champion) {
    [...vus].forEach(i => {
      const req = parId[i].championRequis;
      if (req && !new RegExp(req, 'i').test(options.champion))
        infractions.push({ regle: 'objet réservé', objet: parId[i].nom, reserveA: req });
    });
  }

  return { legal: infractions.length === 0, infractions, or: connus.reduce((s, i) => s + parId[i].prix, 0) };
}

/* Suggère les objets à retirer pour rendre un build légal : sur un groupe saturé, on
   propose d'écarter les moins chers d'abord — l'objet le plus cher est presque toujours
   celui que le joueur voulait vraiment. Ce n'est qu'une suggestion, jamais un choix
   imposé au coach. */
function conflits(ids) {
  const r = buildLegal(ids);
  return r.infractions
    .filter(i => /groupe limité/.test(i.regle))
    .map(i => ({
      groupe: i.groupe,
      garder: i.objets.slice().sort((a, b) =>
        (items.find(o => o.nom === b).prix) - (items.find(o => o.nom === a).prix))[0],
      aRetirer: i.objets.slice().sort((a, b) =>
        (items.find(o => o.nom === b).prix) - (items.find(o => o.nom === a).prix)).slice(1)
    }));
}

/* ── Pages de runes ─────────────────────────────────────────────────────────────
   Une page valide : 1 majeure + 3 mineures dans l'arbre principal, 2 mineures dans un
   arbre secondaire DIFFÉRENT et dans des emplacements distincts, 3 fragments (un par
   rangée). Les emplacements viennent du fichier, pas d'une convention supposée. */
const SLOTS_FRAGMENTS = [4, 5, 6];

function pageLegale(ids) {
  const infractions = [];
  const inconnues = (ids || []).filter(i => !runeParId[i]);
  if (inconnues.length) infractions.push({ regle: 'rune inconnue', runes: inconnues });

  const rs = (ids || []).map(i => runeParId[i]).filter(Boolean);
  const retirees = rs.filter(r => !r.active);
  if (retirees.length)
    infractions.push({ regle: 'rune retirée du jeu', runes: retirees.map(r => r.nom) });

  const majeures = rs.filter(r => r.genre === 'majeure');
  const mineures = rs.filter(r => r.genre === 'mineure');
  const fragments = rs.filter(r => r.genre === 'fragment');

  if (majeures.length !== 1)
    infractions.push({ regle: 'une seule rune majeure', detail: majeures.length + ' trouvée(s)' });

  const principal = majeures[0] ? majeures[0].arbre : null;
  if (principal) {
    const dansPrincipal = mineures.filter(r => r.arbre === principal);
    const secondaires = mineures.filter(r => r.arbre !== principal);
    if (dansPrincipal.length !== 3)
      infractions.push({ regle: '3 mineures dans l\'arbre principal',
                         detail: dansPrincipal.length + ' dans ' + principal });
    if (secondaires.length !== 2)
      infractions.push({ regle: '2 mineures dans l\'arbre secondaire',
                         detail: secondaires.length + ' trouvée(s)' });
    const arbresSecondaires = [...new Set(secondaires.map(r => r.arbre))];
    if (arbresSecondaires.length > 1)
      infractions.push({ regle: 'un seul arbre secondaire', detail: arbresSecondaires.join(', ') });

    /* Un emplacement ne se prend qu'une fois : deux runes du même rang s'excluent. */
    [dansPrincipal, secondaires].forEach((groupe, i) => {
      const slots = groupe.map(r => r.slot);
      if (new Set(slots).size !== slots.length)
        infractions.push({ regle: 'deux runes du même emplacement',
                           detail: (i ? 'arbre secondaire' : 'arbre principal') + ', emplacements ' + slots.join(',') });
    });
  }

  if (fragments.length !== 3)
    infractions.push({ regle: '3 fragments', detail: fragments.length + ' trouvé(s)' });
  else {
    const rangees = fragments.map(r => r.slot).sort();
    if (String(rangees) !== String(SLOTS_FRAGMENTS))
      infractions.push({ regle: 'un fragment par rangée', detail: 'rangées ' + rangees.join(',') });
  }

  return { legale: infractions.length === 0, infractions,
           arbrePrincipal: principal,
           arbreSecondaire: principal ? [...new Set(mineures.filter(r => r.arbre !== principal).map(r => r.arbre))][0] || null : null };
}

module.exports = { buildLegal, conflits, pageLegale, NOMS_GROUPES, groupes, libelle };
