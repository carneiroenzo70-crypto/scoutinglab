/* Extrait, pour chaque champion ciblé : statistiques de base + croissance, et les
   formules chiffrées de chaque sort (Q/W/E/R + passif).
   Sortie : champions.json — la matière première du calculateur. */
const fs = require('fs');
const path = require('path');
const { creerContexte, resoudreCalcul, RANGS } = require('./03_resolveur');

const cibles = require('./cibles.json');
const DIR = path.join(__dirname, 'bin');
// Data Dragon porte le nombre de rangs par sort (5 pour Q/W/E, 3 pour un ultime).
// Le fichier de jeu, lui, stocke 7 entrées extrapolées : sans cette borne on
// afficherait deux rangs d'ultime qui n'existent pas.
const DD = require('./champFull.json').data;
const SORTS = require('./sorts_modeles');

/* GARDE-FOU sur les doublons de `sorts_modeles.js`. Ce fichier est un objet littéral :
   deux clés `Vayne:` et la seconde écrase la première SANS ERREUR, ni au chargement ni
   à l'exécution. C'est arrivé en y ajoutant les corrections du panel élargi — la
   correction du Q de Vayne, vérifiée et testée, aurait disparu en silence.
   `require` ne peut pas le voir : à ce stade le doublon n'existe déjà plus. On relit
   donc la SOURCE, où il est encore visible. */
(function verifierDoublons() {
  const src = fs.readFileSync(path.join(__dirname, 'sorts_modeles.js'), 'utf8');
  const vus = new Set(), doubles = [];
  for (const m of src.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*): \{/gm)) {
    if (vus.has(m[1])) doubles.push(m[1]); else vus.add(m[1]);
  }
  if (doubles.length) {
    throw new Error('sorts_modeles.js : clé(s) en double, la seconde écrase la première — ' +
                    doubles.join(', '));
  }
})();

const TOUCHES = ['Q', 'W', 'E', 'R'];
const estDegats = n => /damage|dmg/i.test(n);
/* Soin et bouclier étaient rangés sous la MÊME étiquette. Ce n'est pas un détail de
   vocabulaire : un soin rend des PV déjà perdus, un bouclier absorbe des dégâts à venir.
   Le premier se compare aux PV, le second aux PV EFFECTIFS — il profite de l'armure et
   de la résistance magique, tant qu'il tient. Les confondre sous-estime tout bouclier
   posé sur un champion résistant, et d'autant plus qu'il est résistant. */
const estBouclier = n => /shield|absorb/i.test(n);
const estSoin     = n => /heal/i.test(n) && !estBouclier(n);

function statsDeBase(rec, id) {
  // Les stats sont enveloppées dans un ModifiableFloat : { baseValue: 590 }
  const g = (...noms) => {
    for (const n of noms) {
      const v = rec[n];
      if (v == null) continue;
      return (typeof v === 'object') ? (v.baseValue != null ? v.baseValue : null) : v;
    }
    return null;
  };
  return {
    pv:        g('baseHPModifiable'),
    pvParNiv:  g('hpPerLevelModifiable'),
    ad:        g('baseDamageModifiable'),
    adParNiv:  g('damagePerLevelModifiable'),      // absent de Data Dragon !
    armure:    g('baseArmorModifiable'),
    armParNiv: g('armorPerLevelModifiable'),
    rm:        g('baseMR'),
    rmParNiv:  g('mrPerLevel'),
    va:        g('attackSpeedModifiable'),
    vaParNiv:  g('attackSpeedPerLevelModifiable'),
    /* La vitesse d'attaque ne suit PAS la formule des autres stats : tout bonus
       (croissance par niveau comprise) est multiplié par ce ratio. L'ignorer fausse
       la vitesse d'attaque de fin de partie, donc tous les objets à coup à l'impact. */
    vaRatio:   g('attackSpeedRatioModifiable', 'attackSpeedModifiable'),
    portee:    g('attackRangeModifiable'),
    ms:        g('baseMoveSpeedModifiable'),
    /* MANA. Absent de mes premières extractions, alors que Ryze — 1er pick Mid — fait
       reposer ses quatre sorts dessus et que le Manamune convertit 2 % du mana max en
       dégâts d'attaque. Sans lui, ces calculs étaient refusés en silence.

       Les clés sont hachées dans `primaryAbilityResource`. Elles ont été identifiées
       par CONCORDANCE NUMÉRIQUE avec Data Dragon : {726ee5cd} = 300 = `mp` de Ryze,
       {6216bf7b} = 70 = `mpperlevel`. La même méthode que pour les runes.
       `arType` distingue la ressource : 0 = mana. Un champion à énergie ou à fureur
       ne doit pas se voir attribuer du mana. */
    ...ressource(rec),
    /* RÉGÉNÉRATION. Absente jusqu'ici, ce qui rendait inertes les 12 objets à
       « % de régénération de vie » et les 15 à « % de régénération de mana » : ils
       multipliaient une base inexistante.

       ⚠ Deux échelles différentes selon la source : le fichier de jeu compte PAR
       SECONDE, Data Dragon PAR 5 SECONDES. Le facteur 5 est exact sur les 87 champions
       où les deux existent — c'est ce qui identifie les clés hachées du mana
       ({c4ab3550} = régén de base, {3a509002} = par niveau), même méthode que pour le
       mana lui-même. On stocke PAR SECONDE. */
    ...regeneration(rec, id),
    /* Multiplicateur de coup critique. Il vaut 2 pour presque tout le monde, mais
       certains champions l'ont réduit en compensation d'un kit : le lire évite de
       coder en dur une valeur fausse sur ces cas-là. */
    critMult:  g('critDamageMultiplier'),
    /* Type ADAPTATIF du champion. La force adaptative des runes accorde 1 puissance OU
       0,6 dégât d'attaque, selon la plus haute des deux stats bonus — et, à ÉGALITÉ,
       selon ce type-ci. L'égalité n'est pas un cas d'école : elle vaut à chaque niveau 1,
       où les deux stats bonus sont nulles.
       Plutôt que de deviner par la couleur des sorts, on lit la clé du fichier :
       `mAdaptiveForceToAbilityPowerWeight` vaut 1 sur 37 champions du panel, et est
       absente (donc 0) sur les 53 autres. Aucune valeur intermédiaire. */
    adaptatifAP: g('mAdaptiveForceToAbilityPowerWeight') === 1
  };
}

/* Ressource principale du champion. Renvoie du mana seulement si `arType` vaut 0 :
   attribuer du mana à un champion à énergie fausserait tout ce qui scale dessus. */
function ressource(rec) {
  const r = rec.primaryAbilityResource;
  if (!r || (r.arType || 0) !== 0) return { mana: null, manaParNiv: null, typeRessource: r ? r.arType : null };
  const lire = cle => (r[cle] && r[cle].baseValue != null) ? r[cle].baseValue : null;
  return { mana: lire('{726ee5cd}'), manaParNiv: lire('{6216bf7b}'), typeRessource: 0 };
}

/* Régénération de vie et de mana, PAR SECONDE.

   `baseStaticHPRegenModifiable` manque à trois champions du panel (Maokai, Rakan,
   Milio) : leur valeur vient d'un gabarit que les fichiers publics n'exposent pas.
   Data Dragon la publie, et concorde exactement avec le fichier sur les 87 autres —
   il comble donc ces trois trous, et le repli est marqué `sourceRegen`. Compter zéro
   aurait été pire qu'un repli : on aurait annoncé « ne régénère pas ». */
function regeneration(rec, id) {
  const dd = ((DD[id] || {}).stats) || {};
  const lire = o => (o && o.baseValue != null) ? o.baseValue : null;
  const parSeconde = x => (x == null ? null : x / 5);

  let regenPV = lire(rec.baseStaticHPRegenModifiable);
  let sourceRegen = 'fichier de jeu';
  if (regenPV == null) { regenPV = parSeconde(dd.hpregen); sourceRegen = 'Data Dragon (clé absente du fichier)'; }
  const regenPVparNiv = lire(rec.hpRegenPerLevelModifiable);

  const r = rec.primaryAbilityResource || {};
  const aDuMana = (r.arType || 0) === 0;
  return {
    regenPV, regenPVparNiv, sourceRegen,
    regenMana: aDuMana ? lire(r['{c4ab3550}']) : null,
    regenManaParNiv: aDuMana ? lire(r['{3a509002}']) : null
  };
}

/* Physique, magique ou brut ? Le fichier de jeu ne porte pas cette information dans les
   formules — elle vit dans les blocs d'application d'effet, absents des fichiers publics.
   Sans elle, impossible d'appliquer l'armure ou la résistance magique : le calculateur
   serait faux, pas incomplet.

   On la lit donc dans l'infobulle FRANÇAISE de Data Dragon, qui la nomme explicitement
   (« dégâts magiques »). C'est du texte écrit par Riot, pas une déduction : déduire
   « ratio AD donc physique » serait faux sur Jinx (son E est magique malgré son ratio AD).
   Un sort qui inflige deux types est marqué « mixte » et non tranché arbitrairement. */
function typeDeDegats(ddSpell) {
  const t = ((ddSpell || {}).tooltip || '').replace(/<[^>]+>/g, ' ');
  const trouves = [...new Set((t.match(/dégâts (physiques|magiques|bruts)/gi) || [])
    .map(x => x.toLowerCase().split(' ')[1]))];
  if (!trouves.length) return null;
  if (trouves.length > 1) return 'mixte:' + trouves.join('+');
  return { physiques: 'physique', magiques: 'magique', bruts: 'brut' }[trouves[0]] || null;
}

const bilan = { ok: 0, partiel: 0, vide: 0 };
const alertesGlobales = {};
const sortie = {};

cibles.forEach(cible => {
  const f = path.join(DIR, cible.id + '.json');
  if (!fs.existsSync(f)) return;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));

  const recEntry = Object.entries(d).find(([, v]) => v && /CharacterRecord/.test(v.__type || ''));
  if (!recEntry) return;
  const rec = recEntry[1];

  // spellNames donne l'ordre Q, W, E, R
  const noms = rec.spellNames || rec.mSpellNames || [];
  const champ = {
    id: cible.id, nom: cible.nom, role: cible.role, rang: cible.rang, picks: cible.picks,
    base: statsDeBase(rec, cible.id), sorts: {}
  };

  const blocs = Object.entries(d).filter(([, v]) => v && v.__type === 'SpellObject' && v.mSpell);

  TOUCHES.forEach((touche, i) => {
    const nom = noms[i];
    if (!nom) return;
    const bloc = blocs.find(([k]) => k.endsWith('/' + nom));
    if (!bloc) return;
    const spell = bloc[1].mSpell;

    /* Une compétence est souvent éclatée en plusieurs blocs : le sort lancé, puis un
       missile ou une zone qui porte les vrais dégâts. Les DataValues d'un bloc sont
       référencées depuis un autre (l'ultime d'Ahri lit rAPCoefficient chez son missile).
       On fusionne donc tous les blocs de la même compétence avant de résoudre. */
    const prefixe = bloc[0].slice(0, bloc[0].lastIndexOf('/') + 1);
    const freres = blocs.filter(([k]) => k.startsWith(prefixe)).map(([, v]) => v.mSpell);
    const ctx = creerContexte(spell);
    freres.forEach(f => {
      if (f === spell) return;
      (f.DataValues || []).forEach(v => {
        const cle = v && v.name && String(v.name).toLowerCase();
        if (cle && ctx.dv[cle] === undefined) ctx.dv[cle] = v.values || [];
      });
      Object.entries(f.mSpellCalculations || {}).forEach(([n, c]) => {
        if (ctx.calc[n] === undefined) ctx.calc[n] = c;
      });
    });
    const alertes = new Set();
    const ddSpell = ((DD[cible.id] || {}).spells || [])[i];
    const nbRangs = (ddSpell && ddSpell.maxrank) || (touche === 'R' ? 3 : 5);

    const calculs = {};
    Object.keys(ctx.calc).forEach(nomCalc => {
      const r = resoudreCalcul(nomCalc, ctx, alertes, nbRangs);
      if (!r) return;
      const resolus = Object.keys(r).filter(x => r[x]);
      if (!resolus.length) return;
      /* `mDisplayAsPercent` marque un calcul qui produit un RATIO, pas des points :
         « 3,5 % des PV max », « 20 % de réduction ». Le nom contient souvent « damage »
         (KogMaw `TotalHealthDamage`, Vi `TotalDamageTooltip`, Kayn `DarkinPercentDamage`) —
         l'heuristique les rangeait donc en dégâts et servait 0,035 POINT de dégâts là où
         le jeu en inflige des centaines. C'est l'erreur de la Lame du roi déchu, à
         nouveau, mais côté sorts.
         Un ratio n'est jamais un montant : il reste disponible comme FACTEUR (une
         correction déclarée le multiplie par les PV de la cible, cf. Illaoi W), mais il
         n'entre pas seul dans un total de dégâts. */
      const ratio = !!(ctx.calc[nomCalc] || {}).mDisplayAsPercent;
      calculs[nomCalc] = {
        genre: ratio ? 'ratio'
             : estDegats(nomCalc) ? 'degats'
             : estBouclier(nomCalc) ? 'bouclier'
             : estSoin(nomCalc) ? 'soin' : 'autre',
        parRang: r
      };
    });

    /* Corrections déclarées (cf. sorts_modeles.js) : genre mal deviné, type absent de
       l'infobulle, ou nombres vivant dans les DataValues sans calcul associé. Elles ne
       remplacent jamais une valeur du fichier — elles complètent ce que l'extraction
       automatique ne peut pas deviner, et chacune porte sa source. */
    const corr = ((SORTS[cible.id] || {})[touche]) || {};
    Object.entries(corr.genres || {}).forEach(([n, g]) => { if (calculs[n]) calculs[n].genre = g; });
    Object.entries(corr.ajouter || {}).forEach(([n, def]) => {
      const parRang = {};
      let complet = true;
      for (let r = 1; r <= nbRangs; r++) {
        const termes = def.termes.map(t => {
          /* Terme adossé à un CALCUL déjà résolu. Plusieurs sorts multiplient les PV de
             la cible par un facteur qui n'est PAS constant : le E d'Illaoi vaut
             « 3 % + 3,5 % par 100 AD bonus des PV max », le E d'Evelynn « 3 % + 1,5 %
             par 100 AP ». Ce facteur existe déjà dans le fichier, sous forme de calcul
             (`HealthPercentTotal`, `PercentHealthBaseTOOLTIP`) — mais nommé sans le mot
             « damage », donc rangé en « autre » et jamais appliqué. On le réutilise TEL
             QUEL comme facteur du produit, plutôt que de recopier ses nombres ici :
             recopier, c'est se condamner à diverger au premier équilibrage. */
          if (t.calc) {
            const src = calculs[t.calc];
            const sous = src && src.parRang && src.parRang[r];
            if (!sous || !sous.length) { complet = false; return null; }
            return { stat: t.stat, mode: t.mode, valeur: t.echelle != null ? t.echelle : 1,
                     facteurTermes: sous };
          }
          const arr = t.dv ? ctx.dv[t.dv.toLowerCase()] : null;
          if (t.dv && (!arr || !arr.length)) { complet = false; return null; }
          const v = arr ? (arr[r] != null ? arr[r] : arr[arr.length - 1]) : t.valeur;
          return { stat: t.stat, mode: t.mode, valeur: v * (t.echelle != null ? t.echelle : 1) };
        });
        parRang[r] = complet ? termes : null;
      }
      if (complet) calculs[n] = { genre: def.genre, parRang, source: corr.source || null };
      else alertes.add('DataValue absente pour la correction ' + n);
    });

    champ.sorts[touche] = {
      nomInterne: nom,
      nbRangs,
      typeDegats: corr.type || typeDeDegats(ddSpell),
      sourceType: corr.type ? corr.source : (typeDeDegats(ddSpell) ? 'infobulle Data Dragon' : null),
      nonExploitable: corr.nonExploitable || null,
      /* `sansDegats` : le sort N'INFLIGE RIEN, et son infobulle parle quand même de
         dégâts. Quatre cas, tous légitimes — l'ultime de Fiora renvoie aux dégâts de
         son PASSIF, le E de Morgana annonce ce que son bouclier BLOQUE, le W de Nilah
         RÉDUIT les dégâts subis, le W de Sona ceux que la cible inflige. Sans cette
         déclaration, la détection par mots-clés les compte comme des lacunes, et un
         chiffre d'incomplétude qu'on ne peut pas faire baisser finit par être ignoré. */
      sansDegats: corr.sansDegats || null,
      /* PLAFONDS déclarés : « ce calcul ne peut pas dépasser cet autre calcul ». Le
         fichier de jeu range souvent la borne dans un calcul JUMEAU plutôt que dans une
         clause — le W d'Olaf porte `ShieldCalc` et `MaxShieldCalc` côte à côte, le
         second étant le premier avec la fraction de PV manquants remplacée par sa
         valeur maximale. Rien dans la structure ne dit qu'ils sont liés : il faut le
         déclarer. Sans ce lien, le bouclier d'Olaf continuait de croître sous 30 % de
         PV alors que le jeu l'a déjà plafonné — un sur-chiffrage, exactement ce qu'on
         reproche aux calculateurs approximatifs. */
      plafonds: corr.plafonds || null,
      noteCorrection: corr.note || null,
      cooldown: spell.cooldownTime || spell.Cooldown || null,
      /* Compétences à charges. Sans ces deux champs, le E de Rumble passe pour une
         compétence à 0,5 s de recharge — ces 0,5 s sont en réalité le délai entre deux
         tirs, et la vraie cadence est une charge toutes les 6 s. Sur une fenêtre de
         10 s, l'ignorer donnait 21 lancers au lieu de 3.
         ⚠ Data Dragon connaît `maxammo` mais PAS le temps de recharge : seul le
         fichier de jeu porte `mAmmoRechargeTime`. */
      maxCharges: Array.isArray(spell.mMaxAmmo) ? spell.mMaxAmmo[nbRangs] : null,
      rechargeCharge: Array.isArray(spell.mAmmoRechargeTime) ? spell.mAmmoRechargeTime[nbRangs] : null,
      cout: spell.mana || spell.manaValues || null,
      portee: spell.castRangeValues || spell.castRange || null,
      calculs,
      alertes: [...alertes]
    };
    [...alertes].forEach(a => { alertesGlobales[a] = (alertesGlobales[a] || 0) + 1; });
  });

  // Un champion est « ok » si tous ses sorts ont au moins un calcul de dégâts ou de soin
  const utiles = Object.values(champ.sorts).filter(s =>
    Object.values(s.calculs).some(c => c.genre !== 'autre' && c.genre !== 'ratio'));
  if (utiles.length >= 4) bilan.ok++;
  else if (utiles.length > 0) bilan.partiel++;
  else bilan.vide++;
  champ.sortsUtiles = utiles.length;

  sortie[cible.id] = champ;
});

fs.writeFileSync('./champions.json', JSON.stringify(sortie));
console.log('Champions traités : ' + Object.keys(sortie).length);
console.log('  4 sorts chiffrés  : ' + bilan.ok);
console.log('  partiels          : ' + bilan.partiel);
console.log('  aucun sort chiffré: ' + bilan.vide);
console.log('\nAlertes les plus fréquentes :');
Object.entries(alertesGlobales).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([a, n]) => console.log('  ' + String(n).padStart(5) + '  ' + a));
