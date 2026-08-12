/* Les objets portent-ils le MÊME arbre de formule typé que les sorts ?
   Si oui, 03_resolveur.js s'applique tel quel et les passifs cessent d'être de la prose.
   On recense d'abord tous les types de parts présents, pour savoir ce qui manque. */
const d = require('./items.bin.json');
const objets = Object.keys(d).filter(k => d[k] && d[k].__type === 'ItemData');

const typesCalc = {}, typesPart = {};
function balayer(n) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) return n.forEach(balayer);
  if (n.__type) {
    if (/Calculation$/.test(n.__type)) typesCalc[n.__type] = (typesCalc[n.__type] || 0) + 1;
    if (/CalculationPart$/.test(n.__type)) typesPart[n.__type] = (typesPart[n.__type] || 0) + 1;
  }
  Object.values(n).forEach(balayer);
}
let avecCalc = 0;
objets.forEach(k => { if (d[k].mItemCalculations) { avecCalc++; balayer(d[k].mItemCalculations); } });

console.log('Objets avec mItemCalculations : ' + avecCalc + ' / ' + objets.length);
console.log('\nTypes de calcul :');
Object.entries(typesCalc).sort((a, b) => b[1] - a[1])
  .forEach(([t, n]) => console.log('  ' + String(n).padStart(5) + '  ' + t));
console.log('\nTypes de parts (ce que le résolveur doit savoir lire) :');
Object.entries(typesPart).sort((a, b) => b[1] - a[1])
  .forEach(([t, n]) => console.log('  ' + String(n).padStart(5) + '  ' + t));

// Forme concrète : Lame du roi déchu (dégâts en % des PV max — le passif type)
console.log('\n=== Items/3153 mItemCalculations ===');
console.log(JSON.stringify(d['Items/3153'].mItemCalculations, null, 1).slice(0, 2500));
