/* Re-dérive la correspondance mStat → caractéristique, empiriquement.

   Motif : la table écrite à la main donnait « 12 = Mana », alors que l'Hydre titanesque
   utilise mStat 12 avec une clé nommée `PrimaryTargetHPRatio` — c'est-à-dire des PV.
   Une table de correspondance devinée est le pire genre d'erreur : elle ne casse rien,
   elle donne juste des chiffres faux.

   Méthode : les noms de DataValues sont auto-documentés (`APRatio`, `BonusHealthRatio`,
   `HPRatio`…). On regroupe donc les noms observés par valeur de mStat, et on lit. */
const bin = require('./items.bin.json');
const fs = require('fs');
const path = require('path');

const parStat = {};
function noter(stat, nom, ou) {
  const s = (parStat[stat] = parStat[stat] || { noms: {}, n: 0 });
  s.n++;
  if (nom) s.noms[nom] = (s.noms[nom] || 0) + 1;
  s.exemple = s.exemple || ou;
}
function balayer(n, ou) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) return n.forEach(x => balayer(x, ou));
  if (/^StatBy.*CalculationPart$/.test(n.__type || '')) {
    noter(n.mStat || 0, n.mDataValue || null, ou);
  }
  Object.values(n).forEach(x => balayer(x, ou));
}

Object.values(bin).forEach(e => {
  if (e && e.__type === 'ItemData' && e.mItemCalculations)
    balayer(e.mItemCalculations, e.mDeathRecapName || e.itemID);
});
// Les sorts aussi : plus d'exemples, donc une lecture plus sûre
const dir = path.join(__dirname, 'bin');
if (fs.existsSync(dir)) {
  fs.readdirSync(dir).forEach(f => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    Object.values(d).forEach(v => {
      if (v && v.__type === 'SpellObject' && v.mSpell)
        balayer(v.mSpell.mSpellCalculations, f.replace('.json', ''));
    });
  });
}

Object.keys(parStat).map(Number).sort((a, b) => a - b).forEach(s => {
  const e = parStat[s];
  const noms = Object.entries(e.noms).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([n, c]) => n + '(' + c + ')');
  console.log('mStat ' + String(s).padStart(2) + '  ' + String(e.n).padStart(5) + ' usages   ' +
    (noms.join(', ') || '— aucun nom, coefficient direct — ex. ' + e.exemple));
});
