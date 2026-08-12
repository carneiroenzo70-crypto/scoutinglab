const runes = require('./runes.json');
const styles = require('./perkstyles_fr.json');

const dansArbre = new Set();
(styles.styles || []).forEach(st => (st.slots || []).forEach(s =>
  (s.perks || []).forEach(id => { if (id) dansArbre.add(id); })));

console.log('Runes présentes dans un arbre actuel : ' + dansArbre.size);
console.log('Runes du fichier de script          : ' + runes.length);

const orphelines = runes.filter(r => !dansArbre.has(r.id));
console.log('\nOrphelines (dans le script, absentes des arbres) : ' + orphelines.length);
orphelines.forEach(r => console.log('   ' + String(r.id).padStart(5) + '  ' +
  (r.nom || r.nomInterne).padEnd(28) + Object.keys(r.valeurs).length + ' valeurs'));

console.log('\nTypes de slots par arbre :');
(styles.styles || []).forEach(st => {
  const t = (st.slots || []).map(s => s.type + '(' + (s.perks || []).filter(Boolean).length + ')');
  console.log('   ' + String(st.name).padEnd(14) + t.join(' '));
});
