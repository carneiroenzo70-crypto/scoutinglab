/* Extrait les runes : valeurs chiffrées (fichier de script du jeu) + libellés français
   et place dans l'arbre (données de client).

   Contrairement aux sorts, rien à résoudre ici : le jeu stocke déjà des couples
   nom → nombre (« DamageBase: 70, BonusADRatio: 0.1 »). On se contente de retenir les
   valeurs de la Faille de l'invocateur — le fichier porte aussi des variantes ARAM/URF
   qui n'ont rien à faire dans un calculateur de jeu classé. */
const fs = require('fs');
const bin = require('./perks.bin.json');
const fr = require('./perks_fr.json');
const styles = require('./perkstyles_fr.json');

// Libellés et descriptions par identifiant
const parId = {};
fr.forEach(p => { parId[p.id] = p; });

/* Place dans l'arbre. Le fichier de script contient aussi 37 runes RETIRÉES du jeu
   (Kleptomancie, Prédateur, Corps céleste…) : elles gardent leurs chiffres mais ne
   sont plus jouables. Seule l'appartenance à un arbre actuel fait foi — sinon le
   calculateur proposerait des runes qui n'existent plus. */
const place = {};
(styles.styles || []).forEach(st => {
  (st.slots || []).forEach((slot, iSlot) => {
    (slot.perks || []).forEach(id => {
      if (!id) return;
      place[id] = {
        arbre: st.name, arbreId: st.id, slot: iSlot,
        genre: slot.type === 'kKeyStone' ? 'majeure'
             : slot.type === 'kStatMod'  ? 'fragment' : 'mineure'
      };
    });
  });
});

// Ce qui nous intéresse pour un calcul de dégâts : on classe les clés rencontrées.
const RATIO = /ratio|coefficient|scal/i;
const DEGATS = /damage|dmg/i;
const SOIN = /heal|shield|lifesteal|omnivamp/i;
const STAT = /^(bonus)?(ad|ap|health|hp|armor|mr|attackspeed|movespeed|as|ms|lethality|penetration)/i;

const runes = [];
Object.entries(bin).forEach(([chemin, v]) => {
  if (!v || v.__type !== 'Perk') return;
  const id = v.mPerkId;
  const meta = parId[id] || {};
  const eff = (v.mScript && v.mScript.mSpellScriptData &&
               v.mScript.mSpellScriptData.mEffectAmount) || null;

  const valeurs = {};
  if (eff) Object.entries(eff).forEach(([k, x]) => {
    if (typeof x === 'number') valeurs[k] = Math.round(x * 100000) / 100000;
  });

  const pl = place[id];
  runes.push({
    id,
    nomInterne: v.mPerkName,
    nom: meta.name || v.mPerkName,
    // Hors arbre = retirée du jeu : conservée pour trace, jamais proposée.
    active: !!pl,
    arbre: pl ? pl.arbre : null,
    slot: pl ? pl.slot : null,
    genre: pl ? pl.genre : 'retiree',
    desc: (meta.longDesc || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    valeurs,
    // Drapeaux utiles au calculateur
    aDegats: Object.keys(valeurs).some(k => DEGATS.test(k)),
    aSoin: Object.keys(valeurs).some(k => SOIN.test(k)),
    aRatio: Object.keys(valeurs).some(k => RATIO.test(k))
  });
});

runes.sort((a, b) => (a.arbre || 'zz').localeCompare(b.arbre || 'zz')
                  || (a.slot - b.slot) || (a.id - b.id));
fs.writeFileSync('./runes.json', JSON.stringify(runes, null, 1));

const act = runes.filter(r => r.active);
console.log('Runes dans le fichier de script : ' + runes.length);
console.log('  jouables (dans un arbre)      : ' + act.length);
console.log('  retirées du jeu               : ' + (runes.length - act.length));
console.log('\nParmi les jouables :');
console.log('  avec valeurs chiffrées : ' + act.filter(r => Object.keys(r.valeurs).length).length);
console.log('  portant des dégâts     : ' + act.filter(r => r.aDegats).length);
console.log('  portant soin/bouclier  : ' + act.filter(r => r.aSoin).length);
console.log('  avec un ratio AD/AP/…  : ' + act.filter(r => r.aRatio).length);

const parGenre = {};
act.forEach(r => { parGenre[r.genre] = (parGenre[r.genre] || 0) + 1; });
console.log('\nPar genre : ' + Object.entries(parGenre).map(([g, n]) => g + ' ' + n).join(', '));
const arbres = {};
act.forEach(r => { arbres[r.arbre] = (arbres[r.arbre] || 0) + 1; });
console.log('Par arbre : ' + Object.entries(arbres).map(([a, n]) => a + ' ' + n).join(', '));
