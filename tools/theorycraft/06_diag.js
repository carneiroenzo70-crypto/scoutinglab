/* Pourquoi un sort n'a-t-il pas de calcul de dégâts ? Trois cas possibles :
   (a) il est vraiment utilitaire (dash, silence) — normal ;
   (b) il a des calculs, mais nommés autrement que « Damage » — lacune de détection ;
   (c) il n'a aucun calcul résolu — vraie lacune du résolveur. */
const champs = require('./champions.json');
const cas = { utilitaire: [], nommage: [], lacune: [] };

Object.values(champs).forEach(c => {
  ['Q', 'W', 'E', 'R'].forEach(t => {
    const s = c.sorts[t];
    if (!s) return;
    const noms = Object.keys(s.calculs);
    const aUtile = Object.values(s.calculs).some(x => x.genre !== 'autre');
    if (aUtile) return;
    const ref = c.nom + ' ' + t;
    if (!noms.length) cas.lacune.push(ref + (s.alertes.length ? '  [' + s.alertes[0] + ']' : ''));
    else cas.nommage.push(ref + '  → ' + noms.slice(0, 4).join(', '));
  });
});

console.log('Sorts sans calcul de dégâts détecté :');
console.log('  aucun calcul résolu (lacune) : ' + cas.lacune.length);
cas.lacune.slice(0, 15).forEach(x => console.log('      ' + x));
console.log('\n  calculs présents mais nommés autrement : ' + cas.nommage.length);
cas.nommage.slice(0, 25).forEach(x => console.log('      ' + x));
