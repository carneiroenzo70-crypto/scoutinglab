const d = require('./perks.bin.json');
const cles = Object.keys(d);
console.log('Entrées : ' + cles.length);

const types = {};
Object.values(d).forEach(v => { if (v && v.__type) types[v.__type] = (types[v.__type] || 0) + 1; });
console.log('\nTypes :');
Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([t, n]) => console.log('  ' + String(n).padStart(5) + '  ' + t));

// Une rune connue, pour voir la forme
const cible = cles.find(k => /Electrocute/i.test(k));
console.log('\n=== ' + cible + ' ===');
const e = d[cible];
console.log('champs : ' + Object.keys(e).join(', '));
console.log(JSON.stringify(e, null, 1).slice(0, 1500));
