/* Où en est-on vraiment ? Un objet peut porter des stats propres et un passif qu'on
   ne sait pas chiffrer — c'est ce trou-là qu'il faut voir, pas le taux global.
   On se concentre sur les objets FINIS, les seuls qu'un build propose. */
const items = require('./items.json');
const fr = require('./items_fr.json');

const desc = {};
fr.forEach(x => { desc[x.id] = (x.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); });

const finis = items.filter(o => o.fini && o.prix >= 1800);
console.log('Objets finis (≥ 1800 po) : ' + finis.length);

/* Un objet « à passif » se repère au vocabulaire du jeu : la boutique nomme ses
   effets (Passif, Actif, ou un nom propre suivi d'une phrase). Heuristique assumée,
   elle sert à trouver les trous, pas à produire une donnée. */
const aPassif = o => /(passif|actif|unique)/i.test(desc[o.id] || '') ||
                     (desc[o.id] || '').length > 220;

const chiffres = finis.filter(o => Object.keys(o.calculs).length);
const brutSeul = finis.filter(o => !Object.keys(o.calculs).length && Object.keys(o.valeurs).length);
const rien = finis.filter(o => !Object.keys(o.calculs).length && !Object.keys(o.valeurs).length);

console.log('  passif résolu en formule   : ' + chiffres.length);
console.log('  valeurs nommées seulement  : ' + brutSeul.length);
console.log('  aucune donnée de passif    : ' + rien.length);

const trous = rien.filter(aPassif);
if (trous.length) {
  console.log('\n⚠ Objets finis annoncés avec un effet, mais sans aucune valeur lisible :');
  trous.forEach(o => console.log('   ' + String(o.id).padEnd(7) + o.nom.padEnd(32) +
    (desc[o.id] || '').slice(0, 90)));
} else {
  console.log('\nAucun objet fini n\'annonce un effet sans porter de valeur.');
}

const avecAlerte = items.filter(o => o.alertes.length);
if (avecAlerte.length) {
  console.log('\nAlertes du résolveur (' + avecAlerte.length + ' objets) :');
  avecAlerte.forEach(o => console.log('   ' + o.nom.padEnd(32) + o.alertes.join(' | ')));
}

// Ce que le calculateur pourra réellement additionner
const cles = {};
items.forEach(o => Object.entries(o.stats).forEach(([k, s]) => {
  cles[k] = cles[k] || { n: 0, libelle: s.libelle };
  cles[k].n++;
}));
console.log('\nStats disponibles pour le calcul :');
Object.entries(cles).sort((a, b) => b[1].n - a[1].n)
  .forEach(([k, v]) => console.log('   ' + String(v.n).padStart(4) + '  ' + k.padEnd(18) + v.libelle));
