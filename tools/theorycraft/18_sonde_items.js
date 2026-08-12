/* Reconnaissance du fichier de script des objets. Même démarche que 08_sonde_runes :
   savoir ce que le fichier contient AVANT d'écrire le moindre extracteur. */
const d = require('./items.bin.json');
const cles = Object.keys(d);
console.log('Entrées : ' + cles.length);

const types = {};
Object.values(d).forEach(v => { if (v && v.__type) types[v.__type] = (types[v.__type] || 0) + 1; });
console.log('\nTypes :');
Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .forEach(([t, n]) => console.log('  ' + String(n).padStart(6) + '  ' + t));

const objets = cles.filter(k => d[k] && d[k].__type === 'ItemData');
console.log('\nObjets (ItemData) : ' + objets.length);

// Quels champs portent les ItemData ? (fréquence)
const champs = {};
objets.forEach(k => Object.keys(d[k]).forEach(c => { champs[c] = (champs[c] || 0) + 1; }));
console.log('\nChamps des ItemData :');
Object.entries(champs).sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => console.log('  ' + String(n).padStart(4) + '  ' + c));

// Où vivent les statistiques brutes ? On cherche sur un objet 100% stats.
const brut = cles.find(k => /Items\/3031$/.test(k)); // Danse infinie
console.log('\n=== ' + brut + ' (objet de pures stats) ===');
console.log(JSON.stringify(d[brut], null, 1).slice(0, 2500));

const mod = cles.find(k => d[k] && d[k].__type === 'ItemModifier');
console.log('\n=== ItemModifier ' + mod + ' ===');
console.log(JSON.stringify(d[mod], null, 1).slice(0, 1200));
