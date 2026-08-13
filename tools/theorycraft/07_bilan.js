const champs = require('./champions.json');
const roles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
let sorts = 0, avecCalc = 0, avecDegats = 0, alertes = 0;

Object.values(champs).forEach(c => {
  ['Q', 'W', 'E', 'R'].forEach(t => {
    const s = c.sorts[t]; if (!s) return;
    sorts++;
    if (Object.keys(s.calculs).length) avecCalc++;
    if (Object.values(s.calculs).some(x => x.genre === 'degats' || x.genre === 'soin' || x.genre === 'bouclier')) avecDegats++;
    if (s.alertes.length) alertes++;
  });
});

console.log('=== Socle de données du calculateur ===\n');
console.log('Champions          : ' + Object.keys(champs).length);
console.log('Sorts analysés     : ' + sorts);
console.log('  avec formule     : ' + avecCalc + '  (' + (avecCalc / sorts * 100).toFixed(0) + '%)');
console.log('  dont dégâts/soin : ' + avecDegats + '  (' + (avecDegats / sorts * 100).toFixed(0) + '%)');
console.log('  avec une alerte  : ' + alertes + '  (' + (alertes / sorts * 100).toFixed(0) + '%)');

console.log('\nPar rôle (champions dont les 4 sorts sont chiffrés) :');
roles.forEach(r => {
  const l = Object.values(champs).filter(c => c.role === r);
  const ok = l.filter(c => c.sortsUtiles >= 4).length;
  const p3 = l.filter(c => c.sortsUtiles >= 3).length;
  console.log('  ' + r.padEnd(8) + l.length + ' champions  |  4 sorts : ' + ok +
              '  |  au moins 3 : ' + p3);
});

const sansAD = Object.values(champs).filter(c => !c.base.adParNiv).map(c => c.nom);
console.log('\nStats de base complètes : ' +
  (Object.keys(champs).length - sansAD.length) + '/' + Object.keys(champs).length +
  (sansAD.length ? '  (manquants : ' + sansAD.join(', ') + ')' : ''));
