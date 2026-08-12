/* Toutes les runes jouables passent-elles le moteur ? On les évalue une par une
   au niveau 18 avec un profil de stats plausible, et on classe le résultat. */
const runes = require('./runes.json');
const { evaluerRune } = require('./14_moteur_runes');

const CTX = { niveau: 18, adBase: 100, adBonus: 150, ap: 200, pvMax: 2400, pvBonus: 1000,
              vitesseAttaqueBonus: 0.5, cumuls: 99, ames: 0, soinsEtBoucliers: 0 };

const bilan = { chiffree: [], utilitaire: [], refusee: [], absente: [] };

runes.filter(r => r.active).forEach(r => {
  const e = evaluerRune(r.id, CTX);
  if (!e.ok) {
    (e.raison === 'non modélisée' ? bilan.absente : bilan.refusee)
      .push(r.nom + '  — ' + e.raison);
    return;
  }
  if (e.valeur == null) bilan.utilitaire.push(r.nom + '  (' + e.effet + ')');
  else bilan.chiffree.push({ nom: r.nom, arbre: r.arbre, genre: r.genre,
                             effet: e.effet, v: e.valeur, u: e.unite });
});

const tot = runes.filter(r => r.active).length;
console.log('Runes jouables : ' + tot);
console.log('  évaluées avec une valeur  : ' + bilan.chiffree.length);
console.log('  modélisées sans valeur    : ' + bilan.utilitaire.length);
console.log('  refusées explicitement    : ' + bilan.refusee.length);
console.log('  SANS MODÈLE               : ' + bilan.absente.length);

if (bilan.absente.length) {
  console.log('\n⚠ Runes sans modèle (à encoder) :');
  bilan.absente.forEach(x => console.log('   ' + x));
}
if (bilan.refusee.length) {
  console.log('\nRefus assumés :');
  bilan.refusee.forEach(x => console.log('   ' + x));
}
if (bilan.utilitaire.length) {
  console.log('\nModélisées sans valeur chiffrable :');
  bilan.utilitaire.forEach(x => console.log('   ' + x));
}

console.log('\nValeurs au niveau 18 (150 AD bonus, 200 AP, 2400 PV dont 1000 bonus) :');
const parEffet = {};
bilan.chiffree.forEach(c => { (parEffet[c.effet] = parEffet[c.effet] || []).push(c); });
Object.entries(parEffet).forEach(([eff, l]) => {
  console.log('\n── ' + eff);
  l.sort((a, b) => b.v - a.v).forEach(c =>
    console.log('   ' + c.nom.padEnd(30) + String(c.v).padStart(8) + '  ' + (c.u || '')));
});
