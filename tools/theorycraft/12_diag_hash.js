/* Certaines clés du fichier de Riot ne sont pas résolues par CommunityDragon et
   restent sous forme de hash ({0bb7b933}). Impossible de savoir ce qu'elles mesurent :
   une rune dont les clés utiles sont hachées ne peut pas entrer dans un calcul. */
const runes = require('./runes.json');
const act = runes.filter(r => r.active);
const hash = k => /^\{[0-9a-f]{8}\}$/.test(k);

let touchees = 0, totalCles = 0, clesHachees = 0;
const detail = [];
act.forEach(r => {
  const ks = Object.keys(r.valeurs);
  const h = ks.filter(hash);
  totalCles += ks.length; clesHachees += h.length;
  if (h.length) {
    touchees++;
    detail.push({ nom: r.nom, genre: r.genre, h: h.length, t: ks.length,
                  part: h.length / ks.length });
  }
});

console.log('Runes jouables            : ' + act.length);
console.log('  dont au moins une clé hachée : ' + touchees);
console.log('Clés au total             : ' + totalCles + ', hachées : ' + clesHachees +
            '  (' + (clesHachees / totalCles * 100).toFixed(1) + '%)');

console.log('\nLes plus touchées (part de clés illisibles) :');
detail.sort((a, b) => b.part - a.part).slice(0, 12).forEach(d =>
  console.log('  ' + d.nom.padEnd(28) + d.genre.padEnd(10) +
    d.h + '/' + d.t + '  ' + (d.part * 100).toFixed(0) + '%'));

const bloquees = detail.filter(d => d.part >= 0.5);
console.log('\nInutilisables en l\'état (>50% de clés illisibles) : ' +
  (bloquees.length ? bloquees.map(d => d.nom).join(', ') : 'aucune'));
