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

const TOUCHES = ['Q', 'W', 'E', 'R'];
const estDegats = n => /damage|dmg/i.test(n);
const estSoin   = n => /heal|shield|absorb/i.test(n);

function statsDeBase(rec) {
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
    /* Multiplicateur de coup critique. Il vaut 2 pour presque tout le monde, mais
       certains champions l'ont réduit en compensation d'un kit : le lire évite de
       coder en dur une valeur fausse sur ces cas-là. */
    critMult:  g('critDamageMultiplier')
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
    base: statsDeBase(rec), sorts: {}
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
      calculs[nomCalc] = {
        genre: estDegats(nomCalc) ? 'degats' : estSoin(nomCalc) ? 'soin' : 'autre',
        parRang: r
      };
    });

    champ.sorts[touche] = {
      nomInterne: nom,
      nbRangs,
      typeDegats: typeDeDegats(ddSpell),
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
    Object.values(s.calculs).some(c => c.genre !== 'autre'));
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
