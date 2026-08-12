/* Sort les runes avec leurs clés ET leur description, pour encoder le déclenchement
   à partir du texte officiel plutôt que de mémoire. */
const runes = require('./runes.json');
const genre = process.argv[2] || 'majeure';
const act = runes.filter(r => r.active && r.genre === genre);

act.forEach(r => {
  console.log('\n■ ' + r.nom + '   [' + r.arbre + ' · slot ' + r.slot + ' · id ' + r.id + ']');
  const ks = Object.keys(r.valeurs).sort();
  console.log('  clés : ' + ks.map(k => k + '=' + r.valeurs[k]).join('  '));
  console.log('  desc : ' + (r.desc || '(vide)').slice(0, 420));
});
console.log('\n\n(' + act.length + ' runes de genre « ' + genre + ' »)');
