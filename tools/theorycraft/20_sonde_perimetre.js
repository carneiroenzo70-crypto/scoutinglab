/* Périmètre : le fichier porte TOUS les objets du jeu, Arena et TFT compris.
   Proposer un objet d'Arena dans un build de Faille serait une faute grossière —
   on cherche donc le critère qui sépare proprement les deux. */
const bin = require('./items.bin.json');
const fr = require('./items_fr.json');

console.log('items_fr : ' + fr.length + ' entrées');
console.log('champs d\'une entrée : ' + Object.keys(fr[0]).join(', '));

const ie = fr.find(x => x.id === 3031);
console.log('\n=== Danse infinie (client) ===');
console.log(JSON.stringify(ie, null, 1).slice(0, 1400));

// Répartition par carte, si le champ existe
const parMap = {};
fr.forEach(x => {
  const m = x.maps ? Object.entries(x.maps).filter(([, v]) => v).map(([k]) => k).join(',') : 'aucune';
  parMap[m] = (parMap[m] || 0) + 1;
});
console.log('\nRépartition par cartes :');
Object.entries(parMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
  .forEach(([m, n]) => console.log('  ' + String(n).padStart(4) + '  cartes ' + m));

// Combien d'objets achetables sur la Faille (carte 11) ?
const sr = fr.filter(x => x.maps && x.maps['11'] && x.inStore !== false);
console.log('\nAchetables sur la Faille (carte 11) : ' + sr.length);
const parRang = {};
sr.forEach(x => { parRang[x.priceTotal >= 2500 ? 'légendaire+' : x.priceTotal >= 1000 ? 'intermédiaire' : 'basique'] =
  (parRang[x.priceTotal >= 2500 ? 'légendaire+' : x.priceTotal >= 1000 ? 'intermédiaire' : 'basique'] || 0) + 1; });
console.log(JSON.stringify(parRang));

// Les stats que Data Dragon omet : accélération de compétence, létalité
const objets = Object.keys(bin).filter(k => bin[k] && bin[k].__type === 'ItemData');
const idsSR = new Set(sr.map(x => x.id));
const avecHaste = objets.filter(k => bin[k].mAbilityHasteMod && idsSR.has(bin[k].itemID));
const avecLeth = objets.filter(k => bin[k].PhysicalLethality && idsSR.has(bin[k].itemID));
console.log('\nSur la Faille — objets avec accélération : ' + avecHaste.length +
            ' | avec létalité : ' + avecLeth.length);
console.log('exemples accélération : ' + avecHaste.slice(0, 6)
  .map(k => bin[k].mDeathRecapName + ' ' + bin[k].mAbilityHasteMod).join(', '));
console.log('exemples létalité    : ' + avecLeth.slice(0, 6)
  .map(k => bin[k].mDeathRecapName + ' ' + bin[k].PhysicalLethality).join(', '));
