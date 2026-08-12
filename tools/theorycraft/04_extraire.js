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
    portee:    g('attackRangeModifiable'),
    ms:        g('baseMoveSpeedModifiable')
  };
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
      cooldown: spell.cooldownTime || spell.Cooldown || null,
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
