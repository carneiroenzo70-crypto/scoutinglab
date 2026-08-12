// Télécharge les fichiers de données de jeu (.bin.json) des champions ciblés.
const fs = require('fs');
const path = require('path');
const cibles = require('./cibles.json');
const DIR = path.join(__dirname, 'bin');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

const url = id =>
  'https://raw.communitydragon.org/latest/game/data/characters/' +
  id.toLowerCase() + '/' + id.toLowerCase() + '.bin.json';

async function un(c, essai = 1) {
  const dest = path.join(DIR, c.id + '.json');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) return 'cache';
  try {
    const r = await fetch(url(c.id), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('http ' + r.status);
    const t = await r.text();
    if (t.length < 2000) throw new Error('trop court (' + t.length + ')');
    fs.writeFileSync(dest, t);
    return 'ok';
  } catch (e) {
    if (essai < 3) { await new Promise(r => setTimeout(r, 800 * essai)); return un(c, essai + 1); }
    return 'ECHEC ' + e.message;
  }
}

(async () => {
  const res = {};
  const N = 6;                              // concurrence modérée, on reste poli
  for (let i = 0; i < cibles.length; i += N) {
    const lot = cibles.slice(i, i + N);
    const r = await Promise.all(lot.map(un));
    lot.forEach((c, j) => { res[c.id] = r[j]; });
    process.stdout.write('.');
  }
  console.log('');
  const ech = Object.entries(res).filter(([, v]) => v.startsWith('ECHEC'));
  console.log('Téléchargés : ' + Object.values(res).filter(v => v === 'ok').length +
              ' | déjà en cache : ' + Object.values(res).filter(v => v === 'cache').length +
              ' | échecs : ' + ech.length);
  ech.forEach(([k, v]) => console.log('  ' + k + ' → ' + v));
})();
