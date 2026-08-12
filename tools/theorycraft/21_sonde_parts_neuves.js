/* Trois types de parts n'existaient pas chez les sorts. Avant de les coder, il faut
   voir leur forme exacte — deviner un champ, c'est inventer un chiffre. */
const d = require('./items.bin.json');
const objets = Object.keys(d).filter(k => d[k] && d[k].__type === 'ItemData');

const CIBLES = ['ByItemEpicnessCountCalculationPart',
                'BuffCounterByCoefficientCalculationPart',
                'BuffCounterByNamedDataValueCalculationPart',
                'GameCalculationConditional'];
const vus = {};
function balayer(n, objet) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) return n.forEach(x => balayer(x, objet));
  if (n.__type && CIBLES.includes(n.__type) && (vus[n.__type] || []).length < 2) {
    (vus[n.__type] = vus[n.__type] || []).push({ objet, n });
  }
  Object.values(n).forEach(x => balayer(x, objet));
}
objets.forEach(k => { if (d[k].mItemCalculations) balayer(d[k].mItemCalculations, d[k].mDeathRecapName || k); });

CIBLES.forEach(t => {
  console.log('\n════ ' + t);
  (vus[t] || []).forEach(({ objet, n }) => {
    console.log('  — ' + objet);
    console.log(JSON.stringify(n, null, 1).split('\n').map(l => '    ' + l).join('\n').slice(0, 1100));
  });
});
