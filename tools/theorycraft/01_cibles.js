// Fait correspondre les noms gol.gg aux identifiants Data Dragon, puis aux chemins .bin.
const fs = require('fs');
const pro = require('./proplay.json');
const dd = require('./champFull.json').data;

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const parNorm = {};
Object.values(dd).forEach(c => { parNorm[norm(c.id)] = c; parNorm[norm(c.name)] = c; });

const roles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const cibles = [];      // ordre de curation : rôle par rôle, du Top au Support
const introuvables = [];
const vus = new Set();

roles.forEach(role => {
  pro[role].slice(0, 20).forEach((c, rang) => {
    const m = parNorm[norm(c.nom)];
    if (!m) { introuvables.push(role + ' #' + (rang + 1) + ' ' + c.nom); return; }
    if (vus.has(m.id)) return;          // déjà pris sur un autre poste
    vus.add(m.id);
    cibles.push({ id: m.id, nom: m.name, role, rang: rang + 1, picks: c.picks });
  });
});

fs.writeFileSync('./cibles.json', JSON.stringify(cibles, null, 1));
console.log('Champions à traiter : ' + cibles.length + ' (top 20 x 5 rôles, doublons retirés)');
roles.forEach(r => console.log('  ' + r.padEnd(8) + cibles.filter(c => c.role === r).length));
if (introuvables.length) {
  console.log('\nNon reconnus dans Data Dragon ' + require('./champFull.json').version + ' :');
  introuvables.forEach(x => console.log('  ' + x));
}
